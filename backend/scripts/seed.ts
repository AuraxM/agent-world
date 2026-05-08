/**
 * 种子脚本：从 scenes/ 读取地图与角色，创建一个演示世界。
 *
 * 用法：`npm run seed`
 *
 * 安全设计：仅删除目标世界（级联清除其 nodes/characters/events/snapshots/thoughts），
 * 不动 llm_providers 表。重复运行安全。
 * 如果 DB 文件不存在会自动 migrate。
 */
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db/index";
import { createWorldFromConfig, type CastMember } from "../src/systems/index";

const WORLD_ID = "world-sakuradai";
const MAP_ID = "sakuradai-high-school";

const CAST: CastMember[] = [
  // --- 教职员工 (4) ---
  { characterId: "char-moriyama-kenichi", locationId: "node-classroom-2a" },
  { characterId: "char-oki-yoko", locationId: "node-sakuradai-clinic" },
  { characterId: "char-kitagawa-shizuka", locationId: "node-library" },
  { characterId: "char-yoshida-genji", locationId: "node-school-building-1f" },
  // --- 小镇居民 (6) ---
  { characterId: "char-matsushita-kohei", locationId: "node-bakery" },
  { characterId: "char-kimura-takashi", locationId: "node-ramen-shop" },
  { characterId: "char-tanabe-master", locationId: "node-pure-cafe" },
  { characterId: "char-fujiwara-sensei", locationId: "node-sakuradai-clinic" },
  { characterId: "char-inagaki-guji", locationId: "node-sakuradai-shrine" },
  { characterId: "char-ishii-mayu", locationId: "node-convenience-store" },
  // --- 三年级 (5) ---
  { characterId: "char-tanaka-kakeru", locationId: "node-classroom-3a" },
  { characterId: "char-sato-mafu", locationId: "node-club-student-council" },
  { characterId: "char-takahashi-ren", locationId: "node-club-art" },
  { characterId: "char-suzuki-kanon", locationId: "node-club-brass" },
  { characterId: "char-yamada-kaito", locationId: "node-classroom-3a" },
  // --- 二年级 (6) ---
  { characterId: "char-nakamura-yui", locationId: "node-library" },
  { characterId: "char-kobayashi-hayate", locationId: "node-sports-ground" },
  { characterId: "char-ito-kotomi", locationId: "node-classroom-2a" },
  { characterId: "char-watanabe-daichi", locationId: "node-game-center" },
  { characterId: "char-saito-sakura", locationId: "node-classroom-2a" },
  { characterId: "char-matsumoto-riku", locationId: "node-club-literature" },
  // --- 一年级 (4) ---
  { characterId: "char-takahashi-mio", locationId: "node-classroom-1a" },
  { characterId: "char-ito-haruto", locationId: "node-gymnasium" },
  { characterId: "char-nakamura-kaede", locationId: "node-club-art" },
  { characterId: "char-yoshida-yuki", locationId: "node-club-brass" },
];

function main() {
  db.delete(schema.worlds).where(eq(schema.worlds.id, WORLD_ID)).run();

  const r = createWorldFromConfig({
    worldId: WORLD_ID,
    name: "桜台高校",
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
