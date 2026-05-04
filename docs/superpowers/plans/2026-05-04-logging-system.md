# Logging System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add comprehensive human-readable logging (console + file) to the engine, LLM, dialog, execute, store, and economy layers.

**Architecture:** A ~100-line zero-dependency `Logger` module at `src/util/logger.ts` with `createLogger(component)` factory, level filtering, ANSI-colored console output, and rotating file output. Each engine/LLM module imports and creates its own component-scoped logger.

**Tech Stack:** Node.js `fs` (createWriteStream), zero external dependencies.

---

### Task 1: Logger module

**Files:**
- Create: `src/util/logger.ts`
- Create: `src/util/logger.test.ts`

- [ ] **Step 1: Create `src/util/logger.ts`**

```typescript
import * as fs from "node:fs";
import * as path from "node:path";

type LogLevel = "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = { info: 0, warn: 1, error: 2 };

const COLORS: Record<LogLevel, string> = {
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

// ---- config ----

function readConfig() {
  const rawLevel = (process.env.LOG_LEVEL ?? "info") as LogLevel;
  if (!(rawLevel in LEVEL_PRIORITY)) throw new Error(`Invalid LOG_LEVEL: ${rawLevel}`);
  return {
    level: rawLevel,
    logDir: process.env.LOG_DIR ?? "data/logs",
    fileEnabled: process.env.LOG_FILE_ENABLED !== "false",
    consoleEnabled: process.env.LOG_CONSOLE_ENABLED !== "false",
    maxFileSizeBytes:
      (parseInt(process.env.LOG_FILE_MAX_SIZE_MB ?? "10", 10) || 10) * 1024 * 1024,
    retentionDays: parseInt(process.env.LOG_FILE_RETENTION_DAYS ?? "30", 10) || 30,
    consoleTimestamp: process.env.LOG_TIMESTAMP_IN_CONSOLE !== "false",
  };
}

const config = readConfig();

// ---- file stream state ----

let _stream: fs.WriteStream | null = null;
let _streamDay = "";
let _streamPath = "";
let _streamBytes = 0;
let _streamPart = 0;

function ensureDir() {
  if (!fs.existsSync(config.logDir)) {
    fs.mkdirSync(config.logDir, { recursive: true });
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function ts(): string {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

function timeShort(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function openStream(day: string): void {
  if (_stream) {
    _stream.end();
    _stream = null;
  }
  ensureDir();
  _streamDay = day;
  _streamPart = 0;
  _streamPath = path.join(config.logDir, `agent-world-${day}.log`);
  _stream = fs.createWriteStream(_streamPath, { flags: "a" });
  _streamBytes = fs.existsSync(_streamPath) ? fs.statSync(_streamPath).size : 0;
}

function getStream(): fs.WriteStream | null {
  if (!config.fileEnabled) return null;
  const day = today();
  if (day !== _streamDay || !_stream) {
    openStream(day);
  } else if (_streamBytes >= config.maxFileSizeBytes) {
    _streamPart++;
    _streamPath = path.join(
      config.logDir,
      `agent-world-${day}-${_streamPart + 1}.log`,
    );
    _stream.end();
    _stream = fs.createWriteStream(_streamPath, { flags: "a" });
    _streamBytes = 0;
  }
  return _stream;
}

function cleanupOldFiles(): void {
  if (!config.fileEnabled) return;
  ensureDir();
  const cutoff = Date.now() - config.retentionDays * 86400_000;
  let entries: string[];
  try { entries = fs.readdirSync(config.logDir); } catch { return; }
  for (const entry of entries) {
    if (!entry.startsWith("agent-world-") || !entry.endsWith(".log")) continue;
    const fullPath = path.join(config.logDir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(fullPath);
    }
  }
}

cleanupOldFiles();

// ---- format context ----

function formatContext(ctx?: Record<string, unknown>): string {
  if (!ctx || Object.keys(ctx).length === 0) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v === "string") parts.push(`${k}="${v}"`);
    else parts.push(`${k}=${v}`);
  }
  return " " + parts.join(" ");
}

// ---- flush on exit ----

function flush() {
  if (_stream) {
    _stream.end();
    _stream = null;
  }
}

process.on("exit", flush);
process.on("SIGINT", () => { flush(); process.exit(); });
process.on("SIGTERM", () => { flush(); process.exit(); });

// ---- public API ----

export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export function createLogger(component: string): Logger {
  function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[config.level]) return;

    const ctxStr = formatContext(context);

    if (config.consoleEnabled) {
      const prefix = config.consoleTimestamp ? `${timeShort()} ` : "";
      const levelTag = level.toUpperCase().padEnd(5);
      const line = `${prefix}${COLORS[level]}${BOLD}${levelTag}  [${component}]${RESET}  ${message}${ctxStr}`;
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.log(line);
    }

    const stream = getStream();
    if (stream) {
      const line = `${ts()} ${level.toUpperCase().padEnd(5)}  [${component}]  ${message}${ctxStr}\n`;
      stream.write(line);
      _streamBytes += Buffer.byteLength(line);
    }
  }

  return {
    info: (msg, ctx) => log("info", msg, ctx),
    warn: (msg, ctx) => log("warn", msg, ctx),
    error: (msg, ctx) => log("error", msg, ctx),
  };
}
```

- [ ] **Step 2: Create `src/util/logger.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { createLogger } from "./logger";

describe("createLogger", () => {
  it("returns an object with info, warn, error methods", () => {
    const log = createLogger("test");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
  });

  it("does not throw when calling any method", () => {
    const log = createLogger("test");
    expect(() => log.info("hello")).not.toThrow();
    expect(() => log.warn("warning")).not.toThrow();
    expect(() => log.error("error")).not.toThrow();
  });

  it("accepts context objects", () => {
    const log = createLogger("test");
    expect(() =>
      log.info("msg", { key: "value", num: 42, bool: true }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/util/logger.test.ts`
Expected: 3 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/util/logger.ts src/util/logger.test.ts
git commit -m "feat: add logging utility module

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: LLM call logging

**Files:**
- Modify: `src/llm/decide.ts`
- Modify: `src/llm/client.ts` (export resolveProviderId)

- [ ] **Step 1: Export `resolveProviderId` from `src/llm/client.ts`**

Change `function resolveProviderId` to `export function resolveProviderId` at line 40.

- [ ] **Step 2: Add logger imports to `src/llm/decide.ts`**

Add after the last import:

```typescript
import { createLogger } from "@/util/logger";

const decideLog = createLogger("llm-decide");
const dialogLog = createLogger("llm-dialog");
const acceptLog = createLogger("llm-accept");
const summaryLog = createLogger("llm-summary");
const salvageLog = createLogger("llm-salvage");
const memoryLog = createLogger("llm-memory");
```

- [ ] **Step 3: Add decide request/response/error logging in `callLLM` and `llmDecide`**

In `callLLM`, before `callLLMWithRetry`:

```typescript
const startMs = Date.now();
decideLog.info("LLM decide 请求", {
  角色: input.character.name,
  model: getModelNameForEntry("decide"),
});
```

After `callLLMWithRetry` returns, before the action conversion:

```typescript
decideLog.info("LLM decide 响应", {
  角色: input.character.name,
  action: actionType,
  耗时ms: Date.now() - startMs,
});
```

In `llmDecide`, before returning the fallback in the catch:

```typescript
decideLog.error("LLM decide 失败", {
  角色: input.character.name,
  error: errorMessage(err),
});
```

- [ ] **Step 4: Add retry round logging in `callLLMWithRetry`**

Inside the `for` loop, after capturing the assistant message:

```typescript
const toolName = msg.tool_calls?.[0]?.function?.name ?? "none";
decideLog.info(`LLM round ${round + 1}/${MAX_TOOL_CALL_ROUNDS}`, {
  tool_call: toolName,
});
```

- [ ] **Step 5: Add dialog/accept/summary/salvage logging**

In `llmDialogTurn`, before the API call:

```typescript
dialogLog.info("LLM dialog_turn 请求", {
  self: input.self.name,
  peer: input.peer.name,
});
```

In `llmAcceptDecide`, before the API call:

```typescript
acceptLog.info("LLM accept_decision 请求", {
  self: input.character.name,
  requester: input.requesterName,
});
```

In `llmDialogSummarize`, after reading config:

```typescript
summaryLog.info("LLM dialog_summarize 请求", {
  opener: input.openerName,
  responder: input.responderName,
  turns: input.transcript.length,
});
```

In `llmMemoryCompress`, before first API call:

```typescript
memoryLog.info("LLM memory_compress 请求");
```

In `llmSalvageDecide`, after hasApiKey check:

```typescript
salvageLog.warn("补救轮触发", {
  角色: input.character.name,
  reject_reason: input.rejectReason,
});
```

- [ ] **Step 6: Run existing tests**

Run: `npx vitest run src/llm/decide.test.ts`
Expected: all existing tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/llm/decide.ts src/llm/client.ts
git commit -m "feat: add LLM call logging for decide, dialog, accept, summary, salvage

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Tick lifecycle logging

**Files:**
- Modify: `src/engine/tick.ts`

- [ ] **Step 1: Add logger import**

```typescript
import { createLogger } from "@/util/logger";
const log = createLogger("tick");
```

- [ ] **Step 2: Replace `console.warn` calls**

Change:
```typescript
console.warn(`Failed to load mod actions for ${world.mapId}:`, err);
```
To:
```typescript
log.warn("Failed to load mod actions", { mapId: world.mapId, error: String(err) });
```

- [ ] **Step 3: Add tick start log and timing checkpoints**

After `const allDecisions` initialization:

```typescript
const t0 = Date.now();
log.info(`tick #${fromTick} 开始`, {
  角色数: characters.length,
  节点数: nodes.length,
});
```

Add `const tAfterVitals = Date.now();` after the vitals decay call (line ~248).

Add `const tAfterEmotion = Date.now();` after the emotion evolution + low-money detection block (line ~278).

Add `const tAfterDecisions = Date.now();` after the Promise.allSettled handling for character decisions (line ~634).

Add `const tAfterDialog = Date.now();` after the `runDialogPhase` call (line ~706).

Add `const tAfterExecute = Date.now();` after the `executeActions` call (line ~744).

Add `const tAfterSave = Date.now();` after the `saveWorld` call (line ~759).

- [ ] **Step 4: Add phase timing + completion log**

Right before the `return` statement:

```typescript
log.info(`tick #${fromTick} 阶段耗时`, {
  vitalsMs: tAfterVitals - t0,
  emotionMs: tAfterEmotion - tAfterVitals,
  decisionMs: tAfterDecisions - tAfterEmotion,
  dialogMs: tAfterDialog - tAfterDecisions,
  executeMs: tAfterExecute - tAfterDialog,
  saveMs: tAfterSave - tAfterExecute,
  totalMs: tAfterSave - t0,
});

const successCount = allDecisions.filter((d) => d.success).length;
const failCount = allDecisions.filter((d) => !d.success).length;
log.info(`tick #${fromTick} 完成`, {
  总耗时ms: tAfterSave - t0,
  成功决策: successCount,
  失败决策: failCount,
});
```

- [ ] **Step 5: Add decision failure logging**

In the catch block of the per-character decision (where `fallbackWait` is called in the character Promise), before the fallback:

```typescript
log.warn("角色决策失败", { 角色: c.name, error: action.reasoning });
```

In the `Promise.allSettled` rejection handler, before the fallbackWait call:

```typescript
log.error("决策任务异常", { 角色: c?.name ?? "未知", error: errMsg });
```

- [ ] **Step 6: Add extreme emotion and vitals warning**

After emotion evolution, before the return (can be in the same loop area as low-money detection):

```typescript
for (const c of characters) {
  if (c.emotion.mood <= -3 || c.emotion.mood >= 3) {
    log.warn("情绪极端", { 角色: c.name, mood: c.emotion.mood, stress: c.emotion.stress });
  }
  if (c.vitals.hunger >= 12) {
    log.warn("生理极值", { 角色: c.name, vital: "hunger", value: c.vitals.hunger });
  } else if (c.vitals.fatigue >= 12) {
    log.warn("生理极值", { 角色: c.name, vital: "fatigue", value: c.vitals.fatigue });
  } else if (c.vitals.hygiene >= 12) {
    log.warn("生理极值", { 角色: c.name, vital: "hygiene", value: c.vitals.hygiene });
  }
}
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run src/engine/tick.test.ts`
Expected: all existing tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/engine/tick.ts
git commit -m "feat: add tick lifecycle logging with phase timing

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Action execution logging

**Files:**
- Modify: `src/engine/execute.ts`

- [ ] **Step 1: Add logger import**

```typescript
import { createLogger } from "@/util/logger";
const log = createLogger("execute");
```

- [ ] **Step 2: Add execution result logging**

In the main `for` loop of `executeActions`, after each `resolvedActions.push(...)` in the main execution branch, add:

```typescript
log.info("执行", {
  action: action.type,
  角色: actor.name,
  success: String(success),
  ...(reason ? { reason } : {}),
});
```

For the `skipExecution` branch (proxy actions), before `resolvedActions.push`:

```typescript
log.info("执行", { action: action.type, 角色: actor.name, success: "true" });
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/engine/tick.test.ts`
Expected: all existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/engine/execute.ts
git commit -m "feat: add action execution logging

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Dialog protocol logging

**Files:**
- Modify: `src/engine/dialog.ts`

- [ ] **Step 1: Add logger import**

```typescript
import { createLogger } from "@/util/logger";
const log = createLogger("dialog");
```

- [ ] **Step 2: Add dialog start/end/reject logging**

In `runDialogPhase`, inside the dialog outcomes processing loop, after `finalActionsMap.set`:

```typescript
log.info("对话开始", {
  A: opener.name,
  B: responder.name,
});

// After dialog events are pushed:
log.info("对话结束", {
  轮数: o.transcript.length,
  A: opener.name,
  B: responder.name,
  endBy: o.endedBy,
});
```

In the rejection branch (where `result.type === "reject_speak"`):

```typescript
log.info("对话被拒", {
  A: requester.name,
  B: targetName,
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/engine/dialog.test.ts`
Expected: all existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/engine/dialog.ts
git commit -m "feat: add dialog protocol logging

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Store logging

**Files:**
- Modify: `src/engine/store.ts`

- [ ] **Step 1: Add logger import**

```typescript
import { createLogger } from "@/util/logger";
const log = createLogger("store");
```

- [ ] **Step 2: Add snapshot and save logging**

In `persistSnapshot`, after the db insert:

```typescript
log.info("snapshot 写入", {
  world: loaded.world.id,
  tick: loaded.world.currentTick,
});
```

In `saveWorld`, after the transaction:

```typescript
log.info("world 保存", {
  world: loaded.world.id,
  角色数: loaded.characters.length,
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/engine/tick.test.ts`
Expected: all existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/engine/store.ts
git commit -m "feat: add store write logging for snapshots and world saves

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: Economy logging

**Files:**
- Modify: `src/engine/economy.ts`

- [ ] **Step 1: Add logger import**

```typescript
import { createLogger } from "@/util/logger";
const log = createLogger("economy");
```

- [ ] **Step 2: Add transaction and snapshot logging**

In `recordTransaction`, after the db insert, append either expense or income logging:

```typescript
if (category === "expense" || category === "transfer_out") {
  log.info("支出", { 角色id: characterId, 类别: category, 金额: Math.abs(amount), 说明: description });
} else if (category === "income" || category === "transfer_in") {
  log.info("收入", { 角色id: characterId, 类别: category, 金额: amount, 说明: description });
}
```

In `updateAllEconomicSnapshots`, before the return:

```typescript
log.info("经济快照更新", {
  tick,
  角色数: characters.length,
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/engine/`
Expected: all existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/engine/economy.ts
git commit -m "feat: add economy logging for transactions and snapshots

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```
