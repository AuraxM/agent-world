# Tick Time Ratio Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all remaining hardcoded "1 tick = 1 hour" assumptions in format/prompt/scripts, centralizing time conversion through `MS_PER_TICK`.

**Architecture:** Add `MS_PER_TICK` constant and `tickToDate()` helper to `format.ts`, then route all time display and text generation through them. The engine core already uses `TICKS_PER_HOUR` correctly and needs no changes.

**Tech Stack:** TypeScript, Next.js, Vitest

---

### Task 1: Rewrite format.ts with centralized time utilities

**Files:**
- Modify: `src/app/_lib/format.ts`

- [ ] **Step 1: Replace entire file content**

Replace the current `format.ts` (which has `tick * 60 * 60 * 1000` treating each tick as 1 hour) with:

```ts
import { TICKS_PER_HOUR } from "@/domain/enums";

/** 1 tick = 12 游戏分钟（60 min / TICKS_PER_HOUR） */
const MS_PER_TICK = 12 * 60 * 1000;

function tickToDate(tick: number): Date {
  const start = new Date("2026-05-01T00:00:00");
  return new Date(start.getTime() + tick * MS_PER_TICK);
}

/** tick → "2026/05/01 08:24" */
export function formatGameTime(tick: number): string {
  const d = tickToDate(tick);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

/** tick → "08:24" short format */
export function formatHHMM(tick: number): string {
  const d = tickToDate(tick);
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${min}`;
}

/** tick → "2026/05/02" date-only */
export function formatDay(tick: number): string {
  const d = tickToDate(tick);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}
```

- [ ] **Step 2: Verify file exists and has correct imports**

Run: `grep -n "export function formatGameTime" src/app/_lib/format.ts`
Expected: Shows the three exported functions at their new line numbers.

- [ ] **Step 3: Type-check the changed file**

Run: `npx tsc --noEmit src/app/_lib/format.ts 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/_lib/format.ts
git commit -m "fix: centralize tick-to-time conversion with MS_PER_TICK, add minute display"
```

---

### Task 2: Fix prompt.ts world rules text

**Files:**
- Modify: `src/llm/prompt.ts:475`

- [ ] **Step 1: Fix "1 日 = 24 tick" in worldRules()**

Edit `src/llm/prompt.ts`, line 475. Change:
```
- 1 日 = 24 tick。每个角色有自己的作息窗口
```
To:
```
- 1 日 = 120 tick（24 小时 × 5 tick/小时）。每个角色有自己的作息窗口
```

- [ ] **Step 2: Verify the change**

Run: `grep -n "1 日" src/llm/prompt.ts`
Expected: Shows `1 日 = 120 tick（24 小时 × 5 tick/小时）` at the updated line.

- [ ] **Step 3: Commit**

```bash
git add src/llm/prompt.ts
git commit -m "fix: correct day=tick ratio text in LLM world rules prompt"
```

---

### Task 3: Fix prompt.ts describeContinuity time diffs

**Files:**
- Modify: `src/llm/prompt.ts:873-882`

- [ ] **Step 1: Divide tick diffs by TICKS_PER_HOUR in describeContinuity()**

Edit `src/llm/prompt.ts`, lines 873-882. Change:
```ts
  lines.push(
    facts.lastRestTick === undefined
      ? "- 距上次 rest/sleep：从未休息过"
      : `- 距上次 rest/sleep：${currentTick - facts.lastRestTick} 小时`,
  );
  lines.push(
    facts.lastEatTick === undefined
      ? "- 距上次 eat：从未进食过"
      : `- 距上次 eat：${currentTick - facts.lastEatTick} 小时`,
  );
```

To:
```ts
  lines.push(
    facts.lastRestTick === undefined
      ? "- 距上次 rest/sleep：从未休息过"
      : `- 距上次 rest/sleep：${Math.floor((currentTick - facts.lastRestTick) / TICKS_PER_HOUR)} 小时`,
  );
  lines.push(
    facts.lastEatTick === undefined
      ? "- 距上次 eat：从未进食过"
      : `- 距上次 eat：${Math.floor((currentTick - facts.lastEatTick) / TICKS_PER_HOUR)} 小时`,
  );
```

- [ ] **Step 2: Verify TICKS_PER_HOUR is already imported**

Run: `grep -n "TICKS_PER_HOUR" src/llm/prompt.ts | head -5`
Expected: Shows import at line 14 and usages at various lines. The import already exists — no new import needed.

- [ ] **Step 3: Commit**

```bash
git add src/llm/prompt.ts
git commit -m "fix: divide tick diffs by TICKS_PER_HOUR in describeContinuity"
```

---

### Task 4: Fix use-world-state.ts startAuto default

**Files:**
- Modify: `src/app/_hooks/use-world-state.ts:229`

- [ ] **Step 1: Add TICKS_PER_HOUR import**

Edit `src/app/_hooks/use-world-state.ts`. Add to imports at line 5:
```ts
import { TICKS_PER_HOUR } from "@/domain/enums";
```

- [ ] **Step 2: Change startAuto default parameter**

Edit line 229. Change:
```ts
async (n: number = 24) => {
```
To:
```ts
async (n: number = 24 * TICKS_PER_HOUR) => {
```

- [ ] **Step 3: Verify**

Run: `grep -n "startAuto\|TICKS_PER_HOUR" src/app/_hooks/use-world-state.ts`
Expected: Shows the import and updated default parameter.

- [ ] **Step 4: Commit**

```bash
git add src/app/_hooks/use-world-state.ts
git commit -m "fix: startAuto default to 24h worth of ticks (24 * TICKS_PER_HOUR)"
```

---

### Task 5: Fix observe-circadian.ts script

**Files:**
- Modify: `scripts/observe-circadian.ts:30,179,210`

- [ ] **Step 1: Update TICKS constant**

Edit line 30. Change:
```ts
const TICKS = 48;
```
To:
```ts
const TICKS = 48 * TICKS_PER_HOUR;
```

Note: `TICKS_PER_HOUR` is not currently imported. Add it to the existing import from `@/llm/prompt` at line 21-25, or add a separate import. The simplest: add to line 21-25.

Actually, the cleanest approach is to import from `@/domain/enums` since `@/llm/prompt` doesn't export `TICKS_PER_HOUR`. Add after line 26:
```ts
import { TICKS_PER_HOUR } from "@/domain/enums";
```

Wait — `TICKS_PER_HOUR` is imported in `@/llm/prompt` (line 14), and `observe-circadian.ts` already imports from `@/llm/prompt` (lines 21-25). But `TICKS_PER_HOUR` is not re-exported from prompt.ts — it's just used internally. So we need to import from `@/domain/enums` directly.

- [ ] **Step 1b: Add TICKS_PER_HOUR import**

After line 26 (`import type { Action } from "@/domain/types";`), add:
```ts
import { TICKS_PER_HOUR } from "@/domain/enums";
```

- [ ] **Step 2: Fix hour calculation in trace row**

Edit line 179. Change:
```ts
hour: r.fromTick % 24,
```
To:
```ts
hour: Math.floor(r.fromTick / TICKS_PER_HOUR) % 24,
```

- [ ] **Step 3: Fix day calculation in output header**

Edit line 210. Change:
```ts
const day = Math.floor(r.tick / 24);
```
To:
```ts
const day = Math.floor(r.tick / (24 * TICKS_PER_HOUR));
```

- [ ] **Step 4: Verify all TICKS_PER_HOUR references in the script**

Run: `grep -n "TICKS_PER_HOUR\|/ 24\|% 24" scripts/observe-circadian.ts`
Expected: All time calculations now use TICKS_PER_HOUR.

- [ ] **Step 5: Commit**

```bash
git add scripts/observe-circadian.ts
git commit -m "fix: use TICKS_PER_HOUR for hour/day calculations in observe-circadian"
```

---

### Task 6: Update prompt.test.ts assertions

**Files:**
- Modify: `src/llm/prompt.test.ts:344-348`

- [ ] **Step 1: Update "距上次" assertions for describeContinuity**

The test at line 344 has `currentTick=12, lastRestTick=0, lastEatTick=5`. With TICKS_PER_HOUR=5:
- `Math.floor((12-0)/5) = 2` hours since rest
- `Math.floor((12-5)/5) = 1` hour since eat

Edit lines 346-348. Change:
```ts
expect(out).toContain("距上次 rest/sleep：12 小时");
expect(out).toContain("距上次 eat：7 小时");
```
To:
```ts
expect(out).toContain("距上次 rest/sleep：2 小时");
expect(out).toContain("距上次 eat：1 小时");
```

- [ ] **Step 2: Run the prompt tests**

Run: `npx vitest run src/llm/prompt.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/llm/prompt.test.ts
git commit -m "test: update describeContinuity assertions for 5-tick-per-hour ratio"
```

---

### Task 7: Run full test suite

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (tick.test.ts, vitals-emotion.test.ts, facts.test.ts, prompt.test.ts, etc.).

- [ ] **Step 2: Quick manual verify the format functions work correctly**

Create a quick check by running a Node one-liner (or just verify by reading the code — the `tickToDate` logic is deterministic date math). Key values:
- tick=0 → "2026/05/01 00:00"
- tick=5 → "2026/05/01 01:00"
- tick=7 → "2026/05/01 01:24"

- [ ] **Step 3: Commit if any fixes were needed**

Only needed if tests revealed issues.
