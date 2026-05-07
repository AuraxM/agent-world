/**
 * 经济引擎：交易记录、收支快照、转账、余额检查。
 */
import { db, schema } from "@/db/client";
import { eq, and, gte, lte } from "drizzle-orm";
import { TICKS_PER_HOUR } from "@agw/domain";
import type { Character, EconomicSnapshot, Transaction } from "@agw/domain";
import type { EconomyConfig } from "../../../src/config/types";
import { DEFAULT_ECONOMY_CONFIG } from "../../../src/config/types";
import { createLogger } from "@agw/shared";
const log = createLogger("economy");

const WEEK_TICKS = 7 * 24 * TICKS_PER_HOUR; // 840 ticks = 7 game days

/** Check if character can afford an expense (expenseExempt always returns true). */
export function canAfford(character: Character, amount: number): boolean {
  return character.expenseExempt || character.money >= amount;
}

/** Insert a transaction row. Does NOT modify character.money — caller handles that. */
export function recordTransaction(
  worldId: string,
  tick: number,
  characterId: string,
  amount: number,
  category: Transaction["category"],
  description: string,
  counterpartyId?: string,
): void {
  db.insert(schema.transactions)
    .values({ worldId, tick, characterId, amount, category, description, counterpartyId })
    .run();
  if (category === "expense" || category === "transfer_out") {
    log.info("支出", { 角色id: characterId, 类别: category, 金额: Math.abs(amount), 说明: description });
  } else if (category === "income" || category === "transfer_in") {
    log.info("收入", { 角色id: characterId, 类别: category, 金额: amount, 说明: description });
  }
}

import { getTierDailyIncome, characterBME } from "./bme";

/** Roll work income based on character's BME and income tier. */
export function rollWorkIncome(
  character: Character,
  economyConfig: EconomyConfig,
): number {
  const tier = character.incomeLevel ?? 0;
  const bme = characterBME(character);
  const mdc = economyConfig.mdc ?? 20;
  const dailyIncome = getTierDailyIncome(bme, tier, mdc);
  // Default 4 work sessions per day
  return Math.round(dailyIncome / 4);
}

/** Compute balance tier [-4..+4] from weekly totals. */
function computeBalance(
  weeklyIncome: number,
  weeklyExpense: number,
  thresholds: EconomyConfig["balanceThresholds"],
): number {
  const net = weeklyIncome - weeklyExpense;
  if (net > 0) {
    for (let i = 3; i >= 0; i--) {
      if (net >= thresholds.positive[i]) return i + 1;
    }
    return 0;
  }
  if (net < 0) {
    if (weeklyExpense === 0) return 0;
    const deficitRatio = -net / weeklyExpense;
    for (let i = 3; i >= 0; i--) {
      if (deficitRatio >= thresholds.negative[i]) return -(i + 1);
    }
    return 0;
  }
  return 0;
}

/** Compute wealth tier [0..3] from current money. */
function computeWealth(money: number, tiers: [number, number, number]): number {
  if (money >= tiers[2]) return 3;
  if (money >= tiers[1]) return 2;
  if (money >= tiers[0]) return 1;
  return 0;
}

/** Get total income and expense for the past 7 game days. */
export function getWeeklySummary(
  worldId: string,
  characterId: string,
  currentTick: number,
): { totalIncome: number; totalExpense: number; netBalance: number } {
  const cutoff = Math.max(0, currentTick - WEEK_TICKS);
  const rows = db
    .select()
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.worldId, worldId),
        eq(schema.transactions.characterId, characterId),
        gte(schema.transactions.tick, cutoff),
        lte(schema.transactions.tick, currentTick),
      ),
    )
    .all();
  let totalIncome = 0;
  let totalExpense = 0;
  for (const r of rows) {
    if (r.amount > 0) totalIncome += r.amount;
    else totalExpense += -r.amount;
  }
  return { totalIncome, totalExpense, netBalance: totalIncome - totalExpense };
}

/** Update economic snapshot for one character. */
export function updateEconomicSnapshot(
  worldId: string,
  tick: number,
  character: Character,
  economyConfig: EconomyConfig,
): EconomicSnapshot {
  const { totalIncome, totalExpense } = getWeeklySummary(worldId, character.id, tick);
  return {
    balance: computeBalance(totalIncome, totalExpense, economyConfig.balanceThresholds),
    wealth: computeWealth(character.money, economyConfig.wealthTiers),
    weeklyIncome: totalIncome,
    weeklyExpense: totalExpense,
    updatedAtTick: tick,
  };
}

/** Batch update all characters' economic snapshots. */
export function updateAllEconomicSnapshots(
  worldId: string,
  tick: number,
  characters: Character[],
  economyConfig: EconomyConfig,
): Map<string, EconomicSnapshot> {
  const out = new Map<string, EconomicSnapshot>();
  for (const c of characters) {
    out.set(c.id, updateEconomicSnapshot(worldId, tick, c, economyConfig));
  }
  log.info("经济快照更新", {
    tick,
    角色数: characters.length,
  });
  return out;
}

/** Transfer money between two characters (both must be in-memory references). */
export function transferMoney(
  worldId: string,
  tick: number,
  fromChar: Character,
  toChar: Character,
  amount: number,
): void {
  const actual = Math.min(amount, fromChar.money);
  if (actual <= 0) return;
  fromChar.money -= actual;
  toChar.money += actual;
  recordTransaction(worldId, tick, fromChar.id, -actual, "transfer_out",
    `给 ${toChar.name} 转账`, toChar.id);
  recordTransaction(worldId, tick, toChar.id, actual, "transfer_in",
    `收到 ${fromChar.name} 转账`, fromChar.id);
}
