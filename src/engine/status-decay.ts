/**
 * 自然衰减 + 派生离散 status + 持续 inner 事件。
 *
 * 规则（v0.2 修复"越线只触发一次"的隐性 bug）：
 * - 每 tick：hunger += 1, fatigue += 1
 * - 数值映射：< 5 light, 5–9 medium, ≥ 10 severe
 * - 跨入 medium / severe 的那个 tick 必发 inner 事件
 * - **持续提醒**：处于 medium 时每 5 tick 补发；处于 severe 时每 3 tick 补发
 *   - 文案随累积小时数加强（fatigue=11 "明显困了" → fatigue=20 "几乎站着都能睡着"）
 * - 离散 statuses[] 与数值 vitals 同步：先剔除老的 hungry/fatigue，再按当前数值重写
 */
import { randomUUID } from "node:crypto";
import type { Character, Vitals, WorldEvent } from "@/domain/types";
import type { StatusKind, StatusLevel } from "@/domain/enums";

const VITAL_KINDS = ["hungry", "fatigue"] as const satisfies readonly StatusKind[];

const REMINDER_FREQ_MEDIUM = 5;
const REMINDER_FREQ_SEVERE = 3;

function levelOf(value: number): StatusLevel | null {
  if (value >= 10) return "severe";
  if (value >= 5) return "medium";
  if (value >= 1) return "light";
  return null;
}

function vitalToStatus(
  kind: StatusKind,
  value: number,
  since: number,
): { kind: StatusKind; level: StatusLevel; since: number } | null {
  const level = levelOf(value);
  if (!level) return null;
  return { kind, level, since };
}

function hungerDescription(value: number, level: "medium" | "severe"): string {
  if (level === "severe") {
    if (value >= 25) return `濒临饿坏（${value} 小时未进食），必须立刻找东西吃。`;
    if (value >= 15) return `极度饥饿（${value} 小时未进食），头晕眼花。`;
    return `肚子饿得发慌（${value} 小时未进食），注意力涣散。`;
  }
  return `明显感到饿了（${value} 小时未进食）。`;
}

function fatigueDescription(value: number, level: "medium" | "severe"): string {
  if (level === "severe") {
    if (value >= 25) return `濒临崩溃（已 ${value} 小时未眠），必须立刻 rest。`;
    if (value >= 15) return `极度疲惫（已 ${value} 小时未眠），几乎站着都能睡着。`;
    return `疲惫不堪（已 ${value} 小时未眠），眼皮在打架。`;
  }
  return `开始感到累（已 ${value} 小时未眠）。`;
}

function makeInnerEvent(args: {
  worldId: string;
  tick: number;
  charId: string;
  kind: "hungry" | "fatigue";
  level: "medium" | "severe";
  description: string;
}): WorldEvent {
  return {
    id: `evt-${randomUUID().slice(0, 8)}`,
    worldId: args.worldId,
    tick: args.tick,
    category: "inner",
    description: args.description,
    participants: [args.charId],
    source: "inner",
    intensity: args.level === "severe" ? 3 : 2,
    scope: "private",
    audienceCharacterId: args.charId,
    duration: 1,
  };
}

/** 根据级别 + 当前 tick 决定本 tick 是否补发提醒。 */
function shouldRemind(level: "medium" | "severe", tick: number): boolean {
  const freq = level === "severe" ? REMINDER_FREQ_SEVERE : REMINDER_FREQ_MEDIUM;
  // tick=0 也允许触发（首次跨入会单独处理）
  return tick > 0 && tick % freq === 0;
}

/**
 * 推进所有 character 的衰减。返回越线/持续提醒产生的 inner 事件数组。
 * 直接 mutate characters 的 vitals 与 statuses。
 */
export function decayAndDeriveStatuses(
  characters: Character[],
  worldId: string,
  tick: number,
): WorldEvent[] {
  const inner: WorldEvent[] = [];

  for (const c of characters) {
    const before: Vitals = { ...c.vitals };
    c.vitals.hunger = (c.vitals.hunger ?? 0) + 1;
    c.vitals.fatigue = (c.vitals.fatigue ?? 0) + 1;

    // ---- hunger ----
    const beforeHL = levelOf(before.hunger);
    const afterHL = levelOf(c.vitals.hunger);
    const hungerCrossedSevere = afterHL === "severe" && beforeHL !== "severe";
    const hungerCrossedMedium =
      afterHL === "medium" &&
      beforeHL !== "medium" &&
      beforeHL !== "severe";
    if (hungerCrossedSevere) {
      inner.push(
        makeInnerEvent({
          worldId,
          tick,
          charId: c.id,
          kind: "hungry",
          level: "severe",
          description: hungerDescription(c.vitals.hunger, "severe"),
        }),
      );
    } else if (hungerCrossedMedium) {
      inner.push(
        makeInnerEvent({
          worldId,
          tick,
          charId: c.id,
          kind: "hungry",
          level: "medium",
          description: hungerDescription(c.vitals.hunger, "medium"),
        }),
      );
    } else if (afterHL === "severe" && shouldRemind("severe", tick)) {
      inner.push(
        makeInnerEvent({
          worldId,
          tick,
          charId: c.id,
          kind: "hungry",
          level: "severe",
          description: hungerDescription(c.vitals.hunger, "severe"),
        }),
      );
    } else if (afterHL === "medium" && shouldRemind("medium", tick)) {
      inner.push(
        makeInnerEvent({
          worldId,
          tick,
          charId: c.id,
          kind: "hungry",
          level: "medium",
          description: hungerDescription(c.vitals.hunger, "medium"),
        }),
      );
    }

    // ---- fatigue ----
    const beforeFL = levelOf(before.fatigue);
    const afterFL = levelOf(c.vitals.fatigue);
    const fatigueCrossedSevere = afterFL === "severe" && beforeFL !== "severe";
    const fatigueCrossedMedium =
      afterFL === "medium" &&
      beforeFL !== "medium" &&
      beforeFL !== "severe";
    if (fatigueCrossedSevere) {
      inner.push(
        makeInnerEvent({
          worldId,
          tick,
          charId: c.id,
          kind: "fatigue",
          level: "severe",
          description: fatigueDescription(c.vitals.fatigue, "severe"),
        }),
      );
    } else if (fatigueCrossedMedium) {
      inner.push(
        makeInnerEvent({
          worldId,
          tick,
          charId: c.id,
          kind: "fatigue",
          level: "medium",
          description: fatigueDescription(c.vitals.fatigue, "medium"),
        }),
      );
    } else if (afterFL === "severe" && shouldRemind("severe", tick)) {
      inner.push(
        makeInnerEvent({
          worldId,
          tick,
          charId: c.id,
          kind: "fatigue",
          level: "severe",
          description: fatigueDescription(c.vitals.fatigue, "severe"),
        }),
      );
    } else if (afterFL === "medium" && shouldRemind("medium", tick)) {
      inner.push(
        makeInnerEvent({
          worldId,
          tick,
          charId: c.id,
          kind: "fatigue",
          level: "medium",
          description: fatigueDescription(c.vitals.fatigue, "medium"),
        }),
      );
    }

    // 把 vitals 反映到离散 statuses（重写 hungry/fatigue 项）
    const others = c.statuses.filter(
      (s) => !VITAL_KINDS.includes(s.kind as (typeof VITAL_KINDS)[number]),
    );
    const hungerStatus = vitalToStatus("hungry", c.vitals.hunger, tick);
    const fatigueStatus = vitalToStatus("fatigue", c.vitals.fatigue, tick);
    c.statuses = [
      ...others,
      ...(hungerStatus ? [hungerStatus] : []),
      ...(fatigueStatus ? [fatigueStatus] : []),
    ];
  }

  return inner;
}

/** 测试/工具：把 vitals 重置到 0，并清掉对应离散 status。 */
export function resetVital(character: Character, kind: "hunger" | "fatigue") {
  character.vitals[kind] = 0;
  const dropKind: StatusKind = kind === "hunger" ? "hungry" : "fatigue";
  character.statuses = character.statuses.filter((s) => s.kind !== dropKind);
}
