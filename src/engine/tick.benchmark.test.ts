/**
 * Tick 性能基准测试：测量不同角色数量下各阶段的耗时，定位非线性瓶颈。
 *
 * 用法: npx vitest run src/engine/tick.benchmark.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Action } from "@/domain/types";

let tickModule: typeof import("./tick");
let storeModule: typeof import("./store");
let dbModule: typeof import("@/db/client");

let tmpDir: string;
const WORLD_ID = "bench-world";

// ---- helpers ----

function makeTableSQL() {
  return [
    `CREATE TABLE IF NOT EXISTS worlds (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      map_id TEXT NOT NULL DEFAULT '',
      current_tick INTEGER NOT NULL DEFAULT 0,
      epoch INTEGER NOT NULL DEFAULT (unixepoch('2026-05-01T00:00:00') * 1000),
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )`,
    `CREATE TABLE IF NOT EXISTS nodes (
      id TEXT NOT NULL,
      world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
      parent_id TEXT, name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      capacity INTEGER, privacy TEXT NOT NULL DEFAULT 'public',
      visible_from_parent INTEGER NOT NULL DEFAULT 1,
      shortcuts_json TEXT NOT NULL DEFAULT '[]',
      is_entry INTEGER NOT NULL DEFAULT 0,
      travel_cost INTEGER,
      x INTEGER, y INTEGER, w INTEGER, h INTEGER, sprite_key TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      PRIMARY KEY (world_id, id)
    )`,
    `CREATE TABLE IF NOT EXISTS characters (
      id TEXT NOT NULL,
      world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
      name TEXT NOT NULL, avatar TEXT,
      age INTEGER NOT NULL DEFAULT 30,
      gender TEXT NOT NULL DEFAULT 'male',
      profession TEXT NOT NULL DEFAULT 'farmer',
      biography TEXT NOT NULL DEFAULT '',
      origin TEXT NOT NULL DEFAULT 'local',
      location_id TEXT NOT NULL,
      money INTEGER NOT NULL DEFAULT 0,
      income_level INTEGER NOT NULL DEFAULT 0,
      expense_exempt INTEGER NOT NULL DEFAULT 0,
      income_multiplier REAL NOT NULL DEFAULT 1.0,
      health INTEGER NOT NULL DEFAULT 3,
      appearance INTEGER NOT NULL DEFAULT 2,
      intelligence INTEGER NOT NULL DEFAULT 2,
      personality_json TEXT NOT NULL,
      vitals_json TEXT NOT NULL DEFAULT '{"hunger":0,"fatigue":0,"hygiene":0}',
      emotion_json TEXT NOT NULL DEFAULT '{"mood":0,"stress":0,"social_satiety":0}',
      abilities_json TEXT NOT NULL DEFAULT '[]',
      short_memory_json TEXT NOT NULL DEFAULT '[]',
      daily_memory_json TEXT NOT NULL DEFAULT '[]',
      long_memory_json TEXT NOT NULL DEFAULT '[]',
      impression_book_json TEXT NOT NULL DEFAULT '{}',
      short_term_goal_json TEXT,
      long_term_goal_json TEXT,
      liked TEXT NOT NULL DEFAULT '',
      disliked TEXT NOT NULL DEFAULT '',
      relations_json TEXT NOT NULL DEFAULT '{}',
      current_action_json TEXT,
      last_sleep_tick INTEGER NOT NULL DEFAULT 0,
      active_conversation_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      PRIMARY KEY (world_id, id)
    )`,
    `CREATE TABLE IF NOT EXISTS events_log (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
      tick INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )`,
    `CREATE TABLE IF NOT EXISTS agent_thoughts (
      world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
      character_id TEXT NOT NULL,
      tick INTEGER NOT NULL,
      action_json TEXT NOT NULL,
      success INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      PRIMARY KEY (world_id, character_id, tick)
    )`,
    `CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
      tick INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
      tick INTEGER NOT NULL,
      character_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('expense','income','transfer_in','transfer_out')),
      description TEXT NOT NULL DEFAULT '',
      counterparty_id TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS transactions_world_char_tick_idx ON transactions(world_id, character_id, tick)`,
    `CREATE TABLE IF NOT EXISTS conversations (
      id TEXT NOT NULL,
      world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      PRIMARY KEY (world_id, id)
    )`,
    `CREATE INDEX IF NOT EXISTS conversations_world_idx ON conversations(world_id)`,
    `CREATE TABLE IF NOT EXISTS notebook_entries (
      world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
      character_id TEXT NOT NULL,
      id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      PRIMARY KEY (world_id, character_id, id)
    )`,
    `CREATE INDEX IF NOT EXISTS notebook_char_idx ON notebook_entries(world_id, character_id)`,
    `CREATE TABLE IF NOT EXISTS think_sessions (
      id TEXT NOT NULL,
      world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      PRIMARY KEY (world_id, id)
    )`,
    `CREATE INDEX IF NOT EXISTS think_sessions_world_idx ON think_sessions(world_id)`,
  ];
}

function seedWorld(sqlite: any, charCount: number) {
  // Clear existing
  sqlite.exec("DELETE FROM notebook_entries");
  sqlite.exec("DELETE FROM conversations");
  sqlite.exec("DELETE FROM think_sessions");
  sqlite.exec("DELETE FROM transactions");
  sqlite.exec("DELETE FROM agent_thoughts");
  sqlite.exec("DELETE FROM events_log");
  sqlite.exec("DELETE FROM snapshots");
  sqlite.exec("DELETE FROM characters");
  sqlite.exec("DELETE FROM nodes");
  sqlite.exec("DELETE FROM worlds");

  sqlite
    .prepare(`INSERT INTO worlds (id, name, map_id, current_tick) VALUES (?, ?, ?, 0)`)
    .run(WORLD_ID, "Bench", "bench-world");

  // Single node — all chars in same location (worst case for O(n²) ops)
  sqlite
    .prepare(
      `INSERT INTO nodes (id, world_id, parent_id, name, tags_json, privacy, is_entry) VALUES (?, ?, NULL, ?, ?, ?, 1)`,
    )
    .run("n-root", WORLD_ID, "广场", JSON.stringify(["public"]), "public");

  const names = [
    "明", "红", "强", "芳", "伟", "娜", "军", "敏", "波", "静",
    "龙", "婷", "鹏", "萍", "翔", "琳", "涛", "燕", "浩", "霞",
    "杰", "丹", "海", "雪", "亮", "蓉", "勇", "莉", "刚", "洁",
    "毅", "丽", "飞", "琴", "峰", "露", "辉", "玲", "斌", "瑶",
  ];

  const personaJson = JSON.stringify({ ei: 0, sn: 0, tf: 0, jp: 0 });
  const vitalsJson = JSON.stringify({ hunger: 3, fatigue: 4, hygiene: 2 });

  const insertChar = sqlite.prepare(
    `INSERT INTO characters (id, world_id, name, location_id, money, personality_json, vitals_json) VALUES (?, ?, ?, ?, 200, ?, ?)`,
  );

  for (let i = 0; i < charCount; i++) {
    insertChar.run(`c${i}`, WORLD_ID, names[i] ?? `NPC${i}`, "n-root", personaJson, vitalsJson);
  }
}

// ---- benchmark runner ----

interface StageTiming {
  vitalsMs: number;
  emotionMs: number;
  decisionMs: number;
  dialogMs: number;
  executeMs: number;
  saveMs: number;
  totalMs: number;
}

/** Wrap tick() to capture the existing stage timing log messages */
function extractStageTiming(logLines: string[]): StageTiming | null {
  // tick.ts logs context as: "vitalsMs=2 emotionMs=0 decisionMs=9 ... totalMs=22"
  for (const line of logLines) {
    if (line.includes("阶段耗时")) {
      const m = line.match(/vitalsMs=(\d+)/);
      if (!m) continue;
      const vitalsMs = parseInt(m[1], 10);
      const emotionMs = parseInt(line.match(/emotionMs=(\d+)/)?.[1] ?? "0", 10);
      const decisionMs = parseInt(line.match(/decisionMs=(\d+)/)?.[1] ?? "0", 10);
      const dialogMs = parseInt(line.match(/dialogMs=(\d+)/)?.[1] ?? "0", 10);
      const executeMs = parseInt(line.match(/executeMs=(\d+)/)?.[1] ?? "0", 10);
      const saveMs = parseInt(line.match(/saveMs=(\d+)/)?.[1] ?? "0", 10);
      const totalMs = parseInt(line.match(/totalMs=(\d+)/)?.[1] ?? "0", 10);
      return { vitalsMs, emotionMs, decisionMs, dialogMs, executeMs, saveMs, totalMs };
    }
  }
  return null;
}

// ---- tests ----

beforeAll(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "agent-world-bench-"));
  process.env.DATABASE_URL = path.join(tmpDir, "bench.db");

  const Database = (await import("better-sqlite3")).default;
  const sqlite = new Database(process.env.DATABASE_URL);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  for (const s of makeTableSQL()) sqlite.exec(s);

  // Create configs for bench-world map
  const configsDir = path.join(tmpDir, "configs", "maps", "bench-world");
  mkdirSync(configsDir, { recursive: true });
  writeFileSync(
    path.join(configsDir, "manifest.json"),
    JSON.stringify({ id: "bench-world", name: "Bench World", language: "zh" }),
    "utf8",
  );
  writeFileSync(
    path.join(configsDir, "map.json"),
    JSON.stringify({
      id: "bench-world",
      nodes: [{ id: "n-root", name: "广场", tags: ["public"], isEntry: true }],
    }),
    "utf8",
  );
  // Empty characters directory
  mkdirSync(path.join(configsDir, "characters"), { recursive: true });
  process.env.AGENT_WORLD_CONFIGS_DIR = path.join(tmpDir, "configs");

  sqlite.close();

  tickModule = await import("./tick");
  storeModule = await import("./store");
  dbModule = await import("@/db/client");
});

afterAll(() => {
  delete process.env.AGENT_WORLD_CONFIGS_DIR;
  try {
    const { rmSync } = require("node:fs");
    rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch { /* OS will clean up */ }
});

describe("tick performance benchmark", () => {
  /** Run N ticks with given char count, return average stage timings */
  async function runBenchmark(
    charCount: number,
    warmupTicks: number = 1,
    measureTicks: number = 3,
  ): Promise<StageTiming[]> {
    const Database = (await import("better-sqlite3")).default;
    const sqlite = new Database(process.env.DATABASE_URL!);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    seedWorld(sqlite, charCount);
    sqlite.close();

    const decide = async (input: { character: { id: string } }): Promise<Action> => ({
      type: "wait" as const,
      actorId: input.character.id,
      reasoning: "bench — 无事可做。",
      selfImportance: 1 as const,
      skipExecution: true,
    });

    const results: StageTiming[] = [];

    // Warmup
    for (let i = 0; i < warmupTicks; i++) {
      await tickModule.tick(WORLD_ID, { decide });
    }

    // Measure
    for (let i = 0; i < measureTicks; i++) {
      const logs: string[] = [];
      const origLog = console.log;
      const origWarn = console.warn;
      const origError = console.error;
      console.log = (...args: any[]) => {
        logs.push(args.map(String).join(" "));
      };
      console.warn = (...args: any[]) => {
        logs.push(args.map(String).join(" "));
      };
      console.error = (...args: any[]) => {
        logs.push(args.map(String).join(" "));
      };

      try {
        await tickModule.tick(WORLD_ID, { decide });
      } finally {
        console.log = origLog;
        console.warn = origWarn;
        console.error = origError;
      }

      const timing = extractStageTiming(logs);
      if (timing) results.push(timing);
    }

    return results;
  }

  function avgTimings(runs: StageTiming[]): StageTiming {
    if (runs.length === 0) throw new Error("no runs");
    const keys = ["vitalsMs", "emotionMs", "decisionMs", "dialogMs", "executeMs", "saveMs", "totalMs"] as const;
    const out: any = {};
    for (const k of keys) {
      out[k] = Math.round(runs.reduce((s, r) => s + r[k], 0) / runs.length);
    }
    return out;
  }

  it("benchmark 10 characters", async () => {
    const runs = await runBenchmark(10, 1, 3);
    const avg = avgTimings(runs);
    console.log(`\n=== 10 角色平均耗时 (${runs.length} ticks) ===`);
    console.log(`  vitals:   ${avg.vitalsMs}ms`);
    console.log(`  emotion:  ${avg.emotionMs}ms`);
    console.log(`  decision: ${avg.decisionMs}ms`);
    console.log(`  dialog:   ${avg.dialogMs}ms`);
    console.log(`  execute:  ${avg.executeMs}ms`);
    console.log(`  save:     ${avg.saveMs}ms`);
    console.log(`  TOTAL:    ${avg.totalMs}ms`);
    expect(avg.totalMs).toBeGreaterThan(0);
  }, 30_000);

  it("benchmark 20 characters", async () => {
    const runs = await runBenchmark(20, 1, 3);
    const avg = avgTimings(runs);
    console.log(`\n=== 20 角色平均耗时 (${runs.length} ticks) ===`);
    console.log(`  vitals:   ${avg.vitalsMs}ms`);
    console.log(`  emotion:  ${avg.emotionMs}ms`);
    console.log(`  decision: ${avg.decisionMs}ms`);
    console.log(`  dialog:   ${avg.dialogMs}ms`);
    console.log(`  execute:  ${avg.executeMs}ms`);
    console.log(`  save:     ${avg.saveMs}ms`);
    console.log(`  TOTAL:    ${avg.totalMs}ms`);
    expect(avg.totalMs).toBeGreaterThan(0);
  }, 30_000);

  it("benchmark 30 characters", async () => {
    const runs = await runBenchmark(30, 1, 3);
    const avg = avgTimings(runs);
    console.log(`\n=== 30 角色平均耗时 (${runs.length} ticks) ===`);
    console.log(`  vitals:   ${avg.vitalsMs}ms`);
    console.log(`  emotion:  ${avg.emotionMs}ms`);
    console.log(`  decision: ${avg.decisionMs}ms`);
    console.log(`  dialog:   ${avg.dialogMs}ms`);
    console.log(`  execute:  ${avg.executeMs}ms`);
    console.log(`  save:     ${avg.saveMs}ms`);
    console.log(`  TOTAL:    ${avg.totalMs}ms`);
    expect(avg.totalMs).toBeGreaterThan(0);
  }, 30_000);

  it("benchmark 40 characters", async () => {
    const runs = await runBenchmark(40, 1, 3);
    const avg = avgTimings(runs);
    console.log(`\n=== 40 角色平均耗时 (${runs.length} ticks) ===`);
    console.log(`  vitals:   ${avg.vitalsMs}ms`);
    console.log(`  emotion:  ${avg.emotionMs}ms`);
    console.log(`  decision: ${avg.decisionMs}ms`);
    console.log(`  dialog:   ${avg.dialogMs}ms`);
    console.log(`  execute:  ${avg.executeMs}ms`);
    console.log(`  save:     ${avg.saveMs}ms`);
    console.log(`  TOTAL:    ${avg.totalMs}ms`);
    expect(avg.totalMs).toBeGreaterThan(0);
  }, 30_000);

  it("compare: 25 vs 40 scaling analysis", async () => {
    const Database = (await import("better-sqlite3")).default;

    const counts = [25, 40];
    const allResults: Map<number, StageTiming> = new Map();

    for (const count of counts) {
      const sqlite = new Database(process.env.DATABASE_URL!);
      sqlite.pragma("journal_mode = WAL");
      sqlite.pragma("foreign_keys = ON");
      seedWorld(sqlite, count);
      sqlite.close();

      const decide = async (input: { character: { id: string } }): Promise<Action> => ({
        type: "wait" as const,
        actorId: input.character.id,
        reasoning: "bench",
        selfImportance: 1 as const,
        skipExecution: true,
      });

      // Warmup
      await tickModule.tick(WORLD_ID, { decide });

      const runs: StageTiming[] = [];
      for (let i = 0; i < 3; i++) {
        const logs: string[] = [];
        const origLog = console.log;
        const origWarn = console.warn;
        const origError = console.error;
        console.log = (...args: any[]) => { logs.push(args.map(String).join(" ")); };
        console.warn = (...args: any[]) => { logs.push(args.map(String).join(" ")); };
        console.error = (...args: any[]) => { logs.push(args.map(String).join(" ")); };
        try {
          await tickModule.tick(WORLD_ID, { decide });
        } finally {
          console.log = origLog;
          console.warn = origWarn;
          console.error = origError;
        }
        const t = extractStageTiming(logs);
        if (t) runs.push(t);
      }
      allResults.set(count, avgTimings(runs));
    }

    const r25 = allResults.get(25)!;
    const r40 = allResults.get(40)!;

    console.log("\n========================================");
    console.log("         25 vs 40 角色 缩放分析");
    console.log("========================================");
    console.log(`{"阶段":${"".padEnd(10)} ${"25人".padStart(8)} ${"40人".padStart(8)} ${"比率".padStart(8)} ${"预期(1.6x)".padStart(10)}}`);

    const stages: Array<{ key: keyof StageTiming; label: string }> = [
      { key: "vitalsMs", label: "vitals" },
      { key: "emotionMs", label: "emotion" },
      { key: "decisionMs", label: "decision" },
      { key: "dialogMs", label: "dialog" },
      { key: "executeMs", label: "execute" },
      { key: "saveMs", label: "save" },
      { key: "totalMs", label: "TOTAL" },
    ];

    for (const { key, label } of stages) {
      const v25 = r25[key];
      const v40 = r40[key];
      const ratio = v25 > 0 ? (v40 / v25) : 0;
      const expected = 40 / 25; // linear
      const flag = ratio > expected * 1.5 ? " <-- 异常!" : "";
      console.log(
        `  ${label.padEnd(10)} ${String(v25).padStart(5)}ms ${String(v40).padStart(5)}ms ${ratio.toFixed(2).padStart(8)}x ${expected.toFixed(2).padStart(10)}x${flag}`,
      );
    }

    // Also run micro-benchmarks on individual functions
    console.log("\n--- 微基准: dispatchPerception ---");
    await microBenchPerception();

    console.log("\n--- 微基准: manageRelations ---");
    await microBenchRelations();

    console.log("\n--- 微基准: saveWorld ---");
    await microBenchSave();

    // At least verify totals are sane
    expect(r40.totalMs).toBeGreaterThan(0);
    expect(r25.totalMs).toBeGreaterThan(0);
  }, 60_000);
});

// ---- Micro-benchmarks for specific O(n²) functions ----

async function microBenchPerception() {
  const { dispatchPerception } = await import("./perception");
  const counts = [10, 20, 30, 40, 50];
  for (const n of counts) {
    const chars: any[] = Array.from({ length: n }, (_, i) => ({
      id: `c${i}`, locationId: "n-root",
    }));
    const nodes: any[] = [{ id: "n-root", parentId: null }];
    // Simulate events proportional to character count
    const events: any[] = [];
    for (let i = 0; i < n; i++) {
      events.push({
        id: `e${i}`, tick: 0, category: "action", scope: "node",
        nodeId: "n-root", participants: [`c${i}`], source: "actor",
        intensity: 1, duration: 1, worldId: "w",
        description: `char ${i} does something`,
      });
    }
    // Add some global events too
    for (let i = 0; i < 5; i++) {
      events.push({
        id: `ge${i}`, tick: 0, category: "inner", scope: "global",
        participants: [], source: "inner",
        intensity: 1, duration: 1, worldId: "w",
        description: `global event ${i}`,
      });
    }

    const runs = 5;
    let total = 0;
    for (let r = 0; r < runs; r++) {
      const t0 = performance.now();
      dispatchPerception(nodes, chars, events);
      total += performance.now() - t0;
    }
    console.log(`  ${n} 角色: avg ${(total / runs).toFixed(2)}ms (${events.length} events)`);
  }
}

async function microBenchRelations() {
  const counts = [10, 20, 30, 40, 50];
  for (const n of counts) {
    // Simulate the manageRelations inner loops
    const chars: any[] = Array.from({ length: n }, (_, i) => ({
      id: `c${i}`,
      locationId: "n-root",
      relations: {} as Record<string, any>,
    }));
    // Events proportional to char count
    const events: any[] = [];
    for (let i = 0; i < n * 2; i++) {
      events.push({
        tick: 0, category: "action",
        participants: [`c${i % n}`, `c${(i + 1) % n}`],
      });
    }

    const runs = 10;
    let total = 0;
    for (let r = 0; r < runs; r++) {
      const t0 = performance.now();
      // Replicate the exact manageRelations algorithm
      const byNode = new Map<string, any[]>();
      for (const c of chars) {
        const arr = byNode.get(c.locationId) ?? [];
        arr.push(c);
        byNode.set(c.locationId, arr);
      }
      for (const [, nodeChars] of byNode) {
        if (nodeChars.length < 2) continue;
        for (let i = 0; i < nodeChars.length; i++) {
          for (let j = i + 1; j < nodeChars.length; j++) {
            const a = nodeChars[i];
            const b = nodeChars[j];
            events.some(
              (e: any) =>
                e.tick === 0 &&
                e.participants.includes(a.id) &&
                e.participants.includes(b.id) &&
                (e.category === "social" || e.category === "action"),
            );
            // ensureAcquaintance (cheap)
            const rel = a.relations[b.id];
            if (!rel || rel.kinds.length === 0) {
              a.relations[b.id] = { kinds: ["acquaintance"], since: 0, lastInteractionTick: 0 };
            } else {
              rel.lastInteractionTick = 0;
            }
            const rel2 = b.relations[a.id];
            if (!rel2 || rel2.kinds.length === 0) {
              b.relations[a.id] = { kinds: ["acquaintance"], since: 0, lastInteractionTick: 0 };
            } else {
              rel2.lastInteractionTick = 0;
            }
          }
        }
      }
      total += performance.now() - t0;
    }
    const pairs = (n * (n - 1)) / 2;
    console.log(`  ${n} 角色 (${pairs} 对, ${events.length} events): avg ${(total / runs).toFixed(2)}ms`);
  }
}

async function microBenchSave() {
  // Test JSON.stringify cost for character data at different scales
  const counts = [10, 20, 30, 40, 50];
  for (const n of counts) {
    const chars: any[] = Array.from({ length: n }, (_, i) => ({
      id: `c${i}`,
      locationId: "n-root",
      money: 200,
      incomeLevel: 0,
      expenseExempt: false,
      vitals: { hunger: 3, fatigue: 4, hygiene: 2 },
      emotion: { mood: 0, stress: 0, social_satiety: 0 },
      shortMemory: Array.from({ length: 20 }, (_, j) => ({
        id: `mem-${j}`, tick: j, importance: 2, content: `memory ${j} content here with some text`,
      })),
      dailyMemory: [] as any[],
      longMemory: [] as any[],
      impressionBook: {} as Record<string, string>,
      shortTermGoal: null as any,
      longTermGoal: null as any,
      liked: "",
      disliked: "",
      relations: {} as Record<string, any>,
      currentAction: null as any,
      activeConversationIds: [] as string[],
      lastSleepTick: 0,
      sickness: null as any,
    }));

    // Give each char a few relations
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < Math.min(5, n); j++) {
        const target = (i + j + 1) % n;
        if (target !== i) {
          chars[i].relations[`c${target}`] = { kinds: ["acquaintance"], since: 0, lastInteractionTick: 0 };
        }
      }
    }

    const runs = 5;
    let total = 0;
    for (let r = 0; r < runs; r++) {
      const t0 = performance.now();
      for (const c of chars) {
        JSON.stringify(c.vitals);
        JSON.stringify(c.emotion);
        JSON.stringify(c.shortMemory);
        JSON.stringify(c.dailyMemory);
        JSON.stringify(c.longMemory);
        JSON.stringify(c.impressionBook);
        JSON.stringify(c.relations);
        JSON.stringify(c.activeConversationIds);
        if (c.shortTermGoal) JSON.stringify(c.shortTermGoal);
        if (c.longTermGoal) JSON.stringify(c.longTermGoal);
        if (c.currentAction) JSON.stringify(c.currentAction);
        if (c.sickness) JSON.stringify(c.sickness);
      }
      total += performance.now() - t0;
    }
    console.log(`  ${n} 角色: avg ${(total / runs).toFixed(2)}ms (JSON.stringify x13 per char)`);
  }
}
