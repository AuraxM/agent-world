# Lock-State Memory Optimization

**Date**: 2026-05-03
**Status**: design

## Problem

Sleep, nap, and multi-step move are "lock states" where the character repeats an auto-generated `wait` action each tick until the action completes or is interrupted. Currently, every one of those ticks writes a memory to `shortMemory` via `executeActions` (e.g. "我刚刚 持续行动中：在 XXX 睡觉。"). For an 8-hour sleep (40 ticks), that's 40 redundant, near-identical memories.

Memory should be written only at **start** and **end** (normal completion or interruption).

## Scope

Three lock-state action types: `sleep`, `nap`, multi-step `move`.

### In scope

- Suppress per-tick memory for auto-wait actions generated during lock states
- Write a completion memory when the lock state finishes normally
- Write an interruption memory when the lock state is interrupted

### Out of scope

- Inner events generated every 4 hours during sleep ("仍在 XXX 睡觉") — those remain unchanged
- LLM schema / tool definitions — `skipMemory` is an engine-internal flag

## Design

### 1. Action type (`src/domain/types.ts`)

Add optional `skipMemory` flag to the `Action` interface:

```typescript
/** 引擎内部标记：该 action 不写入 shortMemory（用于锁状态持续期间的自动 wait） */
skipMemory?: boolean;
```

### 2. Auto-wait suppression (`src/engine/tick.ts`)

Set `skipMemory: true` on two auto-generated wait actions:

- `handleOngoingMove` (line ~167): the wait action emitted each step of path traversal
- Sleep/nap ongoing (line ~335): the wait action `"持续行动中：${c.currentAction.description}"`

### 3. Completion memory (`src/engine/tick.ts`, line ~358)

When `currentAction` expires (`fromTick >= endsAt`), write a completion memory before clearing. Only applies to `sleep` and `nap` (move completion is handled by the arrival action flowing through `executeActions` normally):

| Action type | Memory content |
|---|---|
| `sleep` | "一觉睡醒，神清气爽。" |
| `nap` | "小睡醒来，恢复了一些精神。" |

Importance: 3.

### 4. Interruption memory (`src/engine/tick.ts`, line ~270)

When `currentAction` is interrupted by a high-intensity event, write a memory before clearing:

```
"${currentAction.description}被「${interrupt.description}」打断。"
```

Importance: 4.

### 5. Execute skip (`src/engine/execute.ts`, line ~590)

Wrap the main per-action memory push in a `skipMemory` guard:

```typescript
if (!action.skipMemory) {
  pushMemory(actor, memFromAction(tick, action, success ? "我刚刚" : "我尝试但失败"));
}
```

Other `pushMemory` calls in `execute.ts` (target memory for `interact_person`, arrival memory) are not affected — they don't fire during lock-state ticks.

## Summary of changes

| File | Change |
|---|---|
| `src/domain/types.ts` | Add `skipMemory?: boolean` to `Action` |
| `src/engine/tick.ts` | 4 points: two `skipMemory: true`, completion memory, interruption memory |
| `src/engine/execute.ts` | 1 point: guard `pushMemory` with `!action.skipMemory` |

Backward compatible: all existing actions default to `skipMemory = undefined` (falsy), so memory behavior is unchanged for non-lock-state actions.
