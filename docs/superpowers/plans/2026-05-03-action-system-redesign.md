# Action System Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 28-type closed-enum action system with an open-registry architecture where actions implement a uniform `ActionDefinition` interface, mods can inject custom actions via `.js` files, and the engine drives execution through the registry instead of a switch-case.

**Architecture:** New `ActionDefinition` interface decouples action logic from the engine. `ActionRegistry` manages registration/lookup/option-building. 8 built-in definitions replace the old hardcoded actions. `execute.ts` applies `Outcome` objects uniformly instead of per-type switch branches. Ongoing actions use lifecycle hooks (`onTick`, `onComplete`, `onInterrupt`). Map-pack mods load via `manifest.json` → `require()` and register into the same registry.

**Tech Stack:** TypeScript, Zod, Node.js `require()` for mod loading

---

## File Structure

| File | Responsibility |
|------|---------------|
| **NEW** `src/domain/action-system.ts` | `ActionDefinition`, `Outcome`, `StateChange`, `ActionContext`, `ActionInput` interfaces + `ActionRegistry` class |
| **NEW** `src/engine/actions-builtin.ts` | 8 built-in `ActionDefinition` exports |
| `src/domain/types.ts` | Remove `ActionType` dependency from `Action`; add `actionType: string` |
| `src/domain/enums.ts` | Remove `ACTION_TYPES` const array |
| `src/domain/schemas.ts` | `ActionToolInputSchema` → dynamic `buildActionToolSchema(types: string[])` |
| `src/engine/actions.ts` | Replace `getAvailableActions()` body with `registry.buildOptions()` |
| `src/engine/execute.ts` | Replace switch-case with `registry.get(type).execute()` + `applyOutcome()` |
| `src/engine/tick.ts` | Ongoing action management uses `onTick`/`onComplete`/`onInterrupt` hooks |
| `src/config/types.ts` | Add `actions?: string` to `Manifest` |
| `src/config/schemas.ts` | Add `actions` field to `ManifestSchema` |
| `src/config/loader.ts` | Add `loadModActions(packId)` function |
| `src/llm/decide.ts` | Use dynamic schema from registry |
| `src/llm/prompt.ts` | `ACTION_NAMES` → dynamic from registry; remove `ActionType` imports |
| `src/engine/facts.ts` | `todayActionCounts` key → `string` instead of `ActionType` |
| `src/engine/tick.test.ts` | Update to new action types |

---

### Task 1: Define new action-system types and ActionRegistry

**Files:**
- Create: `src/domain/action-system.ts`
- Modify: `src/domain/types.ts` (minimal — just relax `Action.type` to `string`)

- [ ] **Step 1: Create `src/domain/action-system.ts`**

```typescript
/**
 * Action system v2 — open-registry architecture.
 *
 * ActionDefinition: uniform interface for built-in and mod-injected actions.
 * ActionRegistry: singleton that manages registration, lookup, and LLM option building.
 * Outcome + StateChange: declarative side-effect descriptions applied by the engine.
 */
import type { AggregatedFacts } from "@/engine/facts";
import type { Character, MapNode } from "./types";
import type { EventCategory, EventScope } from "./enums";

// ---- ActionInput: LLM tool-call params, passed to execute() ----

export interface ActionInput {
  target_id?: string;
  target_node_id?: string;
  free_text?: string;
  reason?: string;
  arrival_action?: {
    action_type: string;
    free_text?: string;
    target_id?: string;
    target_node_id?: string;
  };
  [key: string]: unknown;
}

// ---- ActionContext: the world snapshot at decision time ----

export interface ActionContext {
  worldId: string;
  tick: number;
  self: Character;
  here: MapNode;
  companions: Character[];
  reachable: MapNode[];
  isSleepHour: boolean;
  facts: AggregatedFacts;
}

// ---- Outcome: what the action produced ----

export interface Outcome {
  memory: string;
  event?: {
    category: EventCategory;
    description: string;
    intensity?: 1 | 2 | 3 | 4 | 5;
    scope?: EventScope;
  };
  stateChanges?: StateChange[];
  dialogRequest?: {
    targetId: string;
    openingLine: string;
  };
}

// ---- StateChange: declarative side effects ----

export type StateChange =
  | { kind: "resetVital"; vital: "hunger" | "fatigue" | "hygiene" }
  | { kind: "adjustVital"; vital: "hunger" | "fatigue" | "hygiene"; delta: number }
  | { kind: "setLocation"; nodeId: string }
  | { kind: "adjustMood"; delta: number }
  | { kind: "adjustStress"; delta: number }
  | { kind: "setOngoingAction"; action: import("./types").OngoingAction }
  | { kind: "clearOngoingAction" };

// ---- ActionOption: presented to LLM ----

export interface ActionOption {
  type: string;
  hint: string;
  targetId?: string;
  targetNodeId?: string;
}

// ---- ActionDefinition: the core interface ----

export interface ActionDefinition {
  type: string;
  duration: "instant" | number; // "instant" or tick count (0 = engine-computed)

  check(ctx: ActionContext): boolean;
  hint(ctx: ActionContext): string | Array<{ hint: string; targetId?: string; targetNodeId?: string }>;

  /** Execute. For instant actions, this is the one-and-done call. For ongoing, this is onStart. */
  execute(ctx: ActionContext, input: ActionInput): Outcome;

  /** Ongoing only: called each tick the action is active. Return null for no-op. */
  onTick?(ctx: ActionContext): Outcome | null;

  /** Ongoing only: called when action completes normally. */
  onComplete?(ctx: ActionContext): Outcome;

  /** Ongoing only: called when action is interrupted. */
  onInterrupt?(ctx: ActionContext, reason: string): Outcome;
}

// ---- ActionRegistry ----

export class ActionRegistry {
  private _defs = new Map<string, ActionDefinition>();

  register(def: ActionDefinition): void {
    this._defs.set(def.type, def);
  }

  registerAll(defs: ActionDefinition[]): void {
    for (const d of defs) this.register(d);
  }

  has(type: string): boolean {
    return this._defs.has(type);
  }

  get(type: string): ActionDefinition | undefined {
    return this._defs.get(type);
  }

  /** All registered action type names. */
  types(): IterableIterator<string> {
    return this._defs.keys();
  }

  buildOptions(ctx: ActionContext): ActionOption[] {
    const opts: ActionOption[] = [];
    for (const [type, def] of this._defs) {
      if (!def.check(ctx)) continue;
      const hint = def.hint(ctx);
      if (Array.isArray(hint)) {
        for (const h of hint) {
          opts.push({ type, hint: h.hint, targetId: h.targetId, targetNodeId: h.targetNodeId });
        }
      } else {
        opts.push({ type, hint });
      }
    }
    return opts;
  }
}

/** Global singleton. */
export const actionRegistry = new ActionRegistry();
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: no errors related to action-system.ts (may have pre-existing errors in other files that still rely on old ActionType).

- [ ] **Step 3: Commit**

```bash
git add src/domain/action-system.ts
git commit -m "feat: add ActionDefinition, Outcome, StateChange types and ActionRegistry"
```

---

### Task 2: Create 8 built-in ActionDefinitions

**Files:**
- Create: `src/engine/actions-builtin.ts`

- [ ] **Step 1: Create `src/engine/actions-builtin.ts`**

```typescript
/**
 * 8 built-in action definitions.
 * Registered at startup. Mods can override any of these via registry.register().
 */
import type { ActionDefinition } from "@/domain/action-system";

export const eatAction: ActionDefinition = {
  type: "eat",
  duration: "instant",
  check(ctx) {
    return ctx.here.tags.includes("dining");
  },
  hint(ctx) {
    const h = ctx.self.vitals.hunger;
    if (h >= 10) return `⭐ 进食（已 ${h} 小时未进食）`;
    if (h >= 5) return "⭐ 进食";
    if (h <= 0) return "进食（不饿，纯消遣）";
    return "进食";
  },
  execute(ctx, input) {
    const desc = (input.free_text as string) || "吃了一顿饭";
    return {
      memory: `我在 ${ctx.here.name} ${desc}。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} ${desc}。`, intensity: 2 },
      stateChanges: [{ kind: "resetVital", vital: "hunger" }],
    };
  },
};

export const batheAction: ActionDefinition = {
  type: "bathe",
  duration: "instant",
  check(ctx) {
    return ctx.here.tags.includes("bathing");
  },
  hint(ctx) {
    const h = ctx.self.vitals.hygiene;
    if (h >= 13) return `⭐ 洗浴（已 ${h} 小时未洗浴）`;
    if (h >= 8) return "⭐ 洗浴";
    return "洗浴";
  },
  execute(ctx, input) {
    const desc = (input.free_text as string) || "洗了个澡";
    return {
      memory: `我在 ${ctx.here.name} ${desc}。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} ${desc}。`, intensity: 1 },
      stateChanges: [{ kind: "resetVital", vital: "hygiene" }],
    };
  },
};

export const restAction: ActionDefinition = {
  type: "rest",
  duration: "instant",
  check(ctx) {
    return ctx.here.tags.includes("residence") || ctx.here.privacy === "private";
  },
  hint(ctx) {
    return ctx.self.vitals.fatigue >= 12 || ctx.isSleepHour ? "⭐ 休息" : "休息";
  },
  execute(ctx, input) {
    return {
      memory: `我在 ${ctx.here.name} 休息了一会儿。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} 休息。`, intensity: 1 },
      stateChanges: [{ kind: "adjustVital", vital: "fatigue", delta: -2 }],
    };
  },
};

export const workAction: ActionDefinition = {
  type: "work",
  duration: "instant",
  check(ctx) {
    if (!ctx.facts.activityNodeId) return false;
    if (ctx.self.profession === "unemployed") return false;
    return ctx.here.id === ctx.facts.activityNodeId;
  },
  hint(ctx) {
    const prof = ctx.self.profession;
    return `工作（${prof === "student" ? "学习" : prof}）`;
  },
  execute(ctx, input) {
    const desc = (input.free_text as string) || "专注于手头的事情";
    return {
      memory: `我在 ${ctx.here.name} 工作：${desc}。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} 工作。`, intensity: 1 },
    };
  },
};

export const thinkAction: ActionDefinition = {
  type: "think",
  duration: "instant",
  check(_ctx) {
    return true;
  },
  hint(ctx) {
    const peers = ctx.companions.map((c) => c.name).join("、");
    const base = `沉思（你在 ${ctx.here.name}`;
    if (peers) return `${base}，身边有 ${peers}）`;
    if (ctx.here.tags.includes("outdoor")) return `${base}，户外空气清新）`;
    return `${base}，独自一人）`;
  },
  execute(ctx, input) {
    const thought = (input.free_text as string) || "默然思索";
    return {
      memory: `我沉思：${thought}`,
      event: { category: "inner", description: `${ctx.self.name} 在 ${ctx.here.name} 若有所思。`, intensity: 1 },
    };
  },
};

export const speakAction: ActionDefinition = {
  type: "speak",
  duration: "instant",
  check(ctx) {
    return ctx.companions.length > 0;
  },
  hint(ctx) {
    return ctx.companions.map((c) => ({
      hint: `和 ${c.name} 交谈`,
      targetId: c.id,
    }));
  },
  execute(ctx, input) {
    const targetId = input.target_id as string;
    const target = ctx.companions.find((c) => c.id === targetId);
    const line = (input.free_text as string) || "……";
    return {
      memory: `我对 ${target?.name ?? targetId} 说："${line}"`,
      event: { category: "social", description: `${ctx.self.name} 对 ${target?.name ?? targetId} 搭话`, intensity: 2 },
      dialogRequest: { targetId, openingLine: line },
    };
  },
};

export const sleepAction: ActionDefinition = {
  type: "sleep",
  duration: 40,
  check(ctx) {
    if (!ctx.isSleepHour) return false;
    return ctx.here.tags.includes("residence") || ctx.here.privacy === "private";
  },
  hint(ctx) {
    return "⭐ 睡觉（8 小时，intensity >= 4 可打断）";
  },
  execute(ctx, input) {
    return {
      memory: `我在 ${ctx.here.name} 躺下准备睡觉。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} 躺下入睡。`, intensity: 1 },
    };
  },
  onComplete(ctx) {
    return {
      memory: "我睡醒了，精神饱满。",
      event: { category: "action", description: `${ctx.self.name} 睡醒了。`, intensity: 2 },
      stateChanges: [{ kind: "resetVital", vital: "fatigue" }],
    };
  },
  onInterrupt(ctx, reason) {
    return {
      memory: `我被吵醒了——${reason}`,
      event: { category: "action", description: `${ctx.self.name} 被惊醒。`, intensity: 3 },
    };
  },
};

export const moveAction: ActionDefinition = {
  type: "move",
  duration: 0, // engine computes from BFS path length
  check(_ctx) {
    // move is always allowed to be chosen — the engine validates target_node_id at execution time
    return true;
  },
  hint(ctx) {
    const entries: Array<{ hint: string; targetNodeId?: string }> = [];
    const highlighted = new Set<string>();
    if (ctx.facts.restNodeId) highlighted.add(ctx.facts.restNodeId);
    for (const n of ctx.reachable) {
      if (n.tags.includes("dining") || n.tags.includes("bathing")) highlighted.add(n.id);
    }
    for (const nId of highlighted) {
      const n = ctx.reachable.find((r) => r.id === nId);
      if (!n) continue;
      const isRest = ctx.facts.restNodeId !== null && n.id === ctx.facts.restNodeId;
      let hint = `前往 ${n.name}`;
      if (isRest && (ctx.self.vitals.fatigue >= 12 || ctx.isSleepHour)) {
        hint = `⭐ ${hint}——休息处`;
      } else if (n.tags.includes("dining") && ctx.self.vitals.hunger >= 5) {
        hint = `⭐ ${hint}——可用餐`;
      } else if (n.tags.includes("bathing") && ctx.self.vitals.hygiene >= 8) {
        hint = `⭐ ${hint}——可洗浴`;
      }
      entries.push({ hint, targetNodeId: n.id });
    }
    // Generic move for any reachable node
    entries.push({ hint: "前往地图上任意地点（指定 target_node_id + reason）。" });
    return entries;
  },
  execute(ctx, input) {
    const targetId = input.target_node_id as string;
    const target = ctx.reachable.find((n) => n.id === targetId);
    const reason = (input.reason as string) || "出发前往";
    return {
      memory: `我离开 ${ctx.here.name}，去 ${target?.name ?? targetId}：${reason}。`,
      event: { category: "action", description: `${ctx.self.name} 从 ${ctx.here.name} 前往 ${target?.name ?? targetId}。`, intensity: 1 },
      stateChanges: [{ kind: "setLocation", nodeId: targetId }],
    };
  },
  onComplete(ctx) {
    return {
      memory: `我到达了 ${ctx.here.name}。`,
      event: { category: "action", description: `${ctx.self.name} 到达了 ${ctx.here.name}。`, intensity: 1 },
    };
  },
};

export const BUILTIN_ACTIONS: ActionDefinition[] = [
  eatAction,
  batheAction,
  restAction,
  workAction,
  thinkAction,
  speakAction,
  sleepAction,
  moveAction,
];
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/engine/actions-builtin.ts
git commit -m "feat: add 8 built-in action definitions"
```

---

### Task 3: Update domain types — relax Action.type, remove ACTION_TYPES

**Files:**
- Modify: `src/domain/types.ts:239-241,79-81` — `Action.type` and `OngoingAction.type` become `string`
- Modify: `src/domain/enums.ts:8-21` — remove `ACTION_TYPES` const

- [ ] **Step 1: Update `Action.type` and `OngoingAction.type` in types.ts**

Two changes:

Change 1 — `Action` interface (line 240-241):
```typescript
// OLD:
export interface Action {
  type: ActionType;
  // ...
}

// NEW:
export interface Action {
  type: string;
  // ...
}
```

Change 2 — `OngoingAction` interface (line 80-81):
```typescript
// OLD:
export interface OngoingAction {
  type: ActionType;
  // ...
}

// NEW:
export interface OngoingAction {
  type: string;
  // ...
}
```

- [ ] **Step 2: Remove ACTION_TYPES from enums.ts**

Remove lines 8-21:
```typescript
// DELETE:
export const ACTION_TYPES = [
  "move", "wait", "observe", "rest", "eat", "read", "study", "work", "use_ability",
  "sleep", "nap", "bathe", "exercise", "meditate", "write", "groom", "pace",
  "speak", "interact_object", "interact_person",
  "attack", "flee", "help", "gift",
  "update_relation",
  "accept_speak", "reject_speak", "leave_dialog",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];
```

Also remove the unused `ActionType` import from types.ts line 1:
```typescript
// OLD:
import type { ActionType, CharacterOrigin, EventCategory, ... } from "./enums";

// NEW:
import type { CharacterOrigin, EventCategory, ... } from "./enums";
```

- [ ] **Step 3: Commit**

```bash
git add src/domain/types.ts src/domain/enums.ts
git commit -m "refactor: relax Action.type to string, remove ACTION_TYPES enum"
```

---

### Task 4: Update schemas — dynamic action_type enum

**Files:**
- Modify: `src/domain/schemas.ts` — add `buildActionToolSchema(types: string[])`, keep old schemas for dialog protocol

- [ ] **Step 1: Update `src/domain/schemas.ts`**

The file currently exports `ActionToolInputSchema`, `SalvageToolSchema`, `AcceptToolSchema`, `DialogTurnToolSchema`, `DialogSummaryToolSchema`.

Replace the static `ActionToolInputSchema` and `SalvageToolSchema` with builder functions. Keep `AcceptToolSchema`, `DialogTurnToolSchema`, `DialogSummaryToolSchema` unchanged.

Also update the `ActionSchema` and `SalvageActionSchema` to use dynamic enums. And update `RELATION_CHANGE_TYPES` to use const enum since `update_relation` is removed from built-in but might be used by mods:

```typescript
// ---- Replace ActionSchema and ActionToolInputSchema with builder ----

export function buildActionSchema(actionTypes: string[]) {
  if (actionTypes.length === 0) {
    throw new Error("buildActionSchema: actionTypes must not be empty");
  }
  const types = actionTypes as [string, ...string[]];
  return z.object({
    action_type: z.enum(types),
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
      action_type: z.enum(types),
      free_text: z.string().max(500).optional(),
      target_id: z.string().optional(),
      target_node_id: z.string().optional(),
    }).optional(),
  });
}
export type ActionPayload = z.infer<ReturnType<typeof buildActionSchema>>;

export const ACTION_TOOL_NAME = "submit_action";
export function buildActionToolSchema(actionTypes: string[]) {
  return {
    type: "object" as const,
    properties: {
      action_type: { type: "string", enum: actionTypes },
      target_id: { type: "string", description: "目标角色或物体 id，可选。" },
      target_node_id: { type: "string", description: "目标节点 id（仅 move 等位移行动需要）。" },
      free_text: { type: "string", description: "自由文本（说话内容、行动具体描述）。speak 必填；其它行动选填。" },
      reasoning: { type: "string", description: "内心独白。必须显式引用一项你的性格特征（用文字描述，不要写数值）。" },
      emotion_tag: { type: "string", description: "短情绪标签，例如 紧张 / 好奇 / 烦躁。" },
      self_importance: { type: "integer", enum: [1, 2, 3, 4, 5], description: "1-5 自评要不要长期记住。" },
      change_type: { type: "string", enum: [...RELATION_CHANGE_TYPES], description: "仅在 action_type=update_relation 时使用。" },
      reason: { type: "string", description: "仅 move：移动原因。" },
      arrival_action: {
        type: "object",
        description: "仅 move：到达目的地后要自动执行的动作。",
        properties: {
          action_type: { type: "string", enum: actionTypes },
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
}
```

Replace `SalvageActionSchema` and `SalvageToolSchema` — these are still needed for dialog salvage but should be built with filtered types from the registry (the salvage types function already exists, just make it dynamic):

```typescript
export function buildSalvageActionSchema(actionTypes: string[]) {
  const filtered = actionTypes.filter(
    (t) => t !== "speak" && t !== "accept_speak" && t !== "reject_speak" && t !== "leave_dialog",
  );
  if (filtered.length === 0) throw new Error("Salvage action types empty");
  const types = filtered as [string, ...string[]];
  const schema = z.object({
    action_type: z.enum(types),
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
      action_type: z.enum(types),
      free_text: z.string().max(500).optional(),
      target_id: z.string().optional(),
      target_node_id: z.string().optional(),
    }).optional(),
  });
  return { schema, types };
}

export function buildSalvageToolSchema(actionTypes: string[]) {
  const filtered = actionTypes.filter(
    (t) => t !== "speak" && t !== "accept_speak" && t !== "reject_speak" && t !== "leave_dialog",
  );
  return {
    type: "object" as const,
    properties: {
      action_type: { type: "string", enum: filtered },
      target_id: { type: "string", description: "目标角色 id，可选。" },
      target_node_id: { type: "string", description: "目标节点 id（仅 move 等位移行动需要）。" },
      free_text: { type: "string", description: "自由文本。" },
      reasoning: { type: "string", description: "内心独白。必须显式引用性格特征文字描述。" },
      emotion_tag: { type: "string", description: "短情绪标签。" },
      self_importance: { type: "integer", enum: [1, 2, 3, 4, 5], description: "1-5 自评重要度。" },
      change_type: { type: "string", enum: [...RELATION_CHANGE_TYPES], description: "仅在 action_type=update_relation 时使用。" },
      reason: { type: "string", description: "仅 move：移动原因。" },
      arrival_action: {
        type: "object",
        description: "仅 move：到达目的地后要自动执行的动作。",
        properties: {
          action_type: { type: "string", enum: filtered },
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
}
```

Remove the old `export const ActionSchema`, `export const ActionToolInputSchema`, `export const SalvageActionSchema`, `export const SalvageToolSchema` and their related const arrays (`SALVAGE_ACTION_TYPES`, `_salvageActionTypesFiltered`).

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: errors in decide.ts, prompt.ts, facts.ts, tick.ts that still reference old exports. That's OK — those will be fixed in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add src/domain/schemas.ts
git commit -m "refactor: make action schemas dynamic, driven by registry type list"
```

---

### Task 5: Update facts.ts — `todayActionCounts` key becomes `string`

**Files:**
- Modify: `src/engine/facts.ts:41` — `Partial<Record<ActionType, number>>` → `Partial<Record<string, number>>`

- [ ] **Step 1: Change type**

```typescript
// OLD (line 41):
todayActionCounts: Partial<Record<ActionType, number>>;

// NEW:
todayActionCounts: Partial<Record<string, number>>;
```

Also fix the import on line 15 — remove `ActionType`:
```typescript
// OLD:
import { TICKS_PER_HOUR, type ActionType } from "@/domain/enums";

// NEW:
import { TICKS_PER_HOUR } from "@/domain/enums";
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/facts.ts
git commit -m "refactor: relax todayActionCounts key to string"
```

---

### Task 6: Update prompt.ts — dynamic ACTION_NAMES

**Files:**
- Modify: `src/llm/prompt.ts` — `ACTION_NAMES` → built from registry; remove `ActionType` import

- [ ] **Step 1: Update prompt.ts**

Line 14: Remove `import type { ActionType, Profession }` → `import type { Profession }`

Lines 408-446: Replace static `ACTION_NAMES: Record<ActionType, string>` with a dynamic map built from the registry:

```typescript
// OLD:
const ACTION_NAMES: Record<ActionType, string> = {
  move: "移动到",
  wait: "原地等待",
  observe: "观察",
  rest: "休息",
  eat: "进食",
  read: "阅读",
  study: "学习",
  work: "工作",
  use_ability: "使用能力",
  sleep: "睡觉",
  nap: "小睡",
  bathe: "洗浴",
  exercise: "运动",
  meditate: "冥想",
  write: "写作",
  groom: "整理仪容",
  pace: "踱步",
  speak: "说话",
  interact_object: "与物件互动",
  interact_person: "与人互动",
  attack: "攻击",
  flee: "逃跑",
  help: "帮助",
  gift: "赠送",
  update_relation: "更新关系",
  accept_speak: "接受对话",
  reject_speak: "拒绝对话",
  leave_dialog: "离开对话",
};

// NEW:
import { actionRegistry } from "@/domain/action-system";

function getActionNames(): Record<string, string> {
  const names: Record<string, string> = {};
  for (const type of actionRegistry.types()) {
    names[type] = type; // Use the type string directly as label
  }
  return names;
}

// Replace all usages of ACTION_NAMES with getActionNames()
// Usage sites:
// Line 447: ACTION_NAMES[k] → (getActionNames()[k] ?? k)
// Line 865: ACTION_NAMES[type] → (getActionNames()[type] ?? type)
```

Actually, since ACTION_NAMES is used in template literal functions that run per-tick, caching it is better:

```typescript
let _cachedActionNames: Record<string, string> | null = null;
function getActionNames(): Record<string, string> {
  if (!_cachedActionNames) {
    _cachedActionNames = {};
    for (const type of actionRegistry.types()) {
      _cachedActionNames[type] = type;
    }
  }
  return _cachedActionNames;
}
// Invalidate cache after mod loading — export a reset function
export function invalidateActionNamesCache(): void {
  _cachedActionNames = null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/llm/prompt.ts
git commit -m "refactor: dynamic ACTION_NAMES from action registry"
```

---

### Task 7: Update execute.ts — switch-case → registry + applyOutcome

**Files:**
- Modify: `src/engine/execute.ts` — replace the big switch-case

- [ ] **Step 1: Rewrite execute.ts**

The new `execute.ts` replaces the 600+ line switch-case with a registry-driven approach. Key changes:

```typescript
/**
 * Execute actions through registry + apply declarative Outcome.
 *
 * Keep: conflict arbitration, memory push, WorldEvent generation, relation change helpers.
 * Remove: per-type switch-case — replaced by registry.get(type).execute() + applyStateChanges().
 */
import { randomUUID } from "node:crypto";
import { actionRegistry } from "@/domain/action-system";
import type { ActionContext, Outcome, StateChange } from "@/domain/action-system";
import { applyEmotionEvent, clamp, resetVital } from "./vitals-emotion";
import type {
  Action,
  Character,
  MapNode,
  Memory,
  Relation,
  WorldEvent,
} from "@/domain/types";
import type {
  EventCategory,
  ObjectiveRelationKind,
} from "@/domain/enums";
import { BLOOD_RELATION_KINDS, TICKS_PER_HOUR } from "@/domain/enums";

const SHORT_MEMORY_LIMIT = 50;
const SLEEP_DURATION = 8 * TICKS_PER_HOUR;
const SLEEP_INTERRUPT_THRESHOLD = 4 as const;
const NAP_DURATION = 4 * TICKS_PER_HOUR;
const NAP_INTERRUPT_THRESHOLD = 3 as const;

interface ExecuteInput {
  worldId: string;
  tick: number;
  characters: Character[];
  nodes: MapNode[];
  actions: Action[];
}

export interface ExecuteResult {
  events: WorldEvent[];
  resolvedActions: Array<{ action: Action; success: boolean; reason?: string }>;
}

const EXCLUSIVE_TYPES: ReadonlySet<string> = new Set([
  "attack",
  "interact_object",
  "interact_person",
  "gift",
]);

function makeEvent(args: {
  worldId: string;
  tick: number;
  category: EventCategory;
  description: string;
  participants: string[];
  intensity?: 1 | 2 | 3 | 4 | 5;
  scope: WorldEvent["scope"];
  nodeId?: string;
  audienceCharacterId?: string;
}): WorldEvent {
  return {
    id: `evt-${randomUUID().slice(0, 8)}`,
    worldId: args.worldId,
    tick: args.tick,
    category: args.category,
    description: args.description,
    participants: args.participants,
    source: "actor",
    intensity: args.intensity ?? 2,
    scope: args.scope,
    nodeId: args.nodeId,
    audienceCharacterId: args.audienceCharacterId,
    duration: 1,
  };
}

function pushMemory(c: Character, mem: Memory) {
  c.shortMemory.push(mem);
  if (c.shortMemory.length > SHORT_MEMORY_LIMIT) {
    c.shortMemory.splice(0, c.shortMemory.length - SHORT_MEMORY_LIMIT);
  }
}

function memFromAction(tick: number, action: Action, prefix: string): Memory {
  return {
    id: `mem-${randomUUID().slice(0, 8)}`,
    tick,
    importance: action.selfImportance,
    content: `${prefix}：${action.freeText ?? action.reasoning.slice(0, 80)}`,
  };
}

/** Apply a single StateChange to the character. */
function applyStateChange(c: Character, sc: StateChange, tick: number): void {
  switch (sc.kind) {
    case "resetVital":
      resetVital(c, sc.vital);
      break;
    case "adjustVital":
      c.vitals[sc.vital] = clamp((c.vitals[sc.vital] as number) + sc.delta, 0, 16);
      break;
    case "setLocation":
      c.locationId = sc.nodeId;
      break;
    case "adjustMood":
      c.emotion.mood = clamp(c.emotion.mood + sc.delta, -4, 4);
      break;
    case "adjustStress":
      c.emotion.stress = clamp(c.emotion.stress + sc.delta, 0, 4);
      break;
    case "setOngoingAction":
      c.currentAction = sc.action;
      break;
    case "clearOngoingAction":
      c.currentAction = undefined;
      break;
  }
}

export function executeActions(input: ExecuteInput): ExecuteResult {
  const { worldId, tick, characters, nodes, actions } = input;
  const charById = new Map(characters.map((c) => [c.id, c]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const events: WorldEvent[] = [];
  const resolvedActions: ExecuteResult["resolvedActions"] = [];

  const claimed = new Set<string>();
  const claimKey = (a: Action) =>
    EXCLUSIVE_TYPES.has(a.type) && (a.targetId || a.targetNodeId)
      ? `${a.type}|${a.targetId ?? ""}|${a.targetNodeId ?? ""}`
      : null;

  for (const action of actions) {
    const actor = charById.get(action.actorId);
    if (!actor) {
      resolvedActions.push({ action, success: false, reason: `actor ${action.actorId} 不存在` });
      continue;
    }

    const key = claimKey(action);
    if (key && claimed.has(key)) {
      const memo = memFromAction(tick, action, "我没能赶在前面");
      pushMemory(actor, memo);
      resolvedActions.push({ action, success: false, reason: "被先到者占用" });
      events.push(makeEvent({
        worldId, tick, category: "action",
        description: `${actor.name} 试图 ${action.type} 但被抢了先。`,
        participants: [actor.id], intensity: 1, scope: "node", nodeId: actor.locationId,
      }));
      continue;
    }
    if (key) claimed.add(key);

    // Lookup definition
    const def = actionRegistry.get(action.type);
    if (!def) {
      // Unknown type → fallback wait
      const memo: Memory = {
        id: `mem-${randomUUID().slice(0, 8)}`, tick, importance: 1,
        content: `我尝试了未知的行动：${action.type}`,
      };
      pushMemory(actor, memo);
      resolvedActions.push({ action, success: false, reason: `未知action type: ${action.type}` });
      events.push(makeEvent({
        worldId, tick, category: "action",
        description: `${actor.name} 茫然地站着。`,
        participants: [actor.id], intensity: 1, scope: "node", nodeId: actor.locationId,
      }));
      continue;
    }

    // Build minimal ActionContext for execute
    const here = nodeById.get(actor.locationId);
    if (!here) {
      resolvedActions.push({ action, success: false, reason: "角色位置未知" });
      continue;
    }
    const ctx: ActionContext = {
      worldId, tick, self: actor, here,
      companions: [], // companions not needed for execution — only for decision
      reachable: nodes.filter((n) => n.id !== actor.locationId),
      isSleepHour: false,
      facts: {} as ActionContext["facts"],
    };

    // Build ActionInput from Action
    const input: ActionContext["self"] extends infer _S ? never : never = {} as never;
    // Actually, just use action directly:
    const actionInput = {
      target_id: action.targetId,
      target_node_id: action.targetNodeId,
      free_text: action.freeText,
      reason: action.reason,
      arrival_action: action.arrivalAction,
    };

    let success = true;
    let reason: string | undefined;

    try {
      const outcome: Outcome = def.execute(ctx, actionInput);

      // Apply state changes
      if (outcome.stateChanges) {
        for (const sc of outcome.stateChanges) {
          applyStateChange(actor, sc, tick);
        }
      }

      // Write memory
      if (!action.skipMemory) {
        pushMemory(actor, {
          id: `mem-${randomUUID().slice(0, 8)}`,
          tick,
          importance: action.selfImportance,
          content: outcome.memory,
        });
      }

      // Write arrival memory
      if (action.isArrivalAction && action.arrivalNodeName) {
        pushMemory(actor, {
          id: `mem-${randomUUID().slice(0, 8)}`,
          tick,
          importance: 3,
          content: `${actor.name} 到达了 ${action.arrivalNodeName}，开始 ${action.type}`,
        });
      }

      // Generate WorldEvent
      if (outcome.event) {
        events.push(makeEvent({
          worldId, tick,
          category: outcome.event.category,
          description: outcome.event.description,
          participants: [actor.id],
          intensity: outcome.event.intensity ?? 1,
          scope: outcome.event.scope ?? "node",
          nodeId: actor.locationId,
        }));
      }
    } catch (err) {
      success = false;
      reason = `执行失败：${err instanceof Error ? err.message : String(err)}`;
    }

    resolvedActions.push({ action, success, reason });
  }

  return { events, resolvedActions };
}

// ---- relation change helpers (keep for mods that register update_relation) ----

// Keep the existing relation helper functions: applyRelationChange, addKind, removeKind, replaceKind
// (copy them from the old execute.ts — they are needed for mod actions that use update_relation)
```

Wait — the approach above is incomplete because `execute.ts` currently handles special ongoing action setup for `sleep`/`nap`/`move` (setting `currentAction` on the character). In the new design, the action definition's `execute()` produces a declarative `Outcome`, and the engine only applies `stateChanges`.

For `sleep` → the `sleepAction.execute()` does NOT set `currentAction` (no `setOngoingAction` stateChange). Instead, the engine **after** calling `def.execute()` must check: if `def.duration !== "instant"`, automatically set up the `OngoingAction` on the character:

```typescript
// After execute, the engine manages ongoing setup:
if (def.duration !== "instant") {
  const endTick = def.duration === 0
    ? tick + 1 // move — will be overridden by tick.ts pathfinding logic
    : tick + def.duration;
  actor.currentAction = {
    type: action.type,
    startedAt: tick,
    endsAt: endTick,
    description: `${actor.name} ${action.type}...`,
    interruptThreshold: action.type === "sleep" ? 4 : action.type === "nap" ? 3 : 4,
  };
}
```

For `move`, the ongoing action setup with path is STILL done in tick.ts (pathfinding logic) — the action definition is only responsible for single-step arrival. The tick.ts move handler wraps the definition.

OK let me be precise about what execute.ts should handle vs what tick.ts handles:

**execute.ts**: calls `def.execute()` → applies Outcome → if ongoing, sets initial `currentAction`
**tick.ts**: move pathfinding + multi-step handling; ongoing tick advancement + onComplete/onInterrupt calls

This is getting complex. Let me simplify the plan — the actual implementation of the execute rewrite will be done more carefully. Let me just outline the steps and let the implementation handle details.

- [ ] **Step 1: Create the new `src/engine/execute.ts`**

The rewrite replaces the entire switch-case body. The key change is:

```typescript
// OLD (line 160-588): switch (action.type) { case "move": ... case "eat": ... }
// NEW:
const def = actionRegistry.get(action.type);
if (!def) { /* fallback to wait-like no-op with failure memory */ }

const outcome = def.execute(ctx, actionInput);

if (outcome.stateChanges) {
  for (const sc of outcome.stateChanges) applyStateChange(actor, sc, tick);
}

if (!action.skipMemory) {
  pushMemory(actor, { id: `mem-...`, tick, importance: action.selfImportance, content: outcome.memory });
}

if (outcome.event) {
  events.push(makeEvent({ ...outcome.event, participants: [actor.id], ... }));
}
```

Keep: `EXCLUSIVE_TYPES`, `claimKey` conflict arbitration, `pushMemory`, `makeEvent`, relation helper functions (in case mods use them).

Remove: all 28 case branches, `humanVerb()`, the explicit vitals manipulation for eat/rest/sleep/nap/bathe. These are now produced as `stateChanges` by the ActionDefinitions.

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/engine/execute.ts
git commit -m "refactor: replace execute switch-case with registry-driven Outcome apply"
```

---

### Task 8: Update tick.ts — ongoing management via hooks, integrate registry

**Files:**
- Modify: `src/engine/tick.ts` — Wire up registry, adapt ongoing management

- [ ] **Step 1: Update imports and initialization in tick.ts**

Lines 20-27, add registry import and builtin registration:

```typescript
import { actionRegistry } from "@/domain/action-system";
import { BUILTIN_ACTIONS } from "./actions-builtin";
```

At the top of `tick()` (around line 203), after `loadWorld()`, ensure builtins are registered:

```typescript
// Register built-in actions (idempotent — only first call does anything)
if (actionRegistry.types().next().done) {
  actionRegistry.registerAll(BUILTIN_ACTIONS);
}
```

For mod actions: after `loadManifest()`, load and register mod actions:

```typescript
const manifest = loadManifest(world.mapId);
const language = manifest.language;

// Load mod actions if defined
if (manifest.actions) {
  try {
    const { loadModActions } = await import("@/config/loader");
    const modDefs = loadModActions(world.mapId);
    actionRegistry.registerAll(modDefs);
  } catch (err) {
    console.warn(`Failed to load mod actions for ${world.mapId}:`, err);
  }
}
```

- [ ] **Step 2: Replace `getAvailableActions()` calls with `registry.buildOptions()`**

Line 429: 
```typescript
// OLD:
const opts = getAvailableActions(ctx, { facts, isSleepHour });

// NEW:
const opts = actionRegistry.buildOptions(ctx);
```

Also in the salvage decide block (lines 591-593):
```typescript
// OLD:
const opts = getAvailableActions(ctx, { facts, isSleepHour });

// NEW:
const opts = actionRegistry.buildOptions(ctx);
```

Remove unused import of `getAvailableActions`.

- [ ] **Step 3: Adapt ongoing action management to use definition hooks**

Current sleep/nap completion (lines 375-403) use hardcoded logic. Replace with `def.onComplete()`:

```typescript
// OLD (lines 375-403): hardcoded sleep/nap completion memory and vitals changes
// NEW:
const def = actionRegistry.get(c.currentAction!.type);
if (def?.onComplete) {
  const outcome = def.onComplete(ctx);
  pushMemory(c, { id: `mem-...`, tick: fromTick, importance: 3, content: outcome.memory });
  if (outcome.stateChanges) {
    for (const sc of outcome.stateChanges) applyStateChange(c, sc, fromTick);
  }
  if (outcome.event) {
    allEvents.push(makeEvent({ ...outcome.event, participants: [c.id], worldId, tick: fromTick, ... }));
  }
}
c.currentAction = undefined;
```

Current interrupt handling (lines 267-310): replace hardcoded sleep/nap partial recovery and memory with:

```typescript
const def = actionRegistry.get(c.currentAction!.type);
if (def?.onInterrupt) {
  const outcome = def.onInterrupt(ctx, interrupt.description);
  pushMemory(c, { id: `mem-...`, tick: fromTick, importance: 4, content: outcome.memory });
  if (outcome.stateChanges) {
    for (const sc of outcome.stateChanges) applyStateChange(c, sc, fromTick);
  }
}
c.currentAction = undefined;
```

- [ ] **Step 4: Remove hardcoded action-specific code**

Remove from tick.ts:
- `handleOngoingMove` — move pathing logic stays (BFS pathfinding is engine logic, not action definition)
- `pushMoveInitMemory` — move's execute() already writes the initiation memory
- Hardcoded sleep/nap vitals/fatigue adjustments at lines 275-284, 396-402
- `nap` auto-wait inner events at lines 340-350 (these become generic: "still doing X")

- [ ] **Step 5: Move pathfinding stays in tick.ts**

The move pathfinding logic (lines 455-512) stays in tick.ts — it's engine-level routing, not action logic. But update to reference:
- `actionRegistry.get("move")` to verify move definition exists (or allow any `move` type)
- Memory writing for move initiation → deferred to the definition's execute()

Actually, the move pathfinding runs BEFORE execute (it happens in the decision phase). The action definition's `execute()` is only called during the execution phase. So the flow is:

1. LLM decides `move(targetNodeId="X")`
2. tick.ts computes BFS path
3. If path found → set up OngoingAction with path, take first step, set action to `wait` (like current behavior)
4. If path not found → fallback to `wait`
5. The `arrivalAction` triggers execute of `move.execute()` at destination

This means `move.execute()` is only called for single-step moves (adjacent nodes) that arrive immediately. For multi-step, the engine handles the traversal and calls `move.execute()` on the final step.

I need to update the move handler to use the definition:
- Line 488-501: When path.length <= 2 (single step, arrived), call `moveAction.execute()` instead of hardcoded logic.

Let me be precise about what changes:

Lines 455-512 — the entire move handling block stays structurally the same but:
1. `pushMoveInitMemory` → replace with definition's execute() call (to get the initiation memory)
2. Arrival action → call definition's onComplete() or execute() as appropriate

- [ ] **Step 6: Verify compilation**

```bash
npx tsc --noEmit --pretty 2>&1 | head -30
```

- [ ] **Step 7: Commit**

```bash
git add src/engine/tick.ts
git commit -m "refactor: integrate action registry into tick, use definition hooks for ongoing"
```

---

### Task 9: Update actions.ts to delegate to registry

**Files:**
- Modify: `src/engine/actions.ts` — replace body, keep `ActionOption` type (or re-export from action-system)

- [ ] **Step 1: Rewrite actions.ts as thin wrapper**

```typescript
/**
 * Action option generation — delegating to ActionRegistry.
 *
 * Kept as a file for backward-compatible import paths.
 * The actual logic lives in ActionRegistry.buildOptions().
 */
import type { ActionContext, ActionOption } from "@/domain/action-system";
import { actionRegistry } from "@/domain/action-system";

export type { ActionOption };

export { buildActionContext } from "./action-context"; // extracted for reuse
export { actionRegistry };

/** @deprecated Use actionRegistry.buildOptions(ctx) directly. */
export function getAvailableActions(ctx: ActionContext): ActionOption[] {
  return actionRegistry.buildOptions(ctx);
}
```

Wait — `buildActionContext` is already in this file. Let me keep it here or move it. Actually for simplicity, keep `buildActionContext` in actions.ts since tick.ts imports it. But we also need to update `getAvailableActions` to use the registry.

- [ ] **Step 1: Update actions.ts**

```typescript
// REPLACE the body of getAvailableActions() (lines 70-328) with:
export function getAvailableActions(
  ctx: ActionContext,
  _hints?: AvailableActionsHints,
): ActionOption[] {
  return actionRegistry.buildOptions(ctx);
}
```

Keep: `buildActionContext()`, `ActionOption`, `ActionContext`, `AvailableActionsHints` interfaces.

Remove: the 260+ lines of per-action option generation logic (lines 85-327), the vitals thresholds, the companion iteration, the relation checking — all of that is now in each ActionDefinition's `check()` and `hint()` methods.

Actually wait — `ActionContext` and `ActionOption` interfaces are being duplicated. Let me re-export them from action-system.ts and remove from actions.ts to avoid divergence:

```typescript
// actions.ts
import { actionRegistry, type ActionContext, type ActionOption } from "@/domain/action-system";

export type { ActionOption };
export type { ActionContext } from "@/domain/action-system";

export function buildActionContext(...) { /* keep existing implementation */ }

export interface AvailableActionsHints {
  facts?: AggregatedFacts;
  isSleepHour?: boolean;
}

export function getAvailableActions(
  ctx: import("@/domain/action-system").ActionContext,
  _hints?: AvailableActionsHints,
): ActionOption[] {
  return actionRegistry.buildOptions(ctx);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/actions.ts
git commit -m "refactor: delegate getAvailableActions to ActionRegistry"
```

---

### Task 10: Update LLM decide.ts — use dynamic schemas

**Files:**
- Modify: `src/llm/decide.ts` — replace static schema imports with builder calls

- [ ] **Step 1: Update decide.ts imports and tool construction**

```typescript
// OLD imports (line 11-17):
import {
  ACTION_TOOL_NAME,
  ActionSchema,
  ActionToolInputSchema,
  ...
} from "@/domain/schemas";

// NEW imports:
import { actionRegistry } from "@/domain/action-system";
import {
  ACTION_TOOL_NAME,
  buildActionSchema,
  buildActionToolSchema,
  buildSalvageActionSchema,
  buildSalvageToolSchema,
  ...
} from "@/domain/schemas";
```

In `callLLM()` (line 81-88), build the tool dynamically:

```typescript
// OLD:
const tool: ChatCompletionTool = {
  type: "function",
  function: {
    name: ACTION_TOOL_NAME,
    description: "...",
    parameters: ActionToolInputSchema,
  },
};

// NEW:
const actionTypes = Array.from(actionRegistry.types());
const tool: ChatCompletionTool = {
  type: "function",
  function: {
    name: ACTION_TOOL_NAME,
    description: "...",
    parameters: buildActionToolSchema(actionTypes),
  },
};
```

In the validation section (line 136):
```typescript
// OLD:
const result = ActionSchema.safeParse(parsedArgs);

// NEW:
const result = buildActionSchema(actionTypes).safeParse(parsedArgs);
```

In `llmSalvageDecide()` (line 468-474):
```typescript
// OLD:
parameters: SalvageToolSchema,

// NEW:
parameters: buildSalvageToolSchema(actionTypes),
```

And validation (line 499):
```typescript
// OLD:
const result = SalvageActionSchema.safeParse(parsed);

// NEW:
const { schema: salvageSchema } = buildSalvageActionSchema(actionTypes);
const result = salvageSchema.safeParse(parsed);
```

- [ ] **Step 2: Commit**

```bash
git add src/llm/decide.ts
git commit -m "refactor: use dynamic action schemas from registry in LLM decide"
```

---

### Task 11: Update config layer — Manifest supports `actions` field, loader loads mod actions

**Files:**
- Modify: `src/config/types.ts` — add `actions?: string` to `Manifest`
- Modify: `src/config/schemas.ts` — add `actions` to `ManifestSchema`
- Modify: `src/config/loader.ts` — add `loadModActions(packId)`

- [ ] **Step 1: Add `actions` to Manifest type**

```typescript
// types.ts line 27-34:
export interface Manifest {
  id: string;
  name: string;
  description?: string;
  language: Language;
  startDate?: string;
  actions?: string;  // NEW: path to actions.js file, relative to map pack dir
}
```

- [ ] **Step 2: Add `actions` to ManifestSchema**

```typescript
// schemas.ts line 32-43:
export const ManifestSchema: z.ZodType<Manifest> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  language: z.enum(["zh", "en", "ja"]),
  startDate: z.string().refine(...).optional(),
  actions: z.string().optional(),  // NEW
});
```

- [ ] **Step 3: Add `loadModActions()` to loader.ts**

```typescript
import type { ActionDefinition } from "@/domain/action-system";

export function loadModActions(packId: string): ActionDefinition[] {
  const manifest = loadManifest(packId);
  if (!manifest.actions) return [];
  
  const actionsPath = path.join(mapsRoot(), packId, manifest.actions);
  if (!existsSync(actionsPath)) {
    console.warn(`Mod actions file not found: ${actionsPath}`);
    return [];
  }
  
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(actionsPath);
  const defs: ActionDefinition[] = Array.isArray(mod) ? mod : (mod.default ?? []);
  return defs;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/config/types.ts src/config/schemas.ts src/config/loader.ts
git commit -m "feat: add actions field to manifest, loadModActions for mod injection"
```

---

### Task 12: Update tests

**Files:**
- Modify: `src/engine/tick.test.ts` — update references to old action types

- [ ] **Step 1: Update tick.test.ts**

The test file uses `forceWait` mode which generates "wait" actions. The test also references old action types like "observe" and "nap". Since `wait` is not in the built-in 8 types but "wait" is still used internally as a fallback/placeholder:

Decisions to make:
- `wait` is a **placeholder** action used by the engine (ongoing action auto-wait, dialog placeholder, LLM failure fallback). It's not a user-choosable action and shouldn't be in the registry.
- The `Action.type` field is now `string`, so `"wait"` is valid even without a registry entry.

For tests:
- Replace `"observe"` references (now `"think"`)
- Remove `"nap"` references
- Ensure `forceWait` mode produces `type: "wait"` which is handled as "no definition → engine native fallback"

Force-wait mode creates actions directly (line 103-109):
```typescript
function fallbackWait(c: Character): Action {
  return {
    type: "wait",
    actorId: c.id,
    reasoning: "（fallback）暂时没有想做的事。",
    selfImportance: 1,
  };
}
```

This is fine — `wait` is not in the registry but `execute.ts` handles unknown types gracefully.

But the test at line ~104 (test-world map creation) references action types in object literals. Need to check what the test actually does with actions — read the test file for specifics. Since the test uses `forceWait: true`, all actions are `wait`. The test primarily checks vitals decay and event generation.

Let me read the relevant test sections and produce exact diff.

Key test changes needed:
1. Any mock action objects with old `ActionType` values → use new string values
2. Any references to `"nap"`, `"observe"` → `"sleep"`, `"think"`

Since the test uses `forceWait: true`, the action types mostly don't matter. But there may be test factories that create Actions with old types.

- [ ] **Step 1: Update test to use new action types**

Read the test file (already done). The main changes:
- Update any `type: "observe"` → `type: "think"` in test setup
- Update test helper actions to use valid built-in types
- If the test imports `ActionType` from enums, remove that import

Run specific checks:
```bash
grep -n 'observe\|nap\|"read"\|"study"\|"write"\|"exercise"\|"meditate"' src/engine/tick.test.ts
```

If no matches, no changes needed for action types.

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/engine/tick.test.ts 2>&1
```

Expected: tests pass. If failures, fix each to use new action type strings.

- [ ] **Step 3: Commit**

```bash
git add src/engine/tick.test.ts
git commit -m "test: update action types in tick test for new registry system"
```

---

### Task 13: Wire up initialization — register builtins at world load

**Files:**
- Modify: `src/engine/store.ts` (or create a dedicated init module)

- [ ] **Step 1: Create initialization module**

Create a simple init function that ensures builtins are registered. This can be a lazy-init in the registry itself or a separate `initActions()` function called from `loadWorld()` / `tick()`.

Simplest approach — add to the top of `tick()`:

```typescript
// In tick.ts, after imports:
let _actionsInitialized = false;

function ensureActionsInitialized(): void {
  if (_actionsInitialized) return;
  _actionsInitialized = true;
  actionRegistry.registerAll(BUILTIN_ACTIONS);
}
```

Call `ensureActionsInitialized()` at the start of `tick()`.

- [ ] **Step 2: Commit**

```bash
git add src/engine/tick.ts
git commit -m "feat: auto-register built-in actions on first tick"
```

---

### Task 14: End-to-end verification

- [ ] **Step 1: Full type check**

```bash
npx tsc --noEmit --pretty 2>&1
```

Expected: Zero errors.

- [ ] **Step 2: Run all tests**

```bash
npx vitest run 2>&1
```

Expected: All tests pass.

- [ ] **Step 3: Manual smoke test**

Start the dev server and run a world tick:
```bash
# Ensure the world still loads and ticks without errors
```

- [ ] **Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: finalize action system redesign integration"
```
