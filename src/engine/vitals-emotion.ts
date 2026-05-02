/**
 * 生理 + 情绪引擎：每 tick 衰减 + 越线 inner 事件 + 事件驱动情绪。
 *
 * 数值规则（per spec §三）：
 * - hunger: +1/tick (0..16)
 * - fatigue: +1/tick (0..16)
 * - hygiene: +1 per even tick (0..16)
 * - mood: even tick → 朝 0 走 1（自然回归）
 * - stress: 每 24 tick 末 -1 (封底 0)
 * - social_satiety: even tick → 同节点有伴 +1 (封顶 +4)，独处 -1 (封底 -4)
 *
 * 越线提醒（节流）：
 * - hunger / fatigue: ≥5 medium (每 5 tick 复述), ≥10 severe (每 3 tick 复述)
 * - hygiene: ≥8 medium (每 8 tick), ≥13 severe (每 4 tick)
 * - mood ≤ -3: 每 6 tick
 * - stress ≥ 3: 每 6 tick
 * - social_satiety ≤ -3: 每 6 tick
 */
import { randomUUID } from "node:crypto";
import type { Character, Emotion, WorldEvent } from "@/domain/types";

// ---- thresholds ----

const VITAL_MAX = 16;

const HUNGER_MEDIUM = 5;
const HUNGER_SEVERE = 10;
const FATIGUE_MEDIUM = 5;
const FATIGUE_SEVERE = 10;
const HYGIENE_MEDIUM = 8;
const HYGIENE_SEVERE = 13;

const REMINDER_HUNGER_FATIGUE_MEDIUM = 5;
const REMINDER_HUNGER_FATIGUE_SEVERE = 3;
const REMINDER_HYGIENE_MEDIUM = 8;
const REMINDER_HYGIENE_SEVERE = 4;
const REMINDER_MOOD = 6;
const REMINDER_STRESS = 6;
const REMINDER_SOCIAL_SATIETY_LOW = 6;

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

// ---- vitals decay ----

export interface VitalsDecayInput {
  characters: Character[];
  worldId: string;
  tick: number;
}

export function decayVitals(input: VitalsDecayInput): WorldEvent[] {
  const { characters, worldId, tick } = input;
  const inner: WorldEvent[] = [];
  const isEven = tick % 2 === 0;

  for (const c of characters) {
    // 睡眠期间 vitals 冻结：既不衰减也不触发饥饿/疲劳/卫生提醒，
    // 醒来当 tick（fromTick === endsAt）恢复正常衰减。
    if (
      c.currentAction?.type === "sleep" &&
      tick < c.currentAction.endsAt
    ) {
      continue;
    }

    const prevHunger = c.vitals.hunger;
    const prevFatigue = c.vitals.fatigue;
    const prevHygiene = c.vitals.hygiene;

    c.vitals.hunger = Math.min(VITAL_MAX, c.vitals.hunger + 1);
    c.vitals.fatigue = Math.min(VITAL_MAX, c.vitals.fatigue + 1);
    if (isEven) {
      c.vitals.hygiene = Math.min(VITAL_MAX, c.vitals.hygiene + 1);
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
  }

  return inner;
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
  const isEven = tick % 2 === 0;

  for (const c of characters) {
    // mood: even tick → toward 0 by 1
    if (isEven && c.emotion.mood !== 0) {
      c.emotion.mood += c.emotion.mood > 0 ? -1 : 1;
    }

    // stress: every STRESS_DECAY_INTERVAL ticks → -1
    if (tick > 0 && tick % STRESS_DECAY_INTERVAL === 0) {
      c.emotion.stress = Math.max(0, c.emotion.stress - 1);
    }

    // social_satiety: even tick → +1 if companions, -1 if alone
    if (isEven) {
      const hasPeer = hasCompanions.get(c.id) ?? false;
      if (hasPeer) {
        c.emotion.social_satiety = Math.min(4, c.emotion.social_satiety + 1);
      } else {
        c.emotion.social_satiety = Math.max(-4, c.emotion.social_satiety - 1);
      }
    }

    // throttled threshold reminders
    if (c.emotion.mood <= -3 && tick > 0 && tick % REMINDER_MOOD === 0) {
      inner.push(makeInnerEvent({
        worldId, tick, charId: c.id,
        description: "心情低落，情绪需要出口。",
        intensity: 2,
      }));
    }
    if (c.emotion.stress >= 3 && tick > 0 && tick % REMINDER_STRESS === 0) {
      inner.push(makeInnerEvent({
        worldId, tick, charId: c.id,
        description: "压力很大，需要放松。",
        intensity: 2,
      }));
    }
    if (
      c.emotion.social_satiety <= -3 &&
      tick > 0 &&
      tick % REMINDER_SOCIAL_SATIETY_LOW === 0
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
}

export function reduceVital(
  character: Character,
  kind: "hunger" | "fatigue" | "hygiene",
  amount: number,
): void {
  character.vitals[kind] = Math.max(0, character.vitals[kind] - amount);
}
