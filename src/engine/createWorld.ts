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
  loadManifest,
  loadMap,
  resolveIncomeLevel,
} from "@/config/loader";
import { GAME_EPOCH } from "@/app/_lib/format";
import type { Emotion, Vitals } from "@/domain/types";

/** 1 tick = 12 game minutes, in milliseconds */
const MS_PER_TICK = 12 * 60 * 1000;

/** Convert an ISO 8601 datetime string to tick offset from GAME_EPOCH. */
function dateToTick(dateStr: string): number {
  const target = new Date(dateStr);
  if (isNaN(target.getTime())) {
    throw new Error(`invalid startDate: ${dateStr}`);
  }
  const diffMs = target.getTime() - GAME_EPOCH.getTime();
  if (diffMs < 0) {
    throw new Error(
      `startDate must be at or after game epoch (${GAME_EPOCH.toISOString()})`,
    );
  }
  return Math.round(diffMs / MS_PER_TICK);
}

export interface CastMember {
  /** 必须能在 configs/characters 解析。 */
  characterId: string;
  /** 可选；缺省时取地图首个 entry 节点。 */
  locationId?: string;
  /** 可选；覆盖默认 hunger/fatigue/hygiene。 */
  vitals?: Partial<Vitals>;
  /** 可选；覆盖默认 mood/stress/social_satiety。 */
  emotion?: Partial<Emotion>;
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

  // 0. 从 manifest 读取初始时间
  const manifest = loadManifest(mapId);
  const initialTick = manifest.startDate ? dateToTick(manifest.startDate) : 0;

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
    let loc = m.locationId;
    if (!loc) {
      // Locals prefer their home node
      if (tpl.origin === "local" && tpl.restNodeId && nodeIds.has(tpl.restNodeId)) {
        loc = tpl.restNodeId;
      }
      // Visitors (or locals without restNodeId) fall back to entry
      if (!loc) {
        loc = defaultEntry;
      }
    }
    if (!nodeIds.has(loc)) {
      throw new Error(
        `cast member ${m.characterId} locationId not in map ${mapId}: ${loc}`,
      );
    }
    return { tpl, locationId: loc, vitals: m.vitals, emotion: m.emotion };
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
        mapId,
        currentTick: initialTick,
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
          travelCost: n.travelCost ?? null,
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
        hunger: m.vitals?.hunger ?? (m.tpl.origin === "visitor" ? 1 : 0),
        fatigue: m.vitals?.fatigue ?? (m.tpl.origin === "visitor" ? 2 : 0),
        hygiene: m.vitals?.hygiene ?? 0,
      };
      const emotion: Emotion = {
        mood: m.emotion?.mood ?? 0,
        stress: m.emotion?.stress ?? 0,
        social_satiety: m.emotion?.social_satiety ?? 0,
      };
      const initialMoney = m.tpl.initialMoney ?? (
        m.tpl.origin === "visitor" && m.tpl.profession === "unemployed" ? 3000 : 200
      );
      const expenseExempt = m.tpl.expenseExempt ?? (m.tpl.age < 18);
      // Minors get 0 income level regardless of profession
      const rawIncomeLevel = resolveIncomeLevel(m.tpl.profession);
      const incomeLevel = (m.tpl.age < 18) ? 0 : rawIncomeLevel;
      const incomeMultiplier = m.tpl.incomeMultiplier ?? 1.0;

      tx.insert(schema.characters)
        .values({
          id: m.tpl.id,
          worldId,
          name: m.tpl.name,
          avatar: m.tpl.avatar ?? null,
          age: m.tpl.age,
          gender: m.tpl.gender,
          profession: m.tpl.profession,
          money: initialMoney,
          incomeLevel,
          expenseExempt,
          incomeMultiplier,
          biography: m.tpl.biography,
          origin: m.tpl.origin,
          locationId: m.locationId,
          personalityJson: JSON.stringify(m.tpl.personality),
          vitalsJson: JSON.stringify(vitals),
          emotionJson: JSON.stringify(emotion),
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
