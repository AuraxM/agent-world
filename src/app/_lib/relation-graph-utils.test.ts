import { describe, expect, it } from "vitest";
import {
  affectionColor,
  buildGraphData,
  computeRadialPositions,
  hasBidirectional,
  nodeRadius,
} from "./relation-graph-utils";
import type { Character, Relation } from "@/domain/types";
import type { ObjectiveRelationKind } from "@/domain/enums";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkChar(overrides: Partial<Character> & { id: string; name: string }): Character {
  return {
    worldId: "w1",
    avatar: "",
    origin: "native",
    age: 30,
    gender: "other",
    profession: "farmer",
    money: 100,
    incomeLevel: 2,
    expenseExempt: false,
    relations: {},
    ...overrides,
  } as Character;
}

function mkRelation(overrides: Partial<Relation> = {}): Relation {
  return {
    kinds: ["friend" as ObjectiveRelationKind],
    affection: 0,
    since: 0,
    lastInteractionTick: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildGraphData
// ---------------------------------------------------------------------------

describe("buildGraphData", () => {
  it("returns empty nodes/links for empty input", () => {
    const result = buildGraphData([]);
    expect(result.nodes).toEqual([]);
    expect(result.links).toEqual([]);
  });

  it("builds nodes with correct relationCount for each character", () => {
    const chars = [
      mkChar({ id: "a", name: "Alice", relations: { b: mkRelation(), c: mkRelation() } }),
      mkChar({ id: "b", name: "Bob", relations: { a: mkRelation() } }),
    ];
    const result = buildGraphData(chars);
    expect(result.nodes).toHaveLength(2);
    const alice = result.nodes.find((n) => n.id === "a")!;
    const bob = result.nodes.find((n) => n.id === "b")!;
    expect(alice.relationCount).toBe(2);
    expect(bob.relationCount).toBe(1);
  });

  it("sets node name and avatar from character", () => {
    const chars = [
      mkChar({ id: "a", name: "Alice", avatar: "alice.png" }),
    ];
    const result = buildGraphData(chars);
    expect(result.nodes[0].name).toBe("Alice");
    expect(result.nodes[0].avatar).toBe("alice.png");
  });

  it("defaults avatar to empty string when undefined", () => {
    const chars = [
      mkChar({ id: "a", name: "Alice", avatar: undefined }),
    ];
    const result = buildGraphData(chars);
    expect(result.nodes[0].avatar).toBe("");
  });

  it("builds links from relations with correct source/target/affection/kinds", () => {
    const chars = [
      mkChar({
        id: "a",
        name: "Alice",
        relations: {
          b: mkRelation({ affection: 3, kinds: ["friend" as ObjectiveRelationKind] }),
        },
      }),
      mkChar({ id: "b", name: "Bob" }),
    ];
    const result = buildGraphData(chars);
    expect(result.links).toHaveLength(1);
    expect(result.links[0]).toMatchObject({
      source: "a",
      target: "b",
      affection: 3,
      kinds: ["friend"],
    });
  });

  it("filters out relations to non-existent characters (ghost targets)", () => {
    const chars = [
      mkChar({
        id: "a",
        name: "Alice",
        relations: {
          ghost: mkRelation({ affection: 1 }),
          b: mkRelation({ affection: 2 }),
        },
      }),
      mkChar({ id: "b", name: "Bob" }),
    ];
    const result = buildGraphData(chars);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].target).toBe("b");
  });

  it("preserves note field on links", () => {
    const chars = [
      mkChar({
        id: "a",
        name: "Alice",
        relations: {
          b: mkRelation({ note: "小时候欺负过我" }),
        },
      }),
      mkChar({ id: "b", name: "Bob" }),
    ];
    const result = buildGraphData(chars);
    expect(result.links[0].note).toBe("小时候欺负过我");
  });

  it("sets note to undefined when not provided", () => {
    const chars = [
      mkChar({
        id: "a",
        name: "Alice",
        relations: { b: mkRelation() },
      }),
      mkChar({ id: "b", name: "Bob" }),
    ];
    const result = buildGraphData(chars);
    expect(result.links[0].note).toBeUndefined();
  });

  it("handles characters with no relations (relationCount=0)", () => {
    const chars = [
      mkChar({ id: "a", name: "Alice", relations: {} }),
      mkChar({ id: "b", name: "Bob", relations: {} }),
    ];
    const result = buildGraphData(chars);
    expect(result.links).toHaveLength(0);
    expect(result.nodes.every((n) => n.relationCount === 0)).toBe(true);
  });

  it("handles multiple mutual relations correctly", () => {
    const chars = [
      mkChar({
        id: "a",
        name: "Alice",
        relations: {
          b: mkRelation({ affection: 2, kinds: ["friend" as ObjectiveRelationKind] }),
          c: mkRelation({ affection: -1, kinds: ["colleague" as ObjectiveRelationKind] }),
        },
      }),
      mkChar({ id: "b", name: "Bob", relations: {} }),
      mkChar({ id: "c", name: "Carol", relations: {} }),
    ];
    const result = buildGraphData(chars);
    expect(result.links).toHaveLength(2);
    expect(result.nodes.find((n) => n.id === "a")!.relationCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// affectionColor
// ---------------------------------------------------------------------------

describe("affectionColor", () => {
  it("returns green rgba for positive affection", () => {
    expect(affectionColor(1)).toBe("rgba(34,197,94,0.40)");
    expect(affectionColor(2)).toBe("rgba(34,197,94,0.60)");
    expect(affectionColor(3)).toBe("rgba(34,197,94,0.80)");
    expect(affectionColor(4)).toBe("rgba(34,197,94,1.00)");
  });

  it("returns red rgba for negative affection", () => {
    expect(affectionColor(-1)).toBe("rgba(239,68,68,0.40)");
    expect(affectionColor(-2)).toBe("rgba(239,68,68,0.60)");
    expect(affectionColor(-3)).toBe("rgba(239,68,68,0.80)");
    expect(affectionColor(-4)).toBe("rgba(239,68,68,1.00)");
  });

  it("returns gray for zero affection", () => {
    expect(affectionColor(0)).toBe("rgba(156,163,175,0.5)");
  });

  it("alpha at |affection|=1 is 0.4", () => {
    expect(affectionColor(1)).toContain("0.40");
    expect(affectionColor(-1)).toContain("0.40");
  });

  it("alpha at |affection|=4 is 1.0", () => {
    expect(affectionColor(4)).toContain("1.00");
    expect(affectionColor(-4)).toContain("1.00");
  });
});

// ---------------------------------------------------------------------------
// nodeRadius
// ---------------------------------------------------------------------------

describe("nodeRadius", () => {
  it("returns 14 for zero relations", () => {
    expect(nodeRadius(0, 10)).toBe(14);
  });

  it("returns 28 for maxCount relations", () => {
    expect(nodeRadius(10, 10)).toBe(28);
  });

  it("returns value between 14 and 28 for intermediate relationCount", () => {
    const r = nodeRadius(5, 10);
    expect(r).toBeGreaterThan(14);
    expect(r).toBeLessThan(28);
  });

  it("returns 14 when maxCount is 0 (avoid division by zero)", () => {
    expect(nodeRadius(5, 0)).toBe(14);
  });

  it("uses area-proportional scaling: sqrt(196 + 588 * t)", () => {
    // t=0 -> sqrt(196) = 14
    expect(nodeRadius(0, 10)).toBeCloseTo(14, 5);
    // t=0.5 -> sqrt(196 + 294) = sqrt(490) ≈ 22.1359
    expect(nodeRadius(5, 10)).toBeCloseTo(Math.sqrt(490), 5);
    // t=1 -> sqrt(196 + 588) = sqrt(784) = 28
    expect(nodeRadius(10, 10)).toBeCloseTo(28, 5);
  });

  it("returns monotonically increasing radius with relationCount", () => {
    const r1 = nodeRadius(1, 10);
    const r2 = nodeRadius(2, 10);
    const r3 = nodeRadius(3, 10);
    expect(r1).toBeLessThan(r2);
    expect(r2).toBeLessThan(r3);
  });
});

// ---------------------------------------------------------------------------
// hasBidirectional
// ---------------------------------------------------------------------------

describe("hasBidirectional", () => {
  const linkAB = { source: "a", target: "b", affection: 1, kinds: ["friend" as ObjectiveRelationKind] };
  const linkBA = { source: "b", target: "a", affection: 2, kinds: ["friend" as ObjectiveRelationKind] };
  const linkAC = { source: "a", target: "c", affection: 1, kinds: ["friend" as ObjectiveRelationKind] };

  it("returns true when reverse link exists (A->B and B->A)", () => {
    expect(hasBidirectional(linkAB, [linkAB, linkBA])).toBe(true);
    expect(hasBidirectional(linkBA, [linkAB, linkBA])).toBe(true);
  });

  it("returns false for one-way link", () => {
    expect(hasBidirectional(linkAB, [linkAB, linkAC])).toBe(false);
    expect(hasBidirectional(linkAC, [linkAB, linkAC])).toBe(false);
  });

  it("returns false for empty links array", () => {
    expect(hasBidirectional(linkAB, [])).toBe(false);
  });

  it("returns false when only the same link exists (no reverse)", () => {
    expect(hasBidirectional(linkAB, [linkAB])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeRadialPositions
// ---------------------------------------------------------------------------

describe("computeRadialPositions", () => {
  const centerX = 400;
  const centerY = 300;
  const radius = 100;

  it("places focus node at center (exact coordinates)", () => {
    const graphData = {
      nodes: [
        { id: "a", name: "Alice", avatar: "", relationCount: 2 },
        { id: "b", name: "Bob", avatar: "", relationCount: 1 },
      ],
      links: [
        { source: "a", target: "b", affection: 2, kinds: ["friend" as ObjectiveRelationKind] },
      ],
    };
    const positions = computeRadialPositions("a", graphData, centerX, centerY, radius);
    const focusPos = positions.get("a")!;
    expect(focusPos.x).toBe(centerX);
    expect(focusPos.y).toBe(centerY);
  });

  it("positions related nodes around center", () => {
    const graphData = {
      nodes: [
        { id: "a", name: "Alice", avatar: "", relationCount: 2 },
        { id: "b", name: "Bob", avatar: "", relationCount: 1 },
        { id: "c", name: "Carol", avatar: "", relationCount: 1 },
      ],
      links: [
        { source: "a", target: "b", affection: 2, kinds: ["friend" as ObjectiveRelationKind] },
        { source: "a", target: "c", affection: 1, kinds: ["friend" as ObjectiveRelationKind] },
      ],
    };
    const positions = computeRadialPositions("a", graphData, centerX, centerY, radius);
    const posB = positions.get("b")!;
    const posC = positions.get("c")!;
    // Both should be at some distance from center
    const distB = Math.hypot(posB.x - centerX, posB.y - centerY);
    const distC = Math.hypot(posC.x - centerX, posC.y - centerY);
    expect(distB).toBeGreaterThan(0);
    expect(distC).toBeGreaterThan(0);
    // Both should be at different angles
    expect(posB).not.toEqual(posC);
  });

  it("positive affection nodes are closer (radius*0.7) than negative (radius*1.3)", () => {
    const graphData = {
      nodes: [
        { id: "a", name: "Alice", avatar: "", relationCount: 2 },
        { id: "b", name: "Bob", avatar: "", relationCount: 1 },
        { id: "c", name: "Carol", avatar: "", relationCount: 1 },
      ],
      links: [
        { source: "a", target: "b", affection: 3, kinds: ["friend" as ObjectiveRelationKind] },
        { source: "a", target: "c", affection: -3, kinds: ["friend" as ObjectiveRelationKind] },
      ],
    };
    const positions = computeRadialPositions("a", graphData, centerX, centerY, radius);
    const distB = Math.hypot(positions.get("b")!.x - centerX, positions.get("b")!.y - centerY);
    const distC = Math.hypot(positions.get("c")!.x - centerX, positions.get("c")!.y - centerY);
    expect(distB).toBeCloseTo(radius * 0.7, 5);
    expect(distC).toBeCloseTo(radius * 1.3, 5);
  });

  it("zero affection nodes use exact radius", () => {
    const graphData = {
      nodes: [
        { id: "a", name: "Alice", avatar: "", relationCount: 1 },
        { id: "b", name: "Bob", avatar: "", relationCount: 1 },
      ],
      links: [
        { source: "a", target: "b", affection: 0, kinds: ["acquaintance" as ObjectiveRelationKind] },
      ],
    };
    const positions = computeRadialPositions("a", graphData, centerX, centerY, radius);
    const distB = Math.hypot(positions.get("b")!.x - centerX, positions.get("b")!.y - centerY);
    expect(distB).toBeCloseTo(radius, 5);
  });

  it("returns only focus position when focus node has no outgoing relations", () => {
    const graphData = {
      nodes: [
        { id: "a", name: "Alice", avatar: "", relationCount: 0 },
        { id: "b", name: "Bob", avatar: "", relationCount: 1 },
      ],
      links: [
        // Bob has a link to Alice, but not the other way around
        { source: "b", target: "a", affection: 1, kinds: ["friend" as ObjectiveRelationKind] },
      ],
    };
    const positions = computeRadialPositions("a", graphData, centerX, centerY, radius);
    expect(positions.size).toBe(1);
    expect(positions.has("a")).toBe(true);
    expect(positions.get("a")!.x).toBe(centerX);
    expect(positions.get("a")!.y).toBe(centerY);
  });

  it("sorts neighbors by affection descending (highest affection first angle)", () => {
    const graphData = {
      nodes: [
        { id: "a", name: "Alice", avatar: "", relationCount: 3 },
        { id: "b", name: "Bob", avatar: "", relationCount: 1 },
        { id: "c", name: "Carol", avatar: "", relationCount: 1 },
        { id: "d", name: "Dave", avatar: "", relationCount: 1 },
      ],
      links: [
        { source: "a", target: "b", affection: 1, kinds: ["friend" as ObjectiveRelationKind] },
        { source: "a", target: "c", affection: 4, kinds: ["friend" as ObjectiveRelationKind] },
        { source: "a", target: "d", affection: -2, kinds: ["friend" as ObjectiveRelationKind] },
      ],
    };
    const positions = computeRadialPositions("a", graphData, centerX, centerY, radius);
    // Carol (affection=4) should be at angle 0 (first, -PI/2),
    // Bob (affection=1) at angleStep, Dave (affection=-2) at 2*angleStep
    const angleStep = (2 * Math.PI) / 3;
    const posC = positions.get("c")!;
    const posB = positions.get("b")!;
    const posD = positions.get("d")!;

    const angleC = Math.atan2(posC.y - centerY, posC.x - centerX);
    const angleB = Math.atan2(posB.y - centerY, posB.x - centerX);
    const angleD = Math.atan2(posD.y - centerY, posD.x - centerX);

    // Carol (highest) at -PI/2
    expect(angleC).toBeCloseTo(-Math.PI / 2, 5);
    // Bob (middle) at -PI/2 + angleStep
    expect(angleB).toBeCloseTo(-Math.PI / 2 + angleStep, 5);
    // Dave (lowest) at -PI/2 + 2*angleStep
    expect(angleD).toBeCloseTo(-Math.PI / 2 + 2 * angleStep, 5);
  });
});
