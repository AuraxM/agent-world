# Language Per Map Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bind LLM output language to map packs instead of global settings, and replace world reset tab with full world management panel.

**Architecture:** Directory-based map packs (`configs/maps/<id>/manifest.json` + `map.json` + `characters/`). Language resolved from `loadManifest(world.mapId).language` at decision time. New admin APIs for listing/validating packs and loading worlds. `mapId` persisted in worlds DB table.

**Tech Stack:** TypeScript, Zod, Drizzle ORM (SQLite), Next.js App Router, React

---

### Task 1: Migrate config file structure

**Files:**
- Create: `configs/maps/yu-no-tani/manifest.json`
- Create: `configs/maps/yu-no-tani/map.json` (from `configs/maps/yu-no-tani.json`)
- Create: `configs/maps/yu-no-tani/characters/*.json` (from `configs/characters/*.json`)
- Delete: `configs/maps/yu-no-tani.json`
- Delete: `configs/characters/*.json`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p configs/maps/yu-no-tani/characters
mv configs/maps/yu-no-tani.json configs/maps/yu-no-tani/map.json
mv configs/characters/*.json configs/maps/yu-no-tani/characters/
```

- [ ] **Step 2: Strip `name` and `description` from map.json**

The file `configs/maps/yu-no-tani/map.json` currently has `name` and `description` at top level. Remove those two keys, keeping only `id` and `nodes`:

```json
{
  "id": "yu-no-tani",
  "nodes": [
    ...
  ]
}
```

- [ ] **Step 3: Create manifest.json**

Write `configs/maps/yu-no-tani/manifest.json`:

```json
{
  "id": "yu-no-tani",
  "name": "汤之谷",
  "description": "深山幽谷间一座温泉观光乡。县道尽头巴士站外，石板温泉街蜿蜒沿溪，老旅馆、公共浴场、土产店、酒馆鳞次栉比。冬季积雪盈尺时游客稀少，春樱秋叶两季最为热闹。外界来的人多半因了观光宣传册上那张'汤烟中的灯笼街'照片——来了才发现，照片没骗人。",
  "language": "zh"
}
```

- [ ] **Step 4: Verify structure**

```bash
ls configs/maps/yu-no-tani/
# Expected: manifest.json  map.json  characters/
ls configs/maps/yu-no-tani/characters/ | wc -l
# Expected: 20
```

- [ ] **Step 5: Commit**

```bash
git add configs/maps/yu-no-tani/ configs/characters/ configs/maps/yu-no-tani.json
git commit -m "refactor: migrate configs to directory-based map pack structure"
```

---

### Task 2: Update type definitions

**Files:**
- Modify: `src/config/types.ts`
- Modify: `src/domain/types.ts`

- [ ] **Step 1: Add Language and Manifest to `src/config/types.ts`**

After the imports, add:

```ts
/** 地图包支持的输出语言。 */
export type Language = "zh" | "en" | "ja";

export const SUPPORTED_LANGUAGES: readonly Language[] = ["zh", "en", "ja"];
```

Replace the `MapConfig` interface to remove `name` and `description`:

```ts
/** 一份地图配置文件 = 一棵节点树。name/description 移到 manifest。 */
export interface MapConfig {
  id: string;
  nodes: MapNodeConfig[];
}
```

After `MapConfig`, add:

```ts
/** 地图包 manifest —— 每个地图包目录下的 manifest.json。 */
export interface Manifest {
  id: string;
  name: string;
  description?: string;
  language: Language;
}
```

- [ ] **Step 2: Add `mapId` to World in `src/domain/types.ts`**

```ts
export interface World {
  id: string;
  name: string;
  mapId: string;
  currentTick: Tick;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/config/types.ts src/domain/types.ts
git commit -m "feat: add Manifest/Language types, add mapId to World"
```

---

### Task 3: Update DB schema & migration for mapId

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/migrate.ts`

- [ ] **Step 1: Add `mapId` column to `worlds` table in `src/db/schema.ts`**

After the `name` line, add:

```ts
mapId: text("map_id").notNull(),
```

The worlds table should now be:

```ts
export const worlds = sqliteTable("worlds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mapId: text("map_id").notNull(),
  currentTick: integer("current_tick").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});
```

- [ ] **Step 2: Add migration for `map_id` in `src/db/migrate.ts`**

Add to the `STATEMENTS` array (update the worlds CREATE TABLE):

Change:
```sql
CREATE TABLE IF NOT EXISTS worlds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ...
```

To:
```sql
CREATE TABLE IF NOT EXISTS worlds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    map_id TEXT NOT NULL DEFAULT '',
    ...
```

Also add an ALTER TABLE for existing DBs. Add to the migration after the existing new-column blocks:

```ts
const WORLDS_NEW_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "map_id", ddl: "ALTER TABLE worlds ADD COLUMN map_id TEXT NOT NULL DEFAULT ''" },
];
```

And in the transaction, add a parallel block:

```ts
const worldCols = sqlite
  .prepare(`PRAGMA table_info(worlds)`)
  .all() as { name: string }[];
const haveWorldCols = new Set(worldCols.map((c) => c.name));
for (const col of WORLDS_NEW_COLUMNS) {
  if (!haveWorldCols.has(col.name)) sqlite.exec(col.ddl);
}
```

- [ ] **Step 3: Run the migration**

```bash
npx tsx src/db/migrate.ts
```

Expected: `✓ DB migrated at ./data/agent-world.db`

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts src/db/migrate.ts
git commit -m "feat: add map_id column to worlds table"
```

---

### Task 4: Update config schemas

**Files:**
- Modify: `src/config/schemas.ts`

- [ ] **Step 1: Add ManifestSchema and update MapConfigSchema**

In `src/config/schemas.ts`:

Add import for Manifest:
```ts
import type { Manifest, MapConfig, CharacterTemplate, MapNodeConfig } from "./types";
```

Add after the existing `MapNodeConfigSchema`:

```ts
export const ManifestSchema: z.ZodType<Manifest> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  language: z.enum(["zh", "en", "ja"]),
});
```

Replace `MapConfigSchema` to remove `name` and `description`:

```ts
export const MapConfigSchema: z.ZodType<MapConfig> = z
  .object({
    id: z.string().min(1),
    nodes: z.array(MapNodeConfigSchema).min(1),
  })
  .superRefine((cfg, ctx) => {
    // ... (existing validation — keep unchanged)
  });
```

(The `.superRefine` block stays identical — only the `.object()` part changes.)

- [ ] **Step 2: Commit**

```bash
git add src/config/schemas.ts
git commit -m "feat: add ManifestSchema, strip name/description from MapConfigSchema"
```

---

### Task 5: Rewrite config loader

**Files:**
- Create: `src/config/loader-types.ts`
- Modify: `src/config/loader.ts`
- Modify: `src/config/loader.test.ts`

- [ ] **Step 1: Create `src/config/loader-types.ts`**

```ts
import type { Language } from "./types";

export interface PackValidation {
  id: string;
  name: string;
  description?: string;
  language: Language;
  valid: boolean;
  characterCount: number;
  nodeCount: number;
  errors: { file: string; message: string }[];
}
```

- [ ] **Step 2: Rewrite `src/config/loader.ts`**

Replace entire file with:

```ts
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

function configsRoot(): string {
  return (
    process.env.AGENT_WORLD_CONFIGS_DIR ??
    path.resolve(process.cwd(), "configs")
  );
}

function mapsRoot(): string {
  return path.join(configsRoot(), "maps");
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

/** 列举所有地图包 id（扫描 configs/maps/ 下的子目录）。 */
export function listMapPackIds(): string[] {
  const root = mapsRoot();
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/** 加载 manifest.json，校验 id 与目录名一致。 */
export function loadManifest(packId: string): Manifest {
  const file = path.join(mapsRoot(), packId, "manifest.json");
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
  const file = path.join(mapsRoot(), packId, "map.json");
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
  const dir = path.join(mapsRoot(), packId, "characters");
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

/** 按 id 在所有包中查找单个角色。 */
export function loadCharacter(id: string): CharacterTemplate {
  for (const packId of listMapPackIds()) {
    try {
      const chars = loadCharactersForMap(packId);
      const found = chars.find((c) => c.id === id);
      if (found) return found;
    } catch {
      // skip failed packs
    }
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
  }

  const charsDir = path.join(mapsRoot(), packId, "characters");
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
```

- [ ] **Step 3: Rewrite `src/config/loader.test.ts`**

Replace entire file with:

```ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  firstEntryNodeId,
  listMapPackIds,
  loadAllCharacters,
  loadAllMaps,
  loadCharacter,
  loadCharactersForMap,
  loadManifest,
  loadMap,
  validateMapPack,
} from "./loader";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "agent-world-cfg-"));
  mkdirSync(path.join(tmp, "maps"));
  process.env.AGENT_WORLD_CONFIGS_DIR = tmp;
});

afterEach(() => {
  delete process.env.AGENT_WORLD_CONFIGS_DIR;
  rmSync(tmp, { recursive: true, force: true });
});

const validMap = {
  id: "tiny",
  nodes: [
    {
      id: "root",
      parentId: null,
      name: "根节点",
      description: "",
      tags: ["public", "outdoor"],
      capacity: null,
      privacy: "public",
      visibleFromParent: true,
      shortcuts: [],
      isEntry: true,
    },
  ],
};

const validManifest = {
  id: "tiny",
  name: "小镇",
  description: "一个测试小镇",
  language: "zh",
};

const validChar = {
  id: "char-test",
  name: "测试君",
  age: 25,
  gender: "male" as const,
  profession: "farmer" as const,
  origin: "local" as const,
  biography: "私はテストキャラクターです。",
  personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
  abilities: [],
  relations: {},
};

function writePack(
  packId: string,
  manifest: object,
  map: object,
  chars: Record<string, object> = {},
) {
  const dir = path.join(tmp, "maps", packId);
  mkdirSync(path.join(dir, "characters"), { recursive: true });
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest), "utf8");
  writeFileSync(path.join(dir, "map.json"), JSON.stringify(map), "utf8");
  for (const [charId, data] of Object.entries(chars)) {
    writeFileSync(
      path.join(dir, "characters", `${charId}.json`),
      JSON.stringify(data),
      "utf8",
    );
  }
}

describe("listMapPackIds", () => {
  it("returns empty when no packs", () => {
    expect(listMapPackIds()).toEqual([]);
  });

  it("lists pack directory names sorted", () => {
    writePack("tiny", validManifest, validMap);
    writePack("big", { ...validManifest, id: "big" }, { ...validMap, id: "big" });
    expect(listMapPackIds()).toEqual(["big", "tiny"]);
  });
});

describe("loadManifest", () => {
  it("loads a valid manifest", () => {
    writePack("tiny", validManifest, validMap);
    const m = loadManifest("tiny");
    expect(m.id).toBe("tiny");
    expect(m.language).toBe("zh");
  });

  it("rejects manifest.id ≠ directory name", () => {
    writePack("tiny", { ...validManifest, id: "wrong" }, validMap);
    expect(() => loadManifest("tiny")).toThrow(/does not match directory name/);
  });

  it("rejects invalid language", () => {
    writePack("tiny", { ...validManifest, language: "fr" }, validMap);
    expect(() => loadManifest("tiny")).toThrow(/language/);
  });
});

describe("loadMap", () => {
  it("loads a valid map", () => {
    writePack("tiny", validManifest, validMap);
    const m = loadMap("tiny");
    expect(m.id).toBe("tiny");
    expect(m.nodes).toHaveLength(1);
  });

  it("rejects map with no entry node", () => {
    writePack("tiny", validManifest, {
      ...validMap,
      nodes: [{ ...validMap.nodes[0], isEntry: false }],
    });
    expect(() => loadMap("tiny")).toThrow(/at least one entry node/);
  });

  it("rejects map.id ≠ directory name", () => {
    writePack("tiny", validManifest, { ...validMap, id: "wrong" });
    expect(() => loadMap("tiny")).toThrow(/does not match directory name/);
  });

  it("rejects duplicate node ids", () => {
    writePack("tiny", validManifest, {
      ...validMap,
      nodes: [validMap.nodes[0], { ...validMap.nodes[0] }],
    });
    expect(() => loadMap("tiny")).toThrow(/duplicate node id/);
  });

  it("rejects bad parentId", () => {
    writePack("tiny", validManifest, {
      ...validMap,
      nodes: [
        validMap.nodes[0],
        { ...validMap.nodes[0], id: "child", parentId: "ghost" },
      ],
    });
    expect(() => loadMap("tiny")).toThrow(/missing node: ghost/);
  });
});

describe("loadCharactersForMap", () => {
  it("loads characters from pack directory", () => {
    writePack("tiny", validManifest, validMap, { "char-test": validChar });
    const chars = loadCharactersForMap("tiny");
    expect(chars).toHaveLength(1);
    expect(chars[0].id).toBe("char-test");
  });

  it("returns empty array when no characters dir", () => {
    writePack("tiny", validManifest, validMap);
    expect(loadCharactersForMap("tiny")).toEqual([]);
  });
});

describe("loadAllCharacters", () => {
  it("loads characters from all packs", () => {
    writePack("a", validManifest, validMap, { "char-x": validChar });
    writePack(
      "b",
      { ...validManifest, id: "b" },
      { ...validMap, id: "b" },
      { "char-y": { ...validChar, id: "char-y" } },
    );
    expect(loadAllCharacters()).toHaveLength(2);
  });
});

describe("loadCharacter", () => {
  it("finds character by id across packs", () => {
    writePack("a", validManifest, validMap, { "char-x": validChar });
    writePack(
      "b",
      { ...validManifest, id: "b" },
      { ...validMap, id: "b" },
      { "char-y": { ...validChar, id: "char-y" } },
    );
    expect(loadCharacter("char-x").id).toBe("char-x");
    expect(loadCharacter("char-y").id).toBe("char-y");
  });

  it("throws for missing id", () => {
    writePack("tiny", validManifest, validMap);
    expect(() => loadCharacter("nope")).toThrow(/character template not found/);
  });

  it("rejects character with missing biography", () => {
    const { biography: _, ...noBio } = validChar;
    writePack("tiny", validManifest, validMap, { "no-bio": noBio });
    expect(() => loadCharacter("no-bio")).toThrow(/biography/);
  });

  it("rejects character with out-of-range personality", () => {
    writePack("tiny", validManifest, validMap, {
      "bad": { ...validChar, personality: { ei: 9, sn: 0, tf: 0, jp: 0 } },
    });
    expect(() => loadCharacter("bad")).toThrow(/personality/);
  });
});

describe("loadAllMaps", () => {
  it("loads maps from all packs", () => {
    writePack("tiny", validManifest, validMap);
    writePack("big", { ...validManifest, id: "big" }, { ...validMap, id: "big" });
    const maps = loadAllMaps();
    expect(maps).toHaveLength(2);
    expect(maps.map((m) => m.id).sort()).toEqual(["big", "tiny"]);
  });
});

describe("validateMapPack", () => {
  it("reports valid pack", () => {
    writePack("tiny", validManifest, validMap, { "char-test": validChar });
    const v = validateMapPack("tiny");
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.language).toBe("zh");
    expect(v.nodeCount).toBe(1);
    expect(v.characterCount).toBe(1);
  });

  it("collects partial errors without throwing", () => {
    const dir = path.join(tmp, "maps", "broken");
    mkdirSync(path.join(dir, "characters"), { recursive: true });
    writeFileSync(path.join(dir, "manifest.json"), "{bad json", "utf8");
    writeFileSync(path.join(dir, "map.json"), "{}", "utf8");
    writeFileSync(
      path.join(dir, "characters", "bad.json"),
      JSON.stringify({ id: "bad" }),
      "utf8",
    );
    const v = validateMapPack("broken");
    expect(v.valid).toBe(false);
    expect(v.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("handles missing characters directory", () => {
    const dir = path.join(tmp, "maps", "nochars");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(validManifest), "utf8");
    writeFileSync(path.join(dir, "map.json"), JSON.stringify(validMap), "utf8");
    const v = validateMapPack("nochars");
    expect(v.valid).toBe(true);
    expect(v.characterCount).toBe(0);
  });

  it("preserves manifest info even when invalid", () => {
    writePack("tiny", validManifest, {
      ...validMap,
      nodes: [{ ...validMap.nodes[0], isEntry: false }],
    });
    const v = validateMapPack("tiny");
    expect(v.valid).toBe(false);
    expect(v.name).toBe("小镇");
    expect(v.nodeCount).toBe(1);
  });
});

describe("firstEntryNodeId", () => {
  it("returns entry node id", () => {
    writePack("tiny", validManifest, validMap);
    expect(firstEntryNodeId(loadMap("tiny"))).toBe("root");
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/config/loader.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/config/loader-types.ts src/config/loader.ts src/config/loader.test.ts
git commit -m "feat: rewrite loader for directory-based map packs"
```

---

### Task 6: Remove language from global settings

**Files:**
- Modify: `src/engine/settings.ts`
- Modify: `src/app/api/admin/settings/route.ts`
- Modify: `src/app/admin/page.tsx` (partial — only language dropdown)

- [ ] **Step 1: Clean `src/engine/settings.ts`**

Remove:
- Lines 6–8: `export type Language`, `SUPPORTED_LANGUAGES`
- Lines 12: `language: Language` from `Settings` interface
- Lines 24: `language: "zh"` from default `read()`
- Lines 38–48: `getLanguage()`, `setLanguage()`, `isSupportedLanguage()`

The file should end up ~30 lines, keeping only `thinkingEnabled` logic:

```ts
interface Settings {
  thinkingEnabled: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __agent_world_settings__: Settings | undefined;
}

function read(): Settings {
  if (!globalThis.__agent_world_settings__) {
    globalThis.__agent_world_settings__ = {
      thinkingEnabled: true,
    };
  }
  return globalThis.__agent_world_settings__;
}

export function getThinkingEnabled(): boolean {
  return read().thinkingEnabled;
}

export function setThinkingEnabled(v: boolean): void {
  read().thinkingEnabled = v;
}
```

- [ ] **Step 2: Update `src/app/api/admin/settings/route.ts`**

Remove language handling from GET and POST:

```ts
import {
  getThinkingEnabled,
  setThinkingEnabled,
} from "@/engine/settings";

export async function GET() {
  return Response.json({
    thinkingEnabled: getThinkingEnabled(),
  });
}

export async function POST(request: Request) {
  let body: { thinkingEnabled?: boolean; language?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (typeof body.thinkingEnabled === "boolean") {
    setThinkingEnabled(body.thinkingEnabled);
  }
  // language field is now ignored — language is determined by the map pack

  return Response.json({
    thinkingEnabled: getThinkingEnabled(),
  });
}
```

- [ ] **Step 3: Remove language UI from `src/app/admin/page.tsx`**

In `AdminContent`:
- Remove `language` and `languageLoading` state (lines 146–147)
- Remove `language` fetch from `useEffect` (lines 154–156)
- Remove `handleLanguageChange` function (lines 179–195)
- Remove the `<select>` element for language in the header (lines 204–218)

After removal, the header should only have: title, thinkingEnabled toggle, and "返回游戏" link.

- [ ] **Step 4: Check for remaining references**

```bash
grep -rn "getLanguage\|setLanguage\|isSupportedLanguage\|SUPPORTED_LANGUAGES" src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v ".test.ts"
```

Expected: Zero matches (or only in newly added files from Task 2).

- [ ] **Step 5: Commit**

```bash
git add src/engine/settings.ts src/app/api/admin/settings/route.ts src/app/admin/page.tsx
git commit -m "feat: remove language from global settings and admin panel"
```

---

### Task 7: Pass language through LLM call chain via mapId

**Files:**
- Modify: `src/llm/decide.ts`
- Modify: `src/engine/dialog.ts`
- Modify: `src/engine/tick.ts`
- Modify: `src/engine/decideForCharacter.ts`

- [ ] **Step 1: Update `src/llm/decide.ts`**

Remove `import { getLanguage, getThinkingEnabled } from "@/engine/settings";`
Add `import { loadManifest } from "@/config/loader";`

Update each LLM entry point to accept `language` as a parameter instead of calling `getLanguage()`:

**`llmDecide`** — extract `getLanguage()` from `callLLM`:
```ts
export const llmDecide: DecideFn = async (input) => {
  if (!hasApiKey()) {
    return waitFallback(input, "没有激活的 LLM provider");
  }
  try {
    return await callLLM(input);
  } catch (err) {
    return waitFallback(input, errorMessage(err));
  }
};
```
Remove the `language` local var from `callLLM` — it will receive language as a parameter.

Wait, `callLLM` doesn't accept language as a parameter now. Change it:
```ts
async function callLLM(input: DecideInput, language: string): Promise<Action> {
```

And `llmDecide` needs to get language from `input`. But `DecideInput` doesn't have `language`. I'll add it.

Actually the cleanest approach: add `language` to `DecideInput` so it flows through naturally.

In `src/engine/tick.ts`, update `DecideInput`:
```ts
export interface DecideInput {
  // ... existing fields
  language: string;
}
```

Then in `src/llm/decide.ts`, `callLLM` uses `input.language`:
```ts
async function callLLM(input: DecideInput): Promise<Action> {
  const client = getLLMClient();
  const language = input.language;
  // ... rest unchanged
}
```

Do the same for all other entry points — change from calling `getLanguage()` to accepting `language` in the input.

**`llmAcceptDecide`**: Add `language?: string` to `AcceptDecisionInput`, default to `"zh"`:
```ts
export interface AcceptDecisionInput {
  // ... existing fields
  language?: string;
}
```
Then use `input.language ?? "zh"` instead of `getLanguage()`.

**`llmDialogTurn`**: Add `language?: string` to `DialogTurnInput`:
```ts
export interface DialogTurnInput {
  // ... existing fields
  language?: string;
}
```
Use `input.language ?? "zh"`.

**`llmDialogSummarize`**: Same pattern — add `language?: string` to `DialogSummaryInput`.

**`llmSalvageDecide`**: Add `language?: string` to `DecideInput`, use `input.language ?? "zh"`.

- [ ] **Step 2: Update `src/engine/dialog.ts`**

Add `language` to the decide function type signatures and `RunDialogPhaseInput`.

Add `language?: string` to each interface — `AcceptDecideFn` input, `TurnDecideFn` input, `SummaryDecideFn` input. Or better, just add `language` to `RunDialogPhaseInput` and pass it through to the callbacks:

```ts
export interface RunDialogPhaseInput {
  // ... existing
  language: string;
}
```

Then in `runDialogPhase`, pass `language` to each decide call:

In the accept decide call (line 382):
```ts
language: input.language,
```

In the turn decide call (line 291):
```ts
language: input.language,
```

In the summary decide call (line 256):
```ts
language: input.language,
```

In the salvage decide call (line 361):
```ts
// Pass language through salvageDecide input
```

Update `SalvageDecideFn` input to include `language?: string`.

- [ ] **Step 3: Update `src/engine/store.ts` — include mapId in World construction**

In `loadWorld()`, add `mapId` to the World object:

```ts
const world: World = {
  id: w.id,
  name: w.name,
  mapId: w.mapId,    // NEW
  currentTick: w.currentTick,
  createdAt: w.createdAt.getTime(),
  updatedAt: w.updatedAt.getTime(),
};
```

In `saveWorld()`, add `mapId` to the update set (for completeness):

```ts
tx
  .update(schema.worlds)
  .set({
    mapId: loaded.world.mapId,  // NEW
    currentTick: loaded.world.currentTick,
    updatedAt: now,
  })
```

- [ ] **Step 4: Update `src/engine/tick.ts`**

Add `language` to resolve and pass through:

```ts
import { loadAllCharacters, loadManifest } from "@/config/loader";
```

At the start of `tick()`:
```ts
export async function tick(
  worldId: string,
  options: TickOptions = {},
): Promise<TickResult> {
  const loaded = loadWorld(worldId);
  const { world, nodes, characters } = loaded;
  const language = loadManifest(world.mapId).language;
```

Update `DecideFn` call to include language — `decideFn` receives `DecideInput` which now includes `language`:

In the decision task (line 432), add `language` to the decide input:
```ts
action = await decideFn({
  // ... existing
  language,
});
```

Update the dialog phase call to pass `language`:
```ts
const dialogResult = await runDialogPhase({
  // ... existing
  language,
});
```

Update the salvage decide wrapper to pass language:
```ts
salvageDecide: async (input) => {
  // ... existing
  try {
    return await llmSalvageDecide({
      // ... existing
      language,
    });
  // ...
```

- [ ] **Step 5: Update `src/engine/decideForCharacter.ts`**

Remove `import { getLanguage, getThinkingEnabled } from "./settings";`
Add `import { loadAllCharacters, loadManifest } from "@/config/loader";`

Replace `const language = getLanguage();` with `const language = loadManifest(world.mapId).language;`

But `world` in `decideForCharacter` comes from `loadWorld(worldId)` which returns `LoadedWorld`. The world object now has `mapId`. So:
```ts
const language = loadManifest(world.mapId).language;
```

Also pass `language` to `buildSystemPrompt` and `buildUserPrompt` (they already accept it).

- [ ] **Step 6: Verify compilation**

```bash
npx tsc --noEmit 2>&1 | head -80
```

Fix any remaining errors referencing old `getLanguage()` or missing `mapId` fields.

- [ ] **Step 7: Commit**

```bash
git add src/llm/decide.ts src/engine/dialog.ts src/engine/store.ts src/engine/tick.ts src/engine/decideForCharacter.ts
git commit -m "feat: resolve language from mapId manifest at decision time"
```

---

### Task 8: Update createWorld to use new loader + set mapId

**Files:**
- Modify: `src/engine/createWorld.ts`
- Modify: `src/app/api/worlds/route.ts`

- [ ] **Step 1: Update `src/engine/createWorld.ts`**

In the transaction, write `mapId` when inserting world:

```ts
tx.insert(schema.worlds)
  .values({
    id: worldId,
    name,
    mapId,       // NEW
    currentTick: 0,
    createdAt: now,
    updatedAt: now,
  })
  .run();
```

Add `mapId` to the return value:
```ts
return {
  worldId,
  mapId,
  characterIds: resolved.map((r) => r.tpl.id),
  defaultEntryNodeId: defaultEntry,
};
```

No other changes needed — `loadMap()` and `loadCharacter()` already use the new signatures and work correctly (they take `packId` directly).

- [ ] **Step 2: Update `src/app/api/worlds/route.ts`**

No functional changes needed here — the API receives `mapId` from the body and passes it to `createWorldFromConfig()`. The body schema is fine.

- [ ] **Step 3: Commit**

```bash
git add src/engine/createWorld.ts
git commit -m "feat: write mapId to world record on creation"
```

---

### Task 9: New admin API routes

**Files:**
- Create: `src/app/api/admin/map-packs/route.ts`
- Create: `src/app/api/admin/worlds/load/route.ts`
- Delete: `src/app/api/admin/reset/route.ts`

- [ ] **Step 1: Create `src/app/api/admin/map-packs/route.ts`**

```ts
import { db, schema } from "@/db/client";
import { desc } from "drizzle-orm";
import {
  listMapPackIds,
  validateMapPack,
} from "@/config/loader";

export async function GET() {
  try {
    const packIds = listMapPackIds();
    const packs = packIds.map((id) => validateMapPack(id));

    // Check for active world (most recently updated)
    const worlds = db
      .select()
      .from(schema.worlds)
      .orderBy(desc(schema.worlds.updatedAt))
      .limit(1)
      .all();

    let activeWorld = null;
    if (worlds.length > 0) {
      const w = worlds[0];
      const charCount = db
        .select()
        .from(schema.characters)
        .where(
          // drizzle where eq
          // Use raw SQL or drizzle helper
        )
        .all().length;
      // Actually, use a simpler approach:
      const allChars = db.select().from(schema.characters).all();
      const worldChars = allChars.filter((c: { world_id: string }) => c.world_id === w.id);

      activeWorld = {
        id: w.id,
        mapId: w.mapId || "",
        name: w.name,
        currentTick: w.currentTick,
        characterCount: worldChars.length,
      };
    }

    return Response.json({ packs, activeWorld });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
```

Wait, the drizzle query needs imports. Let me fix it:

```ts
import { eq, desc } from "drizzle-orm";
import { db, schema } from "@/db/client";
import {
  listMapPackIds,
  validateMapPack,
} from "@/config/loader";

export async function GET() {
  try {
    const packIds = listMapPackIds();
    const packs = packIds.map((id) => validateMapPack(id));

    const worlds = db
      .select()
      .from(schema.worlds)
      .orderBy(desc(schema.worlds.updatedAt))
      .limit(1)
      .all();

    let activeWorld: {
      id: string;
      mapId: string;
      name: string;
      currentTick: number;
      characterCount: number;
    } | null = null;

    if (worlds.length > 0) {
      const w = worlds[0];
      const chars = db
        .select()
        .from(schema.characters)
        .where(eq(schema.characters.worldId, w.id))
        .all();

      activeWorld = {
        id: w.id,
        mapId: w.mapId,
        name: w.name,
        currentTick: w.currentTick,
        characterCount: chars.length,
      };
    }

    return Response.json({ packs, activeWorld });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `src/app/api/admin/worlds/load/route.ts`**

```ts
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { createWorldFromConfig, type CastMember } from "@/engine/createWorld";
import {
  loadCharactersForMap,
  validateMapPack,
} from "@/config/loader";

const VitalsOverride = z
  .object({
    hunger: z.number().int().nonnegative().optional(),
    fatigue: z.number().int().nonnegative().optional(),
  })
  .optional();

const CastMemberSchema = z.object({
  characterId: z.string().min(1),
  locationId: z.string().min(1).optional(),
  vitals: VitalsOverride,
});

const BodySchema = z.object({
  mapId: z.string().min(1),
  cast: z.array(CastMemberSchema).optional(),
});

const DEFAULT_WORLD_ID = "world-default";

export async function POST(request: Request) {
  let json: unknown = {};
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      json = await request.json();
    }
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { mapId, cast: castInput } = parsed.data;

  // Validate pack format first
  const validation = validateMapPack(mapId);
  if (!validation.valid) {
    return Response.json(
      { error: "map pack validation failed", errors: validation.errors },
      { status: 400 },
    );
  }

  try {
    // Build cast: if not provided, use all characters in the pack
    let cast: CastMember[];
    if (castInput) {
      cast = castInput.map((c) => ({
        characterId: c.characterId,
        locationId: c.locationId,
        vitals: c.vitals,
      }));
    } else {
      const allChars = loadCharactersForMap(mapId);
      cast = allChars.map((c) => ({
        characterId: c.id,
      }));
    }

    const worldId = DEFAULT_WORLD_ID;

    // Delete existing world
    db.delete(schema.worlds).where(eq(schema.worlds.id, worldId)).run();

    const result = createWorldFromConfig({
      worldId,
      name: validation.name,
      mapId,
      cast,
    });

    globalThis.__agent_world_llm__ = undefined;

    return Response.json({
      ok: true,
      world: {
        id: result.worldId,
        mapId: result.mapId,
        characterIds: result.characterIds,
        defaultEntryNodeId: result.defaultEntryNodeId,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.startsWith("map not found") ||
      message.startsWith("character template not found")
    ) {
      return Response.json({ error: message }, { status: 404 });
    }
    if (
      message.startsWith("world already exists") ||
      message.startsWith("duplicate cast member") ||
      message.includes("locationId not in map") ||
      message.startsWith("config invalid")
    ) {
      return Response.json({ error: message }, { status: 400 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/map-packs/route.ts src/app/api/admin/worlds/load/route.ts
git rm src/app/api/admin/reset/route.ts
git commit -m "feat: add map-packs list API and worlds/load API"
```

---

### Task 10: Update admin page — World Management tab

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Rename reset tab to world management and replace content**

Change:
- `type Tab = "providers" | "reset" | "maps";` → `type Tab = "providers" | "worlds" | "maps";`
- `TAB_LABELS.reset = "重置世界"` → `TAB_LABELS.worlds = "世界管理"`
- Replace `ResetTab` component with `WorldsTab`

**`WorldsTab` component:**

```tsx
interface PackInfo {
  id: string;
  name: string;
  description?: string;
  language: string;
  valid: boolean;
  characterCount: number;
  nodeCount: number;
  errors: { file: string; message: string }[];
}

interface ActiveWorldInfo {
  id: string;
  mapId: string;
  name: string;
  currentTick: number;
  characterCount: number;
}

function WorldsTab() {
  const [packs, setPacks] = useState<PackInfo[]>([]);
  const [activeWorld, setActiveWorld] = useState<ActiveWorldInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingPack, setLoadingPack] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  const fetchPacks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/map-packs");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "fetch failed");
      setPacks(data.packs);
      setActiveWorld(data.activeWorld);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPacks();
  }, [fetchPacks]);

  async function handleLoadPack(mapId: string) {
    if (!confirm(`将清空当前世界并加载「${mapId}」地图包。确定？`)) return;
    setLoadingPack(mapId);
    setError("");
    setResult("");
    try {
      const res = await fetch("/api/admin/worlds/load", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mapId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "load failed");
      setResult(`世界已加载：${data.world.mapId}，${data.world.characterIds.length} 名角色`);
      await fetchPacks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setLoadingPack(null);
    }
  }

  const LANGUAGE_LABELS: Record<string, string> = {
    zh: "简体中文",
    en: "English",
    ja: "日本語",
  };

  return (
    <div className="max-w-3xl space-y-4">
      <h2 className="text-game-base tracking-widest text-(--color-pixel-muted)">
        世界管理
      </h2>

      {error && (
        <div className="px-3 py-2 text-game-xs text-(--color-pixel-danger) border border-(--color-pixel-danger) bg-(--color-pixel-bg-2)">
          {error}
        </div>
      )}
      {result && (
        <div className="px-3 py-2 text-game-xs text-(--color-pixel-success) border border-(--color-pixel-success) bg-(--color-pixel-bg-2)">
          {result}
        </div>
      )}

      {/* active world */}
      <PixelFrame tone={activeWorld ? "accent" : "default"}>
        <div className="p-3 space-y-2">
          <div className="text-game-sm text-(--color-pixel-muted)">当前运行中的世界</div>
          {loading ? (
            <div className="text-game-xs text-(--color-pixel-muted)">加载中…</div>
          ) : activeWorld ? (
            <div className="text-game-xs space-y-1">
              <div>
                <span className="text-(--color-pixel-fg) font-bold">{activeWorld.name}</span>
                <span className="text-(--color-pixel-muted) ml-2">({activeWorld.id})</span>
              </div>
              <div className="flex gap-4 text-(--color-pixel-muted)">
                <span>地图包: <span className="text-(--color-pixel-fg)">{activeWorld.mapId}</span></span>
                <span>Tick: <span className="text-(--color-pixel-fg)">{activeWorld.currentTick}</span></span>
                <span>角色数: <span className="text-(--color-pixel-fg)">{activeWorld.characterCount}</span></span>
              </div>
            </div>
          ) : (
            <div className="text-game-xs text-(--color-pixel-muted)">
              尚无运行中的世界
            </div>
          )}
        </div>
      </PixelFrame>

      {/* map pack list */}
      <div className="text-game-sm text-(--color-pixel-muted)">可用地图包</div>

      {loading ? (
        <div className="text-game-xs text-(--color-pixel-muted)">加载中…</div>
      ) : packs.length === 0 ? (
        <div className="text-game-xs text-(--color-pixel-muted)">
          未找到任何地图包（检查 configs/maps/ 目录）
        </div>
      ) : (
        packs.map((pack) => (
          <PixelFrame
            key={pack.id}
            tone={pack.valid ? (activeWorld?.mapId === pack.id ? "accent" : "default") : "danger"}
          >
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-game-base text-(--color-pixel-fg) font-bold">
                    {pack.name}
                  </span>
                  <span className="text-game-2xs text-(--color-pixel-muted)">({pack.id})</span>
                  {pack.valid ? (
                    <span className="text-game-2xs text-(--color-pixel-success)">✓</span>
                  ) : (
                    <span className="text-game-2xs text-(--color-pixel-danger)">✗</span>
                  )}
                </div>
                <button
                  onClick={() => handleLoadPack(pack.id)}
                  disabled={!pack.valid || loadingPack === pack.id}
                  className="px-3 py-1 text-game-xs border border-(--color-pixel-accent) text-(--color-pixel-accent) hover:bg-(--color-pixel-bg-2) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingPack === pack.id ? "加载中…" : "加载此包"}
                </button>
              </div>

              {pack.description && (
                <div className="text-game-xs text-(--color-pixel-muted) line-clamp-2">
                  {pack.description}
                </div>
              )}

              <div className="flex gap-4 text-game-2xs text-(--color-pixel-muted)">
                <span>语言: <span className="text-(--color-pixel-fg)">{LANGUAGE_LABELS[pack.language] ?? pack.language}</span></span>
                <span>节点: <span className="text-(--color-pixel-fg)">{pack.nodeCount}</span></span>
                <span>角色: <span className="text-(--color-pixel-fg)">{pack.characterCount}</span></span>
              </div>

              {!pack.valid && pack.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  {pack.errors.map((e, i) => (
                    <div key={i} className="text-game-2xs text-(--color-pixel-danger)">
                      {e.file}: {e.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </PixelFrame>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update tab rendering**

In `AdminContent`, change:
```tsx
<TAB_LABELS.reset = "重置世界">
<TAB_LABELS.worlds = "世界管理">
{tab === "reset" && <ResetTab />}
{tab === "worlds" && <WorldsTab />}
```

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit 2>&1 | head -40
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: replace reset tab with world management panel"
```

---

### Task 11: Update agent-world-config skill

**Files:**
- Modify: `.claude/skills/agent-world-config/skill.md` (or wherever the skill content lives)

- [ ] **Step 1: Add language requirement to the skill workflow**

In step 1 ("Clarify with the user first"), add to the bullet list for maps:
```
- **language** ("zh" | "en" | "ja") — REQUIRED. Ask the user explicitly. Do NOT default.
```

- [ ] **Step 2: Update file structure documentation**

Replace the config structure description:
```
Before: `configs/maps/<map-id>.json` and `configs/characters/<char-id>.json`
After: directory-based packs —
  configs/maps/<pack-id>/
    manifest.json    ← id, name, description, language
    map.json         ← pure node tree (id + nodes, no name/description)
    characters/      ← character templates
```

- [ ] **Step 3: Update validation command**

```bash
tsx .claude/skills/agent-world-config/scripts/validate.ts configs/maps/<pack-id>/manifest.json
tsx .claude/skills/agent-world-config/scripts/validate.ts configs/maps/<pack-id>/map.json
```

And add a pack-level validation script that runs `validateMapPack`.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/agent-world-config/
git commit -m "docs(skill): require explicit language in agent-world-config"
```

---

### Task 12: End-to-end verification

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

All tests must pass.

- [ ] **Step 2: Run type checks**

```bash
npx tsc --noEmit
```

Zero errors.

- [ ] **Step 3: Start dev server and test admin panel**

```bash
npm run dev
# Open /admin → "世界管理" tab
# Verify: map packs listed, validation status shown, load button works
```

- [ ] **Step 4: Verify language flow**

Create a world, run a tick, check that LLM prompts contain the correct language instructions. Verify that changing the manifest's `language` field changes the output language.

- [ ] **Step 5: Commit (if any fixes)**

```bash
git add -A
git commit -m "chore: final cleanup and verification"
```
