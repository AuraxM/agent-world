import { and, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "../client";
import type { WorldEvent } from "@agw/domain";

export function appendEvents(worldId: string, events: WorldEvent[]): void {
  if (events.length === 0) return;
  db.transaction((tx) => {
    for (const ev of events) {
      tx.insert(schema.eventsLog).values({
        id: ev.id, worldId, tick: ev.tick,
        payloadJson: JSON.stringify(ev), createdAt: new Date(),
      }).onConflictDoUpdate({
        target: schema.eventsLog.id,
        set: { tick: ev.tick, payloadJson: JSON.stringify(ev) },
      }).run();
    }
  });
}

export function findEventsSince(worldId: string, sinceTick: number): WorldEvent[] {
  return db.select().from(schema.eventsLog)
    .where(and(eq(schema.eventsLog.worldId, worldId), gte(schema.eventsLog.tick, sinceTick)))
    .orderBy(desc(schema.eventsLog.tick)).all()
    .map((r) => JSON.parse(r.payloadJson) as WorldEvent);
}
