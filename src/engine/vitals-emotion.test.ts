/**
 * vitals-emotion.ts 单测：纯函数 + 直接 mutate characters。
 */
import { describe, expect, it } from "vitest";
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
): Character {
  return {
    id,
    worldId: "w",
    name: id,
    locationId: "node-here",
    personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
    vitals,
    emotion,
    abilities: [],
    shortMemory: [],
    longMemory: [],
    relations: {},
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
  it("hunger / fatigue 每 tick +1，hygiene 偶数 tick +1", () => {
    const c = mkChar("a", { hunger: 0, fatigue: 0, hygiene: 0 });
    decayVitals({ characters: [c], worldId: "w", tick: 0 });
    expect(c.vitals.hunger).toBe(1);
    expect(c.vitals.fatigue).toBe(1);
    expect(c.vitals.hygiene).toBe(1); // tick 0 是偶数

    decayVitals({ characters: [c], worldId: "w", tick: 1 });
    expect(c.vitals.hunger).toBe(2);
    expect(c.vitals.fatigue).toBe(2);
    expect(c.vitals.hygiene).toBe(1); // tick 1 奇数，hygiene 不增

    decayVitals({ characters: [c], worldId: "w", tick: 2 });
    expect(c.vitals.hygiene).toBe(2);
  });

  it("vitals 上限为 16", () => {
    const c = mkChar("a", { hunger: 16, fatigue: 16, hygiene: 16 });
    decayVitals({ characters: [c], worldId: "w", tick: 4 });
    expect(c.vitals.hunger).toBe(16);
    expect(c.vitals.fatigue).toBe(16);
    expect(c.vitals.hygiene).toBe(16);
  });

  it("跨入 medium 触发 inner 事件", () => {
    const c = mkChar("a", { hunger: 4, fatigue: 0, hygiene: 0 });
    const evs = decayVitals({ characters: [c], worldId: "w", tick: 1 });
    const hungerInner = evs.find(
      (e) => e.audienceCharacterId === "a" && /饿/.test(e.description),
    );
    expect(hungerInner).toBeTruthy();
    expect(hungerInner!.intensity).toBe(2);
  });

  it("跨入 severe 触发 intensity=3 inner", () => {
    const c = mkChar("a", { hunger: 9, fatigue: 0, hygiene: 0 });
    const evs = decayVitals({ characters: [c], worldId: "w", tick: 1 });
    const severe = evs.find(
      (e) => e.audienceCharacterId === "a" && e.intensity === 3,
    );
    expect(severe).toBeTruthy();
  });

  it("hygiene 越线（severe 13）触发 inner", () => {
    const c = mkChar("a", { hunger: 0, fatigue: 0, hygiene: 12 });
    // tick=2（偶数）→ hygiene 13
    const evs = decayVitals({ characters: [c], worldId: "w", tick: 2 });
    expect(c.vitals.hygiene).toBe(13);
    const inner = evs.find((e) => /洗浴|脏/.test(e.description));
    expect(inner).toBeTruthy();
  });
});

describe("evolveEmotions", () => {
  it("偶数 tick mood 朝 0 走 1", () => {
    const c = mkChar(
      "a",
      { hunger: 0, fatigue: 0, hygiene: 0 },
      { mood: 3, stress: 0, social_satiety: 0 },
    );
    evolveEmotions({
      characters: [c],
      worldId: "w",
      tick: 2,
      hasCompanions: new Map([["a", false]]),
    });
    expect(c.emotion.mood).toBe(2);
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

  it("每 24 tick stress -1", () => {
    const c = mkChar(
      "a",
      { hunger: 0, fatigue: 0, hygiene: 0 },
      { mood: 0, stress: 4, social_satiety: 0 },
    );
    evolveEmotions({
      characters: [c],
      worldId: "w",
      tick: 24,
      hasCompanions: new Map([["a", false]]),
    });
    expect(c.emotion.stress).toBe(3);
  });

  it("有伴则 social_satiety 偶数 tick +1", () => {
    const c = mkChar(
      "a",
      { hunger: 0, fatigue: 0, hygiene: 0 },
      { mood: 0, stress: 0, social_satiety: 0 },
    );
    evolveEmotions({
      characters: [c],
      worldId: "w",
      tick: 2,
      hasCompanions: new Map([["a", true]]),
    });
    expect(c.emotion.social_satiety).toBe(1);
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

  it("低 mood 周期性提醒（每 6 tick）", () => {
    const c = mkChar(
      "a",
      { hunger: 0, fatigue: 0, hygiene: 0 },
      { mood: -3, stress: 0, social_satiety: 0 },
    );
    const evs = evolveEmotions({
      characters: [c],
      worldId: "w",
      tick: 6,
      hasCompanions: new Map([["a", false]]),
    });
    expect(evs.some((e) => /低落|出口/.test(e.description))).toBe(true);
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
