import { describe, expect, it, vi, beforeEach } from "vitest";
import { compressSleepMemories, __setTestMemoryCompress } from "@agw/llm";
import type { Character } from "@/domain/types";
import { DEFAULT_EPOCH_MS } from "@/app/_lib/format";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-test",
    worldId: "w",
    name: "测试角色",
    age: 25,
    gender: "male",
    profession: "merchant",
    personalProfile: { past: "测试。", present: "" },
    origin: "local",
    locationId: "node-home",
    personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
    vitals: { hunger: 0, fatigue: 5, hygiene: 0 },
    emotion: { mood: 0, stress: 0, social_satiety: 0 },
    abilities: [],
    appearance: 2,
    intelligence: 2,
    health: 2,
    shortMemory: [],
    dailyMemory: [],
    longMemory: [],
    relations: {},
    money: 100,
    incomeLevel: 0,
    expenseExempt: false,
    lastSleepTick: 0,
    activeConversationIds: [],
    impressionBook: {},
    notebook: [],
    shortTermGoal: null,
    longTermGoal: null,
    liked: "",
    disliked: "",
    ...overrides,
  };
}

describe("compressSleepMemories", () => {
  let mockSummarize: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSummarize = vi.fn();
    __setTestMemoryCompress(mockSummarize);
  });

  it("compresses shortMemory into dailyMemory and clears shortMemory", async () => {
    mockSummarize.mockResolvedValue("今天在酒馆工作，和田中聊了天。");

    const c = makeCharacter({
      shortMemory: [
        { id: "m1", tick: 10, importance: 2, content: "我在酒馆工作。" },
        { id: "m2", tick: 15, importance: 3, content: "我和田中聊了天。" },
      ],
      lastSleepTick: 0,
    });

    await compressSleepMemories(c, 120, DEFAULT_EPOCH_MS, "zh");

    expect(c.shortMemory).toEqual([]);
    expect(c.dailyMemory).toHaveLength(1);
    expect(c.dailyMemory[0].content).toBe("今天在酒馆工作，和田中聊了天。");
    expect(c.dailyMemory[0].importance).toBe(3);
    expect(c.lastSleepTick).toBe(120);
    expect(mockSummarize).toHaveBeenCalledTimes(1);
  });

  it("compresses 7 daily memories into one weekly memory", async () => {
    mockSummarize
      .mockResolvedValueOnce("今天在酒馆工作。")
      .mockResolvedValueOnce("这一周主要在酒馆工作，认识了田中。");

    const c = makeCharacter({
      shortMemory: [
        { id: "m1", tick: 110, importance: 2, content: "我在酒馆工作。" },
      ],
      dailyMemory: [
        { id: "d1", tick: 120, importance: 3, content: "第1天。" },
        { id: "d2", tick: 240, importance: 3, content: "第2天。" },
        { id: "d3", tick: 360, importance: 3, content: "第3天。" },
        { id: "d4", tick: 480, importance: 3, content: "第4天。" },
        { id: "d5", tick: 600, importance: 3, content: "第5天。" },
        { id: "d6", tick: 720, importance: 3, content: "第6天。" },
        { id: "d7", tick: 840, importance: 3, content: "第7天起源。" },
      ],
      lastSleepTick: 100,
    });

    await compressSleepMemories(c, 960, DEFAULT_EPOCH_MS, "zh");

    expect(c.shortMemory).toEqual([]);
    expect(c.dailyMemory).toHaveLength(1); // 7 old compressed + 1 new = 1 total (7 removed, 1 added)
    expect(c.longMemory).toHaveLength(1);
    expect(c.longMemory[0].content).toBe("这一周主要在酒馆工作，认识了田中。");
    expect(mockSummarize).toHaveBeenCalledTimes(2);
  });

  it("skips compression when shortMemory has no real memories (only heuristic)", async () => {
    const c = makeCharacter({
      shortMemory: [
        { id: "m1", tick: 10, importance: 1, content: "[heuristic] 角色没有特别想做的事。" },
      ],
      lastSleepTick: 0,
    });

    await compressSleepMemories(c, 120, DEFAULT_EPOCH_MS, "zh");

    expect(c.shortMemory).toEqual([]);
    expect(c.dailyMemory).toHaveLength(0);
    expect(mockSummarize).not.toHaveBeenCalled();
    expect(c.lastSleepTick).toBe(120);
  });

  it("filters heuristic pseudo-memories from compression but includes real ones", async () => {
    mockSummarize.mockResolvedValue("今天在酒馆工作。");

    const c = makeCharacter({
      shortMemory: [
        { id: "m1", tick: 10, importance: 1, content: "[heuristic] 角色没有特别想做的事。" },
        { id: "m2", tick: 15, importance: 2, content: "我在酒馆工作。" },
      ],
      lastSleepTick: 0,
    });

    await compressSleepMemories(c, 120, DEFAULT_EPOCH_MS, "zh");

    expect(mockSummarize).toHaveBeenCalledTimes(1);
    const promptArg = mockSummarize.mock.calls[0][0].prompt;
    expect(promptArg).not.toContain("[heuristic]");
    expect(promptArg).toContain("我在酒馆工作");
  });

  it("keeps shortMemory intact when LLM call fails", async () => {
    mockSummarize.mockRejectedValue(new Error("Network error"));

    const originalMemories = [
      { id: "m1", tick: 10, importance: 2, content: "我在酒馆工作。" },
    ];
    const c = makeCharacter({
      shortMemory: [...originalMemories],
      lastSleepTick: 0,
    });

    await compressSleepMemories(c, 120, DEFAULT_EPOCH_MS, "zh");

    expect(c.shortMemory).toEqual(originalMemories);
    expect(c.dailyMemory).toHaveLength(0);
    expect(c.lastSleepTick).toBe(0);
  });

  it("only compresses memories since lastSleepTick", async () => {
    mockSummarize.mockResolvedValue("今天散了步。");

    const c = makeCharacter({
      shortMemory: [
        { id: "m1", tick: 5, importance: 2, content: "我在酒馆吃饭。" },
        { id: "m2", tick: 110, importance: 2, content: "我在广场散步。" },
        { id: "m3", tick: 115, importance: 2, content: "我和邻居聊了天。" },
      ],
      lastSleepTick: 100,
    });

    await compressSleepMemories(c, 120, DEFAULT_EPOCH_MS, "zh");

    expect(mockSummarize).toHaveBeenCalledTimes(1);
    const promptArg = mockSummarize.mock.calls[0][0].prompt;
    expect(promptArg).not.toContain("我在酒馆吃饭");
    expect(promptArg).toContain("我在广场散步");
    expect(promptArg).toContain("我和邻居聊了天");
  });
});
