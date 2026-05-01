import { describe, expect, it } from "vitest";
import {
  createPRNG,
  generateElevations,
  generateRoads,
  makeCrossRoad,
  makeMainRoad,
  resolveParams,
} from "./layout";
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

describe("generateElevations", () => {
  it("creates correct number of layers", () => {
    const e = generateElevations({ canvasH: 36, elevationLayers: 3 });
    expect(e).toHaveLength(3);
  });

  it("layers cover entire canvas height without gaps", () => {
    const e = generateElevations({ canvasH: 36, elevationLayers: 3 });
    expect(e[0].yStart).toBe(0);
    expect(e[e.length - 1].yEnd).toBe(36);
    for (let i = 0; i < e.length - 1; i++) {
      expect(e[i].yEnd).toBe(e[i + 1].yStart);
    }
  });

  it("layer 0 has highest layer number (top of canvas)", () => {
    const e = generateElevations({ canvasH: 36, elevationLayers: 3 });
    expect(e[0].layer).toBe(2);
    expect(e[1].layer).toBe(1);
    expect(e[2].layer).toBe(0);
  });

  it("single layer map", () => {
    const e = generateElevations({ canvasH: 24, elevationLayers: 1 });
    expect(e).toHaveLength(1);
    expect(e[0].yStart).toBe(0);
    expect(e[0].yEnd).toBe(24);
  });
});

describe("generateRoads", () => {
  it("creates correct number of main + cross roads", () => {
    const rng = createPRNG(42);
    const roads = generateRoads({
      canvasW: 48,
      canvasH: 36,
      mainRoadCount: 1,
      crossRoadMin: 2,
      crossRoadMax: 3,
      rng,
    });
    const mains = roads.filter((r) => r.dir === "h");
    const crosses = roads.filter((r) => r.dir === "v");
    expect(mains).toHaveLength(1);
    expect(crosses.length).toBeGreaterThanOrEqual(2);
    expect(crosses.length).toBeLessThanOrEqual(3);
  });

  it("main road is horizontal and spans full width", () => {
    const rng = createPRNG(42);
    const roads = generateRoads({
      canvasW: 48, canvasH: 36,
      mainRoadCount: 1, crossRoadMin: 0, crossRoadMax: 0,
      rng,
    });
    const main = roads.find((r) => r.dir === "h")!;
    expect(main.start).toBe(0);
    expect(main.end).toBe(48);
    expect(main.offset).toBeGreaterThanOrEqual(14); // ~40% of 36
    expect(main.offset).toBeLessThanOrEqual(22);    // ~60% of 36
  });

  it("cross roads are vertical and span full height", () => {
    const rng = createPRNG(42);
    const roads = generateRoads({
      canvasW: 48, canvasH: 36,
      mainRoadCount: 1, crossRoadMin: 2, crossRoadMax: 2,
      rng,
    });
    const crosses = roads.filter((r) => r.dir === "v");
    expect(crosses).toHaveLength(2);
    for (const c of crosses) {
      expect(c.start).toBe(0);
      expect(c.end).toBe(36);
    }
  });

  it("cross roads are at least 12 units apart", () => {
    const rng = createPRNG(42);
    const roads = generateRoads({
      canvasW: 48, canvasH: 36,
      mainRoadCount: 1, crossRoadMin: 3, crossRoadMax: 3,
      rng,
    });
    const sortedOffsets = roads
      .filter((r) => r.dir === "v")
      .map((c) => c.offset)
      .sort((a, b) => a - b);
    for (let i = 0; i < sortedOffsets.length - 1; i++) {
      const gap = sortedOffsets[i + 1] - sortedOffsets[i];
      expect(gap).toBeGreaterThanOrEqual(12);
    }
  });

  it("deterministic with same seed", () => {
    const rng1 = createPRNG(42);
    const rng2 = createPRNG(42);
    const roads1 = generateRoads({
      canvasW: 48, canvasH: 36,
      mainRoadCount: 1, crossRoadMin: 2, crossRoadMax: 4,
      rng: rng1,
    });
    const roads2 = generateRoads({
      canvasW: 48, canvasH: 36,
      mainRoadCount: 1, crossRoadMin: 2, crossRoadMax: 4,
      rng: rng2,
    });
    expect(roads1).toEqual(roads2);
  });

  it("makeCrossRoad returns null when no valid placement exists", () => {
    const rng = createPRNG(1);
    // Densely packed existing positions with minGap=12 leave no valid x in [6, 42).
    const existingX = [12, 25, 38];
    const result = makeCrossRoad("r-test", 48, 36, rng, existingX, 12, "test");
    expect(result).toBeNull();
  });
});
