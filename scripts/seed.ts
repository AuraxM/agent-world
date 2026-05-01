/**
 * 种子脚本：从 `configs/` 读取地图与角色，创建一个演示世界。
 *
 * 用法：`npm run seed`。
 * 注意：旧的 5 个角色 + morning-town 地图配置已随角色系统重设计删除。
 *       运行前需先用 agent-world-config 技能（或手写）生成新的 JSON 配置。
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { createWorldFromConfig, type CastMember } from "@/engine/createWorld";

const WORLD_ID = "world-morning-town";
const MAP_ID = "morning-town";

/**
 * 待 agent-world-config 技能重新生成 configs 后填入。
 * 例：[{ characterId: "char-...", locationId: "node-..." }]
 */
const CAST: CastMember[] = [];

function main() {
  if (CAST.length === 0) {
    console.error(
      "No cast members defined. Regenerate configs with the agent-world-config skill (or hand-write JSON), then update CAST in scripts/seed.ts.",
    );
    process.exit(1);
  }

  // 级联删除（onDelete: cascade 会清掉 nodes/characters/events/snapshots/agent_thoughts）
  db.delete(schema.worlds).where(eq(schema.worlds.id, WORLD_ID)).run();

  const r = createWorldFromConfig({
    worldId: WORLD_ID,
    name: "晨曦小镇",
    mapId: MAP_ID,
    cast: CAST,
  });

  console.log(`✓ Seeded world "${r.worldId}" from map "${r.mapId}"`);
  console.log(`  characters: ${r.characterIds.length}`);
  console.log(`  default entry: ${r.defaultEntryNodeId}`);
}

try {
  main();
} catch (err) {
  console.error("seed failed:", err);
  process.exit(1);
}
