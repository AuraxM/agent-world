/**
 * 单 NPC 决策入口（OpenAI-compatible function calling）。
 *
 * - llmDecide: 主决策入口，使用 agent-loop 架构
 * - llmDialogSummarize: 对话摘要
 * - llmAcceptDecide: 接受/拒绝对话邀请（遗留，后续重构）
 * - llmSalvageDecide: 补救轮回退
 */
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import type { Action, Character, DialogTurn, Language, MapNode, WorldEvent } from "../domain/index";
import type { ItemDefinition, Shop } from "../domain/index";
import type { AggregatedFacts } from "../systems/index";
import { getLLMClientForEntry, getModelNameForEntry, hasApiKey } from "./client";
import { getEntryConfig } from "./providers";
import { type ActionContext, type GlobalEventDef } from "../domain/index";
import type { ActionOption } from "../systems/index";
import { TICKS_PER_HOUR } from "../domain/enums";
import { buildDecideSystemPrompt } from "./system-prompts";
import { buildReadTools, buildDecideWriteTools, WRITE_DECISION_TOOL, ALL_READ_TOOLS } from "../domain/schemas";
import { runAgentLoop } from "./agent-loop";
import type { ToolHandlerContext } from "./tool-handlers";
import {
  buildAcceptDecisionPrompt,
  buildDialogSummaryPrompt,
  languageInstruction,
} from "./prompt";
import { createLogger } from "../shared/index";

export interface DecideInput {
  character: Character;
  nodes: MapNode[];
  here: MapNode;
  companions: Character[];
  reachable: MapNode[];
  perceived: WorldEvent[];
  options: ActionOption[];
  worldName: string;
  tick: number;
  epoch: number;
  facts: AggregatedFacts;
  language: Language;
  ctx: ActionContext;
  allCharacters: Character[];
  activeEventDefs: GlobalEventDef[];
  upcomingNotebookText: string;
  shops?: Shop[];
  itemDefs?: Map<string, ItemDefinition>;
}

export type DecideFn = (input: DecideInput) => Promise<Action>;

const decideLog = createLogger("llm-decide");
const acceptLog = createLogger("llm-accept");
const summaryLog = createLogger("llm-summary");
const salvageLog = createLogger("llm-salvage");

// ---------------------------------------------------------------------------
// Local structural types for OpenAI-compatible API responses.
// ---------------------------------------------------------------------------

interface LLMToolCall {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface LLMAssistantMessage {
  role?: string;
  content?: unknown;
  tool_calls?: LLMToolCall[];
  reasoning_content?: unknown;
  refusal?: unknown;
}

interface LLMResponseChoice {
  finish_reason?: string;
  message?: LLMAssistantMessage;
}

interface LLMResponse {
  choices?: LLMResponseChoice[];
}

// ---------------------------------------------------------------------------
// Main decide entry (agent-loop)
// ---------------------------------------------------------------------------

export async function llmDecide(input: DecideInput): Promise<Action> {
  console.log(`[Decide] llmDecide 开始 | 角色: ${input.character.name} | tick: ${input.tick}`);
  decideLog.info("llmDecide 开始", { character: input.character.name, tick: input.tick });

  if (!hasApiKey()) {
    decideLog.warn("llmDecide 无 API key，回退 wait", { character: input.character.name });
    return createFallbackAction(input);
  }

  let systemPrompt: string;
  let readTools: ReturnType<typeof buildReadTools>;
  let writeTools: ReturnType<typeof buildDecideWriteTools>;

  try {
    systemPrompt = buildDecideSystemPrompt();
    readTools = buildReadTools();
    writeTools = buildDecideWriteTools(input.options);
    decideLog.info("llmDecide tools 构建完成", {
      character: input.character.name,
      readToolCount: readTools.length,
      writeToolCount: writeTools.length,
    });
  } catch (err) {
    decideLog.error("llmDecide tools 构建失败", {
      character: input.character.name,
      error: err instanceof Error ? err.message : String(err),
    });
    return createFallbackAction(input);
  }

  const toolHandlerContext: ToolHandlerContext = {
    self: input.character,
    allCharacters: input.allCharacters,
    nodes: input.nodes,
    shops: input.shops,
    itemDefs: input.itemDefs as unknown as unknown[],
    tick: input.tick,
    epoch: input.epoch,
    worldId: input.character.worldId,
    worldDescription: input.worldName,
    perceptions: new Map([[input.character.id, input.perceived]]),
    activeEventDefs: input.activeEventDefs,
    upcomingNotebookText: input.upcomingNotebookText,
  };

  // Inject a time-progression reminder when continuing from a previous exhausted session
  let sharedMessages: any[] | undefined;
  if (input.character.pendingDecideMessages) {
    const MS_PER_TICK = (60 / TICKS_PER_HOUR) * 60 * 1000;
    const gameDate = new Date(input.epoch + input.tick * MS_PER_TICK);
    const hour = gameDate.getHours();
    const minute = gameDate.getMinutes();
    let period: string;
    if (hour < 5) period = "深夜";
    else if (hour < 7) period = "凌晨";
    else if (hour < 9) period = "早晨";
    else if (hour < 12) period = "上午";
    else if (hour < 14) period = "中午";
    else if (hour < 18) period = "下午";
    else if (hour < 22) period = "晚上";
    else period = "深夜";
    const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}（${period}）`;
    const reminderMsg = `[系统] 时间已推进到 ${timeStr}。继续你之前未完成的行动决策。你必须最终调用 write_decision 做出决定。`;
    sharedMessages = [
      ...input.character.pendingDecideMessages,
      { role: "user", content: reminderMsg },
    ];
  }
  // Clear pending immediately so failed continues don't loop forever
  delete input.character.pendingDecideMessages;

  let result;
  try {
    result = await runAgentLoop({
      systemPrompt,
      readTools,
      writeTools,
      terminalToolNames: [WRITE_DECISION_TOOL],
      readToolNames: ALL_READ_TOOLS,
      llmEntryName: "decide",
      maxRounds: 20,
      sharedMessages: sharedMessages as any,
      toolHandlerContext,
    });
    decideLog.info("llmDecide agent loop 结束", {
      character: input.character.name,
      kind: result.kind,
      terminalTool: result.terminalToolName,
    });
  } catch (err) {
    decideLog.error("llmDecide agent loop 异常", {
      character: input.character.name,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
    });
    return createFallbackAction(input);
  }

  if (result.kind === "terminal" && result.terminalToolName === WRITE_DECISION_TOOL && result.terminalArgs) {
    decideLog.info("llmDecide 成功", {
      character: input.character.name,
      actionType: result.terminalArgs.action_type,
    });
    return payloadToAction(result.terminalArgs, input);
  }

  // Fallback: exhausted round limit — save messages for next tick continuation
  input.character.pendingDecideMessages = result.messages as any;
  decideLog.warn("llmDecide 回退 wait（消息已保存，下 tick 继续）", {
    character: input.character.name,
    reason: result.kind === "exhausted" ? "轮次耗尽" : "无有效终端工具",
    savedMsgCount: result.messages.length,
  });
  return createFallbackAction(input);
}

function createFallbackAction(input: DecideInput): Action {
  return {
    type: "wait",
    actorId: input.character.id,
    reasoning: "LLM 未能完成决策",
    selfImportance: 1,
    skipExecution: true,
    skipMemory: true,
  };
}

// ---------------------------------------------------------------------------
// Action payload conversion
// ---------------------------------------------------------------------------

function payloadToAction(args: Record<string, unknown>, input: DecideInput): Action {
  const actionType = (args.action_type as string) || "look_around";
  return {
    type: actionType,
    actorId: input.character.id,
    targetId: args.target_id as string | undefined,
    targetNodeId: args.target_node_id as string | undefined,
    freeText: args.free_text as string | undefined,
    amount: args.amount as number | undefined,
    reasoning: (args.reason as string) || `执行 ${actionType}`,
    selfImportance: 3,
  };
}

/** 从 LLM response 中提取关键内容用于日志，最多保留 maxLen 字符。 */
function llmResponseSnapshot(resp: unknown, maxLen = 2000): string {
  if (!resp) return "(no response)";
  try {
    const r = resp as LLMResponse;
    const choices = r.choices;
    if (!choices || choices.length === 0) return "(no choices)";
    const msg = choices[0]?.message;
    if (!msg) return `choices[0].message is null; finish_reason=${choices[0]?.finish_reason}; raw=${JSON.stringify(choices[0]).slice(0, maxLen)}`;
    const parts: string[] = [];
    if (msg.role) parts.push(`role=${msg.role}`);
    if (msg.content) {
      const c = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
      parts.push(`content=${c.slice(0, maxLen)}`);
    }
    if (msg.tool_calls) {
      const calls = msg.tool_calls.map((tc: LLMToolCall) => ({
        name: tc.function?.name,
        args: (tc.function?.arguments ?? "").slice(0, 500),
      }));
      parts.push(`tool_calls=${JSON.stringify(calls).slice(0, maxLen)}`);
    }
    if (msg.reasoning_content) {
      parts.push(`reasoning=${String(msg.reasoning_content).slice(0, 500)}`);
    }
    if (msg.refusal) parts.push(`refusal=${String(msg.refusal)}`);
    const result = parts.join(" | ");
    return result.length > maxLen ? result.slice(0, maxLen) : result;
  } catch {
    return "(failed to serialize response)";
  }
}

// ---------------------------------------------------------------------------
// Dialog summary (legacy — standalone, not agent-loop)
// ---------------------------------------------------------------------------

const DIALOG_SUMMARY_TOOL_NAME = "submit_dialog_summary";

const DIALOG_SUMMARY_TOOL_PARAMETERS: Record<string, unknown> = {
  type: "object",
  properties: {
    summary: { type: "string", description: "1-2 句对话摘要（中文）" },
    memorize: {
      type: "array",
      description: "可选：对话后更新的印象列表",
      items: {
        type: "object",
        properties: {
          target_id: { type: "string", description: "目标角色 ID" },
          impression: { type: "string", description: "对目标角色更新的印象" },
        },
        required: ["target_id", "impression"],
      },
    },
  },
  required: ["summary"],
};

export interface DialogSummaryInput {
  openerName: string;
  openerId: string;
  responderName: string;
  responderId: string;
  transcript: DialogTurn[];
  language?: Language;
}

/**
 * 对话摘要：返回 summary 字符串和可选的印象更新。
 * 失败重试 1 次，仍失败返回占位摘要。
 */
export async function llmDialogSummarize(input: DialogSummaryInput): Promise<{ summary: string; memorize?: Array<{ target_id: string; impression: string }> }> {
  if (!hasApiKey()) return { summary: `（摘要生成失败：双方聊了 ${input.transcript.length} 句）` };

  const config = getEntryConfig("dialog_summarize");
  const client = getLLMClientForEntry("dialog_summarize");
  const language: Language = input.language ?? "zh";

  summaryLog.info("LLM dialog_summarize 请求", {
    opener: input.openerName,
    responder: input.responderName,
    turns: input.transcript.length,
  });

  const prompt = buildDialogSummaryPrompt({
    openerName: input.openerName,
    openerId: input.openerId,
    responderName: input.responderName,
    responderId: input.responderId,
    transcript: input.transcript,
    language,
  });

  const tool: ChatCompletionTool = {
    type: "function",
    function: {
      name: DIALOG_SUMMARY_TOOL_NAME,
      description: "返回对话摘要。",
      parameters: DIALOG_SUMMARY_TOOL_PARAMETERS,
    },
  };

  const extra: Record<string, unknown> = {};
  if (config.thinkingEnabled) extra.thinking = { type: "enabled" };

  let lastError: string | undefined;
  let lastResponseSnapshot = "(no response)";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: getModelNameForEntry("dialog_summarize"),
        max_tokens: 2048,
        messages: [
          {
            role: "system",
            content: `你是一个摘要助手。请用 1-2 句话总结以下对话的核心内容与氛围。\n\n${languageInstruction(language)}`,
          },
          { role: "user", content: prompt },
        ],
        tools: [tool],
        ...extra,
      });
      lastResponseSnapshot = llmResponseSnapshot(response);

      const message = response.choices[0]?.message;
      const toolCall = message?.tool_calls?.find(
        (c) => c.type === "function" && c.function.name === DIALOG_SUMMARY_TOOL_NAME,
      );
      if (!toolCall || toolCall.type !== "function") {
        throw new Error(`LLM 没有返回 dialog_summary tool_call。响应：${lastResponseSnapshot}`);
      }

      const parsed = JSON.parse(toolCall.function.arguments);
      if (!parsed || typeof parsed !== "object" || typeof parsed.summary !== "string") {
        throw new Error(`DialogSummary 缺少 summary 字段。rawArgs：${toolCall.function.arguments?.slice(0, 1000)}`);
      }

      summaryLog.info("LLM dialog_summarize 成功", {
        opener: input.openerName,
        responder: input.responderName,
        turns: input.transcript.length,
        attempt,
      });
      return { summary: parsed.summary, memorize: parsed.memorize };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      summaryLog.warn("LLM dialog_summarize 失败", {
        opener: input.openerName,
        responder: input.responderName,
        turns: input.transcript.length,
        attempt,
        error: lastError,
        llmResponse: lastResponseSnapshot,
      });
      if (attempt === 0) continue;
    }
  }
  summaryLog.error("LLM dialog_summarize 彻底失败", {
    opener: input.openerName,
    responder: input.responderName,
    turns: input.transcript.length,
    lastError,
    llmResponse: lastResponseSnapshot,
  });
  return { summary: `（摘要生成失败：双方聊了 ${input.transcript.length} 句）` };
}

// ---------------------------------------------------------------------------
// Accept / reject decision (legacy)
// ---------------------------------------------------------------------------

export interface AcceptDecisionInput {
  character: Character;
  requesterName: string;
  requesterId: string;
  freeText: string;
  here: MapNode;
  peer: Character;
  tick: number;
  epoch: number;
  language?: Language;
}

const ACCEPT_TOOL_NAME = "submit_accept_decision";

const ACCEPT_TOOL_PARAMETERS: Record<string, unknown> = {
  type: "object",
  properties: {
    action_type: { type: "string", enum: ["accept_chat", "reject_chat"], description: "接受或拒绝对话" },
    target_id: { type: "string", description: "请求者的角色 ID" },
    reasoning: { type: "string", description: "你的决定理由（中文）" },
    self_importance: { type: "integer", minimum: 1, maximum: 5, description: "这个决定对你有多重要" },
  },
  required: ["action_type", "target_id", "reasoning", "self_importance"],
};

/**
 * 接受/拒绝决策。
 * 失败重试 1 次，仍失败返回 reject。
 */
export async function llmAcceptDecide(
  input: AcceptDecisionInput,
): Promise<{ type: "accept_chat" | "reject_chat"; targetId: string; reasoning: string; selfImportance: 1 | 2 | 3 | 4 | 5 }> {
  if (!hasApiKey()) {
    return { type: "reject_chat", targetId: input.requesterId, reasoning: "决策失败默认拒绝", selfImportance: 1 };
  }

  const config = getEntryConfig("accept_decision");
  const client = getLLMClientForEntry("accept_decision");
  const language: Language = input.language ?? "zh";

  const prompt = buildAcceptDecisionPrompt({
    self: input.character,
    requesterName: input.requesterName,
    freeText: input.freeText,
    here: input.here,
    peer: input.peer,
    tick: input.tick,
    epoch: input.epoch,
    language,
  });

  const tool: ChatCompletionTool = {
    type: "function",
    function: {
      name: ACCEPT_TOOL_NAME,
      description: "决定是否接受对方的对话邀请。",
      parameters: ACCEPT_TOOL_PARAMETERS,
    },
  };

  const extra: Record<string, unknown> = {};
  if (config.thinkingEnabled) extra.thinking = { type: "enabled" };

  acceptLog.info("LLM accept_decision 请求", {
    self: input.character.name,
    requester: input.requesterName,
  });

  let lastResponseSnapshot = "(no response)";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: getModelNameForEntry("accept_decision"),
        max_tokens: 2048,
        messages: [
          {
            role: "system",
            content: `你是一个角色扮演引擎中的 NPC。${input.character.name} 正在决定是否接受 ${input.requesterName} 的对话邀请。根据你的性格、当前状态和情境，做出自然的决定。\n\n${languageInstruction(language)}`,
          },
          { role: "user", content: prompt },
        ],
        tools: [tool],
        ...extra,
      });
      lastResponseSnapshot = llmResponseSnapshot(response);

      const message = response.choices[0]?.message;
      const toolCall = message?.tool_calls?.find(
        (c) => c.type === "function" && c.function.name === ACCEPT_TOOL_NAME,
      );
      if (!toolCall || toolCall.type !== "function") {
        throw new Error(`LLM 没有返回 accept_decision tool_call。响应：${lastResponseSnapshot}`);
      }

      const parsed = JSON.parse(toolCall.function.arguments);
      if (!parsed || typeof parsed !== "object") {
        throw new Error(`AcceptDecision 参数不是有效对象。rawArgs：${toolCall.function.arguments.slice(0, 1000)}`);
      }
      if (parsed.action_type !== "accept_chat" && parsed.action_type !== "reject_chat") {
        throw new Error(`非法 action_type：${parsed.action_type}。rawArgs：${toolCall.function.arguments.slice(0, 1000)}`);
      }
      if (typeof parsed.target_id !== "string" || typeof parsed.reasoning !== "string") {
        throw new Error(`AcceptDecision 缺少必要字段。rawArgs：${toolCall.function.arguments.slice(0, 1000)}`);
      }
      const importance = Number(parsed.self_importance);
      if (isNaN(importance) || importance < 1 || importance > 5) {
        throw new Error(`AcceptDecision self_importance 无效：${parsed.self_importance}。rawArgs：${toolCall.function.arguments.slice(0, 1000)}`);
      }
      return {
        type: parsed.action_type as "accept_chat" | "reject_chat",
        targetId: parsed.target_id,
        reasoning: parsed.reasoning,
        selfImportance: importance as 1 | 2 | 3 | 4 | 5,
      };
    } catch (err) {
      acceptLog.warn("LLM accept_decision 失败", {
        attempt,
        self: input.character.name,
        error: err instanceof Error ? err.message : String(err),
        llmResponse: lastResponseSnapshot,
      });
      if (attempt === 0) continue;
    }
  }
  acceptLog.error("LLM accept_decision 彻底失败，默认拒绝", { llmResponse: lastResponseSnapshot });
  return { type: "reject_chat", targetId: input.requesterId, reasoning: "决策失败默认拒绝", selfImportance: 1 };
}

/**
 * 补救轮：chat 请求被拒/失败后直接 fallback 到 wait，不再走 LLM 决策。
 */
export async function llmSalvageDecide(
  input: DecideInput & { rejectReason: string },
): Promise<Action> {
  salvageLog.warn("补救轮 fallback wait", {
    角色: input.character.name,
    reject_reason: input.rejectReason,
  });

  return {
    type: "wait",
    actorId: input.character.id,
    reasoning: `补救轮：${input.rejectReason}`,
    selfImportance: 1,
    skipExecution: true,
    skipMemory: true,
  };
}
