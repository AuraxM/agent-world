# 数值系统平衡实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 BME 驱动的普适数值框架，替换硬编码数值为公式推导，确保任何 mod 导入后角色长期稳定运行。

**Architecture:** 新增 `src/engine/bme.ts` 作为核心计算模块（BME/MDC/收入层级），修改 vitals-emotion.ts（生理/情绪/疾病）、economy.ts（收入公式）、actions-builtin.ts（行为参数）、execute.ts（睡眠 stress）、createWorld.ts（初始资金）。所有修改保持向后兼容——现有配置不破。

**Tech Stack:** TypeScript, Drizzle ORM (SQLite), 现有 engine 架构不变。

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/engine/bme.ts` | **新建** | BME 计算、MDC、tier 收入、生理 baseRate、情绪速率公式 |
| `src/engine/vitals-emotion.ts` | 修改 | vitals 衰减用 BME、情绪演化用性格驱动、疾病持续时间按 health |
| `src/config/types.ts` | 修改 | EconomyConfig 新增 tierMultipliers，MDC 暴露 |
| `src/engine/economy.ts` | 修改 | rollWorkIncome 使用 tier multiplier 公式 |
| `src/engine/actions-builtin.ts` | 修改 | eat/bathe/rest/sleep/work 参数、中断阈值 |
| `src/engine/execute.ts` | 修改 | sleep onComplete 加 stress -1，cap penalty 加 stress |
| `src/engine/createWorld.ts` | 修改 | 初始资金用 MDC 公式 |
| `src/engine/tick.ts` | 修改 | 睡眠窗口外睡觉疲劳恢复打 7 折 |
| `src/domain/enums.ts` | 修改 | PROFESSION_INCOME_TIERS 扩展到 tier 4 |
| `src/config/loader.ts` | 修改 | resolveIncomeLevel 适配新 tier |

---

### Task 1: 新建 BME 核心计算模块

**Files:**
- Create: `src/engine/bme.ts`

- [ ] **Step 1: 创建 bme.ts**

```typescript
/**
 * BME (Basal Metabolic Equivalent) 核心计算模块。
 *
 * 所有生理/经济数值的推导锚点：
 *   BME = metabolicBase(age) × healthFactor(health)
 *
 * 导出：
 *   - computeBME(age, health) → BME
 *   - getMDC()              → 每日最低生存成本（默认 20）
 *   - getVitalBaseRate(vital)  → 生理消耗 baseRate
 *   - getTierDailyIncome(bme, tier, mdc) → 日收入
 *   - getTierInitialMoney(tier, mdc) → 初始资金
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

/** 计算角色的 BME */
export function computeBME(age: number, health: number): number {
  return metabolicBase(age) * healthFactor(health);
}

/** 快捷：从 Character 计算 BME */
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
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd E:/Projects/agent-world && npx tsc --noEmit src/engine/bme.ts
```
Expected: no errors

- [ ] **Step 3: 提交**

```bash
git add src/engine/bme.ts
git commit -m "feat: add BME core computation module

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 扩展收入层级到 tier 4

**Files:**
- Modify: `src/domain/enums.ts`
- Modify: `src/config/types.ts`

- [ ] **Step 1: enums.ts — 新增 tier 4 职业映射**

在 `PROFESSION_INCOME_TIERS` 中保留现有映射不变。新增注释说明 tier 含义。

```typescript
// 修改导入/注释（在 enums.ts line 41-51 处替换）
/** 职业 → 收入层级映射（0=none, 1=bare, 2=modest, 3=comfortable, 4=wealthy）。
 *  mod 自定义职业默认为 tier 0（无收入），可被 manifest.economy 覆盖。 */
export const PROFESSION_INCOME_TIERS: Record<string, number> = {
  doctor: 3, merchant: 3,
  farmer: 2, rancher: 2, fisherman: 2, lumberjack: 2, hunter: 2,
  chef: 2, baker: 2, brewer: 2,
  blacksmith: 2, carpenter: 2, tailor: 2,
  grocer: 2, innkeeper: 2,
  nurse: 2, teacher: 2, librarian: 2,
  priest: 2, mailman: 2, mayor: 2,
  student: 0, unemployed: 0,
};
```

注意：将类型从 `Record<Profession, number>` 改为 `Record<string, number>` 以支持 mod 自定义职业。

- [ ] **Step 2: config/types.ts — EconomyConfig 新增 tierMultipliers 字段**

```typescript
// 在 EconomyConfig interface 中新增 (line 86-91 处修改)
export interface EconomyConfig {
  survivalCosts: SurvivalCosts;
  professionIncomes: ProfessionIncomes;
  wealthTiers: [number, number, number];
  balanceThresholds: BalanceThresholds;
  /** tier → daily income multiplier (0-4). 默认使用内置 TIER_MULTIPLIERS。mod 可覆写。 */
  tierMultipliers?: Record<number, number>;
  /** 每日最低生存成本基准。mod 可覆写以适配不同世界观。默认 20。 */
  mdc?: number;
}
```

- [ ] **Step 3: 更新 DEFAULT_ECONOMY_CONFIG**

```typescript
// 在 line 93-106 处追加
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
  tierMultipliers: undefined,
  mdc: undefined,
};
```

- [ ] **Step 4: 提交**

```bash
git add src/domain/enums.ts src/config/types.ts
git commit -m "feat: extend income tier to 4 levels and add EconomyConfig fields

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: 修改生理衰减系统（BME 驱动）

**Files:**
- Modify: `src/engine/vitals-emotion.ts` (lines 152-253)

- [ ] **Step 1: 更新 decayVitals 使用 BME**

修改 `fatigueIncrement` 为参数化版本，并在 `decayVitals` 中使用 BME：

```typescript
// 替换 line 154-158 的 fatigueIncrement
function fatigueIncrement(currentFatigue: number, isEvenHour: boolean, bme: number): number {
  if (currentFatigue < 8) return isEvenHour ? Math.round(bme * 0.5) : 0;
  if (currentFatigue < 13) return Math.round(bme * 1.0);
  return Math.round(bme * 2.0);
}

// 在 decayVitals 的 for 循环中 (line 201-213), 替换 vitals decay 逻辑:
if (hourTick) {
  const bme = characterBME(c);
  if (!onTravel || evenHour) {
    const hungerInc = Math.round(bme * 1.0);
    c.vitals.hunger = Math.min(VITAL_MAX, c.vitals.hunger + hungerInc);
    const baseIncrement = fatigueIncrement(c.vitals.fatigue, evenHour, bme);
    const sicknessMultiplier = c.sickness ? 2 : 1;
    c.vitals.fatigue = Math.min(
      VITAL_MAX,
      c.vitals.fatigue + baseIncrement * sicknessMultiplier,
    );
  }
  if (evenHour && !onTravel) {
    const hygieneInc = Math.round(bme * 0.8);
    c.vitals.hygiene = Math.min(VITAL_MAX, c.vitals.hygiene + hygieneInc);
  }
}
```

注：需要在文件顶部添加 `import { characterBME } from "./bme";`

- [ ] **Step 2: 顶值惩罚增加 stress +1（line 288-295）**

在 `applyCapPenalty` 的重惩罚分支增加 stress：

```typescript
// line 288-295 修改为:
if (prev < CAP_PENALTY_HEAVY_TICKS && next >= CAP_PENALTY_HEAVY_TICKS) {
  character.emotion.mood = clamp(character.emotion.mood - 1, -4, 4);
  character.emotion.stress = clamp(character.emotion.stress + 1, 0, 4);  // 新增
  inner.push(makeInnerEvent({
    worldId, tick, charId: character.id,
    description: describe("heavy"),
    intensity: 3,
  }));
}
```

- [ ] **Step 3: 提交**

```bash
git add src/engine/vitals-emotion.ts
git commit -m "feat: drive vitals decay rates by BME, add stress on heavy cap penalty

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: 修改情绪演化系统（性格驱动）

**Files:**
- Modify: `src/engine/vitals-emotion.ts` (lines 341-399)

- [ ] **Step 1: 更新 mood 回归速率**

```typescript
// 在 evolveEmotions 的 for 循环中 (line 349-352), 替换 mood 回归:
// mood: 性格驱动的向 0 回归速率
if (hourTick && evenHour && c.emotion.mood !== 0) {
  const moodDecay = getMoodDecayRate(c.personality.tf);
  // 每 even hour (~每2h) 发生的概率 = 日速率 / 12 (每天12个 even hour)
  if (Math.random() < moodDecay / 12) {
    c.emotion.mood += c.emotion.mood > 0 ? -1 : 1;
  }
}
```

注：文件顶部添加 `import { getMoodDecayRate } from "./bme";`

- [ ] **Step 2: 更新 stress 衰减**

```typescript
// 替换 line 355-357 的 stress decay logic:
// stress: 每 24 游戏小时 -1（不自动衰减之外的逻辑保留）
if (totalHours > 0 && totalHours % STRESS_DECAY_INTERVAL === 0 && hourTick) {
  c.emotion.stress = Math.max(0, c.emotion.stress - 1);
}
```

stress 的自动衰减逻辑保留不变（因为 spec 说 stress 不自动回归，仅在睡眠/社交时衰减——但当前代码已经有每 24h -1 的机制，这个保留作为一种"自然缓解"）。

- [ ] **Step 3: 更新 social_satiety 逻辑**

```typescript
// 替换 line 360-367 的 social_satiety 逻辑:
// social_satiety: 按 EI 驱动的每日衰减 + 社交获得
if (hourTick && evenHour) {
  const decay = getSocialDecayRate(c.personality.ei);
  const hasPeer = hasCompanions.get(c.id) ?? false;
  if (hasPeer) {
    const gain = getSocialGainPerInteraction(c.personality.ei);
    c.emotion.social_satiety = clamp(c.emotion.social_satiety + gain, -4, 4);
  }
  // 每隔大约 1/decay 天衰减 1 点（概率化）
  if (Math.random() < decay / 12) {
    c.emotion.social_satiety = clamp(c.emotion.social_satiety - 1, -4, 4);
  }
}
```

注：文件顶部添加 `import { getSocialDecayRate, getSocialGainPerInteraction } from "./bme";`

- [ ] **Step 4: 提交**

```bash
git add src/engine/vitals-emotion.ts
git commit -m "feat: personality-driven emotion evolution rates

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: 修改疾病系统（持续时间按 health）

**Files:**
- Modify: `src/engine/vitals-emotion.ts` (lines 468-531)

- [ ] **Step 1: 更新疾病持续时间**

```typescript
// 在 checkSickness 中 (line 516-517), 替换 duration 计算:
const baseDays = getSicknessBaseDuration(c.health);
const offset = Math.floor(Math.random() * 5) - 2; // -2..+2
const days = Math.max(1, Math.min(10, baseDays + offset));
c.sickness = {
  onsetTick: tick,
  duration: days * 120,
};
```

注：文件顶部添加 `import { getSicknessBaseDuration } from "./bme";`

- [ ] **Step 2: 卫生阈值修改（14 替代 12）**

```typescript
// line 511，修改卫生 modifier 阈值:
if (c.vitals.hygiene >= 14) prob *= 1.3;
```

- [ ] **Step 3: 提交**

```bash
git add src/engine/vitals-emotion.ts
git commit -m "feat: sickness duration driven by health, hygiene threshold 12→14

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: 更新行动定义（参数 BME 化）

**Files:**
- Modify: `src/engine/actions-builtin.ts`

- [ ] **Step 1: 更新 eat/bathe 价格使用 MDC 推导**

eat action (line 6-40): 替换所有 `DEFAULT_ECONOMY_CONFIG.survivalCosts.eat` → `getEatCost()`
bathe action (line 42-75): 替换所有 `DEFAULT_ECONOMY_CONFIG.survivalCosts.bathe` → `getBatheCost()`

文件顶部添加:
```typescript
import { getEatCost, getBatheCost } from "./bme";
```

- [ ] **Step 2: 更新 rest action（恢复量 = health, 中断阈值 3→2）**

```typescript
// rest execute (line 92-101): interruptThreshold: 2,
// rest onComplete (line 102-108): delta: -(ctx.self.health)
```

- [ ] **Step 3: 更新 sleep action（中断阈值 4→3）**

```typescript
// sleep execute (line 231-246): interruptThreshold: 3,
// sleep onComplete 在 Task 9 中完整重写，此处暂不改动
```

- [ ] **Step 4: 更新 work action 调用新 rollWorkIncome 签名**

```typescript
// work onComplete (line 148-160):
import { rollWorkIncome } from "./economy";

onComplete(ctx) {
  const income = rollWorkIncome(ctx.self, DEFAULT_ECONOMY_CONFIG);
  const changes: StateChange[] = [];
  if (income > 0) {
    changes.push({ kind: "adjustMoney", amount: income, reason: "work" });
  }
  return {
    memory: `我完成了工作，收入 ${income}💰。`,
    event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} 完成了工作。`, intensity: 2 },
    stateChanges: changes,
  };
},
```

- [ ] **Step 5: 更新 move 中断阈值（4 → 3）**

```typescript
// move execute (line 297-305): interruptThreshold: 3,
```

- [ ] **Step 6: 提交**

```bash
git add src/engine/actions-builtin.ts
git commit -m "feat: BME-driven action parameters and costs

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: 更新经济模块（tier 收入公式）

**Files:**
- Modify: `src/engine/economy.ts`
- Modify: `src/config/loader.ts`

- [ ] **Step 1: 更新 rollWorkIncome 签名和实现**

```typescript
// 文件顶部添加 import:
import { getTierDailyIncome, characterBME } from "./bme";

// 修改 rollWorkIncome (line 41-51) 签名从 (incomeLevel, config, multiplier) 改为 (character, config):
export function rollWorkIncome(
  character: Character,
  economyConfig: EconomyConfig,
): number {
  const tier = character.incomeLevel ?? 0;
  const bme = characterBME(character);
  const mdc = economyConfig.mdc ?? 20;
  const dailyIncome = getTierDailyIncome(bme, tier, mdc);
  // 默认每天 2 次工作：每次 = dailyIncome / 2
  const multiplier = character.incomeMultiplier ?? 1.0;
  return Math.round((dailyIncome / 2) * multiplier);
}
```

- [ ] **Step 2: 检查 rollWorkIncome 其他调用点并更新**

```bash
grep -rn "rollWorkIncome" E:/Projects/agent-world/src/
```
预期：调用点只有 `actions-builtin.ts`（已在 Task 6 Step 6 更新为 `rollWorkIncome(ctx.self, DEFAULT_ECONOMY_CONFIG)`）。如有其他调用点则同步更新签名。

- [ ] **Step 3: 更新 loader.ts resolveIncomeLevel**

```typescript
// loader.ts line 187-188，改为支持 mod 自定义职业:
export function resolveIncomeLevel(profession: string): number {
  return (PROFESSION_INCOME_TIERS as Record<string, number>)[profession] ?? 0;
}
```

注意 `PROFESSION_INCOME_TIERS` 的类型已在 Task 2 改为 `Record<string, number>`。

- [ ] **Step 4: 提交**

```bash
git add src/engine/economy.ts src/config/loader.ts
git commit -m "feat: tier-based income formula using BME and MDC

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: 更新世界创建（初始资金公式）

**Files:**
- Modify: `src/engine/createWorld.ts`

- [ ] **Step 1: 使用 MDC 公式计算初始资金**

```typescript
// 文件顶部添加 import:
import { getTierInitialMoney } from "./bme";

// 替换 line 166-167 的 initialMoney 计算:
const initialMoney = m.tpl.initialMoney ?? getTierInitialMoney(incomeLevel);
```

- [ ] **Step 2: 提交**

```bash
git add src/engine/createWorld.ts
git commit -m "feat: initial money calculated from MDC formula

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9: 更新 tick 主循环（睡眠窗口外惩罚）

**Files:**
- Modify: `src/engine/actions-builtin.ts`

- [ ] **Step 1: 重写 sleepAction.onComplete — 窗口检查 + stress + 窗口外打折**

```typescript
// sleepAction onComplete (line 247-253)，替换为:
onComplete(ctx) {
  const inWindow = ctx.isSleepHour;
  const changes: StateChange[] = [];
  if (inWindow) {
    changes.push({ kind: "resetVital", vital: "fatigue" });
  } else {
    // 窗口外睡觉：fatigue 恢复到还剩原来的 30%（即减少 70%）
    const reduction = Math.round(ctx.self.vitals.fatigue * 0.7);
    changes.push({ kind: "adjustVital", vital: "fatigue", delta: -reduction });
  }
  changes.push({ kind: "adjustStress", delta: -1 });

  return {
    memory: inWindow
      ? "我睡醒了，精神饱满。"
      : "我睡醒了，但不在习惯的睡眠时间，感觉没完全恢复。",
    event: { category: "action", description: `${ctx.self.name} 睡醒了。`, intensity: 2 },
    stateChanges: changes,
  };
},
```

- [ ] **Step 2: 提交**

```bash
git add src/engine/actions-builtin.ts
git commit -m "feat: sleep outside chronotype window reduces fatigue recovery to 70%

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: 全量验证

**Files:**
- 检查所有修改的文件

- [ ] **Step 1: TypeScript 编译检查**

```bash
cd E:/Projects/agent-world && npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 2: 运行现有测试**

```bash
cd E:/Projects/agent-world && npm test 2>&1 | tail -20
```
Expected: all tests pass

- [ ] **Step 3: 验证标准角色数值**

用 spec 第 7 节的标准角色（age 30, health 3, tier 2, 性格全中性）：
- BME = 1.0 × 1.0 = 1.0
- hunger decay = 1.0/天
- fatigue decay: 0-7: 0.5/天, 8-12: 1.0/天, 13+: 2.0/天
- hygiene decay = 0.8/天
- eat cost = 15, bathe cost = 5
- 日收入 = ceil(1.0 × 1.5 × 20) = 30
- 日工作 2 次 = 每次 15
- rest 恢复 = 3 (health=3)
- mood 回归 = 1/3 ≈ 0.33/天
- social 衰减 = 0.4 + (0+4) × 0.075 = 0.7/天
- 疾病 base = 3 天

All values match spec.

- [ ] **Step 4: 提交（如有修改）**

---

### Task 11: 更新配置 schema（如需要）

**Files:**
- Modify: `src/config/schemas.ts`

- [ ] **Step 1: 更新 EconomyConfigSchema**

```typescript
// 在 schemas.ts 中追加 EconomyConfigSchema 的 tierMultipliers 和 mdc 字段
export const EconomyConfigSchema: z.ZodType<EconomyConfig> = z.object({
  survivalCosts: SurvivalCostsSchema,
  professionIncomes: ProfessionIncomesSchema,
  wealthTiers: z.tuple([z.number(), z.number(), z.number()]),
  balanceThresholds: BalanceThresholdsSchema,
  tierMultipliers: z.record(z.string(), z.number()).optional(),
  mdc: z.number().int().min(1).optional(),
});
```

- [ ] **Step 2: 提交**

```bash
git add src/config/schemas.ts
git commit -m "feat: add tierMultipliers and mdc to economy config schema

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```
