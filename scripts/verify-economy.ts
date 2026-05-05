/**
 * 2 日经济验证脚本：seed 世界 → 用启发式决策跑 240 tick → 输出经济状态
 *
 * 使用确定性启发式代替 LLM 决策，机械验证经济公式的正确性。
 * 用法：npx tsx scripts/verify-economy.ts
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { createWorldFromConfig, type CastMember } from "@/engine/createWorld";
import { tick, type DecideFn, type DecideInput } from "@/engine/tick";
import { TICKS_PER_HOUR } from "@/domain/enums";
import type { Action } from "@/domain/types";

const WORLD_ID = "world-economy-test";
const MAP_ID = "yu-no-tani";

const CAST: CastMember[] = [
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
  { characterId: "char-shiraishi-aoi", locationId: "node-pottery-quarters" },
  { characterId: "char-nogami-takashi", locationId: "node-annex-quarters" },
];

const TOTAL_TICKS = 240;

function heuristicDecide(input: DecideInput): Promise<Action> {
  const { character: c, here, reachable, tick, facts, options } = input;
  const hour = Math.floor(tick / TICKS_PER_HOUR) % 24;
  const isSleepHour = hour >= 22 || hour <= 7;
  const isWorkHour = hour >= 8 && hour <= 17;

  const wait: Action = {
    type: "wait", actorId: c.id, reasoning: "heuristic: wait",
    selfImportance: 1, skipExecution: false,
  };

  const think: Action = {
    type: "think", actorId: c.id, reasoning: "heuristic: think",
    selfImportance: 1, skipExecution: false,
  };

  const atPrivate = here.privacy === "private" || here.tags.includes("residence");

  // 0. GO HOME: sleep hour but not at rest location → move home
  if (isSleepHour && !atPrivate && facts.restNodeId) {
    for (const node of reachable) {
      if (node.id === facts.restNodeId) {
        return Promise.resolve({
          type: "move", actorId: c.id,
          reasoning: "heuristic: sleep hour, go home",
          targetNodeId: node.id,
          selfImportance: 3, skipExecution: false,
        });
      }
    }
  }

  // 0b. PRE-SLEEP: approaching sleep time, head home before exhaustion
  if (hour >= 20 && !atPrivate && c.vitals.fatigue >= 4 && facts.restNodeId) {
    for (const node of reachable) {
      if (node.id === facts.restNodeId) {
        return Promise.resolve({
          type: "move", actorId: c.id,
          reasoning: "heuristic: evening, head home",
          targetNodeId: node.id,
          selfImportance: 3, skipExecution: false,
        });
      }
    }
  }

  // 1. Sleep: at private/residence node during sleep hours when tired
  if (c.vitals.fatigue >= 4 && isSleepHour && atPrivate) {
    return Promise.resolve({
      type: "sleep", actorId: c.id,
      reasoning: "heuristic: tired at sleep hour, go to sleep",
      selfImportance: 3, skipExecution: false,
    });
  }

  // 2. Eat: hungry at dining node
  if (c.vitals.hunger >= 7 && here.tags.includes("dining")) {
    const eatOpt = options.find(o => o.type === "eat");
    if (eatOpt) {
      return Promise.resolve({
        type: "eat", actorId: c.id,
        reasoning: `heuristic: hungry (${c.vitals.hunger}h), eat now`,
        selfImportance: 3, skipExecution: false,
      });
    }
  }

  // 3. Bathe: dirty at bathing node
  if (c.vitals.hygiene >= 10 && here.tags.includes("bathing")) {
    const batheOpt = options.find(o => o.type === "bathe");
    if (batheOpt) {
      return Promise.resolve({
        type: "bathe", actorId: c.id,
        reasoning: `heuristic: dirty (${c.vitals.hygiene}h), bathe now`,
        selfImportance: 3, skipExecution: false,
      });
    }
  }

  // 4. Work: at activity node during work hours (cap 4 sessions/day)
  const workCountToday = facts.todayActionCounts?.work ?? 0;
  if (isWorkHour && c.incomeLevel > 0 && facts.activityNodeId &&
      here.id === facts.activityNodeId && workCountToday < 4) {
    const workOpt = options.find(o => o.type === "work");
    if (workOpt) {
      return Promise.resolve({
        type: "work", actorId: c.id,
        reasoning: `heuristic: work hours (session ${workCountToday + 1}/4)`,
        selfImportance: 2, skipExecution: false,
      });
    }
  }

  // 5. Move to dining when hungry
  if (c.vitals.hunger >= 7) {
    for (const node of reachable) {
      if (node.tags.includes("dining")) {
        return Promise.resolve({
          type: "move", actorId: c.id,
          reasoning: "heuristic: hungry, go eat",
          targetNodeId: node.id,
          selfImportance: 3, skipExecution: false,
        });
      }
    }
  }

  // 6. Move to bathing when dirty
  if (c.vitals.hygiene >= 10) {
    for (const node of reachable) {
      if (node.tags.includes("bathing")) {
        return Promise.resolve({
          type: "move", actorId: c.id,
          reasoning: "heuristic: dirty, go bathe",
          targetNodeId: node.id,
          selfImportance: 3, skipExecution: false,
        });
      }
    }
  }

  // 7. Move to activity node when work hours and not there (respect work cap)
  const workDone = facts.todayActionCounts?.work ?? 0;
  if (isWorkHour && c.incomeLevel > 0 && facts.activityNodeId &&
      here.id !== facts.activityNodeId && workDone < 4) {
    for (const node of reachable) {
      if (node.id === facts.activityNodeId) {
        return Promise.resolve({
          type: "move", actorId: c.id,
          reasoning: "heuristic: go to work",
          targetNodeId: node.id,
          selfImportance: 2, skipExecution: false,
        });
      }
    }
  }

  // 8. Move to rest node when very tired (daytime emergency)
  if (c.vitals.fatigue >= 14 && facts.restNodeId && here.id !== facts.restNodeId) {
    for (const node of reachable) {
      if (node.id === facts.restNodeId) {
        return Promise.resolve({
          type: "move", actorId: c.id,
          reasoning: "heuristic: exhausted, go rest immediately",
          targetNodeId: node.id,
          selfImportance: 4, skipExecution: false,
        });
      }
    }
  }

  return Promise.resolve(think);
}

function printEconomy(chars: any[], initial?: any[]) {
  const initMap = new Map(initial?.map(c => [c.id, c]) ?? []);
  for (const c of chars) {
    const init = initMap.get(c.id);
    const moneyStr = init ? `$${init.money} → $${c.money}` : `$${c.money}`;
    const delta = init ? c.money - init.money : 0;
    const sign = delta >= 0 ? "+" : "";
    const exempt = c.expenseExempt ? " [免单]" : "";
    console.log(`  ${c.name.padEnd(6)} (${(c.profession as string).padEnd(12)} tier=${c.incomeLevel}): ${moneyStr} (${sign}${delta})${exempt}`);
  }
}

async function main() {
  // 1. Seed
  console.log("=== Seeding world ===");
  db.delete(schema.worlds).where(eq(schema.worlds.id, WORLD_ID)).run();
  const r = createWorldFromConfig({ worldId: WORLD_ID, name: "经济测试", mapId: MAP_ID, cast: CAST });
  console.log(`World: ${r.worldId}, characters: ${r.characterIds.length}`);

  const initialChars = db.select().from(schema.characters).where(eq(schema.characters.worldId, WORLD_ID)).all();
  console.log("\n=== Initial economy ===");
  printEconomy(initialChars);

  // 2. Run ticks with heuristic decide
  console.log(`\n=== Running ${TOTAL_TICKS} ticks (2 game days) ===`);
  const actionStats: Record<string, number> = {};

  for (let i = 0; i < TOTAL_TICKS; i++) {
    const result = await tick(WORLD_ID, { decide: heuristicDecide });
    for (const d of result.decisions) {
      const t = d.success ? d.action.type : `FAIL:${d.action.type}`;
      actionStats[t] = (actionStats[t] ?? 0) + 1;
    }

    if (i % 60 === 0 || i === TOTAL_TICKS - 1) {
      const hour = Math.floor(result.toTick / TICKS_PER_HOUR) % 24;
      const day = Math.floor(result.toTick / (24 * TICKS_PER_HOUR)) + 1;
      console.log(`  tick ${result.toTick} (day ${day}, hour ${hour}): ${result.decisions.length} decisions`);
    }
  }

  // 3. Final state
  console.log("\n=== Final economy ===");
  const finalChars = db.select().from(schema.characters).where(eq(schema.characters.worldId, WORLD_ID)).all();
  printEconomy(finalChars, initialChars);

  // 4. Action distribution
  console.log("\n=== Action distribution ===");
  const sorted = Object.entries(actionStats).sort((a, b) => b[1] - a[1]);
  for (const [action, count] of sorted) {
    console.log(`  ${action}: ${count}`);
  }

  // 5. Transaction summary
  console.log("\n=== Transaction summary ===");
  const txns = db.select().from(schema.transactions).where(eq(schema.transactions.worldId, WORLD_ID)).all();
  const byChar: Record<string, { income: number; expense: number; eatCount: number; batheCount: number; workCount: number }> = {};
  for (const t of txns) {
    if (!byChar[t.characterId]) byChar[t.characterId] = { income: 0, expense: 0, eatCount: 0, batheCount: 0, workCount: 0 };
    if (t.amount > 0) {
      byChar[t.characterId].income += t.amount;
      if (t.category === "income") byChar[t.characterId].workCount++;
    } else {
      byChar[t.characterId].expense += -t.amount;
      if (t.description === "eat") byChar[t.characterId].eatCount++;
      if (t.description === "bathe") byChar[t.characterId].batheCount++;
    }
  }
  for (const [charId, s] of Object.entries(byChar)) {
    const fc = finalChars.find(c => c.id === charId);
    const name = (fc?.name ?? charId).padEnd(6);
    const net = s.income - s.expense;
    const sign = net >= 0 ? "+" : "";
    console.log(`  ${name}: +${s.income} -${s.expense} = ${sign}${net} | eat×${s.eatCount} bathe×${s.batheCount} work×${s.workCount}`);
  }

  // 6. Final vitals
  console.log("\n=== Final vitals ===");
  for (const c of finalChars) {
    const v = JSON.parse(c.vitalsJson as string);
    const e = JSON.parse(c.emotionJson as string);
    console.log(`  ${(c.name as string).padEnd(6)}: hunger=${String(v.hunger).padStart(2)} fatigue=${String(v.fatigue).padStart(2)} hygiene=${String(v.hygiene).padStart(2)} mood=${String(e.mood).padStart(2)} money=$${c.money}`);
  }

  // 7. Any NPCs broke?
  const broke = finalChars.filter(c => !c.expenseExempt && c.money <= 0);
  if (broke.length > 0) {
    console.log(`\n⚠️  BROKE NPCs: ${broke.map(c => c.name).join(", ")}`);
  } else {
    console.log("\n✅ No NPCs broke!");
  }

  // 8. Cleanup
  db.delete(schema.worlds).where(eq(schema.worlds.id, WORLD_ID)).run();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error("Script failed:", e);
  process.exit(1);
});
