/**
 * Store layer — thin wrapper around @agw/db repositories that assembles
 * a fully-hydrated LoadedWorld (characters + nodes + recent thoughts +
 * notebook entries).
 *
 * Stage 1：每次 tick 全量加载该 world 的 nodes/characters/recent events，
 * 改完整体写回。规模够小（≤ 5 NPC），不必精细化 diff。
 */
import {
  getWorldOrThrow,
  findNodesByWorld,
  findCharactersByWorld,
  findLatestThoughts,
  findNotebookEntries,
  saveWorldMeta,
  saveAllCharacters,
  appendEvents as appendEventsRepo,
  findEventsSince as findEventsSinceRepo,
  appendThoughts as appendThoughtsRepo,
  findRecentThoughts as findRecentThoughtsRepo,
  createSnapshot,
} from "../db/index";
import type {
  Action,
  AgentThought,
  Character,
  MapNode,
  World,
  WorldEvent,
} from "../domain/index";
import { createLogger } from "../shared/index";

const log = createLogger("store");

export interface LoadedWorld {
  world: World;
  nodes: MapNode[];
  characters: Character[];
}

export function loadWorld(worldId: string): LoadedWorld {
  const world = getWorldOrThrow(worldId);

  const nodes = findNodesByWorld(worldId);
  const characters = findCharactersByWorld(worldId);

  if (characters.length > 0) {
    const latest = findLatestThoughts(
      worldId,
      characters.map((c) => c.id),
    );
    for (const c of characters) {
      const t = latest.get(c.id);
      if (t) c.lastThought = t;
    }
  }

  // Load notebook entries, filtering out expired ones
  const notebookMap = findNotebookEntries(worldId);
  for (const c of characters) {
    const entries = notebookMap.get(c.id) ?? [];
    c.notebook = entries.filter((e) => e.scheduledTick >= world.currentTick);
  }

  return { world, nodes, characters };
}

export function saveWorld(loaded: LoadedWorld): void {
  saveWorldMeta(loaded.world.id, loaded.world.mapId, loaded.world.currentTick);
  saveAllCharacters(loaded.characters);
  log.info("world 保存", {
    world: loaded.world.id,
    角色数: loaded.characters.length,
  });
}

export function appendEventsLog(
  worldId: string,
  events: WorldEvent[],
): void {
  appendEventsRepo(worldId, events);
}

export function loadEventsSince(
  worldId: string,
  sinceTick: number,
): WorldEvent[] {
  return findEventsSinceRepo(worldId, sinceTick);
}

export function appendThoughts(
  worldId: string,
  entries: Array<{ characterId: string; tick: number; action: Action; success: boolean }>,
): void {
  appendThoughtsRepo(worldId, entries);
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
  return findRecentThoughtsRepo(worldId, characterId, sinceTick);
}

/** 一次性返回 (worldId, characterIds) 范围内每人的最新一条 thought。 */
export function loadLatestThoughts(
  worldId: string,
  characterIds: string[],
): Map<string, AgentThought> {
  return findLatestThoughts(worldId, characterIds);
}

export function persistSnapshot(loaded: LoadedWorld): void {
  createSnapshot(
    loaded.world.id,
    loaded.world.currentTick,
    loaded.world.epoch,
    loaded.nodes,
    loaded.characters,
  );
  log.info("snapshot 写入", {
    world: loaded.world.id,
    tick: loaded.world.currentTick,
  });
}
