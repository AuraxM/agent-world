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
