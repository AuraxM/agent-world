import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import type { ZodSafeParseResult, ZodType } from "zod";
import {
  CharacterTemplateSchema,
  ManifestSchema,
  MapConfigSchema,
} from "./schemas";
import type { CharacterTemplate, Manifest, MapConfig } from "./types";
import type { PackValidation } from "./loader-types";
import { PROFESSION_INCOME_TIERS } from "../domain/index";
import { DEFAULT_ECONOMY_CONFIG } from "./types";
import type { EconomyConfig } from "./types";

function scenesRoot(): string {
  return (
    process.env.AGENT_WORLD_SCENES_DIR ??
    path.resolve(process.cwd(), "scenes")
  );
}

function readJsonFile(file: string): unknown {
  const raw = readFileSync(file, "utf8");
  return JSON.parse(raw);
}

function parseFile<T>(file: string, schema: ZodType<T>): T {
  let json: unknown;
  try {
    json = readJsonFile(file);
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

/** 列举所有地图包 id（扫描 scenes/ 下的子目录）。 */
export function listMapPackIds(): string[] {
  const root = scenesRoot();
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/** 加载 manifest.json，校验 id 与目录名一致。 */
export function loadManifest(packId: string): Manifest {
  const file = path.join(scenesRoot(), packId, "manifest.json");
  const manifest = parseFile(file, ManifestSchema);
  if (manifest.id !== packId) {
    throw new Error(
      `config invalid: ${file}: manifest.id "${manifest.id}" does not match directory name "${packId}"`,
    );
  }
  return manifest;
}

/** 加载 map.json，校验 id 与目录名一致。 */
export function loadMap(packId: string): MapConfig {
  const file = path.join(scenesRoot(), packId, "map.json");
  const map = parseFile(file, MapConfigSchema);
  if (map.id !== packId) {
    throw new Error(
      `config invalid: ${file}: map.id "${map.id}" does not match directory name "${packId}"`,
    );
  }
  return map;
}

/** 加载某个包的 characters/ 目录下所有角色。 */
export function loadCharactersForMap(packId: string): CharacterTemplate[] {
  const dir = path.join(scenesRoot(), packId, "characters");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => parseFile(path.join(dir, f), CharacterTemplateSchema))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** 加载所有地图包的所有角色。 */
export function loadAllCharacters(): CharacterTemplate[] {
  return listMapPackIds().flatMap((id) => loadCharactersForMap(id));
}

/** 加载所有地图。 */
export function loadAllMaps(): MapConfig[] {
  return listMapPackIds().map((id) => loadMap(id));
}

/** 按 id 查找单个角色。可传 packId 限定搜索范围，避免跨 mod 同名 ID 碰撞。 */
export function loadCharacter(id: string, packId?: string): CharacterTemplate {
  if (packId) {
    const chars = loadCharactersForMap(packId);
    const found = chars.find((c) => c.id === id);
    if (found) return found;
    throw new Error(`character template not found: ${id} (pack: ${packId})`);
  }
  for (const packId of listMapPackIds()) {
    const chars = loadCharactersForMap(packId);
    const found = chars.find((c) => c.id === id);
    if (found) return found;
  }
  throw new Error(`character template not found: ${id}`);
}

/** 逐项校验一个地图包，汇总所有错误。不抛异常。 */
export function validateMapPack(packId: string): PackValidation {
  const errors: { file: string; message: string }[] = [];
  let manifest: Manifest | null = null;
  let nodeCount = 0;
  let characterCount = 0;

  try {
    manifest = loadManifest(packId);
  } catch (e) {
    errors.push({ file: "manifest.json", message: (e as Error).message });
  }

  try {
    const map = loadMap(packId);
    nodeCount = map.nodes.length;
  } catch (e) {
    errors.push({ file: "map.json", message: (e as Error).message });
    // Try to count nodes from raw JSON even when schema validation fails
    try {
      const raw = JSON.parse(
        readFileSync(path.join(scenesRoot(), packId, "map.json"), "utf8"),
      ) as Record<string, unknown>;
      if (Array.isArray(raw.nodes)) nodeCount = raw.nodes.length;
    } catch {
      /* can't count nodes */
    }
  }

  const charsDir = path.join(scenesRoot(), packId, "characters");
  if (existsSync(charsDir)) {
    const charFiles = readdirSync(charsDir).filter((f) => f.endsWith(".json"));
    characterCount = charFiles.length;
    for (const f of charFiles) {
      try {
        parseFile(path.join(charsDir, f), CharacterTemplateSchema);
      } catch (e) {
        errors.push({ file: `characters/${f}`, message: (e as Error).message });
      }
    }
  }

  return {
    id: packId,
    name: manifest?.name ?? packId,
    description: manifest?.description,
    language: manifest?.language ?? "zh",
    startDate: manifest?.startDate,
    valid: errors.length === 0,
    characterCount,
    nodeCount,
    errors,
  };
}

/** 取一张地图的首个 entry 节点 id。 */
export function firstEntryNodeId(map: MapConfig): string {
  const entry = map.nodes.find((n) => n.isEntry);
  if (!entry) {
    throw new Error(
      `map ${map.id} has no entry node — schema invariant violated`,
    );
  }
  return entry.id;
}

/** Load economy config from manifest, falling back to defaults. */
export function loadEconomyConfig(mapId: string): EconomyConfig {
  const manifest = loadManifest(mapId);
  return manifest.economy ?? DEFAULT_ECONOMY_CONFIG;
}

/** Resolve a profession string to its income tier (0-3). */
export function resolveIncomeLevel(profession: string): number {
  return PROFESSION_INCOME_TIERS[profession] ?? 0;
}
