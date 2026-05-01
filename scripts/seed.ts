/**
 * 种子脚本：从 `configs/` 读取地图与角色，创建一个 morning-town 演示世界。
 *
 * 用法：`npm run seed`。
 * 重复运行安全：先级联删除同名世界，再重新写入。
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { createWorldFromConfig, type CastMember } from "@/engine/createWorld";

const WORLD_ID = "world-morning-town";
const MAP_ID = "morning-town";

const CAST: CastMember[] = [
  { characterId: "char-zhangmo", locationId: "node-zhang-home" },
  { characterId: "char-lihuan", locationId: "node-lihuan-home" },
  {
    characterId: "char-wanggang",
    locationId: "node-wanggang-home",
    vitals: { hunger: 3 },
  },
  { characterId: "char-xiaojing", locationId: "node-li-home" },
  {
    characterId: "char-laoli",
    locationId: "node-li-home",
    vitals: { fatigue: 6 },
  },
];

function main() {
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
