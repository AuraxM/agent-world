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
} from "@/domain/schemas";
import type { Action } from "@/domain/types";
import type { DecideFn, DecideInput } from "@/engine/tick";
import { getLLMClient, getModelName, hasApiKey } from "./client";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";

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
  const system = buildSystemPrompt({
    character: input.character,
    worldName: input.worldName,
  });
  const user = buildUserPrompt({
    character: input.character,
    here: input.here,
    companions: input.companions,
    perceived: input.perceived,
    options: input.options,
    tick: input.tick,
    facts: input.facts,
  });

  const tool: ChatCompletionTool = {
    type: "function",
    function: {
      name: ACTION_TOOL_NAME,
      description:
        "提交你这一 tick 的行动。type 必须是封闭枚举之一；reasoning 必须显式引用至少一项你自己的性格维度数值。",
      parameters: ActionToolInputSchema,
    },
  };

  // 注意：
  // - 部分 provider（如 DeepSeek 的 reasoner 端点）在 thinking enabled 时**完全
  //   拒绝** tool_choice 的非默认值（"required" 与 forced 都会 400
  //   "deepseek-reasoner does not support this tool_choice"）；故不传
  //   tool_choice，落到默认 "auto"，靠 system/user prompt 强约束模型必须调
  //   submit_action。tool_call 缺失时由 waitFallback 兜底
  // - thinking enabled 走推理路由，reasoning tokens 计入 max_tokens 预算，所以
  //   MAX_OUTPUT_TOKENS 比纯 fast 模式调高，避免 reasoning 阶段把额度耗尽导致
  //   tool_call 被截断
  // - OpenAI Node SDK 不识别 thinking 字段类型，用 spread + Record cast 透传
  const response = await client.chat.completions.create({
    model: getModelName(),
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    tools: [tool],
    ...({ thinking: { type: "enabled" } } as Record<string, unknown>),
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
