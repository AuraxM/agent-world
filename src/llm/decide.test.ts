/**
 * decide.ts 单元测试：mock OpenAI client + getActiveProvider，验证四条路径
 *  1) 正常 tool_call → 转 Action
 *  2) tool_call.arguments 不符合 ActionSchema → wait fallback
 *  3) API 抛错 → wait fallback，reasoning 含错误信息
 *  4) 无 active provider → 立即 wait fallback
 */
import OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __setLLMClientForTest } from "./client";
import { llmDecide } from "./decide";
import * as providers from "./providers";
import { actionTypeFromToolName } from "@/domain/schemas";
import { actionRegistry } from "@/domain/action-system";
import { BUILTIN_ACTIONS } from "@/engine/actions-builtin";
import type { DecideInput } from "@/engine/tick";
import type { ActionContext } from "@/domain/action-system";

vi.mock("./providers", () => ({
  getActiveProvider: vi.fn(),
}));

const FAKE_PROVIDER: providers.LLMProvider = {
  id: "test-provider",
  name: "test",
  baseUrl: "https://api.example.com",
  apiKey: "test-key",
  model: "test-model",
  isActive: true,
  createdAt: 0,
};

/**
 * Build a fake ChatCompletion with a multi-tool response.
 * `toolName` should be the action_* tool name (e.g. "action_think").
 */
function makeFakeCompletion(toolName: string, toolArgs: unknown): ChatCompletion {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 0,
    model: "test-model",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: null,
          refusal: null,
          tool_calls: [
            {
              id: "call_test",
              type: "function",
              function: {
                name: toolName,
                arguments: JSON.stringify(toolArgs),
              },
            },
          ],
        },
        finish_reason: "tool_calls",
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    },
  } as unknown as ChatCompletion;
}

function makeFakeClient(
  create: (params: unknown) => Promise<ChatCompletion>,
): OpenAI {
  return {
    chat: { completions: { create } },
  } as unknown as OpenAI;
}

const baseCtx: ActionContext = {
  worldId: "w",
  tick: 0,
  self: {
    id: "char-test",
    worldId: "w",
    name: "测试角色",
    age: 30,
    gender: "male" as const,
    profession: "farmer" as const,
    biography: "テスト",
    origin: "local" as const,
    locationId: "node-x",
    personality: { ei: -2, sn: 0, tf: 0, jp: 0 },
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
  },
  here: {
    id: "node-x",
    worldId: "w",
    parentId: null,
    name: "测试地",
    description: "",
    tags: ["public"],
    capacity: null,
    privacy: "public",
    visibleFromParent: true,
    shortcuts: [],
    isEntry: true,
  },
  companions: [],
  reachable: [],
  isSleepHour: false,
  facts: {
    activityNodeId: null,
    activityNodeName: null,
    restNodeId: null,
    restNodeName: null,
    hoursAtCurrentLocation: 0,
    todayActionCounts: {},
  },
};

const baseInput = (): DecideInput => ({
  character: baseCtx.self,
  nodes: [baseCtx.here],
  here: baseCtx.here,
  companions: [],
  reachable: [],
  perceived: [],
  options: [{ type: "wait", hint: "等" }],
  worldName: "测试世界",
  tick: 0,
  facts: baseCtx.facts,
  language: "zh",
  ctx: baseCtx,
});

describe("llmDecide (OpenAI-compatible function calling)", () => {
  beforeEach(() => {
    actionRegistry.registerAll(BUILTIN_ACTIONS);
    vi.mocked(providers.getActiveProvider).mockReturnValue(FAKE_PROVIDER);
  });
  afterEach(() => {
    __setLLMClientForTest(undefined);
    vi.mocked(providers.getActiveProvider).mockReset();
  });

  it("正常 tool_call 转换为 Action", async () => {
    const fake = makeFakeClient(async () =>
      makeFakeCompletion("action_think", {
        reasoning: "我偏内向，倾向先沉思再行动。",
        self_importance: 2,
      }),
    );
    __setLLMClientForTest(fake);

    const action = await llmDecide(baseInput());
    expect(action.type).toBe("think");
    expect(action.actorId).toBe("char-test");
    expect(action.reasoning).toContain("内向");
    expect(action.selfImportance).toBe(2);
  });

  it("speak tool_call 携带 target_id", async () => {
    const fake = makeFakeClient(async () =>
      makeFakeCompletion("action_speak", {
        target_id: "char-other",
        reasoning: "我有计划性，决定和对方谈谈。",
        self_importance: 3,
      }),
    );
    __setLLMClientForTest(fake);

    const action = await llmDecide(baseInput());
    expect(action.type).toBe("speak");
    expect(action.targetId).toBe("char-other");
    expect(action.selfImportance).toBe(3);
  });

  it("tool_call 参数不符合 schema → wait fallback", async () => {
    const fake = makeFakeClient(async () =>
      makeFakeCompletion("action_think", {
        reasoning: "x",
        self_importance: 99, // invalid: not in 1-5
      }),
    );
    __setLLMClientForTest(fake);

    const action = await llmDecide(baseInput());
    expect(action.type).toBe("wait");
    expect(action.reasoning).toMatch(/LLM 调用失败/);
  });

  it("API 抛错 → wait fallback，reasoning 含错误信息", async () => {
    const fake = makeFakeClient(async () => {
      throw new Error("network kaput");
    });
    __setLLMClientForTest(fake);

    const action = await llmDecide(baseInput());
    expect(action.type).toBe("wait");
    expect(action.reasoning).toContain("network kaput");
  });

  it("无 active provider → 立即 wait fallback", async () => {
    vi.mocked(providers.getActiveProvider).mockReturnValue(undefined);
    const action = await llmDecide(baseInput());
    expect(action.type).toBe("wait");
    expect(action.reasoning).toContain("没有激活的 LLM provider");
  });
});
