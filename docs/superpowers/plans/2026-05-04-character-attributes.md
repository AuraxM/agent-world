# Character Attributes Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add appearance/intelligence/health base attributes, sickness mechanic, image descriptions, thinking style prompt guidance, and speaking style to NPCs.

**Architecture:** New static attributes (appearance/intelligence/health/speakingStyle) flow from character JSON → Zod validation → DB insert → loadWorld deserialization. Runtime sickness state lives in a JSON column, managed by vitals-emotion.ts. Image descriptions and thinking style/speaking style are prompt-only additions in prompt.ts.

**Tech Stack:** TypeScript, Zod, Drizzle ORM (SQLite), OpenAI-compatible function calling

---

### Task 1: Add new domain types (Sickness interface + Character fields)

**Files:**
- Modify: `src/domain/types.ts`

- [ ] **Step 1: Add Sickness interface and new Character fields**

```typescript
// After the Emotion interface (after line 153):

/** 疾病状态（运行时）。 */
export interface Sickness {
  onsetTick: Tick;
  duration: number; // ticks, 120–840 (1–7 game days)
}
```

In the `Character` interface, add after `abilities` (after line 178):
```typescript
  /** 外貌 1-4 */
  appearance: number;
  /** 思维活跃度 1-4 */
  intelligence: number;
  /** 健康/体质 1-4 */
  health: number;
  /** 当前疾病状态（可选） */
  sickness?: Sickness;
  /** 说话口吻描述（可选，覆盖自动生成） */
  speakingStyle?: string;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: errors about missing fields in other files (CharacterTemplate, store, createWorld, etc.) — this is expected, we'll fix them in subsequent tasks.

---

### Task 2: Add runtime SicknessSchema

**Files:**
- Modify: `src/domain/schemas.ts`

- [ ] **Step 1: Add SicknessSchema**

After the `EmotionSchema` definition (after line 141):
```typescript
export const SicknessSchema = z.object({
  onsetTick: z.number().int().nonnegative(),
  duration: z.number().int().min(120).max(840),
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: same errors as Task 1 (no new errors).

---

### Task 3: Add sickness to CharacterTemplate Omit

**Files:**
- Modify: `src/config/types.ts`

- [ ] **Step 1: Add `sickness` to the Omit list**

In `src/config/types.ts`, add `"sickness"` to the Omit union:
```typescript
export type CharacterTemplate = Omit<
  Character,
  | "worldId"
  | "locationId"
  | "vitals"
  | "emotion"
  | "sickness"
  | "shortMemory"
  | "dailyMemory"
  | "longMemory"
  | "currentAction"
  | "lastThought"
  | "lastSleepTick"
  | "money"
  | "incomeLevel"
  | "expenseExempt"
> & {
  initialMoney?: number;
  incomeMultiplier?: number;
  expenseExempt?: boolean;
};
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: errors reduced (sickness no longer required in CharacterTemplate). Remaining errors will be about missing DB columns, store fields, and createWorld fields.

---

### Task 4: Add new fields to CharacterTemplateSchema (config validation)

**Files:**
- Modify: `src/config/schemas.ts`

- [ ] **Step 1: Add appearance, intelligence, health, speakingStyle to the config schema**

In `src/config/schemas.ts`, add to `CharacterTemplateSchema` after the `abilities` line:

```typescript
  appearance: z.number().int().min(1).max(4),
  intelligence: z.number().int().min(1).max(4),
  health: z.number().int().min(1).max(4),
  speakingStyle: z.string().optional(),
```

Insert after `abilities: z.array(AbilitySchema),` (line 148):
```typescript
  appearance: z.number().int().min(1).max(4),
  intelligence: z.number().int().min(1).max(4),
  health: z.number().int().min(1).max(4),
  speakingStyle: z.string().optional(),
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: CharacterTemplateSchema type errors resolved. Remaining errors in DB/store/createWorld.

---

### Task 5: Add new columns to DB characters table

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Add columns to the characters table definition**

In `src/db/schema.ts`, add after the `incomeMultiplier` line (81):
```typescript
    appearance: integer("appearance").notNull().default(2),
    intelligence: integer("intelligence").notNull().default(2),
    health: integer("health").notNull().default(2),
    sicknessJson: text("sickness_json"),
    speakingStyle: text("speaking_style"),
```

- [ ] **Step 2: Push DB schema migration**

Run: `npx drizzle-kit push`
Expected: SQLite tables updated with new columns.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: DB-related errors resolved. Remaining errors in store.ts and createWorld.ts.

---

### Task 6: Update loadWorld to read new columns

**Files:**
- Modify: `src/engine/store.ts`

- [ ] **Step 1: Add deserialization in loadWorld character mapping**

In the `loadWorld()` function, in `charRows.map()`, add after `lastSleepTick: c.lastSleepTick,` (line 102):
```typescript
    appearance: c.appearance,
    intelligence: c.intelligence,
    health: c.health,
    sickness: c.sicknessJson ? JSON.parse(c.sicknessJson) : undefined,
    speakingStyle: c.speakingStyle ?? undefined,
```

- [ ] **Step 2: Add sicknessJson to saveWorld update**

In the `saveWorld()` function, in the character update `.set({})` block, add after `lastSleepTick: c.lastSleepTick,` (line 149):
```typescript
          sicknessJson: c.sickness ? JSON.stringify(c.sickness) : null,
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: store.ts type errors resolved. Remaining errors in createWorld.ts.

---

### Task 7: Update createWorld to insert new columns

**Files:**
- Modify: `src/engine/createWorld.ts`

- [ ] **Step 1: Add new fields to the DB insert**

In the `tx.insert(schema.characters).values({})` block, add after `incomeMultiplier,` (line 187):
```typescript
            appearance: m.tpl.appearance,
            intelligence: m.tpl.intelligence,
            health: m.tpl.health,
            sicknessJson: null,
            speakingStyle: m.tpl.speakingStyle ?? null,
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: all type errors resolved. Clean compile.

---

### Task 8: Add checkSickness function to vitals-emotion

**Files:**
- Modify: `src/engine/vitals-emotion.ts`

- [ ] **Step 1: Add checkSickness function at end of file**

```typescript
// ---- sickness ----

export interface SicknessCheckInput {
  characters: Character[];
  worldId: string;
  tick: number;
}

/**
 * 每日一次（tick % 120 === 0）判定生病：
 * - 基础概率由 health 决定：4→2%, 3→5%, 2→10%, 1→20%
 * - vitals 越线修正：fatigue >= 12 && capTicks > 0 → ×1.5
 *                     hunger >= 12 && capTicks > 0 → ×1.5
 *                     hygiene >= 12 → ×1.3
 * - 最终概率上限 50%
 * - 命中后 mood -= 1，duration 随机 1-7 天（120-840 ticks）
 * - 到期自动恢复：mood += 1
 */
export function checkSickness(input: SicknessCheckInput): WorldEvent[] {
  const { characters, worldId, tick } = input;
  const inner: WorldEvent[] = [];

  for (const c of characters) {
    // Recovery check
    if (c.sickness && tick >= c.sickness.onsetTick + c.sickness.duration) {
      c.sickness = undefined;
      c.emotion.mood = clamp(c.emotion.mood + 1, -4, 4);
      inner.push(makeInnerEvent({
        worldId, tick, charId: c.id,
        description: "病好了，身体恢复了。",
        intensity: 1,
      }));
      continue;
    }

    // Already sick — no new sickness roll
    if (c.sickness) continue;

    // Base probability from health
    const baseProb: Record<number, number> = { 1: 0.20, 2: 0.10, 3: 0.05, 4: 0.02 };
    let prob = baseProb[c.health] ?? 0.10;

    // Vital modifiers
    if (c.vitals.fatigue >= 12 && (c.vitals.fatigueCapTicks ?? 0) > 0) prob *= 1.5;
    if (c.vitals.hunger >= 12 && (c.vitals.hungerCapTicks ?? 0) > 0) prob *= 1.5;
    if (c.vitals.hygiene >= 12) prob *= 1.3;

    prob = Math.min(prob, 0.50);

    if (Math.random() < prob) {
      const days = 1 + Math.floor(Math.random() * 7); // 1-7
      c.sickness = {
        onsetTick: tick,
        duration: days * 120,
      };
      c.emotion.mood = clamp(c.emotion.mood - 1, -4, 4);
      inner.push(makeInnerEvent({
        worldId, tick, charId: c.id,
        description: "生病了，身体不适。",
        intensity: 3,
      }));
    }
  }

  return inner;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

---

### Task 9: Integrate sickness into tick loop

**Files:**
- Modify: `src/engine/tick.ts`

- [ ] **Step 1: Import checkSickness**

Change the import from `./vitals-emotion` (line 33) to include `checkSickness`:
```typescript
import { decayVitals, evolveEmotions, checkSickness } from "./vitals-emotion";
```

- [ ] **Step 2: Add daily sickness check after vitals decay**

After `allEvents.push(...decayVitals(...))` (line 248), add:
```typescript
  // 1.5. Daily sickness check
  if (fromTick % 120 === 0) {
    allEvents.push(...checkSickness({ characters, worldId, tick: fromTick }));
  }
```

- [ ] **Step 3: Add fatigue acceleration during sickness in decayVitals call**

No changes needed in tick.ts for this — the fatigue acceleration goes in decayVitals itself. See next step.

- [ ] **Step 4: Add fatigue doubling during sickness in decayVitals**

In `src/engine/vitals-emotion.ts`, inside `decayVitals()`, in the character loop where fatigue is incremented (lines 204-208), wrap the fatigue increment:

Find:
```typescript
        c.vitals.fatigue = Math.min(
          VITAL_MAX,
          c.vitals.fatigue + fatigueIncrement(c.vitals.fatigue, evenHour),
        );
```

Replace with:
```typescript
        const baseIncrement = fatigueIncrement(c.vitals.fatigue, evenHour);
        const sicknessMultiplier = c.sickness ? 2 : 1;
        c.vitals.fatigue = Math.min(
          VITAL_MAX,
          c.vitals.fatigue + baseIncrement * sicknessMultiplier,
        );
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

---

### Task 10: Add buildImage function and prompt changes

**Files:**
- Modify: `src/llm/prompt.ts`

- [ ] **Step 1: Add buildImage function after the emotion labels (after SOCIAL_WORDS, line 395)**

```typescript
// ---------------------------------------------------------------------------
// image description (形象)
// ---------------------------------------------------------------------------

const APPEARANCE_BASE: Record<number, string> = {
  1: "面容平凡",
  2: "长相普通",
  3: "相貌端正",
  4: "面容出众",
};

export function buildImage(c: Character): string {
  const parts: string[] = [];

  // Base appearance
  parts.push(APPEARANCE_BASE[c.appearance] ?? "长相普通");

  // Physical overlays (vitals)
  if (c.vitals.hygiene >= 10) parts.push("邋遢不洁");
  if (c.vitals.fatigue >= 10) parts.push("两眼无神");
  if (c.vitals.hunger >= 10) parts.push("面有菜色");

  // Psychological overlays (emotion)
  if (c.emotion.mood >= 3) parts.push("神采奕奕");
  if (c.emotion.mood <= -3) parts.push("面色阴郁");
  if (c.emotion.stress >= 3) parts.push("神情紧绷");

  return parts.join("，");
}
```

- [ ] **Step 2: Add intelligence thinking style labels**

After the JP_LABELS block (line 88), add:
```typescript
const INTELLIGENCE_LABELS: Record<number, string> = {
  1: "你不太会转弯，遇事总是走最熟悉的路，很少冒出新的念头。",
  2: "你思维比较直，习惯按部就班。",
  3: "你做事会动脑筋，不是死板的人。",
  4: "你头脑灵活，遇事容易想到不同的做法，做决定时会在 reasoning 中设想多种可能。",
};
```

- [ ] **Step 3: Add intelligence hint + speakingStyle + sickness to buildCharacterStaticBlock**

In `buildCharacterStaticBlock()`, after the personality lines (after `describePersonality` output, line 706), add:
```typescript
  lines.push(
    `- 思维特点：${INTELLIGENCE_LABELS[character.intelligence] ?? INTELLIGENCE_LABELS[2]}`,
  );
  if (character.speakingStyle) {
    lines.push(`- 说话风格：${character.speakingStyle}`);
  }
  if (character.sickness) {
    lines.push("- ⚠ 你正在生病，身体不适。");
  }
```

- [ ] **Step 4: Add image descriptions to peer list in describeRelations**

In `describeRelations()`, change the peer display line (line 205):
```typescript
      return `- ${p.name} —— ${buildImage(p)} —— ${kindsDisplay}，${aff}${noteSuffix}${warn}`;
```

- [ ] **Step 5: Add image to describeRelations in accept decision prompt**

In `buildAcceptDecisionPrompt()`, the `companions` section already calls `describeRelations()` which now includes image. No additional change needed — but verify the line:
```typescript
      lines.push(describeRelations(self, topPeers, tick));
```
already works with the updated `describeRelations`.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

---

### Task 11: Update existing character JSON files with new required fields

**Files:**
- Modify: All `configs/maps/yu-no-tani/characters/*.json` (20 files)

- [ ] **Step 1: Add default values to each character JSON**

Each character JSON needs three new fields. Add after `"abilities": [],`:
```json
    "appearance": 2,
    "intelligence": 2,
    "health": 2,
```

For all 20 character files:
```
char-guji-masayuki.json
char-kishita-michiko.json
char-matsuoka-sayo.json
char-nakamura-yuto.json
char-nogami-takashi.json
char-ogawa-saori.json
char-okubo-kenta.json
char-okubo-miwa.json
char-sato-haru.json
char-shiraishi-aoi.json
char-suzuki-kazuo.json
char-takahashi-ema.json
char-tanaka-yayoi.json
char-tanimura-kinuyo.json
char-tazaki-mamoru.json
char-wakamatsu-ren.json
char-yamada-takafumi.json
char-yamane-kazuma.json
char-yoshida-eiichi.json
char-yumori-kosuke.json
```

- [ ] **Step 2: Validate all character configs**

Run:
```bash
npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/yu-no-tani/manifest.json
for f in configs/maps/yu-no-tani/characters/*.json; do
  npx tsx .claude/skills/agent-world-mod/scripts/validate.ts "$f"
done
```
Expected: all pass validation.

---

### Task 12: Update agent-world-mod skill reference

**Files:**
- Modify: `.claude/skills/agent-world-mod/references/character-schema.md`

- [ ] **Step 1: Add new fields to the top-level shape example**

In the JSON example block, add after `"abilities": [],`:
```jsonc
      "appearance": 2,             // 1-4, 外貌
      "intelligence": 2,           // 1-4, 思维活跃度
      "health": 2,                 // 1-4, 健康/体质
      "speakingStyle": "说话...",  // optional; generated from other attributes
```

- [ ] **Step 2: Add new section documenting these fields after the Abilities/avatars section**

```markdown
## Base attributes (`appearance`, `intelligence`, `health`)

Three required integer attributes, range [1, 4]. 1 = low, 4 = high.

| Attribute | Meaning | Notes |
|-----------|---------|-------|
| `appearance` | 外貌 | Age-appropriate descriptions; 1=平凡, 4=出众 |
| `intelligence` | 思维活跃度 | NOT IQ — 1=木讷/按部就班, 4=头脑灵活/多想法 |
| `health` | 健康/体质 | Affects daily sickness probability; 1=体弱多病, 4=强健 |

### `speakingStyle`

Optional. A single Chinese sentence describing how the character talks, e.g.:
- `"说话慢悠悠，爱唠叨往事，语气温和。"`
- `"话少句短，不绕弯，语气直接。"`

If omitted, the agent-world-mod skill should generate it at creation time from:
age + MBTI ei + MBTI tf + profession + intelligence.

## Character creation order

The agent-world-mod skill must follow this sequence:

1. **Identity** — name, age, gender, profession, origin, biography
2. **Numerical attributes** — personality (ei/sn/tf/jp), appearance, intelligence, health
3. **Derived text** — speakingStyle (from steps 1-2)
4. **Relations**
5. **Locations** — activityNodeId, restNodeId
6. **Other** — sleepWindow, initialMoney, expenseExempt
```

- [ ] **Step 3: Add new fields to the "Common mistakes" section**

Add to the list:
```markdown
- Forgetting `appearance`, `intelligence`, or `health` — all three are required (1-4).
```

---

### Task 13: Final validation

**Files:** None (verification only)

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Run existing tests**

Run: `npx vitest run`
Expected: all existing tests pass.

- [ ] **Step 3: Validate map pack**

Run:
```bash
npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/yu-no-tani/manifest.json
```
Expected: `valid: true` with 20 characters.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add appearance/intelligence/health attributes, sickness system, image descriptions, and speaking style

- Add 3 base attributes (1-4 scale) to Character type, config schema, DB, and store
- Add sickness mechanic: daily probability based on health + vitals, mood penalty, fatigue acceleration
- Add buildImage() function: rule-generated description from appearance + vitals + emotion
- Add intelligence-based thinking style guidance in prompts
- Add speakingStyle field, auto-generated by agent-world-mod skill at creation time
- Update all 20 existing characters with default attribute values
- Update agent-world-mod skill reference with new fields and creation order"
```
