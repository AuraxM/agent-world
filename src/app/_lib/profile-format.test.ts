import { describe, expect, it } from "vitest";
import { vitalThreshold } from "./profile-format";

describe("vitalThreshold", () => {
  it("returns ok when value below warn", () => {
    expect(vitalThreshold(5, 10, 6)).toBe("ok");
  });

  it("returns warn at exactly warn threshold", () => {
    expect(vitalThreshold(6, 10, 6)).toBe("warn");
  });

  it("returns warn between warn and danger", () => {
    expect(vitalThreshold(8, 10, 6)).toBe("warn");
  });

  it("returns danger at exactly danger threshold", () => {
    expect(vitalThreshold(10, 10, 6)).toBe("danger");
  });

  it("returns danger above danger threshold", () => {
    expect(vitalThreshold(15, 10, 6)).toBe("danger");
  });

  it("returns ok at zero", () => {
    expect(vitalThreshold(0, 10, 6)).toBe("ok");
  });
});
