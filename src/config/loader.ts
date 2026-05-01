/**
 * 从 `configs/` 目录读取地图与角色配置。
 *
 * - 读取根目录由 `AGENT_WORLD_CONFIGS_DIR` 覆盖，否则取 `process.cwd()/configs`。
 * - 校验失败抛 `Error("config invalid: <path>: <zod issues>")`。
 * - 不缓存：单次种子 / 单次 API 请求都会重新读盘，避免 dev HMR 拿到旧值。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import type { ZodSafeParseResult, ZodType } from "zod";
import {
  CharacterTemplateSchema,
  MapConfigSchema,
} from "./schemas";
import type { CharacterTemplate, MapConfig } from "./types";

function configsRoot(): string {
  return (
    process.env.AGENT_WORLD_CONFIGS_DIR ??
    path.resolve(process.cwd(), "configs")
  );
}

function listJson(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(dir, f))
    .sort();
}

function parseFile<T>(file: string, schema: ZodType<T>): T {
  const raw = readFileSync(file, "utf8");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `config invalid: ${file}: not valid JSON (${(e as Error).message})`,
    );
  }
  const r: ZodSafeParseResult<T> = schema.safeParse(json);
  if (!r.success) {
    const issues = r.error.issues
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    throw new Error(`config invalid: ${file}: ${issues}`);
  }
  return r.data;
}

export function loadAllMaps(): MapConfig[] {
  const dir = path.join(configsRoot(), "maps");
  return listJson(dir).map((f) => parseFile(f, MapConfigSchema));
}

export function loadAllCharacters(): CharacterTemplate[] {
  const dir = path.join(configsRoot(), "characters");
  return listJson(dir).map((f) => parseFile(f, CharacterTemplateSchema));
}

export function loadMap(id: string): MapConfig {
  const found = loadAllMaps().find((m) => m.id === id);
  if (!found) throw new Error(`map not found: ${id}`);
  return found;
}

export function loadCharacter(id: string): CharacterTemplate {
  const found = loadAllCharacters().find((c) => c.id === id);
  if (!found) throw new Error(`character template not found: ${id}`);
  return found;
}

/** 取一张地图的首个 entry 节点（用于默认落点）。地图通过 schema 已保证存在。 */
export function firstEntryNodeId(map: MapConfig): string {
  const entry = map.nodes.find((n) => n.isEntry);
  if (!entry) {
    throw new Error(
      `map ${map.id} has no entry node — schema invariant violated`,
    );
  }
  return entry.id;
}
