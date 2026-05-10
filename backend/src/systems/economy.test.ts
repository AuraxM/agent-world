/**
 * economy.ts 单测：纯函数（canWorkAt / findEmployment / findShopAtNode / findShopById）。
 */
import { describe, it, expect, vi } from "vitest";

// Mock the db module to avoid better-sqlite3 initialization when economy.ts imports it.
vi.mock("../db/index", () => {
  const noop = () => {};
  return {
    db: {
      insert: () => ({ values: () => ({ run: noop }) }),
      select: () => ({ from: () => ({ where: () => ({ all: () => [] }) }) }),
    },
    schema: { transactions: "transactions" },
  };
});

import { canWorkAt, findEmployment, findShopAtNode, findShopById } from "./economy";
import type { Character, Shop } from "../domain/index";

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    worldId: "w1",
    name: "Test",
    age: 20,
    gender: "male",
    profession: "merchant",
    money: 500,
    incomeLevel: 2,
    expenseExempt: false,
    inventory: [],
    locationId: "node-1",
    origin: "local",
    personalProfile: { past: "", present: "" },
    personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
    vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
    emotion: { mood: 0, stress: 0, social_satiety: 0 },
    abilities: [],
    appearance: 2,
    intelligence: 2,
    health: 2,
    activeConversationIds: [],
    lastConversationEndTick: 0,
    shortMemory: [],
    dailyMemory: [],
    longMemory: [],
    relations: {},
    lastSleepTick: 0,
    impressionBook: {},
    notebook: [],
    shortTermGoal: null,
    longTermGoal: null,
    liked: "",
    disliked: "",
    ...overrides,
  };
}

function makeShop(overrides: Partial<Shop> = {}): Shop {
  return {
    id: "shop-1",
    worldId: "w1",
    nodeId: "node-store",
    ownerCharacterId: "char-owner",
    employeeCharacterId: undefined,
    goods: ["bread", "water"],
    salary: 80,
    ...overrides,
  };
}

describe("canWorkAt", () => {
  it("returns true for owner", () => {
    expect(canWorkAt(makeChar({ id: "char-owner" }), makeShop())).toBe(true);
  });

  it("returns true for employee", () => {
    expect(canWorkAt(makeChar({ id: "char-emp" }), makeShop({ employeeCharacterId: "char-emp" }))).toBe(true);
  });

  it("returns false for unrelated character", () => {
    expect(canWorkAt(makeChar({ id: "char-other" }), makeShop())).toBe(false);
  });
});

describe("findEmployment", () => {
  const shops = [makeShop()];

  it("finds by owner", () => {
    expect(findEmployment(makeChar({ id: "char-owner" }), shops)!.id).toBe("shop-1");
  });

  it("finds by employee", () => {
    const shopWithEmp = makeShop({ employeeCharacterId: "char-emp" });
    expect(findEmployment(makeChar({ id: "char-emp" }), [shopWithEmp])!.id).toBe("shop-1");
  });

  it("returns undefined if not employed", () => {
    expect(findEmployment(makeChar({ id: "char-other" }), shops)).toBeUndefined();
  });
});

describe("findShopAtNode", () => {
  it("finds by nodeId", () => {
    expect(findShopAtNode("node-store", [makeShop()])!.id).toBe("shop-1");
  });

  it("returns undefined for non-shop node", () => {
    expect(findShopAtNode("nowhere", [makeShop()])).toBeUndefined();
  });
});

describe("findShopById", () => {
  it("finds by shop id", () => {
    expect(findShopById("shop-1", [makeShop()])!.nodeId).toBe("node-store");
  });

  it("returns undefined for unknown id", () => {
    expect(findShopById("shop-99", [makeShop()])).toBeUndefined();
  });
});
