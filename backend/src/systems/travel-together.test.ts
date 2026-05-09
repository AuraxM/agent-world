import { describe, it, expect, vi, beforeEach } from "vitest";
import { actionRegistry } from "../domain/index";
import { BUILTIN_ACTIONS } from "./index";

// Ensure actions are registered
actionRegistry.registerAll(BUILTIN_ACTIONS);

describe("travel_together action definition", () => {
  it("is registered in BUILTIN_ACTIONS", () => {
    const def = actionRegistry.get("travel_together");
    expect(def).toBeDefined();
    expect(def!.type).toBe("travel_together");
  });

  it("is usableInDialogue", () => {
    const def = actionRegistry.get("travel_together")!;
    expect(def.usableInDialogue).toBe(true);
  });

  it("is NOT available in normal decision (check returns false)", () => {
    const def = actionRegistry.get("travel_together")!;
    const ctx = minimalCtx();
    expect(def.check(ctx)).toBe(false);
  });

  it("appears in dialogue actions via getDialogueActions", () => {
    const def = actionRegistry.get("travel_together")!;
    const ctx = minimalCtx();
    const dialogueActions = actionRegistry.getDialogueActions(ctx);
    expect(dialogueActions.some(d => d.type === "travel_together")).toBe(true);
  });

  describe("validateParams", () => {
    const def = actionRegistry.get("travel_together")!;

    it("rejects missing target_node_id", () => {
      const ctx = minimalCtx();
      expect(def.validateParams!({ reason: "一起去玩" }, ctx)).toContain("target_node_id");
    });

    it("rejects missing reason", () => {
      const ctx = minimalCtx();
      expect(def.validateParams!({ target_node_id: "node-b" }, ctx)).toContain("reason");
    });

    it("rejects same node as current", () => {
      const ctx = minimalCtx();
      // "here" must also be reachable for the same-node check to trigger
      ctx.reachable.push({ id: "here", parentId: null, name: "Current Place", tags: [], shortcuts: [] });
      expect(def.validateParams!({ target_node_id: "here", reason: "走" }, ctx)).toContain("已经在目的地");
    });

    it("rejects unreachable node", () => {
      const ctx = minimalCtx();
      const err = def.validateParams!({ target_node_id: "unknown", reason: "走" }, ctx);
      expect(err).toBeTruthy();
    });

    it("accepts valid params", () => {
      const ctx = minimalCtx();
      const err = def.validateParams!({ target_node_id: "node-b", reason: "一起去吃饭" }, ctx);
      expect(err).toBeNull();
    });
  });
});

function minimalCtx() {
  return {
    worldId: "test",
    tick: 0,
    epoch: 1000000,
    self: {
      id: "char-a",
      name: "Alice",
      locationId: "here",
      money: 100,
      vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
      emotion: { mood: 0, stress: 0, social_satiety: 0 },
      shortMemory: [],
      activeConversationIds: [],
      lastConversationEndTick: 0,
      relations: {},
      impressionBook: {},
    },
    here: {
      id: "here",
      name: "Current Place",
      tags: [],
      shortcuts: [],
    },
    companions: [
      {
        id: "char-b",
        name: "Bob",
        locationId: "here",
        vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
        emotion: { mood: 0, stress: 0, social_satiety: 0 },
        currentAction: undefined,
        shortMemory: [],
        relations: {},
        impressionBook: {},
      },
    ],
    reachable: [
      {
        id: "node-b",
        parentId: "here",
        name: "Destination",
        tags: [],
        shortcuts: [],
      },
    ],
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
  } as any;
}
