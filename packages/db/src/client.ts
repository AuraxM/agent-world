import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

/**
 * Singleton Drizzle client.
 * Next.js dev mode may re-execute module init via HMR; use global cache
 * to avoid re-opening the database on every hot reload.
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

function createDb() {
  const url = process.env.DATABASE_URL ?? DEFAULT_DB_PATH;
  ensureDir(url);
  const sqlite = new Database(url);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

export const db = globalThis.__agent_world_db__ ?? createDb();
if (process.env.NODE_ENV !== "production") {
  globalThis.__agent_world_db__ = db;
}

export { schema };
