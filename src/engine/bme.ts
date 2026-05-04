/**
 * BME (Basal Metabolic Equivalent) 核心计算模块。
 *
 * 所有生理/经济数值的推导锚点：
 *   BME = metabolicBase(age) × healthFactor(health)
 *
 * 导出：
 *   - computeBME(age, health) → BME
 *   - characterBME(c: Character) → BME
 *   - getMDC()              → 每日最低生存成本（默认 20）
 *   - setMDC(v)             → 覆写 MDC
 *   - getEatCost(mdc?)      → 吃饭价格
 *   - getBatheCost(mdc?)    → 洗澡价格
 *   - getVitalBaseRate(vital)  → 生理消耗 baseRate
 *   - dailyVitalDecay(vital, bme) → 每日生理衰减量
 *   - getTierMultiplier(tier) → tier → multiplier
 *   - getTierDailyIncome(bme, tier, mdc?) → 日收入
 *   - getTierInitialMoney(tier, mdc?) → 初始资金
 *   - getMoodDecayRate(tf)   → mood 回归速率
 *   - getSocialDecayRate(ei) → social_satiety 每日衰减
 *   - getSocialGainPerInteraction(ei) → 单次社交获得
 *   - getSicknessBaseDuration(health) → 疾病基础持续天数
 */
import type { Character } from "@/domain/types";

/** 代谢基数由年龄决定 */
function metabolicBase(age: number): number {
  if (age <= 12) return 0.6;
  if (age <= 17) return 0.85;
  if (age <= 50) return 1.0;
  if (age <= 65) return 0.9;
  return 0.75;
}

/** 健康修正系数 */
function healthFactor(health: number): number {
  const map: Record<number, number> = { 1: 1.4, 2: 1.2, 3: 1.0, 4: 0.85 };
  return map[health] ?? 1.0;
}

/** 计算 BME */
export function computeBME(age: number, health: number): number {
  return metabolicBase(age) * healthFactor(health);
}

/** 从 Character 计算 BME */
export function characterBME(c: Character): number {
  return computeBME(c.age, c.health ?? 2);
}

/** 每日最低生存成本（mod 可覆写）。默认 20。 */
let _mdc = 20;
export function getMDC(): number { return _mdc; }
export function setMDC(v: number) { _mdc = v; }

/** 生存行动价格 */
export function getEatCost(mdc = _mdc): number { return Math.round(mdc * 0.75); }
export function getBatheCost(mdc = _mdc): number { return Math.round(mdc * 0.25); }

/** 生理值 baseRate (/天) */
export function getVitalBaseRate(vital: "hunger" | "fatigue" | "hygiene"): number {
  const rates = { hunger: 1.0, fatigue: 1.2, hygiene: 0.8 };
  return rates[vital];
}

/** 每日生理衰减量 = BME × baseRate */
export function dailyVitalDecay(vital: "hunger" | "fatigue" | "hygiene", bme: number): number {
  return bme * getVitalBaseRate(vital);
}

/** tier → multiplier */
const TIER_MULTIPLIERS: Record<number, number> = { 0: 0, 1: 1.0, 2: 1.5, 3: 2.5, 4: 4.0 };
export function getTierMultiplier(tier: number): number {
  return TIER_MULTIPLIERS[tier] ?? 0;
}

/** 日收入 = BME × tierMultiplier × MDC */
export function getTierDailyIncome(bme: number, tier: number, mdc = _mdc): number {
  return Math.round(bme * getTierMultiplier(tier) * mdc);
}

/** 初始资金 = MDC × 7 × tierMultiplier, min MDC × 7 */
export function getTierInitialMoney(tier: number, mdc = _mdc): number {
  const base = mdc * 7;
  return Math.max(base, Math.round(base * getTierMultiplier(tier)));
}

/** mood 向 0 回归速率 (/天) = 1 / (3 + |TF|) */
export function getMoodDecayRate(tf: number): number {
  return 1.0 / (3 + Math.abs(tf));
}

/** social_satiety 每日衰减 = 0.4 + (EI + 4) × 0.075 */
export function getSocialDecayRate(ei: number): number {
  return 0.4 + (ei + 4) * 0.075;
}

/** 每次社交获得 = 1.2 - |EI| × 0.1 */
export function getSocialGainPerInteraction(ei: number): number {
  return 1.2 - Math.abs(ei) * 0.1;
}

/** 疾病基础持续天数 */
export function getSicknessBaseDuration(health: number): number {
  const map: Record<number, number> = { 1: 7, 2: 5, 3: 3, 4: 1 };
  return map[health] ?? 5;
}
