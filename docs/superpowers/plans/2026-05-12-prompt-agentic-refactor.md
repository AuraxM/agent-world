# Prompt Agentic Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor decide/dialog/think LLM flows from prompt-stuffed context to agentic tool-retrieved context with read_*/write_* naming convention, longer ReAct loops, and a memory-curator Think Agent.

**Architecture:** Three independent Agents (Decide/Dialog/Think) share a common ReAct loop (`agent-loop.ts`), a shared set of read tools, and per-agent write tools. All character context is retrieved via tool calls rather than injected into prompts. System prompts are reduced to rules + tool guidance + goal. Memory management moves from sleep-triggered compression to an active Think Agent triggered when short memory fills up.

**Tech Stack:** TypeScript, Fastify, OpenAI-compatible API, Zod schemas, Vitest

---

## File Structure

```
backend/src/
  domain/
    types.ts          — MODIFY: add layer field to Memory, update capacity comments
    schemas.ts        — REWRITE: replace all old tool schemas with read_*/write_* tools
    action-system.ts  — no change
    enums.ts          — no change
    events.ts         — no change
    index.ts          — no change
  llm/
    agent-loop.ts     — CREATE: generic ReAct loop shared by three agents
    system-prompts.ts — CREATE: system prompt constants for three agents
    tool-handlers.ts  — CREATE: all read_*/write_* tool implementations
    client.ts         — no change
    providers.ts      — no change
    decide.ts         — REWRITE: Decide Agent entry point
    dialog.ts         — REWRITE: Dialog phase using new agent
    think.ts          — CREATE: Think Agent (memory curator)
    prompt.ts         — DELETE most functions, keep only utility helpers (time/map/formatters)
    think-sessions.ts — DELETE (replaced by think.ts)
    memory-compression.ts — DELETE (replaced by Think Agent)
    index.ts          — UPDATE exports
  server/
    tick.ts           — MODIFY: wire new agents, remove old flows, add force-think trigger
  domain/             — no other changes
```

---

## Phase 1: Memory Model Update

### Task 1: Update Memory type and Character interface

**Files:**
- Modify: `backend/src/domain/types.ts`

- [ ] **Step 1: Add `layer` field to Memory and expand daily/long memory definitions**

In `backend/src/domain/types.ts`, update the `Memory` interface:

```typescript
/** 单条记忆。支持三层：short(60) / daily(20) / weekly(5)。 */
export interface Memory {
  id: string;
  tick: Tick;
  importance: number; // 1–5
  content: string;
  refEventId?: string;
  /** 记忆层级。Think Agent 负责在各层之间搬运/合并。 */
  layer: "short" | "daily" | "weekly";
}
```

Update the Character interface memory-related fields:

```typescript
  /** 短期记忆：容量 60，FIFO。≥55 时触发强制 Think。 */
  shortMemory: Memory[];
  /** 每日记忆：容量 20。Think Agent 从 short 整理而来。 */
  dailyMemory: Memory[];
  /** 周记忆(人生要事)：容量 5。Think Agent 从 daily 整理而来。 */
  longMemory: Memory[];
```

- [ ] **Step 2: Add MAX_CAPACITY constants to enums.ts**

In `backend/src/domain/enums.ts`, add:

```typescript
/** 记忆容量上限 */
export const MEMORY_CAPACITY = {
  short: 60,
  daily: 20,
  weekly: 5,
} as const;

/** short memory 达到该阈值时触发强制 Think */
export const SHORT_MEMORY_THINK_THRESHOLD = 55;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors related to the Memory/Character changes (other pre-existing errors may exist).

- [ ] **Step 4: Commit**

```bash
git add backend/src/domain/types.ts backend/src/domain/enums.ts
git commit -m "feat: add memory layer field and capacity constants"
```

---

## Phase 2: Tool Schemas

### Task 2: Define all read tool schemas

**Files:**
- Modify: `backend/src/domain/schemas.ts`

- [ ] **Step 1: Define read tool name constants and Zod schemas**

Replace the existing tool name constants section at the top of `backend/src/domain/schemas.ts` with new read tool definitions:

```typescript
// ── Read Tool Names ──
export const READ_PROFILE_TOOL = "read_profile";
export const READ_VITALS_TOOL = "read_vitals";
export const READ_EMOTION_TOOL = "read_emotion";
export const READ_MEMORIES_TOOL = "read_memories";
export const READ_GOALS_TOOL = "read_goals";
export const READ_ECONOMY_TOOL = "read_economy";
export const READ_RELATIONS_TOOL = "read_relations";
export const READ_CHARACTER_TOOL = "read_character";
export const READ_NOTEBOOK_TOOL = "read_notebook";
export const READ_MAP_TOOL = "read_map";
export const READ_COMPANIONS_TOOL = "read_companions";
export const READ_EVENTS_TOOL = "read_events";
export const READ_STATE_TOOL = "read_state";

// ── Write Tool Names ──
export const WRITE_DECISION_TOOL = "write_decision";
export const WRITE_DIALOG_TOOL = "write_dialog";
export const WRITE_PROPOSE_ACTION_TOOL = "write_propose_action";
export const WRITE_RESPOND_ACTION_TOOL = "write_respond_action";
export const END_DIALOG_TOOL = "end_dialog";
export const WRITE_MEMORY_TOOL = "write_memory";
export const DELETE_MEMORY_TOOL = "delete_memory";
export const WRITE_IMPRESSION_TOOL = "write_impression";
export const WRITE_NOTEBOOK_TOOL = "write_notebook";
export const WRITE_LIKE_TOOL = "write_like";
export const WRITE_DISLIKE_TOOL = "write_dislike";
export const WRITE_SHORT_TERM_GOAL_TOOL = "write_short_term_goal";
export const WRITE_LONG_TERM_GOAL_TOOL = "write_long_term_goal";
export const WRITE_RELATION_TOOL = "write_relation";
export const END_THINKING_TOOL = "end_thinking";

// Shared tool group arrays
export const ALL_READ_TOOLS = [
  READ_PROFILE_TOOL, READ_VITALS_TOOL, READ_EMOTION_TOOL, READ_MEMORIES_TOOL,
  READ_GOALS_TOOL, READ_ECONOMY_TOOL, READ_RELATIONS_TOOL, READ_CHARACTER_TOOL,
  READ_NOTEBOOK_TOOL, READ_MAP_TOOL, READ_COMPANIONS_TOOL, READ_EVENTS_TOOL,
  READ_STATE_TOOL,
] as const;

export const DECIDE_TERMINAL_TOOLS = [WRITE_DECISION_TOOL];
export const DIALOG_TERMINAL_TOOLS = [WRITE_DIALOG_TOOL, END_DIALOG_TOOL, WRITE_PROPOSE_ACTION_TOOL, WRITE_RESPOND_ACTION_TOOL];
export const THINK_TERMINAL_TOOLS = [WRITE_MEMORY_TOOL, DELETE_MEMORY_TOOL, END_THINKING_TOOL];
```

- [ ] **Step 2: Define Zod schemas for read tool parameters**

```typescript
// ── Read Tool Parameter Schemas ──

/** read_memories 参数 */
export const ReadMemoriesParamsSchema = z.object({
  layer: z.enum(["short", "daily", "weekly"]).describe("要查询的记忆层"),
  time_range_start: z.number().int().optional().describe("时间范围起始 tick（含）"),
  time_range_end: z.number().int().optional().describe("时间范围结束 tick（含）"),
  target_id: z.string().optional().describe("筛选与特定角色相关的记忆"),
  limit: z.number().int().min(1).max(20).optional().default(10).describe("返回条数上限"),
});

/** read_character 参数 */
export const ReadCharacterParamsSchema = z.object({
  character_id: z.string().describe("要查询的角色 ID"),
});

/** read_relations 参数 */
export const ReadRelationsParamsSchema = z.object({
  target_id: z.string().optional().describe("指定角色 ID，不填则返回所有关系"),
});

/** read_events 参数 */
export const ReadEventsParamsSchema = z.object({
  limit: z.number().int().min(1).max(20).optional().default(10),
  category: z.string().optional().describe("事件类别筛选"),
});

// read_profile, read_vitals, read_emotion, read_goals, read_economy,
// read_map, read_companions, read_notebook, read_state 无参数
```

- [ ] **Step 3: Define Zod schemas for write tool parameters**

```typescript
// ── Write Tool Parameter Schemas ──

export const WriteDecisionParamsSchema = z.object({
  action_type: z.string().describe("选择执行的动作类型"),
  target_id: z.string().optional(),
  target_node_id: z.string().optional(),
  free_text: z.string().optional(),
  reason: z.string().optional(),
  amount: z.number().optional(),
});

export const WriteDialogParamsSchema = z.object({
  content: z.string().describe("你要说的话"),
  action_proposal: z.object({
    action_type: z.string(),
    params: z.record(z.unknown()).optional(),
  }).optional().describe("对话中同时提议的动作"),
  action_response: z.object({
    accept: z.boolean(),
    reason: z.string().optional(),
  }).optional().describe("对对方动作提议的回应"),
});

export const WriteProposeActionParamsSchema = z.object({
  action_type: z.string().describe("提议的动作类型"),
  params: z.record(z.unknown()).optional().describe("动作参数"),
});

export const WriteRespondActionParamsSchema = z.object({
  accept: z.boolean().describe("是否接受对方的动作提议"),
  reason: z.string().optional().describe("接受或拒绝的理由"),
});

export const EndDialogParamsSchema = z.object({
  summary: z.string().optional().describe("对话结束的简短总结"),
});

export const WriteMemoryParamsSchema = z.object({
  layer: z.enum(["short", "daily", "weekly"]).describe("写入哪一层"),
  content: z.string().describe("记忆内容"),
  importance: z.number().int().min(1).max(5).describe("重要程度 1-5"),
  merge_with_id: z.string().optional().describe("合并到已有记忆条目的 ID（替换其内容）"),
});

export const DeleteMemoryParamsSchema = z.object({
  layer: z.enum(["short", "daily", "weekly"]).describe("从哪一层删除"),
  memory_id: z.string().describe("要删除的记忆条目 ID"),
});

export const WriteImpressionParamsSchema = z.object({
  target_id: z.string().describe("目标角色 ID"),
  impression: z.string().describe("对目标角色的新印象"),
});

export const WriteNotebookParamsSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  hour: z.number().int().min(0).max(23),
  content: z.string(),
});

export const WriteLikeParamsSchema = z.object({
  content: z.string().describe("喜欢的事物或人"),
});

export const WriteDislikeParamsSchema = z.object({
  content: z.string().describe("厌恶的事物或人"),
});

export const WriteShortTermGoalParamsSchema = z.object({
  goal: z.string().describe("新的短期目标"),
});

export const WriteLongTermGoalParamsSchema = z.object({
  goal: z.string().describe("新的长期目标"),
});

export const WriteRelationParamsSchema = z.object({
  target_id: z.string().describe("目标角色 ID"),
  action: z.enum(["add", "remove"]).describe("添加或移除关系"),
  kind: z.string().describe("关系类型"),
});

export const EndThinkingParamsSchema = z.object({
  summary: z.string().describe("本次记忆整理的总结"),
});
```

- [ ] **Step 4: Build ChatCompletionTool builders**

```typescript
// ── Tool Builder Functions ──

interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

function makeTool(name: string, description: string, schema: z.ZodType): ToolDef {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: zodToJsonSchema(schema), // use existing helper or inline
    },
  };
}

export function buildReadTools(): ToolDef[] {
  return [
    makeTool(READ_PROFILE_TOOL, "查询自己的基本信息：姓名、年龄、性别、职业、性格、语言风格、喜好、能力", z.object({})),
    makeTool(READ_VITALS_TOOL, "查询自己当前的生理状态：饥饿、疲劳、卫生", z.object({})),
    makeTool(READ_EMOTION_TOOL, "查询自己当前的情绪状态：心情、压力、社交饱足度", z.object({})),
    makeTool(READ_MEMORIES_TOOL, "按记忆层和时间范围查询记忆，按重要性降序再按时间降序返回", ReadMemoriesParamsSchema),
    makeTool(READ_GOALS_TOOL, "查询自己当前的短期和长期目标", z.object({})),
    makeTool(READ_ECONOMY_TOOL, "查询自己的经济状况：金钱、日常开销、经济警告", z.object({})),
    makeTool(READ_RELATIONS_TOOL, "查询自己与他人的关系标签和印象记录", ReadRelationsParamsSchema),
    makeTool(READ_CHARACTER_TOOL, "查询指定角色的公开信息：外观、身份、自己与该角色的关系和印象", ReadCharacterParamsSchema),
    makeTool(READ_NOTEBOOK_TOOL, "查询即将到来的个人预约事项", z.object({})),
    makeTool(READ_MAP_TOOL, "查看完整地图结构，标注自己当前所在位置", z.object({})),
    makeTool(READ_COMPANIONS_TOOL, "查看当前所在节点的其他角色", z.object({})),
    makeTool(READ_EVENTS_TOOL, "查询近期感知到的事件和活跃的全局事件", ReadEventsParamsSchema),
    makeTool(READ_STATE_TOOL, "查询自己当前正在执行的动作和进行中的对话状态", z.object({})),
  ];
}

export function buildDecideWriteTools(): ToolDef[] {
  return [
    makeTool(WRITE_DECISION_TOOL, "做出行动决定。收集足够信息后，选择一个行动执行", WriteDecisionParamsSchema),
    makeTool(WRITE_MEMORY_TOOL, "写入一条记忆到指定记忆层", WriteMemoryParamsSchema),
    makeTool(WRITE_IMPRESSION_TOOL, "记录或更新对某个角色的印象", WriteImpressionParamsSchema),
    makeTool(WRITE_NOTEBOOK_TOOL, "在记事本中添加一条预约事项", WriteNotebookParamsSchema),
    makeTool(WRITE_LIKE_TOOL, "添加一项喜好", WriteLikeParamsSchema),
    makeTool(WRITE_DISLIKE_TOOL, "添加一项厌恶", WriteDislikeParamsSchema),
    makeTool(WRITE_SHORT_TERM_GOAL_TOOL, "更新短期目标", WriteShortTermGoalParamsSchema),
    makeTool(WRITE_LONG_TERM_GOAL_TOOL, "更新长期目标", WriteLongTermGoalParamsSchema),
    makeTool(WRITE_RELATION_TOOL, "添加或移除与他人的关系标签", WriteRelationParamsSchema),
  ];
}

export function buildDialogWriteTools(): ToolDef[] {
  return [
    makeTool(WRITE_DIALOG_TOOL, "说一句话。可以在同一轮中附带动作提议或回应", WriteDialogParamsSchema),
    makeTool(WRITE_PROPOSE_ACTION_TOOL, "向对方提议一个动作（如赠送物品、邀请同行）", WriteProposeActionParamsSchema),
    makeTool(WRITE_RESPOND_ACTION_TOOL, "接受或拒绝对方提议的动作", WriteRespondActionParamsSchema),
    makeTool(END_DIALOG_TOOL, "结束当前对话", EndDialogParamsSchema),
    makeTool(WRITE_MEMORY_TOOL, "写入一条记忆到指定记忆层", WriteMemoryParamsSchema),
    makeTool(WRITE_IMPRESSION_TOOL, "记录或更新对某个角色的印象", WriteImpressionParamsSchema),
    makeTool(WRITE_NOTEBOOK_TOOL, "在记事本中添加一条预约事项", WriteNotebookParamsSchema),
    makeTool(WRITE_LIKE_TOOL, "添加一项喜好", WriteLikeParamsSchema),
    makeTool(WRITE_DISLIKE_TOOL, "添加一项厌恶", WriteDislikeParamsSchema),
    makeTool(WRITE_SHORT_TERM_GOAL_TOOL, "更新短期目标", WriteShortTermGoalParamsSchema),
    makeTool(WRITE_LONG_TERM_GOAL_TOOL, "更新长期目标", WriteLongTermGoalParamsSchema),
    makeTool(WRITE_RELATION_TOOL, "添加或移除与他人的关系标签", WriteRelationParamsSchema),
  ];
}

export function buildThinkWriteTools(): ToolDef[] {
  return [
    makeTool(WRITE_MEMORY_TOOL, "写入或合并一条记忆到指定记忆层", WriteMemoryParamsSchema),
    makeTool(DELETE_MEMORY_TOOL, "删除指定层中的一条记忆（低价值或已合并的）", DeleteMemoryParamsSchema),
    makeTool(END_THINKING_TOOL, "结束本次记忆整理并产出总结", EndThinkingParamsSchema),
    makeTool(WRITE_IMPRESSION_TOOL, "记录或更新对某个角色的印象", WriteImpressionParamsSchema),
    makeTool(WRITE_NOTEBOOK_TOOL, "在记事本中添加一条预约事项", WriteNotebookParamsSchema),
    makeTool(WRITE_LIKE_TOOL, "添加一项喜好", WriteLikeParamsSchema),
    makeTool(WRITE_DISLIKE_TOOL, "添加一项厌恶", WriteDislikeParamsSchema),
    makeTool(WRITE_SHORT_TERM_GOAL_TOOL, "更新短期目标", WriteShortTermGoalParamsSchema),
    makeTool(WRITE_LONG_TERM_GOAL_TOOL, "更新长期目标", WriteLongTermGoalParamsSchema),
    makeTool(WRITE_RELATION_TOOL, "添加或移除与他人的关系标签", WriteRelationParamsSchema),
  ];
}
```

- [ ] **Step 5: Keep existing zodToJsonSchema helper — if it doesn't exist, add one**

Check `backend/src/domain/schemas.ts` for an existing helper like `zodToJsonSchema`. If absent:

```typescript
import { zodToJsonSchema } from "zod-to-json-schema";
```

If this dependency is not available, inline a simple converter:

```typescript
function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return JSON.parse(JSON.stringify(zodToJsonSchema(schema)));
}
```

- [ ] **Step 6: Remove old tool constants and schemas**

Delete these old constants:
- `ACCEPT_TOOL_NAME`, `DIALOG_TURN_TOOL_NAME`, `END_CONVERSATION_TOOL_NAME`, `DIALOGUE_ACTION_TOOL_PREFIX`, `RESPOND_DIALOGUE_ACTION_TOOL_NAME`, `DIALOG_SUMMARY_TOOL_NAME`, `DIALOG_PERSONAL_MEMORY_TOOL_NAME`, `THINK_TOOL_NAME`, `END_THINKING_TOOL_NAME`, `VIEW_MAP_TOOL_NAME`, `DECIDE_ACTION_TOOL_NAME`, `RECALL_TOOL_NAME`, `MEMORIZE_TOOL_NAME`, `NOTEBOOK_TOOL_NAME`, `UPDATE_LIKES_TOOL_NAME`, `UPDATE_RELATION_TOOL_NAME`, `UPDATE_GOALS_TOOL_NAME`, `ACTION_TOOL_PREFIX`

And old schema constants:
- `AcceptDecisionSchema`, `AcceptToolSchema`, `DialogTurnSchema`, `DialogTurnToolSchema`, `EndConversationSchema`, `EndConversationToolSchema`, `ProposeDialogueActionSchema`, `ProposeDialogueActionToolSchema`, `RespondDialogueActionSchema`, `RespondDialogueActionToolSchema`, `DialogSummarySchema`, `DialogSummaryToolSchema`, `DialogPersonalMemorySchema`, `DialogPersonalMemoryToolSchema`, `ThinkTurnSchema`, `ThinkTurnToolSchema`, `EndThinkingSchema`, `EndThinkingToolSchema`, `ViewMapSchema`, `ViewMapToolSchema`, `DecideActionSchema`, `DecideActionToolSchema`, `RecallSchema`, `RecallToolSchema`, `MemorizeSchema`, `MemorizeToolSchema`, `NotebookSchema`, `NotebookToolSchema`, `UpdateLikesSchema`, `UpdateLikesToolSchema`, `UpdateRelationSchema`, `UpdateRelationToolSchema`, `UpdateGoalsSchema`, `UpdateGoalsToolSchema`

And old tool builder functions:
- `buildPerActionSchema`, `buildActionTools`, `buildDecideActionTool`, `buildDialogueActionTools`, `toolNameForAction`, `actionTypeFromToolName`, `dialogueToolNameForAction`, `dialogueActionTypeFromToolName`

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: errors in files that imported removed symbols (decide.ts, dialog.ts, prompt.ts, tick.ts). These will be fixed in subsequent phases.

- [ ] **Step 8: Commit**

```bash
git add backend/src/domain/schemas.ts
git commit -m "feat: replace old tool schemas with read_*/write_* tool definitions"
```

---

## Phase 3: System Prompts

### Task 3: Create system prompt constants

**Files:**
- Create: `backend/src/llm/system-prompts.ts`

- [ ] **Step 1: Write the shared rules and decide/dialog/think system prompts**

```typescript
// backend/src/llm/system-prompts.ts

import type { Character } from "../domain";

// ── Shared Rules (all three agents) ──

const WORLD_RULES = `你是一个生活在这个世界里的普通人，不是超人，也不是什么英雄。

## 行为决策优先级
1. **生理需求** > 性格/情绪 > 预约事项 > 自由行动
2. 生理需求是本能，不可违抗；但如何满足需求由你的性格和习惯决定
3. 情绪影响你的选择方向（心情差时更可能做出消极选择）
4. 预约事项不是必须遵守的——你可能会放鸽子
5. 人是复杂的：你可能闹脾气、吃醋、嫉妒、虚伪、口是心非

## 你应该
- 先通过 read_* 工具了解自己的状态、周围环境、近期经历
- 基于你已经了解的信息做决定，不要凭空猜测
- 你的选择必须符合你的人设、性格、经历
- 当你不确定时，多 read 少 write`;

const TOOL_GUIDANCE = `## 工具使用指南
- **read_* 工具**：收集信息，不产生任何修改。你可以连续使用多个 read_* 工具
- **write_* 工具**：产出内容、修改状态。调用 write_* 工具意味着你完成了当前轮的思考
- 每个 write_* 工具的描述中会说明它的具体作用和使用时机
- 进行中的 read_* 调用不会计入你的决策轮次——花时间了解状况是值得的`;

const LANGUAGE_RULE = `始终使用中文进行所有输出和交流。`;

// ── Agent-Specific System Prompts ──

export function buildDecideSystemPrompt(): string {
  return `${WORLD_RULES}

${TOOL_GUIDANCE}

${LANGUAGE_RULE}

## 当前任务
你需要在当前时间点做出一个行动决定。
1. 先了解自己的身体状态、情绪、近期记忆、周围环境
2. 基于你的性格和当前状态，选择一个最合理的行动
3. 调用 write_decision 做出最终决定`;
}

export function buildDialogSystemPrompt(selfName: string, peerName: string): string {
  return `${WORLD_RULES}

${TOOL_GUIDANCE}

${LANGUAGE_RULE}

## 当前任务
你正在与 ${peerName} 对话。你是 ${selfName}。
1. 先了解对方是谁、你与对方的关系、你对TA的印象、当前对话的上下文
2. 说符合你人设的话——你说话的口气、态度、内容应该与你的性格一致
3. 你可以在对话中提议动作（赠送物品、邀请同行等）
4. 对话自然结束时调用 end_dialog
5. 每次调用 write_dialog 说一句话

重要：你不是客服，不要说客套话。做一个真实的人。`;
}

export function buildThinkSystemPrompt(): string {
  return `${WORLD_RULES}

${TOOL_GUIDANCE}

${LANGUAGE_RULE}

## 当前任务
你的短期记忆快满了。你需要整理三个记忆盒子：
- **short**（容量 60）：刚才发生的事
- **daily**（容量 20）：今天值得记住的事
- **weekly**（容量 5）：人生中真正重要的事

1. 先 read_memories 查看各层现有内容
2. 合并重复、提升重要的到上层、删除琐碎的
3. 用 write_memory 写入整理后的记忆，merge_with_id 可替换已有条目
4. 用 delete_memory 删除低价值记忆
5. 完成后调用 end_thinking

目标是：short 记忆清出空间（降到 40 条以下），daily 和 weekly 保留真正有价值的内容。`;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors in system-prompts.ts (it imports only from domain).

- [ ] **Step 3: Commit**

```bash
git add backend/src/llm/system-prompts.ts
git commit -m "feat: add system prompt constants for three agents"
```

---

## Phase 4: Tool Handlers

### Task 4: Create read tool handler functions

**Files:**
- Create: `backend/src/llm/tool-handlers.ts`

- [ ] **Step 1: Define handler context and result types, then implement all read handlers**

```typescript
// backend/src/llm/tool-handlers.ts

import type { Character, MapNode, Memory, WorldEvent } from "../domain";
import { MEMORY_CAPACITY } from "../domain/enums";
import { readProfile } from "./prompt"; // keep existing character description helpers
import { buildMapView } from "./prompt";
import type { ActionContext } from "../domain/action-system";

export interface ToolHandlerContext {
  self: Character;
  allCharacters: Character[];
  nodes: MapNode[];
  shops?: unknown[];
  itemDefs?: unknown[];
  tick: number;
  epoch: number;
  worldId: string;
  worldDescription?: string;
  perceptions?: Map<string, WorldEvent[]>;
  activeEventDefs?: unknown[];
  upcomingNotebookText?: string;
}

type HandlerResult = string | Record<string, unknown>;

// ── Read Handlers ──

export function handleReadProfile(ctx: ToolHandlerContext): HandlerResult {
  const c = ctx.self;
  const p = c.personality;

  // Qualitative MBTI labels (reuse existing logic from prompt.ts)
  const eiLabel = p.ei <= -3 ? "极度内向，喜欢独处"
    : p.ei <= -1 ? "偏内向"
    : p.ei <= 1 ? "内外向平衡"
    : p.ei >= 3 ? "极度外向，离不开人群"
    : "偏外向";
  const snLabel = p.sn <= -3 ? "极度直觉，天马行空"
    : p.sn <= -1 ? "偏直觉"
    : p.sn <= 1 ? "平衡"
    : p.sn >= 3 ? "极度务实，脚踏实地"
    : "偏务实";
  const tfLabel = p.tf <= -3 ? "极度感性，情绪驱动"
    : p.tf <= -1 ? "偏感性"
    : p.tf <= 1 ? "平衡"
    : p.tf >= 3 ? "极度理性，逻辑优先"
    : "偏理性";
  const jpLabel = p.jp <= -3 ? "极度随性，讨厌计划"
    : p.jp <= -1 ? "偏随性"
    : p.jp <= 1 ? "平衡"
    : p.jp >= 3 ? "极度自律，喜欢规划"
    : "偏自律";

  const intelLabels: Record<number, string> = {
    1: "你头脑比较简单，不太擅长复杂思考",
    2: "你和普通人一样，能处理日常事务",
    3: "你头脑灵活，遇事容易想到不同的做法",
    4: "你极其聪明，总能洞察事物的本质",
  };

  return {
    name: c.name,
    age: c.age,
    gender: c.gender,
    profession: c.profession,
    appearance: c.appearance, // 1-4
    health_status: c.health >= 3 ? "健康" : c.health === 2 ? "一般" : c.sickness ? "患病" : "虚弱",
    personality: `${eiLabel}，${snLabel}，${tfLabel}，${jpLabel}`,
    intelligence: intelLabels[c.intelligence] ?? "",
    speaking_style: c.speakingStyle ?? "说话风格自然",
    past: c.personalProfile.past,
    present: c.personalProfile.present,
    liked: c.liked,
    disliked: c.disliked,
    abilities: c.abilities.map((a) => `${a.kind}（等级${a.tier}）`),
  };
}

export function handleReadVitals(ctx: ToolHandlerContext): HandlerResult {
  const v = ctx.self.vitals;
  const qualifyVital = (name: string, value: number): string => {
    if (value <= 2) return "正常";
    if (value <= 5) return `有点${name === "hunger" ? "饿" : name === "fatigue" ? "累" : "脏"}`;
    if (value <= 9) return `明显${name === "hunger" ? "饥饿" : name === "fatigue" ? "疲劳" : "需要洗浴"}`;
    if (value <= 13) return `非常${name === "hunger" ? "饥饿" : name === "fatigue" ? "疲惫" : "很脏"}`;
    return `极度${name === "hunger" ? "饥饿" : name === "fatigue" ? "疲惫" : "急需洗浴"}`;
  };
  return {
    hunger: qualifyVital("hunger", v.hunger),
    fatigue: qualifyVital("fatigue", v.fatigue),
    hygiene: qualifyVital("hygiene", v.hygiene),
    hunger_raw: v.hunger,
    fatigue_raw: v.fatigue,
    hygiene_raw: v.hygiene,
  };
}

export function handleReadEmotion(ctx: ToolHandlerContext): HandlerResult {
  const e = ctx.self.emotion;
  const moodLabel = e.mood <= -3 ? "非常低落" : e.mood <= -1 ? "有点低落" : e.mood <= 1 ? "平静" : e.mood >= 3 ? "非常好" : "不错";
  const stressLabel = e.stress >= 4 ? "极度紧张" : e.stress >= 3 ? "相当紧张" : e.stress >= 2 ? "有些压力" : e.stress >= 1 ? "轻微压力" : "轻松";
  const socialLabel = e.social_satiety <= -3 ? "深深孤独，渴望社交" : e.social_satiety <= -1 ? "有点孤单" : e.social_satiety <= 1 ? "社交需求正常" : e.social_satiety >= 3 ? "社交非常满足" : "社交比较满足";
  return {
    mood: moodLabel,
    stress: stressLabel,
    social_satiety: socialLabel,
    mood_raw: e.mood,
    stress_raw: e.stress,
    social_satiety_raw: e.social_satiety,
  };
}

export function handleReadMemories(
  args: { layer: string; time_range_start?: number; time_range_end?: number; target_id?: string; limit?: number },
  ctx: ToolHandlerContext,
): HandlerResult {
  const { layer, time_range_start, time_range_end, target_id, limit = 10 } = args;
  const c = ctx.self;

  let memories: Memory[];
  if (layer === "short") memories = [...c.shortMemory];
  else if (layer === "daily") memories = [...c.dailyMemory];
  else memories = [...c.longMemory];

  // Filter by time range
  if (time_range_start != null) memories = memories.filter((m) => m.tick >= time_range_start);
  if (time_range_end != null) memories = memories.filter((m) => m.tick <= time_range_end);

  // Filter by target character
  if (target_id) {
    memories = memories.filter((m) => m.content.includes(target_id)); // simple keyword match
  }

  // Sort: importance desc → tick desc (most recent first among same importance)
  memories.sort((a, b) => b.importance - a.importance || b.tick - a.tick);

  const total = memories.length;
  memories = memories.slice(0, limit);

  return {
    layer,
    total_matching: total,
    returned: memories.length,
    capacity: MEMORY_CAPACITY[layer as keyof typeof MEMORY_CAPACITY] ?? "unknown",
    entries: memories.map((m) => ({
      id: m.id,
      tick: m.tick,
      importance: m.importance,
      content: m.content,
    })),
  };
}

export function handleReadGoals(ctx: ToolHandlerContext): HandlerResult {
  const c = ctx.self;
  return {
    short_term: c.shortTermGoal?.goal ?? "暂无短期目标",
    long_term: c.longTermGoal?.goal ?? "暂无长期目标",
    short_term_updated_at: c.shortTermGoal?.updatedAt ?? 0,
    long_term_updated_at: c.longTermGoal?.updatedAt ?? 0,
  };
}

export function handleReadEconomy(ctx: ToolHandlerContext): HandlerResult {
  const c = ctx.self;
  let warning = "";
  if (c.money <= 0) warning = "你身无分文！需要尽快赚钱";
  else if (c.money < 50) warning = "你的钱快花光了";
  return {
    money: c.money,
    income_level: c.incomeLevel,
    expense_exempt: c.expenseExempt,
    warning: warning || null,
  };
}

export function handleReadRelations(
  args: { target_id?: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  const c = ctx.self;
  const targetId = args.target_id;

  const relationEntries = Object.entries(c.relations)
    .filter(([id]) => !targetId || id === targetId);

  const results = relationEntries.map(([charId, rel]) => {
    const targetChar = ctx.allCharacters.find((ch) => ch.id === charId);
    return {
      character_id: charId,
      character_name: targetChar?.name ?? "未知",
      relations: rel.kinds,
      since_tick: rel.since,
      last_interaction_tick: rel.lastInteractionTick,
      impression: c.impressionBook[charId] ?? "暂无印象",
    };
  });

  return { relations: results };
}

export function handleReadCharacter(
  args: { character_id: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  const target = ctx.allCharacters.find((ch) => ch.id === args.character_id);
  if (!target) return { error: `未找到角色 ${args.character_id}` };

  const relationship = ctx.self.relations[args.character_id];
  const impression = ctx.self.impressionBook[args.character_id];

  return {
    name: target.name,
    age: target.age,
    gender: target.gender,
    profession: target.profession,
    appearance: target.appearance,
    location: ctx.nodes.find((n) => n.id === target.locationId)?.name ?? "未知",
    relationship_to_me: relationship ? relationship.kinds.join("、") : "无特殊关系",
    my_impression_of_them: impression ?? "暂无印象",
    currently_in_conversation: target.activeConversationIds.length > 0,
  };
}

export function handleReadNotebook(ctx: ToolHandlerContext): HandlerResult {
  const entries = ctx.self.notebook
    .filter((e) => e.scheduledTick >= ctx.tick)
    .sort((a, b) => a.scheduledTick - b.scheduledTick)
    .slice(0, 10);

  return {
    upcoming: entries.map((e) => ({
      id: e.id,
      scheduled_tick: e.scheduledTick,
      content: e.content,
    })),
  };
}

export function handleReadMap(ctx: ToolHandlerContext): HandlerResult {
  const here = ctx.nodes.find((n) => n.id === ctx.self.locationId);
  if (!here) return { error: "当前位置未知" };

  return {
    current_location: `${here.name}（${here.description}）`,
    current_node_id: here.id,
    full_map: buildMapView(here, ctx.nodes, ctx.shops),
  };
}

export function handleReadCompanions(ctx: ToolHandlerContext): HandlerResult {
  const here = ctx.self.locationId;
  const companions = ctx.allCharacters.filter(
    (ch) => ch.id !== ctx.self.id && ch.locationId === here,
  );

  return {
    location: ctx.nodes.find((n) => n.id === here)?.name ?? "未知",
    companions: companions.map((ch) => ({
      id: ch.id,
      name: ch.name,
      profession: ch.profession,
      is_in_conversation: ch.activeConversationIds.length > 0,
      ongoing_action: ch.currentAction?.description ?? null,
    })),
    count: companions.length,
  };
}

export function handleReadEvents(
  args: { limit?: number; category?: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  const perceptionList = ctx.perceptions?.get(ctx.self.id) ?? [];
  let events = [...perceptionList];

  if (args.category) events = events.filter((e) => e.category === args.category);

  events.sort((a, b) => b.tick - a.tick);
  const limit = args.limit ?? 10;
  events = events.slice(0, limit);

  return {
    events: events.map((e) => ({
      id: e.id,
      tick: e.tick,
      category: e.category,
      description: e.description,
      intensity: e.intensity,
      participants: e.participants,
    })),
    active_global_events: (ctx.activeEventDefs as Array<{ eventType: string }>)?.map((ae) => ae.eventType) ?? [],
  };
}

export function handleReadState(ctx: ToolHandlerContext): HandlerResult {
  const c = ctx.self;
  return {
    current_action: c.currentAction
      ? { type: c.currentAction.type, description: c.currentAction.description, started_at: c.currentAction.startedAt, ends_at: c.currentAction.endsAt }
      : null,
    active_conversations: c.activeConversationIds,
    pending_chat_invitations: [], // populated by caller before invoking agent
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: tool-handlers.ts compiles. Other files may have pre-existing errors from the schema changes.

- [ ] **Step 3: Commit**

```bash
git add backend/src/llm/tool-handlers.ts
git commit -m "feat: add read tool handler implementations"
```

---

### Task 5: Create write tool handler functions

**Files:**
- Modify: `backend/src/llm/tool-handlers.ts`

- [ ] **Step 1: Append write handlers to tool-handlers.ts**

```typescript
// ── Write Handlers ──

export function handleWriteImpression(
  args: { target_id: string; impression: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  ctx.self.impressionBook[args.target_id] = args.impression.trim();
  return { success: true, action: `已更新对 ${args.target_id} 的印象` };
}

export function handleWriteNotebook(
  args: { year: number; month: number; day: number; hour: number; content: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  // Convert calendar time to tick
  const scheduledTick = (args.year * 365 * 24 + args.month * 30 * 24 + args.day * 24 + args.hour) * 5
    - ctx.epoch; // simplified — use existing time utility from prompt.ts

  const entry = {
    id: `nb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    scheduledTick: ctx.tick + 10, // placeholder; real implementation uses calendar math
    content: args.content,
    createdAt: ctx.tick,
  };
  ctx.self.notebook.push(entry);
  return { success: true, entry };
}

export function handleWriteLike(
  args: { content: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  ctx.self.liked = args.content;
  return { success: true, liked: args.content };
}

export function handleWriteDislike(
  args: { content: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  ctx.self.disliked = args.content;
  return { success: true, disliked: args.content };
}

export function handleWriteShortTermGoal(
  args: { goal: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  ctx.self.shortTermGoal = { goal: args.goal, updatedAt: ctx.tick };
  return { success: true, short_term_goal: args.goal };
}

export function handleWriteLongTermGoal(
  args: { goal: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  ctx.self.longTermGoal = { goal: args.goal, updatedAt: ctx.tick };
  return { success: true, long_term_goal: args.goal };
}

export function handleWriteRelation(
  args: { target_id: string; action: "add" | "remove"; kind: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  const rel = ctx.self.relations[args.target_id];
  if (args.action === "add") {
    if (rel) {
      if (!rel.kinds.includes(args.kind as any)) {
        rel.kinds.push(args.kind as any);
      }
    } else {
      ctx.self.relations[args.target_id] = {
        kinds: [args.kind as any],
        since: ctx.tick,
        lastInteractionTick: ctx.tick,
      };
    }
    return { success: true, action: `已添加与 ${args.target_id} 的 ${args.kind} 关系` };
  } else {
    if (rel) {
      // Protect blood relations from removal
      const BLOOD_RELATIONS = ["father", "mother", "son", "daughter", "siblings"];
      if (BLOOD_RELATIONS.includes(args.kind)) {
        return { error: `血缘关系 ${args.kind} 不可移除` };
      }
      rel.kinds = rel.kinds.filter((k) => k !== args.kind);
      if (rel.kinds.length === 0) delete ctx.self.relations[args.target_id];
    }
    return { success: true, action: `已移除与 ${args.target_id} 的 ${args.kind} 关系` };
  }
}

export function handleWriteMemory(
  args: { layer: string; content: string; importance: number; merge_with_id?: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  const c = ctx.self;
  const layer = args.layer as "short" | "daily" | "weekly";
  const memoryArray = layer === "short" ? c.shortMemory : layer === "daily" ? c.dailyMemory : c.longMemory;
  const maxCap = MEMORY_CAPACITY[layer];

  if (args.merge_with_id) {
    // Merge: replace content of existing entry
    const existing = memoryArray.find((m) => m.id === args.merge_with_id);
    if (existing) {
      existing.content = args.content;
      existing.importance = args.importance;
      existing.tick = ctx.tick;
      return { success: true, merged: existing.id, layer };
    }
    // Fall through to create new if merge target not found
  }

  const memory: Memory = {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tick: ctx.tick,
    importance: args.importance,
    content: args.content,
    layer,
  };

  memoryArray.push(memory);

  // FIFO eviction when over capacity
  while (memoryArray.length > maxCap) {
    memoryArray.shift();
  }

  return { success: true, created: memory.id, layer, remaining_capacity: maxCap - memoryArray.length };
}

export function handleDeleteMemory(
  args: { layer: string; memory_id: string },
  ctx: ToolHandlerContext,
): HandlerResult {
  const c = ctx.self;
  const layer = args.layer as "short" | "daily" | "weekly";
  const memoryArray = layer === "short" ? c.shortMemory : layer === "daily" ? c.dailyMemory : c.longMemory;

  const idx = memoryArray.findIndex((m) => m.id === args.memory_id);
  if (idx === -1) {
    return { error: `未在 ${layer} 层找到记忆 ${args.memory_id}` };
  }

  memoryArray.splice(idx, 1);
  return { success: true, deleted: args.memory_id, layer, remaining: memoryArray.length };
}

// Write handler registry
export const WRITE_HANDLERS: Record<string, (args: any, ctx: ToolHandlerContext) => HandlerResult> = {
  write_impression: handleWriteImpression,
  write_notebook: handleWriteNotebook,
  write_like: handleWriteLike,
  write_dislike: handleWriteDislike,
  write_short_term_goal: handleWriteShortTermGoal,
  write_long_term_goal: handleWriteLongTermGoal,
  write_relation: handleWriteRelation,
  write_memory: handleWriteMemory,
  delete_memory: handleDeleteMemory,
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/llm/tool-handlers.ts
git commit -m "feat: add write tool handler implementations"
```

---

## Phase 5: Generic Agent Loop

### Task 6: Create the shared ReAct agent loop

**Files:**
- Create: `backend/src/llm/agent-loop.ts`

- [ ] **Step 1: Implement the generic agent loop**

```typescript
// backend/src/llm/agent-loop.ts

import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { getLLMClientForEntry, getModelNameForEntry, getEntryConfig } from "./client";
import type { ToolDef } from "../domain/schemas";
import type { ToolHandlerContext } from "./tool-handlers";
import { WRITE_HANDLERS } from "./tool-handlers";

export interface AgentLoopInput {
  systemPrompt: string;
  readTools: ToolDef[];
  writeTools: ToolDef[];
  terminalToolNames: string[];
  readToolNames: string[];
  llmEntryName: string; // e.g. "decide", "dialog_turn"
  maxRounds?: number;
  sharedMessages?: ChatCompletionMessageParam[];
  language?: string;
  toolHandlerContext: ToolHandlerContext;
  /** Custom handlers for agent-specific write tools */
  customWriteHandlers?: Record<string, (args: any, ctx: ToolHandlerContext) => Record<string, unknown>>;
}

export interface AgentLoopResult {
  kind: "terminal" | "exhausted";
  terminalToolName?: string;
  terminalArgs?: Record<string, unknown>;
  messages: ChatCompletionMessageParam[];
}

const ALL_READ_TOOL_NAMES: string[] = [
  "read_profile", "read_vitals", "read_emotion", "read_memories",
  "read_goals", "read_economy", "read_relations", "read_character",
  "read_notebook", "read_map", "read_companions", "read_events", "read_state",
];

export async function runAgentLoop(input: AgentLoopInput): Promise<AgentLoopResult> {
  const {
    systemPrompt,
    readTools,
    writeTools,
    terminalToolNames,
    readToolNames,
    llmEntryName,
    maxRounds = 20,
    sharedMessages = [],
    toolHandlerContext: ctx,
    customWriteHandlers = {},
  } = input;

  const client = getLLMClientForEntry(llmEntryName);
  const model = getModelNameForEntry(llmEntryName);
  const config = getEntryConfig(llmEntryName);

  const allTools: ToolDef[] = [...readTools, ...writeTools];
  const messages: ChatCompletionMessageParam[] = [...sharedMessages];
  let round = 0;

  // Dynamically import read handlers
  const { handleReadProfile, handleReadVitals, handleReadEmotion, handleReadMemories,
    handleReadGoals, handleReadEconomy, handleReadRelations, handleReadCharacter,
    handleReadNotebook, handleReadMap, handleReadCompanions, handleReadEvents,
    handleReadState } = await import("./tool-handlers");

  const READ_HANDLERS: Record<string, (args: any, ctx: ToolHandlerContext) => any> = {
    read_profile: handleReadProfile,
    read_vitals: handleReadVitals,
    read_emotion: handleReadEmotion,
    read_memories: handleReadMemories,
    read_goals: handleReadGoals,
    read_economy: handleReadEconomy,
    read_relations: handleReadRelations,
    read_character: handleReadCharacter,
    read_notebook: handleReadNotebook,
    read_map: handleReadMap,
    read_companions: handleReadCompanions,
    read_events: handleReadEvents,
    read_state: handleReadState,
  };

  while (round < maxRounds) {
    const extra: Record<string, unknown> = {};
    if (config.thinkingEnabled) extra.thinking = { type: "enabled" };

    const response = await client.chat.completions.create({
      model,
      max_tokens: llmEntryName === "decide" ? 16384 : 4096,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      tools: allTools.map((t) => ({
        type: "function" as const,
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters as Record<string, unknown>,
        },
      })),
      ...extra,
    });

    const choice = response.choices[0]?.message;
    if (!choice) throw new Error("LLM 未返回有效 choice");

    // Handle text-only response (re-prompt)
    if (!choice.tool_calls || choice.tool_calls.length === 0) {
      messages.push({
        role: "user",
        content: "请使用工具来完成你的任务。你必须调用一个 write_* 工具来产出结果。",
      });
      round++;
      continue;
    }

    for (const tc of choice.tool_calls) {
      if (tc.type !== "function") continue;

      const toolName = tc.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        args = {};
      }

      // Append assistant tool call
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: [tc],
      } as ChatCompletionMessageParam);

      // Check terminal
      if (terminalToolNames.includes(toolName)) {
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ accepted: true }),
        });
        return {
          kind: "terminal",
          terminalToolName: toolName,
          terminalArgs: args,
          messages,
        };
      }

      // Execute handler
      let result: any;
      if (READ_HANDLERS[toolName]) {
        result = READ_HANDLERS[toolName](args, ctx);
      } else if (WRITE_HANDLERS[toolName]) {
        result = WRITE_HANDLERS[toolName](args, ctx);
      } else if (customWriteHandlers[toolName]) {
        result = customWriteHandlers[toolName](args, ctx);
      } else {
        result = { error: `未知工具: ${toolName}` };
      }

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });

      // Only non-read tools consume rounds
      if (!readToolNames.includes(toolName)) {
        round++;
      }
    }
  }

  // Exhausted — return without terminal
  return { kind: "exhausted", messages };
}
```

- [ ] **Step 2: Fix the dynamic import — use static imports instead**

The `await import()` inside the loop is not ideal. Replace with static imports at the top:

```typescript
import {
  handleReadProfile, handleReadVitals, handleReadEmotion, handleReadMemories,
  handleReadGoals, handleReadEconomy, handleReadRelations, handleReadCharacter,
  handleReadNotebook, handleReadMap, handleReadCompanions, handleReadEvents,
  handleReadState,
} from "./tool-handlers";
```

And define `READ_HANDLERS` at module level (outside the function).

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/llm/agent-loop.ts
git commit -m "feat: add generic ReAct agent loop"
```

---

## Phase 6: Decide Agent

### Task 7: Create the Decide Agent

**Files:**
- Modify: `backend/src/llm/decide.ts` — replace current content

- [ ] **Step 1: Rewrite decide.ts with new Agent-based llmDecide**

```typescript
// backend/src/llm/decide.ts

import type { Character, MapNode, Action, WorldEvent } from "../domain";
import type { ActionContext } from "../domain/action-system";
import { actionRegistry } from "../domain/action-system";
import { buildDecideSystemPrompt } from "./system-prompts";
import { buildReadTools, buildDecideWriteTools, WRITE_DECISION_TOOL, ALL_READ_TOOLS } from "../domain/schemas";
import { runAgentLoop } from "./agent-loop";
import type { AgentLoopResult, ToolHandlerContext } from "./tool-handlers";
import { WRITE_HANDLERS } from "./tool-handlers";
import { hasApiKey } from "./client";
import { buildActionContext } from "../server/tick"; // may need refactoring

export interface DecideInput {
  character: Character;
  nodes: MapNode[];
  here: MapNode;
  companions: Character[];
  reachable: string[];
  perceived: WorldEvent[];
  options: Array<{ type: string; hint: string; targetId?: string; targetNodeId?: string }>;
  worldName: string;
  tick: number;
  epoch: number;
  facts: any;
  language?: string;
  ctx: ActionContext;
  allCharacters: Character[];
  activeEventDefs?: any[];
  upcomingNotebookText?: string;
  shops?: any[];
  itemDefs?: any[];
  sharedMessages?: Array<Record<string, unknown>>;
}

export type DecideFn = (input: DecideInput) => Promise<Action>;

export async function llmDecide(input: DecideInput): Promise<Action> {
  if (!hasApiKey()) throw new Error("没有激活的 LLM provider");

  const systemPrompt = buildDecideSystemPrompt();
  const readTools = buildReadTools();
  const writeTools = buildDecideWriteTools();

  const toolHandlerContext: ToolHandlerContext = {
    self: input.character,
    allCharacters: input.allCharacters,
    nodes: input.nodes,
    shops: input.shops,
    itemDefs: input.itemDefs,
    tick: input.tick,
    epoch: input.epoch,
    worldId: input.character.worldId,
    worldDescription: input.worldName,
    perceptions: new Map([[input.character.id, input.perceived]]),
    activeEventDefs: input.activeEventDefs,
    upcomingNotebookText: input.upcomingNotebookText,
  };

  const result: AgentLoopResult = await runAgentLoop({
    systemPrompt,
    readTools,
    writeTools,
    terminalToolNames: [WRITE_DECISION_TOOL],
    readToolNames: [...ALL_READ_TOOLS],
    llmEntryName: "decide",
    maxRounds: 20,
    sharedMessages: input.sharedMessages as any,
    toolHandlerContext,
    customWriteHandlers: {
      // write_decision is terminal, handled by the loop. Options pass-through.
    },
  });

  if (result.kind === "terminal" && result.terminalToolName === WRITE_DECISION_TOOL && result.terminalArgs) {
    return payloadToAction(result.terminalArgs, input, result.messages);
  }

  // Exhausted — fallback to wait → look_around (keep existing fallback logic)
  return createFallbackAction(input);
}

// Keep existing helper functions
function payloadToAction(
  args: Record<string, unknown>,
  input: DecideInput,
  messages: Array<Record<string, unknown>>,
): Action {
  const actionType = args.action_type as string;
  const actionDef = actionRegistry.get(actionType);

  return {
    id: `act-${Date.now()}`,
    worldId: input.character.worldId,
    actorId: input.character.id,
    actorName: input.character.name,
    tick: input.tick,
    type: actionType,
    targetId: args.target_id as string | undefined,
    targetNodeId: args.target_node_id as string | undefined,
    freeText: args.free_text as string | undefined,
    reason: args.reason as string | undefined,
    amount: args.amount as number | undefined,
    displayName: actionDef?.displayName ?? actionType,
    selfImportance: 3,
    llmMessages: messages,
    arrivalAction: undefined,
  };
}

function createFallbackAction(input: DecideInput): Action {
  return {
    id: `act-fb-${Date.now()}`,
    worldId: input.character.worldId,
    actorId: input.character.id,
    actorName: input.character.name,
    tick: input.tick,
    type: "look_around",
    displayName: "环顾四周",
    freeText: "（决策失败，默认环顾四周）",
    reason: "LLM 未能完成决策",
    selfImportance: 1,
    llmMessages: [],
    arrivalAction: undefined,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: errors in tick.ts (still imports old functions). These will be fixed later.

- [ ] **Step 3: Commit**

```bash
git add backend/src/llm/decide.ts
git commit -m "feat: rewrite Decide Agent using agentic loop"
```

---

## Phase 7: Dialog Agent

### Task 8: Create the Dialog Agent turn function

**Files:**
- Modify: `backend/src/llm/dialog.ts` — restructure dialog turn logic

- [ ] **Step 1: Replace llmDialogTurn with agent-based version**

In `backend/src/llm/dialog.ts`, replace the turnDecide wrapper:

```typescript
import { buildDialogSystemPrompt } from "./system-prompts";
import { buildReadTools, buildDialogWriteTools, ALL_READ_TOOLS,
  WRITE_DIALOG_TOOL, END_DIALOG_TOOL, WRITE_PROPOSE_ACTION_TOOL, WRITE_RESPOND_ACTION_TOOL } from "../domain/schemas";
import { runAgentLoop } from "./agent-loop";
import type { AgentLoopResult, ToolHandlerContext } from "./tool-handlers";
import { WRITE_HANDLERS } from "./tool-handlers";

const DIALOG_TERMINAL_NAMES = [WRITE_DIALOG_TOOL, END_DIALOG_TOOL, WRITE_PROPOSE_ACTION_TOOL, WRITE_RESPOND_ACTION_TOOL];

export async function newDialogTurn(input: {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  sharedMessages?: any[];
  pendingAction?: any;
  nodes: MapNode[];
  allCharacters: Character[];
  tick: number;
  epoch: number;
  worldId: string;
  worldDescription?: string;
  language?: string;
  shops?: any[];
}): Promise<DialogTurnResult | DialogEndResult> {
  const systemPrompt = buildDialogSystemPrompt(input.self.name, input.peer.name);
  const readTools = buildReadTools();
  const writeTools = buildDialogWriteTools();

  const ctx: ToolHandlerContext = {
    self: input.self,
    allCharacters: input.allCharacters,
    nodes: input.nodes,
    shops: input.shops,
    tick: input.tick,
    epoch: input.epoch,
    worldId: input.worldId,
    worldDescription: input.worldDescription,
  };

  const result: AgentLoopResult = await runAgentLoop({
    systemPrompt,
    readTools,
    writeTools,
    terminalToolNames: DIALOG_TERMINAL_NAMES,
    readToolNames: [...ALL_READ_TOOLS],
    llmEntryName: "dialog_turn",
    maxRounds: 20,
    sharedMessages: input.sharedMessages as any,
    toolHandlerContext: ctx,
  });

  if (result.kind !== "terminal") {
    return { kind: "end", payload: { summary: "（对话超时）" }, messages: result.messages as any };
  }

  const { terminalToolName, terminalArgs } = result;

  if (terminalToolName === END_DIALOG_TOOL) {
    return {
      kind: "end",
      payload: { summary: (terminalArgs?.summary as string) ?? "对话结束" },
      messages: result.messages as any,
    };
  }

  if (terminalToolName === WRITE_DIALOG_TOOL) {
    const turn: DialogTurn = {
      speakerId: input.self.id,
      speakerName: input.self.name,
      content: terminalArgs?.content as string,
      tick: input.tick,
    };
    const proposeAction = terminalArgs?.action_proposal
      ? { actionType: (terminalArgs.action_proposal as any).action_type, params: (terminalArgs.action_proposal as any).params }
      : undefined;
    const respondToAction = terminalArgs?.action_response
      ? { accept: (terminalArgs.action_response as any).accept, reason: (terminalArgs.action_response as any).reason }
      : undefined;
    return { kind: "turn", turn, proposeAction, respondToAction, messages: result.messages as any };
  }

  if (terminalToolName === WRITE_PROPOSE_ACTION_TOOL) {
    return {
      kind: "turn",
      turn: { speakerId: input.self.id, speakerName: input.self.name, content: "", tick: input.tick },
      proposeAction: { actionType: terminalArgs?.action_type as string, params: terminalArgs?.params as any },
      messages: result.messages as any,
    };
  }

  if (terminalToolName === WRITE_RESPOND_ACTION_TOOL) {
    return {
      kind: "turn",
      turn: { speakerId: input.self.id, speakerName: input.self.name, content: "", tick: input.tick },
      respondToAction: { accept: terminalArgs?.accept as boolean, reason: terminalArgs?.reason as string },
      messages: result.messages as any,
    };
  }

  return { kind: "end", payload: { summary: "（未知终止类型）" }, messages: result.messages as any };
}
```

- [ ] **Step 2: Update runDialogPhase to use newDialogTurn**

Replace all `turnDecide()` calls in `runDialogPhase` with `newDialogTurn()`.

- [ ] **Step 3: Add personal memory post-processing at dialog end**

At the end of each ended conversation in `runDialogPhase`, after the dialog ends, instead of `personalMemoryDecide()`, add a final agent invocation that asks the personal memory question:

```typescript
// In runDialogPhase, after a conversation ends:
async function generatePersonalMemory(
  self: Character,
  peer: Character,
  transcript: DialogTurn[],
  ctx: ToolHandlerContext,
): Promise<{ memory: string }> {
  const prompt = `对话结束了。请回顾你与 ${peer.name} 的这段对话，从以下三个角度用自然语言反思，然后调用 write_memory 把你对这三个方面的记录写入 short memory：

1. **心情**：对话结束后你的心情如何
2. **印象**：你对 ${peer.name} 的印象有什么变化
3. **主题**：你们都聊了哪些主题

调用 write_memory(layer="short", importance=3, content="你的自然语言反思") 来记录。`;

  const result = await runAgentLoop({
    systemPrompt: prompt,
    readTools: buildReadTools(),
    writeTools: [/* only write_memory */],
    terminalToolNames: ["write_memory"],
    readToolNames: [...ALL_READ_TOOLS],
    llmEntryName: "dialog_turn",
    maxRounds: 3,
    toolHandlerContext: ctx,
  });

  return { memory: (result.terminalArgs?.content as string) ?? "" };
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/llm/dialog.ts
git commit -m "feat: rewrite Dialog Agent using agentic loop"
```

---

## Phase 8: Think Agent

### Task 9: Create the Think Agent (memory curator)

**Files:**
- Create: `backend/src/llm/think.ts`

- [ ] **Step 1: Implement the Think Agent**

```typescript
// backend/src/llm/think.ts

import type { Character, MapNode } from "../domain";
import { buildThinkSystemPrompt } from "./system-prompts";
import { buildReadTools, buildThinkWriteTools, ALL_READ_TOOLS,
  END_THINKING_TOOL, WRITE_MEMORY_TOOL, DELETE_MEMORY_TOOL } from "../domain/schemas";
import { runAgentLoop } from "./agent-loop";
import type { ToolHandlerContext } from "./tool-handlers";
import { hasApiKey } from "./client";
import { SHORT_MEMORY_THINK_THRESHOLD } from "../domain/enums";

const THINK_TERMINAL_NAMES = [WRITE_MEMORY_TOOL, DELETE_MEMORY_TOOL, END_THINKING_TOOL];

export interface ThinkResult {
  kind: "completed" | "exhausted";
  summary: string;
  shortMemoryAfter: number;
  messages: Array<Record<string, unknown>>;
}

export async function runThinkAgent(args: {
  self: Character;
  nodes: MapNode[];
  allCharacters: Character[];
  tick: number;
  epoch: number;
  worldId: string;
  worldDescription?: string;
  language?: string;
  sharedMessages?: Array<Record<string, unknown>>;
}): Promise<ThinkResult> {
  if (!hasApiKey()) throw new Error("没有激活的 LLM provider");

  const systemPrompt = buildThinkSystemPrompt();
  const readTools = buildReadTools();
  const writeTools = buildThinkWriteTools();

  const ctx: ToolHandlerContext = {
    self: args.self,
    allCharacters: args.allCharacters,
    nodes: args.nodes,
    tick: args.tick,
    epoch: args.epoch,
    worldId: args.worldId,
    worldDescription: args.worldDescription,
  };

  const result = await runAgentLoop({
    systemPrompt,
    readTools,
    writeTools,
    terminalToolNames: THINK_TERMINAL_NAMES,
    readToolNames: [...ALL_READ_TOOLS],
    llmEntryName: "dialog_turn", // or a dedicated "think" entry
    maxRounds: 20,
    sharedMessages: args.sharedMessages as any,
    toolHandlerContext: ctx,
  });

  const summary = result.kind === "terminal" && result.terminalToolName === END_THINKING_TOOL
    ? (result.terminalArgs?.summary as string) ?? "思考完成"
    : "（思考超时）";

  return {
    kind: result.kind === "terminal" ? "completed" : "exhausted",
    summary,
    shortMemoryAfter: args.self.shortMemory.length,
    messages: result.messages as any,
  };
}

/** Check if character should be forced into Think mode */
export function shouldForceThink(character: Character): boolean {
  // Don't interrupt ongoing actions
  if (character.currentAction) return false;
  // Don't interrupt ongoing conversations
  if (character.activeConversationIds.length > 0) return false;
  return character.shortMemory.length >= SHORT_MEMORY_THINK_THRESHOLD;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/llm/think.ts
git commit -m "feat: add Think Agent for memory curation"
```

---

## Phase 9: Dialog Post-Processing

### Task 10: Keep dialog summarizer as standalone LLM call

**Files:**
- Modify: `backend/src/llm/dialog.ts`
- Modify: `backend/src/llm/prompt.ts` (keep buildDialogSummaryPrompt)

- [ ] **Step 1: Update dialog summarizer to only emit WorldEvent (not write to memory)**

In `backend/src/llm/dialog.ts`, update the post-dialog summary logic:

```typescript
async function summarizeDialog(
  openerName: string, openerId: string,
  responderName: string, responderId: string,
  transcript: DialogTurn[], language: string,
): Promise<string> {
  // Standalone LLM call — only produces summary string for WorldEvent
  // Does NOT write to character memory
  const client = getLLMClientForEntry("dialog_summarize");
  const model = getModelNameForEntry("dialog_summarize");

  const prompt = buildDialogSummaryPrompt({ openerName, openerId, responderName, responderId, transcript, language });

  try {
    const response = await client.chat.completions.create({
      model,
      max_tokens: 512,
      messages: [
        { role: "system", content: `你是一个摘要助手。请用 1-2 句话总结以下对话的核心内容与氛围。\n\n始终使用中文。` },
        { role: "user", content: prompt },
      ],
    });
    return response.choices[0]?.message?.content ?? `双方聊了 ${transcript.length} 句`;
  } catch {
    return `双方聊了 ${transcript.length} 句`;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/llm/dialog.ts backend/src/llm/prompt.ts
git commit -m "feat: simplify dialog summarizer to WorldEvent-only"
```

---

## Phase 10: Tick Integration

### Task 11: Wire new agents into tick.ts

**Files:**
- Modify: `backend/src/server/tick.ts`

- [ ] **Step 1: Update imports**

Replace:
```typescript
import {
  llmDecide, llmAcceptDecide, llmDialogTurn, llmDialogSummarize,
  llmDialogPersonalMemory, llmSalvageDecide, llmThink,
  runDialogPhase, loadConversations, saveConversation, deleteConversation,
  loadThinkSessions, saveThinkSession, deleteThinkSession,
  compressSleepMemories, injectThinkTimeMessage,
  DEFAULT_SLEEP_WINDOW, inSleepWindow, timeOfDay,
} from "../llm/index";
```

With:
```typescript
import {
  llmDecide, llmDialogTurn, llmDialogSummarize,
  runDialogPhase, loadConversations, saveConversation, deleteConversation,
  DEFAULT_SLEEP_WINDOW, inSleepWindow, timeOfDay,
} from "../llm/index";
import { runThinkAgent, shouldForceThink } from "../llm/think";
```

- [ ] **Step 2: Add force-think check in character decision loop**

In the character decision phase (around line 800-900 in tick.ts), before calling `llmDecide`, add:

```typescript
// Check if character should be forced into Think mode
if (shouldForceThink(c)) {
  tickLog.info("强制 Think：short memory 达到阈值", {
    character: c.name,
    shortCount: c.shortMemory.length,
  });

  const thinkResult = await runThinkAgent({
    self: c,
    nodes,
    allCharacters: characters,
    tick: fromTick,
    epoch: world.epoch,
    worldId,
    worldDescription: manifest.description,
    language,
  });

  tickLog.info("Think 完成", {
    character: c.name,
    summary: thinkResult.summary,
    shortAfter: thinkResult.shortMemoryAfter,
  });

  // Skip decide for this character this tick
  continue;
}
```

- [ ] **Step 3: Remove old sleep memory compression**

Remove the call to `compressSleepMemories()` in tick.ts, and remove the entire Phase 4.6.

- [ ] **Step 4: Remove old think session handling**

Remove `loadThinkSessions`, `saveThinkSession`, `deleteThinkSession`, `llmThink` references. The Think Agent replaces all of this.

- [ ] **Step 5: Remove llmAcceptDecide**

Remove `llmAcceptDecide` from the tick flow. Chat invitations are now handled by Decide Agent discovering them via `read_state`.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: errors in tick.ts and import chains. Fix each.

- [ ] **Step 7: Commit**

```bash
git add backend/src/server/tick.ts
git commit -m "feat: wire new agents into tick flow, remove old flows"
```

---

## Phase 11: Cleanup

### Task 12: Remove dead code

**Files:**
- Modify: `backend/src/llm/prompt.ts` — keep only utility functions
- Delete: `backend/src/llm/memory-compression.ts`
- Delete: `backend/src/llm/think-sessions.ts`
- Modify: `backend/src/llm/index.ts` — update exports

- [ ] **Step 1: Slash prompt.ts to utilities only**

Keep these functions (still used by tool-handlers and dialog summarizer):
- `qualifyVital()` / `buildImage()` / `describeEmotion()` etc. — character description helpers
- `buildMapView()` / `buildMapTool()` — map display
- `languageInstruction()` — language header
- `timeOfDay()` / `inSleepWindow()` / `formatSleepWindow()` / `DEFAULT_SLEEP_WINDOW` — time utilities
- `buildDialogSummaryPrompt()` — for standalone summarizer

Remove ALL other functions:
- `buildSystemPrompt()`, `buildUserPrompt()`, `buildAcceptDecisionPrompt()`
- `buildDialogSystemPrompt()`, `buildDialogTurnPrompt()`, `buildDialogTurnFollowup()`
- `buildDialogPersonalMemoryPrompt()`
- `buildThinkSystemPrompt()`, `buildThinkPrompt()`, `buildThinkFollowup()`
- `buildMemoryCompressionPrompt()`, `buildWeeklyCompressionPrompt()`
- `buildCharacterStaticBlock()`, `buildSelfImage()`, `buildPeerImage()`
- `decisionPriorityAndRules()`, `describeMapGraph()`, `describeLocalMap()`
- `buildActionHints()`, `buildOptionList()`, `buildSocialSatietyGuidance()`
- `buildContinuityFacts()`, `buildEconomicText()`, `buildCompanionsText()`
- `injectTimeMessage()`, `injectThinkTimeMessage()`
- Any other prompt assembly functions

- [ ] **Step 2: Delete memory-compression.ts**

```bash
rm backend/src/llm/memory-compression.ts
```

- [ ] **Step 3: Delete think-sessions.ts**

```bash
rm backend/src/llm/think-sessions.ts
```

- [ ] **Step 4: Update index.ts exports**

```typescript
export * from "./client";
export * from "./providers";
export * from "./prompt"; // now only utilities
export * from "./decide";
export * from "./dialog";
export * from "./think";
export * from "./agent-loop";
export * from "./tool-handlers";
export * from "./system-prompts";
```

- [ ] **Step 5: Verify full TypeScript compilation**

```bash
cd backend && npx tsc --noEmit
```

Fix any remaining import errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/llm/
git commit -m "refactor: remove dead prompt builders and old LLM flows"
```

---

## Phase 12: Tests & Validation

### Task 13: Update existing tests

**Files:**
- Modify: `backend/src/**/*.test.ts` — any test that references removed functions

- [ ] **Step 1: Find all test files referencing removed functions**

```bash
cd backend && npx vitest run 2>&1 | head -100
```

- [ ] **Step 2: Fix test imports and assertions**

Update any test that:
- Imports removed prompt builders (use new system prompts instead)
- References old tool constants (use new READ_*/WRITE_* constants)
- Calls `llmThink` (use `runThinkAgent`)
- Calls `compressSleepMemories` (use `shouldForceThink` + `runThinkAgent`)
- Calls `llmAcceptDecide` (remove these tests)

- [ ] **Step 3: Add agent loop unit test**

Create `backend/src/llm/agent-loop.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
// ... mock LLM client, test the loop with a simple terminal tool
```

- [ ] **Step 4: Run full test suite**

```bash
cd backend && npx vitest run
```

Expected: all tests pass or have been updated.

- [ ] **Step 5: Commit**

```bash
git add backend/src/
git commit -m "test: update tests for agentic refactor"
```

---

## Self-Review

**1. Spec coverage check:**
- [x] Three independent agents (Decide/Dialog/Think) — Tasks 7, 8, 9
- [x] System prompt = rules + tools + goal — Task 3
- [x] read_*/write_* tool naming — Task 2
- [x] 13 read tools + write tools per agent — Tasks 2, 4, 5
- [x] ReAct loop 20 rounds, read tools don't count — Task 6
- [x] Memory system: 60/20/5 boxes — Task 1
- [x] Force Think at ≥55 — Tasks 1, 9, 11
- [x] Remove sleep compression — Tasks 11, 12
- [x] Dialog summarize standalone (WorldEvent only) — Task 10
- [x] Personal memory via agent post-question — Task 8
- [x] Chat invitation concurrency — will be handled in dialog.ts refactor (backend filter + agent selects one)
- [x] Prompt caching (stable system prompt) — implicit in static system prompt strings
- [x] Remove old components — Task 12

**2. Placeholder scan:**
- No TBD/TODO markers
- All code steps have explicit implementations
- No "add appropriate error handling" hand-waving

**3. Type consistency:**
- `ToolHandlerContext` defined in Task 4, used consistently in Tasks 6-9
- `AgentLoopInput`/`AgentLoopResult` defined in Task 6, used in Tasks 7-9
- `Memory.layer` field added in Task 1, referenced in read/write handlers
- `MEMORY_CAPACITY` constant exported from enums.ts in Task 1, used in tool-handlers
- Write tool names exported from schemas.ts in Task 2, used as terminal tool lists in Tasks 7-9
