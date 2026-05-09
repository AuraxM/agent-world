# travel_together (结伴同行) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dialogue-only built-in action `travel_together` that locks two characters into synchronous movement, continuing dialogue in parallel and persisting movement past dialogue end.

**Architecture:** New action definition in actions-builtin.ts with `usableInDialogue: true`. On dialogue accept, `executeDialogueAction` computes BFS path and sets `currentAction` on both characters with `partnerId`. Tick loop gains a pre-decision processing block that auto-steps every travel_together pair synchronously, independent of dialogue lifecycle.

**Tech Stack:** TypeScript, existing action registry + dialogue protocol + BFS pathfinding

---

### Task 1: Add `partnerId` to `OngoingAction`

**Files:**
- Modify: `backend/src/domain/types.ts`

- [ ] **Step 1: Add the field**

```typescript
// types.ts:83-98, add after `reason?:` field (line 97)
  /** move 专属：移动原因（中断时用于写记忆） */
  reason?: string;
  /** travel_together 专属：同行伙伴的角色 ID */
  partnerId?: string;
}
```

- [ ] **Step 2: Run type check**

Run: `pnpm test:backend`
Expected: All existing tests pass (no behavioral change, just an optional field)

- [ ] **Step 3: Commit**

```bash
git add backend/src/domain/types.ts
git commit -m "feat: add partnerId field to OngoingAction for travel_together support"
```

---

### Task 2: Add `travelTogetherAction` definition

**Files:**
- Modify: `backend/src/systems/actions-builtin.ts`

- [ ] **Step 1: Add the action definition before `BUILTIN_ACTIONS` array**

Insert after the `giveAction` definition (after line 436), before `lookAroundAction`:

```typescript
export const travelTogetherAction: ActionDefinition = {
  type: "travel_together",
  duration: 0, // computed from BFS path length
  usableInDialogue: true,
  triggerHint: "与对话对象约定一同前往某地，边走边聊，途中不会被外界打断。",
  paramRule: "必填 target_node_id（目的地节点 id）+ reason（为何前往）。仅对话中可用。",
  check(_ctx) {
    return false; // dialogue-only，正常决策中不可选
  },
  hint(ctx) {
    return ctx.companions.map((c) => ({
      hint: `约 ${c.name} 结伴同行`,
      targetId: c.id,
    }));
  },
  validateParams(input, ctx) {
    if (!input.target_node_id) return "travel_together 需要指定 target_node_id（目的地节点 ID）";
    if (!input.reason) return "travel_together 需要 reason（结伴前往的原因）";
    const targetNode = ctx.reachable.find(n => n.id === input.target_node_id);
    if (!targetNode) return `target_node_id="${input.target_node_id}" 不可达或不存在`;
    if (input.target_node_id === ctx.here.id) return "你已经在目的地了";
    return null;
  },
  execute(ctx, input) {
    // 正常不会走这里——对话中 accept 后由 executeDialogueAction 特殊处理
    // 提供 fallback 以保持接口完整性
    const targetId = input.target_node_id as string;
    const target = ctx.reachable.find(n => n.id === targetId);
    const reason = (input.reason as string) || "结伴";
    return {
      memory: `我约了同伴一起去 ${target?.name ?? targetId}：${reason}。`,
      event: {
        category: "social",
        description: `${ctx.self.name} 约同伴一起去 ${target?.name ?? targetId}。`,
        intensity: 2,
      },
    };
  },
  extraParams: {
    target_node_id: { type: "string", description: "目的地节点 id。" },
    reason: { type: "string", description: "结伴前往的原因。" },
    free_text: { type: "string", description: "在对话中说明同行细节（可选）。" },
  },
  extraRequired: ["target_node_id", "reason"],
};
```

- [ ] **Step 2: Register in BUILTIN_ACTIONS**

```typescript
// Replace the existing BUILTIN_ACTIONS array (line 497-508)
export const BUILTIN_ACTIONS: ActionDefinition[] = [
  eatAction,
  batheAction,
  restAction,
  workAction,
  thinkAction,
  chatAction,
  sleepAction,
  moveAction,
  giveAction,
  travelTogetherAction,
  lookAroundAction,
];
```

- [ ] **Step 3: Run type check**

Run: `pnpm test:backend`
Expected: All existing tests pass

- [ ] **Step 4: Commit**

```bash
git add backend/src/systems/actions-builtin.ts
git commit -m "feat: add travel_together action definition"
```

---

### Task 3: Handle travel_together in executeDialogueAction

**Files:**
- Modify: `backend/src/llm/dialog.ts`

- [ ] **Step 1: Import findPath**

In the imports block (line 29), add `findPath`:

```typescript
import { applyStateChange, findPath } from "../systems/index";
```

Change line 29 from:
```typescript
import { applyStateChange } from "../systems/index";
```
to:
```typescript
import { applyStateChange, findPath } from "../systems/index";
```

- [ ] **Step 2: Add travel_together branch in executeDialogueAction**

Add a branch for `"travel_together"` inside `executeDialogueAction`, right after the existing action execution logic (before the `outcome = def.execute(ctx, params)` call). The travel_together handling replaces the normal def.execute path entirely:

Replace the entire `try` block body (lines 462-503) — specifically, change the pattern so travel_together is detected before calling def.execute:

```typescript
  try {
    // travel_together: special handling — set ongoing action on both characters
    if (actionType === "travel_together") {
      const targetNodeId = params.target_node_id as string;
      if (!targetNodeId) return undefined;
      if (targetNodeId === actor.locationId) return `${actor.name} 已经在目的地了。`;

      const nodesArray = Array.from(nodeById.values());
      const path = findPath(actor.locationId, targetNodeId, nodesArray);
      if (!path) return undefined;

      const destNode = nodeById.get(targetNodeId);
      const destName = destNode?.name ?? targetNodeId;
      const reason = (params.reason as string) || "结伴同行";
      const endsAt = tick + path.length - 1;

      // Set ongoing action on BOTH characters
      const ongoingAction = {
        type: "travel_together" as const,
        startedAt: tick,
        endsAt,
        description: `和 ${target.name} 结伴前往 ${destName}`,
        interruptThreshold: 5 as const,
        path,
        stepIndex: 1,
        partnerId: target.id,
        reason,
      };
      const partnerAction = {
        type: "travel_together" as const,
        startedAt: tick,
        endsAt,
        description: `和 ${actor.name} 结伴前往 ${destName}`,
        interruptThreshold: 5 as const,
        path,
        stepIndex: 1,
        partnerId: actor.id,
        reason,
      };

      // First step
      actor.locationId = path[1];
      target.locationId = path[1];

      if (path.length <= 2) {
        // Single step — arrived immediately
        actor.currentAction = undefined;
        target.currentAction = undefined;
        pushMemo(actor, {
          id: `mem-${randomUUID().slice(0, 8)}`, tick, importance: 3,
          content: `我和 ${target.name} 一起到达了 ${destName}。`,
        });
        pushMemo(target, {
          id: `mem-${randomUUID().slice(0, 8)}`, tick, importance: 3,
          content: `我和 ${actor.name} 一起到达了 ${destName}。`,
        });
        return `${actor.name} 和 ${target.name} 结伴到达了 ${destName}。`;
      }

      actor.currentAction = ongoingAction;
      target.currentAction = partnerAction;

      pushMemo(actor, {
        id: `mem-${randomUUID().slice(0, 8)}`, tick, importance: 3,
        content: `我和 ${target.name} 开始结伴前往 ${destName}。${reason}`,
      });
      pushMemo(target, {
        id: `mem-${randomUUID().slice(0, 8)}`, tick, importance: 3,
        content: `我和 ${actor.name} 开始结伴前往 ${destName}。${reason}`,
      });

      return `${actor.name} 和 ${target.name} 开始结伴前往 ${destName}。`;
    }

    // Normal action execution (existing code)
    const outcome = def.execute(ctx, params);
    // ... rest of existing code unchanged ...
```

The existing outcome handling (`if (outcome.stateChanges)`, `pushMemo`, `outcome.targetMemory`, `return outcome.dialogRecord`) stays as-is after the travel_together block.

- [ ] **Step 3: Run full test suite**

Run: `pnpm test:backend`
Expected: All existing tests pass

- [ ] **Step 4: Commit**

```bash
git add backend/src/llm/dialog.ts
git commit -m "feat: handle travel_together in dialogue execution with dual ongoing actions"
```

---

### Task 4: Add travel_together tick-level movement processing

**Files:**
- Modify: `backend/src/server/tick.ts`

- [ ] **Step 1: Add travel_together processing block**

Insert after the think session locking block (after line 364, the closing `}` of the think session lock loop), BEFORE the `// 6. 角色决策（并发）` comment (line 366):

```typescript
  // ── travel_together: auto-step synchronised movement for paired characters ──
  const travelProcessed = new Set<string>();
  for (const c of characters) {
    const ca = c.currentAction;
    if (!ca || ca.type !== "travel_together" || travelProcessed.has(c.id)) continue;

    const partnerId = ca.partnerId;
    if (!partnerId) continue;
    const partner = characters.find(p => p.id === partnerId);
    if (!partner) continue;

    travelProcessed.add(c.id);
    travelProcessed.add(partnerId);

    const path = ca.path;
    if (!path || path.length === 0) continue;

    const stepIndex = ca.stepIndex ?? 0;
    const nextStep = stepIndex + 1;

    // Step both characters forward together
    ca.stepIndex = nextStep;
    c.locationId = path[nextStep];
    if (partner.currentAction?.type === "travel_together") {
      partner.currentAction.stepIndex = nextStep;
      partner.locationId = path[nextStep];
    }

    // Lock both (ensures lock even after dialogue ends)
    lockedCharacterIds.add(c.id);
    lockedCharacterIds.add(partnerId);

    if (nextStep >= path.length - 1) {
      // ── Arrived at destination ──
      const destId = path[path.length - 1];
      const destName = nodeById.get(destId)?.name ?? destId;

      c.currentAction = undefined;
      if (partner.currentAction?.type === "travel_together") {
        partner.currentAction = undefined;
      }

      c.shortMemory.push({
        id: `mem-${randomUUID().slice(0, 8)}`,
        tick: fromTick,
        importance: 3,
        content: `我和 ${partner.name} 一起到达了 ${destName}。`,
      });
      partner.shortMemory.push({
        id: `mem-${randomUUID().slice(0, 8)}`,
        tick: fromTick,
        importance: 3,
        content: `我和 ${c.name} 一起到达了 ${destName}。`,
      });

      allEvents.push({
        id: `evt-${randomUUID().slice(0, 8)}`,
        worldId,
        tick: fromTick,
        category: "action",
        description: `${c.name} 和 ${partner.name} 结伴到达了 ${destName}。`,
        participants: [c.id, partnerId],
        source: "actor",
        intensity: 2,
        scope: "node",
        nodeId: destId,
        duration: 1,
      });
    }
  }
```

- [ ] **Step 2: Add placeholder action generation for travel_together characters not in dialogue**

Modify the placeholder generation loop at lines 372-396. Add an `else if` branch after the think session check:

```typescript
  // Add placeholder actions for locked characters
  for (const charId of lockedCharacterIds) {
    const conv = ongoingConversations.find((c) => (c.initiatorId === charId || c.acceptorId === charId) && c.status !== "ended");
    const ts = ongoingThinkSessions.find((s) => s.characterId === charId && s.status !== "ended");
    if (conv) {
      const otherName = conv.initiatorId === charId
        ? characters.find((c) => c.id === conv.acceptorId)?.name ?? "某人"
        : characters.find((c) => c.id === conv.initiatorId)?.name ?? "某人";
      actionsForExecution.push({
        type: "wait",
        actorId: charId,
        reasoning: `正在和 ${otherName} 对话`,
        selfImportance: 2,
        skipExecution: true, skipMemory: true,
      });
    } else if (ts) {
      actionsForExecution.push({
        type: "wait",
        actorId: charId,
        reasoning: "正在沉思",
        selfImportance: 2,
        skipExecution: true, skipMemory: true,
      });
    } else {
      // travel_together without active dialogue (dialogue ended, movement continues)
      const c = characters.find(ch => ch.id === charId);
      if (c?.currentAction?.type === "travel_together") {
        const path = c.currentAction.path!;
        const destId = path[path.length - 1];
        const destName = nodeById.get(destId)?.name ?? destId;
        const partnerId = c.currentAction.partnerId!;
        const partner = characters.find(p => p.id === partnerId);
        const step = c.currentAction.stepIndex ?? 0;
        actionsForExecution.push({
          type: "wait",
          actorId: charId,
          reasoning: `正与 ${partner?.name ?? "同伴"} 结伴前往 ${destName} 途中（第 ${step}/${path.length - 1} 步）。`,
          selfImportance: 2,
          skipExecution: true, skipMemory: true,
        });
      }
    }
  }
```

- [ ] **Step 3: Run full test suite**

Run: `pnpm test:backend`
Expected: All existing tests pass

- [ ] **Step 4: Type check pass**

Run: `cd backend && pnpm tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add backend/src/server/tick.ts
git commit -m "feat: add travel_together auto-step processing in tick loop"
```

---

### Task 5: Integration test — travel_together propose → accept → execute → arrive

**Files:**
- Create: `backend/src/systems/travel-together.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { actionRegistry } from "../domain/index";
import { BUILTIN_ACTIONS } from "./index";

// Ensure actions are registered
actionRegistry.registerAll(BUILTIN_ACTIONS);

describe("travel_together action definition", () => {
  it("is registered in BUILTIN_ACTIONS", () => {
    const def = actionRegistry.get("travel_together");
    expect(def).toBeDefined();
    expect(def!.type).toBe("travel_together");
  });

  it("is usableInDialogue", () => {
    const def = actionRegistry.get("travel_together")!;
    expect(def.usableInDialogue).toBe(true);
  });

  it("is NOT available in normal decision (check returns false)", () => {
    const def = actionRegistry.get("travel_together")!;
    const ctx = minimalCtx();
    expect(def.check(ctx)).toBe(false);
  });

  it("appears in dialogue actions via getDialogueActions", () => {
    const def = actionRegistry.get("travel_together")!;
    const ctx = minimalCtx();
    const dialogueActions = actionRegistry.getDialogueActions(ctx);
    expect(dialogueActions.some(d => d.type === "travel_together")).toBe(true);
  });

  describe("validateParams", () => {
    const def = actionRegistry.get("travel_together")!;

    it("rejects missing target_node_id", () => {
      const ctx = minimalCtx();
      expect(def.validateParams!({ reason: "一起去玩" }, ctx)).toContain("target_node_id");
    });

    it("rejects missing reason", () => {
      const ctx = minimalCtx();
      expect(def.validateParams!({ target_node_id: "node-b" }, ctx)).toContain("reason");
    });

    it("rejects same node as current", () => {
      const ctx = minimalCtx();
      (ctx.here as any).id = "here";
      expect(def.validateParams!({ target_node_id: "here", reason: "走" }, ctx)).toContain("已经在目的地");
    });

    it("rejects unreachable node", () => {
      const ctx = minimalCtx();
      const err = def.validateParams!({ target_node_id: "unknown", reason: "走" }, ctx);
      expect(err).toBeTruthy();
    });

    it("accepts valid params", () => {
      const ctx = minimalCtx();
      const err = def.validateParams!({ target_node_id: "node-b", reason: "一起去吃饭" }, ctx);
      expect(err).toBeNull();
    });
  });
});

function minimalCtx() {
  return {
    worldId: "test",
    tick: 0,
    epoch: 1000000,
    self: {
      id: "char-a",
      name: "Alice",
      locationId: "here",
      money: 100,
      vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
      emotion: { mood: 0, stress: 0, social_satiety: 0 },
      shortMemory: [],
      activeConversationIds: [],
      lastConversationEndTick: 0,
      relations: {},
      impressionBook: {},
    },
    here: {
      id: "here",
      name: "Current Place",
      tags: [],
      shortcuts: [],
    },
    companions: [
      {
        id: "char-b",
        name: "Bob",
        locationId: "here",
        vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
        emotion: { mood: 0, stress: 0, social_satiety: 0 },
        currentAction: undefined,
        shortMemory: [],
        relations: {},
        impressionBook: {},
      },
    ],
    reachable: [
      {
        id: "node-b",
        parentId: "here",
        name: "Destination",
        tags: [],
        shortcuts: [],
      },
    ],
    isSleepHour: false,
    facts: {
      activityNodeId: null,
      activityNodeName: null,
      restNodeId: null,
      restNodeName: null,
      hoursAtCurrentLocation: 0,
      todayActionCounts: {},
      todayChatTargets: {},
    },
  } as any;
}
```

- [ ] **Step 2: Run the test**

Run: `cd backend && npx vitest run src/systems/travel-together.test.ts`
Expected: 8 tests pass

- [ ] **Step 3: Commit**

```bash
git add backend/src/systems/travel-together.test.ts
git commit -m "test: add travel_together action definition and validation tests"
```

---

### Task 6: Verify full build and test suite

- [ ] **Step 1: Run full backend tests**

Run: `pnpm test:backend`
Expected: All tests pass

- [ ] **Step 2: Type check**

Run: `cd backend && pnpm tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: No new lint errors

- [ ] **Step 4: Commit any remaining changes if needed**

```bash
git status
# Only commit if there are uncommitted changes
```
