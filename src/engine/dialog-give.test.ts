/**
 * 对话中 give 行为集成测试。
 *
 * 模拟 10 轮对话，每轮 3 个 tick（每个 tick 6 句对话回合），
 * 穷举各种 LLM 决策路径，验证 propose_dialogue_action → respond → execute 全链路。
 *
 * 所有 LLM 决策函数均为 mock，用不同的 mock 策略模拟各种成功/失败场景。
 */
import { describe, expect, it } from "vitest";
import { runDialogPhase, type AcceptDecideFn, type TurnDecideFn, type SummaryDecideFn, type PersonalMemoryDecideFn, type SalvageDecideFn, type DialogueActionProposal, type DialogueActionResponse } from "./dialog";
import { actionRegistry } from "@/domain/action-system";
import { BUILTIN_ACTIONS } from "./actions-builtin";
import type { Action, Character, DialogTurn, WorldEvent, Conversation } from "@/domain/types";
import type { ActionInput } from "@/domain/action-system";

// Register builtins (give must be usableInDialogue)
BUILTIN_ACTIONS.forEach((a) => actionRegistry.register(a));

function makeChar(
  id: string,
  name: string,
  loc: string,
  money: number,
  overrides?: Partial<Character>,
): Character {
  // Create a minimal character cloneable for mutable tests
  const c: Character = {
    id,
    worldId: "w",
    name,
    age: 30,
    gender: "male" as const,
    profession: "farmer" as const,
    personalProfile: { past: "テスト", present: "" },
    origin: "local" as const,
    locationId: loc,
    personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
    vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
    emotion: { mood: 0, stress: 0, social_satiety: 0 },
    abilities: [],
    activeConversationIds: [],
    appearance: 2,
    intelligence: 2,
    health: 2,
    shortMemory: [],
    dailyMemory: [],
    longMemory: [],
    relations: {},
    lastSleepTick: 0,
    money,
    incomeLevel: 0,
    expenseExempt: false,
    impressionBook: {},
    notebook: [],
    shortTermGoal: null,
    longTermGoal: null,
    liked: "",
    disliked: "",
    ...overrides,
  };
  return c;
}

function baseNode(overrides?: Partial<{ id: string; name: string }>): any {
  return {
    id: overrides?.id ?? "n1",
    worldId: "w",
    parentId: null,
    name: overrides?.name ?? "广场",
    description: "一个普通的广场。",
    tags: ["public"],
    capacity: null,
    privacy: "public",
    visibleFromParent: true,
    shortcuts: [],
    isEntry: false,
  };
}

const emptyPerceptions = new Map<string, WorldEvent[]>();

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function mockAccept(result: "accept_speak" | "reject_speak" = "accept_speak"): AcceptDecideFn {
  return async ({ requesterId }) => ({
    type: result,
    targetId: requesterId,
    reasoning: result === "accept_speak" ? "好啊聊聊" : "没兴趣",
    selfImportance: 2,
  });
}

function mockSummary(text = "一段愉快的闲聊"): SummaryDecideFn {
  return async () => ({ summary: text });
}

function mockPersonalMemory(): PersonalMemoryDecideFn {
  return async () => ({ feeling: "还行", impression: "印象一般", topics: ["闲聊"] });
}

function mockSalvage(): SalvageDecideFn {
  return async ({ character }) => ({
    type: "wait" as any,
    actorId: character.id,
    reasoning: "被拒了，等等看",
    selfImportance: 2,
  });
}

/** 简单 turn：每轮都说一句固定的话 */
function mockTurnSimple(selfId: string, line: string): TurnDecideFn {
  return async ({ self }) => ({
    kind: "turn" as const,
    turn: { speakerId: self.id, kind: "say" as const, line },
  });
}

/** 提出 give 的 turn：说一句话 + 发起 give action */
function mockTurnProposeGive(
  selfId: string,
  line: string,
  targetId: string,
  amount: number,
): TurnDecideFn {
  return async ({ self }) => ({
    kind: "turn" as const,
    turn: { speakerId: self.id, kind: "say" as const, line },
    proposeAction: {
      actionType: "give",
      targetId,
      params: { target_id: targetId, amount },
    },
  });
}

/** 接受 give 的 turn：说一句话 + accept */
function mockTurnAcceptGive(
  selfId: string,
  line: string,
): TurnDecideFn {
  return async ({ self }) => ({
    kind: "turn" as const,
    turn: { speakerId: self.id, kind: "say" as const, line },
    respondToAction: { accepted: true, reasoning: "收下好意" },
  });
}

/** 拒绝 give 的 turn：说一句话 + reject */
function mockTurnRejectGive(
  selfId: string,
  line: string,
): TurnDecideFn {
  return async ({ self }) => ({
    kind: "turn" as const,
    turn: { speakerId: self.id, kind: "say" as const, line },
    respondToAction: { accepted: false, reasoning: "不需要" },
  });
}

/** 结束对话 */
function mockEnd(selfId: string, closingLine?: string): TurnDecideFn {
  return async ({ self }) => ({
    kind: "end" as const,
    payload: { reasoning: "聊完了", closingLine },
  });
}

// ---------------------------------------------------------------------------
// Test helper: run a fresh characters copy through runDialogPhase
// ---------------------------------------------------------------------------

async function runDialogPhaseWith(
  chars: Character[],
  rawActions: Action[],
  tick: number,
  opts: {
    acceptDecide?: AcceptDecideFn;
    turnDecide?: TurnDecideFn;
    personalMemoryDecide?: PersonalMemoryDecideFn;
    ongoingConversations?: Conversation[];
  } = {},
) {
  return runDialogPhase({
    rawActions,
    characters: chars,
    nodes: [baseNode()],
    perceptions: emptyPerceptions,
    tick,
    epoch: 0,
    worldName: "测试世界",
    language: "zh",
    acceptDecide: opts.acceptDecide ?? mockAccept("accept_speak"),
    turnDecide: opts.turnDecide ?? mockTurnSimple("a", "嗯"),
    summaryDecide: mockSummary(),
    personalMemoryDecide: opts.personalMemoryDecide ?? mockPersonalMemory(),
    salvageDecide: mockSalvage(),
    ongoingConversations: opts.ongoingConversations ?? [],
  });
}

// ===================================================================
// 10 Test Rounds
// ===================================================================

describe("对话中 give 行为 — 10 轮场景测试", () => {
  // ── Round 1: 正常 give 流程 ──
  it("R1: A 向 B 乞讨 → B 提出 give → A 接受 → 双方钱款正确", async () => {
    const a = makeChar("a", "乞丐甲", "n1", 5);
    const b = makeChar("b", "富翁乙", "n1", 100);

    const rawActions: Action[] = [
      { type: "speak", actorId: "a", targetId: "b", freeText: "行行好吧，给点钱吃饭…", reasoning: "饿得不行", selfImportance: 3 },
      { type: "wait", actorId: "b", reasoning: "等人说话", selfImportance: 1 },
    ];

    let proposed = false;

    const result = await runDialogPhaseWith([a, b], rawActions, 0, {
      acceptDecide: mockAccept("accept_speak"),
      turnDecide: async ({ self, pendingAction }) => {
        if (self.id === "b" && !pendingAction && !proposed) {
          proposed = true;
          return {
            kind: "turn" as const,
            turn: { speakerId: "b", kind: "say" as const, line: "来，这点钱你拿着用。" },
            proposeAction: { actionType: "give", targetId: "a", params: { target_id: "a", amount: 50 } } as DialogueActionProposal,
          };
        }
        if (self.id === "a" && pendingAction) {
          return {
            kind: "turn" as const,
            turn: { speakerId: "a", kind: "say" as const, line: "太感谢了！您真是好人！" },
            respondToAction: { accepted: true, reasoning: "收下恩惠" } as DialogueActionResponse,
          };
        }
        return { kind: "turn" as const, turn: { speakerId: self.id, kind: "say" as const, line: "…" } };
      },
    });

    expect(b.money).toBe(50);
    expect(a.money).toBe(55);

    const conv = result.updatedConversations.find(c => c.status !== "ended" || c.endedBy);
    if (conv) {
      const actionResults = conv.transcript.filter(t => t.kind === "action_result");
      expect(actionResults.length).toBeGreaterThan(0);
      expect(actionResults[0].line).toContain("给了");
    }

    expect(a.shortMemory.some(m => m.content.includes("50"))).toBe(true);
  });

  // ── Round 2: B 主动给钱（非乞讨触发）──
  it("R2: B 发现 A 没钱吃饭 → B 主动给钱 → A 接受", async () => {
    const a = makeChar("a", "穷苦人", "n1", 0);
    const b = makeChar("b", "好心人", "n1", 200);

    // Pre-populate A's shortMemory so give check() passes in normal action menu
    a.shortMemory = [{ id: "m1", tick: 0, importance: 2, content: "缺钱买吃的" }];

    const rawActions: Action[] = [
      { type: "speak", actorId: "a", targetId: "b", freeText: "大哥能借我点钱吗…？", reasoning: "求助", selfImportance: 3 },
      { type: "wait", actorId: "b", reasoning: "等", selfImportance: 1 },
    ];

    const r1 = await runDialogPhaseWith([a, b], rawActions, 0, {
      turnDecide: async ({ self }) => ({
        kind: "turn" as const,
        turn: { speakerId: self.id, kind: "say" as const, line: self.id === "b" ? "那你拿去吧，别客气。" : "真的可以吗…" },
        ...(self.id === "b" ? { proposeAction: { actionType: "give", targetId: "a", params: { target_id: "a", amount: 100 } } as DialogueActionProposal } : {}),
      }),
    });
    const conv = r1.updatedConversations.find(c => c.status !== "ended")!;

    const r2 = await runDialogPhaseWith([a, b], [], 1, {
      turnDecide: async ({ self, pendingAction }) => {
        if (self.id === "a" && pendingAction) {
          return {
            kind: "turn" as const,
            turn: { speakerId: "a", kind: "say" as const, line: "谢谢好心人！" },
            respondToAction: { accepted: true, reasoning: "感恩" } as DialogueActionResponse,
          };
        }
        return { kind: "turn" as const, turn: { speakerId: self.id, kind: "say" as const, line: "嗯" } };
      },
      ongoingConversations: [conv],
    });

    expect(b.money).toBe(100);
    expect(a.money).toBe(100);
  });

  // ── Round 3: A 拒绝 give ──
  it("R3: B 想给钱 → A 拒绝 → 钱未转移", async () => {
    const a = makeChar("a", "自尊心强的人", "n1", 10);
    const b = makeChar("b", "好心人", "n1", 200);

    const rawActions: Action[] = [
      { type: "speak", actorId: "b", targetId: "a", freeText: "你需要钱吗？我给你一些。", reasoning: "关心", selfImportance: 2 },
      { type: "wait", actorId: "a", reasoning: "", selfImportance: 1 },
    ];

    const r1 = await runDialogPhaseWith([a, b], rawActions, 0, {
      turnDecide: async ({ self }) => ({
        kind: "turn" as const,
        turn: { speakerId: self.id, kind: "say" as const, line: self.id === "b" ? "来，给你50。" : "我不需要你的钱。" },
        ...(self.id === "b" ? { proposeAction: { actionType: "give", targetId: "a", params: { target_id: "a", amount: 50 } } as DialogueActionProposal } : {}),
      }),
    });
    const conv = r1.updatedConversations.find(c => c.status !== "ended")!;

    const r2 = await runDialogPhaseWith([a, b], [], 1, {
      turnDecide: async ({ self, pendingAction }) => {
        if (self.id === "a" && pendingAction) {
          return {
            kind: "turn" as const,
            turn: { speakerId: "a", kind: "say" as const, line: "不用了，我自己能行。" },
            respondToAction: { accepted: false, reasoning: "不想欠人情" } as DialogueActionResponse,
          };
        }
        return { kind: "turn" as const, turn: { speakerId: self.id, kind: "say" as const, line: "…" } };
      },
      ongoingConversations: [conv],
    });

    // Money unchanged
    expect(b.money).toBe(200);
    expect(a.money).toBe(10);
  });

  // ── Round 4: 对话结束后 give 仍未被回应 ──
  it("R4: B give → 对话结束前 A 未回应 → 钱未转移", async () => {
    const a = makeChar("a", "普通人", "n1", 10);
    const b = makeChar("b", "有钱人", "n1", 200);

    const rawActions: Action[] = [
      { type: "speak", actorId: "b", targetId: "a", freeText: "给你点钱", reasoning: "帮助", selfImportance: 2 },
      { type: "wait", actorId: "a", reasoning: "", selfImportance: 1 },
    ];

    const r1 = await runDialogPhaseWith([a, b], rawActions, 0, {
      turnDecide: async ({ self }) => {
        if (self.id === "b") {
          return {
            kind: "turn" as const,
            turn: { speakerId: "b", kind: "say" as const, line: "给你50。" },
            proposeAction: { actionType: "give", targetId: "a", params: { target_id: "a", amount: 50 } } as DialogueActionProposal,
          };
        }
        // A ignores the proposal and ends conversation
        return {
          kind: "end" as const,
          payload: { reasoning: "不想聊了", closingLine: "我先走了。" },
        };
      },
      ongoingConversations: [],
    });

    // Money unchanged — proposal never accepted
    expect(b.money).toBe(200);
    expect(a.money).toBe(10);

    // pendingAction should be cleared from conversation
    const conv = r1.updatedConversations.find(c => c.status === "ended");
    expect(conv?.pendingAction).toBeUndefined();
  });

  // ── Round 5: 单 tick 对话中 give（B propose → A accept → 继续聊）──
  it("R5: B propose give → A accept → 对话继续 → 钱款正确转移", async () => {
    const a = makeChar("a", "甲", "n1", 5);
    const b = makeChar("b", "乙", "n1", 100);

    const rawActions: Action[] = [
      { type: "speak", actorId: "a", targetId: "b", freeText: "你好啊，能帮帮我吗？", reasoning: "搭话求助", selfImportance: 2 },
      { type: "wait", actorId: "b", reasoning: "", selfImportance: 1 },
    ];

    let proposed = false;
    let accepted = false;

    const result = await runDialogPhaseWith([a, b], rawActions, 0, {
      acceptDecide: mockAccept("accept_speak"),
      turnDecide: async ({ self, pendingAction }) => {
        if (self.id === "b" && !proposed) {
          proposed = true;
          return {
            kind: "turn" as const,
            turn: { speakerId: "b", kind: "say" as const, line: "我看你好像挺困难，给你点钱。" },
            proposeAction: { actionType: "give", targetId: "a", params: { target_id: "a", amount: 30 } } as DialogueActionProposal,
          };
        }
        if (self.id === "a" && pendingAction) {
          accepted = true;
          return {
            kind: "turn" as const,
            turn: { speakerId: "a", kind: "say" as const, line: "多谢！" },
            respondToAction: { accepted: true, reasoning: "收下" } as DialogueActionResponse,
          };
        }
        return { kind: "turn" as const, turn: { speakerId: self.id, kind: "say" as const, line: self.id === "a" ? "真的非常感谢。" : "不客气。" } };
      },
    });

    expect(b.money).toBe(70);
    expect(a.money).toBe(35);

    const conv = result.updatedConversations.find(c => c.status !== "ended" || c.endedBy);
    expect(conv?.transcript.some(t => t.kind === "action_result")).toBe(true);
  });

  // ── Round 6: 错误 action_type ──
  it("R6: LLM 提出不存在的 action_type → pendingAction 仍设置（校验在 LLM 层）", async () => {
    // 此测试验证：若 LLM 提出不存在的 action_type，
    // 在 decide.ts 的 propose_dialogue_action 解析时会被拒绝并反馈给 LLM。
    // 但若已存入 pendingAction（跳过 LLM 校验的测试场景），
    // 执行时 executeDialogueAction 应安全返回 undefined。
    const a = makeChar("a", "甲", "n1", 10);
    const b = makeChar("b", "乙", "n1", 100);

    const rawActions: Action[] = [
      { type: "speak", actorId: "a", targetId: "b", freeText: "嗨", reasoning: "测试", selfImportance: 1 },
      { type: "wait", actorId: "b", reasoning: "", selfImportance: 1 },
    ];

    // Directly build a conversation with a bogus pendingAction
    const conv: Conversation = {
      id: "conv-bogus",
      worldId: "w",
      initiatorId: "a",
      acceptorId: "b",
      transcript: [{ speakerId: "a", kind: "say", line: "嗨" }],
      tickStarted: 5,
      currentTickRounds: 0,
      status: "active",
      pendingAction: {
        requesterId: "a",
        targetId: "b",
        actionType: "nonexistent_action",
        params: {} as ActionInput,
      },
    };

    const result = await runDialogPhaseWith([a, b], [], 6, {
      turnDecide: async ({ self, pendingAction }) => {
        if (self.id === "b" && pendingAction) {
          return {
            kind: "turn" as const,
            turn: { speakerId: "b", kind: "say" as const, line: "好吧。" },
            respondToAction: { accepted: true, reasoning: "试试" } as DialogueActionResponse,
          };
        }
        return { kind: "turn" as const, turn: { speakerId: self.id, kind: "say" as const, line: "嗯" } };
      },
      ongoingConversations: [conv],
    });

    // No crash, money unchanged
    expect(b.money).toBe(100);
    expect(a.money).toBe(10);
  });

  // ── Round 7: 金额超出余额 ──
  it("R7: B 提出 give 超出自己余额 → execute 应 clamp", async () => {
    const a = makeChar("a", "穷人", "n1", 0);
    const b = makeChar("b", "不是很有钱", "n1", 30);

    const rawActions: Action[] = [
      { type: "speak", actorId: "a", targetId: "b", freeText: "借我100块钱吧", reasoning: "缺钱", selfImportance: 3 },
      { type: "wait", actorId: "b", reasoning: "", selfImportance: 1 },
    ];

    const r1 = await runDialogPhaseWith([a, b], rawActions, 0, {
      turnDecide: async ({ self }) => ({
        kind: "turn" as const,
        turn: { speakerId: self.id, kind: "say" as const, line: self.id === "b" ? "我给你100。" : "真的吗？" },
        ...(self.id === "b" ? {
          proposeAction: {
            actionType: "give",
            targetId: "a",
            params: { target_id: "a", amount: 100 }, // exceeds B's 30
          } as DialogueActionProposal,
        } : {}),
      }),
    });
    const conv = r1.updatedConversations.find(c => c.status !== "ended")!;

    const r2 = await runDialogPhaseWith([a, b], [], 1, {
      turnDecide: async ({ self, pendingAction }) => {
        if (self.id === "a" && pendingAction) {
          return {
            kind: "turn" as const,
            turn: { speakerId: "a", kind: "say" as const, line: "谢谢！" },
            respondToAction: { accepted: true, reasoning: "收下" } as DialogueActionResponse,
          };
        }
        return { kind: "turn" as const, turn: { speakerId: self.id, kind: "say" as const, line: "嗯" } };
      },
      ongoingConversations: [conv],
    });

    // give execute() clamps: Math.min(100, 30) → max 30
    // B: 30 - 30 = 0, A: 0 + 30 = 30
    expect(b.money).toBe(0);
    expect(a.money).toBe(30);
  });

  // ── Round 8: 对话发起人直接 end 未回应 give ──
  it("R8: B propose give → A end conversation with accept → 仍应生效", async () => {
    const a = makeChar("a", "收钱人", "n1", 5);
    const b = makeChar("b", "给钱人", "n1", 80);

    const rawActions: Action[] = [
      { type: "speak", actorId: "a", targetId: "b", freeText: "帮帮我", reasoning: "求助", selfImportance: 3 },
      { type: "wait", actorId: "b", reasoning: "", selfImportance: 1 },
    ];

    const r1 = await runDialogPhaseWith([a, b], rawActions, 0, {
      turnDecide: async ({ self }) => ({
        kind: "turn" as const,
        turn: { speakerId: self.id, kind: "say" as const, line: self.id === "b" ? "给你20。" : "……" },
        ...(self.id === "b" ? { proposeAction: { actionType: "give", targetId: "a", params: { target_id: "a", amount: 20 } } as DialogueActionProposal } : {}),
      }),
    });
    const conv = r1.updatedConversations.find(c => c.status !== "ended")!;

    // A ends conversation but accepts the give in the same turn
    const r2 = await runDialogPhaseWith([a, b], [], 1, {
      turnDecide: async ({ self, pendingAction }) => {
        if (self.id === "a" && pendingAction) {
          return {
            kind: "end" as const,
            payload: { reasoning: "收到钱就走了", closingLine: "谢了，我走了。" },
            respondToAction: { accepted: true, reasoning: "感恩收下" } as DialogueActionResponse,
          };
        }
        return { kind: "turn" as const, turn: { speakerId: self.id, kind: "say" as const, line: "嗯" } };
      },
      ongoingConversations: [conv],
    });

    expect(b.money).toBe(60);
    expect(a.money).toBe(25);
  });

  // ── Round 9: 角色讲话但不理会 pendingAction ──
  it("R9: B propose give → A 只说话不回应 → pending 仍保留至下一轮或对话结束", async () => {
    const a = makeChar("a", "犹豫的人", "n1", 5);
    const b = makeChar("b", "给钱人", "n1", 80);

    const rawActions: Action[] = [
      { type: "speak", actorId: "a", targetId: "b", freeText: "我该怎么办…", reasoning: "求助", selfImportance: 2 },
      { type: "wait", actorId: "b", reasoning: "", selfImportance: 1 },
    ];

    const r1 = await runDialogPhaseWith([a, b], rawActions, 0, {
      turnDecide: async ({ self }) => ({
        kind: "turn" as const,
        turn: { speakerId: self.id, kind: "say" as const, line: self.id === "b" ? "给你30。" : "我不知道……" },
        ...(self.id === "b" ? { proposeAction: { actionType: "give", targetId: "a", params: { target_id: "a", amount: 30 } } as DialogueActionProposal } : {}),
      }),
    });
    let conv = r1.updatedConversations.find(c => c.status !== "ended")!;

    // A ignores pendingAction — just talks
    const r2 = await runDialogPhaseWith([a, b], [], 1, {
      turnDecide: async ({ self }) => ({
        kind: "turn" as const,
        turn: { speakerId: self.id, kind: "say" as const, line: self.id === "a" ? "我还是不知道要不要收……" : "你拿着就是了。" },
      }),
      ongoingConversations: [conv],
    });
    conv = r2.updatedConversations.find(c => c.status !== "ended") ?? conv;

    // pendingAction should still be there since A didn't respond
    expect(conv.pendingAction).toBeDefined();
    expect(conv.pendingAction?.actionType).toBe("give");
    // Money unchanged
    expect(b.money).toBe(80);
    expect(a.money).toBe(5);
  });

  // ── Round 10: 对话中来回多次 give ──
  it("R10: 对话中 B give → A accept → A 又回礼 give → B accept", async () => {
    const a = makeChar("a", "互赠甲方", "n1", 50);
    const b = makeChar("b", "互赠乙方", "n1", 200);

    const rawActions: Action[] = [
      { type: "speak", actorId: "a", targetId: "b", freeText: "能帮我一下吗？", reasoning: "求助", selfImportance: 3 },
      { type: "wait", actorId: "b", reasoning: "", selfImportance: 1 },
    ];

    // Tick 1: B proposes give, A accepts
    const r1 = await runDialogPhaseWith([a, b], rawActions, 0, {
      turnDecide: async ({ self }) => ({
        kind: "turn" as const,
        turn: { speakerId: self.id, kind: "say" as const, line: self.id === "b" ? "给你50。" : "谢谢！" },
        ...(self.id === "b" ? { proposeAction: { actionType: "give", targetId: "a", params: { target_id: "a", amount: 50 } } as DialogueActionProposal } : {}),
      }),
    });
    let conv = r1.updatedConversations.find(c => c.status !== "ended")!;

    // Tick 2: A accepts + A also proposes give back
    const r2 = await runDialogPhaseWith([a, b], [], 1, {
      turnDecide: async ({ self, pendingAction }) => {
        if (self.id === "a" && pendingAction) {
          return {
            kind: "turn" as const,
            turn: { speakerId: "a", kind: "say" as const, line: "我不能白拿你的，这20给你。" },
            respondToAction: { accepted: true, reasoning: "收下帮助" } as DialogueActionResponse,
            proposeAction: { actionType: "give", targetId: "b", params: { target_id: "b", amount: 20 } } as DialogueActionProposal,
          };
        }
        if (self.id === "b" && pendingAction) {
          return {
            kind: "turn" as const,
            turn: { speakerId: "b", kind: "say" as const, line: "你太客气了。" },
            respondToAction: { accepted: true, reasoning: "收下回礼" } as DialogueActionResponse,
          };
        }
        return { kind: "turn" as const, turn: { speakerId: self.id, kind: "say" as const, line: "嗯" } };
      },
      ongoingConversations: [conv],
    });

    // First give: B→A 50: B=150, A=100
    // Second give: A→B 20: A=80, B=170
    expect(b.money).toBe(170);
    expect(a.money).toBe(80);
  });
});
