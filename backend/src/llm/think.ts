import type { Character, MapNode } from "../domain";
import { buildThinkSystemPrompt } from "./system-prompts";
import { buildReadTools, buildThinkWriteTools, ALL_READ_TOOLS,
  END_THINKING_TOOL, WRITE_MEMORY_TOOL, DELETE_MEMORY_TOOL } from "../domain/schemas";
import { runAgentLoop } from "./agent-loop";
import type { ToolHandlerContext } from "./tool-handlers";
import { hasApiKey } from "./client";
import { getEntryConfig } from "./providers";
import { SHORT_MEMORY_THINK_THRESHOLD } from "../domain/enums";

const THINK_TERMINAL_NAMES = [WRITE_MEMORY_TOOL, DELETE_MEMORY_TOOL, END_THINKING_TOOL];

export interface ThinkResult {
  kind: "completed" | "exhausted";
  summary: string;
  shortMemoryAfter: number;
  messages: Array<Record<string, unknown>>;
}

export async function runThinkAgent(args: {
  self: Character;
  nodes: MapNode[];
  allCharacters: Character[];
  tick: number;
  epoch: number;
  worldId: string;
  worldDescription?: string;
  language?: string;
  sharedMessages?: Array<Record<string, unknown>>;
}): Promise<ThinkResult> {
  if (!hasApiKey()) throw new Error("没有激活的 LLM provider");

  // Inject time reminder when continuing from a previous exhausted session
  let effectiveSharedMessages = args.sharedMessages as any[] | undefined;
  if (!effectiveSharedMessages && args.self.pendingThinkMessages) {
    const TICKS_PER_HOUR = 5;
    const MS_PER_TICK = (60 / TICKS_PER_HOUR) * 60 * 1000;
    const gameDate = new Date(args.epoch + args.tick * MS_PER_TICK);
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
    const reminderMsg = `[系统] 时间已推进到 ${timeStr}。继续你之前未完成的记忆整理。你必须最终调用 end_thinking 完成整理。`;
    effectiveSharedMessages = [
      ...args.self.pendingThinkMessages,
      { role: "user", content: reminderMsg },
    ];
  }
  // Clear pending immediately
  delete args.self.pendingThinkMessages;

  const systemPrompt = buildThinkSystemPrompt();
  const readTools = buildReadTools();
  const writeTools = buildThinkWriteTools();

  const ctx: ToolHandlerContext = {
    self: args.self,
    allCharacters: args.allCharacters,
    nodes: args.nodes,
    tick: args.tick,
    epoch: args.epoch,
    worldId: args.worldId,
    worldDescription: args.worldDescription,
  };

  const config = getEntryConfig("dialog_turn");
  const timeBudgetMs = config.timeBudgetMs;

  const result = await runAgentLoop({
    systemPrompt,
    readTools,
    writeTools,
    terminalToolNames: THINK_TERMINAL_NAMES,
    readToolNames: ALL_READ_TOOLS,
    llmEntryName: "dialog_turn",
    timeBudgetMs,
    sharedMessages: effectiveSharedMessages as any,
    toolHandlerContext: ctx,
  });

  if (result.kind !== "terminal") {
    // Exhausted — save messages for next tick continuation
    args.self.pendingThinkMessages = result.messages as any;
  }

  const summary = result.kind === "terminal" && result.terminalToolName === END_THINKING_TOOL
    ? (result.terminalArgs?.summary as string) ?? "思考完成"
    : "（思考超时）";

  return {
    kind: result.kind === "terminal" ? "completed" : "exhausted",
    summary,
    shortMemoryAfter: args.self.shortMemory.length,
    messages: result.messages as any,
  };
}

/** Check if character should be forced into Think mode */
export function shouldForceThink(character: Character): boolean {
  // Don't interrupt ongoing actions
  if (character.currentAction) return false;
  // Don't interrupt ongoing conversations
  if (character.activeConversationIds.length > 0) return false;
  return character.shortMemory.length >= SHORT_MEMORY_THINK_THRESHOLD;
}
