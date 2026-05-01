/**
 * 用配置文件实例化一个新世界。
 *
 * - 地图来自 `configs/maps/<mapId>.json`，角色来自 `configs/characters/`。
 * - cast 列表挑选要加入的角色；位置缺省时落在地图首个 `isEntry` 节点。
 * - 同步写入 worlds / nodes / characters；存在同 worldId 时直接抛错。
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import {
  firstEntryNodeId,
  loadCharacter,
  loadMap,
} from "@/config/loader";
import type { Vitals } from "@/domain/types";

export interface CastMember {
  /** 必须能在 configs/characters 解析。 */
  characterId: string;
  /** 可选；缺省时取地图首个 entry 节点。 */
  locationId?: string;
  /** 可选；覆盖默认 hunger/fatigue。 */
  vitals?: Partial<Vitals>;
}

export interface CreateWorldInput {
  worldId: string;
  name: string;
  mapId: string;
  cast: CastMember[];
}

export interface CreateWorldResult {
  worldId: string;
  mapId: string;
  characterIds: string[];
  defaultEntryNodeId: string;
}

export function createWorldFromConfig(
  input: CreateWorldInput,
): CreateWorldResult {
  const { worldId, name, mapId, cast } = input;
  if (!worldId) throw new Error("worldId required");
  if (!name) throw new Error("name required");

  // 1. 加载并校验配置
  const map = loadMap(mapId);
  const defaultEntry = firstEntryNodeId(map);
  const nodeIds = new Set(map.nodes.map((n) => n.id));

  // 2. 校验 cast：id 唯一、模板存在、locationId 命中此地图
  const seen = new Set<string>();
  const resolved = cast.map((m) => {
    if (seen.has(m.characterId)) {
      throw new Error(`duplicate cast member: ${m.characterId}`);
    }
    seen.add(m.characterId);
    const tpl = loadCharacter(m.characterId);
    const loc = m.locationId ?? defaultEntry;
    if (!nodeIds.has(loc)) {
      throw new Error(
        `cast member ${m.characterId} locationId not in map ${mapId}: ${loc}`,
      );
    }
    return { tpl, locationId: loc, vitals: m.vitals };
  });

  // 3. 拒绝重复世界
  const existing = db
    .select({ id: schema.worlds.id })
    .from(schema.worlds)
    .where(eq(schema.worlds.id, worldId))
    .get();
  if (existing) {
    throw new Error(`world already exists: ${worldId}`);
  }

  // 4. 事务写入
  const now = new Date();
  db.transaction((tx) => {
    tx.insert(schema.worlds)
      .values({
        id: worldId,
        name,
        currentTick: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    for (const n of map.nodes) {
      tx.insert(schema.nodes)
        .values({
          id: n.id,
          worldId,
          parentId: n.parentId,
          name: n.name,
          description: n.description,
          tagsJson: JSON.stringify(n.tags),
          capacity: n.capacity,
          privacy: n.privacy,
          visibleFromParent: n.visibleFromParent,
          shortcutsJson: JSON.stringify(n.shortcuts),
          isEntry: n.isEntry,
          x: n.x ?? null,
          y: n.y ?? null,
          w: n.w ?? null,
          h: n.h ?? null,
          spriteKey: n.spriteKey ?? null,
          createdAt: now,
        })
        .run();
    }

    for (const m of resolved) {
      const vitals: Vitals = {
        hunger: m.vitals?.hunger ?? 0,
        fatigue: m.vitals?.fatigue ?? 0,
      };
      tx.insert(schema.characters)
        .values({
          id: m.tpl.id,
          worldId,
          name: m.tpl.name,
          avatar: m.tpl.avatar ?? null,
          locationId: m.locationId,
          personalityJson: JSON.stringify(m.tpl.personality),
          vitalsJson: JSON.stringify(vitals),
          statusesJson: JSON.stringify(m.tpl.statuses),
          abilitiesJson: JSON.stringify(m.tpl.abilities),
          shortMemoryJson: "[]",
          longMemoryJson: "[]",
          relationsJson: JSON.stringify(m.tpl.relations),
          currentActionJson: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
  });

  return {
    worldId,
    mapId,
    characterIds: resolved.map((r) => r.tpl.id),
    defaultEntryNodeId: defaultEntry,
  };
}
