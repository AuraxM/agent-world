import type { LayoutParams } from "./layout-types";
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
