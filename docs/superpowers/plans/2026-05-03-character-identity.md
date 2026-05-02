# Character Identity System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add profession/age/gender/biography to characters, replace homeNodeId with activityNodeId + restNodeId, add study action.

**Architecture:** Domain types flow downward — enums → types → config schemas → config JSONs → engine (facts/actions/execute/tick) → LLM prompt → frontend. All new template fields (age, gender, profession, biography, activityNodeId, restNodeId) are injected at runtime from config into Character objects, matching the existing homeNodeId pattern (not persisted to DB).

**Tech Stack:** TypeScript, Zod, Vitest, React (Next.js)

---

### Task 1: Domain Enums — Add PROFESSIONS, GENDERS, and "study" action

**Files:**
- Modify: `src/domain/enums.ts:1-20`

- [ ] **Step 1: Add new enums and extend ACTION_TYPES**

```typescript
// After OBJECTIVE_RELATION_KINDS block (line 49), add:

/** 角色身份/职业（现代农业小镇背景）。 */
export const PROFESSIONS = [
  "farmer", "rancher", "fisherman", "lumberjack", "hunter",
  "chef", "baker", "brewer",
  "blacksmith", "carpenter", "tailor",
  "merchant", "grocer", "innkeeper",
  "doctor", "nurse", "teacher", "librarian",
  "priest", "mailman", "mayor", "student", "unemployed",
] as const;
export type Profession = (typeof PROFESSIONS)[number];

export const GENDERS = ["male", "female", "other"] as const;
export type Gender = (typeof GENDERS)[number];
```

In `ACTION_TYPES`, add `"study"` after `"read"`:
```typescript
export const ACTION_TYPES = [
  // 默认（只动自己）—— 17 种
  "move", "wait", "observe", "rest", "eat", "read", "study", "work", "use_ability",
  "sleep", "nap", "bathe", "exercise", "meditate", "write", "groom", "pace",
  // 交互（动他人/物体/关系）—— 8 种
  "speak", "interact_object", "interact_person",
  "attack", "flee", "help", "gift",
  "update_relation",
  // 对话协议内部（不在 getAvailableActions 中暴露，仅 dialog 专用 schema 约束产生）
  "accept_speak",
  "reject_speak",
  "leave_dialog",
] as const;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors from enums.ts

- [ ] **Step 3: Commit**

```bash
git add src/domain/enums.ts
git commit -m "feat: add PROFESSIONS, GENDERS enums and study action type"
```

---

### Task 2: Domain Types — Add new Character fields, update Facts types

**Files:**
- Modify: `src/domain/types.ts:146-175` (Character interface)
- Modify: `src/domain/types.ts:1-10` (import Gender, Profession)
- Modify: `src/engine/facts.ts:14-48` (AggregatedFacts + DeriveFactsInput)

- [ ] **Step 1: Update imports in types.ts**

Add `Gender, Profession` to the import from `"./enums"` at line 2:
```typescript
import type {
  ActionType,
  EventCategory,
  EventScope,
  EventSource,
  Gender,
  NodeTag,
  ObjectiveRelationKind,
  Privacy,
  Profession,
} from "./enums";
```

- [ ] **Step 2: Add new fields to Character, remove homeNodeId**

Replace the Character interface's homeNodeId field and add new fields:
```typescript
export interface Character {
  id: string;
  worldId: string;
  name: string;
  avatar?: string;
  age: number;
  gender: Gender;
  profession: Profession;
  /** 第一人称生平简介，CoC 车卡风格。 */
  biography: string;
  locationId: string;
  personality: Personality;
  vitals: Vitals;
  emotion: Emotion;
  abilities: Ability[];
  shortMemory: Memory[];
  longMemory: Memory[];
  relations: Record<string, Relation>;
  currentAction?: OngoingAction;
  lastThought?: AgentThought;
  /**
   * 角色的活动处节点（工作/学习/日常活动地点）。
   * 来源是 character 配置文件，运行时由 tick 注入，不写入 DB。
   */
  activityNodeId?: string | null;
  /**
   * 角色的休息处节点（睡眠/私人时间地点）。
   * 来源是 character 配置文件，运行时由 tick 注入，不写入 DB。
   */
  restNodeId?: string | null;
  sleepWindow?: SleepWindow;
}
```

- [ ] **Step 3: Update AggregatedFacts in facts.ts**

Replace `homeNodeId` + `homeNodeName` with activity/rest equivalents:
```typescript
export interface AggregatedFacts {
  activityNodeId: string | null;
  activityNodeName: string | null;
  restNodeId: string | null;
  restNodeName: string | null;
  hoursAtCurrentLocation: number;
  lastAction?: {
    type: ActionType;
    freeText?: string;
    tick: Tick;
    success: boolean;
  };
  lastRestTick?: Tick;
  lastEatTick?: Tick;
  todayActionCounts: Partial<Record<ActionType, number>>;
}
```

- [ ] **Step 4: Update DeriveFactsInput in facts.ts**

Replace `homeNodeId` with `activityNodeId` + `restNodeId`:
```typescript
export interface DeriveFactsInput {
  character: Character;
  nodes: MapNode[];
  currentTick: Tick;
  recentThoughts: AgentThought[];
  activityNodeId: string | null;
  restNodeId: string | null;
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: errors only in files that still reference `homeNodeId` / `homeNodeName` (to be fixed in later tasks)

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/engine/facts.ts
git commit -m "feat: add identity fields to Character, split homeNodeId into activityNodeId + restNodeId in Facts"
```

---

### Task 3: Config Schema — Update CharacterTemplateSchema

**Files:**
- Modify: `src/config/schemas.ts:91-103`

- [ ] **Step 1: Update imports**

Add `PROFESSIONS, GENDERS` to the import from `@/domain/enums` at line 7:
```typescript
import { NODE_TAGS, OBJECTIVE_RELATION_KINDS, PROFESSIONS, GENDERS } from "@/domain/enums";
```

- [ ] **Step 2: Rewrite CharacterTemplateSchema**

Replace lines 91-103:
```typescript
export const CharacterTemplateSchema: z.ZodType<CharacterTemplate> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatar: z.string().optional(),
  age: z.number().int().min(1).max(120),
  gender: z.enum(GENDERS),
  profession: z.enum(PROFESSIONS),
  biography: z.string().min(1),
  activityNodeId: z.string().min(1).nullable().optional(),
  restNodeId: z.string().min(1).nullable().optional(),
  sleepWindow: SleepWindowSchema.optional(),
  personality: PersonalitySchema,
  abilities: z.array(AbilitySchema),
  relations: z.record(z.string(), RelationSchema),
});
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: errors about missing fields in Character (config/types.ts Omit chain will pull new fields through)

- [ ] **Step 4: Commit**

```bash
git add src/config/schemas.ts
git commit -m "feat: update CharacterTemplateSchema with identity fields and dual-location"
```

---

### Task 4: Config Loader Tests — Update to cover new required fields

**Files:**
- Modify: `src/config/loader.test.ts:46-52` (validChar fixture)
- Modify: `src/config/loader.test.ts:125-150` (existing tests)

- [ ] **Step 1: Update validChar fixture**

Replace the `validChar` constant:
```typescript
const validChar = {
  id: "char-test",
  name: "测试君",
  age: 25,
  gender: "male" as const,
  profession: "farmer" as const,
  biography: "私はテストキャラクターです。",
  personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
  abilities: [],
  relations: {},
};
```

- [ ] **Step 2: Replace homeNodeId tests with new field tests**

Replace the two `homeNodeId` tests (lines 134-150) with:
```typescript
it("activityNodeId 和 restNodeId 字段可选", () => {
  // 缺失：仍能加载
  writeChar("no-loc", validChar);
  const a = loadAllCharacters();
  expect(a[0].activityNodeId).toBeUndefined();
  expect(a[0].restNodeId).toBeUndefined();

  // 提供：正确解析
  writeChar("with-loc", {
    ...validChar,
    id: "char-l",
    activityNodeId: "node-farm",
    restNodeId: "node-home",
  });
  const all = loadAllCharacters();
  const withLoc = all.find((c) => c.id === "char-l");
  expect(withLoc?.activityNodeId).toBe("node-farm");
  expect(withLoc?.restNodeId).toBe("node-home");
});

it("缺少必填字段 biography 被拒", () => {
  const { biography: _, ...noBio } = validChar;
  writeChar("no-bio", noBio);
  expect(() => loadAllCharacters()).toThrow(/biography/);
});

it("profession 不是枚举值被拒", () => {
  writeChar("bad-prof", { ...validChar, profession: "astronaut" });
  expect(() => loadAllCharacters()).toThrow(/profession/);
});

it("age 超出范围被拒", () => {
  writeChar("bad-age", { ...validChar, age: 0 });
  expect(() => loadAllCharacters()).toThrow(/age/);
});
```

- [ ] **Step 3: Run loader tests**

Run: `npx vitest run src/config/loader.test.ts`
Expected: PASS (all tests including new ones)

- [ ] **Step 4: Commit**

```bash
git add src/config/loader.test.ts
git commit -m "test: update loader tests for identity fields"
```

---

### Task 5: Facts — Update deriveAggregatedFacts implementation

**Files:**
- Modify: `src/engine/facts.ts:52-119`

- [ ] **Step 1: Update function body**

Replace the function body to use activityNodeId/restNodeId:
```typescript
export function deriveAggregatedFacts(input: DeriveFactsInput): AggregatedFacts {
  const { character, nodes, currentTick, recentThoughts, activityNodeId, restNodeId } = input;

  const activityNodeName = activityNodeId
    ? (nodes.find((n) => n.id === activityNodeId)?.name ?? null)
    : null;
  const restNodeName = restNodeId
    ? (nodes.find((n) => n.id === restNodeId)?.name ?? null)
    : null;

  // 找最近一次成功 move...
  let sinceTick = 0;
  let foundMove = false;
  for (const t of recentThoughts) {
    if (t.action.type === "move" && t.success) {
      sinceTick = t.tick;
      foundMove = true;
      break;
    }
  }
  const hoursAtCurrentLocation = foundMove
    ? Math.max(0, currentTick - sinceTick)
    : currentTick;

  let lastRestTick: Tick | undefined;
  let lastEatTick: Tick | undefined;
  for (const t of recentThoughts) {
    if (
      lastRestTick === undefined &&
      (t.action.type === "rest" || t.action.type === "sleep") &&
      t.success
    ) {
      lastRestTick = t.tick;
    }
    if (lastEatTick === undefined && t.action.type === "eat" && t.success) {
      lastEatTick = t.tick;
    }
    if (lastRestTick !== undefined && lastEatTick !== undefined) break;
  }

  const todayActionCounts: Partial<Record<ActionType, number>> = {};
  const cutoff = currentTick - TODAY_WINDOW;
  for (const t of recentThoughts) {
    if (t.tick < cutoff) break;
    todayActionCounts[t.action.type] =
      (todayActionCounts[t.action.type] ?? 0) + 1;
  }

  const head = character.lastThought ?? recentThoughts[0];
  const lastAction = head
    ? {
        type: head.action.type,
        freeText: head.action.freeText,
        tick: head.tick,
        success: head.success,
      }
    : undefined;

  return {
    activityNodeId,
    activityNodeName,
    restNodeId,
    restNodeName,
    hoursAtCurrentLocation,
    lastAction,
    lastRestTick,
    lastEatTick,
    todayActionCounts,
  };
}
```

- [ ] **Step 2: Update facts test (baseCharacter + baseNodes)**

Read `src/engine/facts.test.ts`, update the `baseCharacter` fixture to include new required fields:
```typescript
const baseCharacter: Character = {
  id: "char-x",
  worldId: "w",
  name: "测试角色",
  age: 30,
  gender: "male",
  profession: "farmer",
  biography: "テスト",
  locationId: "node-here",
  personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
  vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
  emotion: { mood: 0, stress: 0, social_satiety: 0 },
  abilities: [],
  shortMemory: [],
  longMemory: [],
  relations: {},
};
```

Update test calls from `homeNodeId` to `activityNodeId`/`restNodeId`. Search for `homeNodeId` in the test file and replace accordingly:
```
homeNodeId: "node-home" → activityNodeId: "node-home", restNodeId: "node-home"
```

And assertion `facts.homeNodeName` → `facts.activityNodeName` / `facts.restNodeName`.

- [ ] **Step 3: Run facts tests**

Run: `npx vitest run src/engine/facts.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/engine/facts.ts src/engine/facts.test.ts
git commit -m "feat: update deriveAggregatedFacts for activityNodeId + restNodeId"
```

---

### Task 6: Actions — Add study, update work/move hints

**Files:**
- Modify: `src/engine/actions.ts:84-320`

- [ ] **Step 1: Update imports**

Add `Profession` to the domain enums import:
```typescript
import type { ActionType, Profession } from "@/domain/enums";
import { BLOOD_RELATION_KINDS } from "@/domain/enums";
```

- [ ] **Step 2: Update homeNodeId references to restNodeId/activityNodeId**

At line 96, replace:
```typescript
const homeNodeId = facts?.homeNodeId ?? null;
```
with:
```typescript
const restNodeId = facts?.restNodeId ?? null;
const activityNodeId = facts?.activityNodeId ?? null;
```

- [ ] **Step 3: Update move hints (lines 128-130)**

Replace the home hint logic:
```typescript
const isRest = restNodeId !== null && n.id === restNodeId;
if (isRest && (restNeeded || sleepStuckOutside)) {
  hint = `⭐ ${hint}——这是你的休息处，可以休息`;
} else if (activityNodeId !== null && n.id === activityNodeId && !restNeeded && !sleepStuckOutside) {
  hint = `${hint}（你的活动处）`;
} else if (
  tooLongHere &&
  (n.tags.includes("residence") || n.tags.includes("park"))
) {
  hint = `${hint}（你已在此地待 ${stayHours} 小时，换个环境是合理的）`;
}
```

- [ ] **Step 4: Replace work/education block (lines 221-223) with identity-aware work + study**

Replace:
```typescript
// 工作 / 学习：教育场所
if (here.tags.includes("education")) {
  opts.push({ type: "work", hint: "学习/工作。" });
}
```
with:
```typescript
// 工作：在活动处且非学生/无业时可用
const isAtActivity = activityNodeId !== null && here.id === activityNodeId;
if (isAtActivity && self.profession !== "student" && self.profession !== "unemployed") {
  opts.push({ type: "work", hint: `工作（${self.profession}）。` });
}

// 学习：学生身份在活动处可用
if (isAtActivity && self.profession === "student") {
  opts.push({ type: "study", hint: "学习。" });
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: remaining errors in downstream files (tick, decideForCharacter, prompt, profile-pane, execute) that still reference old field names

- [ ] **Step 6: Commit**

```bash
git add src/engine/actions.ts
git commit -m "feat: add study action, update work/move to use activityNodeId + restNodeId"
```

---

### Task 7: Execute — Add study case to executeActions

**Files:**
- Modify: `src/engine/execute.ts:548-571` (work/read/observe/use_ability/interact_object case block)
- Modify: `src/engine/execute.ts:598-612` (humanVerb function)

- [ ] **Step 1: Add "study" to the multi-action case block**

At line 550, add `"study"`:
```typescript
case "study":
case "work":
case "read":
case "observe":
case "use_ability":
case "interact_object": {
  const here = nodeById.get(actor.locationId);
  events.push(
    makeEvent({
      worldId,
      tick,
      category: "action",
      description: `${actor.name} ${humanVerb(action.type)}：${
        action.freeText ?? "（默不作声）"
      }`,
      participants: [actor.id],
      scope: "node",
      nodeId: here?.id ?? actor.locationId,
      intensity: 1,
    }),
  );
  break;
}
```

- [ ] **Step 2: Add "study" to humanVerb**

At line 600, add:
```typescript
case "study":
  return "在学习";
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add src/engine/execute.ts
git commit -m "feat: add study action execution"
```

---

### Task 8: Tick Engine — Replace buildHomeMap with dual maps

**Files:**
- Modify: `src/engine/tick.ts:171` (homeMap → activityMap + restMap)
- Modify: `src/engine/tick.ts:280-291` (injection + facts call)
- Modify: `src/engine/tick.ts:558-568` (buildHomeMap → buildActivityNodeMap + buildRestNodeMap)

- [ ] **Step 1: Replace buildHomeMap call at line 171**

```typescript
const activityMap = buildActivityNodeMap();
const restMap = buildRestNodeMap();
```

- [ ] **Step 2: Update the per-character injection block (lines 280-291)**

```typescript
const activityNodeId = activityMap.get(c.id) ?? null;
const restNodeId = restMap.get(c.id) ?? null;
c.activityNodeId = activityNodeId;
c.restNodeId = restNodeId;
const sleepWindow = sleepWindowMap.get(c.id) ?? DEFAULT_SLEEP_WINDOW;
c.sleepWindow = sleepWindow;
const isSleepHour = inSleepWindow(baseTime.hour, sleepWindow);
const facts = deriveAggregatedFacts({
  character: c,
  nodes,
  currentTick: fromTick,
  recentThoughts,
  activityNodeId,
  restNodeId,
});
```

- [ ] **Step 3: Update salvage decision context (lines 444-461 in tick.ts)**

Replace:
```typescript
const homeNodeId = homeMap.get(input.character.id) ?? null;
```
with:
```typescript
const salvageActivityId = activityMap.get(input.character.id) ?? null;
const salvageRestId = restMap.get(input.character.id) ?? null;
```
And the `deriveAggregatedFacts` call — replace `homeNodeId` with `activityNodeId: salvageActivityId, restNodeId: salvageRestId`.
And the `llmSalvageDecide` character override — replace `homeNodeId` with `activityNodeId: salvageActivityId, restNodeId: salvageRestId`.

- [ ] **Step 4: Replace buildHomeMap function (lines 558-568)**

```typescript
function buildActivityNodeMap(): Map<string, string> {
  const m = new Map<string, string>();
  try {
    for (const tpl of loadAllCharacters()) {
      if (tpl.activityNodeId) m.set(tpl.id, tpl.activityNodeId);
    }
  } catch {
    // configs 目录不可读时静默
  }
  return m;
}

function buildRestNodeMap(): Map<string, string> {
  const m = new Map<string, string>();
  try {
    for (const tpl of loadAllCharacters()) {
      if (tpl.restNodeId) m.set(tpl.id, tpl.restNodeId);
    }
  } catch {
    // configs 目录不可读时静默
  }
  return m;
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: errors only in decideForCharacter.ts, addCharacter.ts, prompt.ts, profile-pane.tsx

- [ ] **Step 6: Commit**

```bash
git add src/engine/tick.ts
git commit -m "feat: replace buildHomeMap with buildActivityNodeMap + buildRestNodeMap"
```
```

---

### Task 9: decideForCharacter — Same dual-map update

**Files:**
- Modify: `src/engine/decideForCharacter.ts:57-67` (buildHomeMap)
- Modify: `src/engine/decideForCharacter.ts:115-134` (injection + facts call)

- [ ] **Step 1: Replace buildHomeMap function**

```typescript
function buildActivityNodeMap(): Map<string, string> {
  const m = new Map<string, string>();
  try {
    for (const tpl of loadAllCharacters()) {
      if (tpl.activityNodeId) m.set(tpl.id, tpl.activityNodeId);
    }
  } catch {
    /* configs 不可读时静默 */
  }
  return m;
}

function buildRestNodeMap(): Map<string, string> {
  const m = new Map<string, string>();
  try {
    for (const tpl of loadAllCharacters()) {
      if (tpl.restNodeId) m.set(tpl.id, tpl.restNodeId);
    }
  } catch {
    /* configs 不可读时静默 */
  }
  return m;
}
```

- [ ] **Step 2: Update injection block (lines 115-134)**

```typescript
const fromTick = world.currentTick;
const activityMap = buildActivityNodeMap();
const restMap = buildRestNodeMap();
const activityNodeId = activityMap.get(c.id) ?? null;
const restNodeId = restMap.get(c.id) ?? null;
c.activityNodeId = activityNodeId;
c.restNodeId = restNodeId;
const sleepWindow = getSleepWindow(c.id);
c.sleepWindow = sleepWindow;

// 1. perception...
const tickEvents = loadEventsAtTick(worldId, fromTick);
const perceptions = dispatchPerception(nodes, characters, tickEvents);
const perceived = perceptions.get(c.id) ?? [];

// 2. facts + options
const sinceTick = Math.max(0, fromTick - FACTS_LOOKBACK_TICKS);
const recentThoughts = loadRecentThoughts(worldId, c.id, sinceTick);
const facts = deriveAggregatedFacts({
  character: c,
  nodes,
  currentTick: fromTick,
  recentThoughts,
  activityNodeId,
  restNodeId,
});
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: errors only in addCharacter.ts, prompt.ts, profile-pane.tsx

- [ ] **Step 4: Commit**

```bash
git add src/engine/decideForCharacter.ts
git commit -m "feat: update decideForCharacter for dual-location maps"
```

---

### Task 10: addCharacterToWorld — Spawn point with restNodeId

**Files:**
- Modify: `src/engine/addCharacter.ts:88-102` (spawn logic)
- Modify: `src/engine/addCharacter.ts:149` (db insert)

- [ ] **Step 1: Update spawn point logic**

Replace `tpl.homeNodeId` with `tpl.restNodeId` at lines 88-102:
```typescript
} else if (tpl.restNodeId) {
    const home = db
      .select({ id: schema.nodes.id })
      .from(schema.nodes)
      .where(
        and(
          eq(schema.nodes.worldId, worldId),
          eq(schema.nodes.id, tpl.restNodeId),
        ),
      )
      .get();
    if (home) {
      entryNodeId = home.id;
    }
  }
```

- [ ] **Step 2: Update the comment about spawn logic (line 68-70)**

Replace:
```typescript
// 4. 解析落点：显式 > 角色家 > 世界 entry。
// 默认落点改为角色的 homeNodeId（若该节点存在于世界），避免新角色一上来就被
// 卡在车站、必须先长途回家——会把作息从第一天就打乱。
```
with:
```typescript
// 4. 解析落点：显式 > 角色休息处 > 世界 entry。
// 默认落点改为角色的 restNodeId（若该节点存在于世界），避免新角色一上来就被
// 卡在车站、必须先长途回家——会把作息从第一天就打乱。
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: errors only in prompt.ts, profile-pane.tsx

- [ ] **Step 4: Commit**

```bash
git add src/engine/addCharacter.ts
git commit -m "feat: use restNodeId as default spawn point in addCharacterToWorld"
```

---

### Task 11: LLM Prompt — Update characterBlock + buildUserPrompt

**Files:**
- Modify: `src/llm/prompt.ts:613-639` (characterBlock)
- Modify: `src/llm/prompt.ts:908-956` (buildUserPrompt — homeNodeName references)

- [ ] **Step 1: Rewrite characterBlock to include identity + bio + dual locations**

Replace lines 613-639:
```typescript
function characterBlock(
  character: Character,
  nodes: MapNode[],
  sleepWindow: SleepWindow,
): string {
  const lines: string[] = [
    "你的自我认知：",
    `- 名字：${character.name}`,
    `- 年龄：${character.age} 岁`,
    `- 性别：${character.gender === "male" ? "男" : character.gender === "female" ? "女" : "其他"}`,
    `- 身份：${PROFESSION_LABELS[character.profession] ?? character.profession}`,
  ];
  const actNode = character.activityNodeId
    ? nodes.find((n) => n.id === character.activityNodeId)
    : undefined;
  const restNode = character.restNodeId
    ? nodes.find((n) => n.id === character.restNodeId)
    : undefined;
  if (actNode) {
    lines.push(`- 你的活动处：${actNode.name} [${actNode.id}]`);
  }
  if (restNode) {
    lines.push(`- 你的休息处：${restNode.name} [${restNode.id}]`);
  }
  lines.push(`- 作息窗口：${formatSleepWindow(sleepWindow)}`);
  lines.push(`- 生平简介：${character.biography}`);
  lines.push("- 性格特征（用文字描述，**禁止在 reasoning 里写数值**）：");
  for (const s of describePersonality(character.personality)) {
    lines.push(`  · ${s}`);
  }
  lines.push(
    character.abilities.length > 0
      ? `- 能力：${character.abilities.map((a) => `${a.kind}(tier ${a.tier})`).join("、")}`
      : "- 能力：（无值得一提的特殊能力）",
  );
  return lines.join("\n");
}
```

- [ ] **Step 2: Add PROFESSION_LABELS map + update ACTION_NAMES**

Before the `characterBlock` function, add PROFESSION_LABELS and update ACTION_NAMES to include `study`:

```typescript
const PROFESSION_LABELS: Record<Profession, string> = {
  farmer: "农民", rancher: "牧场主", fisherman: "渔夫", lumberjack: "伐木工", hunter: "猎人",
  chef: "厨师", baker: "面包师", brewer: "酿酒师",
  blacksmith: "铁匠", carpenter: "木匠", tailor: "裁缝",
  merchant: "商人", grocer: "杂货店主", innkeeper: "旅店老板",
  doctor: "医生", nurse: "护士", teacher: "教师", librarian: "图书管理员",
  priest: "神官", mailman: "邮递员", mayor: "镇长官", student: "学生", unemployed: "无业",
};
```

In ACTION_NAMES (around line 413), add after `read: "阅读"`:
```typescript
  study: "学习",
```

- [ ] **Step 3: Add Profession to imports at top of prompt.ts**

```typescript
import type { ActionType, Profession } from "@/domain/enums";
```

Then define the label map as:
```typescript
const PROFESSION_LABELS: Record<Profession, string> = {
  farmer: "农民", rancher: "牧场主", fisherman: "渔夫", lumberjack: "伐木工", hunter: "猎人",
  chef: "厨师", baker: "面包师", brewer: "酿酒师",
  blacksmith: "铁匠", carpenter: "木匠", tailor: "裁缝",
  merchant: "商人", grocer: "杂货店主", innkeeper: "旅店老板",
  doctor: "医生", nurse: "护士", teacher: "教师", librarian: "图书管理员",
  priest: "神官", mailman: "邮递员", mayor: "镇长官", student: "学生", unemployed: "无业",
};
```

- [ ] **Step 4: Update buildUserPrompt homeNodeName references**

At line 908-909, replace:
```typescript
if (facts.homeNodeName) {
    lines.push(`你的常规作息：${winText} 在 ${facts.homeNodeName} 休息。`);
  } else {
    lines.push(`你的常规作息：${winText}（未设定固定住所）。`);
  }
```
with:
```typescript
if (facts.restNodeName) {
    lines.push(`你的常规作息：${winText} 在 ${facts.restNodeName} 休息。`);
  } else {
    lines.push(`你的常规作息：${winText}（未设定固定住所）。`);
  }
```

At lines 953-955, replace:
```typescript
if (fatigueUrgent && !hereCanRest(here)) {
    lines.push(
      `⚠ 你过度疲惫但当前位置不能休息${
        facts.homeNodeName ? `，应优先 move 回 ${facts.homeNodeName}` : "，应优先 move 回有床的住所"
      }。`,
    );
  }
```
with:
```typescript
if (fatigueUrgent && !hereCanRest(here)) {
    lines.push(
      `⚠ 你过度疲惫但当前位置不能休息${
        facts.restNodeName ? `，应优先 move 回 ${facts.restNodeName}` : "，应优先 move 回有床的住所"
      }。`,
    );
  }
```

- [ ] **Step 5: Update prompt test fixtures**

Read `src/llm/prompt.test.ts` and update any `Character` fixtures to include new required fields. Search for `homeNodeId` references in the file and update.

- [ ] **Step 6: Run prompt tests**

Run: `npx vitest run src/llm/prompt.test.ts`
Expected: PASS (or FAIL with specific fixture issues to fix)

- [ ] **Step 7: Fix any test failures, then commit**

```bash
git add src/llm/prompt.ts src/llm/prompt.test.ts
git commit -m "feat: update LLM prompts with identity fields and dual-location"
```

---

### Task 12: Config Files — Rewrite all 12 character JSONs

**Files:**
- Modify: `configs/characters/char-genjo.json`
- Modify: `configs/characters/char-ito-chie.json`
- Modify: `configs/characters/char-kimura-fumiko.json`
- Modify: `configs/characters/char-nakamura-shizuka.json`
- Modify: `configs/characters/char-saito-ishi.json`
- Modify: `configs/characters/char-suzuki-kotone.json`
- Modify: `configs/characters/char-suzuki-misaki.json`
- Modify: `configs/characters/char-takahashi-tetsuya.json`
- Modify: `configs/characters/char-tanaka-daichi.json`
- Modify: `configs/characters/char-tanaka-hana.json`
- Modify: `configs/characters/char-tanaka-yota.json`
- Modify: `configs/characters/char-yamada-ryuichi.json`

- [ ] **Step 1: Rewrite char-genjo.json**

```json
{
  "id": "char-genjo",
  "name": "玄丈",
  "avatar": "🧙",
  "age": 68,
  "gender": "male",
  "profession": "priest",
  "biography": "私は玄丈。この町のはずれの塔で一人、星を読み、町の平穏を祈っている。若い頃は各地を遍歴したが、気づけばここが終の棲家となった。誰にも言えない秘密を幾つも抱えている。",
  "activityNodeId": "node-wizard-tower",
  "restNodeId": "node-wizard-tower",
  "sleepWindow": { "start": 2, "duration": 6 },
  "personality": { "ei": -3, "sn": -3, "tf": -1, "jp": 1 },
  "abilities": [],
  "relations": {
    "char-saito-ishi": { "kinds": ["friend"], "affection": 1, "note": "古い友人", "since": 0, "lastInteractionTick": 0 }
  }
}
```

- [ ] **Step 2: Rewrite char-ito-chie.json**

```json
{
  "id": "char-ito-chie",
  "name": "伊藤千恵",
  "avatar": "🛒",
  "age": 38,
  "gender": "female",
  "profession": "grocer",
  "biography": "伊藤千恵です。雑貨屋を切り盛りしています。夫を三年前に亡くし、一人で店を続けてきました。噂話が大好きで、町の誰よりも早く新しい情報を仕入れる自信があります。",
  "activityNodeId": "node-general-store-quarters",
  "restNodeId": "node-general-store-quarters",
  "sleepWindow": { "start": 22, "duration": 8 },
  "personality": { "ei": 2, "sn": 0, "tf": -2, "jp": -1 },
  "abilities": [],
  "relations": {}
}
```

- [ ] **Step 3: Rewrite char-kimura-fumiko.json**

```json
{
  "id": "char-kimura-fumiko",
  "name": "木村文子",
  "avatar": "📚",
  "age": 35,
  "gender": "female",
  "profession": "librarian",
  "biography": "木村文子と申します。図書館の司書をしております。本に囲まれて育ったため、人と話すより本を読む方が得意です。でも最近はもう少し外の世界を知りたいと思い始めています。",
  "activityNodeId": "node-library-quarters",
  "restNodeId": "node-library-quarters",
  "sleepWindow": { "start": 0, "duration": 8 },
  "personality": { "ei": -2, "sn": 1, "tf": 2, "jp": 2 },
  "abilities": [],
  "relations": {
    "char-saito-ishi": { "kinds": ["friend"], "affection": 1, "note": "よく本を借りに来る", "since": 0, "lastInteractionTick": 0 }
  }
}
```

- [ ] **Step 4: Rewrite char-nakamura-shizuka.json**

```json
{
  "id": "char-nakamura-shizuka",
  "name": "中村静香",
  "avatar": "🍶",
  "age": 32,
  "gender": "female",
  "profession": "innkeeper",
  "biography": "中村静香だよ。居酒屋をやってる。明るく振る舞ってるけど、実は結構神経質なところもあるんだよね。店に来るお客さんの笑顔が何よりのエネルギー。",
  "activityNodeId": "node-izakaya-quarters",
  "restNodeId": "node-izakaya-quarters",
  "sleepWindow": { "start": 2, "duration": 8 },
  "personality": { "ei": 3, "sn": -1, "tf": -3, "jp": 0 },
  "abilities": [],
  "relations": {
    "char-takahashi-tetsuya": { "kinds": ["friend"], "affection": 2, "note": "よく飲みに来る常連", "since": 0, "lastInteractionTick": 0 }
  }
}
```

- [ ] **Step 5: Rewrite char-saito-ishi.json**

```json
{
  "id": "char-saito-ishi",
  "name": "斉藤医師",
  "avatar": "🏥",
  "age": 50,
  "gender": "male",
  "profession": "doctor",
  "biography": "私は斉藤。この町で二十年医者をやっている。父も医者だった。患者の笑顔が何よりの報酬だ。腕は確かだと自負しているが、最近は体力の衰えを感じることもある。",
  "activityNodeId": "node-doctor-house",
  "restNodeId": "node-doctor-house",
  "sleepWindow": { "start": 22, "duration": 8 },
  "personality": { "ei": 0, "sn": 2, "tf": 3, "jp": 3 },
  "abilities": [],
  "relations": {
    "char-genjo": { "kinds": ["friend"], "affection": 1, "note": "古い友人", "since": 0, "lastInteractionTick": 0 },
    "char-kimura-fumiko": { "kinds": ["friend"], "affection": 1, "note": "図書館でよく会う", "since": 0, "lastInteractionTick": 0 }
  }
}
```

- [ ] **Step 6: Rewrite char-suzuki-kotone.json**

```json
{
  "id": "char-suzuki-kotone",
  "name": "铃木琴音",
  "avatar": "🎨",
  "age": 28,
  "gender": "female",
  "profession": "tailor",
  "biography": "鈴木琴音です。裁縫が得意で、町の人たちの服を繕ったり作ったりしています。美咲は妹で、一緒に牧場に住んでいます。小さい頃から手先が器用で、絵を描くのも好きです。",
  "activityNodeId": "node-ranch-house",
  "restNodeId": "node-ranch-house",
  "sleepWindow": { "start": 23, "duration": 8 },
  "personality": { "ei": -1, "sn": -2, "tf": 0, "jp": -2 },
  "abilities": [],
  "relations": {
    "char-suzuki-misaki": { "kinds": ["sister", "colleague"], "affection": 3, "note": "妹で牧場仲間", "since": 0, "lastInteractionTick": 0 }
  }
}
```

- [ ] **Step 7: Rewrite char-suzuki-misaki.json**

```json
{
  "id": "char-suzuki-misaki",
  "name": "铃木美咲",
  "avatar": "🧑‍🌾",
  "age": 25,
  "gender": "female",
  "profession": "farmer",
  "biography": "鈴木美咲！牧場で働いてるよ。姉の琴音と二人で頑張ってる。体を動かすのが大好きで、朝早く起きるのは全然苦じゃない。動物たちも家族同然だよ。",
  "activityNodeId": "node-ranch-house",
  "restNodeId": "node-ranch-house",
  "sleepWindow": { "start": 21, "duration": 8 },
  "personality": { "ei": 1, "sn": 2, "tf": -1, "jp": -1 },
  "abilities": [],
  "relations": {
    "char-suzuki-kotone": { "kinds": ["sister", "colleague"], "affection": 3, "note": "姉で牧場仲間", "since": 0, "lastInteractionTick": 0 }
  }
}
```

- [ ] **Step 8: Rewrite char-takahashi-tetsuya.json**

```json
{
  "id": "char-takahashi-tetsuya",
  "name": "高桥铁也",
  "avatar": "🔨",
  "age": 40,
  "gender": "male",
  "profession": "blacksmith",
  "biography": "高橋鉄也だ。鍛冶屋をやってる。親父の代から続く店で、農具の修理から包丁研ぎまで何でもこなす。無口だって言われるけど、手を動かしてる時が一番落ち着くんだ。",
  "activityNodeId": "node-blacksmith-quarters",
  "restNodeId": "node-blacksmith-quarters",
  "sleepWindow": { "start": 21, "duration": 8 },
  "personality": { "ei": -1, "sn": 2, "tf": 2, "jp": 3 },
  "abilities": [],
  "relations": {
    "char-nakamura-shizuka": { "kinds": ["friend"], "affection": 2, "note": "居酒屋の常連", "since": 0, "lastInteractionTick": 0 }
  }
}
```

- [ ] **Step 9: Rewrite char-tanaka-daichi.json**

```json
{
  "id": "char-tanaka-daichi",
  "name": "田中大地",
  "avatar": "🧑‍🌾",
  "age": 45,
  "gender": "male",
  "profession": "farmer",
  "biography": "田中大地だ。代々この町で農業を営んでいる。花とは二十年来の夫婦で、息子の陽太も今年で高校を卒業だ。厳しいことは言わないが、家族を大切に思っている。",
  "activityNodeId": "node-farmhouse",
  "restNodeId": "node-farmhouse",
  "sleepWindow": { "start": 20, "duration": 8 },
  "personality": { "ei": 0, "sn": 2, "tf": 1, "jp": 2 },
  "abilities": [],
  "relations": {
    "char-tanaka-hana": { "kinds": ["spouse", "colleague"], "affection": 3, "note": "妻", "since": 0, "lastInteractionTick": 0 },
    "char-tanaka-yota": { "kinds": ["son"], "affection": 3, "note": "息子", "since": 0, "lastInteractionTick": 0 }
  }
}
```

- [ ] **Step 10: Rewrite char-tanaka-hana.json**

```json
{
  "id": "char-tanaka-hana",
  "name": "田中花",
  "avatar": "👩‍🍳",
  "age": 42,
  "gender": "female",
  "profession": "chef",
  "biography": "田中花です。農家の台所を預かっています。料理は祖母から教わりました。大地とは若い頃に出会って、陽太を授かりました。家族が元気でいることが何よりの幸せです。",
  "activityNodeId": "node-farmhouse",
  "restNodeId": "node-farmhouse",
  "sleepWindow": { "start": 20, "duration": 8 },
  "personality": { "ei": 1, "sn": 0, "tf": -2, "jp": 1 },
  "abilities": [],
  "relations": {
    "char-tanaka-daichi": { "kinds": ["spouse", "colleague"], "affection": 3, "note": "夫", "since": 0, "lastInteractionTick": 0 },
    "char-tanaka-yota": { "kinds": ["son"], "affection": 3, "note": "息子", "since": 0, "lastInteractionTick": 0 }
  }
}
```

- [ ] **Step 11: Rewrite char-tanaka-yota.json**

```json
{
  "id": "char-tanaka-yota",
  "name": "田中阳太",
  "avatar": "🔬",
  "age": 17,
  "gender": "male",
  "profession": "student",
  "biography": "田中陽太です。高校三年生で、来年は町を出て大学に行きたいと思っています。父と母には感謝してるけど、農業を継ぐかはまだ決められません。最近は化学と生物学にハマっています。",
  "activityNodeId": "node-farmhouse",
  "restNodeId": "node-farmhouse",
  "sleepWindow": { "start": 23, "duration": 8 },
  "personality": { "ei": -1, "sn": -2, "tf": 2, "jp": -1 },
  "abilities": [],
  "relations": {
    "char-tanaka-daichi": { "kinds": ["father"], "affection": 3, "note": "父", "since": 0, "lastInteractionTick": 0 },
    "char-tanaka-hana": { "kinds": ["mother"], "affection": 3, "note": "母", "since": 0, "lastInteractionTick": 0 }
  }
}
```

- [ ] **Step 12: Rewrite char-yamada-ryuichi.json**

```json
{
  "id": "char-yamada-ryuichi",
  "name": "山田竜一",
  "avatar": "🎣",
  "age": 55,
  "gender": "male",
  "profession": "fisherman",
  "biography": "山田竜一だ。もう五十年以上この町の海と川で漁をしている。潮の満ち引きも魚の通り道も全部頭に入っている。若い奴らに教えることも多くなった。そろそろ引退も考えてるが、海が俺を離してくれない。",
  "activityNodeId": "node-fisher-hut",
  "restNodeId": "node-fisher-hut",
  "sleepWindow": { "start": 19, "duration": 8 },
  "personality": { "ei": 1, "sn": 3, "tf": 1, "jp": 2 },
  "abilities": [],
  "relations": {}
}
```

- [ ] **Step 13: Run loader tests to validate all config files**

Run: `npx vitest run src/config/loader.test.ts`
Expected: PASS (all 12 configs valid)

- [ ] **Step 14: Commit**

```bash
git add configs/characters/
git commit -m "feat: rewrite all character configs with identity fields and dual-location"
```

---

### Task 13: Frontend — Update profile-pane.tsx

**Files:**
- Modify: `src/app/_components/profile-pane.tsx:220-263` (character info block)

- [ ] **Step 1: Update profile display**

Replace the homeNodeId display block (lines 239-246) with dual-location display:
```tsx
{character.activityNodeId && nodeById.get(character.activityNodeId) && (
  <span className="text-(--color-pixel-muted)">
    {" · 活动处 "}
    <button
      type="button"
      onClick={() => onJumpToNode(character.activityNodeId!)}
      className="text-(--color-pixel-accent) hover:underline"
    >
      {nodeById.get(character.activityNodeId)?.name}
    </button>
  </span>
)}
{character.restNodeId
  && character.restNodeId !== character.activityNodeId
  && nodeById.get(character.restNodeId) && (
    <span className="text-(--color-pixel-muted)">
      {" · 休息处 "}
      <button
        type="button"
        onClick={() => onJumpToNode(character.restNodeId!)}
        className="text-(--color-pixel-accent) hover:underline"
      >
        {nodeById.get(character.restNodeId)?.name}
      </button>
    </span>
  )}
```

- [ ] **Step 2: Add profession and age display**

Below the name line (before "@ location"), add:
```tsx
<div className="text-game-sm text-(--color-pixel-muted)">
  {PROFESSION_LABELS[character.profession] ?? character.profession}
  {" · "}
  {character.age} 岁
  {" · "}
  {character.gender === "male" ? "男" : character.gender === "female" ? "女" : "其他"}
</div>
```

Add the PROFESSION_LABELS import at the top of the file (or define a small mapping inline).

- [ ] **Step 3: Verify TypeScript + lint**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/profile-pane.tsx
git commit -m "feat: display profession, age, gender, and dual-location in profile pane"
```

---

### Task 14: Fix Remaining Tests — Update all test fixtures with new Character fields

**Files:**
- Glob: `src/**/*.test.ts`

- [ ] **Step 1: Find all Character fixtures missing new fields**

Run: `npx tsc --noEmit 2>&1 | grep "is missing"` or `grep -r "homeNodeId" src/ --include="*.test.ts"`

- [ ] **Step 2: Update each test file**

For each Character fixture in test files, add:
```typescript
age: 30,
gender: "male" as const,
profession: "farmer" as const,
biography: "テスト",
```

Replace `homeNodeId: "node-home"` → `activityNodeId: null, restNodeId: "node-home"` (or appropriate values).

Files likely needing updates:
- `src/engine/tick.test.ts`
- `src/engine/dialog.test.ts`
- `src/llm/decide.test.ts`
- `src/llm/prompt.test.ts`
- `src/engine/vitals-emotion.test.ts`
- `src/app/_lib/profile-format.test.ts`

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "test: update all test fixtures with new Character identity fields"
```

---

### Task 15: Skill Docs — Update agent-world-config reference

**Files:**
- Modify: `.claude/skills/agent-world-config/references/character-schema.md`

- [ ] **Step 1: Update the character schema documentation**

Replace the top-level shape section and the homeNodeId section to reflect the new fields:
```markdown
## Top-level shape

```jsonc
{
  "id": "char-zhangmo",       // kebab-case, must match filename stem
  "name": "张默",              // display name (Chinese OK)
  "avatar": "🤐",              // optional; single emoji works as a sprite stand-in
  "age": 25,                   // 1-120
  "gender": "male",            // "male" | "female" | "other"
  "profession": "farmer",      // from PROFESSIONS enum (23 values)
  "biography": "我是...",       // first-person bio, CoC-style
  "activityNodeId": "node-farm", // optional; where the character goes for work/activity
  "restNodeId": "node-home",    // optional; where the character sleeps
  "personality": { ... },
  "abilities": [],
  "relations": { ... }
}
```
```

Replace the `homeNodeId` section:
```markdown
## `activityNodeId` and `restNodeId`

Both optional. `activityNodeId` is where the character goes for work/study/daily activity; `restNodeId` is where they sleep. They can be the same node. The LLM prompt will tell the character about both locations.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/agent-world-config/references/character-schema.md
git commit -m "docs: update character schema reference for identity system"
```

---

### Task 16: Final Verification

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests PASS

- [ ] **Step 3: If any failures, fix and commit individually**

- [ ] **Step 4: Final status check**

Run: `git status`
Expected: clean working tree
