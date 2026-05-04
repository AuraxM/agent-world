/**
 * 对话协议模块。
 *
 * 职责：
 *   - 配对 speak 请求（mutual / pending / autoFail）
 *   - 接受/拒绝决策编排
 *   - 对话展开（5 来回 + 摘要）
 *   - 补救轮编排
 *
 * 无 IO 依赖：所有 LLM 调用通过注入的 decide 函数完成，测试时全部 mock。
 */
import { randomUUID } from "node:crypto";
import type { Language } from "@/config/types";
import type {
  Action,
  Character,
  Conversation,
  DialogTurn,
  EndConversationPayload,
  MapNode,
  Memory,
  WorldEvent,
} from "@/domain/types";
import { createLogger } from "@/util/logger";
import { injectTimeMessage } from "@/llm/prompt";
import { db, schema } from "@/db/client";
import { eq, and } from "drizzle-orm";
const log = createLogger("dialog");

// ---------------------------------------------------------------------------
// Types (exported for testing and tick.ts)
// ---------------------------------------------------------------------------

export interface SpeakPairing {
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
  type: "accept_speak" | "reject_speak";
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
  perceived: WorldEvent[];
  companions: Character[];
  tick: number;
  language: Language;
}) => Promise<AcceptDecideResult>;

export type TurnDecideFn = (input: {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  language: Language;
}) => Promise<
  | { kind: "turn"; turn: DialogTurn }
  | { kind: "end"; payload: EndConversationPayload }
>;

export type SummaryDecideFn = (input: {
  openerName: string;
  openerId: string;
  responderName: string;
  responderId: string;
  transcript: DialogTurn[];
  language: Language;
}) => Promise<string>;

export type SalvageDecideFn = (input: {
  character: Character;
  tick: number;
  rejectReason: string;
  language: Language;
}) => Promise<Action>;

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
// pairSpeakRequests
// ---------------------------------------------------------------------------

/**
 * 纯函数：从 rawActions 中提取 speak 请求，分类为 mutual / pending / autoFail。
 * 使用 tick.ts 阶段 4 收尾时的位置快照判断同节点。
 */
export function pairSpeakRequests(
  rawActions: Action[],
  characters: Character[],
): SpeakPairing {
  const speakActions = rawActions.filter((a) => a.type === "speak");
  const charById = new Map(characters.map((c) => [c.id, c]));

  const mutualPairs: SpeakPairing["mutualPairs"] = [];
  const pendingAcceptances: SpeakPairing["pendingAcceptances"] = [];
  const autoFails: SpeakPairing["autoFails"] = [];
  const consumed = new Set<string>();

  // 1. Identify mutual pairs (A↔B, same node)
  for (const a of speakActions) {
    if (consumed.has(a.actorId)) continue;
    if (!a.targetId) continue;
    const peer = speakActions.find(
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

  // 2. Non-mutual speak → validate and classify
  for (const a of speakActions) {
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

async function runOneTickDialog(
  conv: Conversation,
  chars: Map<string, Character>,
  turnDecide: TurnDecideFn,
  language: Language,
  currentTick: number,
): Promise<TickDialogResult> {
  const initiator = chars.get(conv.initiatorId)!;
  const acceptor = chars.get(conv.acceptorId)!;
  const transcript: DialogTurn[] = [...conv.transcript];

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

  for (let round = 0; round < maxRounds; round++) {
    const speakerId =
      round % 2 === 0
        ? firstSpeakerId
        : firstSpeakerId === conv.initiatorId
          ? conv.acceptorId
          : conv.initiatorId;
    const speaker = chars.get(speakerId)!;
    const peer = speakerId === conv.initiatorId ? acceptor : initiator;

    let result;
    try {
      result = await retryOnce(() => turnDecide({ self: speaker, peer, transcript, language }));
    } catch (err) {
      log.error("turnDecide 异常，对话被迫终止", {
        speaker: speaker.name,
        peer: peer.name,
        transcriptLen: transcript.length,
        convId: conv.id,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
      });
      return { transcript, ended: true };
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
          const extraResult = await turnDecide({
            self: other,
            peer: otherPeer,
            transcript,
            language,
          });
          if (extraResult.kind === "turn") {
            transcript.push(extraResult.turn);
          }
        } catch {
          // ignore extra round failure
        }
        // Inject time message after extra round
        transcript.push({
          speakerId: "__system__",
          kind: "say",
          line: injectTimeMessage({ tick: currentTick, tickStarted: conv.tickStarted, language }),
        });
      } else {
        // End before 6th sentence — still inject time
        transcript.push({
          speakerId: "__system__",
          kind: "say",
          line: injectTimeMessage({ tick: currentTick, tickStarted: conv.tickStarted, language }),
        });
      }
      return {
        transcript,
        ended: true,
        endedBy: speakerId === conv.initiatorId ? "initiator" : "acceptor",
      };
    }

    transcript.push(result.turn);
  }

  // After 6 sentences, inject time message
  transcript.push({
    speakerId: "__system__",
    kind: "say",
    line: injectTimeMessage({ tick: currentTick, tickStarted: conv.tickStarted, language }),
  });

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
  worldName: string;
  language: Language;
  acceptDecide: AcceptDecideFn;
  turnDecide: TurnDecideFn;
  summaryDecide: SummaryDecideFn;
  salvageDecide: SalvageDecideFn;
  ongoingConversations: Conversation[];
}

export async function runDialogPhase(
  input: RunDialogPhaseInput,
): Promise<DialogPhaseResult> {
  const { rawActions, characters, nodes, perceptions, tick, ongoingConversations } = input;
  const charById = new Map(characters.map((c) => [c.id, c]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const memoryWrites: MemoryWrite[] = [];
  const dialogEvents: WorldEvent[] = [];
  const finalActionsMap = new Map<string, Action>();
  const consumedActorIds = new Set<string>();
  const updatedConversations: Conversation[] = [];

  // ── Part 1: Resume ongoing conversations ──
  for (const conv of ongoingConversations) {
    if (conv.status === "ended") continue;

    const initiator = charById.get(conv.initiatorId);
    const acceptor = charById.get(conv.acceptorId);

    if (!initiator || !acceptor) {
      conv.status = "ended";
      conv.endedBy = "passive";
      updatedConversations.push(conv);
      continue;
    }
    if (initiator.locationId !== acceptor.locationId) {
      conv.status = "ended";
      conv.endedBy = "passive";
      const sysMsg: DialogTurn = {
        speakerId: "__system__",
        kind: "say",
        line: `${acceptor.name} 离开了当前场景，对话终止。`,
      };
      conv.transcript.push(sysMsg);
      updatedConversations.push(conv);
      continue;
    }

    const tickResult = await runOneTickDialog(conv, charById, input.turnDecide, input.language, tick);
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
  }

  // ── Part 2: Process new speak actions ──
  const rawPairing = pairSpeakRequests(rawActions, characters);

  // Skip pairs where either party is already in an ongoing conversation
  const pairing: SpeakPairing = {
    mutualPairs: rawPairing.mutualPairs.filter(
      (mp) => !consumedActorIds.has(mp.a) && !consumedActorIds.has(mp.b),
    ),
    pendingAcceptances: rawPairing.pendingAcceptances.filter(
      (pa) => !consumedActorIds.has(pa.requester) && !consumedActorIds.has(pa.target),
    ),
    autoFails: rawPairing.autoFails,
  };
  const salvageTasks: Array<() => Promise<{ actorId: string; action: Action }>> = [];

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
      const here = nodeById.get(target.locationId)!;
      const companions = characters.filter(
        (c) => c.id !== target.id && c.locationId === target.locationId,
      );
      const perceived = perceptions.get(target.id) ?? [];
      let result: AcceptDecideResult;
      try {
        result = await input.acceptDecide({
          character: target, requesterName: requester.name, requesterId: pa.requester,
          freeText: pa.freeText, here, perceived, companions, tick, language: input.language,
        });
      } catch {
        result = { type: "reject_speak", targetId: pa.requester, reasoning: "决策失败默认拒绝", selfImportance: 1 };
      }
      if (result.type !== "accept_speak" && result.type !== "reject_speak") {
        result = { type: "reject_speak", targetId: pa.requester, reasoning: "决策输出非法 type", selfImportance: 1 };
      }
      return { pa, result };
    }),
  );

  const newDialogGroups: Array<{ requesterId: string; responderId: string; openingLine: string }> = [];
  for (const { pa, result } of acceptResults) {
    consumedActorIds.add(pa.requester);
    if (result.type === "accept_speak") {
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

  // ── Part 3: Create new conversations, run tick 1 ──
  for (const dg of newDialogGroups) {
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
    const tickResult = await runOneTickDialog(conv, charById, input.turnDecide, input.language, tick);
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
  }

  // ── Part 4: Salvage decisions ──
  const salvageResults = await Promise.all(salvageTasks.map((t) => t()));

  // ── Part 5: Generate dialog events + summarize ended conversations ──
  for (const conv of updatedConversations) {
    const opener = charById.get(conv.initiatorId)!;
    const responder = charById.get(conv.acceptorId)!;

    if (conv.status === "ended") {
      let summary: string;
      try {
        summary = await retryOnce(() =>
          input.summaryDecide({
            openerName: opener.name, openerId: conv.initiatorId,
            responderName: responder.name, responderId: conv.acceptorId,
            transcript: conv.transcript, language: input.language,
          }),
        );
      } catch {
        summary = `（摘要生成失败：双方聊了 ${conv.transcript.length} 句）`;
      }
      const maxImportance = clamp(
        Math.max(
          rawActions.find((a) => a.actorId === conv.initiatorId)?.selfImportance ?? 2,
          rawActions.find((a) => a.actorId === conv.acceptorId)?.selfImportance ?? 2,
        ),
        2, 4,
      );
      memoryWrites.push(makeMemory(conv.initiatorId, tick, maxImportance, `和 ${responder.name} 聊了：${summary}`));
      memoryWrites.push(makeMemory(conv.acceptorId, tick, maxImportance, `和 ${opener.name} 聊了：${summary}`));
      dialogEvents.push({
        id: `evt-conv-${conv.id}`,
        worldId: opener.worldId, tick, category: "social", description: summary,
        participants: [conv.initiatorId, conv.acceptorId], source: "actor", intensity: 2,
        scope: "node", nodeId: opener.locationId, duration: 1,
        dialogTranscript: conv.transcript,
        dialogEndedBy: conv.endedBy === "passive" ? "passive" : (conv.endedBy ? "end_tool" : "natural"),
      });
      // Release from conversation
      const initiator = charById.get(conv.initiatorId);
      if (initiator) initiator.activeConversationIds = initiator.activeConversationIds.filter((id) => id !== conv.id);
      const acceptor = charById.get(conv.acceptorId);
      if (acceptor) acceptor.activeConversationIds = acceptor.activeConversationIds.filter((id) => id !== conv.id);
    } else {
      // Active conversation: push event with current transcript so frontend sees it immediately
      dialogEvents.push({
        id: `evt-conv-${conv.id}`,
        worldId: opener.worldId, tick, category: "social",
        description: `${opener.name} 和 ${responder.name} 正在对话`,
        participants: [conv.initiatorId, conv.acceptorId], source: "actor", intensity: 2,
        scope: "node", nodeId: opener.locationId, duration: 1,
        dialogTranscript: conv.transcript,
      });
    }
  }

  const activeConversations = updatedConversations.filter((c) => c.status !== "ended");
  const endedConversations = updatedConversations.filter((c) => c.status === "ended");

  // ── Part 6: Assign finalActions ──
  for (const conv of activeConversations) {
    const waitInit: Action = {
      type: "wait", actorId: conv.initiatorId,
      reasoning: `正在和 ${charById.get(conv.acceptorId)!.name} 对话`,
      selfImportance: 2, skipExecution: true,
    };
    finalActionsMap.set(conv.initiatorId, waitInit);
    finalActionsMap.set(conv.acceptorId, {
      type: "wait", actorId: conv.acceptorId,
      reasoning: `正在和 ${charById.get(conv.initiatorId)!.name} 对话`,
      selfImportance: 2, skipExecution: true,
    });
  }
  for (const conv of endedConversations) {
    finalActionsMap.set(conv.initiatorId, {
      type: "wait", actorId: conv.initiatorId,
      reasoning: `刚和 ${charById.get(conv.acceptorId)!.name} 聊完`,
      selfImportance: 2, skipExecution: true,
    });
    finalActionsMap.set(conv.acceptorId, {
      type: "wait", actorId: conv.acceptorId,
      reasoning: `刚和 ${charById.get(conv.initiatorId)!.name} 聊完`,
      selfImportance: 2, skipExecution: true,
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
