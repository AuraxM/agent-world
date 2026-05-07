import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "../client";
import type { Action, AgentThought } from "@agw/domain";

export function appendThoughts(
  worldId: string,
  entries: Array<{ characterId: string; tick: number; action: Action; success: boolean }>,
): void {
  if (entries.length === 0) return;
  db.transaction((tx) => {
    for (const e of entries) {
      tx.insert(schema.agentThoughts).values({
        worldId, characterId: e.characterId, tick: e.tick,
        actionJson: JSON.stringify(e.action), success: e.success,
      }).onConflictDoUpdate({
        target: [schema.agentThoughts.worldId, schema.agentThoughts.characterId, schema.agentThoughts.tick],
        set: { actionJson: JSON.stringify(e.action), success: e.success },
      }).run();
    }
  });
}

export function findRecentThoughts(worldId: string, characterId: string, sinceTick: number): AgentThought[] {
  return db.select().from(schema.agentThoughts)
    .where(and(eq(schema.agentThoughts.worldId, worldId), eq(schema.agentThoughts.characterId, characterId), gte(schema.agentThoughts.tick, sinceTick)))
    .orderBy(desc(schema.agentThoughts.tick)).all()
    .map((r) => ({ worldId: r.worldId, characterId: r.characterId, tick: r.tick, action: JSON.parse(r.actionJson) as Action, success: !!r.success, createdAt: r.createdAt.getTime() }));
}

export function findLatestThoughts(worldId: string, characterIds: string[]): Map<string, AgentThought> {
  if (characterIds.length === 0) return new Map();
  const rows = db.select().from(schema.agentThoughts)
    .where(and(eq(schema.agentThoughts.worldId, worldId), inArray(schema.agentThoughts.characterId, characterIds)))
    .orderBy(desc(schema.agentThoughts.tick)).all();
  const out = new Map<string, AgentThought>();
  for (const r of rows) {
    if (out.has(r.characterId)) continue;
    out.set(r.characterId, { worldId: r.worldId, characterId: r.characterId, tick: r.tick, action: JSON.parse(r.actionJson) as Action, success: !!r.success, createdAt: r.createdAt.getTime() });
  }
  return out;
}
