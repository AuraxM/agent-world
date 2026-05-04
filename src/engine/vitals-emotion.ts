/**
 * 生理 + 情绪引擎：每 tick 衰减 + 越线 inner 事件 + 事件驱动情绪。
 *
 * 数值规则：
 * - hunger: +1/tick (0..16)
 * - fatigue: 非线性 — 0..8 偶数 tick +1（慢段）/ 8..13 每 tick +1（标段）/ 13..16 每 tick +2（快段）。
 *   ~23h 到顶，与 24h 昼夜节律对齐；前 8h 不催，后 3h 强催。
 * - hygiene: +1 per even tick (0..16)
 * - mood: even tick → 朝 0 走 1（自然回归）
 * - stress: 每 24 tick 末 -1 (封底 0)
 * - social_satiety: even tick → 同节点有伴 +1 (封顶 +4)，独处 -1 (封底 -4)
 *
 * 越线提醒（节流）：
 * - hunger / fatigue: ≥5 medium (每 8 tick 复述), ≥10 severe (每 5 tick 复述)
 * - hygiene: ≥8 medium (每 8 tick), ≥13 severe (每 4 tick)
 * - mood ≤ -3 / stress ≥ 3 / social_satiety ≤ -3: 每 8 tick
 */
import { randomUUID } from "node:crypto";
import { TICKS_PER_HOUR } from "@/domain/enums";
import type { Character, Emotion, WorldEvent } from "@/domain/types";

// ---- thresholds ----

const VITAL_MAX = 16;

// 顶值惩罚态：vital==16 持续 N tick 触发 mood 下降 + 失神 inner event。
// 每条 inner event 携带 intensity=3，让 LLM 实感"忽视生理是有真实代价的"。
const CAP_PENALTY_LIGHT_TICKS = 4;
const CAP_PENALTY_HEAVY_TICKS = 8;

const HUNGER_MEDIUM = 5;
const HUNGER_SEVERE = 10;
const FATIGUE_MEDIUM = 5;
const FATIGUE_SEVERE = 10;
const HYGIENE_MEDIUM = 8;
const HYGIENE_SEVERE = 13;

const REMINDER_HUNGER_FATIGUE_MEDIUM = 8;
const REMINDER_HUNGER_FATIGUE_SEVERE = 5;
const REMINDER_HYGIENE_MEDIUM = 8;
const REMINDER_HYGIENE_SEVERE = 4;
const REMINDER_MOOD = 8;
const REMINDER_STRESS = 8;
const REMINDER_SOCIAL_SATIETY_LOW = 8;

const STRESS_DECAY_INTERVAL = 24;

export const VITALS_EMOTION_CONSTANTS = {
  VITAL_MAX,
  HUNGER_MEDIUM,
  HUNGER_SEVERE,
  FATIGUE_MEDIUM,
  FATIGUE_SEVERE,
  HYGIENE_MEDIUM,
  HYGIENE_SEVERE,
  STRESS_DECAY_INTERVAL,
} as const;

// ---- helpers ----

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function makeInnerEvent(args: {
  worldId: string;
  tick: number;
  charId: string;
  description: string;
  intensity?: 1 | 2 | 3 | 4 | 5;
}): WorldEvent {
  return {
    id: `evt-${randomUUID().slice(0, 8)}`,
    worldId: args.worldId,
    tick: args.tick,
    category: "inner",
    description: args.description,
    participants: [args.charId],
    source: "inner",
    intensity: args.intensity ?? 2,
    scope: "private",
    audienceCharacterId: args.charId,
    duration: 1,
  };
}

function levelOf(
  value: number,
  medium: number,
  severe: number,
): "medium" | "severe" | null {
  if (value >= severe) return "severe";
  if (value >= medium) return "medium";
  return null;
}

interface VitalCrossingCheck {
  inner: WorldEvent[];
  worldId: string;
  tick: number;
  charId: string;
  prev: number;
  curr: number;
  medium: number;
  severe: number;
  mediumFreq: number;
  severeFreq: number;
  describe: (value: number, level: "medium" | "severe") => string;
}

function checkVitalCrossing(args: VitalCrossingCheck): void {
  const {
    inner, worldId, tick, charId, prev, curr,
    medium, severe, mediumFreq, severeFreq, describe,
  } = args;
  const prevLvl = levelOf(prev, medium, severe);
  const currLvl = levelOf(curr, medium, severe);

  if (currLvl === "severe" && prevLvl !== "severe") {
    inner.push(makeInnerEvent({
      worldId, tick, charId,
      description: describe(curr, "severe"),
      intensity: 3,
    }));
    return;
  }
  if (currLvl === "medium" && prevLvl !== "medium" && prevLvl !== "severe") {
    inner.push(makeInnerEvent({
      worldId, tick, charId,
      description: describe(curr, "medium"),
      intensity: 2,
    }));
    return;
  }
  if (currLvl === "severe" && tick > 0 && tick % severeFreq === 0) {
    inner.push(makeInnerEvent({
      worldId, tick, charId,
      description: describe(curr, "severe"),
      intensity: 3,
    }));
    return;
  }
  if (currLvl === "medium" && tick > 0 && tick % mediumFreq === 0) {
    inner.push(makeInnerEvent({
      worldId, tick, charId,
      description: describe(curr, "medium"),
      intensity: 2,
    }));
  }
}

// 0..8 慢段（偶数 tick +1，等价 +0.5/h）；8..13 标段（+1/h）；13..16 快段（+2/h）。
// 总耗时 ~21h 到顶，留出夜间补觉空间。
function fatigueIncrement(currentFatigue: number, isEvenHour: boolean): number {
  if (currentFatigue < 8) return isEvenHour ? 1 : 0;
  if (currentFatigue < 13) return 1;
  return 2;
}

function isHourTick(tick: number): boolean {
  return tick % TICKS_PER_HOUR === 0;
}

function isEvenHour(tick: number): boolean {
  return Math.floor(tick / TICKS_PER_HOUR) % 2 === 0;
}

// ---- vitals decay ----

export interface VitalsDecayInput {
  characters: Character[];
  worldId: string;
  tick: number;
}

export function decayVitals(input: VitalsDecayInput): WorldEvent[] {
  const { characters, worldId, tick } = input;
  const inner: WorldEvent[] = [];
  const hourTick = isHourTick(tick);
  const evenHour = isEvenHour(tick);

  for (const c of characters) {
    // 睡眠 / 小睡期间 vitals 冻结：既不衰减也不触发饥饿/疲劳/卫生提醒，
    // 醒来当 tick（fromTick === endsAt）恢复正常衰减。
    if (
      (c.currentAction?.type === "sleep" || c.currentAction?.type === "nap") &&
      tick < c.currentAction.endsAt
    ) {
      continue;
    }

    // 远途 move 期间走半速：路上没那么累那么饿，否则一趟山顶来回就强制要补觉。
    const onTravel =
      c.currentAction?.type === "move" && tick < c.currentAction.endsAt;

    const prevHunger = c.vitals.hunger;
    const prevFatigue = c.vitals.fatigue;
    const prevHygiene = c.vitals.hygiene;

    // Vitals only decay at hour boundaries
    if (hourTick) {
      if (!onTravel || evenHour) {
        c.vitals.hunger = Math.min(VITAL_MAX, c.vitals.hunger + 1);
        const baseIncrement = fatigueIncrement(c.vitals.fatigue, evenHour);
        const sicknessMultiplier = c.sickness ? 2 : 1;
        c.vitals.fatigue = Math.min(
          VITAL_MAX,
          c.vitals.fatigue + baseIncrement * sicknessMultiplier,
        );
      }
      if (evenHour && !onTravel) {
        c.vitals.hygiene = Math.min(VITAL_MAX, c.vitals.hygiene + 1);
      }
    }

    checkVitalCrossing({
      inner, worldId, tick, charId: c.id,
      prev: prevHunger, curr: c.vitals.hunger,
      medium: HUNGER_MEDIUM, severe: HUNGER_SEVERE,
      mediumFreq: REMINDER_HUNGER_FATIGUE_MEDIUM,
      severeFreq: REMINDER_HUNGER_FATIGUE_SEVERE,
      describe: hungerDescription,
    });

    checkVitalCrossing({
      inner, worldId, tick, charId: c.id,
      prev: prevFatigue, curr: c.vitals.fatigue,
      medium: FATIGUE_MEDIUM, severe: FATIGUE_SEVERE,
      mediumFreq: REMINDER_HUNGER_FATIGUE_MEDIUM,
      severeFreq: REMINDER_HUNGER_FATIGUE_SEVERE,
      describe: fatigueDescription,
    });

    checkVitalCrossing({
      inner, worldId, tick, charId: c.id,
      prev: prevHygiene, curr: c.vitals.hygiene,
      medium: HYGIENE_MEDIUM, severe: HYGIENE_SEVERE,
      mediumFreq: REMINDER_HYGIENE_MEDIUM,
      severeFreq: REMINDER_HYGIENE_SEVERE,
      describe: hygieneDescription,
    });

    // 顶值惩罚态：hunger / fatigue 持续顶到 16 → 累计 cap ticks，
    // 跨 4 tick 触发 mood -1 + 失神 inner；跨 8 tick 触发 mood -2 + 重提示。
    applyCapPenalty({
      inner, worldId, tick, character: c, kind: "hunger",
      describe: hungerCapDescription,
    });
    applyCapPenalty({
      inner, worldId, tick, character: c, kind: "fatigue",
      describe: fatigueCapDescription,
    });
  }

  return inner;
}

interface CapPenaltyArgs {
  inner: WorldEvent[];
  worldId: string;
  tick: number;
  character: Character;
  kind: "hunger" | "fatigue";
  describe: (severity: "light" | "heavy") => string;
}

function applyCapPenalty(args: CapPenaltyArgs): void {
  const { inner, worldId, tick, character, kind, describe } = args;
  const counterKey = kind === "hunger" ? "hungerCapTicks" : "fatigueCapTicks";
  const value = character.vitals[kind];
  if (value < VITAL_MAX) {
    character.vitals[counterKey] = 0;
    return;
  }
  const prev = character.vitals[counterKey] ?? 0;
  const next = prev + 1;
  character.vitals[counterKey] = next;
  // 跨入轻惩罚阈值（一次性扣 mood，触发 inner）
  if (prev < CAP_PENALTY_LIGHT_TICKS && next >= CAP_PENALTY_LIGHT_TICKS) {
    character.emotion.mood = clamp(character.emotion.mood - 1, -4, 4);
    inner.push(makeInnerEvent({
      worldId, tick, charId: character.id,
      description: describe("light"),
      intensity: 3,
    }));
  }
  // 跨入重惩罚阈值
  if (prev < CAP_PENALTY_HEAVY_TICKS && next >= CAP_PENALTY_HEAVY_TICKS) {
    character.emotion.mood = clamp(character.emotion.mood - 1, -4, 4); // 累计 -2 总计
    inner.push(makeInnerEvent({
      worldId, tick, charId: character.id,
      description: describe("heavy"),
      intensity: 3,
    }));
  }
}

function hungerCapDescription(severity: "light" | "heavy"): string {
  return severity === "heavy"
    ? "饥饿到极点已许久，眼前发黑、双手颤抖，必须立刻进食。"
    : "饥饿到了顶点，肚子像被掏空，开始失神。";
}

function fatigueCapDescription(severity: "light" | "heavy"): string {
  return severity === "heavy"
    ? "疲惫已到极限许久，意识恍惚、思绪粘滞，必须立刻休息。"
    : "疲惫到了顶点，眼前发花，注意力不再集中。";
}

function hungerDescription(value: number, level: "medium" | "severe"): string {
  if (level === "severe") {
    return `极度饥饿（${value} 小时未进食），必须立刻找东西吃。`;
  }
  return `明显感到饿了（${value} 小时未进食）。`;
}

function fatigueDescription(value: number, level: "medium" | "severe"): string {
  if (level === "severe") {
    return `极度疲惫（已 ${value} 小时未眠），几乎站着都能睡着。`;
  }
  return `开始感到累（已 ${value} 小时未眠）。`;
}

function hygieneDescription(value: number, level: "medium" | "severe"): string {
  if (level === "severe") {
    return `身上已经很脏了（${value} 小时未洗浴），自己都能闻到味道。`;
  }
  return `感觉有点不干净（${value} 小时未洗浴）。`;
}

// ---- emotion evolution ----

export interface EmotionEvolutionInput {
  characters: Character[];
  worldId: string;
  tick: number;
  /** Map of characterId → whether they have companions at the same node */
  hasCompanions: Map<string, boolean>;
}

export function evolveEmotions(input: EmotionEvolutionInput): WorldEvent[] {
  const { characters, worldId, tick, hasCompanions } = input;
  const inner: WorldEvent[] = [];
  const evenHour = isEvenHour(tick);
  const hourTick = isHourTick(tick);
  const totalHours = Math.floor(tick / TICKS_PER_HOUR);

  for (const c of characters) {
    // mood: even hour → toward 0 by 1
    if (hourTick && evenHour && c.emotion.mood !== 0) {
      c.emotion.mood += c.emotion.mood > 0 ? -1 : 1;
    }

    // stress: every 24 hours → -1
    if (totalHours > 0 && totalHours % STRESS_DECAY_INTERVAL === 0 && hourTick) {
      c.emotion.stress = Math.max(0, c.emotion.stress - 1);
    }

    // social_satiety: even hour → +1 if companions, -1 if alone
    if (hourTick && evenHour) {
      const hasPeer = hasCompanions.get(c.id) ?? false;
      if (hasPeer) {
        c.emotion.social_satiety = Math.min(4, c.emotion.social_satiety + 1);
      } else {
        c.emotion.social_satiety = Math.max(-4, c.emotion.social_satiety - 1);
      }
    }

    // throttled threshold reminders
    if (c.emotion.mood <= -3 && totalHours > 0 && totalHours % REMINDER_MOOD === 0 && hourTick) {
      inner.push(makeInnerEvent({
        worldId, tick, charId: c.id,
        description: "心情低落，情绪需要出口。",
        intensity: 2,
      }));
    }
    if (c.emotion.stress >= 3 && totalHours > 0 && totalHours % REMINDER_STRESS === 0 && hourTick) {
      inner.push(makeInnerEvent({
        worldId, tick, charId: c.id,
        description: "压力很大，需要放松。",
        intensity: 2,
      }));
    }
    if (
      c.emotion.social_satiety <= -3 &&
      totalHours > 0 &&
      totalHours % REMINDER_SOCIAL_SATIETY_LOW === 0 &&
      hourTick
    ) {
      inner.push(makeInnerEvent({
        worldId, tick, charId: c.id,
        description: "感到孤独，渴望与人交流。",
        intensity: 2,
      }));
    }
  }

  return inner;
}

// ---- event-driven emotion changes ----

export type EmotionEventType =
  | "attacked_self"
  | "received_help_gift"
  | "attacked_other"
  | "helped_gifted"
  | "negative_burst"
  | "positive_burst";

export function applyEmotionEvent(
  emotion: Emotion,
  type: EmotionEventType,
): void {
  switch (type) {
    case "attacked_self":
      emotion.mood = clamp(emotion.mood - 2, -4, 4);
      emotion.stress = clamp(emotion.stress + 2, 0, 4);
      break;
    case "received_help_gift":
      emotion.mood = clamp(emotion.mood + 1, -4, 4);
      emotion.stress = 0;
      break;
    case "attacked_other":
      emotion.stress = clamp(emotion.stress + 1, 0, 4);
      break;
    case "helped_gifted":
      emotion.mood = clamp(emotion.mood + 1, -4, 4);
      break;
    case "negative_burst":
      emotion.mood = clamp(emotion.mood - 1, -4, 4);
      emotion.stress = clamp(emotion.stress + 1, 0, 4);
      break;
    case "positive_burst":
      emotion.mood = clamp(emotion.mood + 1, -4, 4);
      break;
  }
}

// ---- vitals reset helpers ----

export function resetVital(
  character: Character,
  kind: "hunger" | "fatigue" | "hygiene",
): void {
  character.vitals[kind] = 0;
  if (kind === "hunger") character.vitals.hungerCapTicks = 0;
  if (kind === "fatigue") character.vitals.fatigueCapTicks = 0;
}

export function reduceVital(
  character: Character,
  kind: "hunger" | "fatigue" | "hygiene",
  amount: number,
): void {
  character.vitals[kind] = Math.max(0, character.vitals[kind] - amount);
  // 只要离开顶值，cap 计数器即归零（applyCapPenalty 也会做这事，但显式更清楚）。
  if (kind === "hunger" && character.vitals.hunger < VITAL_MAX) {
    character.vitals.hungerCapTicks = 0;
  }
  if (kind === "fatigue" && character.vitals.fatigue < VITAL_MAX) {
    character.vitals.fatigueCapTicks = 0;
  }
}

// ---- sickness ----

export interface SicknessCheckInput {
  characters: Character[];
  worldId: string;
  tick: number;
}

/**
 * 每日一次（tick % 120 === 0）判定生病：
 * - 基础概率由 health 决定：4→2%, 3→5%, 2→10%, 1→20%
 * - vitals 越线修正：fatigue >= 12 && capTicks > 0 → ×1.5
 *                     hunger >= 12 && capTicks > 0 → ×1.5
 *                     hygiene >= 12 → ×1.3
 * - 最终概率上限 50%
 * - 命中后 mood -= 1，duration 随机 1-7 天（120-840 ticks）
 * - 到期自动恢复：mood += 1
 */
export function checkSickness(input: SicknessCheckInput): WorldEvent[] {
  const { characters, worldId, tick } = input;
  const inner: WorldEvent[] = [];

  for (const c of characters) {
    // Recovery check
    if (c.sickness && tick >= c.sickness.onsetTick + c.sickness.duration) {
      c.sickness = undefined;
      c.emotion.mood = clamp(c.emotion.mood + 1, -4, 4);
      inner.push(makeInnerEvent({
        worldId, tick, charId: c.id,
        description: "病好了，身体恢复了。",
        intensity: 1,
      }));
      continue;
    }

    // Already sick — no new sickness roll
    if (c.sickness) continue;

    // Base probability from health
    const baseProb: Record<number, number> = { 1: 0.20, 2: 0.10, 3: 0.05, 4: 0.02 };
    let prob = baseProb[c.health] ?? 0.10;

    // Vital modifiers
    if (c.vitals.fatigue >= 12 && (c.vitals.fatigueCapTicks ?? 0) > 0) prob *= 1.5;
    if (c.vitals.hunger >= 12 && (c.vitals.hungerCapTicks ?? 0) > 0) prob *= 1.5;
    if (c.vitals.hygiene >= 12) prob *= 1.3;

    prob = Math.min(prob, 0.50);

    if (Math.random() < prob) {
      const days = 1 + Math.floor(Math.random() * 7); // 1-7
      c.sickness = {
        onsetTick: tick,
        duration: days * 120,
      };
      c.emotion.mood = clamp(c.emotion.mood - 1, -4, 4);
      inner.push(makeInnerEvent({
        worldId, tick, charId: c.id,
        description: "生病了，身体不适。",
        intensity: 3,
      }));
    }
  }

  return inner;
}
