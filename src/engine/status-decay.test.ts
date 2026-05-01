/**
 * status-decay v0.2 单测：聚焦于持续提醒节流（修复"越线只触发一次"的隐性 bug）。
 * 纯函数，不依赖 DB。
 */
import { describe, expect, it } from "vitest";
import { decayAndDeriveStatuses } from "./status-decay";
import type { Character } from "@/domain/types";

function mkChar(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-x",
    worldId: "w",
    name: "测试角色",
    locationId: "node-here",
    personality: {
      extraversion: 0,
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
    ...overrides,
  };
}

describe("decayAndDeriveStatuses 持续 inner 提醒", () => {
  it("跨入 medium 时发 inner（首次跨越）", () => {
    const c = mkChar({ vitals: { hunger: 4, fatigue: 0 } });
    const events = decayAndDeriveStatuses([c], "w", 1);
    const innerHunger = events.find(
      (e) =>
        e.audienceCharacterId === "char-x" && e.description.includes("饿"),
    );
    expect(innerHunger).toBeTruthy();
    expect(c.vitals.hunger).toBe(5);
  });

  it("跨入 severe 时发 inner（首次跨越）", () => {
    const c = mkChar({ vitals: { hunger: 0, fatigue: 9 } });
    const events = decayAndDeriveStatuses([c], "w", 1);
    const innerFatigue = events.find(
      (e) =>
        e.audienceCharacterId === "char-x" && e.description.includes("疲惫"),
    );
    expect(innerFatigue).toBeTruthy();
    expect(innerFatigue!.intensity).toBe(3);
  });

  it("处于 medium 中间 tick：仅在 tick%5==0 时补发", () => {
    // fatigue 从 5 → 6（仍 medium，未跨 severe），tick=4，不应补发
    const cA = mkChar({ vitals: { hunger: 0, fatigue: 5 } });
    const evA = decayAndDeriveStatuses([cA], "w", 4);
    expect(
      evA.find(
        (e) =>
          e.audienceCharacterId === "char-x" &&
          e.description.includes("累"),
      ),
    ).toBeUndefined();

    // tick=5：5 % 5 = 0 → 补发
    const cB = mkChar({ vitals: { hunger: 0, fatigue: 5 } });
    const evB = decayAndDeriveStatuses([cB], "w", 5);
    expect(
      evB.find(
        (e) =>
          e.audienceCharacterId === "char-x" &&
          e.description.includes("累"),
      ),
    ).toBeTruthy();
  });

  it("处于 severe 中间 tick：每 3 tick 补发", () => {
    // fatigue=10 → 11（severe→severe 不跨越），tick=2，2%3≠0 不发
    const cA = mkChar({ vitals: { hunger: 0, fatigue: 10 } });
    const evA = decayAndDeriveStatuses([cA], "w", 2);
    expect(
      evA.find(
        (e) =>
          e.audienceCharacterId === "char-x" &&
          e.description.includes("疲惫"),
      ),
    ).toBeUndefined();

    // tick=3：3%3=0 → 补发
    const cB = mkChar({ vitals: { hunger: 0, fatigue: 10 } });
    const evB = decayAndDeriveStatuses([cB], "w", 3);
    const inner = evB.find(
      (e) =>
        e.audienceCharacterId === "char-x" &&
        e.description.includes("疲惫"),
    );
    expect(inner).toBeTruthy();
    expect(inner!.intensity).toBe(3);
  });

  it("severe 文案随累积小时数加强", () => {
    // fatigue=11 → +1=12（<15 档：疲惫不堪）
    const c1 = mkChar({ vitals: { hunger: 0, fatigue: 11 } });
    const ev1 = decayAndDeriveStatuses([c1], "w", 3);
    const e1 = ev1.find((e) => e.audienceCharacterId === "char-x");
    expect(e1?.description).toMatch(/疲惫不堪|眼皮在打架/);

    // fatigue=15 → +1=16（15-24 档：极度疲惫）
    const c2 = mkChar({ vitals: { hunger: 0, fatigue: 15 } });
    const ev2 = decayAndDeriveStatuses([c2], "w", 3);
    const e2 = ev2.find((e) => e.audienceCharacterId === "char-x");
    expect(e2?.description).toMatch(/极度疲惫|站着都能睡着/);

    // fatigue=24 → +1=25（≥25 档：濒临崩溃）
    const c3 = mkChar({ vitals: { hunger: 0, fatigue: 24 } });
    const ev3 = decayAndDeriveStatuses([c3], "w", 3);
    const e3 = ev3.find((e) => e.audienceCharacterId === "char-x");
    expect(e3?.description).toMatch(/濒临崩溃|必须立刻 rest/);
  });

  it("light 阶段不发 inner", () => {
    const c = mkChar({ vitals: { hunger: 0, fatigue: 0 } });
    const events = decayAndDeriveStatuses([c], "w", 5);
    expect(events).toHaveLength(0);
  });
});
