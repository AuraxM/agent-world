/**
 * 在已有世界中投放一名新角色。
 *
 * - 使用 configs/characters 里的模板。
 * - 默认落点为该世界第一个 `is_entry=1` 节点；可通过 entryNodeId 显式指定。
 * - 写入后追加一条 system 来源的 social 事件，让现场 NPC 通过既有 perception
 *   流程感知到「有人来了」。
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { loadCharacter } from "@/config/loader";
import { appendEventsLog } from "./store";
import type { Emotion, Vitals, WorldEvent } from "@/domain/types";

export interface AddCharacterInput {
  worldId: string;
  characterId: string;
  /** 可选；缺省时取该世界首个 entry 节点。 */
  entryNodeId?: string;
  /** 可选；覆盖 hunger / fatigue / hygiene 默认值。 */
  vitals?: Partial<Vitals>;
  /** 可选；覆盖 mood / stress / social_satiety 默认值。 */
  emotion?: Partial<Emotion>;
}

export interface AddCharacterResult {
  worldId: string;
  characterId: string;
  entryNodeId: string;
  eventId: string;
  name: string;
}

export function addCharacterToWorld(
  input: AddCharacterInput,
): AddCharacterResult {
  const { worldId, characterId } = input;

  // 1. 世界存在性
  const world = db
    .select()
    .from(schema.worlds)
    .where(eq(schema.worlds.id, worldId))
    .get();
  if (!world) throw new Error(`world not found: ${worldId}`);

  // 2. 角色模板存在性
  const tpl = loadCharacter(characterId);

  // 3. 角色尚未存在
  const existing = db
    .select({ id: schema.characters.id })
    .from(schema.characters)
    .where(
      and(
        eq(schema.characters.worldId, worldId),
        eq(schema.characters.id, characterId),
      ),
    )
    .get();
  if (existing) {
    throw new Error(
      `character already in world: ${worldId}/${characterId}`,
    );
  }

  // 4. 解析落点：显式 > 角色休息处 > 世界 entry。
  // 默认落点改为角色的 restNodeId（若该节点存在于世界），避免新角色一上来就被
  // 卡在车站、必须先长途回家——会把作息从第一天就打乱。
  let entryNodeId = input.entryNodeId;
  if (entryNodeId) {
    const node = db
      .select({ id: schema.nodes.id })
      .from(schema.nodes)
      .where(
        and(
          eq(schema.nodes.worldId, worldId),
          eq(schema.nodes.id, entryNodeId),
        ),
      )
      .get();
    if (!node) {
      throw new Error(
        `entry node not in world: ${worldId}/${entryNodeId}`,
      );
    }
  } else if (tpl.restNodeId) {
    const home = db
      .select({ id: schema.nodes.id })
      .from(schema.nodes)
      .where(
        and(
          eq(schema.nodes.worldId, worldId),
          eq(schema.nodes.id, tpl.restNodeId),
        ),
      )
      .get();
    if (home) {
      entryNodeId = home.id;
    }
  }
  if (!entryNodeId) {
    const entry = db
      .select({ id: schema.nodes.id })
      .from(schema.nodes)
      .where(
        and(
          eq(schema.nodes.worldId, worldId),
          eq(schema.nodes.isEntry, true),
        ),
      )
      .orderBy(schema.nodes.createdAt, schema.nodes.id)
      .get();
    if (!entry) {
      throw new Error(`world has no entry node: ${worldId}`);
    }
    entryNodeId = entry.id;
  }

  // 5. 写入 + 抵达事件
  const now = new Date();
  const vitals: Vitals = {
    hunger: input.vitals?.hunger ?? (tpl.origin === "visitor" ? 1 : 0),
    fatigue: input.vitals?.fatigue ?? (tpl.origin === "visitor" ? 2 : 0),
    hygiene: input.vitals?.hygiene ?? 0,
  };
  const emotion: Emotion = {
    mood: input.emotion?.mood ?? 0,
    stress: input.emotion?.stress ?? 0,
    social_satiety: input.emotion?.social_satiety ?? 0,
  };
  const event: WorldEvent = {
    id: `evt-arrival-${randomUUID().slice(0, 8)}`,
    worldId,
    tick: world.currentTick,
    category: "social",
    description: `${tpl.name} 出现在了入口处。`,
    participants: [characterId],
    source: "system",
    intensity: 2,
    scope: "node",
    nodeId: entryNodeId,
    duration: 1,
  };

  db.transaction((tx) => {
    tx.insert(schema.characters)
      .values({
        id: tpl.id,
        worldId,
        name: tpl.name,
        avatar: tpl.avatar ?? null,
        age: tpl.age,
        gender: tpl.gender,
        profession: tpl.profession,
        biography: tpl.biography,
        origin: tpl.origin,
        locationId: entryNodeId!,
        personalityJson: JSON.stringify(tpl.personality),
        vitalsJson: JSON.stringify(vitals),
        emotionJson: JSON.stringify(emotion),
        abilitiesJson: JSON.stringify(tpl.abilities),
        shortMemoryJson: "[]",
        longMemoryJson: "[]",
        relationsJson: JSON.stringify(tpl.relations),
        currentActionJson: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });
  appendEventsLog(worldId, [event]);

  return {
    worldId,
    characterId,
    entryNodeId,
    eventId: event.id,
    name: tpl.name,
  };
}
