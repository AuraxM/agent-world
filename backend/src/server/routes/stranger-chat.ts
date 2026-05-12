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
    if (msg.role === "assistant" && msg.reasoning_content) {
      reasoningParts.push(String(msg.reasoning_content));
    }

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

    const character = snapshot.characters.find((c: any) => c.id === characterId);
    if (!character) {
      return reply.status(404).send({ error: `character not found: ${characterId}` });
    }

    // 3. Get or create session
    let session: ChatSession;
    let sessionId: string;

    if (inputSessionId && sessions.has(inputSessionId)) {
      session = sessions.get(inputSessionId)!;
      sessionId = inputSessionId;
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

    // 4. Build system prompt
    const selfName = character.name;
    const systemPrompt = buildDialogSystemPrompt(selfName, "一个陌生的路人")
      .replace("3. 你可以在对话中提议动作（赠送物品、邀请同行等）\n", "")
      .replace("5. write_propose_action / write_respond_action 不能结束本轮，调用后仍需调到 write_dialog 或 end_dialog\n", "");

    // 5. Add user message
    session.sharedMessages.push({
      role: "user",
      content: `[陌生人] ${message}`,
    });

    // 6. Build context
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

    // 8. Extract reply text
    let replyText: string;
    if (result.kind === "terminal") {
      if (result.terminalToolName === WRITE_DIALOG_TOOL) {
        replyText = (result.terminalArgs?.content as string) ?? "";
      } else if (result.terminalToolName === END_DIALOG_TOOL) {
        replyText = ((result.terminalArgs?.summary as string) || "对话结束。");
      } else {
        replyText = "（未生成回复）";
      }
    } else {
      replyText = "（对话超时）";
    }

    // 9. Extract reasoning and tool calls
    const { reasoning, toolCalls } = extractReasoningAndTools(result.messages);

    // 10. Save session
    session.sharedMessages = result.messages;
    session.lastActivity = Date.now();
    sessions.set(sessionId, session);

    // 11. Return
    return reply.send({ sessionId, reply: replyText, reasoning, toolCalls });
  });
};
