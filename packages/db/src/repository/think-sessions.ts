import { and, eq } from "drizzle-orm";
import { db, schema } from "../client";
import type { ThinkSession } from "@agw/domain";

export function findThinkSessions(worldId: string): ThinkSession[] {
  return db.select().from(schema.thinkSessions)
    .where(eq(schema.thinkSessions.worldId, worldId)).all()
    .map((r) => JSON.parse(r.payloadJson) as ThinkSession);
}

export function upsertThinkSession(ts: ThinkSession): void {
  db.insert(schema.thinkSessions).values({
    id: ts.id, worldId: ts.worldId,
    payloadJson: JSON.stringify(ts),
    createdAt: new Date(), updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [schema.thinkSessions.worldId, schema.thinkSessions.id],
    set: { payloadJson: JSON.stringify(ts), updatedAt: new Date() },
  }).run();
}

export function deleteThinkSession(worldId: string, id: string): void {
  db.delete(schema.thinkSessions)
    .where(and(eq(schema.thinkSessions.worldId, worldId), eq(schema.thinkSessions.id, id))).run();
}
