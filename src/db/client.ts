import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

/**
 * 单例 Drizzle client。
 * Next.js 在 dev 模式下会因 HMR 多次执行模块初始化，使用全局缓存避免重复打开 db。
 */

const DEFAULT_DB_PATH = "./data/agent-world.db";

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __agent_world_db__: ReturnType<typeof createDb> | undefined;
}

function ensureColumns(sqlite: Database.Database) {
  const nodeCols = sqlite
    .prepare(`PRAGMA table_info(nodes)`)
    .all() as { name: string }[];
  const haveNodeCols = new Set(nodeCols.map((c) => c.name));
  for (const [name, ddl] of NODE_MIGRATIONS) {
    if (!haveNodeCols.has(name)) sqlite.exec(ddl);
  }
  const charCols = sqlite
    .prepare(`PRAGMA table_info(characters)`)
    .all() as { name: string }[];
  const haveCharCols = new Set(charCols.map((c) => c.name));
  for (const [name, ddl] of CHAR_MIGRATIONS) {
    if (!haveCharCols.has(name)) sqlite.exec(ddl);
  }
  const worldCols = sqlite
    .prepare(`PRAGMA table_info(worlds)`)
    .all() as { name: string }[];
  const haveWorldCols = new Set(worldCols.map((c) => c.name));
  for (const [name, ddl] of WORLD_MIGRATIONS) {
    if (!haveWorldCols.has(name)) sqlite.exec(ddl);
  }
  const entryTables = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
    .all() as { name: string }[];
  const haveEntryTables = new Set(entryTables.map((t) => t.name));
  for (const [tableName, ddl] of ENTRY_CONFIG_MIGRATIONS) {
    if (!haveEntryTables.has(tableName)) sqlite.exec(ddl);
  }
  for (const [tableName, ddl] of CONVERSATIONS_TABLE_MIGRATION) {
    if (!haveEntryTables.has(tableName)) sqlite.exec(ddl);
  }
}

/** Keep in sync with migrate.ts CHARACTERS_NEW_COLUMNS. */
const CHAR_MIGRATIONS: Array<[string, string]> = [
  ["emotion_json", `ALTER TABLE characters ADD COLUMN emotion_json TEXT NOT NULL DEFAULT '{"mood":0,"stress":0,"social_satiety":0}'`],
  ["age", "ALTER TABLE characters ADD COLUMN age INTEGER NOT NULL DEFAULT 30"],
  ["gender", "ALTER TABLE characters ADD COLUMN gender TEXT NOT NULL DEFAULT 'male'"],
  ["profession", "ALTER TABLE characters ADD COLUMN profession TEXT NOT NULL DEFAULT 'farmer'"],
  ["biography", "ALTER TABLE characters ADD COLUMN biography TEXT NOT NULL DEFAULT ''"],
  ["origin", "ALTER TABLE characters ADD COLUMN origin TEXT NOT NULL DEFAULT 'local'"],
  ["money", "ALTER TABLE characters ADD COLUMN money INTEGER NOT NULL DEFAULT 0"],
  ["income_level", "ALTER TABLE characters ADD COLUMN income_level INTEGER NOT NULL DEFAULT 0"],
  ["expense_exempt", "ALTER TABLE characters ADD COLUMN expense_exempt INTEGER NOT NULL DEFAULT 0"],
  ["income_multiplier", "ALTER TABLE characters ADD COLUMN income_multiplier REAL NOT NULL DEFAULT 1.0"],
  ["daily_memory_json", "ALTER TABLE characters ADD COLUMN daily_memory_json TEXT NOT NULL DEFAULT '[]'"],
  ["last_sleep_tick", "ALTER TABLE characters ADD COLUMN last_sleep_tick INTEGER NOT NULL DEFAULT 0"],
  ["appearance", "ALTER TABLE characters ADD COLUMN appearance INTEGER NOT NULL DEFAULT 2"],
  ["intelligence", "ALTER TABLE characters ADD COLUMN intelligence INTEGER NOT NULL DEFAULT 2"],
  ["health", "ALTER TABLE characters ADD COLUMN health INTEGER NOT NULL DEFAULT 2"],
  ["sickness_json", "ALTER TABLE characters ADD COLUMN sickness_json TEXT"],
  ["speaking_style", "ALTER TABLE characters ADD COLUMN speaking_style TEXT"],
  ["active_conversation_ids_json", "ALTER TABLE characters ADD COLUMN active_conversation_ids_json TEXT NOT NULL DEFAULT '[]'"],
  ["impression_book_json", "ALTER TABLE characters ADD COLUMN impression_book_json TEXT NOT NULL DEFAULT '{}'"],
  ["short_term_goal_json", "ALTER TABLE characters ADD COLUMN short_term_goal_json TEXT"],
  ["long_term_goal_json", "ALTER TABLE characters ADD COLUMN long_term_goal_json TEXT"],
  ["liked", "ALTER TABLE characters ADD COLUMN liked TEXT NOT NULL DEFAULT ''"],
  ["disliked", "ALTER TABLE characters ADD COLUMN disliked TEXT NOT NULL DEFAULT ''"],
];

/** Keep in sync with migrate.ts NODES_NEW_COLUMNS. */
const NODE_MIGRATIONS: Array<[string, string]> = [
  ["x", "ALTER TABLE nodes ADD COLUMN x INTEGER"],
  ["y", "ALTER TABLE nodes ADD COLUMN y INTEGER"],
  ["w", "ALTER TABLE nodes ADD COLUMN w INTEGER"],
  ["h", "ALTER TABLE nodes ADD COLUMN h INTEGER"],
  ["sprite_key", "ALTER TABLE nodes ADD COLUMN sprite_key TEXT"],
  ["is_entry", "ALTER TABLE nodes ADD COLUMN is_entry INTEGER NOT NULL DEFAULT 0"],
  ["travel_cost", "ALTER TABLE nodes ADD COLUMN travel_cost INTEGER"],
];

/** Keep in sync with migrate.ts WORLDS_NEW_COLUMNS. */
const WORLD_MIGRATIONS: Array<[string, string]> = [
  ["map_id", "ALTER TABLE worlds ADD COLUMN map_id TEXT NOT NULL DEFAULT ''"],
];

const ENTRY_CONFIG_MIGRATIONS: Array<[string, string]> = [
  ["llm_entry_configs", `CREATE TABLE IF NOT EXISTS llm_entry_configs (
    id TEXT PRIMARY KEY,
    provider_id TEXT REFERENCES llm_providers(id) ON DELETE SET NULL,
    thinking_enabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`],
];

const CONVERSATIONS_TABLE_MIGRATION: Array<[string, string]> = [
  ["conversations", `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT NOT NULL,
    world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    PRIMARY KEY(world_id, id)
  )`,
  ],
];

function createDb() {
  const url = process.env.DATABASE_URL ?? DEFAULT_DB_PATH;
  ensureDir(url);
  const sqlite = new Database(url);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  ensureColumns(sqlite);
  return drizzle(sqlite, { schema });
}

export const db = globalThis.__agent_world_db__ ?? createDb();
if (process.env.NODE_ENV !== "production") {
  globalThis.__agent_world_db__ = db;
}

export { schema };
