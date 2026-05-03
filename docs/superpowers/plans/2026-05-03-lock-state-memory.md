# Lock-State Memory Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suppress per-tick memory writes during sleep/nap/move lock states, writing memory only at start and end (completion or interruption).

**Architecture:** Add an internal `skipMemory?: boolean` flag to the `Action` type. Set it on auto-generated wait actions in `tick.ts`. Guard the main memory push in `execute.ts` with this flag. Write explicit completion and interruption memories at state transitions in `tick.ts`.

**Tech Stack:** TypeScript, Vitest, better-sqlite3 (test DB)

**Spec:** `docs/superpowers/specs/2026-05-03-lock-state-memory-design.md`

---

## File Summary

| File | Action | Purpose |
|---|---|---|
| `src/domain/types.ts:260` | Modify | Add `skipMemory?: boolean` to `Action` interface |
| `src/engine/execute.ts:590-593` | Modify | Guard `pushMemory` with `!action.skipMemory` |
| `src/engine/tick.ts:166-171` | Modify | Add `skipMemory: true` to `handleOngoingMove` wait |
| `src/engine/tick.ts:335-340` | Modify | Add `skipMemory: true` to sleep/nap ongoing wait |
| `src/engine/tick.ts:269-293` | Modify | Write interruption memory before clearing `currentAction` |
| `src/engine/tick.ts:358-367` | Modify | Write completion memory before clearing `currentAction` |
| `src/engine/tick.test.ts` | Modify | Add tests for skipMemory, completion memory, regression |

---

### Task 1: Add `skipMemory` to Action type + guard in execute.ts

**Files:**
- Modify: `src/domain/types.ts:260`
- Modify: `src/engine/execute.ts:590-593`

- [ ] **Step 1: Add field to Action interface**

In `src/domain/types.ts`, after line 262 (`arrivalNodeName?: string;`), add:

```typescript
  /** 引擎内部标记：该 action 不写入 shortMemory（用于锁状态持续期间的自动 wait） */
  skipMemory?: boolean;
```

- [ ] **Step 2: Guard pushMemory in execute.ts**

In `src/engine/execute.ts`, replace lines 590-593:

```typescript
    // Before
    pushMemory(
      actor,
      memFromAction(tick, action, success ? "我刚刚" : "我尝试但失败"),
    );

    // After
    if (!action.skipMemory) {
      pushMemory(
        actor,
        memFromAction(tick, action, success ? "我刚刚" : "我尝试但失败"),
      );
    }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: No errors from the changed files.

- [ ] **Step 4: Commit**

```bash
git add src/domain/types.ts src/engine/execute.ts
git commit -m "feat: add skipMemory flag to Action, guard memory push in execute

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Add `skipMemory: true` to auto-wait actions in tick.ts

**Files:**
- Modify: `src/engine/tick.ts:166-171`
- Modify: `src/engine/tick.ts:335-340`

- [ ] **Step 1: handleOngoingMove wait**

In `src/engine/tick.ts`, at lines 166-171, add `skipMemory: true`:

```typescript
// Before
      action: {
        type: "wait",
        actorId: c.id,
        reasoning: `正在前往目的地途中（第 ${nextStep}/${path.length - 1} 步）。`,
        selfImportance: 1,
      },

// After
      action: {
        type: "wait",
        actorId: c.id,
        reasoning: `正在前往目的地途中（第 ${nextStep}/${path.length - 1} 步）。`,
        selfImportance: 1,
        skipMemory: true,
      },
```

- [ ] **Step 2: sleep/nap ongoing wait**

In `src/engine/tick.ts`, at lines 335-340, add `skipMemory: true`:

```typescript
// Before
      const waitAction: Action = {
        type: "wait",
        actorId: c.id,
        reasoning: `持续行动中：${c.currentAction.description}。`,
        selfImportance: 1,
      };

// After
      const waitAction: Action = {
        type: "wait",
        actorId: c.id,
        reasoning: `持续行动中：${c.currentAction.description}。`,
        selfImportance: 1,
        skipMemory: true,
      };
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/engine/tick.ts
git commit -m "feat: suppress per-tick memory for lock-state auto-wait actions

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Add completion and interruption memories in tick.ts

**Files:**
- Modify: `src/engine/tick.ts:269-293` (interruption block)
- Modify: `src/engine/tick.ts:358-367` (completion block)

- [ ] **Step 1: Write interruption memory**

In `src/engine/tick.ts`, inside the `if (interrupt)` block, add memory write before `c.currentAction = undefined` (before line 293):

```typescript
      if (interrupt) {
        // Handle interrupt for sleep/nap: partial recovery
        if (c.currentAction.type === "sleep" || c.currentAction.type === "nap") {
          const ticksDone = fromTick - c.currentAction.startedAt;
          const hoursDone = Math.floor(ticksDone / TICKS_PER_HOUR);
          if (c.currentAction.type === "sleep") {
            c.vitals.fatigue = Math.max(0, c.vitals.fatigue - hoursDone);
          } else if (c.currentAction.type === "nap") {
            const reduction = Math.floor((hoursDone * 6) / 4);
            c.vitals.fatigue = Math.max(0, c.vitals.fatigue - reduction);
          }
          if (c.vitals.fatigue < 16) c.vitals.fatigueCapTicks = 0;
        }
        // For move: initiation memory already written, no arrival memory needed

        // Write interruption memory
        const desc = c.currentAction.description;
        c.shortMemory.push({
          id: `mem-${randomUUID().slice(0, 8)}`,
          tick: fromTick,
          importance: 4,
          content: `${desc}被「${interrupt.description}」打断。`,
        });

        freeMoveEvents.push(
          makeInnerEvent({
            worldId,
            tick: fromTick,
            charId: c.id,
            description: `被「${interrupt.description}」打断。`,
            intensity: 2,
          }),
        );
        c.currentAction = undefined;
        // Fall through to normal LLM decision below
      }
```

- [ ] **Step 2: Write completion memory for sleep/nap**

In `src/engine/tick.ts`, inside the completion block (lines 358-367), add memory write before `c.currentAction = undefined`:

```typescript
      if (c.currentAction && fromTick >= c.currentAction.endsAt) {
        // Write completion memory
        if (c.currentAction.type === "sleep") {
          c.shortMemory.push({
            id: `mem-${randomUUID().slice(0, 8)}`,
            tick: fromTick,
            importance: 3,
            content: "一觉睡醒，神清气爽。",
          });
        } else if (c.currentAction.type === "nap") {
          c.shortMemory.push({
            id: `mem-${randomUUID().slice(0, 8)}`,
            tick: fromTick,
            importance: 3,
            content: "小睡醒来，恢复了一些精神。",
          });
        }

        if (c.currentAction.type === "sleep") {
          c.vitals.fatigue = 0;
          c.vitals.fatigueCapTicks = 0;
        } else if (c.currentAction.type === "nap") {
          c.vitals.fatigue = Math.max(0, c.vitals.fatigue - 6);
          if (c.vitals.fatigue < 16) c.vitals.fatigueCapTicks = 0;
        }
        c.currentAction = undefined;
      }
```

Note: move completion is handled by the arrival action's normal `executeActions` flow (see `handleOngoingMove:145-162`). No completion memory needed here for move.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/engine/tick.ts
git commit -m "feat: write memory on lock-state completion and interruption

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Write tests

**Files:**
- Modify: `src/engine/tick.test.ts` (append tests to existing describe block)

- [ ] **Step 1: Read current test file ending to find insertion point**

Read the last 30 lines of `src/engine/tick.test.ts` to find the closing `});` of the describe block.

- [ ] **Step 2: Add test helper for characters with ongoing actions**

Insert a helper function inside the test file (after the `afterAll` block, before the `describe`) to create a character that has a pre-set `currentAction` and non-empty `shortMemory`:

```typescript
function makeCharWithOngoing(
  sqlite: ReturnType<typeof import("better-sqlite3").default>,
  id: string,
  name: string,
  locId: string,
  currentAction: { type: string; startedAt: number; endsAt: number; description: string },
) {
  sqlite
    .prepare(
      `INSERT INTO characters (id, world_id, name, location_id, personality_json, vitals_json, current_action_json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      "test-world",
      name,
      locId,
      JSON.stringify({ ei: 0, sn: 0, tf: 0, jp: 0 }),
      JSON.stringify({ hunger: 5, fatigue: 5, hygiene: 5 }),
      JSON.stringify(currentAction),
    );
}
```

- [ ] **Step 3: Add test — skipMemory prevents memory during ongoing sleep**

Insert before the closing `});` of the describe block:

```typescript
  it("sleep 持续中不写记忆（skipMemory），结束时写完成记忆", async () => {
    // Reset world and add a sleeping character
    const sqlite = dbModule.db;
    sqlite.exec("DELETE FROM characters");
    sqlite.exec("DELETE FROM events_log");
    sqlite.exec("DELETE FROM agent_thoughts");
    sqlite.exec("UPDATE worlds SET current_tick = 0");

    // Add char-a (normal) and char-b (sleeping with 1 tick remaining)
    sqlite.prepare(
      `INSERT INTO characters (id, world_id, name, location_id, personality_json, vitals_json) VALUES (?, ?, ?, ?, ?, ?)`
    ).run("char-a", "test-world", "甲", "node-root", JSON.stringify({ ei: 0, sn: 0, tf: 0, jp: 0 }), JSON.stringify({ hunger: 0, fatigue: 0, hygiene: 0 }));
    sqlite.prepare(
      `INSERT INTO characters (id, world_id, name, location_id, personality_json, vitals_json, current_action_json, short_memory_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      "char-sleeper", "test-world", "睡者", "node-root",
      JSON.stringify({ ei: 0, sn: 0, tf: 0, jp: 0 }),
      JSON.stringify({ hunger: 5, fatigue: 10, hygiene: 5 }),
      JSON.stringify({ type: "sleep", startedAt: 0, endsAt: 2, description: "在测试根睡觉", interruptThreshold: 4 }),
      JSON.stringify([]),
    );

    // Tick 1: sleep is ongoing (fromTick=1 < endsAt=2) → auto-wait with skipMemory:true
    const r1 = await tickModule.tick("test-world", { forceWait: true });
    const w1 = storeModule.loadWorld("test-world");
    const sleeper1 = w1.characters.find((c) => c.id === "char-sleeper")!;
    // shortMemory should still be empty — skipMemory prevented the auto-wait memory
    expect(sleeper1.shortMemory).toHaveLength(0);
    // currentAction should still be active
    expect(sleeper1.currentAction).toBeTruthy();
    expect(sleeper1.currentAction!.type).toBe("sleep");

    // Tick 2: sleep completes (fromTick=2 >= endsAt=2) → completion memory written
    const r2 = await tickModule.tick("test-world", { forceWait: true });
    const w2 = storeModule.loadWorld("test-world");
    const sleeper2 = w2.characters.find((c) => c.id === "char-sleeper")!;
    expect(sleeper2.currentAction).toBeUndefined();
    expect(sleeper2.vitals.fatigue).toBe(0); // sleep fully resets fatigue
    // Completion memory written
    expect(sleeper2.shortMemory.length).toBeGreaterThan(0);
    expect(sleeper2.shortMemory[0].content).toContain("一觉睡醒");
  });
```

- [ ] **Step 4: Add regression test — normal actions still write memory**

```typescript
  it("skipMemory 不影响普通 action 的记忆写入", async () => {
    const char = {
      id: "char-x",
      worldId: "w",
      name: "X",
      age: 30,
      gender: "male" as const,
      profession: "farmer" as const,
      biography: "",
      locationId: "n1",
      personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
      vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
      emotion: { mood: 0, stress: 0, social_satiety: 0 },
      abilities: [],
      shortMemory: [],
      longMemory: [],
      relations: {},
    };
    const node = {
      id: "n1", worldId: "w", parentId: null, name: "测试节点",
      description: "", tags: ["public"], capacity: null, privacy: "public" as const,
      visibleFromParent: true, shortcuts: [], isEntry: false, travelCost: null,
    };
    const action = {
      type: "wait" as const,
      actorId: "char-x",
      reasoning: "等等看。",
      selfImportance: 2 as const,
      // no skipMemory — default undefined
    };
    const { executeActions } = await import("./execute");
    const result = executeActions({
      worldId: "w",
      tick: 0,
      characters: [char],
      nodes: [node],
      actions: [action],
    });
    expect(char.shortMemory.length).toBe(1);
    expect(char.shortMemory[0].content).toContain("等等看");
  });
```

- [ ] **Step 5: Run the new tests**

Run: `npx vitest run src/engine/tick.test.ts --reporter=verbose`
Expected: All tests pass including the new ones.

- [ ] **Step 6: Commit**

```bash
git add src/engine/tick.test.ts
git commit -m "test: add lock-state memory optimization tests

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Run full test suite and final commit

- [ ] **Step 1: Run all engine tests**

Run: `npx vitest run src/engine/ --reporter=verbose`
Expected: All tests pass.

- [ ] **Step 2: Run full TypeScript check**

Run: `npx tsc --noEmit --pretty`
Expected: No errors.

- [ ] **Step 3: Verify no regressions — existing tick tests still pass**

Run: `npx vitest run src/engine/tick.test.ts --reporter=verbose`
Expected: All 5 original tests + 2 new tests = 7 passing.

- [ ] **Step 4: Final review of diff**

Run: `git diff HEAD~3..HEAD`
Review all changes for correctness.
