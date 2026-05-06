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
  DECIDE_ACTION_TOOL_NAME, DecideActionSchema, buildDecideActionTool,
  RECALL_TOOL_NAME, RecallSchema, RecallToolSchema,
  MEMORIZE_TOOL_NAME, MemorizeSchema, MemorizeToolSchema,
  REFLECTION_TOOL_NAME, ReflectionSchema, ReflectionToolSchema,
  ACCEPT_TOOL_NAME, AcceptDecisionSchema, AcceptToolSchema,
  DIALOG_TURN_TOOL_NAME, DialogTurnSchema, DialogTurnToolSchema,
  DIALOG_SUMMARY_TOOL_NAME, DialogSummarySchema, DialogSummaryToolSchema,
  END_CONVERSATION_TOOL_NAME, EndConversationToolSchema, EndConversationSchema,
  PROPOSE_DIALOGUE_ACTION_TOOL_NAME, ProposeDialogueActionSchema, ProposeDialogueActionToolSchema,
  RESPOND_DIALOGUE_ACTION_TOOL_NAME, RespondDialogueActionSchema, RespondDialogueActionToolSchema,
  NOTEBOOK_TOOL_NAME, NotebookSchema, NotebookToolSchema,
  type AcceptDecisionPayload, type DialogTurnPayload, type DialogSummaryPayload,
} from "@/domain/schemas";
import type { Action, Character, DialogTurn, EndConversationPayload, MapNode, WorldEvent } from "@/domain/types";
import type { Language } from "@/config/types";
import type { DecideFn, DecideInput } from "@/engine/tick";
import { getLLMClientForEntry, getModelNameForEntry, hasApiKey } from "./client";
import { getEntryConfig } from "./providers";
import { actionRegistry } from "@/domain/action-system";
import { tickFromCalendar, formatCurrentTime, createEntryId, saveNotebookEntry } from "@/engine/notebook";
import type { ActionContext } from "@/engine/actions";
import {
  buildAcceptDecisionPrompt,
  buildDialogSummaryPrompt,
  buildDialogTurnPrompt,
  buildSalvageContext,
  buildSystemPrompt,
  buildUserPrompt,
  languageInstruction,
} from "./prompt";
import { createLogger } from "@/util/logger";

const decideLog = createLogger("llm-decide");
const dialogLog = createLogger("llm-dialog");
const acceptLog = createLogger("llm-accept");
const summaryLog = createLogger("llm-summary");
const salvageLog = createLogger("llm-salvage");
const memoryLog = createLogger("llm-memory");

const MAX_OUTPUT_TOKENS = 4096;

export const llmDecide: DecideFn = async (input) => {
  if (!hasApiKey()) {
    return waitFallback(input, "没有激活的 LLM provider");
  }

  try {
    return await callLLM(input);
  } catch (err) {
    decideLog.error("LLM decide 失败", {
      角色: input.character.name,
      error: errorMessage(err),
    });
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

const TOOL_CALL_NUDGE = "请调用 decide_action、recall 或 memorize 工具。不要输出纯文本，必须调用工具。";

// ---------------------------------------------------------------------------
// Recall / Memorize helpers
// ---------------------------------------------------------------------------

function handleRecall(targetIds: string[], self: Character, allCharacters: Character[]): string {
  const nameMap = new Map(allCharacters.map(c => [c.id, c.name]));
  const lines: string[] = [];
  for (const tid of targetIds) {
    const name = nameMap.get(tid) ?? tid;
    const impression = self.impressionBook[tid];
    const rel = self.relations[tid];

    if (impression && impression.trim().length > 0) {
      const relText = rel && rel.kinds.length > 0 ? ` 客观关系：${rel.kinds.join("、")}。` : "";
      lines.push(`${name}: ${impression}${relText}`);
    } else if (rel && rel.kinds.length > 0) {
      lines.push(`${name}: (无个人印象) 客观关系：${rel.kinds.join("、")}。`);
    } else {
      lines.push(`${name}: 你对这个人没有印象。`);
    }
  }
  return lines.join("\n");
}

function handleMemorize(targetId: string, impression: string, self: Character): void {
  if (!impression || impression.trim().length === 0) {
    delete self.impressionBook[targetId];
  } else {
    self.impressionBook[targetId] = impression.trim();
  }
}

// ---------------------------------------------------------------------------
// Tool builders for recall / memorize
// ---------------------------------------------------------------------------

function buildNotebookTool(): ChatCompletionTool {
  return { type: "function", function: { name: NOTEBOOK_TOOL_NAME, description: "将对话中达成的约定记录到记事本。用 year/month/day/hour 指定约定时间（绝对日历日期+整点）。", parameters: NotebookToolSchema } };
}

function buildRecallTool(): ChatCompletionTool {
  return { type: "function", function: { name: RECALL_TOOL_NAME, description: "回想你对某（几）个角色的印象。可以一次查询多个角色。", parameters: RecallToolSchema } };
}

function buildMemorizeTool(): ChatCompletionTool {
  return { type: "function", function: { name: MEMORIZE_TOOL_NAME, description: "记录或更新你对某个角色的印象。留空印象文本代表忘记此人。", parameters: MemorizeToolSchema } };
}

// ---------------------------------------------------------------------------
// Decision loop
// ---------------------------------------------------------------------------

/**
 * 带 reasoning 续推循环的 LLM 调用：
 * - 最多 MAX_TOOL_CALL_ROUNDS 轮
 * - 每轮若 LLM 未调 tool，把 assistant 消息 + 催促 nudge 追加到 messages 继续
 * - 保证 reasoning_content 在每一轮都被回传（DeepSeek 要求）
 * - 支持 recall / memorize 子循环（不计入决策轮数）
 */
async function callLLMWithRetry(
  messages: Array<Record<string, unknown>>,
  tool: ChatCompletionTool,
  fallbackLabel: string,
  entryName: string,
  ctx: ActionContext,
  allCharacters: Character[] = [],
): Promise<{ actionType: string; data: Record<string, any> }> {
  const config = getEntryConfig(entryName);
  const client = getLLMClientForEntry(entryName);
  const extra: Record<string, unknown> = {};
  if (config.thinkingEnabled) extra.thinking = { type: "enabled" };

  const tools: ChatCompletionTool[] = [tool, buildRecallTool(), buildMemorizeTool()];

  let lastResponseSnapshot = "(no response)";
  for (let round = 0; round < MAX_TOOL_CALL_ROUNDS; round++) {
    const response = await client.chat.completions.create({
      model: getModelNameForEntry(entryName),
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: messages as any,
      tools,
      ...(extra as Record<string, unknown>),
    });
    lastResponseSnapshot = llmResponseSnapshot(response);

    const msg = response.choices[0]?.message;
    if (!msg) throw new Error(`LLM 返回空 message。响应快照：${lastResponseSnapshot}`);

    // 保留 reasoning_content，追加为 assistant 消息
    messages.push(captureAssistantMsg(msg));

    const toolName = (msg.tool_calls as any)?.[0]?.function?.name ?? "none";
    decideLog.info(`LLM round ${round + 1}/${MAX_TOOL_CALL_ROUNDS}`, {
      tool_call: toolName,
    });

    const toolCall = (msg.tool_calls ?? []).find(
      (c: any) => c.type === "function",
    );
    if (!toolCall) {
      // 未调 tool → 推进续推
      if (round < MAX_TOOL_CALL_ROUNDS - 1) {
        messages.push({ role: "user", content: TOOL_CALL_NUDGE });
      }
      continue;
    }

    const tc = toolCall as any;

    // ── Handle recall ──
    if (tc.function.name === RECALL_TOOL_NAME) {
      let parsedArgs: unknown;
      try { parsedArgs = JSON.parse(tc.function.arguments); } catch (e) {
        messages.push({ role: "user", content: `recall JSON 解析失败：${e instanceof Error ? e.message : String(e)}。请重试。` });
        continue;
      }
      const parseResult = RecallSchema.safeParse(parsedArgs);
      if (!parseResult.success) {
        messages.push({ role: "user", content: `recall 参数不符合要求：${parseResult.error.message}。请修正后重试。` });
        continue;
      }
      const recallResult = handleRecall(parseResult.data.target_ids, ctx.self, allCharacters);
      messages.push({ role: "tool", tool_call_id: tc.id, content: recallResult });
      // recall continues loop, doesn't count as a decision round
      round = Math.max(0, round - 1);
      continue;
    }

    // ── Handle memorize ──
    if (tc.function.name === MEMORIZE_TOOL_NAME) {
      let parsedArgs: unknown;
      try { parsedArgs = JSON.parse(tc.function.arguments); } catch (e) {
        messages.push({ role: "user", content: `memorize JSON 解析失败：${e instanceof Error ? e.message : String(e)}。请重试。` });
        continue;
      }
      const parseResult = MemorizeSchema.safeParse(parsedArgs);
      if (!parseResult.success) {
        messages.push({ role: "user", content: `memorize 参数不符合要求：${parseResult.error.message}。请修正后重试。` });
        continue;
      }
      handleMemorize(parseResult.data.target_id, parseResult.data.impression, ctx.self);
      messages.push({ role: "tool", tool_call_id: tc.id, content: "已记录。" });
      // memorize continues loop, doesn't count as a decision round
      round = Math.max(0, round - 1);
      continue;
    }

    // ── Handle decide_action ──
    if (tc.function.name === DECIDE_ACTION_TOOL_NAME) {
      let parsedArgs: unknown;
      try {
        parsedArgs = JSON.parse(tc.function.arguments);
      } catch (e) {
        const err = `decide_action JSON 解析失败：${e instanceof Error ? e.message : String(e)}。请修正 JSON 格式后重试。`;
        if (round < MAX_TOOL_CALL_ROUNDS - 1) {
          messages.push({ role: "user", content: err });
        }
        continue;
      }

      const schemaResult = DecideActionSchema.safeParse(parsedArgs);
      if (!schemaResult.success) {
        const err = `decide_action 参数不符合 schema：${schemaResult.error.message}。请修正后重试。`;
        if (round < MAX_TOOL_CALL_ROUNDS - 1) {
          messages.push({ role: "user", content: err });
        }
        continue;
      }

      const actionType = schemaResult.data.action_type;

      // Check action_type exists and is available
      const def = actionRegistry.get(actionType);
      if (!def) {
        const err = `action_type="${actionType}" 不存在。请修正后重试。`;
        if (round < MAX_TOOL_CALL_ROUNDS - 1) {
          messages.push({ role: "user", content: err });
        }
        continue;
      }
      if (!def.check(ctx)) {
        const err = `action_type="${actionType}" 在当前情境下不可用。请选择其他行动。`;
        if (round < MAX_TOOL_CALL_ROUNDS - 1) {
          messages.push({ role: "user", content: err });
        }
        continue;
      }

      // Call action def's validateParams
      if (def.validateParams) {
        const validationErr = def.validateParams(schemaResult.data as Record<string, any>, ctx);
        if (validationErr) {
          if (round < MAX_TOOL_CALL_ROUNDS - 1) {
            messages.push({ role: "user", content: `${actionType} 参数校验失败：${validationErr}。请修正后重试。` });
          }
          continue;
        }
      }

      return { actionType, data: schemaResult.data as Record<string, any> };
    }

    // Unknown tool → nudge
    if (round < MAX_TOOL_CALL_ROUNDS - 1) {
      messages.push({ role: "user", content: TOOL_CALL_NUDGE });
    }
  }

  throw new Error(`${fallbackLabel} ${MAX_TOOL_CALL_ROUNDS} 轮均未返回 tool_call。最后响应：${lastResponseSnapshot}`);
}

async function callLLM(input: DecideInput): Promise<Action> {
  const system = buildSystemPrompt({
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
    epoch: input.epoch,
    facts: input.facts,
    language: input.language,
    allCharacters: input.allCharacters,
    nodes: input.nodes,
    activeEventDefs: input.activeEventDefs,
    upcomingNotebookText: input.upcomingNotebookText,
  });

  const tool = buildDecideActionTool(input.ctx);

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const startMs = Date.now();
  decideLog.info("LLM decide 请求", {
    角色: input.character.name,
    model: getModelNameForEntry("decide"),
  });

  const { actionType, data } = await callLLMWithRetry(messages, tool, "LLM", "decide", input.ctx, input.allCharacters);

  decideLog.info("LLM decide 响应", {
    角色: input.character.name,
    action: actionType,
    耗时ms: Date.now() - startMs,
  });

  return payloadToAction(actionType, data, input.character.id);
}

function payloadToAction(actionType: string, p: Record<string, any>, actorId: string): Action {
  return {
    type: actionType,
    actorId,
    targetId: p.target_id,
    targetNodeId: p.target_node_id,
    freeText: p.free_text,
    amount: p.amount,
    reasoning: p.reasoning,
    emotionTag: p.emotion_tag,
    selfImportance: p.self_importance,
    changeType: p.change_type,
    reason: p.reason,
    arrivalAction: p.arrival_action
      ? {
          type: p.arrival_action.action_type?.startsWith("action_")
            ? p.arrival_action.action_type.slice("action_".length)
            : p.arrival_action.action_type,
          freeText: p.arrival_action.free_text,
          targetId: p.arrival_action.target_id,
          targetNodeId: p.arrival_action.target_node_id,
        }
      : undefined,
    scheduled_day: p.scheduled_day,
    scheduled_hour: p.scheduled_hour,
    scheduled_minute: p.scheduled_minute,
  };
}

function waitFallback(input: DecideInput, reason: string): Action {
  return {
    type: "look_around",
    actorId: input.character.id,
    reasoning: `LLM 调用失败：${reason}`,
    selfImportance: 1,
  };
}

function errorMessage(err: unknown): string {
  if (err instanceof OpenAI.APIError) {
    const parts = [`${err.constructor.name} status=${err.status}: ${err.message}`];
    if ((err as any).error) parts.push(`body=${JSON.stringify((err as any).error).slice(0, 2000)}`);
    return parts.join(" | ");
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/** 从 LLM response 中提取关键内容用于日志，最多保留 maxLen 字符。 */
function llmResponseSnapshot(resp: any, maxLen = 2000): string {
  if (!resp) return "(no response)";
  try {
    const choices = resp.choices;
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
      const calls = (msg.tool_calls as any[]).map((tc: any) => ({
        name: tc.function?.name,
        args: (tc.function?.arguments ?? "").slice(0, 500),
      }));
      parts.push(`tool_calls=${JSON.stringify(calls).slice(0, maxLen)}`);
    }
    if (msg.reasoning_content) {
      parts.push(`reasoning=${(msg.reasoning_content as string).slice(0, 500)}`);
    }
    if ((msg as any).refusal) parts.push(`refusal=${(msg as any).refusal}`);
    const result = parts.join(" | ");
    return result.length > maxLen ? result.slice(0, maxLen) : result;
  } catch {
    return "(failed to serialize response)";
  }
}

// ---------------------------------------------------------------------------
// Dialog protocol LLM entry points
// ---------------------------------------------------------------------------

interface DialogTurnInput {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  here: MapNode;
  language?: Language;
  pendingAction?: import("@/domain/types").DialogueActionRequest;
  dialogueActions?: import("@/domain/action-system").ActionDefinition[];
  tick?: number;
  epoch?: number;
  upcomingEntries?: import("@/domain/types").NotebookEntry[];
}

export interface DialogTurnResult {
  kind: "turn";
  turn: DialogTurn;
  proposeAction?: import("@/engine/dialog").DialogueActionProposal;
  respondToAction?: import("@/engine/dialog").DialogueActionResponse;
}

export interface DialogEndResult {
  kind: "end";
  payload: EndConversationPayload;
  respondToAction?: import("@/engine/dialog").DialogueActionResponse;
}

export async function llmDialogTurn(input: DialogTurnInput): Promise<DialogTurnResult | DialogEndResult> {
  if (!hasApiKey()) throw new Error("没有激活的 LLM provider");

  const config = getEntryConfig("dialog_turn");
  const client = getLLMClientForEntry("dialog_turn");
  const language: Language = input.language ?? "zh";

  const prompt = buildDialogTurnPrompt({
    self: input.self,
    peer: input.peer,
    transcript: input.transcript,
    here: input.here,
    language,
    pendingAction: input.pendingAction,
    dialogueActions: input.dialogueActions,
    upcomingEntries: input.upcomingEntries,
    tick: input.tick,
    epoch: input.epoch,
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
    buildRecallTool(),
    buildMemorizeTool(),
    buildNotebookTool(),
  ];

  // Add interactive action tools if dialogue actions are available
  const hasDialogueActions = input.dialogueActions && input.dialogueActions.length > 0;
  if (hasDialogueActions) {
    tools.push({
      type: "function",
      function: {
        name: PROPOSE_DIALOGUE_ACTION_TOOL_NAME,
        description: "在对话中发起一个交互行为（如给钱）。与 submit_dialog_turn 同时调用，不计入对话轮次。",
        parameters: ProposeDialogueActionToolSchema,
      },
    });
  }
  if (input.pendingAction) {
    tools.push({
      type: "function",
      function: {
        name: RESPOND_DIALOGUE_ACTION_TOOL_NAME,
        description: "接受或拒绝对方发起的交互行为。与 submit_dialog_turn 同时调用，不计入对话轮次。",
        parameters: RespondDialogueActionToolSchema,
      },
    });
  }

  const extra: Record<string, unknown> = {};
  if (config.thinkingEnabled) extra.thinking = { type: "enabled" };

  const nowStr = formatCurrentTime(input.tick ?? 0, input.epoch ?? 0);
  const timeLine = language === "zh"
    ? `当前游戏时间：${nowStr}。`
    : language === "en"
      ? `Current game time: ${nowStr}.`
      : `現在のゲーム時間：${nowStr}。`;

  const systemPrompt = language === "zh"
    ? `你是一个角色扮演引擎中的 NPC。你正在和另一个人对话。${timeLine} 请根据你的性格、当前情境和对话历史，自然地回应。不要重复对方刚说过的话。\n\n${languageInstruction(language)}`
    : language === "en"
      ? `You are an NPC in a role-playing engine. You are speaking with another person. ${timeLine} Respond naturally based on your personality, current situation, and conversation history. Do not repeat what the other person just said.\n\n${languageInstruction(language)}`
      : `あなたはロールプレイングエンジンの NPC です。他の人と会話しています。${timeLine} あなたの性格、現在の状況、会話の履歴に基づいて自然に応答してください。相手が今言ったことをそのまま繰り返さないでください。\n\n${languageInstruction(language)}`;

  dialogLog.info("LLM dialog_turn 请求", {
    self: input.self.name,
    peer: input.peer.name,
    hasPendingAction: !!input.pendingAction,
    dialogueActionCount: input.dialogueActions?.length ?? 0,
  });

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt },
  ];

  let lastError: unknown;
  for (let round = 0; round < MAX_TOOL_CALL_ROUNDS; round++) {
    try {
      const response = await client.chat.completions.create({
        model: getModelNameForEntry("dialog_turn"),
        max_tokens: 1024,
        messages: messages as any,
        tools,
        ...extra,
      });

      const message = response.choices[0]?.message;
      if (!message) {
        const errMsg = "LLM 返回了空 message。请重试，调用相应的工具。";
        dialogLog.warn("LLM dialog_turn 返回空 message", {
          self: input.self.name,
          round: round + 1,
          llmResponse: llmResponseSnapshot(response),
        });
        if (round < MAX_TOOL_CALL_ROUNDS - 1) {
          messages.push({ role: "user", content: errMsg });
          continue;
        }
        throw new Error(`LLM ${MAX_TOOL_CALL_ROUNDS} 轮均返回空 message`);
      }

      // Preserve assistant message (including reasoning_content for DeepSeek)
      const assistantMsg: Record<string, unknown> = { role: "assistant", content: message.content ?? "" };
      if ((message as any).reasoning_content) assistantMsg.reasoning_content = (message as any).reasoning_content;
      if (message.tool_calls) assistantMsg.tool_calls = message.tool_calls;
      messages.push(assistantMsg);

      const allToolCalls = (message.tool_calls ?? []).filter(
        (c: any) => c.type === "function",
      );
      if (allToolCalls.length === 0) {
        const hasText = typeof message.content === "string" && message.content.trim().length > 0;
        const feedback = hasText
          ? `你输出了文本但没有调用工具。你的回复是：\n\n"""\n${message.content}\n"""\n\n这不符合要求。你必须调用 ${DIALOG_TURN_TOOL_NAME} 来说一句话，或调用 ${END_CONVERSATION_TOOL_NAME} 来结束对话。请重新以工具调用形式输出，不要输出纯文本。`
          : `你未调用任何工具。必须调用 ${DIALOG_TURN_TOOL_NAME} 来说一句话，或调用 ${END_CONVERSATION_TOOL_NAME} 来结束对话。不要输出纯文本，必须调用工具。`;
        dialogLog.warn("LLM dialog_turn 未返回 tool_call，推送错误反馈", {
          self: input.self.name,
          round: round + 1,
          hasContent: hasText,
          llmResponse: llmResponseSnapshot(response),
        });
        if (round < MAX_TOOL_CALL_ROUNDS - 1) {
          messages.push({ role: "user", content: feedback });
          continue;
        }
        throw new Error(`LLM ${MAX_TOOL_CALL_ROUNDS} 轮均未返回 tool_call`);
      }

      // Process all tool calls — support parallel tool calls
      // First pass: handle side-effect calls that don't end the turn (recall/memorize/notebook)
      let hasSideEffect = false;
      for (const tc of allToolCalls) {
        const t = tc as any;
        if (t.function.name === RECALL_TOOL_NAME) {
          hasSideEffect = true;
          let parsedArgs: unknown;
          try { parsedArgs = JSON.parse(t.function.arguments); } catch (e) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `recall JSON 解析失败：${e instanceof Error ? e.message : String(e)}。请重试。` });
            continue;
          }
          const parseResult = RecallSchema.safeParse(parsedArgs);
          if (!parseResult.success) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `recall 参数不符合要求：${parseResult.error.message}。请修正后重试。` });
            continue;
          }
          const recallResult = handleRecall(parseResult.data.target_ids, input.self, [input.peer]);
          messages.push({ role: "tool", tool_call_id: t.id, content: recallResult });
        } else if (t.function.name === MEMORIZE_TOOL_NAME) {
          hasSideEffect = true;
          let parsedArgs: unknown;
          try { parsedArgs = JSON.parse(t.function.arguments); } catch (e) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `memorize JSON 解析失败：${e instanceof Error ? e.message : String(e)}。请重试。` });
            continue;
          }
          const parseResult = MemorizeSchema.safeParse(parsedArgs);
          if (!parseResult.success) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `memorize 参数不符合要求：${parseResult.error.message}。请修正后重试。` });
            continue;
          }
          handleMemorize(parseResult.data.target_id, parseResult.data.impression, input.self);
          messages.push({ role: "tool", tool_call_id: t.id, content: "已记录。" });
        } else if (t.function.name === NOTEBOOK_TOOL_NAME) {
          hasSideEffect = true;
          const NBR = "NOTEBOOK_TIMEFAIL" as const;

          // Count previous notebook time-validation failures in this turn
          const previousFails = messages.filter(
            (m: any) => m.role === "tool" && typeof m.content === "string" && m.content.startsWith(`[${NBR}]`),
          ).length;

          let parsedArgs: unknown;
          try { parsedArgs = JSON.parse(t.function.arguments); } catch (e) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `add_notebook_entry JSON 解析失败：${e instanceof Error ? e.message : String(e)}。请重试。` });
            continue;
          }
          const parseResult = NotebookSchema.safeParse(parsedArgs);
          if (!parseResult.success) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `add_notebook_entry 参数不符合要求：${parseResult.error.message}。请修正后重试。` });
            continue;
          }
          const { year, month, day, hour, free_text } = parseResult.data;
          const epoch = input.epoch ?? 0;
          const scheduledTick = tickFromCalendar(year, month, day, hour, epoch);

          if (scheduledTick === null) {
            const nowStr = formatCurrentTime(input.tick ?? 0, epoch);
            if (previousFails === 0) {
              messages.push({ role: "tool", tool_call_id: t.id, content: `[${NBR}] 日期无效（${year}-${month}-${day} ${hour}:00）。当前游戏时间是 ${nowStr}。请根据当前时间重新设定，确保在未来。` });
            } else {
              messages.push({ role: "tool", tool_call_id: t.id, content: `[${NBR}] 日期仍无效，放弃记录。你可以继续对话或结束。` });
            }
            continue;
          }

          if (scheduledTick <= (input.tick ?? 0)) {
            const nowStr = formatCurrentTime(input.tick ?? 0, epoch);
            if (previousFails === 0) {
              messages.push({ role: "tool", tool_call_id: t.id, content: `[${NBR}] 约定时间（${year}年${month}月${day}日 ${hour}:00）必须在当前时间之后。当前游戏时间是 ${nowStr}。请根据当前时间重新调整。` });
            } else {
              messages.push({ role: "tool", tool_call_id: t.id, content: `[${NBR}] 约定时间仍不正确，放弃记录。你可以继续对话或结束。` });
            }
            continue;
          }

          const timeLabel = `${year}年${month}月${day}日 ${String(hour).padStart(2, "0")}:00`;
          if (input.self.notebook.some((e: any) => e.scheduledTick === scheduledTick)) {
            if (previousFails === 0) {
              messages.push({ role: "tool", tool_call_id: t.id, content: `[${NBR}] ${timeLabel} 已经有约了。请选择其他时间。` });
            } else {
              messages.push({ role: "tool", tool_call_id: t.id, content: `[${NBR}] ${timeLabel} 仍有冲突，放弃记录。你可以继续对话或结束。` });
            }
            continue;
          }

          const TICKS_PER_HOUR = 5;
          if (scheduledTick - (input.tick ?? 0) < TICKS_PER_HOUR) {
            if (previousFails === 0) {
              messages.push({ role: "tool", tool_call_id: t.id, content: `[${NBR}] ${timeLabel} 马上就要到了，不需要备忘。请选择更晚的时间。` });
            } else {
              messages.push({ role: "tool", tool_call_id: t.id, content: `[${NBR}] ${timeLabel} 仍太近了，放弃记录。你可以继续对话或结束。` });
            }
            continue;
          }

          const entry: import("@/domain/types").NotebookEntry = {
            id: createEntryId(),
            scheduledTick,
            content: free_text,
            createdAt: input.tick ?? 0,
          };
          input.self.notebook.push(entry);
          saveNotebookEntry(input.self.worldId, input.self.id, entry);
          messages.push({ role: "tool", tool_call_id: t.id, content: `已记录到记事本：${timeLabel} — ${free_text}` });
          // Also push a system line to the transcript so the LLM doesn't repeat the call
          input.transcript.push({
            speakerId: "__system__",
            kind: "action_result",
            line: `📝 ${input.self.name} 在记事本中记录了约定：${timeLabel} — ${free_text}`,
          });
        }
      }
      if (hasSideEffect) {
        round = Math.max(0, round - 1);
        continue;
      }

      // Second pass: extract turn/end decisions + optional action proposal/response
      let turnResult: { kind: "turn"; turn: DialogTurn } | null = null;
      let endResult: { kind: "end"; payload: EndConversationPayload } | null = null;
      let proposeAction: DialogTurnResult["proposeAction"] | undefined;
      let respondToAction: DialogEndResult["respondToAction"] | undefined;
      let hasError = false;

      for (const tc of allToolCalls) {
        const t = tc as any;
        const name = t.function.name;

        // Parse JSON
        let args: unknown;
        try {
          args = JSON.parse(t.function.arguments);
        } catch (e) {
          const jsonErr = e instanceof Error ? e.message : String(e);
          const feedback = `你调用了 ${name}，但 arguments 不是合法 JSON：\n\n\`\`\`json\n${t.function.arguments}\n\`\`\`\n\nJSON 解析错误：${jsonErr}\n\n请修正 JSON 格式后重试。`;
          dialogLog.warn("LLM dialog_turn JSON 解析失败", {
            self: input.self.name,
            round: round + 1,
            tool: name,
            error: jsonErr,
            rawArgs: t.function.arguments?.slice(0, 2000),
          });
          messages.push({ role: "user", content: feedback });
          hasError = true;
          break;
        }

        if (name === DIALOG_TURN_TOOL_NAME) {
          const result = DialogTurnSchema.safeParse(args);
          if (!result.success) {
            messages.push({ role: "user", content: `submit_dialog_turn 参数不符合要求：${result.error.message}。请修正后重试。` });
            hasError = true;
            break;
          }
          turnResult = {
            kind: "turn",
            turn: {
              speakerId: input.self.id,
              kind: result.data.kind,
              line: result.data.line,
              reasoning: result.data.reasoning,
            },
          };
        } else if (name === END_CONVERSATION_TOOL_NAME) {
          const result = EndConversationSchema.safeParse(args);
          if (!result.success) {
            messages.push({ role: "user", content: `end_conversation 参数不符合要求：${result.error.message}。请修正后重试。` });
            hasError = true;
            break;
          }
          endResult = {
            kind: "end",
            payload: {
              reasoning: result.data.reasoning,
              closingLine: result.data.closing_line,
            },
          };
        } else if (name === PROPOSE_DIALOGUE_ACTION_TOOL_NAME) {
          const result = ProposeDialogueActionSchema.safeParse(args);
          if (!result.success) {
            messages.push({ role: "user", content: `propose_dialogue_action 参数不符合要求：${result.error.message}。请修正后重试。` });
            hasError = true;
            break;
          }
          // Validate the action type exists and is usableInDialogue
          const def = actionRegistry.get(result.data.action_type);
          if (!def || !def.usableInDialogue) {
            messages.push({ role: "user", content: `action_type="${result.data.action_type}" 不存在或不可在对话中使用。` });
            hasError = true;
            break;
          }
          proposeAction = {
            actionType: result.data.action_type,
            targetId: result.data.target_id,
            params: {
              target_id: result.data.target_id,
              amount: result.data.amount,
              free_text: result.data.free_text,
            },
          };
        } else if (name === RESPOND_DIALOGUE_ACTION_TOOL_NAME) {
          const result = RespondDialogueActionSchema.safeParse(args);
          if (!result.success) {
            messages.push({ role: "user", content: `respond_to_dialogue_action 参数不符合要求：${result.error.message}。请修正后重试。` });
            hasError = true;
            break;
          }
          respondToAction = {
            accepted: result.data.response === "accept",
            reasoning: result.data.reasoning,
          };
        } else {
          messages.push({ role: "user", content: `未知工具 "${name}"。请使用以下工具：${DIALOG_TURN_TOOL_NAME}、${END_CONVERSATION_TOOL_NAME}${hasDialogueActions ? `、${PROPOSE_DIALOGUE_ACTION_TOOL_NAME}` : ""}${input.pendingAction ? `、${RESPOND_DIALOGUE_ACTION_TOOL_NAME}` : ""}。` });
          hasError = true;
          break;
        }
      }

      if (hasError) {
        if (round < MAX_TOOL_CALL_ROUNDS - 1) continue;
        throw new Error(`LLM ${MAX_TOOL_CALL_ROUNDS} 轮均存在错误`);
      }

      // Must have either turn or end
      if (!turnResult && !endResult) {
        const feedback = `你必须调用 ${DIALOG_TURN_TOOL_NAME} 来说一句话，或调用 ${END_CONVERSATION_TOOL_NAME} 来结束对话。`;
        if (round < MAX_TOOL_CALL_ROUNDS - 1) {
          messages.push({ role: "user", content: feedback });
          continue;
        }
        throw new Error(`LLM ${MAX_TOOL_CALL_ROUNDS} 轮均未返回 turn 或 end`);
      }

      if (turnResult) {
        return { ...turnResult, proposeAction, respondToAction };
      }
      return { ...endResult!, respondToAction };
    } catch (err) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      dialogLog.warn("LLM dialog_turn 调用异常", {
        attempt: round + 1,
        self: input.self.name,
        peer: input.peer.name,
        error: errMsg,
        ...(err instanceof OpenAI.APIError
          ? {
              status: err.status,
              errorBody: (err as any).error ? JSON.stringify((err as any).error).slice(0, 2000) : undefined,
            }
          : {}),
      });
      if (round < MAX_TOOL_CALL_ROUNDS - 1) {
        messages.push({ role: "user", content: `调用失败：${errMsg}\n\n请重试。` });
        continue;
      }
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
      parameters: DialogSummaryToolSchema,
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
      lastResponseSnapshot = llmResponseSnapshot(response);

      const message = response.choices[0]?.message;
      const toolCall = message?.tool_calls?.find(
        (c) => c.type === "function" && c.function.name === DIALOG_SUMMARY_TOOL_NAME,
      );
      if (!toolCall || toolCall.type !== "function") {
        throw new Error(`LLM 没有返回 dialog_summary tool_call。响应：${lastResponseSnapshot}`);
      }

      const parsed = JSON.parse((toolCall as any).function.arguments);
      const result = DialogSummarySchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`DialogSummary 参数不符合 schema：${result.error.message}。rawArgs：${(toolCall as any).function.arguments?.slice(0, 1000)}`);
      }

      summaryLog.info("LLM dialog_summarize 成功", {
        opener: input.openerName,
        responder: input.responderName,
        turns: input.transcript.length,
        attempt,
      });
      return { summary: result.data.summary, memorize: result.data.memorize };
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

  const extra: Record<string, unknown> = {};
  if (config.thinkingEnabled) extra.thinking = { type: "enabled" };

  memoryLog.info("LLM memory_compress 请求");

  let lastResponseSnapshot = "(no response)";
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
        ...extra,
      });
      lastResponseSnapshot = llmResponseSnapshot(response);

      const content = response.choices[0]?.message?.content;
      if (!content || !content.trim()) {
        throw new Error(`LLM 返回了空内容。响应：${lastResponseSnapshot}`);
      }
      return content.trim();
    } catch (err) {
      memoryLog.warn("LLM memory_compress 失败", {
        attempt,
        error: err instanceof Error ? err.message : String(err),
        llmResponse: lastResponseSnapshot,
      });
      if (attempt === 0) continue;
    }
  }
  memoryLog.error("LLM memory_compress 彻底失败", { llmResponse: lastResponseSnapshot });
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
  peer: Character;
  tick: number;
  epoch: number;
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
      parameters: AcceptToolSchema,
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
      lastResponseSnapshot = llmResponseSnapshot(response);

      const message = response.choices[0]?.message;
      const toolCall = message?.tool_calls?.find(
        (c) => c.type === "function" && c.function.name === ACCEPT_TOOL_NAME,
      );
      if (!toolCall || toolCall.type !== "function") {
        throw new Error(`LLM 没有返回 accept_decision tool_call。响应：${lastResponseSnapshot}`);
      }

      const parsed = JSON.parse(toolCall.function.arguments);
      const result = AcceptDecisionSchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`AcceptDecision 参数不符合 schema：${result.error.message}。rawArgs：${toolCall.function.arguments.slice(0, 1000)}`);
      }
      // Validate type field
      if (result.data.action_type !== "accept_speak" && result.data.action_type !== "reject_speak") {
        throw new Error(`非法 action_type：${result.data.action_type}。rawArgs：${toolCall.function.arguments.slice(0, 1000)}`);
      }
      return {
        type: result.data.action_type,
        targetId: result.data.target_id,
        reasoning: result.data.reasoning,
        selfImportance: result.data.self_importance,
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
  return { type: "reject_speak", targetId: input.requesterId, reasoning: "决策失败默认拒绝", selfImportance: 1 };
}

/**
 * 补救轮决策：使用统一的 decide_action + 排除 speak 族。
 * 违规（仍输出 speak）→ 重试 1 次 → 仍违规抛异常让调用方 fallback wait。
 */
export async function llmSalvageDecide(
  input: DecideInput & { rejectReason: string },
): Promise<Action> {
  if (!hasApiKey()) return {
    type: "look_around",
    actorId: input.character.id,
    reasoning: `补救决策失败（无 provider）：${input.rejectReason}`,
    selfImportance: 1,
  };

  salvageLog.warn("补救轮触发", {
    角色: input.character.name,
    reject_reason: input.rejectReason,
  });

  const language = input.language;

  const system = buildSystemPrompt({
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
    epoch: input.epoch,
    facts: input.facts,
    language,
    allCharacters: input.allCharacters,
    nodes: input.nodes,
    activeEventDefs: input.activeEventDefs,
    upcomingNotebookText: input.upcomingNotebookText,
  });
  const salvageCtx = buildSalvageContext({ rejectReason: input.rejectReason });

  const tool = buildDecideActionTool(input.ctx);

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: system },
    { role: "user", content: user + "\n\n" + salvageCtx },
  ];

  let lastAction: Action | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { actionType, data } = await callLLMWithRetry(
        messages.map((m) => ({ ...m })), // shallow copy per attempt
        tool,
        "Salvage",
        "salvage",
        input.ctx,
        input.allCharacters,
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
        amount: data.amount,
        reasoning: data.reasoning,
        emotionTag: data.emotion_tag,
        selfImportance: data.self_importance,
        changeType: data.change_type,
        reason: data.reason,
        arrivalAction: data.arrival_action
          ? {
              type: (data.arrival_action.action_type as string)?.startsWith("action_")
                ? (data.arrival_action.action_type as string).slice("action_".length)
                : data.arrival_action.action_type,
              freeText: data.arrival_action.free_text,
              targetId: data.arrival_action.target_id,
              targetNodeId: data.arrival_action.target_node_id,
            }
          : undefined,
      };
    } catch (err) {
      salvageLog.warn("LLM salvage 失败", {
        attempt,
        角色: input.character.name,
        error: err instanceof Error ? err.message : String(err),
      });
      if (attempt === 0) continue;
      lastAction = {
        type: "look_around",
        actorId: input.character.id,
        reasoning: `补救决策违规，环顾四周：${err instanceof Error ? err.message : String(err)}`,
        selfImportance: 1,
      };
    }
  }
  return lastAction!;
}

// ---------------------------------------------------------------------------
// Pre-sleep reflection
// ---------------------------------------------------------------------------

export interface ReflectionResult {
  memorize?: Array<{ target_id: string; impression: string }>;
  liked?: string;
  disliked?: string;
  short_term_goal?: string;
  long_term_goal?: string;
}

export async function llmReflection(args: { prompt: string; language?: Language }): Promise<ReflectionResult> {
  if (!hasApiKey()) return {};

  const config = getEntryConfig("memory_compress");
  const client = getLLMClientForEntry("memory_compress");
  const language: Language = args.language ?? "zh";
  const tool: ChatCompletionTool = {
    type: "function",
    function: { name: REFLECTION_TOOL_NAME, description: "提交睡前反思结果。所有字段可选。", parameters: ReflectionToolSchema },
  };
  const extra: Record<string, unknown> = {};
  if (config.thinkingEnabled) extra.thinking = { type: "enabled" };

  let lastResponseSnapshot = "(no response)";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: getModelNameForEntry("memory_compress"),
        max_tokens: 1024,
        messages: [
          { role: "system", content: `你是一个角色反思助手。请基于提供的记忆和当前状态进行反思。\n\n${languageInstruction(language)}` },
          { role: "user", content: args.prompt },
        ],
        tools: [tool],
        ...extra,
      });
      lastResponseSnapshot = llmResponseSnapshot(response);
      const message = response.choices[0]?.message;
      const tc = (message?.tool_calls ?? []).find(
        (c: any) => c.type === "function" && c.function.name === REFLECTION_TOOL_NAME,
      ) as any;
      if (!tc) throw new Error(`LLM 没有返回 reflection tool_call。响应：${lastResponseSnapshot}`);
      const parsed = JSON.parse(tc.function.arguments);
      const result = ReflectionSchema.safeParse(parsed);
      if (!result.success) throw new Error(`Reflection 参数不符合 schema：${result.error.message}。rawArgs：${tc.function.arguments.slice(0, 1000)}`);
      return result.data;
    } catch (err) {
      memoryLog.warn("LLM reflection 失败", {
        attempt,
        error: err instanceof Error ? err.message : String(err),
        llmResponse: lastResponseSnapshot,
      });
      if (attempt === 0) continue;
    }
  }
  memoryLog.error("LLM reflection 彻底失败", { llmResponse: lastResponseSnapshot });
  return {};
}
