import type { OngoingAction } from "@/domain/types";

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
  return `${action.description} (t${action.startedAt}→t${action.endsAt})`;
}
