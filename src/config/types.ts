/**
 * 配置文件层的领域类型。
 *
 * 与 `src/domain/types.ts` 的运行时类型有意区分：
 *   - `MapNodeConfig` 不含 `worldId`（实例化世界时才知道）
 *   - `CharacterTemplate` 是位置无关的角色模板，不含 `worldId / locationId /
 *     vitals / emotion / shortMemory / longMemory / currentAction / lastThought`
 *     —— 这些都是世界运行期才存在的字段。
 */
import type { MapNode, Character } from "@/domain/types";

/** 地图包支持的输出语言。 */
export type Language = "zh" | "en" | "ja";

export const SUPPORTED_LANGUAGES: readonly Language[] = ["zh", "en", "ja"];

/** 文件里写的节点：去掉运行时才有的 worldId。 */
export type MapNodeConfig = Omit<MapNode, "worldId">;

/** 一份地图配置文件 = 一棵节点树。name/description 移到 manifest。 */
export interface MapConfig {
  id: string;
  nodes: MapNodeConfig[];
}

/** 地图包 manifest —— 每个地图包目录下的 manifest.json。 */
export interface Manifest {
  id: string;
  name: string;
  description?: string;
  language: Language;
  /** ISO 8601 datetime string, e.g. "2026-05-03T08:00:00". Sets the world's initial clock. */
  startDate?: string;
  /** Path to actions.js relative to the map pack directory. */
  actions?: string;
  /** Optional economy configuration overrides. */
  economy?: EconomyConfig;
}

/** 一份角色配置文件 = 不含位置/世界/运行期字段的纯模板。 */
export type CharacterTemplate = Omit<
  Character,
  | "worldId"
  | "locationId"
  | "vitals"
  | "emotion"
  | "shortMemory"
  | "dailyMemory"
  | "longMemory"
  | "currentAction"
  | "lastThought"
  | "lastSleepTick"
  | "money"
  | "incomeLevel"
  | "expenseExempt"
> & {
  initialMoney?: number;
  incomeMultiplier?: number;
  expenseExempt?: boolean;
};

export interface SurvivalCosts {
  eat: number;
  bathe: number;
}

export interface ProfessionIncomeRange {
  min: number;
  max: number;
}

export interface ProfessionIncomes {
  high: ProfessionIncomeRange;
  medium: ProfessionIncomeRange;
  low: ProfessionIncomeRange;
  none: ProfessionIncomeRange;
}

export interface BalanceThresholds {
  positive: [number, number, number, number];
  negative: [number, number, number, number];
}

export interface EconomyConfig {
  survivalCosts: SurvivalCosts;
  professionIncomes: ProfessionIncomes;
  wealthTiers: [number, number, number];
  balanceThresholds: BalanceThresholds;
}

export const DEFAULT_ECONOMY_CONFIG: EconomyConfig = {
  survivalCosts: { eat: 15, bathe: 10 },
  professionIncomes: {
    high: { min: 80, max: 120 },
    medium: { min: 40, max: 70 },
    low: { min: 10, max: 30 },
    none: { min: 0, max: 0 },
  },
  wealthTiers: [100, 500, 2000],
  balanceThresholds: {
    positive: [10, 50, 150, 400],
    negative: [0.1, 0.3, 0.6, 1.0],
  },
};
