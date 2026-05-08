import { describe, expect, it } from "vitest";
import {
  getTickWindow,
  groupEventsByTick,
  getOtherParticipants,
  tickRangeDesc,
  isSleepTick,
  getCategoryIcon,
  TICK_WIDTH,
  stackEventsAtTick,
} from "./gantt-utils";
import type { WorldEvent } from "@/types/api.generated";

function mkEvent(overrides: Partial<WorldEvent> = {}): WorldEvent {
  return {
    id: "evt-001",
    worldId: "w-1",
    tick: 100,
    category: "action",
    description: "test event",
    participants: ["char-a"],
    source: "actor",
    intensity: 1,
    scope: "node",
    duration: 1,
    ...overrides,
  };
}

describe("getTickWindow", () => {
  it("returns zero range for empty events", () => {
    expect(getTickWindow([])).toEqual({ startTick: 0, endTick: 0 });
  });

  it("returns window ending at max tick spanning tickCount", () => {
    const events = [
      mkEvent({ tick: 5 }),
      mkEvent({ tick: 100 }),
    ];
    expect(getTickWindow(events, 8)).toEqual({ startTick: 93, endTick: 100 });
  });

  it("clamps start to 0", () => {
    const events = [mkEvent({ tick: 3 })];
    expect(getTickWindow(events, 8)).toEqual({ startTick: 0, endTick: 3 });
  });

  it("single event with default window", () => {
    const events = [mkEvent({ tick: 42 })];
    expect(getTickWindow(events)).toEqual({ startTick: 35, endTick: 42 });
  });
});

describe("groupEventsByTick", () => {
  it("creates buckets for every tick in window descending", () => {
    const events: WorldEvent[] = [];
    const map = groupEventsByTick(events, "char-1", 95, 100);
    // 6 ticks: 100, 99, 98, 97, 96, 95
    expect(map.size).toBe(6);
    // order check via keys
    const keys = [...map.keys()];
    expect(keys[0]).toBe(100);
    expect(keys[keys.length - 1]).toBe(95);
  });

  it("assigns events to correct tick buckets", () => {
    const e1 = mkEvent({ tick: 98, participants: ["char-1"] });
    const e2 = mkEvent({ tick: 99, participants: ["char-2"] }); // other char
    const e3 = mkEvent({ tick: 97, participants: ["char-1"] });
    const map = groupEventsByTick([e1, e2, e3], "char-1", 97, 99);
    expect(map.get(99)).toEqual([]);
    expect(map.get(98)).toEqual([e1]);
    expect(map.get(97)).toEqual([e3]);
  });

  it("excludes events outside window", () => {
    const e1 = mkEvent({ tick: 50, participants: ["char-1"] });
    const map = groupEventsByTick([e1], "char-1", 95, 100);
    for (const evs of map.values()) {
      expect(evs).toHaveLength(0);
    }
  });
});

describe("getOtherParticipants", () => {
  it("returns empty when only the actor", () => {
    const event = mkEvent({ participants: ["char-a"] });
    const charById = new Map();
    expect(getOtherParticipants(event, charById, "char-a")).toEqual([]);
  });

  it("returns characters excluding the given ID", () => {
    const event = mkEvent({
      participants: ["char-a", "char-b", "char-c"],
    });
    const charById = new Map([
      ["char-b", { id: "char-b", name: "Bob" } as any],
      ["char-c", { id: "char-c", name: "Cal" } as any],
    ]);
    const others = getOtherParticipants(event, charById, "char-a");
    expect(others).toHaveLength(2);
    expect(others[0]!.name).toBe("Bob");
  });

  it("excludes given ID even when not first participant", () => {
    const event = mkEvent({
      participants: ["alice", "bob", "cal"],
    });
    const charById = new Map([
      ["alice", { id: "alice", name: "Alice" } as any],
      ["bob", { id: "bob", name: "Bob" } as any],
      ["cal", { id: "cal", name: "Cal" } as any],
    ]);
    // Bob's row — should exclude Bob, show Alice + Cal
    const others = getOtherParticipants(event, charById, "bob");
    expect(others).toHaveLength(2);
    expect(others.map((c) => c.id)).toEqual(["alice", "cal"]);
  });

  it("skips missing participants", () => {
    const event = mkEvent({
      participants: ["char-a", "char-b", "char-x"],
    });
    const charById = new Map([
      ["char-b", { id: "char-b", name: "Bob" } as any],
    ]);
    const others = getOtherParticipants(event, charById, "char-a");
    expect(others).toHaveLength(1);
    expect(others[0]!.name).toBe("Bob");
  });
});

describe("tickRangeDesc", () => {
  it("returns descending array", () => {
    expect(tickRangeDesc(97, 100)).toEqual([100, 99, 98, 97]);
  });

  it("single tick range", () => {
    expect(tickRangeDesc(5, 5)).toEqual([5]);
  });
});

describe("isSleepTick", () => {
  it("inside simple window", () => {
    expect(isSleepTick(2, { start: 0, duration: 8 })).toBe(true);
  });

  it("outside simple window", () => {
    expect(isSleepTick(14, { start: 0, duration: 8 })).toBe(false);
  });

  it("wrapped window (start 22, duration 8 -> 22-06)", () => {
    expect(isSleepTick(23, { start: 22, duration: 8 })).toBe(true);
    expect(isSleepTick(3, { start: 22, duration: 8 })).toBe(true);
    expect(isSleepTick(12, { start: 22, duration: 8 })).toBe(false);
  });
});

describe("getCategoryIcon", () => {
  it("maps known category", () => {
    expect(getCategoryIcon("action")).toBe("⚔️");
  });

  it("returns empty for unknown", () => {
    expect(getCategoryIcon("unknown" as any)).toBe("");
  });
});

describe("TICK_WIDTH", () => {
  it("is 100", () => {
    expect(TICK_WIDTH).toBe(100);
  });
});

describe("stackEventsAtTick", () => {
  it("returns empty for empty events", () => {
    expect(stackEventsAtTick([], 100)).toEqual([]);
  });

  it("assigns positions for events at different ticks", () => {
    const events = [
      mkEvent({ id: "e1", tick: 99 }),
      mkEvent({ id: "e2", tick: 98 }),
    ];
    const stacked = stackEventsAtTick(events, 100);
    expect(stacked).toHaveLength(2);
    expect(stacked[0]!.top).toBe(6);
    expect(stacked[1]!.top).toBe(6);
    expect(stacked[0]!.left).toBe(100);
    expect(stacked[1]!.left).toBe(200);
  });

  it("stacks events at same tick vertically", () => {
    const events = [
      mkEvent({ id: "e1", tick: 99 }),
      mkEvent({ id: "e2", tick: 99 }),
    ];
    const stacked = stackEventsAtTick(events, 100);
    expect(stacked).toHaveLength(2);
    expect(stacked[0]!.top).toBe(6);
    expect(stacked[1]!.top).toBe(58);
    expect(stacked[0]!.left).toBe(100);
    expect(stacked[1]!.left).toBe(100);
  });

  it("handles triple stack", () => {
    const events = [
      mkEvent({ id: "e1", tick: 99 }),
      mkEvent({ id: "e2", tick: 99 }),
      mkEvent({ id: "e3", tick: 99 }),
    ];
    const stacked = stackEventsAtTick(events, 100);
    expect(stacked).toHaveLength(3);
    expect(stacked[0]!.top).toBe(6);
    expect(stacked[1]!.top).toBe(58);
    expect(stacked[2]!.top).toBe(110);
  });
});
