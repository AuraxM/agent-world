import { TICKS_PER_HOUR } from "@/domain/enums";

/** 1 tick = (60 / TICKS_PER_HOUR) game minutes, in milliseconds */
const MS_PER_TICK = (60 / TICKS_PER_HOUR) * 60 * 1000;

/** Default epoch when no world is known. */
export const DEFAULT_EPOCH_MS = new Date("2026-05-01T00:00:00").getTime();

export function tickToDate(epoch: number, tick: number): Date {
  return new Date(epoch + tick * MS_PER_TICK);
}

/** tick → "2026/05/01 08:24" */
export function formatGameTime(epoch: number, tick: number): string {
  const d = tickToDate(epoch, tick);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

/** tick → "08:24" short format */
export function formatHHMM(epoch: number, tick: number): string {
  const d = tickToDate(epoch, tick);
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${min}`;
}

/** tick → "2026/05/02" date-only */
export function formatDay(epoch: number, tick: number): string {
  const d = tickToDate(epoch, tick);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}
