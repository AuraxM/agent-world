import { describe, it, expect } from "vitest";
import {
  getUpcoming,
  getTodayEntries,
  getNextHourEntries,
  formatRelativeTime,
  formatScheduledTime,
  describeEntries,
  tickFromDayHourMinute,
} from "./notebook";
import type { NotebookEntry } from "@/domain/types";
import { TICKS_PER_HOUR } from "@/domain/enums";

// Epoch at midnight UTC
const EPOCH = new Date("2026-05-01T00:00:00Z").getTime();

function makeEntry(scheduledTick: number, content: string): NotebookEntry {
  return { id: `nbe-${scheduledTick}`, scheduledTick, content, createdAt: 0 };
}

describe("getUpcoming", () => {
  const entries = [
    makeEntry(10, "a"),
    makeEntry(50, "b"),
    makeEntry(100, "c"),
  ];

  it("returns entries in range inclusive", () => {
    const result = getUpcoming(entries, 10, 50);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("a");
    expect(result[1].content).toBe("b");
  });

  it("returns empty when none in range", () => {
    const result = getUpcoming(entries, 200, 300);
    expect(result).toHaveLength(0);
  });
});

describe("getTodayEntries", () => {
  it("returns entries within 24 game hours from current tick", () => {
    // 24 game hours = 24 * TICKS_PER_HOUR = 120 ticks
    // Range: [20, 20 + 120] = [20, 140]
    const entries = [
      makeEntry(30, "soon"),
      makeEntry(80, "later same day"),
      makeEntry(200, "next day"),
    ];
    const result = getTodayEntries(entries, 20);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("soon");
    expect(result[1].content).toBe("later same day");
  });
});

describe("getNextHourEntries", () => {
  it("returns entries within 5 ticks (1 game hour)", () => {
    const entries = [
      makeEntry(3, "soon"),
      makeEntry(10, "later"),
    ];
    const result = getNextHourEntries(entries, 0);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("soon");
  });
});

describe("formatRelativeTime", () => {
  it("shows only HH:MM for same day", () => {
    const result = formatRelativeTime(30, 0, EPOCH);
    expect(result).toBe("06:00");
  });

  it("shows day prefix for different day", () => {
    const result = formatRelativeTime(130, 0, EPOCH);
    expect(result).toMatch(/^第1日 /);
  });
});

describe("formatScheduledTime", () => {
  it("always shows day prefix", () => {
    const result = formatScheduledTime(30, EPOCH);
    expect(result).toBe("第0日 06:00");
  });
});

describe("describeEntries", () => {
  it("returns empty string for no entries", () => {
    expect(describeEntries([], 0, EPOCH)).toBe("");
  });

  it("formats entries with relative time", () => {
    const entries = [
      makeEntry(30, "a task"),
      makeEntry(60, "another task"),
    ];
    const result = describeEntries(entries, 0, EPOCH);
    expect(result).toContain("今日待办");
    expect(result).toContain("06:00 — a task");
    expect(result).toContain("12:00 — another task");
  });
});

describe("tickFromDayHourMinute", () => {
  it("converts midnight epoch references", () => {
    const tick = tickFromDayHourMinute(0, 6, 0, EPOCH);
    expect(tick).toBe(30); // 6h * 5 ticks/h
  });

  it("converts cross-day reference", () => {
    const tick = tickFromDayHourMinute(1, 6, 0, EPOCH);
    expect(tick).toBe(150); // (24+6) * 5
  });

  it("rounds minutes to nearest tick", () => {
    const tick = tickFromDayHourMinute(0, 6, 5, EPOCH);
    expect(tick).toBe(30); // 6h05 ≈ 6h00 at 12min granularity
  });
});
