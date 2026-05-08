import { describe, expect, it } from "vitest";
import {
  assignZones,
  createPRNG,
  generateElevations,
  generateRoads,
  generateSkeleton,
  makeCrossRoad,
  partitionBlocks,
  placeSlots,
  resolveParams,
  slotSizeForZone,
} from "./layout";
import type { Block, Road, Zone, ZonedBlock } from "./layout-types";
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

describe("partitionBlocks", () => {
  it("partitions canvas into blocks by roads", () => {
    const roads: Road[] = [
      { id: "r-main", dir: "h", offset: 18, w: 6, start: 0, end: 48, name: "主街" },
      { id: "r-cross1", dir: "v", offset: 16, w: 3, start: 0, end: 36, name: "竖街1" },
    ];
    const blocks = partitionBlocks({ canvasW: 48, canvasH: 36, roads });
    expect(blocks.length).toBeGreaterThanOrEqual(4);
  });

  it("each block is defined by valid coordinates", () => {
    const roads: Road[] = [
      { id: "r-main", dir: "h", offset: 18, w: 6, start: 0, end: 48, name: "主街" },
    ];
    const blocks = partitionBlocks({ canvasW: 48, canvasH: 36, roads });
    for (const b of blocks) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(48);
      expect(b.y + b.h).toBeLessThanOrEqual(36);
      expect(b.w).toBeGreaterThan(0);
      expect(b.h).toBeGreaterThan(0);
    }
  });

  it("no overlapping blocks", () => {
    const roads: Road[] = [
      { id: "r-main", dir: "h", offset: 18, w: 6, start: 0, end: 48, name: "主街" },
      { id: "r-cross1", dir: "v", offset: 16, w: 3, start: 0, end: 36, name: "竖街1" },
      { id: "r-cross2", dir: "v", offset: 32, w: 3, start: 0, end: 36, name: "竖街2" },
    ];
    const blocks = partitionBlocks({ canvasW: 48, canvasH: 36, roads });
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i];
        const b = blocks[j];
        const overlapX = a.x < b.x + b.w && a.x + a.w > b.x;
        const overlapY = a.y < b.y + b.h && a.y + a.h > b.y;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });
});

describe("assignZones", () => {
  it("assigns commercial to blocks touching main road", () => {
    const blocks: Block[] = [
      { x: 2, y: 2, w: 14, h: 13, adjacentRoadIds: ["r-main"], touchesMain: true, isIntersection: false, isEdge: false },
    ];
    const zoned = assignZones(blocks);
    expect(zoned[0].zone).toBe("commercial");
  });

  it("assigns public to intersection blocks", () => {
    const blocks: Block[] = [
      { x: 2, y: 2, w: 14, h: 13, adjacentRoadIds: ["r-main", "r-cross1"], touchesMain: true, isIntersection: true, isEdge: false },
    ];
    const zoned = assignZones(blocks);
    expect(zoned[0].zone).toBe("public");
  });

  it("assigns edge to canvas boundary blocks", () => {
    const blocks: Block[] = [
      { x: 0, y: 2, w: 6, h: 13, adjacentRoadIds: [], touchesMain: false, isIntersection: false, isEdge: true },
    ];
    const zoned = assignZones(blocks);
    expect(zoned[0].zone).toBe("edge");
  });

  it("assigns residential to interior blocks", () => {
    const blocks: Block[] = [
      { x: 2, y: 2, w: 14, h: 13, adjacentRoadIds: [], touchesMain: false, isIntersection: false, isEdge: false },
    ];
    const zoned = assignZones(blocks);
    expect(zoned[0].zone).toBe("residential");
  });
});

describe("slotSizeForZone", () => {
  it.each([
    ["commercial", "medium", { w: 5, h: 4 }],
    ["residential", "medium", { w: 4, h: 4 }],
    ["public", "medium", { w: 6, h: 5 }],
    ["edge", "medium", { w: 6, h: 5 }],
    ["commercial", "dense", { w: 4, h: 3 }],
    ["residential", "dense", { w: 3, h: 3 }],
    ["commercial", "sparse", { w: 6, h: 5 }],
  ] as const)("%s zone %s density → %s", (zone, density, expected) => {
    const size = slotSizeForZone(zone as Zone, density);
    expect(size).toEqual(expected);
  });
});

describe("placeSlots", () => {
  it("places slots without overlap within a block", () => {
    const rng = createPRNG(42);
    const block: ZonedBlock = {
      x: 2, y: 14, w: 16, h: 6,
      adjacentRoadIds: ["r-main"], touchesMain: true,
      isIntersection: false, isEdge: false,
      zone: "commercial",
    };
    const slots = placeSlots({ block, density: "medium", rng, elevation: 1, startIndex: 0 });
    expect(slots.length).toBeGreaterThan(0);
    // 所有 slot 在 block 内
    for (const s of slots) {
      expect(s.x).toBeGreaterThanOrEqual(block.x);
      expect(s.y).toBeGreaterThanOrEqual(block.y);
      expect(s.x + s.w).toBeLessThanOrEqual(block.x + block.w + 1);
      expect(s.y + s.h).toBeLessThanOrEqual(block.y + block.h + 1);
    }
    // 不重叠
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i];
        const b = slots[j];
        const noXOverlap = a.x + a.w + 1 <= b.x || b.x + b.w + 1 <= a.x;
        const noYOverlap = a.y + a.h + 1 <= b.y || b.y + b.h + 1 <= a.y;
        expect(noXOverlap || noYOverlap).toBe(true);
      }
    }
  });

  it("dense density creates more slots than sparse", () => {
    const block: ZonedBlock = {
      x: 2, y: 2, w: 20, h: 10,
      adjacentRoadIds: [], touchesMain: false,
      isIntersection: false, isEdge: false,
      zone: "residential",
    };
    const sparse = placeSlots({ block, density: "sparse", rng: createPRNG(1), elevation: 0, startIndex: 0 });
    const dense = placeSlots({ block, density: "dense", rng: createPRNG(1), elevation: 0, startIndex: 0 });
    expect(dense.length).toBeGreaterThan(sparse.length);
  });

  it("each slot has unique id", () => {
    const block: ZonedBlock = {
      x: 2, y: 2, w: 16, h: 8,
      adjacentRoadIds: ["r-main"], touchesMain: true,
      isIntersection: false, isEdge: false,
      zone: "commercial",
    };
    const slots = placeSlots({ block, density: "medium", rng: createPRNG(42), elevation: 0, startIndex: 5 });
    const ids = slots.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(slots[0].id).toBe("slot-05");
  });
});

describe("generateSkeleton", () => {
  const params = resolveParams({ seed: 42 });

  it("produces skeleton with all required sections", () => {
    const skel = generateSkeleton(params);
    expect(skel.canvas).toBeDefined();
    expect(skel.roads.length).toBeGreaterThan(0);
    expect(skel.elevations.length).toBe(params.elevationLayers);
    expect(skel.slots.length).toBeGreaterThan(0);
  });

  it("canvas size matches params", () => {
    const skel = generateSkeleton(params);
    expect(skel.canvas.w).toBe(params.canvasW);
    expect(skel.canvas.h).toBe(params.canvasH);
  });

  it("at least one slot is entry-ready (public zone at intersection)", () => {
    const skel = generateSkeleton(params);
    // entry 标记由 LLM 填筑阶段设为 isEntry: true，
    // 这里只检查有 public slot 可以做入口
    const publicSlots = skel.slots.filter((s) => s.zone === "public");
    expect(publicSlots.length).toBeGreaterThan(0);
  });

  it("no overlapping slots", () => {
    const skel = generateSkeleton(params);
    for (let i = 0; i < skel.slots.length; i++) {
      for (let j = i + 1; j < skel.slots.length; j++) {
        const a = skel.slots[i];
        const b = skel.slots[j];
        const noXOverlap = a.x + a.w + 1 <= b.x || b.x + b.w + 1 <= a.x;
        const noYOverlap = a.y + a.h + 1 <= b.y || b.y + b.h + 1 <= a.y;
        expect(noXOverlap || noYOverlap).toBe(true);
      }
    }
  });

  it("deterministic — same seed gives same skeleton", () => {
    const a = generateSkeleton(resolveParams({ seed: 123 }));
    const b = generateSkeleton(resolveParams({ seed: 123 }));
    expect(a).toEqual(b);
  });

  it("different seed gives different skeleton", () => {
    const a = generateSkeleton(resolveParams({ seed: 111 }));
    const b = generateSkeleton(resolveParams({ seed: 222 }));
    expect(a).not.toEqual(b);
  });

  it("works with extreme small canvas", () => {
    const skel = generateSkeleton(resolveParams({
      seed: 42, canvasW: 24, canvasH: 18,
      crossRoadMin: 0, crossRoadMax: 0,
    }));
    expect(skel.slots.length).toBeGreaterThan(0);
  });
});

describe("edge cases", () => {
  it("minimal canvas (16x12) with one main road", () => {
    const skel = generateSkeleton(resolveParams({
      seed: 1, canvasW: 16, canvasH: 12,
      mainRoadCount: 1, crossRoadMin: 0, crossRoadMax: 0,
    }));
    expect(skel.slots.length).toBeGreaterThan(0);
    // 所有 slot 在 canvas 内
    for (const s of skel.slots) {
      expect(s.x + s.w).toBeLessThanOrEqual(16);
      expect(s.y + s.h).toBeLessThanOrEqual(12);
    }
  });

  it("dense density fits more slots than canvas", () => {
    const skel = generateSkeleton(resolveParams({
      seed: 5, canvasW: 48, canvasH: 36, density: "dense",
    }));
    // 至少有一些 slot
    expect(skel.slots.length).toBeGreaterThanOrEqual(4);
  });

  it("each slot has a valid zone hint (final semantics decided by LLM)", () => {
    const skel = generateSkeleton(resolveParams({
      seed: 42, canvasW: 48, canvasH: 36,
    }));
    const validZones = new Set(["commercial", "residential", "public", "edge"]);
    expect(skel.slots.length).toBeGreaterThan(0);
    for (const s of skel.slots) {
      expect(validZones.has(s.zone)).toBe(true);
    }
    // Note: zone is a topology-derived hint. The LLM rewrites zone semantics
    // during fill (e.g., a "public" slot may become a residential plaza),
    // so the engine does not enforce a particular zone-mix ratio.
  });

  it("every slot carries non-empty suggestedTags as LLM fill hints", () => {
    const skel = generateSkeleton(resolveParams({ seed: 42 }));
    expect(skel.slots.length).toBeGreaterThan(0);
    for (const s of skel.slots) {
      expect(Array.isArray(s.suggestedTags)).toBe(true);
      expect(s.suggestedTags.length).toBeGreaterThan(0);
    }
  });

  it("all slots have valid elevation reference", () => {
    const skel = generateSkeleton(resolveParams({ seed: 42 }));
    const validLayers = new Set(skel.elevations.map((e) => e.layer));
    for (const s of skel.slots) {
      expect(validLayers.has(s.elevation)).toBe(true);
    }
  });
});
