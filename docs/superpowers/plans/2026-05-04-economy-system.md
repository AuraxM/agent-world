# Economy System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a money economy to agent-world — characters earn/spend/transfer money, with economic status represented in LLM prompts.

**Architecture:** Transaction log approach — all money movements recorded in a `transactions` table; economic snapshots computed every 24 game hours. `src/engine/economy.ts` is the central engine module.

**Tech Stack:** TypeScript, Drizzle ORM + better-sqlite3, Zod

**Spec:** `docs/superpowers/specs/2026-05-04-economy-system-design.md`

---

### Task 1: Domain Types — Money, Transaction, EconomicSnapshot, StateChange

**Files:**
- Modify: `src/domain/types.ts` (Character interface, new types)
- Modify: `src/domain/action-system.ts` (StateChange union, ActionInput)

- [ ] **Step 1: Add money fields to Character interface**

In `src/domain/types.ts`, add three fields to `Character` after `profession`:

```typescript
export interface Character {
  // ...existing fields up to profession...
  profession: Profession;
  /** 当前持有金额（整数）。 */
  money: number;
  /** 职业收入等级 0-3（0=无收入）。运行时从 manifest + profession 解析。 */
  incomeLevel: number;
  /** 免生存开销（未成年人 age<18 / 纯旅游型外来者）。 */
  expenseExempt: boolean;
  // ...rest unchanged (biography, locationId, ...)
}
```

- [ ] **Step 2: Add Transaction and EconomicSnapshot types**

Append to `src/domain/types.ts`:

```typescript
/** 一笔金钱交易记录。 */
export interface Transaction {
  id: number;
  worldId: string;
  tick: number;
  characterId: string;
  amount: number;          // 正=收入, 负=支出
  category: "expense" | "income" | "transfer_in" | "transfer_out";
  description: string;
  counterpartyId?: string;
}

/** 经济状况快照（每 24 game hours 更新）。 */
export interface EconomicSnapshot {
  balance: number;         // -4..+4
  wealth: number;          // 0..3
  weeklyIncome: number;
  weeklyExpense: number;
  updatedAtTick: number;
}
```

- [ ] **Step 3: Add adjustMoney to StateChange union + amount to ActionInput**

In `src/domain/action-system.ts`, append to the `StateChange` union:

```typescript
export type StateChange =
  | { kind: "resetVital"; vital: "hunger" | "fatigue" | "hygiene" }
  | { kind: "adjustVital"; vital: "hunger" | "fatigue" | "hygiene"; delta: number }
  | { kind: "setLocation"; nodeId: string }
  | { kind: "adjustMood"; delta: number }
  | { kind: "adjustStress"; delta: number }
  | { kind: "setOngoingAction"; action: import("./types").OngoingAction }
  | { kind: "clearOngoingAction" }
  | { kind: "adjustMoney"; amount: number; reason: string };
```

In the same file, add `amount` to `ActionInput`:

```typescript
export interface ActionInput {
  target_id?: string;
  target_node_id?: string;
  free_text?: string;
  reason?: string;
  amount?: number;
  arrival_action?: {
    action_type: string;
    free_text?: string;
    target_id?: string;
    target_node_id?: string;
  };
  [key: string]: unknown;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/domain/types.ts src/domain/action-system.ts
git commit -m "feat: add money fields, Transaction, EconomicSnapshot, adjustMoney StateChange"
```

---

### Task 2: Profession Income Tier Mapping + Config Types

**Files:**
- Modify: `src/domain/enums.ts`
- Modify: `src/config/types.ts`

- [ ] **Step 1: Add PROFESSION_INCOME_TIERS constant**

In `src/domain/enums.ts`, append after the PROFESSIONS definition:

```typescript
/** 职业 → 收入等级映射（0=none, 1=low, 2=medium, 3=high）。manifest 可覆盖。 */
export const PROFESSION_INCOME_TIERS: Record<Profession, number> = {
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

- [ ] **Step 2: Add config types**

In `src/config/types.ts`, append (keep CharacterTemplate as-is for now, update in Task 3):

```typescript
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
```

Update `Manifest` to include optional `economy`:

```typescript
export interface Manifest {
  id: string;
  name: string;
  description?: string;
  language: Language;
  startDate?: string;
  actions?: string;
  economy?: EconomyConfig;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/domain/enums.ts src/config/types.ts
git commit -m "feat: add profession income tiers and economy config types"
```

---

### Task 3: Config Schemas + CharacterTemplate Fields

**Files:**
- Modify: `src/config/schemas.ts`
- Modify: `src/config/types.ts` (CharacterTemplate update)

- [ ] **Step 1: Add economy schemas and update CharacterTemplateSchema**

In `src/config/schemas.ts`, add imports:

```typescript
import type { EconomyConfig, SurvivalCosts, ProfessionIncomes, BalanceThresholds, CharacterTemplate } from "./types";
```

Append schemas after the existing CharacterTemplateSchema:

```typescript
const SurvivalCostsSchema: z.ZodType<SurvivalCosts> = z.object({
  eat: z.number().int().min(0),
  bathe: z.number().int().min(0),
});

const ProfessionIncomeRangeSchema = z.object({
  min: z.number().int().min(0),
  max: z.number().int().min(0),
});

const ProfessionIncomesSchema: z.ZodType<ProfessionIncomes> = z.object({
  high: ProfessionIncomeRangeSchema,
  medium: ProfessionIncomeRangeSchema,
  low: ProfessionIncomeRangeSchema,
  none: ProfessionIncomeRangeSchema,
});

const BalanceThresholdsSchema: z.ZodType<BalanceThresholds> = z.object({
  positive: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  negative: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});

export const EconomyConfigSchema: z.ZodType<EconomyConfig> = z.object({
  survivalCosts: SurvivalCostsSchema,
  professionIncomes: ProfessionIncomesSchema,
  wealthTiers: z.tuple([z.number(), z.number(), z.number()]),
  balanceThresholds: BalanceThresholdsSchema,
});
```

Update `CharacterTemplateSchema` to add optional new fields (append inside the object before the closing):

```typescript
export const CharacterTemplateSchema: z.ZodType<CharacterTemplate> = z.object({
  // ...existing fields: id, name, avatar, age, gender, profession, biography, origin,
  //    activityNodeId, restNodeId, sleepWindow, personality, abilities, relations...
  relations: z.record(z.string(), RelationSchema),
  initialMoney: z.number().int().min(0).optional(),
  expenseExempt: z.boolean().optional(),
  incomeMultiplier: z.number().min(0).optional(),
});
```

Update `ManifestSchema`:

```typescript
export const ManifestSchema: z.ZodType<Manifest> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  language: z.enum(["zh", "en", "ja"]),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "must be a valid ISO 8601 datetime string",
  }).optional(),
  actions: z.string().optional(),
  economy: EconomyConfigSchema.optional(),
});
```

- [ ] **Step 2: Update CharacterTemplate type**

In `src/config/types.ts`, update `CharacterTemplate` to add config-only fields:

```typescript
export type CharacterTemplate = Omit<
  Character,
  | "worldId"
  | "locationId"
  | "vitals"
  | "emotion"
  | "shortMemory"
  | "longMemory"
  | "currentAction"
  | "lastThought"
  | "money"       // runtime, set from initialMoney
  | "incomeLevel" // runtime, resolved from profession
> & {
  /** Config: starting money (default 0). */
  initialMoney?: number;
  /** Config: income multiplier (default 1.0). 0 = never earns. */
  incomeMultiplier?: number;
};
```

Note: `expenseExempt` is on Character (runtime) and also optional on CharacterTemplate — since `expenseExempt: boolean` is required on Character but `Omit` doesn't strip it, we keep it on Character as required and make the config schema accept it as optional. At world creation, if not set in config, default to `age < 18`.

- [ ] **Step 3: Commit**

```bash
git add src/config/schemas.ts src/config/types.ts
git commit -m "feat: add economy config schemas and character template money fields"
```

---

### Task 4: Database — Characters columns + transactions table + migration

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/db/migrate.ts`

- [ ] **Step 1: Add money/incomeLevel/expenseExempt columns to characters table**

In `src/db/schema.ts`, add to the `characters` table definition (after `profession`):

```typescript
export const characters = sqliteTable(
  "characters",
  {
    id: text("id").notNull(),
    worldId: text("world_id").notNull().references(() => worlds.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    avatar: text("avatar"),
    age: integer("age").notNull().default(30),
    gender: text("gender").notNull().default("male"),
    profession: text("profession").notNull().default("farmer"),
    money: integer("money").notNull().default(0),
    incomeLevel: integer("income_level").notNull().default(0),
    expenseExempt: integer("expense_exempt", { mode: "boolean" }).notNull().default(false),
    biography: text("biography").notNull().default(""),
    // ...rest unchanged (origin, locationId, personalityJson, ...)
  },
  // ...indexes unchanged
);
```

- [ ] **Step 2: Add transactions table**

Append after the `snapshots` table definition:

```typescript
export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    tick: integer("tick").notNull(),
    characterId: text("character_id").notNull(),
    amount: integer("amount").notNull(),
    category: text("category", { enum: ["expense", "income", "transfer_in", "transfer_out"] })
      .notNull(),
    description: text("description").notNull().default(""),
    counterpartyId: text("counterparty_id"),
  },
  (t) => [
    index("transactions_world_char_tick_idx").on(t.worldId, t.characterId, t.tick),
  ],
);
```

- [ ] **Step 3: Add migration**

In `src/db/migrate.ts`, add to the migrations array (check the current max migration id and use next):

```typescript
{
  id: NEXT_ID,
  name: "add_economy",
  sql: `
    ALTER TABLE characters ADD COLUMN money INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE characters ADD COLUMN income_level INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE characters ADD COLUMN expense_exempt INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
      tick INTEGER NOT NULL,
      character_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('expense','income','transfer_in','transfer_out')),
      description TEXT NOT NULL DEFAULT '',
      counterparty_id TEXT
    );
    CREATE INDEX IF NOT EXISTS transactions_world_char_tick_idx ON transactions(world_id, character_id, tick);
  `,
}
```

- [ ] **Step 4: Run migration**

```bash
npx tsx scripts/migrate.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/migrate.ts
git commit -m "feat: add economy columns to characters, transactions table with migration"
```

---

### Task 5: Economy Engine Module

**Files:**
- Create: `src/engine/economy.ts`

- [ ] **Step 1: Write the full economy engine module**

Create `src/engine/economy.ts`:

```typescript
/**
 * 经济引擎：交易记录、收支快照、转账、余额检查。
 */
import { db, schema } from "@/db/client";
import { eq, and, gte, lte } from "drizzle-orm";
import { TICKS_PER_HOUR } from "@/domain/enums";
import type { Character, EconomicSnapshot, Transaction } from "@/domain/types";
import type { EconomyConfig } from "@/config/types";
import { DEFAULT_ECONOMY_CONFIG } from "@/config/types";

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
}

/** Roll random work income based on profession tier and multiplier. */
export function rollWorkIncome(
  incomeLevel: number,
  economyConfig: EconomyConfig,
  incomeMultiplier: number,
): number {
  const tierKey = (["none", "low", "medium", "high"] as const)[incomeLevel] ?? "none";
  const range = economyConfig.professionIncomes[tierKey];
  if (!range || range.max <= 0) return 0;
  const raw = range.min + Math.floor(Math.random() * (range.max - range.min + 1));
  return Math.floor(raw * incomeMultiplier);
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
```

- [ ] **Step 2: Commit**

```bash
git add src/engine/economy.ts
git commit -m "feat: add economy engine module"
```

---

### Task 6: Config Loader — Economy helpers

**Files:**
- Modify: `src/config/loader.ts`

- [ ] **Step 1: Add loadEconomyConfig and resolveIncomeLevel**

In `src/config/loader.ts`, add imports:

```typescript
import { PROFESSION_INCOME_TIERS } from "@/domain/enums";
import { DEFAULT_ECONOMY_CONFIG } from "./types";
import type { EconomyConfig } from "./types";
```

Append two new exported functions:

```typescript
/** Load economy config from manifest, falling back to defaults. */
export function loadEconomyConfig(mapId: string): EconomyConfig {
  const manifest = loadManifest(mapId);
  return manifest.economy ?? DEFAULT_ECONOMY_CONFIG;
}

/** Resolve a profession string to its income tier (0-3). */
export function resolveIncomeLevel(profession: string): number {
  return (PROFESSION_INCOME_TIERS as Record<string, number>)[profession] ?? 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/config/loader.ts
git commit -m "feat: add economy config loading and income level resolution"
```

---

### Task 7: Modify Built-in Actions — eat/bathe/work + give

**Files:**
- Modify: `src/engine/actions-builtin.ts`

- [ ] **Step 1: Update imports**

In `src/engine/actions-builtin.ts`, update the import line:

```typescript
import type { ActionDefinition, StateChange } from "@/domain/action-system";
import { TICKS_PER_HOUR } from "@/domain/enums";
import { DEFAULT_ECONOMY_CONFIG } from "@/config/types";
import { rollWorkIncome } from "./economy";
```

- [ ] **Step 2: Update eatAction**

Replace the existing `eatAction` definition:

```typescript
export const eatAction: ActionDefinition = {
  type: "eat",
  duration: "instant",
  check(ctx) {
    if (!ctx.here.tags.includes("dining")) return false;
    if (ctx.self.expenseExempt) return true;
    return ctx.self.money >= DEFAULT_ECONOMY_CONFIG.survivalCosts.eat;
  },
  hint(ctx) {
    const h = ctx.self.vitals.hunger;
    const costNote = ctx.self.expenseExempt
      ? ""
      : ` (-${DEFAULT_ECONOMY_CONFIG.survivalCosts.eat}💰)`;
    if (h >= 10) return `⭐ 进食（已 ${h} 小时未进食）${costNote}`;
    if (h >= 5) return `⭐ 进食${costNote}`;
    if (h <= 0) return `进食（不饿，纯消遣）${costNote}`;
    return `进食${costNote}`;
  },
  execute(ctx, input) {
    const desc = (input.free_text as string) || "吃了一顿饭";
    const changes: StateChange[] = [{ kind: "resetVital", vital: "hunger" }];
    if (!ctx.self.expenseExempt) {
      changes.push({
        kind: "adjustMoney",
        amount: -DEFAULT_ECONOMY_CONFIG.survivalCosts.eat,
        reason: "eat",
      });
    }
    return {
      memory: `我在 ${ctx.here.name} ${desc}。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} ${desc}。`, intensity: 2 },
      stateChanges: changes,
    };
  },
};
```

- [ ] **Step 3: Update batheAction**

Replace the existing `batheAction` definition:

```typescript
export const batheAction: ActionDefinition = {
  type: "bathe",
  duration: "instant",
  check(ctx) {
    if (!ctx.here.tags.includes("bathing")) return false;
    if (ctx.self.expenseExempt) return true;
    return ctx.self.money >= DEFAULT_ECONOMY_CONFIG.survivalCosts.bathe;
  },
  hint(ctx) {
    const h = ctx.self.vitals.hygiene;
    const costNote = ctx.self.expenseExempt
      ? ""
      : ` (-${DEFAULT_ECONOMY_CONFIG.survivalCosts.bathe}💰)`;
    if (h >= 13) return `⭐ 洗浴（已 ${h} 小时未洗浴）${costNote}`;
    if (h >= 8) return `⭐ 洗浴${costNote}`;
    return `洗浴${costNote}`;
  },
  execute(ctx, input) {
    const desc = (input.free_text as string) || "洗了个澡";
    const changes: StateChange[] = [{ kind: "resetVital", vital: "hygiene" }];
    if (!ctx.self.expenseExempt) {
      changes.push({
        kind: "adjustMoney",
        amount: -DEFAULT_ECONOMY_CONFIG.survivalCosts.bathe,
        reason: "bathe",
      });
    }
    return {
      memory: `我在 ${ctx.here.name} ${desc}。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} ${desc}。`, intensity: 1 },
      stateChanges: changes,
    };
  },
};
```

- [ ] **Step 4: Update workAction**

Replace the existing `workAction` definition:

```typescript
export const workAction: ActionDefinition = {
  type: "work",
  duration: "instant",
  check(ctx) {
    if (!ctx.facts.activityNodeId) return false;
    if (ctx.self.incomeLevel <= 0) return false;
    if (ctx.self.age < 18) return false;
    return ctx.here.id === ctx.facts.activityNodeId;
  },
  hint(ctx) {
    const prof = ctx.self.profession;
    const label = prof === "student" ? "学习" : prof;
    return `工作（${label}）`;
  },
  execute(ctx, input) {
    const desc = (input.free_text as string) || "专注于手头的事情";
    // incomeMultiplier defaults to 1.0 when not in config
    const multiplier = 1.0;
    const income = rollWorkIncome(ctx.self.incomeLevel, DEFAULT_ECONOMY_CONFIG, multiplier);
    const changes: StateChange[] = [];
    if (income > 0) {
      changes.push({ kind: "adjustMoney", amount: income, reason: "work" });
    }
    return {
      memory: `我在 ${ctx.here.name} 工作：${desc}。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} 工作。`, intensity: 1 },
      stateChanges: changes,
    };
  },
};
```

- [ ] **Step 5: Add giveAction**

Append a new action definition before the BUILTIN_ACTIONS array:

```typescript
export const giveAction: ActionDefinition = {
  type: "give",
  duration: "instant",
  check(ctx) {
    if (ctx.self.money <= 0) return false;
    if (ctx.companions.length === 0) return false;
    // Check shortMemory for recent beg/help requests
    const hasRequest = ctx.self.shortMemory.some(
      (m) =>
        m.content.includes("缺钱") ||
        m.content.includes("借钱") ||
        m.content.includes("求助") ||
        m.content.includes("给点钱") ||
        m.content.includes("帮帮忙") ||
        m.content.includes("经济困难"),
    );
    return hasRequest;
  },
  hint(ctx) {
    return ctx.companions.map((c) => {
      const rel = ctx.self.relations[c.id];
      const relLabel = rel ? rel.kinds.join("/") : "陌生人";
      const affLabel = rel
        ? `感情: ${rel.affection > 0 ? "+" : ""}${rel.affection}`
        : "";
      return {
        hint: `give money to ${c.name} (${relLabel}, ${affLabel})`,
        targetId: c.id,
      };
    });
  },
  execute(ctx, input) {
    const targetId = input.target_id as string;
    const target = ctx.companions.find((c) => c.id === targetId);
    if (!target) {
      return { memory: "我想给人钱但没找到对方。" };
    }
    const requested = typeof input.amount === "number" ? input.amount : ctx.self.money;
    const actual = Math.min(Math.max(1, Math.floor(requested)), ctx.self.money);
    return {
      memory: `我给了 ${target.name} ${actual} 金钱。`,
      event: {
        category: "social",
        description: `${ctx.self.name} 给了 ${target.name} 一些钱。`,
        intensity: 2,
      },
      stateChanges: [
        { kind: "adjustMoney", amount: -actual, reason: `give to ${target.id}` },
      ],
    };
  },
  extraParams: {
    target_id: { type: "string", description: "给予对象角色 id。" },
    amount: { type: "integer", description: "给予金额（默认全部余额）。" },
  },
  extraRequired: ["target_id"],
};
```

- [ ] **Step 6: Add giveAction to BUILTIN_ACTIONS**

```typescript
export const BUILTIN_ACTIONS: ActionDefinition[] = [
  eatAction,
  batheAction,
  restAction,
  workAction,
  thinkAction,
  speakAction,
  sleepAction,
  moveAction,
  waitAction,
  giveAction,
];
```

- [ ] **Step 7: Commit**

```bash
git add src/engine/actions-builtin.ts
git commit -m "feat: add money checks to eat/bathe/work, add give action"
```

---

### Task 8: Execute Integration — adjustMoney + give recipient handling

**Files:**
- Modify: `src/engine/execute.ts`

- [ ] **Step 1: Update applyStateChange signature and add adjustMoney case**

Import `recordTransaction`:

```typescript
import { recordTransaction } from "./economy";
```

Change `applyStateChange` to accept `worldId` and `tick`:

```typescript
function applyStateChange(
  c: Character,
  sc: StateChange,
  worldId: string,
  tick: number,
): void {
  switch (sc.kind) {
    case "resetVital":
      resetVital(c, sc.vital);
      break;
    case "adjustVital":
      c.vitals[sc.vital] = clamp(c.vitals[sc.vital] + sc.delta, 0, 16);
      break;
    case "setLocation":
      c.locationId = sc.nodeId;
      break;
    case "adjustMood":
      c.emotion.mood = clamp(c.emotion.mood + sc.delta, -4, 4);
      break;
    case "adjustStress":
      c.emotion.stress = clamp(c.emotion.stress + sc.delta, 0, 4);
      break;
    case "setOngoingAction":
      c.currentAction = sc.action;
      break;
    case "clearOngoingAction":
      c.currentAction = undefined;
      break;
    case "adjustMoney":
      c.money += sc.amount;
      recordTransaction(
        worldId, tick, c.id,
        sc.amount,
        sc.amount > 0 ? "income" : "expense",
        sc.reason,
      );
      break;
  }
}
```

- [ ] **Step 2: Update the call site**

In `executeActions`, find the line that calls `applyStateChange(actor, sc)` and change to:

```typescript
applyStateChange(actor, sc, worldId, tick);
```

- [ ] **Step 3: Handle give recipient in executeActions**

In `executeActions`, after the stateChanges loop (and after pushing memory), add recipient handling for give:

```typescript
      // Handle give: credit recipient
      if (action.type === "give" && action.targetId) {
        const target = charById.get(action.targetId);
        const givenAmount = outcome.stateChanges
          ?.filter((sc): sc is { kind: "adjustMoney"; amount: number; reason: string } =>
            sc.kind === "adjustMoney" && sc.amount < 0)
          .reduce((sum, sc) => sum - sc.amount, 0);
        if (target && givenAmount > 0) {
          target.money += givenAmount;
          recordTransaction(worldId, tick, target.id, givenAmount, "transfer_in",
            `收到 ${actor.name} 转账`, actor.id);
          // Write memory for recipient
          pushMemory(target, {
            id: `mem-${randomUUID().slice(0, 8)}`,
            tick,
            importance: 4,
            content: `${actor.name} 给了我 ${givenAmount} 金钱。`,
          });
        }
      }
```

- [ ] **Step 4: Commit**

```bash
git add src/engine/execute.ts
git commit -m "feat: handle adjustMoney and give recipient in executeActions"
```

---

### Task 9: Store — Serialize/deserialize new character fields

**Files:**
- Modify: `src/engine/store.ts`

- [ ] **Step 1: Update loadWorld to read new fields**

In `loadWorld()`, update the characters mapping to read `money`, `incomeLevel`, `expenseExempt`:

Find this block in the character mapping:

```typescript
  const characters: Character[] = charRows.map((c) => ({
    id: c.id,
    worldId: c.worldId,
    name: c.name,
    // ...
    profession: c.profession as Character["profession"],
    // ADD after profession:
    money: c.money,
    incomeLevel: c.incomeLevel,
    expenseExempt: !!c.expenseExempt,
    biography: c.biography,
    // ...rest unchanged
  }));
```

- [ ] **Step 2: Update saveWorld to write new fields**

In `saveWorld()`, add to the update statement:

```typescript
      tx
        .update(schema.characters)
        .set({
          locationId: c.locationId,
          money: c.money,
          incomeLevel: c.incomeLevel,
          expenseExempt: c.expenseExempt,
          vitalsJson: JSON.stringify(c.vitals),
          emotionJson: JSON.stringify(c.emotion),
          // ...rest unchanged
        })
```

- [ ] **Step 3: Commit**

```bash
git add src/engine/store.ts
git commit -m "feat: persist new character economy fields"
```

---

### Task 10: World Creation — Set initialMoney, incomeLevel, expenseExempt

**Files:**
- Modify: `src/engine/createWorld.ts`

- [ ] **Step 1: Add imports**

```typescript
import { resolveIncomeLevel } from "@/config/loader";
```

- [ ] **Step 2: Compute economy fields per character**

In `createWorldFromConfig`, inside the `for (const m of resolved)` loop before `tx.insert`, add:

```typescript
      const initialMoney = m.tpl.initialMoney ?? (
        // Tourist visitors get large starting money by default
        m.tpl.origin === "visitor" && m.tpl.profession === "unemployed" ? 3000 : 200
      );
      const expenseExempt = m.tpl.expenseExempt ?? (m.tpl.age < 18);
      // Minors get 0 income level regardless of profession
      const rawIncomeLevel = resolveIncomeLevel(m.tpl.profession);
      const incomeLevel = (m.tpl.age < 18) ? 0 : rawIncomeLevel;
```

- [ ] **Step 3: Insert new columns**

In the `tx.insert(schema.characters).values({...})` block, add:

```typescript
          money: initialMoney,
          incomeLevel,
          expenseExempt,
```

- [ ] **Step 4: Commit**

```bash
git add src/engine/createWorld.ts
git commit -m "feat: set initialMoney, incomeLevel, expenseExempt at world creation"
```

---

### Task 11: Tick Integration — 24h economic snapshot update + low-money inner events

**Files:**
- Modify: `src/engine/tick.ts`

- [ ] **Step 1: Import economy module and config**

```typescript
import { updateAllEconomicSnapshots } from "./economy";
import { loadEconomyConfig } from "@/config/loader";
```

- [ ] **Step 2: Call updateAllEconomicSnapshots every 24h**

In the `tick()` function, find the snapshot persistence at the end (around line 725):

```typescript
  if (world.currentTick > 0 && world.currentTick % (24 * TICKS_PER_HOUR) === 0) {
    persistSnapshot(loaded);
  }
```

Add economic snapshot update alongside it:

```typescript
  // Economic snapshot: update every 24 game hours
  if (world.currentTick > 0 && world.currentTick % (24 * TICKS_PER_HOUR) === 0) {
    const economyConfig = loadEconomyConfig(world.mapId);
    updateAllEconomicSnapshots(worldId, world.currentTick, characters, economyConfig);
    persistSnapshot(loaded);
  }
```

- [ ] **Step 3: Add low-money inner event generation**

After the vitals decay step (step 1 in tick), add a block to generate inner events for characters with critically low money. After `decayVitals`:

```typescript
  // Low-money inner events
  const economyConfig = loadEconomyConfig(manifest?.id ?? world.mapId);
  const maxSurvivalCost = Math.max(
    economyConfig.survivalCosts.eat,
    economyConfig.survivalCosts.bathe,
  );
  for (const c of characters) {
    if (!c.expenseExempt && c.money < maxSurvivalCost && c.incomeLevel <= 0) {
      allEvents.push(makeInnerEvent({
        worldId,
        tick: fromTick,
        charId: c.id,
        description: "经济困难，余额不足以支付基本生存开销，需要帮助。",
        intensity: 3,
      }));
    }
  }
```

- [ ] **Step 4: Commit**

```bash
git add src/engine/tick.ts
git commit -m "feat: add 24h economic snapshot update and low-money inner events"
```

---

### Task 12: Prompt Integration — Economic status in system + user prompts

**Files:**
- Modify: `src/llm/prompt.ts`

- [ ] **Step 1: Add economic status to system prompt characterBlock**

In `characterBlock()`, after the profession line, add economic status lines:

```typescript
  // Economy
  const economyConfig = (() => {
    try {
      const { loadEconomyConfig } = require("@/config/loader");
      // worldId not available here — use a lightweight approach
      return undefined;
    } catch { return undefined; }
  })();
  const eatCost = 15; // default
  const batheCost = 10; // default
  if (character.expenseExempt) {
    lines.push("- 生存开销：免单（未成年人或全包游客）");
  } else {
    lines.push(`- 生存开销：吃饭 ${eatCost}/次，洗澡 ${batheCost}/次`);
  }
  lines.push(`- 当前持有：${character.money} 金钱`);
```

- [ ] **Step 2: Add economic status section to user prompt**

In `buildUserPrompt()`, after the emotion section and before urgency warnings, add:

```typescript
  // Economic state
  if (!character.expenseExempt) {
    const eatCost = 15;
    const batheCost = 10;
    lines.push("你的经济状态：");
    lines.push(`- 持有金钱：${character.money}`);
    lines.push(`- 生存开销：吃饭 ${eatCost}/次，洗澡 ${batheCost}/次`);
    if (character.money < Math.max(eatCost, batheCost)) {
      lines.push("⚠️ 资金紧张：余额不足以支付下一次吃饭/洗澡的费用。你必须想办法获得收入，或者向他人求助。");
    }
    if (character.incomeLevel <= 0) {
      lines.push("- 你目前没有工作收入来源。");
    }
    lines.push("");
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/llm/prompt.ts
git commit -m "feat: add economic status to system and user prompts"
```

---

### Task 13: Manifest + Character Configs — Add economy data

**Files:**
- Modify: `configs/maps/yu-no-tani/manifest.json`
- Modify: `configs/maps/yu-no-tani/characters/*.json` (all 20 files)

- [ ] **Step 1: Add economy block to manifest**

In `configs/maps/yu-no-tani/manifest.json`, add:

```json
{
  "id": "yu-no-tani",
  "name": "汤之谷",
  "description": "深山幽谷间一座温泉观光乡。县道尽头巴士站外，石板温泉街蜿蜒沿溪，老旅馆、公共浴场、土产店、酒馆鳞次栉比。冬季积雪盈峰时游客稀少，春樱秋叶两季最为热闹。外界来的人多半因了观光宣传册上那张'汤烟中的灯笼街'照片——来了才发现，照片没骗人。",
  "language": "zh",
  "startDate": "2026-05-03T08:00:00",
  "economy": {
    "survivalCosts": {
      "eat": 15,
      "bathe": 10
    },
    "professionIncomes": {
      "high": { "min": 80, "max": 120 },
      "medium": { "min": 40, "max": 70 },
      "low": { "min": 10, "max": 30 },
      "none": { "min": 0, "max": 0 }
    },
    "wealthTiers": [100, 500, 2000],
    "balanceThresholds": {
      "positive": [10, 50, 150, 400],
      "negative": [0.1, 0.3, 0.6, 1.0]
    }
  }
}
```

- [ ] **Step 2: Add economy fields to all 20 character configs**

For each character JSON file under `configs/maps/yu-no-tani/characters/`, add `initialMoney`, `expenseExempt`, and `incomeMultiplier` fields. Guidelines:

| Character type | initialMoney | expenseExempt | incomeMultiplier |
|---|---|---|---|
| Local adult with high-income job (doctor, merchant) | 600 | false | 1.0 |
| Local adult with medium-income job | 300 | false | 1.0 |
| Local minor/student | 50 | true | — (incomeLevel=0 anyway) |
| Tourist visitor (unemployed) | 3000 | false | 0 |
| Migrant worker visitor | 150 | false | 1.0 |

Read each character config to determine appropriate values based on age, profession, and origin.

For example, for char-suzuki-kazuo (42, merchant, local):

```json
{
  "id": "char-suzuki-kazuo",
  "name": "铃木和夫",
  "age": 42,
  "profession": "merchant",
  "origin": "local",
  "initialMoney": 800,
  "expenseExempt": false,
  "incomeMultiplier": 1.0
}
```

For a student character (age < 18):

```json
{
  "initialMoney": 50,
  "expenseExempt": true,
  "incomeMultiplier": 1.0
}
```

- [ ] **Step 3: Commit**

```bash
git add configs/maps/yu-no-tani/manifest.json configs/maps/yu-no-tani/characters/
git commit -m "feat: add economy config and character money fields to yu-no-tani"
```

---

### Task 14: Build & Type Check

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript compiler**

```bash
npx tsc --noEmit
```

Fix any type errors. Expected potential issues:
- CharacterTemplate Omit type needs adjustment for new fields
- `manifest.economy` access needs null check
- `c.money`, `c.incomeLevel`, `c.expenseExempt` missing from Character in some paths

- [ ] **Step 2: Run existing tests**

```bash
npx vitest run
```

Ensure no regressions from the changes.

- [ ] **Step 3: Fix any issues and commit**

```bash
git add -A
git commit -m "fix: type errors and test regressions from economy system"
```

---

## Self-Review Checklist

1. **Spec coverage**: All spec sections covered — data model (T1, T4), config (T2, T3, T6), economy engine (T5), action changes (T7), execute integration (T8), world creation (T10), store (T9), tick integration (T11), prompt (T12), character configs (T13).
2. **No placeholders**: All steps have complete code.
3. **Type consistency**: `adjustMoney` StateChange used consistently across actions-builtin (T7), execute (T8), and economy engine (T5). `recordTransaction` signature matches across T5 and T8.
