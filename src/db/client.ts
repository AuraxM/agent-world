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
