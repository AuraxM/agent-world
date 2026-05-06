import type { OngoingAction } from "@/domain/types";
import { TICKS_PER_HOUR } from "@/domain/enums";

const MS_PER_TICK = (60 / TICKS_PER_HOUR) * 60 * 1000;

/** Stat-bar color tier. Caller passes the thresholds — intentionally not a max-derived helper because vitals (0..16) and stress (0..4) use different cutoffs. */
export function vitalThreshold(
  value: number,
  danger: number,
  warn: number,
): "ok" | "warn" | "danger" {
  if (value >= danger) return "danger";
  if (value >= warn) return "warn";
  return "ok";
}

/** Sign-based color tier for relation affection ([-4..+4]). */
export function affectionTone(value: number): "pos" | "neg" | "zero" {
  if (value > 0) return "pos";
  if (value < 0) return "neg";
  return "zero";
}

/** "在 张默家 睡觉 (t12→t19)" — description comes from engine and is already user-readable. */
export function formatActionWindow(action: OngoingAction): string {
  if (action.type === "move" && action.path && action.stepIndex !== undefined) {
    const step = action.stepIndex;
    const total = action.path.length - 1;
    return `${action.description} (${step}/${total}步, t${action.startedAt}→t${action.endsAt})`;
  }
  return `${action.description} (t${action.startedAt}→t${action.endsAt})`;
}

/** 格式化记事本条目的预定时间，如 "第3日 14:00"。 */
export function formatScheduledTime(tick: number, epoch: number): string {
  const day = Math.floor(tick / (24 * TICKS_PER_HOUR));
  const date = new Date(epoch + tick * MS_PER_TICK);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `第${day}日 ${hh}:${mm}`;
}
