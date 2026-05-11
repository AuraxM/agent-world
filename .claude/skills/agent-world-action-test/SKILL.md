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

### Run all diagnostics for one entry

```bash
cd backend && npx tsx scripts/diagnose-action.ts --all --entry decide
```

### Run all diagnostics across all entries

```bash
cd backend && npx tsx scripts/diagnose-action.ts --all
```

### Customize rounds per case

```bash
# Default: 10 rounds per case. Each case stops on first success.
cd backend && npx tsx scripts/diagnose-action.ts --all --rounds 10

# Single case with 5 rounds
cd backend && npx tsx scripts/diagnose-action.ts --action eat --entry decide --rounds 5
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

### Diagnostic report sections

1. **Code path check** — Is the action registered? Does `check()` pass? Is it in the tool enum?
2. **Induction state** — What game state was injected to induce the action
3. **LLM result** — What did the LLM choose? Did it match the target action?
4. **Full prompts** — System prompt, user prompt, tools JSON (for manual inspection)

### When to use

- A newly added action never gets called during gameplay
- You suspect the prompt doesn't describe the action clearly enough
- You suspect the code path (`check()`, `buildOptions`, tool injection) is broken
- You want to verify an LLM provider/model combination handles a specific action correctly

### Per-action dialogue tool architecture

Dialogue actions use **per-action tools** (like `decide`), not a generic `propose_dialogue_action` with `action_type` enum.

**Tool naming:** `propose_dialogue_<type>` (e.g., `propose_dialogue_give`, `propose_dialogue_travel_together`)

**Key files:**
| What | File | Lines |
|---|---|---|
| `DIALOGUE_ACTION_TOOL_PREFIX` | `domain/schemas.ts` | ~290 |
| `buildDialogueActionTools()` | `domain/schemas.ts` | ~330 |
| `buildDialogueToolParams()` — filters `target_id` (always peer) | `domain/schemas.ts` | ~310 |
| Tool setup in `llmDialogTurn` | `llm/decide.ts` | ~630 |
| Tool parsing (prefix match) | `llm/decide.ts` | ~1030 |
| `buildDialogueActionsBlock()` — prompt listing | `llm/prompt.ts` | ~1211 |
| `buildDialogTurnFollowup()` — followup listing | `llm/prompt.ts` | ~1411 |

**Tool description enrichment** in `buildDialogueActionTools()`:
- `give`: shows current money — `在对话中给予对方金钱（你当前有 ${money}💰）。`
- `give_item`: lists inventory — `你背包里有：${items}。`
- `manage_employment`: clarifies — `需要你是店主且有雇员名额。`
- Others: use `triggerHint` as-is

**Tool params** are built from `ActionDefinition.extraParams`, filtering out `target_id` (implicitly the conversation peer). Common params `reasoning` + `free_text` are always added.

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
| Dialogue: LLM outputs text, no tool call (round 1) | DeepSeek model occasionally responds with narrative actions instead of tool calls | The re-prompt mechanism handles this (max 3 rounds); usually recovers by round 2 |

### Data-dependent actions

Some actions cannot pass diagnostic without specific DB data:

- **work**: requires `shops` table with employee records — `check()` returns `false` if no shop employs the character
- **buy**: requires a shop at the current node — `check()` returns `false` if `findShopAtNode()` returns null
- **manage_employment**: requires the character to be a shop owner with employee slots — works only in scenes with shop-owning characters

Diagnostic pre-checks (`inBuildOptions`) catch these before wasting LLM rounds.

### Diagnostic code path

**Decide pre-check** (avoids LLM call when action unavailable):
```
diagnose-action.ts → runDecideDiagnostic()
  → buildActionContext() + getAvailableActions()
  → if target action NOT in options → return early (0ms, "unavailable")
  → else call llmDecide()
```

**Dialog flow:**
```
diagnose-action.ts → runDialogDiagnostic()
  → resolveCharacter() → injectState() → loadWorld()
  → build transcript from dialogueHistory strings
  → llmDialogTurn({ self, peer, transcript, dialogueActions, ... })
  → checks result.proposeAction for match
```

## Dialogue Action Unit Testing

How to write and debug tests for actions proposed and accepted during dialogue — any action where `usableInDialogue: true`.

## Architecture

Every dialogue action follows the same 4-phase protocol, regardless of what the action does:

```
Phase 1 — Propose:  A calls submit_dialog_turn + propose_dialogue_<type>(params)
                     → conv.pendingAction = { requesterId: A, actionType: <type>, params }
                     → state unchanged (execution is deferred)

Phase 2 — Respond:   B calls submit_dialog_turn + respond_to_dialogue_action("accept"|"reject")
                     → if accept: executeDialogueAction() runs, action_result pushed to transcript
                     → if reject: pendingAction cleared, nothing executes

Phase 3 — Execute:   executeDialogueAction() calls def.execute(ctx, params)
                     → applies stateChanges to initiator via applyStateChange
                     → applies cross-character stateChanges via targetCharacterId
                     → injects outcome.dialogRecord as __system__ action_result turn
                     → writes memory to both parties
```

Each dialogue action is a **separate tool**: `propose_dialogue_give`, `propose_dialogue_give_item`, `propose_dialogue_travel_together`, `propose_dialogue_manage_employment`. The tool name itself identifies the action type — no `action_type` parameter. Tool descriptions are enriched with character context (money, inventory) for better LLM guidance.

Code path: `decide.ts/llmDialogTurn` → `dialog.ts/runOneTickDialog` → `dialog.ts/executeDialogueAction`

## Test file location and setup

```typescript
// src/engine/dialog-<action-name>.test.ts
import {
  runDialogPhase,
  type AcceptDecideFn, type TurnDecideFn,
  type SummaryDecideFn, type PersonalMemoryDecideFn, type SalvageDecideFn,
  type DialogueActionProposal, type DialogueActionResponse,
} from "./dialog";
import { actionRegistry, type ActionInput } from "@/domain/action-system";
import { BUILTIN_ACTIONS } from "./actions-builtin";

// Register builtins (actionRegistry is a global singleton)
BUILTIN_ACTIONS.forEach((a) => actionRegistry.register(a));
```

## Test harness

Always test through `runDialogPhase` directly (not `tick.ts`). All LLM decision points are injected as mocks:

```typescript
const result = await runDialogPhase({
  rawActions,            // Action[] — at least one "chat" to start conversation
  characters,            // Character[] — the participants
  nodes,                 // MapNode[] — usually just [baseNode()]
  perceptions,           // Map<string, WorldEvent[]> — usually new Map()
  tick,                  // number
  worldName: "测试世界",
  language: "zh",
  acceptDecide,          // AcceptDecideFn mock
  turnDecide,            // TurnDecideFn mock ← where you control the action flow
  summaryDecide,         // SummaryDecideFn mock
  personalMemoryDecide,  // PersonalMemoryDecideFn mock
  salvageDecide,         // SalvageDecideFn mock
  ongoingConversations,  // Conversation[] | undefined — for multi-tick tests
});
```

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
    ...overrides,
  };
}
```

### Default mocks (reusable)

```typescript
const mockAccept = (result: "accept_speak" | "reject_speak" = "accept_speak"): AcceptDecideFn =>
  async ({ requesterId }) => ({ type: result, targetId: requesterId, reasoning: "ok", selfImportance: 2 });

const mockSummary = (text = "一段闲聊"): SummaryDecideFn => async () => ({ summary: text });

const mockPersonalMemory = (): PersonalMemoryDecideFn => async () => ({ feeling: "还行", impression: "印象一般", topics: ["闲聊"] });

const mockSalvage = (): SalvageDecideFn =>
  async ({ character }) => ({ type: "wait" as any, actorId: character.id, reasoning: "等等", selfImportance: 2 });

function baseNode(): any {
  return {
    id: "n1", worldId: "w", parentId: null, name: "测试场景", description: "",
    tags: ["public"], capacity: null, privacy: "public", visibleFromParent: true,
    shortcuts: [], isEntry: false,
  };
}
```

## Mock patterns for TurnDecideFn

### CRITICAL: one-shot guard for propose

Each character speaks 3 times per tick (6 turns total per tick). Without a guard, `if (!pendingAction)` re-triggers on every turn after pendingAction is cleared. Always use a closure flag:

```typescript
let proposed = false;
let accepted = false;

turnDecide: async ({ self, pendingAction }) => {
  if (self.id === "b" && !pendingAction && !proposed) {
    proposed = true;
    return {
      kind: "turn" as const,
      turn: { speakerId: "b", kind: "say" as const, line: "来，给你。" },
      proposeAction: {
        actionType: "<action_type>",
        targetId: "a",
        params: { /* action-specific params */ },
      } as DialogueActionProposal,
    };
  }
  if (self.id === "a" && pendingAction && !accepted) {
    accepted = true;
    return {
      kind: "turn" as const,
      turn: { speakerId: "a", kind: "say" as const, line: "谢谢！" },
      respondToAction: { accepted: true, reasoning: "..." } as DialogueActionResponse,
    };
  }
  return { kind: "turn" as const, turn: { speakerId: self.id, kind: "say" as const, line: "…" } };
},
```

All patterns below assume the one-shot guard pattern. It is not repeated in every example, but it is always required.

### Reject a pending action

```typescript
respondToAction: { accepted: false, reasoning: "不需要" } as DialogueActionResponse
```

### End conversation + respond to pending

```typescript
return {
  kind: "end" as const,
  payload: { reasoning: "聊完了", closingLine: "再见" },
  respondToAction: { accepted: true, reasoning: "收下" } as DialogueActionResponse,
};
```

### Simultaneously accept AND propose (back-and-forth)

Character accepts old pending, then immediately proposes a new one:

```typescript
return {
  kind: "turn" as const,
  turn: { speakerId: "a", kind: "say" as const, line: "收到了，这给你回礼。" },
  respondToAction: { accepted: true, reasoning: "收下" } as DialogueActionResponse,
  proposeAction: { actionType: "<type>", targetId: "b", params: {...} } as DialogueActionProposal,
};
```

The engine processes `respondToAction` first (clearing old pending), then `proposeAction` (setting new pending). This ordering prevents the new proposal from overwriting the old one before it's responded to.

## How to determine what to verify

Read the action definition's `execute()` return value. The `Outcome` fields tell you what to check:

| Outcome field | What to verify |
|---|---|
| `stateChanges[]` | Character state mutated (money, vitals, emotion, relations, etc.) |
| `stateChanges[].targetCharacterId` | Cross-character effects applied to target |
| `dialogRecord` | `action_result` turn injected into transcript with this text |
| `memory` | Short memory written for the initiator |
| `event` | WorldEvent generated |

For each state change kind, determine the right assertion:

| StateChange kind | Assertion |
|---|---|
| `adjustMoney` | `expect(char.money).toBe(expected)` |
| `adjustMoney` + `targetCharacterId` | Both initiator AND target money changed |
| `resetVital` / `adjustVital` | `expect(char.vitals.hunger).toBe(expected)` etc. |
| `adjustMood` | `expect(char.emotion.mood).toBe(expected)` |
| `setOngoingAction` / `clearOngoingAction` | `expect(char.currentAction).toBe(expected)` |

**Example for a give action** (stateChanges = `[{ kind: "adjustMoney", amount: -N, targetCharacterId: "a" }]`):

```typescript
expect(b.money).toBe(100 - N);  // initiator: deducted
expect(a.money).toBe(5 + N);    // target: credited via targetCharacterId
```

**Example for a hypothetical "kiss" action** (stateChanges = `[{ kind: "adjustMood", delta: 1, targetCharacterId: "a" }]`):

```typescript
expect(b.emotion.mood).toBe(prevB + 1);  // initiator mood up
expect(a.emotion.mood).toBe(prevA + 1);  // target mood up via targetCharacterId
```

## Verifying transcript injection

Every accepted dialogue action should inject an `action_result` turn:

```typescript
const conv = result.updatedConversations.find(
  c => c.status !== "ended" || c.endedBy
);
const actionResults = conv.transcript.filter(t => t.kind === "action_result");
expect(actionResults.length).toBeGreaterThan(0);
expect(actionResults[0].line).toContain("<expected dialogRecord text>");
```

The `action_result` turn has `speakerId: "__system__"` and `kind: "action_result"`.

## Common bugs

### 1. State change applied to initiator but NOT to target

**Symptom:** Initiator's state changes but target's stays the same (e.g., giver loses money but recipient doesn't gain it).

**Root cause:** `executeDialogueAction` calls `applyStateChange()` which triggers `recordTransaction()` — a DB write. In test environments without the DB table, `recordTransaction` throws. The `catch` in `executeDialogueAction` swallows it, but `applyStateChange` already modified initiator's state before the throw. The cross-character code (which runs after `applyStateChange`) never executes.

**Fix:** In `executeDialogueAction`, handle state changes that involve `targetCharacterId` inline, without going through `applyStateChange`. For money:

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

For other state change types with `targetCharacterId`, apply the same pattern: mutate target directly instead of relying on `applyStateChange`. If the state change is pure (no DB side effect in `applyStateChange`), calling `applyStateChange` for both initiator and target is fine.

### 2. Action executes multiple times in the same tick

**Symptom:** State change magnitude is 2x or 3x expected (money, vitals, etc.).

**Root cause:** 6 turns per tick. Without a `!proposed` guard, the propose branch re-triggers every time `!pendingAction` is true again (after accept clears it).

**Fix:** Always use one-shot flags in mock turnDecide.

### 3. Wrong pendingAction read during back-and-forth

**Symptom:** When A accepts B's action AND proposes a new one, the wrong action executes.

**Root cause:** If `proposeAction` were processed before `respondToAction`, the new proposal overwrites `conv.pendingAction` before respond reads it.

**Fix:** The engine already processes `respondToAction` first. If you encounter this bug, check the processing order hasn't been accidentally changed.

### 4. Conversation state between ticks

**Symptom:** Multi-tick tests fail with unexpected state.

**Root cause:** Between ticks, conversations move from "active" to "ending" status. The filter `c.status !== "ended"` passes "ending". But if you accidentally use `c.status === "active"`, the second tick won't process the conversation.

**Fix:** Pass ongoing conversations with: `r1.updatedConversations.filter(c => c.status !== "ended")`.

## Debugging

### Log inside executeDialogueAction

Add temporary logs in `src/engine/dialog.ts`:

```typescript
console.log("[executeDialogueAction]", actionType, "actor:", actor.name, "params:", JSON.stringify(params));
```

### Run a single test with verbose output

```bash
npx vitest run src/engine/dialog-<action>.test.ts -t "<test name>" --reporter verbose
```

### Filter log output

```bash
npx vitest run src/engine/dialog-<action>.test.ts --reporter verbose 2>&1 | grep -E "AFTER|executeDialogueAction|transcript"
```

### Trace turn-by-turn

Log from inside the mock turnDecide:

```typescript
console.log("turnDecide:", self.name, "pending:", !!pendingAction,
  "proposed:", proposed, "accepted:", accepted);
```

### Check the transcript structure

```typescript
console.log(conv.transcript.map(t =>
  `[${t.speakerId}] ${t.kind}: ${(t as any).line ?? ""}`
));
```

## Test scenarios checklist

For any new dialogue action, cover at minimum:

- [ ] Propose → accept → state changes applied correctly to both parties
- [ ] Propose → accept → `action_result` injected into transcript with correct `dialogRecord` text
- [ ] Propose → accept → memory written to both initiator and target
- [ ] Propose → reject → no state changes, no transcript injection
- [ ] Propose → target ignores (doesn't respond) → state unchanged, pendingAction preserved in conversation
- [ ] Propose → conversation ends before response → state unchanged, pendingAction cleared
- [ ] Conversation ends WITH accept in same turn → state changes applied
- [ ] Back-and-forth: accept old pending + propose new one in same turn — both execute correctly
- [ ] Action params validation: invalid/edge params handled gracefully
- [ ] Cross-character effects: verify `targetCharacterId` path works
- [ ] Unknown action_type in pendingAction → no crash, no state change
