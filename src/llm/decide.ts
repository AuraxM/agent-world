/**
 * 单 NPC 决策入口（OpenAI-compatible function calling）。
 *
 * - 用 chat.completions.create + tools=[{type:"function", ...}]
 * - tool_choice 锁定 submit_action
 * - 返回的 tool_calls[0].function.arguments 是 JSON 字符串，需 JSON.parse 后再 Zod 校验
 * - 任意异常（含 schema 解析失败、network 超时、限流） → wait + reasoning="LLM 调用失败：…"
 */
import OpenAI from "openai";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import {
  buildPerActionSchema, buildActionTools, buildSalvageActionTools,
  actionTypeFromToolName,
  ACCEPT_TOOL_NAME, AcceptDecisionSchema, AcceptToolSchema,
  DIALOG_TURN_TOOL_NAME, DialogTurnSchema, DialogTurnToolSchema,
  DIALOG_SUMMARY_TOOL_NAME, DialogSummarySchema, DialogSummaryToolSchema,
  MEMORY_SUMMARY_TOOL_NAME, MemorySummarySchema, MemorySummaryToolSchema,
  type AcceptDecisionPayload, type DialogTurnPayload, type DialogSummaryPayload, type MemorySummaryPayload,
} from "@/domain/schemas";
import type { Action, Character, DialogTurn, MapNode, WorldEvent } from "@/domain/types";
import type { Language } from "@/config/types";
import type { DecideFn, DecideInput } from "@/engine/tick";
import { getLLMClientForEntry, getModelNameForEntry, hasApiKey } from "./client";
import { getEntryConfig } from "./providers";
import {
  buildAcceptDecisionPrompt,
  buildDialogSummaryPrompt,
  buildDialogTurnPrompt,
  buildSalvageContext,
  buildSystemPrompt,
  buildUserPrompt,
  languageInstruction,
} from "./prompt";

const MAX_OUTPUT_TOKENS = 4096;

export const llmDecide: DecideFn = async (input) => {
  if (!hasApiKey()) {
    return waitFallback(input, "没有激活的 LLM provider");
  }

  try {
    return await callLLM(input);
  } catch (err) {
    return waitFallback(input, errorMessage(err));
  }
};

const MAX_TOOL_CALL_ROUNDS = 3;

/** 从 response message 提取 assistant 消息，保留 reasoning_content（DeepSeek 要求回传）。 */
function captureAssistantMsg(msg: any): Record<string, unknown> {
  const m: Record<string, unknown> = { role: "assistant", content: msg.content ?? "" };
  if (msg.tool_calls) m.tool_calls = msg.tool_calls;
  if (msg.reasoning_content) m.reasoning_content = msg.reasoning_content;
  return m;
}

const TOOL_CALL_NUDGE = "请调用对应的 action_* 工具提交你的行动决定。不要输出纯文本，必须调用工具。";

/**
 * 带 reasoning 续推循环的 LLM 调用：
 * - 最多 MAX_TOOL_CALL_ROUNDS 轮
 * - 每轮若 LLM 未调 tool，把 assistant 消息 + 催促 nudge 追加到 messages 继续
 * - 保证 reasoning_content 在每一轮都被回传（DeepSeek 要求）
 */
async function callLLMWithRetry(
  messages: Array<Record<string, unknown>>,
  tools: Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }>,
  fallbackLabel: string,
  entryName: string,
): Promise<{ actionType: string; data: Record<string, any> }> {
  const config = getEntryConfig(entryName);
  const client = getLLMClientForEntry(entryName);
  const extra: Record<string, unknown> = {};
  if (config.thinkingEnabled) extra.thinking = { type: "enabled" };

  for (let round = 0; round < MAX_TOOL_CALL_ROUNDS; round++) {
    const response = await client.chat.completions.create({
      model: getModelNameForEntry(entryName),
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: messages as any,
      tools,
      ...(extra as Record<string, unknown>),
    });

    const msg = response.choices[0]?.message;
    if (!msg) throw new Error("LLM 返回空 message");

    // 保留 reasoning_content，追加为 assistant 消息
    messages.push(captureAssistantMsg(msg));

    const toolCall = (msg.tool_calls ?? []).find(
      (c: any) => c.type === "function" && c.function.name.startsWith("action_"),
    );
    if (toolCall && toolCall.type === "function") {
      const actionType = actionTypeFromToolName(toolCall.function.name);
      if (!actionType) throw new Error(`无法从 tool name "${toolCall.function.name}" 提取 action type`);

      let parsedArgs: unknown;
      try {
        parsedArgs = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        throw new Error(`tool_call.arguments 不是合法 JSON：${e instanceof Error ? e.message : String(e)}`);
      }

      const result = buildPerActionSchema().safeParse(parsedArgs);
      if (!result.success) {
        throw new Error(`tool_call 参数不符合 schema：${result.error.message}`);
      }
      return { actionType, data: result.data as Record<string, any> };
    }

    // 未调 tool → 推进续推
    if (round < MAX_TOOL_CALL_ROUNDS - 1) {
      messages.push({ role: "user", content: TOOL_CALL_NUDGE });
    }
  }

  throw new Error(`${fallbackLabel} ${MAX_TOOL_CALL_ROUNDS} 轮均未返回 tool_call`);
}

async function callLLM(input: DecideInput): Promise<Action> {
  const system = buildSystemPrompt({
    character: input.character,
    worldName: input.worldName,
    nodes: input.nodes,
    language: input.language,
  });
  const user = buildUserPrompt({
    character: input.character,
    here: input.here,
    companions: input.companions,
    perceived: input.perceived,
    options: input.options,
    tick: input.tick,
    facts: input.facts,
    language: input.language,
    allCharacters: (input as any).allCharacters,
    nodes: input.nodes,
  });

  const tools = buildActionTools(input.ctx);

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const { actionType, data } = await callLLMWithRetry(messages, tools, "LLM", "decide");
  return payloadToAction(actionType, data, input.character.id);
}

function payloadToAction(actionType: string, p: Record<string, any>, actorId: string): Action {
  return {
    type: actionType,
    actorId,
    targetId: p.target_id,
    targetNodeId: p.target_node_id,
    freeText: p.free_text,
    reasoning: p.reasoning,
    emotionTag: p.emotion_tag,
    selfImportance: p.self_importance,
    changeType: p.change_type,
    reason: p.reason,
    arrivalAction: p.arrival_action
      ? {
          type: p.arrival_action.action_type,
          freeText: p.arrival_action.free_text,
          targetId: p.arrival_action.target_id,
          targetNodeId: p.arrival_action.target_node_id,
        }
      : undefined,
  };
}

function waitFallback(input: DecideInput, reason: string): Action {
  return {
    type: "wait",
    actorId: input.character.id,
    reasoning: `LLM 调用失败：${reason}`,
    selfImportance: 1,
  };
}

function errorMessage(err: unknown): string {
  if (err instanceof OpenAI.APIError) {
    return `${err.constructor.name} status=${err.status}: ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

// ---------------------------------------------------------------------------
// Dialog protocol LLM entry points
// ---------------------------------------------------------------------------

export interface DialogTurnInput {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  isSoftLimit: boolean;
  turnCount: number;
  language?: Language;
}

/**
 * 对话单轮：返回 { speakerId, kind: "say"|"leave", line?, reasoning? }
 * 失败重试 1 次，仍失败抛异常让调用方截断对话。
 */
export async function llmDialogTurn(input: DialogTurnInput): Promise<DialogTurn> {
  if (!hasApiKey()) throw new Error("没有激活的 LLM provider");

  const config = getEntryConfig("dialog_turn");
  const client = getLLMClientForEntry("dialog_turn");
  const language: Language = input.language ?? "zh";

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

  const extra: Record<string, unknown> = {};
  if (config.thinkingEnabled) extra.thinking = { type: "enabled" };

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
        tools: [tool],
        ...extra,
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
  openerId: string;
  responderName: string;
  responderId: string;
  transcript: DialogTurn[];
  language?: Language;
}

/**
 * 对话摘要：返回 summary 字符串。
 * 失败重试 1 次，仍失败返回占位摘要。
 */
export async function llmDialogSummarize(input: DialogSummaryInput): Promise<string> {
  if (!hasApiKey()) return `（摘要生成失败：双方聊了 ${input.transcript.length} 句）`;

  const config = getEntryConfig("dialog_summarize");
  const client = getLLMClientForEntry("dialog_summarize");
  const language: Language = input.language ?? "zh";

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
      parameters: DialogSummaryToolSchema,
    },
  };

  const extra: Record<string, unknown> = {};
  if (config.thinkingEnabled) extra.thinking = { type: "enabled" };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: getModelNameForEntry("dialog_summarize"),
        max_tokens: 512,
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
 * 记忆压缩摘要。用于睡觉时的日/周记忆压缩。
 * 失败重试 1 次，仍失败返回占位摘要。
 */
export async function llmMemoryCompress(args: {
  prompt: string;
  language?: Language;
}): Promise<string> {
  if (!hasApiKey()) return "（摘要生成失败：无可用的 LLM provider）";

  const config = getEntryConfig("memory_compress");
  const client = getLLMClientForEntry("memory_compress");
  const language: Language = args.language ?? "zh";

  const tool: ChatCompletionTool = {
    type: "function",
    function: {
      name: MEMORY_SUMMARY_TOOL_NAME,
      description: "返回记忆摘要。",
      parameters: MemorySummaryToolSchema,
    },
  };

  const extra: Record<string, unknown> = {};
  if (config.thinkingEnabled) extra.thinking = { type: "enabled" };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: getModelNameForEntry("memory_compress"),
        max_tokens: 512,
        messages: [
          {
            role: "system",
            content: `你是一个记忆摘要助手。请根据提供的事件列表生成简洁的记忆摘要。\n\n${languageInstruction(language)}`,
          },
          { role: "user", content: args.prompt },
        ],
        tools: [tool],
        ...extra,
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
  language?: Language;
}

export async function llmAcceptDecide(
  input: AcceptDecisionInput,
): Promise<{ type: "accept_speak" | "reject_speak"; targetId: string; reasoning: string; selfImportance: 1 | 2 | 3 | 4 | 5 }> {
  if (!hasApiKey()) {
    return { type: "reject_speak", targetId: input.requesterId, reasoning: "决策失败默认拒绝", selfImportance: 1 };
  }

  const config = getEntryConfig("accept_decision");
  const client = getLLMClientForEntry("accept_decision");
  const language: Language = input.language ?? "zh";

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

  const extra: Record<string, unknown> = {};
  if (config.thinkingEnabled) extra.thinking = { type: "enabled" };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: getModelNameForEntry("accept_decision"),
        max_tokens: 512,
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
export async function llmSalvageDecide(
  input: DecideInput & { rejectReason: string },
): Promise<Action> {
  if (!hasApiKey()) return {
    type: "wait",
    actorId: input.character.id,
    reasoning: `补救决策失败（无 provider）：${input.rejectReason}`,
    selfImportance: 1,
  };

  const language = input.language;

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
    options: input.options,
    tick: input.tick,
    facts: input.facts,
    language,
    allCharacters: (input as any).allCharacters,
    nodes: input.nodes,
  });
  const salvageCtx = buildSalvageContext({ rejectReason: input.rejectReason });

  const tools = buildSalvageActionTools(input.ctx);

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: system },
    { role: "user", content: user + "\n\n" + salvageCtx },
  ];

  let lastAction: Action | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { actionType, data } = await callLLMWithRetry(
        messages.map((m) => ({ ...m })), // shallow copy per attempt
        tools,
        "Salvage",
        "salvage",
      );

      // Double-check: no speak family
      if (actionType === "speak" || actionType === "accept_speak" || actionType === "reject_speak" || actionType === "leave_dialog") {
        throw new Error(`补救轮违规：LLM 输出 ${actionType}`);
      }

      return {
        type: actionType,
        actorId: input.character.id,
        targetId: data.target_id,
        targetNodeId: data.target_node_id,
        freeText: data.free_text,
        reasoning: data.reasoning,
        emotionTag: data.emotion_tag,
        selfImportance: data.self_importance,
        changeType: data.change_type,
        reason: data.reason,
        arrivalAction: data.arrival_action
          ? {
              type: data.arrival_action.action_type as Action["type"],
              freeText: data.arrival_action.free_text,
              targetId: data.arrival_action.target_id,
              targetNodeId: data.arrival_action.target_node_id,
            }
          : undefined,
      };
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
