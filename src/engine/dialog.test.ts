/**
 * dialog.ts 单元测试。
 * pairSpeakRequests 是纯函数，无 LLM 依赖。
 */
import { describe, expect, it } from "vitest";
import {
  pairSpeakRequests,
  runDialogPhase,
  type AcceptDecideFn,
  type TurnDecideFn,
  type SummaryDecideFn,
  type SalvageDecideFn,
  type AcceptDecideResult,
} from "./dialog";
import type { Action, Character, DialogTurn, WorldEvent } from "@/domain/types";

function makeChar(id: string, loc: string, currentActionType?: string): Character {
  return {
    id,
    worldId: "w",
    name: id.toUpperCase(),
    age: 30,
    gender: "male" as const,
    profession: "farmer" as const,
    biography: "テスト",
    origin: "local" as const,
    locationId: loc,
    personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
    vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
    emotion: { mood: 0, stress: 0, social_satiety: 0 },
    abilities: [],
    shortMemory: [],
    dailyMemory: [],
    longMemory: [],
    relations: {},
    lastSleepTick: 0,
    money: 100,
    incomeLevel: 0,
    expenseExempt: false,
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

// ---------------------------------------------------------------------------
// runDialogPhase integration tests (all LLM decide fns mocked)
// ---------------------------------------------------------------------------

function makeCharFull(
  id: string,
  name: string,
  loc: string,
  currentActionType?: string,
): Character {
  return {
    id,
    worldId: "w",
    name,
    age: 30,
    gender: "male" as const,
    profession: "farmer" as const,
    biography: "テスト",
    origin: "local" as const,
    locationId: loc,
    personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
    vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
    emotion: { mood: 0, stress: 0, social_satiety: 0 },
    abilities: [],
    shortMemory: [],
    dailyMemory: [],
    longMemory: [],
    relations: {},
    lastSleepTick: 0,
    money: 100,
    incomeLevel: 0,
    expenseExempt: false,
    currentAction: currentActionType
      ? {
          type: currentActionType as any,
          startedAt: 0,
          endsAt: 10,
          description: "",
          interruptThreshold: 3,
        }
      : undefined,
  };
}

function mockTurn(sayLine: string): TurnDecideFn {
  return async ({ self }) => ({
    speakerId: self.id,
    kind: "say",
    line: sayLine,
  });
}

function mockAccept(result: "accept_speak" | "reject_speak"): AcceptDecideFn {
  return async ({ requesterId }) => ({
    type: result,
    targetId: requesterId,
    reasoning: result === "accept_speak" ? "好啊" : "不想聊",
    selfImportance: 2,
  });
}

function mockSummary(text: string): SummaryDecideFn {
  return async () => text;
}

function mockSalvage(actionType = "observe"): SalvageDecideFn {
  return async ({ character }) => ({
    type: actionType as any,
    actorId: character.id,
    reasoning: "被拒了，做点别的吧",
    selfImportance: 2,
  });
}

function baseNode(overrides?: Partial<{ id: string; name: string }>): any {
  return {
    id: overrides?.id ?? "n1",
    worldId: "w",
    parentId: null,
    name: overrides?.name ?? "广场",
    description: "",
    tags: ["public"],
    capacity: null,
    privacy: "public",
    visibleFromParent: true,
    shortcuts: [],
    isEntry: false,
  };
}

const emptyPerceptions = new Map<string, WorldEvent[]>();

describe("runDialogPhase", () => {
  it("mutual pair + one-way accepted → 2 dialog events, 4 wait placeholders", async () => {
    const a = makeCharFull("a", "甲", "n1");
    const b = makeCharFull("b", "乙", "n1");
    const c = makeCharFull("c", "丙", "n1");
    const d = makeCharFull("d", "丁", "n1");

    const rawActions: Action[] = [
      {
        type: "speak",
        actorId: "a",
        targetId: "b",
        freeText: "嗨",
        reasoning: "想和乙说话",
        selfImportance: 2,
      },
      {
        type: "speak",
        actorId: "b",
        targetId: "a",
        freeText: "你好",
        reasoning: "也想和甲说话",
        selfImportance: 3,
      },
      {
        type: "speak",
        actorId: "c",
        targetId: "d",
        freeText: "有空吗",
        reasoning: "想和丁聊聊",
        selfImportance: 2,
      },
      { type: "read", actorId: "d", reasoning: "读书", selfImportance: 1 },
    ];

    const result = await runDialogPhase({
      rawActions,
      characters: [a, b, c, d],
      nodes: [baseNode()],
      perceptions: emptyPerceptions,
      tick: 5,
      worldName: "测试",
      language: "zh",
      acceptDecide: mockAccept("accept_speak"),
      turnDecide: mockTurn("嗯嗯"),
      summaryDecide: mockSummary("一段愉快的闲聊"),
      salvageDecide: mockSalvage("observe"),
    });

    expect(result.finalActions).toHaveLength(4);
    expect(result.dialogEvents).toHaveLength(2);

    // mutual pair (a, b): both wait
    const aAction = result.finalActions.find((a) => a.actorId === "a")!;
    const bAction = result.finalActions.find((a) => a.actorId === "b")!;
    expect(aAction.type).toBe("wait");
    expect(bAction.type).toBe("wait");

    // accepted c→d: both engaged in dialog, both wait
    const cAction = result.finalActions.find((a) => a.actorId === "c")!;
    const dAction = result.finalActions.find((a) => a.actorId === "d")!;
    expect(cAction.type).toBe("wait");
    expect(dAction.type).toBe("wait");

    // 4 memory entries (a, b, c, d)
    expect(result.memoryWrites).toHaveLength(4);
  });

  it("one-way rejected → requester gets salvage action, both get reject memories", async () => {
    const a = makeCharFull("a", "甲", "n1");
    const b = makeCharFull("b", "乙", "n1");

    const rawActions: Action[] = [
      {
        type: "speak",
        actorId: "a",
        targetId: "b",
        freeText: "嗨",
        reasoning: "想聊天",
        selfImportance: 2,
      },
      { type: "read", actorId: "b", reasoning: "读书不理人", selfImportance: 1 },
    ];

    const result = await runDialogPhase({
      rawActions,
      characters: [a, b],
      nodes: [baseNode()],
      perceptions: emptyPerceptions,
      tick: 5,
      worldName: "测试",
      language: "zh",
      acceptDecide: mockAccept("reject_speak"),
      turnDecide: mockTurn("x"),
      summaryDecide: mockSummary("x"),
      salvageDecide: mockSalvage("observe"),
    });

    expect(result.dialogEvents).toHaveLength(0);
    const aAction = result.finalActions.find((a) => a.actorId === "a")!;
    expect(aAction.type).toBe("observe");

    const aMem = result.memoryWrites.find((m) => m.characterId === "a")!;
    const bMem = result.memoryWrites.find((m) => m.characterId === "b")!;
    expect(aMem.memory.content).toContain("被拒");
    expect(bMem.memory.content).toContain("拒绝");
  });

  it("autoFail (target_sleeping) → requester salvage + memory", async () => {
    const a = makeCharFull("a", "甲", "n1");
    const b = makeCharFull("b", "乙", "n1", "sleep");

    const rawActions: Action[] = [
      {
        type: "speak",
        actorId: "a",
        targetId: "b",
        freeText: "醒了吗",
        reasoning: "想聊天",
        selfImportance: 2,
      },
      { type: "sleep", actorId: "b", reasoning: "zzz", selfImportance: 3 },
    ];

    const result = await runDialogPhase({
      rawActions,
      characters: [a, b],
      nodes: [baseNode()],
      perceptions: emptyPerceptions,
      tick: 5,
      worldName: "测试",
      language: "zh",
      acceptDecide: mockAccept("reject_speak"),
      turnDecide: mockTurn("x"),
      summaryDecide: mockSummary("x"),
      salvageDecide: mockSalvage("observe"),
    });

    expect(result.dialogEvents).toHaveLength(0);
    const aMem = result.memoryWrites.find((m) => m.characterId === "a")!;
    expect(aMem.memory.content).toContain("在睡觉");
  });

  it("accept decision returns illegal type → treated as reject", async () => {
    const a = makeCharFull("a", "甲", "n1");
    const b = makeCharFull("b", "乙", "n1");

    const rawActions: Action[] = [
      {
        type: "speak",
        actorId: "a",
        targetId: "b",
        freeText: "嗨",
        reasoning: "想聊天",
        selfImportance: 2,
      },
      { type: "read", actorId: "b", reasoning: "不理", selfImportance: 1 },
    ];

    const badAccept: AcceptDecideFn = async ({ requesterId }) => ({
      type: "speak" as any,
      targetId: requesterId,
      reasoning: "？",
      selfImportance: 1,
    });

    const result = await runDialogPhase({
      rawActions,
      characters: [a, b],
      nodes: [baseNode()],
      perceptions: emptyPerceptions,
      tick: 5,
      worldName: "测试",
      language: "zh",
      acceptDecide: badAccept,
      turnDecide: mockTurn("x"),
      summaryDecide: mockSummary("x"),
      salvageDecide: mockSalvage("observe"),
    });

    const aAction = result.finalActions.find((a) => a.actorId === "a")!;
    expect(aAction.type).toBe("observe");
    expect(result.dialogEvents).toHaveLength(0);
  });

  it("multiple dialog groups → all outcomes collected", async () => {
    const a = makeCharFull("a", "甲", "n1");
    const b = makeCharFull("b", "乙", "n1");
    const c = makeCharFull("c", "丙", "n1");
    const d = makeCharFull("d", "丁", "n1");

    const rawActions: Action[] = [
      {
        type: "speak",
        actorId: "a",
        targetId: "b",
        freeText: "hi1",
        reasoning: "r",
        selfImportance: 2,
      },
      { type: "read", actorId: "b", reasoning: "r", selfImportance: 1 },
      {
        type: "speak",
        actorId: "c",
        targetId: "d",
        freeText: "hi2",
        reasoning: "r",
        selfImportance: 2,
      },
      { type: "read", actorId: "d", reasoning: "r", selfImportance: 1 },
    ];

    const result = await runDialogPhase({
      rawActions,
      characters: [a, b, c, d],
      nodes: [baseNode()],
      perceptions: emptyPerceptions,
      tick: 5,
      worldName: "测试",
      language: "zh",
      acceptDecide: mockAccept("accept_speak"),
      turnDecide: mockTurn("嗯"),
      summaryDecide: mockSummary("聊得不错"),
      salvageDecide: mockSalvage("wait"),
    });

    expect(result.dialogEvents).toHaveLength(2);
    expect(result.memoryWrites).toHaveLength(4);
  });
});
