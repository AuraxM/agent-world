/**
 * 共享 ReAct agent 循环 —— 供 Decide / Dialog / Think 三个 agent 复用。
 *
 * - 最多 maxRounds 轮（默认 20），read tools 不消耗轮数
 * - 检测到 terminal tool 时立即返回，由调用方解析具体参数
 * - 轮数耗尽返回 "exhausted"
 * - 保留 DeepSeek reasoning_content 并在每轮回传
 */
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { getLLMClientForEntry, getModelNameForEntry } from "./client";
import { getEntryConfig } from "./providers";
import type { ActionToolDef } from "../domain/schemas";
import type { ToolHandlerContext } from "./tool-handlers";
import {
  READ_HANDLERS,
  WRITE_HANDLERS,
} from "./tool-handlers";

export interface AgentLoopInput {
  systemPrompt: string;
  readTools: ActionToolDef[];
  writeTools: ActionToolDef[];
  terminalToolNames: string[];
  readToolNames: readonly string[];
  llmEntryName: string;
  maxRounds?: number;
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
    maxRounds = 20,
    sharedMessages = [],
    toolHandlerContext: ctx,
    customWriteHandlers = {},
  } = input;

  const client = getLLMClientForEntry(llmEntryName);
  const model = getModelNameForEntry(llmEntryName);
  const config = getEntryConfig(llmEntryName);

  const allTools: ActionToolDef[] = [...readTools, ...writeTools];
  const messages: ChatCompletionMessageParam[] = [...sharedMessages];
  let round = 0;

  while (round < maxRounds) {
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

      // Check if this is a terminal tool
      if (terminalToolNames.includes(toolName)) {
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
      } else if (writeHandler) {
        result = writeHandler(args, ctx);
      } else if (customHandler) {
        result = customHandler(args, ctx);
      } else {
        result = { error: `未知工具: ${toolName}` };
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
  return { kind: "exhausted", messages };
}
