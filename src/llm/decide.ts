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
  ACTION_TOOL_NAME,
  ActionSchema,
  ActionToolInputSchema,
  type ActionPayload,
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
import type { Action, Character, DialogTurn, MapNode, WorldEvent } from "@/domain/types";
import type { DecideFn, DecideInput } from "@/engine/tick";
import { getLanguage, getThinkingEnabled } from "@/engine/settings";
import { getLLMClient, getModelName, hasApiKey } from "./client";
import {
  buildAcceptDecisionPrompt,
  buildDialogSummaryPrompt,
  buildDialogTurnPrompt,
  buildSalvageContext,
  buildSystemPrompt,
  buildUserPrompt,
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

async function callLLM(input: DecideInput): Promise<Action> {
  const client = getLLMClient();
  const language = getLanguage();
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
  });

  const tool: ChatCompletionTool = {
    type: "function",
    function: {
      name: ACTION_TOOL_NAME,
      description:
        "提交你这一 tick 的行动。type 必须是封闭枚举之一；reasoning 必须显式引用一项你自己的性格特征（用文字描述，不要写数值）。",
      parameters: ActionToolInputSchema,
    },
  };

  // 注意：
  // - thinking 可由管理后台 /admin 的开关全局控制（getThinkingEnabled()）。
  //   关闭后不传 thinking 字段，provider 走 fast 路由。
  // - 部分 provider（如 DeepSeek 的 reasoner 端点）在 thinking enabled 时**完全
  //   拒绝** tool_choice 的非默认值（"required" 与 forced 都会 400
  //   "deepseek-reasoner does not support this tool_choice"）；故不传
  //   tool_choice，落到默认 "auto"，靠 system/user prompt 强约束模型必须调
  //   submit_action。tool_call 缺失时由 waitFallback 兜底
  // - thinking enabled 走推理路由，reasoning tokens 计入 max_tokens 预算，所以
  //   MAX_OUTPUT_TOKENS 比纯 fast 模式调高，避免 reasoning 阶段把额度耗尽导致
  //   tool_call 被截断
  // - OpenAI Node SDK 不识别 thinking 字段类型，用 spread + Record cast 透传
  const extra: Record<string, unknown> = {};
  if (getThinkingEnabled()) {
    extra.thinking = { type: "enabled" };
  }

  const response = await client.chat.completions.create({
    model: getModelName(),
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    tools: [tool],
    ...(extra as Record<string, unknown>),
  });

  const message = response.choices[0]?.message;
  const toolCall = message?.tool_calls?.find(
    (c) => c.type === "function" && c.function.name === ACTION_TOOL_NAME,
  );
  if (!toolCall || toolCall.type !== "function") {
    throw new Error("LLM 没有返回 submit_action tool_call");
  }

  let parsedArgs: unknown;
  try {
    parsedArgs = JSON.parse(toolCall.function.arguments);
  } catch (e) {
    throw new Error(
      `tool_call.arguments 不是合法 JSON：${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const result = ActionSchema.safeParse(parsedArgs);
  if (!result.success) {
    throw new Error(`tool_call 参数不符合 ActionSchema：${result.error.message}`);
  }

  return payloadToAction(result.data, input.character.id);
}

function payloadToAction(p: ActionPayload, actorId: string): Action {
  return {
    type: p.action_type,
    actorId,
    targetId: p.target_id,
    targetNodeId: p.target_node_id,
    freeText: p.free_text,
    reasoning: p.reasoning,
    emotionTag: p.emotion_tag,
    selfImportance: p.self_importance,
    changeType: p.change_type,
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
}

/**
 * 对话单轮：返回 { speakerId, kind: "say"|"leave", line?, reasoning? }
 * 失败重试 1 次，仍失败抛异常让调用方截断对话。
 */
export async function llmDialogTurn(input: DialogTurnInput): Promise<DialogTurn> {
  if (!hasApiKey()) throw new Error("没有激活的 LLM provider");

  const client = getLLMClient();
  const language = getLanguage();

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
export async function llmSalvageDecide(
  input: DecideInput & { rejectReason: string },
): Promise<Action> {
  if (!hasApiKey()) return {
    type: "wait",
    actorId: input.character.id,
    reasoning: `补救决策失败（无 provider）：${input.rejectReason}`,
    selfImportance: 1,
  };

  const client = getLLMClient();
  const language = getLanguage();

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
      const action: Action = {
        type: result.data.action_type as Action["type"],
        actorId: input.character.id,
        targetId: result.data.target_id,
        targetNodeId: result.data.target_node_id,
        freeText: result.data.free_text,
        reasoning: result.data.reasoning,
        emotionTag: result.data.emotion_tag,
        selfImportance: result.data.self_importance,
        changeType: result.data.change_type,
      };

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
