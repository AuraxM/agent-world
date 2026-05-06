# Action 系统优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化 action 系统五个方面：add_notebook_entry 降级为 tool、look_around/wait 合并、双人互动仅对话、think 改为 solo 推理会话、提示词沉浸感重写。

**Architecture:** 所有改动集中在 action 定义层（actions-builtin.ts）、LLM 决策层（decide.ts / prompt.ts）、引擎编排层（tick.ts / dialog.ts）和 schema 层（schemas.ts / types.ts）。think 会话复用对话协议的模式（session 持久化 + 每 tick 多轮 LLM 调用 + tool 驱动的退出机制）。

**Tech Stack:** TypeScript, OpenAI-compatible function calling, Zod schemas

---

### Task 1: 删除 add_notebook_entry action

**Files:**
- Modify: `src/engine/actions-builtin.ts`

- [ ] **Step 1: 从 BUILTIN_ACTIONS 数组移除 addNotebookEntryAction**

```typescript
// src/engine/actions-builtin.ts，找到 BUILTIN_ACTIONS 数组（约 line 590），
// 从数组中移除 addNotebookEntryAction：

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
  // addNotebookEntryAction,  ← 删除这行
  lookAroundAction,
];
```

- [ ] **Step 2: 删除 addNotebookEntryAction 导出定义**

```typescript
// src/engine/actions-builtin.ts，删除整个 addNotebookEntryAction 定义（约 lines 478-550）
// （可选保留代码但不再 export；直接删除更干净）
```

- [ ] **Step 3: 提交**

```bash
git add src/engine/actions-builtin.ts
git commit -m "refactor: remove add_notebook_entry from actions, keep as dialogue tool

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 合并 look_around + wait，删除 wait

**Files:**
- Modify: `src/engine/actions-builtin.ts`
- Modify: `src/engine/tick.ts`
- Modify: `src/engine/dialog.ts`
- Modify: `src/llm/prompt.ts`

- [ ] **Step 1: 重写 lookAroundAction**

把 `look_around` 从 instant 改为 5 tick 持续，加上 ongoing action、onComplete、onInterrupt。

```typescript
// src/engine/actions-builtin.ts，替换 lookAroundAction 定义：

export const lookAroundAction: ActionDefinition = {
  type: "look_around",
  duration: 5,
  guidance: "观察周围或没有合适行动时消磨时间（兜底选项）",
  check(_ctx) { return true; },
  hint(ctx) {
    const hour = Math.floor(ctx.tick / TICKS_PER_HOUR) % 24;
    const peers = ctx.companions.map((c) => c.name).join("、");
    if (peers) return `环顾四周（${ctx.here.name}，身边有 ${peers}，当前 ${hour}:00，持续 5 ticks）`;
    return `环顾四周（${ctx.here.name}，当前 ${hour}:00，持续 5 ticks）`;
  },
  validateParams() { return null; },
  execute(ctx, _input) {
    const lines: string[] = [];
    lines.push(`我环顾四周。我在 ${ctx.here.name}。`);

    if (ctx.companions.length === 0) {
      lines.push("周围没有其他人。");
    } else {
      const parts = ctx.companions.map((c) => {
        const action = c.currentAction;
        if (action) {
          return `${c.name}（正在${action.description}）`;
        }
        return `${c.name}（站在原地）`;
      });
      lines.push(`周围有：${parts.join("、")}。`);
    }

    return {
      memory: lines.join(""),
      event: {
        category: "inner",
        description: `${ctx.self.name} 环顾四周，观察周围情况。`,
        intensity: 1,
      },
      stateChanges: [{
        kind: "setOngoingAction",
        action: {
          type: "look_around",
          startedAt: ctx.tick,
          endsAt: ctx.tick + 5,
          description: `在 ${ctx.here.name} 环顾四周`,
          interruptThreshold: 2,
        },
      }],
    };
  },
  onComplete(ctx) {
    return {
      memory: `我在 ${ctx.here.name} 观察了一圈。`,
    };
  },
  onInterrupt(ctx, reason) {
    return {
      memory: `我正在观察周围时被打断了——${reason}`,
    };
  },
};
```

- [ ] **Step 2: 删除 waitAction**

```typescript
// src/engine/actions-builtin.ts，删除整个 waitAction 定义（原 lines 372-410）
// 删除后该区域为空，直接不留痕迹
```

- [ ] **Step 3: 从 BUILTIN_ACTIONS 移除 waitAction，保留所有其他 action**

```typescript
// src/engine/actions-builtin.ts，BUILTIN_ACTIONS 数组：
export const BUILTIN_ACTIONS: ActionDefinition[] = [
  eatAction,
  batheAction,
  restAction,
  workAction,
  thinkAction,
  speakAction,
  sleepAction,
  moveAction,
  // waitAction,  ← 删除这行
  giveAction,
  lookAroundAction,
];
```

- [ ] **Step 4: tick.ts — salvage fallback 替换**

```typescript
// src/engine/tick.ts，line 793，salvageDecide 的 catch 块：
// 将 type: "wait" 改为 type: "look_around"

} catch {
  return {
    type: "look_around" as const,
    actorId: input.character.id,
    reasoning: `补救决策违规，环顾四周：${input.rejectReason}`,
    selfImportance: 1,
  };
}
```

- [ ] **Step 5: dialog.ts — finalActions 占位替换**

```typescript
// src/engine/dialog.ts，需要替换多处 "wait" → "look_around"：

// 1. lines 382-388，locked initiators 占位 action：
actionsForExecution.push({
  type: "look_around",
  actorId: charId,
  reasoning: `正在和 ${acceptorName} 对话`,
  selfImportance: 2,
  skipExecution: true, skipMemory: true,
});

// 2. lines 1040-1062，activeConversations + endedConversations 的占位：
const waitInit: Action = {
  type: "look_around", actorId: conv.initiatorId,
  reasoning: `正在和 ${charById.get(conv.acceptorId)!.name} 对话`,
  selfImportance: 2, skipExecution: true, skipMemory: true,
};
finalActionsMap.set(conv.initiatorId, waitInit);
finalActionsMap.set(conv.acceptorId, {
  type: "look_around", actorId: conv.acceptorId,
  reasoning: `正在和 ${charById.get(conv.initiatorId)!.name} 对话`,
  selfImportance: 2, skipExecution: true, skipMemory: true,
});

// ended:
finalActionsMap.set(conv.initiatorId, {
  type: "look_around", actorId: conv.initiatorId,
  reasoning: `刚和 ${charById.get(conv.acceptorId)!.name} 聊完`,
  selfImportance: 2, skipExecution: true, skipMemory: true,
});
finalActionsMap.set(conv.acceptorId, {
  type: "look_around", actorId: conv.acceptorId,
  reasoning: `刚和 ${charById.get(conv.initiatorId)!.name} 聊完`,
  selfImportance: 2, skipExecution: true, skipMemory: true,
});
```

- [ ] **Step 6: prompt.ts — worldRules() 文案更新**

```typescript
// src/llm/prompt.ts，worldRules() 中的反循环段，将 wait 引用改为 look_around：
// "选 action_type="wait"" → "选 action_type="look_around""

// 原文（约 line 565）：
// `- 不要做超出当前可选行动范围的事；如果没有合适的，选 action_type="wait"。`

// 改为：
`- 不要做超出当前可选行动范围的事；如果没有合适的，选 action_type="look_around"。`
```

- [ ] **Step 7: 提交**

```bash
git add src/engine/actions-builtin.ts src/engine/tick.ts src/engine/dialog.ts src/llm/prompt.ts
git commit -m "refactor: merge look_around and wait, remove wait action

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 双人互动 action 改为仅对话可用

**Files:**
- Modify: `src/engine/actions-builtin.ts`
- Modify: `configs/maps/sakuraba-academy/actions.js`

- [ ] **Step 1: give action check() 改为 return false**

```typescript
// src/engine/actions-builtin.ts，giveAction 的 check 方法：

check(ctx) {
  // 双人互动仅通过对话中的 propose_dialogue_action 发起
  return false;
},
```

- [ ] **Step 2: kiss/caress/hug check() 改为 return false**

```javascript
// configs/maps/sakuraba-academy/actions.js，每个 action 的 check 方法：

// kiss（line ~5）：
check(ctx) {
  return false;
},

// caress（line ~34）：
check(ctx) {
  return false;
},

// hug（line ~63）：
check(ctx) {
  return false;
},
```

- [ ] **Step 3: 提交**

```bash
git add src/engine/actions-builtin.ts configs/maps/sakuraba-academy/actions.js
git commit -m "refactor: make dual-person interactions dialogue-only

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: think 改为 solo 推理会话 — Schema & Types

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/schemas.ts`

- [ ] **Step 1: 新增 ThinkSession、ThinkTurn 类型**

```typescript
// src/domain/types.ts，在 Conversation 类型附近新增：

export interface ThinkTurn {
  kind: "thought";
  text: string;
  reasoning?: string;
}

export interface ThinkSession {
  id: string;
  worldId: string;
  characterId: string;
  transcript: ThinkTurn[];
  tickStarted: number;
  currentTickRounds: number;
  status: "active" | "ending" | "ended";
}
```

- [ ] **Step 2: 新增 submit_think_turn 和 end_thinking 的 Zod schema 和 tool schema**

```typescript
// src/domain/schemas.ts，在 END_CONVERSATION_TOOL_NAME 附近新增：

// --- submit_think_turn ---
export const THINK_TOOL_NAME = "submit_think_turn";
export const ThinkTurnSchema = z.object({
  text: z.string().min(1).max(800),
  reasoning: z.string().min(1).max(300).optional(),
});
export type ThinkTurnPayload = z.infer<typeof ThinkTurnSchema>;
export const ThinkTurnToolSchema = {
  type: "object" as const,
  properties: {
    text: { type: "string", description: "你的思考内容。" },
    reasoning: { type: "string", description: "简短推理过程（可选）。" },
  },
  required: ["text"],
  additionalProperties: false,
};

// --- end_thinking ---
export const END_THINKING_TOOL_NAME = "end_thinking";
export const EndThinkingSchema = z.object({
  summary: z.string().min(1).max(500),
  reasoning: z.string().min(1).max(300).optional(),
});
export type EndThinkingPayload = z.infer<typeof EndThinkingSchema>;
export const EndThinkingToolSchema = {
  type: "object" as const,
  properties: {
    summary: { type: "string", description: "这次思考的收获总结。" },
    reasoning: { type: "string", description: "结束思考的理由（可选）。" },
  },
  required: ["summary"],
  additionalProperties: false,
};
```

- [ ] **Step 3: 提交**

```bash
git add src/domain/types.ts src/domain/schemas.ts
git commit -m "feat: add ThinkSession, ThinkTurn types and think tool schemas

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: think 改为 solo 推理会话 — Prompt Builder

**Files:**
- Modify: `src/llm/prompt.ts`

- [ ] **Step 1: 新增 buildThinkPrompt()**

```typescript
// src/llm/prompt.ts，在 buildDialogTurnPrompt 附近新增：

export function buildThinkPrompt(args: {
  self: Character;
  here: MapNode;
  transcript: ThinkTurn[];
  language?: Language;
  tick?: number;
  epoch?: number;
}): string {
  const { self, here, transcript, tick, epoch: promptEpoch } = args;
  const language = args.language ?? "zh";

  const history = transcript
    .map((t) => `你思考道：${t.text}`)
    .join("\n");

  const t = tick !== undefined && promptEpoch !== undefined
    ? timeOfDay(tick, promptEpoch, self.sleepWindow ?? DEFAULT_SLEEP_WINDOW)
    : null;
  const timeStr = t
    ? `第 ${t.day} 日 ${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}（${t.period}）`
    : "";

  const fatigue = qualifyVital(self.vitals.fatigue, "fatigue");
  const hunger = qualifyVital(self.vitals.hunger, "hunger");

  const shortMemories = self.shortMemory
    .filter(m => !m.content.includes("[heuristic]"))
    .slice(-6)
    .map(m => `- ${m.content}`).join("\n");
  const dailyMemories = self.dailyMemory.slice(-4)
    .map(m => `- ${m.content}`).join("\n");
  const longMemories = self.longMemory.slice(-4)
    .map(m => `- ${m.content}`).join("\n");
  const impressions = Object.entries(self.impressionBook)
    .filter(([, v]) => v && v.length > 0)
    .slice(0, 10)
    .map(([id, text]) => `- ${id}: ${text}`).join("\n");

  const lines: string[] = [];

  if (language === "zh") {
    lines.push(
      "你正在独自沉思。这不是对外对话，而是你的内心活动。",
      "请根据你的性格、记忆和当前状态，自然地展开思考。",
    );
    if (timeStr) lines.push(`当前游戏时间：${timeStr}`);
    lines.push("");
    lines.push("如果你的思考涉及对他人的印象或回忆，可以调用 recall 查询，或调用 memorize 记录新印象。");
    lines.push("如果你想记住某个未来的约定或计划，可以调用 add_notebook_entry 记录。");
    lines.push("");
    lines.push(
      "调用 submit_think_turn 来输出一段思考。如果想结束思考，调用 end_thinking 写总结。",
    );
    lines.push("");
    lines.push(buildSelfImage(self));
    lines.push("");
    lines.push(`当前地点：${here.name}（${here.description || "无描述"}）`);
    lines.push("");
    lines.push("你当前的状态：");
    lines.push(`- 饥饿：${hunger.phrase}`);
    lines.push(`- 疲惫：${fatigue.phrase}`);
    lines.push(`- 心情：${MOOD_WORDS[self.emotion.mood] ?? String(self.emotion.mood)}`);
    lines.push(`- 压力：${STRESS_WORDS[self.emotion.stress] ?? String(self.emotion.stress)}`);
    lines.push(`- 社交满足：${SOCIAL_WORDS[self.emotion.social_satiety] ?? String(self.emotion.social_satiety)}`);
    lines.push("");

    if (self.shortTermGoal || self.longTermGoal) {
      lines.push("你的目标：");
      if (self.shortTermGoal) lines.push(`短期：${self.shortTermGoal.goal}`);
      if (self.longTermGoal) lines.push(`长期：${self.longTermGoal.goal}`);
      lines.push("");
    }

    if (self.liked) lines.push(`你喜欢：${self.liked}`);
    if (self.disliked) lines.push(`你讨厌：${self.disliked}`);
    if (self.liked || self.disliked) lines.push("");

    if (shortMemories) {
      lines.push("你的近期记忆：");
      lines.push(shortMemories);
      lines.push("");
    }
    if (dailyMemories) {
      lines.push("你的日记忆：");
      lines.push(dailyMemories);
      lines.push("");
    }
    if (impressions) {
      lines.push("你对他人的印象：");
      lines.push(impressions);
      lines.push("");
    }

    lines.push("你的思考记录：");
    lines.push(history || "（刚开始思考）");
  } else if (language === "en") {
    // English version
    lines.push(
      "You are in deep thought. This is not a conversation — it's your inner monologue.",
      "Think naturally based on your personality, memories, and current state.",
    );
    if (timeStr) lines.push(`Current game time: ${timeStr}`);
    lines.push("");
    lines.push("If your thoughts involve others, use recall to check impressions or memorize to record new ones.");
    lines.push("If you want to note a future plan, use add_notebook_entry.");
    lines.push("");
    lines.push("Call submit_think_turn to output a thought. Call end_thinking to conclude and save a summary.");
    lines.push("");
    lines.push(buildSelfImage(self));
    lines.push("");
    lines.push(`Current location: ${here.name} (${here.description || ""})`);
    lines.push("");
    lines.push("Your current state:");
    lines.push(`- Hunger: ${hunger.phrase}`);
    lines.push(`- Fatigue: ${fatigue.phrase}`);
    lines.push(`- Mood: ${MOOD_WORDS[self.emotion.mood] ?? String(self.emotion.mood)}`);
    lines.push(`- Stress: ${STRESS_WORDS[self.emotion.stress] ?? String(self.emotion.stress)}`);
    lines.push(`- Social: ${SOCIAL_WORDS[self.emotion.social_satiety] ?? String(self.emotion.social_satiety)}`);
    lines.push("");

    if (self.shortTermGoal || self.longTermGoal) {
      lines.push("Your goals:");
      if (self.shortTermGoal) lines.push(`Short-term: ${self.shortTermGoal.goal}`);
      if (self.longTermGoal) lines.push(`Long-term: ${self.longTermGoal.goal}`);
      lines.push("");
    }

    if (shortMemories) {
      lines.push("Your recent memories:");
      lines.push(shortMemories);
      lines.push("");
    }
    if (impressions) {
      lines.push("Your impressions of others:");
      lines.push(impressions);
      lines.push("");
    }

    lines.push("Your thoughts so far:");
    lines.push(history || "(just started)");
  } else {
    // Japanese version
    lines.push(
      "あなたは深く考え込んでいます。これは会話ではなく、心の中の独白です。",
      "自分の性格、記憶、現在の状態に基づいて自然に思考を展開してください。",
    );
    if (timeStr) lines.push(`現在のゲーム時間：${timeStr}`);
    lines.push("");
    lines.push("submit_think_turn を呼び出して思考を出力してください。終了する場合は end_thinking を呼び出してまとめを書いてください。");
    lines.push("");
    lines.push(buildSelfImage(self));
    lines.push("");
    lines.push(`現在地：${here.name}`);
    lines.push("");

    if (shortMemories) {
      lines.push("最近の記憶：");
      lines.push(shortMemories);
      lines.push("");
    }

    lines.push("思考の記録：");
    lines.push(history || "（始まったばかり）");
  }

  return lines.join("\n");
}
```

- [ ] **Step 2: 新增 injectThinkTimeMessage()**

```typescript
// src/llm/prompt.ts，在 injectTimeMessage 附近新增：

export function injectThinkTimeMessage(args: {
  tick: number;
  epoch: number;
  tickStarted: number;
  language?: Language;
}): string {
  const { tick, epoch, tickStarted } = args;
  const language = args.language ?? "zh";
  const displayTick = tick + 1;
  const t = timeOfDay(displayTick, epoch);
  const elapsedTicks = displayTick - tickStarted;
  const elapsedHours = Math.floor(elapsedTicks / TICKS_PER_HOUR);
  const elapsedMinutes = Math.floor((elapsedTicks % TICKS_PER_HOUR) * (60 / TICKS_PER_HOUR));
  const totalMinutes = elapsedHours * 60 + elapsedMinutes;

  const timeStr = `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}（${t.period}）`;
  const endHint = language === "zh"
    ? "如果思考得差不多了，调用 end_thinking 工具结束思考并写入记忆。"
    : language === "en"
      ? "If you're done thinking, use the end_thinking tool to conclude and save your thoughts."
      : "思考がまとまったら、end_thinking ツールを呼び出して記憶に書き込んでください。";

  if (language === "zh") {
    const dur = elapsedHours > 0 ? `${elapsedHours} 小时 ${elapsedMinutes} 分钟` : `${elapsedMinutes} 分钟`;
    return `现在已经 ${timeStr} 了，你已经思考了 ${dur}（${totalMinutes} 分钟）。${endHint}`;
  }
  if (language === "en") {
    const dur = elapsedHours > 0 ? `${elapsedHours}h ${elapsedMinutes}m` : `${elapsedMinutes}m`;
    return `It's now ${timeStr}, you've been thinking for ${dur} (${totalMinutes} min). ${endHint}`;
  }
  const dur = elapsedHours > 0 ? `${elapsedHours} 時間 ${elapsedMinutes} 分` : `${elapsedMinutes} 分`;
  return `もう ${timeStr} です、${dur}（${totalMinutes} 分）考え続けています。${endHint}`;
}
```

- [ ] **Step 3: 提交**

```bash
git add src/llm/prompt.ts
git commit -m "feat: add buildThinkPrompt and injectThinkTimeMessage

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: think 改为 solo 推理会话 — LLM 入口

**Files:**
- Modify: `src/llm/decide.ts`

- [ ] **Step 1: 新增 llmThink() 函数**

```typescript
// src/llm/decide.ts，在 llmDialogTurn 后面新增：

import {
  // ... 已有 imports
  THINK_TOOL_NAME, ThinkTurnSchema, ThinkTurnToolSchema,
  END_THINKING_TOOL_NAME, EndThinkingSchema, EndThinkingToolSchema,
} from "@/domain/schemas";
import type { ThinkTurn } from "@/domain/types";
import { buildThinkPrompt, injectThinkTimeMessage } from "./prompt";

const THINK_TURNS_PER_TICK = 3;

export interface ThinkTurnResult {
  kind: "turn";
  turn: ThinkTurn;
}

export interface ThinkEndResult {
  kind: "end";
  summary: string;
}

export async function llmThink(args: {
  self: Character;
  here: MapNode;
  transcript: ThinkTurn[];
  language?: Language;
  tick: number;
  epoch: number;
  tickStarted: number;
}): Promise<ThinkTurnResult | ThinkEndResult> {
  if (!hasApiKey()) throw new Error("没有激活的 LLM provider");

  const config = getEntryConfig("dialog_turn"); // 复用对话的 config
  const client = getLLMClientForEntry("dialog_turn");
  const language: Language = args.language ?? "zh";

  const prompt = buildThinkPrompt({
    self: args.self,
    here: args.here,
    transcript: args.transcript,
    language,
    tick: args.tick,
    epoch: args.epoch,
  });

  const tools: ChatCompletionTool[] = [
    {
      type: "function",
      function: { name: THINK_TOOL_NAME, description: "输出一段思考。", parameters: ThinkTurnToolSchema },
    },
    {
      type: "function",
      function: { name: END_THINKING_TOOL_NAME, description: "结束思考并写入总结。", parameters: EndThinkingToolSchema },
    },
    buildRecallTool(),
    buildMemorizeTool(),
    buildNotebookTool(),
  ];

  const extra: Record<string, unknown> = {};
  if (config.thinkingEnabled) extra.thinking = { type: "enabled" };

  const systemPrompt = language === "zh"
    ? `你是一个角色扮演引擎中的 NPC。你正在独自沉思。请根据你的性格和记忆自然地思考。\n\n${languageInstruction(language)}`
    : language === "en"
      ? `You are an NPC in a role-playing engine. You are in deep thought. Think naturally based on your personality and memories.\n\n${languageInstruction(language)}`
      : `あなたはロールプレイングエンジンのNPCです。あなたは深く考え込んでいます。あなたの性格と記憶に基づいて自然に考えてください。\n\n${languageInstruction(language)}`;

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt },
  ];

  for (let round = 0; round < MAX_TOOL_CALL_ROUNDS; round++) {
    const response = await client.chat.completions.create({
      model: getModelNameForEntry("dialog_turn"),
      max_tokens: 1024,
      messages: messages as any,
      tools,
      ...extra,
    });

    const message = response.choices[0]?.message;
    if (!message) {
      if (round < MAX_TOOL_CALL_ROUNDS - 1) {
        messages.push({ role: "user", content: "没有返回内容，请重试调用工具。" });
        continue;
      }
      throw new Error("LLM 返回空 message");
    }

    const assistantMsg: Record<string, unknown> = { role: "assistant", content: message.content ?? "" };
    if ((message as any).reasoning_content) assistantMsg.reasoning_content = (message as any).reasoning_content;
    if (message.tool_calls) assistantMsg.tool_calls = message.tool_calls;
    messages.push(assistantMsg);

    const allToolCalls = (message.tool_calls ?? []).filter((c: any) => c.type === "function");
    if (allToolCalls.length === 0) {
      if (round < MAX_TOOL_CALL_ROUNDS - 1) {
        messages.push({ role: "user", content: "请调用 submit_think_turn 或 end_thinking 工具。" });
        continue;
      }
      throw new Error("LLM 未返回 tool_call");
    }

    // Side-effect tools first (recall/memorize/notebook)
    let hasSideEffect = false;
    for (const tc of allToolCalls) {
      const t = tc as any;
      if (t.function.name === RECALL_TOOL_NAME) {
        hasSideEffect = true;
        let parsedArgs: unknown;
        try { parsedArgs = JSON.parse(t.function.arguments); } catch (e) {
          messages.push({ role: "tool", tool_call_id: t.id, content: `recall JSON 解析失败。` });
          continue;
        }
        const parseResult = RecallSchema.safeParse(parsedArgs);
        if (!parseResult.success) {
          messages.push({ role: "tool", tool_call_id: t.id, content: `recall 参数不符合要求。` });
          continue;
        }
        const recallResult = handleRecall(parseResult.data.target_ids, args.self, []);
        messages.push({ role: "tool", tool_call_id: t.id, content: recallResult });
      } else if (t.function.name === MEMORIZE_TOOL_NAME) {
        hasSideEffect = true;
        let parsedArgs: unknown;
        try { parsedArgs = JSON.parse(t.function.arguments); } catch (e) {
          messages.push({ role: "tool", tool_call_id: t.id, content: `memorize JSON 解析失败。` });
          continue;
        }
        const parseResult = MemorizeSchema.safeParse(parsedArgs);
        if (!parseResult.success) {
          messages.push({ role: "tool", tool_call_id: t.id, content: `memorize 参数不符合要求。` });
          continue;
        }
        handleMemorize(parseResult.data.target_id, parseResult.data.impression, args.self);
        messages.push({ role: "tool", tool_call_id: t.id, content: "已记录。" });
      } else if (t.function.name === NOTEBOOK_TOOL_NAME) {
        hasSideEffect = true;
        // 复用对话中的 notebook 处理逻辑（与 dialog.ts 中 NOTEBOOK_TOOL_NAME 处理相同）
        let parsedArgs: unknown;
        try { parsedArgs = JSON.parse(t.function.arguments); } catch (e) {
          messages.push({ role: "tool", tool_call_id: t.id, content: `add_notebook_entry JSON 解析失败。` });
          continue;
        }
        const parseResult = NotebookSchema.safeParse(parsedArgs);
        if (!parseResult.success) {
          messages.push({ role: "tool", tool_call_id: t.id, content: `add_notebook_entry 参数不符合要求：${parseResult.error.message}。` });
          continue;
        }
        const { year, month, day, hour, free_text } = parseResult.data;
        const scheduledTick = tickFromCalendar(year, month, day, hour, args.epoch);
        if (scheduledTick === null || scheduledTick <= args.tick) {
          messages.push({ role: "tool", tool_call_id: t.id, content: "日期无效或已过期。" });
          continue;
        }
        const entry = {
          id: createEntryId(),
          scheduledTick,
          content: free_text,
          createdAt: args.tick,
        };
        args.self.notebook.push(entry);
        saveNotebookEntry(args.self.worldId, args.self.id, entry);
        const timeLabel = `${year}年${month}月${day}日 ${String(hour).padStart(2, "0")}:00`;
        messages.push({ role: "tool", tool_call_id: t.id, content: `已记录：${timeLabel} — ${free_text}` });
      }
    }
    if (hasSideEffect) {
      round = Math.max(0, round - 1);
      continue;
    }

    // Main tool: submit_think_turn or end_thinking
    let turnResult: ThinkTurnResult | null = null;
    let endResult: ThinkEndResult | null = null;
    let hasError = false;

    for (const tc of allToolCalls) {
      const t = tc as any;
      const name = t.function.name;

      let args: unknown;
      try { args = JSON.parse(t.function.arguments); } catch (e) {
        messages.push({ role: "user", content: `${name} JSON 解析失败。` });
        hasError = true;
        break;
      }

      if (name === THINK_TOOL_NAME) {
        const result = ThinkTurnSchema.safeParse(args);
        if (!result.success) {
          messages.push({ role: "user", content: `submit_think_turn 参数不符合要求：${result.error.message}。` });
          hasError = true;
          break;
        }
        turnResult = {
          kind: "turn",
          turn: { kind: "thought", text: result.data.text, reasoning: result.data.reasoning },
        };
      } else if (name === END_THINKING_TOOL_NAME) {
        const result = EndThinkingSchema.safeParse(args);
        if (!result.success) {
          messages.push({ role: "user", content: `end_thinking 参数不符合要求：${result.error.message}。` });
          hasError = true;
          break;
        }
        endResult = { kind: "end", summary: result.data.summary };
      } else {
        messages.push({ role: "user", content: `未知工具 "${name}"。请使用 submit_think_turn 或 end_thinking。` });
        hasError = true;
        break;
      }
    }

    if (hasError) {
      if (round < MAX_TOOL_CALL_ROUNDS - 1) continue;
      throw new Error("LLM 多轮均存在错误");
    }

    if (!turnResult && !endResult) {
      if (round < MAX_TOOL_CALL_ROUNDS - 1) {
        messages.push({ role: "user", content: "请调用 submit_think_turn 或 end_thinking。" });
        continue;
      }
      throw new Error("LLM 未返回 turn 或 end");
    }

    if (turnResult) return turnResult;
    return endResult!;
  }

  throw new Error("think LLM 多轮均未返回 tool_call");
}
```

- [ ] **Step 2: 提交**

```bash
git add src/llm/decide.ts
git commit -m "feat: add llmThink function for solo reasoning sessions

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: think 改为 solo 推理会话 — Engine 编排

**Files:**
- Modify: `src/engine/tick.ts`

- [ ] **Step 1: 在 tick.ts 中加入 think session 持久化和管理**

```typescript
// src/engine/tick.ts，在 import 区新增：
import { loadThinkSessions, saveThinkSession, deleteThinkSession } from "./think-sessions";
import { llmThink } from "@/llm/decide";
import type { ThinkSession } from "@/domain/types";
import { injectThinkTimeMessage } from "@/llm/prompt";
```

- [ ] **Step 2: 在 tick 主循环中加入 think session 逻辑**

在对话处理（Phase 4.5）之前加入 think session processing：

```typescript
// src/engine/tick.ts，在 "Phase 4.5: Dialog protocol" 之前插入：

// ── Phase 4.4: Think sessions (solo reasoning) ──
const ongoingThinkSessions = loadThinkSessions(worldId);

// Lock characters in active think sessions
for (const ts of ongoingThinkSessions) {
  if (ts.status !== "ended") {
    lockedCharacterIds.add(ts.characterId);
    const thinker = characters.find((c) => c.id === ts.characterId);
    if (thinker && !thinker.activeConversationIds.includes(ts.id)) {
      thinker.activeConversationIds.push(ts.id);
    }
  }
}

// Add placeholder for think-locked characters
for (const charId of lockedCharacterIds) {
  const ts = ongoingThinkSessions.find((s) => s.characterId === charId && s.status !== "ended");
  if (ts) {
    const thinker = characters.find((c) => c.id === charId);
    if (thinker && !thinker.activeConversationIds.includes(ts.id)) {
      thinker.activeConversationIds.push(ts.id);
    }
  }
}

// Run one tick of think for each active session
const updatedThinkSessions: ThinkSession[] = [];
const THINK_TURNS_PER_TICK = 3;

for (const ts of ongoingThinkSessions) {
  if (ts.status === "ended") continue;

  const thinker = characters.find((c) => c.id === ts.characterId);
  if (!thinker) {
    ts.status = "ended";
    updatedThinkSessions.push(ts);
    continue;
  }

  const here = nodeById.get(thinker.locationId);
  if (!here) {
    ts.status = "ended";
    updatedThinkSessions.push(ts);
    continue;
  }

  const transcript: ThinkTurn[] = [...ts.transcript];

  for (let round = 0; round < THINK_TURNS_PER_TICK; round++) {
    let result;
    try {
      result = await llmThink({
        self: thinker,
        here,
        transcript,
        language,
        tick: fromTick,
        epoch: world.epoch,
        tickStarted: ts.tickStarted,
      });
    } catch (err) {
      log.error("llmThink 异常，思考被迫终止", {
        character: thinker.name,
        error: err instanceof Error ? err.message : String(err),
      });
      ts.status = "ended";
      break;
    }

    if (result.kind === "turn") {
      transcript.push(result.turn);
    } else {
      // end_thinking
      thinker.shortMemory.push({
        id: `mem-${randomUUID().slice(0, 8)}`,
        tick: fromTick,
        importance: 3,
        content: `我沉思了一番：${result.summary}`,
      });
      ts.status = "ended";
      break;
    }
  }

  ts.transcript = transcript;
  ts.currentTickRounds = THINK_TURNS_PER_TICK;

  if (ts.status !== "ended") {
    // Inject time message
    transcript.push({
      kind: "thought",
      text: injectThinkTimeMessage({
        tick: fromTick,
        epoch: world.epoch,
        tickStarted: ts.tickStarted,
        language,
      }),
    });
  }

  updatedThinkSessions.push(ts);
}

// Persist think sessions
for (const ts of updatedThinkSessions) {
  if (ts.status === "ended") {
    deleteThinkSession(worldId, ts.id);
    const thinker = characters.find((c) => c.id === ts.characterId);
    if (thinker) {
      thinker.activeConversationIds = thinker.activeConversationIds.filter((id) => id !== ts.id);
    }
  } else {
    saveThinkSession(ts);
  }
}
```

- [ ] **Step 3: 创建 think-sessions.ts 持久化模块**

```typescript
// src/engine/think-sessions.ts（新文件）
import type { ThinkSession } from "@/domain/types";
import { db, schema } from "@/db/client";
import { eq, and } from "drizzle-orm";

export function loadThinkSessions(worldId: string): ThinkSession[] {
  const rows = db
    .select()
    .from(schema.thinkSessions)
    .where(eq(schema.thinkSessions.worldId, worldId))
    .all();
  return rows.map((r) => JSON.parse(r.payloadJson) as ThinkSession);
}

export function saveThinkSession(ts: ThinkSession): void {
  const now = new Date();
  db
    .insert(schema.thinkSessions)
    .values({
      id: ts.id,
      worldId: ts.worldId,
      payloadJson: JSON.stringify(ts),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.thinkSessions.worldId, schema.thinkSessions.id],
      set: { payloadJson: JSON.stringify(ts), updatedAt: now },
    })
    .run();
}

export function deleteThinkSession(worldId: string, id: string): void {
  db
    .delete(schema.thinkSessions)
    .where(
      and(
        eq(schema.thinkSessions.worldId, worldId),
        eq(schema.thinkSessions.id, id),
      ),
    )
    .run();
}
```

- [ ] **Step 4: 在 DB schema 中加入 think_sessions 表**

```typescript
// src/db/schema.ts，在 conversations 表定义后新增（仿照 conversations 表结构）：

export const thinkSessions = sqliteTable(
  "think_sessions",
  {
    id: text("id").notNull(),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    payloadJson: text("payload_json").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.worldId, t.id] }),
    index("think_sessions_world_idx").on(t.worldId),
  ],
);
```

- [ ] **Step 5: 提交**

```bash
git add src/engine/tick.ts src/engine/think-sessions.ts src/db/
git commit -m "feat: add think session orchestration in tick loop

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: think action 触发 think session

**Files:**
- Modify: `src/engine/tick.ts`
- Modify: `src/engine/actions-builtin.ts`

- [ ] **Step 1: think action execute 返回特殊标记，触发 think session 创建**

修改 think action 的 execute，返回一个标记让 tick.ts 知道要创建 think session：

```typescript
// src/engine/actions-builtin.ts，修改 thinkAction.execute：

execute(ctx, input) {
  const thought = (input.free_text as string) || "开始沉思";
  return {
    memory: `我开始沉思。`,
    event: { category: "inner", description: `${ctx.self.name} 陷入沉思。`, intensity: 1 },
    // 标记：触发 think session
    stateChanges: [{
      kind: "startThinking" as any, // 新增 StateChange kind
      initialThought: thought,
    }],
  };
},
```

- [ ] **Step 2: tick.ts 中处理 startThinking state change**

在 executeActions 之后，检测 startThinking 并创建 ThinkSession：

```typescript
// src/engine/tick.ts，在 executeActions 结果处理之后：

// Check for startThinking state changes and create sessions
for (const c of characters) {
  const action = actionsForExecution.find((a) => a.actorId === c.id);
  if (action?.type === "think" && !action.skipExecution) {
    const ts: ThinkSession = {
      id: `think-${randomUUID().slice(0, 8)}`,
      worldId,
      characterId: c.id,
      transcript: [{ kind: "thought", text: action.freeText || "开始沉思" }],
      tickStarted: fromTick,
      currentTickRounds: 0,
      status: "active",
    };
    saveThinkSession(ts);
    c.activeConversationIds.push(ts.id); // 复用 activeConversationIds 字段来锁定角色
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add src/engine/actions-builtin.ts src/engine/tick.ts
git commit -m "feat: trigger think session creation from think action

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: 社交满足感引导 speak/think

**Files:**
- Modify: `src/llm/prompt.ts`
- Modify: `src/engine/actions-builtin.ts`

- [ ] **Step 1: 在 buildUserPrompt 的社交满足感后加引导**

```typescript
// src/llm/prompt.ts，在 describeEmotion 调用后（buildUserPrompt 中约 line 1306），加入引导：

// 在 "你当前的情绪状态：" 段落后追加：
const socialSatiety = character.emotion.social_satiety;
if (socialSatiety >= 3) {
  lines.push("你的社交需求已经充分满足了，现在更想独处或安静地思考。");
} else if (socialSatiety >= 2) {
  lines.push("你已经和人聊了不少，不太急于开口。如果想整理思绪，沉思是个好选择。");
} else if (socialSatiety <= -3) {
  lines.push("你感到深深的孤独，渴望找人说话。身边有人时，主动开口聊聊吧。");
} else if (socialSatiety <= -2) {
  lines.push("你有些寂寞，如果有合适的人在身边，不妨说说话。");
}
```

- [ ] **Step 2: think 和 speak 的 guidance 动态化**

```typescript
// src/engine/actions-builtin.ts，thinkAction.guidance 改为函数式：

// think:
guidance: "想整理思绪、回顾记忆、或社交满足不想说话时沉思",

// speak:
guidance: "身边有人时发起社交对话，孤独时更应主动开口",
```

- [ ] **Step 3: 提交**

```bash
git add src/llm/prompt.ts src/engine/actions-builtin.ts
git commit -m "feat: add social satiety guidance for speak vs think choice

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: 提示词沉浸感重写

**Files:**
- Modify: `src/llm/prompt.ts`

- [ ] **Step 1: 重写 worldRules()**

```typescript
// src/llm/prompt.ts，替换 worldRules() 函数：

function worldRules(): string {
  return `你是这个虚拟小镇里的一个居民。你和其他人一样在这里生活——吃饭、工作、休息、聊天。日子一天天过，你凭自己的性格和当下的状态，自然地决定接下来做什么。

游戏里的时间：1 tick 是 1/5 小时（5 ticks = 1 游戏小时）。每过一个 tick，你都要做一个决定——接下来要做什么。

做决定的方式：
- 你在心里盘算一下当下的处境，然后调用 decide_action 工具，告诉引擎你的选择。
- action_type 是你想做的事，具体有哪些可选，会列在 prompt 末尾的"可选行动"里。
- reasoning 是你做这个决定时的内心活动。你习惯在做事前想想自己的性格会怎么处理当前的情况——这种自我觉察是你的一部分。
- 做完一件事后，用 self_importance（1-5）来标记这件事值不值得以后回忆。

走动：
- 想去哪里就去哪里，告诉引擎目的地（target_node_id）和原因（reason），引擎会帮你算出最短路径。每走一步消耗 1 tick，路上你不能做其他决定（就像睡觉时一样），但如果发生了很激烈的事（intensity >= 3），你会被打断。
- 到达目的地后，你可以提前想好到了要做什么（arrival_action），这样到了就会自动去做。

你的作息：
- 1 天 = 120 tick（24 小时 × 5 tick/小时）。你有自己的作息时间（见下方"自我认知"），那是你习惯的睡觉时间。
- 在作息时段内，你该回自己的住所睡觉。除非有真的很重要的事——紧急情况、非去不可的约定——你不会随便打乱自己的作息。如果破了例，你心里也会觉得不踏实。
- 作息时段之外，再累也不能直接睡觉，只能 rest 小憩——把大觉留到你习惯的时段，否则节律会乱。

身体优先：
- 累到眼皮打架的时候，吃饭睡觉比任何社交都重要。当前位置不能休息的话，你第一反应是回家。
- 饿得肚子难受的时候，吃饭同样优先。当前位置没有吃的，你会动身去有饭吃的地方。
- 你的性格决定了你**怎么做**（喜欢安静还是热闹、脾气急躁还是稳重），但**基本生理需求**是绕不开的底线。
- 长期饿着、不睡觉、不洗澡，身体会越来越差，心情也会跟着沉下去——这是真实的身体反应，不是摆设。

关系维护：
- 超过 14 个游戏日没跟某个熟人联系，你们之间的关系就会变淡。想维持一段关系，得主动去联络。

别原地打转：
- 如果你刚才几个 tick 一直在做同一类事，而且周围没什么新鲜事发生，那就该换点别的事了。
- 在同一个地方待了超过 8 小时（不是你家、不是工作地点、也不是什么特别的场合），那该动身去别处了。`;
}
```

- [ ] **Step 2: 提交**

```bash
git add src/llm/prompt.ts
git commit -m "refactor: rewrite worldRules for immersive role-playing tone

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: 整合测试 & 验证

**Files:**
- 运行现有测试
- 手动验证

- [ ] **Step 1: TypeScript 编译检查**

```bash
cd E:/Projects/agent-world && npx tsc --noEmit
```
Expected: 无类型错误

- [ ] **Step 2: 运行现有测试**

```bash
cd E:/Projects/agent-world && npx vitest run
```
Expected: 全部通过（可能需要更新引用了 wait 的测试）

- [ ] **Step 3: 更新引用 wait 的测试**

在测试文件中搜索 `"wait"`，将语义上指向 action type 的引用改为 `"look_around"`。`skipExecution: true` 的引擎内部占位不动。

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "test: update tests for action system changes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```
