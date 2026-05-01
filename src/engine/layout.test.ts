import { describe, expect, it } from "vitest";
import { createPRNG, resolveParams } from "./layout";
import { DEFAULT_PARAMS } from "./layout-types";

describe("createPRNG", () => {
  it("same seed produces same sequence", () => {
    const rng1 = createPRNG(42);
    const rng2 = createPRNG(42);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  it("different seeds produce different sequences", () => {
    const rng1 = createPRNG(42);
    const rng2 = createPRNG(99);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).not.toEqual(seq2);
  });

  it("outputs values in [0, 1)", () => {
    const rng = createPRNG(123);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("resolveParams", () => {
  it("returns defaults when no overrides", () => {
    const p = resolveParams();
    expect(p).toEqual(DEFAULT_PARAMS);
  });

  it("merges partial overrides", () => {
    const p = resolveParams({ canvasW: 24, density: "dense" });
    expect(p.canvasW).toBe(24);
    expect(p.density).toBe("dense");
    expect(p.canvasH).toBe(DEFAULT_PARAMS.canvasH);
  });

  it("seed override is respected", () => {
    const p = resolveParams({ seed: 999 });
    expect(p.seed).toBe(999);
  });
});
