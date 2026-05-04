# LLM Entry Config: Per-entry Thinking & Model Selection

## Summary

Add a new admin tab for managing per-LLM-entry-point configuration: thinking on/off and provider/model selection. Configuration is global, stored in the database, and persists across world resets.

## Motivation

- Different LLM entry points have different needs: decision-making benefits from extended thinking, but dialog turns don't.
- Users may want to route different entry points to different models (e.g., a cheaper model for memory compression, a stronger model for decision-making).
- The existing global `thinkingEnabled` flag is too coarse and resets on server restart (in-memory only).

## Design

### 1. Database Schema

**New table `llm_entry_configs`**:

```
id               TEXT PRIMARY KEY   -- entry name slug: "decide", "dialog_turn", etc.
provider_id      TEXT               -- FK -> llm_providers.id, NULL = use default
thinking_enabled INTEGER NOT NULL DEFAULT 0
created_at       TEXT NOT NULL DEFAULT (datetime('now'))
updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
FOREIGN KEY (provider_id) REFERENCES llm_providers(id) ON DELETE SET NULL
```

`llm_providers` table unchanged. `is_active` column retained as the "default provider" marker (managed via existing Providers tab).

World reset (POST /api/admin/worlds/load) only touches `worlds, nodes, characters, events_log, agent_thoughts, snapshots` — `llm_entry_configs` is unaffected.

### 2. LLM Entry Points (7 total)

| Slug | Label | Function | File |
|---|---|---|---|
| `decide` | 行动决策 | `llmDecide` | `src/llm/decide.ts` |
| `salvage` | 补救决策 | `llmSalvageDecide` | `src/llm/decide.ts` |
| `dialog_turn` | 对话回合 | `llmDialogTurn` | `src/llm/decide.ts` |
| `dialog_summarize` | 对话摘要 | `llmDialogSummarize` | `src/llm/decide.ts` |
| `accept_decision` | 接受/拒绝对话 | `llmAcceptDecide` | `src/llm/decide.ts` |
| `character_placement` | 角色放置 | `decideForCharacter` | `src/engine/decideForCharacter.ts` |
| `memory_compress` | 记忆压缩 | `llmMemoryCompress` | `src/llm/decide.ts` |

### 3. LLM Code Changes

New shared functions:

- `getEntryConfig(entryName: string): Promise<{ providerId: string | null; thinkingEnabled: boolean }>` — reads from `llm_entry_configs`. Returns `{ providerId: null, thinkingEnabled: false }` when no row exists.
- `getDefaultProviderId(): Promise<string>` — returns `id` of the provider with `is_active = true`.

Client cache: change from singleton `globalThis.__agent_world_llm__` to a `Map<string, OpenAI>` keyed by provider ID. `getLLMClient(providerId: string)` creates/caches per provider.

Each LLM call site changes from:
```typescript
if (getThinkingEnabled()) extra.thinking = { type: "enabled" };
```
to:
```typescript
const entryConfig = await getEntryConfig("decide");
if (entryConfig.thinkingEnabled) extra.thinking = { type: "enabled" };
```

And for model selection:
```typescript
const providerId = entryConfig.providerId ?? await getDefaultProviderId();
const client = getLLMClient(providerId);
const model = getModelNameForProvider(providerId);
```

### 4. API Routes

**`GET /api/admin/entry-configs`** — Returns all entry configs + default provider info.

```json
{
  "entryConfigs": [
    { "entryName": "decide", "providerId": null, "thinkingEnabled": false }
  ],
  "defaultProvider": { "id": "p1", "name": "DeepSeek", "model": "deepseek-chat" }
}
```

**`PUT /api/admin/entry-configs`** — Batch upsert. Body:

```json
{
  "entryConfigs": [
    { "entryName": "decide", "providerId": "p2", "thinkingEnabled": true }
  ]
}
```

Upsert via `INSERT ... ON CONFLICT(id) DO UPDATE SET ...`.

### 5. Admin UI

New tab `"llm"` (label: "LLM 调用配置"), added alongside Providers, Worlds, Maps.

**Layout:**

- Top: info bar showing current default provider (managed in Providers tab)
- Table: 7 rows, one per entry point
  - Column 1: entry label (read-only)
  - Column 2: provider dropdown — populated from `GET /api/admin/providers`. First option is "默认" (value: null)
  - Column 3: thinking toggle switch
- Bottom: "保存" button, calls `PUT /api/admin/entry-configs`

**Page load:** fires `GET /api/admin/providers` and `GET /api/admin/entry-configs` in parallel.

### 6. Migration

Add `llm_entry_configs` table. No data migration needed — empty table means all entries default to active provider + thinking off, matching current behavior.

### 7. Removal

- Remove `src/engine/settings.ts` (`getThinkingEnabled`, `setThinkingEnabled`, global state)
- Remove `GET/POST /api/admin/settings` routes
- Remove the global thinking toggle from the admin header bar
