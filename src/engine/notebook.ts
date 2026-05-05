import { randomUUID } from "node:crypto";
import { db, schema } from "@/db/client";
import { eq, and } from "drizzle-orm";
import type { NotebookEntry, Tick } from "@/domain/types";
import { TICKS_PER_HOUR } from "@/domain/enums";

const MS_PER_TICK = (60 / TICKS_PER_HOUR) * 60 * 1000; // 720000ms = 12min

// ── Persistence ──

export function loadNotebookEntries(worldId: string): Map<string, NotebookEntry[]> {
  const rows = db
    .select()
    .from(schema.notebookEntries)
    .where(eq(schema.notebookEntries.worldId, worldId))
    .all();
  const out = new Map<string, NotebookEntry[]>();
  for (const r of rows) {
    const entry = JSON.parse(r.payloadJson) as NotebookEntry;
    const arr = out.get(r.characterId) ?? [];
    arr.push(entry);
    out.set(r.characterId, arr);
  }
  return out;
}

export function saveNotebookEntry(
  worldId: string,
  characterId: string,
  entry: NotebookEntry,
): void {
  db
    .insert(schema.notebookEntries)
    .values({
      worldId,
      characterId,
      id: entry.id,
      payloadJson: JSON.stringify(entry),
    })
    .onConflictDoUpdate({
      target: [schema.notebookEntries.worldId, schema.notebookEntries.characterId, schema.notebookEntries.id],
      set: { payloadJson: JSON.stringify(entry) },
    })
    .run();
}

export function deleteNotebookEntry(
  worldId: string,
  characterId: string,
  entryId: string,
): void {
  db
    .delete(schema.notebookEntries)
    .where(
      and(
        eq(schema.notebookEntries.worldId, worldId),
        eq(schema.notebookEntries.characterId, characterId),
        eq(schema.notebookEntries.id, entryId),
      ),
    )
    .run();
}

export function cleanExpiredEntries(worldId: string, currentTick: Tick): void {
  const rows = db
    .select()
    .from(schema.notebookEntries)
    .where(eq(schema.notebookEntries.worldId, worldId))
    .all();
  for (const r of rows) {
    const entry = JSON.parse(r.payloadJson) as NotebookEntry;
    if (entry.scheduledTick < currentTick) {
      db
        .delete(schema.notebookEntries)
        .where(and(
          eq(schema.notebookEntries.worldId, r.worldId),
          eq(schema.notebookEntries.characterId, r.characterId),
          eq(schema.notebookEntries.id, r.id),
        ))
        .run();
    }
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

export function formatRelativeTime(
  tick: Tick,
  currentTick: Tick,
  epoch: number,
): string {
  const currentDay = Math.floor(currentTick / (24 * TICKS_PER_HOUR));
  const targetDay = Math.floor(tick / (24 * TICKS_PER_HOUR));
  const date = new Date(epoch + tick * MS_PER_TICK);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  if (targetDay === currentDay) return `${hh}:${mm}`;
  return `第${targetDay}日 ${hh}:${mm}`;
}

export function formatScheduledTime(tick: Tick, epoch: number): string {
  const day = Math.floor(tick / (24 * TICKS_PER_HOUR));
  const date = new Date(epoch + tick * MS_PER_TICK);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `第${day}日 ${hh}:${mm}`;
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
  const currentDay = Math.floor(currentTick / (24 * TICKS_PER_HOUR));
  const allToday = entries.every(
    (e) => Math.floor(e.scheduledTick / (24 * TICKS_PER_HOUR)) === currentDay,
  );
  const label = allToday ? "今日待办" : "待办";
  return `${label}：\n${lines.join("\n")}`;
}

// ── Action helpers ──

/**
 * Convert LLM-provided calendar date (year/month/day/hour) to tick.
 * Returns null if the date is invalid or before epoch.
 */
export function tickFromCalendar(
  year: number,
  month: number,
  day: number,
  hour: number,
  epoch: number,
): Tick | null {
  const targetMs = Date.UTC(year, month - 1, day, hour);
  if (isNaN(targetMs)) return null;
  // Reconstruct to detect Date.UTC overflow (e.g. Feb 30 → Mar 2)
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

/**
 * 返回当前游戏时间的可读字符串，用于告知 LLM 上下文。
 */
export function formatCurrentTime(tick: Tick, epoch: number): string {
  const date = new Date(epoch + tick * MS_PER_TICK);
  const y = date.getUTCFullYear();
  const M = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${y}年${M}月${d}日 ${hh}:${mm}`;
}

/** Create a unique notebook entry ID. */
export function createEntryId(): string {
  return `nbe-${randomUUID().slice(0, 8)}`;
}
