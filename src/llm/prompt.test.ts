/**
 * prompt.ts v0.2 单测：覆盖
 *  - qualifyVital 6 档定性 + urgency
 *  - timeOfDay 时段标签 + isSleepHour
 *  - buildSystemPrompt 含昼夜节律 / 生理优先级 / 反循环关键字
 *  - buildUserPrompt 关键段渲染（连续行为 / 紧迫提醒 / 时间）
 */
import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  buildUserPrompt,
  qualifyVital,
  timeOfDay,
} from "./prompt";
import type { AggregatedFacts } from "@/engine/facts";
import type { Character, MapNode } from "@/domain/types";

const baseCharacter: Character = {
  id: "char-x",
  worldId: "w",
  name: "测试角色",
  locationId: "node-here",
  personality: {
    extraversion: 50,
    rationality: 0,
    ambition: 0,
    altruism: 0,
    curiosity: 0,
    aggression: 0,
    honesty: 0,
    stability: 0,
  },
  vitals: { hunger: 0, fatigue: 0 },
  statuses: [],
  abilities: [],
  shortMemory: [],
  longMemory: [],
  relations: {},
};

const restaurant: MapNode = {
  id: "node-here",
  worldId: "w",
  parentId: null,
  name: "老王饭馆",
  description: "",
  tags: ["public", "indoor", "dining"],
  capacity: 20,
  privacy: "public",
  visibleFromParent: true,
  shortcuts: [],
  isEntry: false,
};

const emptyFacts: AggregatedFacts = {
  homeNodeId: null,
  homeNodeName: null,
  hoursAtCurrentLocation: 0,
  todayActionCounts: {},
};

describe("qualifyVital", () => {
  it("hunger 6 档", () => {
    expect(qualifyVital(0, "hunger").urgency).toBe("none");
    expect(qualifyVital(3, "hunger").urgency).toBe("mild");
    expect(qualifyVital(8, "hunger").urgency).toBe("moderate");
    expect(qualifyVital(12, "hunger").urgency).toBe("high");
    expect(qualifyVital(20, "hunger").urgency).toBe("critical");
    expect(qualifyVital(30, "hunger").urgency).toBe("fatal");
  });

  it("fatigue 6 档", () => {
    expect(qualifyVital(0, "fatigue").urgency).toBe("none");
    expect(qualifyVital(3, "fatigue").urgency).toBe("mild");
    expect(qualifyVital(8, "fatigue").urgency).toBe("moderate");
    expect(qualifyVital(12, "fatigue").urgency).toBe("high");
    expect(qualifyVital(20, "fatigue").urgency).toBe("critical");
    expect(qualifyVital(30, "fatigue").urgency).toBe("fatal");
  });

  it("phrase 含具体小时数与定性词", () => {
    expect(qualifyVital(20, "fatigue").phrase).toMatch(/极度疲惫.*20/);
    expect(qualifyVital(8, "hunger").phrase).toMatch(/明显饥饿.*8/);
  });
});

describe("timeOfDay", () => {
  it.each([
    [0, 0, "深夜", true],
    [5, 5, "凌晨", true],
    [8, 8, "早晨", false],
    [13, 13, "中午", false],
    [19, 19, "傍晚", false],
    [22, 22, "夜晚", true],
    [23, 23, "夜晚", true],
    // 跨日
    [25, 1, "深夜", true],
    [48, 0, "深夜", true],
  ])("tick %i → hour %i, period %s, sleepHour %s", (tick, hour, period, sleep) => {
    const t = timeOfDay(tick);
    expect(t.hour).toBe(hour);
    expect(t.period).toBe(period);
    expect(t.isSleepHour).toBe(sleep);
  });

  it("tick=48 算第 2 日 0:00", () => {
    const t = timeOfDay(48);
    expect(t.day).toBe(2);
    expect(t.hour).toBe(0);
  });
});

describe("buildSystemPrompt", () => {
  it("包含昼夜节律 / 生理优先级 / 反循环关键字", () => {
    const sys = buildSystemPrompt({
      character: baseCharacter,
      worldName: "测试世界",
    });
    expect(sys).toContain("昼夜节律");
    expect(sys).toContain("生理优先级");
    expect(sys).toContain("反循环");
    expect(sys).toContain("性格维度");
  });
});

describe("buildUserPrompt", () => {
  it("渲染时间 + 时段 + 作息引导", () => {
    const out = buildUserPrompt({
      character: baseCharacter,
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: { ...emptyFacts, homeNodeId: "node-home", homeNodeName: "我的家" },
    });
    expect(out).toContain("第 0 日 05:00");
    expect(out).toContain("凌晨");
    expect(out).toContain("绝大多数人此时应在睡觉");
    expect(out).toContain("22:00–06:00 在 我的家 休息");
  });

  it("fatigue 高 + 不在 residence → 触发 ⚠ 紧迫提醒", () => {
    const out = buildUserPrompt({
      character: { ...baseCharacter, vitals: { hunger: 0, fatigue: 20 } },
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: { ...emptyFacts, homeNodeId: "node-home", homeNodeName: "我的家" },
    });
    expect(out).toContain("⚠");
    expect(out).toContain("应优先 move 回 我的家");
  });

  it("fatigue 高 + 在 residence → 不触发 ⚠", () => {
    const home: MapNode = {
      ...restaurant,
      id: "node-home",
      name: "我的家",
      tags: ["private", "indoor", "residence"],
      privacy: "private",
    };
    const out = buildUserPrompt({
      character: { ...baseCharacter, vitals: { hunger: 0, fatigue: 20 } },
      here: home,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: { ...emptyFacts, homeNodeId: "node-home", homeNodeName: "我的家" },
    });
    expect(out).not.toContain("⚠");
  });

  it("连续行为段含 hours / lastAction / today counts", () => {
    const out = buildUserPrompt({
      character: baseCharacter,
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 12,
      facts: {
        homeNodeId: null,
        homeNodeName: null,
        hoursAtCurrentLocation: 14,
        lastAction: {
          type: "speak",
          freeText: "你好啊",
          tick: 11,
          success: true,
        },
        lastRestTick: 0,
        lastEatTick: 5,
        todayActionCounts: { speak: 9, observe: 2, wait: 1 },
      },
    });
    expect(out).toContain("已在 老王饭馆 连续 14 小时");
    expect(out).toContain("上一 tick 你的行动：说话");
    expect(out).toContain("你好啊");
    expect(out).toContain("距上次 rest：12 小时");
    expect(out).toContain("距上次 eat：7 小时");
    expect(out).toContain("说话 ×9");
  });

  it("vitals 段使用 qualifyVital 而非裸数字", () => {
    const out = buildUserPrompt({
      character: { ...baseCharacter, vitals: { hunger: 0, fatigue: 20 } },
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: emptyFacts,
    });
    expect(out).toContain("极度疲惫");
    expect(out).not.toContain("疲惫值：20");
  });
});
