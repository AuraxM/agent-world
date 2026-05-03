# Economy System Design

## Overview

Add a money economy to agent-world. Characters earn income by working, spend on survival (eat/bathe), transfer money to each other, and have their economic status represented in LLM prompts along two dimensions: income/expense balance [-4..+4] and wealth tier [0..3].

## Architecture: Transaction Log (方案 B)

All money movements are recorded in a `transactions` table. Economic snapshots are computed from the transaction log every 24 game hours. This provides precise balance calculation and a foundation for future trade/shop systems.

## Data Model

### Character — new fields

| Field | Type | Description |
|-------|------|-------------|
| `money` | `number` (integer) | Current money |
| `incomeLevel` | `number` (0-3) | Profession income tier, resolved at world creation from manifest config. 0 = none, no work income |
| `expenseExempt` | `boolean` | If true, survival costs (eat/bathe) are free. Set for minors (age < 18) and optionally for tourist-type visitors |

### transactions table (new)

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK autoincrement | |
| `worldId` | text | |
| `tick` | integer | Tick when transaction occurred |
| `characterId` | text | |
| `amount` | integer | Positive = income, negative = expense |
| `category` | text | `"expense"` / `"income"` / `"transfer_in"` / `"transfer_out"` |
| `description` | text | e.g. "eat at 拉面馆", "work as merchant" |
| `counterpartyId?` | text | Other character ID for transfers |

### EconomicSnapshot (runtime, cached on character or standalone)

| Field | Type | Description |
|-------|------|-------------|
| `balance` | `-4..+4` | Income/expense balance level |
| `wealth` | `0..3` | Wealth tier: 0=poor, 1=subsistence, 2=comfortable, 3=wealthy |
| `weeklyIncome` | `number` | Total income in past 7 game days |
| `weeklyExpense` | `number` | Total expense in past 7 game days (positive value) |
| `updatedAtTick` | `number` | Last update tick |

Updated every 120 ticks (24 game hours) via `updateAllEconomicSnapshots()`.

### New StateChange kind

```typescript
{ kind: "adjustMoney"; amount: number; reason: string }
```

## Config System

### manifest.json — `economy` block (optional, has defaults)

```json
{
  "economy": {
    "survivalCosts": {
      "eat": 15,
      "bathe": 10
    },
    "professionIncomes": {
      "high":   { "min": 80, "max": 120 },
      "medium": { "min": 40, "max": 70 },
      "low":    { "min": 10, "max": 30 },
      "none":   { "min": 0,  "max": 0 }
    },
    "wealthTiers": [100, 500, 2000],
    "balanceThresholds": {
      "positive": [10, 50, 150, 400],
      "negative": [0.1, 0.3, 0.6, 1.0]
    }
  }
}
```

- **Survival costs**: eat and bathe only. Sleep and rest are free.
- **Profession incomes**: 4 tiers. Each work action rolls a random value in [min, max].
- **Wealth tiers**: absolute thresholds. Default [100, 500, 2000] means 0-99 poor, 100-499 subsistence, 500-1999 comfortable, 2000+ wealthy.
- **Balance thresholds**: positive side uses absolute net surplus; negative side uses deficit ratio (deficit/expense). e.g., net ≥ 400 → +4, deficit ratio ≥ 1.0 (100% of expense) → -4.

### Character JSON — new optional fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `initialMoney` | `number` | `0` | Starting money |
| `expenseExempt` | `boolean` | `false` | If true, eat/bathe are free |
| `incomeMultiplier` | `number` | `1.0` | Multiplier on work income. Set to `0` for non-working visitors |

### Profession → Income Tier Mapping (built-in, overridable per manifest)

| Tier | Professions |
|------|-------------|
| **high** | doctor, merchant |
| **medium** | farmer, rancher, carpenter, blacksmith, tailor, baker, brewer, chef, innkeeper, grocer |
| **low** | apprentice, assistant, temple_keeper, hunter |
| **none** | student, elder, unemployed, child, monk, artist, traveller |

## Action Changes

### eat

| Aspect | Change |
|--------|--------|
| **check** | Add: `expenseExempt OR money >= economy.survivalCosts.eat` |
| **execute** | If not expenseExempt: `adjustMoney(-cost)`, record transaction |

### bathe

| Aspect | Change |
|--------|--------|
| **check** | Add: `expenseExempt OR money >= economy.survivalCosts.bathe` |
| **execute** | If not expenseExempt: `adjustMoney(-cost)`, record transaction |

### work

| Aspect | Change |
|--------|--------|
| **check** | Add: `incomeLevel > 0 AND age >= 18` |
| **execute** | Roll income: `random(professionIncomes[level].min, max) * incomeMultiplier`, `adjustMoney(+amount)`, record transaction |

### sleep / rest

No money change. Sleep and rest are free.

### give (new built-in action)

| Aspect | Detail |
|--------|--------|
| **type** | `"give"` |
| **duration** | `"instant"` |
| **check** | (1) `self.money > 0`, (2) shortMemory or perceivedEvents contains a recent beg/help-request, (3) requester is present or known |
| **hint** | `"give money to {name} (关系: {relationLabel}, 感情: {affection}) — {request context}"` |
| **execute** | LLM specifies `amount` in tool call. Transfer money from self to requester. Record transfer_out + transfer_in transactions. |
| **amount handling** | If amount unspecified → give all. If amount > balance → clamp to balance. |

**Request mechanism**: When a character's money drops below survival cost, the system generates an inner event ("经济困难，需要帮助") written to that character's shortMemory. The character may express this through speak during dialogs. When other characters perceive this (via perceivedEvents or dialog), the `give` action becomes available to them.

## Economy Engine (`src/engine/economy.ts`)

```typescript
// Check if character can afford an amount
canAfford(character: Character, amount: number): boolean

// Record transaction + update character balance
recordTransaction(worldId, character, amount, category, description, counterpartyId?): Transaction

// Roll random work income
rollWorkIncome(profession, incomeLevel, economyConfig, multiplier): number

// Update economic snapshot for one character
updateEconomicSnapshot(worldId, tick, character): void

// Update all characters' snapshots (called every 24 game hours)
updateAllEconomicSnapshots(worldId, tick, characters, economyConfig): void

// Get 7-day transaction summary
getWeeklySummary(worldId, characterId, currentTick): { totalIncome, totalExpense, netBalance }

// Transfer money between characters
transferMoney(worldId, fromChar, toChar, amount): void
```

### Balance computation

```
net = weeklyIncome - weeklyExpense

if net > 0:
  map to +1..+4 using balanceThresholds.positive
  (absolute net surplus tiers)

if net < 0:
  deficitRatio = -net / weeklyExpense
  map to -1..-4 using balanceThresholds.negative
  (deficit as fraction of expense)

if net == 0:
  balance = 0
```

### Execution flow (per tick)

1. Action execution produces `adjustMoney` StateChanges
2. Each StateChange → `recordTransaction()` + update `character.money`
3. Every 120 ticks (24 game hours) → `updateAllEconomicSnapshots()`
4. Snapshots cached for prompt building

### Money insufficiency

When `check()` blocks a survival action due to insufficient money:
- The action simply does not appear in the LLM's available options
- A warning is added to the user prompt: "资金紧张：余额不足以支付吃饭/洗澡费用"
- The character must find income (work) or seek help (speak → trigger give from others)

## Prompt Integration

### System prompt (character block — static/cached)

```
经济状况：
- 财富水平：富裕 (持有 850 金钱)
- 生存开销：吃饭 15/次，洗澡 10/次
- 近七日收支：+3 (收入 320, 支出 150, 净结余 +170)
```

### User prompt (per-tick — dynamic)

```
## 经济状态
你目前持有 850 金钱。
近七日收入 320，支出 150，收支平衡 +3。
财富水平：富裕。你在本地经济中属于上层。
```

### Balance qualitative labels

| Level | Label |
|-------|-------|
| +4 | 收入大幅盈余 |
| +3 | 收入充裕 |
| +2 | 略有结余 |
| +1 | 勉强收支平衡 |
| 0 | 收支相抵 |
| -1 | 轻微入不敷出 |
| -2 | 持续亏损 |
| -3 | 严重赤字 |
| -4 | 极度入不敷出 |

### Wealth qualitative labels

| Tier | Label |
|------|-------|
| 0 | 贫困 — 难以维持基本生存开销 |
| 1 | 温饱 — 勉强覆盖日常开销 |
| 2 | 小康 — 日常生活无忧，偶有积蓄 |
| 3 | 富裕 — 经济宽裕，无需为钱担忧 |

### Low-money warning

When `money < max(eatCost, batheCost)`:

```
⚠️ 资金紧张：你目前的余额不足以支付下一次吃饭/洗澡的费用。
你必须想办法获得收入，或者向他人求助。
```

## Special Rules Summary

| Rule | Mechanism |
|------|-----------|
| Minors (age < 18) | `expenseExempt = true`, `incomeLevel = none` — no survival costs, no work income |
| Tourist visitors (non-working) | `initialMoney` set high, `expenseExempt = false` (pay own way), `incomeMultiplier = 0` |
| Migrant worker visitors | `initialMoney` set low, `expenseExempt = false`, `incomeMultiplier = 1.0` — normal workers |
| Expense-exempt visitors | `expenseExempt = true` — free survival, e.g. all-inclusive resort guests |

## Files to Modify

| File | Change |
|------|--------|
| `src/domain/types.ts` | Add `money`, `incomeLevel`, `expenseExempt` to Character; add EconomicSnapshot type |
| `src/domain/enums.ts` | Add `adjustMoney` to StateChange union; add economy-related constants |
| `src/domain/action-system.ts` | Add `adjustMoney` to StateChange union; extend ActionInput for give amount |
| `src/engine/actions-builtin.ts` | Modify eat/bathe/work check/execute; add give action |
| `src/engine/economy.ts` | **New file** — economy engine module |
| `src/engine/execute.ts` | Handle `adjustMoney` StateChange |
| `src/engine/vitals-emotion.ts` | Trigger inner event on low money (analogous to urgent warnings) |
| `src/engine/createWorld.ts` | Resolve incomeLevel from profession mapping; set initialMoney |
| `src/engine/store.ts` | Serialize new character fields; transaction CRUD |
| `src/engine/tick.ts` | Call `updateAllEconomicSnapshots` every 24h |
| `src/llm/prompt.ts` | Add economic status to system and user prompts |
| `src/config/schemas.ts` | Add economy schema, initialMoney/expenseExempt/incomeMultiplier to character template |
| `src/config/types.ts` | Add economy config types |
| `src/config/loader.ts` | Parse economy config from manifest |
| `src/db/schema.ts` | Add transactions table |
| `configs/maps/yu-no-tani/manifest.json` | Add economy config block |
| `configs/maps/yu-no-tani/characters/*.json` | Add initialMoney, expenseExempt, incomeMultiplier to all 20 character configs |

## Character Initial Money Guidelines

| Background | Suggested initialMoney |
|------------|----------------------|
| Local adult with job | 200-600 (a few days' buffer) |
| Local minor/student | 50-150 (low but expenseExempt) |
| Tourist (leisure) | 3000+ (avoid needing to work) |
| Migrant worker | 100-200 (came to work) |
| Unemployed/poor local | 30-80 (tight situation) |
| Merchant/shop owner | 500-1000 (business capital) |
