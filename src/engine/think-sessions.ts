import type { ThinkSession } from "@/domain/types";
import { db, schema } from "@/db/client";
import { eq, and } from "drizzle-orm";

export function loadThinkSessions(worldId: string): ThinkSession[] {
  const rows = db
    .select()
    .from(schema.thinkSessions)
    .where(eq(schema.thinkSessions.worldId, worldId))
    .all();
  return rows.map((r) => JSON.parse(r.payloadJson) as ThinkSession);
}

export function saveThinkSession(ts: ThinkSession): void {
  const now = new Date();
  db
    .insert(schema.thinkSessions)
    .values({
      id: ts.id,
      worldId: ts.worldId,
      payloadJson: JSON.stringify(ts),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.thinkSessions.worldId, schema.thinkSessions.id],
      set: { payloadJson: JSON.stringify(ts), updatedAt: now },
    })
    .run();
}

export function deleteThinkSession(worldId: string, id: string): void {
  db
    .delete(schema.thinkSessions)
    .where(
      and(
        eq(schema.thinkSessions.worldId, worldId),
        eq(schema.thinkSessions.id, id),
      ),
    )
    .run();
}
