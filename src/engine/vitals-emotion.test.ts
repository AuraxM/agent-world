/**
 * vitals-emotion.ts 单测：纯函数 + 直接 mutate characters。
 */
import { describe, expect, it, vi } from "vitest";
import {
  applyEmotionEvent,
  clamp,
  decayVitals,
  evolveEmotions,
  reduceVital,
  resetVital,
} from "./vitals-emotion";
import type { Character } from "@/domain/types";

function mkChar(
  id: string,
  vitals: { hunger: number; fatigue: number; hygiene: number },
  emotion: { mood: number; stress: number; social_satiety: number } = {
    mood: 0,
    stress: 0,
    social_satiety: 0,
  },
  overrides?: Partial<Character>,
): Character {
  return {
    id,
    worldId: "w",
    name: id,
    age: 30,
    gender: "male" as const,
    profession: "farmer" as const,
    biography: "テスト",
    origin: "local" as const,
    locationId: "node-here",
    personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
    vitals,
    emotion,
    abilities: [],
    appearance: 2,
    intelligence: 2,
    health: 3, // healthFactor=1.0 → BME=1.0 for clean test values
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
    notebook: [],
    shortTermGoal: null,
    longTermGoal: null,
    liked: "",
    disliked: "",
    ...overrides,
  };
}

describe("clamp", () => {
  it("夹在区间内", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe("decayVitals", () => {
  it("hunger 每 tick +BME；fatigue 0..8 段偶数整小时 +0.5（慢段）；hygiene 偶数整小时 +0.8", () => {
    const c = mkChar("a", { hunger: 0, fatigue: 0, hygiene: 0 });
    decayVitals({ characters: [c], worldId: "w", tick: 0 });
    expect(c.vitals.hunger).toBe(1.0);
    expect(c.vitals.fatigue).toBe(0.5); // 0<8 慢段，tick 0 偶数整小时 +0.5
    expect(c.vitals.hygiene).toBe(0.8);

    decayVitals({ characters: [c], worldId: "w", tick: 5 });
    expect(c.vitals.hunger).toBe(2.0);
    expect(c.vitals.fatigue).toBe(0.5); // 慢段，奇数整小时 +0
    expect(c.vitals.hygiene).toBe(0.8);

    decayVitals({ characters: [c], worldId: "w", tick: 10 });
    expect(c.vitals.hunger).toBe(3.0);
    expect(c.vitals.fatigue).toBe(1.0); // 慢段，偶数整小时 +0.5
    expect(c.vitals.hygiene).toBe(1.6);
  });

  it("fatigue 8..13 段每整小时 +1.0（标段）", () => {
    const c = mkChar("a", { hunger: 0, fatigue: 8, hygiene: 0 });
    decayVitals({ characters: [c], worldId: "w", tick: 5 }); // 奇数整小时，标段不关心奇偶 +1.0
    expect(c.vitals.fatigue).toBe(9.0);
    decayVitals({ characters: [c], worldId: "w", tick: 10 });
    expect(c.vitals.fatigue).toBe(10.0);
  });

  it("fatigue 13..16 段每整小时 +2.0（快段）", () => {
    const c = mkChar("a", { hunger: 0, fatigue: 13, hygiene: 0 });
    decayVitals({ characters: [c], worldId: "w", tick: 5 });
    expect(c.vitals.fatigue).toBe(15.0);
    decayVitals({ characters: [c], worldId: "w", tick: 10 });
    expect(c.vitals.fatigue).toBe(16); // 封顶
  });

  it("vitals 上限为 16", () => {
    const c = mkChar("a", { hunger: 16, fatigue: 16, hygiene: 16 });
    decayVitals({ characters: [c], worldId: "w", tick: 5 });
    expect(c.vitals.hunger).toBe(16);
    expect(c.vitals.fatigue).toBe(16);
    expect(c.vitals.hygiene).toBe(16);
  });

  it("跨入 medium 触发 inner 事件", () => {
    const c = mkChar("a", { hunger: 5, fatigue: 0, hygiene: 0 }); // 5→6.0 跨入 HUNGER_MEDIUM
    const evs = decayVitals({ characters: [c], worldId: "w", tick: 5 });
    const hungerInner = evs.find(
      (e) => e.audienceCharacterId === "a" && /饿/.test(e.description),
    );
    expect(hungerInner).toBeTruthy();
    expect(hungerInner!.intensity).toBe(2);
  });

  it("跨入 severe 触发 intensity=3 inner", () => {
    const c = mkChar("a", { hunger: 10, fatigue: 0, hygiene: 0 }); // 10→11.0 跨入 HUNGER_SEVERE
    const evs = decayVitals({ characters: [c], worldId: "w", tick: 5 });
    const severe = evs.find(
      (e) => e.audienceCharacterId === "a" && e.intensity === 3,
    );
    expect(severe).toBeTruthy();
  });

  it("hygiene 越线（severe 13）触发 inner", () => {
    const c = mkChar("a", { hunger: 0, fatigue: 0, hygiene: 12.5 });
    // tick=10（偶数整小时）→ hygiene 12.5+0.8=13.3 跨入 severe
    const evs = decayVitals({ characters: [c], worldId: "w", tick: 10 });
    expect(c.vitals.hygiene).toBe(13.3);
    const inner = evs.find((e) => /洗浴|脏/.test(e.description));
    expect(inner).toBeTruthy();
  });

  it("睡眠期间 vitals 冻结，不衰减也不触发提醒", () => {
    const c = mkChar("a", { hunger: 9, fatigue: 5, hygiene: 12 });
    c.currentAction = {
      type: "sleep",
      startedAt: 0,
      endsAt: 8,
      description: "在家睡觉",
      interruptThreshold: 5,
    };
    const evs = decayVitals({ characters: [c], worldId: "w", tick: 4 });
    expect(c.vitals.hunger).toBe(9);
    expect(c.vitals.fatigue).toBe(5);
    expect(c.vitals.hygiene).toBe(12);
    expect(evs).toHaveLength(0);
  });

  it("醒来当 tick（tick === endsAt）恢复正常衰减", () => {
    const c = mkChar("a", { hunger: 5, fatigue: 5, hygiene: 5 });
    c.currentAction = {
      type: "sleep",
      startedAt: 0,
      endsAt: 10,
      description: "在家睡觉",
      interruptThreshold: 5,
    };
    decayVitals({ characters: [c], worldId: "w", tick: 10 });
    expect(c.vitals.hunger).toBe(6.0);
    expect(c.vitals.fatigue).toBe(5.5); // slow even hour +0.5
    expect(c.vitals.hygiene).toBe(5.8); // tick=10 偶数整小时 +0.8
  });

  it("远途 move 期间 vitals 走半速：偶数整小时衰减，奇数整小时不增；hygiene 路上不增", () => {
    const c = mkChar("a", { hunger: 5, fatigue: 5, hygiene: 5 });
    c.currentAction = {
      type: "move",
      startedAt: 0,
      endsAt: 15,
      description: "前往山顶",
      interruptThreshold: 5,
    };
    // 奇数整小时：travel 期间全都不动（onTravel && !evenHour）
    decayVitals({ characters: [c], worldId: "w", tick: 5 });
    expect(c.vitals.hunger).toBe(5);
    expect(c.vitals.fatigue).toBe(5);
    expect(c.vitals.hygiene).toBe(5);

    // 偶数整小时：hunger +1.0, fatigue +0.5 (slow even), hygiene 不增
    decayVitals({ characters: [c], worldId: "w", tick: 10 });
    expect(c.vitals.hunger).toBe(6.0);
    expect(c.vitals.fatigue).toBe(5.5);
    expect(c.vitals.hygiene).toBe(5);
  });
});

describe("evolveEmotions", () => {
  it("偶数整小时 mood 朝 0 走 1 — 性格驱动概率回归，mock random 保证触发", () => {
    const c = mkChar(
      "a",
      { hunger: 0, fatigue: 0, hygiene: 0 },
      { mood: 3, stress: 0, social_satiety: 0 },
    );
    const rand = vi.spyOn(Math, "random").mockReturnValue(0);
    evolveEmotions({
      characters: [c],
      worldId: "w",
      tick: 10,
      hasCompanions: new Map([["a", false]]),
    });
    expect(c.emotion.mood).toBe(2);
    rand.mockRestore();
  });

  it("奇数 tick mood 不变", () => {
    const c = mkChar(
      "a",
      { hunger: 0, fatigue: 0, hygiene: 0 },
      { mood: -3, stress: 0, social_satiety: 0 },
    );
    evolveEmotions({
      characters: [c],
      worldId: "w",
      tick: 1,
      hasCompanions: new Map([["a", false]]),
    });
    expect(c.emotion.mood).toBe(-3);
  });

  it("每 24 游戏小时 stress -1", () => {
    const c = mkChar(
      "a",
      { hunger: 0, fatigue: 0, hygiene: 0 },
      { mood: 0, stress: 4, social_satiety: 0 },
    );
    evolveEmotions({
      characters: [c],
      worldId: "w",
      tick: 120,
      hasCompanions: new Map([["a", false]]),
    });
    expect(c.emotion.stress).toBe(3);
  });

  it("有伴则 social_satiety 偶数整小时 +gain（EI 驱动，mock random 防衰减）", () => {
    const c = mkChar(
      "a",
      { hunger: 0, fatigue: 0, hygiene: 0 },
      { mood: 0, stress: 0, social_satiety: 0 },
    );
    const rand = vi.spyOn(Math, "random").mockReturnValue(1);
    evolveEmotions({
      characters: [c],
      worldId: "w",
      tick: 10,
      hasCompanions: new Map([["a", true]]),
    });
    // getSocialGainPerInteraction(ei=0) = 1.2 - 0 = 1.2
    expect(c.emotion.social_satiety).toBe(1.2);
    rand.mockRestore();
  });

  it("独处则 social_satiety 偶数 tick -1（封底 -4）", () => {
    const c = mkChar(
      "a",
      { hunger: 0, fatigue: 0, hygiene: 0 },
      { mood: 0, stress: 0, social_satiety: -4 },
    );
    evolveEmotions({
      characters: [c],
      worldId: "w",
      tick: 2,
      hasCompanions: new Map([["a", false]]),
    });
    expect(c.emotion.social_satiety).toBe(-4);
  });

  it("低 mood 周期性提醒（每 8 游戏小时）", () => {
    // mood=-4 → 概率回归到 -3（仍 ≤-3，触发提醒），mock random 保证触发
    const c = mkChar(
      "a",
      { hunger: 0, fatigue: 0, hygiene: 0 },
      { mood: -4, stress: 0, social_satiety: 0 },
    );
    const rand = vi.spyOn(Math, "random").mockReturnValue(0);
    const evs = evolveEmotions({
      characters: [c],
      worldId: "w",
      tick: 40,
      hasCompanions: new Map([["a", false]]),
    });
    expect(c.emotion.mood).toBe(-3);
    expect(evs.some((e) => /低落|出口/.test(e.description))).toBe(true);
    rand.mockRestore();
  });
});

describe("applyEmotionEvent", () => {
  it("attacked_self → mood -2, stress +2（封顶）", () => {
    const e = { mood: 0, stress: 3, social_satiety: 0 };
    applyEmotionEvent(e, "attacked_self");
    expect(e.mood).toBe(-2);
    expect(e.stress).toBe(4);
  });

  it("received_help_gift → mood +1, stress = 0", () => {
    const e = { mood: 0, stress: 4, social_satiety: 0 };
    applyEmotionEvent(e, "received_help_gift");
    expect(e.mood).toBe(1);
    expect(e.stress).toBe(0);
  });

  it("attacked_other 仅 stress +1", () => {
    const e = { mood: 2, stress: 0, social_satiety: 0 };
    applyEmotionEvent(e, "attacked_other");
    expect(e.mood).toBe(2);
    expect(e.stress).toBe(1);
  });

  it("helped_gifted 仅 mood +1", () => {
    const e = { mood: 0, stress: 2, social_satiety: 0 };
    applyEmotionEvent(e, "helped_gifted");
    expect(e.mood).toBe(1);
    expect(e.stress).toBe(2);
  });
});

describe("vitals helpers", () => {
  it("resetVital 归零", () => {
    const c = mkChar("a", { hunger: 10, fatigue: 5, hygiene: 12 });
    resetVital(c, "hunger");
    expect(c.vitals.hunger).toBe(0);
    expect(c.vitals.fatigue).toBe(5);
  });

  it("reduceVital 不会变负", () => {
    const c = mkChar("a", { hunger: 2, fatigue: 5, hygiene: 0 });
    reduceVital(c, "hunger", 5);
    expect(c.vitals.hunger).toBe(0);
  });
});
