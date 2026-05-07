import { eq } from "drizzle-orm";
import { db, schema } from "../client";
import type { World } from "@agw/domain";

export function findWorld(worldId: string): World | undefined {
  const w = db.select().from(schema.worlds).where(eq(schema.worlds.id, worldId)).get();
  if (!w) return undefined;
  return {
    id: w.id, name: w.name, mapId: w.mapId,
    currentTick: w.currentTick, epoch: w.epoch.getTime(),
    createdAt: w.createdAt.getTime(), updatedAt: w.updatedAt.getTime(),
  };
}

export function getWorldOrThrow(worldId: string): World {
  const w = findWorld(worldId);
  if (!w) throw new Error(`world not found: ${worldId}`);
  return w;
}

export function listWorlds(): World[] {
  return db.select().from(schema.worlds).all().map((w) => ({
    id: w.id, name: w.name, mapId: w.mapId,
    currentTick: w.currentTick, epoch: w.epoch.getTime(),
    createdAt: w.createdAt.getTime(), updatedAt: w.updatedAt.getTime(),
  }));
}

export function insertWorld(world: World): void {
  db.insert(schema.worlds).values({
    id: world.id, name: world.name, mapId: world.mapId,
    currentTick: world.currentTick, epoch: new Date(world.epoch),
  }).run();
}

export function updateWorldTick(worldId: string, tick: number): void {
  db.update(schema.worlds).set({
    currentTick: tick, updatedAt: new Date(),
  }).where(eq(schema.worlds.id, worldId)).run();
}

export function updateWorldMapId(worldId: string, mapId: string): void {
  db.update(schema.worlds).set({ mapId, updatedAt: new Date() })
    .where(eq(schema.worlds.id, worldId)).run();
}

export function saveWorldMeta(worldId: string, mapId: string, tick: number): void {
  db.update(schema.worlds).set({
    mapId, currentTick: tick, updatedAt: new Date(),
  }).where(eq(schema.worlds.id, worldId)).run();
}
