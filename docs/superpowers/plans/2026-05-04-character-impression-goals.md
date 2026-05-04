# Character Impression, Goals & Reflection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace numerical relationship ratings with natural-language impression notebook; unify action decision into one tool with validation feedback; add long/short-term goals; add liked/disliked preferences; add pre-sleep reflection phase.

**Architecture:** Changes ripple through the full stack — domain types → DB schema → config files → store → actions → LLM prompts → decide loop → dialog → memory compression → tick loop. The order below respects dependency chains so each task compiles and tests against the previous one.

**Tech Stack:** TypeScript, Drizzle ORM (SQLite), OpenAI-compatible function calling, Zod

---

## Task 1: Update Domain Types

**Files:**
- Modify: `src/domain/types.ts:65-76` (Relation), `src/domain/types.ts:162-220` (Character)

- [ ] **Step 1: Remove `affection` and `note` from Relation**

```typescript
// src/domain/types.ts - replace lines 65-76
export interface Relation {
  /** 客观关系标签集合，至少 1 项。 */
  kinds: ObjectiveRelationKind[];
  /** 关系建立的 tick。 */
  since: Tick;
  /** 最近一次互动的 tick。 */
  lastInteractionTick: Tick;
}
```

- [ ] **Step 2: Add new fields to Character**

```typescript
// src/domain/types.ts - add after restNodeId (line 219) in Character interface
  /** 人物印象记录本：targetCharId → 自由文本印象 */
  impressionBook: Record<string, string>;
  /** 短期目标（≥1 天更新间隔） */
  shortTermGoal: { goal: string; updatedAt: Tick } | null;
  /** 长期目标（≥7 天更新间隔） */
  longTermGoal: { goal: string; updatedAt: Tick } | null;
  /** 最喜欢的人或事（自由文本） */
  liked: string;
  /** 最讨厌的人或事（自由文本） */
  disliked: string;
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: type errors throughout (new fields not yet initialized). This is fine — they'll be resolved as we go through the tasks.

- [ ] **Step 4: Commit**

```bash
git add src/domain/types.ts
git commit -m "feat: add impressionBook, goals, liked/disliked to Character; remove affection/note from Relation"
```

---

## Task 2: Update Domain Schemas & Enums

**Files:**
- Modify: `src/domain/schemas.ts:149-156` (RelationSchema), `src/domain/schemas.ts:18-61` (buildPerActionSchema → decide_action)
- Modify: `src/domain/enums.ts` (check if affection-related enums exist)

- [ ] **Step 1: Simplify RelationSchema**

```typescript
// src/domain/schemas.ts - replace lines 149-156
export const RelationSchema = z.object({
  kinds: z.array(z.enum(OBJECTIVE_RELATION_KINDS)).min(1),
  since: z.number().int().nonnegative(),
  lastInteractionTick: z.number().int().nonnegative(),
});
```

- [ ] **Step 2: Add decide_action tool schema**

```typescript
// src/domain/schemas.ts - add after existing tool schemas (before AcceptDecisionSchema)
export const DECIDE_ACTION_TOOL_NAME = "decide_action";

export const DecideActionSchema = z.object({
  action_type: z.string().min(1),
  target_id: z.string().optional(),
  target_node_id: z.string().optional(),
  free_text: z.string().max(500).optional(),
  amount: z.number().int().positive().optional(),
  reasoning: z.string().min(1).max(800),
  emotion_tag: z.string().max(40).optional(),
  self_importance: z.union([
    z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5),
  ]),
  change_type: z.enum(RELATION_CHANGE_TYPES).optional(),
  reason: z.string().max(200).optional(),
  arrival_action: z.object({
    action_type: z.string(),
    free_text: z.string().max(500).optional(),
    target_id: z.string().optional(),
    target_node_id: z.string().optional(),
  }).optional(),
});

export const DecideActionToolSchema = {
  type: "object" as const,
  properties: {
    action_type: {
      type: "string",
      description: "行动类型。可选值由引擎动态生成并注入 description。",
    },
    target_id: { type: "string", description: "目标角色 ID 或节点 ID（speak/move/give 需要）。" },
    target_node_id: { type: "string", description: "目标节点 ID（move 需要）。" },
    free_text: { type: "string", description: "对话内容（speak）或思考内容（think）。" },
    amount: { type: "integer", description: "金额（give 需要）。" },
    reasoning: { type: "string", description: "内心独白。必须显式引用一项你的性格特征（用文字描述，不要写数值）。" },
    self_importance: { type: "integer", enum: [1, 2, 3, 4, 5], description: "1-5 自评要不要长期记住。" },
    emotion_tag: { type: "string", description: "短情绪标签，例如 紧张 / 好奇 / 烦躁。" },
    change_type: { type: "string", enum: RELATION_CHANGE_TYPES, description: "关系变更类型（仅 update_relation 需要）。" },
    reason: { type: "string", description: "移动原因（move 需要）。" },
    arrival_action: {
      type: "object",
      properties: {
        action_type: { type: "string" },
        free_text: { type: "string" },
        target_id: { type: "string" },
        target_node_id: { type: "string" },
      },
      description: "到达后自动执行的动作（move 可选）。",
    },
  },
  required: ["action_type", "reasoning", "self_importance"],
  additionalProperties: false,
};
```

- [ ] **Step 3: Add recall and memorize tool schemas**

```typescript
// src/domain/schemas.ts - add after decide_action section

export const RECALL_TOOL_NAME = "recall";
export const RecallSchema = z.object({
  target_ids: z.array(z.string().min(1)).min(1).max(20),
});
export const RecallToolSchema = {
  type: "object" as const,
  properties: {
    target_ids: {
      type: "array",
      items: { type: "string" },
      description: "要查询的角色 ID 列表，可以一次查多个。",
    },
  },
  required: ["target_ids"],
  additionalProperties: false,
};

export const MEMORIZE_TOOL_NAME = "memorize";
export const MemorizeSchema = z.object({
  target_id: z.string().min(1),
  impression: z.string().max(1000),
});
export const MemorizeToolSchema = {
  type: "object" as const,
  properties: {
    target_id: { type: "string", description: "要记录印象的角色 ID。" },
    impression: { type: "string", description: "对此人的印象。留空代表忘记此人（删除印象）。" },
  },
  required: ["target_id", "impression"],
  additionalProperties: false,
};
```

- [ ] **Step 4: Add reflection tool schema**

```typescript
// src/domain/schemas.ts - add

export const REFLECTION_TOOL_NAME = "submit_reflection";
export const ReflectionSchema = z.object({
  memorize: z.array(z.object({
    target_id: z.string().min(1),
    impression: z.string(),
  })).optional(),
  liked: z.string().max(500).optional(),
  disliked: z.string().max(500).optional(),
  short_term_goal: z.string().max(300).optional(),
  long_term_goal: z.string().max(300).optional(),
});
export const ReflectionToolSchema = {
  type: "object" as const,
  properties: {
    memorize: {
      type: "array",
      items: {
        type: "object",
        properties: {
          target_id: { type: "string", description: "角色 ID。" },
          impression: { type: "string", description: "新的印象文本。空字符串代表忘记此人。" },
        },
        required: ["target_id", "impression"],
      },
      description: "本次反思中需要更新的印象列表（可选）。",
    },
    liked: { type: "string", description: "更新你最喜欢的人或事（可选）。" },
    disliked: { type: "string", description: "更新你最讨厌的人或事（可选）。" },
    short_term_goal: { type: "string", description: "更新你的短期目标（可选，每日最多一次）。" },
    long_term_goal: { type: "string", description: "更新你的长期目标（可选，每周最多一次）。" },
  },
  required: [],
  additionalProperties: false,
};
```

- [ ] **Step 5: Add goal schemas to Character for DB serialization**

```typescript
// src/domain/schemas.ts - add

export const GoalSchema = z.object({
  goal: z.string(),
  updatedAt: z.number().int().nonnegative(),
}).nullable();
```

- [ ] **Step 6: Run type check and commit**

```bash
npx tsc --noEmit 2>&1 | head -30
git add src/domain/schemas.ts src/domain/enums.ts
git commit -m "feat: add decide_action, recall, memorize, reflection tool schemas; simplify RelationSchema"
```

---

## Task 3: Update DB Schema

**Files:**
- Modify: `src/db/schema.ts:66-116` (characters table)
- Create: `src/db/migrations/0003_impression_goals.sql`

- [ ] **Step 1: Add new columns to characters table**

```typescript
// src/db/schema.ts - add inside characters table definition, after longMemoryJson
    impressionBookJson: text("impression_book_json").notNull().default("{}"),
    shortTermGoalJson: text("short_term_goal_json"),
    longTermGoalJson: text("long_term_goal_json"),
    liked: text("liked").notNull().default(""),
    disliked: text("disliked").notNull().default(""),
```

- [ ] **Step 2: Create migration SQL**

```sql
-- src/db/migrations/0003_impression_goals.sql
ALTER TABLE characters ADD COLUMN impression_book_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE characters ADD COLUMN short_term_goal_json TEXT;
ALTER TABLE characters ADD COLUMN long_term_goal_json TEXT;
ALTER TABLE characters ADD COLUMN liked TEXT NOT NULL DEFAULT '';
ALTER TABLE characters ADD COLUMN disliked TEXT NOT NULL DEFAULT '';
```

- [ ] **Step 3: Update auto-migration in the codebase**

Read `src/db/migrate.ts` to understand the auto-migration pattern. Add migration `0003` to the migration list following the existing pattern.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts src/db/migrations/0003_impression_goals.sql
git commit -m "feat: add impression_book, goals, liked/disliked columns to characters table"
```

---

## Task 4: Update Config Types & Loader

**Files:**
- Modify: `src/config/schemas.ts` (character config Zod schema — remove affection/note from relations, add impressionBook)
- Modify: `src/config/types.ts` (CharacterTemplate type)

- [ ] **Step 1: Update config schemas**

Read `src/config/schemas.ts` to find the character config schema. Change the `relations` field definition:

```typescript
// In character config schema — remove affection and note from relation objects
relations: z.record(z.object({
  kinds: z.array(z.enum(OBJECTIVE_RELATION_KINDS)).min(1),
  // affection: removed
  // note: removed
  since: z.number().int().nonnegative(),
  lastInteractionTick: z.number().int().nonnegative(),
})).optional().default({}),
```

Add `impressionBook` field:

```typescript
impressionBook: z.record(z.string()).optional().default({}),
```

- [ ] **Step 2: Update CharacterTemplate in config/types.ts**

Match the types to the schema changes.

- [ ] **Step 3: Commit**

```bash
git add src/config/schemas.ts src/config/types.ts
git commit -m "feat: remove affection/note from config relation schema; add impressionBook"
```

---

## Task 5: Migrate Character Config JSONs

**Files:**
- Modify: All `configs/maps/*/characters/*.json`

- [ ] **Step 1: Write a migration script**

```typescript
// scripts/migrate-configs-impression.ts
import fs from "fs";
import path from "path";
import { globSync } from "glob";

const FILES = globSync("configs/maps/*/characters/*.json");
for (const file of FILES) {
  const data = JSON.parse(fs.readFileSync(file, "utf-8"));
  
  // Remove affection and note from each relation
  if (data.relations) {
    for (const [key, rel] of Object.entries(data.relations) as [string, any][]) {
      delete rel.affection;
      delete rel.note;
    }
  }
  
  // Add empty impressionBook (impressions will be built from former notes)
  data.impressionBook = data.impressionBook || {};
  
  // Migrate existing notes into impressionBook if present
  // (Skip — notes are being removed; initial impressions from config if desired are set explicitly)
  
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  console.log(`Migrated: ${file}`);
}
```

- [ ] **Step 2: Run migration**

```bash
npx tsx scripts/migrate-configs-impression.ts
```

- [ ] **Step 3: Verify one file**

```bash
cat configs/maps/sakuraba-academy/characters/char-igarashi-yuto.json | head -30
```
Expected: relations have no `affection` or `note` fields, `impressionBook` present.

- [ ] **Step 4: Commit**

```bash
git add configs/ scripts/migrate-configs-impression.ts
git commit -m "feat: migrate character configs — remove affection/note, add impressionBook"
```

---

## Task 6: Update Store Layer

**Files:**
- Modify: `src/engine/store.ts` (loadWorld, saveWorld)

- [ ] **Step 1: Update loadWorld to parse new fields**

Read `src/engine/store.ts:29-125` to find the loadWorld function. In the character parsing section, add:

```typescript
// Inside character deserialization (after existing JSON.parse lines):
impressionBook: JSON.parse(row.impressionBookJson ?? "{}") as Record<string, string>,
shortTermGoal: row.shortTermGoalJson ? JSON.parse(row.shortTermGoalJson) : null,
longTermGoal: row.longTermGoalJson ? JSON.parse(row.longTermGoalJson) : null,
liked: row.liked ?? "",
disliked: row.disliked ?? "",
```

- [ ] **Step 2: Update saveWorld to serialize new fields**

Read `src/engine/store.ts:125-170` to find the saveWorld function. In the character update section, add:

```typescript
impressionBookJson: JSON.stringify(c.impressionBook),
shortTermGoalJson: c.shortTermGoal ? JSON.stringify(c.shortTermGoal) : null,
longTermGoalJson: c.longTermGoal ? JSON.stringify(c.longTermGoal) : null,
liked: c.liked,
disliked: c.disliked,
```

- [ ] **Step 3: Update character creation in createWorld.ts**

Read `src/engine/createWorld.ts` to find where characters are instantiated from config. Initialize new fields:

```typescript
impressionBook: template.impressionBook ?? {},
shortTermGoal: null,
longTermGoal: null,
liked: "",
disliked: "",
```

- [ ] **Step 4: Update createWorld to convert config relations + impressionBook**

When creating a `Character` from config, the config `relations` (now without affection/note) maps directly to `character.relations`. The config `impressionBook` maps to `character.impressionBook`.

- [ ] **Step 5: Commit**

```bash
git add src/engine/store.ts src/engine/createWorld.ts
git commit -m "feat: persist impressionBook, goals, liked/disliked in store layer"
```

---

## Task 7: Add validateParams to ActionDefinition

**Files:**
- Modify: `src/domain/action-system.ts:75-95` (ActionDefinition interface)

- [ ] **Step 1: Add validateParams to ActionDefinition**

```typescript
// src/domain/action-system.ts - add to ActionDefinition interface after hint()
  /**
   * Validate LLM-provided parameters for this action.
   * Returns null if valid, or an error message string if invalid.
   * The error message is fed back to the LLM for retry.
   */
  validateParams?(input: ActionInput, ctx: ActionContext): string | null;
```

- [ ] **Step 2: Commit**

```bash
git add src/domain/action-system.ts
git commit -m "feat: add validateParams method to ActionDefinition interface"
```

---

## Task 8: Add Parameter Constraints to Built-in Actions

**Files:**
- Modify: `src/engine/actions-builtin.ts`

- [ ] **Step 1: Add validateParams to each action definition**

For each action def in `actions-builtin.ts`, add a `validateParams` function. The pattern:

```typescript
// speak action
validateParams(input, ctx) {
  if (!input.target_id) return "speak 需要指定 target_id（对话对象的角色 ID）";
  if (!input.free_text || input.free_text.trim().length === 0) return "speak 需要 free_text（你想说的话）";
  const target = ctx.companions.find(c => c.id === input.target_id);
  if (!target) return `target_id="${input.target_id}" 不在你当前所在节点，无法对话`;
  return null;
},

// move action
validateParams(input, ctx) {
  if (!input.target_node_id) return "move 需要指定 target_node_id（目的地节点 ID）";
  const targetNode = ctx.reachable.find(n => n.id === input.target_node_id);
  if (!targetNode) return `target_node_id="${input.target_node_id}" 不可达或不存在`;
  return null;
},

// give action
validateParams(input, ctx) {
  if (!input.target_id) return "give 需要指定 target_id（收款人角色 ID）";
  if (!input.amount || input.amount <= 0) return "give 需要 amount（金额，正整数）";
  if (input.amount > ctx.self.money) return `你没有那么多钱（当前 ${ctx.self.money}，尝试给 ${input.amount}）`;
  return null;
},

// eat, sleep, rest, bathe, work, think, wait — always valid (no required params)
validateParams() { return null; },
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/actions-builtin.ts
git commit -m "feat: add parameter validation to each built-in action definition"
```

---

## Task 9: Build Unified decide_action Tool Prompt

**Files:**
- Modify: `src/llm/prompt.ts` (worldRules, buildActionTools callers, user prompt)

- [ ] **Step 1: Update worldRules() to describe the new unified tool**

In `worldRules()` (line 540), replace the action mechanism text:

```typescript
// Replace lines 545-552 in worldRules()
// Old:
行动机制：
- 你**只能**调用一个 action_* 工具来回复...
- 每个 action_* 工具对应一种行动...

// New:
行动机制：
- 你**只能**调用 decide_action 工具来提交行动决定，禁止直接输出任何自然语言文本。
- decide_action 的 action_type 参数选择你要执行的行动类型，可选值会在 prompt 末尾"可选行动"中列出。
- 根据你选择的 action_type，填写对应的 target_id / target_node_id / free_text / amount 等参数。
- 不要做超出当前可选行动范围的事；如果没有合适的，选 action_type="wait"。
```

- [ ] **Step 2: Update submitActionInstruction()**

```typescript
function submitActionInstruction(lang: Language): string {
  if (lang === "zh") {
    return "请调用 decide_action 工具返回你的决定（不要输出自然语言文本）。务必在 reasoning 中显式引用一项你的性格特征的文字描述。";
  }
  // ... same for en, ja
}
```

- [ ] **Step 3: Remove old action tool builders**

Remove `buildActionTools()`, `buildSalvageActionTools()`, `buildPerActionSchema()`, `ACTION_TOOL_PREFIX`, `toolNameForAction()`, `actionTypeFromToolName()`, `buildToolParams()` from `src/domain/schemas.ts` — these are replaced by the single `decide_action` tool.

- [ ] **Step 4: Add function to build the single decide_action tool**

```typescript
// src/domain/schemas.ts or src/llm/prompt.ts
export function buildDecideActionTool(ctx: ActionContext): ChatCompletionTool {
  const actionTypes = Array.from(actionRegistry.types()).filter(t => {
    const def = actionRegistry.get(t);
    return def && def.check(ctx);
  });
  
  const typeDesc = actionTypes.map(t => {
    const def = actionRegistry.get(t)!;
    const hint = def.hint(ctx);
    const hintText = Array.isArray(hint) ? hint.map(h => h.hint).join("；") : hint;
    return `- ${t}: ${hintText}`;
  }).join("\n");
  
  return {
    type: "function",
    function: {
      name: DECIDE_ACTION_TOOL_NAME,
      description: `提交你的行动决定。可用的 action_type：\n${typeDesc}`,
      parameters: {
        ...DecideActionToolSchema,
        properties: {
          ...DecideActionToolSchema.properties,
          action_type: {
            type: "string",
            enum: actionTypes,
            description: "你要执行的行动类型。",
          },
        },
      },
    },
  };
}
```

- [ ] **Step 5: Commit**

```bash
git add src/llm/prompt.ts src/domain/schemas.ts
git commit -m "feat: replace N action_* tools with single decide_action tool in prompts"
```

---

## Task 10: Rewrite decide.ts Validation Feedback Loop

**Files:**
- Modify: `src/llm/decide.ts:46-216` (llmDecide, callLLM, callLLMWithRetry)

- [ ] **Step 1: Rewrite callLLMWithRetry for parameter validation**

The core change: instead of checking "did LLM call any action tool", check "did LLM call decide_action with valid params". On invalid params, append the error as a user message and retry.

```typescript
// src/llm/decide.ts — replace callLLMWithRetry

const VALIDATION_NUDGE = (error: string) => `你的 decide_action 调用参数有误：${error}\n请修正参数后重新调用 decide_action。`;

async function callLLMWithRetry(
  messages: Array<Record<string, unknown>>,
  tool: ChatCompletionTool,
  ctx: ActionContext,
): Promise<{ actionType: string; data: Record<string, any> }> {
  const config = getEntryConfig("decide");
  const client = getLLMClientForEntry("decide");
  const extra: Record<string, unknown> = {};
  if (config.thinkingEnabled) extra.thinking = { type: "enabled" };

  for (let round = 0; round < MAX_TOOL_CALL_ROUNDS; round++) {
    const response = await client.chat.completions.create({
      model: getModelNameForEntry("decide"),
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: messages as any,
      tools: [tool],
      ...(extra as Record<string, unknown>),
    });

    const msg = response.choices[0]?.message;
    if (!msg) throw new Error("LLM 返回空 message");

    messages.push(captureAssistantMsg(msg));

    const toolCall = (msg.tool_calls ?? []).find(
      (c: any) => c.type === "function" && c.function.name === DECIDE_ACTION_TOOL_NAME,
    );

    if (toolCall) {
      let parsedArgs: unknown;
      try {
        parsedArgs = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        const error = `tool_call.arguments 不是合法 JSON：${e instanceof Error ? e.message : String(e)}`;
        if (round < MAX_TOOL_CALL_ROUNDS - 1) {
          messages.push({ role: "user", content: VALIDATION_NUDGE(error) });
          continue;
        }
        throw new Error(error);
      }

      const actionType = (parsedArgs as any).action_type;
      if (!actionType || typeof actionType !== "string") {
        const error = "action_type 缺失或格式错误";
        if (round < MAX_TOOL_CALL_ROUNDS - 1) {
          messages.push({ role: "user", content: VALIDATION_NUDGE(error) });
          continue;
        }
        throw new Error(error);
      }

      // Check action type exists and is available
      const def = actionRegistry.get(actionType);
      if (!def) {
        const error = `未知的 action_type: "${actionType}"。可用类型见 decide_action 的 description。`;
        if (round < MAX_TOOL_CALL_ROUNDS - 1) {
          messages.push({ role: "user", content: VALIDATION_NUDGE(error) });
          continue;
        }
        throw new Error(error);
      }
      if (!def.check(ctx)) {
        const error = `action_type="${actionType}" 当前不可用（不满足前置条件）。`;
        if (round < MAX_TOOL_CALL_ROUNDS - 1) {
          messages.push({ role: "user", content: VALIDATION_NUDGE(error) });
          continue;
        }
        throw new Error(error);
      }

      // Parameter-level validation via action definition
      const actionInput = {
        target_id: (parsedArgs as any).target_id,
        target_node_id: (parsedArgs as any).target_node_id,
        free_text: (parsedArgs as any).free_text,
        amount: (parsedArgs as any).amount,
      };
      if (def.validateParams) {
        const validationError = def.validateParams(actionInput, ctx);
        if (validationError) {
          if (round < MAX_TOOL_CALL_ROUNDS - 1) {
            messages.push({ role: "user", content: VALIDATION_NUDGE(validationError) });
            continue;
          }
          throw new Error(validationError);
        }
      }

      return { actionType, data: parsedArgs as Record<string, any> };
    }

    // No tool call at all — nudge
    if (round < MAX_TOOL_CALL_ROUNDS - 1) {
      messages.push({ role: "user", content: "请调用 decide_action 工具提交你的行动决定。不要输出纯文本，必须调用工具。" });
    }
  }

  throw new Error(`LLM 在 ${MAX_TOOL_CALL_ROUNDS} 轮内未返回合法的 decide_action 调用`);
}
```

- [ ] **Step 2: Update callLLM to use the new single tool**

```typescript
// src/llm/decide.ts — update callLLM
async function callLLM(input: DecideInput): Promise<Action> {
  const system = buildSystemPrompt({ ... });
  const user = buildUserPrompt({ ... });

  const tool = buildDecideActionTool(input.ctx); // single tool, not array

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const { actionType, data } = await callLLMWithRetry(messages, tool, input.ctx);
  return payloadToAction(actionType, data, input.character.id);
}
```

- [ ] **Step 3: Update payloadToAction for the new param names**

```typescript
// payloadToAction already maps target_id, target_node_id, free_text, etc.
// Ensure it also handles the amount field:
function payloadToAction(actionType: string, p: Record<string, any>, actorId: string): Action {
  const a: Action = {
    type: actionType,
    actorId,
    targetId: p.target_id,
    targetNodeId: p.target_node_id,
    freeText: p.free_text,
    reasoning: p.reasoning,
    emotionTag: p.emotion_tag,
    selfImportance: p.self_importance,
    changeType: p.change_type,
    reason: p.reason,
    arrivalAction: p.arrival_action ? { ... } : undefined,
  };
  // Pass through amount for give action (stored on freeText for backward compat, or a new field)
  if (p.amount !== undefined) (a as any).amount = p.amount;
  return a;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/llm/decide.ts
git commit -m "feat: rewrite LLM decision loop with parameter validation feedback"
```

---

## Task 11: Remove updateAffection from Execute

**Files:**
- Modify: `src/engine/execute.ts:102-112` (updateAffection), `src/engine/execute.ts:343-457` (relation change helpers)

- [ ] **Step 1: Remove updateAffection function**

Delete lines 102-112 and all calls to `updateAffection()` in the file:

```typescript
// DELETE this entire function
function updateAffection(actor: Character, targetId: string, delta: number, tick: number): void {
  const rel = actor.relations[targetId];
  if (!rel) return;
  rel.affection = clamp(rel.affection + delta, -4, 4);
  rel.lastInteractionTick = tick;
}
```

- [ ] **Step 2: Update relation change helpers to not call updateAffection**

In `applyRelationChange()`:
- `become_partner`: remove `updateAffection(actor, target.id, 1, tick)` and partner line
- `end_friendship`: remove both `updateAffection(...)` calls
- Also remove the `affection: 0` from `addKind()` when creating a fresh Relation (line 425)

```typescript
// In addKind() — change:
const fresh: Relation = {
  kinds: [kind],
  affection: 0,  // REMOVE THIS LINE
  since: tick,
  lastInteractionTick: tick,
};
// To:
const fresh: Relation = {
  kinds: [kind],
  since: tick,
  lastInteractionTick: tick,
};
```

- [ ] **Step 3: Commit**

```bash
git add src/engine/execute.ts
git commit -m "feat: remove updateAffection and all numerical affection logic from execute"
```

---

## Task 12: Add recall/memorize Tools to Decision & Dialog Phases

**Files:**
- Modify: `src/llm/prompt.ts` (buildUserPrompt — add recall/memorize to tool list description)
- Modify: `src/llm/decide.ts` (llmDecide — add recall/memorize as additional tools)
- Modify: `src/llm/decide.ts` (llmDialogTurn — add recall/memorize tools)
- Modify: `src/engine/dialog.ts` (runDialogPhase — handle recall/memorize tool calls)

- [ ] **Step 1: Build recall/memorize tool definitions**

```typescript
// src/llm/prompt.ts — add function
function buildRecallTool(): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: RECALL_TOOL_NAME,
      description: "回想你对某（几）个角色的印象。可以一次查询多个角色。",
      parameters: RecallToolSchema,
    },
  };
}

function buildMemorizeTool(): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: MEMORIZE_TOOL_NAME,
      description: "记录或更新你对某个角色的印象。留空印象文本代表忘记此人。",
      parameters: MemorizeToolSchema,
    },
  };
}
```

- [ ] **Step 2: Include recall/memorize in the tools array for decide and dialog**

In `callLLM` (decide.ts): pass `[decideActionTool, recallTool, memorizeTool]` as tools.
In `llmDialogTurn` (decide.ts): add recall and memorize alongside dialog_turn and end_conversation.

- [ ] **Step 3: Implement recall handler**

When LLM calls `recall`, the engine looks up `impressionBook` and `relations` for each requested target ID and returns a formatted result as a `tool` role message. This needs to happen in the retry loop — intercept non-decide_action tool calls.

```typescript
// In decide.ts callLLMWithRetry — after detecting a tool call that is NOT decide_action:
if (toolCall.function.name === RECALL_TOOL_NAME) {
  const args = JSON.parse(toolCall.function.arguments);
  const result = handleRecall(args.target_ids, ctx.self, allCharacters);
  messages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
  continue; // don't count as a decision round
}
if (toolCall.function.name === MEMORIZE_TOOL_NAME) {
  const args = JSON.parse(toolCall.function.arguments);
  handleMemorize(args.target_id, args.impression, ctx.self);
  messages.push({ role: "tool", tool_call_id: toolCall.id, content: "已记录。" });
  continue;
}
```

- [ ] **Step 4: Implement handleRecall**

```typescript
function handleRecall(targetIds: string[], self: Character, allChars: Character[]): string {
  const nameMap = new Map(allChars.map(c => [c.id, c.name]));
  const lines: string[] = [];
  for (const tid of targetIds) {
    const name = nameMap.get(tid) ?? tid;
    const impression = self.impressionBook[tid];
    const rel = self.relations[tid];
    
    if (impression && impression.trim().length > 0) {
      const relText = rel ? ` 客观关系：${rel.kinds.join("、")}。` : "";
      lines.push(`${name}: ${impression}${relText}`);
    } else if (rel && rel.kinds.length > 0) {
      lines.push(`${name}: (无个人印象) 客观关系：${rel.kinds.join("、")}。`);
    } else {
      lines.push(`${name}: 你对这个人没有印象。`);
    }
  }
  return lines.join("\n");
}

function handleMemorize(targetId: string, impression: string, self: Character): void {
  if (!impression || impression.trim().length === 0) {
    delete self.impressionBook[targetId];
  } else {
    self.impressionBook[targetId] = impression.trim();
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add src/llm/prompt.ts src/llm/decide.ts src/engine/dialog.ts
git commit -m "feat: add recall/memorize tools with runtime handlers"
```

---

## Task 13: Remove describeRelations from Decision Prompt

**Files:**
- Modify: `src/llm/prompt.ts:148-215` (selectTopPeers, describeRelations)
- Modify: `src/llm/prompt.ts:1101-1111` (companions section in buildUserPrompt)

- [ ] **Step 1: Replace companions section with a prompt for character to use recall**

Instead of auto-injecting relationship descriptions, provide a brief summary of who's present and instruct to use `recall` if needed:

```typescript
// src/llm/prompt.ts — in buildUserPrompt, replace lines 1101-1111
if (companions.length > 0) {
  const names = companions.map(c => `${c.name}[${c.id}]`).join("、");
  lines.push(`同节点其他人物（共 ${companions.length} 人）：${names}`);
  lines.push("如果你需要了解其中某人的信息，请调用 recall 工具查询。");
  lines.push("");
}
```

- [ ] **Step 2: Remove selectTopPeers and describeRelations (keep for accept decision prompt only)**

The `describeRelations()` function is still used in `buildAcceptDecisionPrompt()`. Keep it but update it to not render affection:

```typescript
function describeRelations(c: Character, peers: Character[], tick: number): string {
  // Simplified: only show names + kinds, no affection
  if (peers.length === 0) return "（同节点没有其他人）";
  return peers.map(p => {
    const r = c.relations[p.id];
    if (!r) return `- ${p.name}（陌生人）`;
    const kindsDisplay = r.kinds.join("、");
    return `- ${p.name} — ${kindsDisplay}`;
  }).join("\n");
}
```

- [ ] **Step 3: Destructure unused imports**

Remove `BLOOD_RELATION_KINDS` if no longer used in functions removed.

- [ ] **Step 4: Commit**

```bash
git add src/llm/prompt.ts
git commit -m "feat: replace auto-injected peer relations with recall tool prompt"
```

---

## Task 14: Add Goals Block to Decision Prompt

**Files:**
- Modify: `src/llm/prompt.ts` (buildUserPrompt)

- [ ] **Step 1: Add goals block after the character static block in buildUserPrompt**

```typescript
// src/llm/prompt.ts — in buildUserPrompt, after buildCharacterStaticBlock
if (character.shortTermGoal || character.longTermGoal) {
  lines.push("## 你的目标");
  if (character.shortTermGoal) {
    lines.push(`短期目标：${character.shortTermGoal.goal}`);
  }
  if (character.longTermGoal) {
    lines.push(`长期目标：${character.longTermGoal.goal}`);
  }
  lines.push("");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/llm/prompt.ts
git commit -m "feat: display short/long-term goals in decision prompt"
```

---

## Task 15: Add Goals + liked/disliked to Character Static Block

**Files:**
- Modify: `src/llm/prompt.ts` (buildCharacterStaticBlock)

- [ ] **Step 1: Add liked/disliked display**

```typescript
// src/llm/prompt.ts — in buildCharacterStaticBlock, after abilities line
if (character.liked) {
  lines.push(`- 你最喜欢：${character.liked}`);
}
if (character.disliked) {
  lines.push(`- 你最讨厌：${character.disliked}`);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/llm/prompt.ts
git commit -m "feat: include liked/disliked in character static block"
```

---

## Task 16: Build Reflection Prompt

**Files:**
- Modify: `src/llm/prompt.ts` (add new function)

- [ ] **Step 1: Add buildReflectionPrompt function**

```typescript
// src/llm/prompt.ts
export function buildReflectionPrompt(args: {
  character: Character;
  language?: Language;
}): string {
  const { character } = args;
  const language = args.language ?? "zh";
  
  const shortMemories = character.shortMemory
    .filter(m => !m.content.includes("[heuristic]"))
    .map(m => `- ${m.content}`).join("\n");
  const dailyMemories = character.dailyMemory.slice(-7)
    .map(m => `- ${m.content}`).join("\n");
  const longMemories = character.longMemory.slice(-14)
    .map(m => `- ${m.content}`).join("\n");
  
  // Impression book summary
  const impressions = Object.entries(character.impressionBook)
    .map(([id, text]) => `- ${id}: ${text}`).join("\n");
  
  const goalsText = [
    character.shortTermGoal ? `短期目标：${character.shortTermGoal.goal}` : null,
    character.longTermGoal ? `长期目标：${character.longTermGoal.goal}` : null,
  ].filter(Boolean).join("\n");
  
  const likedText = character.liked || "（暂无）";
  const dislikedText = character.disliked || "（暂无）";
  
  const prompt = `你是${character.name}，现在是睡前反思时间。回顾今天和过去的经历，反思以下方面：

## 短期记忆（今天）
${shortMemories || "（无）"}

## 日常记忆
${dailyMemories || "（无）"}

## 长期记忆
${longMemories || "（无）"}

## 你对其他人的印象
${impressions || "（暂无任何印象）"}

## 当前目标
${goalsText || "（暂无目标）"}

## 当前喜好
最喜欢：${likedText}
最讨厌：${dislikedText}

请调用 submit_reflection 工具输出你的反思结果。以下各项都是可选的，只填你确实想改变的：
- memorize: 更新你对某些人的印象（空 impression 代表忘记）
- liked: 更新你最喜欢的人或事
- disliked: 更新你最讨厌的人或事
- short_term_goal: 更新短期目标（距离上次更新需 ≥1 天）
- long_term_goal: 更新长期目标（距离上次更新需 ≥7 天）`;

  return prompt;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/llm/prompt.ts
git commit -m "feat: add buildReflectionPrompt for pre-sleep reflection"
```

---

## Task 17: Implement Pre-Sleep Reflection in Memory Compression

**Files:**
- Modify: `src/engine/memory-compression.ts`
- Modify: `src/llm/decide.ts` (add llmReflection function)

- [ ] **Step 1: Add llmReflection to decide.ts**

```typescript
// src/llm/decide.ts
import { ReflectionSchema, REFLECTION_TOOL_NAME, ReflectionToolSchema } from "@/domain/schemas";
import { buildReflectionPrompt } from "@/llm/prompt";

export interface ReflectionResult {
  memorize?: Array<{ target_id: string; impression: string }>;
  liked?: string;
  disliked?: string;
  shortTermGoal?: string;
  longTermGoal?: string;
}

export async function llmReflection(args: {
  prompt: string;
  language?: Language;
}): Promise<ReflectionResult> {
  if (!hasApiKey()) return {};
  
  const config = getEntryConfig("memory_compress");
  const client = getLLMClientForEntry("memory_compress");
  const language: Language = args.language ?? "zh";
  
  const tool: ChatCompletionTool = {
    type: "function",
    function: {
      name: REFLECTION_TOOL_NAME,
      description: "提交睡前反思结果。所有字段可选。",
      parameters: ReflectionToolSchema,
    },
  };
  
  const extra: Record<string, unknown> = {};
  if (config.thinkingEnabled) extra.thinking = { type: "enabled" };
  
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: getModelNameForEntry("memory_compress"),
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content: `你是一个角色反思助手。请基于提供的记忆和当前状态进行反思。\n\n${languageInstruction(language)}`,
          },
          { role: "user", content: args.prompt },
        ],
        tools: [tool],
        ...extra,
      });
      
      const message = response.choices[0]?.message;
      const toolCall = message?.tool_calls?.find(
        (c: any) => c.type === "function" && c.function.name === REFLECTION_TOOL_NAME,
      );
      if (!toolCall) throw new Error("LLM 没有返回 reflection tool_call");
      
      const parsed = JSON.parse(toolCall.function.arguments);
      const result = ReflectionSchema.safeParse(parsed);
      if (!result.success) throw new Error(`Reflection 参数不符合 schema：${result.error.message}`);
      
      return result.data;
    } catch {
      if (attempt === 0) continue;
    }
  }
  return {};
}
```

- [ ] **Step 2: Add reflection phase to compressSleepMemories**

```typescript
// src/engine/memory-compression.ts — add before memory compression
export async function compressSleepMemories(
  character: Character,
  currentTick: Tick,
  language: Language,
): Promise<void> {
  // ── Phase 0: Reflection (NEW) ──
  try {
    const reflectionPrompt = buildReflectionPrompt({ character, language });
    const reflection = await llmReflection({ prompt: reflectionPrompt, language });
    
    // Apply memorize updates
    if (reflection.memorize) {
      for (const m of reflection.memorize) {
        if (!m.impression || m.impression.trim().length === 0) {
          delete character.impressionBook[m.target_id];
        } else {
          character.impressionBook[m.target_id] = m.impression.trim();
        }
      }
    }
    
    // Apply liked/disliked
    if (reflection.liked !== undefined) character.liked = reflection.liked;
    if (reflection.disliked !== undefined) character.disliked = reflection.disliked;
    
    // Apply goals (with interval checks)
    const SHORT_GOAL_INTERVAL = 120; // 1 game day
    const LONG_GOAL_INTERVAL = 840; // 7 game days
    
    if (reflection.shortTermGoal !== undefined) {
      const lastUpdate = character.shortTermGoal?.updatedAt ?? 0;
      if (currentTick - lastUpdate >= SHORT_GOAL_INTERVAL) {
        character.shortTermGoal = { goal: reflection.shortTermGoal, updatedAt: currentTick };
      }
    }
    if (reflection.longTermGoal !== undefined) {
      const lastUpdate = character.longTermGoal?.updatedAt ?? 0;
      if (currentTick - lastUpdate >= LONG_GOAL_INTERVAL) {
        character.longTermGoal = { goal: reflection.longTermGoal, updatedAt: currentTick };
      }
    }
  } catch {
    // Reflection failed — skip silently, proceed to compression
  }

  // ── Phase 1-3: existing memory compression logic (unchanged) ──
  const sinceTick = character.lastSleepTick ?? 0;
  // ... rest of existing code ...
}
```

- [ ] **Step 3: Commit**

```bash
git add src/engine/memory-compression.ts src/llm/decide.ts
git commit -m "feat: add pre-sleep reflection phase with memorization, liked/disliked, and goal updates"
```

---

## Task 18: Post-Conversation Impression Update

**Files:**
- Modify: `src/engine/dialog.ts:580-614` (dialog summary section)
- Modify: `src/llm/decide.ts` (llmDialogSummarize — add memorize output)

- [ ] **Step 1: Extend dialog summary to output impression updates**

Add `memorize` field to `DialogSummarySchema`:

```typescript
// src/domain/schemas.ts — extend DialogSummarySchema
export const DialogSummarySchema = z.object({
  summary: z.string().min(1).max(500),
  memorize: z.array(z.object({
    target_id: z.string().min(1),
    impression: z.string(),
  })).optional(),
});
```

Update `DialogSummaryToolSchema` accordingly.

- [ ] **Step 2: Update llmDialogSummarize to return memorize alongside summary**

```typescript
export async function llmDialogSummarize(input: DialogSummaryInput): Promise<{
  summary: string;
  memorize?: Array<{ target_id: string; impression: string }>;
}> {
  // ... existing code ...
  return {
    summary: result.data.summary,
    memorize: result.data.memorize,
  };
}
```

- [ ] **Step 3: Apply memorize in runDialogPhase Part 5**

In `src/engine/dialog.ts`, after the summary is generated (line 586-606 area):

```typescript
const { summary, memorize } = await retryOnce(() =>
  input.summaryDecide({ ... }),
);

// Apply impression updates
if (memorize) {
  for (const m of memorize) {
    const opener = charById.get(conv.initiatorId)!;
    const responder = charById.get(conv.acceptorId)!;
    
    // The LLM output uses "opener" / "responder" as target_id references
    // Map these to actual character IDs
    const targetId = m.target_id === "opener" ? conv.initiatorId
                   : m.target_id === "responder" ? conv.acceptorId
                   : m.target_id;
    
    if (!m.impression || m.impression.trim().length === 0) {
      delete opener.impressionBook[targetId];
      delete responder.impressionBook[targetId];
    } else {
      // Write from opener's perspective about target, and responder's about target
      // Actually, the summary is from an omniscient perspective. Better approach:
      // The LLM outputs target_id as the real character ID and we apply to both.
      if (charById.get(targetId)) {
        // Write for opener about the peer
        if (targetId === conv.acceptorId) {
          opener.impressionBook[targetId] = m.impression.trim();
        }
        // Write for responder about the peer
        if (targetId === conv.initiatorId) {
          responder.impressionBook[targetId] = m.impression.trim();
        }
      }
    }
  }
}
```

- [ ] **Step 4: Update the dialog summary prompt to instruct impression update**

In `buildDialogSummaryPrompt()`, add:

```
同时，如果你对对话中的人产生了新的印象，可以通过 memorize 输出更新印象。
```

- [ ] **Step 5: Commit**

```bash
git add src/engine/dialog.ts src/llm/decide.ts src/llm/prompt.ts src/domain/schemas.ts
git commit -m "feat: post-conversation impression update via memorize in dialog summary"
```

---

## Task 19: Remove Acquaintance Decay from Tick

**Files:**
- Modify: `src/engine/tick.ts:929-996` (manageRelations)

- [ ] **Step 1: Remove decay logic but keep acquaintance addition**

```typescript
function manageRelations(
  characters: Character[],
  tick: number,
  events: WorldEvent[],
): void {
  const byNode = new Map<string, Character[]>();
  for (const c of characters) {
    const arr = byNode.get(c.locationId) ?? [];
    arr.push(c);
    byNode.set(c.locationId, arr);
  }

  for (const [, nodeChars] of byNode) {
    if (nodeChars.length < 2) continue;
    for (let i = 0; i < nodeChars.length; i++) {
      for (let j = i + 1; j < nodeChars.length; j++) {
        const a = nodeChars[i];
        const b = nodeChars[j];
        const interacted = events.some(
          (e) =>
            e.tick === tick &&
            e.participants.includes(a.id) &&
            e.participants.includes(b.id) &&
            (e.category === "social" || e.category === "action"),
        );
        if (interacted) {
          ensureAcquaintance(a, b.id, tick);
          ensureAcquaintance(b, a.id, tick);
        }
      }
    }
  }

  // Decay logic REMOVED — now handled by reflection phase via memorize ""
}
```

- [ ] **Step 2: Update ensureAcquaintance to not set affection**

```typescript
function ensureAcquaintance(a: Character, bId: string, tick: number): void {
  const rel = a.relations[bId];
  if (!rel || rel.kinds.length === 0) {
    const fresh: Relation = {
      kinds: ["acquaintance"],
      // affection: 0,  ← REMOVED
      since: tick,
      lastInteractionTick: tick,
    };
    a.relations[bId] = fresh;
  } else {
    rel.lastInteractionTick = tick;
  }
}
```

- [ ] **Step 3: Remove ACQUAINTANCE_DECAY_TICKS and ACQUAINTANCE_WARN_TICKS from prompt.ts**

Also remove the decay warning lines from `describeRelations()`.

- [ ] **Step 4: Commit**

```bash
git add src/engine/tick.ts src/llm/prompt.ts
git commit -m "feat: remove engine-driven acquaintance decay; decay handled by reflection"
```

---

## Task 20: Add new LLM entry config for reflection

**Files:**
- Modify: `src/llm/providers.ts` (entry configs)

- [ ] **Step 1: Add "reflection" entry to LLM entry configs if needed**

The reflection LLM call reuses the `memory_compress` entry config. If you want a separate entry, add it. Otherwise, skip this task.

---

## Task 21: Integration Test & Fix Compilation

**Files:**
- Modify: various files to fix type errors

- [ ] **Step 1: Run full type check**

```bash
npx tsc --noEmit 2>&1
```

Expected: remaining type errors from missed spots. Work through each error fixing types.

- [ ] **Step 2: Key spots to verify**

- `src/engine/createWorld.ts` — character initialization
- `src/engine/addCharacter.ts` — character initialization
- `src/engine/store.ts` — serialize/deserialize
- `src/llm/decide.ts` — all LLM functions updated
- `src/llm/prompt.ts` — unused imports removed
- `src/engine/dialog.ts` — dialog summary return type
- `src/engine/tick.ts` — manageRelations signature
- All `src/domain/types.ts` consumers that access `relation.affection` or `relation.note`

- [ ] **Step 3: Fix all type errors until clean**

```bash
npx tsc --noEmit 2>&1 | grep "error TS"
# Expected: no output
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "fix: resolve all type errors from impression/goals/reflection refactor"
```

---

## Task 22: Manual Smoke Test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Create a new world and advance a few ticks**

Verify:
- Characters make decisions (decide_action tool works)
- Characters sleep and reflection runs (check DB for updated impressionBook, goals, liked/disliked)
- recall/memorize tools execute correctly when characters use them
- Dialog starts and ends correctly with impression updates
- No runtime crashes

- [ ] **Step 3: Commit any fixes**

```bash
git add .
git commit -m "fix: smoke test fixes for impression/goals/reflection system"
```

---

## Task 23: Update Tests

**Files:**
- Modify: `src/engine/dialog.test.ts`
- Modify: `src/engine/execute.test.ts` (if exists)

- [ ] **Step 1: Update dialog tests for new tool names and impression updates**

Update test assertions to use `decide_action` instead of `action_speak` etc.

- [ ] **Step 2: Add test for recall handler**

```typescript
test("recall returns impression + relation tags", () => {
  const char = makeTestChar({
    impressionBook: { "char-b": "他很友善" },
    relations: { "char-b": { kinds: ["classmate"], since: 0, lastInteractionTick: 0 } },
  });
  const result = handleRecall(["char-b"], char, []);
  expect(result).toContain("他很友善");
  expect(result).toContain("classmate");
});
```

- [ ] **Step 3: Add test for memorize CRUD**

```typescript
test("memorize creates, updates, and deletes impressions", () => {
  const char = makeTestChar({ impressionBook: {} });
  
  // Create
  handleMemorize("char-b", "好人", char);
  expect(char.impressionBook["char-b"]).toBe("好人");
  
  // Update
  handleMemorize("char-b", "虚伪的人", char);
  expect(char.impressionBook["char-b"]).toBe("虚伪的人");
  
  // Delete
  handleMemorize("char-b", "", char);
  expect(char.impressionBook["char-b"]).toBeUndefined();
});
```

- [ ] **Step 4: Add test for goal interval enforcement**

```typescript
test("short-term goal update respects 1-day interval", () => {
  const char = makeTestChar({ shortTermGoal: null });
  // Set initial goal
  char.shortTermGoal = { goal: "learn cooking", updatedAt: 50 };
  
  // Try update at tick 100 (< 120 interval) — should be blocked
  applyGoalUpdate(char, { shortTermGoal: "new goal" }, 100);
  expect(char.shortTermGoal?.goal).toBe("learn cooking"); // unchanged
  
  // Update at tick 200 (> 120 interval) — should work
  applyGoalUpdate(char, { shortTermGoal: "new goal" }, 200);
  expect(char.shortTermGoal?.goal).toBe("new goal");
});
```

- [ ] **Step 5: Commit**

```bash
git add src/engine/dialog.test.ts
git commit -m "test: update tests for impression/goals/reflection system"
```
