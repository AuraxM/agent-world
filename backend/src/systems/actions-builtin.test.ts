/**
 * actions-builtin.ts 单测：buy / use_item / give_item / manage_employment / work。
 */
import { describe, it, expect, vi } from "vitest";

// Mock the db module to avoid better-sqlite3 initialization when economy.ts is transitively imported.
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

import {
  buyAction,
  useItemAction,
  giveItemAction,
  manageEmploymentAction,
  workAction,
  sleepAction,
  moveAction,
  restAction,
} from "./actions-builtin";
import { findPath } from "./pathfinding";
import type { ItemDefinition, Shop, Character, MapNode } from "../domain/index";
import type { ActionContext } from "../domain/index";

function makeItemDef(overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    id: "bread",
    name: "面包",
    value: 50,
    consumable: true,
    effects: {
      vitals: { hunger: 30 },
    },
    ...overrides,
  };
}

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
    locationId: "node-store",
    origin: "local",
    personalProfile: { past: "", present: "" },
    personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
    vitals: { hunger: 5, fatigue: 3, hygiene: 2 },
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

function makeHere(overrides: Partial<MapNode> = {}): MapNode {
  return {
    id: "node-store",
    worldId: "w1",
    parentId: null,
    name: "便利店",
    description: "",
    tags: [],
    capacity: null,
    privacy: "public",
    visibleFromParent: true,
    shortcuts: [],
    isEntry: true,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<ActionContext> = {}): ActionContext {
  const self = overrides.self ?? makeChar();
  const here = overrides.here ?? makeHere();
  return {
    worldId: "w1",
    tick: 0,
    epoch: 0,
    self,
    here,
    companions: [],
    reachable: [],
    isSleepHour: false,
    facts: {
      activityNodeId: null,
      activityNodeName: null,
      restNodeId: null,
      restNodeName: null,
      hoursAtCurrentLocation: 0,
      todayActionCounts: {},
      todayChatTargets: {},
    },
    shops: [],
    itemDefs: new Map(),
    ...overrides,
  };
}

describe("buy action", () => {
  const itemDef = makeItemDef();
  const shop: Shop = {
    id: "shop-1",
    worldId: "w1",
    nodeId: "node-store",
    ownerCharacterId: "char-owner",
    goods: ["bread"],
    salary: 80,
  };

  it("check fails when not at shop", () => {
    const ctx = makeCtx({ here: makeHere({ id: "nowhere" }), shops: [], itemDefs: new Map() });
    expect(buyAction.check(ctx)).toBe(false);
  });

  it("check passes when at shop with enough money", () => {
    const ctx = makeCtx({ shops: [shop], itemDefs: new Map([["bread", itemDef]]) });
    expect(buyAction.check(ctx)).toBe(true);
  });

  it("validateParams rejects invalid item", () => {
    const ctx = makeCtx({ shops: [shop], itemDefs: new Map([["bread", itemDef]]) });
    const err = buyAction.validateParams!({ item_def_id: "invalid" }, ctx);
    expect(err).toContain("不销售");
  });

  it("execute produces addItem stateChange", () => {
    const ctx = makeCtx({ shops: [shop], itemDefs: new Map([["bread", itemDef]]) });
    const result = buyAction.execute(ctx, { item_def_id: "bread" });
    const hasAddItem = result.stateChanges!.some((sc) => sc.kind === "addItem");
    expect(hasAddItem).toBe(true);
  });
});

describe("use_item action", () => {
  const itemDef = makeItemDef();

  it("check fails when inventory empty", () => {
    const ctx = makeCtx({ self: makeChar({ inventory: [] }) });
    expect(useItemAction.check(ctx)).toBe(false);
  });

  it("check passes when inventory has items", () => {
    const ctx = makeCtx({
      self: makeChar({ inventory: [{ itemDefId: "bread", acquiredTick: 0 }] }),
    });
    expect(useItemAction.check(ctx)).toBe(true);
  });

  it("removeItem for consumable items", () => {
    const ctx = makeCtx({
      self: makeChar({ inventory: [{ itemDefId: "bread", acquiredTick: 0 }] }),
      itemDefs: new Map([["bread", itemDef]]),
    });
    const result = useItemAction.execute(ctx, { item_def_id: "bread" });
    expect(result.stateChanges!.some((sc) => sc.kind === "removeItem")).toBe(true);
  });

  it("applies vitals effect", () => {
    const ctx = makeCtx({
      self: makeChar({ inventory: [{ itemDefId: "bread", acquiredTick: 0 }] }),
      itemDefs: new Map([["bread", itemDef]]),
    });
    const result = useItemAction.execute(ctx, { item_def_id: "bread" });
    expect(result.stateChanges!.some((sc) => sc.kind === "adjustVital" && sc.vital === "hunger")).toBe(true);
  });
});

describe("give_item action", () => {
  const itemDef = makeItemDef();

  it("is dialogue-only", () => {
    expect(giveItemAction.check(makeCtx())).toBe(false);
  });

  it("execute removes item from giver", () => {
    const ctx = makeCtx({
      self: makeChar({ id: "char-1", name: "Giver", inventory: [{ itemDefId: "bread", acquiredTick: 0 }] }),
      companions: [makeChar({ id: "char-2", name: "Receiver" })],
      itemDefs: new Map([["bread", itemDef]]),
    });
    const result = giveItemAction.execute(ctx, { target_id: "char-2", item_def_id: "bread" });
    expect(result.stateChanges!.some((sc) => sc.kind === "removeItem")).toBe(true);
    expect(result.dialogRecord).toContain("面包");
    expect(result.dialogRecord).toContain("50");
  });
});

describe("manage_employment action", () => {
  it("is dialogue-only", () => {
    expect(manageEmploymentAction.check(makeCtx())).toBe(false);
  });

  it("hire produces setEmployment stateChange", () => {
    const ctx = makeCtx({
      self: makeChar({ id: "char-1", name: "Owner" }),
      companions: [makeChar({ id: "char-2", name: "Target" })],
      shops: [
        {
          id: "shop-1",
          worldId: "w1",
          nodeId: "node-store",
          ownerCharacterId: "char-1",
          goods: [],
          salary: 80,
        },
      ],
    });
    const result = manageEmploymentAction.execute(ctx, {
      target_id: "char-2",
      employment_action: "hire",
    });
    expect(
      result.stateChanges!.some(
        (sc) => sc.kind === "setEmployment" && sc.characterId === "char-2"
      )
    ).toBe(true);
    expect(result.targetMemory).toContain("雇佣");
  });
});

describe("work action", () => {
  it("check fails when not employed", () => {
    const ctx = makeCtx({ shops: [] });
    expect(workAction.check(ctx)).toBe(false);
  });

  it("check passes when employed and at shop node", () => {
    const shop: Shop = {
      id: "shop-1",
      worldId: "w1",
      nodeId: "node-store",
      ownerCharacterId: "char-1",
      goods: [],
      salary: 80,
    };
    const ctx = makeCtx({ self: makeChar({ id: "char-1" }), shops: [shop] });
    expect(workAction.check(ctx)).toBe(true);
  });
});

// ── sleep / move / rest 夜间导航测试 ──

/** 两个彼此可达的节点：广场上有酒馆，广场下有家 */
const plazaNode: MapNode = {
  id: "node-plaza", worldId: "w1", parentId: null,
  name: "广场", description: "镇中心",
  tags: ["public"], capacity: null, privacy: "public",
  visibleFromParent: true, shortcuts: [], isEntry: true,
};
const homeNode: MapNode = {
  id: "node-home", worldId: "w1", parentId: "node-plaza",
  name: "我的家", description: "温馨的小屋",
  tags: ["residence"], capacity: null, privacy: "private",
  visibleFromParent: true, shortcuts: [], isEntry: false,
};
const tavernNode: MapNode = {
  id: "node-tavern", worldId: "w1", parentId: "node-plaza",
  name: "酒馆", description: "热闹的酒馆",
  tags: ["dining"], capacity: null, privacy: "public",
  visibleFromParent: true, shortcuts: [], isEntry: false,
};

describe("sleep / move / rest 夜间导航", () => {
  it("sleep.check 不在住处时返回 false（即使处于睡眠窗口）", () => {
    const c = makeChar({ locationId: "node-tavern", restNodeId: "node-home" });
    const ctx = makeCtx({
      self: c,
      here: { ...tavernNode, id: c.locationId },
      reachable: [plazaNode, homeNode, tavernNode],
      isSleepHour: true,
      facts: { restNodeId: "node-home", restNodeName: "我的家", activityNodeId: null, activityNodeName: null, hoursAtCurrentLocation: 0, todayActionCounts: {}, todayChatTargets: {} },
    });
    expect(sleepAction.check(ctx)).toBe(false);
  });

  it("sleep.check 在住处且处于睡眠窗口时返回 true", () => {
    const c = makeChar({ locationId: "node-home", restNodeId: "node-home" });
    const ctx = makeCtx({
      self: c,
      here: { ...homeNode, id: c.locationId },
      reachable: [plazaNode, homeNode, tavernNode],
      isSleepHour: true,
      facts: { restNodeId: "node-home", restNodeName: "我的家", activityNodeId: null, activityNodeName: null, hoursAtCurrentLocation: 0, todayActionCounts: {}, todayChatTargets: {} },
    });
    expect(sleepAction.check(ctx)).toBe(true);
  });

  it("sleep.check 在住处但不在睡眠窗口时返回 false", () => {
    const c = makeChar({ locationId: "node-home", restNodeId: "node-home" });
    const ctx = makeCtx({
      self: c,
      here: { ...homeNode, id: c.locationId },
      reachable: [plazaNode, homeNode, tavernNode],
      isSleepHour: false,
      facts: { restNodeId: "node-home", restNodeName: "我的家", activityNodeId: null, activityNodeName: null, hoursAtCurrentLocation: 0, todayActionCounts: {}, todayChatTargets: {} },
    });
    expect(sleepAction.check(ctx)).toBe(false);
  });

  it("moveAction.hint 在疲劳 >=12 且 restNodeId 存在时包含回家提示", () => {
    const c = makeChar({
      locationId: "node-tavern",
      vitals: { hunger: 5, fatigue: 13, hygiene: 2 },
    });
    const ctx = makeCtx({
      self: c,
      here: { ...tavernNode, id: c.locationId },
      reachable: [plazaNode, homeNode, tavernNode],
      isSleepHour: true,
      facts: {
        restNodeId: "node-home",
        restNodeName: "我的家",
        activityNodeId: null,
        activityNodeName: null,
        hoursAtCurrentLocation: 1,
        todayActionCounts: {},
        todayChatTargets: {},
      },
    });
    const hints = moveAction.hint(ctx);
    const hintArr = Array.isArray(hints) ? hints : [];
    expect(hintArr.length).toBeGreaterThan(0);
    const homeHint = hintArr.find((h: any) => h.targetNodeId === "node-home");
    expect(homeHint).toBeDefined();
    expect(homeHint!.hint).toContain("休息");
  });

  it("moveAction.hint 在疲劳低时不包含回家提示", () => {
    const c = makeChar({
      locationId: "node-tavern",
      vitals: { hunger: 5, fatigue: 5, hygiene: 2 },
    });
    const ctx = makeCtx({
      self: c,
      here: { ...tavernNode, id: c.locationId },
      reachable: [plazaNode, homeNode, tavernNode],
      isSleepHour: false,
      facts: {
        restNodeId: "node-home",
        restNodeName: "我的家",
        activityNodeId: null,
        activityNodeName: null,
        hoursAtCurrentLocation: 1,
        todayActionCounts: {},
        todayChatTargets: {},
      },
    });
    const hints2 = moveAction.hint(ctx);
    const hintArr2 = Array.isArray(hints2) ? hints2 : [];
    const homeHint2 = hintArr2.find((h: any) => h.targetNodeId === "node-home");
    expect(homeHint2).toBeUndefined();
  });

  it("findPath 能从酒馆到家（通过广场）", () => {
    const path = findPath("node-tavern", "node-home", [plazaNode, homeNode, tavernNode]);
    expect(path).toBeDefined();
    expect(path).toEqual(["node-tavern", "node-plaza", "node-home"]);
  });

  it("findPath 从家到酒馆路径反向对称", () => {
    const path = findPath("node-home", "node-tavern", [plazaNode, homeNode, tavernNode]);
    expect(path).toEqual(["node-home", "node-plaza", "node-tavern"]);
  });
});
