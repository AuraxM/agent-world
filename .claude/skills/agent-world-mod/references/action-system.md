# Action System API Reference

Full interface definitions from `src/domain/action-system.ts`. These are the canonical types — the runtime engine expects exactly these shapes.

## ActionDefinition

The core descriptor for each registered action type. This is what you export from `actions.js`.

```typescript
interface ActionDefinition {
  type: string;                    // unique action type key (snake_case for mod actions)
  duration: "instant" | number;   // "instant" = resolves in one tick; number = ticks to complete

  check(ctx: ActionContext): boolean;
  hint(ctx: ActionContext): string | Array<{ hint: string; targetId?: string; targetNodeId?: string }>;
  execute(ctx: ActionContext, input: ActionInput): Outcome;

  // Required for LLM prompt:
  triggerHint: string;             // one sentence: when to use this action ("在……时使用" pattern)
  paramRule: string;               // one sentence: parameter requirements + conditions. Use 必填/可选/无需 tiers

  // Optional:
  onTick?(ctx: ActionContext): Outcome | null;
  onComplete?(ctx: ActionContext): Outcome;
  onInterrupt?(ctx: ActionContext, reason: string): Outcome;
  extraParams?: Record<string, unknown>;
  extraRequired?: string[];
  usableInDialogue?: boolean;
}
```

**`triggerHint`** (required): one sentence telling the LLM **when** to pick this action — the trigger condition, not what it does. Written in natural Chinese but information-dense. Use "在……时使用" sentence pattern. Examples:
- `eat`: "感到饥饿时使用，补充能量维持身体运转。"
- `speak`: "身边有人、想发起对话交流时使用。"
- Custom `brew_tea`: "想放松或招待客人时沏茶。"

**`paramRule`** (required): one sentence describing parameter requirements and usage conditions. Use exactly three tiers: `必填` (must provide), `可选` (may provide), `无需额外参数` (no extra params). Include location/time constraints after the parameter listing. Examples:
- `speak`: "必填 target_id（说话对象）+ free_text（说什么）。"
- `eat`: "可选 free_text。需在餐厅/食堂类地点。"
- `sleep`: "无需额外参数。仅作息窗口内可用，需在住处。"

These two fields appear in the user prompt as paired blocks — hint block first ("你此刻能做的事"), rule block second ("调用规则") — with the same action name in bold (`**action**:`) for LLM association.

### Lifecycle

- **instant action**: `check()` → `execute()` → done
- **ongoing action** (duration > 0):
  1. `check()` → `execute()` returns `Outcome` with `stateChanges: [{ kind: "setOngoingAction", action: {...} }]`
  2. Each subsequent tick: `onTick?()` is called. Return `null` if nothing happens this tick; return an `Outcome` if something meaningful occurs mid-action.
  3. On the final tick: `onComplete?()` is called.
  4. At any point: if an event with `intensity >= 4` occurs in perception range, `onInterrupt?()` is called and the ongoing action is cleared.

## ActionContext

The world snapshot passed to all action callbacks.

```typescript
interface ActionContext {
  worldId: string;           // current world ID
  tick: number;              // current game tick
  self: Character;           // the acting character
  here: MapNode;             // current location node
  companions: Character[];   // other characters at the same node
  reachable: MapNode[];      // all map nodes (for move actions)
  isSleepHour: boolean;      // whether current tick falls in character's sleep window
  facts: AggregatedFacts;    // behavioral continuity context
}
```

### Character (ctx.self) — relevant fields

```
.id, .name, .origin, .profession, .gender, .age, .personality (ei/sn/tf/jp),
.vitals { hunger, fatigue, hygiene } (all integers, typically 0–20),
.emotion { mood, stress } (integers),
.locationId, .restNodeId, .activityNodeId,
.relations[{ targetId, kinds[], affection, since, lastInteractionTick }],
.shortMemory[{ content, tick, importance }],
.ongoingAction { type, startedAt, endsAt, targetId, targetNodeId, freeText } | null
```

### MapNode (ctx.here) — relevant fields

```
.id, .name, .description, .parentId, .childrenIds[],
.tags[] (e.g. "dining", "bathing", "residence", "indoor", "outdoor", "entry"),
.privacy ("public" | "private" | "restricted"),
.travelCost (integer, 0 = free movement)
```

### AggregatedFacts (ctx.facts)

```
.hoursAtNode          — how many hours (real time) the character has been at current node
.lastActionType       — the previous tick's action type
.lastRestTick         — tick of last rest action
.lastEatTick          — tick of last eat action
.todayActionCounts    — Map<string, number> of action type → count today
.activityNodeId       — character's configured activity node (workplace)
.restNodeId           — character's configured rest node (home)
.hasEatenAtHere       — whether character has eaten at current node today
```

## ActionInput

The parsed LLM tool-call parameters.

```typescript
interface ActionInput {
  target_id?: string;          // target character ID
  target_node_id?: string;     // target map node ID
  free_text?: string;          // free-form text from LLM
  reason?: string;             // reason for the action (used by move)
  arrival_action?: {           // what to do upon arrival (used by move)
    action_type: string;
    free_text?: string;
    target_id?: string;
    target_node_id?: string;
  };
  [key: string]: unknown;      // extensible
}
```

## Outcome

Returned by `execute()`, `onTick()`, `onComplete()`, and `onInterrupt()`.

```typescript
interface Outcome {
  memory: string;              // stored in character's shortMemory (required)
  event?: {                    // optional world event
    category: EventCategory;   // "action" | "social" | "inner" | "time" | "env" | "burst" | "quest" | "system"
    description: string;
    intensity?: 1 | 2 | 3 | 4 | 5;   // 1=subtle, 5=world-shaking
    scope?: EventScope;        // "private" | "node" | "parent" | "children" | "global"
  };
  stateChanges?: StateChange[];  // declarative side effects
  dialogRequest?: {              // triggers dialog protocol
    targetId: string;
    openingLine: string;
  };
}
```

## StateChange

Seven kinds of declarative side effects. The engine applies these after execution — you never mutate `ctx.self` directly.

```typescript
type StateChange =
  | { kind: "resetVital"; vital: "hunger" | "fatigue" | "hygiene" }
  | { kind: "adjustVital"; vital: "hunger" | "fatigue" | "hygiene"; delta: number }
  | { kind: "setLocation"; nodeId: string }
  | { kind: "adjustMood"; delta: number }
  | { kind: "adjustStress"; delta: number }
  | { kind: "setOngoingAction"; action: OngoingAction }
  | { kind: "clearOngoingAction" };
```

### Usage notes

- `resetVital` sets the vital to 0 (fresh). Use for eating (resets hunger), bathing (resets hygiene), sleeping (resets fatigue).
- `adjustVital` changes the vital by `delta` (can be negative to reduce, positive to increase fatigue/hunger/hygiene).
- `setLocation` teleports the character to a new node. The engine handles pathfinding for `move` actions separately; use this only for instant teleport effects.
- `adjustMood` / `adjustStress` change emotion values. Positive delta on mood = happier; positive delta on stress = more stressed.
- `setOngoingAction` marks the character as busy for N ticks. Must include the full `OngoingAction` object: `{ type, startedAt, endsAt, targetId?, targetNodeId?, freeText? }`.
- `clearOngoingAction` removes the ongoing action marker. Called automatically on completion; use manually only for early termination.

## EventCategory (valid values)

```
"action"   — physical/visible actions (eating, bathing, moving)
"social"   — interpersonal interactions (speaking, arguing, greeting)
"inner"    — internal states (thinking, feeling, realizing)
"time"     — time-related events (sleep, wake, dawn, dusk)
"env"      — environmental events (weather, ambient sounds)
"burst"    — sudden high-intensity events (screaming, crashing)
"quest"    — quest/progress events
"system"   — engine-level events (character injection, world init)
```

## EventScope (valid values)

```
"private"   — only the acting character perceives this
"node"      — characters at the same node perceive this
"parent"    — characters at the parent node perceive this
"children"  — characters at child nodes perceive this
"global"    — all characters perceive this
```
