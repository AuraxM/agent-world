# Character Identity System — Design Spec

## Summary

给角色系统新增身份属性（职业、年龄、性别、生平简介），将 `homeNodeId` 拆分为 `activityNodeId`（活动处）和 `restNodeId`（休息处），并新增 `study` 行动。

## Motivation

当前角色缺少身份属性——没有职业、年龄、性别、生平描述；同时 `homeNodeId` 语义单一（只有"家"），无法区分角色"工作/学习的地方"和"休息的地方"。

## Data Model

### New enums (`src/domain/enums.ts`)

```typescript
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

### Character runtime fields (`src/domain/types.ts`)

**Add:**
- `age: number` — 1..120
- `gender: Gender`
- `profession: Profession`
- `biography: string` — 第一人称生平，CoC 车卡风格
- `activityNodeId?: string | null` — 活动处（工作/学习/日常活动地点），runtime 从 config template 注入，不持久化
- `restNodeId?: string | null` — 休息处（睡眠/私人时间地点），同上

**Remove:**
- `homeNodeId`

### CharacterTemplate (`src/config/types.ts`)

通过 `Omit` 自动继承新增字段（age, gender, profession, biography, activityNodeId, restNodeId 均属于 template 层），同时不再包含 `homeNodeId`。

### Zod Schema (`src/config/schemas.ts`)

- 新增 `age: z.number().int().min(1).max(120)`
- 新增 `gender: z.enum(["male", "female", "other"])`
- 新增 `profession: z.enum([...PROFESSIONS])`
- 新增 `biography: z.string().min(1)`
- 新增 `activityNodeId: z.string().min(1).nullable().optional()`
- 新增 `restNodeId: z.string().min(1).nullable().optional()`
- 移除 `homeNodeId`

### Config files (`configs/characters/*.json`)

All 12 character JSONs rewritten to the new shape. Each gets age, gender, profession, biography, activityNodeId, restNodeId.

### Biography style

First-person Japanese/Chinese narration. Example:

> 私は斉藤。この町で20年医者をやっている。父も医者だった。患者の笑顔が何よりの報酬だ。趣味は釣りで、休みの日はよく桟橋に出かけている。

## Actions

### New action: `study`

- Added to `ACTION_TYPES` enum
- Available when character is at their `activityNodeId` AND profession is `student`
- Effect: reduces stress by 1, yields a memory entry (cosmetic, similar to `read`)

### `work` action

- Existing action, but trigger condition broadened: available when character is at `activityNodeId` (regardless of node tags)
- Previously gated on `education` node tag

### Move hints (`src/engine/actions.ts`)

- High fatigue + not at rest-capable location → suggest `restNodeId`
- Daytime hours + not at activity location + profession != unemployed → suggest `activityNodeId`

## Engine Changes

### Facts module (`src/engine/facts.ts`)

- `DeriveFactsInput` receives `activityNodeId` + `restNodeId` instead of `homeNodeId`
- Output `AggregatedFacts` includes `activityNodeName`, `restNodeName` instead of `homeNodeName`

### Character injection (tick.ts, decideForCharacter.ts)

- `buildHomeMap()` replaced by two maps: `buildActivityNodeMap()` and `buildRestNodeMap()`
- Injection at runtime: `c.activityNodeId`, `c.restNodeId` instead of `c.homeNodeId`

### Spawn point (addCharacter.ts)

- Fallback spawn priority: explicit `entryNodeId` > `restNodeId` (was `homeNodeId`) > first `isEntry` node

## LLM Prompt Changes (`src/llm/prompt.ts`)

- `characterBlock()`: renders profession, age, gender inline; shows biography as a dedicated paragraph; shows activity location and rest location
- User prompt: references `activityNodeName` and `restNodeName` instead of `homeNodeName`

## Frontend (`src/app/_components/profile-pane.tsx`)

- Display: profession, age, gender, activity node name, rest node name
- Remove home node display

## Migration Notes

- `homeNodeId` fully removed; no backward compatibility needed
- Existing DB character records unchanged (these fields were never persisted)
- Config files are the sole source of truth

## Affected Files

| File | Change |
|---|---|
| `src/domain/enums.ts` | Add PROFESSIONS, GENDERS |
| `src/domain/types.ts` | Add/remove fields on Character |
| `src/config/types.ts` | Type passthrough (Omit chain) |
| `src/config/schemas.ts` | Zod validation update |
| `configs/characters/*.json` (12 files) | Rewrite to new shape |
| `src/config/loader.ts` | Type compatibility |
| `src/engine/tick.ts` | homeNodeId → activityNodeId + restNodeId |
| `src/engine/decideForCharacter.ts` | Same |
| `src/engine/addCharacter.ts` | Spawn point logic |
| `src/engine/actions.ts` | Add study; update work/move logic |
| `src/engine/execute.ts` | study execution |
| `src/engine/facts.ts` | Field rename |
| `src/llm/prompt.ts` | Identity + bio + dual-location in prompt |
| `src/app/_components/profile-pane.tsx` | New fields display |
| `.claude/skills/agent-world-config/references/character-schema.md` | Documentation |
