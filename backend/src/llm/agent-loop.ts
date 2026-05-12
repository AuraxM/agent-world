/**
 * 共享 ReAct agent 循环 —— 供 Decide / Dialog / Think 三个 agent 复用。
 *
 * - 受 timeBudgetMs 时间预算控制（默认 5000ms），read tools 不消耗计数
 * - 检测到 terminal tool 时立即返回，由调用方解析具体参数
 * - 时间预算耗尽返回 "exhausted"
 * - 保留 DeepSeek reasoning_content 并在每轮回传
 */
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";
import { getLLMClientForEntry, getModelNameForEntry } from "./client";
import { getEntryConfig } from "./providers";
import type { ActionToolDef } from "../domain/schemas";
import {
  ReadMemoriesParamsSchema, ReadCharacterParamsSchema, ReadRelationsParamsSchema,
  ReadEventsParamsSchema,
  WriteDecisionParamsSchema, WriteDialogParamsSchema, WriteProposeActionParamsSchema,
  WriteRespondActionParamsSchema, EndDialogParamsSchema, WriteMemoryParamsSchema,
  DeleteMemoryParamsSchema, WriteImpressionParamsSchema, WriteNotebookParamsSchema,
  WriteLikeParamsSchema, WriteDislikeParamsSchema, WriteShortTermGoalParamsSchema,
  WriteLongTermGoalParamsSchema, WriteRelationParamsSchema, EndThinkingParamsSchema,
} from "../domain/schemas";
import type { ToolHandlerContext } from "./tool-handlers";
import {
  READ_HANDLERS,
  WRITE_HANDLERS,
} from "./tool-handlers";
import { createLogger } from "../shared/index";

const agentLog = createLogger("llm-agent-loop");

const PARAM_SCHEMAS: Record<string, z.ZodType> = {
  read_memories: ReadMemoriesParamsSchema,
  read_character: ReadCharacterParamsSchema,
  read_relations: ReadRelationsParamsSchema,
  read_events: ReadEventsParamsSchema,
  write_decision: WriteDecisionParamsSchema,
  write_dialog: WriteDialogParamsSchema,
  write_propose_action: WriteProposeActionParamsSchema,
  write_respond_action: WriteRespondActionParamsSchema,
  end_dialog: EndDialogParamsSchema,
  write_memory: WriteMemoryParamsSchema,
  delete_memory: DeleteMemoryParamsSchema,
  write_impression: WriteImpressionParamsSchema,
  write_notebook: WriteNotebookParamsSchema,
  write_like: WriteLikeParamsSchema,
  write_dislike: WriteDislikeParamsSchema,
  write_short_term_goal: WriteShortTermGoalParamsSchema,
  write_long_term_goal: WriteLongTermGoalParamsSchema,
  write_relation: WriteRelationParamsSchema,
  end_thinking: EndThinkingParamsSchema,
};

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
  /** Custom handlers for agent-specific terminal tools (e.g. write_decision is terminal but custom) */
  customWriteHandlers?: Record<string, (args: any, ctx: ToolHandlerContext) => Record<string, unknown>>;
}

export interface AgentLoopResult {
  kind: "terminal" | "exhausted";
  terminalToolName?: string;
  terminalArgs?: Record<string, unknown>;
  messages: ChatCompletionMessageParam[];
}

export async function runAgentLoop(input: AgentLoopInput): Promise<AgentLoopResult> {
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

  const client = getLLMClientForEntry(llmEntryName);
  const model = getModelNameForEntry(llmEntryName);
  const config = getEntryConfig(llmEntryName);

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

    const extra: Record<string, unknown> = {};
    if (config.thinkingEnabled) extra.thinking = { type: "enabled" };

    // Determine max_tokens based on entry type
    const maxTokens = llmEntryName === "decide" ? 16384 : 4096;

    const response = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      tools: allTools.map((t) => ({
        type: "function" as const,
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters as Record<string, unknown>,
        },
      })),
      ...extra,
    });

    const choice = response.choices[0]?.message;
    if (!choice) throw new Error("LLM 未返回有效 choice");

    // Log reasoning_content (DeepSeek think process)
    const reasoningContent = (choice as unknown as Record<string, unknown>).reasoning_content as string | undefined;
    const toolCallNames = (choice.tool_calls ?? []).map((tc: any) => tc.function?.name ?? "?");

    const reasoningPreview = reasoningContent
      ? (reasoningContent.length > 300 ? reasoningContent.slice(0, 300) + "…" : reasoningContent)
      : "(无 reasoning)";
    const textPreview = !choice.tool_calls?.length
      ? (typeof choice.content === "string" ? choice.content.slice(0, 200) : "")
      : "";

    console.log(`[${agentType}] round ${round + 1} | 角色: ${ctx.self.name} | 已用: ${elapsed}ms/${timeBudgetMs}ms | 工具: [${toolCallNames.join(", ")}] | reasoning: ${reasoningPreview.slice(0, 100)}${textPreview ? ` | text: ${textPreview.slice(0, 80)}` : ""}`);
    agentLog.info(`${agentType} round ${round + 1}`, {
      character: ctx.self.name,
      elapsedMs: elapsed,
      budgetMs: timeBudgetMs,
      reasoning: reasoningPreview,
      toolCalls: toolCallNames,
      textResponse: textPreview || undefined,
    });

    // Build assistant message — preserve reasoning_content for DeepSeek
    // (must be re-passed in every subsequent request)
    const assistantMsg: Record<string, unknown> = {
      role: "assistant",
      content: choice.content ?? null,
    };
    if ((choice as unknown as Record<string, unknown>).reasoning_content) {
      assistantMsg.reasoning_content = (choice as unknown as Record<string, unknown>).reasoning_content;
    }
    if (choice.tool_calls) {
      assistantMsg.tool_calls = choice.tool_calls;
    }
    messages.push(assistantMsg as unknown as ChatCompletionMessageParam);

    // Handle text-only response (re-prompt)
    if (!choice.tool_calls || choice.tool_calls.length === 0) {
      messages.push({
        role: "user",
        content: "请使用工具来完成你的任务。你必须调用一个 write_* 工具来产出结果。",
      } as ChatCompletionMessageParam);
      round++;
      continue;
    }

    for (const tc of choice.tool_calls) {
      if (tc.type !== "function") continue;

      const toolName = tc.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        args = {};
      }

      // Coerce string-valued numbers (LLMs often serialize numbers as strings in JSON)
      for (const [k, v] of Object.entries(args)) {
        if (typeof v === "string" && /^-?\d+$/.test(v)) {
          args[k] = Number(v);
        }
      }

      // Validate args against schema if one exists
      const paramSchema = PARAM_SCHEMAS[toolName];
      if (paramSchema) {
        const parsed = paramSchema.safeParse(args);
        if (!parsed.success) {
          agentLog.warn(`${agentType} 参数校验失败`, {
            character: ctx.self.name,
            tool: toolName,
            error: parsed.error.message,
            received: JSON.stringify(args).slice(0, 300),
          });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({
              error: `参数校验失败：${parsed.error.message}`,
              received: args,
            }),
          } as ChatCompletionMessageParam);
          if (!(readToolNames as readonly string[]).includes(toolName)) round++;
          continue;
        }
        args = parsed.data as Record<string, unknown>;
      }

      // Check if this is a terminal tool
      if (terminalToolNames.includes(toolName)) {
        agentLog.info(`${agentType} 终端工具调用`, {
          character: ctx.self.name,
          tool: toolName,
          args: JSON.stringify(args).slice(0, 500),
          totalRounds: round + 1,
        });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify({ accepted: true }),
        } as ChatCompletionMessageParam);
        return {
          kind: "terminal",
          terminalToolName: toolName,
          terminalArgs: args,
          messages,
        };
      }

      // Execute handler
      let result: unknown;
      const readHandler = READ_HANDLERS[toolName];
      const writeHandler = WRITE_HANDLERS[toolName];
      const customHandler = customWriteHandlers[toolName];

      if (readHandler) {
        result = readHandler(args, ctx);
        agentLog.info(`${agentType} read 工具执行`, {
          character: ctx.self.name,
          tool: toolName,
          summary: summarizeToolResult(toolName, result),
        });
      } else if (writeHandler) {
        result = writeHandler(args, ctx);
        agentLog.info(`${agentType} write 工具执行`, {
          character: ctx.self.name,
          tool: toolName,
          result: summarizeToolResult(toolName, result),
        });
      } else if (customHandler) {
        result = customHandler(args, ctx);
      } else {
        result = { error: `未知工具: ${toolName}` };
        agentLog.warn(`${agentType} 未知工具`, { character: ctx.self.name, tool: toolName });
      }

      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      } as ChatCompletionMessageParam);

      // Only non-read tools consume rounds
      if (!(readToolNames as readonly string[]).includes(toolName)) {
        round++;
      }
    }
  }

  // Exhausted — return without terminal
  agentLog.warn(`${agentType} agent loop 时间预算耗尽`, {
    character: ctx.self.name,
    totalRounds: round,
    elapsedMs: Date.now() - t0,
    budgetMs: timeBudgetMs,
  });
  return { kind: "exhausted", messages };
}

/** 为日志浓缩工具返回值，避免打印完整记忆/地图文本 */
function summarizeToolResult(toolName: string, result: unknown): string {
  if (typeof result === "string") {
    return result.length > 300 ? result.slice(0, 300) + "…" : result;
  }
  if (typeof result !== "object" || result === null) return String(result);
  const r = result as Record<string, unknown>;

  if (toolName === "read_memories") {
    return `${r.total_matching} 条匹配，返回 ${r.returned} 条 (层: ${r.layer})`;
  }
  if (toolName === "read_profile") {
    return `${r.name} — ${r.profession}，${r.personality}`;
  }
  if (toolName === "read_vitals") {
    return `饥饿: ${r.hunger}，疲劳: ${r.fatigue}，卫生: ${r.hygiene}`;
  }
  if (toolName === "read_emotion") {
    return `心情: ${r.mood}，压力: ${r.stress}，社交: ${r.social_satiety}`;
  }
  if (toolName === "read_map") {
    return `位置: ${r.current_location}`;
  }
  if (toolName === "read_companions") {
    return `${r.count} 人: ${(r.companions as Array<{name: string}> | undefined)?.map((c) => c.name).join(", ") ?? ""}`;
  }
  if (toolName === "read_relations") {
    const rels = r.relations as Array<{character_name: string; relations: string[]}> | undefined;
    return `${rels?.length ?? 0} 条关系`;
  }
  if (toolName === "read_events") {
    const events = r.events as Array<{description: string}> | undefined;
    return `${events?.length ?? 0} 条事件`;
  }
  if (toolName === "read_character") {
    return `${r.name} — ${r.profession}`;
  }
  if (toolName === "write_memory") {
    return r.error ? `错误: ${r.error}` : `层: ${r.layer}, ${r.created ? "新建" : "合并"} ${(r as any).id ?? ""}`;
  }
  if (toolName === "delete_memory") {
    return r.error ? `错误: ${r.error}` : `已删除 ${r.deleted}，层剩余 ${r.remaining}`;
  }
  if (toolName === "write_decision") {
    return `action_type: ${r.action_type ?? (r as any).action_type}`;
  }
  if (toolName === "write_dialog") {
    return `content: ${String((r as any).content ?? "").slice(0, 150)}`;
  }
  if (r.error) return `错误: ${r.error}`;
  if (r.success !== undefined) return r.success ? "成功" : "失败";
  return JSON.stringify(r).slice(0, 200);
}
