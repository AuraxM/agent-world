import { describe, it, expect } from "vitest";
import { computeDriftReport } from "./check-types-fresh";

describe("computeDriftReport", () => {
  it("returns clean when before and after are identical", () => {
    const r = computeDriftReport({ before: "const X = 1;", after: "const X = 1;" });
    expect(r.drifted).toBe(false);
  });

  it("reports drift when after differs", () => {
    const r = computeDriftReport({ before: "const X = 1;", after: "const X = 2;" });
    expect(r.drifted).toBe(true);
    expect(r.message).toContain("api.generated.ts");
  });
});
