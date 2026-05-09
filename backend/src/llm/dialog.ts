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
  EndConversationPayload,
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
import { getNextHourEntries } from "../systems/index";
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

export type TurnDecideFn = (input: {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  here: MapNode;
  language: Language;
  pendingAction?: import("../domain/types").DialogueActionRequest;
  dialogueActions: import("../domain/action-system").ActionDefinition[];
  tick: number;
  epoch?: number;
  upcomingEntries?: import("../domain/types").NotebookEntry[];
  previousMessages?: Array<Record<string, unknown>>;
  previousTranscriptLength?: number;
}) => Promise<
  | { kind: "turn"; turn: DialogTurn; proposeAction?: DialogueActionProposal; respondToAction?: DialogueActionResponse; messages?: Array<Record<string, unknown>>; transcriptLength?: number }
  | { kind: "end"; payload: EndConversationPayload; respondToAction?: DialogueActionResponse; messages?: Array<Record<string, unknown>>; transcriptLength?: number }
>;

export type SummaryDecideFn = (input: {
  openerName: string;
  openerId: string;
  responderName: string;
  responderId: string;
  transcript: DialogTurn[];
  language: Language;
}) => Promise<{ summary: string; memorize?: Array<{ target_id: string; impression: string }> }>;

export type PersonalMemoryDecideFn = (input: {
  characterName: string;
  characterId: string;
  partnerName: string;
  partnerId: string;
  transcript: DialogTurn[];
  language: Language;
}) => Promise<{ feeling: string; impression: string; topics: string[] }>;

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
    },
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
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
        mutualPairs.push({
          a: a.actorId,
          b: peer.actorId,
          aFreeText: a.freeText ?? "",
          bFreeText: peer.freeText ?? "",
        });
        consumed.add(a.actorId);
        consumed.add(peer.actorId);
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

const TURNS_PER_TICK = 3;

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
  };

  try {
    // travel_together: special handling — set ongoing action on both characters
    if (actionType === "travel_together") {
      const targetNodeId = params.target_node_id as string;
      if (!targetNodeId) return undefined;
      if (targetNodeId === actor.locationId) return `${actor.name} 已经在目的地了。`;

      const nodesArray = Array.from(nodeById.values());
      const path = findPath(actor.locationId, targetNodeId, nodesArray);
      if (!path) return undefined;

      const destNode = nodeById.get(targetNodeId);
      const destName = destNode?.name ?? targetNodeId;
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
        });
        pushMemo(target, {
          id: `mem-${randomUUID().slice(0, 8)}`, tick, importance: 3,
          content: `我和 ${actor.name} 一起到达了 ${destName}。`,
        });
        return `${actor.name} 和 ${target.name} 结伴到达了 ${destName}。`;
      }

      actor.currentAction = ongoingAction;
      target.currentAction = partnerAction;

      pushMemo(actor, {
        id: `mem-${randomUUID().slice(0, 8)}`, tick, importance: 3,
        content: `我和 ${target.name} 开始结伴前往 ${destName}。${reason}`,
      });
      pushMemo(target, {
        id: `mem-${randomUUID().slice(0, 8)}`, tick, importance: 3,
        content: `我和 ${actor.name} 开始结伴前往 ${destName}。${reason}`,
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
    });
    if (outcome.targetMemory) {
      pushMemo(target, {
        id: `mem-${randomUUID().slice(0, 8)}`,
        tick,
        importance: 3,
        content: outcome.targetMemory,
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
  turnDecide: TurnDecideFn,
  language: Language,
  currentTick: number,
  epoch: number,
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

  // First tick of a new conversation: if opening line already present,
  // it counts as 1 turn — generate only 5 more to reach 6 total (3 per person)
  const hasExistingTurns = transcript.some((t) => t.speakerId !== "__system__");
  const maxRounds =
    TURNS_PER_TICK * 2 - (conv.currentTickRounds === 0 && hasExistingTurns ? 1 : 0);
  const sixthSentenceIndex = maxRounds - 1;

  // Inject time reminder before this tick's dialogue rounds
  transcript.push({
    speakerId: "__system__",
    kind: "say",
    line: injectTimeMessage({ tick: currentTick, epoch, tickStarted: conv.tickStarted, language }),
  });

  for (let round = 0; round < maxRounds; round++) {
    const speakerId =
      round % 2 === 0
        ? firstSpeakerId
        : firstSpeakerId === conv.initiatorId
          ? conv.acceptorId
          : conv.initiatorId;
    const speaker = chars.get(speakerId)!;
    const peer = speakerId === conv.initiatorId ? acceptor : initiator;

    // Build dialogue action context for this turn
    const speakerHere = nodeById.get(speaker.locationId)!;
    const actionCtx = {
      worldId: conv.worldId, tick: currentTick, epoch, self: speaker, here: speakerHere,
      companions: [peer],
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
    };
    const dialogueActions = actionRegistry.getDialogueActions(actionCtx);

    // Determine pendingAction for this speaker: only if it targets them
    const pendingAction = conv.pendingAction && conv.pendingAction.targetId === speakerId
      ? conv.pendingAction
      : undefined;

    const upcomingEntries = getNextHourEntries(speaker.notebook ?? [], currentTick);

    let result;
    try {
      result = await retryOnce(() => turnDecide({
        self: speaker,
        peer,
        transcript,
        here: speakerHere,
        language,
        pendingAction,
        dialogueActions,
        tick: currentTick,
        epoch,
        upcomingEntries,
        previousMessages: conv.sharedMessages,
        previousTranscriptLength: conv.sharedMessagesTranscriptLength,
      }));
    } catch (err) {
      log.error("turnDecide 异常，对话被迫终止", {
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
        if (result.respondToAction.accepted) {
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
        }
        // Clear pending regardless
        conv.pendingAction = undefined;
      }
    }

    // ── Process proposeAction (after respondToAction, so it won't overwrite existing pending) ──
    if (result.kind === "turn" && result.proposeAction) {
      conv.pendingAction = {
        requesterId: speakerId,
        targetId: result.proposeAction.targetId,
        actionType: result.proposeAction.actionType,
        params: result.proposeAction.params,
      };
    }

    // ── Save shared LLM context ──
    if (result.messages) {
      conv.sharedMessages = result.messages;
    }
    if (result.transcriptLength !== undefined) {
      conv.sharedMessagesTranscriptLength = result.transcriptLength;
    }

    if (result.kind === "end") {
      const isSixthSentence = round === sixthSentenceIndex;
      if (result.payload.closingLine) {
        transcript.push({
          speakerId,
          kind: "say",
          line: result.payload.closingLine,
          reasoning: result.payload.reasoning,
        });
      }
      if (isSixthSentence) {
        // 3+4 rule: other party gets one extra turn
        const otherId =
          speakerId === conv.initiatorId ? conv.acceptorId : conv.initiatorId;
        const other = chars.get(otherId)!;
        const otherPeer = otherId === conv.initiatorId ? acceptor : initiator;
        try {
          const otherHere = nodeById.get(other.locationId)!;
          const otherActionCtx = {
            worldId: conv.worldId, tick: currentTick, epoch, self: other, here: otherHere,
            companions: [otherPeer],
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
          };
          const otherDialogueActions = actionRegistry.getDialogueActions(otherActionCtx);
          const otherPendingAction = conv.pendingAction && conv.pendingAction.targetId === otherId
            ? conv.pendingAction : undefined;
          const upcomingEntries = getNextHourEntries(other.notebook ?? [], currentTick);
          const extraResult = await turnDecide({
            self: other,
            peer: otherPeer,
            transcript,
            here: otherHere,
            language,
            pendingAction: otherPendingAction,
            dialogueActions: otherDialogueActions,
            tick: currentTick,
            epoch,
            upcomingEntries,
            previousMessages: conv.sharedMessages,
            previousTranscriptLength: conv.sharedMessagesTranscriptLength,
          });
          // Save extra round context too
          if (extraResult.messages) {
            conv.sharedMessages = extraResult.messages;
          }
          if (extraResult.transcriptLength !== undefined) {
            conv.sharedMessagesTranscriptLength = extraResult.transcriptLength;
          }
          if (extraResult.kind === "turn") {
            transcript.push(extraResult.turn);
          }
          // Process any respondToAction in extra round too
          if (extraResult.respondToAction) {
            const pa = conv.pendingAction;
            if (pa && extraResult.respondToAction.accepted) {
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
            }
            conv.pendingAction = undefined;
          }
        } catch {
          // ignore extra round failure
        }
      } else {
        return {
          transcript,
          ended: true,
          endedBy: speakerId === conv.initiatorId ? "initiator" : "acceptor",
        };
      }
      // After 6th-sentence extra round, end the conversation.
      return {
        transcript,
        ended: true,
        endedBy: speakerId === conv.initiatorId ? "initiator" : "acceptor",
      };
    }

    transcript.push(result.turn);
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
  language: Language;
  acceptDecide: AcceptDecideFn;
  turnDecide: TurnDecideFn;
  summaryDecide: SummaryDecideFn;
  personalMemoryDecide: PersonalMemoryDecideFn;
  salvageDecide: SalvageDecideFn;
  ongoingConversations: Conversation[];
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

      const tickResult = await runOneTickDialog(conv, charById, nodeById, input.turnDecide, input.language, tick, epoch);
      conv.transcript = tickResult.transcript;
      conv.currentTickRounds = TURNS_PER_TICK;

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
    else reason = `想开口又咽了回去`;
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
    const openerFirst = Math.random() < 0.5;
    newDialogGroups.push({
      requesterId: openerFirst ? mp.a : mp.b,
      responderId: openerFirst ? mp.b : mp.a,
      openingLine: openerFirst ? mp.aFreeText : mp.bFreeText,
    });
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
      const tickResult = await runOneTickDialog(conv, charById, nodeById, input.turnDecide, input.language, tick, epoch);
      conv.transcript = tickResult.transcript;
      conv.currentTickRounds = TURNS_PER_TICK;
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
        // Three concurrent LLM calls: summary + each character's personal memory
        let summary: string;
        let openerMemory: { feeling: string; impression: string; topics: string[] } | null = null;
        let responderMemory: { feeling: string; impression: string; topics: string[] } | null = null;
        try {
          const [summaryResult, openerMemResult, responderMemResult] = await Promise.all([
            retryOnce(() =>
              input.summaryDecide({
                openerName: opener.name, openerId: conv.initiatorId,
                responderName: responder.name, responderId: conv.acceptorId,
                transcript: conv.transcript, language: input.language,
              }),
            ),
            retryOnce(() =>
              input.personalMemoryDecide({
                characterName: opener.name, characterId: conv.initiatorId,
                partnerName: responder.name, partnerId: conv.acceptorId,
                transcript: conv.transcript, language: input.language,
              }),
            ),
            retryOnce(() =>
              input.personalMemoryDecide({
                characterName: responder.name, characterId: conv.acceptorId,
                partnerName: opener.name, partnerId: conv.initiatorId,
                transcript: conv.transcript, language: input.language,
              }),
            ),
          ]);
          summary = summaryResult.summary;
          if (summaryResult.memorize) {
            for (const m of summaryResult.memorize) {
              if (m.target_id === conv.acceptorId) opener.impressionBook[m.target_id] = m.impression.trim();
              if (m.target_id === conv.initiatorId) responder.impressionBook[m.target_id] = m.impression.trim();
            }
          }
          openerMemory = openerMemResult;
          responderMemory = responderMemResult;
        } catch {
          summary = `（摘要生成失败：双方聊了 ${conv.transcript.length} 句）`;
        }

        // Apply personal memory impressions to impressionBook
        if (openerMemory?.impression) {
          opener.impressionBook[conv.acceptorId] = openerMemory.impression.trim();
        }
        if (responderMemory?.impression) {
          responder.impressionBook[conv.initiatorId] = responderMemory.impression.trim();
        }

        const maxImportance = clamp(
          Math.max(
            rawActions.find((a) => a.actorId === conv.initiatorId)?.selfImportance ?? 2,
            rawActions.find((a) => a.actorId === conv.acceptorId)?.selfImportance ?? 2,
          ),
          2, 4,
        );

        // Write personal memories to each character's shortMemory
        if (openerMemory) {
          const topics = openerMemory.topics.length > 0 ? ` 主题：${openerMemory.topics.join("、")}。` : "";
          memoryWrites.push(makeMemory(conv.initiatorId, tick, maxImportance,
            `和 ${responder.name} 聊完了。心情：${openerMemory.feeling}。对 ${responder.name} 的印象：${openerMemory.impression}。${topics}`));
        } else {
          memoryWrites.push(makeMemory(conv.initiatorId, tick, maxImportance, `和 ${responder.name} 聊了：${summary}`));
        }
        if (responderMemory) {
          const topics = responderMemory.topics.length > 0 ? ` 主题：${responderMemory.topics.join("、")}。` : "";
          memoryWrites.push(makeMemory(conv.acceptorId, tick, maxImportance,
            `和 ${opener.name} 聊完了。心情：${responderMemory.feeling}。对 ${opener.name} 的印象：${responderMemory.impression}。${topics}`));
        } else {
          memoryWrites.push(makeMemory(conv.acceptorId, tick, maxImportance, `和 ${opener.name} 聊了：${summary}`));
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
  const finalActions = characters.map((c) => finalActionsMap.get(c.id)!);

  return { finalActions, dialogEvents, memoryWrites, updatedConversations };
}
