# Global Events System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add global event/festival system with fixed-date scheduling and LLM context injection, plus fix GAME_EPOCH hardcoding so worlds can start at any date with tick 0 = world start.

**Architecture:** Events are pure JSON data (id/name/description/start/end) loaded from `events.json` per map pack, merged with builtin events (新年) at tick time. The world holds an `epoch` (ms timestamp from manifest.startDate) used for calendar-date calculations. Active events are inserted into `buildUserPrompt` between time and location blocks.

**Tech Stack:** TypeScript, Drizzle ORM (SQLite), Zod schemas

---

### Task 1: Add `epoch` to World — DB schema + type + store

**Files:**
- Modify: `src/db/schema.ts` — add `epoch` column
- Modify: `src/domain/types.ts` — add `epoch` to `World`
- Modify: `src/engine/store.ts` — load/save epoch
- Modify: `src/engine/createWorld.ts` — compute epoch from startDate

- [ ] **Step 1: Add epoch column to worlds table schema**

In `src/db/schema.ts`, add after `currentTick`:

```typescript
epoch: integer("epoch", { mode: "timestamp_ms" })
  .notNull()
  .default(sql`(unixepoch('2026-05-01T00:00:00') * 1000)`),
```

- [ ] **Step 2: Add epoch to World type**

In `src/domain/types.ts`, add to `World` interface:

```typescript
export interface World {
  id: string;
  name: string;
  mapId: string;
  currentTick: Tick;
  epoch: number;  // ms timestamp, world start datetime
  createdAt: number;
  updatedAt: number;
}
```

- [ ] **Step 3: Update store.ts to load/save epoch**

In `src/engine/store.ts`, `loadWorld()` — add to world object:

```typescript
const world: World = {
  id: w.id,
  name: w.name,
  mapId: w.mapId,
  currentTick: w.currentTick,
  epoch: w.epoch,  // new
  createdAt: w.createdAt.getTime(),
  updatedAt: w.updatedAt.getTime(),
};
```

In `saveWorld()` update SET clause — no change needed since epoch is immutable after creation.

- [ ] **Step 4: Update createWorld.ts — compute epoch from startDate, remove dateToTick**

Replace the old `dateToTick` and `GAME_EPOCH` import:

```typescript
// Remove:
// import { GAME_EPOCH } from "@/app/_lib/format";
//
// Replace dateToTick() function with:

/** Compute epoch ms from ISO 8601 startDate, or default to 2026-05-01. */
function computeEpoch(startDate?: string): number {
  if (startDate) {
    const d = new Date(startDate);
    if (isNaN(d.getTime())) {
      throw new Error(`invalid startDate: ${startDate}`);
    }
    return d.getTime();
  }
  // Default: 2026-05-01T00:00:00
  return new Date("2026-05-01T00:00:00").getTime();
}
```

In the transaction INSERT, set `epoch` and remove `initialTick`:

```typescript
const epoch = computeEpoch(manifest.startDate);

// In the insert values:
tx.insert(schema.worlds)
  .values({
    id: worldId,
    name,
    mapId,
    currentTick: 0,  // tick 0 = world start
    epoch,
    createdAt: now,
    updatedAt: now,
  })
  .run();
```

Also update `persistSnapshot` to include `epoch` in the snapshot data — update `WorldSnapshot` type and where it's constructed in `store.ts`:

In `src/domain/types.ts` `WorldSnapshot`:
```typescript
export interface WorldSnapshot {
  worldId: string;
  tick: Tick;
  epoch: number;  // new
  nodes: MapNode[];
  characters: Character[];
  recentEvents: WorldEvent[];
}
```

In `src/engine/store.ts` `persistSnapshot()`:
```typescript
const snap: WorldSnapshot = {
  worldId: loaded.world.id,
  tick: loaded.world.currentTick,
  epoch: loaded.world.epoch,  // new
  nodes: loaded.nodes,
  characters: loaded.characters,
  recentEvents,
};
```

- [ ] **Step 5: Generate DB migration**

```bash
cd E:/Projects/agent-world && npx drizzle-kit generate --name add_world_epoch
```

- [ ] **Step 6: Run migration**

```bash
cd E:/Projects/agent-world && npx drizzle-kit migrate
```

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/domain/types.ts src/engine/store.ts src/engine/createWorld.ts drizzle/
git commit -m "feat: add epoch to world, tick 0 = world start date"
```

---

### Task 2: Update time formatting functions to accept epoch

**Files:**
- Modify: `src/app/_lib/format.ts` — add `epoch` param, remove `GAME_EPOCH` constant
- Modify: `src/app/_lib/format.test.ts` — update tests

- [ ] **Step 1: Rewrite format.ts with epoch parameters**

```typescript
import { TICKS_PER_HOUR } from "@/domain/enums";

const MS_PER_TICK = (60 / TICKS_PER_HOUR) * 60 * 1000;

/** Default epoch when no world is known. */
export const DEFAULT_EPOCH = new Date("2026-05-01T00:00:00").getTime();

export function tickToDate(epoch: number, tick: number): Date {
  return new Date(epoch + tick * MS_PER_TICK);
}

export function formatGameTime(epoch: number, tick: number): string {
  const d = tickToDate(epoch, tick);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

export function formatHHMM(epoch: number, tick: number): string {
  const d = tickToDate(epoch, tick);
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${min}`;
}

export function formatDay(epoch: number, tick: number): string {
  const d = tickToDate(epoch, tick);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}
```

- [ ] **Step 2: Update format.test.ts**

```typescript
import { describe, expect, it } from "vitest";
import { DEFAULT_EPOCH, formatGameTime, formatHHMM, formatDay } from "./format";

const E = DEFAULT_EPOCH;

describe("formatGameTime", () => {
  it("tick 0 = 2026/05/01 00:00", () => {
    expect(formatGameTime(E, 0)).toBe("2026/05/01 00:00");
  });
  it("tick 5 = 1 hour later", () => {
    expect(formatGameTime(E, 5)).toBe("2026/05/01 01:00");
  });
  it("tick 7 = 1h24m later", () => {
    expect(formatGameTime(E, 7)).toBe("2026/05/01 01:24");
  });
  it("tick 120 = 24h later, next day", () => {
    expect(formatGameTime(E, 120)).toBe("2026/05/02 00:00");
  });
});

describe("formatHHMM", () => {
  it("tick 0 = 00:00", () => {
    expect(formatHHMM(E, 0)).toBe("00:00");
  });
  it("tick 5 = 01:00", () => {
    expect(formatHHMM(E, 5)).toBe("01:00");
  });
  it("tick 7 = 01:24", () => {
    expect(formatHHMM(E, 7)).toBe("01:24");
  });
});

describe("formatDay", () => {
  it("tick 0 = 2026/05/01", () => {
    expect(formatDay(E, 0)).toBe("2026/05/01");
  });
  it("tick 120 = 2026/05/02", () => {
    expect(formatDay(E, 120)).toBe("2026/05/02");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd E:/Projects/agent-world && npx vitest run src/app/_lib/format.test.ts
```

Expected: all pass

- [ ] **Step 4: Update all callers of formatGameTime/formatHHMM/formatDay/tickToDate**

Search for all usages and add `epoch` as first parameter:

```bash
cd E:/Projects/agent-world && grep -rn "formatGameTime\|formatHHMM\|formatDay\|tickToDate" src/ --include="*.ts" --include="*.tsx"
```

Update each call site. Key locations:
- `src/engine/tick.ts` — if any (currently none found, tick.ts uses `timeOfDay` which doesn't need epoch)
- `src/app/` — frontend components that display game time

For frontend components, use `DEFAULT_EPOCH` where world epoch isn't available, or pass epoch from the world state.

- [ ] **Step 5: Commit**

```bash
git add src/app/_lib/format.ts src/app/_lib/format.test.ts
git commit -m "refactor: add epoch parameter to time formatting functions"
```

---

### Task 3: Create GlobalEvent domain type and date utilities

**Files:**
- Create: `src/domain/events.ts`

- [ ] **Step 1: Create src/domain/events.ts**

```typescript
import { TICKS_PER_HOUR } from "@/domain/enums";

export interface GlobalEventDef {
  id: string;
  name: string;
  description: string;
  /** "MM-DD" for recurring yearly, or "YYYY-MM-DD" for one-time */
  start: string;
  /** Same format as start; inclusive (event is active on the end date) */
  end: string;
}

const MS_PER_TICK = (60 / TICKS_PER_HOUR) * 60 * 1000;

/** Convert "MM-DD" or "YYYY-MM-DD" to a Date in the given year.
 *  For "YYYY-MM-DD", year is ignored — the date string is used directly. */
function parseEventDate(raw: string, year: number): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(raw + "T00:00:00");
  }
  // "MM-DD" — attach to given year
  return new Date(`${year}-${raw}T00:00:00`);
}

/**
 * Get the active events at a given tick.
 * `events` = all defined events (builtin + mod).
 * `epoch` = world start ms timestamp.
 * `tick` = current tick.
 */
export function getActiveEvents(
  events: GlobalEventDef[],
  epoch: number,
  tick: number,
): GlobalEventDef[] {
  const now = new Date(epoch + tick * MS_PER_TICK);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return events.filter((e) => {
    const startYear = /^\d{4}-\d{2}-\d{2}$/.test(e.start)
      ? 0 // one-time event, year from the string itself
      : today.getFullYear();

    const start = parseEventDate(e.start, startYear);
    // If recurring and the start date has already passed this year,
    // check if we're still within last year's event
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.start) && start > today) {
      // Try previous year
      start.setFullYear(start.getFullYear() - 1);
    }

    const endYear = /^\d{4}-\d{2}-\d{2}$/.test(e.end)
      ? 0
      : start.getFullYear();
    const end = parseEventDate(e.end, endYear);

    // end is inclusive — add one day for the comparison
    const endExclusive = new Date(end);
    endExclusive.setDate(endExclusive.getDate() + 1);

    return today >= start && today < endExclusive;
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/domain/events.ts
git commit -m "feat: add GlobalEvent type and date matching utilities"
```

---

### Task 4: Create builtin events

**Files:**
- Create: `src/engine/events-builtin.ts`

- [ ] **Step 1: Create src/engine/events-builtin.ts**

```typescript
import type { GlobalEventDef } from "@/domain/events";

export const BUILTIN_EVENTS: GlobalEventDef[] = [
  {
    id: "new-year",
    name: "新年",
    description:
      "一年之始，万象更新。街上张灯结彩，人们互相拜年问候。初诣的钟声回荡在城市上空，家家户户享用着御节料理。",
    start: "01-01",
    end: "01-03",
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/events-builtin.ts
git commit -m "feat: add builtin New Year event"
```

---

### Task 5: Create event loader

**Files:**
- Create: `src/config/event-loader.ts`

- [ ] **Step 1: Create src/config/event-loader.ts**

```typescript
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { GlobalEventDef } from "@/domain/events";
import { BUILTIN_EVENTS } from "@/engine/events-builtin";
import { loadManifest } from "./loader";

function configsRoot(): string {
  return (
    process.env.AGENT_WORLD_CONFIGS_DIR ??
    path.resolve(process.cwd(), "configs")
  );
}

function mapsRoot(): string {
  return path.join(configsRoot(), "maps");
}

/** Load mod events from a map pack's events.json file. */
function loadModEvents(packId: string, eventsFile: string): GlobalEventDef[] {
  const filePath = path.join(mapsRoot(), packId, eventsFile);
  if (!existsSync(filePath)) {
    console.warn(`Events file not found: ${filePath}`);
    return [];
  }
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    console.warn(`Events file is not an array: ${filePath}`);
    return [];
  }
  // Basic validation
  return parsed.filter((e: unknown) => {
    if (typeof e !== "object" || e === null) return false;
    const ev = e as Record<string, unknown>;
    if (typeof ev.id !== "string" || typeof ev.name !== "string" ||
        typeof ev.description !== "string" || typeof ev.start !== "string" ||
        typeof ev.end !== "string") {
      console.warn(`Skipping invalid event entry in ${filePath}:`, ev);
      return false;
    }
    return true;
  }) as GlobalEventDef[];
}

/**
 * Load all events for a world: builtin + mod (if manifest.events is set).
 * Mod events with the same id override builtin ones.
 */
export function loadEvents(packId: string): GlobalEventDef[] {
  const manifest = loadManifest(packId);
  const builtin = [...BUILTIN_EVENTS];

  if (!manifest.events) return builtin;

  const modEvents = loadModEvents(packId, manifest.events);

  // Mod events override builtin by id
  for (const mod of modEvents) {
    const idx = builtin.findIndex((b) => b.id === mod.id);
    if (idx >= 0) {
      builtin[idx] = mod;
    } else {
      builtin.push(mod);
    }
  }

  return builtin;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/config/event-loader.ts
git commit -m "feat: add event loader (builtin + mod events.json)"
```

---

### Task 6: Add `events` field to Manifest type and schema

**Files:**
- Modify: `src/config/types.ts`
- Modify: `src/config/schemas.ts`

- [ ] **Step 1: Add events field to Manifest interface**

In `src/config/types.ts`, add after `actions`:

```typescript
/** Path to events.json relative to the map pack directory. */
events?: string;
```

- [ ] **Step 2: Add events field to ManifestSchema**

In `src/config/schemas.ts`, add after `actions: z.string().optional()`:

```typescript
events: z.string().optional(),
```

- [ ] **Step 3: Commit**

```bash
git add src/config/types.ts src/config/schemas.ts
git commit -m "feat: add events field to manifest config"
```

---

### Task 7: Integrate events into tick loop

**Files:**
- Modify: `src/engine/tick.ts`

- [ ] **Step 1: Add event loading and active event calculation in tick()**

In `src/engine/tick.ts`, add import at top:

```typescript
import { loadEvents } from "@/config/event-loader";
import { getActiveEvents } from "@/domain/events";
```

In `tick()` function, after loading manifest (line 221-222), add:

```typescript
// Load events (builtin + mod)
const allEventDefs = loadEvents(world.mapId);
const activeEventDefs = getActiveEvents(allEventDefs, world.epoch, fromTick);
```

Then add `activeEventDefs` to the `DecideInput` interface and pass it through when building decision input.

In `DecideInput` interface (around line 73-90), add:

```typescript
activeEventDefs: import("@/domain/events").GlobalEventDef[];
```

In the decision task (line 566), add:

```typescript
action = await decideFn({
  // ... existing fields ...
  activeEventDefs,
  // ...
});
```

Also add to the `DecideFn` type signature usage.

Pass `activeEventDefs` to all the `decideFn` call sites within `tick.ts` (including the `salvageDecide` wrapper around line 731).

- [ ] **Step 2: Pass activeEventDefs through to llmDecide**

In `src/llm/decide.ts`, the `callLLM` function at line 296 calls `buildUserPrompt`. Add the new parameter:

```typescript
const user = buildUserPrompt({
  character: input.character,
  here: input.here,
  companions: input.companions,
  perceived: input.perceived,
  options: input.options,
  tick: input.tick,
  facts: input.facts,
  language: input.language,
  allCharacters: input.allCharacters,
  nodes: input.nodes,
  activeEventDefs: input.activeEventDefs,  // new
});
```

Also update the salvage decide flow (around line 894) which also calls `buildUserPrompt` — add the same `activeEventDefs` parameter there if the salvage context has access to `input.activeEventDefs`.

- [ ] **Step 3: Commit**

```bash
git add src/engine/tick.ts src/llm/decide.ts
git commit -m "feat: load and pass active events into decision context"
```

---

### Task 8: Inject events into user prompt

**Files:**
- Modify: `src/llm/prompt.ts`

- [ ] **Step 1: Add active events section to buildUserPrompt**

Add to `buildUserPrompt` args:

```typescript
activeEventDefs?: import("@/domain/events").GlobalEventDef[];
```

After the time block (currently around line 1103-1104), before the submit instruction, add:

```typescript
// 8.5. 活跃全局事件
if (activeEventDefs && activeEventDefs.length > 0) {
  const eventLines = activeEventDefs.map((e) => {
    return `${e.name}：${e.description}`;
  });
  lines.push("## ⚠️ 当前全局事件");
  lines.push(eventLines.join("\n\n"));
  lines.push("");
}
```

Move the time block to before events section (so order is: ... → time → events → submit instruction).

Actually, per the spec, events go right after time. Let me check the current prompt structure:

Current order (from buildUserPrompt):
```
0. identity anchor
0.5 character static block
0.6 goals
1. continuity
2. current location
3. vitals
3.1 emotion
3.2 urgency warnings
4. economic state
5. co-located NPCs
6. perceived events
7. memory tiers
8. available options
9. cross-language note
10. arrival intro
11. current time
12. submit action instruction
```

Per the design spec, events go after time:
```
11. current time
11.5. ⚠️ active global events  <-- NEW
12. submit action instruction
```

So implement this between "当前时间" and `submitActionInstruction`:

```typescript
// After the time label line:
lines.push(`当前时间：${timeLabel}`, "");

// Add global events block here:
if (activeEventDefs && activeEventDefs.length > 0) {
  const eventLines = activeEventDefs.map((e) =>
    `${e.name}：${e.description}`
  );
  lines.push("## ⚠️ 当前全局事件");
  for (const line of eventLines) {
    lines.push(line);
  }
  lines.push("");
}

// 末尾仅保留提交指令
lines.push(submitActionInstruction(language));
```

- [ ] **Step 2: Commit**

```bash
git add src/llm/prompt.ts
git commit -m "feat: inject active global events into user prompt context"
```

---

### Task 9: Create example events.json for sakuraba-academy

**Files:**
- Create: `configs/maps/sakuraba-academy/events.json`
- Modify: `configs/maps/sakuraba-academy/manifest.json`

- [ ] **Step 1: Create events.json**

```json
[
  {
    "id": "school-festival",
    "name": "学园祭",
    "description": "一年一度的校园文化祭正在举行，各班级和社团准备了丰富的展示和活动，校园里热闹非凡，到处都是来参观的外校学生和家长。",
    "start": "09-10",
    "end": "09-12"
  },
  {
    "id": "exam-week",
    "name": "考试周",
    "description": "期末考试的紧张气氛笼罩着整个校园，学生们都在抓紧时间复习备考，图书馆和自习室座无虚席。",
    "start": "07-15",
    "end": "07-19"
  },
  {
    "id": "typhoon-closure",
    "name": "台风停课",
    "description": "强台风即将登陆，学校已经宣布停课。暴风雨来袭，所有人都被要求留在室内，不要外出。风声呼啸，雨点猛烈地敲打着窗户。",
    "start": "06-20",
    "end": "06-21"
  },
  {
    "id": "valentine",
    "name": "情人节",
    "description": "今天是情人节，空气中弥漫着甜蜜的气息。学生们在悄悄交换巧克力和礼物，表白的勇气在心中萌芽。",
    "start": "02-14",
    "end": "02-14"
  },
  {
    "id": "school-trip",
    "name": "修学旅行",
    "description": "修学旅行开始了！学生们乘坐新干线前往京都，参观古迹、体验传统文化，这是一年中最期待的集体活动。",
    "start": "05-20",
    "end": "05-23"
  }
]
```

- [ ] **Step 2: Add events field to sakuraba-academy manifest.json**

In `configs/maps/sakuraba-academy/manifest.json`, add:

```json
"events": "events.json",
```

- [ ] **Step 3: Commit**

```bash
git add configs/maps/sakuraba-academy/events.json configs/maps/sakuraba-academy/manifest.json
git commit -m "feat: add sakuraba-academy global events (学园祭, 考试周, 台风, 情人节, 修学旅行)"
```

---

### Task 10: Fix remaining GAME_EPOCH references and verify build

**Files:**
- Various files still referencing `GAME_EPOCH`

- [ ] **Step 1: Find all remaining GAME_EPOCH references**

```bash
cd E:/Projects/agent-world && grep -rn "GAME_EPOCH" src/ --include="*.ts" --include="*.tsx"
```

Expected: only in `src/app/_lib/format.ts` (as removed/renamed). If any other references exist, update them.

- [ ] **Step 2: Run full test suite**

```bash
cd E:/Projects/agent-world && npx vitest run
```

Expected: all existing tests pass, format tests pass with new signatures.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd E:/Projects/agent-world && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: remove all GAME_EPOCH references, finalize epoch migration"
```
