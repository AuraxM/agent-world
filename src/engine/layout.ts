import type { Block, Elevation, LayoutParams, Road, Skeleton, Slot, Zone, ZonedBlock } from "./layout-types";
import { DEFAULT_PARAMS } from "./layout-types";

const CROSS_ROAD_EDGE_MARGIN = 6;
const MAX_PLACEMENT_ATTEMPTS = 50;

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
  id: string,
  canvasW: number,
  canvasH: number,
  rng: () => number,
  existingX: number[],
  minGap: number,
  name: string
): Road | null {
  const range = canvasW - 2 * CROSS_ROAD_EDGE_MARGIN;
  if (range <= 0) return null;

  for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
    const x = CROSS_ROAD_EDGE_MARGIN + Math.floor(rng() * range);
    if (existingX.every((ex) => Math.abs(ex - x) >= minGap)) {
      return {
        id, dir: "v", offset: x, w: 3,
        start: 0, end: canvasH, name,
      };
    }
  }
  return null;
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
    const cross = makeCrossRoad(
      `r-cross${i + 1}`, canvasW, canvasH, rng, existingX, 12, `竖街${i + 1}`
    );
    if (cross === null) continue;
    existingX.push(cross.offset);
    roads.push(cross);
  }

  return roads;
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

  // 识别哪些 x/y 区间属于道路本身，应该跳过
  const xRoadSpans = new Set(
    vRoads.map((r) => `${r.offset - Math.floor(r.w / 2)}:${r.offset + Math.ceil(r.w / 2)}`)
  );
  const yRoadSpans = new Set(
    hRoads.map((r) => `${r.offset - Math.floor(r.w / 2)}:${r.offset + Math.ceil(r.w / 2)}`)
  );

  for (let yi = 0; yi < yCuts.length - 1; yi++) {
    for (let xi = 0; xi < xCuts.length - 1; xi++) {
      const x = xCuts[xi];
      const y = yCuts[yi];
      const w = xCuts[xi + 1] - x;
      const h = yCuts[yi + 1] - y;
      if (w <= 0 || h <= 0) continue;
      // 跳过道路本体所占的网格条带
      if (xRoadSpans.has(`${x}:${x + w}`)) continue;
      if (yRoadSpans.has(`${y}:${y + h}`)) continue;

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

export function assignZones(blocks: Block[]): ZonedBlock[] {
  return blocks.map((b) => {
    if (b.isIntersection) return { ...b, zone: "public" as Zone };
    if (b.touchesMain) return { ...b, zone: "commercial" as Zone };
    if (b.isEdge) return { ...b, zone: "edge" as Zone };
    return { ...b, zone: "residential" as Zone };
  });
}

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
  const { block, density, rng: _rng, elevation, startIndex } = opts;
  // rng 暂未使用，保留参数以便未来引入抖动 (jitter)
  void _rng;
  const size = slotSizeForZone(block.zone, density);

  const gap = 1;
  const slots: Slot[] = [];
  let idx = startIndex;

  // 决定排列方向：宽 > 高 则横排，否则竖排
  const horizontal = block.w >= block.h;

  if (horizontal) {
    if (size.h > block.h) return [];
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
    if (size.w > block.w) return [];
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
