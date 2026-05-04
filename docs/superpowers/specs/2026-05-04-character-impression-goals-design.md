# Character Impression, Goals & Reflection System

**Date:** 2026-05-04
**Scope:** Replace numerical relationship ratings with natural-language impressions; unify action decision into one tool with validation feedback; add long/short-term goals; add liked/disliked preferences; add pre-sleep reflection.

---

## 1. Unified Action Decision Tool

### 1.1 Current State

Each action type is a separate OpenAI function tool (`action_eat`, `action_sleep`, `action_move`, etc.). The LLM picks one. Up to 3 retries if no tool call is produced.

### 1.2 New Design

Replace N action tools with one: `decide_action`.

**Schema:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action_type` | enum string | yes | `eat`, `sleep`, `move`, `speak`, `work`, `rest`, `bathe`, `give`, `wait`, `think`, plus mod actions |
| `target_id` | string | conditional | Required for `move` (node), `speak` (character), `give` (character) |
| `free_text` | string | conditional | Required for `speak` and `think` |
| `amount` | number | conditional | Required for `give` |
| `reasoning` | string | yes | Must cite one personality trait in text form |

**Validation feedback loop:**

```
LLM calls decide_action → engine validates parameters
  ├─ valid → execute action, done
  └─ invalid → append error message to conversation, LLM retries (max 3 rounds)
                → after 3 failures, fallback to wait
```

**Parameter-level validation rules:**
- `action_type` must be in the available action list for this character
- `target_id` for `move`: target node must exist and be reachable (BFS path exists)
- `target_id` for `speak`: target character must exist and be on the same node
- `free_text` for `speak`: must be non-empty
- Character must satisfy action preconditions (e.g., sleep window, hunger threshold)

### 1.3 Files Changed

- `src/llm/prompt.ts` — replace N action tool defs with one `decide_action` tool
- `src/llm/decide.ts` — rewrite retry logic to validate parameters, not just "has tool call"
- `src/engine/actions-builtin.ts` — each action def exposes parameter constraints for the engine validator
- `src/domain/schemas.ts` — `decide_action` tool Zod schema
- `src/domain/action-system.ts` — action defs expose `validateParams(ctx, input)` method

---

## 2. Impression Notebook

### 2.1 Current State

Relations are `Record<string, Relation>` with `kinds`, `affection` (-4..+4 numeric), `note` (optional free text). Top 5 peers are injected into decision prompt. Acquaintances auto-decay after 14 days.

### 2.2 New Design

Add `impressionBook: Record<string, string>` to `Character`.

**Relation simplified to purely objective tags:**

```typescript
interface Relation {
  kinds: ObjectiveRelationKind[];  // blood tags + social tags, NO numerical affection
  since: Tick;
  lastInteractionTick: Tick;
}
```

Removed: `affection`, `note`.

**Two new tools, available in both decision and dialog phases:**

| Tool | Parameters | Behavior |
|------|-----------|----------|
| `recall` | `target_ids: string[]` | Batch query. Returns impression text + relation tags text for each target |

**`recall` return format:**
- Has impression: returns `impressionBook[id]` + `"客观关系：他是你的classmate"`
- No impression but has relation tags: returns `"(无个人印象) 客观关系：他是你的classmate"`
- Neither: returns `"你对这个人没有印象"`

| Tool | Parameters | Behavior |
|------|-----------|----------|
| `memorize` | `target_id: string, impression: string` | Write/update/delete. Empty `impression` = delete entry |

### 2.3 Post-Conversation Impression Update

After conversation ends and summary is generated, the dialog summary LLM call also outputs optional `memorize` operations for participants mentioned in the conversation. Engine writes these back to `impressionBook`.

### 2.4 Acquaintance Decay

Removed from engine. Decay decisions move to the pre-sleep reflection phase — the LLM can call `memorize` with an empty impression to "forget" someone.

### 2.5 Prompt Changes

`describeRelations()` no longer injects peer list into decision prompt. The character must call `recall` to remember who someone is.

### 2.6 Files Changed

- `src/domain/types.ts` — `Character` adds `impressionBook`; `Relation` removes `affection`/`note`
- `src/domain/schemas.ts` — `recall` / `memorize` tool schemas
- `src/engine/dialog.ts` — post-conversation impression update in summary flow
- `src/engine/tick.ts` — remove `manageRelations` decay logic
- `src/engine/store.ts` — persist `impressionBook`
- `src/llm/prompt.ts` — remove `describeRelations`, add recall/memorize tool defs
- `src/db/schema.ts` — add `impression_book` text column
- `configs/characters/*.json` — remove `affection`/`note` from relations; add initial `impressionBook` entries where needed

---

## 3. Long-Term & Short-Term Goals

### 3.1 New Data

```typescript
shortTermGoal: { goal: string; updatedAt: Tick } | null;
longTermGoal:  { goal: string; updatedAt: Tick } | null;
```

- **Long-term goals**: update interval ≥ 840 ticks (7 game days)
- **Short-term goals**: update interval ≥ 120 ticks (1 game day)
- Max 1 of each at any time
- Goals are free text, LLM-generated

### 3.2 Goal Lifecycle

- **Initial generation:** First pre-sleep reflection generates both goals if null
- **Update:** Reflection phase checks interval constraint; if eligible, LLM may optionally provide new goal text
- **Never forced** — LLM can keep existing goals
- **Display:** Goals are shown in the decision prompt as a fixed block

```
## 当前目标
短期：攒够5000日元买一本画册
长期：成为一名职业漫画家
```

### 3.3 Files Changed

- `src/domain/types.ts` — add `shortTermGoal`, `longTermGoal` to `Character`
- `src/engine/memory-compression.ts` — reflection phase handles goal update
- `src/llm/prompt.ts` — goal display in decision prompt; goal update prompt in reflection
- `src/engine/store.ts` — persist goal fields
- `src/db/schema.ts` — add goal columns

---

## 4. Likes, Dislikes & Pre-Sleep Reflection

### 4.1 New Data

```typescript
liked: string;    // free text, most liked person or thing
disliked: string; // free text, most disliked person or thing
```

Defaults to empty string.

### 4.2 Reflection Phase Flow

Executed when character performs `sleep`, **before** memory compression:

```
1. Reflection LLM call
   Input:
     - Today's short memory entries
     - Daily memory entries
     - Long memory entries
     - Current impressionBook
     - Current liked / disliked
     - Current shortTermGoal / longTermGoal (with last-update tick)
   
   Output (all optional):
     - memorize: [{ target_id: string, impression: string }]
       (empty impression = delete entry = "forget this person")
     - liked: string
     - disliked: string
     - shortTermGoal: string   (only if ≥120 ticks since last update)
     - longTermGoal: string    (only if ≥840 ticks since last update)

2. Apply outputs: write impressionBook, liked, disliked, goals

3. Memory compression (existing flow, unchanged)

4. Clear short memory
```

### 4.3 `memorize` as CRUD

Single tool handles all three operations:
- **Create/Update:** `{ target_id: "char-yamada-taro", impression: "他很有礼貌，但是有点爱吹牛" }`
- **Delete (forget):** `{ target_id: "char-yamada-taro", impression: "" }`

### 4.4 Engine Relation Tag Management

- `Relation.kinds` are objective tags (blood relationships, social roles)
- The engine still auto-adds `acquaintance` tag when characters interact
- But the engine never removes tags — that's the reflection LLM's job via `memorize ""`
- Blood tags (`father`, `mother`, `daughter`, `son`, `older_brother`, `younger_brother`, `older_sister`, `younger_sister`, `other_relative`) are immutable — engine refuses to delete them even if LLM requests it

### 4.5 Files Changed

- `src/domain/types.ts` — add `liked`, `disliked` to `Character`
- `src/engine/memory-compression.ts` — insert reflection phase before compression
- `src/llm/prompt.ts` — reflection prompt (inputs, outputs, memorize tool)
- `src/engine/store.ts` — persist `liked`, `disliked`
- `src/db/schema.ts` — add `liked`, `disliked` columns
- `src/engine/tick.ts` — remove auto-decay logic, keep acquaintance tag addition

---

## 5. Summary of All New/Modified Files

| File | Changes |
|------|---------|
| `src/domain/types.ts` | Add `impressionBook`, `shortTermGoal`, `longTermGoal`, `liked`, `disliked`; remove `affection`/`note` from `Relation` |
| `src/domain/enums.ts` | Remove affection-related enums if any |
| `src/domain/schemas.ts` | `decide_action` tool schema; `recall` + `memorize` tool schemas |
| `src/domain/action-system.ts` | `ActionDefinition` adds `validateParams()` method |
| `src/engine/actions-builtin.ts` | Each action def provides parameter constraints |
| `src/engine/tick.ts` | Remove acquaintance decay; keep `ensureAcquaintance` tag addition |
| `src/engine/execute.ts` | Validation feedback loop for `decide_action`; remove `updateAffection` numeric logic |
| `src/engine/dialog.ts` | Post-conversation impression update; use `recall`/`memorize` tools in dialog |
| `src/engine/memory-compression.ts` | Add pre-sleep reflection phase (before compression) |
| `src/engine/store.ts` | Persist new Character fields |
| `src/llm/prompt.ts` | Replace N action tools with 1 `decide_action`; remove `describeRelations`; add `recall`/`memorize` tool defs; add goals block; add reflection prompt; add post-dialog memorize prompt |
| `src/llm/decide.ts` | Parameter validation feedback loop instead of "has tool call" nudge |
| `src/db/schema.ts` | Add `impression_book`, `short_term_goal`, `long_term_goal`, `liked`, `disliked` columns |
| `configs/characters/*.json` | Remove `affection`/`note` from relations; add initial `impressionBook` where needed |

---

## 6. Edge Cases & Constraints

- **Blood relations immutable:** Engine must not allow `memorize ""` to remove blood-tagged relations
- **Goal interval enforcement:** Engine-level check, not LLM — even if LLM outputs a new goal before interval expires, engine ignores it
- **memorize empty impression = delete:** Must guard that the delete path is correct (remove key from impressionBook, not set to "")
- **recall batch:** When `target_ids` is large (>10), engine limits to reasonable size to prevent prompt bloat
- **Migration:** Existing worlds need a migration adding the new columns with sensible defaults (empty string for text, null for goal objects)
