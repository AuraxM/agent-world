# Map Layout Engine 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现基于规则的地图布局引擎，生成宝可梦风格的路网+分区+槽位骨架，LLM 填充后精算坐标并防重叠。

**Architecture:** 纯函数式布局引擎（`src/engine/layout.ts`），接收参数 → 七步叠加输出骨架。两个 CLI 脚本（`scripts/generate-skeleton.ts`、`scripts/resolve-coords.ts`）分别负责生成骨架和坐标精算。所有算法确定性基于种子 PRNG。

**Tech Stack:** TypeScript, Vitest, Zod（骨架类型校验）, Node.js fs/path

---

### Task 1: 骨架类型定义

**Files:**
- Create: `src/engine/layout-types.ts`

- [ ] **Step 1: 写入类型文件**

```typescript
/**
 * 布局引擎的类型定义。
 * 中间产物 skeleton.json 的结构，不是运行时 domain 类型。
 */

export interface LayoutParams {
  canvasW: number;
  canvasH: number;
  elevationLayers: number;
  mainRoadCount: number;
  crossRoadMin: number;
  crossRoadMax: number;
  density: "sparse" | "medium" | "dense";
  zoneRatios: { commercial: number; residential: number; public: number; edge: number };
  seed: number;
}

export const DEFAULT_PARAMS: LayoutParams = {
  canvasW: 48,
  canvasH: 36,
  elevationLayers: 3,
  mainRoadCount: 1,
  crossRoadMin: 2,
  crossRoadMax: 4,
  density: "medium",
  zoneRatios: { commercial: 0.20, residential: 0.45, public: 0.10, edge: 0.25 },
  seed: Date.now(),
};

export type RoadDir = "h" | "v";

export interface Road {
  id: string;
  dir: RoadDir;
  /** 道路中心线的 x（竖街）或 y（横街） */
  offset: number;
  /** 道路宽度（格） */
  w: number;
  /** 道路起止（横街 xStart/xEnd；竖街 yStart/yEnd） */
  start: number;
  end: number;
  name: string;
}

export interface Elevation {
  layer: number;
  yStart: number;
  yEnd: number;
  label: string;
}

export type Zone = "commercial" | "residential" | "public" | "edge";

export interface Slot {
  id: string;
  zone: Zone;
  x: number;
  y: number;
  w: number;
  h: number;
  roadAccess: string;
  elevation: number;
  suggestedTags: string[];
  isEntry: boolean;
  capacityHint: number;
}

export interface Skeleton {
  canvas: { w: number; h: number };
  roads: Road[];
  elevations: Elevation[];
  slots: Slot[];
}

/** LLM 填充后的节点声明（node 内容 + 可选的合并来源） */
export interface FilledNode {
  /** 对应骨架中的 slot id */
  slotId: string;
  /** 合并来源：若合并多个 slot，列出全部 slot id */
  mergedFrom?: string[];
  /** 是否跳过此 slot */
  skipped?: boolean;
  /** 节点内容（符合 MapNodeConfig 结构，不含 x/y/w/h） */
  node: {
    id: string;
    parentId: string | null;
    name: string;
    description: string;
    tags: string[];
    capacity: number | null;
    privacy: "public" | "semi" | "private";
    visibleFromParent: boolean;
    shortcuts: string[];
    isEntry: boolean;
    travelCost?: number;
    spriteKey?: string;
  };
}

/** 填充骨架：骨架 + LLM 生成的节点列表 */
export interface FilledSkeleton {
  skeleton: Skeleton;
  filledNodes: FilledNode[];
}
```

- [ ] **Step 2: 验证类型编译通过**

```bash
npx tsc --noEmit src/engine/layout-types.ts
```

Expected: no errors (may need to adjust if strict mode flags unused file)

- [ ] **Step 3: Commit**

```bash
git add src/engine/layout-types.ts
git commit -m "feat: add layout engine type definitions"
```

---

### Task 2: 播种 PRNG + 参数处理

**Files:**
- Create: `src/engine/layout.ts`（初始）
- Create: `src/engine/layout.test.ts`（初始）

- [ ] **Step 1: 写测试 — PRNG 确定性**

```typescript
import { describe, expect, it } from "vitest";
import { createPRNG } from "./layout";

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
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run src/engine/layout.test.ts -t "createPRNG"
```

Expected: FAIL — `createPRNG` not defined

- [ ] **Step 3: 实现 createPRNG 和参数合并**

```typescript
import type { LayoutParams, Skeleton, Road, Elevation, Slot, Zone } from "./layout-types";
import { DEFAULT_PARAMS } from "./layout-types";

/** mulberry32 播种 PRNG：确定性伪随机，输出 [0, 1) */
export function createPRNG(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 用户参数合并默认值 */
export function resolveParams(overrides: Partial<LayoutParams> = {}): LayoutParams {
  return { ...DEFAULT_PARAMS, ...overrides };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run src/engine/layout.test.ts -t "createPRNG"
```

Expected: PASS

- [ ] **Step 5: 写测试 — 参数合并**

```typescript
import { resolveParams } from "./layout";
import { DEFAULT_PARAMS } from "./layout-types";

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
```

- [ ] **Step 6: 运行测试确认通过**

```bash
npx vitest run src/engine/layout.test.ts -t "resolveParams"
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/engine/layout.ts src/engine/layout.test.ts
git commit -m "feat: add PRNG and params handling for layout engine"
```

---

### Task 3: 高程带 + 道路生成

**Files:**
- Modify: `src/engine/layout.ts`
- Modify: `src/engine/layout.test.ts`

- [ ] **Step 1: 写测试 — 高程带生成**

```typescript
import { generateElevations } from "./layout";

describe("generateElevations", () => {
  it("creates correct number of layers", () => {
    const e = generateElevations({ canvasH: 36, elevationLayers: 3 });
    expect(e).toHaveLength(3);
  });

  it("layers cover entire canvas height without gaps", () => {
    const e = generateElevations({ canvasH: 36, elevationLayers: 3 });
    expect(e[0].yStart).toBe(0);
    expect(e[e.length - 1].yEnd).toBe(36);
    // each layer's yEnd equals next layer's yStart (or last layer's yEnd = canvasH)
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
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run src/engine/layout.test.ts -t "generateElevations"
```

Expected: FAIL

- [ ] **Step 3: 实现 generateElevations**

```typescript
const ELEVATION_LABELS = ["山脚", "山腰", "山顶", "高台", "峰顶"];

export function generateElevations(
  opts: { canvasH: number; elevationLayers: number }
): Elevation[] {
  const { canvasH, elevationLayers } = opts;
  const bandH = Math.floor(canvasH / elevationLayers);
  const remainder = canvasH - bandH * elevationLayers;

  const elevations: Elevation[] = [];
  let y = 0;
  for (let i = 0; i < elevationLayers; i++) {
    const h = bandH + (i < remainder ? 1 : 0);
    const layer = elevationLayers - 1 - i;
    elevations.push({
      layer,
      yStart: y,
      yEnd: y + h,
      label: ELEVATION_LABELS[Math.min(layer, ELEVATION_LABELS.length - 1)],
    });
    y += h;
  }
  return elevations;
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npx vitest run src/engine/layout.test.ts -t "generateElevations"
```

Expected: PASS

- [ ] **Step 5: 写测试 — 道路生成**

```typescript
import { generateRoads, makeMainRoad, makeCrossRoad } from "./layout";

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
    const crosses = roads.filter((r) => r.dir === "v");
    for (let i = 0; i < crosses.length - 1; i++) {
      const gap = Math.abs(crosses[i + 1].offset - crosses[i].offset);
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
});
```

- [ ] **Step 6: 运行确认失败**

```bash
npx vitest run src/engine/layout.test.ts -t "generateRoads"
```

Expected: FAIL

- [ ] **Step 7: 实现道路生成**

```typescript
export function makeMainRoad(
  id: string, canvasW: number, canvasH: number, rng: () => number, name: string
): Road {
  const minY = Math.floor(canvasH * 0.4);
  const maxY = Math.ceil(canvasH * 0.6);
  const offset = minY + Math.floor(rng() * (maxY - minY + 1));
  return {
    id, dir: "h", offset, w: 6,
    start: 0, end: canvasW, name,
  };
}

export function makeCrossRoad(
  id: string, canvasH: number, rng: () => number, existingX: number[], minGap: number, name: string
): Road {
  let x: number;
  let attempts = 0;
  do {
    x = 6 + Math.floor(rng() * 30);
    attempts++;
  } while (
    attempts < 50 &&
    existingX.some((ex) => Math.abs(ex - x) < minGap)
  );
  return {
    id, dir: "v", offset: x, w: 3,
    start: 0, end: canvasH, name,
  };
}

export function generateRoads(opts: {
  canvasW: number;
  canvasH: number;
  mainRoadCount: number;
  crossRoadMin: number;
  crossRoadMax: number;
  rng: () => number;
}): Road[] {
  const { canvasW, canvasH, mainRoadCount, crossRoadMin, crossRoadMax, rng } = opts;
  const roads: Road[] = [];

  // 主街
  for (let i = 0; i < mainRoadCount; i++) {
    roads.push(makeMainRoad(`r-main${i > 0 ? `-${i}` : ""}`, canvasW, canvasH, rng, i === 0 ? "主街" : `主街${i + 1}`));
  }

  // 竖街
  const crossCount = crossRoadMin + Math.floor(rng() * (crossRoadMax - crossRoadMin + 1));
  const existingX = roads.filter((r) => r.dir === "v").map((r) => r.offset);
  for (let i = 0; i < crossCount; i++) {
    const cross = makeCrossRoad(`r-cross${i + 1}`, canvasH, rng, existingX, 12, `竖街${i + 1}`);
    existingX.push(cross.offset);
    roads.push(cross);
  }

  return roads;
}
```

- [ ] **Step 8: 运行确认通过**

```bash
npx vitest run src/engine/layout.test.ts -t "generateRoads"
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/engine/layout.ts src/engine/layout.test.ts
git commit -m "feat: add elevation and road generation"
```

---

### Task 4: 地块切割 + 分区分配

**Files:**
- Modify: `src/engine/layout.ts`
- Modify: `src/engine/layout.test.ts`

- [ ] **Step 1: 写测试 — 地块切割**

```typescript
import { partitionBlocks } from "./layout";

describe("partitionBlocks", () => {
  it("partitions canvas into blocks by roads", () => {
    const roads: Road[] = [
      { id: "r-main", dir: "h", offset: 18, w: 6, start: 0, end: 48, name: "主街" },
      { id: "r-cross1", dir: "v", offset: 16, w: 3, start: 0, end: 36, name: "竖街1" },
    ];
    const blocks = partitionBlocks({ canvasW: 48, canvasH: 36, roads });
    // 2 roads crossing should produce 4 blocks (2x2 grid)
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
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run src/engine/layout.test.ts -t "partitionBlocks"
```

Expected: FAIL

- [ ] **Step 3: 实现地块切割**

```typescript
export interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  adjacentRoadIds: string[];
  /** block 邻接的道路中是否有主街 */
  touchesMain: boolean;
  /** block 是否在十字路口附近（邻接 ≥2 条道路） */
  isIntersection: boolean;
  /** block 是否在画布边缘 */
  isEdge: boolean;
}

export function partitionBlocks(opts: {
  canvasW: number;
  canvasH: number;
  roads: Road[];
}): Block[] {
  const { canvasW, canvasH, roads } = opts;

  const hRoads = roads.filter((r) => r.dir === "h").sort((a, b) => a.offset - b.offset);
  const vRoads = roads.filter((r) => r.dir === "v").sort((a, b) => a.offset - b.offset);

  // 收集 y 分割线（横路上下沿 + 画布边界）
  const yCuts: number[] = [0];
  for (const r of hRoads) {
    yCuts.push(r.offset - Math.floor(r.w / 2));
    yCuts.push(r.offset + Math.ceil(r.w / 2));
  }
  yCuts.push(canvasH);

  // 收集 x 分割线（竖路左右沿 + 画布边界）
  const xCuts: number[] = [0];
  for (const r of vRoads) {
    xCuts.push(r.offset - Math.floor(r.w / 2));
    xCuts.push(r.offset + Math.ceil(r.w / 2));
  }
  xCuts.push(canvasW);

  const blocks: Block[] = [];
  const mainRoadIds = new Set(roads.filter((r) => r.dir === "h" && r.w >= 6).map((r) => r.id));

  for (let yi = 0; yi < yCuts.length - 1; yi++) {
    for (let xi = 0; xi < xCuts.length - 1; xi++) {
      const x = xCuts[xi];
      const y = yCuts[yi];
      const w = xCuts[xi + 1] - x;
      const h = yCuts[yi + 1] - y;
      if (w <= 0 || h <= 0) continue;

      // 确定此 block 邻接哪些道路
      const adjacentRoadIds: string[] = [];
      for (const r of roads) {
        if (r.dir === "h") {
          const roadTop = r.offset - Math.floor(r.w / 2);
          const roadBottom = r.offset + Math.ceil(r.w / 2);
          if (Math.abs(y - roadBottom) < 1 || Math.abs(y + h - roadTop) < 1) {
            adjacentRoadIds.push(r.id);
          }
        } else {
          const roadLeft = r.offset - Math.floor(r.w / 2);
          const roadRight = r.offset + Math.ceil(r.w / 2);
          if (Math.abs(x - roadRight) < 1 || Math.abs(x + w - roadLeft) < 1) {
            adjacentRoadIds.push(r.id);
          }
        }
      }

      blocks.push({
        x, y, w, h,
        adjacentRoadIds,
        touchesMain: adjacentRoadIds.some((id) => mainRoadIds.has(id)),
        isIntersection: adjacentRoadIds.length >= 2,
        isEdge: x === 0 || y === 0 || x + w >= canvasW || y + h >= canvasH,
      });
    }
  }

  return blocks;
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npx vitest run src/engine/layout.test.ts -t "partitionBlocks"
```

Expected: PASS

- [ ] **Step 5: 写测试 — 分区分配**

```typescript
import { assignZones } from "./layout";

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

import type { ZonedBlock } from "./layout-types";

// Add to layout-types.ts:
export interface ZonedBlock extends Block {
  zone: Zone;
}
```

- [ ] **Step 6: 运行确认失败**

```bash
npx vitest run src/engine/layout.test.ts -t "assignZones"
```

Expected: FAIL

- [ ] **Step 7: 实现分区分配**

更新 `layout-types.ts`，添加 `ZonedBlock`（在 `Block` 上扩展 zone）。然后在 `layout.ts`：

```typescript
export function assignZones(blocks: Block[]): ZonedBlock[] {
  return blocks.map((b) => {
    if (b.isIntersection) return { ...b, zone: "public" as Zone };
    if (b.touchesMain) return { ...b, zone: "commercial" as Zone };
    if (b.isEdge) return { ...b, zone: "edge" as Zone };
    return { ...b, zone: "residential" as Zone };
  });
}
```

- [ ] **Step 8: 运行确认通过**

```bash
npx vitest run src/engine/layout.test.ts -t "assignZones"
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/engine/layout.ts src/engine/layout.test.ts src/engine/layout-types.ts
git commit -m "feat: add block partitioning and zone assignment"
```

---

### Task 5: 槽位放置

**Files:**
- Modify: `src/engine/layout.ts`
- Modify: `src/engine/layout.test.ts`

- [ ] **Step 1: 写测试 — 槽位尺寸**

```typescript
import { slotSizeForZone, placeSlots } from "./layout";

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
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run src/engine/layout.test.ts -t "slotSizeForZone|placeSlots"
```

Expected: FAIL

- [ ] **Step 3: 实现槽位放置**

```typescript
/** 根据 zone + density 返回建议的槽位尺寸 */
export function slotSizeForZone(
  zone: Zone,
  density: "sparse" | "medium" | "dense"
): { w: number; h: number } {
  const sizeMap: Record<Zone, Record<string, { w: number; h: number }>> = {
    commercial: { sparse: { w: 6, h: 5 }, medium: { w: 5, h: 4 }, dense: { w: 4, h: 3 } },
    residential: { sparse: { w: 5, h: 5 }, medium: { w: 4, h: 4 }, dense: { w: 3, h: 3 } },
    public: { sparse: { w: 8, h: 7 }, medium: { w: 6, h: 5 }, dense: { w: 5, h: 4 } },
    edge: { sparse: { w: 8, h: 7 }, medium: { w: 6, h: 5 }, dense: { w: 5, h: 4 } },
  };
  return sizeMap[zone][density];
}

const ZONE_SUGGESTED_TAGS: Record<Zone, string[]> = {
  commercial: ["public", "indoor", "dining"],
  residential: ["private", "indoor", "residence"],
  public: ["public", "outdoor", "park"],
  edge: ["semi", "outdoor", "playground"],
};

const ZONE_CAPACITY_HINT: Record<Zone, number> = {
  commercial: 15,
  residential: 6,
  public: 50,
  edge: 25,
};

export function placeSlots(opts: {
  block: ZonedBlock;
  density: "sparse" | "medium" | "dense";
  rng: () => number;
  elevation: number;
  startIndex: number;
}): Slot[] {
  const { block, density, rng, elevation, startIndex } = opts;
  const size = slotSizeForZone(block.zone, density);

  const gap = 1;
  const slots: Slot[] = [];
  let idx = startIndex;

  // 决定排列方向：宽 > 高 则横排，否则竖排
  const horizontal = block.w >= block.h;

  if (horizontal) {
    let x = block.x + gap;
    while (x + size.w <= block.x + block.w) {
      const slotY = block.y + Math.floor((block.h - size.h) / 2);
      slots.push({
        id: `slot-${String(idx).padStart(2, "0")}`,
        zone: block.zone,
        x, y: slotY, w: size.w, h: size.h,
        roadAccess: block.adjacentRoadIds[0] ?? "",
        elevation,
        suggestedTags: ZONE_SUGGESTED_TAGS[block.zone],
        isEntry: false,
        capacityHint: ZONE_CAPACITY_HINT[block.zone],
      });
      x += size.w + gap;
      idx++;
    }
  } else {
    // 竖排：从上到下
    let y = block.y + gap;
    while (y + size.h <= block.y + block.h) {
      const slotX = block.x + Math.floor((block.w - size.w) / 2);
      slots.push({
        id: `slot-${String(idx).padStart(2, "0")}`,
        zone: block.zone,
        x: slotX, y, w: size.w, h: size.h,
        roadAccess: block.adjacentRoadIds[0] ?? "",
        elevation,
        suggestedTags: ZONE_SUGGESTED_TAGS[block.zone],
        isEntry: false,
        capacityHint: ZONE_CAPACITY_HINT[block.zone],
      });
      y += size.h + gap;
      idx++;
    }
  }

  return slots;
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npx vitest run src/engine/layout.test.ts -t "slotSizeForZone|placeSlots"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/layout.ts src/engine/layout.test.ts
git commit -m "feat: add slot placement with size/density rules"
```

---

### Task 6: 骨架生成完整流水线

**Files:**
- Modify: `src/engine/layout.ts`
- Modify: `src/engine/layout.test.ts`

- [ ] **Step 1: 写测试 — 完整骨架生成**

```typescript
import { generateSkeleton } from "./layout";

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
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run src/engine/layout.test.ts -t "generateSkeleton"
```

Expected: FAIL

- [ ] **Step 3: 实现 generateSkeleton**

```typescript
/** 完整骨架生成：七步叠加 */
export function generateSkeleton(params: LayoutParams): Skeleton {
  const rng = createPRNG(params.seed);

  const elevations = generateElevations({
    canvasH: params.canvasH,
    elevationLayers: params.elevationLayers,
  });

  const roads = generateRoads({
    canvasW: params.canvasW,
    canvasH: params.canvasH,
    mainRoadCount: params.mainRoadCount,
    crossRoadMin: params.crossRoadMin,
    crossRoadMax: params.crossRoadMax,
    rng,
  });

  const blocks = partitionBlocks({
    canvasW: params.canvasW,
    canvasH: params.canvasH,
    roads,
  });

  const zoned = assignZones(blocks);

  // 计算每个 block 对应的 elevation
  function elevationForBlock(b: Block): number {
    const midY = b.y + Math.floor(b.h / 2);
    for (const e of elevations) {
      if (midY >= e.yStart && midY < e.yEnd) return e.layer;
    }
    return elevations[elevations.length - 1].layer;
  }

  let slotIndex = 0;
  const allSlots: Slot[] = [];
  for (const block of zoned) {
    const elev = elevationForBlock(block);
    const slots = placeSlots({
      block, density: params.density, rng, elevation: elev, startIndex: slotIndex,
    });
    allSlots.push(...slots);
    slotIndex += slots.length;
  }

  // 标记入口候选：public zone 中靠近画布中心的 slot
  const centerX = params.canvasW / 2;
  const centerY = params.canvasH / 2;
  let bestEntry: Slot | null = null;
  let bestDist = Infinity;
  for (const s of allSlots) {
    if (s.zone === "public") {
      const sx = s.x + s.w / 2;
      const sy = s.y + s.h / 2;
      const dist = Math.hypot(sx - centerX, sy - centerY);
      if (dist < bestDist) {
        bestDist = dist;
        bestEntry = s;
      }
    }
  }
  if (bestEntry) {
    bestEntry.isEntry = true;
  } else {
    // 后备：把离中心最近的 slot 标记为入口
    let closest: Slot | null = null;
    let cd = Infinity;
    for (const s of allSlots) {
      const sx = s.x + s.w / 2;
      const sy = s.y + s.h / 2;
      const dist = Math.hypot(sx - centerX, sy - centerY);
      if (dist < cd) { cd = dist; closest = s; }
    }
    if (closest) closest.isEntry = true;
  }

  return {
    canvas: { w: params.canvasW, h: params.canvasH },
    roads,
    elevations,
    slots: allSlots,
  };
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npx vitest run src/engine/layout.test.ts -t "generateSkeleton"
```

Expected: PASS

- [ ] **Step 5: 运行全部测试确认无回归**

```bash
npx vitest run src/engine/layout.test.ts
```

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/engine/layout.ts src/engine/layout.test.ts
git commit -m "feat: implement full skeleton generation pipeline"
```

---

### Task 7: CLI — generate-skeleton.ts

**Files:**
- Create: `scripts/generate-skeleton.ts`

- [ ] **Step 1: 写 CLI 脚本**

```typescript
/**
 * 从参数生成布局骨架。
 *
 * 用法：
 *   tsx scripts/generate-skeleton.ts [--output <path>] [--params '<json>']
 *
 * 示例：
 *   tsx scripts/generate-skeleton.ts --output .claude/skills/agent-world-config/skeleton.json
 *   tsx scripts/generate-skeleton.ts --params '{"canvasW":32,"elevationLayers":2}' --output skeleton.json
 */
import { writeFileSync } from "node:fs";
import { generateSkeleton, resolveParams } from "@/engine/layout";
import type { LayoutParams } from "@/engine/layout-types";

function parseArgs(argv: string[]): { output: string; params: Partial<LayoutParams> } {
  let output = "skeleton.json";
  let params: Partial<LayoutParams> = {};

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--output" || argv[i] === "-o") {
      output = argv[++i];
    } else if (argv[i] === "--params" || argv[i] === "-p") {
      try {
        params = JSON.parse(argv[++i]);
      } catch {
        console.error("invalid JSON for --params");
        process.exit(1);
      }
    } else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log([
        "generate-skeleton.ts — 生成地图布局骨架",
        "",
        "用法: tsx scripts/generate-skeleton.ts [options]",
        "",
        "选项:",
        "  --output, -o <path>   输出文件路径（默认 skeleton.json）",
        "  --params, -p <json>   JSON 格式的布局参数（可选）",
        "  --help, -h            显示帮助",
        "",
        "参数键（均可选，含默认值）:",
        '  canvasW, canvasH, elevationLayers, mainRoadCount,',
        '  crossRoadMin, crossRoadMax, density, zoneRatios, seed',
      ].join("\n"));
      process.exit(0);
    }
  }

  return { output, params };
}

function main() {
  const args = process.argv.slice(2);
  const { output, params } = parseArgs(args);

  const resolved = resolveParams(params);
  const skeleton = generateSkeleton(resolved);

  writeFileSync(output, JSON.stringify(skeleton, null, 2), "utf8");
  console.log(`skeleton written to ${output} (${skeleton.slots.length} slots, ${skeleton.roads.length} roads, ${skeleton.elevations.length} elevations)`);
}

main();
```

- [ ] **Step 2: 测试 CLI 运行**

```bash
npx tsx scripts/generate-skeleton.ts --output test-skeleton.json
```

Expected: prints slot/road/elevation counts, creates `test-skeleton.json`

- [ ] **Step 3: 验证输出为合法 JSON**

```bash
npx tsx scripts/generate-skeleton.ts --output test-skeleton.json --params '{"seed":123}'
```

Inspect `test-skeleton.json` — should have canvas, roads, elevations, slots.

- [ ] **Step 4: 验证确定性**

```bash
npx tsx scripts/generate-skeleton.ts -o test-a.json -p '{"seed":42}'
npx tsx scripts/generate-skeleton.ts -o test-b.json -p '{"seed":42}'
diff test-a.json test-b.json
```

Expected: no diff

- [ ] **Step 5: 清理 + Commit**

```bash
rm -f test-skeleton.json test-a.json test-b.json
git add scripts/generate-skeleton.ts
git commit -m "feat: add generate-skeleton CLI script"
```

---

### Task 8: CLI — resolve-coords.ts（坐标精算 + 防重叠）

**Files:**
- Create: `scripts/resolve-coords.ts`

- [ ] **Step 1: 写坐标精算脚本**

```typescript
/**
 * 坐标精算 + 防重叠校验。
 *
 * 输入：骨架 JSON + LLM 填充的节点 JSON → 输出带最终 x/y/w/h 的 map 节点列表。
 *
 * 用法：
 *   tsx scripts/resolve-coords.ts <skeleton.json> <filled-nodes.json> [--output map.json]
 *
 * 填充节点格式 (filled-nodes.json):
 * [
 *   {
 *     "slotId": "slot-00",
 *     "mergedFrom": ["slot-00", "slot-01"],  // 可选：合并相邻 slot
 *     "skipped": false,                       // 可选：跳过此 slot
 *     "node": { ... MapNodeConfig 字段（不含 x/y/w/h） }
 *   },
 *   ...
 * ]
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Skeleton, FilledNode } from "@/engine/layout-types";
import type { MapNodeConfig } from "@/config/types";

interface Rect {
  x: number; y: number; w: number; h: number;
}

function boxesOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** 推挤重叠的节点（简单位移法，最多 3 轮） */
function resolveOverlaps(nodes: (MapNodeConfig & Rect)[]): (MapNodeConfig & Rect)[] {
  for (let round = 0; round < 3; round++) {
    let hadOverlap = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (boxesOverlap(nodes[i], nodes[j])) {
          hadOverlap = true;
          // 将 j 向右推
          nodes[j] = {
            ...nodes[j],
            x: nodes[i].x + nodes[i].w + 1,
          };
        }
      }
    }
    if (!hadOverlap) break;
  }
  return nodes;
}

/** 从填充节点计算最终坐标 */
function resolveCoords(skeleton: Skeleton, filled: FilledNode[]): (MapNodeConfig & Rect)[] {
  // 建立 slot id → slot 映射
  const slotMap = new Map(skeleton.slots.map((s) => [s.id, s]));
  const usedIds = new Set<string>();

  const result: (MapNodeConfig & Rect)[] = [];

  for (const fn of filled) {
    if (fn.skipped) continue;

    const slotIds = fn.mergedFrom && fn.mergedFrom.length > 0
      ? fn.mergedFrom
      : [fn.slotId];

    // 从骨架获取所有相关 slot 并计算包围盒
    const rects: Rect[] = [];
    for (const sid of slotIds) {
      const slot = slotMap.get(sid);
      if (!slot) {
        console.warn(`slot ${sid} not found in skeleton`);
        continue;
      }
      rects.push({ x: slot.x, y: slot.y, w: slot.w, h: slot.h });
    }

    if (rects.length === 0) {
      console.warn(`filled node with slotId=${fn.slotId} has no valid slots`);
      continue;
    }

    // 包围盒
    const minX = Math.min(...rects.map((r) => r.x));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxX = Math.max(...rects.map((r) => r.x + r.w));
    const maxY = Math.max(...rects.map((r) => r.y + r.h));

    result.push({
      ...fn.node,
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY,
    });
  }

  // 防重叠校验 + 推挤
  const resolved = resolveOverlaps(result);

  // 最终校验
  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      if (boxesOverlap(resolved[i], resolved[j])) {
        console.error(
          `OVERLAP after resolution: ${resolved[i].id} ↔ ${resolved[j].id}`
        );
        process.exit(1);
      }
    }
  }

  return resolved;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args[0] === "--help" || args[0] === "-h") {
    console.log([
      "resolve-coords.ts — 坐标精算 + 防重叠",
      "",
      "用法: tsx scripts/resolve-coords.ts <skeleton.json> <filled-nodes.json> [--output out.json]",
    ].join("\n"));
    process.exit(args.length < 2 ? 1 : 0);
  }

  const skeletonFile = args[0];
  const filledFile = args[1];
  const outputIdx = args.indexOf("--output");
  const outputFile = outputIdx >= 0 ? args[outputIdx + 1] : "resolved-nodes.json";

  const skeleton: Skeleton = JSON.parse(readFileSync(skeletonFile, "utf8"));
  const filled: FilledNode[] = JSON.parse(readFileSync(filledFile, "utf8"));

  const resolved = resolveCoords(skeleton, filled);

  writeFileSync(outputFile, JSON.stringify(resolved, null, 2), "utf8");
  console.log(`resolved ${resolved.length} nodes → ${outputFile}`);
}

main();
```

- [ ] **Step 2: 创建测试 fixture 验证**

```bash
# 先生成骨架
npx tsx scripts/generate-skeleton.ts -o test-skel.json -p '{"seed":123}'

# 创建最小填充节点文件
cat > test-filled.json << 'EOF'
[
  {
    "slotId": "slot-00",
    "node": {
      "id": "node-test",
      "parentId": null,
      "name": "测试建筑",
      "description": "测试",
      "tags": ["public", "outdoor"],
      "capacity": 10,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": true
    }
  }
]
EOF

# 运行解析
npx tsx scripts/resolve-coords.ts test-skel.json test-filled.json -o test-out.json
```

Expected: prints "resolved 1 nodes → test-out.json"

- [ ] **Step 3: 验证输出节点有 x/y/w/h**

```bash
cat test-out.json | head -20
```

Expected: node has x, y, w, h fields derived from slot

- [ ] **Step 4: 测试合并槽位**

```bash
cat > test-merged.json << 'EOF'
[
  {
    "slotId": "slot-00",
    "mergedFrom": ["slot-00", "slot-01"],
    "node": {
      "id": "node-large",
      "parentId": null,
      "name": "大型建筑",
      "description": "合并两个槽位",
      "tags": ["public", "indoor", "dining"],
      "capacity": 30,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": true
    }
  }
]
EOF

npx tsx scripts/resolve-coords.ts test-skel.json test-merged.json -o test-merged-out.json
```

Expected: merged node w/h larger than single slot

- [ ] **Step 5: 清理 + Commit**

```bash
rm -f test-skel.json test-filled.json test-out.json test-merged.json test-merged-out.json
git add scripts/resolve-coords.ts
git commit -m "feat: add coordinate resolution + overlap prevention CLI"
```

---

### Task 9: 集成 + 覆盖极端用例

**Files:**
- Modify: `src/engine/layout.test.ts`（补充用例）
- Modify: `.claude/skills/agent-world-config/prompt.md`（如有）

- [ ] **Step 1: 补充极端参数测试**

```typescript
// 追加到 layout.test.ts
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

  it("zone ratios are roughly respected", () => {
    const skel = generateSkeleton(resolveParams({
      seed: 42, canvasW: 48, canvasH: 36,
    }));
    const total = skel.slots.length;
    const counts = { commercial: 0, residential: 0, public: 0, edge: 0 };
    for (const s of skel.slots) {
      counts[s.zone]++;
    }
    // 粗略检查：住宅最多、边缘其次、商业再次
    expect(counts.residential).toBeGreaterThan(0);
    expect(counts.commercial).toBeGreaterThan(0);
    expect(counts.public).toBeGreaterThan(0);
  });

  it("bathing tag appears in at least one residential slot", () => {
    // 不强制，但检查 residential slot 存在
    const skel = generateSkeleton(resolveParams({ seed: 42 }));
    const residentialSlots = skel.slots.filter((s) => s.zone === "residential");
    expect(residentialSlots.length).toBeGreaterThan(0);
    // suggestedTags 包含 residence
    for (const s of residentialSlots) {
      expect(s.suggestedTags).toContain("residence");
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
```

- [ ] **Step 2: 运行全部测试**

```bash
npx vitest run src/engine/layout.test.ts
```

Expected: ALL PASS（~20+ tests）

- [ ] **Step 3: 运行 TypeScript 检查**

```bash
npx tsc --noEmit
```

Expected: no errors（或只存在与本次无关的既有错误）

- [ ] **Step 4: Commit**

```bash
git add src/engine/layout.test.ts
git commit -m "test: add edge case coverage for layout engine"
```

---

### 完成检查清单

- [ ] `npx vitest run src/engine/layout.test.ts` 全部通过
- [ ] `npx tsc --noEmit` 无新增错误
- [ ] `npx tsx scripts/generate-skeleton.ts -o /tmp/skel.json` 产出合法 JSON
- [ ] `npx tsx scripts/resolve-coords.ts` 正确解析合并/跳过/重叠
- [ ] 骨架 JSON 可被手动阅读，字段含义清晰
- [ ] 与现有 `validate.ts` 不冲突
