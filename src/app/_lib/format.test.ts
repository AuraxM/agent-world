import { describe, expect, it } from "vitest";
import { formatGameTime, formatHHMM, formatDay } from "./format";

describe("formatGameTime", () => {
  it("tick 0 = 2026/05/01 00:00", () => {
    expect(formatGameTime(0)).toBe("2026/05/01 00:00");
  });

  it("tick 5 = 1 hour later", () => {
    expect(formatGameTime(5)).toBe("2026/05/01 01:00");
  });

  it("tick 7 = 1h24m later", () => {
    expect(formatGameTime(7)).toBe("2026/05/01 01:24");
  });

  it("tick 120 = 24h later, next day", () => {
    expect(formatGameTime(120)).toBe("2026/05/02 00:00");
  });
});

describe("formatHHMM", () => {
  it("tick 0 = 00:00", () => {
    expect(formatHHMM(0)).toBe("00:00");
  });

  it("tick 5 = 01:00", () => {
    expect(formatHHMM(5)).toBe("01:00");
  });

  it("tick 7 = 01:24", () => {
    expect(formatHHMM(7)).toBe("01:24");
  });
});

describe("formatDay", () => {
  it("tick 0 = 2026/05/01", () => {
    expect(formatDay(0)).toBe("2026/05/01");
  });

  it("tick 120 = 2026/05/02", () => {
    expect(formatDay(120)).toBe("2026/05/02");
  });

  it("does not cross day at 119 ticks", () => {
    expect(formatDay(119)).toBe("2026/05/01");
  });
});
