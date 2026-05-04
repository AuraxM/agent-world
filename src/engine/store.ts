/**
 * 把数据库行 ↔ 内存领域对象互转。
 *
 * Stage 1：每次 tick 全量加载该 world 的 nodes/characters/recent events，
 * 改完整体写回。规模够小（≤ 5 NPC），不必精细化 diff。
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import type {
  Action,
  AgentThought,
  Character,
  MapNode,
  World,
  WorldEvent,
  WorldSnapshot,
} from "@/domain/types";
import type { NodeTag, Privacy } from "@/domain/enums";
import { createLogger } from "@/util/logger";
const log = createLogger("store");

export interface LoadedWorld {
  world: World;
  nodes: MapNode[];
  characters: Character[];
}

export function loadWorld(worldId: string): LoadedWorld {
  const w = db
    .select()
    .from(schema.worlds)
    .where(eq(schema.worlds.id, worldId))
    .get();
  if (!w) throw new Error(`world not found: ${worldId}`);

  const nodeRows = db
    .select()
    .from(schema.nodes)
    .where(eq(schema.nodes.worldId, worldId))
    .all();
  const charRows = db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.worldId, worldId))
    .all();

  const world: World = {
    id: w.id,
    name: w.name,
    mapId: w.mapId,
    currentTick: w.currentTick,
    createdAt: w.createdAt.getTime(),
    updatedAt: w.updatedAt.getTime(),
  };

  const nodes: MapNode[] = nodeRows.map((n) => ({
    id: n.id,
    worldId: n.worldId,
    parentId: n.parentId,
    name: n.name,
    description: n.description,
    tags: JSON.parse(n.tagsJson) as NodeTag[],
    capacity: n.capacity,
    privacy: n.privacy as Privacy,
    visibleFromParent: !!n.visibleFromParent,
    shortcuts: JSON.parse(n.shortcutsJson) as string[],
    isEntry: !!n.isEntry,
    travelCost: n.travelCost ?? undefined,
    x: n.x ?? undefined,
    y: n.y ?? undefined,
    w: n.w ?? undefined,
    h: n.h ?? undefined,
    spriteKey: n.spriteKey ?? undefined,
  }));

  const characters: Character[] = charRows.map((c) => ({
    id: c.id,
    worldId: c.worldId,
    name: c.name,
    avatar: c.avatar ?? undefined,
    age: c.age,
    gender: c.gender as Character["gender"],
    profession: c.profession as Character["profession"],
    money: c.money,
    incomeLevel: c.incomeLevel,
    expenseExempt: !!c.expenseExempt,
    biography: c.biography,
    origin: c.origin as Character["origin"],
    locationId: c.locationId,
    personality: JSON.parse(c.personalityJson),
    vitals: JSON.parse(c.vitalsJson),
    emotion: JSON.parse(c.emotionJson),
    abilities: JSON.parse(c.abilitiesJson),
    shortMemory: JSON.parse(c.shortMemoryJson),
    dailyMemory: JSON.parse(c.dailyMemoryJson),
    longMemory: JSON.parse(c.longMemoryJson),
    relations: JSON.parse(c.relationsJson),
    currentAction: c.currentActionJson
      ? JSON.parse(c.currentActionJson)
      : undefined,
    lastSleepTick: c.lastSleepTick,
    appearance: c.appearance,
    intelligence: c.intelligence,
    health: c.health,
    sickness: c.sicknessJson ? JSON.parse(c.sicknessJson) : undefined,
    speakingStyle: c.speakingStyle ?? undefined,
  }));

  if (characters.length > 0) {
    const latest = loadLatestThoughts(
      worldId,
      characters.map((c) => c.id),
    );
    for (const c of characters) {
      const t = latest.get(c.id);
      if (t) c.lastThought = t;
    }
  }

  return { world, nodes, characters };
}

export function saveWorld(loaded: LoadedWorld): void {
  const now = new Date();
  db.transaction((tx) => {
    tx
      .update(schema.worlds)
      .set({
        mapId: loaded.world.mapId,
        currentTick: loaded.world.currentTick,
        updatedAt: now,
      })
      .where(eq(schema.worlds.id, loaded.world.id))
      .run();

    for (const c of loaded.characters) {
      tx
        .update(schema.characters)
        .set({
          locationId: c.locationId,
          money: c.money,
          incomeLevel: c.incomeLevel,
          expenseExempt: c.expenseExempt,
          vitalsJson: JSON.stringify(c.vitals),
          emotionJson: JSON.stringify(c.emotion),
          shortMemoryJson: JSON.stringify(c.shortMemory),
          dailyMemoryJson: JSON.stringify(c.dailyMemory),
          longMemoryJson: JSON.stringify(c.longMemory),
          relationsJson: JSON.stringify(c.relations),
          currentActionJson: c.currentAction
            ? JSON.stringify(c.currentAction)
            : null,
          lastSleepTick: c.lastSleepTick,
          sicknessJson: c.sickness ? JSON.stringify(c.sickness) : null,
          updatedAt: now,
        })
        .where(eq(schema.characters.id, c.id))
        .run();
    }
  });
  log.info("world 保存", {
    world: loaded.world.id,
    角色数: loaded.characters.length,
  });
}

export function appendEventsLog(
  worldId: string,
  events: WorldEvent[],
): void {
  if (events.length === 0) return;
  db.transaction((tx) => {
    for (const ev of events) {
      tx
        .insert(schema.eventsLog)
        .values({
          id: ev.id,
          worldId,
          tick: ev.tick,
          payloadJson: JSON.stringify(ev),
        })
        .run();
    }
  });
}

export function loadEventsSince(
  worldId: string,
  sinceTick: number,
): WorldEvent[] {
  const rows = db
    .select()
    .from(schema.eventsLog)
    .where(
      and(
        eq(schema.eventsLog.worldId, worldId),
        gte(schema.eventsLog.tick, sinceTick),
      ),
    )
    .orderBy(desc(schema.eventsLog.tick))
    .all();
  return rows.map((r) => JSON.parse(r.payloadJson) as WorldEvent);
}

export function appendThoughts(
  worldId: string,
  entries: Array<{ characterId: string; tick: number; action: Action; success: boolean }>,
): void {
  if (entries.length === 0) return;
  db.transaction((tx) => {
    for (const e of entries) {
      tx
        .insert(schema.agentThoughts)
        .values({
          worldId,
          characterId: e.characterId,
          tick: e.tick,
          actionJson: JSON.stringify(e.action),
          success: e.success,
        })
        .onConflictDoUpdate({
          target: [
            schema.agentThoughts.worldId,
            schema.agentThoughts.characterId,
            schema.agentThoughts.tick,
          ],
          set: {
            actionJson: JSON.stringify(e.action),
            success: e.success,
          },
        })
        .run();
    }
  });
}

/**
 * 取一名角色最近 N tick 的所有 thought（按 tick DESC）。
 * facts.deriveAggregatedFacts 用它推断"上次 rest / eat / move、连续行为"。
 */
export function loadRecentThoughts(
  worldId: string,
  characterId: string,
  sinceTick: number,
): AgentThought[] {
  const rows = db
    .select()
    .from(schema.agentThoughts)
    .where(
      and(
        eq(schema.agentThoughts.worldId, worldId),
        eq(schema.agentThoughts.characterId, characterId),
        gte(schema.agentThoughts.tick, sinceTick),
      ),
    )
    .orderBy(desc(schema.agentThoughts.tick))
    .all();
  return rows.map((r) => ({
    worldId: r.worldId,
    characterId: r.characterId,
    tick: r.tick,
    action: JSON.parse(r.actionJson) as Action,
    success: !!r.success,
    createdAt: r.createdAt.getTime(),
  }));
}

/** 一次性返回 (worldId, characterIds) 范围内每人的最新一条 thought。 */
export function loadLatestThoughts(
  worldId: string,
  characterIds: string[],
): Map<string, AgentThought> {
  if (characterIds.length === 0) return new Map();
  const rows = db
    .select()
    .from(schema.agentThoughts)
    .where(
      and(
        eq(schema.agentThoughts.worldId, worldId),
        inArray(schema.agentThoughts.characterId, characterIds),
      ),
    )
    .orderBy(desc(schema.agentThoughts.tick))
    .all();
  const out = new Map<string, AgentThought>();
  for (const r of rows) {
    if (out.has(r.characterId)) continue;
    out.set(r.characterId, {
      worldId: r.worldId,
      characterId: r.characterId,
      tick: r.tick,
      action: JSON.parse(r.actionJson) as Action,
      success: !!r.success,
      createdAt: r.createdAt.getTime(),
    });
  }
  return out;
}

export function persistSnapshot(loaded: LoadedWorld): void {
  const recentEvents = loadEventsSince(
    loaded.world.id,
    Math.max(0, loaded.world.currentTick - 24),
  );
  const snap: WorldSnapshot = {
    worldId: loaded.world.id,
    tick: loaded.world.currentTick,
    nodes: loaded.nodes,
    characters: loaded.characters,
    recentEvents,
  };
  db
    .insert(schema.snapshots)
    .values({
      id: `snap-${loaded.world.id}-${loaded.world.currentTick}-${randomUUID().slice(0, 8)}`,
      worldId: loaded.world.id,
      tick: loaded.world.currentTick,
      payloadJson: JSON.stringify(snap),
    })
    .run();
  log.info("snapshot 写入", {
    world: loaded.world.id,
    tick: loaded.world.currentTick,
  });
}
