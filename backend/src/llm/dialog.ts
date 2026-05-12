/**
 * 对话协议模块。
 *
 * 职责：
 *   - 配对 chat 请求（mutual / pending / autoFail）
 *   - 接受/拒绝决策编排
 *   - 对话展开（5 来回 + 摘要）
 *   - 补救轮编排
 *
 * 无 IO 依赖：所有 LLM 调用通过注入的 decide 函数完成，测试时全部 mock。
 */
import { randomUUID } from "node:crypto";
import type {
  Action,
  Character,
  Conversation,
  DialogTurn,
  Language,
  MapNode,
  Memory,
  WorldEvent,
} from "../domain/index";
import { createLogger } from "../shared/index";
import { injectTimeMessage } from "./prompt";
import { db, schema } from "../db/index";
import { eq, and } from "drizzle-orm";
import { actionRegistry } from "../domain/index";
import { applyStateChange, findPath } from "../systems/index";
import { buildDialogSystemPrompt } from "./system-prompts";
import {
  buildReadTools,
  buildDialogWriteTools,
  ALL_READ_TOOLS,
  WRITE_DIALOG_TOOL,
  END_DIALOG_TOOL,
  WRITE_PROPOSE_ACTION_TOOL,
  WRITE_RESPOND_ACTION_TOOL,
} from "../domain/schemas";
import { runAgentLoop } from "./agent-loop";
import { getEntryConfig } from "./providers";
import type { AgentLoopResult } from "./agent-loop";
import type { ToolHandlerContext } from "./tool-handlers";
const log = createLogger("dialog");

// ---------------------------------------------------------------------------
// Types (exported for testing and tick.ts)
// ---------------------------------------------------------------------------

export interface ChatPairing {
  mutualPairs: Array<{ a: string; b: string; aFreeText: string; bFreeText: string }>;
  pendingAcceptances: Array<{ requester: string; target: string; freeText: string }>;
  autoFails: Array<{
    requester: string;
    target: string;
    reason: "target_left" | "cross_node" | "invalid_request";
  }>;
}

export interface DialogOutcome {
  participants: [string, string];
  transcript: DialogTurn[];
  summary: string;
  endedBy: "natural" | "end_tool" | "passive";
  endedByCharacterId?: string;
}

export interface MemoryWrite {
  characterId: string;
  memory: Memory;
}

export interface DialogPhaseResult {
  finalActions: Action[];
  dialogEvents: WorldEvent[];
  memoryWrites: MemoryWrite[];
  updatedConversations: Conversation[];
}

// ---------------------------------------------------------------------------
// Decide function signatures (injected by tick.ts)
// ---------------------------------------------------------------------------

export interface AcceptDecideResult {
  type: "accept_chat" | "reject_chat";
  targetId: string;
  reasoning: string;
  selfImportance: 1 | 2 | 3 | 4 | 5;
}

export type AcceptDecideFn = (input: {
  character: Character;
  requesterName: string;
  requesterId: string;
  freeText: string;
  here: MapNode;
  peer: Character;
  tick: number;
  epoch: number;
  language: Language;
}) => Promise<AcceptDecideResult>;

export interface DialogueActionProposal {
  actionType: string;
  targetId: string;
  params: import("../domain/action-system").ActionInput;
}

export interface DialogueActionResponse {
  accepted: boolean;
  reasoning: string;
}

export type SummaryDecideFn = (input: {
  openerName: string;
  openerId: string;
  responderName: string;
  responderId: string;
  transcript: DialogTurn[];
  language: Language;
}) => Promise<{ summary: string; memorize?: Array<{ target_id: string; impression: string }> }>;

export type SalvageDecideFn = (input: {
  character: Character;
  tick: number;
  rejectReason: string;
  language: Language;
}) => Promise<Action>;

// ---------------------------------------------------------------------------
// resolveRequestChains — chain-breaking before acceptDecide
// ---------------------------------------------------------------------------

interface ChainResult {
  valid: Array<{ requester: string; target: string; freeText: string }>;
  rejected: Array<{ requester: string; target: string; reason: string }>;
}

/**
 * 纯函数：在 acceptDecide 之前对单向 chat 请求做链式截断。
 *
 * 规则：构建请求链（A→B→C→D），从头节点（不被任何人 target 的 requester）
 * 开始遍历，每访问两个节点（形成一个 pair），截断下一跳的请求。
 *
 * A→B→C→D → valid: [A→B, C→D], rejected: [B→C]
 * A→B, B→C   → valid: [A→B],        rejected: [B→C]
 */
export function resolveRequestChains(
  pendingAcceptances: Array<{ requester: string; target: string; freeText: string }>,
  charById: Map<string, Character>,
): ChainResult {
  if (pendingAcceptances.length <= 1) {
    return { valid: [...pendingAcceptances], rejected: [] };
  }

  const valid: ChainResult["valid"] = [];
  const rejected: ChainResult["rejected"] = [];
  const consumed = new Set<string>();
  const processed = new Set<string>();

  // Build outgoing edges and target set
  const outgoing = new Map<string, typeof pendingAcceptances>();
  const isTarget = new Set<string>();
  for (const pa of pendingAcceptances) {
    if (!outgoing.has(pa.requester)) outgoing.set(pa.requester, []);
    outgoing.get(pa.requester)!.push(pa);
    isTarget.add(pa.target);
  }

  const allRequesters = [...new Set(pendingAcceptances.map((pa) => pa.requester))];
  const heads = allRequesters.filter((r) => !isTarget.has(r));

  function walk(nodeId: string, depth: number) {
    const reqs = outgoing.get(nodeId);
    if (!reqs || reqs.length === 0) return;

    for (const req of reqs) {
      const key = `${req.requester}->${req.target}`;
      if (processed.has(key)) continue;
      if (consumed.has(req.target)) continue;

      if (depth % 2 === 0) {
        if (consumed.has(req.requester)) continue;
        valid.push(req);
        processed.add(key);
        consumed.add(req.requester);
        consumed.add(req.target);
        walk(req.target, depth + 1);
      } else {
        rejected.push({
          requester: req.requester,
          target: req.target,
          reason: `${charById.get(req.target)!.name} 正在和别人聊天`,
        });
        processed.add(key);
      }
      break;
    }
  }

  for (const head of heads) {
    walk(head, 0);
  }

  // Handle remaining: cycles, detached nodes not reached from any head
  for (const pa of pendingAcceptances) {
    const key = `${pa.requester}->${pa.target}`;
    if (processed.has(key)) continue;

    if (consumed.has(pa.requester)) {
      processed.add(key);
      continue;
    }

    if (consumed.has(pa.target)) {
      rejected.push({
        requester: pa.requester,
        target: pa.target,
        reason: `${charById.get(pa.target)!.name} 正在和别人聊天`,
      });
      processed.add(key);
      consumed.add(pa.requester);
      continue;
    }

    // Both free
    valid.push(pa);
    processed.add(key);
    consumed.add(pa.requester);
    consumed.add(pa.target);
    walk(pa.target, 1);
  }

  return { valid, rejected };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMemory(characterId: string, tick: number, importance: number, content: string): MemoryWrite {
  return {
    characterId,
    memory: {
      id: `mem-${randomUUID().slice(0, 8)}`,
      tick,
      importance: importance as Memory["importance"],
      content,
      layer: "short",
    },
  };
}

// ---------------------------------------------------------------------------
// Conversation persistence helpers
// ---------------------------------------------------------------------------

export function loadConversations(worldId: string): Conversation[] {
  const rows = db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.worldId, worldId))
    .all();
  return rows.map((r) => JSON.parse(r.payloadJson) as Conversation);
}

export function saveConversation(conv: Conversation): void {
  const now = new Date();
  db
    .insert(schema.conversations)
    .values({
      id: conv.id,
      worldId: conv.worldId,
      payloadJson: JSON.stringify(conv),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.conversations.worldId, schema.conversations.id],
      set: {
        payloadJson: JSON.stringify(conv),
        updatedAt: now,
      },
    })
    .run();
}

export function deleteConversation(worldId: string, id: string): void {
  db
    .delete(schema.conversations)
    .where(
      and(
        eq(schema.conversations.worldId, worldId),
        eq(schema.conversations.id, id),
      ),
    )
    .run();
}

// ---------------------------------------------------------------------------
// pairChatRequests
// ---------------------------------------------------------------------------

/**
 * 纯函数：从 rawActions 中提取 chat 请求，分类为 mutual / pending / autoFail。
 * 使用 tick.ts 阶段 4 收尾时的位置快照判断同节点。
 */
export function pairChatRequests(
  rawActions: Action[],
  characters: Character[],
): ChatPairing {
  const chatActions = rawActions.filter((a) => a.type === "chat");
  const charById = new Map(characters.map((c) => [c.id, c]));

  const mutualPairs: ChatPairing["mutualPairs"] = [];
  const pendingAcceptances: ChatPairing["pendingAcceptances"] = [];
  const autoFails: ChatPairing["autoFails"] = [];
  const consumed = new Set<string>();

  // 1. Identify mutual pairs (A↔B, same node)
  for (const a of chatActions) {
    if (consumed.has(a.actorId)) continue;
    if (!a.targetId) continue;
    const peer = chatActions.find(
      (b) =>
        b.actorId === a.targetId &&
        b.targetId === a.actorId &&
        a.actorId !== b.actorId &&
        !consumed.has(b.actorId),
    );
    if (peer) {
      const aChar = charById.get(a.actorId)!;
      const bChar = charById.get(peer.actorId)!;
      if (aChar.locationId === bChar.locationId) {
        // Treat empty freeText as autoFail — same as pendingAcceptances
        const aText = (a.freeText ?? "").trim();
        const bText = (peer.freeText ?? "").trim();
        if (!aText && !bText) {
          // Both empty — fall through to autoFails
        } else {
          mutualPairs.push({
            a: a.actorId,
            b: peer.actorId,
            aFreeText: aText,
            bFreeText: bText,
          });
          consumed.add(a.actorId);
          consumed.add(peer.actorId);
        }
      }
      // cross-node mutual: fall through to autoFails individually
    }
  }

  // 2. Non-mutual chat → validate and classify
  for (const a of chatActions) {
    if (consumed.has(a.actorId)) continue;
    const target = a.targetId ? charById.get(a.targetId) : null;
    const actor = charById.get(a.actorId)!;

    if (!target || target.id === actor.id) {
      autoFails.push({
        requester: a.actorId,
        target: a.targetId ?? "",
        reason: "invalid_request",
      });
      continue;
    }
    if (!a.freeText || a.freeText.trim() === "") {
      autoFails.push({
        requester: a.actorId,
        target: target.id,
        reason: "invalid_request",
      });
      continue;
    }
    if (target.locationId !== actor.locationId) {
      autoFails.push({
        requester: a.actorId,
        target: target.id,
        reason: "cross_node",
      });
      continue;
    }
    pendingAcceptances.push({
      requester: a.actorId,
      target: target.id,
      freeText: a.freeText,
    });
  }

  return { mutualPairs, pendingAcceptances, autoFails };
}

// ---------------------------------------------------------------------------
// Tick-based dialog expansion
// ---------------------------------------------------------------------------

async function retryOnce<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === 0) continue;
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// newDialogTurn — agentic dialog turn using the shared ReAct agent loop
// ---------------------------------------------------------------------------

const DIALOG_TERMINAL_NAMES = [WRITE_DIALOG_TOOL, END_DIALOG_TOOL];

async function newDialogTurn(args: {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  sharedMessages?: any[];
  pendingAction?: any;
  nodes: MapNode[];
  allCharacters: Character[];
  tick: number;
  epoch: number;
  worldId: string;
  worldDescription?: string;
  language?: string;
  shops?: any[];
}): Promise<
  | {
      kind: "turn";
      turn: DialogTurn;
      proposeAction?: { actionType: string; params: any };
      respondToAction?: { accept: boolean; reason?: string };
      messages?: any[];
    }
  | { kind: "end"; payload: { summary: string }; respondToAction?: { accept: boolean; reason?: string }; messages?: any[] }
> {
  let sharedMessages = (args.sharedMessages ?? []) as any[];

  // Inject turn-boundary marker to prevent identity confusion across speakers.
  // Without this, the LLM sees a continuous stream of assistant/tool messages from
  // both characters and can lose track of which character it is currently playing.
  sharedMessages = [
    ...sharedMessages,
    {
      role: "user",
      content: `[系统] 你是 ${args.self.name}，现在轮到你说话了。你在与 ${args.peer.name} 对话。`,
    },
  ];

  // If there's a pending action proposal targeting this speaker, inject a reminder
  // so the LLM knows it must respond (accept or reject) via action_response in write_dialog.
  if (args.pendingAction) {
    const requesterName =
      args.allCharacters.find((c) => c.id === args.pendingAction.requesterId)?.name ?? "对方";
    const displayName = actionRegistry.getDisplayName(args.pendingAction.actionType);
    sharedMessages = [
      ...sharedMessages,
      {
        role: "user",
        content: `[系统] ${requesterName} 向你提议了「${displayName}」。你必须对此做出回应。在 write_dialog 中通过 action_response 参数表达你的决定：accept: true 表示接受，accept: false 表示拒绝，并附带 reason 说明理由。`,
      },
    ];
  }

  let pendingProposeAction: { actionType: string; params: any } | undefined;
  let pendingRespondAction: { accept: boolean; reason?: string } | undefined;

  const config = getEntryConfig("dialog_turn");
  const innerBudgetMs = Math.max(1000, Math.floor(config.timeBudgetMs / 3));
  const innerT0 = Date.now();

  while (true) {
    if (Date.now() - innerT0 >= innerBudgetMs) break;
    const systemPrompt = buildDialogSystemPrompt(args.self.name, args.peer.name, args.peer.id);
    const readTools = buildReadTools();
    const dialogueActions = actionRegistry.getDialogueActions();
    const writeTools = buildDialogWriteTools(dialogueActions);

    const ctx: ToolHandlerContext = {
      self: args.self,
      allCharacters: args.allCharacters,
      nodes: args.nodes,
      shops: args.shops,
      tick: args.tick,
      epoch: args.epoch,
      worldId: args.worldId,
      worldDescription: args.worldDescription,
    };

    // Capture state from non-terminal propose/respond tools within the agent-loop
    const capturedState: {
      proposeAction?: { actionType: string; params: any };
      respondAction?: { accept: boolean; reason?: string };
    } = {};

    const customWriteHandlers: Record<string, (a: any, c: ToolHandlerContext) => Record<string, unknown>> = {
      write_propose_action: (a: any, _c: ToolHandlerContext) => {
        capturedState.proposeAction = { actionType: a.action_type, params: a.params ?? {} };
        const displayName = actionRegistry.getDisplayName(a.action_type);
        return { proposed: displayName, note: "提议已记录。请继续用 write_dialog 说出你的邀请或提议。" };
      },
      write_respond_action: (a: any, _c: ToolHandlerContext) => {
        capturedState.respondAction = { accept: a.accept, reason: a.reason };
        const verb = a.accept ? "接受了" : "拒绝了";
        return { responded: verb, note: `回应已记录。请继续用 write_dialog 说出你的回复。` };
      },
    };

    const result: AgentLoopResult = await runAgentLoop({
      systemPrompt,
      readTools,
      writeTools,
      terminalToolNames: DIALOG_TERMINAL_NAMES,
      readToolNames: ALL_READ_TOOLS,
      llmEntryName: "dialog_turn",
      timeBudgetMs: Math.max(500, innerBudgetMs - (Date.now() - innerT0)),
      sharedMessages: sharedMessages as any,
      toolHandlerContext: ctx,
      customWriteHandlers,
    });

    // Merge captured state from non-terminal handlers
    if (capturedState.proposeAction) pendingProposeAction = capturedState.proposeAction;
    if (capturedState.respondAction) pendingRespondAction = capturedState.respondAction;

    if (result.kind !== "terminal") {
      return { kind: "end", payload: { summary: "（对话超时）" } };
    }

    const { terminalToolName, terminalArgs } = result;

    if (terminalToolName === END_DIALOG_TOOL) {
      return {
        kind: "end",
        payload: { summary: (terminalArgs?.summary as string) ?? "对话结束" },
        respondToAction: pendingRespondAction,
        messages: result.messages as any,
      };
    }

    if (terminalToolName === WRITE_DIALOG_TOOL) {
      const turn: DialogTurn = {
        speakerId: args.self.id,
        kind: "say",
        line: (terminalArgs?.content as string) ?? "",
      };
      const proposeAction = terminalArgs?.action_proposal
        ? {
            actionType: (terminalArgs.action_proposal as any).action_type,
            params: (terminalArgs.action_proposal as any).params,
          }
        : pendingProposeAction;
      const respondToAction = terminalArgs?.action_response
        ? {
            accept: (terminalArgs.action_response as any).accept as boolean,
            reason: (terminalArgs.action_response as any).reason as string | undefined,
          }
        : pendingRespondAction;
      return { kind: "turn", turn, proposeAction, respondToAction, messages: result.messages as any };
    }

    // Other write tool (write_memory, etc.) — loop back, same speaker
    sharedMessages = (result.messages ?? []) as any[];
  }

  return { kind: "end", payload: { summary: "（对话超时）" } };
}

interface TickDialogResult {
  transcript: DialogTurn[];
  ended: boolean;
  endedBy?: "initiator" | "acceptor";
}

/** Execute a dialogue action that was accepted. Returns the dialogRecord string if any. */
function executeDialogueAction(
  actionType: string,
  actor: Character,
  target: Character,
  params: import("../domain/action-system").ActionInput,
  chars: Map<string, Character>,
  nodeById: Map<string, MapNode>,
  worldId: string,
  tick: number,
  epoch: number,
): string | undefined {
  const def = actionRegistry.get(actionType);
  if (!def) return undefined;

  const here = nodeById.get(actor.locationId)!;
  const ctx = {
    worldId, tick, epoch, self: actor, here,
    companions: [target],
    reachable: [] as MapNode[],
    isSleepHour: false,
    facts: {
      activityNodeId: null,
      activityNodeName: null,
      restNodeId: null,
      restNodeName: null,
      hoursAtCurrentLocation: 0,
      todayActionCounts: {},
      todayChatTargets: {},
    },
    shops: [],
    itemDefs: new Map(),
  };

  try {
    // travel_together: special handling — set ongoing action on both characters
    if (actionType === "travel_together") {
      let targetNodeId = params.target_node_id as string | undefined;
      const targetNodeName = params.target_node_name as string | undefined;
      // Resolve name to node ID if needed
      if (!targetNodeId && targetNodeName) {
        for (const n of nodeById.values()) {
          if (n.name === targetNodeName || n.name.includes(targetNodeName)) {
            targetNodeId = n.id;
            break;
          }
        }
      }
      if (!targetNodeId) return undefined;
      if (targetNodeId === actor.locationId) return `${actor.name} 已经在目的地了。`;

      const nodesArray = Array.from(nodeById.values());
      const path = findPath(actor.locationId, targetNodeId, nodesArray);
      if (!path) return undefined;

      const destNode = nodeById.get(targetNodeId);
      const destName = targetNodeName || destNode?.name || targetNodeId;
      const reason = (params.reason as string) || "结伴同行";
      const endsAt = tick + path.length - 1;

      // Set ongoing action on BOTH characters
      const ongoingAction = {
        type: "travel_together" as const,
        startedAt: tick,
        endsAt,
        description: `和 ${target.name} 结伴前往 ${destName}`,
        interruptThreshold: 5 as const,
        path,
        stepIndex: 1,
        partnerId: target.id,
        reason,
      };
      const partnerAction = {
        type: "travel_together" as const,
        startedAt: tick,
        endsAt,
        description: `和 ${actor.name} 结伴前往 ${destName}`,
        interruptThreshold: 5 as const,
        path,
        stepIndex: 1,
        partnerId: actor.id,
        reason,
      };

      // First step
      actor.locationId = path[1];
      target.locationId = path[1];

      if (path.length <= 2) {
        // Single step — arrived immediately
        actor.currentAction = undefined;
        target.currentAction = undefined;
        pushMemo(actor, {
          id: `mem-${randomUUID().slice(0, 8)}`, tick, importance: 3,
          content: `我和 ${target.name} 一起到达了 ${destName}。`,
          layer: "short",
        });
        pushMemo(target, {
          id: `mem-${randomUUID().slice(0, 8)}`, tick, importance: 3,
          content: `我和 ${actor.name} 一起到达了 ${destName}。`,
          layer: "short",
        });
        return `${actor.name} 和 ${target.name} 结伴到达了 ${destName}。`;
      }

      actor.currentAction = ongoingAction;
      target.currentAction = partnerAction;

      pushMemo(actor, {
        id: `mem-${randomUUID().slice(0, 8)}`, tick, importance: 3,
        content: `我和 ${target.name} 开始结伴前往 ${destName}。${reason}`,
        layer: "short",
      });
      pushMemo(target, {
        id: `mem-${randomUUID().slice(0, 8)}`, tick, importance: 3,
        content: `我和 ${actor.name} 开始结伴前往 ${destName}。${reason}`,
        layer: "short",
      });

      return `${actor.name} 和 ${target.name} 开始结伴前往 ${destName}。`;
    }

    // Normal action execution
    const outcome = def.execute(ctx, params);
    if (outcome.stateChanges) {
      for (const sc of outcome.stateChanges) {
        // Direct money adjustments (skip applyStateChange to avoid DB dependency in dialog context)
        if (sc.kind === "adjustMoney") {
          actor.money += sc.amount;
          // Cross-character adjustMoney: credit the target
          if (sc.targetCharacterId) {
            const tgtChar = chars.get(sc.targetCharacterId);
            if (tgtChar) {
              const received = -sc.amount;
              if (received > 0) {
                tgtChar.money += received;
              }
            }
          }
        } else {
          // Non-money state changes go through applyStateChange as normal
          applyStateChange(actor, sc, worldId, tick);
        }
      }
    }
    pushMemo(actor, {
      id: `mem-${randomUUID().slice(0, 8)}`,
      tick,
      importance: 3,
      content: outcome.memory,
      layer: "short",
    });
    if (outcome.targetMemory) {
      pushMemo(target, {
        id: `mem-${randomUUID().slice(0, 8)}`,
        tick,
        importance: 3,
        content: outcome.targetMemory,
        layer: "short",
      });
    }
    return outcome.dialogRecord;
  } catch {
    return undefined;
  }
}

function pushMemo(c: Character, mem: Memory): void {
  c.shortMemory.push(mem);
  if (c.shortMemory.length > 120) {
    c.shortMemory.splice(0, c.shortMemory.length - 120);
  }
}

async function runOneTickDialog(
  conv: Conversation,
  chars: Map<string, Character>,
  nodeById: Map<string, MapNode>,
  language: Language,
  currentTick: number,
  epoch: number,
  worldDescription?: string,
  nodes?: MapNode[],
  shops?: any[],
): Promise<TickDialogResult> {
  const initiator = chars.get(conv.initiatorId)!;
  const acceptor = chars.get(conv.acceptorId)!;
  const transcript: DialogTurn[] = [...conv.transcript];

  // Initialize shared LLM context if not present
  if (!conv.sharedMessages) conv.sharedMessages = [];
  if (conv.sharedMessagesTranscriptLength === undefined) conv.sharedMessagesTranscriptLength = 0;

  // Find the last real speaker (skip __system__ time messages)
  let lastRealSpeakerId = conv.initiatorId;
  for (let i = transcript.length - 1; i >= 0; i--) {
    if (transcript[i].speakerId !== "__system__") {
      lastRealSpeakerId = transcript[i].speakerId;
      break;
    }
  }

  // Who speaks first this tick (alternate from last real speaker)
  const firstSpeakerId =
    lastRealSpeakerId === conv.initiatorId ? conv.acceptorId : conv.initiatorId;

  const config = getEntryConfig("dialog_turn");
  const tickBudgetMs = config.timeBudgetMs;
  const tickStart = Date.now();

  // Inject time reminder before this tick's dialogue rounds.
  // On the very first tick, insert it before the opening line so the LLM
  // sees the time context first.
  const timeTurn: DialogTurn = {
    speakerId: "__system__",
    kind: "say",
    line: injectTimeMessage({ tick: currentTick, epoch, tickStarted: conv.tickStarted, language }),
  };
  if (conv.currentTickRounds === 0) {
    transcript.unshift(timeTurn);
  } else {
    transcript.push(timeTurn);
  }

  let round = 0;
  while (true) {
    if (Date.now() - tickStart >= tickBudgetMs) break;
    const speakerId =
      round % 2 === 0
        ? firstSpeakerId
        : firstSpeakerId === conv.initiatorId
          ? conv.acceptorId
          : conv.initiatorId;
    const speaker = chars.get(speakerId)!;
    const peer = speakerId === conv.initiatorId ? acceptor : initiator;

    // Determine pendingAction for this speaker: only if it targets them
    const pendingAction = conv.pendingAction && conv.pendingAction.targetId === speakerId
      ? conv.pendingAction
      : undefined;

    let result;
    try {
      result = await retryOnce(() => newDialogTurn({
        self: speaker,
        peer,
        transcript,
        sharedMessages: conv.sharedMessages,
        pendingAction: pendingAction ? {
          requesterId: conv.pendingAction?.requesterId,
          targetId: conv.pendingAction?.targetId,
          actionType: conv.pendingAction?.actionType,
          params: conv.pendingAction?.params,
        } : undefined,
        nodes: nodes ?? Array.from(nodeById.values()),
        allCharacters: Array.from(chars.values()),
        tick: currentTick,
        epoch,
        worldId: conv.worldId,
        worldDescription,
        shops,
      }));
    } catch (err) {
      log.error("newDialogTurn 异常，对话被迫终止", {
        speaker: speaker.name,
        peer: peer.name,
        transcriptLen: transcript.length,
        convId: conv.id,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
        ...(err && typeof err === "object" && "status" in err
          ? {
              apiStatus: (err as { status?: unknown }).status,
              apiErrorBody: JSON.stringify((err as { error?: unknown }).error).slice(0, 2000),
            }
          : {}),
      });
      return { transcript, ended: true };
    }

    // ── Process respondToAction FIRST (clear existing pending before setting new) ──
    if (result.respondToAction) {
      const pa = conv.pendingAction;
      if (pa) {
        if (result.respondToAction.accept) {
          const requester = chars.get(pa.requesterId);
          const tgt = chars.get(pa.targetId);
          if (requester && tgt) {
            // Build the full action params for execution
            const execParams = { ...pa.params };
            const dialogRecord = executeDialogueAction(
              pa.actionType, requester, tgt, execParams,
              chars, nodeById, conv.worldId, currentTick, epoch,
            );
            if (dialogRecord) {
              transcript.push({
                speakerId: "__system__",
                kind: "action_result",
                line: dialogRecord,
              });
            }
          }
        } else {
          // Rejected — push system message
          const displayName = actionRegistry.getDisplayName(pa.actionType);
          const tgt = chars.get(pa.targetId);
          const rejecterName = tgt?.name ?? "???";
          let rejectMsg: string;
          if (language === "zh") rejectMsg = `${rejecterName} 拒绝了 ${displayName}。`;
          else if (language === "en") rejectMsg = `${rejecterName} rejected ${displayName}.`;
          else rejectMsg = `${rejecterName} が ${displayName} を拒否しました。`;
          transcript.push({
            speakerId: "__system__",
            kind: "action_result",
            line: rejectMsg,
          });
        }
        // Clear pending regardless
        conv.pendingAction = undefined;
      }
    }

    // ── Process proposeAction (after respondToAction, so it won't overwrite existing pending) ──
    if (result.kind === "turn" && result.proposeAction) {
      conv.pendingAction = {
        requesterId: speakerId,
        targetId: peer.id,
        actionType: result.proposeAction.actionType,
        params: result.proposeAction.params,
      };
    }

    // ── Save shared LLM context ──
    if (result.messages) {
      conv.sharedMessages = result.messages;
    }

    if (result.kind === "end") {
      // Give the other party a farewell turn so they can say goodbye.
      // The conversation ends after this exchange — no unilateral cut-off.
      const farewellId =
        speakerId === conv.initiatorId ? conv.acceptorId : conv.initiatorId;
      const farewellChar = chars.get(farewellId)!;
      const farewellPeer = farewellId === conv.initiatorId ? acceptor : initiator;
      try {
        const farewellPendingAction = conv.pendingAction && conv.pendingAction.targetId === farewellId
          ? conv.pendingAction : undefined;
        const farewellResult = await newDialogTurn({
          self: farewellChar,
          peer: farewellPeer,
          transcript,
          sharedMessages: conv.sharedMessages,
          pendingAction: farewellPendingAction ? {
            requesterId: conv.pendingAction?.requesterId,
            targetId: conv.pendingAction?.targetId,
            actionType: conv.pendingAction?.actionType,
            params: conv.pendingAction?.params,
          } : undefined,
          nodes: nodes ?? Array.from(nodeById.values()),
          allCharacters: Array.from(chars.values()),
          tick: currentTick,
          epoch,
          worldId: conv.worldId,
          worldDescription,
          shops,
        });
        // Save farewell context
        if (farewellResult.messages) {
          conv.sharedMessages = farewellResult.messages;
        }
        if (farewellResult.kind === "turn") {
          transcript.push(farewellResult.turn);
        }
        // Process respondToAction in farewell turn
        if (farewellResult.respondToAction) {
          const pa = conv.pendingAction;
          if (pa) {
            if (farewellResult.respondToAction.accept) {
              const requester = chars.get(pa.requesterId);
              const tgt = chars.get(pa.targetId);
              if (requester && tgt) {
                const dialogRecord = executeDialogueAction(
                  pa.actionType, requester, tgt, pa.params,
                  chars, nodeById, conv.worldId, currentTick, epoch,
                );
                if (dialogRecord) {
                  transcript.push({
                    speakerId: "__system__",
                    kind: "action_result",
                    line: dialogRecord,
                  });
                }
              }
            } else {
              // Rejected — push system message
              const displayName = actionRegistry.getDisplayName(pa.actionType);
              const tgt = chars.get(pa.targetId);
              const rejecterName = tgt?.name ?? "???";
              let rejectMsg: string;
              if (language === "zh") rejectMsg = `${rejecterName} 拒绝了 ${displayName}。`;
              else if (language === "en") rejectMsg = `${rejecterName} rejected ${displayName}.`;
              else rejectMsg = `${rejecterName} が ${displayName} を拒否しました。`;
              transcript.push({
                speakerId: "__system__",
                kind: "action_result",
                line: rejectMsg,
              });
            }
          }
          conv.pendingAction = undefined;
        }
      } catch {
        // ignore farewell turn failure — still end the conversation
      }
      return {
        transcript,
        ended: true,
        endedBy: speakerId === conv.initiatorId ? "initiator" : "acceptor",
      };
    }

    transcript.push(result.turn);
    round++;
  }

  return { transcript, ended: false };
}

// ---------------------------------------------------------------------------
// runDialogPhase — main entry point
// ---------------------------------------------------------------------------

export interface RunDialogPhaseInput {
  rawActions: Action[];
  characters: Character[];
  nodes: MapNode[];
  perceptions: Map<string, WorldEvent[]>;
  tick: number;
  epoch: number;
  worldName: string;
  worldDescription?: string;
  language: Language;
  acceptDecide: AcceptDecideFn;
  summaryDecide: SummaryDecideFn;
  salvageDecide: SalvageDecideFn;
  ongoingConversations: Conversation[];
}

// After a conversation ends, generate personal memory by asking the LLM
async function generatePersonalMemory(
  self: Character,
  peer: Character,
  ctx: ToolHandlerContext,
): Promise<string> {
  const prompt = `对话结束了。请回顾你与 ${peer.name} 的这段对话，从以下三个角度用自然语言反思，然后调用 write_memory 写入 short memory：

1. **心情**：对话结束后你的心情如何
2. **印象**：你对 ${peer.name} 的印象有什么变化
3. **主题**：你们都聊了哪些主题

调用 write_memory(layer="short", importance=3, content="你将心情、印象、主题整合成的一段自然语言记录") 来记录。`;

  // Only expose write_memory and read tools for this
  const writeTools = [
    {
      type: "function" as const,
      function: {
        name: "write_memory",
        description: "写入一条记忆到短期记忆",
        parameters: {
          type: "object",
          properties: {
            layer: { type: "string", enum: ["short", "daily", "weekly"] },
            content: { type: "string" },
            importance: { type: "integer", minimum: 1, maximum: 5 },
          },
          required: ["layer", "content", "importance"],
        },
      },
    },
  ];

  const config = getEntryConfig("dialog_turn");
  const result = await runAgentLoop({
    systemPrompt: prompt,
    readTools: buildReadTools(),
    writeTools: writeTools as any,
    terminalToolNames: ["write_memory"],
    readToolNames: ALL_READ_TOOLS,
    llmEntryName: "dialog_turn",
    timeBudgetMs: Math.floor(config.timeBudgetMs / 2),
    toolHandlerContext: ctx,
  });

  return (result.terminalArgs?.content as string) ?? "";
}

export async function runDialogPhase(
  input: RunDialogPhaseInput,
): Promise<DialogPhaseResult> {
  const { rawActions, characters, nodes, tick, epoch, ongoingConversations } = input;
  const charById = new Map(characters.map((c) => [c.id, c]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const memoryWrites: MemoryWrite[] = [];
  const dialogEvents: WorldEvent[] = [];
  const finalActionsMap = new Map<string, Action>();
  const consumedActorIds = new Set<string>();
  const updatedConversations: Conversation[] = [];

  // ── Part 1: Resume ongoing conversations (concurrent) ──
  await Promise.all(
    ongoingConversations.map(async (conv) => {
      if (conv.status === "ended") return;

      const initiator = charById.get(conv.initiatorId);
      const acceptor = charById.get(conv.acceptorId);

      if (!initiator || !acceptor) {
        conv.status = "ended";
        conv.endedBy = "passive";
        updatedConversations.push(conv);
        return;
      }
      if (initiator.locationId !== acceptor.locationId) {
        conv.status = "ended";
        conv.endedBy = "passive";
        conv.transcript.push({
          speakerId: "__system__",
          kind: "say",
          line: `${acceptor.name} 离开了当前场景，对话终止。`,
        });
        updatedConversations.push(conv);
        return;
      }

      const tickResult = await runOneTickDialog(conv, charById, nodeById, input.language, tick, epoch, input.worldDescription, nodes);
      conv.transcript = tickResult.transcript;
      conv.currentTickRounds = tickResult.transcript.filter(t => t.speakerId !== "__system__").length;

      if (tickResult.ended) {
        conv.status = "ended";
        conv.endedBy = tickResult.endedBy;
      } else if (conv.status === "active") {
        conv.status = "ending";
      }

      consumedActorIds.add(conv.initiatorId);
      consumedActorIds.add(conv.acceptorId);
      updatedConversations.push(conv);
    }),
  );

  // ── Part 2: Process new chat actions ──
  const rawPairing = pairChatRequests(rawActions, characters);

  // Skip pairs where either party is already in an ongoing conversation
  const pairing: ChatPairing = {
    mutualPairs: rawPairing.mutualPairs.filter(
      (mp) => !consumedActorIds.has(mp.a) && !consumedActorIds.has(mp.b),
    ),
    pendingAcceptances: rawPairing.pendingAcceptances.filter(
      (pa) => !consumedActorIds.has(pa.requester) && !consumedActorIds.has(pa.target),
    ),
    autoFails: rawPairing.autoFails,
  };
  const salvageTasks: Array<() => Promise<{ actorId: string; action: Action }>> = [];

  // ── Chain resolution: break request chains before acceptDecide ──
  const chainResult = resolveRequestChains(pairing.pendingAcceptances, charById);
  pairing.pendingAcceptances = chainResult.valid;
  for (const cr of chainResult.rejected) {
    // Only salvage if requester is not already in a conversation
    if (!consumedActorIds.has(cr.requester)) {
      consumedActorIds.add(cr.requester);
      memoryWrites.push(makeMemory(cr.requester, tick, 1, `想找 ${charById.get(cr.target)!.name} 说话但她在和别人聊天`));
      salvageTasks.push(() =>
        input.salvageDecide({ character: charById.get(cr.requester)!, tick, rejectReason: cr.reason, language: input.language })
          .then((action) => ({ actorId: cr.requester, action })),
      );
    }
  }

  // Salvage speakers whose target is already in an ongoing conversation
  for (const mp of rawPairing.mutualPairs) {
    if (consumedActorIds.has(mp.a) && !consumedActorIds.has(mp.b)) {
      consumedActorIds.add(mp.b);
      const targetName = charById.get(mp.a)!.name;
      const reason = `${targetName} 正在和别人聊天`;
      memoryWrites.push(makeMemory(mp.b, tick, 1, `想找 ${targetName} 说话但她在和别人聊天`));
      salvageTasks.push(() =>
        input.salvageDecide({ character: charById.get(mp.b)!, tick, rejectReason: reason, language: input.language })
          .then((action) => ({ actorId: mp.b, action })),
      );
    }
    if (!consumedActorIds.has(mp.a) && consumedActorIds.has(mp.b)) {
      consumedActorIds.add(mp.a);
      const targetName = charById.get(mp.b)!.name;
      const reason = `${targetName} 正在和别人聊天`;
      memoryWrites.push(makeMemory(mp.a, tick, 1, `想找 ${targetName} 说话但她在和别人聊天`));
      salvageTasks.push(() =>
        input.salvageDecide({ character: charById.get(mp.a)!, tick, rejectReason: reason, language: input.language })
          .then((action) => ({ actorId: mp.a, action })),
      );
    }
  }
  for (const pa of rawPairing.pendingAcceptances) {
    if (!consumedActorIds.has(pa.requester) && consumedActorIds.has(pa.target)) {
      consumedActorIds.add(pa.requester);
      const targetName = charById.get(pa.target)!.name;
      const reason = `${targetName} 正在和别人聊天`;
      memoryWrites.push(makeMemory(pa.requester, tick, 1, `想找 ${targetName} 说话但她在和别人聊天`));
      salvageTasks.push(() =>
        input.salvageDecide({ character: charById.get(pa.requester)!, tick, rejectReason: reason, language: input.language })
          .then((action) => ({ actorId: pa.requester, action })),
      );
    }
  }

  for (const af of pairing.autoFails) {
    consumedActorIds.add(af.requester);
    const char = charById.get(af.requester)!;
    let reason: string;
    if (af.reason === "cross_node") reason = `想找对方说话但她不在这里`;
    else if (af.reason === "target_left") reason = `想找对方说话但她已经走了`;
    else reason = `没有和别人搭上话`;
    memoryWrites.push(makeMemory(af.requester, tick, 1, reason));
    salvageTasks.push(() =>
      input.salvageDecide({ character: char, tick, rejectReason: reason, language: input.language })
        .then((action) => ({ actorId: af.requester, action })),
    );
  }

  const acceptResults = await Promise.all(
    pairing.pendingAcceptances.map(async (pa) => {
      const target = charById.get(pa.target)!;
      const requester = charById.get(pa.requester)!;

      // Cooldown: character who just ended a conversation cannot accept a new one
      if (target.lastConversationEndTick > 0 && tick - target.lastConversationEndTick <= 1) {
        return { pa, result: { type: "reject_chat" as const, targetId: pa.requester, reasoning: "刚结束对话，需要缓一缓。" } };
      }
      if (requester.lastConversationEndTick > 0 && tick - requester.lastConversationEndTick <= 1) {
        return { pa, result: { type: "reject_chat" as const, targetId: pa.requester, reasoning: "对方刚结束对话，暂时不想聊。" } };
      }

      const here = nodeById.get(target.locationId)!;
      let result: AcceptDecideResult;
      try {
        result = await input.acceptDecide({
          character: target, requesterName: requester.name, requesterId: pa.requester,
          freeText: pa.freeText, here, peer: requester, tick, epoch, language: input.language,
        });
      } catch {
        result = { type: "reject_chat", targetId: pa.requester, reasoning: "决策失败默认拒绝", selfImportance: 1 };
      }
      if (result.type !== "accept_chat" && result.type !== "reject_chat") {
        result = { type: "reject_chat", targetId: pa.requester, reasoning: "决策输出非法 type", selfImportance: 1 };
      }
      return { pa, result };
    }),
  );

  const newDialogGroups: Array<{ requesterId: string; responderId: string; openingLine: string }> = [];
  for (const { pa, result } of acceptResults) {
    consumedActorIds.add(pa.requester);
    if (result.type === "accept_chat") {
      newDialogGroups.push({ requesterId: pa.requester, responderId: pa.target, openingLine: pa.freeText });
    } else {
      const requester = charById.get(pa.requester)!;
      const targetName = charById.get(pa.target)!.name;
      memoryWrites.push(makeMemory(pa.requester, tick, 2, `我邀请 ${targetName} 说话被拒了`));
      memoryWrites.push(makeMemory(pa.target, tick, 1, `我拒绝了 ${requester.name} 的搭话邀请`));
      salvageTasks.push(() =>
        input.salvageDecide({ character: requester, tick, rejectReason: `${targetName} 拒绝了你的对话请求。`, language: input.language })
          .then((action) => ({ actorId: pa.requester, action })),
      );
    }
  }

  for (const mp of pairing.mutualPairs) {
    consumedActorIds.add(mp.a);
    consumedActorIds.add(mp.b);
    // Prefer the non-empty freeText as opening line; if both present, pick speaker randomly
    const aHasText = mp.aFreeText.length > 0;
    const bHasText = mp.bFreeText.length > 0;
    let requesterId: string;
    let responderId: string;
    let openingLine: string;
    if (aHasText && !bHasText) {
      requesterId = mp.a; responderId = mp.b; openingLine = mp.aFreeText;
    } else if (bHasText && !aHasText) {
      requesterId = mp.b; responderId = mp.a; openingLine = mp.bFreeText;
    } else {
      const openerFirst = Math.random() < 0.5;
      requesterId = openerFirst ? mp.a : mp.b;
      responderId = openerFirst ? mp.b : mp.a;
      openingLine = openerFirst ? mp.aFreeText : mp.bFreeText;
    }
    newDialogGroups.push({ requesterId, responderId, openingLine });
  }

  // ── Part 3: Create new conversations, run tick 1 (concurrent) ──
  await Promise.all(
    newDialogGroups.map(async (dg) => {
      const worldId = charById.get(dg.requesterId)!.worldId;
      const conv: Conversation = {
        id: `conv-${randomUUID().slice(0, 8)}`,
        worldId,
        initiatorId: dg.requesterId,
        acceptorId: dg.responderId,
        transcript: [{ speakerId: dg.requesterId, kind: "say", line: dg.openingLine }],
        tickStarted: tick,
        currentTickRounds: 0,
        status: "active",
      };
      const tickResult = await runOneTickDialog(conv, charById, nodeById, input.language, tick, epoch, input.worldDescription, nodes);
      conv.transcript = tickResult.transcript;
      conv.currentTickRounds = tickResult.transcript.filter(t => t.speakerId !== "__system__").length;
      if (tickResult.ended) {
        conv.status = "ended";
        conv.endedBy = tickResult.endedBy;
      } else {
        conv.status = "ending";
      }
      updatedConversations.push(conv);
      consumedActorIds.add(conv.initiatorId);
      consumedActorIds.add(conv.acceptorId);
      const initiatorChar = charById.get(conv.initiatorId);
      if (initiatorChar) initiatorChar.activeConversationIds.push(conv.id);
      const acceptorChar = charById.get(conv.acceptorId);
      if (acceptorChar) acceptorChar.activeConversationIds.push(conv.id);
    }),
  );

  // ── Part 4: Salvage decisions ──
  const salvageResults = await Promise.all(salvageTasks.map((t) => t()));

  // ── Part 5: Generate dialog events + summarize ended conversations (concurrent) ──
  await Promise.all(
    updatedConversations.map(async (conv) => {
      const opener = charById.get(conv.initiatorId)!;
      const responder = charById.get(conv.acceptorId)!;

      if (conv.status === "ended") {
        // Generate summary (WorldEvent only, no memory writes)
        let summary: string;
        try {
          const summaryResult = await retryOnce(() =>
            input.summaryDecide({
              openerName: opener.name, openerId: conv.initiatorId,
              responderName: responder.name, responderId: conv.acceptorId,
              transcript: conv.transcript, language: input.language,
            }),
          );
          summary = summaryResult.summary;
          // IMPORTANT: Do NOT apply summaryResult.memorize to impressionBook anymore
          // Impressions are handled by personal memory generation
        } catch {
          summary = `双方聊了 ${conv.transcript.length} 句`;
        }

        // Generate personal memories for each participant via agentic loop
        const personalMemCtx: ToolHandlerContext = {
          self: opener,
          allCharacters: characters,
          nodes,
          tick,
          epoch,
          worldId: opener.worldId,
          worldDescription: input.worldDescription,
        };
        const personalMemCtxResp: ToolHandlerContext = {
          self: responder,
          allCharacters: characters,
          nodes,
          tick,
          epoch,
          worldId: responder.worldId,
          worldDescription: input.worldDescription,
        };

        try {
          await Promise.all([
            generatePersonalMemory(opener, responder, personalMemCtx),
            generatePersonalMemory(responder, opener, personalMemCtxResp),
          ]);
        } catch {
          // Personal memory generation failure is non-critical
        }

        dialogEvents.push({
          id: `evt-conv-${conv.id}`,
          worldId: opener.worldId, tick, category: "social", description: summary,
          participants: [conv.initiatorId, conv.acceptorId], source: "actor", intensity: 2,
          scope: "node", nodeId: opener.locationId, duration: 1,
          dialogTranscript: conv.transcript,
          dialogEndedBy: conv.endedBy === "passive" ? "passive" : (conv.endedBy ? "end_tool" : "natural"),
        });
        // Release from conversation + set cooldown
        const initiator = charById.get(conv.initiatorId);
        if (initiator) {
          initiator.activeConversationIds = initiator.activeConversationIds.filter((id) => id !== conv.id);
          initiator.lastConversationEndTick = tick;
        }
        const acceptor = charById.get(conv.acceptorId);
        if (acceptor) {
          acceptor.activeConversationIds = acceptor.activeConversationIds.filter((id) => id !== conv.id);
          acceptor.lastConversationEndTick = tick;
        }
      } else {
        dialogEvents.push({
          id: `evt-conv-${conv.id}`,
          worldId: opener.worldId, tick, category: "social",
          description: `${opener.name} 和 ${responder.name} 正在对话`,
          participants: [conv.initiatorId, conv.acceptorId], source: "actor", intensity: 2,
          scope: "node", nodeId: opener.locationId, duration: 1,
          dialogTranscript: conv.transcript,
        });
      }
    }),
  );

  const activeConversations = updatedConversations.filter((c) => c.status !== "ended");
  const endedConversations = updatedConversations.filter((c) => c.status === "ended");

  // ── Part 6: Assign finalActions ──
  for (const conv of activeConversations) {
    finalActionsMap.set(conv.initiatorId, {
      type: "look_around", actorId: conv.initiatorId,
      reasoning: `正在和 ${charById.get(conv.acceptorId)!.name} 对话`,
      selfImportance: 2, skipExecution: true, skipMemory: true,
    });
    finalActionsMap.set(conv.acceptorId, {
      type: "look_around", actorId: conv.acceptorId,
      reasoning: `正在和 ${charById.get(conv.initiatorId)!.name} 对话`,
      selfImportance: 2, skipExecution: true, skipMemory: true,
    });
  }
  for (const conv of endedConversations) {
    finalActionsMap.set(conv.initiatorId, {
      type: "look_around", actorId: conv.initiatorId,
      reasoning: `刚和 ${charById.get(conv.acceptorId)!.name} 聊完`,
      selfImportance: 2, skipExecution: true, skipMemory: true,
    });
    finalActionsMap.set(conv.acceptorId, {
      type: "look_around", actorId: conv.acceptorId,
      reasoning: `刚和 ${charById.get(conv.initiatorId)!.name} 聊完`,
      selfImportance: 2, skipExecution: true, skipMemory: true,
    });
  }
  for (const sr of salvageResults) {
    finalActionsMap.set(sr.actorId, sr.action);
  }
  for (const a of rawActions) {
    if (!finalActionsMap.has(a.actorId)) {
      finalActionsMap.set(a.actorId, a);
    }
  }
  const finalActions = characters.map((c) => finalActionsMap.get(c.id)!).filter((a): a is Action => a != null);

  return { finalActions, dialogEvents, memoryWrites, updatedConversations };
}
