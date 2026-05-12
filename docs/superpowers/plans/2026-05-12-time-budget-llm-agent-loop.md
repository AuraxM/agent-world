# Time Budget LLM Agent Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fixed maxRounds with wall-clock time budget (ms) per LLM entry config, so decide/dialog/think loops pause mid-tick and resume next tick.

**Architecture:** `getEntryConfig()` returns `timeBudgetMs` (default 5000). `runAgentLoop` checks elapsed time after each API response instead of counting rounds. Dialog tick expansion checks time between turns. All existing pause-resume paths (`pendingDecideMessages`, `pendingThinkMessages`, `Conversation.sharedMessages`) stay unchanged.

**Tech Stack:** TypeScript, Drizzle ORM, SQLite, Vitest

---

### Task 1: DB schema — add time_budget_ms column

**Files:**
- Modify: `backend/src/db/schema.ts:180-193`
- Modify: `backend/src/db/migrate.ts`

- [ ] **Step 1: Add timeBudgetMs to Drizzle schema**

In `backend/src/db/schema.ts`, add the column after `thinkingEnabled`:

```typescript
export const llmEntryConfigs = sqliteTable(
  "llm_entry_configs",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id").references(() => llmProviders.id, { onDelete: "set null" }),
    thinkingEnabled: integer("thinking_enabled", { mode: "boolean" }).notNull().default(false),
    timeBudgetMs: integer("time_budget_ms").notNull().default(5000),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
);
```

- [ ] **Step 2: Add migration in migrate.ts**

In `backend/src/db/migrate.ts`, add a new block for `llm_entry_configs` new columns after the existing `WORLDS_NEW_COLUMNS` processing:

```typescript
const LLM_ENTRY_CONFIGS_NEW_COLUMNS: Array<{ name: string; ddl: string }> = [
  {
    name: "time_budget_ms",
    ddl: "ALTER TABLE llm_entry_configs ADD COLUMN time_budget_ms INTEGER NOT NULL DEFAULT 5000",
  },
];
```

And add the PRAGMA-based migration block after the worlds columns block:

```typescript
const entryCfgCols = sqlite
  .prepare(`PRAGMA table_info(llm_entry_configs)`)
  .all() as { name: string }[];
const haveEntryCfgCols = new Set(entryCfgCols.map((c) => c.name));
for (const col of LLM_ENTRY_CONFIGS_NEW_COLUMNS) {
  if (!haveEntryCfgCols.has(col.name)) sqlite.exec(col.ddl);
}
```

- [ ] **Step 3: Run migration to verify**

```bash
cd backend && pnpm db:migrate
```

Expected: `✓ DB migrated at ./data/agent-world.db` with all tables including `llm_entry_configs`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/schema.ts backend/src/db/migrate.ts
git commit -m "feat: add time_budget_ms column to llm_entry_configs"
```

---

### Task 2: providers.ts — extend EntryConfig with timeBudgetMs

**Files:**
- Modify: `backend/src/llm/providers.ts:134-138` (interface), `:175-188` (getEntryConfig), `:191-195` (listEntryConfigs), `:198-221` (batchUpsertEntryConfigs)
- Modify: `backend/src/server/routes/admin.ts:360-362`

- [ ] **Step 1: Extend EntryConfig interface**

In `backend/src/llm/providers.ts`, add `timeBudgetMs` to the `EntryConfig` interface:

```typescript
export interface EntryConfig {
  entryName: string;
  providerId: string | null;
  thinkingEnabled: boolean;
  timeBudgetMs: number;
}
```

- [ ] **Step 2: Update getEntryConfig to return timeBudgetMs**

```typescript
export function getEntryConfig(entryName: string): EntryConfig {
  if (__test_override_entryConfig !== undefined) return __test_override_entryConfig;
  const row = db
    .select()
    .from(schema.llmEntryConfigs)
    .where(eq(schema.llmEntryConfigs.id, entryName))
    .get();
  if (!row) return { entryName, providerId: null, thinkingEnabled: false, timeBudgetMs: 5000 };
  return {
    entryName: row.id,
    providerId: row.providerId,
    thinkingEnabled: row.thinkingEnabled,
    timeBudgetMs: row.timeBudgetMs,
  };
}
```

- [ ] **Step 3: Update listEntryConfigs to return timeBudgetMs**

```typescript
export function listEntryConfigs(allEntryNames: string[]): EntryConfig[] {
  const rows = db.select().from(schema.llmEntryConfigs).all();
  const map = new Map(rows.map((r) => [
    r.id,
    { entryName: r.id, providerId: r.providerId, thinkingEnabled: r.thinkingEnabled, timeBudgetMs: r.timeBudgetMs },
  ]));
  return allEntryNames.map((name) => map.get(name) ?? { entryName: name, providerId: null, thinkingEnabled: false, timeBudgetMs: 5000 });
}
```

- [ ] **Step 4: Update batchUpsertEntryConfigs to handle timeBudgetMs**

```typescript
export function batchUpsertEntryConfigs(
  configs: { entryName: string; providerId: string | null; thinkingEnabled: boolean; timeBudgetMs?: number }[],
): void {
  const now = new Date();
  db.transaction((tx) => {
    for (const c of configs) {
      const existing = tx
        .select({ id: schema.llmEntryConfigs.id })
        .from(schema.llmEntryConfigs)
        .where(eq(schema.llmEntryConfigs.id, c.entryName))
        .get();
      if (existing) {
        const updates: Record<string, unknown> = { providerId: c.providerId, thinkingEnabled: c.thinkingEnabled, updatedAt: now };
        if (c.timeBudgetMs !== undefined) updates.timeBudgetMs = c.timeBudgetMs;
        tx.update(schema.llmEntryConfigs)
          .set(updates)
          .where(eq(schema.llmEntryConfigs.id, c.entryName))
          .run();
      } else {
        tx.insert(schema.llmEntryConfigs)
          .values({
            id: c.entryName,
            providerId: c.providerId,
            thinkingEnabled: c.thinkingEnabled,
            timeBudgetMs: c.timeBudgetMs ?? 5000,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
    }
  });
  globalThis.__agent_world_llm_clients__ = undefined;
}
```

- [ ] **Step 5: Update admin route type**

In `backend/src/server/routes/admin.ts`, update the batchUpsertEntryConfigs call type:

```typescript
batchUpsertEntryConfigs(
  body.entryConfigs as {
    entryName: string;
    providerId: string | null;
    thinkingEnabled: boolean;
    timeBudgetMs?: number;
  }[],
);
```

- [ ] **Step 6: Run existing provider tests to verify no regression**

```bash
cd backend && pnpm test -- --run src/llm/providers 2>/dev/null || pnpm test -- --run 2>&1 | head -50
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/llm/providers.ts backend/src/server/routes/admin.ts
git commit -m "feat: add timeBudgetMs to EntryConfig interface and CRUD"
```

---

### Task 3: agent-loop.ts — replace maxRounds with time budget

**Files:**
- Modify: `backend/src/llm/agent-loop.ts`

- [ ] **Step 1: Change AgentLoopInput interface**

Replace `maxRounds?: number` with `timeBudgetMs?: number`:

```typescript
export interface AgentLoopInput {
  systemPrompt: string;
  readTools: ActionToolDef[];
  writeTools: ActionToolDef[];
  terminalToolNames: string[];
  readToolNames: readonly string[];
  llmEntryName: string;
  timeBudgetMs?: number;
  sharedMessages?: ChatCompletionMessageParam[];
  language?: string;
  toolHandlerContext: ToolHandlerContext;
  customWriteHandlers?: Record<string, (args: any, ctx: ToolHandlerContext) => Record<string, unknown>>;
}
```

- [ ] **Step 2: Update destructuring and defaults**

```typescript
const {
  systemPrompt,
  readTools,
  writeTools,
  terminalToolNames,
  readToolNames,
  llmEntryName,
  timeBudgetMs = 5000,
  sharedMessages = [],
  toolHandlerContext: ctx,
  customWriteHandlers = {},
} = input;
```

- [ ] **Step 3: Replace the while loop**

Replace `let round = 0;` and `while (round < maxRounds)` with time-based control. The key: check time at the TOP of each iteration, guaranteeing at least 1 complete round (first iteration always runs before the check at the start of round 2):

```typescript
const allTools: ActionToolDef[] = [...readTools, ...writeTools];
const messages: ChatCompletionMessageParam[] = [...sharedMessages];
const t0 = Date.now();
let round = 0;

const agentType = llmEntryName === "decide" ? "Decide" : llmEntryName === "dialog_turn" ? "Dialog" : llmEntryName;
console.log(`[${agentType}] agent loop 开始 | 角色: ${ctx.self.name} | 终端工具: ${terminalToolNames.join(", ")} | 时间预算: ${timeBudgetMs}ms | 已含消息: ${sharedMessages.length}`);
agentLog.info(`${agentType} agent loop 开始`, {
  character: ctx.self.name,
  terminalTools: terminalToolNames.join(", "),
  timeBudgetMs,
  sharedMsgCount: sharedMessages.length,
});

while (true) {
  const elapsed = Date.now() - t0;
  if (elapsed >= timeBudgetMs) {
    agentLog.warn(`${agentType} agent loop 时间预算耗尽`, {
      character: ctx.self.name,
      totalRounds: round,
      elapsedMs: elapsed,
      budgetMs: timeBudgetMs,
    });
    return { kind: "exhausted", messages };
  }

  // ... existing LLM call, tool call processing, etc. (unchanged from here down)
```

- [ ] **Step 4: Update diagnostic log message**

Change the per-round log to show elapsed time instead of `/maxRounds`:

```typescript
console.log(`[${agentType}] round ${round + 1} | 角色: ${ctx.self.name} | 已用: ${elapsed}ms/${timeBudgetMs}ms | 工具: [${toolCallNames.join(", ")}] | reasoning: ${reasoningPreview.slice(0, 100)}${textPreview ? ` | text: ${textPreview.slice(0, 80)}` : ""}`);
agentLog.info(`${agentType} round ${round + 1}`, {
  character: ctx.self.name,
  elapsedMs: elapsed,
  budgetMs: timeBudgetMs,
  reasoning: reasoningPreview,
  toolCalls: toolCallNames,
  textResponse: textPreview || undefined,
});
```

- [ ] **Step 5: Update exhausted log message**

```typescript
// Exhausted — return without terminal
agentLog.warn(`${agentType} agent loop 时间预算耗尽`, {
  character: ctx.self.name,
  totalRounds: round,
  elapsedMs: Date.now() - t0,
  budgetMs: timeBudgetMs,
});
return { kind: "exhausted", messages };
```

- [ ] **Step 6: Run existing agent-loop tests**

```bash
cd backend && pnpm test -- --run 2>&1 | grep -A5 "agent\|AgentLoop" | head -20
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/llm/agent-loop.ts
git commit -m "refactor: replace maxRounds with timeBudgetMs in agent loop"
```

---

### Task 4: decide.ts — pass timeBudgetMs from config

**Files:**
- Modify: `backend/src/llm/decide.ts:88-202`

- [ ] **Step 1: Read timeBudgetMs from entry config**

In `llmDecide`, after the existing provider check, read the config and extract `timeBudgetMs`:

```typescript
const config = getEntryConfig("decide");
const timeBudgetMs = config.timeBudgetMs;
```

- [ ] **Step 2: Replace maxRounds: 20 with timeBudgetMs**

In the `runAgentLoop` call (around line 161):

```typescript
result = await runAgentLoop({
  systemPrompt,
  readTools,
  writeTools,
  terminalToolNames: [WRITE_DECISION_TOOL],
  readToolNames: ALL_READ_TOOLS,
  llmEntryName: "decide",
  timeBudgetMs,
  sharedMessages: sharedMessages as any,
  toolHandlerContext,
});
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/llm/decide.ts
git commit -m "refactor: pass timeBudgetMs from config to decide agent loop"
```

---

### Task 5: think.ts — pass timeBudgetMs from config

**Files:**
- Modify: `backend/src/llm/think.ts:73-82`

- [ ] **Step 1: Read timeBudgetMs from entry config**

In `runThinkAgent`, before the `runAgentLoop` call, read config:

```typescript
const config = getEntryConfig("dialog_turn");
const timeBudgetMs = config.timeBudgetMs;
```

- [ ] **Step 2: Replace maxRounds: 20 with timeBudgetMs**

```typescript
const result = await runAgentLoop({
  systemPrompt,
  readTools,
  writeTools,
  terminalToolNames: THINK_TERMINAL_NAMES,
  readToolNames: ALL_READ_TOOLS,
  llmEntryName: "dialog_turn",
  timeBudgetMs,
  sharedMessages: effectiveSharedMessages as any,
  toolHandlerContext: ctx,
});
```

- [ ] **Step 3: Add import for getEntryConfig**

At the top of `think.ts`, add:
```typescript
import { getEntryConfig } from "./providers";
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/llm/think.ts
git commit -m "refactor: pass timeBudgetMs from config to think agent loop"
```

---

### Task 6: dialog.ts — remove count-based controls, use time budget

**Files:**
- Modify: `backend/src/llm/dialog.ts`

- [ ] **Step 1: Remove TURNS_PER_TICK and MAX_INNER_LOOPS constants**

Delete lines 397 and 442:
```typescript
// Remove: const TURNS_PER_TICK = 3;
// Remove: const MAX_INNER_LOOPS = 3;
```

- [ ] **Step 2: Replace inner loop in newDialogTurn**

In `newDialogTurn`, replace the `for (let innerLoop = 0; innerLoop < MAX_INNER_LOOPS; innerLoop++)` with a `while (true)` that checks time budget:

```typescript
async function newDialogTurn(args: {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  sharedMessages?: any[];
  pendingAction?: any;
  nodes: MapNode[];
  allCharacters: Character[];
  tick: number;
  epoch: number;
  worldId: string;
  worldDescription?: string;
  language?: string;
  shops?: any[];
}): Promise<...> {
  const config = getEntryConfig("dialog_turn");
  const innerBudgetMs = Math.max(1000, Math.floor(config.timeBudgetMs / 3));
  const innerT0 = Date.now();

  // ... existing sharedMessages setup ...

  let pendingProposeAction: { actionType: string; params: any } | undefined;
  let pendingRespondAction: { accept: boolean; reason?: string } | undefined;

  while (true) {
    if (Date.now() - innerT0 >= innerBudgetMs) break;
    // ... existing system prompt, tools, ctx setup ...
    // ... existing runAgentLoop call with timeBudgetMs ...
```

And update the `runAgentLoop` call inside the inner loop to use time budget:

```typescript
const result: AgentLoopResult = await runAgentLoop({
  systemPrompt,
  readTools,
  writeTools,
  terminalToolNames: DIALOG_TERMINAL_NAMES,
  readToolNames: ALL_READ_TOOLS,
  llmEntryName: "dialog_turn",
  timeBudgetMs: innerBudgetMs - (Date.now() - innerT0),
  sharedMessages: sharedMessages as any,
  toolHandlerContext: ctx,
  customWriteHandlers,
});
```

Replace the `for` loop closing brace with a `while` loop closing brace, and add the timeout end case after the loop:

```typescript
  }

  // All inner loops exhausted without producing a turn → end
  return { kind: "end", payload: { summary: "（对话超时）" } };
}
```

- [ ] **Step 3: Replace for loop in runOneTickDialog with time-based while**

In `runOneTickDialog`, replace the `TURNS_PER_TICK`-based `maxRounds` calculation and the `for (let round = 0; round < maxRounds; round++)` loop:

```typescript
async function runOneTickDialog(
  conv: Conversation,
  chars: Map<string, Character>,
  nodeById: Map<string, MapNode>,
  language: Language,
  currentTick: number,
  epoch: number,
  worldDescription?: string,
  nodes?: MapNode[],
  shops?: any[],
): Promise<TickDialogResult> {
  const initiator = chars.get(conv.initiatorId)!;
  const acceptor = chars.get(conv.acceptorId)!;
  const transcript: DialogTurn[] = [...conv.transcript];

  // Initialize shared LLM context if not present
  if (!conv.sharedMessages) conv.sharedMessages = [];
  if (conv.sharedMessagesTranscriptLength === undefined) conv.sharedMessagesTranscriptLength = 0;

  // Find the last real speaker
  let lastRealSpeakerId = conv.initiatorId;
  for (let i = transcript.length - 1; i >= 0; i--) {
    if (transcript[i].speakerId !== "__system__") {
      lastRealSpeakerId = transcript[i].speakerId;
      break;
    }
  }

  const firstSpeakerId =
    lastRealSpeakerId === conv.initiatorId ? conv.acceptorId : conv.initiatorId;

  // Inject time reminder
  const timeTurn: DialogTurn = {
    speakerId: "__system__",
    kind: "say",
    line: injectTimeMessage({ tick: currentTick, epoch, tickStarted: conv.tickStarted, language }),
  };
  if (conv.currentTickRounds === 0) {
    transcript.unshift(timeTurn);
  } else {
    transcript.push(timeTurn);
  }

  const config = getEntryConfig("dialog_turn");
  const tickBudgetMs = config.timeBudgetMs;
  const tickStart = Date.now();
  let round = 0;

  while (true) {
    if (Date.now() - tickStart >= tickBudgetMs) break;

    const speakerId =
      round % 2 === 0
        ? firstSpeakerId
        : firstSpeakerId === conv.initiatorId
          ? conv.acceptorId
          : conv.initiatorId;
    const speaker = chars.get(speakerId)!;
    const peer = speakerId === conv.initiatorId ? acceptor : initiator;

    const pendingAction = conv.pendingAction && conv.pendingAction.targetId === speakerId
      ? conv.pendingAction
      : undefined;

    let result;
    try {
      result = await retryOnce(() => newDialogTurn({
        self: speaker,
        peer,
        transcript,
        sharedMessages: conv.sharedMessages,
        pendingAction: pendingAction ? {
          requesterId: conv.pendingAction?.requesterId,
          targetId: conv.pendingAction?.targetId,
          actionType: conv.pendingAction?.actionType,
          params: conv.pendingAction?.params,
        } : undefined,
        nodes: nodes ?? Array.from(nodeById.values()),
        allCharacters: Array.from(chars.values()),
        tick: currentTick,
        epoch,
        worldId: conv.worldId,
        worldDescription,
        shops,
      }));
    } catch (err) {
      // ... existing error handling ...
      return { transcript, ended: true };
    }

    // ... existing respondToAction / proposeAction / sharedMessages processing ...
    // (keep all existing logic between newDialogTurn result and transcript.push)

    if (result.kind === "end") {
      // ... existing farewell turn logic ...
      return { transcript, ended: true, endedBy: ... };
    }

    transcript.push(result.turn);
    round++;
  }

  return { transcript, ended: false };
}
```

- [ ] **Step 4: Update generatePersonalMemory to use timeBudgetMs**

In `generatePersonalMemory`, replace `maxRounds: 3`:

```typescript
const config = getEntryConfig("dialog_turn");
const result = await runAgentLoop({
  systemPrompt: prompt,
  readTools: buildReadTools(),
  writeTools: writeTools as any,
  terminalToolNames: ["write_memory"],
  readToolNames: ALL_READ_TOOLS,
  llmEntryName: "dialog_turn",
  timeBudgetMs: Math.floor(config.timeBudgetMs / 2),
  toolHandlerContext: ctx,
});
```

- [ ] **Step 5: Add import for getEntryConfig at the top of dialog.ts**

```typescript
import { getEntryConfig } from "./providers";
```

- [ ] **Step 6: Update conv.currentTickRounds assignment**

In `runDialogPhase`, there are two places where `conv.currentTickRounds = TURNS_PER_TICK` is set. Replace with the actual rounds completed:

Search for `conv.currentTickRounds = TURNS_PER_TICK` (two occurrences). Replace both with:
```typescript
conv.currentTickRounds = tickResult.transcript.filter(t => t.speakerId !== "__system__").length;
```
This tracks actual turn count for display purposes, not for control.

- [ ] **Step 7: Run existing dialog tests**

```bash
cd backend && pnpm test -- --run 2>&1 | grep -A5 "dialog\|Dialog" | head -30
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/llm/dialog.ts
git commit -m "refactor: replace count-based dialog control with time budget"
```

---

### Task 7: Integration — wire everything together and verify

**Files:**
- Modify: `backend/src/llm/index.ts` (if re-exporting new types)

- [ ] **Step 1: Verify index.ts re-exports are sufficient for the new EntryConfig shape**

```bash
grep -n "EntryConfig\|getEntryConfig\|batchUpsertEntryConfigs" backend/src/llm/index.ts
```
If `EntryConfig` is re-exported, verify the new field propagates. No changes expected since the interface is exported from `providers.ts` directly.

- [ ] **Step 2: Run full test suite**

```bash
cd backend && pnpm test -- --run
```

Expected: All existing tests pass.

- [ ] **Step 3: Build check**

```bash
cd backend && pnpm build 2>&1 || npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/llm/
git commit -m "chore: verify integration after time budget refactor"
```
