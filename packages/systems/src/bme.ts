/**
 * BME (Basal Metabolic Equivalent) 核心计算模块。
 */
import type { Character } from "@agw/domain";

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
  return computeBME(c.age, c.health);
}

/** 每日最低生存成本（mod 可覆写）。默认 20。 */
let _mdc = 20;
export function getMDC(): number { return _mdc; }
export function setMDC(v: number) { _mdc = v; }

/** 生存行动价格 */
export function getEatCost(mdc = _mdc): number { return Math.round(mdc * 0.5); }
export function getBatheCost(mdc = _mdc): number { return Math.round(mdc * 0.2); }

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
const TIER_MULTIPLIERS: Record<number, number> = { 0: 0, 1: 1.0, 2: 2.0, 3: 3.0, 4: 4.0 };
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

/** mood 每 tick 随机波动幅度 = 0.5 / (3 + |TF|) */
export function getMoodVolatilityPerTick(tf: number): number {
  return 0.5 / (3 + Math.abs(tf));
}

/**
 * 社交满足每 tick 衰减（独处/不在对话中时）。
 * d(EI) = 0.024 + (EI + 4) × 0.0095
 * 范围: 0.024 (最内向) ~ 0.100 (最外向)
 */
export function getSocialDecayPerTick(ei: number): number {
  return 0.024 + (ei + 4) * 0.0095;
}

/**
 * 社交满足每 tick 增益（对话中）。
 * 由平衡式 T·g = (120−T)·d 反推，保证目标日对话 tick 数 T(EI) 在 10~40。
 * T(EI) = 10 + (EI + 4) × 3.75
 */
export function getSocialGainPerDialogTick(ei: number): number {
  const T = 10 + (ei + 4) * 3.75;
  const d = getSocialDecayPerTick(ei);
  return d * (120 - T) / T;
}

/** 疾病基础持续天数 */
export function getSicknessBaseDuration(health: number): number {
  const map: Record<number, number> = { 1: 7, 2: 5, 3: 3, 4: 1 };
  return map[health] ?? 5;
}
