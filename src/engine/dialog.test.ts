/**
 * dialog.ts 单元测试。
 * pairSpeakRequests 是纯函数，无 LLM 依赖。
 */
import { describe, expect, it } from "vitest";
import { pairSpeakRequests } from "./dialog";
import type { Action, Character } from "@/domain/types";

function makeChar(id: string, loc: string, currentActionType?: string): Character {
  return {
    id,
    worldId: "w",
    name: id.toUpperCase(),
    locationId: loc,
    personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
    vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
    emotion: { mood: 0, stress: 0, social_satiety: 0 },
    abilities: [],
    shortMemory: [],
    longMemory: [],
    relations: {},
    currentAction: currentActionType
      ? { type: currentActionType as any, startedAt: 0, endsAt: 10, description: "", interruptThreshold: 3 }
      : undefined,
  };
}

function speakAction(actorId: string, targetId: string, freeText?: string): Action {
  return {
    type: "speak",
    actorId,
    targetId,
    freeText,
    reasoning: "想聊聊",
    selfImportance: 2,
  };
}

function readAction(actorId: string): Action {
  return { type: "read", actorId, reasoning: "读书", selfImportance: 1 };
}

describe("pairSpeakRequests", () => {
  it("mutual pair — A↔B same node", () => {
    const chars = [makeChar("a", "n1"), makeChar("b", "n1")];
    const actions = [speakAction("a", "b", "嗨"), speakAction("b", "a", "你好")];
    const r = pairSpeakRequests(actions, chars);
    expect(r.mutualPairs).toHaveLength(1);
    expect(r.mutualPairs[0]).toMatchObject({ a: "a", b: "b" });
    expect(r.pendingAcceptances).toHaveLength(0);
    expect(r.autoFails).toHaveLength(0);
  });

  it("mutual pair cross-node → autoFails individually", () => {
    const chars = [makeChar("a", "n1"), makeChar("b", "n2")];
    const actions = [speakAction("a", "b", "嗨"), speakAction("b", "a", "你好")];
    const r = pairSpeakRequests(actions, chars);
    expect(r.mutualPairs).toHaveLength(0);
    expect(r.autoFails).toHaveLength(2);
    expect(r.autoFails.every((af) => af.reason === "cross_node")).toBe(true);
  });

  it("one-way speak with non-speak target", () => {
    const chars = [makeChar("a", "n1"), makeChar("b", "n1")];
    const actions = [speakAction("a", "b", "有空吗"), readAction("b")];
    const r = pairSpeakRequests(actions, chars);
    expect(r.pendingAcceptances).toHaveLength(1);
    expect(r.pendingAcceptances[0]).toMatchObject({ requester: "a", target: "b" });
  });

  it("multiple requesters to same target", () => {
    const chars = [makeChar("a", "n1"), makeChar("b", "n1"), makeChar("d", "n1")];
    const actions = [speakAction("a", "b", "hi"), speakAction("d", "b", "hey"), readAction("b")];
    const r = pairSpeakRequests(actions, chars);
    expect(r.pendingAcceptances).toHaveLength(2);
  });

  it("offset triangle A→B, B→C", () => {
    const chars = [makeChar("a", "n1"), makeChar("b", "n1"), makeChar("c", "n1")];
    const actions = [speakAction("a", "b", "hi"), speakAction("b", "c", "hey"), readAction("c")];
    const r = pairSpeakRequests(actions, chars);
    expect(r.mutualPairs).toHaveLength(0);
    expect(r.pendingAcceptances).toHaveLength(2);
  });

  it("cross-node → autoFail", () => {
    const chars = [makeChar("a", "n1"), makeChar("b", "n2")];
    const actions = [speakAction("a", "b", "hi")];
    const r = pairSpeakRequests(actions, chars);
    expect(r.autoFails).toHaveLength(1);
    expect(r.autoFails[0].reason).toBe("cross_node");
  });

  it("target in sleep → autoFail", () => {
    const chars = [makeChar("a", "n1"), makeChar("b", "n1", "sleep")];
    const actions = [speakAction("a", "b", "醒了吗")];
    const r = pairSpeakRequests(actions, chars);
    expect(r.autoFails).toHaveLength(1);
    expect(r.autoFails[0].reason).toBe("target_sleeping");
  });

  it("target in nap → NOT autoFail", () => {
    const chars = [makeChar("a", "n1"), makeChar("b", "n1", "nap")];
    const actions = [speakAction("a", "b", "打扰一下")];
    const r = pairSpeakRequests(actions, chars);
    expect(r.autoFails).toHaveLength(0);
    expect(r.pendingAcceptances).toHaveLength(1);
  });

  it("target doesn't exist → autoFail invalid_request", () => {
    const chars = [makeChar("a", "n1")];
    const actions = [speakAction("a", "ghost", "在吗")];
    const r = pairSpeakRequests(actions, chars);
    expect(r.autoFails).toHaveLength(1);
    expect(r.autoFails[0].reason).toBe("invalid_request");
  });

  it("target=self → autoFail invalid_request", () => {
    const chars = [makeChar("a", "n1")];
    const actions = [speakAction("a", "a", "自言自语")];
    const r = pairSpeakRequests(actions, chars);
    expect(r.autoFails).toHaveLength(1);
    expect(r.autoFails[0].reason).toBe("invalid_request");
  });

  it("freeText missing/blank → autoFail invalid_request", () => {
    const chars = [makeChar("a", "n1"), makeChar("b", "n1")];
    const r1 = pairSpeakRequests([speakAction("a", "b", "")], chars);
    expect(r1.autoFails).toHaveLength(1);
    expect(r1.autoFails[0].reason).toBe("invalid_request");

    const r2 = pairSpeakRequests([{ ...speakAction("a", "b"), freeText: undefined }], chars);
    expect(r2.autoFails).toHaveLength(1);
    expect(r2.autoFails[0].reason).toBe("invalid_request");

    const r3 = pairSpeakRequests([speakAction("a", "b", "   ")], chars);
    expect(r3.autoFails).toHaveLength(1);
    expect(r3.autoFails[0].reason).toBe("invalid_request");
  });
});
