/**
 * 种子脚本：从 configs/ 读取地图与角色，创建一个演示世界。
 *
 * 用法：`npm run seed`
 *
 * 安全设计：仅删除目标世界（级联清除其 nodes/characters/events/snapshots/thoughts），
 * 不动 llm_providers 表。重复运行安全。
 * 如果 DB 文件不存在会自动 migrate。
 */
import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { createWorldFromConfig, type CastMember } from "@/engine/createWorld";

const WORLD_ID = "world-yu-no-tani";
const MAP_ID = "yu-no-tani";

const CAST: CastMember[] = [
  { characterId: "char-yumori-kosuke", locationId: "node-inn" },
  { characterId: "char-yumori-ayako", locationId: "node-inn" },
  { characterId: "char-wakamatsu-naoki", locationId: "node-inn" },
  { characterId: "char-ogawa-misaki", locationId: "node-inn" },
  { characterId: "char-tanimura-kinuyo", locationId: "node-store-quarters" },
  { characterId: "char-matsuoka-sayo", locationId: "node-izakaya" },
  { characterId: "char-shiraishi-aoi", locationId: "node-studio" },
  { characterId: "char-guji-san", locationId: "node-shrine" },
  { characterId: "char-nogami-prof", locationId: "node-geologist-cabin" },
  { characterId: "char-tazaki-mamoru", locationId: "node-public-bath" },
  { characterId: "char-sato-haru", locationId: "node-old-house" },
  { characterId: "char-yoshida-driver", locationId: "node-bus-stop" },
  { characterId: "char-yamane-kazuma", locationId: "node-hunter-hut" },
];

function main() {
  db.delete(schema.worlds).where(eq(schema.worlds.id, WORLD_ID)).run();

  const r = createWorldFromConfig({
    worldId: WORLD_ID,
    name: "汤之谷",
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
