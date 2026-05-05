# Character Notebook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-character notebook (记事本) for scheduling future tasks, with action-based creation, tick-driven cleanup, and context injection into decision/dialog prompts.

**Architecture:** New `NotebookEntry` type on Character, persisted in a separate SQLite table (same pattern as conversations). Pure module `notebook.ts` handles CRUD + time formatting. `add_notebook_entry` action uses `epoch`-aware day/hour/minute conversion. Per-speaker upcoming entries injected into dialog turn prompts (not shared transcript). Expired entries cleaned each tick.

**Tech Stack:** TypeScript, SQLite (Drizzle ORM), Zod, OpenAI function calling

---

### File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/domain/types.ts` | Modify | Add `NotebookEntry` type + `Character.notebook` field |
| `src/domain/schemas.ts` | Modify | Add `NotebookEntrySchema` |
| `src/domain/action-system.ts` | Modify | Add `epoch` to `ActionContext` |
| `src/db/schema.ts` | Modify | Add `notebookEntries` table |
| `src/db/migrations/0004_notebook.sql` | Create | Migration SQL |
| `src/engine/notebook.ts` | Create | Pure module: CRUD, cleanup, formatting |
| `src/engine/notebook.test.ts` | Create | Unit tests for time formatting + filtering |
| `src/engine/actions-builtin.ts` | Modify | Add `addNotebookEntryAction` |
| `src/engine/actions.ts` | Modify | Thread `epoch` through `buildActionContext` |
| `src/engine/store.ts` | Modify | Load/save notebook on world load/save |
| `src/engine/tick.ts` | Modify | Cleanup + inject today entries into DecideInput |
| `src/engine/dialog.ts` | Modify | Per-speaker upcoming entries in turn prompts |
| `src/llm/prompt.ts` | Modify | Accept `upcomingEntries` in prompt builders |
| `src/llm/decide.ts` | Modify | Thread `upcomingEntries` to prompt builders |

---

### Task 1: Domain Types & Schemas

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/schemas.ts`

- [ ] **Step 1: Add `NotebookEntry` interface to types.ts**

In `src/domain/types.ts`, after the `Memory` interface (around line 60), add:

```typescript
/** 记事本条� */
export interface NotebookEntry {
  id: string;
  scheduledTick: Tick;
  content: string;
  createdAt: Tick;
}
```

- [ ] **Step 2: Add `notebook` field to Character**

In the `Character` interface, after `impressionBook` (line 217), add:

```typescript
notebook: NotebookEntry[];
```

And add initial empty array `notebook: []` in `store.ts` `loadWorld` character mapping (line 78-115), after line 115 (`activeConversationIds` line):

```typescript
notebook: [],
```

- [ ] **Step 3: Add `NotebookEntrySchema` to schemas.ts**

In `src/domain/schemas.ts`, after the `SicknessSchema` (around line 148), add:

```typescript
export const NotebookEntrySchema = z.object({
  id: z.string(),
  scheduledTick: z.number().int().nonnegative(),
  content: z.string().min(1).max(500),
  createdAt: z.number().int().nonnegative(),
});
```

- [ ] **Step 4: Commit**

```bash
git add src/domain/types.ts src/domain/schemas.ts src/engine/store.ts
git commit -m "feat: add NotebookEntry type and schema to domain layer"
```

---

### Task 2: DB Schema & Migration

**Files:**
- Create: `src/db/migrations/0004_notebook.sql`
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Write migration SQL**

Create `src/db/migrations/0004_notebook.sql`:

```sql
CREATE TABLE notebook_entries (
  world_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (world_id, character_id, id),
  FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
);
CREATE INDEX notebook_char_idx ON notebook_entries(world_id, character_id);
```

- [ ] **Step 2: Run migration**

```bash
cd E:/Projects/agent-world && npx tsx src/db/migrate.ts
```

Expected: Migration applies successfully, `notebook_entries` table created.

- [ ] **Step 3: Add table to Drizzle schema**

In `src/db/schema.ts`, after the `conversations` table definition (line 249), add:

```typescript
export const notebookEntries = sqliteTable(
  "notebook_entries",
  {
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    characterId: text("character_id").notNull(),
    id: text("id").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.worldId, t.characterId, t.id] }),
    index("notebook_char_idx").on(t.worldId, t.characterId),
  ],
);
```

- [ ] **Step 4: Commit**

```bash
git add src/db/migrations/0004_notebook.sql src/db/schema.ts
git commit -m "feat: add notebook_entries table with migration"
```

---

### Task 3: Notebook Module — Core Functions

**Files:**
- Create: `src/engine/notebook.ts`

- [ ] **Step 1: Create notebook.ts with load/save/delete**

Create `src/engine/notebook.ts`:

```typescript
import { randomUUID } from "node:crypto";
import { db, schema } from "@/db/client";
import { eq } from "drizzle-orm";
import type { NotebookEntry, Tick } from "@/domain/types";
import { TICKS_PER_HOUR } from "@/domain/enums";

const MS_PER_TICK = (60 / TICKS_PER_HOUR) * 60 * 1000; // 720000ms = 12min

// ── Persistence ──

export function loadNotebookEntries(worldId: string): Map<string, NotebookEntry[]> {
  const rows = db
    .select()
    .from(schema.notebookEntries)
    .where(eq(schema.notebookEntries.worldId, worldId))
    .all();
  const out = new Map<string, NotebookEntry[]>();
  for (const r of rows) {
    const entry = JSON.parse(r.payloadJson) as NotebookEntry;
    const arr = out.get(r.characterId) ?? [];
    arr.push(entry);
    out.set(r.characterId, arr);
  }
  return out;
}

export function saveNotebookEntry(
  worldId: string,
  characterId: string,
  entry: NotebookEntry,
): void {
  db
    .insert(schema.notebookEntries)
    .values({
      worldId,
      characterId,
      id: entry.id,
      payloadJson: JSON.stringify(entry),
    })
    .onConflictDoUpdate({
      target: [schema.notebookEntries.worldId, schema.notebookEntries.characterId, schema.notebookEntries.id],
      set: { payloadJson: JSON.stringify(entry) },
    })
    .run();
}

export function deleteNotebookEntry(
  worldId: string,
  characterId: string,
  entryId: string,
): void {
  db
    .delete(schema.notebookEntries)
    .where(
      eq(schema.notebookEntries.id, entryId),
    )
    .run();
}

export function cleanExpiredEntries(worldId: string, currentTick: Tick): void {
  const rows = db
    .select()
    .from(schema.notebookEntries)
    .where(eq(schema.notebookEntries.worldId, worldId))
    .all();
  for (const r of rows) {
    const entry = JSON.parse(r.payloadJson) as NotebookEntry;
    if (entry.scheduledTick < currentTick) {
      db
        .delete(schema.notebookEntries)
        .where(eq(schema.notebookEntries.id, r.id))
        .run();
    }
  }
}

// ── Query ──

export function getUpcoming(
  entries: NotebookEntry[],
  fromTick: Tick,
  toTick: Tick,
): NotebookEntry[] {
  return entries
    .filter((e) => e.scheduledTick >= fromTick && e.scheduledTick <= toTick)
    .sort((a, b) => a.scheduledTick - b.scheduledTick);
}

export function getTodayEntries(
  entries: NotebookEntry[],
  currentTick: Tick,
): NotebookEntry[] {
  const dayEnd = currentTick + 24 * TICKS_PER_HOUR;
  return getUpcoming(entries, currentTick, dayEnd);
}

export function getNextHourEntries(
  entries: NotebookEntry[],
  currentTick: Tick,
): NotebookEntry[] {
  const hourEnd = currentTick + TICKS_PER_HOUR;
  return getUpcoming(entries, currentTick, hourEnd);
}

// ── Time Formatting ──

export function formatRelativeTime(
  tick: Tick,
  currentTick: Tick,
  epoch: number,
): string {
  const currentDay = Math.floor(currentTick / (24 * TICKS_PER_HOUR));
  const targetDay = Math.floor(tick / (24 * TICKS_PER_HOUR));
  const date = new Date(epoch + tick * MS_PER_TICK);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  if (targetDay === currentDay) return `${hh}:${mm}`;
  return `第${targetDay}日 ${hh}:${mm}`;
}

export function formatScheduledTime(tick: Tick, epoch: number): string {
  const day = Math.floor(tick / (24 * TICKS_PER_HOUR));
  const date = new Date(epoch + tick * MS_PER_TICK);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `第${day}日 ${hh}:${mm}`;
}

// ── Prompt Helpers ──

export function describeEntries(
  entries: NotebookEntry[],
  currentTick: Tick,
  epoch: number,
): string {
  if (entries.length === 0) return "";
  const lines = entries.map(
    (e) => `- ${formatRelativeTime(e.scheduledTick, currentTick, epoch)} — ${e.content}`,
  );
  const currentDay = Math.floor(currentTick / (24 * TICKS_PER_HOUR));
  const allToday = entries.every(
    (e) => Math.floor(e.scheduledTick / (24 * TICKS_PER_HOUR)) === currentDay,
  );
  const label = allToday ? "今日待办" : "待办";
  return `${label}：\n${lines.join("\n")}`;
}

// ── Action helper ──

/**
 * Convert LLM-provided day/hour/minute to tick.
 * Uses epoch to align clock hour with the game calendar.
 */
export function tickFromDayHourMinute(
  day: number,
  hour: number,
  minute: number,
  epoch: number,
): Tick {
  const dayStartTick = day * 24 * TICKS_PER_HOUR;
  // Find tick within this game day whose Date hours match
  for (let t = dayStartTick; t < dayStartTick + 24 * TICKS_PER_HOUR; t++) {
    const d = new Date(epoch + t * MS_PER_TICK);
    if (d.getHours() === hour && Math.abs(d.getMinutes() - minute) <= 6) {
      return t;
    }
  }
  // Fallback: compute from epoch hour offset
  const epochHour = new Date(epoch).getHours();
  const hourOffset = ((hour - epochHour) % 24 + 24) % 24;
  return dayStartTick + hourOffset * TICKS_PER_HOUR + Math.floor(minute / (60 / TICKS_PER_HOUR));
}

/** Create a unique notebook entry ID. */
export function createEntryId(): string {
  return `nbe-${randomUUID().slice(0, 8)}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/notebook.ts
git commit -m "feat: add notebook module with CRUD, formatting, and time conversion"
```

---

### Task 4: Notebook Module Tests

**Files:**
- Create: `src/engine/notebook.test.ts`

- [ ] **Step 1: Write tests for time formatting and filtering**

Create `src/engine/notebook.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  getUpcoming,
  getTodayEntries,
  getNextHourEntries,
  formatRelativeTime,
  formatScheduledTime,
  describeEntries,
  tickFromDayHourMinute,
} from "./notebook";
import type { NotebookEntry } from "@/domain/types";
import { TICKS_PER_HOUR } from "@/domain/enums";

// Epoch at midnight UTC
const EPOCH = new Date("2026-05-01T00:00:00Z").getTime();

function makeEntry(scheduledTick: number, content: string): NotebookEntry {
  return { id: `nbe-${scheduledTick}`, scheduledTick, content, createdAt: 0 };
}

describe("getUpcoming", () => {
  const entries = [
    makeEntry(10, "a"),
    makeEntry(50, "b"),
    makeEntry(100, "c"),
  ];

  it("returns entries in range inclusive", () => {
    const result = getUpcoming(entries, 10, 50);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("a");
    expect(result[1].content).toBe("b");
  });

  it("returns empty when none in range", () => {
    const result = getUpcoming(entries, 200, 300);
    expect(result).toHaveLength(0);
  });
});

describe("getTodayEntries", () => {
  it("returns entries within 24 game hours from current tick", () => {
    const entries = [
      makeEntry(30, "now"),
      makeEntry(200, "later same day"),
      makeEntry(500, "tomorrow"),
    ];
    const result = getTodayEntries(entries, 20);
    expect(result).toHaveLength(2);
  });
});

describe("getNextHourEntries", () => {
  it("returns entries within 5 ticks (1 game hour)", () => {
    const entries = [
      makeEntry(3, "soon"),
      makeEntry(10, "later"),
    ];
    const result = getNextHourEntries(entries, 0);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("soon");
  });
});

describe("formatRelativeTime", () => {
  it("shows only HH:MM for same day", () => {
    // tick 0 at epoch midnight = 00:00; tick 30 = 06:00
    const result = formatRelativeTime(30, 0, EPOCH);
    expect(result).toBe("06:00");
  });

  it("shows day prefix for different day", () => {
    const result = formatRelativeTime(130, 0, EPOCH);
    expect(result).toMatch(/^第1日 /);
  });
});

describe("formatScheduledTime", () => {
  it("always shows day prefix", () => {
    const result = formatScheduledTime(30, EPOCH);
    expect(result).toMatch(/^第0日 06:00$/);
  });
});

describe("describeEntries", () => {
  it("returns empty string for no entries", () => {
    expect(describeEntries([], 0, EPOCH)).toBe("");
  });

  it("formats entries with relative time", () => {
    const entries = [
      makeEntry(30, "a task"),
      makeEntry(60, "another task"),
    ];
    const result = describeEntries(entries, 0, EPOCH);
    expect(result).toContain("今日待办");
    expect(result).toContain("06:00 — a task");
    expect(result).toContain("12:00 — another task");
  });
});

describe("tickFromDayHourMinute", () => {
  it("converts midnight epoch references", () => {
    const tick = tickFromDayHourMinute(0, 6, 0, EPOCH);
    expect(tick).toBe(30); // 6h * 5 ticks/h
  });

  it("converts cross-day reference", () => {
    const tick = tickFromDayHourMinute(1, 6, 0, EPOCH);
    expect(tick).toBe(150); // (24+6) * 5
  });

  it("rounds minutes to nearest tick", () => {
    const tick = tickFromDayHourMinute(0, 6, 5, EPOCH);
    expect(tick).toBe(30); // 6h05 ≈ 6h00 at 12min granularity
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/engine/notebook.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/engine/notebook.test.ts
git commit -m "test: add notebook module unit tests"
```

---

### Task 5: Add `epoch` to `ActionContext`

**Files:**
- Modify: `src/domain/action-system.ts`
- Modify: `src/engine/actions.ts`
- Modify: `src/engine/tick.ts`
- Modify: `src/engine/decideForCharacter.ts`
- Modify: `src/engine/dialog.ts`

- [ ] **Step 1: Add `epoch` to `ActionContext` interface**

In `src/domain/action-system.ts`, add `epoch: number` to the `ActionContext` interface (after `isSleepHour`):

```typescript
export interface ActionContext {
  worldId: string;
  tick: number;
  epoch: number;       // <-- add this
  self: Character;
  here: MapNode;
  companions: Character[];
  reachable: MapNode[];
  isSleepHour: boolean;
  facts: AggregatedFacts;
}
```

- [ ] **Step 2: Update `buildActionContext` to accept and forward `epoch`**

In `src/engine/actions.ts`, update the function signature and return value:

```typescript
export function buildActionContext(
  character: Character,
  nodes: MapNode[],
  characters: Character[],
  worldId: string,
  tick: number,
  epoch: number,          // <-- add param
  isSleepHour: boolean,
  facts: AggregatedFacts,
  locationOverrides?: ReadonlyMap<string, string>,
): RegistryActionContext {
  const loc = locationOverrides?.get(character.id) ?? character.locationId;
  const here = nodes.find((n) => n.id === loc);
  if (!here) {
    throw new Error(`character ${character.id} located at unknown node ${loc}`);
  }
  const companions = characters.filter(
    (c) => c.id !== character.id &&
    (locationOverrides?.get(c.id) ?? c.locationId) === loc,
  );
  const reachable = nodes.filter((n) => n.id !== loc);
  return {
    worldId,
    tick,
    epoch,                 // <-- add
    self: character,
    here,
    companions,
    reachable,
    isSleepHour,
    facts,
  };
}
```

- [ ] **Step 3: Update all call sites**

In `src/engine/tick.ts`, find two `buildActionContext` calls (around lines 576, 744). Add `world.epoch` as the new 6th argument:

Line ~576:
```typescript
const ctx = buildActionContext(c, nodes, characters, worldId, fromTick, world.epoch, isSleepHour, facts, localLocationMap);
```

Line ~744:
```typescript
const ctx = buildActionContext(input.character, nodes, characters, worldId, fromTick, world.epoch, isSleepHour, facts);
```

In `src/engine/decideForCharacter.ts`, update the `buildActionContext` call:

```typescript
const ctx = buildActionContext(c, nodes, characters, worldId, fromTick, world.epoch, isSleepHour, facts);
```

In `src/engine/dialog.ts`, update 3 inline `actionCtx` / `otherActionCtx` objects to include `epoch`. Find the `runOneTickDialog` function signature (already has `epoch` param). Add `epoch` to each inline object:

Line ~427 (first speaker actionCtx):
```typescript
const actionCtx = {
  worldId: conv.worldId, tick: currentTick, epoch, self: speaker, here: speakerHere,
  companions: [peer],
  reachable: [] as MapNode[],
  isSleepHour: false,
  facts: {} as any,
};
```

Line ~447 (extra round otherActionCtx) — similarly add `epoch`:
```typescript
const otherActionCtx = {
  worldId: conv.worldId, tick: currentTick, epoch, self: other, here: otherHere,
  companions: [otherPeer],
  reachable: [] as MapNode[],
  isSleepHour: false,
  facts: {} as any,
};
```

Line ~325 (executeDialogueAction ctx) — add `epoch`:
```typescript
const ctx = {
  worldId, tick, epoch, self: actor, here,
  companions: [target],
  reachable: [] as MapNode[],
  isSleepHour: false,
  facts: {} as any,
};
```

Note: `executeDialogueAction` also needs `epoch` parameter. Update its signature from:
```typescript
function executeDialogueAction(
  actionType: string, actor: Character, target: Character, params: ActionInput,
  chars: Map<string, Character>, nodeById: Map<string, MapNode>,
  worldId: string, tick: number,
): string | undefined {
```
To:
```typescript
function executeDialogueAction(
  actionType: string, actor: Character, target: Character, params: ActionInput,
  chars: Map<string, Character>, nodeById: Map<string, MapNode>,
  worldId: string, tick: number, epoch: number,
): string | undefined {
```

And update the 3 call sites of `executeDialogueAction` in dialog.ts to pass `epoch`.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/domain/action-system.ts src/engine/actions.ts src/engine/tick.ts src/engine/decideForCharacter.ts src/engine/dialog.ts
git commit -m "feat: add epoch to ActionContext for time-aware action execution"
```

---

### Task 6: `add_notebook_entry` Action

**Files:**
- Modify: `src/engine/actions-builtin.ts`

- [ ] **Step 1: Add the action definition**

In `src/engine/actions-builtin.ts`, add import at top:

```typescript
import { tickFromDayHourMinute, createEntryId, saveNotebookEntry } from "./notebook";
```

Then before `export const BUILTIN_ACTIONS`, add:

```typescript
export const addNotebookEntryAction: ActionDefinition = {
  type: "add_notebook_entry",
  duration: "instant",
  usableInDialogue: true,
  check(_ctx) { return true; },
  hint(ctx) {
    const day = Math.floor(ctx.tick / (24 * TICKS_PER_HOUR));
    const date = new Date(ctx.epoch + ctx.tick * 720000);
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `添加记事本（当前时间：第 ${day} 日 ${hh}:${mm}）
  参数：scheduled_day（目标游戏天）、scheduled_hour（0-23）、scheduled_minute（0-55）、free_text（待办描述）`;
  },
  validateParams(input, ctx) {
    const day = input.scheduled_day as number | undefined;
    const hour = input.scheduled_hour as number | undefined;
    const minute = input.scheduled_minute as number | undefined;
    if (day === undefined || day < 0) return "scheduled_day 需要 >= 0 的整数";
    if (hour === undefined || hour < 0 || hour > 23) return "scheduled_hour 需要在 0-23";
    if (minute === undefined || minute < 0 || minute > 59) return "scheduled_minute 需要在 0-59";
    const scheduledTick = tickFromDayHourMinute(day, hour, minute, ctx.epoch);
    if (scheduledTick <= ctx.tick) return "目标时间必须在当前时间之后";
    return null;
  },
  execute(ctx, input) {
    const day = (input.scheduled_day as number)!;
    const hour = (input.scheduled_hour as number)!;
    const minute = (input.scheduled_minute as number)!;
    const freeText = (input.free_text as string) || "（无描述）";
    const scheduledTick = tickFromDayHourMinute(day, hour, minute, ctx.epoch);
    const entry: import("@/domain/types").NotebookEntry = {
      id: createEntryId(),
      scheduledTick,
      content: freeText,
      createdAt: ctx.tick,
    };
    ctx.self.notebook.push(entry);
    saveNotebookEntry(ctx.worldId, ctx.self.id, entry);
    const timeLabel = formatScheduledTime(scheduledTick, ctx.epoch);
    return {
      memory: `我添加了一条记事：${timeLabel} — ${freeText}`,
      event: {
        category: "inner",
        description: `${ctx.self.name} 在记事本上写了些什么。`,
        intensity: 1,
      },
    };
  },
  extraParams: {
    scheduled_day: { type: "integer", description: "目标游戏天（第 N 日）" },
    scheduled_hour: { type: "integer", description: "目标小时 (0-23)" },
    scheduled_minute: { type: "integer", description: "目标分钟 (0-55)" },
    free_text: { type: "string", description: "待办事项描述" },
  },
  extraRequired: ["scheduled_day", "scheduled_hour", "scheduled_minute", "free_text"],
};
```

- [ ] **Step 2: Register in BUILTIN_ACTIONS**

Add `addNotebookEntryAction` to the `BUILTIN_ACTIONS` array:

```typescript
export const BUILTIN_ACTIONS: ActionDefinition[] = [
  eatAction,
  batheAction,
  restAction,
  workAction,
  thinkAction,
  speakAction,
  sleepAction,
  moveAction,
  waitAction,
  giveAction,
  addNotebookEntryAction,
];
```

Also add import for `formatScheduledTime` from notebook at top:

```typescript
import { tickFromDayHourMinute, createEntryId, saveNotebookEntry, formatScheduledTime } from "./notebook";
```

- [ ] **Step 3: Verify TypeScript compiles + existing tests pass**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: No TS errors, existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/engine/actions-builtin.ts
git commit -m "feat: add add_notebook_entry action"
```

---

### Task 7: Store Integration — Load/Save Notebook

**Files:**
- Modify: `src/engine/store.ts`

- [ ] **Step 1: Load notebook entries on world load**

In `src/engine/store.ts`, add import:

```typescript
import { loadNotebookEntries, saveNotebookEntry } from "./notebook";
```

In `loadWorld` (after character loading loop, after the `lastThought` injection block ~line 126), add:

```typescript
// Load notebook entries
const notebookMap = loadNotebookEntries(worldId);
for (const c of characters) {
  c.notebook = notebookMap.get(c.id) ?? [];
}
```

- [ ] **Step 2: Ensure Character.notebook defaults to [] in mapping**

The `loadWorld` character mapping (around line 78) needs `notebook: []` as a default. Since we set notebook via `loadNotebookEntries` below, add the field at initialization. In `loadWorld`, after the `activeConversationIdsJson` line (currently ~line 114), add:

```typescript
notebook: [],
```

This ensures TypeScript compiles before the loadNotebookEntries call overwrites it.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/engine/store.ts
git commit -m "feat: load notebook entries on world init"
```

---

### Task 8: Tick Integration — Cleanup + Decision Context

**Files:**
- Modify: `src/engine/tick.ts`

- [ ] **Step 1: Add notebook cleanup at tick start**

In `src/engine/tick.ts`, add import:

```typescript
import { cleanExpiredEntries, getTodayEntries, describeEntries } from "./notebook";
```

In the main tick function, after world load and before vitals decay (find where `const baseTime = timeOfDay(fromTick, world.epoch)` is, ~line 343), add:

```typescript
// Clean expired notebook entries
cleanExpiredEntries(world.id, fromTick);
```

- [ ] **Step 2: Add notebook entries to DecideInput**

In `DecideInput` interface (line 75-94), add `upcomingNotebookText: string`:

```typescript
export interface DecideInput {
  character: Character;
  nodes: MapNode[];
  here: MapNode;
  companions: Character[];
  reachable: MapNode[];
  perceived: WorldEvent[];
  options: ActionOption[];
  worldName: string;
  tick: number;
  epoch: number;
  facts: AggregatedFacts;
  language: Language;
  ctx: ActionContext;
  allCharacters: Character[];
  activeEventDefs: GlobalEventDef[];
  upcomingNotebookText: string;  // <-- add
}
```

In the call site where `DecideInput` is constructed (~line 580-595 area), compute and pass:

```typescript
const todayEntries = getTodayEntries(c.notebook, fromTick);
const upcomingNotebookText = describeEntries(todayEntries, fromTick, world.epoch);
```

And add `upcomingNotebookText` to the object.

In the second call site (~line 740-760), do the same.

- [ ] **Step 3: Verify TypeScript compiles + tests pass**

```bash
npx tsc --noEmit && npx vitest run src/engine/tick.test.ts
```

Expected: No errors, tick tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/engine/tick.ts
git commit -m "feat: clean expired notebook entries each tick and inject today's entries into DecideInput"
```

---

### Task 9: Prompt — Inject Notebook Entries

**Files:**
- Modify: `src/llm/prompt.ts`
- Modify: `src/llm/decide.ts`

- [ ] **Step 1: Add `upcomingNotebookText` to `buildUserPrompt`**

In `src/llm/prompt.ts`, add a new parameter to `buildUserPrompt`:

```typescript
export function buildUserPrompt(args: {
  character: Character;
  here: MapNode;
  companions: Character[];
  perceived: WorldEvent[];
  options: ActionOption[];
  tick: number;
  epoch: number;
  facts: AggregatedFacts;
  language?: Language;
  arrivalIntro?: boolean;
  allCharacters?: Character[];
  nodes: MapNode[];
  activeEventDefs?: import("@/domain/events").GlobalEventDef[];
  upcomingNotebookText?: string;  // <-- add
}): string {
```

Destructure it:

```typescript
const { character, here, companions, perceived, options, tick, epoch, facts, allCharacters, nodes, activeEventDefs, upcomingNotebookText } = args;
```

Insert the notebook text before the time line (before "当前时间"). After the active global events block (~line 1248-1251), add:

```typescript
// Notebook entries
if (upcomingNotebookText && upcomingNotebookText.length > 0) {
  lines.push(upcomingNotebookText, "");
}
```

- [ ] **Step 2: Add `upcomingEntries` to `buildDialogTurnPrompt`**

Add `upcomingEntries?: NotebookEntry[]` parameter. In `src/llm/prompt.ts`, update `buildDialogTurnPrompt` signature:

```typescript
export function buildDialogTurnPrompt(args: {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  here: MapNode;
  language?: Language;
  pendingAction?: import("@/domain/types").DialogueActionRequest;
  dialogueActions?: import("@/domain/action-system").ActionDefinition[];
  upcomingEntries?: import("@/domain/types").NotebookEntry[];  // <-- add
}): string {
```

Destructure:

```typescript
const { self, peer, transcript, here, pendingAction, dialogueActions, upcomingEntries } = args;
```

After the dialect-specific personality line and before the dialogue record line, inject the upcoming entries notice. The simplest place: right before "现在轮到你说话" / "It's your turn..." / "あなたの番です". Add a helper function after `buildDialogueActionsBlock`:

```typescript
function buildUpcomingBlock(lang: Language): string {
  if (!upcomingEntries || upcomingEntries.length === 0) return "";
  const lines = upcomingEntries.map(
    (e) => {
      // Simple tick-to-time display (不使用 epoch 是因为这里只是轻量提醒，精确到小时即可)
      const hour = Math.floor((e.scheduledTick % 120) / 5);
      const min = ((e.scheduledTick % 120) % 5) * 12;
      return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")} — ${e.content}`;
    }
  );
  if (lang === "zh") return `\n你未来一小时内的待办：${lines.join("; ")}\n`;
  if (lang === "en") return `\nYour upcoming tasks in the next hour: ${lines.join("; ")}\n`;
  return `\n今後1時間以内の予定：${lines.join("; ")}\n`;
}
```

Call it in each language branch, after the dialogue actions block and before the "现在轮到你说话" line:

For `zh`:
```typescript
lines.push(buildUpcomingBlock("zh"));
```

For `en`:
```typescript
lines.push(buildUpcomingBlock("en"));
```

For `ja`:
```typescript
lines.push(buildUpcomingBlock("ja"));
```

- [ ] **Step 3: Thread through decide.ts**

In `src/llm/decide.ts`:

In `callLLM`, pass `upcomingNotebookText` to `buildUserPrompt`:

```typescript
const user = buildUserPrompt({
  character: input.character,
  here: input.here,
  companions: input.companions,
  perceived: input.perceived,
  options: input.options,
  tick: input.tick,
  epoch: input.epoch,
  facts: input.facts,
  language: input.language,
  allCharacters: input.allCharacters,
  nodes: input.nodes,
  activeEventDefs: input.activeEventDefs,
  upcomingNotebookText: input.upcomingNotebookText,
});
```

In `llmSalvageDecide`, pass `upcomingNotebookText`:

```typescript
const user = buildUserPrompt({
  // ...existing props...
  upcomingNotebookText: input.upcomingNotebookText,
});
```

In `llmDialogTurn`, pass `upcomingEntries` to `buildDialogTurnPrompt`:

```typescript
const prompt = buildDialogTurnPrompt({
  self: input.self,
  peer: input.peer,
  transcript: input.transcript,
  here: input.here,
  language,
  pendingAction: input.pendingAction,
  dialogueActions: input.dialogueActions,
  upcomingEntries: (input as any).upcomingEntries,
});
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/llm/prompt.ts src/llm/decide.ts
git commit -m "feat: inject notebook entries into decision and dialog prompts"
```

---

### Task 10: Dialog — Per-Speaker Upcoming Entries

**Files:**
- Modify: `src/engine/dialog.ts`

- [ ] **Step 1: Add `upcomingEntries` to `TurnDecideFn` type**

In `src/engine/dialog.ts`, update `TurnDecideFn` (around line 100-112) to add an `upcomingEntries` field:

```typescript
export type TurnDecideFn = (input: {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  here: MapNode;
  language: Language;
  pendingAction?: import("@/domain/types").DialogueActionRequest;
  dialogueActions: import("@/domain/action-system").ActionDefinition[];
  tick: number;
  upcomingEntries?: import("@/domain/types").NotebookEntry[];
}) => Promise<
  | { kind: "turn"; turn: DialogTurn; proposeAction?: DialogueActionProposal; respondToAction?: DialogueActionResponse }
  | { kind: "end"; payload: EndConversationPayload; respondToAction?: DialogueActionResponse }
>;
```

- [ ] **Step 2: Compute and pass upcoming entries in `runOneTickDialog`**

In `runOneTickDialog`, add import if not already present:

```typescript
import { getNextHourEntries } from "./notebook";
```

Inside the turn loop (in `runOneTickDialog`, around line 415), before `turnDecide`, compute:

```typescript
const upcomingEntries = getNextHourEntries(speaker.notebook ?? [], currentTick);
```

And pass it in the `turnDecide` call:

```typescript
result = await retryOnce(() => turnDecide({
  self: speaker,
  peer,
  transcript,
  here: speakerHere,
  language,
  pendingAction,
  dialogueActions,
  tick: currentTick,
  upcomingEntries,
}));
```

Similarly for the extra round (~line 450), compute and pass `upcomingEntries` for `other`.

- [ ] **Step 3: Thread through `llmDialogTurn`**

In `src/llm/decide.ts`, update the `DialogTurnInput` interface to include `upcomingEntries`:

```typescript
interface DialogTurnInput {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  here: MapNode;
  language?: Language;
  pendingAction?: import("@/domain/types").DialogueActionRequest;
  dialogueActions?: import("@/domain/action-system").ActionDefinition[];
  tick?: number;
  upcomingEntries?: import("@/domain/types").NotebookEntry[];
}
```

In `llmDialogTurn`, pass `upcomingEntries` to `buildDialogTurnPrompt`:

```typescript
const prompt = buildDialogTurnPrompt({
  self: input.self,
  peer: input.peer,
  transcript: input.transcript,
  here: input.here,
  language,
  pendingAction: input.pendingAction,
  dialogueActions: input.dialogueActions,
  upcomingEntries: input.upcomingEntries,
});
```

- [ ] **Step 4: Verify TypeScript compiles + dialog tests pass**

```bash
npx tsc --noEmit && npx vitest run src/engine/dialog.test.ts src/engine/dialog-give.test.ts
```

Expected: No errors, dialog tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine/dialog.ts src/llm/decide.ts
git commit -m "feat: inject per-speaker upcoming notebook entries into dialog turns"
```

---

### Task 11: End-to-End Verification

**Files:**
- Modify: None (verification only)

- [ ] **Step 1: Run full TypeScript build**

```bash
npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: All existing tests pass + new notebook tests pass.

- [ ] **Step 3: Run existing prompt tests specifically**

```bash
npx vitest run src/llm/prompt.test.ts
```

Expected: Prompt tests pass (new optional fields shouldn't break existing tests).

- [ ] **Step 4: Commit if any final tweaks needed**

```bash
git add -A
git commit -m "chore: final notebook feature integration verification"
```
