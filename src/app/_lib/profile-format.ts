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
