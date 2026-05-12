---
name: agent-world-action-test
description: Use when writing or debugging tests for any dialogue-based interactive action (give, kiss, trade, comfort, teach, etc.) in the agent-world project, OR when running the LLM action diagnostic tool (diagnose-action.ts) to test whether an action is correctly guided by prompts. Triggers include "测试对话action"、"dialogue action test"、"测试action"、"action调不到"、"diagnose action"、"诊断action"、"测试 eat"、"测一下 kiss"、"这个action为什么没有被调用"、"mock turnDecide"、"propose_dialogue_action"、any mention of testing the propose→pending→respond→execute flow, or when a dialogue action test fails. Also use when adding usableInDialogue to a new action and needing to verify end-to-end behavior.
---

# Agent World Action Testing

Two distinct testing approaches: dialogue action unit tests (mock-based) and LLM action diagnostic (real LLM calls).

## LLM Action Diagnostic Tool

When an action is added but never gets called by the LLM, use `diagnose-action.ts` to determine whether the issue is in the prompt or the code path.

### Run a single diagnostic

```bash
cd backend && npx tsx scripts/diagnose-action.ts --action <type> --entry <entry>
```

Supported entries: `decide`, `dialog`, `think`, `accept`, `summary`, `memory`, `placement`.

**WARNING: The `dialog` entry is BROKEN** — it imports `llmDialogTurn` which was removed in the agentic refactor (commit `8363581`). The diagnostic tool needs to be updated to use `newDialogTurn` from `dialog.ts`. Until fixed, dialog diagnostics will throw at import time.

### Run all diagnostics for one entry

```bash
cd backend && npx tsx scripts/diagnose-action.ts --all --entry decide
```

### Customize rounds per case

```bash
cd backend && npx tsx scripts/diagnose-action.ts --all --rounds 10
```

### How it works

1. Injects **strongly induced** game state (extreme vitals, matching location tags, companions) into DB via SAVEPOINT
2. Calls the real LLM function for the specified entry point
3. Repeats up to `--rounds` times (default 10), stopping on first successful trigger
4. Reports: **pass** if the target action/tool triggers at least once; **fail** if it never triggers
5. Rolls back all DB changes after each test

### Induction strategy

Each profile uses **extreme contrasting values** to eliminate competing actions:

- Target vital set to 99, competing vitals set to 0
- Location tag chosen to strongly imply the target action AND avoid overlap with other actions (especially bathing)
- For dialogue actions: conversation lines that unmistakably point to the target action
- Companion placed at same location when needed for social/dialogue actions

### Induction profile design principles

**Vitals strategy:**
- Target vital = 99, competing vitals = 0
- This eliminates action competition (e.g., hunger=99 + hygiene=0 means eat wins over bathe)

**Location strategy:**
- EVERY profile must specify `locationTag` — characters without one may land at `hotel-onsen` (bathing), causing `bathe` to dominate all other actions
- Choose tags that imply the target action AND don't overlap with bathing: `dining`, `quiet`, `street`, `park`, `education`, `residence`
- Check actual node tags with: `SELECT id, name, tags_json FROM nodes` — don't guess tag names

**Companion strategy:**
- `companionFilter: { sameLocation: true }` — `injectState` moves companion to target node; `resolveCharacter` picks any other character (no longer requires them to already be there)

**Dialogue strategy:**
- 1 line of dialogue history is sufficient if the request is clear and specific
- Use the peer's ACTUAL character name (e.g., `小林夏希`) in dialogue history — the parser does `speakerName.includes(updatedSelf.name)` to map speakers
- The request must match the character's psychology: a rational introvert won't give money to a stranger, but will share food with someone hungry

**Inject format:**
- `inventory` must be `Item[]` format: `[{ itemDefId: "苹果", acquiredTick: 0 }]` — the injection code auto-wraps string IDs into proper format

### Common failure patterns

| Symptom | Root cause | Fix |
|---|---|---|
| `bathe` wins every decide test | Character at bathing-tag node (hotel-onsen) — bathing check() passes easily | Add `locationTag` to EVERY profile |
| `look_around` wins when no needs | All vitals at 0 + no location incentive — look_around is the universal fallback | Set target vital to 99 to create urgency |
| `rest` chosen over `sleep` | Both satisfy fatigue; rest is shorter/instant | Increase fatigue to 99 + set `isSleepHour: true` |
| Dialog action never proposed | LLM chats in pure text without tool calls; or character psychology blocks the action | Enrich tool description with context (money, items); align dialogue request with character personality |
| `check() failed` / unavailable | Action requires data not present in DB (shops, employment) | Seed the scene's shops first; mark as data-dependent in profile |
| `No node found with privacy "X"` | All nodes have `privacy: "public"` in this scene | Use `locationTag` with an existing tag instead of `locationPrivacy` |
| `No companion available` | Companion not at target location before injection | `resolveCharacter` no longer filters by `sameLocation` — `injectState` moves them |
| **DeepSeek: LLM outputs text, no tool call** | DeepSeek models frequently output narrative text/actions instead of tool calls, sometimes for 4+ consecutive rounds | Agent-loop re-prompt mechanism handles this (max 3 rounds per agent-loop, max 3 inner-loops in dialog). Usually recovers, but may exhaust rounds on complex turns. Consider increasing `maxRounds` or using a different model for dialog. |
| **DeepSeek: nested object serialized as string** | DeepSeek sometimes serializes nested JSON objects (like `action_response`) as escaped strings: `"{\"accept\": false, ...}"` instead of `{accept: false, ...}` | Zod validation catches this and returns a clear error. LLM usually corrects it on the next attempt. |
| **DeepSeek: wrong parameter name** | LLM uses slightly wrong parameter names (e.g., `important` instead of `importance`) | Same as above — Zod catches it, LLM corrects on re-prompt. |

## Dialogue Action Architecture (Current — Agentic Loop)

Dialogue actions use the shared `runAgentLoop` via `newDialogTurn()`. The agent has access to these tools:

- **`write_propose_action`** (non-terminal): Proposes a dialogue action. Returns a note telling the LLM to continue with `write_dialog`.
- **`write_respond_action`** (non-terminal): Accepts/rejects a pending proposal. Returns a note telling the LLM to continue with `write_dialog`.
- **`write_dialog`** (terminal): Speaks a line. Can optionally include `action_proposal` (to propose inline) or `action_response` (to accept/reject inline). This is the primary terminal tool.
- **`end_dialog`** (terminal): Ends the conversation.

**Inner loop** (max 3 iterations): Non-terminal tools (write_propose_action, write_respond_action, write_memory, etc.) loop back so the LLM can think→propose→speak in a single turn.

**Pending action flow across turns/ticks:**
```
Turn N, Speaker A:
  write_propose_action(give, amount=50) → captured in newDialogTurn's capturedState
  write_dialog("给你50块")              → terminal, returns proposeAction in result

runOneTickDialog:
  conv.pendingAction = { requesterId: A, targetId: B, actionType: "give", params: {amount:50} }

Turn N+1, Speaker B:
  newDialogTurn({ pendingAction })      → reminder injected into sharedMessages:
    "[系统] A 向你提议了「赠送金钱」。你必须对此做出回应。
     在 write_dialog 中通过 action_response 参数表达你的决定。"
  
  write_dialog("谢谢！", action_response={accept:true, reason:"感谢"})
    → respondToAction in result
    → executeDialogueAction() runs
    → action_result injected into transcript
    → conv.pendingAction = undefined
```

**Key files:**
| What | File | Lines |
|---|---|---|
| `runAgentLoop` (shared engine) | `llm/agent-loop.ts` | 76-289 |
| `newDialogTurn` (per-turn dialog) | `llm/dialog.ts` | 418-541 |
| `runOneTickDialog` (per-tick orchestration) | `llm/dialog.ts` | 723-984 |
| `runDialogPhase` (full dialog phase) | `llm/dialog.ts` | 1070-1419 |
| `executeDialogueAction` | `llm/dialog.ts` | 550-714 |
| Pending action reminder injection | `llm/dialog.ts` | 442-460 |
| System prompts (decide/dialog/think) | `llm/system-prompts.ts` | 1-87 |
| Tool handlers (read/write) | `llm/tool-handlers.ts` | 1-489 |
| Tool definitions (schemas) | `domain/schemas.ts` | 441-531 |

**Dialogue action types** are NOT per-action tools. The LLM uses the generic `write_propose_action` with an `action_type` string parameter. Available action types come from `actionRegistry.getDialogueActions()` which returns all actions with `usableInDialogue: true`.

## Testing Accept/Reject with Real LLM

When you need to verify that the accept/reject flow works end-to-end (not just proposal), use a **pre-built Conversation with pendingAction**:

```typescript
// 1. Load a real world
const loaded = loadWorld(worldId);
const { world, characters, nodes } = loaded;

// 2. Pick two characters at the same node
// (use locationGroups to find same-location pairs)

// 3. Build a Conversation with a pendingAction already set
const ongoingConv: Conversation = {
  id: `conv-test-${randomUUID().slice(0, 8)}`,
  worldId,
  initiatorId: charA.id,
  acceptorId: charB.id,
  transcript: [
    { speakerId: "__system__", kind: "say", line: "现在是 10:00（上午）。" },
    { speakerId: charA.id, kind: "say", line: "给你点零花钱。" },
  ],
  tickStarted: world.currentTick,
  currentTickRounds: 0,
  status: "active",
  pendingAction: {
    requesterId: charA.id,
    targetId: charB.id,
    actionType: "give",
    params: { amount: 30, reason: "零花钱" },
  },
  sharedMessages: [],
};

// 4. Run through runDialogPhase with the pre-built conversation
const result = await runDialogPhase({
  rawActions: [],               // No new actions — only ongoing conversation
  characters: [charA, charB],
  nodes,
  perceptions: new Map(),
  tick: world.currentTick,
  epoch: world.epoch,
  worldName: world.name,
  worldDescription: manifest.description ?? "",
  language: "zh",
  acceptDecide: mockAccept,
  summaryDecide: mockSummary,
  salvageDecide: mockSalvage,
  ongoingConversations: [ongoingConv],
});

// 5. Check results
const conv = result.updatedConversations.find(c => c.id === convId);
const actionResults = conv.transcript.filter(t => t.kind === "action_result");
// Expect: action_result injected, conv.pendingAction cleared,
// money transferred (if accepted) or unchanged (if rejected)
```

**Why pre-build instead of relying on natural proposal:** In testing, the LLM rarely proposes dialogue actions naturally — characters tend to just chat. Pre-building the conversation with a pendingAction guarantees the responder sees the reminder and you can test the accept/reject path deterministically.

**Gotcha:** `runOneTickDialog` injects its own time message via `injectTimeMessage()`. If your pre-built transcript already has a time message, you'll see duplicates. This is harmless but confusing in logs.

## Dialogue Action Unit Testing (Mock-Based)

How to write tests for dialogue action execution — the `executeDialogueAction` path after accept.

### Architecture (accept path only)

```
runDialogPhase → runOneTickDialog → newDialogTurn
  → LLM calls write_dialog with action_response: {accept: true}
  → respondToAction processed in runOneTickDialog
  → executeDialogueAction(actionType, actor, target, params, ...)
    → def.execute(ctx, params)
    → applies stateChanges to both parties
    → pushes action_result turn to transcript
    → writes memory to both parties
```

### Test approach

Since dialog turns are LLM-driven (no `turnDecide` mock parameter), unit testing the accept/reject flow requires either:

1. **Mock `runAgentLoop`** — intercept the agent-loop to return a pre-crafted `write_dialog` with `action_response`
2. **Test `executeDialogueAction` directly** — test the execution phase in isolation by calling it with known params
3. **Integration test with real LLM** — use the pre-built Conversation approach described above

For testing the *execution* of a dialogue action (state changes, memory, transcript injection), test `executeDialogueAction` directly. For testing the *propose→respond→execute flow*, use the pre-built Conversation LLM integration test.

### Test file location and setup

```typescript
// backend/src/systems/dialog-<action-name>.test.ts
import {
  runDialogPhase,
  type AcceptDecideFn,
  type SummaryDecideFn,
  type SalvageDecideFn,
} from "../llm/dialog";
import { actionRegistry } from "../domain/action-system";
import { BUILTIN_ACTIONS } from "./actions-builtin";

BUILTIN_ACTIONS.forEach((a) => actionRegistry.register(a));
```

### Test harness — calling runDialogPhase with mocks

`runDialogPhase` accepts these injectable functions (all others are real LLM calls):

```typescript
const result = await runDialogPhase({
  rawActions,              // Action[] — at least one "chat" to start conversation
  characters,              // Character[] — the participants
  nodes,                   // MapNode[]
  perceptions,             // Map<string, WorldEvent[]> — usually new Map()
  tick,                    // number
  epoch,                   // number (ms timestamp)
  worldName,               // string
  worldDescription,        // string
  language,                // "zh" | "en" | "ja"
  acceptDecide,            // AcceptDecideFn — mockable (accept/reject chat invite)
  summaryDecide,           // SummaryDecideFn — mockable (end-of-conversation summary)
  salvageDecide,           // SalvageDecideFn — mockable (fallback after rejection)
  ongoingConversations,    // Conversation[] — for multi-tick continuation
});
```

**Note: there is NO `turnDecide` or `personalMemoryDecide` parameter.** Dialog turns are driven by real LLM calls to `newDialogTurn` → `runAgentLoop`. To mock individual turns, you must mock `runAgentLoop` directly or use the pre-built Conversation integration approach.

### Character factory

```typescript
function makeChar(id: string, name: string, loc: string, overrides?: Partial<Character>): Character {
  return {
    id, worldId: "w", name, age: 30, gender: "male" as const,
    profession: "farmer" as const, biography: "テスト", origin: "local" as const,
    locationId: loc, personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
    vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
    emotion: { mood: 0, stress: 0, social_satiety: 0 },
    abilities: [], activeConversationIds: [], appearance: 2, intelligence: 2, health: 2,
    shortMemory: [], dailyMemory: [], longMemory: [], relations: {}, lastSleepTick: 0,
    money: 100, incomeLevel: 0, expenseExempt: false,
    impressionBook: {}, shortTermGoal: null, longTermGoal: null, liked: "", disliked: "",
    notebook: [], lastConversationEndTick: 0,
    ...overrides,
  };
}
```

### Default mocks

```typescript
const mockAccept = (): AcceptDecideFn =>
  async ({ requesterId }) => ({
    type: "accept_chat",      // NOT "accept_speak"
    targetId: requesterId,
    reasoning: "ok",
    selfImportance: 2,
  });

const mockSummary = (text = "一段闲聊"): SummaryDecideFn =>
  async () => ({ summary: text });

const mockSalvage = (): SalvageDecideFn =>
  async ({ character }) => ({
    type: "wait",
    actorId: character.id,
    reasoning: "等等",
    selfImportance: 2,
    skipExecution: true,
    skipMemory: true,
  });

function baseNode(): any {
  return {
    id: "n1", worldId: "w", parentId: null, name: "测试场景", description: "",
    tags: ["public"], capacity: null, privacy: "public", visibleFromParent: true,
    shortcuts: [], isEntry: false,
  };
}
```

## Verifying execution results

Read the action definition's `execute()` return value. The `Outcome` fields tell you what to check:

| Outcome field | What to verify |
|---|---|
| `stateChanges[]` | Character state mutated (money, vitals, emotion, relations, etc.) |
| `stateChanges[].targetCharacterId` | Cross-character effects applied to target |
| `dialogRecord` | `action_result` turn injected into transcript with this text |
| `memory` | Short memory written for the initiator |
| `event` | WorldEvent generated |

| StateChange kind | Assertion |
|---|---|
| `adjustMoney` | `expect(char.money).toBe(expected)` |
| `adjustMoney` + `targetCharacterId` | Both initiator AND target money changed |
| `resetVital` / `adjustVital` | `expect(char.vitals.hunger).toBe(expected)` etc. |
| `adjustMood` | `expect(char.emotion.mood).toBe(expected)` |
| `setOngoingAction` / `clearOngoingAction` | `expect(char.currentAction).toBe(expected)` |

### Verifying transcript injection

```typescript
const conv = result.updatedConversations.find(c => c.status !== "ended" || c.endedBy);
const actionResults = conv.transcript.filter(t => t.kind === "action_result");
expect(actionResults.length).toBeGreaterThan(0);
expect(actionResults[0].line).toContain("<expected dialogRecord text>");
```

The `action_result` turn has `speakerId: "__system__"` and `kind: "action_result"`.

## Common bugs

### 1. State change applied to initiator but NOT to target

**Symptom:** Initiator's state changes but target's stays the same (e.g., giver loses money but recipient doesn't gain it).

**Root cause:** `executeDialogueAction` calls `applyStateChange()` which triggers `recordTransaction()` — a DB write. In test environments without the DB table, `recordTransaction` throws. The `catch` in `executeDialogueAction` swallows it, but `applyStateChange` already modified initiator's state before the throw.

**Fix:** In `executeDialogueAction`, handle state changes that involve `targetCharacterId` inline. For money:

```typescript
if (sc.kind === "adjustMoney") {
  actor.money += sc.amount;
  if (sc.targetCharacterId) {
    const tgt = chars.get(sc.targetCharacterId);
    if (tgt) tgt.money += (-sc.amount);
  }
} else {
  applyStateChange(actor, sc, worldId, tick);
}
```

### 2. Pending action silently dropped — LLM never responds

**Symptom:** A dialogue action is proposed but the other party never responds (accept/reject). The conversation ends with `pendingAction` still set.

**Root cause:** Before the fix in `dialog.ts:442-460`, `args.pendingAction` was accepted as a parameter in `newDialogTurn` but never used. The LLM only knew about the pending action from historical tool calls in `sharedMessages`, which could be forgotten across ticks or buried in long contexts.

**Fix:** A reminder message is now injected into `sharedMessages` when `args.pendingAction` is truthy: `"[系统] {name} 向你提议了「{action}」。你必须对此做出回应..."`. This ensures the LLM explicitly knows about the pending action regardless of context length.

### 3. DeepSeek outputs text instead of tool calls

**Symptom:** Agent loop round shows "工具: []" with a text response — no tools called. Can happen for 4+ consecutive rounds.

**Root cause:** DeepSeek models sometimes respond in narrative mode, outputting character actions/thoughts as text rather than calling tools.

**Fix:** The agent-loop's re-prompt mechanism (`"请使用工具来完成你的任务"`) handles this. The dialog inner loop (max 3) gives additional chances. If both exhaust, the conversation ends. Consider using non-DeepSeek models for dialog if this is frequent.

### 4. DeepSeek serializes nested objects as JSON strings

**Symptom:** Zod validation fails with `expected object, received string` for nested params like `action_response`.

**Example:** `"action_response": "{\"accept\": false, \"reason\": \"...\"}"` instead of `"action_response": {"accept": false, "reason": "..."}`

**Fix:** The Zod validation in `agent-loop.ts:196-218` catches this and returns a clear error. The LLM corrects it on the next attempt. No code change needed — the validation is already working correctly.

## Test scenarios checklist

For any new dialogue action, cover at minimum:

- [ ] Propose → accept → state changes applied correctly to both parties
- [ ] Propose → accept → `action_result` injected into transcript with correct `dialogRecord` text
- [ ] Propose → accept → memory written to both initiator and target
- [ ] Propose → reject → no state changes, `action_result` shows rejection
- [ ] Propose → target ignores (doesn't respond) → state unchanged, pendingAction preserved in conversation
- [ ] Propose → conversation ends before response → state unchanged, pendingAction cleared with conversation
- [ ] Conversation ends WITH accept in same turn → state changes applied
- [ ] Back-and-forth: accept old pending + propose new one in same turn — both execute correctly
- [ ] Action params validation: invalid/edge params handled gracefully
- [ ] Cross-character effects: verify `targetCharacterId` path works
- [ ] Unknown action_type in pendingAction → no crash, no state change
- [ ] **Cross-tick pending: action proposed in tick N, responded in tick N+1 → reminder injected, response processed**

## Debugging

### Run existing tests

```bash
cd backend && npx vitest run --reporter verbose
```

### Run a single test

```bash
npx vitest run src/systems/actions-builtin.test.ts -t "<test name>" --reporter verbose
```

### Trace dialog flow in integration test

```typescript
console.log(conv.transcript.map(t =>
  `[${t.speakerId}] ${t.kind}: ${(t as any).line ?? ""}`
));
```

### Check agent-loop logs

All agent-loop rounds are logged at INFO level with tool calls, reasoning previews, and validation errors. Look for:
- `llm-agent-loop` — round-by-round tool calls and reasoning
- `llm-agent-loop 参数校验失败` — Zod validation errors (DeepSeek type coercion issues)
- `llm-agent-loop 终端工具调用` — which terminal tool was hit
- `llm-agent-loop 轮次耗尽` — agent exhausted without hitting a terminal tool
