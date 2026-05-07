import { and, eq } from "drizzle-orm";
import { db, schema } from "../client";
import type { Conversation } from "@agw/domain";

export function findConversations(worldId: string): Conversation[] {
  return db.select().from(schema.conversations)
    .where(eq(schema.conversations.worldId, worldId)).all()
    .map((r) => JSON.parse(r.payloadJson) as Conversation);
}

export function upsertConversation(conv: Conversation): void {
  db.insert(schema.conversations).values({
    id: conv.id, worldId: conv.worldId,
    payloadJson: JSON.stringify(conv),
    createdAt: new Date(), updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [schema.conversations.worldId, schema.conversations.id],
    set: { payloadJson: JSON.stringify(conv), updatedAt: new Date() },
  }).run();
}

export function deleteConversation(worldId: string, id: string): void {
  db.delete(schema.conversations)
    .where(and(eq(schema.conversations.worldId, worldId), eq(schema.conversations.id, id))).run();
}
