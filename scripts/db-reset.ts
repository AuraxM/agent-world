/**
 * 删除本地 SQLite 文件（含 WAL/SHM），让下一次 `db:migrate` 从空白开始。
 *
 * 用法：`npm run db:reset`（package.json 已串接 db:migrate）。
 * 仅用于本地开发；生产环境请走真正的 migration。
 */
import { existsSync, rmSync } from "node:fs";

const DEFAULT_DB_PATH = "./data/agent-world.db";
const url = process.env.DATABASE_URL ?? DEFAULT_DB_PATH;

let removed = 0;
for (const suffix of ["", "-shm", "-wal"]) {
  const p = url + suffix;
  if (existsSync(p)) {
    rmSync(p);
    console.log(`✗ removed ${p}`);
    removed++;
  }
}
if (removed === 0) console.log(`(no db files at ${url})`);
