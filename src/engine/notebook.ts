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

// ── Action helper ──

/**
 * Convert LLM-provided day/hour/minute to tick.
 * Uses epoch to align clock hour with the game calendar.
 */
export function tickFromDayHourMinute(
  day: number,
  hour: number,
  minute: number,
  epoch: number,
): Tick {
  const dayStartTick = day * 24 * TICKS_PER_HOUR;
  // Find tick within this game day whose Date hours match
  for (let t = dayStartTick; t < dayStartTick + 24 * TICKS_PER_HOUR; t++) {
    const d = new Date(epoch + t * MS_PER_TICK);
    if (d.getHours() === hour && Math.abs(d.getMinutes() - minute) <= 6) {
      return t;
    }
  }
  // Fallback: compute from epoch hour offset
  const epochHour = new Date(epoch).getHours();
  const hourOffset = ((hour - epochHour) % 24 + 24) % 24;
  return dayStartTick + hourOffset * TICKS_PER_HOUR + Math.floor(minute / (60 / TICKS_PER_HOUR));
}

/** Create a unique notebook entry ID. */
export function createEntryId(): string {
  return `nbe-${randomUUID().slice(0, 8)}`;
}
