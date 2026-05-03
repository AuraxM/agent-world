/**
 * 观测脚本：本地启发式决策跑 48 tick（两轮 24h），打印每个 NPC 的作息曲线
 * 与汇总指标，验证 vitals/emotion/作息系统改动后的实际行为。
 *
 * 用法：tsx scripts/observe-circadian.ts
 *
 * 决策规则（无 LLM）：
 *   - 优先选 ⭐ 推荐项；其次按 type 优先级（sleep > nap > eat > bathe > rest > 移动 > ...）
 *   - 没有 ⭐ 时尽量避开 wait（除非可选项只剩 wait）
 *
 * 输出：
 *   1. 每个 NPC 的逐 tick 表（时间/行动/位置/fatigue/hunger/mood）
 *   2. 汇总：行动频次、最大 fatigue、顶值惩罚累计 tick、是否在自己作息窗口内 sleep
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { createWorldFromConfig, type CastMember } from "@/engine/createWorld";
import { tick, type DecideFn } from "@/engine/tick";
import { loadWorld } from "@/engine/store";
import { loadAllCharacters } from "@/config/loader";
import {
  DEFAULT_SLEEP_WINDOW,
  formatSleepWindow,
  inSleepWindow,
} from "@/llm/prompt";
import type { Action } from "@/domain/types";
import { TICKS_PER_HOUR } from "@/domain/enums";

const WORLD_ID = "world-observe-circadian";
const MAP_ID = "moon-valley";
const TICKS = 48 * TICKS_PER_HOUR;

const CAST: CastMember[] = [
  { characterId: "char-tanaka-daichi", locationId: "node-farmhouse" },
  { characterId: "char-tanaka-hana", locationId: "node-farmhouse" },
  { characterId: "char-tanaka-yota", locationId: "node-farmhouse" },
  { characterId: "char-suzuki-misaki", locationId: "node-ranch-house" },
  { characterId: "char-suzuki-kotone", locationId: "node-ranch-house" },
  { characterId: "char-yamada-ryuichi", locationId: "node-fisher-hut" },
  { characterId: "char-genjo", locationId: "node-wizard-tower" },
  { characterId: "char-nakamura-shizuka", locationId: "node-izakaya-quarters" },
  { characterId: "char-takahashi-tetsuya", locationId: "node-blacksmith-quarters" },
  { characterId: "char-ito-chie", locationId: "node-general-store-quarters" },
  { characterId: "char-saito-ishi", locationId: "node-doctor-house" },
  { characterId: "char-kimura-fumiko", locationId: "node-library-quarters" },
];

const TYPE_PRIORITY: Record<string, number> = {
  sleep: 100,
  nap: 95,
  eat: 92,
  bathe: 88,
  rest: 80,
  move: 70,
  groom: 50,
  meditate: 45,
  work: 30,
  read: 28,
  exercise: 25,
  write: 22,
  observe: 12,
  pace: 10,
  speak: 8,
  interact_object: 5,
  use_ability: 5,
  wait: 1,
};

const heuristicDecide: DecideFn = async (input) => {
  const { character: c, options, tick: t } = input;
  const pickByPriority = (opts: typeof options) => {
    let best = opts[0];
    let bestScore = -1;
    for (const o of opts) {
      const s = TYPE_PRIORITY[o.type] ?? 0;
      if (s > bestScore) {
        bestScore = s;
        best = o;
      }
    }
    return best;
  };
  const findOf = (type: string) => options.find((o) => o.type === type);

  // 模拟"理性 LLM"决策树：
  // 1. 已到作息窗口 + 在家 → sleep
  // 2. 严重饥饿且能吃 → eat
  // 3. 严重肮脏且能洗 → bathe
  // 4. fatigue >= 12 + 在家 → nap
  // 5. 渴/饿/累但当前不在合适场所 → ⭐ move（回家或去 dining）
  // 6. 否则按 ⭐ + type 优先级
  let chosen: (typeof options)[number] | undefined;
  const sleepOpt = findOf("sleep");
  const eatOpt = findOf("eat");
  const batheOpt = findOf("bathe");
  const napOpt = findOf("nap");

  if (sleepOpt) {
    chosen = sleepOpt; // 窗口内一定睡
  } else if (c.vitals.hunger >= 5 && eatOpt) {
    chosen = eatOpt;
  } else if (c.vitals.hygiene >= 8 && batheOpt) {
    chosen = batheOpt;
  } else if (c.vitals.fatigue >= 12 && napOpt) {
    chosen = napOpt;
  } else {
    // 没紧急需求时，排除所有"需求驱动"类（sleep/nap/rest/eat/bathe/groom）——
    // 它们只该被硬规则触发；fallback 选"日常活动"（work/read/exercise/...）。
    // 同时排除 fallback move：⭐ move 已在前面被 starred 分支接住；fallback 选 move
    // 会把 NPC 无理由赶出家、卡在公共节点上。
    const dailyOpts = options.filter(
      (o) =>
        o.type !== "wait" &&
        o.type !== "sleep" &&
        o.type !== "nap" &&
        o.type !== "rest" &&
        o.type !== "eat" &&
        o.type !== "bathe" &&
        o.type !== "groom" &&
        o.type !== "move",
    );
    const starred = dailyOpts.filter((o) => o.hint.includes("⭐"));
    chosen = starred.length > 0
      ? pickByPriority(starred)
      : pickByPriority(dailyOpts);
    if (!chosen) chosen = options.find((o) => o.type === "wait") ?? options[0];
  }

  const action: Action = {
    type: chosen.type,
    actorId: c.id,
    targetId: chosen.targetId,
    targetNodeId: chosen.targetNodeId,
    reasoning: `[heuristic] hour=${t % 24} fatigue=${c.vitals.fatigue} hunger=${c.vitals.hunger}`,
    selfImportance: 1,
  };
  return action;
};

interface TraceRow {
  tick: number;
  hour: number;
  charId: string;
  charName: string;
  action: string;
  ok: boolean;
  loc: string;
  fatigue: number;
  hunger: number;
  hygiene: number;
  mood: number;
  fatigueCap: number;
  hungerCap: number;
}

async function main() {
  console.log(`Resetting world ${WORLD_ID}...`);
  db.delete(schema.worlds).where(eq(schema.worlds.id, WORLD_ID)).run();
  createWorldFromConfig({
    worldId: WORLD_ID,
    name: "观测·月之谷",
    mapId: MAP_ID,
    cast: CAST,
  });

  const sleepWindowMap = new Map<string, { start: number; duration: number }>();
  for (const tpl of loadAllCharacters()) {
    if (tpl.sleepWindow) sleepWindowMap.set(tpl.id, tpl.sleepWindow);
  }

  const trace: TraceRow[] = [];
  for (let i = 0; i < TICKS; i++) {
    const r = await tick(WORLD_ID, { decide: heuristicDecide });
    const w = loadWorld(WORLD_ID);
    for (const c of w.characters) {
      const dec = r.decisions.find((d) => d.characterId === c.id);
      const node = w.nodes.find((n) => n.id === c.locationId);
      trace.push({
        tick: r.fromTick,
        hour: Math.floor(r.fromTick / TICKS_PER_HOUR) % 24,
        charId: c.id,
        charName: c.name,
        action: dec?.action.type ?? "?",
        ok: dec?.success ?? false,
        loc: node?.name ?? c.locationId,
        fatigue: c.vitals.fatigue,
        hunger: c.vitals.hunger,
        hygiene: c.vitals.hygiene,
        mood: c.emotion.mood,
        fatigueCap: c.vitals.fatigueCapTicks ?? 0,
        hungerCap: c.vitals.hungerCapTicks ?? 0,
      });
    }
  }

  // 按角色分组
  const byChar = new Map<string, TraceRow[]>();
  for (const r of trace) {
    const arr = byChar.get(r.charId) ?? [];
    arr.push(r);
    byChar.set(r.charId, arr);
  }

  // 1. 每角色逐 tick 表
  for (const [charId, rows] of byChar) {
    const win = sleepWindowMap.get(charId) ?? DEFAULT_SLEEP_WINDOW;
    const winText = formatSleepWindow(win);
    console.log(`\n=== ${rows[0].charName} (sleepWindow=${winText}) ===`);
    console.log("Day Hr  | Action       ok | Location          | fat hun hyg | mood capF capH");
    for (const r of rows) {
      const day = Math.floor(r.tick / (24 * TICKS_PER_HOUR));
      const inWin = inSleepWindow(r.hour, win) ? "*" : " ";
      console.log(
        `${day} ${String(r.hour).padStart(2, "0")}${inWin} | ${r.action.padEnd(13)}${r.ok ? "T" : "F"} | ${r.loc.padEnd(18)} | ${String(r.fatigue).padStart(2)} ${String(r.hunger).padStart(3)} ${String(r.hygiene).padStart(3)} | ${String(r.mood).padStart(3)} ${String(r.fatigueCap).padStart(3)} ${String(r.hungerCap).padStart(3)}`,
      );
    }
  }

  // 2. 汇总
  console.log("\n=== 汇总 ===");
  for (const [charId, rows] of byChar) {
    const win = sleepWindowMap.get(charId) ?? DEFAULT_SLEEP_WINDOW;
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.action] = (counts[r.action] ?? 0) + 1;

    const sleepRows = rows.filter((r) => r.action === "sleep");
    const napRows = rows.filter((r) => r.action === "nap");
    const sleepInWin = sleepRows.filter((r) => inSleepWindow(r.hour, win)).length;
    const sleepOutWin = sleepRows.length - sleepInWin;

    const maxF = Math.max(...rows.map((r) => r.fatigue));
    const maxH = Math.max(...rows.map((r) => r.hunger));
    const capPenaltyTicks = rows.filter((r) => r.fatigueCap >= 4 || r.hungerCap >= 4).length;
    const minMood = Math.min(...rows.map((r) => r.mood));

    const sortedActions = Object.entries(counts).sort(([, a], [, b]) => b - a);
    const topActions = sortedActions.slice(0, 5).map(([k, v]) => `${k}:${v}`).join(" ");

    console.log(
      `${rows[0].charName.padEnd(8)} ${formatSleepWindow(win)} | sleep ${sleepRows.length}(in:${sleepInWin}/out:${sleepOutWin}) nap ${napRows.length} | maxF=${maxF} maxH=${maxH} minMood=${minMood} capPenaltyTicks=${capPenaltyTicks} | top: ${topActions}`,
    );
  }

  // 3. 整体观察
  const totalCap = trace.filter((r) => r.fatigueCap >= 4 || r.hungerCap >= 4).length;
  const totalSleepOutWin = Array.from(byChar.entries()).reduce((acc, [charId, rows]) => {
    const win = sleepWindowMap.get(charId) ?? DEFAULT_SLEEP_WINDOW;
    return acc + rows.filter((r) => r.action === "sleep" && !inSleepWindow(r.hour, win)).length;
  }, 0);
  console.log(`\n全局: 总惩罚态 tick=${totalCap}; 跨窗口 sleep 次数=${totalSleepOutWin}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
