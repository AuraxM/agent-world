/**
 * prompt.ts v2 单测：覆盖
 *  - qualifyVital 5 档定性 + urgency（新 0..16 范围）
 *  - timeOfDay 时段标签 + isSleepHour
 *  - buildSystemPrompt 含 MBTI 文字描述 / 昼夜节律 / 生理优先级 / 反循环 / 移动机制 关键字
 *  - buildUserPrompt 关键段渲染（连续行为 / 紧迫提醒 / 时间 / 情绪 / 卫生）
 */
import { describe, expect, it } from "vitest";
import {
  buildAcceptDecisionPrompt,
  buildDialogTurnPrompt,
  buildDialogSummaryPrompt,
  buildMemoryCompressionPrompt,
  buildPeerImage,
  buildSalvageContext,
  buildSelfImage,
  buildSystemPrompt,
  buildUserPrompt,
  buildWeeklyCompressionPrompt,
  describeEmotion,
  describeRelationBidirectional,
  qualifyVital,
  timeOfDay,
} from "./prompt";
import type { AggregatedFacts } from "@/engine/facts";
import type { Character, DialogTurn, MapNode, Memory } from "@/domain/types";

const baseCharacter: Character = {
  id: "char-x",
  worldId: "w",
  name: "测试角色",
  age: 25,
  gender: "male",
  profession: "merchant",
  biography: "一个普通的测试角色。",
  origin: "local" as const,
  locationId: "node-here",
  personality: { ei: 2, sn: 0, tf: 0, jp: 0 },
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
  activityNodeId: null,
  activityNodeName: null,
  restNodeId: null,
  restNodeName: null,
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
    expect(qualifyVital(15, "fatigue").phrase).toMatch(/非常疲惫.*15/);
    expect(qualifyVital(8, "hunger").phrase).toMatch(/明显饥饿.*8/);
    expect(qualifyVital(15, "hygiene").phrase).toMatch(/极其肮脏.*15/);
  });
});

describe("timeOfDay", () => {
  it.each([
    [0, 0, "深夜", true],
    [25, 5, "凌晨", true],
    [40, 8, "早晨", false],
    [65, 13, "中午", false],
    [95, 19, "傍晚", false],
    [110, 22, "夜晚", true],
    [115, 23, "夜晚", true],
    [5, 1, "深夜", true],
    [240, 0, "深夜", true],
  ])(
    "tick %i → hour %i, period %s, sleepHour %s",
    (tick, hour, period, sleep) => {
      const t = timeOfDay(tick);
      expect(t.hour).toBe(hour);
      expect(t.period).toBe(period);
      expect(t.isSleepHour).toBe(sleep);
    },
  );

  it("tick=240 算第 2 日 0:00", () => {
    const t = timeOfDay(240);
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
  it("只包含世界规则 / 地图 / 语言指令，不包含角色专属内容", () => {
    const sys = buildSystemPrompt({
      worldName: "测试世界",
      nodes: [restaurant],
    });
    // world rules
    expect(sys).toContain("昼夜节律");
    expect(sys).toContain("生理优先级");
    expect(sys).toContain("反循环");
    expect(sys).toContain("移动机制");
    // character-specific content should NOT be in system prompt (moved to user prompt)
    expect(sys).not.toContain("你的自我认知");
    expect(sys).not.toContain("偏外向");
  });

  it("禁止数字提示出现在性格段", () => {
    const sys = buildSystemPrompt({
      worldName: "测试世界",
      nodes: [restaurant],
    });
    // 不应出现裸数字格式（例如 "ei = +2" 或 "外向 = 50"）
    expect(sys).not.toMatch(/ei\s*=\s*[-+]?\d/);
    expect(sys).not.toMatch(/外向性\s*=/);
  });

  it("地图段渲染：节点带 [id]、父子缩进、shortcut 单列（无角色专属信息）", () => {
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
      worldName: "测试世界",
      nodes: [town, tavern, grocery],
    });
    expect(sys).toContain("当前世界地图");
    expect(sys).toContain("镇中心 [node-town]");
    expect(sys).toContain("- 酒馆雪灯 [node-tavern]"); // 子节点
    expect(sys).not.toContain("★ 你的家");
    expect(sys).toContain("特殊通道");
    // tavern → grocery 是单向 shortcut（grocery 没有反向）
    expect(sys).toContain("酒馆雪灯 [node-tavern] → 杂货铺北之惠 [node-grocery]");
    // 角色专属信息（休息处 / 自我认知）已移至 user prompt，不应出现在 system prompt
    expect(sys).not.toContain("你的休息处");
    expect(sys).not.toContain("你的自我认知");
  });

  it("system prompt 不含角色专属块（已移至 user prompt，100% 跨角色共享以最大化 cache 命中）", () => {
    const sys = buildSystemPrompt({
      worldName: "测试世界",
      nodes: [restaurant],
    });
    const mapIdx = sys.indexOf("当前世界地图");
    expect(mapIdx).toBeGreaterThan(0);
    // 角色专属块已移至 user prompt，不应出现在 system prompt
    expect(sys).not.toContain("你的自我认知");
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
      tick: 25,
      facts: { ...emptyFacts, restNodeId: "node-home", restNodeName: "我的家" },
      nodes: [restaurant],
      allCharacters: [baseCharacter],
    });
    expect(out).toContain("第 0 日 05:00");
    expect(out).toContain("凌晨");
    expect(out).toContain("已是你的作息时段");
    expect(out).toContain("作息窗口：22:00–06:00");
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
      facts: { ...emptyFacts, restNodeId: "node-home", restNodeName: "我的家" },
      nodes: [restaurant],
      allCharacters: [baseCharacter],
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
      facts: { ...emptyFacts, restNodeId: "node-home", restNodeName: "我的家" },
      nodes: [home],
      allCharacters: [baseCharacter],
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
      nodes: [restaurant],
      allCharacters: [baseCharacter],
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
        activityNodeId: null,
        activityNodeName: null,
        restNodeId: null,
        restNodeName: null,
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
      nodes: [restaurant],
      allCharacters: [baseCharacter],
    });
    expect(out).toContain("已在 老王饭馆 连续 14 小时");
    expect(out).toContain("上一 tick 你的行动：speak");
    expect(out).toContain("你好啊");
    expect(out).toContain("距上次 rest/sleep：2 小时");
    expect(out).toContain("距上次 eat：1 小时");
    expect(out).toContain("speak ×9");
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
      nodes: [restaurant],
      allCharacters: [baseCharacter],
    });
    expect(out).toContain("非常疲惫");
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
      nodes: [restaurant],
      allCharacters: [baseCharacter],
    });
    expect(out).toContain("情绪状态");
    expect(out).toContain("很低落");
    expect(out).toContain("压力大");
    expect(out).toContain("很孤单");
  });

  it("renders three-tier memories (short/daily/weekly)", () => {
    const character: Character = {
      ...baseCharacter,
      shortMemory: [
        { id: "m1", tick: 118, importance: 2, content: "我在饭馆吃了晚饭。" },
        { id: "m2", tick: 119, importance: 3, content: "我和酒馆老板聊了几句。" },
      ],
      dailyMemory: [
        { id: "d1", tick: 120, importance: 3, content: "今天在饭馆工作，和几个人聊了天，晚上在广场散了步。" },
        { id: "d2", tick: 240, importance: 3, content: "今天在家休息，下午去了市场。" },
      ],
      longMemory: [
        { id: "w1", tick: 840, importance: 4, content: "这一周主要在酒馆工作，认识了新来的邮递员田中。" },
      ],
    };
    const out = buildUserPrompt({
      character,
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 245,
      facts: emptyFacts,
      nodes: [restaurant],
      allCharacters: [baseCharacter],
    });
    expect(out).toContain("你的近期短期记忆");
    expect(out).toContain("我在饭馆吃了晚饭");
    expect(out).toContain("你的日记忆");
    expect(out).toContain("今天在饭馆工作");
    expect(out).toContain("你的周记忆");
    expect(out).toContain("这一周主要在酒馆工作");
  });

  it("no daily/weekly memories omits their sections", () => {
    const out = buildUserPrompt({
      character: baseCharacter,
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: emptyFacts,
      nodes: [restaurant],
      allCharacters: [baseCharacter],
    });
    expect(out).toContain("你的近期短期记忆");
    expect(out).not.toContain("你的日记忆");
    expect(out).not.toContain("你的周记忆");
  });
});

describe("language", () => {
  it("zh 时 system prompt 含简体中文输出指令；不含跨语言记忆提示", () => {
    const sys = buildSystemPrompt({
      worldName: "测试世界",
      nodes: [restaurant],
      language: "zh",
    });
    expect(sys).toContain("简体中文");
    expect(sys).not.toMatch(/may be written in a different language/i);
  });

  it("en 时 system 含 English 指令；user 不再重复指令但保留跨语言提示", () => {
    const sys = buildSystemPrompt({
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
      nodes: [restaurant],
    });
    expect(sys).toMatch(/MUST be written in English/);
    // user prompt 不再重复 languageInstruction（已在 system 提供）
    expect(user).not.toMatch(/MUST be written in English/);
    // 跨语言记忆提示仍保留在 user prompt
    expect(user).toMatch(/may be written in a different language/);
  });

  it("ja 时 system 含日本語指令；user 不再重复指令但保留跨语言提示", () => {
    const sys = buildSystemPrompt({
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
      nodes: [restaurant],
    });
    expect(sys).toContain("日本語で書いてください");
    expect(user).not.toContain("日本語で書いてください");
    expect(user).toContain("別の言語");
  });

  it("language 缺省时按 zh 处理（向后兼容）", () => {
    const sys = buildSystemPrompt({
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
      nodes: [restaurant],
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
      nodes: [restaurant],
      allCharacters: [baseCharacter],
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
      nodes: [restaurant],
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
      nodes: [restaurant],
    });
    expect(out).toContain("到着したばかり");
    expect(out).toContain("理由");
  });
});

describe("buildAcceptDecisionPrompt", () => {
  const peer: Character = {
    ...baseCharacter,
    id: "peer-1",
    name: "甲",
    age: 30,
    gender: "female",
    profession: "teacher",
    appearance: 3,
  };

  it("contains requester name, freeText, self-image, peer-image, and submit instruction (zh)", () => {
    const result = buildAcceptDecisionPrompt({
      self: {
        ...baseCharacter,
        name: "乙",
        emotion: { mood: -1, stress: 1, social_satiety: 0 },
      },
      requesterName: "甲",
      freeText: "今天天气不错，一起散步吗？",
      here: restaurant,
      peer,
      tick: 12,
    });
    expect(result).toContain("甲");
    expect(result).toContain("今天天气不错，一起散步吗？");
    expect(result).toContain("关于你自己");
    expect(result).toContain("姓名：乙");
    expect(result).toContain("关于 甲");
    expect(result).toContain("职业：教师");
    expect(result).toContain("submit_accept_decision");
  });

  it("does NOT include perceived events or companions (removed)", () => {
    const result = buildAcceptDecisionPrompt({
      self: baseCharacter,
      requesterName: "甲",
      freeText: "嗨",
      here: restaurant,
      peer,
      tick: 5,
    });
    expect(result).not.toContain("你刚刚感知到的事件");
    expect(result).not.toContain("同节点其他人");
  });

  it("includes compact personality line instead of expanded traits", () => {
    const result = buildAcceptDecisionPrompt({
      self: baseCharacter,
      requesterName: "甲",
      freeText: "嗨",
      here: restaurant,
      peer,
      tick: 5,
    });
    expect(result).toContain("性格：EN");
    expect(result).not.toContain("内外向(E/I)");
  });

  it("uses pre-filled impression from impressionBook", () => {
    const result = buildAcceptDecisionPrompt({
      self: { ...baseCharacter, impressionBook: { "peer-1": "安静但可靠。" } },
      requesterName: "甲",
      freeText: "嗨",
      here: restaurant,
      peer,
      tick: 5,
    });
    expect(result).toContain("安静但可靠");
  });
});

describe("buildDialogTurnPrompt", () => {
  const transcript: DialogTurn[] = [
    { speakerId: "a", kind: "say", line: "今天天气真好。" },
    { speakerId: "b", kind: "say", line: "是啊，适合出去走走。" },
    { speakerId: "a", kind: "say", line: "你最近在忙什么？" },
  ];

  const selfChar: Character = {
    ...baseCharacter,
    id: "b",
    name: "乙",
    age: 25,
    gender: "male",
    profession: "merchant",
    appearance: 2,
    personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
    relations: { "a": { kinds: ["friend"] as const, since: 0, lastInteractionTick: 0 } },
  };
  const peerChar: Character = {
    ...baseCharacter,
    id: "a",
    name: "甲",
    age: 30,
    gender: "female",
    profession: "teacher",
    appearance: 3,
  };

  it("renders self-image, peer-image, compact personality, and transcript (zh)", () => {
    const result = buildDialogTurnPrompt({
      self: selfChar,
      peer: peerChar,
      transcript,
      here: restaurant,
    });
    expect(result).toContain("关于你自己");
    expect(result).toContain("姓名：乙");
    expect(result).toContain("当前在：老王饭馆");
    expect(result).toContain("关于 甲");
    expect(result).toContain("职业：教师");
    expect(result).toContain("性格：EN");
    expect(result).not.toContain("内外向(E/I)");
    expect(result).toContain("今天天气真好");
    expect(result).toContain("submit_dialog_turn");
  });

  it("renders system messages with 【】 brackets", () => {
    const transcriptWithSys: DialogTurn[] = [
      ...transcript,
      { speakerId: "__system__", kind: "say", line: "已过去 30 分钟。" },
    ];
    const result = buildDialogTurnPrompt({
      self: selfChar,
      peer: peerChar,
      transcript: transcriptWithSys,
      here: restaurant,
    });
    expect(result).toContain("【已过去 30 分钟。】");
  });

  it("en: renders in English with self/peer image", () => {
    const result = buildDialogTurnPrompt({
      self: selfChar,
      peer: peerChar,
      transcript,
      here: restaurant,
      language: "en",
    });
    expect(result).toContain("You are 乙, speaking with 甲");
    expect(result).toContain("submit_dialog_turn");
  });

  it("ja: renders in Japanese with self/peer image", () => {
    const result = buildDialogTurnPrompt({
      self: selfChar,
      peer: peerChar,
      transcript,
      here: restaurant,
      language: "ja",
    });
    expect(result).toContain("あなたは 乙 です");
    expect(result).toContain("submit_dialog_turn");
  });
});

describe("buildDialogSummaryPrompt", () => {
  const transcript: DialogTurn[] = [
    { speakerId: "a", kind: "say", line: "你好。" },
    { speakerId: "b", kind: "say", line: "你好！很高兴见到你。" },
  ];

  it("renders full transcript and requests summary", () => {
    const result = buildDialogSummaryPrompt({
      openerName: "甲",
      openerId: "a",
      responderName: "乙",
      responderId: "b",
      transcript,
    });
    expect(result).toContain("甲：你好");
    expect(result).toContain("乙：你好！很高兴见到你");
    expect(result).toContain("submit_dialog_summary");
  });
});

describe("buildSalvageContext", () => {
  it("includes reject reason and speak ban", () => {
    const result = buildSalvageContext({
      rejectReason: "乙 拒绝了你的对话请求。",
    });
    expect(result).toContain("乙 拒绝了你的对话请求。");
    expect(result).toContain("不能再对任何人发起对话邀请");
  });
});

describe("ACTION_NAMES speak label", () => {
  it("speak action type renders as raw type", () => {
    const out = buildUserPrompt({
      character: baseCharacter,
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: {
        activityNodeId: null,
        activityNodeName: null,
        restNodeId: null,
        restNodeName: null,
        hoursAtCurrentLocation: 0,
        todayActionCounts: { speak: 1 },
      },
      nodes: [restaurant],
      allCharacters: [baseCharacter],
    });
    expect(out).toContain("speak ×1");
  });
});

describe("buildMemoryCompressionPrompt", () => {
  const sampleMemories: Memory[] = [
    { id: "m1", tick: 10, importance: 2, content: "我在酒馆吃了一顿饭。" },
    { id: "m2", tick: 15, importance: 3, content: '我对田中说："今天天气真不错。"' },
    { id: "m3", tick: 20, importance: 1, content: "我在广场散步。" },
  ];

  it("zh: includes character name and memory content", () => {
    const result = buildMemoryCompressionPrompt({
      characterName: "测试",
      memories: sampleMemories,
    });
    expect(result).toContain("测试");
    expect(result).toContain("我在酒馆吃了一顿饭");
    expect(result).toContain("submit_memory_summary");
  });

  it("zh: empty memories returns placeholder prompt", () => {
    const result = buildMemoryCompressionPrompt({
      characterName: "测试",
      memories: [],
    });
    expect(result).toContain("submit_memory_summary");
  });

  it("en: renders in English", () => {
    const result = buildMemoryCompressionPrompt({
      characterName: "Test",
      memories: sampleMemories,
      language: "en",
    });
    expect(result).toContain("You are Test");
    expect(result).toContain("submit_memory_summary");
  });

  it("ja: renders in Japanese", () => {
    const result = buildMemoryCompressionPrompt({
      characterName: "テスト",
      memories: sampleMemories,
      language: "ja",
    });
    expect(result).toContain("テスト");
    expect(result).toContain("submit_memory_summary");
  });
});

describe("buildWeeklyCompressionPrompt", () => {
  const dailySummaries = [
    "在酒馆工作，和田中聊了几句。",
    "去广场散步，遇到了新来的邮递员。",
    "在家休息了一天。",
    "去市场买菜，遇到了老朋友。",
    "工作很忙，没怎么和人说话。",
    "在酒馆喝了几杯，和老板聊了天。",
    "去教堂祈祷，心情平静。",
  ];

  it("zh: includes all 7 daily summaries", () => {
    const result = buildWeeklyCompressionPrompt({
      characterName: "测试",
      dailySummaries,
    });
    expect(result).toContain("测试");
    expect(result).toContain("第 1 天");
    expect(result).toContain("第 7 天");
    expect(result).toContain("submit_memory_summary");
  });

  it("en: renders in English", () => {
    const result = buildWeeklyCompressionPrompt({
      characterName: "Test",
      dailySummaries,
      language: "en",
    });
    expect(result).toContain("You are Test");
    expect(result).toContain("submit_memory_summary");
  });
});

describe("describeRelationBidirectional", () => {
  const self: Character = { ...baseCharacter, gender: "male", relations: {} };

  it("returns no-relation message when no relations exist", () => {
    const result = describeRelationBidirectional({ ...self, relations: {} }, "peer-1");
    expect(result).toContain("尚无正式关系");
  });

  it("renders bidirectional boss relation", () => {
    const c = {
      ...self,
      relations: { "peer-1": { kinds: ["boss"] as const, since: 0, lastInteractionTick: 0 } },
    };
    const result = describeRelationBidirectional(c, "peer-1");
    expect(result).toMatch(/TA 是你的老板/);
    expect(result).toMatch(/你是 TA 的下属/);
  });

  it("renders symmetric relation as mutual", () => {
    const c = {
      ...self,
      relations: { "peer-1": { kinds: ["colleague"] as const, since: 0, lastInteractionTick: 0 } },
    };
    const result = describeRelationBidirectional(c, "peer-1");
    expect(result).toMatch(/你们互为同事/);
  });

  it("renders father relation with male self", () => {
    const c = {
      ...self,
      gender: "male" as const,
      relations: { "peer-1": { kinds: ["father"] as const, since: 0, lastInteractionTick: 0 } },
    };
    const result = describeRelationBidirectional(c, "peer-1");
    expect(result).toMatch(/TA 是你的父亲/);
    expect(result).toMatch(/你是 TA 的儿子/);
  });

  it("renders father relation with female self", () => {
    const c = {
      ...self,
      gender: "female" as const,
      relations: { "peer-1": { kinds: ["father"] as const, since: 0, lastInteractionTick: 0 } },
    };
    const result = describeRelationBidirectional(c, "peer-1");
    expect(result).toMatch(/TA 是你的父亲/);
    expect(result).toMatch(/你是 TA 的女儿/);
  });

  it("renders daughter relation with male self", () => {
    const c = {
      ...self,
      gender: "male" as const,
      relations: { "peer-1": { kinds: ["daughter"] as const, since: 0, lastInteractionTick: 0 } },
    };
    const result = describeRelationBidirectional(c, "peer-1");
    expect(result).toMatch(/TA 是你的女儿/);
    expect(result).toMatch(/你是 TA 的父亲/);
  });

  it("renders daughter relation with female self", () => {
    const c = {
      ...self,
      gender: "female" as const,
      relations: { "peer-1": { kinds: ["daughter"] as const, since: 0, lastInteractionTick: 0 } },
    };
    const result = describeRelationBidirectional(c, "peer-1");
    expect(result).toMatch(/TA 是你的女儿/);
    expect(result).toMatch(/你是 TA 的母亲/);
  });

  it("handles multiple relation kinds", () => {
    const c = {
      ...self,
      gender: "male" as const,
      relations: { "peer-1": { kinds: ["colleague", "friend"] as const, since: 0, lastInteractionTick: 0 } },
    };
    const result = describeRelationBidirectional(c, "peer-1");
    expect(result).toMatch(/同事/);
    expect(result).toMatch(/friend/);
    const lines = result.split("\n");
    expect(lines.length).toBe(2);
  });

  it("falls back to raw kind string when kind has no label", () => {
    const c = {
      ...self,
      relations: { "peer-1": { kinds: ["classmate"] as const, since: 0, lastInteractionTick: 0 } },
    };
    const result = describeRelationBidirectional(c, "peer-1");
    expect(result).toMatch(/classmate/);
    expect(result).toMatch(/TA 是你的classmate/);
  });
});

describe("buildSelfImage", () => {
  const char: Character = {
    ...baseCharacter,
    name: "甲",
    age: 28,
    gender: "male",
    profession: "doctor",
    appearance: 3,
  };

  it("renders name, age, gender, profession, appearance, and location", () => {
    const result = buildSelfImage(char, "镇医院");
    expect(result).toContain("关于你自己");
    expect(result).toContain("姓名：甲");
    expect(result).toContain("年龄：28 岁");
    expect(result).toContain("性别：男");
    expect(result).toContain("职业：医生");
    expect(result).toContain("相貌端正");
    expect(result).toContain("当前在：镇医院");
  });

  it("omits location line when locationName is undefined", () => {
    const result = buildSelfImage(char);
    expect(result).not.toContain("当前在");
  });

  it("handles female gender", () => {
    const result = buildSelfImage({ ...char, gender: "female" });
    expect(result).toContain("性别：女");
  });
});

describe("buildPeerImage", () => {
  const self: Character = {
    ...baseCharacter,
    name: "甲",
    gender: "male",
    impressionBook: { "peer-1": "很健谈的一个医生。" },
    relations: { "peer-1": { kinds: ["colleague"] as const, since: 0, lastInteractionTick: 0 } },
  };
  const peer: Character = {
    ...baseCharacter,
    id: "peer-1",
    name: "乙",
    age: 42,
    gender: "male",
    profession: "doctor",
    appearance: 4,
    vitals: { hunger: 3, fatigue: 0, hygiene: 0 },
    emotion: { mood: -1, stress: 1, social_satiety: 0 },
  };

  it("renders peer info with relation and impression", () => {
    const result = buildPeerImage(self, peer);
    expect(result).toContain("关于 乙");
    expect(result).toContain("年龄：42 岁");
    expect(result).toContain("性别：男");
    expect(result).toContain("职业：医生");
    expect(result).toContain("面容出众");
    expect(result).toContain("同事");
    expect(result).toContain("很健谈的一个医生");
  });

  it("shows no-impression placeholder when impressionBook is empty", () => {
    const result = buildPeerImage({ ...self, impressionBook: {} }, peer);
    expect(result).toContain("暂无特别印象");
  });

  it("does NOT expose vitals or emotion internal values as numbers", () => {
    const result = buildPeerImage(self, peer);
    expect(result).not.toContain("hunger");
    expect(result).not.toContain("fatigue");
    expect(result).not.toContain("mood");
  });
});
