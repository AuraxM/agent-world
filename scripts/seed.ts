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
  // --- 本地人 (15) ---
  { characterId: "char-yumori-kosuke", locationId: "node-ryokan-quarters" },
  { characterId: "char-ogawa-saori", locationId: "node-ryokan-quarters" },
  { characterId: "char-nakamura-yuto", locationId: "node-cafe-quarters" },
  { characterId: "char-yamada-takafumi", locationId: "node-carpenter-house" },
  { characterId: "char-tanimura-kinuyo", locationId: "node-store-quarters" },
  { characterId: "char-matsuoka-sayo", locationId: "node-izakaya-quarters" },
  { characterId: "char-suzuki-kazuo", locationId: "node-souvenir-shop-quarters" },
  { characterId: "char-tanaka-yayoi", locationId: "node-tailor-quarters" },
  { characterId: "char-tazaki-mamoru", locationId: "node-caretaker-house" },
  { characterId: "char-sato-haru", locationId: "node-old-house" },
  { characterId: "char-guji-masayuki", locationId: "node-priest-house" },
  { characterId: "char-kishita-michiko", locationId: "node-clinic-quarters" },
  { characterId: "char-yoshida-eiichi", locationId: "node-bus-stop" },
  { characterId: "char-okubo-kenta", locationId: "node-farmhouse" },
  { characterId: "char-okubo-miwa", locationId: "node-farmhouse" },
  // --- 外来客 (2, 已融入) ---
  { characterId: "char-shiraishi-aoi", locationId: "node-pottery-quarters" },
  { characterId: "char-nogami-takashi", locationId: "node-annex-quarters" },
  // 候选池 (mid-game 投放): char-wakamatsu-ren, char-takahashi-ema, char-yamane-kazuma
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
