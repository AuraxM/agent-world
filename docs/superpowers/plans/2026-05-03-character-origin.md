# Character Origin (Local vs Visitor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `origin: "local" | "visitor"` to character templates and runtime, with origin-aware spawn defaults and initial vitals.

**Architecture:** New enum field flows from `src/domain/enums.ts` through types, Zod schema, DB schema, Drizzle ORM, world creation, and the config API. Seed script and admin reset remain explicit (no behavioral change for existing configs), while `createWorldFromConfig` defaults spawn/vitals by origin when location is unset.

**Tech Stack:** TypeScript, Zod, Drizzle ORM (SQLite), better-sqlite3

---

### Task 1: Add CHARACTER_ORIGINS enum

**Files:**
- Modify: `src/domain/enums.ts`

- [ ] **Step 1: Add enum after GENDERS block**

At line 63 of `src/domain/enums.ts`, add after the `GENDERS` block:

```ts
export const CHARACTER_ORIGINS = ["local", "visitor"] as const;
export type CharacterOrigin = (typeof CHARACTER_ORIGINS)[number];
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/domain/enums.ts
git commit -m "feat: add CHARACTER_ORIGINS enum (local | visitor)"
```

---

### Task 2: Add origin to runtime Character type

**Files:**
- Modify: `src/domain/types.ts`

- [ ] **Step 1: Import CharacterOrigin**

Add `CharacterOrigin` to the import from `"./enums"` at line 1:

```ts
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
  CharacterOrigin,  // <-- add this
} from "./enums";
```

- [ ] **Step 2: Add origin field to Character interface**

Add after `avatar?: string;` (line 160) in the `Character` interface:

```ts
origin: CharacterOrigin;
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: TypeScript errors about missing `origin` in config types (will be fixed in Task 3).

---

### Task 3: Add origin to CharacterTemplate config type

**Files:**
- Modify: `src/config/types.ts`

- [ ] **Step 1: Ensure origin is NOT in the Omit list**

`CharacterTemplate` is `Omit<Character, "worldId" | "locationId" | ...>`. Since `origin` is NOT in the omit list, it flows through from `Character` automatically. No code change needed — just verify it compiles after Task 4 fixes the schema.

- [ ] **Step 2: Run tsc to verify current errors**

Run: `npx tsc --noEmit`
Expected: errors about `origin` missing in `CharacterTemplateSchema` and DB insert (will be resolved in Tasks 4-6). If `CharacterTemplate` type is fine, the only errors should be in `schemas.ts` and DB-related files.

- [ ] **Step 3: Commit**

```bash
git add src/domain/types.ts
git commit -m "feat: add origin field to Character runtime type"
```

---

### Task 4: Add origin to Zod schema

**Files:**
- Modify: `src/config/schemas.ts`

- [ ] **Step 1: Import CHARACTER_ORIGINS**

Change the import from `@/domain/enums` at line 7 to include `CHARACTER_ORIGINS`:

```ts
import { NODE_TAGS, OBJECTIVE_RELATION_KINDS, PROFESSIONS, GENDERS, CHARACTER_ORIGINS } from "@/domain/enums";
```

- [ ] **Step 2: Add origin to CharacterTemplateSchema**

Add the `origin` field in the object schema after `biography`:

```ts
export const CharacterTemplateSchema: z.ZodType<CharacterTemplate> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatar: z.string().optional(),
  age: z.number().int().min(1).max(120),
  gender: z.enum(GENDERS),
  profession: z.enum(PROFESSIONS),
  biography: z.string().min(1),
  origin: z.enum(CHARACTER_ORIGINS),
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
Expected: still errors in DB migrate/engine (will be resolved next). Schema and types errors should be gone.

- [ ] **Step 4: Commit**

```bash
git add src/config/schemas.ts
git commit -m "feat: add origin field to CharacterTemplateSchema"
```

---

### Task 5: Add origin column to DB schema (Drizzle)

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Add origin column to characters table**

Add the `origin` column after `biography` (line 76-77) in the `characters` table definition:

```ts
origin: text("origin").notNull().default("local"),
```

Insert between `biography` and `locationId`:

```ts
biography: text("biography").notNull().default(""),
origin: text("origin").notNull().default("local"),
```

- [ ] **Step 2: Verify TypeScript compiles for schema.ts**

Run: `npx tsc --noEmit src/db/schema.ts`
Expected: passes (this file has no dependency on the Character type).

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat: add origin column to characters table (Drizzle schema)"
```

---

### Task 6: Add origin column to DB migration

**Files:**
- Modify: `src/db/migrate.ts`

- [ ] **Step 1: Add origin to CREATE TABLE IF NOT EXISTS characters**

In the `characters` CREATE TABLE statement (around line 63), add after `biography`:

```
biography TEXT NOT NULL DEFAULT '',
origin TEXT NOT NULL DEFAULT 'local',
location_id TEXT NOT NULL,
```

- [ ] **Step 2: Add origin to CHARACTERS_NEW_COLUMNS migration array**

Add to the `CHARACTERS_NEW_COLUMNS` array (around line 137):

```ts
{ name: "origin", ddl: "ALTER TABLE characters ADD COLUMN origin TEXT NOT NULL DEFAULT 'local'" },
```

- [ ] **Step 3: Run migration**

```bash
npm run db:migrate
```

Expected: `✓ DB migrated at ./data/agent-world.db` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/db/migrate.ts
git commit -m "feat: add origin column migration for characters table"
```

---

### Task 7: Update createWorldFromConfig for origin-aware spawn and vitals

**Files:**
- Modify: `src/engine/createWorld.ts`

- [ ] **Step 1: Add origin to character insert values**

Add `origin: m.tpl.origin` inside the `tx.insert(schema.characters).values({...})` call (after `biography`):

```ts
biography: m.tpl.biography,
origin: m.tpl.origin,
locationId: m.locationId,
```

- [ ] **Step 2: Add origin-aware default vitals**

Replace the existing vitals default block (lines 120-124):

```ts
// Before:
const vitals: Vitals = {
  hunger: m.vitals?.hunger ?? 0,
  fatigue: m.vitals?.fatigue ?? 0,
  hygiene: m.vitals?.hygiene ?? 0,
};

// After:
const vitals: Vitals = {
  hunger: m.vitals?.hunger ?? (m.tpl.origin === "visitor" ? 1 : 0),
  fatigue: m.vitals?.fatigue ?? (m.tpl.origin === "visitor" ? 2 : 0),
  hygiene: m.vitals?.hygiene ?? 0,
};
```

- [ ] **Step 3: Add origin-aware default spawn location**

Before the current `locationId` fallback logic (line 62), add origin-aware logic. The current code does:
```ts
const loc = m.locationId ?? defaultEntry;
```

Change to use origin-aware default:

```ts
let loc = m.locationId;
if (!loc) {
  // 本地人：优先回家
  if (tpl.origin === "local" && tpl.restNodeId && nodeIds.has(tpl.restNodeId)) {
    loc = tpl.restNodeId;
  }
  // 外来客 / restNodeId 不存在：落入口节点
  if (!loc) {
    loc = defaultEntry;
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: remaining errors only in `addCharacter.ts`, `store.ts`, `seed.ts`, character configs.

- [ ] **Step 5: Commit**

```bash
git add src/engine/createWorld.ts
git commit -m "feat: origin-aware spawn and default vitals in createWorldFromConfig"
```

---

### Task 8: Update addCharacterToWorld for visitor vitals

**Files:**
- Modify: `src/engine/addCharacter.ts`

- [ ] **Step 1: Add origin to character insert values**

Add `origin: tpl.origin` inside the `tx.insert(schema.characters).values({...})` call (after `biography`):

```ts
biography: tpl.biography,
origin: tpl.origin,
locationId: entryNodeId!,
```

- [ ] **Step 2: Add origin-aware default vitals**

Replace the existing vitals default block (lines 123-127):

```ts
// Before:
const vitals: Vitals = {
  hunger: input.vitals?.hunger ?? 0,
  fatigue: input.vitals?.fatigue ?? 0,
  hygiene: input.vitals?.hygiene ?? 0,
};

// After:
const vitals: Vitals = {
  hunger: input.vitals?.hunger ?? (tpl.origin === "visitor" ? 1 : 0),
  fatigue: input.vitals?.fatigue ?? (tpl.origin === "visitor" ? 2 : 0),
  hygiene: input.vitals?.hygiene ?? 0,
};
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: remaining errors only in `store.ts`, `seed.ts`, character configs.

- [ ] **Step 4: Commit**

```bash
git add src/engine/addCharacter.ts
git commit -m "feat: origin-aware default vitals in addCharacterToWorld"
```

---

### Task 9: Update loadWorld to read origin from DB

**Files:**
- Modify: `src/engine/store.ts`

- [ ] **Step 1: Add origin to character mapping in loadWorld**

In `loadWorld()`, add `origin` to the `characters` array mapping (after `biography`, around line 81):

```ts
const characters: Character[] = charRows.map((c) => ({
  id: c.id,
  worldId: c.worldId,
  name: c.name,
  avatar: c.avatar ?? undefined,
  age: c.age,
  gender: c.gender as Character["gender"],
  profession: c.profession as Character["profession"],
  biography: c.biography,
  origin: c.origin as Character["origin"],
  locationId: c.locationId,
  ...
}));
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: remaining errors only in `seed.ts`, character configs, and test files.

- [ ] **Step 3: Commit**

```bash
git add src/engine/store.ts
git commit -m "feat: read origin column when loading characters from DB"
```

---

### Task 10: Update configs/characters API to return origin

**Files:**
- Modify: `src/app/api/configs/characters/route.ts`

- [ ] **Step 1: Add origin to response**

Change the mapping in the `GET` handler:

```ts
const characters = loadAllCharacters().map((c) => ({
  id: c.id,
  name: c.name,
  avatar: c.avatar ?? null,
  origin: c.origin,
  personality: c.personality,
  relationCount: Object.keys(c.relations).length,
}));
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: remaining errors only in seed.ts, character configs, tests.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/configs/characters/route.ts
git commit -m "feat: return origin field in configs/characters API"
```

---

### Task 11: Add origin to all 13 character configs

**Files:**
- Modify: `configs/characters/char-yumori-kosuke.json`
- Modify: `configs/characters/char-yumori-ayako.json`
- Modify: `configs/characters/char-wakamatsu-naoki.json`
- Modify: `configs/characters/char-ogawa-misaki.json`
- Modify: `configs/characters/char-tanimura-kinuyo.json`
- Modify: `configs/characters/char-matsuoka-sayo.json`
- Modify: `configs/characters/char-shiraishi-aoi.json`
- Modify: `configs/characters/char-guji-san.json`
- Modify: `configs/characters/char-nogami-prof.json`
- Modify: `configs/characters/char-tazaki-mamoru.json`
- Modify: `configs/characters/char-sato-haru.json`
- Modify: `configs/characters/char-yoshida-driver.json`
- Modify: `configs/characters/char-yamane-kazuma.json`

- [ ] **Step 1: Add `"origin": "local"` to each character config**

For each file, add `"origin": "local"` after the `"profession"` line. Example for `char-yumori-kosuke.json`:

```json
"profession": "innkeeper",
"origin": "local",
"biography": "我是汤守浩介...",
```

Repeat for all 13 files.

- [ ] **Step 2: Validate all character configs**

```bash
for f in configs/characters/*.json; do
  npx tsx .claude/skills/agent-world-config/scripts/validate.ts "$f"
done
```

Expected: all 13 pass with `✓ ... passes CharacterTemplateSchema`.

- [ ] **Step 3: Run tsc**

```bash
npx tsc --noEmit
```

Expected: all errors resolved. Only remaining errors (if any) in test fixtures.

- [ ] **Step 4: Commit**

```bash
git add configs/characters/*.json
git commit -m "feat: add origin: local to all 13 character configs"
```

---

### Task 12: Update loader test fixtures

**Files:**
- Modify: `src/config/loader.test.ts`

- [ ] **Step 1: Add origin to validChar fixture**

Add `origin: "local" as const` to the `validChar` object (line 46):

```ts
const validChar = {
  id: "char-test",
  name: "测试君",
  age: 25,
  gender: "male" as const,
  profession: "farmer" as const,
  origin: "local" as const,
  biography: "私はテストキャラクターです。",
  personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
  abilities: [],
  relations: {},
};
```

- [ ] **Step 2: Add test for invalid origin**

Add a new test case in the `loadAllCharacters` describe block:

```ts
it("origin 不是枚举值被拒", () => {
  writeChar("bad-origin", { ...validChar, origin: "alien" });
  expect(() => loadAllCharacters()).toThrow(/origin/);
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/config/loader.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/config/loader.test.ts
git commit -m "test: add origin field to config loader test fixtures"
```

---

### Task 13: Run full test suite and verify

**Files:** (no changes)

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass (existing test files should still pass).

- [ ] **Step 2: Run full tsc check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Run migration and seed**

```bash
npm run db:migrate && npm run seed
```

Expected:
```
✓ DB migrated at ./data/agent-world.db
  tables: ...
✓ Seeded world "world-yu-no-tani" from map "yu-no-tani"
  characters: 13
  default entry: node-bus-stop
```

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "chore: all tests pass after origin field migration"
```

---

### Task 14: Update agent-world-config SKILL.md

**Files:**
- Modify: `.claude/skills/agent-world-config/SKILL.md`

- [ ] **Step 1: Add origin to identity fields list**

In the "Characters" section under "Hard invariants", add `origin` to the identity fields list (around line 81):

```markdown
- **Identity fields** — all required, all validated:
  - `age`: integer 1–120.
  - `gender`: `"male"` | `"female"` | `"other"` (from `GENDERS` enum).
  - `profession`: one of the 23 `PROFESSIONS` values. Do not invent. Check `src/domain/enums.ts` for the authoritative list.
  - `origin`: `"local"` | `"visitor"` (from `CHARACTER_ORIGINS` enum). Determines spawn behavior, default vitals, and narrative framing. See design principles below.
  - `biography`: first-person narrative, non-empty. See style guide below.
```

- [ ] **Step 2: Add origin design principles section**

After the "Character design principles" heading (before "Biography"), add:

```markdown
### Origin

Start every character design by deciding their origin. This affects everything: biography tone, relation density, node assignments, and vitals.

| Aspect | `"local"` | `"visitor"` |
|--------|-----------|-------------|
| Biography | Rooted in the place, multi-generational, "I've been here my whole life" tone | Arrived / moved / passing through, outside perspective, "I came here because..." narrative |
| Relations | 3-6 deep connections, blood ties, long-standing bonds | 0-2 light connections, often one indirect contact |
| `restNodeId` | Should point to their own residence | Optional; may point to inn or temporary lodging |
| `activityNodeId` | Local workplace / usual spot | May be absent or point to transient locations |
| Initial spawn | At `restNodeId` (home) | At entry node (bus stop etc.) |
| Initial vitals | Fresh: hunger 0, fatigue 0 | Travel-worn: hunger 1, fatigue 2 |
| Seed cast | All locals in CAST | 1-2 visitors placed as "recently arrived"; rest in candidate pool for mid-game placement |
```

- [ ] **Step 3: Update "Adding a single character" workflow**

In step 1 of "Adding a single character or node", update the character bullet:

```markdown
- For a **character**: origin (local/visitor), name, age, gender, profession (from `PROFESSIONS` enum), MBTI archetype, `activityNodeId`, `restNodeId`, `sleepWindow`, and target relations to existing characters.
```

- [ ] **Step 4: Add CHARACTER_ORIGINS to quick reference**

After the GENDERS quick reference, add:

```markdown
## Quick reference: CHARACTER_ORIGINS enum

`"local"` | `"visitor"`
```

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/agent-world-config/SKILL.md
git commit -m "docs: add origin field design workflow to agent-world-config skill"
```

---

### Task 15: Update character-schema.md reference

**Files:**
- Modify: `.claude/skills/agent-world-config/references/character-schema.md`

- [ ] **Step 1: Add origin to top-level shape**

In the JSONC example of top-level shape, add `"origin": "local",` after `"profession"`:

```jsonc
"profession": "farmer",      // from PROFESSIONS enum (23 values)
"origin": "local",           // "local" | "visitor" from CHARACTER_ORIGINS enum
"biography": "我是...",       // first-person bio, CoC-style; required
```

- [ ] **Step 2: Add origin section under Identity fields**

After the `profession` bullet in "Identity fields" (around line 95), add:

```markdown
### `origin`
Required. One of `"local"` or `"visitor"` from the `CHARACTER_ORIGINS` enum.
- `"local"`: Born/rooted in the world. Should have deep relations (3-6) and a fixed residence (`restNodeId`).
- `"visitor"`: Newly arrived or transient. Light relations (0-2), may lack a permanent residence. Spawns at entry node with travel fatigue unless overridden.
```

- [ ] **Step 3: Add origin to common mistakes**

Add to the "Common mistakes" list:

```markdown
- Forgetting `origin` — it's a required field; every character must declare `"local"` or `"visitor"`.
```

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/agent-world-config/references/character-schema.md
git commit -m "docs: document origin field in character-schema reference"
```

---

### Task 16: Final verification — seed and run

**Files:** (no changes)

- [ ] **Step 1: Run db:migrate (idempotent safety check)**

```bash
npm run db:migrate
```

Expected: succeeds without errors.

- [ ] **Step 2: Run seed**

```bash
npm run seed
```

Expected:
```
✓ Seeded world "world-yu-no-tani" from map "yu-no-tani"
  characters: 13
  default entry: node-bus-stop
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Run full tsc check**

```bash
npx tsc --noEmit
```

Expected: zero errors.
