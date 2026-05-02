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
import type { Action, Character, MapNode, Memory, WorldEvent } from "@/domain/types";
import type { DialogTurn } from "@/domain/types";

// ---------------------------------------------------------------------------
// Types (exported for testing and tick.ts)
// ---------------------------------------------------------------------------

export interface SpeakPairing {
  mutualPairs: Array<{ a: string; b: string; aFreeText: string; bFreeText: string }>;
  pendingAcceptances: Array<{ requester: string; target: string; freeText: string }>;
  autoFails: Array<{
    requester: string;
    target: string;
    reason: "target_left" | "target_sleeping" | "cross_node" | "invalid_request";
  }>;
}

export interface DialogOutcome {
  participants: [string, string];
  transcript: DialogTurn[];
  summary: string;
  endedBy: "natural" | "leave" | "hard_limit" | "turn_failure";
  endedByCharacterId?: string;
}

export interface DialogOutcomeInternal {
  outcome: DialogOutcome;
  requesterId: string;
  responderId: string;
}

export interface MemoryWrite {
  characterId: string;
  memory: Memory;
}

export interface DialogPhaseResult {
  finalActions: Action[];
  dialogEvents: WorldEvent[];
  memoryWrites: MemoryWrite[];
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
}) => Promise<AcceptDecideResult>;

export type TurnDecideFn = (input: {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  isSoftLimit: boolean;
  turnCount: number;
}) => Promise<DialogTurn>;

export type SummaryDecideFn = (input: {
  openerName: string;
  responderName: string;
  transcript: DialogTurn[];
}) => Promise<string>;

export type SalvageDecideFn = (input: {
  character: Character;
  tick: number;
  rejectReason: string;
}) => Promise<Action>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SHORT_MEMORY_LIMIT = 50;

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
    if (target.currentAction?.type === "sleep") {
      autoFails.push({
        requester: a.actorId,
        target: target.id,
        reason: "target_sleeping",
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
// runOneDialog — per-group dialog expansion (private)
// ---------------------------------------------------------------------------

const HARD_LIMIT = 12;
const SOFT_LIMIT = 8;

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

async function runOneDialog(
  openerId: string,
  responderId: string,
  openingLine: string,
  chars: Map<string, Character>,
  turnDecide: TurnDecideFn,
  summaryDecide: SummaryDecideFn,
): Promise<DialogOutcomeInternal> {
  const opener = chars.get(openerId)!;
  const responder = chars.get(responderId)!;

  const transcript: DialogTurn[] = [
    { speakerId: openerId, kind: "say", line: openingLine },
  ];

  const summarizeOrFallback = async (
    endedBy: DialogOutcome["endedBy"],
    endedByCharacterId?: string,
  ): Promise<DialogOutcomeInternal> => {
    let summary: string;
    try {
      summary = await retryOnce(() =>
        summaryDecide({
          openerName: opener.name,
          responderName: responder.name,
          transcript,
        }),
      );
    } catch {
      summary = `（摘要生成失败：双方聊了 ${transcript.length} 句）`;
    }
    return {
      outcome: {
        participants: [openerId, responderId],
        transcript,
        summary,
        endedBy,
        endedByCharacterId,
      },
      requesterId: openerId,
      responderId: responderId,
    };
  };

  while (transcript.length < HARD_LIMIT) {
    const lastSpeakerId = transcript[transcript.length - 1].speakerId;
    const nextSpeakerId = lastSpeakerId === openerId ? responderId : openerId;
    const nextSpeaker = chars.get(nextSpeakerId)!;
    const peer = nextSpeakerId === responderId ? opener : responder;
    const isSoftLimit = transcript.length >= SOFT_LIMIT;

    let turn: DialogTurn;
    try {
      turn = await retryOnce(() =>
        turnDecide({
          self: nextSpeaker,
          peer,
          transcript,
          isSoftLimit,
          turnCount: transcript.length,
        }),
      );
    } catch {
      return summarizeOrFallback("turn_failure");
    }

    if (turn.kind === "leave" || (turn.kind === "say" && (!turn.line || !turn.line.trim()))) {
      transcript.push({ speakerId: nextSpeakerId, kind: "leave" });
      return summarizeOrFallback("leave", nextSpeakerId);
    }
    transcript.push(turn);
  }

  return summarizeOrFallback(
    transcript.length >= HARD_LIMIT ? "hard_limit" : "natural",
  );
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
  acceptDecide: AcceptDecideFn;
  turnDecide: TurnDecideFn;
  summaryDecide: SummaryDecideFn;
  salvageDecide: SalvageDecideFn;
}

export async function runDialogPhase(
  input: RunDialogPhaseInput,
): Promise<DialogPhaseResult> {
  const { rawActions, characters, nodes, perceptions, tick } = input;
  const charById = new Map(characters.map((c) => [c.id, c]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const pairing = pairSpeakRequests(rawActions, characters);
  const memoryWrites: MemoryWrite[] = [];
  const dialogEvents: WorldEvent[] = [];
  const finalActionsMap = new Map<string, Action>();

  // Track which actors were consumed by dialog
  const consumedActorIds = new Set<string>();
  const salvageTasks: Array<() => Promise<{ actorId: string; action: Action }>> = [];

  // ── Process autoFails ──
  for (const af of pairing.autoFails) {
    consumedActorIds.add(af.requester);
    const char = charById.get(af.requester)!;
    let reason: string;
    if (af.reason === "target_sleeping") reason = `想找对方说话但她在睡觉`;
    else if (af.reason === "cross_node") reason = `想找对方说话但她不在这里`;
    else if (af.reason === "target_left") reason = `想找对方说话但她已经走了`;
    else reason = `想开口又咽了回去`;

    memoryWrites.push(makeMemory(af.requester, tick, 1, reason));

    salvageTasks.push(() =>
      input.salvageDecide({
        character: char,
        tick,
        rejectReason: reason,
      }).then((action) => ({ actorId: af.requester, action })),
    );
  }

  // ── Process pending acceptances (parallel) ──
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
          character: target,
          requesterName: requester.name,
          requesterId: pa.requester,
          freeText: pa.freeText,
          here,
          perceived,
          companions,
          tick,
        });
      } catch {
        result = {
          type: "reject_speak",
          targetId: pa.requester,
          reasoning: "决策失败默认拒绝",
          selfImportance: 1,
        };
      }

      // Validate type
      if (result.type !== "accept_speak" && result.type !== "reject_speak") {
        result = {
          type: "reject_speak",
          targetId: pa.requester,
          reasoning: "决策输出非法 type",
          selfImportance: 1,
        };
      }

      return { pa, result };
    }),
  );

  // ── Split accepted vs rejected ──
  const acceptedDialogGroups: Array<{
    requesterId: string;
    responderId: string;
    openingLine: string;
  }> = [];
  for (const { pa, result } of acceptResults) {
    consumedActorIds.add(pa.requester);

    if (result.type === "accept_speak") {
      acceptedDialogGroups.push({
        requesterId: pa.requester,
        responderId: pa.target,
        openingLine: pa.freeText,
      });
    } else {
      // Rejected
      const requester = charById.get(pa.requester)!;
      const targetName = charById.get(pa.target)!.name;
      memoryWrites.push(
        makeMemory(pa.requester, tick, 2, `我邀请 ${targetName} 说话被拒了`),
      );
      memoryWrites.push(
        makeMemory(pa.target, tick, 1, `我拒绝了 ${requester.name} 的搭话邀请`),
      );

      salvageTasks.push(() =>
        input.salvageDecide({
          character: requester,
          tick,
          rejectReason: `${targetName} 拒绝了你的对话请求。`,
        }).then((action) => ({ actorId: pa.requester, action })),
      );
    }
  }

  // ── Process mutual pairs → auto-accepted dialog groups ──
  for (const mp of pairing.mutualPairs) {
    consumedActorIds.add(mp.a);
    consumedActorIds.add(mp.b);

    // Random opener
    const openerFirst = Math.random() < 0.5;
    acceptedDialogGroups.push({
      requesterId: openerFirst ? mp.a : mp.b,
      responderId: openerFirst ? mp.b : mp.a,
      openingLine: openerFirst ? mp.aFreeText : mp.bFreeText,
    });
  }

  // ── Expand dialogs (parallel per-group) + salvages (parallel) ──
  const [dialogOutcomes, salvageResults] = await Promise.all([
    Promise.all(
      acceptedDialogGroups.map((dg) =>
        runOneDialog(
          dg.requesterId,
          dg.responderId,
          dg.openingLine,
          charById,
          input.turnDecide,
          input.summaryDecide,
        ),
      ),
    ),
    Promise.all(salvageTasks.map((t) => t())),
  ]);

  // ── Build dialog events + memories for accepted dialogs ──
  for (const dio of dialogOutcomes) {
    const o = dio.outcome;
    const opener = charById.get(dio.requesterId)!;
    const responder = charById.get(dio.responderId)!;
    const maxImportance = clamp(
      Math.max(
        rawActions.find((a) => a.actorId === dio.requesterId)?.selfImportance ?? 2,
        rawActions.find((a) => a.actorId === dio.responderId)?.selfImportance ?? 2,
      ),
      2,
      4,
    );

    memoryWrites.push(
      makeMemory(
        dio.requesterId,
        tick,
        maxImportance,
        `和 ${responder.name} 聊了：${o.summary}`,
      ),
    );
    memoryWrites.push(
      makeMemory(
        dio.responderId,
        tick,
        maxImportance,
        `和 ${opener.name} 聊了：${o.summary}`,
      ),
    );

    dialogEvents.push({
      id: `evt-${randomUUID().slice(0, 8)}`,
      worldId: opener.worldId,
      tick,
      category: "social",
      description: o.summary,
      participants: [dio.requesterId, dio.responderId],
      source: "actor",
      intensity: 2,
      scope: "node",
      nodeId: opener.locationId,
      duration: 1,
      dialogTranscript: o.transcript,
      dialogEndedBy: o.endedBy,
    });
  }

  // ── Assign finalActions ──
  // Consumed actors in successful dialog → wait placeholder
  for (const dio of dialogOutcomes) {
    const responderName = charById.get(dio.responderId)!.name;
    const openerName = charById.get(dio.requesterId)!.name;
    finalActionsMap.set(dio.requesterId, {
      type: "wait",
      actorId: dio.requesterId,
      reasoning: `刚和 ${responderName} 聊完`,
      selfImportance: 2,
    });
    finalActionsMap.set(dio.responderId, {
      type: "wait",
      actorId: dio.responderId,
      reasoning: `刚和 ${openerName} 聊完`,
      selfImportance: 2,
    });
  }

  // Salvaged actors → their salvage action
  for (const sr of salvageResults) {
    finalActionsMap.set(sr.actorId, sr.action);
  }

  // Non-speak actors → keep their original action
  for (const a of rawActions) {
    if (!finalActionsMap.has(a.actorId)) {
      finalActionsMap.set(a.actorId, a);
    }
  }

  const finalActions = characters.map((c) => finalActionsMap.get(c.id)!);

  return { finalActions, dialogEvents, memoryWrites };
}
