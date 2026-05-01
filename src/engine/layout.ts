import type { Elevation, LayoutParams, Road } from "./layout-types";
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
