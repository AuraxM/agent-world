import { randomUUID } from "node:crypto";
import {
  findNotebookEntries,
  upsertNotebookEntry,
  deleteNotebookEntry as deleteNotebookEntryRepo,
  deleteExpiredNotebookEntries,
} from "../db/index";
import type { NotebookEntry, Tick } from "../domain/index";
import { TICKS_PER_HOUR } from "../domain/index";
import { createLogger } from "../shared/index";

const log = createLogger("notebook");

const MS_PER_TICK = (60 / TICKS_PER_HOUR) * 60 * 1000; // 720000ms = 12min

// ── Persistence re-exports (backward-compat names) ──

export function loadNotebookEntries(worldId: string): Map<string, NotebookEntry[]> {
  return findNotebookEntries(worldId);
}

export function saveNotebookEntry(
  worldId: string,
  characterId: string,
  entry: NotebookEntry,
): void {
  upsertNotebookEntry(worldId, characterId, entry);
}

export function deleteNotebookEntry(
  worldId: string,
  characterId: string,
  entryId: string,
): void {
  deleteNotebookEntryRepo(worldId, characterId, entryId);
}

export function cleanExpiredEntries(worldId: string, currentTick: Tick): void {
  const cleaned = deleteExpiredNotebookEntries(worldId, currentTick);
  if (cleaned > 0) {
    log.info("cleanExpiredEntries", { worldId, currentTick, cleaned });
  }
}

// ── Query ──

export function getUpcoming(
  entries: NotebookEntry[],
  fromTick: Tick,
  toTick: Tick,
): NotebookEntry[] {
  return entries
    .filter((e) => e.scheduledTick >= fromTick && e.scheduledTick <= toTick)
    .sort((a, b) => a.scheduledTick - b.scheduledTick);
}

export function getTodayEntries(
  entries: NotebookEntry[],
  currentTick: Tick,
): NotebookEntry[] {
  const dayEnd = currentTick + 24 * TICKS_PER_HOUR;
  return getUpcoming(entries, currentTick, dayEnd);
}

export function getNextHourEntries(
  entries: NotebookEntry[],
  currentTick: Tick,
): NotebookEntry[] {
  const hourEnd = currentTick + TICKS_PER_HOUR;
  return getUpcoming(entries, currentTick, hourEnd);
}

// ── Time Formatting ──

const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];

function formatCalendarTime(tick: Tick, epoch: number): string {
  const date = new Date(epoch + tick * MS_PER_TICK);
  const M = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const w = WEEKDAY_NAMES[date.getUTCDay()];
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${M}月${d}日 周${w} ${hh}:${mm}`;
}

function sameUTCDay(a: Tick, b: Tick, epoch: number): boolean {
  const da = new Date(epoch + a * MS_PER_TICK);
  const db = new Date(epoch + b * MS_PER_TICK);
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  );
}

export function formatRelativeTime(
  tick: Tick,
  currentTick: Tick,
  epoch: number,
): string {
  const date = new Date(epoch + tick * MS_PER_TICK);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  if (sameUTCDay(tick, currentTick, epoch)) return `${hh}:${mm}`;
  return formatCalendarTime(tick, epoch);
}

export function formatScheduledTime(tick: Tick, epoch: number): string {
  return formatCalendarTime(tick, epoch);
}

// ── Prompt Helpers ──

export function describeEntries(
  entries: NotebookEntry[],
  currentTick: Tick,
  epoch: number,
): string {
  if (entries.length === 0) return "";
  const lines = entries.map(
    (e) => `- ${formatRelativeTime(e.scheduledTick, currentTick, epoch)} — ${e.content}`,
  );
  const allToday = entries.every(
    (e) => sameUTCDay(e.scheduledTick, currentTick, epoch),
  );
  const label = allToday ? "今日约定的待办" : "约定的待办";
  return `${label}：\n${lines.join("\n")}`;
}

// ── Action helpers ──

export function tickFromCalendar(
  year: number,
  month: number,
  day: number,
  hour: number,
  epoch: number,
): Tick | null {
  const targetMs = Date.UTC(year, month - 1, day, hour);
  if (isNaN(targetMs)) return null;
  const reconstructed = new Date(targetMs);
  if (
    reconstructed.getUTCFullYear() !== year ||
    reconstructed.getUTCMonth() !== month - 1 ||
    reconstructed.getUTCDate() !== day
  ) return null;
  const tick = Math.round((targetMs - epoch) / MS_PER_TICK);
  if (tick < 0) return null;
  return tick;
}

export function formatCurrentTime(tick: Tick, epoch: number): string {
  const date = new Date(epoch + tick * MS_PER_TICK);
  const y = date.getFullYear();
  const M = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const w = WEEKDAY_NAMES[date.getDay()];
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}年${M}月${d}日 星期${w} ${hh}:${mm}`;
}

export function createEntryId(): string {
  return `nbe-${randomUUID().slice(0, 8)}`;
}
