import { TICKS_PER_HOUR } from "@/domain/enums";

/** 1 tick = 12 游戏分钟（60 min / TICKS_PER_HOUR） */
const MS_PER_TICK = 12 * 60 * 1000;

function tickToDate(tick: number): Date {
  const start = new Date("2026-05-01T00:00:00");
  return new Date(start.getTime() + tick * MS_PER_TICK);
}

/** tick → "2026/05/01 08:24" */
export function formatGameTime(tick: number): string {
  const d = tickToDate(tick);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

/** tick → "08:24" short format */
export function formatHHMM(tick: number): string {
  const d = tickToDate(tick);
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${min}`;
}

/** tick → "2026/05/02" date-only */
export function formatDay(tick: number): string {
  const d = tickToDate(tick);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}
