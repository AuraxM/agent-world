# Map Tool & One-Layer Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-layer local map to decide/chat/think prompts, and add a `view_map` tool that returns the full map re-rooted around the character's current location.

**Architecture:** New helpers in prompt.ts (`describeLocalMap`, `buildMapView`, `buildMapTool`), new schema in schemas.ts, and tool integration in decide.ts across all three LLM contexts (decide, dialog, think). The re-rooting algorithm converts parent/child/shortcut edges into an undirected graph, BFS from current node, and renders as an indented tree.

**Tech Stack:** TypeScript (Zod schemas, OpenAI-compatible tool definitions)

---

### Task 1: Add view_map schema constants to schemas.ts

**Files:**
- Modify: `backend/src/domain/schemas.ts`

- [ ] **Step 1: Add schema constants after END_THINKING_TOOL_NAME section**

At `backend/src/domain/schemas.ts:406` (after `END_THINKING_TOOL_NAME` definition), add:

```typescript
// ---------------------------------------------------------------------------
// View map tool
// ---------------------------------------------------------------------------

export const VIEW_MAP_TOOL_NAME = "view_map";
export const ViewMapSchema = z.object({});
export const ViewMapToolSchema = {
  type: "object" as const,
  properties: {},
  required: [],
  additionalProperties: false,
};
```

- [ ] **Step 2: Re-export new symbols from domain/index.ts**

Check `backend/src/domain/index.ts` to verify schemas.ts exports are re-exported. The existing pattern uses `export * from "./schemas"` so no change should be needed — verify this.

Read `backend/src/domain/index.ts` line ~1-10 to confirm it has `export * from "./schemas"`.

- [ ] **Step 3: Build check**

Run: `cd backend && pnpm exec tsc --noEmit`
Expected: No new type errors from schemas.ts changes.

---

### Task 2: Add describeLocalMap() to prompt.ts

**Files:**
- Modify: `backend/src/llm/prompt.ts`

- [ ] **Step 1: Add describeLocalMap() function**

Add after `describeMapGraph()` (after line 671). Insert:

```typescript
/**
 * 局部地图：当前节点 + parent + children（仅一层）。
 * 不包含 siblings、shortcuts。所有节点附带 [id] 供 target_node_id 复用。
 */
function describeLocalMap(here: MapNode, nodes: MapNode[]): string {
  const children = nodes.filter((n) => n.parentId === here.id);
  const parent = here.parentId ? nodes.find((n) => n.id === here.parentId) : undefined;

  const tagStr = here.tags.length > 0 ? here.tags.join("/") : "无标签";
  const lines: string[] = [];
  lines.push(`当前位置：${here.name} [${here.id}]（${here.privacy}, ${tagStr}）`);
  if (here.description) {
    lines.push(`  描述：${here.description}`);
  }
  if (parent) {
    const pTag = parent.tags.length > 0 ? parent.tags.join("/") : "无标签";
    lines.push(`  父节点：${parent.name} [${parent.id}]（${here.privacy}, ${pTag}）`);
  }
  if (children.length > 0) {
    lines.push(`  子节点：`);
    for (const c of children) {
      const cTag = c.tags.length > 0 ? c.tags.join("/") : "无标签";
      const desc = c.description ? ` — ${c.description}` : "";
      lines.push(`    · ${c.name} [${c.id}]（${c.privacy}, ${cTag}）${desc}`);
    }
  }
  return lines.join("\n");
}
```

- [ ] **Step 2: Build check**

Run: `cd backend && pnpm exec tsc --noEmit`
Expected: No new errors.

---

### Task 3: Update buildUserPrompt to use describeLocalMap

**Files:**
- Modify: `backend/src/llm/prompt.ts:1553-1557`

- [ ] **Step 1: Replace location section in buildUserPrompt**

Find (around line 1552):
```typescript
  // 2. 当前位置
  lines.push(
    `你现在的位置：${here.name}（${here.privacy}, ${here.tags.join("/") || "无标签"}）`,
  );
  lines.push(`位置描述：${here.description || "（无）"}`);
  lines.push("");
```

Replace with:
```typescript
  // 2. 当前位置（局部地图：仅一层）
  lines.push(describeLocalMap(here, nodes));
  lines.push("");
```

- [ ] **Step 2: Build check**

Run: `cd backend && pnpm exec tsc --noEmit`
Expected: No new errors.

---

### Task 4: Update buildDialogTurnPrompt to use describeLocalMap

**Files:**
- Modify: `backend/src/llm/prompt.ts:957-969` (function signature)
- Modify: `backend/src/llm/prompt.ts:1065,1092,1119` (3 location lines)

- [ ] **Step 1: Add nodes parameter to buildDialogTurnPrompt signature**

At line 957-969, add `nodes` to the args type. Find:
```typescript
export function buildDialogTurnPrompt(args: {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  here: MapNode;
  language?: Language;
  pendingAction?: import("../domain/types").DialogueActionRequest;
  dialogueActions?: import("../domain/action-system").ActionDefinition[];
  upcomingEntries?: import("../domain/types").NotebookEntry[];
  tick?: number;
  epoch?: number;
  worldDescription?: string;
}): string {
```

Add `nodes: MapNode[]` after `worldDescription?: string`:
```typescript
export function buildDialogTurnPrompt(args: {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  here: MapNode;
  language?: Language;
  pendingAction?: import("../domain/types").DialogueActionRequest;
  dialogueActions?: import("../domain/action-system").ActionDefinition[];
  upcomingEntries?: import("../domain/types").NotebookEntry[];
  tick?: number;
  epoch?: number;
  worldDescription?: string;
  nodes?: MapNode[];
}): string {
```

Add `nodes` to destructuring at line 970:
```typescript
  const { self, peer, transcript, here, pendingAction, dialogueActions, upcomingEntries, epoch: promptEpoch, worldDescription, nodes } = args;
```

- [ ] **Step 2: Replace 3 location lines with describeLocalMap**

Replace line 1065:
```typescript
    lines.push(`当前地点：${here.name}`);
```
With:
```typescript
    if (nodes) lines.push(describeLocalMap(here, nodes));
    else lines.push(`当前地点：${here.name}`);
```

Replace line 1092:
```typescript
    lines.push(`Current location: ${here.name}`);
```
With:
```typescript
    if (nodes) lines.push(describeLocalMap(here, nodes));
    else lines.push(`Current location: ${here.name}`);
```

Replace line 1119:
```typescript
    lines.push(`現在地：${here.name}`);
```
With:
```typescript
    if (nodes) lines.push(describeLocalMap(here, nodes));
    else lines.push(`現在地：${here.name}`);
```

- [ ] **Step 3: Build check**

Run: `cd backend && pnpm exec tsc --noEmit`
Expected: Only known errors about missing `nodes` arg from callers (will fix in Task 9).

---

### Task 5: Update buildThinkPrompt to use describeLocalMap

**Files:**
- Modify: `backend/src/llm/prompt.ts:1850-1859` (function signature)
- Modify: `backend/src/llm/prompt.ts:1889,1930,1967` (3 location lines)

- [ ] **Step 1: Add nodes parameter to buildThinkPrompt signature**

At line 1850-1858, add `nodes` to the args type. Find:
```typescript
export function buildThinkPrompt(args: {
  self: Character;
  here: MapNode;
  transcript: import("../domain/types").ThinkTurn[];
  language?: Language;
  tick?: number;
  epoch?: number;
  allCharacters?: Character[];
  worldDescription?: string;
}): string {
```

Add `nodes?: MapNode[]`:
```typescript
export function buildThinkPrompt(args: {
  self: Character;
  here: MapNode;
  transcript: import("../domain/types").ThinkTurn[];
  language?: Language;
  tick?: number;
  epoch?: number;
  allCharacters?: Character[];
  worldDescription?: string;
  nodes?: MapNode[];
}): string {
```

Add `nodes` to destructuring at line 1860:
```typescript
  const { self, here, transcript, allCharacters, worldDescription, nodes } = args;
```

- [ ] **Step 2: Replace 3 location lines with describeLocalMap**

Replace line 1889:
```typescript
    lines.push(`当前地点：${here.name}（${here.description || "无描述"}）`);
```
With:
```typescript
    if (nodes) lines.push(describeLocalMap(here, nodes));
    else lines.push(`当前地点：${here.name}（${here.description || "无描述"}）`);
```

Replace line 1930:
```typescript
    lines.push(`Current location: ${here.name} (${here.description || ""})`);
```
With:
```typescript
    if (nodes) lines.push(describeLocalMap(here, nodes));
    else lines.push(`Current location: ${here.name} (${here.description || ""})`);
```

Replace line 1967:
```typescript
    lines.push(`現在地：${here.name}`);
```
With:
```typescript
    if (nodes) lines.push(describeLocalMap(here, nodes));
    else lines.push(`現在地：${here.name}`);
```

- [ ] **Step 3: Build check**

Run: `cd backend && pnpm exec tsc --noEmit`
Expected: Only known errors about missing `nodes` arg from callers (will fix in Tasks 9 & 10).

---

### Task 6: Add buildMapView() and buildMapTool() to prompt.ts

**Files:**
- Modify: `backend/src/llm/prompt.ts`

- [ ] **Step 1: Add import for ChatCompletionTool at top of prompt.ts**

At line 1-12, add OpenAI import. Currently prompt.ts does not import OpenAI types — but it needs `ChatCompletionTool` for `buildMapTool()`.

Add at the top (after existing imports):
```typescript
import type { ChatCompletionTool } from "openai/resources/chat/completions";
```

- [ ] **Step 2: Import VIEW_MAP_TOOL_NAME and ViewMapToolSchema**

At line 26-28, the existing import from `../domain/index` includes many schemas. Add `VIEW_MAP_TOOL_NAME` and `ViewMapToolSchema` to the import that pulls from domain schemas.

Actually — check what prompt.ts already imports from `../domain/index`. It imports types and some functions. The schemas are imported in decide.ts. For prompt.ts, we need to import the new symbols.

Add this import at an appropriate spot. Since prompt.ts doesn't currently import tool schemas (those are in decide.ts), add:
```typescript
import { VIEW_MAP_TOOL_NAME, ViewMapToolSchema } from "../domain/index";
```

Actually wait — check what's already imported from `../domain/index`. Looking at line 13-28 of prompt.ts:

```typescript
import type { Profession, Language } from "../domain/index";
import { TICKS_PER_HOUR } from "../domain/index";
import type { ... } from "../domain/index";
import type { ActionOption } from "../systems/index";
import { actionRegistry } from "../domain/index";
```

So prompt.ts imports `actionRegistry` as a value. We can add `VIEW_MAP_TOOL_NAME, ViewMapToolSchema` to the value imports. But `ViewMapToolSchema` is declared as `const` in schemas.ts (it's a plain object), so it can be imported as a value. And `VIEW_MAP_TOOL_NAME` is a string constant.

Add after the `actionRegistry` import line:
```typescript
import { actionRegistry, VIEW_MAP_TOOL_NAME, ViewMapToolSchema } from "../domain/index";
```

- [ ] **Step 3: Add buildMapView() after describeLocalMap()**

This function does the re-rooting BFS. Add after `describeLocalMap()`:

```typescript
/**
 * 以当前节点为根，通过 BFS 重新绘制整个地图树。
 * parent/child + shortcuts 作为无向边；输出的缩进结构以当前位置为根。
 */
export function buildMapView(here: MapNode, nodes: MapNode[]): string {
  if (nodes.length === 0) return "（地图为空）";

  // Build undirected adjacency (parent-child + shortcuts)
  const adj = new Map<string, string[]>();
  const byId = new Map(nodes.map((n) => [n.id, n]));

  for (const n of nodes) {
    if (!adj.has(n.id)) adj.set(n.id, []);
    // Parent-child
    if (n.parentId) {
      adj.get(n.id)!.push(n.parentId);
      if (!adj.has(n.parentId)) adj.set(n.parentId, []);
      adj.get(n.parentId)!.push(n.id);
    }
    // Shortcuts
    for (const sid of n.shortcuts) {
      if (!adj.get(n.id)!.includes(sid)) adj.get(n.id)!.push(sid);
      if (!adj.has(sid)) adj.set(sid, []);
      if (!adj.get(sid)!.includes(n.id)) adj.get(sid)!.push(n.id);
    }
  }

  // BFS from here
  const bfsParent = new Map<string, string>();
  const visited = new Set<string>();
  const queue: string[] = [here.id];
  visited.add(here.id);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adj.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        bfsParent.set(neighbor, current);
        queue.push(neighbor);
      }
    }
  }

  // Group by BFS parent
  const childrenOf = new Map<string | null, MapNode[]>();
  for (const n of nodes) {
    if (!visited.has(n.id)) continue;
    const pid = bfsParent.get(n.id) ?? null;
    const arr = childrenOf.get(pid) ?? [];
    arr.push(n);
    childrenOf.set(pid, arr);
  }
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, "zh"));
  }

  // Render tree
  const treeLines: string[] = [];
  const render = (n: MapNode, depth: number): void => {
    const indent = "  ".repeat(depth);
    const tagPart = n.tags.length > 0 ? n.tags.join("/") : n.privacy;
    treeLines.push(`${indent}- ${n.name} [${n.id}]（${tagPart}）`);
    for (const kid of childrenOf.get(n.id) ?? []) render(kid, depth + 1);
  };
  for (const root of childrenOf.get(null) ?? []) render(root, 0);

  // Shortcuts section (same format as describeMapGraph)
  const directed = new Set<string>();
  for (const n of nodes) {
    for (const sid of n.shortcuts) directed.add(`${n.id}|${sid}`);
  }
  const shortcutLines: string[] = [];
  const rendered = new Set<string>();
  for (const pair of directed) {
    if (rendered.has(pair)) continue;
    const [a, b] = pair.split("|");
    const aNode = byId.get(a);
    const bNode = byId.get(b);
    if (!aNode || !bNode) { rendered.add(pair); continue; }
    const reverse = `${b}|${a}`;
    if (directed.has(reverse)) {
      shortcutLines.push(`- ${aNode.name} [${a}] ↔ ${bNode.name} [${b}]`);
      rendered.add(pair);
      rendered.add(reverse);
    } else {
      shortcutLines.push(`- ${aNode.name} [${a}] → ${bNode.name} [${b}]`);
      rendered.add(pair);
    }
  }

  let out = `查看地图（以你的位置 "${here.name}" 为根重绘，缩进=可达路径）：\n${treeLines.join("\n")}`;
  if (shortcutLines.length > 0) {
    out += `\n\n特殊通道（shortcuts，cost=0）：\n${shortcutLines.join("\n")}`;
  }
  return out;
}
```

- [ ] **Step 4: Add buildMapTool() after buildMapView()**

```typescript
/**
 * 地图查询工具。LLM 可调用此工具获取以当前位置为根重绘的完整地图树。
 */
export function buildMapTool(): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: VIEW_MAP_TOOL_NAME,
      description: "查看当前所在位置周围的地图结构。以你的位置为中心重绘整个地图树，帮助你了解附近可以去的地方和路径关系。",
      parameters: ViewMapToolSchema,
    },
  };
}
```

- [ ] **Step 5: Build check**

Run: `cd backend && pnpm exec tsc --noEmit`
Expected: No new errors (buildMapView exported but not yet imported — that's fine).

---

### Task 7: Add view_map tool + handler to decide loop in decide.ts

**Files:**
- Modify: `backend/src/llm/decide.ts`

- [ ] **Step 1: Import new symbols**

At lines 9-52, add imports:
- `VIEW_MAP_TOOL_NAME, ViewMapSchema` to the domain import (line 11-29)
- `buildMapView, buildMapTool` to the prompt import (line 38-50)

Edit the domain import to include `VIEW_MAP_TOOL_NAME`:
```typescript
import {
  DECIDE_ACTION_TOOL_NAME, DecideActionSchema, buildDecideActionTool,
  RECALL_TOOL_NAME, RecallSchema, RecallToolSchema,
  MEMORIZE_TOOL_NAME, MemorizeSchema, MemorizeToolSchema,
  UPDATE_LIKES_TOOL_NAME, UpdateLikesSchema, UpdateLikesToolSchema,
  UPDATE_GOALS_TOOL_NAME, UpdateGoalsSchema, UpdateGoalsToolSchema,
  UPDATE_RELATION_TOOL_NAME, UpdateRelationSchema, UpdateRelationToolSchema,
  ACCEPT_TOOL_NAME, AcceptDecisionSchema, AcceptToolSchema,
  DIALOG_TURN_TOOL_NAME, DialogTurnSchema, DialogTurnToolSchema,
  DIALOG_SUMMARY_TOOL_NAME, DialogSummarySchema, DialogSummaryToolSchema,
  DIALOG_PERSONAL_MEMORY_TOOL_NAME, DialogPersonalMemorySchema, DialogPersonalMemoryToolSchema,
  END_CONVERSATION_TOOL_NAME, EndConversationToolSchema, EndConversationSchema,
  PROPOSE_DIALOGUE_ACTION_TOOL_NAME, ProposeDialogueActionSchema, ProposeDialogueActionToolSchema,
  RESPOND_DIALOGUE_ACTION_TOOL_NAME, RespondDialogueActionSchema, RespondDialogueActionToolSchema,
  NOTEBOOK_TOOL_NAME, NotebookSchema, NotebookToolSchema,
  THINK_TOOL_NAME, ThinkTurnSchema, ThinkTurnToolSchema,
  END_THINKING_TOOL_NAME, EndThinkingSchema, EndThinkingToolSchema,
  VIEW_MAP_TOOL_NAME, ViewMapSchema,
  type DialogPersonalMemoryPayload,
} from "../domain/index";
```

Edit the prompt import to include `buildMapView, buildMapTool`:
```typescript
import {
  buildAcceptDecisionPrompt,
  buildDialogSummaryPrompt,
  buildDialogPersonalMemoryPrompt,
  buildDialogSystemPrompt,
  buildDialogTurnFollowup,
  buildDialogTurnPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  buildThinkSystemPrompt,
  buildThinkFollowup,
  buildThinkPrompt,
  languageInstruction,
  buildMapView,
  buildMapTool,
} from "./prompt";
```

- [ ] **Step 2: Add nodes param to callLLMWithRetry signature**

At line 204-211, add `nodes` parameter:
```typescript
async function callLLMWithRetry(
  messages: ChatMessage[],
  tool: ChatCompletionTool,
  fallbackLabel: string,
  entryName: string,
  ctx: ActionContext,
  allCharacters: Character[] = [],
  nodes: MapNode[] = [],
): Promise<{ actionType: string; data: ToolArgPayload }> {
```

- [ ] **Step 3: Add buildMapTool() to tools array**

At lines 217, the tools array in `callLLMWithRetry`:
```typescript
  const tools: ChatCompletionTool[] = [tool, buildRecallTool(), buildMemorizeTool()];
```

Change to:
```typescript
  const tools: ChatCompletionTool[] = [tool, buildRecallTool(), buildMemorizeTool(), buildMapTool()];
```

- [ ] **Step 4: Add view_map handler in decide loop**

After the memorize handler (line 273-292), add handling for `VIEW_MAP_TOOL_NAME`:

```typescript
    // ── Handle view_map ──
    if (tcName === VIEW_MAP_TOOL_NAME) {
      const mapText = buildMapView(ctx.here, nodes);
      messages.push({ role: "tool", tool_call_id: tc.id, content: mapText });
      round = Math.max(0, round - 1);
      continue;
    }
```

- [ ] **Step 5: Pass nodes from callLLM to callLLMWithRetry**

At line 396, `callLLM` calls `callLLMWithRetry`:
```typescript
  const { actionType, data } = await callLLMWithRetry(messages, tool, "LLM", "decide", input.ctx, input.allCharacters);
```

Change to:
```typescript
  const { actionType, data } = await callLLMWithRetry(messages, tool, "LLM", "decide", input.ctx, input.allCharacters, input.nodes);
```

- [ ] **Step 6: Build check**

Run: `cd backend && pnpm exec tsc --noEmit`
Expected: No new errors (some may appear for dialog/think callers — those get fixed in Tasks 8 & 9.)

---

### Task 8: Add view_map to dialog loop

**Files:**
- Modify: `backend/src/llm/decide.ts` (`llmDialogTurn` function + `DialogTurnInput` interface)
- Modify: `backend/src/llm/dialog.ts` (two call sites of `turnDecide`)
- Modify: `backend/src/server/tick.ts:923` (turnDecide wrapper)

- [ ] **Step 1: Add nodes to DialogTurnInput interface**

At line 521-538, add `nodes` to the interface:
```typescript
interface DialogTurnInput {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  here: MapNode;
  language?: Language;
  pendingAction?: import("../domain/types").DialogueActionRequest;
  dialogueActions?: import("../domain/action-system").ActionDefinition[];
  tick?: number;
  epoch?: number;
  upcomingEntries?: import("../domain/types").NotebookEntry[];
  previousMessages?: Array<Record<string, unknown>>;
  previousTranscriptLength?: number;
  worldDescription?: string;
  nodes?: MapNode[];
}
```

- [ ] **Step 2: Pass nodes to buildDialogTurnPrompt call in llmDialogTurn**

At line 567-579, add `nodes`:
```typescript
  const prompt = buildDialogTurnPrompt({
    self: input.self,
    peer: input.peer,
    transcript: input.transcript,
    here: input.here,
    language,
    pendingAction: input.pendingAction,
    dialogueActions: input.dialogueActions,
    upcomingEntries: input.upcomingEntries,
    tick: input.tick,
    epoch: input.epoch,
    worldDescription: input.worldDescription,
    nodes: input.nodes,
  });
```

- [ ] **Step 3: Add buildMapTool() to dialog tools array**

At lines 583-606, add `buildMapTool()` after the notebook tool:
```typescript
    buildRecallTool(),
    buildMemorizeTool(),
    buildNotebookTool(),
    buildMapTool(),
    buildUpdateLikesTool(),
```

- [ ] **Step 4: Add view_map handler in dialog tool processing loop**

At line 774 (after `MEMORIZE_TOOL_NAME` handler, before `NOTEBOOK_TOOL_NAME`), add:
```typescript
        } else if (name === VIEW_MAP_TOOL_NAME) {
          if (input.nodes && input.nodes.length > 0) {
            const mapText = buildMapView(input.here, input.nodes);
            messages.push({ role: "tool", tool_call_id: t.id, content: mapText });
          } else {
            messages.push({ role: "tool", tool_call_id: t.id, content: "地图数据不可用。" });
          }
```

- [ ] **Step 5: Update turnDecide call sites in dialog.ts**

At line 677-691, add `nodes`:
```typescript
      result = await retryOnce(() => turnDecide({
        self: speaker,
        peer,
        transcript,
        here: speakerHere,
        language,
        pendingAction,
        dialogueActions,
        tick: currentTick,
        epoch,
        upcomingEntries,
        previousMessages: conv.sharedMessages,
        previousTranscriptLength: conv.sharedMessagesTranscriptLength,
        worldDescription,
        nodes,
      }));
```

At line 793-807, add `nodes`:
```typescript
          const extraResult = await turnDecide({
            self: other,
            peer: otherPeer,
            transcript,
            here: otherHere,
            language,
            pendingAction: otherPendingAction,
            dialogueActions: otherDialogueActions,
            tick: currentTick,
            epoch,
            upcomingEntries,
            previousMessages: conv.sharedMessages,
            previousTranscriptLength: conv.sharedMessagesTranscriptLength,
            worldDescription,
            nodes,
          });
```

- [ ] **Step 6: Build check**

Run: `cd backend && pnpm exec tsc --noEmit`
Expected: Type errors only from think callers (Task 9).

---

### Task 9: Add view_map to think loop + nodes param

**Files:**
- Modify: `backend/src/llm/decide.ts` (`llmThink` function args)
- Modify: `backend/src/server/tick.ts` (two `llmThink` call sites: ~865, ~1113)

- [ ] **Step 1: Add nodes to llmThink args**

At line 1342-1354, add `nodes`:
```typescript
export async function llmThink(args: {
  self: Character;
  here: MapNode;
  transcript: ThinkTurn[];
  language?: Language;
  tick: number;
  epoch: number;
  tickStarted: number;
  previousMessages?: Array<Record<string, unknown>>;
  previousTranscriptLength?: number;
  allCharacters?: Character[];
  worldDescription?: string;
  nodes?: MapNode[];
}): Promise<ThinkTurnResult | ThinkEndResult> {
```

- [ ] **Step 2: Pass nodes to buildThinkPrompt call**

At line 1361-1370, add `nodes`:
```typescript
  const prompt = buildThinkPrompt({
    self: args.self,
    here: args.here,
    transcript: args.transcript,
    language,
    tick: args.tick,
    epoch: args.epoch,
    allCharacters: args.allCharacters,
    worldDescription: args.worldDescription,
    nodes: args.nodes,
  });
```

- [ ] **Step 3: Add buildMapTool() to think tools array**

At lines 1374-1389, add `buildMapTool()` after `buildNotebookTool()`:
```typescript
    buildRecallTool(),
    buildMemorizeTool(),
    buildNotebookTool(),
    buildMapTool(),
    buildUpdateLikesTool(),
```

- [ ] **Step 4: Add view_map handler in think tool processing loop**

At line 1493 (after `MEMORIZE_TOOL_NAME` handler, before `NOTEBOOK_TOOL_NAME`), add:
```typescript
      } else if (name === VIEW_MAP_TOOL_NAME) {
        if (args.nodes && args.nodes.length > 0) {
          const mapText = buildMapView(args.here, args.nodes);
          messages.push({ role: "tool", tool_call_id: t.id, content: mapText });
        } else {
          messages.push({ role: "tool", tool_call_id: t.id, content: "地图数据不可用。" });
        }
```

- [ ] **Step 5: Pass nodes in tick.ts llmThink call sites**

At lines 865-877 (first think call site), add `nodes`:
```typescript
          result = await llmThink({
            self: thinker,
            here,
            transcript,
            language,
            tick: fromTick,
            epoch: world.epoch,
            tickStarted: ts.tickStarted,
            previousMessages: ts.sharedMessages,
            previousTranscriptLength: ts.sharedMessagesTranscriptLength,
            allCharacters: characters,
            worldDescription: manifest.description,
            nodes,
          });
```

At lines 1113-1125 (second think call site), add `nodes`:
```typescript
        result = await llmThink({
          self: thinker,
          here,
          transcript,
          language,
          tick: fromTick,
          epoch: world.epoch,
          tickStarted: ts.tickStarted,
          previousMessages: ts.sharedMessages,
          previousTranscriptLength: ts.sharedMessagesTranscriptLength,
          allCharacters: characters,
          worldDescription: manifest.description,
          nodes,
        });
```

- [ ] **Step 6: Full build check**

Run: `cd backend && pnpm exec tsc --noEmit`
Expected: No type errors.

---

### Task 10: Run tests

**Files:**
- None (verification only)

- [ ] **Step 1: Run backend tests**

Run: `cd backend && pnpm test`
Expected: All existing tests pass.

- [ ] **Step 2: Manually verify prompt output**

Optionally run the dev server and check logs for decide/dialog/think prompts:
Run: `cd backend && pnpm dev`

Check `backend/prompts/` directory for saved prompt files.
Verify `describeLocalMap` output appears in user/dialog/think prompts.
Expected: Local map with parent + children visible, no full map in system prompt.

---

### Task 11: Commit

- [ ] **Step 1: Commit all changes**

```bash
git add backend/src/domain/schemas.ts \
        backend/src/llm/prompt.ts \
        backend/src/llm/decide.ts \
        backend/src/llm/dialog.ts \
        backend/src/server/tick.ts
git commit -m "feat: add one-layer map to prompts and view_map tool"
```
