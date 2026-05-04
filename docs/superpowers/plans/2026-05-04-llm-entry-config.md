# LLM Entry Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-LLM-entry-point thinking toggle and provider selection, persisted to DB, managed via new admin tab.

**Architecture:** New `llm_entry_configs` table stores per-entry overrides. LLM client cache changes from singleton to Map keyed by provider ID. Each LLM call site reads its entry config before calling. Old global settings and admin toggle removed.

**Tech Stack:** TypeScript, Drizzle ORM (better-sqlite3), Next.js App Router, React (client components)

---

### Task 1: Add `llm_entry_configs` table to schema

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/migrate.ts`
- Modify: `src/db/client.ts`

- [ ] **Step 1: Add table definition to schema.ts**

After the `llmProviders` table definition (line 163), add:

```typescript
export const llmEntryConfigs = sqliteTable(
  "llm_entry_configs",
  {
    id: text("id").primaryKey(), // entry slug: "decide", "dialog_turn", etc.
    providerId: text("provider_id").references(() => llmProviders.id, { onDelete: "set null" }),
    thinkingEnabled: integer("thinking_enabled", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
);
```

- [ ] **Step 2: Add CREATE TABLE to migrate.ts**

In the `STATEMENTS` array (before the closing `];`), add:

```typescript
`CREATE TABLE IF NOT EXISTS llm_entry_configs (
  id TEXT PRIMARY KEY,
  provider_id TEXT REFERENCES llm_providers(id) ON DELETE SET NULL,
  thinking_enabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
)`,
```

- [ ] **Step 3: Add auto-migration to db/client.ts**

After the `WORLD_MIGRATIONS` constant (before `function createDb()`), add:

```typescript
const ENTRY_CONFIG_MIGRATIONS: Array<[string, string]> = [
  ["llm_entry_configs", `CREATE TABLE IF NOT EXISTS llm_entry_configs (
    id TEXT PRIMARY KEY,
    provider_id TEXT REFERENCES llm_providers(id) ON DELETE SET NULL,
    thinking_enabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  )`],
];
```

In `ensureColumns()`, add after the world migrations block:

```typescript
const tables = sqlite
  .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
  .all() as { name: string }[];
const haveTables = new Set(tables.map((t) => t.name));
for (const [tableName, ddl] of ENTRY_CONFIG_MIGRATIONS) {
  if (!haveTables.has(tableName)) sqlite.exec(ddl);
}
```

- [ ] **Step 4: Run migration and verify**

```bash
npm run db:migrate
```

Expected: outputs `llm_entry_configs` in the table list.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/migrate.ts src/db/client.ts
git commit -m "feat: add llm_entry_configs table to schema and migration"
```

---

### Task 2: Add storage functions for entry configs

**Files:**
- Modify: `src/llm/providers.ts`

- [ ] **Step 1: Add `getDefaultProviderId()` and entry config functions**

At the end of `src/llm/providers.ts`, add:

```typescript
import { eq } from "drizzle-orm";

export interface EntryConfig {
  entryName: string;
  providerId: string | null;
  thinkingEnabled: boolean;
}

/** Returns the active provider's ID, or throws if none set. */
export function getDefaultProviderId(): string {
  const row = db
    .select({ id: schema.llmProviders.id })
    .from(schema.llmProviders)
    .where(eq(schema.llmProviders.isActive, true))
    .get();
  if (!row) throw new Error("没有激活的 LLM provider");
  return row.id;
}

/** Get a single entry config. Returns defaults (null provider, thinking off) if no row. */
export function getEntryConfig(entryName: string): EntryConfig {
  const row = db
    .select()
    .from(schema.llmEntryConfigs)
    .where(eq(schema.llmEntryConfigs.id, entryName))
    .get();
  if (!row) return { entryName, providerId: null, thinkingEnabled: false };
  return {
    entryName: row.id,
    providerId: row.providerId,
    thinkingEnabled: row.thinkingEnabled,
  };
}

/** List all entry configs. Missing entries are returned with defaults. */
export function listEntryConfigs(allEntryNames: string[]): EntryConfig[] {
  const rows = db.select().from(schema.llmEntryConfigs).all();
  const map = new Map(rows.map((r) => [r.id, { entryName: r.id, providerId: r.providerId, thinkingEnabled: r.thinkingEnabled }]));
  return allEntryNames.map((name) => map.get(name) ?? { entryName: name, providerId: null, thinkingEnabled: false });
}

/** Batch upsert entry configs. */
export function batchUpsertEntryConfigs(configs: { entryName: string; providerId: string | null; thinkingEnabled: boolean }[]): void {
  const now = new Date();
  const tx = db.transaction(() => {
    for (const c of configs) {
      const existing = db
        .select({ id: schema.llmEntryConfigs.id })
        .from(schema.llmEntryConfigs)
        .where(eq(schema.llmEntryConfigs.id, c.entryName))
        .get();
      if (existing) {
        db.update(schema.llmEntryConfigs)
          .set({ providerId: c.providerId, thinkingEnabled: c.thinkingEnabled, updatedAt: now })
          .where(eq(schema.llmEntryConfigs.id, c.entryName))
          .run();
      } else {
        db.insert(schema.llmEntryConfigs)
          .values({ id: c.entryName, providerId: c.providerId, thinkingEnabled: c.thinkingEnabled, createdAt: now, updatedAt: now })
          .run();
      }
    }
  });
  tx();
  // Bust all cached LLM clients since provider assignment may have changed
  globalThis.__agent_world_llm_clients__ = undefined;
}
```

Note: the `eq` import already exists at the top of the file (line 1), so only the new functions need adding.

- [ ] **Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit
```

Expected: no errors in providers.ts.

- [ ] **Step 3: Commit**

```bash
git add src/llm/providers.ts
git commit -m "feat: add entry config storage functions"
```

---

### Task 3: Refactor LLM client from singleton to per-provider cache

**Files:**
- Modify: `src/llm/client.ts`

- [ ] **Step 1: Rewrite `src/llm/client.ts`**

Replace the entire file with:

```typescript
/**
 * LLM 客户端（按 provider 缓存）。
 * 不同 LLM 入口可以路由到不同的 provider。
 *
 * 没有 provider 时：
 *   - hasApiKey() 返回 false → decide() 走 wait fallback
 *   - getLLMClient() / getModelName() 抛错（仅在 hasApiKey() 为 true 后才会被调到）
 *
 * 30s 超时、最多重试 1 次。
 */
import OpenAI from "openai";
import { getProvider, getDefaultProviderId, getEntryConfig } from "./providers";
import type { LLMProvider } from "./providers";

export const REQUEST_TIMEOUT_MS = 30_000;
export const REQUEST_MAX_RETRIES = 1;

declare global {
  // eslint-disable-next-line no-var
  var __agent_world_llm_clients__: Map<string, OpenAI> | undefined;
}

function getClientCache(): Map<string, OpenAI> {
  if (!globalThis.__agent_world_llm_clients__) {
    globalThis.__agent_world_llm_clients__ = new Map();
  }
  return globalThis.__agent_world_llm_clients__;
}

function buildClient(providerId: string): OpenAI {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`LLM provider not found: ${providerId}`);
  return new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseUrl,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: REQUEST_MAX_RETRIES,
  });
}

function resolveProviderId(entryName: string): string {
  const config = getEntryConfig(entryName);
  return config.providerId ?? getDefaultProviderId();
}

export function getLLMClient(providerId: string): OpenAI {
  const cache = getClientCache();
  let client = cache.get(providerId);
  if (!client) {
    client = buildClient(providerId);
    cache.set(providerId, client);
  }
  return client;
}

export function getLLMClientForEntry(entryName: string): OpenAI {
  return getLLMClient(resolveProviderId(entryName));
}

export function getModelName(providerId: string): string {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`LLM provider not found: ${providerId}`);
  return provider.model;
}

export function getModelNameForEntry(entryName: string): string {
  return getModelName(resolveProviderId(entryName));
}

export function hasApiKey(): boolean {
  try {
    const providerId = getDefaultProviderId();
    const provider = getProvider(providerId);
    return !!provider?.apiKey;
  } catch {
    return false;
  }
}

/** Test-only: replace client cache. */
export function __setLLMClientForTest(providerId: string, c: OpenAI | undefined) {
  const cache = getClientCache();
  if (c) {
    cache.set(providerId, c);
  } else {
    cache.delete(providerId);
  }
}
```

- [ ] **Step 2: Update `setActiveProvider` in providers.ts** to clear the new cache

In `src/llm/providers.ts`, in `setActiveProvider()`, replace:
```typescript
globalThis.__agent_world_llm__ = undefined;
```
with:
```typescript
globalThis.__agent_world_llm_clients__ = undefined;
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/llm/client.ts src/llm/providers.ts
git commit -m "refactor: per-provider LLM client cache with entry config resolution"
```

---

### Task 4: Wire entry configs into all LLM call sites

**Files:**
- Modify: `src/llm/decide.ts`
- Modify: `src/engine/decideForCharacter.ts`

- [ ] **Step 1: Update imports in `src/llm/decide.ts`**

Replace line 23-24:
```typescript
import { getThinkingEnabled } from "@/engine/settings";
import { getLLMClient, getModelName, hasApiKey } from "./client";
```
with:
```typescript
import { getEntryConfig } from "./providers";
import { getLLMClientForEntry, getModelNameForEntry, hasApiKey } from "./client";
```

- [ ] **Step 2: Update `callLLMWithRetry` to use entry config**

In `callLLMWithRetry` (currently lines 67-119), add an `entryName` parameter and use it:

Change the signature from:
```typescript
async function callLLMWithRetry(
  messages: Array<Record<string, unknown>>,
  tools: ...,
  fallbackLabel: string,
): Promise<...> {
  const client = getLLMClient();
  const extra: Record<string, unknown> = {};
  if (getThinkingEnabled()) extra.thinking = { type: "enabled" };
```
to:
```typescript
async function callLLMWithRetry(
  messages: Array<Record<string, unknown>>,
  tools: ...,
  fallbackLabel: string,
  entryName: string,
): Promise<...> {
  const config = getEntryConfig(entryName);
  const client = getLLMClientForEntry(entryName);
  const model = getModelNameForEntry(entryName);
  const extra: Record<string, unknown> = {};
  if (config.thinkingEnabled) extra.thinking = { type: "enabled" };
```

And change the `client.chat.completions.create` call to use `model` instead of `getModelName()`:
```typescript
model,
```

- [ ] **Step 3: Update `callLLM` to pass entry name**

In `callLLM` (line 121), change the `callLLMWithRetry` call from:
```typescript
const { actionType, data } = await callLLMWithRetry(messages, tools, "LLM");
```
to:
```typescript
const { actionType, data } = await callLLMWithRetry(messages, tools, "LLM", "decide");
```

- [ ] **Step 4: Update `llmDialogTurn` (line 207)**

Replace:
```typescript
const client = getLLMClient();
```
with:
```typescript
const config = getEntryConfig("dialog_turn");
const client = getLLMClientForEntry("dialog_turn");
const model = getModelNameForEntry("dialog_turn");
const extra: Record<string, unknown> = {};
if (config.thinkingEnabled) extra.thinking = { type: "enabled" };
```

And in the `client.chat.completions.create` call (line 234):
- Replace `model: getModelName()` with `model`
- Add `...extra` after `tools: [tool]`:
```typescript
const response = await client.chat.completions.create({
  model,
  max_tokens: 1024,
  messages: [...],
  tools: [tool],
  ...extra,
});
```

- [ ] **Step 5: Update `llmDialogSummarize` (line 288)**

Same pattern, entry name `"dialog_summarize"`:

Replace:
```typescript
const client = getLLMClient();
```
with:
```typescript
const config = getEntryConfig("dialog_summarize");
const client = getLLMClientForEntry("dialog_summarize");
const model = getModelNameForEntry("dialog_summarize");
const extra: Record<string, unknown> = {};
if (config.thinkingEnabled) extra.thinking = { type: "enabled" };
```

In `client.chat.completions.create`:
- Replace `model: getModelName()` with `model`
- Add `...extra` after `tools: [tool]`

- [ ] **Step 6: Update `llmMemoryCompress` (line 352)**

Same pattern, entry name `"memory_compress"`:

Replace:
```typescript
const client = getLLMClient();
```
with:
```typescript
const config = getEntryConfig("memory_compress");
const client = getLLMClientForEntry("memory_compress");
const model = getModelNameForEntry("memory_compress");
const extra: Record<string, unknown> = {};
if (config.thinkingEnabled) extra.thinking = { type: "enabled" };
```

In `client.chat.completions.create`:
- Replace `model: getModelName()` with `model`
- Add `...extra` after `tools: [tool]`

- [ ] **Step 7: Update `llmAcceptDecide` (line 422)**

Same pattern, entry name `"accept_decision"`:

Replace:
```typescript
const client = getLLMClient();
```
with:
```typescript
const config = getEntryConfig("accept_decision");
const client = getLLMClientForEntry("accept_decision");
const model = getModelNameForEntry("accept_decision");
const extra: Record<string, unknown> = {};
if (config.thinkingEnabled) extra.thinking = { type: "enabled" };
```

In `client.chat.completions.create`:
- Replace `model: getModelName()` with `model`
- Add `...extra` after `tools: [tool]`

- [ ] **Step 8: Update `llmSalvageDecide` (line 501)**

The salvage function calls `callLLMWithRetry` (line 541). Change:
```typescript
const { actionType, data } = await callLLMWithRetry(
  messages.map((m) => ({ ...m })),
  tools,
  "Salvage",
);
```
to:
```typescript
const { actionType, data } = await callLLMWithRetry(
  messages.map((m) => ({ ...m })),
  tools,
  "Salvage",
  "salvage",
);
```

- [ ] **Step 9: Update `decideForCharacter` in `src/engine/decideForCharacter.ts`**

Replace import line 27:
```typescript
import { getThinkingEnabled } from "./settings";
```
with:
```typescript
import { getEntryConfig } from "@/llm/providers";
```

Replace imports on line 172-173 (dynamic import):
```typescript
const { hasApiKey, getLLMClient, getModelName } = await import(
  "@/llm/client"
);
```
with:
```typescript
const { hasApiKey, getLLMClientForEntry, getModelNameForEntry } = await import(
  "@/llm/client"
);
```

And add top-level import for getEntryConfig (line 28 area):
```typescript
import { getEntryConfig } from "@/llm/providers";
```

Replace lines 206-209:
```typescript
const client = getLLMClient();
const extra: Record<string, unknown> = {};
if (getThinkingEnabled()) extra.thinking = { type: "enabled" };
const model = getModelName();
```
with:
```typescript
const config = getEntryConfig("character_placement");
if (config.thinkingEnabled) extra.thinking = { type: "enabled" };
const model = getModelNameForEntry("character_placement");
```

Note: `const client = getLLMClient()` becomes `const client = getLLMClientForEntry("character_placement")` and the `extra` declaration moves up to before the conditional:

- [ ] **Step 10: Verify TypeScript compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 11: Run existing tests**

```bash
npx vitest run --reporter=verbose
```

Expected: existing tests pass (some may need updates for changed signatures).

- [ ] **Step 12: Commit**

```bash
git add src/llm/decide.ts src/engine/decideForCharacter.ts
git commit -m "feat: wire per-entry config into all LLM call sites"
```

---

### Task 5: Add GET/PUT /api/admin/entry-configs API routes

**Files:**
- Create: `src/app/api/admin/entry-configs/route.ts`

- [ ] **Step 1: Create the route file**

```typescript
import {
  listEntryConfigs,
  batchUpsertEntryConfigs,
  getDefaultProviderId,
  getProvider,
} from "@/llm/providers";

const ALL_ENTRY_NAMES = [
  "decide",
  "salvage",
  "dialog_turn",
  "dialog_summarize",
  "accept_decision",
  "character_placement",
  "memory_compress",
];

export async function GET() {
  try {
    const entryConfigs = listEntryConfigs(ALL_ENTRY_NAMES);
    let defaultProvider: { id: string; name: string; model: string } | null = null;
    try {
      const dpId = getDefaultProviderId();
      const dp = getProvider(dpId);
      if (dp) {
        defaultProvider = { id: dp.id, name: dp.name, model: dp.model };
      }
    } catch {
      // no default provider set
    }
    return Response.json({ entryConfigs, defaultProvider });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  let body: { entryConfigs?: { entryName: string; providerId: string | null; thinkingEnabled: boolean }[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.entryConfigs || !Array.isArray(body.entryConfigs)) {
    return Response.json({ error: "entryConfigs array required" }, { status: 400 });
  }

  try {
    batchUpsertEntryConfigs(body.entryConfigs);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "unknown error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/entry-configs/route.ts
git commit -m "feat: add GET/PUT /api/admin/entry-configs API"
```

---

### Task 6: Add "LLM 调用配置" tab to admin page

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Add the "llm" tab**

In `page.tsx`, update the `Tab` type (line 45):
```typescript
type Tab = "providers" | "worlds" | "maps" | "llm";
```

Add to `TAB_CLASSES` (line 60):
```typescript
llm: "px-4 py-2 text-game-base tracking-widest cursor-pointer border-b-2 transition-colors",
```

Add to `TAB_LABELS` (line 66):
```typescript
llm: "LLM 调用配置",
```

In `AdminContent`, add the tab rendering in the content area (after line 227):
```typescript
{tab === "llm" && <EntryConfigsTab />}
```

- [ ] **Step 2: Add EntryConfigsTab component**

After the `MapsTab` closing brace (before the file end), add:

```typescript
function EntryConfigsTab() {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [configs, setConfigs] = useState<
    { entryName: string; providerId: string | null; thinkingEnabled: boolean }[]
  >([]);
  const [defaultProvider, setDefaultProvider] = useState<LLMProvider | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  const ENTRY_LABELS: Record<string, string> = {
    decide: "行动决策",
    salvage: "补救决策",
    dialog_turn: "对话回合",
    dialog_summarize: "对话摘要",
    accept_decision: "接受/拒绝对话",
    character_placement: "角色放置",
    memory_compress: "记忆压缩",
  };

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [provRes, configRes] = await Promise.all([
          fetch("/api/admin/providers"),
          fetch("/api/admin/entry-configs"),
        ]);
        const provData = await provRes.json();
        const configData = await configRes.json();
        if (!provRes.ok) throw new Error(provData.error ?? "fetch providers failed");
        if (!configRes.ok) throw new Error(configData.error ?? "fetch configs failed");
        setProviders(provData.providers);
        setConfigs(configData.entryConfigs);
        if (configData.defaultProvider) {
          setDefaultProvider(configData.defaultProvider);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "unknown error");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  function handleProviderChange(entryName: string, providerId: string | null) {
    setConfigs((prev) =>
      prev.map((c) => (c.entryName === entryName ? { ...c, providerId } : c)),
    );
  }

  function handleThinkingToggle(entryName: string) {
    setConfigs((prev) =>
      prev.map((c) =>
        c.entryName === entryName
          ? { ...c, thinkingEnabled: !c.thinkingEnabled }
          : c,
      ),
    );
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setResult("");
    try {
      const res = await fetch("/api/admin/entry-configs", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entryConfigs: configs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "save failed");
      setResult("配置已保存");
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <h2 className="text-game-base tracking-widest text-(--color-pixel-muted)">
        LLM 调用配置
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

      {/* default provider info */}
      <div className="px-3 py-2 text-game-xs text-(--color-pixel-muted) border border-(--color-pixel-border-dark) bg-(--color-pixel-bg-2)">
        默认 Provider：
        {defaultProvider ? (
          <span className="text-(--color-pixel-fg)">
            {defaultProvider.name} ({defaultProvider.model})
          </span>
        ) : (
          <span className="text-(--color-pixel-danger)">未设置</span>
        )}
        <span className="ml-2">— 在「LLM Provider」tab 中修改</span>
      </div>

      {loading ? (
        <div className="text-game-sm text-(--color-pixel-muted)">加载中…</div>
      ) : (
        <div className="border border-(--color-pixel-border-dark)">
          <table className="w-full text-game-xs">
            <thead>
              <tr className="border-b border-(--color-pixel-border-dark) text-(--color-pixel-muted)">
                <th className="text-left py-2 px-3">入口</th>
                <th className="text-left py-2 px-3">模型</th>
                <th className="text-left py-2 px-3">Thinking</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((c) => (
                <tr key={c.entryName} className="border-b border-(--color-pixel-border-dark) last:border-b-0">
                  <td className="py-2 px-3 text-(--color-pixel-fg)">
                    {ENTRY_LABELS[c.entryName] ?? c.entryName}
                  </td>
                  <td className="py-2 px-3">
                    <select
                      value={c.providerId ?? ""}
                      onChange={(e) =>
                        handleProviderChange(
                          c.entryName,
                          e.target.value || null,
                        )
                      }
                      className="px-2 py-1 text-game-xs bg-(--color-pixel-bg) border border-(--color-pixel-border-light) text-(--color-pixel-fg) outline-none focus:border-(--color-pixel-accent)"
                    >
                      <option value="">默认</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.model})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-3">
                    <button
                      type="button"
                      onClick={() => handleThinkingToggle(c.entryName)}
                      className={
                        "w-10 h-5 rounded-full border transition-colors " +
                        (c.thinkingEnabled
                          ? "bg-(--color-pixel-accent) border-(--color-pixel-accent-dark)"
                          : "bg-(--color-pixel-border-dark) border-(--color-pixel-border-light)")
                      }
                    >
                      <span
                        className={
                          "block w-3.5 h-3.5 rounded-full bg-(--color-pixel-bg) transition-transform " +
                          (c.thinkingEnabled ? "translate-x-5" : "translate-x-0.5")
                        }
                      />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || loading}
        className="px-4 py-2 text-game-xs border border-(--color-pixel-accent) text-(--color-pixel-accent) hover:bg-(--color-pixel-bg-2) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? "保存中…" : "保存"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: add LLM entry configs tab to admin page"
```

---

### Task 7: Remove old global settings

**Files:**
- Delete: `src/engine/settings.ts`
- Delete: `src/app/api/admin/settings/route.ts`
- Modify: `src/app/admin/page.tsx` (remove thinking toggle from header)

- [ ] **Step 1: Remove thinking toggle from admin header**

In `src/app/admin/page.tsx`:
- Remove the `thinkingEnabled` and `thinkingLoading` state (lines 138-139)
- Remove the `useEffect` that fetches `/api/admin/settings` (lines 141-148)
- Remove the `handleThinkingToggle` function (lines 150-166)
- Remove the thinking toggle label/button from the header (lines 175-197)

The header should become:
```tsx
<header className="flex items-center gap-4 px-4 py-2 border-b border-(--color-pixel-border-dark) bg-(--color-pixel-bg) shrink-0">
  <h1 className="text-game-lg tracking-widest text-(--color-pixel-accent)">
    ADMIN · 管理后台
  </h1>
  <a
    href="/"
    className="text-game-xs text-(--color-pixel-muted) hover:text-(--color-pixel-fg) transition-colors ml-auto"
  >
    ← 返回游戏
  </a>
</header>
```

- [ ] **Step 2: Delete old settings files**

```bash
git rm src/engine/settings.ts src/app/api/admin/settings/route.ts
```

- [ ] **Step 3: Remove any remaining imports of `@/engine/settings`**

```bash
npx tsc --noEmit
```

If any file still imports from `@/engine/settings`, fix it.

- [ ] **Step 4: Run existing tests**

```bash
npx vitest run --reporter=verbose
```

Expected: tests pass (no tests reference settings.ts).

- [ ] **Step 5: Commit**

```bash
git add src/engine/settings.ts src/app/api/admin/settings/route.ts src/app/admin/page.tsx
git commit -m "feat: remove old global settings in favor of per-entry configs"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Run all tests**

```bash
npx vitest run --reporter=verbose
```

Expected: all tests pass.

- [ ] **Step 3: Manual smoke test**

Start dev server and verify:
1. Navigate to `/admin` — 4 tabs visible (Provider, 世界管理, 地图预览, LLM 调用配置)
2. "LLM 调用配置" tab shows 7 entry rows with model dropdowns and thinking toggles
3. All thinking toggles default to OFF
4. Model dropdowns default to "默认"
5. Change some settings and click "保存" — success message shown
6. Refresh page — settings persist
7. Load a world — settings persist (not reset)
8. Old thinking toggle in header is gone

- [ ] **Step 4: Commit any remaining changes**

```bash
git status
git add <any remaining files>
git commit -m "chore: final verification after LLM entry config changes"
```
