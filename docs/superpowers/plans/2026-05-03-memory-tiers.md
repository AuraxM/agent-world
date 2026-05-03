# Three-Tier Memory System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement three-tier memory (short-term → daily → weekly) with LLM compression triggered on sleep start.

**Architecture:** Compression orchestration lives in a new `engine/memory-compression.ts` and is called from `tick.ts` between dialog phase and execute phase. LLM summarization follows the existing `llmDialogSummarize` pattern. Prompt rendering splits into three blocks (short-term last 6, daily last 6, weekly last 6).

**Tech Stack:** TypeScript, SQLite (Drizzle ORM), OpenAI-compatible LLM API, vitest

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `src/domain/types.ts` | Modify | Add `dailyMemory`, `lastSleepTick` to Character |
| `src/db/schema.ts` | Modify | Add `dailyMemoryJson`, `lastSleepTick` columns |
| `src/engine/store.ts` | Modify | Load/save new Character fields |
| `src/llm/prompt.ts` | Modify | Add compression prompts + three-tier memory display |
| `src/llm/decide.ts` | Modify | Add `llmMemoryCompress` function |
| `src/engine/actions-builtin.ts` | Modify | Fix sleep OngoingAction gap |
| `src/engine/memory-compression.ts` | Create | `compressSleepMemories()` orchestration |
| `src/engine/tick.ts` | Modify | Call compression between dialog & execute phases |
| `src/llm/prompt.test.ts` | Modify | Tests for compression prompts + three-tier display |

---

### Task 1: Update domain types and DB schema

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Add `dailyMemory` and `lastSleepTick` to Character type**

In `src/domain/types.ts`, add `dailyMemory` field after `shortMemory` and `lastSleepTick` after `longMemory`:

```typescript
// In Character interface, after shortMemory line:
shortMemory: Memory[];
/** 中期日记忆：睡觉时由 LLM 压缩清醒期 shortMemory 生成 */
dailyMemory: Memory[];
/** Stage 1: 不使用 long memory，仅占位 → 复用为周记忆 */
longMemory: Memory[];
/** 上次睡觉（压缩）的 tick；首次睡觉前为 0 */
lastSleepTick: Tick;
```

- [ ] **Step 2: Add DB columns**

In `src/db/schema.ts`, add `dailyMemoryJson` and `lastSleepTick` to the `characters` table:

```typescript
// After shortMemoryJson line:
shortMemoryJson: text("short_memory_json").notNull().default("[]"),
dailyMemoryJson: text("daily_memory_json").notNull().default("[]"),
longMemoryJson: text("long_memory_json").notNull().default("[]"),
// After currentActionJson line:
currentActionJson: text("current_action_json"),
lastSleepTick: integer("last_sleep_tick").notNull().default(0),
```

- [ ] **Step 3: Commit**

```bash
git add src/domain/types.ts src/db/schema.ts
git commit -m "feat: add dailyMemory and lastSleepTick to Character type and DB schema"
```

---

### Task 2: Update persistence layer

**Files:**
- Modify: `src/engine/store.ts`

- [ ] **Step 1: Load dailyMemory and lastSleepTick in loadWorld**

In `loadWorld()`, add `dailyMemory` and `lastSleepTick` to the character deserialization:

```typescript
// In charRows.map(), after shortMemory line:
shortMemory: JSON.parse(c.shortMemoryJson),
dailyMemory: JSON.parse(c.dailyMemoryJson),
longMemory: JSON.parse(c.longMemoryJson),
// After currentAction line:
currentAction: c.currentActionJson
  ? JSON.parse(c.currentActionJson)
  : undefined,
lastSleepTick: c.lastSleepTick,
```

- [ ] **Step 2: Save dailyMemory and lastSleepTick in saveWorld**

In `saveWorld()`, add the new fields to the update:

```typescript
// In the tx.update(schema.characters).set({...}) call, add:
dailyMemoryJson: JSON.stringify(c.dailyMemory),
longMemoryJson: JSON.stringify(c.longMemory),
// and:
lastSleepTick: c.lastSleepTick,
```

- [ ] **Step 3: Run existing tests to verify no regressions**

```bash
npx vitest run src/engine/tick.test.ts src/engine/facts.test.ts src/llm/prompt.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/engine/store.ts
git commit -m "feat: persist dailyMemory and lastSleepTick"
```

---

### Task 3: Add compression prompt builder

**Files:**
- Modify: `src/llm/prompt.ts`

- [ ] **Step 1: Add `buildMemoryCompressionPrompt` function**

```typescript
/**
 * 构建睡觉时的记忆压缩 prompt。输入清醒期的短期记忆，输出第一人称日摘要。
 */
export function buildMemoryCompressionPrompt(args: {
  characterName: string;
  memories: Memory[];
  language?: Language;
}): string {
  const { characterName, memories } = args;
  const language = args.language ?? "zh";

  if (memories.length === 0) {
    if (language === "zh") return `你是 ${characterName}。自从上次睡觉后，你没有值得记住的经历。调用 submit_memory_summary 返回"今天很平静，没什么特别的事。"`;
    if (language === "en") return `You are ${characterName}. You had no notable experiences since you last slept. Call submit_memory_summary with "A quiet day with nothing much happening."`;
    return `あなたは${characterName}です。前回の睡眠以降、特に記憶に残る出来事はありませんでした。submit_memory_summary で「今日は穏やかな一日だった」と返してください。`;
  }

  const memoryLines = memories
    .map((m) => `- t=${m.tick}: ${m.content}`)
    .join("\n");

  if (language === "zh") {
    return `你是 ${characterName}，正在回顾从上次睡醒到现在的经历。以下是这段时间发生的事情：

${memoryLines}

请用 2-5 句简体中文（第一人称"我"）总结这段清醒期间最主要的事情、与人互动和感受。调用 submit_memory_summary 工具返回你的摘要。`;
  }
  if (language === "en") {
    return `You are ${characterName}, reviewing experiences since you last woke up. Here's what happened:

${memoryLines}

Summarize the most important events, interactions, and feelings in 2-5 English sentences using first person. Call submit_memory_summary to return your summary.`;
  }
  return `あなたは${characterName}です。前回起きてから今までの出来事を振り返っています：

${memoryLines}

この間の主な出来事、人との交流、感情を日本語の第一人称で2〜5文にまとめてください。submit_memory_summary を呼び出して要約を返してください。`;
}

/**
 * 构建周记忆压缩 prompt。输入 7 条日摘要，输出周摘要。
 */
export function buildWeeklyCompressionPrompt(args: {
  characterName: string;
  dailySummaries: string[];
  language?: Language;
}): string {
  const { characterName, dailySummaries } = args;
  const language = args.language ?? "zh";

  const lines = dailySummaries
    .map((s, i) => `第 ${i + 1} 天：${s}`)
    .join("\n");

  if (language === "zh") {
    return `你是 ${characterName}，正在回顾这一周（7 天）的生活。以下是每天的摘要：

${lines}

请用 2-4 句简体中文（第一人称"我"）总结这一周最主要的生活变化、重要事件和情感起伏。调用 submit_memory_summary 工具返回你的摘要。`;
  }
  if (language === "en") {
    return `You are ${characterName}, reviewing your past week (7 days). Here are your daily summaries:

${lines}

Summarize the key life changes, important events, and emotional shifts of this week in 2-4 English sentences using first person. Call submit_memory_summary to return your summary.`;
  }
  return `あなたは${characterName}です。この一週間（7日間）を振り返っています：

${lines}

この一週間の主な生活の変化、重要な出来事、感情の起伏を日本語の第一人称で2〜4文にまとめてください。submit_memory_summary を呼び出して要約を返してください。`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/llm/prompt.ts
git commit -m "feat: add memory compression prompt builders"
```

---

### Task 4: Add LLM memory compression function

**Files:**
- Modify: `src/llm/decide.ts`
- Modify: `src/domain/schemas.ts` (if needed for tool schema)

- [ ] **Step 1: Check existing tool schema pattern**

First, read `src/domain/schemas.ts` to understand the existing tool schema definitions for `DIALOG_SUMMARY_TOOL_NAME` - we'll add `MEMORY_SUMMARY_TOOL_NAME` following the same pattern.

- [ ] **Step 2: Add memory summary tool schema**

In `src/domain/schemas.ts`, add after the dialog summary definitions:

```typescript
export const MEMORY_SUMMARY_TOOL_NAME = "submit_memory_summary";

export const MemorySummarySchema = z.object({
  summary: z.string(),
});

export const MemorySummaryToolSchema = {
  type: "object",
  properties: {
    summary: { type: "string", description: "记忆摘要（第一人称简体中文）" },
  },
  required: ["summary"],
  additionalProperties: false,
} as const;
```

- [ ] **Step 3: Add `llmMemoryCompress` function to decide.ts**

```typescript
import {
  // ... existing imports
  MEMORY_SUMMARY_TOOL_NAME,
  MemorySummarySchema,
  MemorySummaryToolSchema,
} from "@/domain/schemas";

/**
 * 记忆压缩摘要。用于睡觉时的日/周记忆压缩。
 * 失败重试 1 次，仍失败返回占位摘要。
 */
export async function llmMemoryCompress(args: {
  prompt: string;
  language?: Language;
}): Promise<string> {
  if (!hasApiKey()) return "（摘要生成失败：无可用的 LLM provider）";

  const client = getLLMClient();
  const language: Language = args.language ?? "zh";

  const tool: ChatCompletionTool = {
    type: "function",
    function: {
      name: MEMORY_SUMMARY_TOOL_NAME,
      description: "返回记忆摘要。",
      parameters: MemorySummaryToolSchema,
    },
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: getModelName(),
        max_tokens: 512,
        messages: [
          {
            role: "system",
            content: `你是一个记忆摘要助手。请根据提供的事件列表生成简洁的记忆摘要。\n\n${languageInstruction(language)}`,
          },
          { role: "user", content: args.prompt },
        ],
        tools: [tool],
      });

      const message = response.choices[0]?.message;
      const toolCall = message?.tool_calls?.find(
        (c) => c.type === "function" && c.function.name === MEMORY_SUMMARY_TOOL_NAME,
      );
      if (!toolCall || toolCall.type !== "function") {
        throw new Error("LLM 没有返回 memory_summary tool_call");
      }

      const parsed = JSON.parse(toolCall.function.arguments);
      const result = MemorySummarySchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`MemorySummary 参数不符合 schema：${result.error.message}`);
      }
      return result.data.summary;
    } catch {
      if (attempt === 0) continue;
    }
  }
  return "（摘要生成失败）";
}
```

- [ ] **Step 4: Commit**

```bash
git add src/domain/schemas.ts src/llm/decide.ts
git commit -m "feat: add llmMemoryCompress function for sleep-triggered memory summarization"
```

---

### Task 5: Create memory compression orchestration

**Files:**
- Create: `src/engine/memory-compression.ts`

- [ ] **Step 1: Create `src/engine/memory-compression.ts`**

```typescript
/**
 * 睡觉时触发的记忆压缩：短→日（LLM 摘要），每 7 日→周（LLM 摘要）。
 * 在 tick.ts 的 dialog 阶段之后、execute 阶段之前调用。
 */
import { randomUUID } from "node:crypto";
import type { Tick, Character, Memory } from "@/domain/types";
import type { Language } from "@/config/types";
import { llmMemoryCompress } from "@/llm/decide";
import {
  buildMemoryCompressionPrompt,
  buildWeeklyCompressionPrompt,
} from "@/llm/prompt";

/**
 * 对一名角色执行睡觉时的记忆压缩。
 * 1. 收集上次睡觉至今的 shortMemory
 * 2. LLM 摘要 → push 到 dailyMemory
 * 3. dailyMemory 满 7 条 → LLM 摘要 → push 到 longMemory（周记忆），删除被压缩的 7 条日记忆
 * 4. 清空 shortMemory
 * 5. 更新 lastSleepTick
 *
 * LLM 调用失败时跳过压缩，shortMemory 原样保留。
 */
export async function compressSleepMemories(
  character: Character,
  currentTick: Tick,
  language: Language,
): Promise<void> {
  const sinceTick = character.lastSleepTick ?? 0;

  // 收集清醒期记忆（排除包含 [heuristic] 的引擎伪记忆）
  const wakeMemories = character.shortMemory.filter(
    (m) => m.tick >= sinceTick && !m.content.includes("[heuristic]"),
  );

  if (wakeMemories.length === 0) {
    // 没有值得压缩的记忆：仍然清空 shortMemory 并更新 lastSleepTick
    character.shortMemory = [];
    character.lastSleepTick = currentTick;
    return;
  }

  // 日压缩
  let dailySummary: string;
  try {
    const prompt = buildMemoryCompressionPrompt({
      characterName: character.name,
      memories: wakeMemories,
      language,
    });
    dailySummary = await llmMemoryCompress({ prompt, language });
  } catch {
    // LLM 失败：跳过本次压缩，shortMemory 不清空
    return;
  }

  const dailyMemory: Memory = {
    id: `dmem-${randomUUID().slice(0, 8)}`,
    tick: currentTick,
    importance: 3,
    content: dailySummary,
  };
  character.dailyMemory.push(dailyMemory);

  // 周压缩：dailyMemory 满 7 条
  if (character.dailyMemory.length >= 7) {
    const batch = character.dailyMemory.slice(-7);
    let weeklySummary: string;
    try {
      const prompt = buildWeeklyCompressionPrompt({
        characterName: character.name,
        dailySummaries: batch.map((m) => m.content),
        language,
      });
      weeklySummary = await llmMemoryCompress({ prompt, language });
    } catch {
      // 周压缩失败：仍然进行日压缩的后续步骤
      weeklySummary = "（周摘要生成失败）";
    }

    const weeklyMemory: Memory = {
      id: `wmem-${randomUUID().slice(0, 8)}`,
      tick: currentTick,
      importance: 4,
      content: weeklySummary,
    };
    character.longMemory.push(weeklyMemory);

    // 删除已被压缩的 7 条日记忆
    character.dailyMemory.splice(character.dailyMemory.length - 7, 7);
  }

  // 清空短期记忆
  character.shortMemory = [];
  character.lastSleepTick = currentTick;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/memory-compression.ts
git commit -m "feat: add compressSleepMemories orchestration for three-tier memory compression"
```

---

### Task 6: Fix sleep action to set OngoingAction

**Files:**
- Modify: `src/engine/actions-builtin.ts`

- [ ] **Step 1: Update sleepAction.execute to return setOngoingAction**

```typescript
// In sleepAction.execute(), change the return to include stateChanges:
execute(ctx, _input) {
  return {
    memory: `我在 ${ctx.here.name} 躺下准备睡觉。`,
    event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} 躺下入睡。`, intensity: 1 },
    stateChanges: [{
      kind: "setOngoingAction",
      action: {
        type: "sleep",
        startedAt: ctx.tick,
        endsAt: ctx.tick + (8 * TICKS_PER_HOUR),
        description: `在 ${ctx.here.name} 睡觉`,
        interruptThreshold: 4,
      },
    }],
  };
},
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/actions-builtin.ts
git commit -m "fix: sleep action now sets OngoingAction for proper multi-tick sleep state"
```

---

### Task 7: Wire compression into tick.ts

**Files:**
- Modify: `src/engine/tick.ts`

- [ ] **Step 1: Add import for compressSleepMemories**

```typescript
import { compressSleepMemories } from "./memory-compression";
```

- [ ] **Step 2: Add compression phase between dialog and execute**

In the `tick()` function, after the dialog phase (Phase 4.5) and before execute (Phase 7), insert:

```typescript
// ── Phase 6.5: Memory compression for characters going to sleep ──
const sleepActionsForCompression = actionsForExecution.filter(a => a.type === "sleep");
if (sleepActionsForCompression.length > 0) {
  await Promise.all(
    sleepActionsForCompression.map(async (action) => {
      const c = characters.find(ch => ch.id === action.actorId);
      if (c) {
        await compressSleepMemories(c, fromTick, language);
      }
    }),
  );
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/engine/tick.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/engine/tick.ts
git commit -m "feat: wire memory compression into tick loop before execute phase"
```

---

### Task 8: Update prompt to display three-tier memories

**Files:**
- Modify: `src/llm/prompt.ts`

- [ ] **Step 1: Add describeMemoryTiers function**

Replace the single `describeMemories` in `buildUserPrompt` with a three-tier version:

```typescript
const SHORT_MEMORY_LIMIT = 6;
const DAILY_MEMORY_LIMIT = 6;
const WEEKLY_MEMORY_LIMIT = 6;

function describeMemoryTiers(
  short: Memory[],
  daily: Memory[],
  weekly: Memory[],
): string {
  const lines: string[] = [];

  // 短期记忆
  const filteredShort = short.filter((m) => !m.content.includes("[heuristic]"));
  const recentShort = filteredShort.slice(-SHORT_MEMORY_LIMIT);
  lines.push("你的近期短期记忆：");
  if (recentShort.length === 0) {
    lines.push("（暂无）");
  } else {
    for (const m of recentShort) {
      lines.push(`- t=${m.tick}: ${m.content}`);
    }
  }
  lines.push("");

  // 日记忆
  const recentDaily = daily.slice(-DAILY_MEMORY_LIMIT);
  if (recentDaily.length > 0) {
    lines.push("你的日记忆（最近几天的摘要）：");
    for (let i = 0; i < recentDaily.length; i++) {
      const m = recentDaily[i];
      lines.push(`- 第 ${Math.floor(m.tick / (24 * TICKS_PER_HOUR))} 天*: ${m.content}`);
    }
    lines.push("");
  }

  // 周记忆
  const recentWeekly = weekly.slice(-WEEKLY_MEMORY_LIMIT);
  if (recentWeekly.length > 0) {
    lines.push("你的周记忆（最近几周的摘要）：");
    for (let i = 0; i < recentWeekly.length; i++) {
      const m = recentWeekly[i];
      const weekNum = Math.floor(m.tick / (7 * 24 * TICKS_PER_HOUR));
      lines.push(`- 第 ${weekNum} 周*: ${m.content}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
```

- [ ] **Step 2: Update buildUserPrompt to use describeMemoryTiers**

In `buildUserPrompt`, replace the existing memory section:

```typescript
// Replace:
// lines.push("你的近期短期记忆：");
// lines.push(describeMemories(character.shortMemory));
// With:
lines.push(describeMemoryTiers(
  character.shortMemory,
  character.dailyMemory,
  character.longMemory,
));
```

And remove the old `describeMemories` function and `RECENT_MEMORY_LIMIT` constant if no longer used (check for other callers).

- [ ] **Step 3: Update the limit constants**

Remove or update `RECENT_MEMORY_LIMIT = 8` at the top of the file since it's replaced by tier-specific limits.

- [ ] **Step 4: Run prompt tests**

```bash
npx vitest run src/llm/prompt.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/llm/prompt.ts
git commit -m "feat: render three-tier memories (short/daily/weekly) in user prompt"
```

---

### Task 9: Add tests for memory compression

**Files:**
- Modify: `src/llm/prompt.test.ts`

- [ ] **Step 1: Add tests for buildMemoryCompressionPrompt**

```typescript
// In prompt.test.ts, add after existing describe blocks:
import { buildMemoryCompressionPrompt, buildWeeklyCompressionPrompt } from "./prompt";
import type { Memory } from "@/domain/types";

describe("buildMemoryCompressionPrompt", () => {
  const sampleMemories: Memory[] = [
    { id: "m1", tick: 10, importance: 2, content: "我在酒馆吃了一顿饭。" },
    { id: "m2", tick: 15, importance: 3, content: '我对田中说："今天天气真不错。"' },
    { id: "m3", tick: 20, importance: 1, content: "我在广场散步。" },
  ];

  it("zh: includes character name and memory content", () => {
    const result = buildMemoryCompressionPrompt({
      characterName: "测试",
      memories: sampleMemories,
    });
    expect(result).toContain("测试");
    expect(result).toContain("我在酒馆吃了一顿饭");
    expect(result).toContain("submit_memory_summary");
    expect(result).toContain("第一人称");
  });

  it("zh: empty memories returns placeholder prompt", () => {
    const result = buildMemoryCompressionPrompt({
      characterName: "测试",
      memories: [],
    });
    expect(result).toContain("submit_memory_summary");
    expect(result).toContain("今天很平静");
  });

  it("en: renders in English", () => {
    const result = buildMemoryCompressionPrompt({
      characterName: "Test",
      memories: sampleMemories,
      language: "en",
    });
    expect(result).toContain("You are Test");
    expect(result).toContain("first person");
    expect(result).toContain("submit_memory_summary");
  });

  it("ja: renders in Japanese", () => {
    const result = buildMemoryCompressionPrompt({
      characterName: "テスト",
      memories: sampleMemories,
      language: "ja",
    });
    expect(result).toContain("テスト");
    expect(result).toContain("submit_memory_summary");
    expect(result).toContain("第一人称");
  });
});

describe("buildWeeklyCompressionPrompt", () => {
  const dailySummaries = [
    "在酒馆工作，和田中聊了几句。",
    "去广场散步，遇到了新来的邮递员。",
    "在家休息了一天。",
    "去市场买菜，遇到了老朋友。",
    "工作很忙，没怎么和人说话。",
    "在酒馆喝了几杯，和老板聊了天。",
    "去教堂祈祷，心情平静。",
  ];

  it("zh: includes all 7 daily summaries", () => {
    const result = buildWeeklyCompressionPrompt({
      characterName: "测试",
      dailySummaries,
    });
    expect(result).toContain("测试");
    expect(result).toContain("第 1 天");
    expect(result).toContain("第 7 天");
    expect(result).toContain("submit_memory_summary");
  });

  it("en: renders in English", () => {
    const result = buildWeeklyCompressionPrompt({
      characterName: "Test",
      dailySummaries,
      language: "en",
    });
    expect(result).toContain("You are Test");
    expect(result).toContain("submit_memory_summary");
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/llm/prompt.test.ts
```

- [ ] **Step 3: Add tests for three-tier memory rendering in buildUserPrompt**

```typescript
// Inside the existing buildUserPrompt describe block, add:
it("renders three-tier memories (short/daily/weekly)", () => {
  const character: Character = {
    ...baseCharacter,
    shortMemory: [
      { id: "m1", tick: 118, importance: 2, content: "我在饭馆吃了晚饭。" },
      { id: "m2", tick: 119, importance: 3, content: "我和酒馆老板聊了几句。" },
    ],
    dailyMemory: [
      { id: "d1", tick: 120, importance: 3, content: "今天在饭馆工作，和几个人聊了天，晚上在广场散了步。" },
      { id: "d2", tick: 240, importance: 3, content: "今天在家休息，下午去了市场。" },
    ],
    longMemory: [
      { id: "w1", tick: 840, importance: 4, content: "这一周主要在酒馆工作，认识了新来的邮递员田中，和他聊过几次。" },
    ],
  };
  const out = buildUserPrompt({
    character,
    here: restaurant,
    companions: [],
    perceived: [],
    options: [{ type: "wait", hint: "等" }],
    tick: 245,
    facts: emptyFacts,
  });
  expect(out).toContain("你的近期短期记忆");
  expect(out).toContain("我在饭馆吃了晚饭");
  expect(out).toContain("你的日记忆");
  expect(out).toContain("今天在饭馆工作");
  expect(out).toContain("你的周记忆");
  expect(out).toContain("这一周主要在酒馆工作");
});

it("no daily/weekly memories omits their sections", () => {
  const out = buildUserPrompt({
    character: baseCharacter,
    here: restaurant,
    companions: [],
    perceived: [],
    options: [{ type: "wait", hint: "等" }],
    tick: 5,
    facts: emptyFacts,
  });
  expect(out).toContain("你的近期短期记忆");
  expect(out).not.toContain("你的日记忆");
  expect(out).not.toContain("你的周记忆");
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/llm/prompt.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/llm/prompt.test.ts
git commit -m "test: add tests for compression prompts and three-tier memory rendering"
```

---

### Task 10: Add integration tests for compressSleepMemories

**Files:**
- Create: `src/engine/memory-compression.test.ts`

- [ ] **Step 1: Create test file**

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { compressSleepMemories } from "./memory-compression";
import type { Character } from "@/domain/types";

// Mock the LLM module
vi.mock("@/llm/decide", () => ({
  llmMemoryCompress: vi.fn(),
}));

import { llmMemoryCompress } from "@/llm/decide";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-test",
    worldId: "w",
    name: "测试角色",
    age: 25,
    gender: "male",
    profession: "merchant",
    biography: "测试。",
    origin: "local",
    locationId: "node-home",
    personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
    vitals: { hunger: 0, fatigue: 5, hygiene: 0 },
    emotion: { mood: 0, stress: 0, social_satiety: 0 },
    abilities: [],
    shortMemory: [],
    dailyMemory: [],
    longMemory: [],
    relations: {},
    lastSleepTick: 0,
    ...overrides,
  };
}

describe("compressSleepMemories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("compresses shortMemory into dailyMemory and clears shortMemory", async () => {
    const mockSummarize = vi.mocked(llmMemoryCompress);
    mockSummarize.mockResolvedValue("今天在酒馆工作，和田中聊了天。");

    const c = makeCharacter({
      shortMemory: [
        { id: "m1", tick: 10, importance: 2, content: "我在酒馆工作。" },
        { id: "m2", tick: 15, importance: 3, content: "我和田中聊了天。" },
      ],
      lastSleepTick: 0,
    });

    await compressSleepMemories(c, 120, "zh");

    expect(c.shortMemory).toEqual([]);
    expect(c.dailyMemory).toHaveLength(1);
    expect(c.dailyMemory[0].content).toBe("今天在酒馆工作，和田中聊了天。");
    expect(c.dailyMemory[0].importance).toBe(3);
    expect(c.lastSleepTick).toBe(120);
    expect(mockSummarize).toHaveBeenCalledTimes(1);
  });

  it("compresses 7 daily memories into one weekly memory", async () => {
    const mockSummarize = vi.mocked(llmMemoryCompress);
    mockSummarize
      .mockResolvedValueOnce("今天在酒馆工作。") // daily summary
      .mockResolvedValueOnce("这一周主要在酒馆工作，认识了田中。"); // weekly summary

    const c = makeCharacter({
      shortMemory: [
        { id: "m1", tick: 110, importance: 2, content: "我在酒馆工作。" },
      ],
      dailyMemory: [
        { id: "d1", tick: 120, importance: 3, content: "第1天。" },
        { id: "d2", tick: 240, importance: 3, content: "第2天。" },
        { id: "d3", tick: 360, importance: 3, content: "第3天。" },
        { id: "d4", tick: 480, importance: 3, content: "第4天。" },
        { id: "d5", tick: 600, importance: 3, content: "第5天。" },
        { id: "d6", tick: 720, importance: 3, content: "第6天。" },
        { id: "d7", tick: 840, importance: 3, content: "第7天。" },
      ],
      lastSleepTick: 100,
    });

    await compressSleepMemories(c, 960, "zh");

    expect(c.shortMemory).toEqual([]);
    expect(c.dailyMemory).toHaveLength(1); // 7 compressed → 0 + 1 new = 1
    expect(c.longMemory).toHaveLength(1);
    expect(c.longMemory[0].content).toBe("这一周主要在酒馆工作，认识了田中。");
    expect(mockSummarize).toHaveBeenCalledTimes(2); // daily + weekly
  });

  it("skips compression when shortMemory is empty", async () => {
    const mockSummarize = vi.mocked(llmMemoryCompress);

    const c = makeCharacter({
      shortMemory: [],
      lastSleepTick: 100,
    });

    await compressSleepMemories(c, 120, "zh");

    expect(c.shortMemory).toEqual([]);
    expect(c.dailyMemory).toHaveLength(0);
    expect(mockSummarize).not.toHaveBeenCalled();
    expect(c.lastSleepTick).toBe(120);
  });

  it("filters out heuristic pseudo-memories", async () => {
    const mockSummarize = vi.mocked(llmMemoryCompress);
    mockSummarize.mockResolvedValue("今天在酒馆工作。");

    const c = makeCharacter({
      shortMemory: [
        { id: "m1", tick: 10, importance: 1, content: "[heuristic] 角色没有特别想做的事。" },
        { id: "m2", tick: 15, importance: 2, content: "我在酒馆工作。" },
      ],
      lastSleepTick: 0,
    });

    await compressSleepMemories(c, 120, "zh");

    // The heuristic memory should not be included in compression,
    // only the real memory should be passed to LLM
    expect(mockSummarize).toHaveBeenCalledTimes(1);
    const promptArg = mockSummarize.mock.calls[0][0].prompt;
    expect(promptArg).not.toContain("[heuristic]");
    expect(promptArg).toContain("我在酒馆工作");
  });

  it("keeps shortMemory intact when LLM call fails", async () => {
    const mockSummarize = vi.mocked(llmMemoryCompress);
    mockSummarize.mockRejectedValue(new Error("Network error"));

    const originalMemories = [
      { id: "m1", tick: 10, importance: 2, content: "我在酒馆工作。" },
    ];
    const c = makeCharacter({
      shortMemory: [...originalMemories],
      lastSleepTick: 0,
    });

    await compressSleepMemories(c, 120, "zh");

    expect(c.shortMemory).toEqual(originalMemories); // unchanged
    expect(c.dailyMemory).toHaveLength(0); // no new daily
    expect(c.lastSleepTick).toBe(0); // unchanged
  });

  it("only compresses memories since lastSleepTick", async () => {
    const mockSummarize = vi.mocked(llmMemoryCompress);
    mockSummarize.mockResolvedValue("今天散了步。");

    const c = makeCharacter({
      shortMemory: [
        { id: "m1", tick: 5, importance: 2, content: "我在酒馆吃饭。" },    // before lastSleepTick=100
        { id: "m2", tick: 110, importance: 2, content: "我在广场散步。" },   // after lastSleepTick=100
        { id: "m3", tick: 115, importance: 2, content: "我和邻居聊了天。" }, // after lastSleepTick=100
      ],
      lastSleepTick: 100,
    });

    await compressSleepMemories(c, 120, "zh");

    expect(mockSummarize).toHaveBeenCalledTimes(1);
    const promptArg = mockSummarize.mock.calls[0][0].prompt;
    expect(promptArg).not.toContain("我在酒馆吃饭"); // before lastSleepTick
    expect(promptArg).toContain("我在广场散步");
    expect(promptArg).toContain("我和邻居聊了天");
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/engine/memory-compression.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/engine/memory-compression.test.ts
git commit -m "test: add comprehensive tests for compressSleepMemories"
```

---

### Task 11: Full test suite and type check

**Files:**
- All modified files

- [ ] **Step 1: Run TypeScript type check**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

- [ ] **Step 3: Fix any failing tests or type errors**

Fix issues identified by the type checker or test runner.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final adjustments and fixes for three-tier memory system"
```
