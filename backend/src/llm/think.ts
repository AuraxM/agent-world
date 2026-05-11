import type { Character, MapNode } from "../domain";
import { buildThinkSystemPrompt } from "./system-prompts";
import { buildReadTools, buildThinkWriteTools, ALL_READ_TOOLS,
  END_THINKING_TOOL, WRITE_MEMORY_TOOL, DELETE_MEMORY_TOOL } from "../domain/schemas";
import { runAgentLoop } from "./agent-loop";
import type { ToolHandlerContext } from "./tool-handlers";
import { hasApiKey } from "./client";
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

  const result = await runAgentLoop({
    systemPrompt,
    readTools,
    writeTools,
    terminalToolNames: THINK_TERMINAL_NAMES,
    readToolNames: ALL_READ_TOOLS,
    llmEntryName: "dialog_turn",
    maxRounds: 20,
    sharedMessages: args.sharedMessages as any,
    toolHandlerContext: ctx,
  });

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
