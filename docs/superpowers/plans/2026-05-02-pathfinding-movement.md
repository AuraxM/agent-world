# Pathfinding Movement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace step-by-step LLM-driven movement with destination-driven movement using BFS shortest path, 5-tick-per-hour granularity.

**Architecture:** LLM outputs `move` with destination + reason + arrivalAction. Engine computes BFS shortest path through the tree+shortcut graph. NPC locks into auto-walk state (1 step/tick), interruptible by high-intensity events. Arrival auto-executes the declared action. Vitals adapted to 5-ticks-per-hour.

**Tech Stack:** TypeScript, Zod, Drizzle ORM (SQLite), OpenAI-compatible function calling

---

### Task 1: Add TICKS_PER_HOUR constant and extend domain types

**Files:**
- Modify: `src/domain/enums.ts`
- Modify: `src/domain/types.ts`

- [ ] **Step 1: Add TICKS_PER_HOUR to enums.ts**

At the bottom of `src/domain/enums.ts`, add:

```typescript
/** 1 游戏小时 = 5 ticks。移动 1 步消耗 1 tick。 */
export const TICKS_PER_HOUR = 5;
```

- [ ] **Step 2: Extend Action interface with reason and arrivalAction**

In `src/domain/types.ts`, add to the `Action` interface:

```typescript
export interface Action {
  type: ActionType;
  actorId: string;
  targetId?: string;
  targetNodeId?: string;
  freeText?: string;
  reasoning: string;
  emotionTag?: string;
  selfImportance: 1 | 2 | 3 | 4 | 5;
  changeType?: RelationChangeType;
  /** move 专属：为何去那里 */
  reason?: string;
  /** move 专属：到达后自动执行的动作 */
  arrivalAction?: {
    type: ActionType;
    freeText?: string;
    targetId?: string;
    targetNodeId?: string;
  };
  /** 引擎标记：此 action 是 move 到达后自动触发的，execute 据此写到达记忆 */
  isArrivalAction?: boolean;
  /** isArrivalAction 为 true 时的目的地节点名（写记忆用） */
  arrivalNodeName?: string;
}
```

- [ ] **Step 3: Extend OngoingAction with path/stepIndex/arrivalAction/reason**

In `src/domain/types.ts`, update `OngoingAction`:

```typescript
export interface OngoingAction {
  type: ActionType;
  startedAt: Tick;
  endsAt: Tick;
  description: string;
  interruptThreshold: 1 | 2 | 3 | 4 | 5;
  /** move 专属：BFS 路径节点序列（含起点终点） */
  path?: string[];
  /** move 专属：当前已走到第几步 */
  stepIndex?: number;
  /** move 专属：到达后要执行的动作 */
  arrivalAction?: Action["arrivalAction"];
  /** move 专属：移动原因（中断时用于写记忆） */
  reason?: string;
}
```

- [ ] **Step 4: Update the Tick comment**

On line 11-12 of `src/domain/types.ts`, update the Tick type comment:

```typescript
/** 1 tick = 1/5 游戏小时（5 ticks/hour）。tick 0 是世界开始的整点。 */
export type Tick = number;
```

- [ ] **Step 5: Commit**

```bash
git add src/domain/enums.ts src/domain/types.ts
git commit -m "feat(domain): add TICKS_PER_HOUR, extend Action/OngoingAction for destination-driven movement"
```

---

### Task 2: Update Zod schemas for move parameters

**Files:**
- Modify: `src/domain/schemas.ts`

- [ ] **Step 1: Add reason + arrival_action fields**

In `src/domain/schemas.ts`, update `ActionSchema`:

```typescript
export const ActionSchema = z.object({
  action_type: z.enum(ACTION_TYPES),
  target_id: z.string().optional(),
  target_node_id: z.string().optional(),
  free_text: z.string().max(500).optional(),
  reasoning: z.string().min(1).max(800),
  emotion_tag: z.string().max(40).optional(),
  self_importance: z.union([
    z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5),
  ]),
  change_type: z.enum(RELATION_CHANGE_TYPES).optional(),
  reason: z.string().max(200).optional(),
  arrival_action: z.object({
    action_type: z.enum(ACTION_TYPES),
    free_text: z.string().max(500).optional(),
    target_id: z.string().optional(),
    target_node_id: z.string().optional(),
  }).optional(),
});
```

- [ ] **Step 2: Update ActionToolInputSchema**

```typescript
export const ActionToolInputSchema = {
  type: "object" as const,
  properties: {
    action_type: { type: "string", enum: [...ACTION_TYPES] },
    target_id: {
      type: "string",
      description: "目标角色或物体 id，可选。",
    },
    target_node_id: {
      type: "string",
      description: "目标节点 id。move 时为目的地（可为图内任意节点，引擎自动算最短路径）。",
    },
    free_text: {
      type: "string",
      description:
        "自由文本（说话内容、行动具体描述）。speak 必填；其它行动选填。",
    },
    reasoning: {
      type: "string",
      description:
        "内心独白。必须显式引用一项你的性格特征（用文字描述，不要写数值）。",
    },
    emotion_tag: {
      type: "string",
      description: "短情绪标签，例如 紧张 / 好奇 / 烦躁。",
    },
    self_importance: {
      type: "integer",
      enum: [1, 2, 3, 4, 5],
      description: "1-5 自评要不要长期记住。",
    },
    change_type: {
      type: "string",
      enum: [...RELATION_CHANGE_TYPES],
      description: "仅在 action_type=update_relation 时使用。",
    },
    reason: {
      type: "string",
      description: "仅 move：移动原因，例如'去酒馆找田中喝酒'。将被记入记忆。",
    },
    arrival_action: {
      type: "object",
      description: "仅 move：到达目的地后要自动执行的动作。包含 action_type、可选的 free_text/target_id/target_node_id。",
      properties: {
        action_type: { type: "string", enum: [...ACTION_TYPES] },
        free_text: { type: "string", description: "说话内容或行动描述。" },
        target_id: { type: "string", description: "交互目标的 character id。" },
        target_node_id: { type: "string", description: "交互目标的节点 id。" },
      },
      required: ["action_type"],
      additionalProperties: false,
    },
  },
  required: ["action_type", "reasoning", "self_importance"],
  additionalProperties: false,
};
```

- [ ] **Step 3: Update SalvageActionSchema and SalvageToolSchema similarly**

Add `reason` and `arrival_action` fields to `SalvageActionSchema` and `SalvageToolSchema`:

```typescript
// In SalvageActionSchema, add:
reason: z.string().max(200).optional(),
arrival_action: z.object({
  action_type: z.enum(SALVAGE_ACTION_TYPES),
  free_text: z.string().max(500).optional(),
  target_id: z.string().optional(),
  target_node_id: z.string().optional(),
}).optional(),
```

```typescript
// In SalvageToolSchema properties, add:
reason: {
  type: "string",
  description: "仅 move：移动原因。将被记入记忆。",
},
arrival_action: {
  type: "object",
  description: "仅 move：到达目的地后要自动执行的动作。",
  properties: {
    action_type: { type: "string", enum: [...SALVAGE_ACTION_TYPES] },
    free_text: { type: "string" },
    target_id: { type: "string" },
    target_node_id: { type: "string" },
  },
  required: ["action_type"],
  additionalProperties: false,
},
```

- [ ] **Step 4: Commit**

```bash
git add src/domain/schemas.ts
git commit -m "feat(schemas): add reason + arrival_action fields to action tool schemas"
```

---

### Task 3: Add payloadToAction mapping for new fields

**Files:**
- Modify: `src/llm/decide.ts`

- [ ] **Step 1: Update payloadToAction**

In `src/llm/decide.ts`, update `payloadToAction` (line 143-155):

```typescript
function payloadToAction(p: ActionPayload, actorId: string): Action {
  return {
    type: p.action_type,
    actorId,
    targetId: p.target_id,
    targetNodeId: p.target_node_id,
    freeText: p.free_text,
    reasoning: p.reasoning,
    emotionTag: p.emotion_tag,
    selfImportance: p.self_importance,
    changeType: p.change_type,
    reason: p.reason,
    arrivalAction: p.arrival_action
      ? {
          type: p.arrival_action.action_type,
          freeText: p.arrival_action.free_text,
          targetId: p.arrival_action.target_id,
          targetNodeId: p.arrival_action.target_node_id,
        }
      : undefined,
  };
}
```

- [ ] **Step 2: Do the same in llmSalvageDecide's action mapping**

In `llmSalvageDecide` (line 486-496), update the action construction to also pass through `reason` and `arrivalAction`:

```typescript
const action: Action = {
  type: result.data.action_type as Action["type"],
  actorId: input.character.id,
  targetId: result.data.target_id,
  targetNodeId: result.data.target_node_id,
  freeText: result.data.free_text,
  reasoning: result.data.reasoning,
  emotionTag: result.data.emotion_tag,
  selfImportance: result.data.self_importance,
  changeType: result.data.change_type,
  reason: result.data.reason,
  arrivalAction: result.data.arrival_action
    ? {
        type: result.data.arrival_action.action_type,
        freeText: result.data.arrival_action.free_text,
        targetId: result.data.arrival_action.target_id,
        targetNodeId: result.data.arrival_action.target_node_id,
      }
    : undefined,
};
```

- [ ] **Step 3: Commit**

```bash
git add src/llm/decide.ts
git commit -m "feat(decide): map reason + arrivalAction from LLM payload to Action"
```

---

### Task 4: Create BFS pathfinding module

**Files:**
- Create: `src/engine/pathfinding.ts`

- [ ] **Step 1: Write pathfinding.ts**

```typescript
/**
 * BFS 最短路径：在树 + 捷径图上找从 from 到 to 的最短节点序列。
 * 每步 cost = 1（不含 travelCost）。返回首尾含 from/to 的路径，
 * 不可达返回 null。
 */
import type { MapNode } from "@/domain/types";

export function findPath(
  from: string,
  to: string,
  nodes: MapNode[],
): string[] | null {
  if (from === to) return [from];

  const adj = buildAdjacency(nodes);
  if (!adj.has(from) || !adj.has(to)) return null;

  // BFS
  const queue: string[][] = [[from]];
  const visited = new Set<string>([from]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];
    const neighbors = adj.get(current) ?? [];

    for (const next of neighbors) {
      if (visited.has(next)) continue;
      const newPath = [...path, next];
      if (next === to) return newPath;
      visited.add(next);
      queue.push(newPath);
    }
  }

  return null;
}

/**
 * 构建无向邻接表：parent ↔ child + shortcuts 双向边。
 */
export function buildAdjacency(
  nodes: MapNode[],
): Map<string, string[]> {
  const adj = new Map<string, string[]>();

  for (const n of nodes) {
    const list = adj.get(n.id) ?? [];
    adj.set(n.id, list);
  }

  for (const n of nodes) {
    const list = adj.get(n.id)!;
    // tree edges (bidirectional)
    if (n.parentId) {
      list.push(n.parentId);
      adj.get(n.parentId)?.push(n.id);
    }
    // shortcuts (bidirectional)
    for (const sid of n.shortcuts) {
      if (!list.includes(sid)) list.push(sid);
      const peer = adj.get(sid);
      if (peer && !peer.includes(n.id)) peer.push(n.id);
    }
  }

  return adj;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/pathfinding.ts
git commit -m "feat(pathfinding): add BFS shortest path on tree+shortcut graph"
```

---

### Task 5: Update actions.ts — full map nodes for destination selection

**Files:**
- Modify: `src/engine/actions.ts`

- [ ] **Step 1: Change buildActionContext to include all nodes**

Replace the `buildActionContext` function. The `reachable` field now returns all map nodes (for destination selection), but the `ActionContext` type still has it for backward compat. Add a new field `allNodes` for the full map:

Actually, simpler: just replace `reachable` with all nodes (minus current). The free-move chain is being removed, so `reachable` is only used for destination selection.

```typescript
export function buildActionContext(
  character: Character,
  nodes: MapNode[],
  characters: Character[],
  locationOverrides?: ReadonlyMap<string, string>,
): ActionContext {
  const loc = locationOverrides?.get(character.id) ?? character.locationId;
  const here = nodes.find((n) => n.id === loc);
  if (!here) {
    throw new Error(
      `character ${character.id} located at unknown node ${loc}`,
    );
  }

  const companions = characters.filter(
    (c) =>
      c.id !== character.id &&
      (locationOverrides?.get(c.id) ?? c.locationId) === loc,
  );

  const reachable = nodes.filter((n) => n.id !== loc);

  return { self: character, here, companions, reachable };
}
```

- [ ] **Step 2: Update getAvailableActions move options**

Replace the move options section (lines 121-138). Remove travelCost rendering, remove per-node move options for ALL reachable nodes (too many). Instead show a select few highlighted destinations:

```typescript
// move：建议的目的地（高亮 home、dining、bathing、同节点其他人的位置）
const highlighted = new Set<string>();
if (homeNodeId) highlighted.add(homeNodeId);
for (const n of nodes) {
  if (n.tags.includes("dining") || n.tags.includes("bathing")) {
    highlighted.add(n.id);
  }
}

// Show highlighted destinations with ⭐
for (const nId of highlighted) {
  const n = reachable.find((r) => r.id === nId);
  if (!n) continue;
  const isHome = homeNodeId !== null && n.id === homeNodeId;
  let hint = `前往 ${n.name}`;
  if (isHome && (restNeeded || sleepStuckOutside)) {
    hint = `⭐ ${hint}——你的家，可以休息`;
  } else if (n.tags.includes("dining") && hunger >= 5) {
    hint = `⭐ ${hint}——可以用餐`;
  } else if (n.tags.includes("bathing") && hygiene >= HYGIENE_MEDIUM) {
    hint = `⭐ ${hint}——可以洗浴`;
  }
  opts.push({ type: "move", targetNodeId: n.id, hint });
}

// Generic move hint: 可以去地图上任意节点
opts.push({
  type: "move",
  hint: "前往地图上任意地点（指定 target_node_id + reason + arrival_action）。",
});
```

Remove the old per-reachable-node move loop entirely.

- [ ] **Step 3: Commit**

```bash
git add src/engine/actions.ts
git commit -m "feat(actions): show all nodes as destinations, highlight key locations"
```

---

### Task 6: Update system prompt — tick granularity + destination movement

**Files:**
- Modify: `src/llm/prompt.ts`

- [ ] **Step 1: Update worldRules movement section**

In the `worldRules()` function, replace lines 469-471:

```
移动机制：1 tick = 1 小时，move 不消耗时间——你可以本 tick 多次 move 后再做事，每次 move 后会重新感知新位置。但若你连续 5 次 move 仍未做事，会被强制停下。
```

Replace with:

```
移动机制：1 tick = 1/5 游戏小时（5 ticks = 1 小时）。移动时你需要指定目的地（任意地图节点）、移动原因（如"去酒馆找田中喝酒"）和到达后要做的动作（arrival_action）。引擎会自动计算最短路径，每走一步消耗 1 tick。移动期间你无法主动决策（类似睡觉），但可被高强度事件打断。到达后自动执行你声明的到达动作。
```

- [ ] **Step 2: Update describeMapGraph to remove travelCost**

In `describeMapGraph()`, remove cost rendering from the node line (line 567-568). Change:

```typescript
const cost =
  n.travelCost && n.travelCost > 0 ? ` ⏱${n.travelCost}小时` : "";
treeLines.push(`${indent}- ${n.name} [${n.id}]（${tagPart}）${cost}`);
```

To:

```typescript
treeLines.push(`${indent}- ${n.name} [${n.id}]（${tagPart}）`);
```

And update the header comment on line 601:

```typescript
let out = `当前世界地图（缩进=父子；target_node_id 用方括号内的 id）：\n${treeLines.join("\n")}`;
```

- [ ] **Step 3: Update timeOfDay and related tick-aware functions**

Update `timeOfDay` to accept tick (not hour) and compute hour from tick:

```typescript
import { TICKS_PER_HOUR } from "@/domain/enums";

export function timeOfDay(
  tick: number,
  sleepWindow: SleepWindow = DEFAULT_SLEEP_WINDOW,
): {
  hour: number;
  day: number;
  period: DayPeriod;
  isSleepHour: boolean;
} {
  const totalHours = Math.floor(tick / TICKS_PER_HOUR);
  const day = Math.floor(totalHours / 24);
  const hour = ((totalHours % 24) + 24) % 24;
  // ... rest unchanged
}
```

- [ ] **Step 4: Update system prompt to mention 1 tick ≠ 1 hour**

In `worldRules()`, replace "游戏时间：1 tick = 1 个游戏小时" with:

```
游戏时间：1 tick = 1/5 游戏小时（5 ticks = 1 游戏小时）。tick 是基本时间单位。
```

- [ ] **Step 5: Update user prompt time display**

In `buildUserPrompt`, update the time display (line 903):

```typescript
const t = timeOfDay(tick, sleepWindow);
lines.push(
  `当前时间：第 ${t.day} 日 ${String(t.hour).padStart(2, "0")}:00（${t.period}${t.isSleepHour ? "，已是你的作息时段" : ""}）。tick=${tick}`,
);
```

- [ ] **Step 6: Commit**

```bash
git add src/llm/prompt.ts
git commit -m "feat(prompt): update movement rules, remove travelCost rendering, adapt to ticks"
```

---

### Task 7: Rewrite tick.ts — remove free-move chain, add destination move + auto-step

**Files:**
- Modify: `src/engine/tick.ts`

- [ ] **Step 1: Import TICKS_PER_HOUR and findPath**

Add imports at top:

```typescript
import { TICKS_PER_HOUR } from "@/domain/enums";
import { findPath } from "./pathfinding";
```

- [ ] **Step 2: Remove MAX_FREE_MOVES and related constants**

Remove line 48:
```
const MAX_FREE_MOVES = 5;
```

- [ ] **Step 3: Update sleep/nap duration conversions**

In `execute.ts` (covered in next task), `SLEEP_DURATION = 8` hours → these are resolved at execution time. But `tick.ts` uses `c.currentAction.endsAt` which is already set by execute.ts. So tick.ts just needs to handle the new `move` ongoing action type — no change needed for sleep/nap duration here since they're set in execute.ts.

But `tick.ts` does compare against endsAt. The issue is: sleep was set as `endsAt: tick + SLEEP_DURATION` (in hours). Now it should be `endsAt: tick + SLEEP_DURATION * TICKS_PER_HOUR`. This change goes in execute.ts (Task 8).

- [ ] **Step 4: Add handleOngoingMove function**

After `fallbackWait` (line 98), add:

```typescript
function handleOngoingMove(
  c: Character,
  fromTick: number,
  worldId: string,
  nodeById: Map<string, MapNode>,
): { action: Action; arrived: boolean } {
  const ca = c.currentAction!;
  const path = ca.path!;
  const currentStep = ca.stepIndex ?? 0;

  // Auto-step: move to next node in path
  const nextStep = currentStep + 1;
  ca.stepIndex = nextStep;
  c.locationId = path[nextStep];

  if (nextStep >= path.length - 1) {
    // Arrived at destination
    const destId = path[path.length - 1];
    const destName = nodeById.get(destId)?.name ?? destId;
    c.currentAction = undefined;
    return {
      action: {
        type: ca.arrivalAction?.type ?? "wait",
        actorId: c.id,
        targetId: ca.arrivalAction?.targetId,
        targetNodeId: ca.arrivalAction?.targetNodeId,
        freeText: ca.arrivalAction?.freeText,
        reasoning: `到达目的地 ${destName}，执行 ${ca.arrivalAction?.type ?? "wait"}。`,
        selfImportance: 3,
        isArrivalAction: true,
        arrivalNodeName: destName,
      },
      arrived: true,
    };
  }

  // Still in transit
  return {
    action: {
      type: "wait",
      actorId: c.id,
      reasoning: `正在前往目的地途中（第 ${nextStep}/${path.length - 1} 步）。`,
      selfImportance: 1,
    },
    arrived: false,
  };
}
```

- [ ] **Step 5: Replace the 6a ongoing action check to handle move auto-step**

In the decision task for each character (line 191-247), replace the entire 6a block:

```typescript
// 6a. 持续行动检查
if (c.currentAction && fromTick < c.currentAction.endsAt) {
  const perceived = perceptions.get(c.id) ?? [];

  // Interruption check
  const interrupt = perceived.find(
    (e) => e.intensity >= c.currentAction!.interruptThreshold,
  );

  if (interrupt) {
    // Interruption: for sleep/nap, apply partial recovery
    if (c.currentAction.type === "sleep" || c.currentAction.type === "nap") {
      const hoursDone = fromTick - c.currentAction.startedAt;
      if (c.currentAction.type === "sleep") {
        c.vitals.fatigue = Math.max(0, c.vitals.fatigue - hoursDone);
      } else if (c.currentAction.type === "nap") {
        const reduction = Math.floor((hoursDone * 6) / 4);
        c.vitals.fatigue = Math.max(0, c.vitals.fatigue - reduction);
      }
      if (c.vitals.fatigue < 16) c.vitals.fatigueCapTicks = 0;
    }
    // For move: no memory written for interrupt (initiation memory already exists)

    freeMoveEvents.push(
      makeInnerEvent({
        worldId,
        tick: fromTick,
        charId: c.id,
        description: `被「${interrupt.description}」打断。`,
        intensity: 2,
      }),
    );
    c.currentAction = undefined;
    // Fall through to normal LLM decision below
  } else if (c.currentAction.type === "move") {
    // Auto-step along path
    const result = handleOngoingMove(c, fromTick, worldId, nodeById);
    if (result.arrived) {
      // Arrived — the action IS the arrivalAction, execute it
      const action = result.action;
      options.onCharacterDecision?.({
        characterId: c.id,
        characterName: c.name,
        action,
      });
      return {
        characterId: c.id,
        action,
        freeMoveEvents,
        finalLocationId: c.locationId,
      };
    }
    // Still moving
    options.onCharacterDecision?.({
      characterId: c.id,
      characterName: c.name,
      action: result.action,
    });
    return {
      characterId: c.id,
      action: result.action,
      freeMoveEvents,
      finalLocationId: c.locationId,
    };
  } else {
    // sleep/nap: existing auto-wait logic
    if (fromTick % 4 === 0) {
      freeMoveEvents.push(
        makeInnerEvent({
          worldId,
          tick: fromTick,
          charId: c.id,
          description: `仍在 ${c.currentAction.description}。`,
        }),
      );
    }
    const waitAction: Action = {
      type: "wait",
      actorId: c.id,
      reasoning: `持续行动中：${c.currentAction.description}。`,
      selfImportance: 1,
    };
    options.onCharacterDecision?.({
      characterId: c.id,
      characterName: c.name,
      action: waitAction,
    });
    return {
      characterId: c.id,
      action: waitAction,
      freeMoveEvents,
      finalLocationId: locationSnapshot.get(c.id)!,
    };
  }
}
```

- [ ] **Step 6: Replace the 6c free-move chain with single LLM decision + BFS pathfinding**

Replace the entire 6c section (lines 263-370) with:

```typescript
// 6c. Single LLM decision (no free-move loop)
let currentLoc = locationSnapshot.get(c.id)!;
const localLocationMap = new Map(locationSnapshot);
let action: Action;

localLocationMap.set(c.id, currentLoc);
const ctx = buildActionContext(c, nodes, characters, localLocationMap);
const recentThoughts = loadRecentThoughts(worldId, c.id, sinceTick);
const homeNodeId = homeMap.get(c.id) ?? null;
c.homeNodeId = homeNodeId;
const sleepWindow = sleepWindowMap.get(c.id) ?? DEFAULT_SLEEP_WINDOW;
c.sleepWindow = sleepWindow;
const isSleepHour = inSleepWindow(baseTime.hour, sleepWindow);
const facts = deriveAggregatedFacts({
  character: c,
  nodes,
  currentTick: fromTick,
  recentThoughts,
  homeNodeId,
});
const opts = getAvailableActions(ctx, {
  facts,
  isSleepHour,
});

try {
  action = await decideFn({
    character: c,
    nodes,
    here: ctx.here,
    companions: ctx.companions,
    reachable: ctx.reachable,
    perceived: perceptions.get(c.id) ?? [],
    options: opts,
    worldName: world.name,
    tick: fromTick,
    facts,
  });
} catch (err) {
  action = fallbackWait(c);
  action.reasoning = `LLM 调用失败：${
    err instanceof Error ? err.message : String(err)
  }`;
}

// If move with destination → compute path
if (action.type === "move" && action.targetNodeId && action.targetNodeId !== currentLoc) {
  const path = findPath(currentLoc, action.targetNodeId, nodes);
  if (!path) {
    // Unreachable node → fallback to wait
    action = {
      type: "wait",
      actorId: c.id,
      reasoning: `想去 ${action.targetNodeId} 但不可达，原地等待。原因为：${action.reason ?? "无"}`,
      selfImportance: action.selfImportance,
    };
  } else {
    // Write move initiation memory
    const targetNode = nodeById.get(action.targetNodeId);
    pushMoveInitMemory(c, fromTick, action, targetNode?.name ?? action.targetNodeId);

    // Setup ongoing action for path traversal
    c.currentAction = {
      type: "move",
      startedAt: fromTick,
      endsAt: fromTick + path.length - 1,
      description: `前往 ${targetNode?.name ?? action.targetNodeId} 途中`,
      interruptThreshold: 4,
      path,
      stepIndex: 0,
      arrivalAction: action.arrivalAction,
      reason: action.reason,
    };

    // Take first step
    c.locationId = path[1];
    c.currentAction.stepIndex = 1;

    if (path.length <= 2) {
      // Single step → arrived immediately, execute arrivalAction
      c.currentAction = undefined;
      action = {
        type: action.arrivalAction?.type ?? "wait",
        actorId: c.id,
        targetId: action.arrivalAction?.targetId,
        targetNodeId: action.arrivalAction?.targetNodeId,
        freeText: action.arrivalAction?.freeText,
        reasoning: `已到达 ${targetNode?.name ?? action.targetNodeId}，执行到达动作。`,
        selfImportance: action.selfImportance,
        isArrivalAction: true,
        arrivalNodeName: targetNode?.name ?? action.targetNodeId,
      };
    } else {
      // Multi-step: this tick resolves as wait
      action = {
        type: "wait",
        actorId: c.id,
        reasoning: `开始前往 ${targetNode?.name ?? action.targetNodeId}，共需 ${path.length - 1} 步。原因为：${action.reason ?? "无"}`,
        selfImportance: action.selfImportance,
      };
    }
    currentLoc = c.locationId;
  }
}
```

- [ ] **Step 7: Add memory helper functions**

Add before the `tick()` function:

```typescript
function pushMoveInitMemory(
  c: Character,
  tick: number,
  action: Action,
  targetNodeName: string,
): void {
  const content = `${c.name} 前往 ${targetNodeName} ${action.reason ?? ""}`.trim();
  c.shortMemory.push({
    id: `mem-${randomUUID().slice(0, 8)}`,
    tick,
    importance: action.selfImportance,
    content,
  });
  if (c.shortMemory.length > 50) {
    c.shortMemory.splice(0, c.shortMemory.length - 50);
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add src/engine/tick.ts
git commit -m "feat(tick): replace free-move chain with destination-driven BFS movement + auto-step"
```

---

### Task 8: Update execute.ts — arrivalAction execution + tick-based durations

**Files:**
- Modify: `src/engine/execute.ts`

- [ ] **Step 1: Import TICKS_PER_HOUR**

```typescript
import { TICKS_PER_HOUR } from "@/domain/enums";
```

- [ ] **Step 2: Update SLEEP_DURATION and NAP_DURATION**

```typescript
const SLEEP_DURATION = 8 * TICKS_PER_HOUR; // 40 ticks
const SLEEP_INTERRUPT_THRESHOLD = 4 as const;
const NAP_DURATION = 4 * TICKS_PER_HOUR; // 20 ticks
const NAP_INTERRUPT_THRESHOLD = 3 as const;
```

- [ ] **Step 3: Handle arrivalAction execution in the move case**

In the `move` case of `executeActions()` (lines 161-188), replace with:

```typescript
case "move": {
  if (!action.targetNodeId) {
    success = false;
    reason = "move 缺少 target_node_id";
    break;
  }
  // If move has arrivalAction and NPC is already at destination (handled by tick.ts arrival),
  // execute the arrivalAction inline. Otherwise, this is a direct move from tick.ts
  // that will be handled by the ongoing action mechanism.
  const target = nodeById.get(action.targetNodeId);
  if (!target) {
    success = false;
    reason = `目标节点不存在: ${action.targetNodeId}`;
    break;
  }
  const fromId = actor.locationId;
  // For direct moves not handled by ongoing move mechanism
  if (action.arrivalAction) {
    // This is an arrival auto-execution from ongoing move completion
    actor.locationId = target.id;
    // The arrivalAction will be handled separately
    break;
  }
  actor.locationId = target.id;
  events.push(
    makeEvent({
      worldId,
      tick,
      category: "action",
      description: `${actor.name} 从 ${nodeById.get(fromId)?.name ?? fromId} 来到 ${target.name}。`,
      participants: [actor.id],
      intensity: 1,
      scope: "node",
      nodeId: target.id,
    }),
  );
  break;
}
```

- [ ] **Step 4: Handle arrivalAction at the action execution level**

Add a new case before the default switch cases. After the `move` case and before others, add handling for when an action is an arrivalAction proxy:

This is actually handled at the tick.ts level — the arrival action is already resolved and passed as a regular action to executeActions. The move case in execute.ts should forward the arrivalAction to its actual handler.

Actually, looking at this more carefully, when tick.ts detects arrival (handleOngoingMove returns `arrived: true`), it returns the arrivalAction as the resolved action. This goes through executeActions normally. No change needed in execute.ts for this.

The move case in execute.ts only needs to handle direct moves (non-ongoing). Let me simplify.

- [ ] **Step 5: Update sleep fatique recovery in tick.ts ongoing action completion**

In tick.ts, the sleep/nap completion (lines 252-261) already works in "hours" units. But with the tick change, `endsAt` is now in ticks and `startedAt` is also in ticks. The `hoursDone` calculation needs adjustment:

Replace line 200-201:
```typescript
const hoursDone = fromTick - c.currentAction.startedAt;
```
With:
```typescript
const ticksDone = fromTick - c.currentAction.startedAt;
const hoursDone = Math.floor(ticksDone / TICKS_PER_HOUR);
```

This is actually in tick.ts not execute.ts — I'll note this in the tick.ts task.

- [ ] **Step 5b: Add arrival memory push in executeActions**

After the existing `pushMemory` call at line 589-592 (inside the switch loop), add arrival memory when `action.isArrivalAction` is true:

```typescript
// Write arrival memory if this action was triggered by a move arrival
if (action.isArrivalAction && action.arrivalNodeName) {
  const arrivalContent = success
    ? `${actor.name} 到达了 ${action.arrivalNodeName}，开始 ${action.type}`
    : `${actor.name} 到达了 ${action.arrivalNodeName}，但 ${reason ?? "执行失败"}`;
  pushMemory(actor, {
    id: `mem-${randomUUID().slice(0, 8)}`,
    tick,
    importance: 3,
    content: arrivalContent,
  });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/engine/execute.ts
git commit -m "feat(execute): adapt sleep/nap durations to tick-based, add arrival memory writing"
```

---

### Task 9: Adapt vitals-emotion.ts to 5-tick-per-hour

**Files:**
- Modify: `src/engine/vitals-emotion.ts`

- [ ] **Step 1: Import TICKS_PER_HOUR**

```typescript
import { TICKS_PER_HOUR } from "@/domain/enums";
```

- [ ] **Step 2: Add hourTick helper**

```typescript
/** True when tick is the first tick of a game hour (tick % TICKS_PER_HOUR === 0). */
function isHourTick(tick: number): boolean {
  return tick % TICKS_PER_HOUR === 0;
}

/** True when tick's corresponding hour is even. */
function isEvenHour(tick: number): boolean {
  return Math.floor(tick / TICKS_PER_HOUR) % 2 === 0;
}
```

- [ ] **Step 3: Update decayVitals**

Replace the vitals decay section. The key change: hunger/fatigue/hygiene decay at hour boundaries (every TICKS_PER_HOUR ticks), not every tick.

```typescript
export function decayVitals(input: VitalsDecayInput): WorldEvent[] {
  const { characters, worldId, tick } = input;
  const inner: WorldEvent[] = [];
  const hourTick = isHourTick(tick);
  const evenHour = isEvenHour(tick);

  for (const c of characters) {
    if (
      (c.currentAction?.type === "sleep" || c.currentAction?.type === "nap") &&
      tick < c.currentAction.endsAt
    ) {
      continue;
    }

    const onTravel =
      c.currentAction?.type === "move" && tick < c.currentAction.endsAt;

    const prevHunger = c.vitals.hunger;
    const prevFatigue = c.vitals.fatigue;
    const prevHygiene = c.vitals.hygiene;

    // Vitals only decay at hour boundaries
    if (hourTick) {
      if (!onTravel || evenHour) {
        c.vitals.hunger = Math.min(VITAL_MAX, c.vitals.hunger + 1);
        c.vitals.fatigue = Math.min(
          VITAL_MAX,
          c.vitals.fatigue + fatigueIncrement(c.vitals.fatigue, evenHour),
        );
      }
      if (evenHour && !onTravel) {
        c.vitals.hygiene = Math.min(VITAL_MAX, c.vitals.hygiene + 1);
      }
    }

    checkVitalCrossing({
      inner, worldId, tick, charId: c.id,
      prev: prevHunger, curr: c.vitals.hunger,
      medium: HUNGER_MEDIUM, severe: HUNGER_SEVERE,
      mediumFreq: REMINDER_HUNGER_FATIGUE_MEDIUM,
      severeFreq: REMINDER_HUNGER_FATIGUE_SEVERE,
      describe: hungerDescription,
    });

    checkVitalCrossing({
      inner, worldId, tick, charId: c.id,
      prev: prevFatigue, curr: c.vitals.fatigue,
      medium: FATIGUE_MEDIUM, severe: FATIGUE_SEVERE,
      mediumFreq: REMINDER_HUNGER_FATIGUE_MEDIUM,
      severeFreq: REMINDER_HUNGER_FATIGUE_SEVERE,
      describe: fatigueDescription,
    });

    checkVitalCrossing({
      inner, worldId, tick, charId: c.id,
      prev: prevHygiene, curr: c.vitals.hygiene,
      medium: HYGIENE_MEDIUM, severe: HYGIENE_SEVERE,
      mediumFreq: REMINDER_HYGIENE_MEDIUM,
      severeFreq: REMINDER_HYGIENE_SEVERE,
      describe: hygieneDescription,
    });

    applyCapPenalty({
      inner, worldId, tick, character: c, kind: "hunger",
      describe: hungerCapDescription,
    });
    applyCapPenalty({
      inner, worldId, tick, character: c, kind: "fatigue",
      describe: fatigueCapDescription,
    });
  }

  return inner;
}
```

- [ ] **Step 4: Update fatigueIncrement to use evenHour**

Replace line 153-157:

```typescript
function fatigueIncrement(currentFatigue: number, isEvenHour: boolean): number {
  if (currentFatigue < 8) return isEvenHour ? 1 : 0;
  if (currentFatigue < 13) return 1;
  return 2;
}
```

- [ ] **Step 5: Update evolveEmotions**

Replace emotion evolution to use hour boundaries:

```typescript
export function evolveEmotions(input: EmotionEvolutionInput): WorldEvent[] {
  const { characters, worldId, tick, hasCompanions } = input;
  const inner: WorldEvent[] = [];
  const evenHour = isEvenHour(tick);
  const hourTick = isHourTick(tick);

  for (const c of characters) {
    // mood: even hour → toward 0 by 1
    if (hourTick && evenHour && c.emotion.mood !== 0) {
      c.emotion.mood += c.emotion.mood > 0 ? -1 : 1;
    }

    // stress: every 24 hours → -1
    const totalHours = Math.floor(tick / TICKS_PER_HOUR);
    if (totalHours > 0 && totalHours % STRESS_DECAY_INTERVAL === 0 && hourTick) {
      c.emotion.stress = Math.max(0, c.emotion.stress - 1);
    }

    // social_satiety: even hour → +1 if companions, -1 if alone
    if (hourTick && evenHour) {
      const hasPeer = hasCompanions.get(c.id) ?? false;
      if (hasPeer) {
        c.emotion.social_satiety = Math.min(4, c.emotion.social_satiety + 1);
      } else {
        c.emotion.social_satiety = Math.max(-4, c.emotion.social_satiety - 1);
      }
    }

    // throttled threshold reminders (use totalHours concept)
    if (c.emotion.mood <= -3 && totalHours > 0 && totalHours % REMINDER_MOOD === 0 && hourTick) {
      inner.push(makeInnerEvent({
        worldId, tick, charId: c.id,
        description: "心情低落，情绪需要出口。",
        intensity: 2,
      }));
    }
    if (c.emotion.stress >= 3 && totalHours > 0 && totalHours % REMINDER_STRESS === 0 && hourTick) {
      inner.push(makeInnerEvent({
        worldId, tick, charId: c.id,
        description: "压力很大，需要放松。",
        intensity: 2,
      }));
    }
    if (
      c.emotion.social_satiety <= -3 &&
      totalHours > 0 &&
      totalHours % REMINDER_SOCIAL_SATIETY_LOW === 0 &&
      hourTick
    ) {
      inner.push(makeInnerEvent({
        worldId, tick, charId: c.id,
        description: "感到孤独，渴望与人交流。",
        intensity: 2,
      }));
    }
  }

  return inner;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/engine/vitals-emotion.ts
git commit -m "feat(vitals): distribute vitals decay and emotion evolution across 5-ticks-per-hour"
```

---

### Task 10: Update facts.ts for tick-based calculation

**Files:**
- Modify: `src/engine/facts.ts`

- [ ] **Step 1: hoursAtCurrentLocation now needs tick-to-hour conversion**

In `deriveAggregatedFacts`, update the hours calculation. The `currentTick` and `sinceTick` are still tick values, but `hoursAtCurrentLocation` should show game hours:

```typescript
import { TICKS_PER_HOUR } from "@/domain/enums";

// In deriveAggregatedFacts:
const hoursAtCurrentLocation = foundMove
  ? Math.max(0, Math.floor((currentTick - sinceTick) / TICKS_PER_HOUR))
  : Math.floor(currentTick / TICKS_PER_HOUR);
```

- [ ] **Step 2: Update todayActionCounts window**

The `TODAY_WINDOW` was 24 ticks (= 24 hours). Now it should be 24 hours worth of ticks:

```typescript
const TODAY_WINDOW = 24 * TICKS_PER_HOUR; // 120 ticks = 1 game day
```

- [ ] **Step 3: Commit**

```bash
git add src/engine/facts.ts
git commit -m "feat(facts): adapt hours and daily window to tick granularity"
```

---

### Task 11: Update sleep/nap completion in tick.ts for tick-based calculation

**Files:**
- Modify: `src/engine/tick.ts`

This is a targeted fix in the ongoing action completion section (lines 252-261). Already partially addressed in Task 7, but needs the hoursDone conversion:

- [ ] **Step 1: Fix hoursDone calculation in tick.ts ongoing action completion**

In the sleep/nap completion block (lines 252-261), the `fromTick - c.currentAction.startedAt` is in ticks, but fatique recovery formulas use hours:

```typescript
if (c.currentAction && fromTick >= c.currentAction.endsAt) {
  if (c.currentAction.type === "sleep") {
    c.vitals.fatigue = 0;
    c.vitals.fatigueCapTicks = 0;
  } else if (c.currentAction.type === "nap") {
    c.vitals.fatigue = Math.max(0, c.vitals.fatigue - 6);
    if (c.vitals.fatigue < 16) c.vitals.fatigueCapTicks = 0;
  }
  c.currentAction = undefined;
}
```

(Sleep/nap completion in tick.ts already resets fatique directly, not based on ticksDone. The tickDone is only used for partial recovery on INTERRUPTION — which we handle in the interrupt block. So this code is actually fine as-is for completion.)

But for the interrupt block (line 199-207), the `hoursDone` needs updating:

```typescript
const ticksDone = fromTick - c.currentAction.startedAt;
const hoursDone = Math.floor(ticksDone / TICKS_PER_HOUR);
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/tick.ts
git commit -m "fix(tick): convert ticks to hours for interrupted sleep/nap partial recovery"
```

---

### Task 12: Update remaining tick.ts references and clean up

**Files:**
- Modify: `src/engine/tick.ts`

- [ ] **Step 1: Update auto-wait inner event frequency**

Line 219: `if (fromTick % 4 === 0)` — this was every 4 hours. Now it should be less frequent given more ticks. Change to every 20 ticks (= 4 hours):

```typescript
if (fromTick % (4 * TICKS_PER_HOUR) === 0) {
```

- [ ] **Step 2: Update snapshot interval from 24 to 24*TICKS_PER_HOUR**

Line 454:

```typescript
if (world.currentTick > 0 && world.currentTick % (24 * TICKS_PER_HOUR) === 0) {
```

- [ ] **Step 3: Update acquaintance decay from 336 to 336*TICKS_PER_HOUR**

Line 50:

```typescript
const ACQUAINTANCE_DECAY_TICKS = 336 * TICKS_PER_HOUR; // 14 game days in ticks
```

- [ ] **Step 4: Update FACTS_LOOKBACK_TICKS**

Line 47:

```typescript
const FACTS_LOOKBACK_TICKS = 48 * TICKS_PER_HOUR; // 48 game hours in ticks
```

- [ ] **Step 5: Update ACQUAINTANCE_DECAY_TICKS and ACQUAINTANCE_WARN_TICKS in prompt.ts**

In `src/llm/prompt.ts`:

```typescript
import { TICKS_PER_HOUR } from "@/domain/enums";

const ACQUAINTANCE_DECAY_TICKS = 336 * TICKS_PER_HOUR;
const ACQUAINTANCE_WARN_TICKS = 48 * TICKS_PER_HOUR;
```

- [ ] **Step 6: Commit**

```bash
git add src/engine/tick.ts src/llm/prompt.ts
git commit -m "fix: update all tick-based constants for 5-ticks-per-hour"
```

---

### Task 13: Frontend — moving NPC status display

**Files:**
- Modify: `src/app/_lib/profile-format.ts`

- [ ] **Step 1: Update formatActionWindow to show step progress**

In `src/app/_lib/profile-format.ts`, update `formatActionWindow`:

```typescript
import { TICKS_PER_HOUR } from "@/domain/enums";

export function formatActionWindow(action: OngoingAction): string {
  if (action.type === "move" && action.path && action.stepIndex !== undefined) {
    const step = action.stepIndex;
    const total = action.path.length - 1;
    return `${action.description} (${step}/${total}步, t${action.startedAt}→t${action.endsAt})`;
  }
  return `${action.description} (t${action.startedAt}→t${action.endsAt})`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_lib/profile-format.ts
git commit -m "feat(ui): show moving NPC step progress in status badge"
```

---

### Task 14: End-to-end test — verify pathfinding + movement

- [ ] **Step 1: Run the dev server and tick through movement**

Run a few ticks and verify:
1. NPC issues a `move` with destination + reason + arrivalAction
2. BFS path is computed correctly
3. NPC auto-walks along path, 1 step per tick
4. Arrival action executes
5. Move initiation memory is written
6. Arrival memory is written
7. Interruption by high-intensity event works

- [ ] **Step 2: Check vitals decay at correct rate**

Verify hunger/fatigue/hygiene only change at hour boundaries.

- [ ] **Step 3: Check snapshot interval**

Verify snapshot is saved every 120 ticks (24 hours).

- [ ] **Step 4: Commit any test fixes**

---

### Task 15: Update design doc references and final cleanup

- [ ] **Step 1: Re-read the spec and verify all requirements are implemented**

Check every requirement from the design spec against the implemented tasks.

- [ ] **Step 2: Run TypeScript compilation**

```bash
cd E:/Projects/agent-world && npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 3: Final commit**

```bash
git add .
git commit -m "chore: final cleanup and type fixes for pathfinding movement"
```

---
