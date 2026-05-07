import { and, eq } from "drizzle-orm";
import { db, schema } from "../client";
import type { NotebookEntry } from "@agw/domain";

export function findNotebookEntries(worldId: string): Map<string, NotebookEntry[]> {
  const rows = db.select().from(schema.notebookEntries)
    .where(eq(schema.notebookEntries.worldId, worldId)).all();
  const out = new Map<string, NotebookEntry[]>();
  for (const r of rows) {
    const entry = JSON.parse(r.payloadJson) as NotebookEntry;
    const arr = out.get(r.characterId) ?? [];
    arr.push(entry);
    out.set(r.characterId, arr);
  }
  return out;
}

export function upsertNotebookEntry(
  worldId: string,
  characterId: string,
  entry: NotebookEntry,
): void {
  db.insert(schema.notebookEntries).values({
    worldId, characterId,
    id: entry.id,
    payloadJson: JSON.stringify(entry),
  }).onConflictDoUpdate({
    target: [schema.notebookEntries.worldId, schema.notebookEntries.characterId, schema.notebookEntries.id],
    set: { payloadJson: JSON.stringify(entry) },
  }).run();
}

export function deleteNotebookEntry(
  worldId: string,
  characterId: string,
  entryId: string,
): void {
  db.delete(schema.notebookEntries)
    .where(and(
      eq(schema.notebookEntries.worldId, worldId),
      eq(schema.notebookEntries.characterId, characterId),
      eq(schema.notebookEntries.id, entryId),
    )).run();
}

export function deleteExpiredNotebookEntries(worldId: string, beforeTick: number): number {
  const rows = db.select().from(schema.notebookEntries)
    .where(eq(schema.notebookEntries.worldId, worldId)).all();
  let cleaned = 0;
  for (const r of rows) {
    let entry: NotebookEntry;
    try {
      entry = JSON.parse(r.payloadJson) as NotebookEntry;
    } catch {
      // Corrupt payload — delete the row so it doesn't block future cleanups
      db.delete(schema.notebookEntries)
        .where(and(
          eq(schema.notebookEntries.worldId, r.worldId),
          eq(schema.notebookEntries.characterId, r.characterId),
          eq(schema.notebookEntries.id, r.id),
        )).run();
      cleaned++;
      continue;
    }
    if (entry.scheduledTick < beforeTick) {
      db.delete(schema.notebookEntries)
        .where(and(
          eq(schema.notebookEntries.worldId, r.worldId),
          eq(schema.notebookEntries.characterId, r.characterId),
          eq(schema.notebookEntries.id, r.id),
        )).run();
      cleaned++;
    }
  }
  return cleaned;
}
