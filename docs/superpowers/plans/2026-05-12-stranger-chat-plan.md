# Stranger Chat 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增"陌生人对话"功能，用户以匿名身份与 NPC 对话，NPC 可翻阅记忆但不能修改任何持久状态。

**Architecture:** 新增一个后端 POST 路由处理陌生人对话请求，使用已有 `runAgentLoop` 仅暴露 read tools 和 `write_dialog`/`end_dialog`。会话存内存 Map。前端 world-view 新增第三个 tab "对话"，包含角色选择、消息列表（含可展开的推理/工具调用）和输入框。

**Tech Stack:** Fastify + Zod（后端），React + TypeScript（前端），已有 `runAgentLoop` agent loop。

---

## 文件结构

每个文件一个清晰职责：
- `backend/src/server/tick.ts` — 新增导出 `isTickActive(worldId)`
- `backend/src/server/routes/stranger-chat.ts` — POST 路由，会话管理，agent loop 编排
- `backend/src/server/index.ts` — 注册新路由
- `frontend/src/components/stranger-chat.tsx` — 聊天 UI 组件
- `frontend/src/components/world-view.tsx` — 新增 tab

---

### Task 1: 暴露 `isTickActive`

**Files:**
- Modify: `backend/src/server/tick.ts:199-218`

- [ ] **Step 1: 新增 `isTickActive` 函数并导出**

在 `_activeTicks` 声明之后（第 199 行后），添加：

```typescript
/** 检查指定 worldId 是否有正在进行中的 tick */
export function isTickActive(worldId: string): boolean {
  for (const key of _activeTicks) {
    if (key.startsWith(`${worldId}:`)) return true;
  }
  return false;
}
```

- [ ] **Step 2: 运行编译检查**

```bash
cd backend && pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/server/tick.ts
git commit -m "feat: expose isTickActive for tick state checking"
```

---

### Task 2: 创建陌生人对话路由

**Files:**
- Create: `backend/src/server/routes/stranger-chat.ts`

- [ ] **Step 1: 创建路由文件**

```typescript
/**
 * 陌生人对话路由。
 *
 * POST /api/worlds/:id/stranger-chat
 *
 * 用户以匿名身份与 NPC 对话。NPC 使用和普通对话相同的 system prompt，
 * 可以通过 read tools 翻阅记忆，但不能写记忆、印象、关系等持久状态。
 * 仅在 tick 停止时可用。
 */
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { loadWorld } from "../../systems/index";
import { buildDialogSystemPrompt } from "../../llm/system-prompts";
import { buildReadTools, ALL_READ_TOOLS, WRITE_DIALOG_TOOL, END_DIALOG_TOOL } from "../../domain/schemas";
import { runAgentLoop } from "../../llm/agent-loop";
import type { AgentLoopResult } from "../../llm/agent-loop";
import type { ToolHandlerContext } from "../../llm/tool-handlers";
import { getEntryConfig } from "../../llm/providers";
import { isTickActive } from "../tick";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const StrangerChatBody = z.object({
  characterId: z.string().min(1),
  message: z.string().min(1).max(2000),
  sessionId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Session management (in-memory, 30min TTL)
// ---------------------------------------------------------------------------

interface ChatSession {
  worldId: string;
  characterId: string;
  sharedMessages: any[];
  lastActivity: number;
}

const sessions = new Map<string, ChatSession>();

// 每 10 分钟清理 30 分钟未活动的 session
setInterval(() => {
  const now = Date.now();
  for (const [id, sess] of sessions) {
    if (now - sess.lastActivity > 30 * 60 * 1000) {
      sessions.delete(id);
    }
  }
}, 10 * 60 * 1000).unref();

// ---------------------------------------------------------------------------
// Tool builders (write_dialog + end_dialog only)
// ---------------------------------------------------------------------------

function makeWriteDialogTool() {
  return {
    type: "function" as const,
    function: {
      name: "write_dialog",
      description: "说一句话给陌生人。必填 content（你要说的话）。这是你唯一能用的回复方式。",
      parameters: {
        type: "object" as const,
        properties: {
          content: { type: "string", description: "你要说的话" },
        },
        required: ["content"],
      },
    },
  };
}

function makeEndDialogTool() {
  return {
    type: "function" as const,
    function: {
      name: "end_dialog",
      description: "结束当前对话。可选 summary（对这段对话的简短总结）",
      parameters: {
        type: "object" as const,
        properties: {
          summary: { type: "string", description: "对话总结" },
        },
        required: [],
      },
    },
  };
}

const STRANGER_CHAT_WRITE_TOOLS = [makeWriteDialogTool(), makeEndDialogTool()];
const STRANGER_CHAT_TERMINAL_NAMES = [WRITE_DIALOG_TOOL, END_DIALOG_TOOL];

// ---------------------------------------------------------------------------
// Reasoning & tool call extraction
// ---------------------------------------------------------------------------

interface ExtractedToolCall {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

function extractReasoningAndTools(messages: any[]): {
  reasoning: string;
  toolCalls: ExtractedToolCall[];
} {
  const reasoningParts: string[] = [];
  const toolCalls: ExtractedToolCall[] = [];
  const pendingToolCalls: Map<string, { name: string; args: Record<string, unknown> }> = new Map();

  for (const msg of messages) {
    // Extract reasoning_content from assistant messages
    if (msg.role === "assistant" && msg.reasoning_content) {
      reasoningParts.push(String(msg.reasoning_content));
    }

    // Track tool calls
    if (msg.role === "assistant" && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.type !== "function") continue;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch { /* empty */ }
        pendingToolCalls.set(tc.id, { name: tc.function.name, args });
      }
    }

    // Match tool results to calls
    if (msg.role === "tool" && msg.tool_call_id) {
      const pending = pendingToolCalls.get(msg.tool_call_id);
      if (pending) {
        let result: unknown = msg.content;
        try {
          result = JSON.parse(String(msg.content));
        } catch { /* use raw string */ }
        toolCalls.push({ name: pending.name, args: pending.args, result });
        pendingToolCalls.delete(msg.tool_call_id);
      }
    }
  }

  return { reasoning: reasoningParts.join("\n\n"), toolCalls };
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const strangerChatRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { id: string } }>("/:id/stranger-chat", async (req, reply) => {
    const parsed = StrangerChatBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "invalid body",
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      });
    }

    const { id: worldId } = req.params;
    const { characterId, message, sessionId: inputSessionId } = parsed.data;

    // 1. Check tick not active
    if (isTickActive(worldId)) {
      return reply.status(409).send({ error: "tick 运行中，无法对话" });
    }

    // 2. Load world + character
    let snapshot;
    try {
      snapshot = loadWorld(worldId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("world not found")) {
        return reply.status(404).send({ error: msg });
      }
      return reply.status(500).send({ error: msg });
    }

    const character = snapshot.characters.find((c) => c.id === characterId);
    if (!character) {
      return reply.status(404).send({ error: `character not found: ${characterId}` });
    }

    // 3. Get or create session
    let session: ChatSession;
    let sessionId: string;

    if (inputSessionId && sessions.has(inputSessionId)) {
      session = sessions.get(inputSessionId)!;
      sessionId = inputSessionId;
      // Validate session consistency
      if (session.worldId !== worldId || session.characterId !== characterId) {
        return reply.status(400).send({ error: "session 与 world/character 不匹配" });
      }
    } else {
      sessionId = `sc-${randomUUID().slice(0, 8)}`;
      session = {
        worldId,
        characterId,
        sharedMessages: [],
        lastActivity: Date.now(),
      };
      sessions.set(sessionId, session);
    }

    // 4. Build system prompt — reuse dialog prompt, peer is anonymous stranger
    const selfName = character.name;
    const systemPrompt = buildDialogSystemPrompt(selfName, "一个陌生的路人")
      .replace("4. 你可以在对话中提议动作（赠送物品、邀请同行等）\n", "")
      .replace("5. write_propose_action / write_respond_action 不能结束本轮，调用后仍需调到 write_dialog 或 end_dialog\n", "");

    // 5. Add user message to sharedMessages
    session.sharedMessages.push({
      role: "user",
      content: `[陌生人] ${message}`,
    });

    // 6. Build context for agent loop
    const nodes = snapshot.nodes;
    const allCharacters = snapshot.characters;
    const tick = snapshot.world.currentTick;
    const epoch = snapshot.world.epoch;

    const ctx: ToolHandlerContext = {
      self: character,
      allCharacters,
      nodes,
      tick,
      epoch,
      worldId,
    };

    const config = getEntryConfig("dialog_turn");

    // 7. Run agent loop
    let result: AgentLoopResult;
    try {
      result = await runAgentLoop({
        systemPrompt,
        readTools: buildReadTools(),
        writeTools: STRANGER_CHAT_WRITE_TOOLS,
        terminalToolNames: STRANGER_CHAT_TERMINAL_NAMES,
        readToolNames: ALL_READ_TOOLS,
        llmEntryName: "dialog_turn",
        timeBudgetMs: config.timeBudgetMs,
        sharedMessages: session.sharedMessages,
        toolHandlerContext: ctx,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: `LLM 调用失败: ${msg}` });
    }

    // 8. Extract reply
    let reply: string;
    if (result.kind === "terminal") {
      if (result.terminalToolName === WRITE_DIALOG_TOOL) {
        reply = (result.terminalArgs?.content as string) ?? "";
      } else if (result.terminalToolName === END_DIALOG_TOOL) {
        const summary = (result.terminalArgs?.summary as string) ?? "";
        reply = summary || "对话结束。";
      } else {
        reply = "（未生成回复）";
      }
    } else {
      reply = "（对话超时）";
    }

    // 9. Extract reasoning and tool calls
    const { reasoning, toolCalls } = extractReasoningAndTools(result.messages);

    // 10. Save session state
    session.sharedMessages = result.messages;
    session.lastActivity = Date.now();
    sessions.set(sessionId, session);

    // 11. Return
    return reply.send({ sessionId, reply, reasoning, toolCalls });
  });
};
```

- [ ] **Step 2: 运行编译检查**

```bash
cd backend && pnpm exec tsc --noEmit
```
Expected: no errors. If there are any, fix them.

- [ ] **Step 3: Commit**

```bash
git add backend/src/server/routes/stranger-chat.ts
git commit -m "feat: add stranger chat POST route"
```

---

### Task 3: 注册陌生人对话路由

**Files:**
- Modify: `backend/src/server/index.ts:1-18`

- [ ] **Step 1: 导入并注册 strangerChatRoutes**

```typescript
// 在 imports 区域添加
import { strangerChatRoutes } from "./routes/stranger-chat.js";

// 在 register 调用区域（configRoutes 之后）添加
await app.register(strangerChatRoutes, { prefix: "/api/worlds" });
```

完整修改后的 `index.ts`：

```typescript
import Fastify from "fastify";
import cors from "@fastify/cors";
import { worldRoutes } from "./routes/worlds.js";
import { characterRoutes } from "./routes/characters.js";
import { configRoutes } from "./routes/config.js";
import { adminRoutes } from "./routes/admin.js";
import { strangerChatRoutes } from "./routes/stranger-chat.js";

const port = parseInt(process.env.PORT ?? "3001", 10);
const host = process.env.HOST ?? "0.0.0.0";

start();

async function start() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  await app.register(worldRoutes, { prefix: "/api/worlds" });
  await app.register(characterRoutes, { prefix: "/api/worlds" });
  await app.register(strangerChatRoutes, { prefix: "/api/worlds" });
  await app.register(configRoutes, { prefix: "/api/configs" });
  await app.register(adminRoutes, { prefix: "/api/admin" });

  app.get("/api/health", async () => ({ status: "ok" }));

  try {
    await app.listen({ port, host });
    console.log(`Server running on http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
```

- [ ] **Step 2: 运行编译检查**

```bash
cd backend && pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/server/index.ts
git commit -m "feat: register stranger-chat route"
```

---

### Task 4: 创建前端 StrangerChat 组件

**Files:**
- Create: `frontend/src/components/stranger-chat.tsx`

- [ ] **Step 1: 创建组件文件**

```typescript
"use client";

import { useState, useRef, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

interface ChatMessage {
  id: string;
  role: "user" | "npc";
  content: string;
  reasoning?: string;
  toolCalls?: ToolCall[];
}

interface Character {
  id: string;
  name: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// StrangerChat Component
// ---------------------------------------------------------------------------

export function StrangerChat({
  worldId,
  characters,
  loading: tickLoading,
}: {
  worldId: string;
  characters: Character[];
  loading: boolean;
}) {
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !selectedCharId || tickLoading) return;

    setInput("");
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);

    try {
      const res = await fetch(`/api/worlds/${worldId}/stranger-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: selectedCharId,
          message: text,
          sessionId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `${res.status}` }));
        const npcMsg: ChatMessage = {
          id: `n-${Date.now()}`,
          role: "npc",
          content: `错误：${err.error ?? res.status}`,
        };
        setMessages((prev) => [...prev, npcMsg]);
        return;
      }

      const data = await res.json();

      // Save sessionId for subsequent messages
      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId);
      }

      const npcMsg: ChatMessage = {
        id: `n-${Date.now()}`,
        role: "npc",
        content: data.reply,
        reasoning: data.reasoning || undefined,
        toolCalls: data.toolCalls?.length ? data.toolCalls : undefined,
      };
      setMessages((prev) => [...prev, npcMsg]);
    } catch (err) {
      const npcMsg: ChatMessage = {
        id: `n-${Date.now()}`,
        role: "npc",
        content: `网络错误：${err instanceof Error ? err.message : String(err)}`,
      };
      setMessages((prev) => [...prev, npcMsg]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const toggleExpand = (msgId: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  // Reset when character changes
  const handleCharChange = (charId: string) => {
    setSelectedCharId(charId);
    setSessionId(null);
    setMessages([]);
  };

  const selectedCharName = characters.find((c) => c.id === selectedCharId)?.name;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Character selector */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-white/10 bg-black/15">
        <select
          value={selectedCharId ?? ""}
          onChange={(e) => handleCharChange(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded px-3 py-1.5 text-[12px] text-white/90 focus:outline-none focus:border-(--accent-strong)/50"
        >
          <option value="" disabled>
            选择角色…
          </option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Message list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && selectedCharId && (
          <div className="text-center text-white/25 text-[12px] mt-8">
            以陌生人的身份与 {selectedCharName} 开始对话
          </div>
        )}
        {messages.length === 0 && !selectedCharId && (
          <div className="text-center text-white/25 text-[12px] mt-8">
            选择一个角色，开始对话
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] rounded-lg px-3 py-2 ${
                msg.role === "user"
                  ? "bg-(--accent-strong)/15 text-white/90"
                  : "bg-white/5 text-white/85 border border-white/10"
              }`}
            >
              {/* Sender label */}
              <div className="text-[9px] text-white/35 mb-0.5">
                {msg.role === "user" ? "陌生人" : selectedCharName ?? "NPC"}
              </div>

              {/* Content */}
              <div className="text-[12px] leading-relaxed whitespace-pre-wrap">
                {msg.content}
              </div>

              {/* Expandable reasoning */}
              {(msg.reasoning || msg.toolCalls) && (
                <div className="mt-2 pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => toggleExpand(msg.id)}
                    className="text-[10px] text-white/40 hover:text-white/70 transition-colors cursor-pointer"
                  >
                    {expandedMessages.has(msg.id) ? "▼" : "▶"} 思考过程
                    {msg.toolCalls ? `（${msg.toolCalls.length} 个工具调用）` : ""}
                  </button>

                  {expandedMessages.has(msg.id) && (
                    <div className="mt-1.5 space-y-1.5">
                      {/* Reasoning */}
                      {msg.reasoning && (
                        <div className="bg-black/20 rounded p-2">
                          <div className="text-[9px] text-white/30 mb-1">推理</div>
                          <div className="text-[10px] text-white/60 whitespace-pre-wrap leading-relaxed">
                            {msg.reasoning}
                          </div>
                        </div>
                      )}

                      {/* Tool calls */}
                      {msg.toolCalls?.map((tc, i) => (
                        <div key={i} className="bg-black/20 rounded p-2">
                          <div className="text-[9px] text-(--accent-strong)/60 mb-1 font-mono">
                            {tc.name}
                          </div>
                          <div className="text-[9px] text-white/30 mb-0.5">
                            参数: {JSON.stringify(tc.args)}
                          </div>
                          <div className="text-[9px] text-white/40 whitespace-pre-wrap break-all">
                            返回值: {JSON.stringify(tc.result, null, 1)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Sending indicator */}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2">
              <div className="text-[9px] text-white/35 mb-0.5">{selectedCharName ?? "NPC"}</div>
              <div className="text-[12px] text-white/40 animate-pulse">正在思考…</div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-white/10 p-3 bg-black/15">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!selectedCharId || tickLoading || sending}
            placeholder={
              tickLoading
                ? "Tick 运行中，请等待…"
                : !selectedCharId
                  ? "请先选择角色"
                  : "输入消息…"
            }
            className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-[12px] text-white/90 placeholder:text-white/20 focus:outline-none focus:border-(--accent-strong)/50 disabled:opacity-30 disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!selectedCharId || !input.trim() || tickLoading || sending}
            className="px-4 py-1.5 bg-(--accent-strong)/15 border border-(--accent-strong)/25 rounded text-[12px] text-(--accent-strong) hover:bg-(--accent-strong)/25 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 运行 TypeScript 检查**

```bash
cd frontend && pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/stranger-chat.tsx
git commit -m "feat: add StrangerChat component"
```

---

### Task 5: 在 world-view 中新增"对话"tab

**Files:**
- Modify: `frontend/src/components/world-view.tsx`

- [ ] **Step 1: 导入 StrangerChat 组件**

在 import 区域（第 12 行后）添加：

```typescript
import { StrangerChat } from "./stranger-chat";
```

- [ ] **Step 2: 扩展 centerTab 类型和新增 tab**

修改第 18 行 `centerTab` 类型和第 103-115 行 tab bar：

```typescript
// 第 18 行: centerTab 初始值不变，类型扩展
const [centerTab, setCenterTab] = useState<"stream" | "gantt" | "chat">("stream");
```

```typescript
// 第 103-116 行 tab bar 替换为:
{(["stream", "gantt", "chat"] as const).map((key) => (
  <button
    key={key}
    type="button"
    onClick={() => setCenterTab(key)}
    className={`px-4 py-2.5 text-[11px] tracking-[0.1em] uppercase cursor-pointer border-b-2 -mb-px transition-colors ${
      centerTab === key
        ? "text-(--accent-strong) border-(--accent-strong)"
        : "text-white/35 border-transparent hover:text-white/60"
    }`}
  >
    {key === "stream" ? "事件流" : key === "gantt" ? "甘特图" : "对话"}
  </button>
))}
```

- [ ] **Step 3: 新增 tab content case**

在现有两个 tab content 之后（第 152 行后），添加：

```typescript
{centerTab === "chat" && (
  <StrangerChat
    worldId={snapshot.world.id}
    characters={snapshot.characters}
    loading={loading}
  />
)}
```

- [ ] **Step 4: 运行 TypeScript 检查**

```bash
cd frontend && pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/world-view.tsx
git commit -m "feat: add stranger-chat tab to world view"
```

---

### Task 6: 端到端验证

- [ ] **Step 1: 启动后端**

```bash
cd backend && pnpm dev
```

- [ ] **Step 2: 启动前端**

```bash
cd frontend && pnpm dev
```

- [ ] **Step 3: 浏览器验证**

1. 打开 `http://localhost:3000`，进入一个世界
2. 确认看到第三个 tab "对话"
3. 选择一个角色，输入消息发送
4. 确认收到 NPC 回复
5. 展开"思考过程"，确认看到 reasoning 和 tool calls
6. 发送追问，确认多轮对话正常
7. 启动 tick 后尝试发送消息，确认输入框被禁用
8. 停止 tick 后确认输入框恢复
