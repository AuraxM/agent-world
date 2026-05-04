# Speak 长流程对话 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 speak action 从单 tick 内完成的对话改为跨 tick 的长流程对话（3+3=6 句/tick，暴露 end_conversation tool，3+4 规则优雅结束）

**Architecture:** 新增 `Conversation` 实体持久化于 DB，`LoadedWorld` 携带进行中对话列表。每 tick 先恢复进行中对话，发起者锁定跳过 action 选择，接受者正常决策。dialog protocol 扩展为支持续接和自然结束。

**Tech Stack:** TypeScript, Drizzle ORM (SQLite), Zod validation, OpenAI function calling

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/domain/types.ts` | Modify | 新增 `Conversation`、`EndConversationPayload`，更新 `Character`、`DialogTurn` |
| `src/db/schema.ts` | Modify | 新增 `conversations` 表、characters 加 `activeConversationIdsJson` |
| `src/domain/schemas.ts` | Modify | 新增 `end_conversation` tool schema，更新 `submit_dialog_turn` |
| `src/llm/prompt.ts` | Modify | 更新 `buildDialogTurnPrompt`，新增 `buildEndConversationPrompt`、`injectTimeMessage` |
| `src/llm/decide.ts` | Modify | 新增 `llmEndConversationDecide`，更新 `llmDialogTurn` 接口 |
| `src/engine/dialog.ts` | Major rewrite | 持久化对话编排：续接 + 新对话 |
| `src/engine/tick.ts` | Modify | 对话前处理、角色锁定、集成新 dialog phase |
| `src/engine/store.ts` | Modify | 对话持久化 load/save |
| `src/engine/dialog.test.ts` | Modify | 扩展测试覆盖多 tick 场景 |

---

### Task 1: Types 定义

**Files:**
- Modify: `src/domain/types.ts:306-312` (DialogTurn), `218` (Character)
- Create: (none — changes inline)

- [ ] **Step 1: 更新 DialogTurn 类型，移除 leave 支持**

`src/domain/types.ts` 中 DialogTurn 的 kind 改为只含 `"say"`:

```typescript
/** 对话内单轮快照（仅供 WorldEvent.dialogTranscript 使用） */
export interface DialogTurn {
  speakerId: string;
  kind: "say";
  line?: string;
  reasoning?: string;
}
```

- [ ] **Step 2: 新增 Conversation 和 EndConversationPayload 类型**

在 `src/domain/types.ts` 的 World 接口前插入:

```typescript
/** 持久化对话实体。每段双人对话一个实例，随 world 存储。 */
export interface Conversation {
  id: string;
  worldId: string;
  initiatorId: string;
  acceptorId: string;
  transcript: DialogTurn[];
  tickStarted: number;
  currentTickRounds: number;
  status: "active" | "ending" | "ended";
  endedBy?: "initiator" | "acceptor" | "passive";
  pendingExtraRound?: boolean;
}

/** end_conversation tool 的 LLM 输出载荷。 */
export interface EndConversationPayload {
  reasoning: string;
  closingLine?: string;
}
```

- [ ] **Step 3: 在 Character 上新增 activeConversationIds**

在 `Character` interface 的 `speakingStyle` 行后插入:

```typescript
  /** 当前参与的对话 ID 列表（发起者锁在其中，接受者可同时在多段对话） */
  activeConversationIds: string[];
```

在 `restNodeId` 行后插入（字段声明区同样位置）。

- [ ] **Step 4: 更新 WorldEvent 的 dialogEndedBy**

`dialogEndedBy` 类型扩展，`"leave"` 替换为 `"end_tool"`:

```typescript
  dialogEndedBy?: "natural" | "end_tool" | "hard_limit" | "turn_failure" | "passive";
```

- [ ] **Step 5: 添加 Zod schema**

在 `src/domain/types.ts` 末尾或 `src/domain/schemas.ts` 中添加:

```typescript
export const EndConversationSchema = z.object({
  reasoning: z.string().min(1).max(400),
  closing_line: z.string().max(800).optional(),
});
```

- [ ] **Step 6: 编译验证**

```bash
npx tsc --noEmit
```
Expected: 可能有其他文件引用 `kind: "leave"` 的报错（后续任务修复），但新增类型本身无语法错误。

- [ ] **Step 7: Commit**

```bash
git add src/domain/types.ts src/domain/schemas.ts
git commit -m "feat: add Conversation type and EndConversationPayload"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

### Task 2: 数据库 Schema 与迁移

**Files:**
- Modify: `src/db/schema.ts:66-115` (characters table), 新增 conversations table

- [ ] **Step 1: 在 characters 表新增 activeConversationIdsJson 列**

在 `src/db/schema.ts` 的 `characters` 表定义中，`sicknessJson` 行后插入:

```typescript
  activeConversationIdsJson: text("active_conversation_ids_json").notNull().default("[]"),
```

- [ ] **Step 2: 新增 conversations 表**

在 `src/db/schema.ts` 的 `transactions` 表定义后追加:

```typescript
export const conversations = sqliteTable(
  "conversations",
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
    index("conversations_world_idx").on(t.worldId),
  ],
);
```

- [ ] **Step 3: 创建迁移**

```bash
npx drizzle-kit generate
```

- [ ] **Step 4: 运行迁移**

```bash
npx tsx src/db/migrate.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat: add conversations table and active_conversation_ids column"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

### Task 3: Tool Schema 变更

**Files:**
- Modify: `src/domain/schemas.ts:256-290`

- [ ] **Step 1: 移除 DialogTurnToolSchema 中的 leave**

修改 `src/domain/schemas.ts` 的 `DialogTurnToolSchema`:

```typescript
export const DialogTurnToolSchema = {
  type: "object" as const,
  properties: {
    kind: { type: "string", enum: ["say"], description: "说一句话。" },
    line: { type: "string", description: "说的话。" },
    reasoning: { type: "string", description: "简短内心独白（可选）。" },
  },
  required: ["kind", "line"],
  additionalProperties: false,
};
```

同时更新 `DialogTurnSchema` (Zod):

```typescript
export const DialogTurnSchema = z.object({
  kind: z.literal("say"),
  line: z.string().min(1).max(800),
  reasoning: z.string().min(1).max(300).optional(),
});
```

- [ ] **Step 2: 新增 end_conversation tool schema**

在同文件的 DialogTurnToolSchema 附近追加:

```typescript
export const END_CONVERSATION_TOOL_NAME = "end_conversation";
export const EndConversationToolSchema = {
  type: "object" as const,
  properties: {
    reasoning: { type: "string", description: "结束对话的理由（内心独白）。" },
    closing_line: { type: "string", description: "结束语（可选）。" },
  },
  required: ["reasoning"],
  additionalProperties: false,
};
```

- [ ] **Step 3: 编译验证**

```bash
npx tsc --noEmit
```
Expected: 可能有引用 `kind: "leave"` 的旧代码报错（后续任务修复）。

- [ ] **Step 4: Commit**

```bash
git add src/domain/schemas.ts
git commit -m "feat: add end_conversation tool schema, remove leave from dialog turn"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

### Task 4: Prompt 重写

**Files:**
- Modify: `src/llm/prompt.ts:826-882` (buildDialogTurnPrompt)

- [ ] **Step 1: 重写 buildDialogTurnPrompt**

移除 isSoftLimit / turnCount 参数和催促语，简化 prompt:

```typescript
export function buildDialogTurnPrompt(args: {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  language?: Language;
}): string {
  const { self, peer, transcript } = args;
  const language = args.language ?? "zh";

  const history = transcript
    .map((t) => {
      const name = t.speakerId === self.id ? self.name : peer.name;
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

  const sayPrompt =
    language === "zh"
      ? `现在轮到你说话。调用 submit_dialog_turn 回复：kind="say" 并填写 line。如果想结束对话，请调用 end_conversation。`
      : language === "en"
        ? `It's your turn. Call submit_dialog_turn with kind="say" and line. If you want to end the conversation, call end_conversation.`
        : `あなたの番です。submit_dialog_turn で kind="say" を呼び出し line を入力してください。会話を終了する場合は end_conversation を呼び出してください。`;
  lines.push(sayPrompt);

  return lines.join("\n");
}
```

- [ ] **Step 2: 新增时间注入函数**

在同文件末尾新增:

```typescript
export function injectTimeMessage(args: {
  tick: number;
  tickStarted: number;
  language?: Language;
}): string {
  const { tick, tickStarted } = args;
  const language = args.language ?? "zh";
  const t = timeOfDay(tick);
  const elapsedTicks = tick - tickStarted;
  const elapsedHours = Math.floor(elapsedTicks / TICKS_PER_HOUR);
  const elapsedMinutes = Math.floor((elapsedTicks % TICKS_PER_HOUR) * (60 / TICKS_PER_HOUR));

  const durationStr =
    elapsedHours > 0
      ? `${elapsedHours} 小时 ${elapsedMinutes} 分钟`
      : `${elapsedMinutes} 分钟`;

  if (language === "zh") {
    return `[当前时间：第 ${t.day} 日 ${String(t.hour).padStart(2, "0")}:00（${t.period}），对话已持续 ${durationStr}]`;
  }
  if (language === "en") {
    return `[Current time: Day ${t.day} ${String(t.hour).padStart(2, "0")}:00 (${t.period}), conversation has lasted ${durationStr}]`;
  }
  return `[現在の時間：第 ${t.day} 日 ${String(t.hour).padStart(2, "0")}:00（${t.period}）、会話は ${durationStr} 続いています]`;
}
```

- [ ] **Step 3: 更新函数导出（确保 injectTimeMessage 和 timeOfDay 可用）**

检查 `timeOfDay` 和 `TICKS_PER_HOUR` 的 import 已在 prompt.ts 顶部。

- [ ] **Step 4: Commit**

```bash
git add src/llm/prompt.ts
git commit -m "feat: simplify dialog turn prompt, add time message injection"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

### Task 5: LLM Decision 更新

**Files:**
- Modify: `src/llm/decide.ts:242-318`

- [ ] **Step 1: 更新 llmDialogTurn 签名和实现**

移除 `isSoftLimit` / `turnCount` 参数，新增 `end_conversation` tool:

```typescript
interface DialogTurnInput {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  language?: Language;
}

export async function llmDialogTurn(input: DialogTurnInput): Promise<
  | { kind: "turn"; turn: DialogTurn }
  | { kind: "end"; payload: EndConversationPayload }
> {
  if (!hasApiKey()) throw new Error("没有激活的 LLM provider");

  const config = getEntryConfig("dialog_turn");
  const client = getLLMClientForEntry("dialog_turn");
  const language: Language = input.language ?? "zh";

  const prompt = buildDialogTurnPrompt({
    self: input.self,
    peer: input.peer,
    transcript: input.transcript,
    language,
  });

  const tools: ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: DIALOG_TURN_TOOL_NAME,
        description: "说一句话。",
        parameters: DialogTurnToolSchema,
      },
    },
    {
      type: "function",
      function: {
        name: END_CONVERSATION_TOOL_NAME,
        description: "结束当前对话。",
        parameters: EndConversationToolSchema,
      },
    },
  ];

  const extra: Record<string, unknown> = {};
  if (config.thinkingEnabled) extra.thinking = { type: "enabled" };

  dialogLog.info("LLM dialog_turn 请求", {
    self: input.self.name,
    peer: input.peer.name,
  });

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: getModelNameForEntry("dialog_turn"),
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content: `你是一个角色扮演引擎中的 NPC。你正在和另一个人对话。请根据你的性格、当前情境和对话历史，自然地回应。\n\n${languageInstruction(language)}`,
          },
          { role: "user", content: prompt },
        ],
        tools,
        ...extra,
      });

      const message = response.choices[0]?.message;
      const toolCall = (message?.tool_calls ?? []).find(
        (c: { type: string; function: { name: string; arguments: string } }) =>
          c.type === "function",
      );
      if (!toolCall) {
        throw new Error("LLM 没有返回 tool_call");
      }

      const args = JSON.parse(toolCall.function.arguments);

      if (toolCall.function.name === DIALOG_TURN_TOOL_NAME) {
        const result = DialogTurnSchema.safeParse(args);
        if (!result.success) {
          throw new Error(`DialogTurn 参数不符合 schema：${result.error.message}`);
        }
        return {
          kind: "turn",
          turn: {
            speakerId: input.self.id,
            kind: result.data.kind,
            line: result.data.line,
            reasoning: result.data.reasoning,
          },
        };
      } else if (toolCall.function.name === END_CONVERSATION_TOOL_NAME) {
        const result = EndConversationSchema.safeParse(args);
        if (!result.success) {
          throw new Error(`EndConversation 参数不符合 schema：${result.error.message}`);
        }
        return {
          kind: "end",
          payload: {
            reasoning: result.data.reasoning,
            closingLine: result.data.closing_line,
          },
        };
      } else {
        throw new Error(`未知 tool_call: ${toolCall.function.name}`);
      }
    } catch (err) {
      lastError = err;
      if (attempt === 0) continue;
    }
  }
  throw lastError;
}
```

- [ ] **Step 2: 更新导出和 import**

确保 `EndConversationSchema`、`END_CONVERSATION_TOOL_NAME`、`EndConversationToolSchema` 从 schemas.ts import，`EndConversationPayload` 从 types.ts import。

- [ ] **Step 3: 编译验证**

```bash
npx tsc --noEmit
```
Expected: 调用处（dialog.ts）仍有类型错误，等待 Task 6 修复。

- [ ] **Step 4: Commit**

```bash
git add src/llm/decide.ts
git commit -m "feat: update llmDialogTurn to support end_conversation tool"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

### Task 6: Dialog Protocol 重写

**Files:**
- Modify: `src/engine/dialog.ts` (全文重写关键函数)

- [ ] **Step 1: 新增 Conversation 持久化辅助函数**

在 `src/engine/dialog.ts` 中新增 CRUD 函数:

```typescript
import { db, schema } from "@/db/client";
import { eq, and } from "drizzle-orm";
import type { Conversation } from "@/domain/types";

export function loadConversations(worldId: string): Conversation[] {
  const rows = db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.worldId, worldId))
    .all();
  return rows.map((r) => JSON.parse(r.payloadJson) as Conversation);
}

export function saveConversation(conv: Conversation): void {
  const now = new Date();
  db
    .insert(schema.conversations)
    .values({
      id: conv.id,
      worldId: conv.worldId,
      payloadJson: JSON.stringify(conv),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.conversations.worldId, schema.conversations.id],
      set: {
        payloadJson: JSON.stringify(conv),
        updatedAt: now,
      },
    })
    .run();
}

export function deleteConversation(worldId: string, id: string): void {
  db
    .delete(schema.conversations)
    .where(
      and(
        eq(schema.conversations.worldId, worldId),
        eq(schema.conversations.id, id),
      ),
    )
    .run();
}
```

- [ ] **Step 2: 重写 runOneDialog → runOneTickDialog**

替换按轮数推进的单 tick 对话函数为续接式:

```typescript
const TURNS_PER_TICK = 3; // 每角色每 tick 3 句话

interface TickDialogResult {
  transcript: DialogTurn[];
  ended: boolean;
  endedBy?: "initiator" | "acceptor" | "end_tool";
}

async function runOneTickDialog(
  conv: Conversation,
  chars: Map<string, Character>,
  turnDecide: TurnDecideFn,
  language: Language,
  currentTick: number,
): Promise<TickDialogResult> {
  const initiator = chars.get(conv.initiatorId)!;
  const acceptor = chars.get(conv.acceptorId)!;
  const transcript: DialogTurn[] = [...conv.transcript];

  // Determine who speaks first this tick (continue from last speaker)
  const lastSpeakerId =
    transcript.length > 0
      ? transcript[transcript.length - 1].speakerId
      : conv.initiatorId;
  const firstSpeakerId =
    lastSpeakerId === conv.initiatorId ? conv.acceptorId : conv.initiatorId;

  // 3 rounds = each speaks 3 times, alternating
  for (let round = 0; round < TURNS_PER_TICK * 2; round++) {
    const speakerId = round % 2 === 0 ? firstSpeakerId : (firstSpeakerId === conv.initiatorId ? conv.acceptorId : conv.initiatorId);
    const speaker = chars.get(speakerId)!;
    const peer = speakerId === conv.initiatorId ? acceptor : initiator;

    let result;
    try {
      result = await turnDecide({
        self: speaker,
        peer,
        transcript,
        language,
      });
    } catch {
      // Turn failure → mark as ended
      return { transcript, ended: true, endedBy: undefined };
    }

    if (result.kind === "end") {
      const isSixthSentence = round === TURNS_PER_TICK * 2 - 1;
      if (result.payload.closingLine) {
        transcript.push({
          speakerId,
          kind: "say",
          line: result.payload.closingLine,
          reasoning: result.payload.reasoning,
        });
      }
      if (isSixthSentence) {
        // 3+4 rule: other party gets one extra turn
        conv.pendingExtraRound = true;
        const otherId =
          speakerId === conv.initiatorId ? conv.acceptorId : conv.initiatorId;
        const other = chars.get(otherId)!;
        const otherPeer =
          otherId === conv.initiatorId ? acceptor : initiator;
        try {
          const extraResult = await turnDecide({
            self: other,
            peer: otherPeer,
            transcript,
            language,
          });
          if (extraResult.kind === "turn") {
            transcript.push(extraResult.turn);
          }
        } catch {
          // ignore extra round failure
        }
      }
      return {
        transcript,
        ended: true,
        endedBy: speakerId === conv.initiatorId ? "initiator" : "acceptor",
      };
    }

    transcript.push(result.turn);
  }

  // After 6 sentences, inject time message
  const timeMsg: DialogTurn = {
    speakerId: "__system__",
    kind: "say",
    line: injectTimeMessage({ tick: currentTick, tickStarted: conv.tickStarted, language }),
  };
  transcript.push(timeMsg);

  return { transcript, ended: false };
}
```

- [ ] **Step 3: 重写 runDialogPhase 为支持多 tick**

```typescript
export interface RunDialogPhaseInput {
  rawActions: Action[];
  characters: Character[];
  nodes: MapNode[];
  perceptions: Map<string, WorldEvent[]>;
  tick: number;
  worldName: string;
  language: Language;
  acceptDecide: AcceptDecideFn;
  turnDecide: TurnDecideFn;
  summaryDecide: SummaryDecideFn;
  salvageDecide: SalvageDecideFn;
  /** 世界当前进行中的对话列表 */
  ongoingConversations: Conversation[];
}

export interface DialogPhaseResult {
  finalActions: Action[];
  dialogEvents: WorldEvent[];
  memoryWrites: MemoryWrite[];
  /** 更新后的对话列表（新增 + 状态变更 + 已结束移除） */
  updatedConversations: Conversation[];
}

export async function runDialogPhase(
  input: RunDialogPhaseInput,
): Promise<DialogPhaseResult> {
  const { rawActions, characters, nodes, perceptions, tick, ongoingConversations } = input;
  const charById = new Map(characters.map((c) => [c.id, c]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const memoryWrites: MemoryWrite[] = [];
  const dialogEvents: WorldEvent[] = [];
  const finalActionsMap = new Map<string, Action>();
  const consumedActorIds = new Set<string>();
  const updatedConversations: Conversation[] = [];

  // ── Part 1: Resume ongoing conversations ──
  for (const conv of ongoingConversations) {
    if (conv.status === "ended") continue;

    const initiator = charById.get(conv.initiatorId);
    const acceptor = charById.get(conv.acceptorId);

    // Check passive end conditions
    if (!initiator || !acceptor) {
      conv.status = "ended";
      conv.endedBy = "passive";
      // Summarize + cleanup below
      continue;
    }
    if (initiator.locationId !== acceptor.locationId) {
      conv.status = "ended";
      conv.endedBy = "passive";
      // inject passive end system message for initiator
      const sysMsg: DialogTurn = {
        speakerId: "__system__",
        kind: "say",
        line: `${acceptor.name} 离开了当前场景，对话终止。`,
      };
      conv.transcript.push(sysMsg);
      continue;
    }

    // Execute this tick's dialog
    const tickResult = await runOneTickDialog(
      conv,
      charById,
      input.turnDecide,
      input.language,
      tick,
    );

    conv.transcript = tickResult.transcript;
    conv.currentTickRounds = TURNS_PER_TICK;

    if (tickResult.ended) {
      conv.status = "ended";
      conv.endedBy = tickResult.endedBy;
    } else if (conv.status === "active") {
      conv.status = "ending";
    }

    // Mark actors consumed
    consumedActorIds.add(conv.initiatorId);
    // acceptor NOT consumed — they take normal actions (but will auto-continue if same node)

    updatedConversations.push(conv);
  }

  // ── Part 2: Process new speak actions ──
  const pairing = pairSpeakRequests(rawActions, characters);
  const salvageTasks: Array<() => Promise<{ actorId: string; action: Action }>> = [];

  // Process autoFails (unchanged from original)
  for (const af of pairing.autoFails) {
    consumedActorIds.add(af.requester);
    const char = charById.get(af.requester)!;
    let reason: string;
    if (af.reason === "cross_node") reason = `想找对方说话但她不在这里`;
    else if (af.reason === "target_left") reason = `想找对方说话但她已经走了`;
    else reason = `想开口又咽了回去`;

    memoryWrites.push(makeMemory(af.requester, tick, 1, reason));

    salvageTasks.push(() =>
      input.salvageDecide({
        character: char,
        tick,
        rejectReason: reason,
        language: input.language,
      }).then((action) => ({ actorId: af.requester, action })),
    );
  }

  // Process pending acceptances (unchanged)
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
          language: input.language,
        });
      } catch {
        result = {
          type: "reject_speak",
          targetId: pa.requester,
          reasoning: "决策失败默认拒绝",
          selfImportance: 1,
        };
      }
      if (result.type !== "accept_speak" && result.type !== "reject_speak") {
        result = {
          type: "reject_speak",
          targetId: pa.requester,
          reasoning: "决策输出非法 type",
          selfImportance: 1,
        };
      }
      return { pa, result };
    }),
  );

  // Split accepted vs rejected + handle mutual pairs
  const newDialogGroups: Array<{
    requesterId: string;
    responderId: string;
    openingLine: string;
  }> = [];
  for (const { pa, result } of acceptResults) {
    consumedActorIds.add(pa.requester);
    if (result.type === "accept_speak") {
      newDialogGroups.push({
        requesterId: pa.requester,
        responderId: pa.target,
        openingLine: pa.freeText,
      });
    } else {
      const requester = charById.get(pa.requester)!;
      const targetName = charById.get(pa.target)!.name;
      memoryWrites.push(
        makeMemory(pa.requester, tick, 2, `我邀请 ${targetName} 说话被拒了`),
      );
      memoryWrites.push(
        makeMemory(pa.target, tick, 1, `我拒绝了 ${requester.name} 的搭话邀请`),
      );
      salvageTasks.push(() =>
        input.salvageDecide({
          character: requester,
          tick,
          rejectReason: `${targetName} 拒绝了你的对话请求。`,
          language: input.language,
        }).then((action) => ({ actorId: pa.requester, action })),
      );
    }
  }

  // Process mutual pairs → auto-accepted
  for (const mp of pairing.mutualPairs) {
    consumedActorIds.add(mp.a);
    consumedActorIds.add(mp.b);
    const openerFirst = Math.random() < 0.5;
    newDialogGroups.push({
      requesterId: openerFirst ? mp.a : mp.b,
      responderId: openerFirst ? mp.b : mp.a,
      openingLine: openerFirst ? mp.aFreeText : mp.bFreeText,
    });
  }

  // ── Part 3: Create new conversations from accepted dialogs, run tick 1 ──
  for (const dg of newDialogGroups) {
    const worldId = charById.get(dg.requesterId)!.worldId;
    const conv: Conversation = {
      id: `conv-${randomUUID().slice(0, 8)}`,
      worldId,
      initiatorId: dg.requesterId,
      acceptorId: dg.responderId,
      transcript: [{ speakerId: dg.requesterId, kind: "say", line: dg.openingLine }],
      tickStarted: tick,
      currentTickRounds: 0,
      status: "active",
    };

    const tickResult = await runOneTickDialog(
      conv,
      charById,
      input.turnDecide,
      input.language,
      tick,
    );

    conv.transcript = tickResult.transcript;
    conv.currentTickRounds = TURNS_PER_TICK;

    if (tickResult.ended) {
      conv.status = "ended";
      conv.endedBy = tickResult.endedBy;
    } else {
      // After first tick, move to ending
      conv.status = "ending";
    }

    updatedConversations.push(conv);
    consumedActorIds.add(conv.initiatorId);
  }

  // ── Part 4: Salvage decisions (parallel) ──
  const salvageResults = await Promise.all(salvageTasks.map((t) => t()));

  // ── Part 5: Summarize ended conversations + write memories ──
  for (const conv of updatedConversations) {
    if (conv.status !== "ended") continue;

    const opener = charById.get(conv.initiatorId)!;
    const responder = charById.get(conv.acceptorId)!;

    let summary: string;
    try {
      summary = await retryOnce(() =>
        input.summaryDecide({
          openerName: opener.name,
          openerId: conv.initiatorId,
          responderName: responder.name,
          responderId: conv.acceptorId,
          transcript: conv.transcript,
          language: input.language,
        }),
      );
    } catch {
      summary = `（摘要生成失败：双方聊了 ${conv.transcript.length} 句）`;
    }

    const maxImportance = clamp(
      Math.max(
        rawActions.find((a) => a.actorId === conv.initiatorId)?.selfImportance ?? 2,
        rawActions.find((a) => a.actorId === conv.acceptorId)?.selfImportance ?? 2,
      ),
      2,
      4,
    );

    memoryWrites.push(
      makeMemory(conv.initiatorId, tick, maxImportance, `和 ${responder.name} 聊了：${summary}`),
    );
    memoryWrites.push(
      makeMemory(conv.acceptorId, tick, maxImportance, `和 ${opener.name} 聊了：${summary}`),
    );

    dialogEvents.push({
      id: `evt-${randomUUID().slice(0, 8)}`,
      worldId: opener.worldId,
      tick,
      category: "social",
      description: summary,
      participants: [conv.initiatorId, conv.acceptorId],
      source: "actor",
      intensity: 2,
      scope: "node",
      nodeId: opener.locationId,
      duration: 1,
      dialogTranscript: conv.transcript,
      dialogEndedBy: conv.endedBy === "passive" ? "passive" : (conv.endedBy ? "end_tool" : "natural"),
    });

    // Release initiator from conversation lock
    const initiator = charById.get(conv.initiatorId);
    if (initiator) {
      initiator.activeConversationIds = initiator.activeConversationIds.filter(
        (id) => id !== conv.id,
      );
    }
    const acceptor = charById.get(conv.acceptorId);
    if (acceptor) {
      acceptor.activeConversationIds = acceptor.activeConversationIds.filter(
        (id) => id !== conv.id,
      );
    }
  }

  // ── Part 6: Remove ended conversations from active list ──
  const activeConversations = updatedConversations.filter((c) => c.status !== "ended");
  const endedConversations = updatedConversations.filter((c) => c.status === "ended");

  // ── Part 7: Assign finalActions ──
  // Initiators in active conversations → wait (locked)
  for (const conv of activeConversations) {
    finalActionsMap.set(conv.initiatorId, {
      type: "wait",
      actorId: conv.initiatorId,
      reasoning: `正在和 ${charById.get(conv.acceptorId)!.name} 对话`,
      selfImportance: 2,
      skipExecution: true,
    });
  }

  // Initiators of newly-ended conversations → wait (free after this tick)
  for (const conv of endedConversations) {
    finalActionsMap.set(conv.initiatorId, {
      type: "wait",
      actorId: conv.initiatorId,
      reasoning: `刚和 ${charById.get(conv.acceptorId)!.name} 聊完`,
      selfImportance: 2,
      skipExecution: true,
    });
  }

  // Salvaged actors → their salvage action
  for (const sr of salvageResults) {
    finalActionsMap.set(sr.actorId, sr.action);
  }

  // Non-consumed, non-speak actors → keep original action
  for (const a of rawActions) {
    if (!finalActionsMap.has(a.actorId)) {
      finalActionsMap.set(a.actorId, a);
    }
  }

  const finalActions = characters.map((c) => finalActionsMap.get(c.id)!);

  return {
    finalActions,
    dialogEvents,
    memoryWrites,
    updatedConversations: activeConversations,
  };
}
```

- [ ] **Step 4: 更新 type exports**

更新 `DialogOutcomeInternal` 和 `TurnDecideFn` 类型:

```typescript
export type TurnDecideFn = (input: {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  language: Language;
}) => Promise<
  | { kind: "turn"; turn: DialogTurn }
  | { kind: "end"; payload: EndConversationPayload }
>;
```

- [ ] **Step 5: Commit**

```bash
git add src/engine/dialog.ts
git commit -m "feat: rewrite dialog protocol for multi-tick conversation flow"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

### Task 7: Tick 集成

**Files:**
- Modify: `src/engine/tick.ts:640-745` (dialog phase integration)
- Modify: `src/engine/tick.ts:580-640` (decision phase — skip initiators)

- [ ] **Step 1: 在 Phase 4 决策前加载并锁定发起者**

在 `src/engine/tick.ts` 的 Phase 4 决策入口处（约 line 580），新增:

```typescript
// Phase 4 prep: load ongoing conversations
const ongoingConversations = loadConversations(worldId);

// Mark initiators as "locked" — skip normal action selection
const lockedCharacterIds = new Set<string>();
for (const conv of ongoingConversations) {
  if (conv.status !== "ended") {
    lockedCharacterIds.add(conv.initiatorId);
    // Ensure characters have activeConversationIds set
    const initiator = characters.find((c) => c.id === conv.initiatorId);
    if (initiator && !initiator.activeConversationIds.includes(conv.id)) {
      initiator.activeConversationIds.push(conv.id);
    }
    const acceptor = characters.find((c) => c.id === conv.acceptorId);
    if (acceptor && !acceptor.activeConversationIds.includes(conv.id)) {
      acceptor.activeConversationIds.push(conv.id);
    }
  }
}

// Filter characters for LLM decisions: exclude initiators locked in conversations
const freeCharacters = characters.filter((c) => !lockedCharacterIds.has(c.id));
```

- [ ] **Step 2: 只对 freeCharacters 做 LLM 决策**

修改 Phase 4 的并发决策循环，遍历 `freeCharacters` 而非 `characters`。

- [ ] **Step 3: 被锁定的发起者自动生成 wait action**

```typescript
for (const charId of lockedCharacterIds) {
  const conv = ongoingConversations.find((c) => c.initiatorId === charId && c.status !== "ended");
  const acceptorName = conv
    ? characters.find((c) => c.id === conv.acceptorId)?.name ?? "某人"
    : "某人";
  actionsForExecution.push({
    type: "wait",
    actorId: charId,
    reasoning: `正在和 ${acceptorName} 对话`,
    selfImportance: 2,
    skipExecution: true,
  });
}
```

- [ ] **Step 4: 更新 runDialogPhase 调用**

```typescript
const dialogResult = await runDialogPhase({
  rawActions: actionsForExecution,
  characters,
  nodes,
  perceptions,
  tick: fromTick,
  worldName: world.name,
  language,
  acceptDecide: (input) => llmAcceptDecide(input),
  turnDecide: (input) => llmDialogTurn(input),
  summaryDecide: (input) => llmDialogSummarize(input),
  salvageDecide: async (input) => { /* unchanged */ },
  ongoingConversations,
});
```

- [ ] **Step 5: 对话结果后保存 conversations**

在 dialog phase 结果处理后，添加:

```typescript
// Save/delete conversations
for (const conv of dialogResult.updatedConversations) {
  saveConversation(conv);
}
// Delete ended conversations from DB
const endedConvIds = ongoingConversations
  .filter((c) => c.status === "ended")
  .map((c) => c.id);
for (const id of endedConvIds) {
  deleteConversation(worldId, id);
}
```

- [ ] **Step 6: 更新 activeConversationIds 清理**

在 Phase 9 save world 前，清理不在进行中对话的角色标记:

```typescript
// Clean up activeConversationIds for non-conversation characters
const activeConvIds = new Set(dialogResult.updatedConversations.map((c) => c.id));
for (const c of characters) {
  c.activeConversationIds = c.activeConversationIds.filter((id) => activeConvIds.has(id));
}
```

- [ ] **Step 7: Commit**

```bash
git add src/engine/tick.ts
git commit -m "feat: integrate multi-tick conversations into tick loop"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

### Task 8: Store 持久化

**Files:**
- Modify: `src/engine/store.ts:77-122` (character load/save)

- [ ] **Step 1: 更新 character 加载以包含 activeConversationIds**

在 `loadWorld` 的 character mapping（约 line 77-108）中添加:

```typescript
    activeConversationIds: JSON.parse(c.activeConversationIdsJson),
```

- [ ] **Step 2: 更新 character 保存**

在 `saveWorld` 的 character update（约 line 138-159）中添加:

```typescript
          activeConversationIdsJson: JSON.stringify(c.activeConversationIds),
```

- [ ] **Step 3: 验证编译**

```bash
npx tsc --noEmit
```
Expected: 无类型错误（或仅有预存问题）。

- [ ] **Step 4: Commit**

```bash
git add src/engine/store.ts
git commit -m "feat: persist activeConversationIds on characters"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

### Task 9: 更新测试

**Files:**
- Modify: `src/engine/dialog.test.ts`

- [ ] **Step 1: 更新 makeChar 工厂函数**

在 `makeChar` 中添加:

```typescript
    activeConversationIds: [],
```

- [ ] **Step 2: 更新 TurnDecideFn mock 类型**

更新 mock turn decide 函数签名以支持新的返回类型 `{ kind: "turn" | "end" }`:

```typescript
const mockTurnDecide: TurnDecideFn = async (input) => ({
  kind: "turn",
  turn: { speakerId: input.self.id, kind: "say", line: "测试回复" },
});
```

- [ ] **Step 3: 新增测试：tick 1 正常对话生成 6 句 + time 消息**

```typescript
it("tick 1 generates 6 sentences + time message", async () => {
  const chars = [makeChar("a", "n1"), makeChar("b", "n1")];
  const actions = [speakAction("a", "b", "嗨")];
  let turnCount = 0;
  const turnDecide = async () => {
    turnCount++;
    return { kind: "turn", turn: { speakerId: turnCount % 2 === 0 ? "a" : "b", kind: "say", line: `第${turnCount}句` } };
  };
  const result = await runDialogPhase({
    rawActions: actions,
    characters: chars,
    nodes: [{ id: "n1", worldId: "w", /* ...minimal node */ } as any],
    perceptions: new Map(),
    tick: 0,
    worldName: "test",
    language: "zh",
    acceptDecide: async () => ({ type: "accept_speak", targetId: "a", reasoning: "ok", selfImportance: 2 }),
    turnDecide: turnDecide as any,
    summaryDecide: async () => "测试摘要",
    salvageDecide: async () => ({ type: "wait", actorId: "a", reasoning: "r", selfImportance: 1 }),
    ongoingConversations: [],
  });
  expect(turnCount).toBe(6);
  // Check time message injected
  const conv = result.updatedConversations[0];
  expect(conv).toBeDefined();
  expect(conv.transcript[conv.transcript.length - 1].speakerId).toBe("__system__");
});
```

- [ ] **Step 4: 新增测试：3+4 规则**

```typescript
it("3+4 rule: end at 6th sentence gives extra round", async () => {
  const chars = [makeChar("a", "n1"), makeChar("b", "n1")];
  const conv: Conversation = {
    id: "conv-1", worldId: "w", initiatorId: "a", acceptorId: "b",
    transcript: [], tickStarted: 0, currentTickRounds: 0, status: "active",
  };
  const actions: Action[] = [];
  let callCount = 0;
  const turnDecide = async () => {
    callCount++;
    if (callCount === 6) {
      return { kind: "end", payload: { reasoning: "该走了", closingLine: "再见" } };
    }
    return { kind: "turn", turn: { speakerId: callCount % 2 === 1 ? "a" : "b", kind: "say", line: `第${callCount}句` } };
  };
  const result = await runDialogPhase({
    rawActions: actions,
    characters: chars,
    nodes: [{ id: "n1", worldId: "w", /* ... */ } as any],
    perceptions: new Map(),
    tick: 0,
    worldName: "test",
    language: "zh",
    acceptDecide: async () => ({ type: "accept_speak", targetId: "a", reasoning: "ok", selfImportance: 2 }),
    turnDecide: turnDecide as any,
    summaryDecide: async () => "ok",
    salvageDecide: async () => ({ type: "wait", actorId: "a", reasoning: "r", selfImportance: 1 }),
    ongoingConversations: [conv],
  });
  // 6 regular turns + 1 extra for 3+4 rule = 7
  expect(callCount).toBe(7);
});
```

- [ ] **Step 5: 新增测试：对话被动结束（接受者离开）**

```typescript
it("passive end when acceptor leaves node", async () => {
  const chars = [makeChar("a", "n1"), makeChar("b", "n2")]; // different nodes
  const conv: Conversation = {
    id: "conv-1", worldId: "w", initiatorId: "a", acceptorId: "b",
    transcript: [], tickStarted: 0, currentTickRounds: 0, status: "active",
  };
  const result = await runDialogPhase({
    rawActions: [],
    characters: chars,
    nodes: [{ id: "n1" } as any, { id: "n2" } as any],
    perceptions: new Map(),
    tick: 1,
    worldName: "test",
    language: "zh",
    acceptDecide: async () => ({ type: "accept_speak", targetId: "a", reasoning: "ok", selfImportance: 2 }),
    turnDecide: async () => ({ kind: "turn", turn: { speakerId: "a", kind: "say", line: "hi" } }),
    summaryDecide: async () => "summary",
    salvageDecide: async () => ({ type: "wait", actorId: "a", reasoning: "r", selfImportance: 1 }),
    ongoingConversations: [conv],
  });
  // Should have ended with passive
  const updatedConv = result.updatedConversations[0];
  if (updatedConv) {
    expect(updatedConv.status).toBe("ended");
    expect(updatedConv.endedBy).toBe("passive");
  }
});
```

- [ ] **Step 6: 运行全部测试**

```bash
npx vitest run src/engine/dialog.test.ts
```
Expected: 全部通过。

- [ ] **Step 7: Commit**

```bash
git add src/engine/dialog.test.ts
git commit -m "test: update dialog tests for multi-tick conversation flow"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

### Task 10: 端到端验证与清理

**Files:**
- Check: 所有编译/类型错误
- Check: 旧引用 `kind: "leave"` 已清理

- [ ] **Step 1: 全局搜索残留的 leave 引用**

```bash
rg "kind.*leave|leave.*kind|\"leave\"" src/
```
Expected: 无结果（或仅在注释/无关处）。

- [ ] **Step 2: 全局编译检查**

```bash
npx tsc --noEmit
```
Expected: 零错误。

- [ ] **Step 3: 运行全量测试**

```bash
npx vitest run
```
Expected: 全部通过。

- [ ] **Step 4: 运行 smoke test**

```bash
npx tsx scripts/smoke-tick.ts
```
Expected: 模拟运行正常，对话跨 tick 执行。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: final cleanup for speak multi-tick conversation flow"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```
