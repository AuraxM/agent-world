/**
 * prompt.ts v2 单测：覆盖
 *  - qualifyVital 5 档定性 + urgency（新 0..16 范围）
 *  - timeOfDay 时段标签 + isSleepHour
 *  - buildSystemPrompt 含 MBTI 文字描述 / 昼夜节律 / 生理优先级 / 反循环 / 移动机制 关键字
 *  - buildUserPrompt 关键段渲染（连续行为 / 紧迫提醒 / 时间 / 情绪 / 卫生）
 */
import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  buildUserPrompt,
  describeEmotion,
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
  personality: { ei: 2, sn: 0, tf: 0, jp: 0 },
  vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
  emotion: { mood: 0, stress: 0, social_satiety: 0 },
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
  it("hunger 5 档", () => {
    expect(qualifyVital(0, "hunger").urgency).toBe("none");
    expect(qualifyVital(3, "hunger").urgency).toBe("mild");
    expect(qualifyVital(8, "hunger").urgency).toBe("moderate");
    expect(qualifyVital(12, "hunger").urgency).toBe("high");
    expect(qualifyVital(16, "hunger").urgency).toBe("critical");
  });

  it("fatigue 5 档", () => {
    expect(qualifyVital(0, "fatigue").urgency).toBe("none");
    expect(qualifyVital(3, "fatigue").urgency).toBe("mild");
    expect(qualifyVital(8, "fatigue").urgency).toBe("moderate");
    expect(qualifyVital(12, "fatigue").urgency).toBe("high");
    expect(qualifyVital(16, "fatigue").urgency).toBe("critical");
  });

  it("hygiene 5 档", () => {
    expect(qualifyVital(0, "hygiene").urgency).toBe("none");
    expect(qualifyVital(3, "hygiene").urgency).toBe("mild");
    expect(qualifyVital(8, "hygiene").urgency).toBe("moderate");
    expect(qualifyVital(12, "hygiene").urgency).toBe("high");
    expect(qualifyVital(16, "hygiene").urgency).toBe("critical");
  });

  it("phrase 含具体小时数与定性词", () => {
    expect(qualifyVital(15, "fatigue").phrase).toMatch(/极度疲惫.*15/);
    expect(qualifyVital(8, "hunger").phrase).toMatch(/明显饥饿.*8/);
    expect(qualifyVital(15, "hygiene").phrase).toMatch(/极其肮脏.*15/);
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
    [25, 1, "深夜", true],
    [48, 0, "深夜", true],
  ])(
    "tick %i → hour %i, period %s, sleepHour %s",
    (tick, hour, period, sleep) => {
      const t = timeOfDay(tick);
      expect(t.hour).toBe(hour);
      expect(t.period).toBe(period);
      expect(t.isSleepHour).toBe(sleep);
    },
  );

  it("tick=48 算第 2 日 0:00", () => {
    const t = timeOfDay(48);
    expect(t.day).toBe(2);
    expect(t.hour).toBe(0);
  });
});

describe("describeEmotion", () => {
  it("0 值映射到平静/放松/社交适中", () => {
    const lines = describeEmotion({
      mood: 0,
      stress: 0,
      social_satiety: 0,
    });
    expect(lines.join("\n")).toContain("平静");
    expect(lines.join("\n")).toContain("放松");
    expect(lines.join("\n")).toContain("社交适中");
  });

  it("极值有对应文字", () => {
    const lines = describeEmotion({
      mood: -4,
      stress: 4,
      social_satiety: -4,
    });
    const joined = lines.join("\n");
    expect(joined).toContain("极低落");
    expect(joined).toContain("极度紧张");
    expect(joined).toContain("极度孤独");
  });
});

describe("buildSystemPrompt", () => {
  it("包含 MBTI 文字描述 / 昼夜节律 / 生理优先级 / 反循环 / 移动机制", () => {
    const sys = buildSystemPrompt({
      character: baseCharacter,
      worldName: "测试世界",
      nodes: [restaurant],
    });
    expect(sys).toContain("昼夜节律");
    expect(sys).toContain("生理优先级");
    expect(sys).toContain("反循环");
    expect(sys).toContain("移动机制");
    expect(sys).toContain("性格特征");
    // ei=2 应出现"偏外向"文字（MBTI 标签）
    expect(sys).toContain("偏外向");
  });

  it("禁止数字提示出现在性格段", () => {
    const sys = buildSystemPrompt({
      character: baseCharacter,
      worldName: "测试世界",
      nodes: [restaurant],
    });
    // 不应出现裸数字格式（例如 "ei = +2" 或 "外向 = 50"）
    expect(sys).not.toMatch(/ei\s*=\s*[-+]?\d/);
    expect(sys).not.toMatch(/外向性\s*=/);
  });

  it("地图段渲染：节点带 [id]、父子缩进、★ 标注家、shortcut 单列", () => {
    const town: MapNode = {
      id: "node-town",
      worldId: "w",
      parentId: null,
      name: "镇中心",
      description: "",
      tags: ["public"],
      capacity: null,
      privacy: "public",
      visibleFromParent: true,
      shortcuts: [],
      isEntry: false,
    };
    const tavern: MapNode = {
      id: "node-tavern",
      worldId: "w",
      parentId: "node-town",
      name: "酒馆雪灯",
      description: "",
      tags: ["public", "dining"],
      capacity: null,
      privacy: "public",
      visibleFromParent: true,
      shortcuts: ["node-grocery"],
      isEntry: false,
    };
    const grocery: MapNode = {
      id: "node-grocery",
      worldId: "w",
      parentId: "node-town",
      name: "杂货铺北之惠",
      description: "",
      tags: ["residence"],
      capacity: null,
      privacy: "private",
      visibleFromParent: true,
      shortcuts: [],
      isEntry: false,
    };
    const sys = buildSystemPrompt({
      character: { ...baseCharacter, homeNodeId: "node-grocery" },
      worldName: "测试世界",
      nodes: [town, tavern, grocery],
    });
    expect(sys).toContain("当前世界地图");
    expect(sys).toContain("镇中心 [node-town]");
    expect(sys).toContain("- 酒馆雪灯 [node-tavern]"); // 子节点
    expect(sys).toContain("★ 你的家"); // homeNodeId 注释
    expect(sys).toContain("特殊通道");
    // tavern → grocery 是单向 shortcut（grocery 没有反向）
    expect(sys).toContain("酒馆雪灯 [node-tavern] → 杂货铺北之惠 [node-grocery]");
  });

  it("地图段在角色自我认知之前（缓存友好：世界静态在前，角色信息在后）", () => {
    const sys = buildSystemPrompt({
      character: baseCharacter,
      worldName: "测试世界",
      nodes: [restaurant],
    });
    const mapIdx = sys.indexOf("当前世界地图");
    const selfIdx = sys.indexOf("你的自我认知");
    expect(mapIdx).toBeGreaterThan(0);
    expect(selfIdx).toBeGreaterThan(mapIdx);
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
      character: {
        ...baseCharacter,
        vitals: { hunger: 0, fatigue: 14, hygiene: 0 },
      },
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
      character: {
        ...baseCharacter,
        vitals: { hunger: 0, fatigue: 14, hygiene: 0 },
      },
      here: home,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: { ...emptyFacts, homeNodeId: "node-home", homeNodeName: "我的家" },
    });
    expect(out).not.toContain("⚠");
  });

  it("hygiene 高 + 不在 bathing → 触发 ⚠ 卫生紧迫", () => {
    const out = buildUserPrompt({
      character: {
        ...baseCharacter,
        vitals: { hunger: 0, fatigue: 0, hygiene: 14 },
      },
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: emptyFacts,
    });
    expect(out).toContain("⚠");
    expect(out).toContain("澡堂");
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
    expect(out).toContain("距上次 rest/sleep：12 小时");
    expect(out).toContain("距上次 eat：7 小时");
    expect(out).toContain("说话 ×9");
  });

  it("vitals 段使用 qualifyVital 而非裸数字", () => {
    const out = buildUserPrompt({
      character: {
        ...baseCharacter,
        vitals: { hunger: 0, fatigue: 15, hygiene: 0 },
      },
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: emptyFacts,
    });
    expect(out).toContain("极度疲惫");
    expect(out).not.toContain("疲惫值：15");
  });

  it("情绪段渲染心情/压力/社交满足", () => {
    const out = buildUserPrompt({
      character: {
        ...baseCharacter,
        emotion: { mood: -3, stress: 3, social_satiety: -3 },
      },
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: emptyFacts,
    });
    expect(out).toContain("情绪状态");
    expect(out).toContain("很低落");
    expect(out).toContain("压力大");
    expect(out).toContain("很孤单");
  });
});

describe("language", () => {
  it("zh 时 system prompt 含简体中文输出指令；不含跨语言记忆提示", () => {
    const sys = buildSystemPrompt({
      character: baseCharacter,
      worldName: "测试世界",
      nodes: [restaurant],
      language: "zh",
    });
    expect(sys).toContain("简体中文");
    expect(sys).not.toMatch(/may be written in a different language/i);
  });

  it("en 时 system + user prompt 都含 English 指令 + 跨语言提示", () => {
    const sys = buildSystemPrompt({
      character: baseCharacter,
      worldName: "测试世界",
      nodes: [restaurant],
      language: "en",
    });
    const user = buildUserPrompt({
      character: baseCharacter,
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: emptyFacts,
      language: "en",
    });
    expect(sys).toMatch(/MUST be written in English/);
    expect(user).toMatch(/MUST be written in English/);
    expect(user).toMatch(/may be written in a different language/);
  });

  it("ja 时 system + user prompt 都含日本語指令 + 跨语言提示", () => {
    const sys = buildSystemPrompt({
      character: baseCharacter,
      worldName: "测试世界",
      nodes: [restaurant],
      language: "ja",
    });
    const user = buildUserPrompt({
      character: baseCharacter,
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: emptyFacts,
      language: "ja",
    });
    expect(sys).toContain("日本語で書いてください");
    expect(user).toContain("日本語で書いてください");
    expect(user).toContain("別の言語");
  });

  it("language 缺省时按 zh 处理（向后兼容）", () => {
    const sys = buildSystemPrompt({
      character: baseCharacter,
      worldName: "测试世界",
      nodes: [restaurant],
    });
    expect(sys).toContain("简体中文");
  });
});

describe("arrivalIntro", () => {
  it("zh：arrivalIntro=true 在 user prompt 末段加来由要求", () => {
    const out = buildUserPrompt({
      character: baseCharacter,
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: emptyFacts,
      arrivalIntro: true,
    });
    expect(out).toContain("刚抵达此地");
    expect(out).toMatch(/编造.*来到这里.*理由/);
  });

  it("arrivalIntro=false / 缺省时不出现来由要求", () => {
    const out = buildUserPrompt({
      character: baseCharacter,
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: emptyFacts,
    });
    expect(out).not.toContain("刚抵达此地");
  });

  it("en：arrivalIntro=true 用 English 来由提示", () => {
    const out = buildUserPrompt({
      character: baseCharacter,
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: emptyFacts,
      language: "en",
      arrivalIntro: true,
    });
    expect(out).toMatch(/just arrived/i);
    expect(out).toMatch(/why you came/i);
  });

  it("ja：arrivalIntro=true 用日本語来由提示", () => {
    const out = buildUserPrompt({
      character: baseCharacter,
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: emptyFacts,
      language: "ja",
      arrivalIntro: true,
    });
    expect(out).toContain("到着したばかり");
    expect(out).toContain("理由");
  });
});
