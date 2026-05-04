/**
 * facts.ts 单测：纯函数，不需要 DB。
 */
import { describe, expect, it } from "vitest";
import { deriveAggregatedFacts } from "./facts";
import type {
  Action,
  AgentThought,
  Character,
  MapNode,
} from "@/domain/types";

function mkAction(type: Action["type"], extras: Partial<Action> = {}): Action {
  return {
    type,
    actorId: "char-x",
    reasoning: "r",
    selfImportance: 1,
    ...extras,
  };
}

function mkThought(
  tick: number,
  action: Action,
  success = true,
): AgentThought {
  return {
    worldId: "w",
    characterId: "char-x",
    tick,
    action,
    success,
    createdAt: 0,
  };
}

const baseCharacter: Character = {
  id: "char-x",
  worldId: "w",
  name: "测试角色",
  age: 25,
  gender: "other",
  profession: "student",
  biography: "一个测试角色。",
  origin: "local" as const,
  locationId: "node-here",
  personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
  vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
  emotion: { mood: 0, stress: 0, social_satiety: 0 },
  abilities: [],
  appearance: 2,
  intelligence: 2,
  health: 2,
  shortMemory: [],
  dailyMemory: [],
  longMemory: [],
  relations: {},
  lastSleepTick: 0,
  activityNodeId: null,
  restNodeId: null,
  money: 100,
  incomeLevel: 0,
  expenseExempt: false,
  activeConversationIds: [],
  impressionBook: {},
  shortTermGoal: null,
  longTermGoal: null,
  liked: "",
  disliked: "",
};

const baseNodes: MapNode[] = [
  {
    id: "node-here",
    worldId: "w",
    parentId: null,
    name: "此处",
    description: "",
    tags: ["public"],
    capacity: null,
    privacy: "public",
    visibleFromParent: true,
    shortcuts: [],
    isEntry: true,
  },
  {
    id: "node-home",
    worldId: "w",
    parentId: null,
    name: "我的家",
    description: "",
    tags: ["residence", "private"],
    capacity: 4,
    privacy: "private",
    visibleFromParent: false,
    shortcuts: [],
    isEntry: false,
  },
];

describe("deriveAggregatedFacts", () => {
  it("空历史：hours = floor(currentTick/5)；其它 undefined；counts 空", () => {
    const facts = deriveAggregatedFacts({
      character: baseCharacter,
      nodes: baseNodes,
      currentTick: 40,
      recentThoughts: [],
      activityNodeId: "node-home",
      restNodeId: "node-home",
    });

    expect(facts.hoursAtCurrentLocation).toBe(8); // 40 ticks / 5 = 8 game hours
    expect(facts.lastAction).toBeUndefined();
    expect(facts.lastRestTick).toBeUndefined();
    expect(facts.lastEatTick).toBeUndefined();
    expect(facts.todayActionCounts).toEqual({});
    expect(facts.activityNodeId).toBe("node-home");
    expect(facts.activityNodeName).toBe("我的家");
    expect(facts.restNodeId).toBe("node-home");
    expect(facts.restNodeName).toBe("我的家");
  });

  it("最近 move 决定 hoursAtCurrentLocation", () => {
    const thoughts: AgentThought[] = [
      mkThought(10, mkAction("speak")), // 最近
      mkThought(9, mkAction("speak")),
      mkThought(8, mkAction("move", { targetNodeId: "node-here" })),
      mkThought(7, mkAction("eat")),
      mkThought(6, mkAction("move", { targetNodeId: "node-other" })),
    ];

    const facts = deriveAggregatedFacts({
      character: baseCharacter,
      nodes: baseNodes,
      currentTick: 24,
      recentThoughts: thoughts,
      activityNodeId: null,
      restNodeId: null,
    });

    // 最近一次成功 move 是 tick=8 → hours = (24 - 8) / 5 = 3
    expect(facts.hoursAtCurrentLocation).toBe(3); // (24-8)/5 = 3 game hours
    expect(facts.lastEatTick).toBe(7);
  });

  it("失败的 move 不计入 hoursAtCurrentLocation", () => {
    const thoughts: AgentThought[] = [
      mkThought(10, mkAction("move", { targetNodeId: "x" }), false), // 失败
      mkThought(8, mkAction("move", { targetNodeId: "y" }), true),
    ];
    const facts = deriveAggregatedFacts({
      character: baseCharacter,
      nodes: baseNodes,
      currentTick: 24,
      recentThoughts: thoughts,
      activityNodeId: null,
      restNodeId: null,
    });
    expect(facts.hoursAtCurrentLocation).toBe(3); // (24-8)/5 = 3 game hours
  });

  it("lastRestTick 取最近一次成功 rest", () => {
    const thoughts: AgentThought[] = [
      mkThought(10, mkAction("speak")),
      mkThought(9, mkAction("rest"), false),
      mkThought(8, mkAction("rest"), true),
      mkThought(7, mkAction("rest"), true),
    ];
    const facts = deriveAggregatedFacts({
      character: baseCharacter,
      nodes: baseNodes,
      currentTick: 11,
      recentThoughts: thoughts,
      activityNodeId: null,
      restNodeId: null,
    });
    expect(facts.lastRestTick).toBe(8);
  });

  it("todayActionCounts 只统计最近 120 tick (= 24 游戏小时)", () => {
    // currentTick = 126，window = [6, 126)
    const thoughts: AgentThought[] = [
      mkThought(29, mkAction("speak")),
      mkThought(28, mkAction("speak")),
      mkThought(27, mkAction("observe")),
      mkThought(10, mkAction("speak")),
      mkThought(5, mkAction("speak")), // 应被排除（< 6）
    ];
    const facts = deriveAggregatedFacts({
      character: baseCharacter,
      nodes: baseNodes,
      currentTick: 126,
      recentThoughts: thoughts,
      activityNodeId: null,
      restNodeId: null,
    });
    expect(facts.todayActionCounts.speak).toBe(3);
    expect(facts.todayActionCounts.observe).toBe(1);
  });

  it("character.lastThought 优先于 recentThoughts[0] 作为 lastAction", () => {
    const stale = mkThought(5, mkAction("wait"));
    const fresh: AgentThought = mkThought(
      10,
      mkAction("speak", { freeText: "你好" }),
    );

    const facts = deriveAggregatedFacts({
      character: { ...baseCharacter, lastThought: fresh },
      nodes: baseNodes,
      currentTick: 11,
      recentThoughts: [stale],
      activityNodeId: null,
      restNodeId: null,
    });
    expect(facts.lastAction).toEqual({
      type: "speak",
      freeText: "你好",
      tick: 10,
      success: true,
    });
  });

  it("activityNodeId/restNodeId 找不到节点时 activityNodeName/restNodeName 为 null", () => {
    const facts = deriveAggregatedFacts({
      character: baseCharacter,
      nodes: baseNodes,
      currentTick: 0,
      recentThoughts: [],
      activityNodeId: "node-ghost",
      restNodeId: "node-ghost",
    });
    expect(facts.activityNodeId).toBe("node-ghost");
    expect(facts.activityNodeName).toBeNull();
    expect(facts.restNodeId).toBe("node-ghost");
    expect(facts.restNodeName).toBeNull();
  });
});
