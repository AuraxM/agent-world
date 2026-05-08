import { randomUUID } from "node:crypto";
import { db, schema } from "../client";
import type { Character, MapNode, WorldSnapshot } from "../../domain/index";
import { findEventsSince } from "./events";

export function insertSnapshot(snapshot: WorldSnapshot): void {
  db.insert(schema.snapshots).values({
    id: `snap-${snapshot.worldId}-${snapshot.tick}-${randomUUID().slice(0, 8)}`,
    worldId: snapshot.worldId, tick: snapshot.tick,
    payloadJson: JSON.stringify(snapshot),
  }).run();
}

export function createSnapshot(
  worldId: string,
  tick: number,
  epoch: number,
  nodes: MapNode[],
  characters: Character[],
): void {
  const recentEvents = findEventsSince(worldId, Math.max(0, tick - 24));
  insertSnapshot({ worldId, tick, epoch, nodes, characters, recentEvents });
}
