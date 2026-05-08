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
  UPDATE_LIKES_TOOL_NAME, UpdateLikesSchema, UpdateLikesToolSchema,
  UPDATE_GOALS_TOOL_NAME, UpdateGoalsSchema, UpdateGoalsToolSchema,
  ACCEPT_TOOL_NAME, AcceptDecisionSchema, AcceptToolSchema,
  DIALOG_TURN_TOOL_NAME, DialogTurnSchema, DialogTurnToolSchema,
  DIALOG_SUMMARY_TOOL_NAME, DialogSummarySchema, DialogSummaryToolSchema,
  DIALOG_PERSONAL_MEMORY_TOOL_NAME, DialogPersonalMemorySchema, DialogPersonalMemoryToolSchema,
  END_CONVERSATION_TOOL_NAME, EndConversationToolSchema, EndConversationSchema,
  PROPOSE_DIALOGUE_ACTION_TOOL_NAME, ProposeDialogueActionSchema, ProposeDialogueActionToolSchema,
  RESPOND_DIALOGUE_ACTION_TOOL_NAME, RespondDialogueActionSchema, RespondDialogueActionToolSchema,
  NOTEBOOK_TOOL_NAME, NotebookSchema, NotebookToolSchema,
  THINK_TOOL_NAME, ThinkTurnSchema, ThinkTurnToolSchema,
  END_THINKING_TOOL_NAME, EndThinkingSchema, EndThinkingToolSchema,
  type AcceptDecisionPayload, type DialogTurnPayload, type DialogSummaryPayload, type DialogPersonalMemoryPayload,
} from "@agw/domain";
import type { Action, Character, DialogTurn, EndConversationPayload, Language, MapNode, WorldEvent } from "@agw/domain";
import type { AggregatedFacts } from "@agw/systems";
import { getLLMClientForEntry, getModelNameForEntry, hasApiKey } from "./client";
import { getEntryConfig } from "./providers";
import { actionRegistry, type ActionContext, type GlobalEventDef } from "@agw/domain";
import { tickFromCalendar, formatCurrentTime, createEntryId, saveNotebookEntry } from "@agw/systems";
import type { ActionOption } from "@agw/systems";
import {
  buildAcceptDecisionPrompt,
  buildDialogSummaryPrompt,
  buildDialogPersonalMemoryPrompt,
  buildDialogSystemPrompt,
  buildDialogTurnFollowup,
  buildDialogTurnPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  buildThinkSystemPrompt,
  buildThinkFollowup,
  buildThinkPrompt,
  injectThinkTimeMessage,
  languageInstruction,
} from "./prompt";
import type { ThinkTurn } from "@agw/domain";
import { createLogger } from "@agw/shared";

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
}

export type DecideFn = (input: DecideInput) => Promise<Action>;

const decideLog = createLogger("llm-decide");
const dialogLog = createLogger("llm-dialog");
const acceptLog = createLogger("llm-accept");
const summaryLog = createLogger("llm-summary");
const salvageLog = createLogger("llm-salvage");
const memoryLog = createLogger("llm-memory");

const MAX_OUTPUT_TOKENS = 16384;

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

const MAX_TOOL_CALL_ROUNDS = 5;
// prompt 在 callLLMWithRetry 外构建一次，不随 round 重建 —— 避免 Map/Object 序列化顺序波动导致 cache miss

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

  decideLog.info("DECIDE_PROMPT", { prompt: { system, user }, character: input.character.name });

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
  /** 如果提供，从此 messages 数组恢复上下文，而非从头构建。 */
  previousMessages?: Array<Record<string, unknown>>;
  /** previousMessages 上次保存时 transcript 的长度，用于计算增量。 */
  previousTranscriptLength?: number;
}

export interface DialogTurnResult {
  kind: "turn";
  turn: DialogTurn;
  proposeAction?: import("@/engine/dialog").DialogueActionProposal;
  respondToAction?: import("@/engine/dialog").DialogueActionResponse;
  /** 更新后的 LLM messages 上下文，供调用方持久化到 Conversation.llmContexts。 */
  messages?: Array<Record<string, unknown>>;
  /** 保存 messages 时的 transcript 长度，供下次增量计算。 */
  transcriptLength?: number;
}

export interface DialogEndResult {
  kind: "end";
  payload: EndConversationPayload;
  respondToAction?: import("@/engine/dialog").DialogueActionResponse;
  /** 更新后的 LLM messages 上下文，供调用方持久化。 */
  messages?: Array<Record<string, unknown>>;
  /** 保存 messages 时的 transcript 长度。 */
  transcriptLength?: number;
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

  dialogLog.info("DIALOG_PROMPT", { prompt, speaker: input.self.name, peer: input.peer.name });

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
    buildUpdateLikesTool(),
    buildUpdateGoalsTool(),
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

  const systemPrompt = buildDialogSystemPrompt(language);

  dialogLog.info("LLM dialog_turn 请求", {
    self: input.self.name,
    peer: input.peer.name,
    hasPendingAction: !!input.pendingAction,
    dialogueActionCount: input.dialogueActions?.length ?? 0,
  });

  let messages: Array<Record<string, unknown>>;
  const transcriptLengthAtStart = input.transcript.length;

  if (input.previousMessages && input.previousTranscriptLength !== undefined) {
    // Subsequent turn: resume from persisted context
    messages = input.previousMessages.map((m) => ({ ...m }));
    const newEntries = input.transcript.slice(input.previousTranscriptLength);
    const followup = buildDialogTurnFollowup({
      self: input.self,
      peer: input.peer,
      newTranscriptEntries: newEntries,
      language,
      pendingAction: input.pendingAction,
      dialogueActions: input.dialogueActions,
      upcomingEntries: input.upcomingEntries,
      tick: input.tick,
      epoch: input.epoch,
    });
    messages.push({ role: "user", content: followup });
  } else {
    // First turn: build fresh prompt
    messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ];
  }

  let lastError: unknown;
  for (let round = 0; round < MAX_TOOL_CALL_ROUNDS; round++) {
    try {
      const response = await client.chat.completions.create({
        model: getModelNameForEntry("dialog_turn"),
        max_tokens: 4096,
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
        return {
          kind: "end",
          payload: { reasoning: "推理轮次耗尽。", closingLine: `${input.self.name} 沉默了。` },
        messages, transcriptLength: transcriptLengthAtStart } as DialogEndResult;
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
        return {
          kind: "end",
          payload: { reasoning: "推理轮次耗尽。", closingLine: `${input.self.name} 沉默了。` },
        messages, transcriptLength: transcriptLengthAtStart } as DialogEndResult;
      }

      // Process all tool calls in a single pass.
      // submit_dialog_turn and end_conversation are terminal — when called (and
      // no error), the turn ends immediately. All other tools are non-terminal
      // and consume a round normally. If rounds are exhausted without calling
      // a terminal tool, the character falls silent.
      let turnResult: { kind: "turn"; turn: DialogTurn } | null = null;
      let endResult: { kind: "end"; payload: EndConversationPayload } | null = null;
      let proposeAction: DialogTurnResult["proposeAction"] | undefined;
      let respondToAction: DialogEndResult["respondToAction"] | undefined;
      let hasError = false;

      for (const tc of allToolCalls) {
        const t = tc as any;
        const name = t.function.name;

        if (name === RECALL_TOOL_NAME) {
          let parsedArgs: unknown;
          try { parsedArgs = JSON.parse(t.function.arguments); } catch (e) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `recall JSON 解析失败：${e instanceof Error ? e.message : String(e)}。请重试。` });
            hasError = true;
            continue;
          }
          const parseResult = RecallSchema.safeParse(parsedArgs);
          if (!parseResult.success) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `recall 参数不符合要求：${parseResult.error.message}。` });
            hasError = true;
            continue;
          }
          const recallResult = handleRecall(parseResult.data.target_ids, input.self, [input.peer]);
          messages.push({ role: "tool", tool_call_id: t.id, content: recallResult });
        } else if (name === MEMORIZE_TOOL_NAME) {
          let parsedArgs: unknown;
          try { parsedArgs = JSON.parse(t.function.arguments); } catch (e) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `memorize JSON 解析失败：${e instanceof Error ? e.message : String(e)}。请重试。` });
            hasError = true;
            continue;
          }
          const parseResult = MemorizeSchema.safeParse(parsedArgs);
          if (!parseResult.success) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `memorize 参数不符合要求：${parseResult.error.message}。` });
            hasError = true;
            continue;
          }
          handleMemorize(parseResult.data.target_id, parseResult.data.impression, input.self);
          messages.push({ role: "tool", tool_call_id: t.id, content: "已记录。" });
        } else if (name === NOTEBOOK_TOOL_NAME) {
          const NBR = "NOTEBOOK_TIMEFAIL" as const;
          const previousFails = messages.filter(
            (m: any) => m.role === "tool" && typeof m.content === "string" && m.content.startsWith(`[${NBR}]`),
          ).length;

          let parsedArgs: unknown;
          try { parsedArgs = JSON.parse(t.function.arguments); } catch (e) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `add_notebook_entry JSON 解析失败：${e instanceof Error ? e.message : String(e)}。请重试。` });
            hasError = true;
            continue;
          }
          const parseResult = NotebookSchema.safeParse(parsedArgs);
          if (!parseResult.success) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `add_notebook_entry 参数不符合要求：${parseResult.error.message}。` });
            hasError = true;
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
            hasError = true;
            continue;
          }

          if (scheduledTick <= (input.tick ?? 0)) {
            const nowStr = formatCurrentTime(input.tick ?? 0, epoch);
            if (previousFails === 0) {
              messages.push({ role: "tool", tool_call_id: t.id, content: `[${NBR}] 约定时间（${year}年${month}月${day}日 ${hour}:00）必须在当前时间之后。当前游戏时间是 ${nowStr}。请根据当前时间重新调整。` });
            } else {
              messages.push({ role: "tool", tool_call_id: t.id, content: `[${NBR}] 约定时间仍不正确，放弃记录。你可以继续对话或结束。` });
            }
            hasError = true;
            continue;
          }

          const timeLabel = `${year}年${month}月${day}日 ${String(hour).padStart(2, "0")}:00`;
          if (input.self.notebook.some((e: any) => e.scheduledTick === scheduledTick)) {
            if (previousFails === 0) {
              messages.push({ role: "tool", tool_call_id: t.id, content: `[${NBR}] ${timeLabel} 已经有约了。请选择其他时间。` });
            } else {
              messages.push({ role: "tool", tool_call_id: t.id, content: `[${NBR}] ${timeLabel} 仍有冲突，放弃记录。你可以继续对话或结束。` });
            }
            hasError = true;
            continue;
          }

          const TICKS_PER_HOUR = 5;
          if (scheduledTick - (input.tick ?? 0) < TICKS_PER_HOUR) {
            if (previousFails === 0) {
              messages.push({ role: "tool", tool_call_id: t.id, content: `[${NBR}] ${timeLabel} 马上就要到了，不需要备忘。请选择更晚的时间。` });
            } else {
              messages.push({ role: "tool", tool_call_id: t.id, content: `[${NBR}] ${timeLabel} 仍太近了，放弃记录。你可以继续对话或结束。` });
            }
            hasError = true;
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
          input.transcript.push({
            speakerId: "__system__",
            kind: "action_result",
            line: `📝 ${input.self.name} 在记事本中记录了约定：${timeLabel} — ${free_text}`,
          });
        } else if (name === UPDATE_LIKES_TOOL_NAME) {
          let parsedArgs: unknown;
          try { parsedArgs = JSON.parse(t.function.arguments); } catch (e) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `update_likes JSON 解析失败。` });
            hasError = true;
            continue;
          }
          const parseResult = UpdateLikesSchema.safeParse(parsedArgs);
          if (!parseResult.success) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `update_likes 参数不符合要求：${parseResult.error.message}。` });
            hasError = true;
            continue;
          }
          if (parseResult.data.liked !== undefined) input.self.liked = parseResult.data.liked;
          if (parseResult.data.disliked !== undefined) input.self.disliked = parseResult.data.disliked;
          messages.push({ role: "tool", tool_call_id: t.id, content: "已更新喜好。" });
        } else if (name === UPDATE_GOALS_TOOL_NAME) {
          let parsedArgs: unknown;
          try { parsedArgs = JSON.parse(t.function.arguments); } catch (e) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `update_goals JSON 解析失败。` });
            hasError = true;
            continue;
          }
          const parseResult = UpdateGoalsSchema.safeParse(parsedArgs);
          if (!parseResult.success) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `update_goals 参数不符合要求：${parseResult.error.message}。` });
            hasError = true;
            continue;
          }
          const currentTick = input.tick ?? 0;
          const SHORT_GOAL_INTERVAL = 120;
          const LONG_GOAL_INTERVAL = 840;
          let applied: string[] = [];
          if (parseResult.data.short_term_goal !== undefined) {
            const lastUpdate = input.self.shortTermGoal?.updatedAt ?? 0;
            if (currentTick - lastUpdate >= SHORT_GOAL_INTERVAL) {
              input.self.shortTermGoal = { goal: parseResult.data.short_term_goal, updatedAt: currentTick };
              applied.push("短期目标");
            }
          }
          if (parseResult.data.long_term_goal !== undefined) {
            const lastUpdate = input.self.longTermGoal?.updatedAt ?? 0;
            if (currentTick - lastUpdate >= LONG_GOAL_INTERVAL) {
              input.self.longTermGoal = { goal: parseResult.data.long_term_goal, updatedAt: currentTick };
              applied.push("长期目标");
            }
          }
          messages.push({ role: "tool", tool_call_id: t.id, content: applied.length > 0 ? `已更新：${applied.join("、")}。` : "目标更新间隔未到，暂未应用。" });
        } else if (name === DIALOG_TURN_TOOL_NAME) {
          let args: unknown;
          try { args = JSON.parse(t.function.arguments); } catch (e) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `submit_dialog_turn JSON 解析失败：${e instanceof Error ? e.message : String(e)}。` });
            hasError = true;
            continue;
          }
          const result = DialogTurnSchema.safeParse(args);
          if (!result.success) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `submit_dialog_turn 参数不符合要求：${result.error.message}。` });
            hasError = true;
            continue;
          }
          messages.push({ role: "tool", tool_call_id: t.id, content: "台词已记录。" });
          turnResult = {
            kind: "turn",
            turn: {
              speakerId: input.self.id,
              kind: "say",
              line: result.data.line,
              reasoning: result.data.reasoning,
            },
          };
        } else if (name === END_CONVERSATION_TOOL_NAME) {
          let args: unknown;
          try { args = JSON.parse(t.function.arguments); } catch (e) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `end_conversation JSON 解析失败：${e instanceof Error ? e.message : String(e)}。` });
            hasError = true;
            continue;
          }
          const result = EndConversationSchema.safeParse(args);
          if (!result.success) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `end_conversation 参数不符合要求：${result.error.message}。` });
            hasError = true;
            continue;
          }
          messages.push({ role: "tool", tool_call_id: t.id, content: "对话结束。" });
          endResult = {
            kind: "end",
            payload: {
              reasoning: result.data.reasoning,
              closingLine: result.data.closing_line,
            },
          };
        } else if (name === PROPOSE_DIALOGUE_ACTION_TOOL_NAME) {
          let args: unknown;
          try { args = JSON.parse(t.function.arguments); } catch (e) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `propose_dialogue_action JSON 解析失败：${e instanceof Error ? e.message : String(e)}。` });
            hasError = true;
            continue;
          }
          const result = ProposeDialogueActionSchema.safeParse(args);
          if (!result.success) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `propose_dialogue_action 参数不符合要求：${result.error.message}。` });
            hasError = true;
            continue;
          }
          const def = actionRegistry.get(result.data.action_type);
          if (!def || !def.usableInDialogue) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `action_type="${result.data.action_type}" 不存在或不可在对话中使用。` });
            hasError = true;
            continue;
          }
          messages.push({ role: "tool", tool_call_id: t.id, content: `已提出 ${result.data.action_type} 请求。` });
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
          let args: unknown;
          try { args = JSON.parse(t.function.arguments); } catch (e) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `respond_to_dialogue_action JSON 解析失败：${e instanceof Error ? e.message : String(e)}。` });
            hasError = true;
            continue;
          }
          const result = RespondDialogueActionSchema.safeParse(args);
          if (!result.success) {
            messages.push({ role: "tool", tool_call_id: t.id, content: `respond_to_dialogue_action 参数不符合要求：${result.error.message}。` });
            hasError = true;
            continue;
          }
          messages.push({ role: "tool", tool_call_id: t.id, content: `已${result.data.response === "accept" ? "接受" : "拒绝"}请求。` });
          respondToAction = {
            accepted: result.data.response === "accept",
            reasoning: result.data.reasoning,
          };
        } else {
          messages.push({ role: "tool", tool_call_id: t.id, content: `未知工具 "${name}"。` });
          hasError = true;
        }
      }

      // Determine outcome after processing all tool calls
      if (hasError) {
        if (round < MAX_TOOL_CALL_ROUNDS - 1) continue;
        // Exhausted rounds → silence
        return {
          kind: "end",
          payload: { reasoning: "推理轮次耗尽。", closingLine: `${input.self.name} 沉默了。` },
        messages, transcriptLength: transcriptLengthAtStart } as DialogEndResult;
      }

      if (turnResult) return { ...turnResult, proposeAction, respondToAction, messages, transcriptLength: transcriptLengthAtStart };
      if (endResult) return { ...endResult, respondToAction, messages, transcriptLength: transcriptLengthAtStart };

      // No terminal tool called this round — consume a round and retry or fall silent
      if (round < MAX_TOOL_CALL_ROUNDS - 1) {
        messages.push({
          role: "user",
          content: `你必须调用 ${DIALOG_TURN_TOOL_NAME} 说出台词，或调用 ${END_CONVERSATION_TOOL_NAME} 结束对话。剩余轮数：${MAX_TOOL_CALL_ROUNDS - round - 1}。`,
        });
        continue;
      }
      return {
        kind: "end",
        payload: { reasoning: "推理轮次耗尽。", closingLine: `${input.self.name} 沉默了。` },
      messages, transcriptLength: transcriptLengthAtStart } as DialogEndResult;
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

// ---------------------------------------------------------------------------
// Dialog personal memory — one character's reflection after a conversation
// ---------------------------------------------------------------------------

export interface DialogPersonalMemoryInput {
  characterName: string;
  characterId: string;
  partnerName: string;
  partnerId: string;
  transcript: DialogTurn[];
  language?: Language;
}

export async function llmDialogPersonalMemory(input: DialogPersonalMemoryInput): Promise<DialogPersonalMemoryPayload> {
  if (!hasApiKey()) {
    return { feeling: "（无 API key）", impression: "（无 API key）", topics: ["（无 API key）"] };
  }

  const config = getEntryConfig("dialog_personal_memory");
  const client = getLLMClientForEntry("dialog_personal_memory");
  const language: Language = input.language ?? "zh";

  summaryLog.info("LLM dialog_personal_memory 请求", {
    character: input.characterName,
    partner: input.partnerName,
    turns: input.transcript.length,
  });

  const prompt = buildDialogPersonalMemoryPrompt({
    characterName: input.characterName,
    characterId: input.characterId,
    partnerName: input.partnerName,
    partnerId: input.partnerId,
    transcript: input.transcript,
    language,
  });

  const tool: ChatCompletionTool = {
    type: "function",
    function: {
      name: DIALOG_PERSONAL_MEMORY_TOOL_NAME,
      description: "返回你对这次对话的个人记忆。",
      parameters: DialogPersonalMemoryToolSchema,
    },
  };

  const extra: Record<string, unknown> = {};
  if (config.thinkingEnabled) extra.thinking = { type: "enabled" };

  let lastError: string | undefined;
  let lastResponseSnapshot = "(no response)";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: getModelNameForEntry("dialog_personal_memory"),
        max_tokens: 2048,
        messages: [
          {
            role: "system",
            content: `你是 ${input.characterName}。请从你的视角回顾刚才的对话，记录你的心情、对对方的印象、以及聊到的主题。\n\n${languageInstruction(language)}`,
          },
          { role: "user", content: prompt },
        ],
        tools: [tool],
        ...extra,
      });
      lastResponseSnapshot = llmResponseSnapshot(response);

      const message = response.choices[0]?.message;
      const toolCall = message?.tool_calls?.find(
        (c) => c.type === "function" && c.function.name === DIALOG_PERSONAL_MEMORY_TOOL_NAME,
      );
      if (!toolCall || toolCall.type !== "function") {
        throw new Error(`LLM 没有返回 dialog_personal_memory tool_call。响应：${lastResponseSnapshot}`);
      }

      const parsed = JSON.parse((toolCall as any).function.arguments);
      const result = DialogPersonalMemorySchema.safeParse(parsed);
      if (!result.success) {
        throw new Error(`DialogPersonalMemory 参数不符合 schema：${result.error.message}。rawArgs：${(toolCall as any).function.arguments?.slice(0, 1000)}`);
      }

      summaryLog.info("LLM dialog_personal_memory 成功", {
        character: input.characterName,
        partner: input.partnerName,
        turns: input.transcript.length,
        attempt,
      });
      return result.data;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      summaryLog.warn("LLM dialog_personal_memory 失败", {
        character: input.characterName,
        partner: input.partnerName,
        turns: input.transcript.length,
        attempt,
        error: lastError,
        llmResponse: lastResponseSnapshot,
      });
      if (attempt === 0) continue;
    }
  }
  summaryLog.error("LLM dialog_personal_memory 彻底失败", {
    character: input.characterName,
    partner: input.partnerName,
    turns: input.transcript.length,
    lastError,
    llmResponse: lastResponseSnapshot,
  });
  return { feeling: "（记忆生成失败）", impression: "（记忆生成失败）", topics: ["（记忆生成失败）"] };
}

// ---------------------------------------------------------------------------
// Think session LLM entry
// ---------------------------------------------------------------------------

export interface ThinkTurnResult {
  kind: "turn";
  turn: ThinkTurn;
  messages?: Array<Record<string, unknown>>;
  transcriptLength?: number;
}

export interface ThinkEndResult {
  kind: "end";
  summary: string;
  messages?: Array<Record<string, unknown>>;
  transcriptLength?: number;
}

const THINK_TURNS_PER_TICK = 3;

export async function llmThink(args: {
  self: Character;
  here: MapNode;
  transcript: ThinkTurn[];
  language?: Language;
  tick: number;
  epoch: number;
  tickStarted: number;
  previousMessages?: Array<Record<string, unknown>>;
  previousTranscriptLength?: number;
  allCharacters?: Character[];
}): Promise<ThinkTurnResult | ThinkEndResult> {
  if (!hasApiKey()) throw new Error("没有激活的 LLM provider");

  const config = getEntryConfig("dialog_turn");
  const client = getLLMClientForEntry("dialog_turn");
  const language: Language = args.language ?? "zh";

  const prompt = buildThinkPrompt({
    self: args.self,
    here: args.here,
    transcript: args.transcript,
    language,
    tick: args.tick,
    epoch: args.epoch,
    allCharacters: args.allCharacters,
  });

  dialogLog.info("THINK_PROMPT", { prompt, speaker: args.self.name });

  const tools: ChatCompletionTool[] = [
    {
      type: "function",
      function: { name: THINK_TOOL_NAME, description: "输出一段思考。", parameters: ThinkTurnToolSchema },
    },
    {
      type: "function",
      function: { name: END_THINKING_TOOL_NAME, description: "结束思考并写入总结。", parameters: EndThinkingToolSchema },
    },
    buildRecallTool(),
    buildMemorizeTool(),
    buildNotebookTool(),
    buildUpdateLikesTool(),
    buildUpdateGoalsTool(),
  ];

  const extra: Record<string, unknown> = {};
  if (config.thinkingEnabled) extra.thinking = { type: "enabled" };

  const systemPrompt = buildThinkSystemPrompt(language);

  let messages: Array<Record<string, unknown>>;
  const transcriptLengthAtStart = args.transcript.length;

  if (args.previousMessages && args.previousTranscriptLength !== undefined) {
    // Subsequent turn: resume from persisted context
    messages = args.previousMessages.map((m) => ({ ...m }));
    const newEntries = args.transcript.slice(args.previousTranscriptLength);
    const followup = buildThinkFollowup({
      self: args.self,
      newTranscriptEntries: newEntries,
      language,
      tick: args.tick,
      epoch: args.epoch,
    });
    messages.push({ role: "user", content: followup });
  } else {
    // First turn: build fresh prompt
    messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ];
  }

  for (let round = 0; round < MAX_TOOL_CALL_ROUNDS; round++) {
    const response = await client.chat.completions.create({
      model: getModelNameForEntry("dialog_turn"),
      max_tokens: 4096,
      messages: messages as any,
      tools,
      ...extra,
    });

    const message = response.choices[0]?.message;
    if (!message) {
      if (round < MAX_TOOL_CALL_ROUNDS - 1) {
        messages.push({ role: "user", content: "没有返回内容，请重试调用工具。" });
        continue;
      }
      return { kind: "end", summary: "思考轮次耗尽。", messages, transcriptLength: transcriptLengthAtStart } as ThinkEndResult;
    }

    const assistantMsg: Record<string, unknown> = { role: "assistant", content: message.content ?? "" };
    if ((message as any).reasoning_content) assistantMsg.reasoning_content = (message as any).reasoning_content;
    if (message.tool_calls) assistantMsg.tool_calls = message.tool_calls;
    messages.push(assistantMsg);

    const allToolCalls = (message.tool_calls ?? []).filter((c: any) => c.type === "function");
    if (allToolCalls.length === 0) {
      if (round < MAX_TOOL_CALL_ROUNDS - 1) {
        messages.push({ role: "user", content: "请调用 submit_think_turn 或 end_thinking 工具。" });
        continue;
      }
      return { kind: "end", summary: "思考轮次耗尽。", messages, transcriptLength: transcriptLengthAtStart } as ThinkEndResult;
    }

    // Process all tool calls in a single pass.
    // submit_think_turn and end_thinking are terminal — when called (and no
    // error), the turn ends immediately. All other tools are non-terminal and
    // consume a round normally.
    let turnResult: ThinkTurnResult | null = null;
    let endResult: ThinkEndResult | null = null;
    let hasError = false;

    for (const tc of allToolCalls) {
      const t = tc as any;
      const name = t.function.name;

      if (name === RECALL_TOOL_NAME) {
        let parsedArgs: unknown;
        try { parsedArgs = JSON.parse(t.function.arguments); } catch (e) {
          messages.push({ role: "tool", tool_call_id: t.id, content: `recall JSON 解析失败。` });
          hasError = true;
          continue;
        }
        const parseResult = RecallSchema.safeParse(parsedArgs);
        if (!parseResult.success) {
          messages.push({ role: "tool", tool_call_id: t.id, content: `recall 参数不符合要求。` });
          hasError = true;
          continue;
        }
        const recallResult = handleRecall(parseResult.data.target_ids, args.self, []);
        messages.push({ role: "tool", tool_call_id: t.id, content: recallResult });
      } else if (name === MEMORIZE_TOOL_NAME) {
        let parsedArgs: unknown;
        try { parsedArgs = JSON.parse(t.function.arguments); } catch (e) {
          messages.push({ role: "tool", tool_call_id: t.id, content: `memorize JSON 解析失败。` });
          hasError = true;
          continue;
        }
        const parseResult = MemorizeSchema.safeParse(parsedArgs);
        if (!parseResult.success) {
          messages.push({ role: "tool", tool_call_id: t.id, content: `memorize 参数不符合要求。` });
          hasError = true;
          continue;
        }
        handleMemorize(parseResult.data.target_id, parseResult.data.impression, args.self);
        messages.push({ role: "tool", tool_call_id: t.id, content: "已记录。" });
      } else if (name === NOTEBOOK_TOOL_NAME) {
        let parsedArgs: unknown;
        try { parsedArgs = JSON.parse(t.function.arguments); } catch (e) {
          messages.push({ role: "tool", tool_call_id: t.id, content: `add_notebook_entry JSON 解析失败。` });
          hasError = true;
          continue;
        }
        const parseResult = NotebookSchema.safeParse(parsedArgs);
        if (!parseResult.success) {
          messages.push({ role: "tool", tool_call_id: t.id, content: `add_notebook_entry 参数不符合要求：${parseResult.error.message}。` });
          hasError = true;
          continue;
        }
        const { year, month, day, hour, free_text } = parseResult.data;
        const scheduledTick = tickFromCalendar(year, month, day, hour, args.epoch);
        if (scheduledTick === null || scheduledTick <= args.tick) {
          messages.push({ role: "tool", tool_call_id: t.id, content: "日期无效或已过期，请重新设定。" });
          hasError = true;
          continue;
        }
        const timeLabel = `${year}年${month}月${day}日 ${String(hour).padStart(2, "0")}:00`;
        if (args.self.notebook.some((e) => e.scheduledTick === scheduledTick)) {
          messages.push({ role: "tool", tool_call_id: t.id, content: `${timeLabel} 已经有约了。` });
          hasError = true;
          continue;
        }
        const entry = {
          id: createEntryId(),
          scheduledTick,
          content: free_text,
          createdAt: args.tick,
        };
        args.self.notebook.push(entry);
        saveNotebookEntry(args.self.worldId, args.self.id, entry);
        messages.push({ role: "tool", tool_call_id: t.id, content: `已记录：${timeLabel} — ${free_text}` });
      } else if (name === UPDATE_LIKES_TOOL_NAME) {
        let parsedArgs: unknown;
        try { parsedArgs = JSON.parse(t.function.arguments); } catch (e) {
          messages.push({ role: "tool", tool_call_id: t.id, content: `update_likes JSON 解析失败。` });
          hasError = true;
          continue;
        }
        const parseResult = UpdateLikesSchema.safeParse(parsedArgs);
        if (!parseResult.success) {
          messages.push({ role: "tool", tool_call_id: t.id, content: `update_likes 参数不符合要求。` });
          hasError = true;
          continue;
        }
        if (parseResult.data.liked !== undefined) args.self.liked = parseResult.data.liked;
        if (parseResult.data.disliked !== undefined) args.self.disliked = parseResult.data.disliked;
        messages.push({ role: "tool", tool_call_id: t.id, content: "已更新喜好。" });
      } else if (name === UPDATE_GOALS_TOOL_NAME) {
        let parsedArgs: unknown;
        try { parsedArgs = JSON.parse(t.function.arguments); } catch (e) {
          messages.push({ role: "tool", tool_call_id: t.id, content: `update_goals JSON 解析失败。` });
          hasError = true;
          continue;
        }
        const parseResult = UpdateGoalsSchema.safeParse(parsedArgs);
        if (!parseResult.success) {
          messages.push({ role: "tool", tool_call_id: t.id, content: `update_goals 参数不符合要求。` });
          hasError = true;
          continue;
        }
        const SHORT_GOAL_INTERVAL = 120;
        const LONG_GOAL_INTERVAL = 840;
        let applied: string[] = [];
        if (parseResult.data.short_term_goal !== undefined) {
          const lastUpdate = args.self.shortTermGoal?.updatedAt ?? 0;
          if (args.tick - lastUpdate >= SHORT_GOAL_INTERVAL) {
            args.self.shortTermGoal = { goal: parseResult.data.short_term_goal, updatedAt: args.tick };
            applied.push("短期目标");
          }
        }
        if (parseResult.data.long_term_goal !== undefined) {
          const lastUpdate = args.self.longTermGoal?.updatedAt ?? 0;
          if (args.tick - lastUpdate >= LONG_GOAL_INTERVAL) {
            args.self.longTermGoal = { goal: parseResult.data.long_term_goal, updatedAt: args.tick };
            applied.push("长期目标");
          }
        }
        messages.push({ role: "tool", tool_call_id: t.id, content: applied.length > 0 ? `已更新：${applied.join("、")}。` : "目标更新间隔未到，暂未应用。" });
      } else if (name === THINK_TOOL_NAME) {
        let a: unknown;
        try { a = JSON.parse(t.function.arguments); } catch (e) {
          messages.push({ role: "tool", tool_call_id: t.id, content: `submit_think_turn JSON 解析失败。` });
          hasError = true;
          continue;
        }
        const result = ThinkTurnSchema.safeParse(a);
        if (!result.success) {
          messages.push({ role: "tool", tool_call_id: t.id, content: `submit_think_turn 参数不符合要求：${result.error.message}。` });
          hasError = true;
          continue;
        }
        messages.push({ role: "tool", tool_call_id: t.id, content: "思考已记录。" });
        turnResult = {
          kind: "turn",
          turn: { kind: "thought", text: result.data.text, reasoning: result.data.reasoning },
        };
      } else if (name === END_THINKING_TOOL_NAME) {
        let a: unknown;
        try { a = JSON.parse(t.function.arguments); } catch (e) {
          messages.push({ role: "tool", tool_call_id: t.id, content: `end_thinking JSON 解析失败。` });
          hasError = true;
          continue;
        }
        const result = EndThinkingSchema.safeParse(a);
        if (!result.success) {
          messages.push({ role: "tool", tool_call_id: t.id, content: `end_thinking 参数不符合要求：${result.error.message}。` });
          hasError = true;
          continue;
        }
        messages.push({ role: "tool", tool_call_id: t.id, content: "思考已结束。" });
        endResult = { kind: "end", summary: result.data.summary };
      } else {
        messages.push({ role: "tool", tool_call_id: t.id, content: `未知工具 "${name}"。` });
        hasError = true;
      }
    }

    // Determine outcome after processing all tool calls
    if (hasError) {
      if (round < MAX_TOOL_CALL_ROUNDS - 1) continue;
      return { kind: "end", summary: "思考轮次耗尽。", messages, transcriptLength: transcriptLengthAtStart } as ThinkEndResult;
    }

    if (turnResult) return { ...turnResult, messages, transcriptLength: transcriptLengthAtStart };
    if (endResult) return { ...endResult, messages, transcriptLength: transcriptLengthAtStart };

    // No terminal tool called — consume a round and retry or fall silent
    if (round < MAX_TOOL_CALL_ROUNDS - 1) {
      messages.push({
        role: "user",
        content: `请调用 ${THINK_TOOL_NAME} 提交思考内容，或调用 ${END_THINKING_TOOL_NAME} 结束思考。剩余轮数：${MAX_TOOL_CALL_ROUNDS - round - 1}。`,
      });
      continue;
    }
    return { kind: "end", summary: "思考轮次耗尽。", messages, transcriptLength: transcriptLengthAtStart } as ThinkEndResult;
  }

  return { kind: "end", summary: "思考轮次耗尽。", messages, transcriptLength: transcriptLengthAtStart } as ThinkEndResult;
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
        max_tokens: 2048,
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
 * 补救轮：speak 请求被拒/失败后直接 fallback 到 look_around，不再走 LLM 决策。
 */
export async function llmSalvageDecide(
  input: DecideInput & { rejectReason: string },
): Promise<Action> {
  salvageLog.warn("补救轮 fallback look_around", {
    角色: input.character.name,
    reject_reason: input.rejectReason,
  });

  return {
    type: "look_around",
    actorId: input.character.id,
    reasoning: `补救轮直接环顾四周：${input.rejectReason}`,
    selfImportance: 1,
  };
}

// ---------------------------------------------------------------------------
// Update likes / goals helpers (used in dialogue and think)
// ---------------------------------------------------------------------------

function buildUpdateLikesTool(): ChatCompletionTool {
  return { type: "function", function: { name: UPDATE_LIKES_TOOL_NAME, description: "更新你的喜好——喜欢或讨厌的人、事、物。", parameters: UpdateLikesToolSchema } };
}

function buildUpdateGoalsTool(): ChatCompletionTool {
  return { type: "function", function: { name: UPDATE_GOALS_TOOL_NAME, description: "更新你的短期或长期的人生目标。", parameters: UpdateGoalsToolSchema } };
}
