/**
 * 一键建表脚本。
 * Stage 1 不需要 drizzle-kit migration 历史；直接用 CREATE TABLE IF NOT EXISTS
 * 把 schema 推到 SQLite。后续阶段再切到正式 migration。
 *
 * 用法：`npm run db:migrate`
 */
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const DEFAULT_DB_PATH = "./data/agent-world.db";

const url = process.env.DATABASE_URL ?? DEFAULT_DB_PATH;
const dir = path.dirname(url);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

const sqlite = new Database(url);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS worlds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    map_id TEXT NOT NULL DEFAULT '',
    current_tick INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE TABLE IF NOT EXISTS nodes (
    id TEXT NOT NULL,
    world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    parent_id TEXT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    capacity INTEGER,
    privacy TEXT NOT NULL DEFAULT 'public',
    visible_from_parent INTEGER NOT NULL DEFAULT 1,
    shortcuts_json TEXT NOT NULL DEFAULT '[]',
    is_entry INTEGER NOT NULL DEFAULT 0,
    travel_cost INTEGER,
    x INTEGER,
    y INTEGER,
    w INTEGER,
    h INTEGER,
    sprite_key TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    PRIMARY KEY (world_id, id)
  )`,
  `CREATE INDEX IF NOT EXISTS nodes_world_idx ON nodes(world_id)`,
  `CREATE TABLE IF NOT EXISTS characters (
    id TEXT NOT NULL,
    world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    avatar TEXT,
    age INTEGER NOT NULL DEFAULT 30,
    gender TEXT NOT NULL DEFAULT 'male',
    profession TEXT NOT NULL DEFAULT 'farmer',
    money INTEGER NOT NULL DEFAULT 0,
    income_level INTEGER NOT NULL DEFAULT 0,
    expense_exempt INTEGER NOT NULL DEFAULT 0,
    biography TEXT NOT NULL DEFAULT '',
    origin TEXT NOT NULL DEFAULT 'local',
    location_id TEXT NOT NULL,
    personality_json TEXT NOT NULL,
    vitals_json TEXT NOT NULL DEFAULT '{"hunger":0,"fatigue":0,"hygiene":0}',
    emotion_json TEXT NOT NULL DEFAULT '{"mood":0,"stress":0,"social_satiety":0}',
    abilities_json TEXT NOT NULL DEFAULT '[]',
    short_memory_json TEXT NOT NULL DEFAULT '[]',
    long_memory_json TEXT NOT NULL DEFAULT '[]',
    relations_json TEXT NOT NULL DEFAULT '{}',
    current_action_json TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    PRIMARY KEY (world_id, id)
  )`,
  `CREATE INDEX IF NOT EXISTS characters_world_idx ON characters(world_id)`,
  `CREATE TABLE IF NOT EXISTS events_log (
    id TEXT PRIMARY KEY,
    world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    tick INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE INDEX IF NOT EXISTS events_world_tick_idx ON events_log(world_id, tick)`,
  `CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    tick INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
  `CREATE INDEX IF NOT EXISTS snapshots_world_tick_idx ON snapshots(world_id, tick)`,
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
  `CREATE TABLE IF NOT EXISTS agent_thoughts (
    world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    character_id TEXT NOT NULL,
    tick INTEGER NOT NULL,
    action_json TEXT NOT NULL,
    success INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    PRIMARY KEY (world_id, character_id, tick)
  )`,
  `CREATE INDEX IF NOT EXISTS thoughts_actor_tick_idx ON agent_thoughts(world_id, character_id, tick)`,
  `CREATE TABLE IF NOT EXISTS llm_providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    model TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`,
];

/** SQLite 不支持 ALTER ADD COLUMN IF NOT EXISTS；按 PRAGMA 自查后追加。 */
const NODES_NEW_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "x", ddl: "ALTER TABLE nodes ADD COLUMN x INTEGER" },
  { name: "y", ddl: "ALTER TABLE nodes ADD COLUMN y INTEGER" },
  { name: "w", ddl: "ALTER TABLE nodes ADD COLUMN w INTEGER" },
  { name: "h", ddl: "ALTER TABLE nodes ADD COLUMN h INTEGER" },
  { name: "sprite_key", ddl: "ALTER TABLE nodes ADD COLUMN sprite_key TEXT" },
  {
    name: "is_entry",
    ddl: "ALTER TABLE nodes ADD COLUMN is_entry INTEGER NOT NULL DEFAULT 0",
  },
  { name: "travel_cost", ddl: "ALTER TABLE nodes ADD COLUMN travel_cost INTEGER" },
];

const CHARACTERS_NEW_COLUMNS: Array<{ name: string; ddl: string }> = [
  {
    name: "emotion_json",
    ddl: `ALTER TABLE characters ADD COLUMN emotion_json TEXT NOT NULL DEFAULT '{"mood":0,"stress":0,"social_satiety":0}'`,
  },
  { name: "age", ddl: "ALTER TABLE characters ADD COLUMN age INTEGER NOT NULL DEFAULT 30" },
  { name: "gender", ddl: "ALTER TABLE characters ADD COLUMN gender TEXT NOT NULL DEFAULT 'male'" },
  { name: "profession", ddl: "ALTER TABLE characters ADD COLUMN profession TEXT NOT NULL DEFAULT 'farmer'" },
  { name: "biography", ddl: "ALTER TABLE characters ADD COLUMN biography TEXT NOT NULL DEFAULT ''" },
  { name: "origin", ddl: "ALTER TABLE characters ADD COLUMN origin TEXT NOT NULL DEFAULT 'local'" },
  { name: "money", ddl: "ALTER TABLE characters ADD COLUMN money INTEGER NOT NULL DEFAULT 0" },
  { name: "income_level", ddl: "ALTER TABLE characters ADD COLUMN income_level INTEGER NOT NULL DEFAULT 0" },
  { name: "expense_exempt", ddl: "ALTER TABLE characters ADD COLUMN expense_exempt INTEGER NOT NULL DEFAULT 0" },
];

const WORLDS_NEW_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "map_id", ddl: "ALTER TABLE worlds ADD COLUMN map_id TEXT NOT NULL DEFAULT ''" },
];

const tx = sqlite.transaction(() => {
  for (const stmt of STATEMENTS) sqlite.exec(stmt);
  const nodeCols = sqlite
    .prepare(`PRAGMA table_info(nodes)`)
    .all() as { name: string }[];
  const haveNodeCols = new Set(nodeCols.map((c) => c.name));
  for (const col of NODES_NEW_COLUMNS) {
    if (!haveNodeCols.has(col.name)) sqlite.exec(col.ddl);
  }
  const charCols = sqlite
    .prepare(`PRAGMA table_info(characters)`)
    .all() as { name: string }[];
  const haveCharCols = new Set(charCols.map((c) => c.name));
  for (const col of CHARACTERS_NEW_COLUMNS) {
    if (!haveCharCols.has(col.name)) sqlite.exec(col.ddl);
  }
  const worldCols = sqlite
    .prepare(`PRAGMA table_info(worlds)`)
    .all() as { name: string }[];
  const haveWorldCols = new Set(worldCols.map((c) => c.name));
  for (const col of WORLDS_NEW_COLUMNS) {
    if (!haveWorldCols.has(col.name)) sqlite.exec(col.ddl);
  }
});
tx();

const tables = sqlite
  .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
  .all() as { name: string }[];

console.log(`✓ DB migrated at ${url}`);
console.log(`  tables: ${tables.map((t) => t.name).join(", ")}`);

sqlite.close();
