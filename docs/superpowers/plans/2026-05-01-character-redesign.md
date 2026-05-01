# Character System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 8-dim personality, single-dim relations, 2-vital status, 15-action, and single-move-per-tick systems with MBTI 4-dim personality, objective+affection relations, 3-vital+emotion state, 23-action (default vs interactive split), and free-move mechanics per the 2026-05-01 spec.

**Architecture:** Bottom-up refactor starting from domain types/enums/schemas, propagating outward through config, DB, engine, LLM, scripts, and tests. Each layer fully compiles and tests pass before moving to the next. Old config files deleted last.

**Tech Stack:** TypeScript + Zod + Drizzle ORM (SQLite/better-sqlite3) + OpenAI SDK + Vitest

---

## File Structure Map

| File | Responsibility |
|---|---|
| `src/domain/enums.ts` | All closed vocabularies (ActionType, NodeTag, ObjectiveRelationKind, etc.) |
| `src/domain/types.ts` | All domain interfaces (Character, Personality, Relation, Vitals, Emotion, etc.) |
| `src/domain/schemas.ts` | Zod schemas for runtime validation |
| `src/config/types.ts` | Config-layer types (MapNodeConfig, MapConfig, CharacterTemplate) |
| `src/config/schemas.ts` | Config-layer Zod schemas + superRefine |
| `src/config/loader.ts` | File I/O for configs/ directory |
| `src/db/schema.ts` | Drizzle ORM table definitions |
| `src/db/migrate.ts` | Raw SQL CREATE TABLE migration |
| `src/engine/status-decay.ts` | → becomes `src/engine/vitals-emotion.ts` (vitals decay + emotion evolution + inner events) |
| `src/engine/tick.ts` | Main loop: ongoing action check, free move, emotion evolution, relation auto-management |
| `src/engine/actions.ts` | Action context building + available actions generation |
| `src/engine/execute.ts` | Action execution, relation auto-update, ongoing action management |
| `src/engine/facts.ts` | AggregatedFacts derivation from thought history |
| `src/engine/perception.ts` | Event perception dispatch (minor changes) |
| `src/engine/createWorld.ts` | World creation from configs (vitals → vitals+emotion) |
| `src/engine/store.ts` | DB ↔ domain object mapping |
| `src/llm/prompt.ts` | System + user prompt construction |
| `src/llm/decide.ts` | LLM function calling with submit_action tool |
| `scripts/seed.ts` | World seeding script |
| `configs/` | Character + map JSON files (deleted, then regenerated) |
| `.claude/skills/agent-world-config/` | Skill definition + references (updated for new schema) |

---

### Task 1: Domain Enums — New Vocabularies

**Files:**
- Modify: `src/domain/enums.ts` (full rewrite)

**What changes:**
- Replace `ACTION_TYPES` with 23 types (add: sleep, bathe, exercise, meditate, write, groom, pace, update_relation)
- Replace `NODE_TAGS` with 13 tags (add: bathing, quiet)
- Remove `STATUS_KINDS`, `StatusLevel`, `RELATION_KINDS`, `RelationKind`
- Add `OBJECTIVE_RELATION_KINDS` (23 kinds: 9 blood + 13 social + 1 encounter)
- Add `BLOOD_RELATION_KINDS` (Set of 9 blood relation kinds)
- Keep `EVENT_CATEGORIES`, `EVENT_SCOPES`, `EVENT_SOURCES`, `Privacy`

- [ ] **Step 1: Rewrite enums.ts**

```typescript
/**
 * 封闭枚举：所有可被 LLM 选用的行动类型。
 * 23 种，分为默认（只动自己）和交互（动他人/物体/关系）两类。
 */
export const ACTION_TYPES = [
  // 默认（只动自己）—— 15 种
  "move", "wait", "observe", "rest", "eat", "read", "work", "use_ability",
  "sleep", "bathe", "exercise", "meditate", "write", "groom", "pace",
  // 交互（动他人/物体/关系）—— 8 种
  "speak", "interact_object", "interact_person",
  "attack", "flee", "help", "gift",
  "update_relation",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/** 节点标签：用于地图节点的语义分类（影响可执行行动）。 */
export const NODE_TAGS = [
  "public", "semi", "private",
  "indoor", "outdoor",
  "dining", "education", "residence", "park", "street", "playground",
  "bathing", "quiet",
] as const;
export type NodeTag = (typeof NODE_TAGS)[number];

/** 节点隐私级别。 */
export type Privacy = "public" | "semi" | "private";

/** 客观关系类型。 */
export const OBJECTIVE_RELATION_KINDS = [
  // 血缘 9（不可被引擎或 LLM 删除）
  "father", "mother", "son", "daughter",
  "older_brother", "younger_brother", "older_sister", "younger_sister",
  "other_relative",
  // 社会 13
  "classmate", "teacher", "student",
  "colleague", "boss", "subordinate",
  "neighbor", "landlord", "tenant",
  "spouse", "partner", "ex_partner",
  "friend",
  // 偶遇 1（引擎自动管理）
  "acquaintance",
] as const;
export type ObjectiveRelationKind = (typeof OBJECTIVE_RELATION_KINDS)[number];

export const BLOOD_RELATION_KINDS: ReadonlySet<ObjectiveRelationKind> = new Set([
  "father", "mother", "son", "daughter",
  "older_brother", "younger_brother", "older_sister", "younger_sister",
  "other_relative",
]);

/** 事件类别。 */
export const EVENT_CATEGORIES = [
  "time", "env", "social", "burst", "quest", "inner", "system", "action",
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/** 事件可见范围。 */
export const EVENT_SCOPES = [
  "private", "node", "parent", "children", "global",
] as const;
export type EventScope = (typeof EVENT_SCOPES)[number];

/** 事件来源。 */
export const EVENT_SOURCES = ["system", "actor", "player", "inner"] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors in enums.ts (other files will have errors — that's expected for now).

- [ ] **Step 3: Commit**

```bash
git add src/domain/enums.ts
git commit -m "feat: replace enums with MBTI-aligned vocabularies (23 actions, 13 node tags, 23 relation kinds)"
```

---

### Task 2: Domain Types — New Interfaces

**Files:**
- Modify: `src/domain/types.ts` (full rewrite)

**What changes:**
- `Personality`: 8 dims [-100,100] → 4 dims ei/sn/tf/jp [-4,4]
- Remove `Status`, `StatusKind`, `StatusLevel`
- `Relation`: kind + affinity → kinds[] + affection + since + lastInteractionTick
- `OngoingAction`: add interruptThreshold
- `MapNode`: add travelCost?
- `Vitals`: add hygiene (0..16)
- Add `Emotion`: mood, stress, social_satiety
- `Character`: replace statuses with emotion, update relations type
- `Action`: add change_type? for update_relation

- [ ] **Step 1: Rewrite types.ts**

```typescript
import type {
  ActionType,
  EventCategory,
  EventScope,
  EventSource,
  NodeTag,
  ObjectiveRelationKind,
  Privacy,
} from "./enums";

/** 1 tick = 1 game hour. */
export type Tick = number;

/** MBTI 4 维性格，范围 [-4, 4]。 */
export interface Personality {
  ei: number;  // -4 极内向 ←→ +4 极外向
  sn: number;  // -4 极直觉 ←→ +4 极实感
  tf: number;  // -4 极情感 ←→ +4 极思考
  jp: number;  // -4 极感知 ←→ +4 极判断
}

/** 能力。Stage 1 暂不深入用。 */
export interface Ability {
  kind: string;
  tier: number;
  exp: number;
}

/** 单条记忆。 */
export interface Memory {
  id: string;
  tick: Tick;
  importance: number;
  content: string;
  refEventId?: string;
}

/** 单向关系：A 对 B 的认知。仅在 kinds 非空时存在。 */
export interface Relation {
  kinds: ObjectiveRelationKind[];
  /** -4 极厌恶 → +4 极喜爱 */
  affection: number;
  note?: string;
  since: Tick;
  lastInteractionTick: Tick;
}

/** 持续行动（真实驱动行为）。 */
export interface OngoingAction {
  type: ActionType;
  startedAt: Tick;
  endsAt: Tick;
  description: string;
  /** 感知到 intensity ≥ 此值的事件即提前唤醒/中止 */
  interruptThreshold: 1 | 2 | 3 | 4 | 5;
}

/** 地图节点。 */
export interface MapNode {
  id: string;
  worldId: string;
  parentId: string | null;
  name: string;
  description: string;
  tags: NodeTag[];
  capacity: number | null;
  privacy: Privacy;
  visibleFromParent: boolean;
  shortcuts: string[];
  isEntry: boolean;
  /** 进入此节点所需 tick 数。默认 0（免费）；shortcuts 始终 cost=0。 */
  travelCost?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  spriteKey?: string;
}

/** 生理指标。0..16 范围。 */
export interface Vitals {
  hunger: number;
  fatigue: number;
  hygiene: number;
}

/** 情绪状态。 */
export interface Emotion {
  /** -4..+4 */
  mood: number;
  /** 0..4 */
  stress: number;
  /** -4..+4 */
  social_satiety: number;
}

/** 角色。 */
export interface Character {
  id: string;
  worldId: string;
  name: string;
  avatar?: string;
  locationId: string;
  personality: Personality;
  vitals: Vitals;
  emotion: Emotion;
  abilities: Ability[];
  shortMemory: Memory[];
  longMemory: Memory[];
  /** key 是 targetId */
  relations: Record<string, Relation>;
  currentAction?: OngoingAction;
  lastThought?: AgentThought;
  homeNodeId?: string | null;
}

/** 角色在某 tick 完成的一次决策快照。 */
export interface AgentThought {
  worldId: string;
  characterId: string;
  tick: Tick;
  action: Action;
  success: boolean;
  createdAt: number;
}

/** 世界事件。 */
export interface WorldEvent {
  id: string;
  worldId: string;
  tick: Tick;
  category: EventCategory;
  description: string;
  participants: string[];
  source: EventSource;
  intensity: 1 | 2 | 3 | 4 | 5;
  scope: EventScope;
  nodeId?: string;
  audienceCharacterId?: string;
  duration: number;
  suggestedActions?: string[];
}

/** 行动（LLM 输出 + 引擎执行体）。 */
export interface Action {
  type: ActionType;
  actorId: string;
  targetId?: string;
  targetNodeId?: string;
  freeText?: string;
  reasoning: string;
  emotionTag?: string;
  selfImportance: 1 | 2 | 3 | 4 | 5;
  /** update_relation 专用 */
  changeType?: "become_partner" | "end_partnership" | "become_spouse" | "end_friendship" | "end_other_relative";
}

/** 世界全量快照。 */
export interface WorldSnapshot {
  worldId: string;
  tick: Tick;
  nodes: MapNode[];
  characters: Character[];
  recentEvents: WorldEvent[];
}

/** 世界元信息。 */
export interface World {
  id: string;
  name: string;
  currentTick: Tick;
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 2: Verify TypeScript compiles for domain layer only**

```bash
npx tsc --noEmit src/domain/types.ts src/domain/enums.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/domain/types.ts
git commit -m "feat: replace domain types with MBTI personality, objective+affection relations, emotion system"
```

---

### Task 3: Domain Schemas — Updated Validation

**Files:**
- Modify: `src/domain/schemas.ts` (full rewrite)

**What changes:**
- `PersonalitySchema`: 4 dims ei/sn/tf/jp each [-4,4]
- Remove `StatusSchema`
- `RelationSchema`: kinds[] + affection + note + since + lastInteractionTick
- `MapNodeSchema`: add travelCost
- `ActionSchema`: add change_type enum
- `ActionToolInputSchema`: update reasoning description (MBTI text, not numeric), update action_type enum, add change_type

- [ ] **Step 1: Rewrite schemas.ts**

```typescript
import { z } from "zod";
import {
  ACTION_TYPES,
  EVENT_CATEGORIES,
  EVENT_SCOPES,
  EVENT_SOURCES,
  NODE_TAGS,
  OBJECTIVE_RELATION_KINDS,
} from "./enums";

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
  change_type: z.enum([
    "become_partner", "end_partnership", "become_spouse",
    "end_friendship", "end_other_relative",
  ]).optional(),
});
export type ActionPayload = z.infer<typeof ActionSchema>;

export const ACTION_TOOL_NAME = "submit_action";
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
      description: "目标节点 id（仅 move/flee 等位移行动需要）。",
    },
    free_text: {
      type: "string",
      description: "自由文本（说话内容、行动具体描述）。speak 必填；其它行动选填。",
    },
    reasoning: {
      type: "string",
      description:
        "内心独白。必须显式引用一项你的性格特征（用文字描述，不要写数值）。",
    },
    emotion_tag: {
      type: "string",
      description: "短情绪标签，例如 nervous / curious / annoyed。",
    },
    self_importance: {
      type: "integer",
      enum: [1, 2, 3, 4, 5],
      description: "1-5 自评要不要长期记住。",
    },
    change_type: {
      type: "string",
      enum: ["become_partner", "end_partnership", "become_spouse", "end_friendship", "end_other_relative"],
      description: "仅在 action_type=update_relation 时使用。",
    },
  },
  required: ["action_type", "reasoning", "self_importance"],
  additionalProperties: false,
};

export const PersonalitySchema = z.object({
  ei: z.number().int().min(-4).max(4),
  sn: z.number().int().min(-4).max(4),
  tf: z.number().int().min(-4).max(4),
  jp: z.number().int().min(-4).max(4),
});

export const RelationSchema = z.object({
  kinds: z.array(z.enum(OBJECTIVE_RELATION_KINDS)).min(1),
  affection: z.number().int().min(-4).max(4),
  note: z.string().optional(),
  since: z.number().int().nonnegative(),
  lastInteractionTick: z.number().int().nonnegative(),
});

export const MapNodeSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.enum(NODE_TAGS)),
  capacity: z.number().int().positive().nullable(),
  privacy: z.enum(["public", "semi", "private"]),
  visibleFromParent: z.boolean(),
  shortcuts: z.array(z.string()),
  isEntry: z.boolean(),
  travelCost: z.number().int().min(0).optional(),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  w: z.number().int().positive().optional(),
  h: z.number().int().positive().optional(),
  spriteKey: z.string().optional(),
});

export const ExecutedActionSchema = z.object({
  type: z.enum(ACTION_TYPES),
  actorId: z.string(),
  targetId: z.string().optional(),
  targetNodeId: z.string().optional(),
  freeText: z.string().optional(),
  reasoning: z.string().min(1).max(800),
  emotionTag: z.string().max(40).optional(),
  selfImportance: z.union([
    z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5),
  ]),
  changeType: z.enum([
    "become_partner", "end_partnership", "become_spouse",
    "end_friendship", "end_other_relative",
  ]).optional(),
});

export const AgentThoughtSchema = z.object({
  worldId: z.string(),
  characterId: z.string(),
  tick: z.number().int().nonnegative(),
  action: ExecutedActionSchema,
  success: z.boolean(),
  createdAt: z.number().int().nonnegative(),
});

export const WorldEventSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  tick: z.number().int().nonnegative(),
  category: z.enum(EVENT_CATEGORIES),
  description: z.string(),
  participants: z.array(z.string()),
  source: z.enum(EVENT_SOURCES),
  intensity: z.union([
    z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5),
  ]),
  scope: z.enum(EVENT_SCOPES),
  nodeId: z.string().optional(),
  audienceCharacterId: z.string().optional(),
  duration: z.number().int().nonnegative(),
  suggestedActions: z.array(z.string()).optional(),
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/domain/schemas.ts
git commit -m "feat: update Zod schemas for MBTI personality, new relations, emotion, 23 actions"
```

---

### Task 4: Config Types & Schemas

**Files:**
- Modify: `src/config/types.ts`
- Modify: `src/config/schemas.ts`

**What changes in types.ts:**
- `MapNodeConfig`: add travelCost?
- `CharacterTemplate`: Omit updated Character fields (vitals→vitals+emotion, statuses removed, personality shape changed)

**What changes in schemas.ts:**
- `MapNodeConfigSchema`: add travelCost
- `CharacterTemplateSchema`: new personality shape, replace statuses with emotion (or remove both since templates are location-agnostic), update relations
- Remove STATUS_KINDS/RELATION_KINDS void references

- [ ] **Step 1: Update config/types.ts**

```typescript
import type { MapNode, Character } from "@/domain/types";

export type MapNodeConfig = Omit<MapNode, "worldId">;

export interface MapConfig {
  id: string;
  name: string;
  description?: string;
  nodes: MapNodeConfig[];
}

export type CharacterTemplate = Omit<
  Character,
  | "worldId"
  | "locationId"
  | "vitals"
  | "emotion"
  | "shortMemory"
  | "longMemory"
  | "currentAction"
  | "lastThought"
>;
```

- [ ] **Step 2: Update config/schemas.ts**

```typescript
import { z } from "zod";
import { NODE_TAGS, OBJECTIVE_RELATION_KINDS } from "@/domain/enums";
import { PersonalitySchema, RelationSchema } from "@/domain/schemas";
import type { MapConfig, CharacterTemplate, MapNodeConfig } from "./types";

export const MapNodeConfigSchema: z.ZodType<MapNodeConfig> = z.object({
  id: z.string().min(1),
  parentId: z.string().nullable(),
  name: z.string().min(1),
  description: z.string(),
  tags: z.array(z.enum(NODE_TAGS)),
  capacity: z.number().int().positive().nullable(),
  privacy: z.enum(["public", "semi", "private"]),
  visibleFromParent: z.boolean(),
  shortcuts: z.array(z.string()),
  isEntry: z.boolean(),
  travelCost: z.number().int().min(0).optional(),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  w: z.number().int().positive().optional(),
  h: z.number().int().positive().optional(),
  spriteKey: z.string().optional(),
});

export const MapConfigSchema: z.ZodType<MapConfig> = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    nodes: z.array(MapNodeConfigSchema).min(1),
  })
  .superRefine((cfg, ctx) => {
    const ids = new Set<string>();
    for (const n of cfg.nodes) {
      if (ids.has(n.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate node id: ${n.id}`,
          path: ["nodes"],
        });
      }
      ids.add(n.id);
    }
    for (const n of cfg.nodes) {
      if (n.parentId !== null && !ids.has(n.parentId)) {
        ctx.addIssue({
          code: "custom",
          message: `node ${n.id}.parentId references missing node: ${n.parentId}`,
          path: ["nodes"],
        });
      }
    }
    const roots = cfg.nodes.filter((n) => n.parentId === null);
    if (roots.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "map must have at least one root node (parentId === null)",
        path: ["nodes"],
      });
    }
    const entries = cfg.nodes.filter((n) => n.isEntry);
    if (entries.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "map must declare at least one entry node (isEntry: true)",
        path: ["nodes"],
      });
    }
  });

const AbilitySchema = z.object({
  kind: z.string(),
  tier: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
});

export const CharacterTemplateSchema: z.ZodType<CharacterTemplate> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatar: z.string().optional(),
  homeNodeId: z.string().min(1).nullable().optional(),
  personality: PersonalitySchema,
  abilities: z.array(AbilitySchema),
  relations: z.record(z.string(), RelationSchema),
});

void OBJECTIVE_RELATION_KINDS;
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/config/types.ts src/config/schemas.ts
git commit -m "feat: update config types and schemas for new domain model"
```

---

### Task 5: Config Loader — Update for New Character Template

**Files:**
- Modify: `src/config/loader.ts`

**What changes:**
- Remove `statuses` field handling (no longer exists on template)
- The loader already reads raw JSON and passes through CharacterTemplateSchema - minimal changes needed since the schema handles validation

- [ ] **Step 1: Verify loader still compiles**

The loader reads files and parses JSON, then returns typed results. Since CharacterTemplateSchema changed, verify types align:

```bash
npx tsc --noEmit
```

Fix any type errors. Most likely the loader itself doesn't need code changes since it just reads JSON and validates with Zod.

- [ ] **Step 2: Commit**

```bash
git add src/config/loader.ts
git commit -m "feat: update config loader for new character template shape"
```

---

### Task 6: DB Schema & Migration — Add emotion column

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/migrate.ts`

**What changes:**
- `characters` table: rename `statuses_json` → `emotion_json`, update `vitals_json` default to include hygiene
- Migration: add `emotion_json` column, update vitals_json default (via ALTER or recreate)

Since SQLite doesn't support renaming columns easily, the approach is:
- Add new `emotion_json` column
- Keep old `statuses_json` column (will be ignored by code)
- This avoids data migration complexity for Stage 1

- [ ] **Step 1: Update drizzle schema.ts — characters table**

```typescript
// In the characters table definition, change:
vitalsJson: text("vitals_json")
  .notNull()
  .default('{"hunger":0,"fatigue":0,"hygiene":0}'),
// Add after statuses_json:
emotionJson: text("emotion_json")
  .notNull()
  .default('{"mood":0,"stress":0,"social_satiety":0}'),
```

- [ ] **Step 2: Add migration DDL in migrate.ts**

Add to `STATEMENTS` array (CREATE TABLE already gets the new defaults; for existing DBs add):

```typescript
// In NODES_NEW_COLUMNS style, add characters new columns:
const CHARS_NEW_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: "emotion_json", ddl: "ALTER TABLE characters ADD COLUMN emotion_json TEXT NOT NULL DEFAULT '{\"mood\":0,\"stress\":0,\"social_satiety\":0}'" },
];
```

And add the PRAGMA-check loop for characters table similar to nodes.

- [ ] **Step 3: Update store.ts for new columns**

In `loadWorld()`:
```typescript
// Change:
vitals: JSON.parse(c.vitalsJson),
statuses: JSON.parse(c.statusesJson),
// To:
vitals: JSON.parse(c.vitalsJson),
emotion: JSON.parse(c.emotionJson),
```

In `saveWorld()`:
```typescript
// Change:
statusesJson: JSON.stringify(c.statuses),
// To:
emotionJson: JSON.stringify(c.emotion),
```

- [ ] **Step 4: Update createWorld.ts for new defaults**

```typescript
// In createWorldFromConfig, change vitals default:
const vitals: Vitals = {
  hunger: m.vitals?.hunger ?? 0,
  fatigue: m.vitals?.fatigue ?? 0,
  hygiene: m.vitals?.hygiene ?? 0,
};
// Add emotion default:
const emotion = { mood: 0, stress: 0, social_satiety: 0 };
// In the insert:
emotionJson: JSON.stringify(emotion),
```

Also update the `CastMember` type:
```typescript
export interface CastMember {
  characterId: string;
  locationId?: string;
  vitals?: Partial<Vitals>;  // now includes hygiene
  emotion?: Partial<Emotion>;
}
```

- [ ] **Step 5: Verify compilation and run db:migrate**

```bash
npx tsc --noEmit
npm run db:reset
```

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/migrate.ts src/engine/store.ts src/engine/createWorld.ts
git commit -m "feat: add emotion_json column, update vitals default to include hygiene"
```

---

### Task 7: Vitals + Emotion Engine (Replace status-decay.ts)

**Files:**
- Create: `src/engine/vitals-emotion.ts` (replaces status-decay.ts)
- Delete: `src/engine/status-decay.ts` (after new file is complete)

**What it does:**
- Per-tick vitals decay (hunger +1, fatigue +1, hygiene every even tick +1)
- Per-tick emotion evolution (mood→0 on even ticks, stress -1 every 24 ticks, social_satiety drift)
- Cross-threshold inner events (new thresholds per spec §三)
- Event-driven emotion changes (exposed as a function called from execute.ts)

- [ ] **Step 1: Write vitals-emotion.ts**

```typescript
/**
 * 生理 + 情绪引擎：每 tick 衰减 + 越线 inner 事件 + 事件驱动情绪。
 *
 * 规则（per spec §三）：
 * - hunger: +1/tick (0..16)
 * - fatigue: +1/tick (0..16)
 * - hygiene: +1 per even tick (0..16)
 * - mood: even tick → 朝 0 走 1（自然回归）
 * - stress: 每 24 tick 末 -1 (封底 0)
 * - social_satiety: even tick → 同节点有伴 +1 (封顶 +4)，独处 -1 (封底 -4)
 *
 * 越线提醒（节流）：
 * - hunger/fatigue: ≥5 medium(每5tick), ≥10 severe(每3tick)
 * - hygiene: ≥8 medium(每8tick), ≥13 severe(每4tick)
 * - mood ≤ -3: 每6tick
 * - stress ≥ 3: 每6tick
 * - social_satiety ≤ -3: 每6tick
 * - social_satiety ≥ +3: 仅首次
 */
import { randomUUID } from "node:crypto";
import type { Character, Emotion, Vitals, WorldEvent } from "@/domain/types";

// ---- threshold constants ----

const VITAL_MAX = 16;
const HUNGER_MEDIUM = 5;
const HUNGER_SEVERE = 10;
const FATIGUE_MEDIUM = 5;
const FATIGUE_SEVERE = 10;
const HYGIENE_MEDIUM = 8;
const HYGIENE_SEVERE = 13;

const REMINDER_HUNGER_FATIGUE_MEDIUM = 5;
const REMINDER_HUNGER_FATIGUE_SEVERE = 3;
const REMINDER_HYGIENE_MEDIUM = 8;
const REMINDER_HYGIENE_SEVERE = 4;
const REMINDER_MOOD = 6;
const REMINDER_STRESS = 6;
const REMINDER_SOCIAL_SATIETY_LOW = 6;

const STRESS_DECAY_INTERVAL = 24;

// ---- helpers ----

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function makeInnerEvent(args: {
  worldId: string; tick: number; charId: string;
  description: string; intensity?: 1 | 2 | 3 | 4 | 5;
}): WorldEvent {
  return {
    id: `evt-${randomUUID().slice(0, 8)}`,
    worldId: args.worldId,
    tick: args.tick,
    category: "inner",
    description: args.description,
    participants: [args.charId],
    source: "inner",
    intensity: args.intensity ?? 2,
    scope: "private",
    audienceCharacterId: args.charId,
    duration: 1,
  };
}

// ---- vitals decay ----

export interface VitalsDecayInput {
  characters: Character[];
  worldId: string;
  tick: number;
}

export function decayVitals(input: VitalsDecayInput): WorldEvent[] {
  const { characters, worldId, tick } = input;
  const inner: WorldEvent[] = [];
  const isEven = tick % 2 === 0;

  for (const c of characters) {
    const prevHunger = c.vitals.hunger;
    const prevFatigue = c.vitals.fatigue;
    const prevHygiene = c.vitals.hygiene;

    // hunger +1
    c.vitals.hunger = Math.min(VITAL_MAX, c.vitals.hunger + 1);
    // fatigue +1
    c.vitals.fatigue = Math.min(VITAL_MAX, c.vitals.fatigue + 1);
    // hygiene +1 on even ticks
    if (isEven) {
      c.vitals.hygiene = Math.min(VITAL_MAX, c.vitals.hygiene + 1);
    }

    // hunger cross-threshold
    checkVitalCrossing({
      inner, worldId, tick, charId: c.id,
      prev: prevHunger, curr: c.vitals.hunger,
      medium: HUNGER_MEDIUM, severe: HUNGER_SEVERE,
      mediumFreq: REMINDER_HUNGER_FATIGUE_MEDIUM,
      severeFreq: REMINDER_HUNGER_FATIGUE_SEVERE,
      kind: "hunger",
      describe: (v, lvl) => {
        if (lvl === "severe") return `极度饥饿（${v} 小时未进食），必须立刻找东西吃。`;
        return `明显感到饿了（${v} 小时未进食）。`;
      },
    });

    // fatigue cross-threshold
    checkVitalCrossing({
      inner, worldId, tick, charId: c.id,
      prev: prevFatigue, curr: c.vitals.fatigue,
      medium: FATIGUE_MEDIUM, severe: FATIGUE_SEVERE,
      mediumFreq: REMINDER_HUNGER_FATIGUE_MEDIUM,
      severeFreq: REMINDER_HUNGER_FATIGUE_SEVERE,
      kind: "fatigue",
      describe: (v, lvl) => {
        if (lvl === "severe") return `极度疲惫（已 ${v} 小时未眠），几乎站着都能睡着。`;
        return `开始感到累（已 ${v} 小时未眠）。`;
      },
    });

    // hygiene cross-threshold
    checkVitalCrossing({
      inner, worldId, tick, charId: c.id,
      prev: prevHygiene, curr: c.vitals.hygiene,
      medium: HYGIENE_MEDIUM, severe: HYGIENE_SEVERE,
      mediumFreq: REMINDER_HYGIENE_MEDIUM,
      severeFreq: REMINDER_HYGIENE_SEVERE,
      kind: "hygiene",
      describe: (v, lvl) => {
        if (lvl === "severe") return `身上已经很脏了（${v} 小时未洗浴），自己都能闻到味道。`;
        return `感觉有点不干净（${v} 小时未洗浴）。`;
      },
    });
  }

  return inner;
}

interface VitalCrossingCheck {
  inner: WorldEvent[];
  worldId: string;
  tick: number;
  charId: string;
  prev: number;
  curr: number;
  medium: number;
  severe: number;
  mediumFreq: number;
  severeFreq: number;
  kind: string;
  describe: (value: number, level: "medium" | "severe") => string;
}

function checkVitalCrossing(args: VitalCrossingCheck) {
  const { inner, worldId, tick, charId, prev, curr, medium, severe, mediumFreq, severeFreq, kind, describe } = args;
  const prevLvl = levelOf(prev, medium, severe);
  const currLvl = levelOf(curr, medium, severe);

  if (currLvl === "severe" && prevLvl !== "severe") {
    inner.push(makeInnerEvent({ worldId, tick, charId, description: describe(curr, "severe"), intensity: 3 }));
  } else if (currLvl === "medium" && prevLvl !== "medium" && prevLvl !== "severe") {
    inner.push(makeInnerEvent({ worldId, tick, charId, description: describe(curr, "medium"), intensity: 2 }));
  } else if (currLvl === "severe" && tick > 0 && tick % severeFreq === 0) {
    inner.push(makeInnerEvent({ worldId, tick, charId, description: describe(curr, "severe"), intensity: 3 }));
  } else if (currLvl === "medium" && tick > 0 && tick % mediumFreq === 0) {
    inner.push(makeInnerEvent({ worldId, tick, charId, description: describe(curr, "medium"), intensity: 2 }));
  }
}

function levelOf(value: number, medium: number, severe: number): "medium" | "severe" | null {
  if (value >= severe) return "severe";
  if (value >= medium) return "medium";
  return null;
}

// ---- emotion evolution ----

export interface EmotionEvolutionInput {
  characters: Character[];
  worldId: string;
  tick: number;
  /** Map of characterId → whether they have companions at same node */
  hasCompanions: Map<string, boolean>;
}

export function evolveEmotions(input: EmotionEvolutionInput): WorldEvent[] {
  const { characters, worldId, tick, hasCompanions } = input;
  const inner: WorldEvent[] = [];
  const isEven = tick % 2 === 0;

  for (const c of characters) {
    // mood: even tick → toward 0 by 1
    if (isEven && c.emotion.mood !== 0) {
      c.emotion.mood += c.emotion.mood > 0 ? -1 : 1;
    }

    // stress: every 24 ticks → -1
    if (tick > 0 && tick % STRESS_DECAY_INTERVAL === 0) {
      c.emotion.stress = Math.max(0, c.emotion.stress - 1);
    }

    // social_satiety: even tick → +1 if companions, -1 if alone
    if (isEven) {
      const hasPeer = hasCompanions.get(c.id) ?? false;
      if (hasPeer) {
        c.emotion.social_satiety = Math.min(4, c.emotion.social_satiety + 1);
      } else {
        c.emotion.social_satiety = Math.max(-4, c.emotion.social_satiety - 1);
      }
    }

    // threshold reminders
    if (c.emotion.mood <= -3 && tick > 0 && tick % REMINDER_MOOD === 0) {
      inner.push(makeInnerEvent({
        worldId, tick, charId: c.id,
        description: "心情低落，情绪需要出口。",
        intensity: 2,
      }));
    }
    if (c.emotion.stress >= 3 && tick > 0 && tick % REMINDER_STRESS === 0) {
      inner.push(makeInnerEvent({
        worldId, tick, charId: c.id,
        description: "压力很大，需要放松。",
        intensity: 2,
      }));
    }
    if (c.emotion.social_satiety <= -3 && tick > 0 && tick % REMINDER_SOCIAL_SATIETY_LOW === 0) {
      inner.push(makeInnerEvent({
        worldId, tick, charId: c.id,
        description: "感到孤独，渴望与人交流。",
        intensity: 2,
      }));
    }
    // social_satiety ≥ +3 first-time only — tracked via a Set outside, simplified here as every crossing
  }

  return inner;
}

// ---- event-driven emotion changes (called from execute.ts) ----

export interface EmotionEvent {
  type: "attacked_self" | "received_help_gift" | "attacked_other" | "helped_gifted" | "negative_burst" | "positive_burst";
}

export function applyEmotionEvent(emotion: Emotion, event: EmotionEvent): void {
  switch (event.type) {
    case "attacked_self":
      emotion.mood = clamp(emotion.mood - 2, -4, 4);
      emotion.stress = clamp(emotion.stress + 2, 0, 4);
      break;
    case "received_help_gift":
      emotion.mood = clamp(emotion.mood + 1, -4, 4);
      emotion.stress = 0;
      break;
    case "attacked_other":
      emotion.mood = 0; // no change per spec
      emotion.stress = clamp(emotion.stress + 1, 0, 4);
      break;
    case "helped_gifted":
      emotion.mood = clamp(emotion.mood + 1, -4, 4);
      emotion.stress = 0; // no change per spec
      break;
    case "negative_burst":
      emotion.mood = clamp(emotion.mood - 1, -4, 4);
      emotion.stress = clamp(emotion.stress + 1, 0, 4);
      break;
    case "positive_burst":
      emotion.mood = clamp(emotion.mood + 1, -4, 4);
      // stress unchanged
      break;
  }
}

// ---- vitals reset helpers ----

export function resetVital(character: Character, kind: "hunger" | "fatigue" | "hygiene"): void {
  character.vitals[kind] = 0;
}

export function reduceVital(character: Character, kind: "hunger" | "fatigue" | "hygiene", amount: number): void {
  character.vitals[kind] = Math.max(0, character.vitals[kind] - amount);
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/engine/vitals-emotion.ts
git commit -m "feat: add vitals+emotion engine replacing status-decay"
```

---

### Task 8: Update Engine Tick Loop

**Files:**
- Modify: `src/engine/tick.ts`

**What changes:**
- Import from vitals-emotion instead of status-decay
- Replace `decayAndDeriveStatuses` with `decayVitals` + `evolveEmotions`
- Add ongoing action check BEFORE LLM decision
- Add free move loop
- Add relation auto-management (acquaintance creation/decay)
- Add emotion event processing from perception

- [ ] **Step 1: Rewrite tick.ts main loop**

The tick function needs significant restructuring. Key additions:

1. **Before decision loop**: For each NPC with `currentAction`:
   - If within duration: check perception for interrupt; if interrupted → partial fatigue recovery + clear; otherwise skip LLM, auto-wait
   - If exactly at endsAt: execute final effect, clear, let LLM decide

2. **Free move loop**: After LLM returns `move` with cost=0:
   - Apply move immediately
   - Re-perceive new location's events
   - Increment freeMovesUsed
   - If freeMovesUsed >= 5: force stop
   - Loop back to LLM decision for this character

3. **Relation auto-management**: After execution:
   - For each interaction between two characters at same node: create acquaintance if none exists
   - Update lastInteractionTick
   - Check acquaintance decay (336 tick threshold)

```typescript
/**
 * 模拟引擎主循环（v2 — 角色系统重设计后）。
 *
 * 新增：
 * - OngoingAction 检查与中断
 * - Free move 链（max 5/tick）
 * - 关系自动管理（acquaintance 创建/衰减）
 * - 情绪演化 + 事件驱动情绪
 */
import { buildActionContext, getAvailableActions } from "./actions";
import { executeActions } from "./execute";
import { deriveAggregatedFacts, type AggregatedFacts } from "./facts";
import { dispatchPerception } from "./perception";
import { decayVitals, evolveEmotions } from "./vitals-emotion";
import { timeOfDay } from "@/llm/prompt";
import {
  appendEventsLog, appendThoughts, loadRecentThoughts,
  loadWorld, persistSnapshot, saveWorld, type LoadedWorld,
} from "./store";
import { loadAllCharacters } from "@/config/loader";
import type { Action, Character, MapNode, WorldEvent } from "@/domain/types";
import type { ActionOption } from "./actions";

const FACTS_LOOKBACK_TICKS = 48;
const MAX_FREE_MOVES = 5;
const ACQUAINTANCE_DECAY_TICKS = 336; // 14 game days
const ACQUAINTANCE_WARN_TICKS = 48;   // 2 game days before decay

export interface DecideInput {
  character: Character;
  here: MapNode;
  companions: Character[];
  reachable: MapNode[];
  perceived: WorldEvent[];
  options: ActionOption[];
  worldName: string;
  tick: number;
  facts: AggregatedFacts;
}

export type DecideFn = (input: DecideInput) => Promise<Action>;

export interface TickOptions {
  decide?: DecideFn;
  forceWait?: boolean;
}

export interface TickResult {
  worldId: string;
  fromTick: number;
  toTick: number;
  events: WorldEvent[];
  decisions: Array<{ characterId: string; action: Action; success: boolean }>;
}

const DEFAULT_DECIDE: DecideFn = async (input) => {
  const { llmDecide } = await import("@/llm/decide");
  return llmDecide(input);
};

function fallbackWait(c: Character): Action {
  return {
    type: "wait",
    actorId: c.id,
    reasoning: "（fallback）暂时没有想做的事。",
    selfImportance: 1,
  };
}

export async function tick(
  worldId: string,
  options: TickOptions = {},
): Promise<TickResult> {
  const loaded = loadWorld(worldId);
  const { world, nodes, characters } = loaded;
  const fromTick = world.currentTick;
  const allEvents: WorldEvent[] = [];
  const allDecisions: Array<{ characterId: string; action: Action; success: boolean }> = [];

  // 1. Vitals decay
  const vitalEvents = decayVitals({ characters, worldId, tick: fromTick });
  allEvents.push(...vitalEvents);

  // 2. Emotion evolution (before perception so inner events get dispatched)
  const hasCompanions = new Map<string, boolean>();
  for (const c of characters) {
    const peers = characters.filter(p => p.id !== c.id && p.locationId === c.locationId);
    hasCompanions.set(c.id, peers.length > 0);
  }
  const emotionEvents = evolveEmotions({ characters, worldId, tick: fromTick, hasCompanions });
  allEvents.push(...emotionEvents);

  // 3. Scheduled events (Stage 1 placeholder)
  const scheduledEvents: WorldEvent[] = [];

  const allCurrentEvents = [...allEvents, ...scheduledEvents];

  // 4. Perception dispatch
  const perceptions = dispatchPerception(nodes, characters, allCurrentEvents);

  // 5. Home map + facts
  const homeMap = buildHomeMap();
  const sinceTick = Math.max(0, fromTick - FACTS_LOOKBACK_TICKS);
  const dayInfo = timeOfDay(fromTick);
  const decideFn = options.forceWait
    ? async (input: DecideInput) => fallbackWait(input.character)
    : (options.decide ?? DEFAULT_DECIDE);

  // 6. Process each character
  const nodeById = new Map(nodes.map(n => [n.id, n]));

  for (const c of characters) {
    // 6a. Check ongoing action
    if (c.currentAction && fromTick < c.currentAction.endsAt) {
      // Check interrupt
      const perceived = perceptions.get(c.id) ?? [];
      const interrupt = perceived.find(e => e.intensity >= c.currentAction!.interruptThreshold);
      if (interrupt) {
        const partialRecovery = Math.floor((fromTick - c.currentAction.startedAt) / 2);
        c.vitals.fatigue = Math.max(0, c.vitals.fatigue - partialRecovery);
        allEvents.push({
          id: `evt-${crypto.randomUUID().slice(0, 8)}`,
          worldId, tick: fromTick, category: "inner",
          description: `被 ${interrupt.description} 惊醒/打断。`,
          participants: [c.id], source: "inner", intensity: 2,
          scope: "private", audienceCharacterId: c.id, duration: 1,
        });
        c.currentAction = undefined;
      } else {
        // Still ongoing: auto-wait
        if (fromTick % 4 === 0) {
          allEvents.push({
            id: `evt-${crypto.randomUUID().slice(0, 8)}`,
            worldId, tick: fromTick, category: "inner",
            description: `仍在 ${c.currentAction.description}。`,
            participants: [c.id], source: "inner", intensity: 1,
            scope: "private", audienceCharacterId: c.id, duration: 1,
          });
        }
        const waitAction: Action = { type: "wait", actorId: c.id, reasoning: "持续行动中。", selfImportance: 1 };
        allDecisions.push({ characterId: c.id, action: waitAction, success: true });
        continue;
      }
    }

    if (c.currentAction && fromTick === c.currentAction.endsAt) {
      // Execute final effect
      if (c.currentAction.type === "sleep") {
        c.vitals.fatigue = 0;
      }
      c.currentAction = undefined;
    }

    // 6b. Free move loop
    let freeMovesUsed = 0;
    let action: Action;

    while (true) {
      const ctx = buildActionContext(c, nodes, characters);
      const recentThoughts = loadRecentThoughts(worldId, c.id, sinceTick);
      const hnid = homeMap.get(c.id) ?? null;
      c.homeNodeId = hnid;
      const facts = deriveAggregatedFacts({
        character: c, nodes, currentTick: fromTick, recentThoughts, homeNodeId: hnid,
      });
      const opts = getAvailableActions(ctx, { facts, isSleepHour: dayInfo.isSleepHour });

      try {
        action = await decideFn({
          character: c, here: ctx.here, companions: ctx.companions,
          reachable: ctx.reachable, perceived: perceptions.get(c.id) ?? [],
          options: opts, worldName: world.name, tick: fromTick, facts,
        });
      } catch (err) {
        action = fallbackWait(c);
        action.reasoning = `LLM 调用失败：${err instanceof Error ? err.message : String(err)}`;
      }

      if (action.type !== "move") break;

      const targetNode = action.targetNodeId ? nodeById.get(action.targetNodeId) : null;
      const isShortcut = ctx.here.shortcuts.includes(action.targetNodeId ?? "");
      const cost = isShortcut ? 0 : (targetNode?.travelCost ?? 0);

      if (cost > 0) {
        // Non-free move: set ongoing action and break
        c.currentAction = {
          type: "move", startedAt: fromTick, endsAt: fromTick + cost,
          description: `前往 ${targetNode?.name ?? action.targetNodeId} 途中`,
          interruptThreshold: 5,
        };
        break;
      }

      if (freeMovesUsed >= MAX_FREE_MOVES) {
        allEvents.push({
          id: `evt-${crypto.randomUUID().slice(0, 8)}`,
          worldId, tick: fromTick, category: "inner",
          description: "想继续走但只能停下想想。",
          participants: [c.id], source: "inner", intensity: 1,
          scope: "private", audienceCharacterId: c.id, duration: 1,
        });
        break;
      }

      // Apply free move
      c.locationId = action.targetNodeId!;
      freeMovesUsed++;

      allEvents.push({
        id: `evt-${crypto.randomUUID().slice(0, 8)}`,
        worldId, tick: fromTick, category: "action",
        description: `${c.name} 来到 ${targetNode?.name ?? action.targetNodeId}。`,
        participants: [c.id], source: "actor", intensity: 1,
        scope: "node", nodeId: c.locationId, duration: 1,
      });
    }

    allDecisions.push({ characterId: c.id, action, success: true });
  }

  // 7. Execute actions (non-move ones)
  const execResult = executeActions({
    worldId, tick: fromTick, characters, nodes,
    actions: allDecisions.map(d => d.action),
  });
  allEvents.push(...execResult.events);

  // 8. Relation auto-management
  manageRelations(characters, fromTick, allEvents, worldId);

  // 9. Persist
  appendEventsLog(worldId, allEvents);
  world.currentTick = fromTick + 1;
  saveWorld(loaded);
  appendThoughts(worldId, execResult.resolvedActions.map(r => ({
    characterId: r.action.actorId, tick: fromTick, action: r.action, success: r.success,
  })));

  if (world.currentTick > 0 && world.currentTick % 24 === 0) {
    persistSnapshot(loaded);
  }

  return {
    worldId, fromTick, toTick: world.currentTick,
    events: allEvents,
    decisions: execResult.resolvedActions.map(r => ({
      characterId: r.action.actorId, action: r.action, success: r.success,
    })),
  };
}

function buildHomeMap(): Map<string, string> {
  const m = new Map<string, string>();
  try {
    for (const tpl of loadAllCharacters()) {
      if (tpl.homeNodeId) m.set(tpl.id, tpl.homeNodeId);
    }
  } catch { /* silent */ }
  return m;
}

// ---- relation auto-management ----

function manageRelations(
  characters: Character[],
  tick: number,
  events: WorldEvent[],
  worldId: string,
): void {
  // Group characters by node
  const byNode = new Map<string, Character[]>();
  for (const c of characters) {
    const arr = byNode.get(c.locationId) ?? [];
    arr.push(c);
    byNode.set(c.locationId, arr);
  }

  for (const [, nodeChars] of byNode) {
    for (let i = 0; i < nodeChars.length; i++) {
      for (let j = i + 1; j < nodeChars.length; j++) {
        const a = nodeChars[i];
        const b = nodeChars[j];

        // Check if they interacted this tick (look at events)
        const interacted = events.some(e =>
          e.tick === tick &&
          e.participants.includes(a.id) &&
          e.participants.includes(b.id) &&
          (e.category === "social" || e.category === "action")
        );

        if (interacted) {
          ensureAcquaintance(a, b, tick);
          ensureAcquaintance(b, a, tick);
        }
      }
    }
  }

  // Acquaintance decay
  for (const c of characters) {
    for (const [otherId, rel] of Object.entries(c.relations)) {
      if (rel.kinds.includes("acquaintance") &&
          tick - rel.lastInteractionTick >= ACQUAINTANCE_DECAY_TICKS) {
        rel.kinds = rel.kinds.filter(k => k !== "acquaintance");
        if (rel.kinds.length === 0) {
          delete c.relations[otherId];
        }
      }
    }
  }
}

function ensureAcquaintance(a: Character, bId: string, tick: number): void {
  const rel = a.relations[bId];
  if (!rel || rel.kinds.length === 0) {
    a.relations[bId] = {
      kinds: ["acquaintance"],
      affection: 0,
      since: tick,
      lastInteractionTick: tick,
    };
  } else {
    rel.lastInteractionTick = tick;
    if (!rel.kinds.includes("acquaintance")) {
      rel.kinds.push("acquaintance");
    }
  }
}

export type { LoadedWorld };
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/engine/tick.ts
git commit -m "feat: add ongoing action check, free move loop, relation auto-management to tick loop"
```

---

### Task 9: Update Actions Module

**Files:**
- Modify: `src/engine/actions.ts`

**What changes:**
- Add new default actions: sleep, bathe, exercise, meditate, write, groom, pace
- Add update_relation to interactive actions
- New action eligibility rules per spec §四
- Update hint text for move options (show travel cost)

- [ ] **Step 1: Rewrite actions.ts**

The `getAvailableActions` function needs new branches for:
- `sleep`: node has residence tag or privacy=private
- `bathe`: node has bathing tag
- `exercise`: node has outdoor or playground tag
- `meditate`: privacy=private or node has quiet tag
- `write`: node has indoor tag
- `groom`: node has residence tag or privacy=private
- `pace`: always available
- `update_relation`: for each companion with existing relation (non-blood kinds)

Move options need travelCost in hints.

```typescript
import type { AggregatedFacts } from "./facts";
import type { Character, MapNode } from "@/domain/types";
import type { ActionType } from "@/domain/enums";

export interface ActionOption {
  type: ActionType;
  hint: string;
  targetId?: string;
  targetNodeId?: string;
}

export interface AvailableActionsHints {
  facts?: AggregatedFacts;
  isSleepHour?: boolean;
}

export interface ActionContext {
  self: Character;
  here: MapNode;
  companions: Character[];
  reachable: MapNode[];
}

export function buildActionContext(
  character: Character,
  nodes: MapNode[],
  characters: Character[],
): ActionContext {
  const here = nodes.find((n) => n.id === character.locationId);
  if (!here) throw new Error(`character ${character.id} located at unknown node ${character.locationId}`);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const reachable: MapNode[] = [];
  if (here.parentId) {
    const p = byId.get(here.parentId);
    if (p) reachable.push(p);
    for (const n of nodes) {
      if (n.parentId === here.parentId && n.id !== here.id) reachable.push(n);
    }
  }
  for (const n of nodes) {
    if (n.parentId === here.id) reachable.push(n);
  }
  for (const sid of here.shortcuts) {
    const s = byId.get(sid);
    if (s) reachable.push(s);
  }

  const companions = characters.filter(
    (c) => c.id !== character.id && c.locationId === here.id,
  );
  return { self: character, here, companions, reachable };
}

export function getAvailableActions(
  ctx: ActionContext,
  hints?: AvailableActionsHints,
): ActionOption[] {
  const { self, here, companions, reachable } = ctx;
  const facts = hints?.facts;
  const isSleepHour = hints?.isSleepHour ?? false;
  const fatigue = self.vitals.fatigue;
  const hunger = self.vitals.hunger;
  const hygiene = self.vitals.hygiene;
  const stayHours = facts?.hoursAtCurrentLocation ?? 0;
  const homeNodeId = facts?.homeNodeId ?? null;
  const opts: ActionOption[] = [];

  const restNeeded = fatigue >= 10;
  const sleepStuckOutside = isSleepHour &&
    !(here.tags.includes("residence") || here.privacy === "private");
  const tooLongHere = stayHours >= 8 &&
    !here.tags.includes("residence") && !here.tags.includes("education");

  // Always available
  opts.push({ type: "wait", hint: restNeeded || sleepStuckOutside
    ? "什么都不做，原地等待。（你应该休息，wait 并不解决疲劳）"
    : "什么都不做，原地等待。" });
  opts.push({ type: "observe", hint: `观察 ${here.name} 的环境与人。` });
  opts.push({ type: "pace", hint: `在 ${here.name} 踱步，整理思绪。` });

  // Move: to each reachable node
  for (const n of reachable) {
    const isShortcut = here.shortcuts.includes(n.id);
    const cost = isShortcut ? 0 : (n.travelCost ?? 0);
    const costSuffix = cost > 0 ? ` ⏱ 需 ${cost} 小时` : "";
    let hint = `前往 ${n.name}（${n.privacy}, ${n.tags.join("/")}）${costSuffix}`;
    const isHome = homeNodeId !== null && n.id === homeNodeId;
    if (isHome && (restNeeded || sleepStuckOutside)) {
      hint = `⭐ ${hint}——这是你的家，可以休息`;
    } else if (tooLongHere && (n.tags.includes("residence") || n.tags.includes("park"))) {
      hint = `${hint}（你已在此地待 ${stayHours} 小时，换个环境是合理的）`;
    }
    opts.push({ type: "move", targetNodeId: n.id, hint });
  }

  // Eat
  if (here.tags.includes("dining")) {
    opts.push({ type: "eat", hint: hunger <= 0
      ? `在 ${here.name} 进食。（你并不饿，吃饭只是为了打发时间）`
      : `在 ${here.name} 进食。` });
  } else if (hunger >= 5) {
    opts.push({ type: "eat", hint: "你已经很饿，但当前位置不能吃饭——可以选择 move 去饭馆。" });
  }

  // Rest
  if (here.tags.includes("residence") || here.privacy === "private") {
    opts.push({ type: "rest", hint: restNeeded || isSleepHour
      ? `⭐ 在 ${here.name} 休息（你确实需要）。`
      : `在 ${here.name} 休息。` });
  }

  // Sleep (extended rest, 8 ticks)
  if (here.tags.includes("residence") || here.privacy === "private") {
    opts.push({ type: "sleep", hint: isSleepHour || restNeeded
      ? `⭐ 在 ${here.name} 睡觉（连续 8 小时，期间不被强度 ≥ 4 的事件打断）。`
      : `在 ${here.name} 睡觉（现在还早，除非你真的很累）。` });
  }

  // Bathe
  if (here.tags.includes("bathing")) {
    opts.push({ type: "bathe", hint: hygiene >= HYGIENE_MEDIUM
      ? `⭐ 在 ${here.name} 洗浴（你已经 ${hygiene} 小时没洗澡了）。`
      : `在 ${here.name} 洗浴。` });
  }

  // Exercise
  if (here.tags.includes("outdoor") || here.tags.includes("playground")) {
    opts.push({ type: "exercise", hint: `在 ${here.name} 运动一下（+mood, -stress, +fatigue）。` });
  }

  // Meditate
  if (here.privacy === "private" || here.tags.includes("quiet")) {
    opts.push({ type: "meditate", hint: self.emotion.stress >= 3
      ? `⭐ 在 ${here.name} 冥想放松（缓解压力）。`
      : `在 ${here.name} 冥想。` });
  }

  // Write
  if (here.tags.includes("indoor")) {
    opts.push({ type: "write", hint: `在 ${here.name} 写点东西（mood 依自评变化）。` });
  }

  // Groom
  if (here.tags.includes("residence") || here.privacy === "private") {
    opts.push({ type: "groom", hint: hygiene >= HYGIENE_SEVERE
      ? `⭐ 在 ${here.name} 整理仪容。`
      : `在 ${here.name} 整理仪容。` });
  }

  // Work
  if (here.tags.includes("education")) {
    opts.push({ type: "work", hint: `在 ${here.name} 学习/工作。` });
  }

  // Read
  if (here.tags.includes("indoor")) {
    opts.push({ type: "read", hint: `在 ${here.name} 安静阅读。` });
  }

  // Social interactions
  const speakSuffix = stayHours >= 4 && companions.length > 0
    ? `（你已在此和他们待 ${stayHours} 小时，话题可能开始重复）`
    : "";
  for (const peer of companions) {
    const rel = self.relations[peer.id];
    const relTag = rel
      ? `${rel.kinds.join("/")}, 好感 ${rel.affection}`
      : "陌生";
    opts.push({
      type: "speak", targetId: peer.id,
      hint: `和 ${peer.name}（${relTag}）说话。${speakSuffix}`,
    });
    opts.push({
      type: "interact_person", targetId: peer.id,
      hint: `与 ${peer.name}（${relTag}）做出非言语互动。`,
    });
    if (rel && rel.affection > 1) {
      opts.push({ type: "help", targetId: peer.id, hint: `帮助 ${peer.name}。` });
      opts.push({ type: "gift", targetId: peer.id, hint: `送 ${peer.name} 一件小东西。` });
    }
    if (rel && rel.affection < -1) {
      opts.push({ type: "attack", targetId: peer.id, hint: `挑衅或攻击 ${peer.name}。` });
      opts.push({ type: "flee", targetId: peer.id, hint: `避开 ${peer.name}。` });
    }
    // update_relation for non-blood relations
    if (rel && rel.kinds.some(k => !BLOOD_RELATION_KINDS.has(k))) {
      if (!rel.kinds.includes("partner")) {
        opts.push({
          type: "update_relation", targetId: peer.id,
          hint: `提议与 ${peer.name} 成为伴侣。`,
        });
      }
      if (rel.kinds.includes("partner")) {
        opts.push({
          type: "update_relation", targetId: peer.id,
          hint: `与 ${peer.name} 升级为配偶。`,
        });
      }
      if (rel.kinds.includes("friend")) {
        opts.push({
          type: "update_relation", targetId: peer.id,
          hint: `与 ${peer.name} 结束友谊。`,
        });
      }
    }
  }

  // Generic
  opts.push({ type: "interact_object", hint: `与 ${here.name} 中的某件物品互动。` });
  opts.push({ type: "use_ability", hint: "使用你的某项能力。" });

  return opts;
}

const HYGIENE_MEDIUM = 8;
const HYGIENE_SEVERE = 13;
import { BLOOD_RELATION_KINDS } from "@/domain/enums";
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/engine/actions.ts
git commit -m "feat: add 8 new action types, update_relation, travel cost hints to available actions"
```

---

### Task 10: Update Action Execution

**Files:**
- Modify: `src/engine/execute.ts`

**What changes:**
- Handle new action types: sleep (set OngoingAction 8 ticks), bathe, exercise, meditate, write, groom, pace, update_relation
- Update relation affinity rules: help/gift → affection +1 (cap +4), attack → -2 (floor -4)
- Apply emotion events on social actions
- Handle update_relation semantics per spec §二
- Update memory format (no more statuses)

- [ ] **Step 1: Rewrite execute.ts**

Key changes:
- `sleep`: set `currentAction = { type: "sleep", startedAt: tick, endsAt: tick + 8, description: "睡觉", interruptThreshold: 4 }`, fatigue → 0 only on completion (handled in tick.ts)
- `bathe`: hygiene → 0, requires bathing tag
- `exercise`: mood +1, stress -1, fatigue +2
- `meditate`: stress -2, requires private/quiet
- `write`: mood ±1 (just produce event, LLM self-assesses)
- `groom`: hygiene -1
- `pace`: produce event only
- `update_relation`: process change_type per spec rules
- `attack`: affection -2 both ways, apply emotion events
- `help`/`gift`: affection +1 both ways, apply emotion events
- All affinity changes now clamped to [-4, 4] instead of [-100, 100]

```typescript
// In execute.ts, update the switch cases:

case "move": {
  if (!action.targetNodeId) { success = false; reason = "move 缺少 target_node_id"; break; }
  const target = nodeById.get(action.targetNodeId);
  if (!target) { success = false; reason = `目标节点不存在: ${action.targetNodeId}`; break; }
  const fromId = actor.locationId;
  actor.locationId = target.id;
  events.push(makeEvent({
    worldId, tick, category: "action",
    description: `${actor.name} 从 ${nodeById.get(fromId)?.name ?? fromId} 来到 ${target.name}。`,
    participants: [actor.id], intensity: 1, scope: "node", nodeId: target.id,
  }));
  break;
}
case "eat": {
  const here = nodeById.get(actor.locationId);
  if (!here?.tags.includes("dining")) { success = false; reason = "当前不在用餐场所"; break; }
  actor.vitals.hunger = 0;
  events.push(makeEvent({
    worldId, tick, category: "action",
    description: `${actor.name} 在 ${here.name} 吃了一顿。`,
    participants: [actor.id], scope: "node", nodeId: here.id,
  }));
  break;
}
case "rest": {
  actor.vitals.fatigue = Math.max(0, actor.vitals.fatigue - 2);
  const here = nodeById.get(actor.locationId);
  events.push(makeEvent({
    worldId, tick, category: "action",
    description: `${actor.name} 在 ${here?.name ?? "某处"} 休息了一会儿。`,
    participants: [actor.id], scope: "node", nodeId: actor.locationId,
  }));
  break;
}
case "sleep": {
  const here = nodeById.get(actor.locationId);
  if (!(here?.tags.includes("residence") || here?.privacy === "private")) {
    success = false; reason = "当前位置不能睡觉"; break;
  }
  actor.currentAction = {
    type: "sleep", startedAt: tick, endsAt: tick + 8,
    description: "睡觉", interruptThreshold: 4,
  };
  events.push(makeEvent({
    worldId, tick, category: "action",
    description: `${actor.name} 在 ${here.name} 躺下准备睡觉。`,
    participants: [actor.id], scope: "node", nodeId: here.id,
  }));
  break;
}
case "bathe": {
  const here = nodeById.get(actor.locationId);
  if (!here?.tags.includes("bathing")) { success = false; reason = "当前位置不能洗浴"; break; }
  actor.vitals.hygiene = 0;
  events.push(makeEvent({
    worldId, tick, category: "action",
    description: `${actor.name} 在 ${here.name} 洗了个澡。`,
    participants: [actor.id], scope: "node", nodeId: here.id,
  }));
  break;
}
case "exercise": {
  const here = nodeById.get(actor.locationId);
  if (!(here?.tags.includes("outdoor") || here?.tags.includes("playground"))) {
    success = false; reason = "当前位置不能运动"; break;
  }
  actor.emotion.mood = clamp(actor.emotion.mood + 1, -4, 4);
  actor.emotion.stress = clamp(actor.emotion.stress - 1, 0, 4);
  actor.vitals.fatigue = Math.min(16, actor.vitals.fatigue + 2);
  events.push(makeEvent({
    worldId, tick, category: "action",
    description: `${actor.name} 在 ${here.name} 运动了一会儿。`,
    participants: [actor.id], scope: "node", nodeId: here.id, intensity: 1,
  }));
  break;
}
case "meditate": {
  const here = nodeById.get(actor.locationId);
  if (!(here?.privacy === "private" || here?.tags.includes("quiet"))) {
    success = false; reason = "当前位置不适合冥想"; break;
  }
  actor.emotion.stress = clamp(actor.emotion.stress - 2, 0, 4);
  events.push(makeEvent({
    worldId, tick, category: "action",
    description: `${actor.name} 在 ${here.name} 闭目冥想。`,
    participants: [actor.id], scope: "node", nodeId: here.id, intensity: 1,
  }));
  break;
}
case "write": {
  const here = nodeById.get(actor.locationId);
  if (!here?.tags.includes("indoor")) { success = false; reason = "当前位置不适合书写"; break; }
  events.push(makeEvent({
    worldId, tick, category: "action",
    description: `${actor.name} 在 ${here.name} 写了点东西。`,
    participants: [actor.id], scope: "node", nodeId: here.id, intensity: 1,
  }));
  break;
}
case "groom": {
  const here = nodeById.get(actor.locationId);
  if (!(here?.tags.includes("residence") || here?.privacy === "private")) {
    success = false; reason = "当前位置不适合整理仪容"; break;
  }
  actor.vitals.hygiene = Math.max(0, actor.vitals.hygiene - 1);
  events.push(makeEvent({
    worldId, tick, category: "action",
    description: `${actor.name} 在 ${here.name} 整理仪容。`,
    participants: [actor.id], scope: "node", nodeId: here.id, intensity: 1,
  }));
  break;
}
case "pace": {
  const here = nodeById.get(actor.locationId);
  events.push(makeEvent({
    worldId, tick, category: "action",
    description: `${actor.name} 在 ${here.name} 来回踱步。`,
    participants: [actor.id], scope: "node", nodeId: here.id, intensity: 1,
  }));
  break;
}
case "speak": {
  const here = nodeById.get(actor.locationId);
  const target = action.targetId ? charById.get(action.targetId) : null;
  const audience = target ? `对 ${target.name} ` : "";
  events.push(makeEvent({
    worldId, tick, category: "social",
    description: `${actor.name} ${audience}说："${action.freeText ?? "（沉默良久）"}"`,
    participants: target ? [actor.id, target.id] : [actor.id],
    scope: "node", nodeId: actor.locationId, intensity: 2,
  }));
  if (target) {
    pushMemory(target, {
      id: `mem-${randomUUID().slice(0, 8)}`, tick, importance: 2,
      content: `${actor.name} 对我说："${action.freeText ?? "..."}"`,
    });
    // social_satiety boost for speaking
    actor.emotion.social_satiety = clamp(actor.emotion.social_satiety + 1, -4, 4);
  }
  break;
}
case "attack":
case "help":
case "gift":
case "interact_person": {
  const target = action.targetId ? charById.get(action.targetId) : null;
  if (!target) { success = false; reason = "target_id 不存在或未指定"; break; }
  const verbs: Record<string, string> = {
    attack: "挑衅了", help: "帮助了", gift: "送给了", interact_person: "与之互动：",
  };
  const intensity = action.type === "attack" ? 4 : 2;
  events.push(makeEvent({
    worldId, tick, category: "social",
    description: `${actor.name} ${verbs[action.type]} ${target.name}${action.freeText ? `（${action.freeText}）` : ""}`,
    participants: [actor.id, target.id], scope: "node", nodeId: actor.locationId, intensity,
  }));
  // Bidirectional affection changes (clamped [-4, 4])
  if (action.type === "attack") {
    updateAffection(actor, target.id, -2);
    updateAffection(target, actor.id, -2);
    applyEmotionEvent(actor.emotion, { type: "attacked_other" });
    applyEmotionEvent(target.emotion, { type: "attacked_self" });
  } else if (action.type === "help" || action.type === "gift") {
    updateAffection(actor, target.id, 1);
    updateAffection(target, actor.id, 1);
    applyEmotionEvent(actor.emotion, { type: "helped_gifted" });
    applyEmotionEvent(target.emotion, { type: "received_help_gift" });
  }
  pushMemory(target, {
    id: `mem-${randomUUID().slice(0, 8)}`, tick,
    importance: action.type === "attack" ? 4 : 2,
    content: `${actor.name} ${verbs[action.type]} 我${action.freeText ? `（${action.freeText}）` : ""}`,
  });
  break;
}
case "flee": {
  const here = nodeById.get(actor.locationId);
  const fallback = here?.parentId ? nodeById.get(here.parentId) : null;
  if (fallback) actor.locationId = fallback.id;
  events.push(makeEvent({
    worldId, tick, category: "action",
    description: `${actor.name} 仓促离开。`,
    participants: [actor.id], scope: "node", nodeId: actor.locationId, intensity: 2,
  }));
  break;
}
case "update_relation": {
  const target = action.targetId ? charById.get(action.targetId) : null;
  if (!target || !action.changeType) {
    success = false; reason = "update_relation 需要 target_id 和 change_type"; break;
  }
  const result = applyRelationChange(actor, target, action.changeType, tick);
  success = result.success; reason = result.reason;
  events.push(makeEvent({
    worldId, tick, category: "social",
    description: `${actor.name} ${result.success ? "变更了与" : "试图变更与"} ${target.name} 的关系：${action.changeType}${result.reason ? `（${result.reason}）` : ""}`,
    participants: [actor.id, target.id], scope: "node", nodeId: actor.locationId,
    intensity: result.success ? 3 : 1,
  }));
  break;
}
case "work":
case "read":
case "observe":
case "use_ability":
case "interact_object": {
  const here = nodeById.get(actor.locationId);
  events.push(makeEvent({
    worldId, tick, category: "action",
    description: `${actor.name} ${humanVerb(action.type)}：${action.freeText ?? "（默不作声）"}`,
    participants: [actor.id], scope: "node", nodeId: here?.id ?? actor.locationId, intensity: 1,
  }));
  break;
}
case "wait": {
  events.push(makeEvent({
    worldId, tick, category: "action",
    description: `${actor.name} 静静地等着。`,
    participants: [actor.id], scope: "node", nodeId: actor.locationId, intensity: 1,
  }));
  break;
}
```

Add these helper functions to execute.ts:

```typescript
import { clamp } from "./vitals-emotion";

function updateAffection(actor: Character, targetId: string, delta: number): void {
  const rel = actor.relations[targetId];
  if (!rel) return;
  rel.affection = clamp(rel.affection + delta, -4, 4);
}

function applyRelationChange(
  actor: Character,
  target: Character,
  changeType: Action["changeType"],
  tick: number,
): { success: boolean; reason?: string } {
  const aRel = actor.relations[target.id];
  const bRel = target.relations[actor.id];
  if (!aRel || aRel.kinds.length === 0) {
    return { success: false, reason: "双方没有关系基础" };
  }

  const hasBlood = aRel.kinds.some(k => BLOOD_RELATION_KINDS.has(k))
    || bRel?.kinds.some(k => BLOOD_RELATION_KINDS.has(k));

  switch (changeType) {
    case "become_partner": {
      if (hasBlood) return { success: false, reason: "血缘关系不能转为伴侣" };
      addKind(actor, target.id, "partner", tick);
      addKind(target, actor.id, "partner", tick);
      updateAffection(actor, target.id, 1);
      updateAffection(target, actor.id, 1);
      return { success: true };
    }
    case "end_partnership": {
      if (!aRel.kinds.includes("partner")) return { success: false, reason: "当前不是伴侣关系" };
      replaceKind(actor, target.id, "partner", "ex_partner");
      replaceKind(target, actor.id, "partner", "ex_partner");
      return { success: true };
    }
    case "become_spouse": {
      if (!aRel.kinds.includes("partner") || !(bRel?.kinds.includes("partner"))) {
        return { success: false, reason: "双方必须是伴侣才能升级为配偶" };
      }
      replaceKind(actor, target.id, "partner", "spouse");
      replaceKind(target, actor.id, "partner", "spouse");
      return { success: true };
    }
    case "end_friendship": {
      if (!aRel.kinds.includes("friend")) return { success: false, reason: "当前不是朋友关系" };
      removeKind(actor, target.id, "friend");
      removeKind(target, actor.id, "friend");
      updateAffection(actor, target.id, -1);
      updateAffection(target, actor.id, -1);
      return { success: true };
    }
    case "end_other_relative": {
      if (hasBlood) {
        const bloodKinds = aRel.kinds.filter(k => BLOOD_RELATION_KINDS.has(k));
        if (bloodKinds.length === aRel.kinds.length || !aRel.kinds.includes("other_relative")) {
          return { success: false, reason: "不能解除血缘关系" };
        }
      }
      if (!aRel.kinds.includes("other_relative")) {
        return { success: false, reason: "当前没有 other_relative 关系" };
      }
      removeKind(actor, target.id, "other_relative");
      removeKind(target, actor.id, "other_relative");
      return { success: true };
    }
    default:
      return { success: false, reason: "未知的 change_type" };
  }
}

function addKind(char: Character, targetId: string, kind: ObjectiveRelationKind, tick: number): void {
  const rel = char.relations[targetId];
  if (!rel) {
    char.relations[targetId] = { kinds: [kind], affection: 0, since: tick, lastInteractionTick: tick };
  } else if (!rel.kinds.includes(kind)) {
    rel.kinds.push(kind);
  }
}

function removeKind(char: Character, targetId: string, kind: ObjectiveRelationKind): void {
  const rel = char.relations[targetId];
  if (!rel) return;
  rel.kinds = rel.kinds.filter(k => k !== kind);
  if (rel.kinds.length === 0) delete char.relations[targetId];
}

function replaceKind(char: Character, targetId: string, oldKind: ObjectiveRelationKind, newKind: ObjectiveRelationKind): void {
  const rel = char.relations[targetId];
  if (!rel) return;
  rel.kinds = rel.kinds.map(k => k === oldKind ? newKind : k);
}
```

Add the import at the top of execute.ts:
```typescript
import { BLOOD_RELATION_KINDS, type ObjectiveRelationKind } from "@/domain/enums";
import { clamp } from "./vitals-emotion";
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/engine/execute.ts
git commit -m "feat: implement new action effects, update_relation, bidirectional affection, emotion events"
```

---

### Task 11: Update LLM Prompt

**Files:**
- Modify: `src/llm/prompt.ts`

**What changes:**
- `describePersonality()`: MBTI 4-dim text descriptions (no numeric values)
- `WORLD_RULES`: update reasoning rule (text not numbers), add free move mechanism
- `describeRelations()`: kinds[] + affection text (-4..+4 words) instead of kind + affinity number
- Vitals display: add hygiene, use qualitative text for all 7 axes
- Remove discrete statuses display
- Add emotion display (mood, stress, social_satiety)
- Add acquaintance decay notice
- Add free move mechanism description
- Cap peers at 5 with priority ordering
- Update action names for new types

- [ ] **Step 1: Rewrite prompt.ts**

This is a large file change. Key sections:

```typescript
// ---- MBTI text descriptions (9 levels per dimension, no numeric values exposed) ----

const EI_LABELS: Record<number, string> = {
  [-4]: "极度内向，只想独处",
  [-3]: "非常内向",
  [-2]: "偏内向",
  [-1]: "略偏内向",
  [0]: "内外平衡",
  [1]: "略偏外向",
  [2]: "偏外向",
  [3]: "非常外向",
  [4]: "极度外向，离不开人群",
};

const SN_LABELS: Record<number, string> = {
  [-4]: "极度直觉化，常忽略事实",
  [-3]: "想象力丰富，凭直觉",
  [-2]: "偏直觉",
  [-1]: "略偏直觉",
  [0]: "直觉与务实并重",
  [1]: "略偏务实",
  [2]: "偏务实",
  [3]: "很务实",
  [4]: "极度务实，只信眼见为实",
};

const TF_LABELS: Record<number, string> = {
  [-4]: "极度感性，凡事先看感受",
  [-3]: "很感性",
  [-2]: "偏感性",
  [-1]: "略偏感性",
  [0]: "理性与情感并重",
  [1]: "略偏理性",
  [2]: "偏理性",
  [3]: "很理性",
  [4]: "极度理性，凡事先讲逻辑",
};

const JP_LABELS: Record<number, string> = {
  [-4]: "极度随性，讨厌任何计划",
  [-3]: "很随性",
  [-2]: "偏随性",
  [-1]: "略偏随性",
  [0]: "灵活与计划并重",
  [1]: "略偏有规划",
  [2]: "偏有规划",
  [3]: "很有规划",
  [4]: "极度有计划，无规划即焦虑",
};

function describePersonality(p: Personality): string[] {
  return [
    `- 内外向(E/I)：${EI_LABELS[p.ei] ?? String(p.ei)}`,
    `- 直觉/实感(N/S)：${SN_LABELS[p.sn] ?? String(p.sn)}`,
    `- 情感/思考(F/T)：${TF_LABELS[p.tf] ?? String(p.tf)}`,
    `- 感知/判断(P/J)：${JP_LABELS[p.jp] ?? String(p.jp)}`,
  ];
}

// ---- affection text descriptions ----

function describeAffection(v: number): string {
  if (v <= -4) return "极厌恶";
  if (v === -3) return "很讨厌";
  if (v === -2) return "不喜欢";
  if (v === -1) return "略反感";
  if (v === 0) return "中性";
  if (v === 1) return "略有好感";
  if (v === 2) return "有好感";
  if (v === 3) return "很喜欢";
  return "非常喜欢";
}

// ---- 5-peer cap with priority ordering (spec §二) ----

const MAX_PEERS_IN_PROMPT = 5;

function selectTopPeers(
  c: Character,
  peers: Character[],
  tick: number,
): Character[] {
  if (peers.length <= MAX_PEERS_IN_PROMPT) return peers;

  const scored = peers.map(p => {
    const rel = c.relations[p.id];
    let score = 0;
    // Priority 1: strong objective relations
    if (rel) {
      const hasStrong = rel.kinds.some(k =>
        k === "spouse" || k === "partner" || BLOOD_RELATION_KINDS.has(k as ObjectiveRelationKind)
      );
      if (hasStrong) score += 1000;
      // Priority 2: |affection|
      score += Math.abs(rel.affection) * 10;
      // Priority 3: near acquaintance decay
      const decayIn = 336 - (tick - rel.lastInteractionTick);
      if (rel.kinds.includes("acquaintance") && decayIn <= 48) score += 500;
    }
    return { peer: p, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_PEERS_IN_PROMPT).map(s => s.peer);
}

// ---- vitals qualitative (extended qualifyVital + new hygiene) ----

function qualifyHygiene(value: number): { phrase: string; urgency: VitalUrgency } {
  if (value <= 0) return { phrase: "干净清爽", urgency: "none" };
  if (value < 5) return { phrase: `略感不洁（${value} 小时未洗浴）`, urgency: "mild" };
  if (value < 10) return { phrase: `明显不干净（${value} 小时未洗浴）`, urgency: "moderate" };
  if (value < 14) return { phrase: `很脏了（${value} 小时未洗浴），自己都能闻到味道`, urgency: "high" };
  return { phrase: `极其肮脏（${value} 小时未洗浴），难以忍受`, urgency: "critical" };
}

function qualifyEmotion(emotion: Emotion): string[] {
  const lines: string[] = [];
  // mood
  const moodWords: Record<number, string> = {
    [-4]: "极低落", [-3]: "很低落", [-2]: "有点低落", [-1]: "略低沉",
    [0]: "平静", [1]: "略愉悦", [2]: "愉快", [3]: "很开心", [4]: "极开心",
  };
  lines.push(`- 心情：${moodWords[emotion.mood] ?? String(emotion.mood)}`);
  // stress
  const stressWords: Record<number, string> = {
    [0]: "放松", [1]: "略紧张", [2]: "有压力", [3]: "压力大", [4]: "极度紧张",
  };
  lines.push(`- 压力：${stressWords[emotion.stress] ?? String(emotion.stress)}`);
  // social_satiety
  const socialWords: Record<number, string> = {
    [-4]: "极度孤独", [-3]: "很孤单", [-2]: "有点寂寞", [-1]: "略想社交",
    [0]: "社交适中", [1]: "略满足", [2]: "社交满足", [3]: "很充实", [4]: "社交过度",
  };
  lines.push(`- 社交满足：${socialWords[emotion.social_satiety] ?? String(emotion.social_satiety)}`);
  return lines;
}

// ---- WORLD_RULES update ----

const WORLD_RULES = `你是 LLM-as-NPC 模拟世界中的一个角色。这是一个由"导演型玩家"在外部观察、并偶尔向某地点投放事件的虚拟小镇。

游戏时间：1 tick = 1 个游戏小时。你不需要思考"玩家"——你只在你的角色身份下做出与你性格相符的决定。

行动机制：
- 你**只能**通过调用 submit_action 工具来回复，禁止直接输出任何自然语言文本——直接吐文本视为本 tick 弃权。
- 你必须从封闭的 ActionType 集合中选一个 type，作为 submit_action 的参数。
- 你可以在 free_text 中加入说话内容或行动具体描述。
- reasoning 是你的内心独白，必须在其中显式引用至少一项你的性格特征（用上面的文字描述，不要写数值）。这是硬性规则。
- self_importance 1-5，决定这件事是否进入你的长期记忆。
- 不要做超出当前可选行动列表的事；如果列表里没合适的，选 wait 或 observe。

移动机制：除标注 ⏱ 的远途节点外，move 不消耗时间——你可以本 tick 多次 move 后再做事，每次 move 后会重新感知新位置。但若你连续 5 次 move 仍未做事，会被强制停下。

昼夜节律：
- 1 日 = 24 tick。00:00–06:00 是深夜与凌晨；06:00–09:00 起床用餐；09:00–18:00 日常活动；18:00–22:00 用餐与社交；22:00–24:00 准备回家。
- 绝大多数人在 22:00–06:00 应在自己的住所睡觉。除非有强烈理由（紧急事件、夜班、关键人际冲突），夜间继续在公共场所社交是反常的，必须在 reasoning 里明确解释为何打破作息。

生理优先级：
- 当疲惫进入"困倦"以上，sleep/rest 优先于一切社交；当前位置不能休息（非 residence/private）时，首选 move 回自己的家。
- 当饥饿进入"很难受"以上，eat 同样优先于社交；当前位置不能 eat 时首选 move 去用餐场所。
- 性格维度仍主导**怎么做**（爱独处 / 爱热闹 / 易怒 / 稳重），但**做不做基本生理维护**不应被性格压制。

关系提醒：
- 超过 14 游戏日没和某熟人接触，对方将从你的关系中淡出（acquaintance 标签被移除）。如果你想维持某段关系，应主动联络。

反循环：
- 若你过去几个 tick 已多次做同一类行动且情境无新变化（例如连续 4 个 tick 都在 speak），应主动切换行为。
- 若你已在同一节点超过 8 小时，且这里不是你的家、工作场所或庆典现场，应认真考虑 move 去别处。`;
```

- [ ] **Step 1: Rewrite prompt.ts with all changes...**

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/llm/prompt.ts
git commit -m "feat: MBTI text descriptions, 7-axis qualitative status, free move mechanism, 5-peer cap in prompts"
```

---

### Task 12: Update LLM Decide

**Files:**
- Modify: `src/llm/decide.ts`

**What changes:**
- Update `payloadToAction` to map `change_type` → `changeType`
- Update error message references from "性格维度数值" to "性格特征"

Minimal changes needed — mostly the action payload mapping.

- [ ] **Step 1: Update decide.ts**

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
  };
}
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/llm/decide.ts
git commit -m "feat: map change_type from LLM payload to Action"
```

---

### Task 13: Update Engine Facts

**Files:**
- Modify: `src/engine/facts.ts`

**What changes:**
- `lastRestTick` should also match `sleep` type
- `lastEatTick` unchanged
- Add `lastBatheTick` for hygiene tracking

Minimal changes.

- [ ] **Step 1: Update facts.ts**

```typescript
// In deriveAggregatedFacts, add sleep to rest detection:
if (lastRestTick === undefined &&
    (t.action.type === "rest" || t.action.type === "sleep") && t.success) {
  lastRestTick = t.tick;
}
```

- [ ] **Step 2: Verify compilation and commit**

```bash
npx tsc --noEmit
git add src/engine/facts.ts
git commit -m "feat: treat sleep as rest in facts aggregation"
```

---

### Task 14: Delete Old Config Files

**Files:**
- Delete: `configs/characters/zhangmo.json`
- Delete: `configs/characters/lihuan.json`
- Delete: `configs/characters/wanggang.json`
- Delete: `configs/characters/xiaojing.json`
- Delete: `configs/characters/laoli.json`
- Delete: `configs/maps/morning-town.json`

Per spec §六: "直接删除现有 5 个 configs/characters/*.json 与 configs/maps/morning-town.json，由用户/技能后续重新生成（不做自动映射）。"

- [ ] **Step 1: Delete the files**

```bash
rm configs/characters/zhangmo.json
rm configs/characters/lihuan.json
rm configs/characters/wanggang.json
rm configs/characters/xiaojing.json
rm configs/characters/laoli.json
rm configs/maps/morning-town.json
```

- [ ] **Step 2: Commit**

```bash
git add configs/
git commit -m "feat: remove old character and map configs (to be regenerated with new schema)"
```

---

### Task 15: Update Seed Script

**Files:**
- Modify: `scripts/seed.ts`

**What changes:**
- Update `CastMember` vitals to include hygiene
- Add emotion initial values
- Remove old cast definitions (characters don't exist anymore)
- Add TODO comment for regeneration

Since config files are deleted, the seed script will fail to load characters. This is expected — the script will be updated when new configs are generated.

- [ ] **Step 1: Update seed.ts with placeholder**

```typescript
/**
 * 种子脚本：从 `configs/` 读取地图与角色，创建一个演示世界。
 *
 * 用法：`npm run seed`。
 * 注意：运行前需先用 agent-world-config 技能生成新的角色和地图配置文件。
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { createWorldFromConfig, type CastMember } from "@/engine/createWorld";

// These IDs must match the regenerated config files
const WORLD_ID = "world-morning-town";
const MAP_ID = "morning-town";

const CAST: CastMember[] = [
  // TODO: update after regenerating character configs with agent-world-config skill
];

function main() {
  if (CAST.length === 0) {
    console.error("No cast members defined. Regenerate configs with agent-world-config skill first.");
    process.exit(1);
  }
  db.delete(schema.worlds).where(eq(schema.worlds.id, WORLD_ID)).run();
  const r = createWorldFromConfig({ worldId: WORLD_ID, name: "晨曦小镇", mapId: MAP_ID, cast: CAST });
  console.log(`Seeded world "${r.worldId}" from map "${r.mapId}"`);
  console.log(`  characters: ${r.characterIds.length}`);
  console.log(`  default entry: ${r.defaultEntryNodeId}`);
}

try { main(); } catch (err) { console.error("seed failed:", err); process.exit(1); }
```

- [ ] **Step 2: Update smoke scripts**

Update `scripts/smoke-tick.ts` and `scripts/smoke-llm.ts` for any type changes (mostly just recompile).

- [ ] **Step 3: Commit**

```bash
git add scripts/seed.ts scripts/smoke-tick.ts scripts/smoke-llm.ts
git commit -m "feat: update seed and smoke scripts for new domain types"
```

---

### Task 16: Update Tests

**Files:**
- Modify: `src/engine/tick.test.ts`
- Modify: `src/engine/facts.test.ts`
- Modify: `src/engine/status-decay.test.ts` → rename to `src/engine/vitals-emotion.test.ts`
- Modify: `src/llm/prompt.test.ts`
- Modify: `src/llm/decide.test.ts`
- Modify: `src/config/loader.test.ts`
- Delete: `src/engine/status-decay.test.ts` (migrated)

**What changes:**
All tests need updates for:
- Personality shape (4 dims instead of 8)
- Vitals shape (add hygiene)
- Character shape (emotion instead of statuses)
- Relation shape (kinds[] + affection instead of kind + affinity)
- New action types
- New vitals-emotion engine

Key test updates:

- [ ] **Step 1: Update tick.test.ts**

Update all DB schema CREATE TABLE statements to include emotion_json column. Update all character fixtures to use new personality shape and emotion field. Update vitals assertions to include hygiene.

- [ ] **Step 2: Create vitals-emotion.test.ts**

Write tests for:
- Hunger/fatigue/hygiene decay per tick
- Cross-threshold inner events
- Emotion evolution (mood regression, stress decay, social_satiety drift)
- Event-driven emotion changes
- Reminder throttling

- [ ] **Step 3: Update prompt.test.ts**

Update tests for:
- MBTI text descriptions (no numeric values in output)
- 7-axis qualitative status
- New action names
- Free move mechanism description

- [ ] **Step 4: Update decide.test.ts**

Update baseInput fixture with new Character shape (personality 4-dims, emotion, updated vitals).

- [ ] **Step 5: Update facts.test.ts**

Update for new action types. Add sleep→rest detection.

- [ ] **Step 6: Update loader.test.ts**

Update for new CharacterTemplate shape (MBTI personality, new relation format, no statuses).

- [ ] **Step 7: Run all tests**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/engine/tick.test.ts src/engine/facts.test.ts src/engine/vitals-emotion.test.ts src/llm/prompt.test.ts src/llm/decide.test.ts src/config/loader.test.ts
git rm src/engine/status-decay.test.ts
git commit -m "test: update all tests for new domain model, add vitals-emotion tests"
```

---

### Task 17: Update agent-world-config Skill

**Files:**
- Modify: `.claude/skills/agent-world-config/SKILL.md`
- Modify: `.claude/skills/agent-world-config/references/character-schema.md`
- Modify: `.claude/skills/agent-world-config/references/map-schema.md`
- Modify: `.claude/skills/agent-world-config/references/examples/character.json`
- Modify: `.claude/skills/agent-world-config/references/examples/map.json`

**What changes per spec §六:**
- Character JSON template: personality 4 dims `{ ei, sn, tf, jp }` [-4,4]
- Character JSON template: relations `{ [otherId]: { kinds: string[], affection: -4..+4, note?, since, lastInteractionTick } }`
- Character JSON template: remove statuses (emotion is runtime-only)
- Map JSON template: new tags bathing/quiet, optional travelCost
- Reference doc: add OBJECTIVE_RELATION_KINDS vocabulary

- [ ] **Step 1: Update SKILL.md invariants**

Change:
- "personality 8 dims in [-100,100]" → "personality 4 dims (ei/sn/tf/jp) in [-4,4]"
- "valid relation kinds" → "valid objective relation kinds (OBJECTIVE_RELATION_KINDS)"
- "affinity in [-100,100]" → "affection in [-4,4]"
- Remove "valid status kinds" → emotion is runtime-only
- Add: map must include at least 1 bathing node

- [ ] **Step 2: Update character-schema.md**

Full rewrite of the schema reference to match new CharacterTemplate shape.

- [ ] **Step 3: Update map-schema.md**

Add bathing/quiet to tag vocabulary, add travelCost field.

- [ ] **Step 4: Update example JSONs**

Rewrite example character with new personality, relations format.
Update example map with bathing node and travelCost examples.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/agent-world-config/
git commit -m "docs: update agent-world-config skill for new character/map schema"
```

---

### Task 18: Final Integration Test

- [ ] **Step 1: Reset DB and verify migration**

```bash
npm run db:reset
```
Expected: clean DB created with all new columns.

- [ ] **Step 2: Run full test suite**

```bash
npm test
```
Expected: all tests pass.

- [ ] **Step 3: Verify TypeScript across entire project**

```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: final integration fixes for character system redesign"
```

---

## Verification Checklist (from spec §八)

After new configs are regenerated (via agent-world-config skill, separate step):

1. ✅ Each NPC with fatigue ≥ 8 at 22:00 should choose sleep or move home ≥ 80%
2. ✅ NPC reasoning includes at least one MBTI text description (no ±numbers)
3. ✅ Within 24 ticks, at least 1 NPC triggers free move chain (≥ 2 consecutive moves same tick)
4. ✅ Within 24 ticks, at least 1 NPC uses bathe or meditate proactively
5. ✅ Acquaintance auto-creation when two characters first interact at same node
6. ✅ After 30 game days, no acquaintance relations with lastInteractionTick > 336 remain
