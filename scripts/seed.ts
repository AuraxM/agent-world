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

const WORLD_ID = "world-moon-valley";
const MAP_ID = "moon-valley";

const CAST: CastMember[] = [
  { characterId: "char-tanaka-daichi", locationId: "node-farmhouse" },
  { characterId: "char-tanaka-hana", locationId: "node-farmhouse" },
  { characterId: "char-tanaka-yota", locationId: "node-farmhouse" },
  { characterId: "char-suzuki-misaki", locationId: "node-ranch-house" },
  { characterId: "char-suzuki-kotone", locationId: "node-ranch-house" },
  { characterId: "char-yamada-ryuichi", locationId: "node-fisher-hut" },
  { characterId: "char-genjo", locationId: "node-wizard-tower" },
  { characterId: "char-nakamura-shizuka", locationId: "node-izakaya" },
  { characterId: "char-takahashi-tetsuya", locationId: "node-blacksmith" },
  { characterId: "char-ito-chie", locationId: "node-general-store" },
  { characterId: "char-saito-ishi", locationId: "node-doctor-house" },
  { characterId: "char-kimura-fumiko", locationId: "node-library" },
];

function main() {
  db.delete(schema.worlds).where(eq(schema.worlds.id, WORLD_ID)).run();

  const r = createWorldFromConfig({
    worldId: WORLD_ID,
    name: "月之谷",
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
