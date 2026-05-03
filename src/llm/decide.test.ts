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
import { ACTION_TOOL_NAME } from "@/domain/schemas";
import type { DecideInput } from "@/engine/tick";

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

function makeFakeCompletion(toolArgs: unknown): ChatCompletion {
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
                name: ACTION_TOOL_NAME,
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

const baseInput = (): DecideInput => ({
  character: {
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
    longMemory: [],
    relations: {},
  },
  nodes: [
    {
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
  ],
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
  perceived: [],
  options: [{ type: "wait", hint: "等" }],
  worldName: "测试世界",
  tick: 0,
  facts: {
    activityNodeId: null,
    activityNodeName: null,
    restNodeId: null,
    restNodeName: null,
    hoursAtCurrentLocation: 0,
    todayActionCounts: {},
  },
  language: "zh",
});

describe("llmDecide (OpenAI-compatible function calling)", () => {
  beforeEach(() => {
    vi.mocked(providers.getActiveProvider).mockReturnValue(FAKE_PROVIDER);
  });
  afterEach(() => {
    __setLLMClientForTest(undefined);
    vi.mocked(providers.getActiveProvider).mockReset();
  });

  it("正常 tool_call 转换为 Action", async () => {
    const fake = makeFakeClient(async () =>
      makeFakeCompletion({
        action_type: "observe",
        reasoning: "我偏内向，倾向先观察再行动。",
        self_importance: 2,
      }),
    );
    __setLLMClientForTest(fake);

    const action = await llmDecide(baseInput());
    expect(action.type).toBe("observe");
    expect(action.actorId).toBe("char-test");
    expect(action.reasoning).toContain("内向");
    expect(action.selfImportance).toBe(2);
  });

  it("update_relation tool_call 携带 change_type", async () => {
    const fake = makeFakeClient(async () =>
      makeFakeCompletion({
        action_type: "update_relation",
        target_id: "char-other",
        reasoning: "我有计划性，决定明确这段关系。",
        self_importance: 3,
        change_type: "become_partner",
      }),
    );
    __setLLMClientForTest(fake);

    const action = await llmDecide(baseInput());
    expect(action.type).toBe("update_relation");
    expect(action.targetId).toBe("char-other");
    expect(action.changeType).toBe("become_partner");
  });

  it("tool_call 参数不符合 ActionSchema → wait fallback", async () => {
    const fake = makeFakeClient(async () =>
      makeFakeCompletion({
        action_type: "INVALID_TYPE",
        reasoning: "x",
        self_importance: 99,
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
