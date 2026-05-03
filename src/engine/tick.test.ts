/**
 * Tick 引擎端到端测试。
 * 用临时 DB 文件 + 强制 forceWait 模式，验证：
 * - currentTick 正确自增
 * - vitals 累加 +1
 * - decay inner 事件按越线规则触发
 * - events_log 写入完整
 * - 异常注入路径降级为 wait
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let tickModule: typeof import("./tick");
let storeModule: typeof import("./store");
let dbModule: typeof import("@/db/client");

let tmpDir: string;

beforeAll(async () => {
  // 隔离 DB：使用 tmp 目录里的独立 sqlite 文件
  tmpDir = mkdtempSync(path.join(tmpdir(), "agent-world-test-"));
  process.env.DATABASE_URL = path.join(tmpDir, "test.db");
  // 重要：在导入业务模块之前设置环境变量

  // 用 raw better-sqlite3 直接 apply schema，避免依赖 npm 子进程
  const Database = (await import("better-sqlite3")).default;
  const sqlite = new Database(process.env.DATABASE_URL);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS worlds (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      map_id TEXT NOT NULL DEFAULT '',
      current_tick INTEGER NOT NULL DEFAULT 0,
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
      personality_json TEXT NOT NULL,
      vitals_json TEXT NOT NULL DEFAULT '{"hunger":0,"fatigue":0,"hygiene":0}',
      emotion_json TEXT NOT NULL DEFAULT '{"mood":0,"stress":0,"social_satiety":0}',
      abilities_json TEXT NOT NULL DEFAULT '[]',
      short_memory_json TEXT NOT NULL DEFAULT '[]',
      daily_memory_json TEXT NOT NULL DEFAULT '[]',
      long_memory_json TEXT NOT NULL DEFAULT '[]',
      relations_json TEXT NOT NULL DEFAULT '{}',
      current_action_json TEXT,
      last_sleep_tick INTEGER NOT NULL DEFAULT 0,
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
    `CREATE TABLE IF NOT EXISTS snapshots (
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
  ];
  for (const s of STATEMENTS) sqlite.exec(s);

  // 创建临时 configs 目录，提供 test-world manifest
  const configsDir = path.join(tmpDir, "configs", "maps", "test-world");
  mkdirSync(configsDir, { recursive: true });
  writeFileSync(
    path.join(configsDir, "manifest.json"),
    JSON.stringify({ id: "test-world", name: "测试世界", language: "zh" }),
    "utf8",
  );
  writeFileSync(
    path.join(configsDir, "map.json"),
    JSON.stringify({ id: "test-world", nodes: [] }),
    "utf8",
  );
  process.env.AGENT_WORLD_CONFIGS_DIR = path.join(tmpDir, "configs");

  const WORLD_ID = "test-world";
  sqlite
    .prepare(`INSERT INTO worlds (id, name, map_id) VALUES (?, ?, ?)`)
    .run(WORLD_ID, "测试世界", "test-world");
  sqlite
    .prepare(
      `INSERT INTO nodes (id, world_id, parent_id, name, tags_json, privacy) VALUES (?, ?, NULL, ?, ?, ?)`,
    )
    .run("node-root", WORLD_ID, "测试根", JSON.stringify(["public"]), "public");
  sqlite
    .prepare(
      `INSERT INTO nodes (id, world_id, parent_id, name, tags_json, privacy) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "node-diner",
      WORLD_ID,
      "node-root",
      "测试饭馆",
      JSON.stringify(["public", "indoor", "dining"]),
      "public",
    );
  const baseChar = (
    id: string,
    name: string,
    locId: string,
    vitals: { hunger: number; fatigue: number; hygiene: number } = {
      hunger: 0,
      fatigue: 0,
      hygiene: 0,
    },
  ) => {
    sqlite
      .prepare(
        `INSERT INTO characters (id, world_id, name, location_id, money, personality_json, vitals_json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        WORLD_ID,
        name,
        locId,
        200,
        JSON.stringify({ ei: 0, sn: 0, tf: 0, jp: 0 }),
        JSON.stringify(vitals),
      );
  };
  baseChar("char-a", "甲", "node-root");
  baseChar("char-b", "乙", "node-root", { hunger: 4, fatigue: 0, hygiene: 0 }); // 下一 tick 跨入 medium
  sqlite.close();

  // 现在导入业务模块（让 client.ts 在新的 DATABASE_URL 下创建 db）
  tickModule = await import("./tick");
  storeModule = await import("./store");
  dbModule = await import("@/db/client");
});

afterAll(() => {
  delete process.env.AGENT_WORLD_CONFIGS_DIR;
  // Windows 上 better-sqlite3 进程持有 WAL 文件锁，rmSync 可能 EPERM；
  // 测试环境不严格清理也可以接受
  try {
    rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    // 忽略，OS 会在进程退出后回收
  }
});

describe("tick engine v0", () => {
  it("forceWait: 1 步推进世界与 vitals", async () => {
    const before = storeModule.loadWorld("test-world");
    expect(before.world.currentTick).toBe(0);
    const charB = before.characters.find((c) => c.id === "char-b")!;
    expect(charB.vitals.hunger).toBe(4);

    const r = await tickModule.tick("test-world", { forceWait: true });
    expect(r.fromTick).toBe(0);
    expect(r.toTick).toBe(1);
    // 每个 NPC 都被记录决策
    expect(r.decisions.map((d) => d.characterId).sort()).toEqual([
      "char-a",
      "char-b",
    ]);

    const after = storeModule.loadWorld("test-world");
    expect(after.world.currentTick).toBe(1);
    const a = after.characters.find((c) => c.id === "char-a")!;
    expect(a.vitals.hunger).toBe(1);
    expect(a.vitals.fatigue).toBe(1);

    const b = after.characters.find((c) => c.id === "char-b")!;
    expect(b.vitals.hunger).toBe(5); // 4 → 5：跨入 medium

    // medium 越线产生 inner 事件
    const innerHunger = r.events.find(
      (e) =>
        e.category === "inner" &&
        e.audienceCharacterId === "char-b" &&
        e.description.includes("饿"),
    );
    expect(innerHunger).toBeTruthy();
  });

  it("LLM 决策异常时降级为 wait", async () => {
    const decide = async () => {
      throw new Error("boom");
    };
    const r = await tickModule.tick("test-world", { decide });
    // 全员 wait，无异常抛出
    expect(r.decisions.every((d) => d.action.type === "wait")).toBe(true);
    expect(
      r.decisions.every((d) => d.action.reasoning.includes("LLM")),
    ).toBe(true);
  });

  it("eat 重置 hunger", async () => {
    const decide = async ({ character }: { character: { id: string; locationId: string } }) => {
      // 让 char-b 先 move 到饭馆，下一步再吃；但单 tick 内只能选一个
      // 这个测试只测 eat：直接让两个 NPC 选 move/eat
      if (character.id === "char-b" && character.locationId === "node-root") {
        return {
          type: "move" as const,
          actorId: character.id,
          targetNodeId: "node-diner",
          reasoning: "去吃饭",
          selfImportance: 2 as const,
        };
      }
      if (character.id === "char-b" && character.locationId === "node-diner") {
        return {
          type: "eat" as const,
          actorId: character.id,
          reasoning: "饿了，吃。",
          selfImportance: 3 as const,
        };
      }
      return {
        type: "wait" as const,
        actorId: character.id,
        reasoning: "等",
        selfImportance: 1 as const,
      };
    };

    // tick: move
    const r1 = await tickModule.tick("test-world", { decide });
    expect(r1.toTick).toBe(3); // 之前两次 = 2，加这一次 = 3
    const w1 = storeModule.loadWorld("test-world");
    const b1 = w1.characters.find((c) => c.id === "char-b")!;
    expect(b1.locationId).toBe("node-diner");

    // tick: eat
    const r2 = await tickModule.tick("test-world", { decide });
    const w2 = storeModule.loadWorld("test-world");
    const b2 = w2.characters.find((c) => c.id === "char-b")!;
    expect(b2.vitals.hunger).toBe(0);
    expect(
      r2.events.some(
        (e) => e.description.includes("吃了一顿") && e.participants.includes("char-b"),
      ),
    ).toBe(true);
  });

  it("DecideInput 注入 facts 字段（hoursAtCurrentLocation / lastAction）", async () => {
    type FactsCapture = {
      hoursAtCurrentLocation?: number;
      lastActionType?: string;
      todayActionCounts?: Partial<Record<string, number>>;
    };
    const captured = new Map<string, FactsCapture>();
    const decide = async (input: {
      character: { id: string };
      facts: {
        hoursAtCurrentLocation: number;
        lastAction?: { type: string };
        todayActionCounts: Partial<Record<string, number>>;
      };
    }) => {
      captured.set(input.character.id, {
        hoursAtCurrentLocation: input.facts.hoursAtCurrentLocation,
        lastActionType: input.facts.lastAction?.type,
        todayActionCounts: { ...input.facts.todayActionCounts },
      });
      return {
        type: "wait" as const,
        actorId: input.character.id,
        reasoning: "等",
        selfImportance: 1 as const,
      };
    };

    await tickModule.tick("test-world", { decide });
    // char-a 之前有 thought（前面的测试积累），所以 hoursAtCurrentLocation 应有值，
    // todayActionCounts 应非空（至少 wait 计数）
    const a = captured.get("char-a");
    expect(a).toBeTruthy();
    expect(typeof a!.hoursAtCurrentLocation).toBe("number");
    expect(a!.todayActionCounts).toBeTruthy();
    // 上一次 wait/eat/move 至少有一个进了今日累计
    const vals = Object.values(a!.todayActionCounts ?? {}) as number[];
    const total = vals.reduce((s, n) => s + n, 0);
    expect(total).toBeGreaterThan(0);
  });

  it("每角色每次 tick 仅调一次 LLM（不再有 free-move 循环）", async () => {
    let callCount = 0;
    const decide = async ({
      character,
    }: {
      character: { id: string };
    }) => {
      callCount++;
      return {
        type: "wait" as const,
        actorId: character.id,
        reasoning: "等。",
        selfImportance: 1 as const,
      };
    };

    const r = await tickModule.tick("test-world", { decide });

    // 两个角色各调 1 次 LLM（不再有 free-move 循环）
    expect(callCount).toBe(2);

    // 每个角色的 action 由 LLM 直接返回
    expect(r.decisions).toHaveLength(2);
    for (const d of r.decisions) {
      expect(d.action.type).toBe("wait");
    }
  });

  it("写入 agent_thoughts 时保留完整 reasoning 不截断", async () => {
    const longReason = "我反复纠结".repeat(60); // ≈ 300 字符，远超 80 字 memory 截断
    const decide = async ({ character }: { character: { id: string } }) => ({
      type: "wait" as const,
      actorId: character.id,
      reasoning: longReason,
      emotionTag: "pensive",
      selfImportance: 2 as const,
    });
    const before = storeModule.loadWorld("test-world");
    const fromTick = before.world.currentTick;

    await tickModule.tick("test-world", { decide });

    // loadWorld 会注入 lastThought
    const after = storeModule.loadWorld("test-world");
    const a = after.characters.find((c) => c.id === "char-a")!;
    expect(a.lastThought).toBeTruthy();
    expect(a.lastThought!.tick).toBe(fromTick);
    expect(a.lastThought!.action.reasoning).toBe(longReason);
    expect(a.lastThought!.action.emotionTag).toBe("pensive");
    expect(a.lastThought!.success).toBe(true);
  });

  it("sleep 持续中不写记忆（skipMemory），结束时写完成记忆", async () => {
    // Reset world state by directly manipulating the test DB
    const Database = (await import("better-sqlite3")).default;
    const sqlite = new Database(process.env.DATABASE_URL!);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.exec("DELETE FROM characters");
    sqlite.exec("DELETE FROM events_log");
    sqlite.exec("DELETE FROM agent_thoughts");
    sqlite.exec("UPDATE worlds SET current_tick = 0");

    // Add char-a (normal NPC needed for tick to have companions)
    sqlite.prepare(
      `INSERT INTO characters (id, world_id, name, location_id, personality_json, vitals_json) VALUES (?, ?, ?, ?, ?, ?)`
    ).run("char-a", "test-world", "甲", "node-root", JSON.stringify({ ei: 0, sn: 0, tf: 0, jp: 0 }), JSON.stringify({ hunger: 0, fatigue: 0, hygiene: 0 }));

    // Add sleeper with active sleep: startedAt=0, endsAt=1 (completes after 1 tick)
    sqlite.prepare(
      `INSERT INTO characters (id, world_id, name, location_id, personality_json, vitals_json, current_action_json, short_memory_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "char-sleeper", "test-world", "睡者", "node-root",
      JSON.stringify({ ei: 0, sn: 0, tf: 0, jp: 0 }),
      JSON.stringify({ hunger: 5, fatigue: 10, hygiene: 5 }),
      JSON.stringify({ type: "sleep", startedAt: 0, endsAt: 1, description: "在测试根睡觉", interruptThreshold: 4 }),
      JSON.stringify([]),
    );

    sqlite.close();

    // Tick 1: sleep is ongoing (fromTick=0 < endsAt=1) → auto-wait with skipMemory:true
    const r1 = await tickModule.tick("test-world", { forceWait: true });
    const w1 = storeModule.loadWorld("test-world");
    const sleeper1 = w1.characters.find((c) => c.id === "char-sleeper")!;
    // shortMemory should still be empty — skipMemory prevented the auto-wait memory
    expect(sleeper1.shortMemory).toHaveLength(0);
    // currentAction should still be active
    expect(sleeper1.currentAction).toBeTruthy();
    expect(sleeper1.currentAction!.type).toBe("sleep");

    // Tick 2: sleep completes (fromTick=1 >= endsAt=1) → completion memory written
    const r2 = await tickModule.tick("test-world", { forceWait: true });
    const w2 = storeModule.loadWorld("test-world");
    const sleeper2 = w2.characters.find((c) => c.id === "char-sleeper")!;
    expect(sleeper2.currentAction).toBeUndefined();
    expect(sleeper2.vitals.fatigue).toBe(0);
    // Completion memory written
    expect(sleeper2.shortMemory.length).toBeGreaterThan(0);
    expect(sleeper2.shortMemory[0].content).toContain("睡醒");
  });

  it("skipMemory 不影响普通 action 的记忆写入", async () => {
    const { executeActions } = await import("./execute");
    const { actionRegistry } = await import("@/domain/action-system");
    const { BUILTIN_ACTIONS } = await import("./actions-builtin");
    actionRegistry.registerAll(BUILTIN_ACTIONS);
    const char: any = {
      id: "char-x",
      worldId: "w",
      name: "X",
      age: 30,
      gender: "male" as const,
      profession: "farmer" as const,
      biography: "",
      locationId: "n1",
      personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
      vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
      emotion: { mood: 0, stress: 0, social_satiety: 0 },
      abilities: [],
      shortMemory: [],
      dailyMemory: [],
      longMemory: [],
      relations: {},
      lastSleepTick: 0,
    };
    const node: any = {
      id: "n1", worldId: "w", parentId: null, name: "测试节点",
      description: "", tags: ["public"], capacity: null, privacy: "public" as const,
      visibleFromParent: true, shortcuts: [], isEntry: false, travelCost: null,
    };
    const action: any = {
      type: "wait" as const,
      actorId: "char-x",
      reasoning: "等等看。",
      selfImportance: 2 as const,
      // no skipMemory — defaults to undefined (falsy)
    };
    executeActions({
      worldId: "w",
      tick: 0,
      characters: [char],
      nodes: [node],
      actions: [action],
    });
    // Regression: memory SHOULD be written when skipMemory is absent
    expect(char.shortMemory.length).toBe(1);
    expect(char.shortMemory[0].content).toContain("等待");
  });
});
