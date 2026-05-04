# Character System Extension: Attributes, Sickness, Image, Thinking Style, Speaking Style

## Overview

Add three base attributes (appearance, intelligence, health), a sickness mechanic, image descriptions visible to nearby characters, thinking-style prompt guidance, and speaking-style generation to the agent-world NPC system.

---

## 1. Base Attributes: appearance / intelligence / health

Three new integer attributes, range [1, 4]. 1 = low, 4 = high.

| Attribute | Meaning | Age-adjusted interpretation |
|-----------|---------|----------------------------|
| `appearance` | 外貌 | Same scale, age colors the qualitative text |
| `intelligence` | 思维活跃度 (not IQ) | 4=灵活的头脑, 1=木讷 |
| `health` | 健康/体质 | Used in sickness probability; age makes high values harder to justify |

### Where they live

| Layer | Location |
|-------|----------|
| Config JSON | `configs/maps/<pack>/characters/*.json` — 3 required fields |
| Config type | `src/config/types.ts` — `CharacterTemplate` includes them (not omitted) |
| Config schema | `src/config/schemas.ts` — `CharacterTemplateSchema` validates `z.number().int().min(1).max(4)` |
| Runtime type | `src/domain/types.ts` — `Character` interface |
| DB schema | `src/db/schema.ts` — `characters` table: 3 new integer columns |
| World creation | `src/engine/createWorld.ts` — pass through from template to DB row |

---

## 2. Sickness System

### Trigger

Once per game day (tick % 120 === 0), for each non-sick character:

```
baseProbability = f(health):
  4 → 2%
  3 → 5%
  2 → 10%
  1 → 20%

Modifiers (multiplicative, cap at 50%):
  fatigue >= 12 && fatigueCapTicks > 0 → × 1.5
  hunger >= 12 && hungerCapTicks > 0    → × 1.5
  hygiene >= 12                         → × 1.3
```

### Effects

- On onset: `mood -= 1` (one-time)
- While sick: fatigue increment doubled at each hour tick (×2 the normal increment)
- Prompt: "你正在生病，身体不适。" in user prompt（不写具体天数）

### Duration

Random 1–7 game days (120–840 ticks), determined at onset.

### Recovery

When `currentTick >= onsetTick + duration`: sickness cleared, `mood += 1`.

### Data shape

```typescript
interface Sickness {
  onsetTick: Tick;
  duration: number; // ticks
}
```

Stored as nullable JSON column `sickness_json` in DB. Runtime: `Character.sickness?: Sickness`.

---

## 3. Image Description (形象)

### Function: `buildImage(character: Character): string`

Rule-generated, single line, no LLM involved.

**Base (appearance):**

| Level | Text |
|-------|------|
| 1 | 面容平凡 / 体态孱弱 |
| 2 | 长相普通 / 身板一般 |
| 3 | 相貌端正 / 身姿挺拔 |
| 4 | 面容出众 / 风姿不凡 |

**Physical overlay (vitals):**

| Condition | Text |
|-----------|------|
| hygiene >= 10 | 邋遢不洁 |
| fatigue >= 10 | 两眼无神 / 步伐沉重 |
| hunger >= 10 | 面有菜色 |

**Psychological overlay (emotion):**

| Condition | Text |
|-----------|------|
| mood >= 3 | 神采奕奕 |
| mood <= -3 | 面色阴郁 |
| stress >= 3 | 神情紧绷 |

Output format: comma-separated descriptors, e.g.:
- "面容出众，神采奕奕"
- "长相普通，面有菜色，神情紧绷"
- "面容平凡，邋遢不洁，两眼无神"

### Usage location

In `describeRelations()` (peer list in user prompt), prepended to each peer entry:
```
- 张默——面容平凡，步伐沉重——你的朋友，有好感
```

---

## 4. Thinking Style (思维活跃度)

### Prompt insertion in `buildCharacterStaticBlock()`

| Level | Text |
|-------|------|
| 4 | 你头脑灵活，遇事容易想到不同的做法，做决定时会在 reasoning 中设想多种可能。 |
| 3 | 你做事会动脑筋，不是死板的人。 |
| 2 | 你思维比较直，习惯按部就班。 |
| 1 | 你不太会转弯，遇事总是走最熟悉的路，很少冒出新的念头。 |

No memory differentiation. Prompt-only.

---

## 5. Speaking Style (说话口吻)

### Two sources, priority: manual > auto-generated

- `speakingStyle?: string` — optional field in character config
- If empty at creation time, the agent-world-mod skill generates it from the character's other attributes

### Auto-generation inputs (synthesized by agent-world-mod skill)

| Factor | Effect |
|--------|--------|
| Age (<18 / 18-30 / 31-50 / 51-70 / 70+) | 稚嫩直白 / 随性现代 / 稳重分寸 / 老派用老话 / 缓慢唠叨念旧 |
| MBTI ei (<= -2 / >= 2) | 话少句短 / 话多爱寒暄 |
| MBTI tf (<= -2 / >= 2) | 语气温和关心人 / 说话直接逻辑优先 |
| Profession | 接地气比喻 / 正式爱解释 / 客气敬语 / 说教感 |
| Intelligence (>= 3 / <= 1) | 措辞丰富会拐弯 / 用词朴素不善表达 |
| Gender + Persona | subtle seasoning (e.g. 少女 vs. 老翁) |

Output: one Chinese sentence, e.g. `说话慢悠悠，爱唠叨往事，语气温和。`

### Storage

Written into the character JSON as `speakingStyle` field. Runtime reads it directly — no live generation.

### Usage in prompt

Inserted in `buildCharacterStaticBlock()`, after personality section:
```
- 说话风格：说话慢悠悠，爱唠叨往事，语气温和。
```

---

## 6. Agent-World-Mod Skill Creation Order

When the skill creates a character, it follows this sequence:

1. **Identity** — name, age, gender, profession, origin, biography
2. **Numerical attributes** — personality (ei/sn/tf/jp), appearance, intelligence, health
3. **Derived text** — speakingStyle (generated from step 1 + 2)
4. **Relations**
5. **Locations** — activityNodeId, restNodeId
6. **Other** — sleepWindow, initialMoney, expenseExempt

---

## 7. Files to Change

| File | Change |
|------|--------|
| `src/domain/types.ts` | Add `appearance`, `intelligence`, `health`, `sickness?`, `speakingStyle?` to `Character`; add `Sickness` interface |
| `src/domain/enums.ts` | No changes |
| `src/domain/schemas.ts` | Add `SicknessSchema` for runtime validation |
| `src/config/types.ts` | `CharacterTemplate` auto-inherits new non-runtime fields via `Omit` |
| `src/config/schemas.ts` | Add `appearance`, `intelligence`, `health`, `speakingStyle` to `CharacterTemplateSchema` |
| `src/db/schema.ts` | Add `appearance`, `intelligence`, `health`, `sicknessJson`, `speakingStyle` columns to `characters` table |
| `src/engine/createWorld.ts` | Pass new fields from template to DB insert |
| `src/engine/vitals-emotion.ts` | Add `checkSickness()` function; accelerate fatigue during sickness |
| `src/engine/tick.ts` | Call `checkSickness()` in daily cycle |
| `src/llm/prompt.ts` | Add `buildImage()`, intelligence hint to `buildCharacterStaticBlock()`, speakingStyle block, sickness context, image in peer descriptions |
| `src/engine/store.ts` | Serialize/deserialize new fields in `saveWorld()`/`loadWorld()` |
| `.claude/skills/agent-world-mod/references/character-schema.md` | Document new fields and creation order |
| `.claude/skills/agent-world-mod/scripts/validate.ts` | No changes (Zod schema handles it) |

## 8. Non-goals

- No memory differentiation by intelligence
- No action restrictions during sickness
- No real-time speaking style generation
- No age-based stat caps (trust the author)
