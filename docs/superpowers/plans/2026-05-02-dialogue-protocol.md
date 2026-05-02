# Dialogue Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `speak` from a single-tick one-shot into a request-accept multi-turn dialogue protocol with accept/reject, turn-by-turn expansion, summary, and salvage.

**Architecture:** New `src/engine/dialog.ts` module handles pairing/accept/expansion/salvage as pure functions with injected LLM callbacks. `tick.ts` delegates phase 4.5 to it. Three new prompt builders in `prompt.ts`, two new lightweight LLM entry points in `decide.ts`, three new ActionType values in `enums.ts`, two optional fields on `WorldEvent`. `execute.ts` `speak` case becomes a guard fallback.

**Tech Stack:** TypeScript, Zod (schemas), Vitest (tests), OpenAI-compatible LLM (existing `decide.ts` pattern).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/domain/enums.ts` | Modify | Add `accept_speak`, `reject_speak`, `leave_dialog` to `ACTION_TYPES` |
| `src/domain/types.ts` | Modify | Add `dialogTranscript`, `dialogEndedBy` to `WorldEvent` |
| `src/domain/schemas.ts` | Modify | Add `AcceptDecisionSchema`, `DialogTurnSchema`, `DialogSummarySchema`, `AcceptToolSchema`, `TurnToolSchema`, `SummaryToolSchema` |
| `src/engine/actions.ts` | Modify | Update `speak` hint text |
| `src/engine/execute.ts` | Modify | `speak` case → guard fallback; remove social_satiety/memory/event generation |
| `src/llm/prompt.ts` | Modify | Update `ACTION_NAMES[speak]`; add 3 builder functions; add `buildSalvagePrompt` |
| `src/llm/decide.ts` | Modify | Add `llmDialogTurn`, `llmDialogSummarize` |
| `src/engine/dialog.ts` | **Create** | `pairSpeakRequests`, `runDialogPhase`, `runOneDialog`, memory/event builders |
| `src/engine/tick.ts` | Modify | Insert phase 4.5 (dialog) between decisions and execute |
| `src/engine/dialog.test.ts` | **Create** | Unit tests for `pairSpeakRequests`, `runOneDialog`, `runDialogPhase` |
| `src/llm/prompt.test.ts` | Modify | Snapshot tests for 3 new builders + updated speak label |
| `src/engine/tick.test.ts` | Modify | Dialog integration tests; update existing speak assertions |
| `src/app/_components/events-pane.tsx` | Modify | Expandable dialog events (collapsed summary / expanded transcript) |

---

### Task 1: Extend ActionType enum and WorldEvent type

**Files:**
- Modify: `src/domain/enums.ts:8-16`
- Modify: `src/domain/types.ts:188-230`

- [ ] **Step 1: Add 3 new action types to enums.ts**

```ts
// src/domain/enums.ts — replace the ACTION_TYPES array

export const ACTION_TYPES = [
  // 默认（只动自己）—— 16 种
  "move", "wait", "observe", "rest", "eat", "read", "work", "use_ability",
  "sleep", "nap", "bathe", "exercise", "meditate", "write", "groom", "pace",
  // 交互（动他人/物体/关系）—— 8 种
  "speak", "interact_object", "interact_person",
  "attack", "flee", "help", "gift",
  "update_relation",
  // 对话协议内部（不在 getAvailableActions 中暴露，仅 dialog 专用 schema 约束产生）
  "accept_speak",
  "reject_speak",
  "leave_dialog",
] as const;
```

- [ ] **Step 2: Add dialogTranscript + dialogEndedBy to WorldEvent in types.ts**

```ts
// src/domain/types.ts — append to WorldEvent interface

export interface WorldEvent {
  // ... 既有字段保持不变 ...
  duration: number;
  suggestedActions?: string[];

  // 新增：对话事件专用（其它 event 不填）
  dialogTranscript?: DialogTurn[];
  dialogEndedBy?: "natural" | "leave" | "hard_limit" | "turn_failure";
}
```

The `DialogTurn` type is defined in dialog.ts and imported via a forward reference. To avoid circular imports, define it in types.ts directly:

```ts
// src/domain/types.ts — add above WorldEvent

/** 对话内单轮快照（仅供 WorldEvent.dialogTranscript 使用） */
export interface DialogTurn {
  speakerId: string;
  kind: "say" | "leave";
  line?: string;
  reasoning?: string;
}
```

- [ ] **Step 3: Run existing tests to catch any type-check failures**

Run: `npx vitest run --reporter=verbose 2>&1 | head -20`
Expected: All existing tests pass (new types are additive, no regressions).

- [ ] **Step 4: Commit**

```bash
git add src/domain/enums.ts src/domain/types.ts
git commit -m "feat(domain): add accept_speak/reject_speak/leave_dialog ActionTypes + dialog fields on WorldEvent"
```

---

### Task 2: Add dialog schemas to domain/schemas.ts

**Files:**
- Modify: `src/domain/schemas.ts` (append after existing ActionToolInputSchema)

- [ ] **Step 1: Add 4 new schemas and tool definitions**

Append to `src/domain/schemas.ts`:

```ts
// ---------------------------------------------------------------------------
// Dialog protocol schemas
// ---------------------------------------------------------------------------

// Accept decision: restricts output to accept_speak | reject_speak
export const AcceptDecisionSchema = z.object({
  action_type: z.enum(["accept_speak", "reject_speak"]),
  target_id: z.string().min(1),
  reasoning: z.string().min(1).max(400),
  self_importance: z.union([
    z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5),
  ]),
});
export type AcceptDecisionPayload = z.infer<typeof AcceptDecisionSchema>;

export const ACCEPT_TOOL_NAME = "submit_accept_decision";
export const AcceptToolSchema = {
  type: "object" as const,
  properties: {
    action_type: { type: "string", enum: ["accept_speak", "reject_speak"] },
    target_id: { type: "string", description: "邀请者的 character id。" },
    reasoning: { type: "string", description: "接受或拒绝的理由（内心独白）。" },
    self_importance: { type: "integer", enum: [1, 2, 3, 4, 5], description: "1-5 自评重要度。" },
  },
  required: ["action_type", "target_id", "reasoning", "self_importance"],
};

// Dialog turn: kind=say|leave
export const DialogTurnSchema = z.object({
  kind: z.enum(["say", "leave"]),
  line: z.string().max(800).optional(),
  reasoning: z.string().max(300).optional(),
});
export type DialogTurnPayload = z.infer<typeof DialogTurnSchema>;

export const DIALOG_TURN_TOOL_NAME = "submit_dialog_turn";
export const DialogTurnToolSchema = {
  type: "object" as const,
  properties: {
    kind: { type: "string", enum: ["say", "leave"], description: "say=说一句话；leave=结束对话离开。" },
    line: { type: "string", description: "说的话（kind=say 时必填）。" },
    reasoning: { type: "string", description: "简短内心独白（可选）。" },
  },
  required: ["kind"],
};

// Dialog summary
export const DialogSummarySchema = z.object({
  summary: z.string().min(1).max(500),
});
export type DialogSummaryPayload = z.infer<typeof DialogSummarySchema>;

export const DIALOG_SUMMARY_TOOL_NAME = "submit_dialog_summary";
export const DialogSummaryToolSchema = {
  type: "object" as const,
  properties: {
    summary: { type: "string", description: "1-2 句话总结这次对话的内容与氛围。" },
  },
  required: ["summary"],
};

// Salvage decision: same as ActionSchema but action_type excludes speak/accept_speak/reject_speak/leave_dialog
const SALVAGE_ACTION_TYPES = ACTION_TYPES.filter(
  (t) => t !== "speak" && t !== "accept_speak" && t !== "reject_speak" && t !== "leave_dialog",
) as [string, ...string[]];

export const SalvageActionSchema = z.object({
  action_type: z.enum(SALVAGE_ACTION_TYPES),
  target_id: z.string().optional(),
  target_node_id: z.string().optional(),
  free_text: z.string().max(500).optional(),
  reasoning: z.string().min(1).max(800),
  emotion_tag: z.string().max(40).optional(),
  self_importance: z.union([
    z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5),
  ]),
});
export type SalvageActionPayload = z.infer<typeof SalvageActionSchema>;

export const SALVAGE_TOOL_NAME = "submit_action";
export const SalvageToolSchema = {
  type: "object" as const,
  properties: {
    action_type: { type: "string", enum: [...SALVAGE_ACTION_TYPES] },
    target_id: { type: "string", description: "目标角色 id，可选。" },
    target_node_id: { type: "string", description: "目标节点 id（仅 move 等位移行动需要）。" },
    free_text: { type: "string", description: "自由文本。" },
    reasoning: { type: "string", description: "内心独白。必须显式引用性格特征文字描述。" },
    emotion_tag: { type: "string", description: "短情绪标签。" },
    self_importance: { type: "integer", enum: [1, 2, 3, 4, 5], description: "1-5 自评重要度。" },
  },
  required: ["action_type", "reasoning", "self_importance"],
};
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No type errors (new exports are additive).

- [ ] **Step 3: Commit**

```bash
git add src/domain/schemas.ts
git commit -m "feat(domain): add dialog schemas — accept, turn, summary, salvage"
```

---

### Task 3: Update actions.ts speak hint

**Files:**
- Modify: `src/engine/actions.ts:230-237`

- [ ] **Step 1: Change speak hint text**

In `src/engine/actions.ts`, replace the speak hint block (lines ~231-237):

```ts
// Replace:
const speakSuffix =
  stayHours >= 4 && companions.length > 0
    ? `（你已在此和他们待 ${stayHours} 小时，话题可能开始重复）`
    : "";
for (const peer of companions) {
  const rel = self.relations[peer.id];
  opts.push({
    type: "speak",
    targetId: peer.id,
    hint: `和 ${peer.name} 说话。${speakSuffix}`,
  });
```

```ts
// With:
const requestSuffix =
  stayHours >= 4 && companions.length > 0
    ? `（你已在此和他们待 ${stayHours} 小时，话题可能开始重复）`
    : "";
for (const peer of companions) {
  const rel = self.relations[peer.id];
  opts.push({
    type: "speak",
    targetId: peer.id,
    hint: `邀请 ${peer.name} 说话（需对方接受；必须给出开场白作为 freeText）。${requestSuffix}`,
  });
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/actions.ts
git commit -m "refactor(actions): update speak hint — invite-with-acceptance semantics"
```

---

### Task 4: Clean up execute.ts speak case

**Files:**
- Modify: `src/engine/execute.ts:420-461`

- [ ] **Step 1: Replace the speak case with a guard fallback**

In `src/engine/execute.ts`, replace the entire `case "speak":` block (lines 420-461):

```ts
      case "speak": {
        // speak 不应到达 execute（dialog 阶段已替换为占位 wait）
        success = false;
        reason = "speak action 未被 dialog 阶段处理——防御性回退";
        events.push(
          makeEvent({
            worldId,
            tick,
            category: "action",
            description: `${actor.name} 欲言又止。`,
            participants: [actor.id],
            scope: "node",
            nodeId: actor.locationId,
            intensity: 1,
          }),
        );
        break;
      }
```

And in the same file, remove the unused `BLOOD_RELATION_KINDS` import that was only used in the old speak path... actually no, it's still used in `update_relation`. So leave imports alone.

- [ ] **Step 2: Verify existing tests still pass**

Run: `npx vitest run src/engine/tick.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: Tests pass (existing speak-related tests may need updating — covered in Task 16).

- [ ] **Step 3: Commit**

```bash
git add src/engine/execute.ts
git commit -m "refactor(execute): speak case → guard fallback; dialog module owns all speak side effects"
```

---

### Task 5: Update main prompt speak label and ACTION_NAMES

**Files:**
- Modify: `src/llm/prompt.ts:406-431` (ACTION_NAMES update)
- Modify: `src/llm/prompt.ts:452-484` (worldRules speak description)

- [ ] **Step 1: Update ACTION_NAMES with new types**

In `src/llm/prompt.ts`, add entries for the 3 new action types in `ACTION_NAMES`:

```ts
const ACTION_NAMES: Record<ActionType, string> = {
  move: "移动",
  wait: "等待",
  observe: "观察",
  rest: "休息",
  eat: "进食",
  read: "阅读",
  work: "工作/学习",
  use_ability: "使用能力",
  sleep: "睡觉",
  nap: "小睡",
  bathe: "洗浴",
  exercise: "运动",
  meditate: "冥想",
  write: "书写",
  groom: "整理仪容",
  pace: "踱步",
  speak: "邀请说话",
  interact_object: "与物互动",
  interact_person: "与人互动",
  attack: "攻击",
  flee: "逃避",
  help: "帮助",
  gift: "馈赠",
  update_relation: "调整关系",
  accept_speak: "接受对话",
  reject_speak: "拒绝对话",
  leave_dialog: "离开对话",
};
```

- [ ] **Step 2: Update worldRules speak description**

In the `worldRules()` function, update the action mechanism description to mention speak is a request:

```ts
// In worldRules() — update the relevant line about speak:
// Before: nothing specific about speak
// After: add in the "可选行动" paragraph or as part of the action mechanism description
```

The `worldRules()` text already says "不要做超出当前可选行动列表的事" — the hint change in actions.ts covers the nuance. The key change is just the `ACTION_NAMES` entry so that `formatActionCounts` shows "邀请说话" instead of "说话".

- [ ] **Step 3: Commit**

```bash
git add src/llm/prompt.ts
git commit -m "refactor(prompt): speak → 邀请说话 label; add dialog-only action names"
```

---

### Task 6: Add dialog prompt builders to prompt.ts

**Files:**
- Modify: `src/llm/prompt.ts` (append before `buildSystemPrompt`)

- [ ] **Step 1: Add buildAcceptDecisionPrompt**

Append to `src/llm/prompt.ts`:

```ts
// ---------------------------------------------------------------------------
// Dialog protocol prompt builders
// ---------------------------------------------------------------------------

import type { DialogTurn } from "@/domain/types";

/**
 * 接受/拒绝决策 prompt。
 * B 看到 A 的开场白（freeText），决定是否接茬。
 * A 的 reasoning 不可见（仅 freeText 暴露给对方）。
 */
export function buildAcceptDecisionPrompt(args: {
  self: Character;
  requesterName: string;
  freeText: string;
  here: MapNode;
  perceived: WorldEvent[];
  companions: Character[];
  tick: number;
  language?: Language;
}): string {
  const { self, requesterName, freeText, here, perceived, companions, tick } = args;
  const language = args.language ?? "zh";
  const t = timeOfDay(tick, self.sleepWindow ?? DEFAULT_SLEEP_WINDOW);
  const fatigue = qualifyVital(self.vitals.fatigue, "fatigue");
  const hunger = qualifyVital(self.vitals.hunger, "hunger");

  const lines: string[] = [];

  lines.push(`${requesterName} 想和你说话："${freeText}"`);
  lines.push("");
  lines.push(`你当前的状态：`);
  lines.push(`- 时间：第 ${t.day} 日 ${String(t.hour).padStart(2, "0")}:00（${t.period}）`);
  lines.push(`- 在 ${here.name}`);
  lines.push(`- 疲惫：${fatigue.phrase}`);
  lines.push(`- 饥饿：${hunger.phrase}`);
  lines.push(`- 心情：${MOOD_WORDS[self.emotion.mood] ?? String(self.emotion.mood)}`);
  lines.push(`- 压力：${STRESS_WORDS[self.emotion.stress] ?? String(self.emotion.stress)}`);
  lines.push(`- 社交满足：${SOCIAL_WORDS[self.emotion.social_satiety] ?? String(self.emotion.social_satiety)}`);
  lines.push("");

  lines.push("你的性格特征：");
  for (const s of describePersonality(self.personality)) {
    lines.push(`- ${s}`);
  }
  lines.push("");

  // B 当前感知（如果有）
  if (perceived.length > 0) {
    lines.push("你刚刚感知到的事件：");
    lines.push(describeEvents(perceived));
    lines.push("");
  }

  // 同节点其他人（如果有）
  if (companions.length > 0) {
    const topPeers = selectTopPeers(self, companions, tick);
    lines.push("同节点其他人：");
    lines.push(describeRelations(self, topPeers, tick));
    lines.push("");
  }

  // B 的主 action 提示（来自 rawActions，由调用方传入）
  lines.push(
    language === "zh"
      ? "决定：你是否要和这个人说话？请调用 submit_accept_decision 工具，输出 accept_speak 或 reject_speak。"
      : language === "en"
        ? "Decide: will you talk to this person? Call submit_accept_decision with accept_speak or reject_speak."
        : "決定：この人と話しますか？submit_accept_decision を呼び出し、accept_speak か reject_speak を返してください。",
  );

  return lines.join("\n");
}

/**
 * 对话单轮 prompt。speaker 基于 transcript 历史输出下一句话或 leave。
 */
export function buildDialogTurnPrompt(args: {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  isSoftLimit: boolean;
  turnCount: number;
  language?: Language;
}): string {
  const { self, peer, transcript, isSoftLimit, turnCount } = args;
  const language = args.language ?? "zh";

  const history = transcript
    .map((t) => {
      const name = t.speakerId === self.id ? self.name : peer.name;
      if (t.kind === "leave") return `${name}：…先离开了。`;
      return `${name}：${t.line ?? ""}`;
    })
    .join("\n");

  const lines: string[] = [];
  lines.push(`你正在和 ${peer.name} 对话。`);
  lines.push("");

  lines.push("你的性格特征：");
  for (const s of describePersonality(self.personality)) {
    lines.push(`- ${s}`);
  }
  lines.push("");

  lines.push("对话记录：");
  lines.push(history);
  lines.push("");

  if (isSoftLimit) {
    if (language === "zh") {
      lines.push(`⚠ 对话已进行 ${turnCount} 句，请考虑自然收尾——最好在 1-2 句内结束这次交谈。`);
    } else if (language === "en") {
      lines.push(`⚠ This conversation has reached ${turnCount} exchanges. Please wrap it up naturally — ideally within 1-2 more turns.`);
    } else {
      lines.push(`⚠ この会話は ${turnCount} 回のやり取りに達しました。自然に締めくくってください——できればあと 1〜2 回で終わらせてください。`);
    }
    lines.push("");
  }

  const sayOrLeave =
    language === "zh"
      ? `现在轮到你说话。请调用 submit_dialog_turn 工具：kind="say" 并填写 line（你说的内容），或 kind="leave" 结束对话离开。`
      : language === "en"
        ? `It's your turn. Call submit_dialog_turn: kind="say" with line (what you say), or kind="leave" to end the conversation and walk away.`
        : `あなたの番です。submit_dialog_turn を呼び出してください：kind="say" で line に発言内容を、または kind="leave" で会話を終了します。`;
  lines.push(sayOrLeave);

  return lines.join("\n");
}

/**
 * 对话摘要 prompt。对话结束后生成 1-2 句摘要。
 */
export function buildDialogSummaryPrompt(args: {
  openerName: string;
  responderName: string;
  transcript: DialogTurn[];
  language?: Language;
}): string {
  const { openerName, responderName, transcript } = args;
  const language = args.language ?? "zh";

  const history = transcript
    .map((t) => {
      const name = t.speakerId === openerName ? openerName : responderName;
      if (t.kind === "leave") return `${name}：…先离开了。`;
      return `${name}：${t.line ?? ""}`;
    })
    .join("\n");

  const instruction =
    language === "zh"
      ? `以下是一段对话的完整记录。请用 1-2 句话总结这次对话的核心内容与氛围。调用 submit_dialog_summary 工具返回你的摘要。\n\n对话：\n${history}`
      : language === "en"
        ? `Below is the transcript of a conversation. Summarize its core content and atmosphere in 1-2 sentences. Call submit_dialog_summary to return your summary.\n\nConversation:\n${history}`
        : `以下は会話の文字起こしです。この会話の核心的な内容と雰囲気を 1〜2 文で要約してください。submit_dialog_summary を呼び出して要約を返してください。\n\n会話：\n${history}`;

  return instruction;
}

/**
 * 补救轮 prompt：被拒/autoFail 后，A 必须选一个非 speak 的行动。
 * 上下文使用主决策的 buildUserPrompt 格式但附加一条"你被拒了"的信息。
 * 实际上补救轮使用标准 buildUserPrompt + 额外 system context 行，
 * 但通过 SalvageActionSchema 限制 action_type 枚举。
 */
export function buildSalvageContext(args: {
  rejectReason: string; // e.g. "乙 拒绝了你的对话请求。" or "乙 已经离开了。"
}): string {
  return `⚠ ${args.rejectReason} 你不能再对任何人发起对话邀请。请选一个其他行动。`;
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/llm/prompt.ts
git commit -m "feat(prompt): add dialog prompt builders — accept, turn, summary, salvage context"
```

---

### Task 7: Add dialog LLM entry points to decide.ts

**Files:**
- Modify: `src/llm/decide.ts` (append after existing `llmDecide`)

- [ ] **Step 1: Add llmDialogTurn and llmDialogSummarize functions**

Append to `src/llm/decide.ts`:

```ts
// ---------------------------------------------------------------------------
// Dialog protocol LLM entry points
// ---------------------------------------------------------------------------

import {
  ACCEPT_TOOL_NAME,
  AcceptDecisionSchema,
  AcceptToolSchema,
  DIALOG_TURN_TOOL_NAME,
  DialogTurnSchema,
  DialogTurnToolSchema,
  DIALOG_SUMMARY_TOOL_NAME,
  DialogSummarySchema,
  DialogSummaryToolSchema,
  SALVAGE_TOOL_NAME,
  SalvageActionSchema,
  SalvageToolSchema,
  type AcceptDecisionPayload,
  type DialogTurnPayload,
  type DialogSummaryPayload,
  type SalvageActionPayload,
} from "@/domain/schemas";
import type { DialogTurn } from "@/domain/types";

export interface DialogTurnInput {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  isSoftLimit: boolean;
  turnCount: number;
}

/**
 * 对话单轮：返回 { kind: "say"|"leave", line?, reasoning? }
 * 失败重试 1 次，仍失败抛异常让调用方截断对话。
 */
export async function llmDialogTurn(input: DialogTurnInput): Promise<DialogTurn> {
  if (!hasApiKey()) throw new Error("没有激活的 LLM provider");

  const client = getLLMClient();
  const language = getLanguage();
  const { buildDialogTurnPrompt } = await import("./prompt");

  const prompt = buildDialogTurnPrompt({
    self: input.self,
    peer: input.peer,
    transcript: input.transcript,
    isSoftLimit: input.isSoftLimit,
    turnCount: input.turnCount,
    language,
  });

  const tool: ChatCompletionTool = {
    type: "function",
    function: {
      name: DIALOG_TURN_TOOL_NAME,
      description: "输出你这一轮说的话，或决定离开对话。",
      parameters: DialogTurnToolSchema,
    },
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: getModelName(),
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content: `你是一个角色扮演引擎中的 NPC。你正在和另一个人对话。请根据你的性格、当前情境和对话历史，自然地回应。`,
          },
          { role: "user", content: prompt },
        ],
        tools: [tool],
      });

      const message = response.choices[0]?.message;
      const toolCall = message?.tool_calls?.find(
        (c) => c.type === "function" && c.function.name === DIALOG_TURN_TOOL_NAME,
      );
      if (!toolCall || toolCall.type !== "function") {
        throw new Error("LLM 没有返回 dialog_turn tool_call");
      }

      const parsed = JSON.parse(toolCall.function.arguments);
      const result = DialogTurnSchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`DialogTurn 参数不符合 schema：${result.error.message}`);
      }

      return {
        speakerId: input.self.id,
        kind: result.data.kind,
        line: result.data.line,
        reasoning: result.data.reasoning,
      };
    } catch (err) {
      lastError = err;
      if (attempt === 0) continue;
    }
  }
  throw lastError;
}

export interface DialogSummaryInput {
  openerName: string;
  responderName: string;
  transcript: DialogTurn[];
}

/**
 * 对话摘要：返回 summary 字符串。
 * 失败重试 1 次，仍失败返回占位摘要。
 */
export async function llmDialogSummarize(input: DialogSummaryInput): Promise<string> {
  if (!hasApiKey()) return `（摘要生成失败：双方聊了 ${input.transcript.length} 句）`;

  const client = getLLMClient();
  const language = getLanguage();
  const { buildDialogSummaryPrompt } = await import("./prompt");

  const prompt = buildDialogSummaryPrompt({
    openerName: input.openerName,
    responderName: input.responderName,
    transcript: input.transcript,
    language,
  });

  const tool: ChatCompletionTool = {
    type: "function",
    function: {
      name: DIALOG_SUMMARY_TOOL_NAME,
      description: "返回对话摘要。",
      parameters: DialogSummaryToolSchema,
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
            content: `你是一个摘要助手。请用 1-2 句话总结以下对话的核心内容与氛围。`,
          },
          { role: "user", content: prompt },
        ],
        tools: [tool],
      });

      const message = response.choices[0]?.message;
      const toolCall = message?.tool_calls?.find(
        (c) => c.type === "function" && c.function.name === DIALOG_SUMMARY_TOOL_NAME,
      );
      if (!toolCall || toolCall.type !== "function") {
        throw new Error("LLM 没有返回 dialog_summary tool_call");
      }

      const parsed = JSON.parse(toolCall.function.arguments);
      const result = DialogSummarySchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`DialogSummary 参数不符合 schema：${result.error.message}`);
      }
      return result.data.summary;
    } catch {
      if (attempt === 0) continue;
    }
  }
  return `（摘要生成失败：双方聊了 ${input.transcript.length} 句）`;
}

/**
 * 接受/拒绝决策：复用 llmDecide 的调用模式但使用 AcceptDecisionSchema。
 * 失败重试 1 次，仍失败返回 reject。
 */
export interface AcceptDecisionInput {
  character: Character;
  requesterName: string;
  requesterId: string;
  freeText: string;
  here: MapNode;
  perceived: WorldEvent[];
  companions: Character[];
  tick: number;
}

export async function llmAcceptDecide(
  input: AcceptDecisionInput,
): Promise<{ type: "accept_speak" | "reject_speak"; targetId: string; reasoning: string; selfImportance: 1 | 2 | 3 | 4 | 5 }> {
  if (!hasApiKey()) {
    return { type: "reject_speak", targetId: input.requesterId, reasoning: "决策失败默认拒绝", selfImportance: 1 };
  }

  const client = getLLMClient();
  const language = getLanguage();
  const { buildAcceptDecisionPrompt } = await import("./prompt");

  const prompt = buildAcceptDecisionPrompt({
    self: input.character,
    requesterName: input.requesterName,
    freeText: input.freeText,
    here: input.here,
    perceived: input.perceived,
    companions: input.companions,
    tick: input.tick,
    language,
  });

  const tool: ChatCompletionTool = {
    type: "function",
    function: {
      name: ACCEPT_TOOL_NAME,
      description: "决定是否接受对方的对话邀请。",
      parameters: AcceptToolSchema,
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
            content: `你是一个角色扮演引擎中的 NPC。${input.character.name} 正在决定是否接受 ${input.requesterName} 的对话邀请。根据你的性格、当前状态和情境，做出自然的决定。`,
          },
          { role: "user", content: prompt },
        ],
        tools: [tool],
      });

      const message = response.choices[0]?.message;
      const toolCall = message?.tool_calls?.find(
        (c) => c.type === "function" && c.function.name === ACCEPT_TOOL_NAME,
      );
      if (!toolCall || toolCall.type !== "function") {
        throw new Error("LLM 没有返回 accept_decision tool_call");
      }

      const parsed = JSON.parse(toolCall.function.arguments);
      const result = AcceptDecisionSchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`AcceptDecision 参数不符合 schema：${result.error.message}`);
      }
      // Validate type field
      if (result.data.action_type !== "accept_speak" && result.data.action_type !== "reject_speak") {
        throw new Error(`非法 action_type：${result.data.action_type}`);
      }
      return {
        type: result.data.action_type,
        targetId: result.data.target_id,
        reasoning: result.data.reasoning,
        selfImportance: result.data.self_importance,
      };
    } catch {
      if (attempt === 0) continue;
    }
  }
  return { type: "reject_speak", targetId: input.requesterId, reasoning: "决策失败默认拒绝", selfImportance: 1 };
}

/**
 * 补救轮决策：使用 SalvageActionSchema（排除 speak 族）。
 * 违规（仍输出 speak）→ 重试 1 次 → 仍违规抛异常让调用方 fallback wait。
 */
export async function llmSalvageDecide(input: DecideInput & { rejectReason: string }): Promise<Action> {
  if (!hasApiKey()) return {
    type: "wait",
    actorId: input.character.id,
    reasoning: `补救决策失败（无 provider）：${input.rejectReason}`,
    selfImportance: 1,
  };

  const client = getLLMClient();
  const language = getLanguage();
  const { buildSystemPrompt, buildUserPrompt, buildSalvageContext } = await import("./prompt");

  const system = buildSystemPrompt({
    character: input.character,
    worldName: input.worldName,
    nodes: input.nodes,
    language,
  });
  const user = buildUserPrompt({
    character: input.character,
    here: input.here,
    companions: input.companions,
    perceived: input.perceived,
    options: input.options.filter(o => o.type !== "speak"),  // strip speak from options
    tick: input.tick,
    facts: input.facts,
    language,
  });
  const salvageCtx = buildSalvageContext({ rejectReason: input.rejectReason });

  const tool: ChatCompletionTool = {
    type: "function",
    function: {
      name: SALVAGE_TOOL_NAME,
      description: "提交你这一 tick 的行动（禁止 speak/accept_speak/reject_speak/leave_dialog）。",
      parameters: SalvageToolSchema,
    },
  };

  let lastAction: Action | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: getModelName(),
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user + "\n\n" + salvageCtx },
        ],
        tools: [tool],
      });

      const message = response.choices[0]?.message;
      const toolCall = message?.tool_calls?.find(
        (c) => c.type === "function" && c.function.name === SALVAGE_TOOL_NAME,
      );
      if (!toolCall || toolCall.type !== "function") {
        throw new Error("LLM 没有返回 salvage tool_call");
      }

      const parsed = JSON.parse(toolCall.function.arguments);
      const result = SalvageActionSchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`SalvageAction 参数不符合 schema：${result.error.message}`);
      }
      const action = payloadToAction({
        action_type: result.data.action_type,
        target_id: result.data.target_id,
        target_node_id: result.data.target_node_id,
        free_text: result.data.free_text,
        reasoning: result.data.reasoning,
        emotion_tag: result.data.emotion_tag,
        self_importance: result.data.self_importance,
      }, input.character.id);

      // Double-check: no speak family
      if (action.type === "speak" || action.type === "accept_speak" || action.type === "reject_speak" || action.type === "leave_dialog") {
        throw new Error(`补救轮违规：LLM 输出 ${action.type}`);
      }
      return action;
    } catch (err) {
      if (attempt === 0) continue;
      lastAction = {
        type: "wait",
        actorId: input.character.id,
        reasoning: `补救决策违规，回退等待：${err instanceof Error ? err.message : String(err)}`,
        selfImportance: 1,
      };
    }
  }
  return lastAction!;
}
```

- [ ] **Step 2: Add missing imports at top of decide.ts**

Add Character, MapNode, WorldEvent to the imports from `@/domain/types`:

```ts
// Update existing import line:
import type { Action, Character, MapNode, WorldEvent } from "@/domain/types";
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No type errors (new imports are resolvable, new functions reference existing types).

- [ ] **Step 4: Commit**

```bash
git add src/llm/decide.ts
git commit -m "feat(decide): add dialog LLM entry points — turn, summary, accept, salvage"
```

---

### Task 8: Create dialog.ts — types, pairSpeakRequests, memory helpers

**Files:**
- Create: `src/engine/dialog.ts`

- [ ] **Step 1: Create the file with types and pairSpeakRequests**

```ts
/**
 * 对话协议模块。
 *
 * 职责：
 *   - 配对 speak 请求（mutual / pending / autoFail）
 *   - 接受/拒绝决策编排
 *   - 对话展开（5 来回 + 摘要）
 *   - 补救轮编排
 *
 * 无 IO 依赖：所有 LLM 调用通过注入的 decide 函数完成，测试时全部 mock。
 */
import { randomUUID } from "node:crypto";
import type { Action, Character, MapNode, Memory, WorldEvent } from "@/domain/types";
import type { DialogTurn } from "@/domain/types";

// ---------------------------------------------------------------------------
// Types (exported for testing)
// ---------------------------------------------------------------------------

export interface SpeakPairing {
  mutualPairs: Array<{ a: string; b: string; aFreeText: string; bFreeText: string }>;
  pendingAcceptances: Array<{ requester: string; target: string; freeText: string }>;
  autoFails: Array<{
    requester: string;
    target: string;
    reason: "target_left" | "target_sleeping" | "cross_node" | "invalid_request";
  }>;
}

export interface DialogOutcome {
  participants: [string, string];
  transcript: DialogTurn[];
  summary: string;
  endedBy: "natural" | "leave" | "hard_limit" | "turn_failure";
  endedByCharacterId?: string;
}

export interface DialogOutcomeInternal {
  outcome: DialogOutcome;
  requesterId: string;
  responderId: string;
}

interface MemoryWrite {
  characterId: string;
  memory: Memory;
}

interface DialogPhaseResult {
  finalActions: Action[];
  dialogEvents: WorldEvent[];
  memoryWrites: MemoryWrite[];
}

// ---------------------------------------------------------------------------
// Decide function signatures (injected by tick.ts)
// ---------------------------------------------------------------------------

export interface AcceptDecideResult {
  type: "accept_speak" | "reject_speak";
  targetId: string;
  reasoning: string;
  selfImportance: 1 | 2 | 3 | 4 | 5;
}

export type AcceptDecideFn = (input: {
  character: Character;
  requesterName: string;
  requesterId: string;
  freeText: string;
  here: MapNode;
  perceived: WorldEvent[];
  companions: Character[];
  tick: number;
}) => Promise<AcceptDecideResult>;

export type TurnDecideFn = (input: {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  isSoftLimit: boolean;
  turnCount: number;
}) => Promise<DialogTurn>;

export type SummaryDecideFn = (input: {
  openerName: string;
  responderName: string;
  transcript: DialogTurn[];
}) => Promise<string>;

export type SalvageDecideFn = (input: {
  character: Character;
  tick: number;
  rejectReason: string;
}) => Promise<Action>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHORT_MEMORY_LIMIT = 50;

function makeMemory(characterId: string, tick: number, importance: number, content: string): MemoryWrite {
  return {
    characterId,
    memory: {
      id: `mem-${randomUUID().slice(0, 8)}`,
      tick,
      importance: importance as Memory["importance"],
      content,
    },
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ---------------------------------------------------------------------------
// pairSpeakRequests
// ---------------------------------------------------------------------------

/**
 * 纯函数：从 rawActions 中提取 speak 请求，分类为 mutual / pending / autoFail。
 */
export function pairSpeakRequests(
  rawActions: Action[],
  characters: Character[],
): SpeakPairing {
  const speakActions = rawActions.filter((a) => a.type === "speak");
  const charById = new Map(characters.map((c) => [c.id, c]));

  const mutualPairs: SpeakPairing["mutualPairs"] = [];
  const pendingAcceptances: SpeakPairing["pendingAcceptances"] = [];
  const autoFails: SpeakPairing["autoFails"] = [];
  const consumed = new Set<string>();

  // 1. Identify mutual pairs (A↔B)
  for (const a of speakActions) {
    if (consumed.has(a.actorId)) continue;
    if (!a.targetId) continue;
    const peer = speakActions.find(
      (b) => b.actorId === a.targetId && b.targetId === a.actorId && !consumed.has(b.actorId),
    );
    if (peer) {
      const aChar = charById.get(a.actorId)!;
      const bChar = charById.get(peer.actorId)!;
      if (aChar.locationId === bChar.locationId) {
        mutualPairs.push({
          a: a.actorId, b: peer.actorId,
          aFreeText: a.freeText ?? "",
          bFreeText: peer.freeText ?? "",
        });
        consumed.add(a.actorId);
        consumed.add(peer.actorId);
      }
      // If cross-node, they fall through to the autoFails check below
    }
  }

  // 2. Non-mutual speak → validate and classify
  for (const a of speakActions) {
    if (consumed.has(a.actorId)) continue;
    const target = a.targetId ? charById.get(a.targetId) : null;
    const actor = charById.get(a.actorId)!;

    if (!target || target.id === actor.id) {
      autoFails.push({ requester: a.actorId, target: a.targetId ?? "", reason: "invalid_request" });
      continue;
    }
    if (!a.freeText || a.freeText.trim() === "") {
      autoFails.push({ requester: a.actorId, target: target.id, reason: "invalid_request" });
      continue;
    }
    if (target.locationId !== actor.locationId) {
      autoFails.push({ requester: a.actorId, target: target.id, reason: "cross_node" });
      continue;
    }
    if (target.currentAction?.type === "sleep") {
      autoFails.push({ requester: a.actorId, target: target.id, reason: "target_sleeping" });
      continue;
    }
    pendingAcceptances.push({
      requester: a.actorId,
      target: target.id,
      freeText: a.freeText,
    });
  }

  return { mutualPairs, pendingAcceptances, autoFails };
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors (new file resolves all imports).

- [ ] **Step 3: Commit**

```bash
git add src/engine/dialog.ts
git commit -m "feat(dialog): create module — types, pairSpeakRequests, helpers"
```

---

### Task 9: Add runOneDialog and runDialogPhase to dialog.ts

**Files:**
- Modify: `src/engine/dialog.ts` (append after `pairSpeakRequests`)

- [ ] **Step 1: Add runOneDialog**

Append to `src/engine/dialog.ts`:

```ts
// ---------------------------------------------------------------------------
// runOneDialog — per-group dialog expansion
// ---------------------------------------------------------------------------

const HARD_LIMIT = 12;
const SOFT_LIMIT = 8;

async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === 0) continue;
    }
  }
  throw lastError;
}

async function runOneDialog(
  openerId: string,
  responderId: string,
  openingLine: string,
  chars: Map<string, Character>,
  turnDecide: TurnDecideFn,
  summaryDecide: SummaryDecideFn,
): Promise<DialogOutcomeInternal> {
  const opener = chars.get(openerId)!;
  const responder = chars.get(responderId)!;

  const transcript: DialogTurn[] = [
    { speakerId: openerId, kind: "say", line: openingLine },
  ];

  const summarizeOrFallback = async (
    endedBy: DialogOutcome["endedBy"],
    endedByCharacterId?: string,
  ): Promise<DialogOutcomeInternal> => {
    let summary: string;
    try {
      summary = await retryOnce(() =>
        summaryDecide({
          openerName: opener.name,
          responderName: responder.name,
          transcript,
        }),
      );
    } catch {
      summary = `（摘要生成失败：双方聊了 ${transcript.length} 句）`;
    }
    return {
      outcome: {
        participants: [openerId, responderId],
        transcript,
        summary,
        endedBy,
        endedByCharacterId,
      },
      requesterId: openerId,
      responderId: responderId,
    };
  };

  while (transcript.length < HARD_LIMIT) {
    const lastSpeakerId = transcript[transcript.length - 1].speakerId;
    const nextSpeakerId = lastSpeakerId === openerId ? responderId : openerId;
    const nextSpeaker = chars.get(nextSpeakerId)!;
    const peer = lastSpeakerId === openerId ? opener : responder;
    const isSoftLimit = transcript.length >= SOFT_LIMIT;

    let turn: DialogTurn;
    try {
      turn = await retryOnce(() =>
        turnDecide({
          self: nextSpeaker,
          peer,
          transcript,
          isSoftLimit,
          turnCount: transcript.length,
        }),
      );
    } catch {
      return summarizeOrFallback("turn_failure");
    }

    if (turn.kind === "leave" || (turn.kind === "say" && (!turn.line || !turn.line.trim()))) {
      transcript.push({ speakerId: nextSpeakerId, kind: "leave" });
      return summarizeOrFallback("leave", nextSpeakerId);
    }
    transcript.push(turn);
  }

  return summarizeOrFallback(
    transcript.length >= HARD_LIMIT ? "hard_limit" : "natural",
  );
}
```

- [ ] **Step 2: Add runDialogPhase**

Append after `runOneDialog`:

```ts
// ---------------------------------------------------------------------------
// runDialogPhase — main entry point
// ---------------------------------------------------------------------------

export interface RunDialogPhaseInput {
  rawActions: Action[];
  characters: Character[];
  nodes: MapNode[];
  perceptions: Map<string, WorldEvent[]>;
  tick: number;
  worldName: string;
  acceptDecide: AcceptDecideFn;
  turnDecide: TurnDecideFn;
  summaryDecide: SummaryDecideFn;
  salvageDecide: SalvageDecideFn;
}

export async function runDialogPhase(
  input: RunDialogPhaseInput,
): Promise<DialogPhaseResult> {
  const { rawActions, characters, nodes, perceptions, tick, worldName } = input;
  const charById = new Map(characters.map((c) => [c.id, c]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const pairing = pairSpeakRequests(rawActions, characters);
  const memoryWrites: MemoryWrite[] = [];
  const dialogEvents: WorldEvent[] = [];
  const finalActionsMap = new Map<string, Action>(); // characterId → final action

  // Track which actors were consumed by dialog (their rawAction gets replaced)
  const consumedActorIds = new Set<string>();

  // Collect salvage list (will run in parallel with dialog expansion)
  const salvageTasks: Array<() => Promise<{ actorId: string; action: Action }>> = [];

  // ── Process autoFails ──
  for (const af of pairing.autoFails) {
    consumedActorIds.add(af.requester);
    const char = charById.get(af.requester)!;
    let reason: string;
    if (af.reason === "target_sleeping") reason = `想找对方说话但她在睡觉`;
    else if (af.reason === "cross_node") reason = `想找对方说话但她不在这里`;
    else if (af.reason === "target_left") reason = `想找对方说话但她已经走了`;
    else reason = `想开口又咽了回去`;

    memoryWrites.push(makeMemory(af.requester, tick, 1, reason));

    salvageTasks.push(() =>
      input.salvageDecide({
        character: char,
        tick,
        rejectReason: reason,
      }).then((action) => ({ actorId: af.requester, action })),
    );
  }

  // ── Process pending acceptances (parallel) ──
  const acceptResults = await Promise.all(
    pairing.pendingAcceptances.map(async (pa) => {
      const target = charById.get(pa.target)!;
      const requester = charById.get(pa.requester)!;
      const here = nodeById.get(target.locationId)!;
      const companions = characters.filter(
        (c) => c.id !== target.id && c.locationId === target.locationId,
      );
      const perceived = perceptions.get(target.id) ?? [];

      let result: AcceptDecideResult;
      try {
        result = await input.acceptDecide({
          character: target,
          requesterName: requester.name,
          requesterId: pa.requester,
          freeText: pa.freeText,
          here,
          perceived,
          companions,
          tick,
        });
      } catch {
        result = { type: "reject_speak", targetId: pa.requester, reasoning: "决策失败默认拒绝", selfImportance: 1 };
      }

      // Validate type
      if (result.type !== "accept_speak" && result.type !== "reject_speak") {
        result = { type: "reject_speak", targetId: pa.requester, reasoning: "决策输出非法 type", selfImportance: 1 };
      }

      return { pa, result };
    }),
  );

  // ── Split accepted vs rejected ──
  const acceptedDialogGroups: Array<{ requesterId: string; responderId: string; openingLine: string }> = [];
  for (const { pa, result } of acceptResults) {
    consumedActorIds.add(pa.requester);

    if (result.type === "accept_speak") {
      acceptedDialogGroups.push({
        requesterId: pa.requester,
        responderId: pa.target,
        openingLine: pa.freeText,
      });
    } else {
      // Rejected
      const requester = charById.get(pa.requester)!;
      const targetName = charById.get(pa.target)!.name;
      memoryWrites.push(makeMemory(pa.requester, tick, 2, `我邀请 ${targetName} 说话被拒了`));
      memoryWrites.push(makeMemory(pa.target, tick, 1, `我拒绝了 ${requester.name} 的搭话邀请`));

      salvageTasks.push(() =>
        input.salvageDecide({
          character: requester,
          tick,
          rejectReason: `${targetName} 拒绝了你的对话请求。`,
        }).then((action) => ({ actorId: pa.requester, action })),
      );
    }
  }

  // ── Process mutual pairs → auto-accepted dialog groups ──
  for (const mp of pairing.mutualPairs) {
    consumedActorIds.add(mp.a);
    consumedActorIds.add(mp.b);

    // Random opener
    const openerFirst = Math.random() < 0.5;
    acceptedDialogGroups.push({
      requesterId: openerFirst ? mp.a : mp.b,
      responderId: openerFirst ? mp.b : mp.a,
      openingLine: openerFirst ? mp.aFreeText : mp.bFreeText,
    });
  }

  // ── Expand dialogs (parallel per-group) + salvages (parallel) ──
  const [dialogOutcomes, salvageResults] = await Promise.all([
    Promise.all(
      acceptedDialogGroups.map((dg) =>
        runOneDialog(
          dg.requesterId,
          dg.responderId,
          dg.openingLine,
          charById,
          input.turnDecide,
          input.summaryDecide,
        ),
      ),
    ),
    Promise.all(salvageTasks.map((t) => t())),
  ]);

  // ── Build dialog events + memories for accepted dialogs ──
  for (const dio of dialogOutcomes) {
    const o = dio.outcome;
    const opener = charById.get(dio.requesterId)!;
    const responder = charById.get(dio.responderId)!;
    const maxImportance = clamp(
      Math.max(
        rawActions.find((a) => a.actorId === dio.requesterId)?.selfImportance ?? 2,
        rawActions.find((a) => a.actorId === dio.responderId)?.selfImportance ?? 2,
      ),
      2,
      4,
    );

    memoryWrites.push(makeMemory(dio.requesterId, tick, maxImportance, `和 ${responder.name} 聊了：${o.summary}`));
    memoryWrites.push(makeMemory(dio.responderId, tick, maxImportance, `和 ${opener.name} 聊了：${o.summary}`));

    dialogEvents.push({
      id: `evt-${randomUUID().slice(0, 8)}`,
      worldId: opener.worldId,
      tick,
      category: "social",
      description: o.summary,
      participants: [dio.requesterId, dio.responderId],
      source: "actor",
      intensity: 2,
      scope: "node",
      nodeId: opener.locationId,
      duration: 1,
      dialogTranscript: o.transcript,
      dialogEndedBy: o.endedBy,
    });
  }

  // ── Assign finalActions ──
  // Consumed actors in successful dialog → wait placeholder
  for (const dio of dialogOutcomes) {
    finalActionsMap.set(dio.requesterId, {
      type: "wait",
      actorId: dio.requesterId,
      reasoning: `刚和 ${charById.get(dio.responderId)!.name} 聊完`,
      selfImportance: 2,
    });
    finalActionsMap.set(dio.responderId, {
      type: "wait",
      actorId: dio.responderId,
      reasoning: `刚和 ${charById.get(dio.requesterId)!.name} 聊完`,
      selfImportance: 2,
    });
  }

  // Salvaged actors → their salvage action
  for (const sr of salvageResults) {
    finalActionsMap.set(sr.actorId, sr.action);
  }

  // Non-speak actors → keep their original action
  for (const a of rawActions) {
    if (!finalActionsMap.has(a.actorId)) {
      finalActionsMap.set(a.actorId, a);
    }
  }

  const finalActions = characters.map((c) => finalActionsMap.get(c.id)!);

  return { finalActions, dialogEvents, memoryWrites };
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/engine/dialog.ts
git commit -m "feat(dialog): add runOneDialog + runDialogPhase — full dialog protocol"
```

---

### Task 10: Integrate dialog phase into tick.ts

**Files:**
- Modify: `src/engine/tick.ts:386-420` (around the Promise.allSettled → execute transition)
- Modify: `src/engine/tick.ts:1-19` (new imports)

- [ ] **Step 1: Add imports to tick.ts**

```ts
// Add to existing imports in tick.ts:
import { runDialogPhase, type DialogPhaseResult } from "./dialog";
import type { AcceptDecideFn, TurnDecideFn, SummaryDecideFn, SalvageDecideFn } from "./dialog";
import { llmAcceptDecide, llmDialogTurn, llmDialogSummarize, llmSalvageDecide } from "@/llm/decide";
```

- [ ] **Step 2: Insert dialog phase between decision collection and execute**

In the main `tick` function, after the `for (const result of settled)` block that finalizes character locations and populates `actionsForExecution`, and before the `executeActions` call, insert:

```ts
  // ... (existing code: for result of settled → actionsForExecution.push + c.locationId = finalLocationId)

  // ── Phase 4.5: Dialog protocol ──
  const dialogResult = await runDialogPhase({
    rawActions: actionsForExecution,
    characters,
    nodes,
    perceptions,
    tick: fromTick,
    worldName: world.name,
    acceptDecide: (input) => llmAcceptDecide(input),
    turnDecide: (input) => llmDialogTurn(input),
    summaryDecide: (input) => llmDialogSummarize(input),
    salvageDecide: async (input) => {
      // Build full decision context for salvage
      const ctx = buildActionContext(
        input.character,
        nodes,
        characters,
        new Map(characters.map((c) => [c.id, c.locationId])),
      );
      const recentThoughts = loadRecentThoughts(worldId, input.character.id, sinceTick);
      const homeNodeId = homeMap.get(input.character.id) ?? null;
      const sleepWindow = sleepWindowMap.get(input.character.id) ?? DEFAULT_SLEEP_WINDOW;
      const isSleepHour = inSleepWindow(baseTime.hour, sleepWindow);
      const facts = deriveAggregatedFacts({
        character: input.character,
        nodes,
        currentTick: fromTick,
        recentThoughts,
        homeNodeId,
      });
      const opts = getAvailableActions(ctx, { facts, isSleepHour });

      try {
        return await llmSalvageDecide({
          character: { ...input.character, sleepWindow, homeNodeId },
          nodes,
          here: ctx.here,
          companions: ctx.companions,
          reachable: ctx.reachable,
          perceived: perceptions.get(input.character.id) ?? [],
          options: opts,
          worldName: world.name,
          tick: fromTick,
          facts,
          rejectReason: input.rejectReason,
        });
      } catch {
        return {
          type: "wait" as const,
          actorId: input.character.id,
          reasoning: `补救决策违规，回退等待：${input.rejectReason}`,
          selfImportance: 1,
        };
      }
    },
  });

  // Apply dialog results
  for (const mw of dialogResult.memoryWrites) {
    const c = characters.find((ch) => ch.id === mw.characterId);
    if (c) {
      c.shortMemory.push(mw.memory);
      if (c.shortMemory.length > 50) {
        c.shortMemory.splice(0, c.shortMemory.length - 50);
      }
    }
  }
  allEvents.push(...dialogResult.dialogEvents);
  // Replace actionsForExecution with dialog-adjusted actions
  // (execute will iterate over finalActions which already has 1:1 mapping to characters)
  actionsForExecution.length = 0;
  actionsForExecution.push(...dialogResult.finalActions);

  // Re-sync allDecisions to match finalActions (for onCharacterDecision callbacks)
  for (let i = 0; i < dialogResult.finalActions.length; i++) {
    const fa = dialogResult.finalActions[i];
    const existing = allDecisions.find((d) => d.characterId === fa.actorId);
    if (existing) {
      existing.action = fa;
    }
  }

  // ── End Phase 4.5 ──

  // 7. 执行（move 已在 free-move 循环里处理…）
  const execResult = executeActions({
```

- [ ] **Step 2: Run TypeScript check and existing tests**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Then: `npx vitest run src/engine/tick.test.ts --reporter=verbose 2>&1 | tail -20`
Expected: TypeScript clean; existing tick tests may need updates (covered in Task 16).

- [ ] **Step 3: Commit**

```bash
git add src/engine/tick.ts
git commit -m "feat(tick): integrate dialog phase (4.5) between decisions and execute"
```

---

### Task 11: Add dialog.test.ts — pairSpeakRequests tests

**Files:**
- Create: `src/engine/dialog.test.ts`

- [ ] **Step 1: Write pairSpeakRequests test suite**

```ts
/**
 * dialog.ts 单元测试。
 * pairSpeakRequests 是纯函数，无 LLM 依赖。
 */
import { describe, expect, it } from "vitest";
import { pairSpeakRequests } from "./dialog";
import type { Action, Character } from "@/domain/types";

function makeChar(id: string, loc: string, currentActionType?: string): Character {
  return {
    id,
    worldId: "w",
    name: id.toUpperCase(),
    locationId: loc,
    personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
    vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
    emotion: { mood: 0, stress: 0, social_satiety: 0 },
    abilities: [],
    shortMemory: [],
    longMemory: [],
    relations: {},
    currentAction: currentActionType
      ? { type: currentActionType as any, startedAt: 0, endsAt: 10, description: "", interruptThreshold: 3 }
      : undefined,
  };
}

function speakAction(actorId: string, targetId: string, freeText?: string): Action {
  return {
    type: "speak",
    actorId,
    targetId,
    freeText,
    reasoning: "想聊聊",
    selfImportance: 2,
  };
}

function readAction(actorId: string): Action {
  return { type: "read", actorId, reasoning: "读书", selfImportance: 1 };
}

describe("pairSpeakRequests", () => {
  it("mutual pair — A↔B same node", () => {
    const chars = [makeChar("a", "n1"), makeChar("b", "n1")];
    const actions = [speakAction("a", "b", "嗨"), speakAction("b", "a", "你好")];
    const r = pairSpeakRequests(actions, chars);
    expect(r.mutualPairs).toHaveLength(1);
    expect(r.mutualPairs[0]).toMatchObject({ a: "a", b: "b" });
    expect(r.pendingAcceptances).toHaveLength(0);
    expect(r.autoFails).toHaveLength(0);
  });

  it("mutual pair cross-node → autoFails individually", () => {
    const chars = [makeChar("a", "n1"), makeChar("b", "n2")];
    const actions = [speakAction("a", "b", "嗨"), speakAction("b", "a", "你好")];
    const r = pairSpeakRequests(actions, chars);
    expect(r.mutualPairs).toHaveLength(0);
    expect(r.autoFails).toHaveLength(2);
    expect(r.autoFails.every((af) => af.reason === "cross_node")).toBe(true);
  });

  it("one-way speak with non-speak target", () => {
    const chars = [makeChar("a", "n1"), makeChar("b", "n1")];
    const actions = [speakAction("a", "b", "有空吗"), readAction("b")];
    const r = pairSpeakRequests(actions, chars);
    expect(r.pendingAcceptances).toHaveLength(1);
    expect(r.pendingAcceptances[0]).toMatchObject({ requester: "a", target: "b" });
  });

  it("multiple requesters to same target", () => {
    const chars = [makeChar("a", "n1"), makeChar("b", "n1"), makeChar("d", "n1")];
    const actions = [speakAction("a", "b", "hi"), speakAction("d", "b", "hey"), readAction("b")];
    const r = pairSpeakRequests(actions, chars);
    expect(r.pendingAcceptances).toHaveLength(2);
  });

  it("offset triangle A→B, B→C", () => {
    const chars = [makeChar("a", "n1"), makeChar("b", "n1"), makeChar("c", "n1")];
    const actions = [speakAction("a", "b", "hi"), speakAction("b", "c", "hey"), readAction("c")];
    const r = pairSpeakRequests(actions, chars);
    expect(r.mutualPairs).toHaveLength(0);
    expect(r.pendingAcceptances).toHaveLength(2);
  });

  it("cross-node → autoFail", () => {
    const chars = [makeChar("a", "n1"), makeChar("b", "n2")];
    const actions = [speakAction("a", "b", "hi")];
    const r = pairSpeakRequests(actions, chars);
    expect(r.autoFails).toHaveLength(1);
    expect(r.autoFails[0].reason).toBe("cross_node");
  });

  it("target in sleep → autoFail", () => {
    const chars = [makeChar("a", "n1"), makeChar("b", "n1", "sleep")];
    const actions = [speakAction("a", "b", "醒了吗")];
    const r = pairSpeakRequests(actions, chars);
    expect(r.autoFails).toHaveLength(1);
    expect(r.autoFails[0].reason).toBe("target_sleeping");
  });

  it("target in nap → NOT autoFail", () => {
    const chars = [makeChar("a", "n1"), makeChar("b", "n1", "nap")];
    const actions = [speakAction("a", "b", "打扰一下")];
    const r = pairSpeakRequests(actions, chars);
    expect(r.autoFails).toHaveLength(0);
    expect(r.pendingAcceptances).toHaveLength(1);
  });

  it("target doesn't exist → autoFail invalid_request", () => {
    const chars = [makeChar("a", "n1")];
    const actions = [speakAction("a", "ghost", "在吗")];
    const r = pairSpeakRequests(actions, chars);
    expect(r.autoFails).toHaveLength(1);
    expect(r.autoFails[0].reason).toBe("invalid_request");
  });

  it("target=self → autoFail invalid_request", () => {
    const chars = [makeChar("a", "n1")];
    const actions = [speakAction("a", "a", "自言自语")];
    const r = pairSpeakRequests(actions, chars);
    expect(r.autoFails).toHaveLength(1);
    expect(r.autoFails[0].reason).toBe("invalid_request");
  });

  it("freeText missing/blank → autoFail invalid_request", () => {
    const chars = [makeChar("a", "n1"), makeChar("b", "n1")];
    const r1 = pairSpeakRequests([speakAction("a", "b", "")], chars);
    expect(r1.autoFails).toHaveLength(1);
    expect(r1.autoFails[0].reason).toBe("invalid_request");

    const r2 = pairSpeakRequests([{ ...speakAction("a", "b"), freeText: undefined }], chars);
    expect(r2.autoFails).toHaveLength(1);
    expect(r2.autoFails[0].reason).toBe("invalid_request");

    const r3 = pairSpeakRequests([speakAction("a", "b", "   ")], chars);
    expect(r3.autoFails).toHaveLength(1);
    expect(r3.autoFails[0].reason).toBe("invalid_request");
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/engine/dialog.test.ts --reporter=verbose 2>&1 | tail -30`
Expected: All 11 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/engine/dialog.test.ts
git commit -m "test(dialog): pairSpeakRequests — 11 pure-function test cases"
```

---

---

### Task 12: Add runDialogPhase integration tests to dialog.test.ts

**Files:**
- Modify: `src/engine/dialog.test.ts` (append after pairSpeakRequests tests)

- [ ] **Step 1: Add runDialogPhase integration tests**

```ts
import { runDialogPhase } from "./dialog";
import type { AcceptDecideFn, TurnDecideFn, SummaryDecideFn, SalvageDecideFn } from "./dialog";
import type { DialogTurn, WorldEvent } from "@/domain/types";

function makeCharFull(id: string, name: string, loc: string, currentActionType?: string): Character {
  return {
    id, worldId: "w", name, locationId: loc,
    personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
    vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
    emotion: { mood: 0, stress: 0, social_satiety: 0 },
    abilities: [], shortMemory: [], longMemory: [], relations: {},
    currentAction: currentActionType
      ? { type: currentActionType as any, startedAt: 0, endsAt: 10, description: "", interruptThreshold: 3 }
      : undefined,
  };
}

function mockTurn(sayLine: string): TurnDecideFn {
  return async ({ self }) => ({
    speakerId: self.id,
    kind: "say",
    line: sayLine,
  });
}

function mockAccept(result: "accept_speak" | "reject_speak"): AcceptDecideFn {
  return async ({ requesterId }) => ({
    type: result,
    targetId: requesterId,
    reasoning: result === "accept_speak" ? "好啊" : "不想聊",
    selfImportance: 2,
  });
}

function mockSummary(text: string): SummaryDecideFn {
  return async () => text;
}

function mockSalvage(actionType: string = "observe"): SalvageDecideFn {
  return async ({ character }) => ({
    type: actionType as any,
    actorId: character.id,
    reasoning: "被拒了，做点别的吧",
    selfImportance: 2,
  });
}

const emptyPerceptions = new Map<string, WorldEvent[]>();
const baseNode: MapNode = {
  id: "n1", worldId: "w", parentId: null, name: "广场",
  description: "", tags: ["public"], capacity: null, privacy: "public",
  visibleFromParent: true, shortcuts: [], isEntry: false,
};

describe("runDialogPhase", () => {
  it("mutual pair + one-way accepted → 2 dialog events, 4 wait placeholders", async () => {
    const a = makeCharFull("a", "甲", "n1");
    const b = makeCharFull("b", "乙", "n1");
    const c = makeCharFull("c", "丙", "n1");
    const d = makeCharFull("d", "丁", "n1");

    const rawActions: Action[] = [
      { type: "speak", actorId: "a", targetId: "b", freeText: "嗨", reasoning: "想和乙说话", selfImportance: 2 },
      { type: "speak", actorId: "b", targetId: "a", freeText: "你好", reasoning: "也想和甲说话", selfImportance: 3 },
      { type: "speak", actorId: "c", targetId: "d", freeText: "有空吗", reasoning: "想和丁聊聊", selfImportance: 2 },
      { type: "read", actorId: "d", reasoning: "读书", selfImportance: 1 },
    ];

    const result = await runDialogPhase({
      rawActions,
      characters: [a, b, c, d],
      nodes: [baseNode],
      perceptions: emptyPerceptions,
      tick: 5,
      worldName: "测试",
      acceptDecide: mockAccept("accept_speak"),
      turnDecide: mockTurn("嗯嗯"),
      summaryDecide: mockSummary("一段愉快的闲聊"),
      salvageDecide: mockSalvage("observe"),
    });

    expect(result.finalActions).toHaveLength(4);
    expect(result.dialogEvents).toHaveLength(2);

    // mutual pair (a, b): both wait
    const aAction = result.finalActions.find((a) => a.actorId === "a")!;
    const bAction = result.finalActions.find((a) => a.actorId === "b")!;
    expect(aAction.type).toBe("wait");
    expect(bAction.type).toBe("wait");

    // accepted c→d: c is wait (requester consumed), d keeps read (responder unchanged)
    const cAction = result.finalActions.find((a) => a.actorId === "c")!;
    const dAction = result.finalActions.find((a) => a.actorId === "d")!;
    expect(cAction.type).toBe("wait");
    expect(dAction.type).toBe("read");

    // 4 memory entries (a, b, c, d — one each for dialog summary)
    expect(result.memoryWrites).toHaveLength(4);
  });

  it("one-way rejected → requester gets salvage action, both get reject memories", async () => {
    const a = makeCharFull("a", "甲", "n1");
    const b = makeCharFull("b", "乙", "n1");

    const rawActions: Action[] = [
      { type: "speak", actorId: "a", targetId: "b", freeText: "嗨", reasoning: "想聊天", selfImportance: 2 },
      { type: "read", actorId: "b", reasoning: "读书不理人", selfImportance: 1 },
    ];

    const result = await runDialogPhase({
      rawActions,
      characters: [a, b],
      nodes: [baseNode],
      perceptions: emptyPerceptions,
      tick: 5,
      worldName: "测试",
      acceptDecide: mockAccept("reject_speak"),
      turnDecide: mockTurn("x"),
      summaryDecide: mockSummary("x"),
      salvageDecide: mockSalvage("observe"),
    });

    expect(result.dialogEvents).toHaveLength(0);
    const aAction = result.finalActions.find((a) => a.actorId === "a")!;
    expect(aAction.type).toBe("observe"); // salvage action

    // Reject memories for both
    const aMem = result.memoryWrites.find((m) => m.characterId === "a")!;
    const bMem = result.memoryWrites.find((m) => m.characterId === "b")!;
    expect(aMem.memory.content).toContain("被拒");
    expect(bMem.memory.content).toContain("拒绝");
  });

  it("autoFail (target_sleeping) → requester salvage + memory", async () => {
    const a = makeCharFull("a", "甲", "n1");
    const b = makeCharFull("b", "乙", "n1", "sleep");

    const rawActions: Action[] = [
      { type: "speak", actorId: "a", targetId: "b", freeText: "醒了吗", reasoning: "想聊天", selfImportance: 2 },
      { type: "sleep", actorId: "b", reasoning: "zzz", selfImportance: 3 },
    ];

    const result = await runDialogPhase({
      rawActions,
      characters: [a, b],
      nodes: [baseNode],
      perceptions: emptyPerceptions,
      tick: 5,
      worldName: "测试",
      acceptDecide: mockAccept("reject_speak"),
      turnDecide: mockTurn("x"),
      summaryDecide: mockSummary("x"),
      salvageDecide: mockSalvage("observe"),
    });

    expect(result.dialogEvents).toHaveLength(0);
    const aMem = result.memoryWrites.find((m) => m.characterId === "a")!;
    expect(aMem.memory.content).toContain("在睡觉");
  });

  it("accept decision returns illegal type → treated as reject", async () => {
    const a = makeCharFull("a", "甲", "n1");
    const b = makeCharFull("b", "乙", "n1");

    const rawActions: Action[] = [
      { type: "speak", actorId: "a", targetId: "b", freeText: "嗨", reasoning: "想聊天", selfImportance: 2 },
      { type: "read", actorId: "b", reasoning: "不理", selfImportance: 1 },
    ];

    // Return an illegal type
    const badAccept: AcceptDecideFn = async ({ requesterId }) => ({
      type: "speak" as any, // illegal — should be caught
      targetId: requesterId,
      reasoning: "？",
      selfImportance: 1,
    });

    const result = await runDialogPhase({
      rawActions,
      characters: [a, b],
      nodes: [baseNode],
      perceptions: emptyPerceptions,
      tick: 5,
      worldName: "测试",
      acceptDecide: badAccept,
      turnDecide: mockTurn("x"),
      summaryDecide: mockSummary("x"),
      salvageDecide: mockSalvage("observe"),
    });

    // Should have been treated as reject → salvage for a
    const aAction = result.finalActions.find((a) => a.actorId === "a")!;
    expect(aAction.type).toBe("observe");
    expect(result.dialogEvents).toHaveLength(0);
  });

  it("multiple dialog groups → all outcomes collected", async () => {
    const a = makeCharFull("a", "甲", "n1");
    const b = makeCharFull("b", "乙", "n1");
    const c = makeCharFull("c", "丙", "n1");
    const d = makeCharFull("d", "丁", "n1");

    const rawActions: Action[] = [
      { type: "speak", actorId: "a", targetId: "b", freeText: "hi1", reasoning: "r", selfImportance: 2 },
      { type: "read", actorId: "b", reasoning: "r", selfImportance: 1 },
      { type: "speak", actorId: "c", targetId: "d", freeText: "hi2", reasoning: "r", selfImportance: 2 },
      { type: "read", actorId: "d", reasoning: "r", selfImportance: 1 },
    ];

    const result = await runDialogPhase({
      rawActions,
      characters: [a, b, c, d],
      nodes: [baseNode],
      perceptions: emptyPerceptions,
      tick: 5,
      worldName: "测试",
      acceptDecide: mockAccept("accept_speak"),
      turnDecide: mockTurn("嗯"),
      summaryDecide: mockSummary("聊得不错"),
      salvageDecide: mockSalvage("wait"),
    });

    expect(result.dialogEvents).toHaveLength(2);
    expect(result.memoryWrites).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run dialog tests**

Run: `npx vitest run src/engine/dialog.test.ts --reporter=verbose 2>&1 | tail -30`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/engine/dialog.test.ts
git commit -m "test(dialog): runDialogPhase integration tests — accept, reject, autoFail, multi-group"
```

---

### Task 13: Add prompt builder snapshot tests

**Files:**
- Modify: `src/llm/prompt.test.ts` (append after existing describe blocks)

- [ ] **Step 1: Add snapshot tests for dialog builders**

```ts
// Append to src/llm/prompt.test.ts

import {
  buildAcceptDecisionPrompt,
  buildDialogTurnPrompt,
  buildDialogSummaryPrompt,
  buildSalvageContext,
} from "./prompt";
import type { DialogTurn } from "@/domain/types";

describe("buildAcceptDecisionPrompt", () => {
  it("contains requester name, freeText, and self state (zh)", () => {
    const result = buildAcceptDecisionPrompt({
      self: { ...baseCharacter, name: "乙", emotion: { mood: -1, stress: 1, social_satiety: 0 } },
      requesterName: "甲",
      freeText: "今天天气不错，一起散步吗？",
      here: restaurant,
      perceived: [],
      companions: [],
      tick: 12,
    });
    expect(result).toContain("甲");
    expect(result).toContain("今天天气不错，一起散步吗？");
    expect(result).toContain("乙");
    expect(result).toContain("submit_accept_decision");
  });

  it("includes perceived events when present", () => {
    const result = buildAcceptDecisionPrompt({
      self: baseCharacter,
      requesterName: "甲",
      freeText: "嗨",
      here: restaurant,
      perceived: [{ id: "e1", worldId: "w", tick: 5, category: "inner", description: "肚子叫了", participants: [baseCharacter.id], source: "inner", intensity: 2, scope: "private", audienceCharacterId: baseCharacter.id, duration: 1 }],
      companions: [],
      tick: 5,
    });
    expect(result).toContain("肚子叫了");
  });
});

describe("buildDialogTurnPrompt", () => {
  const transcript: DialogTurn[] = [
    { speakerId: "a", kind: "say", line: "今天天气真好。" },
    { speakerId: "b", kind: "say", line: "是啊，适合出去走走。" },
    { speakerId: "a", kind: "say", line: "你最近在忙什么？" },
  ];

  it("renders transcript and speaker context (zh)", () => {
    const result = buildDialogTurnPrompt({
      self: { ...baseCharacter, id: "b", name: "乙" },
      peer: { ...baseCharacter, id: "a", name: "甲" },
      transcript,
      isSoftLimit: false,
      turnCount: 3,
    });
    expect(result).toContain("甲");
    expect(result).toContain("乙");
    expect(result).toContain("今天天气真好");
    expect(result).toContain("submit_dialog_turn");
  });

  it("adds soft limit warning when isSoftLimit=true", () => {
    const result = buildDialogTurnPrompt({
      self: { ...baseCharacter, id: "b", name: "乙" },
      peer: { ...baseCharacter, id: "a", name: "甲" },
      transcript,
      isSoftLimit: true,
      turnCount: 8,
    });
    expect(result).toContain("收尾");
  });

  it("no soft limit warning when isSoftLimit=false", () => {
    const result = buildDialogTurnPrompt({
      self: { ...baseCharacter, id: "b", name: "乙" },
      peer: { ...baseCharacter, id: "a", name: "甲" },
      transcript,
      isSoftLimit: false,
      turnCount: 5,
    });
    expect(result).not.toContain("收尾");
  });
});

describe("buildDialogSummaryPrompt", () => {
  const transcript: DialogTurn[] = [
    { speakerId: "a", kind: "say", line: "你好。" },
    { speakerId: "b", kind: "say", line: "你好！很高兴见到你。" },
  ];

  it("renders full transcript and requests summary", () => {
    const result = buildDialogSummaryPrompt({
      openerName: "甲",
      responderName: "乙",
      transcript,
    });
    expect(result).toContain("甲：你好");
    expect(result).toContain("乙：你好！很高兴见到你");
    expect(result).toContain("submit_dialog_summary");
  });
});

describe("buildSalvageContext", () => {
  it("includes reject reason and speak ban", () => {
    const result = buildSalvageContext({ rejectReason: "乙 拒绝了你的对话请求。" });
    expect(result).toContain("乙 拒绝了你的对话请求。");
    expect(result).toContain("不能再对任何人发起对话邀请");
  });
});

describe("ACTION_NAMES speak label", () => {
  it("speak is labeled as 邀请说话", () => {
    // Indirectly tested via formatActionCounts in buildUserPrompt continuity section
    // The ACTION_NAMES map should have '邀请说话' for 'speak'
    // This is verified by checking a user prompt that references a speak action
    const out = buildUserPrompt({
      character: baseCharacter,
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: {
        homeNodeId: null,
        homeNodeName: null,
        hoursAtCurrentLocation: 0,
        todayActionCounts: { speak: 1 },
      },
    });
    expect(out).toContain("邀请说话");
  });
});
```

- [ ] **Step 2: Run prompt tests**

Run: `npx vitest run src/llm/prompt.test.ts --reporter=verbose 2>&1 | tail -30`
Expected: All new tests pass alongside existing ones.

- [ ] **Step 3: Commit**

```bash
git add src/llm/prompt.test.ts
git commit -m "test(prompt): dialog builder snapshot tests — accept, turn, summary, salvage, speak label"
```

---

### Task 14: Update events-pane.tsx for expandable dialog events

**Files:**
- Modify: `src/app/_components/events-pane.tsx`

- [ ] **Step 1: Add dialog transcript expand/collapse**

Replace the EventsPane component with this updated version:

```tsx
"use client";

import { useState } from "react";
import type { Character, WorldEvent } from "@/domain/types";

const CATEGORY_COLOR: Record<string, string> = {
  social: "var(--color-pixel-accent)",
  action: "var(--color-pixel-fg)",
  inner: "var(--color-pixel-muted)",
  env: "var(--color-pixel-success)",
  burst: "var(--color-pixel-danger)",
  quest: "var(--color-pixel-accent)",
  system: "var(--color-pixel-border-light)",
  time: "var(--color-pixel-muted)",
};

export function EventsPane({
  events,
  characters,
}: {
  events: WorldEvent[];
  characters: Character[];
}) {
  const charById = new Map(characters.map((c) => [c.id, c]));
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pixel-scroll p-3">
      {events.length === 0 ? (
        <p className="text-game-base text-(--color-pixel-muted)">尚无事件…</p>
      ) : (
        <ol className="space-y-2">
          {events.map((ev) => {
            const color = CATEGORY_COLOR[ev.category] ?? "var(--color-pixel-fg)";
            const hasTranscript = ev.dialogTranscript && ev.dialogTranscript.length > 0;
            const isExpanded = expandedIds.has(ev.id);

            return (
              <li
                key={ev.id}
                className="text-game-base leading-snug pl-2 border-l-2"
                style={{ borderColor: color }}
              >
                <div className="text-game-xs text-(--color-pixel-muted)">
                  t={ev.tick} · {ev.category} · 强度 {ev.intensity}
                  {hasTranscript ? " · 对话" : ""}
                </div>
                <div className="text-(--color-pixel-fg)">{ev.description}</div>
                {ev.participants.length > 0 && (
                  <div className="text-game-xs text-(--color-pixel-muted)">
                    参与者：
                    {ev.participants
                      .map((p) => charById.get(p)?.name ?? p)
                      .join("、")}
                  </div>
                )}
                {hasTranscript && (
                  <button
                    className="text-game-xs text-(--color-pixel-accent) mt-1 hover:underline cursor-pointer"
                    onClick={() => toggleExpand(ev.id)}
                  >
                    {isExpanded ? "收起对话 ▲" : "展开对话 ▼"}
                  </button>
                )}
                {hasTranscript && isExpanded && (
                  <div className="mt-2 p-2 bg-(--color-pixel-bg-subtle) rounded border border-(--color-pixel-border-light) text-game-sm">
                    {ev.dialogTranscript!.map((turn, i) => {
                      const speakerName =
                        charById.get(turn.speakerId)?.name ?? turn.speakerId;
                      if (turn.kind === "leave") {
                        return (
                          <div key={i} className="text-(--color-pixel-muted) italic">
                            {speakerName} 离开了对话。
                          </div>
                        );
                      }
                      return (
                        <div key={i} className="mb-1">
                          <span className="font-semibold text-(--color-pixel-accent)">
                            {speakerName}：
                          </span>
                          <span className="text-(--color-pixel-fg)">
                            {turn.line ?? ""}
                          </span>
                        </div>
                      );
                    })}
                    {ev.dialogEndedBy && ev.dialogEndedBy !== "natural" && (
                      <div className="text-game-xs text-(--color-pixel-muted) mt-1">
                        （对话结束方式：{ev.dialogEndedBy}）
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/events-pane.tsx
git commit -m "feat(events-pane): expandable dialog transcripts in event cards"
```

---

### Task 15: Update existing test regressions

**Files:**
- Modify: `src/engine/tick.test.ts`

- [ ] **Step 1: Update tick tests that reference speak side effects**

Existing tick tests don't directly test speak output — they test vitals decay, LLM failure fallback, eat, facts injection, free-move limits, and agent_thoughts. The `formatActionCounts` test in prompt.test.ts was already covered in Task 14 with the `"邀请说话"` label assertion.

The main regression risk is in:
1. `tick.test.ts` "LLM 决策异常时降级为 wait" — this test uses `decide` override and doesn't test speak, so it should pass as-is
2. `tick.test.ts` "写入 agent_thoughts 时保留完整 reasoning" — same

Run existing tests to verify:

```bash
npx vitest run src/engine/tick.test.ts src/llm/decide.test.ts src/llm/prompt.test.ts --reporter=verbose 2>&1 | tail -30
```

- [ ] **Step 2: Fix any failing tests**

If `prompt.test.ts` "连续行为段含 hours / lastAction / today counts" test references `speak` in the `todayActionCounts` assertion, the label changed from "说话" to "邀请说话". Update:

```ts
// In the test at around line 333:
expect(out).toContain("邀请说话 ×9");  // was "说话 ×9"
```

- [ ] **Step 3: Commit any regression fixes**

```bash
git add src/llm/prompt.test.ts
git commit -m "test: update speak label assertion to match new 邀请说话"
```

---

---

### Task 16: Full test suite verification

- [ ] **Step 1: Run all tests**

```bash
npx vitest run --reporter=verbose 2>&1
```

Expected: All tests pass.

- [ ] **Step 2: Run TypeScript full check**

```bash
npx tsc --noEmit --pretty 2>&1
```

Expected: No errors.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "test: full regression — all tests pass after dialog protocol integration"
```

---

## Execution Order

```
Task 1  (types + enums)
Task 2  (schemas)
Task 3  (actions.ts hint)
Task 4  (execute.ts cleanup)
Task 5  (prompt.ts label)
Task 6  (prompt.ts builders)
Task 7  (decide.ts LLM entries)
Task 8  (dialog.ts skeleton)
Task 9  (dialog.ts full)
Task 10 (tick.ts integration)
Task 11 (dialog.test.ts pairSpeak)
Task 12 (dialog.test.ts runPhase)
Task 13 (prompt.test.ts builders)
Task 14 (events-pane.tsx)
Task 15 (existing test fixes)
Task 16 (final verification)
```

Tasks 1-2 are foundational; 3-5 are independent cleanup tasks (can run in parallel); 6-7 depend on 2; 8-9 depend on 6-7; 10 depends on 8-9; 11-16 depend on all implementation tasks.
