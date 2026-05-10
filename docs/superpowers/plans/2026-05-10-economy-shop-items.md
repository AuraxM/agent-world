# Economy Shop + Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add items, shops, employment, and gift actions to the agent-world economy system, replacing the generic work action with shop-based employment.

**Architecture:** Follows existing patterns — ActionDefinition interface for new actions, StateChange union for side effects, JSON column persistence, config files (items.json, shops.json) with mod JS overrides (items.js, shops.js). `ActionContext` is extended to carry `shops: Shop[]` and `itemDefs: Map<string, ItemDefinition>` so all actions can access shop/item data.

**Tech Stack:** TypeScript, Drizzle ORM (SQLite), Zod schemas, Vitest

---

### Task 1: Domain types and enums

**Files:**
- Modify: `backend/src/domain/types.ts`
- Modify: `backend/src/domain/action-system.ts`

- [ ] **Step 1: Add Item type (runtime instance)**

Add after `Transaction` interface in `backend/src/domain/types.ts` (after line ~371):

```typescript
/** 运行时物品实例 */
export interface Item {
  itemDefId: string;
  acquiredTick: number;
}
```

- [ ] **Step 2: Add Shop type (runtime)**

After the Item interface:

```typescript
/** 店铺运行时状态 */
export interface Shop {
  id: string;
  worldId: string;
  nodeId: string;
  ownerCharacterId: string;
  employeeCharacterId?: string;
  goods: string[];
  salary: number;
}
```

- [ ] **Step 3: Add inventory to Character**

In the `Character` interface, after `money` (line ~178):

```typescript
/** 当前持有的物品列表 */
inventory: Item[];
```

After `notebook: NotebookEntry[]` (line ~235), add `initialItems`:

```typescript
/** 初始物品（仅创建时使用，DB 不存） */
initialItems?: string[];
```

- [ ] **Step 4: Add new StateChange variants**

In `backend/src/domain/action-system.ts`, append to the `StateChange` union (after `adjustMoney`):

```typescript
| { kind: "addItem"; itemDefId: string; count: number }
| { kind: "removeItem"; itemDefId: string; count: number }
| { kind: "setEmployment"; shopId: string; characterId?: string }
```

- [ ] **Step 5: Extend Action interface**

In `types.ts`, add to the `Action` interface after `amount`:

```typescript
/** buy/use_item/give_item 专属 */
itemDefId?: string;
itemCount?: number;
```

- [ ] **Step 6: Extend ActionContext**

In `action-system.ts`, add to `ActionContext` after `facts`:

```typescript
shops: Shop[];
itemDefs: Map<string, import("../config/types").ItemDefinition>;
```

Import `ItemDefinition` from config types at the top of `action-system.ts`:

```typescript
import type { ItemDefinition } from "../config/types";
```

Wait — this creates a circular dependency (domain ← config). Instead, define a minimal inline type or use a forward reference. Better: keep `itemDefs` as `Map<string, { id: string; name: string; value: number; consumable: boolean; effects: { vitals?: { hunger?: number; fatigue?: number; hygiene?: number }; emotion?: { mood?: number; stress?: number; socialSatiety?: number } } }>`.

Actually simplest: import the ItemDefinition type inline from config. config/types.ts does NOT import from domain/action-system, only from domain/types and domain/enums. So domain/action-system CAN import from config/types — no cycle.

```typescript
import type { ItemDefinition } from "../config/types";
```

Check: `config/types.ts` imports `MapNode, Character` from `domain/index.ts`. `domain/index.ts` re-exports `action-system.ts`. If `action-system.ts` imports from `config/types.ts`, it's a cycle. Bad.

**Fix:** Define `ItemDefinition` in domain/types.ts instead of config/types.ts. Or: define a minimal `ItemDef` interface in action-system itself:

```typescript
export interface ItemDef {
  id: string;
  name: string;
  value: number;
  consumable: boolean;
  description?: string;
  effects: {
    vitals?: { hunger?: number; fatigue?: number; hygiene?: number };
    emotion?: { mood?: number; stress?: number; socialSatiety?: number };
  };
}
```

Config's `ItemDefinition` extends or aliases this. Less code duplication. Actually the simplest: put `ItemDefinition` in `domain/types.ts` alongside the other domain types. It IS a domain type now — config just reads it from JSON. Config's `ItemDefinition` becomes an alias.

**Decision:** Move `ItemDefinition` to `domain/types.ts`. Add:

```typescript
export interface ItemDefinition {
  id: string;
  name: string;
  description?: string;
  value: number;
  consumable: boolean;
  effects: {
    vitals?: { hunger?: number; fatigue?: number; hygiene?: number };
    emotion?: { mood?: number; stress?: number; socialSatiety?: number };
  };
}
```

And update `config/types.ts` to re-export: `export type { ItemDefinition } from "../domain/types";`

Then `action-system.ts` can import `ItemDefinition` from `./types` — no cycle.

- [ ] **Step 7: Extend Transaction category**

In `types.ts` line 368, change `category` to:

```typescript
category: "expense" | "income" | "transfer_in" | "transfer_out" | "shop_sale" | "salary";
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/domain/
git commit -m "feat: add Item, ItemDefinition, Shop types and new StateChange variants"
```

---

### Task 2: DB schema — shops table + inventory column

**Files:**
- Modify: `backend/src/db/schema.ts`
- Re-run: migration

- [ ] **Step 1: Add inventory_json to characters table**

In `schema.ts`, to the `characters` table definition, add after `activeConversationIdsJson`:

```typescript
inventoryJson: text("inventory_json").notNull().default("[]"),
```

- [ ] **Step 2: Add shops table**

After the `transactions` definition:

```typescript
export const shops = sqliteTable(
  "shops",
  {
    id: text("id").notNull(),
    worldId: text("world_id").notNull().references(() => worlds.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    ownerCharacterId: text("owner_character_id").notNull(),
    employeeCharacterId: text("employee_character_id"),
    goodsJson: text("goods_json").notNull().default("[]"),
    salary: integer("salary").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.worldId, t.id] }),
    index("shops_world_idx").on(t.worldId),
  ],
);
```

- [ ] **Step 3: Run migration**

```bash
cd backend && pnpm db:migrate
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/
git commit -m "feat: add shops table and inventory_json column to characters"
```

---

### Task 3: DB repository — shop CRUD + inventory serialization

**Files:**
- Create: `backend/src/db/repository/shops.ts`
- Modify: `backend/src/db/repository/characters.ts`
- Modify: `backend/src/db/index.ts`

- [ ] **Step 1: Create shop repository**

Create `backend/src/db/repository/shops.ts`:

```typescript
import { eq } from "drizzle-orm";
import { db, schema } from "../client";
import type { Shop } from "../../domain/index";

type ShopRow = typeof schema.shops.$inferSelect;

function rowToShop(r: ShopRow): Shop {
  return {
    id: r.id, worldId: r.worldId, nodeId: r.nodeId,
    ownerCharacterId: r.ownerCharacterId,
    employeeCharacterId: r.employeeCharacterId ?? undefined,
    goods: JSON.parse(r.goodsJson) as string[],
    salary: r.salary,
  };
}

export function findShopsByWorld(worldId: string): Shop[] {
  return db.select().from(schema.shops)
    .where(eq(schema.shops.worldId, worldId)).all().map(rowToShop);
}

export function insertShops(shops: Shop[]): void {
  db.transaction((tx) => {
    for (const s of shops) {
      tx.insert(schema.shops).values({
        id: s.id, worldId: s.worldId, nodeId: s.nodeId,
        ownerCharacterId: s.ownerCharacterId,
        employeeCharacterId: s.employeeCharacterId ?? null,
        goodsJson: JSON.stringify(s.goods), salary: s.salary,
      }).run();
    }
  });
}

export function updateShopEmployment(shopId: string, employeeId: string | null): void {
  db.update(schema.shops)
    .set({ employeeCharacterId: employeeId })
    .where(eq(schema.shops.id, shopId))
    .run();
}
```

- [ ] **Step 2: Add inventory serialization to character repository**

In `backend/src/db/repository/characters.ts`:

In `rowToCharacter()`, add after `notebook: []`:

```typescript
inventory: JSON.parse(c.inventoryJson ?? "[]"),
```

In `characterToRow()`, add to the returned object:

```typescript
inventoryJson: JSON.stringify(c.inventory),
```

In `updateCharacter()` `.set()` block, add:

```typescript
inventoryJson: row.inventoryJson,
```

In `saveAllCharacters()` `.set()` block, add:

```typescript
inventoryJson: row.inventoryJson,
```

- [ ] **Step 3: Re-export from db/index.ts**

Add:

```typescript
export { findShopsByWorld, insertShops, updateShopEmployment } from "./repository/shops";
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/
git commit -m "feat: add shop repository and inventory serialization"
```

---

### Task 4: Config types and Zod schemas

**Files:**
- Modify: `backend/src/config/types.ts`
- Modify: `backend/src/config/schemas.ts`

- [ ] **Step 1: Add ShopDefinition, update CharacterTemplate and Manifest in types.ts**

In `backend/src/config/types.ts`:

```typescript
// Re-export ItemDefinition from domain (single source of truth)
export type { ItemDefinition } from "../domain/types";

export interface ShopDefinition {
  nodeId: string;
  ownerCharacterId: string;
  goods: string[];
  salary: number;
}
```

Extend `CharacterTemplate` to add optional `initialItems` — add after `disliked`:

```typescript
initialItems?: string[];
```

Extend `Manifest` to add optional `items` and `shops` paths:

Add after `events`:

```typescript
items?: string;
shops?: string;
```

- [ ] **Step 2: Add Zod schemas**

In `backend/src/config/schemas.ts`, add after the existing schemas:

```typescript
const ItemEffectSchema = z.object({
  vitals: z.object({
    hunger: z.number().int().optional(),
    fatigue: z.number().int().optional(),
    hygiene: z.number().int().optional(),
  }).optional(),
  emotion: z.object({
    mood: z.number().int().optional(),
    stress: z.number().int().optional(),
    socialSatiety: z.number().int().optional(),
  }).optional(),
});

// Import ItemDefinition from domain (not config/types to avoid cycle in schema usage)
import type { ItemDefinition } from "../domain/types";
export const ItemDefinitionSchema: z.ZodType<ItemDefinition> = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  value: z.number().int().min(0),
  consumable: z.boolean(),
  effects: ItemEffectSchema,
});

export const ShopDefinitionSchema: z.ZodType<ShopDefinition> = z.object({
  nodeId: z.string().min(1),
  ownerCharacterId: z.string().min(1),
  goods: z.array(z.string()).min(1).max(3),
  salary: z.number().int().min(0),
});
```

Update `ManifestSchema` to add:

```typescript
items: z.string().optional(),
shops: z.string().optional(),
```

Update `CharacterTemplateSchema` to add:

```typescript
initialItems: z.array(z.string()).optional(),
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/config/
git commit -m "feat: add ShopDefinition, items/shops to manifest, and Zod schemas"
```

---

### Task 5: Config loaders — items, shops with parent-child constraint

**Files:**
- Modify: `backend/src/config/loader.ts`
- Modify: `backend/src/config/mod-loader.ts`

- [ ] **Step 1: Add loadJSModule helper to loader.ts**

At the top of `backend/src/config/loader.ts`, add after existing imports:

```typescript
function loadJSModule(filePath: string): unknown {
  const code = readFileSync(filePath, "utf8");
  const module = { exports: {} as unknown };
  const fn = new Function("module", "exports", code);
  fn(module, module.exports);
  return module.exports;
}
```

- [ ] **Step 2: Add loadItems and loadShops functions**

Add after `loadEconomyConfig`:

```typescript
import { ItemDefinitionSchema } from "./schemas";
import type { ItemDefinition, ShopDefinition } from "./types";

/** Load items.json from a map pack. */
export function loadItems(packId: string): ItemDefinition[] {
  const file = path.join(scenesRoot(), packId, "items.json");
  if (!existsSync(file)) return [];
  const json = readJsonFile(file);
  if (!Array.isArray(json)) throw new Error(`items.json must be an array`);
  return json.map((item, i) => {
    const r = ItemDefinitionSchema.safeParse(item);
    if (!r.success) {
      const issues = r.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; ");
      throw new Error(`config invalid: ${file}[${i}]: ${issues}`);
    }
    return r.data;
  });
}

/** Load shops.json with parent-child constraint validation. */
export function loadShops(packId: string): ShopDefinition[] {
  const file = path.join(scenesRoot(), packId, "shops.json");
  if (!existsSync(file)) return [];
  const json = readJsonFile(file);
  if (!Array.isArray(json)) throw new Error(`shops.json must be an array`);
  const shops: ShopDefinition[] = [];
  for (let i = 0; i < json.length; i++) {
    const r = ShopDefinitionSchema.safeParse(json[i]);
    if (!r.success) {
      const issues = r.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; ");
      throw new Error(`config invalid: ${file}[${i}]: ${issues}`);
    }
    shops.push(r.data);
  }
  // Parent-child constraint
  const map = loadMap(packId);
  const nodeById = new Map(map.nodes.map((n) => [n.id, n]));
  const shopNodeIds = new Set(shops.map((s) => s.nodeId));
  for (const shop of shops) {
    let current = nodeById.get(shop.nodeId);
    if (!current) throw new Error(`shop nodeId "${shop.nodeId}" not found in map`);
    while (current.parentId) {
      if (shopNodeIds.has(current.parentId)) {
        throw new Error(
          `Shop constraint violation: node "${shop.nodeId}" has ancestor "${current.parentId}" also marked as shop.`
        );
      }
      current = nodeById.get(current.parentId);
      if (!current) break;
    }
    for (const n of map.nodes) {
      if (n.parentId === shop.nodeId && shopNodeIds.has(n.id)) {
        throw new Error(
          `Shop constraint violation: node "${shop.nodeId}" has child "${n.id}" also marked as shop.`
        );
      }
    }
  }
  return shops;
}

/** Load items from mod items.js (override/merge). */
export function loadModItems(packId: string): ItemDefinition[] {
  const manifest = loadManifest(packId);
  if (!manifest.items) return [];
  const itemsPath = path.join(scenesRoot(), packId, manifest.items);
  if (!existsSync(itemsPath)) return [];
  const mod = loadJSModule(itemsPath);
  return Array.isArray(mod) ? mod : ((mod as { default?: ItemDefinition[] }).default ?? []);
}

/** Merge base items.json + mod items.js. Mod overrides by id. */
export function loadAllItems(packId: string): ItemDefinition[] {
  const base = loadItems(packId);
  const mod = loadModItems(packId);
  const merged = new Map<string, ItemDefinition>();
  for (const item of [...base, ...mod]) merged.set(item.id, item);
  return [...merged.values()];
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/config/
git commit -m "feat: add items and shops config loaders with parent-child constraint"
```

---

### Task 6: Economy system — buyItem, paySalary, employment helpers

**Files:**
- Modify: `backend/src/systems/economy.ts`

- [ ] **Step 1: Add shop economy functions**

Add to the end of `backend/src/systems/economy.ts`:

```typescript
import type { Shop } from "../domain/index";

/** Character pays for items. Returns stateChanges including adjustMoney + addItem. */
export function buyItems(
  worldId: string, tick: number,
  buyer: Character, shop: Shop,
  itemDef: ItemDefinition, count: number,
): StateChange[] {
  const total = itemDef.value * count;
  if (!canAfford(buyer, total)) {
    throw new Error(`${buyer.name} cannot afford ${total} (has ${buyer.money})`);
  }
  const changes: StateChange[] = [
    { kind: "adjustMoney", amount: -total, reason: `buy ${itemDef.id} x${count}` },
  ];
  for (let i = 0; i < count; i++) {
    changes.push({ kind: "addItem", itemDefId: itemDef.id, count: 1 });
  }
  recordTransaction(worldId, tick, buyer.id, -total, "expense",
    `购买 ${itemDef.name} x${count} @ ${shop.nodeId}`);
  // Owner earns (unless buying from own shop — net zero handled in execute)
  if (buyer.id !== shop.ownerCharacterId) {
    // Signal to credit owner via targetCharacterId on adjustMoney
    changes.push({
      kind: "adjustMoney", amount: total, reason: `shop_sale ${itemDef.id}`,
      targetCharacterId: shop.ownerCharacterId,
    });
    recordTransaction(worldId, tick, shop.ownerCharacterId, total, "shop_sale",
      `销售 ${itemDef.name} x${count} 给 ${buyer.name}`, buyer.id);
  }
  return changes;
}

/** Pay salary for completing work shift. */
export function paySalary(
  worldId: string, tick: number,
  character: Character, shop: Shop,
): StateChange[] {
  recordTransaction(worldId, tick, character.id, shop.salary, "salary",
    `${shop.id} 工资`);
  return [{ kind: "adjustMoney", amount: shop.salary, reason: `salary ${shop.id}` }];
}

/** Check employment relationship. */
export function canWorkAt(character: Character, shop: Shop): boolean {
  return shop.ownerCharacterId === character.id || shop.employeeCharacterId === character.id;
}

/** Find a shop employing this character. */
export function findEmployment(character: Character, shops: Shop[]): Shop | undefined {
  return shops.find((s) =>
    s.ownerCharacterId === character.id || s.employeeCharacterId === character.id
  );
}

/** Find a shop at a node. */
export function findShopAtNode(nodeId: string, shops: Shop[]): Shop | undefined {
  return shops.find((s) => s.nodeId === nodeId);
}

/** Find shop by id. */
export function findShopById(shopId: string, shops: Shop[]): Shop | undefined {
  return shops.find((s) => s.id === shopId);
}
```

Add `ItemDefinition` and `StateChange` imports if not already present:

```typescript
import type { ItemDefinition, Shop, StateChange } from "../domain/index";
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/systems/economy.ts
git commit -m "feat: add buyItems, paySalary, and employment helpers to economy"
```

---

### Task 7: Execute.ts — new StateChange variants + shops in context

**Files:**
- Modify: `backend/src/systems/execute.ts`

- [ ] **Step 1: Add StateChange handling**

In `applyStateChange()`, add after the `adjustMoney` case:

```typescript
case "addItem": {
  for (let i = 0; i < (sc.count ?? 1); i++) {
    c.inventory.push({ itemDefId: sc.itemDefId, acquiredTick: tick });
  }
  break;
}
case "removeItem": {
  for (let i = 0; i < (sc.count ?? 1); i++) {
    const idx = c.inventory.findIndex((item) => item.itemDefId === sc.itemDefId);
    if (idx !== -1) c.inventory.splice(idx, 1);
  }
  break;
}
case "setEmployment": {
  // Marker — actual shop update happens in tick.ts via updateShopEmployment
  break;
}
```

- [ ] **Step 2: Update executeActions to build ctx with shops and itemDefs**

Modify `ExecuteInput` to accept shops:

```typescript
interface ExecuteInput {
  worldId: string;
  tick: number;
  epoch: number;
  characters: Character[];
  nodes: MapNode[];
  actions: Action[];
  shops: Shop[];
  itemDefs: Map<string, ItemDefinition>;
}
```

In the `executeActions` function body, where `ctx` is built (around line 218), add:

```typescript
shops: input.shops,
itemDefs: input.itemDefs,
```

Add the needed import:

```typescript
import type { ItemDefinition, Shop } from "../domain/index";
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/systems/execute.ts
git commit -m "feat: add addItem/removeItem to applyStateChange, shops+itemDefs to context"
```

---

### Task 8: Built-in actions — work refactor, buy, use_item, give_item, manage_employment

**Files:**
- Modify: `backend/src/systems/actions-builtin.ts`

- [ ] **Step 1: Rewrite workAction**

Replace the existing `workAction` definition (lines 127-179):

```typescript
export const workAction: ActionDefinition = {
  type: "work",
  duration: 10,
  triggerHint: "在雇佣你的店铺工作，完成 10 tick 后获得工资。",
  paramRule: "可选 free_text。需在雇佣你的店铺节点。",
  check(ctx) {
    const emp = findEmployment(ctx.self, ctx.shops);
    if (!emp) return false;
    return ctx.here.id === emp.nodeId;
  },
  hint(ctx) {
    const emp = findEmployment(ctx.self, ctx.shops);
    if (!emp) return "工作（未被雇佣）";
    const node = emp.nodeId; // node name is in ctx.here if at shop
    return `工作（${ctx.here.name}，${emp.salary}💰/次，10 ticks）`;
  },
  validateParams() { return null; },
  execute(ctx, input) {
    const desc = (input.free_text as string) || "开始工作";
    const emp = findEmployment(ctx.self, ctx.shops)!;
    return {
      memory: `我在 ${ctx.here.name} 开始工作：${desc}。`,
      event: { category: "action", description: `${ctx.self.name} 在 ${ctx.here.name} 开始工作。`, intensity: 1 },
      stateChanges: [{
        kind: "setOngoingAction",
        action: {
          type: "work",
          startedAt: ctx.tick,
          endsAt: ctx.tick + 10,
          description: `在 ${ctx.here.name} 工作`,
          interruptThreshold: 3,
        },
      }],
    };
  },
  onComplete(ctx) {
    const emp = findEmployment(ctx.self, ctx.shops);
    if (!emp) return { memory: "我完成了工作但店铺已不存在。", stateChanges: [] };
    const changes = paySalary(ctx.worldId, ctx.tick, ctx.self, emp);
    return {
      memory: `我完成了工作，收到 ${emp.salary}💰 工资。`,
      event: { category: "action", description: `${ctx.self.name} 完成了工作。`, intensity: 2 },
      stateChanges: changes,
    };
  },
  onInterrupt(ctx, reason) {
    return {
      memory: `工作被打断——${reason}，没有收入。`,
      event: { category: "action", description: `${ctx.self.name} 的工作被打断。`, intensity: 3 },
    };
  },
};
```

Add imports at the top of the file (replace the old `rollWorkIncome` import):

```typescript
import { paySalary, findEmployment, findShopAtNode } from "./economy";
```

- [ ] **Step 2: Add buyAction**

```typescript
export const buyAction: ActionDefinition = {
  type: "buy",
  duration: "instant",
  triggerHint: "在店铺购买物品。店铺商品无限供应。",
  paramRule: "必填 item_def_id（物品ID，从店铺商品列表中选择），可选 item_count（默认1）。",
  check(ctx) {
    const shop = findShopAtNode(ctx.here.id, ctx.shops);
    if (!shop) return false;
    // Check can afford at least the cheapest item
    const cheapest = Math.min(...shop.goods.map((gid) => ctx.itemDefs.get(gid)?.value ?? Infinity));
    return canAfford(ctx.self, cheapest === Infinity ? 0 : cheapest);
  },
  hint(ctx) {
    const shop = findShopAtNode(ctx.here.id, ctx.shops)!;
    const goods = shop.goods.map((gid) => ctx.itemDefs.get(gid)).filter(Boolean);
    if (goods.length === 0) return "（店铺暂无可购买物品）";
    return goods.map((g) => ({
      hint: `购买 ${g!.name}（$${g!.value}）`,
    }));
  },
  validateParams(input, ctx) {
    const itemDefId = input.item_def_id as string | undefined;
    if (!itemDefId) return "buy 需要 item_def_id";
    const shop = findShopAtNode(ctx.here.id, ctx.shops);
    if (!shop) return "当前位置没有店铺";
    if (!shop.goods.includes(itemDefId)) return `店铺不销售 "${itemDefId}"，可选：${shop.goods.join(", ")}`;
    const itemDef = ctx.itemDefs.get(itemDefId);
    if (!itemDef) return `未知物品 "${itemDefId}"`;
    const count = (input.item_count as number) ?? 1;
    const total = itemDef.value * count;
    if (!canAfford(ctx.self, total)) return `钱不够（需要 ${total}，当前 ${ctx.self.money}）`;
    return null;
  },
  execute(ctx, input) {
    const itemDefId = input.item_def_id as string;
    const count = (input.item_count as number) ?? 1;
    const shop = findShopAtNode(ctx.here.id, ctx.shops)!;
    const itemDef = ctx.itemDefs.get(itemDefId)!;
    const changes = buyItems(ctx.worldId, ctx.tick, ctx.self, shop, itemDef, count);
    return {
      memory: `我购买了 ${itemDef.name} x${count}，花费 ${itemDef.value * count}💰。`,
      event: { category: "action", description: `${ctx.self.name} 购买了 ${itemDef.name}。`, intensity: 1 },
      stateChanges: changes,
    };
  },
  extraParams: {
    item_def_id: { type: "string", description: "要购买的物品 ID。" },
    item_count: { type: "integer", description: "购买数量，默认 1。" },
  },
  extraRequired: ["item_def_id"],
};
```

Import `buyItems` from economy at top:

```typescript
import { canAfford, buyItems } from "./economy";
```

- [ ] **Step 3: Add useItemAction**

```typescript
export const useItemAction: ActionDefinition = {
  type: "use_item",
  duration: "instant",
  triggerHint: "使用背包中的物品。消耗品使用后会消失。",
  paramRule: "必填 item_def_id（从背包中选择）。",
  check(ctx) {
    return ctx.self.inventory.length > 0;
  },
  hint(ctx) {
    const defs = ctx.itemDefs;
    const groups = new Map<string, number>();
    for (const item of ctx.self.inventory) {
      groups.set(item.itemDefId, (groups.get(item.itemDefId) ?? 0) + 1);
    }
    return [...groups.entries()].map(([id, qty]) => {
      const def = defs.get(id);
      return { hint: `使用 ${def?.name ?? id}（持有 ${qty}）` };
    });
  },
  validateParams(input, ctx) {
    const itemDefId = input.item_def_id as string | undefined;
    if (!itemDefId) return "use_item 需要 item_def_id";
    if (!ctx.self.inventory.some((i) => i.itemDefId === itemDefId)) {
      return `你没有 "${itemDefId}"`;
    }
    return null;
  },
  execute(ctx, input) {
    const itemDefId = input.item_def_id as string;
    const itemDef = ctx.itemDefs.get(itemDefId);
    if (!itemDef) return { memory: `我尝试使用未知物品 ${itemDefId}。` };
    const changes: StateChange[] = [];
    if (itemDef.consumable) {
      changes.push({ kind: "removeItem", itemDefId, count: 1 });
    }
    if (itemDef.effects.vitals) {
      const v = itemDef.effects.vitals;
      if (v.hunger) changes.push({ kind: "adjustVital", vital: "hunger", delta: -v.hunger });
      if (v.fatigue) changes.push({ kind: "adjustVital", vital: "fatigue", delta: -v.fatigue });
      if (v.hygiene) changes.push({ kind: "adjustVital", vital: "hygiene", delta: -v.hygiene });
    }
    if (itemDef.effects.emotion) {
      const e = itemDef.effects.emotion;
      if (e.mood) changes.push({ kind: "adjustMood", delta: e.mood });
      if (e.stress) changes.push({ kind: "adjustStress", delta: e.stress });
      if (e.socialSatiety) changes.push({ kind: "adjustSocialSatiety", delta: e.socialSatiety });
    }
    return {
      memory: `我使用了 ${itemDef.name}。`,
      event: { category: "action", description: `${ctx.self.name} 使用了 ${itemDef.name}。`, intensity: 1 },
      stateChanges: changes,
    };
  },
  extraParams: {
    item_def_id: { type: "string", description: "要使用的物品 ID（从背包选择）。" },
  },
  extraRequired: ["item_def_id"],
};
```

- [ ] **Step 4: Add giveItemAction (dialogue action)**

```typescript
export const giveItemAction: ActionDefinition = {
  type: "give_item",
  displayName: "赠送物品",
  duration: "instant",
  usableInDialogue: true,
  triggerHint: "对话中赠送物品给对方。",
  paramRule: "必填 item_def_id（从背包选择要赠送的物品）。仅对话中可用。",
  check(_ctx) { return false; }, // dialogue only
  hint(ctx) {
    return ctx.companions.map((c) => ({
      hint: `赠送物品给 ${c.name}`,
      targetId: c.id,
    }));
  },
  validateParams(input, ctx) {
    const itemDefId = input.item_def_id as string | undefined;
    if (!itemDefId) return "give_item 需要 item_def_id";
    if (!ctx.self.inventory.some((i) => i.itemDefId === itemDefId)) {
      return `你没有 "${itemDefId}" 可以赠送`;
    }
    return null;
  },
  execute(ctx, input) {
    const targetId = input.target_id as string;
    const target = ctx.companions.find((c) => c.id === targetId);
    if (!target) return { memory: "赠送失败：找不到对方。" };
    const itemDefId = input.item_def_id as string;
    const itemDef = ctx.itemDefs.get(itemDefId);
    const sysMsg = `${ctx.self.name} 赠送了 ${itemDef?.name ?? itemDefId}（价值 ${itemDef?.value ?? "?"}💰）给 ${target.name}。`;
    return {
      memory: `我赠送了 ${itemDef?.name ?? itemDefId} 给 ${target.name}。`,
      targetMemory: `${ctx.self.name} 赠送了 ${itemDef?.name ?? itemDefId} 给我。`,
      event: { category: "social", description: sysMsg, intensity: 3 },
      stateChanges: [
        { kind: "removeItem", itemDefId, count: 1 },
        { kind: "addItem", itemDefId, count: 1, __target: target.id },
      ],
      dialogRecord: sysMsg,
    };
  },
  extraParams: {
    target_id: { type: "string", description: "赠送对象角色 id。" },
    item_def_id: { type: "string", description: "要赠送的物品 ID。" },
  },
  extraRequired: ["target_id", "item_def_id"],
};
```

- [ ] **Step 5: Add manageEmploymentAction (dialogue action)**

```typescript
export const manageEmploymentAction: ActionDefinition = {
  type: "manage_employment",
  displayName: "管理雇佣",
  duration: "instant",
  usableInDialogue: true,
  triggerHint: "作为店主，在对话中雇佣或解雇对方。",
  paramRule: "必填 target_id（雇佣/解雇对象）+ employment_action（hire/fire）。仅店主在对话中可用。",
  check(_ctx) { return false; }, // dialogue only
  hint(ctx) {
    return ctx.companions.map((c) => ({
      hint: `雇佣/解雇 ${c.name}`,
      targetId: c.id,
    }));
  },
  validateParams(input, ctx) {
    const action = input.employment_action as string | undefined;
    if (!action || !["hire", "fire"].includes(action)) return "需要 employment_action: hire 或 fire";
    const shop = findEmployment(ctx.self, ctx.shops);
    if (!shop || shop.ownerCharacterId !== ctx.self.id) return "只有店主可以管理雇佣";
    return null;
  },
  execute(ctx, input) {
    const targetId = input.target_id as string;
    const target = ctx.companions.find((c) => c.id === targetId);
    if (!target) return { memory: "找不到操作对象。" };
    const action = input.employment_action as "hire" | "fire";
    const shop = findEmployment(ctx.self, ctx.shops)!;
    if (action === "hire") {
      // Check target not already employed elsewhere
      const targetEmp = findEmployment(target, ctx.shops);
      if (targetEmp) return { memory: `${target.name} 已有工作。`, targetMemory: `雇佣失败：${target.name} 已有工作。` };
      if (shop.employeeCharacterId) return { memory: `店铺已有雇员，需先解雇。`, targetMemory: `雇佣失败：店铺已有雇员。` };
      return {
        memory: `我雇佣了 ${target.name}。`,
        targetMemory: `${ctx.self.name} 雇佣了你 在 ${ctx.here.name}。`,
        event: { category: "social", description: `${ctx.self.name} 雇佣了 ${target.name}。`, intensity: 3 },
        stateChanges: [{ kind: "setEmployment", shopId: shop.id, characterId: target.id }],
        dialogRecord: `${ctx.self.name} 雇佣了 ${target.name}。`,
      };
    } else {
      if (shop.employeeCharacterId !== target.id) return { memory: `${target.name} 不是店铺雇员。` };
      return {
        memory: `我解雇了 ${target.name}。`,
        targetMemory: `${ctx.self.name} 解雇了你 从 ${ctx.here.name}。`,
        event: { category: "social", description: `${ctx.self.name} 解雇了 ${target.name}。`, intensity: 3 },
        stateChanges: [{ kind: "setEmployment", shopId: shop.id }], // undefined = 解雇
        dialogRecord: `${ctx.self.name} 解雇了 ${target.name}。`,
      };
    }
  },
  extraParams: {
    target_id: { type: "string", description: "雇佣/解雇对象角色 id。" },
    employment_action: { type: "string", description: "hire 或 fire。" },
  },
  extraRequired: ["target_id", "employment_action"],
};
```

- [ ] **Step 6: Register new actions in BUILTIN_ACTIONS array**

Update `BUILTIN_ACTIONS`:

```typescript
export const BUILTIN_ACTIONS: ActionDefinition[] = [
  eatAction, batheAction, restAction, workAction, thinkAction,
  chatAction, sleepAction, moveAction, giveAction, travelTogetherAction,
  lookAroundAction, buyAction, useItemAction, giveItemAction, manageEmploymentAction,
];
```

- [ ] **Step 7: Handle cross-character addItem for give_item**

The `addItem` with `__target` property needs handling in `execute.ts`. Update the `applyStateChange` or `executeActions` to support `addItem` targeting another character. Add to `applyStateChange`:

No — `applyStateChange` only operates on `c` (the actor). For `give_item`, the target's addItem should be handled separately. Modify `executeActions` to check for `__target` on addItem and push to the target character.

In `execute.ts`, after the state changes loop in `executeActions`, add:

```typescript
// Handle cross-character item transfer (give_item)
if (outcome.stateChanges) {
  for (const sc of outcome.stateChanges) {
    if (sc.kind === "addItem" && (sc as any).__target) {
      const targetChar = charById.get((sc as any).__target as string);
      if (targetChar) {
        applyStateChange(targetChar, { kind: "addItem", itemDefId: sc.itemDefId, count: sc.count }, worldId, tick);
      }
    }
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add backend/src/systems/
git commit -m "feat: add buy, use_item, give_item, manage_employment actions and refactor work"
```

---

### Task 9: LLM Prompt — shop annotations

**Files:**
- Modify: `backend/src/llm/prompt.ts`

- [ ] **Step 1: Add shops parameter to buildUserPrompt and related functions**

The `buildUserPrompt` function signature needs to accept shops and itemDefs:

In `buildUserPrompt` (around line 1699), add to the args:

```typescript
shops: Shop[],
itemDefs: Map<string, ItemDefinition>,
```

Import `Shop` and `ItemDefinition` at the top of `prompt.ts`.

- [ ] **Step 2: Annotate shops in describeMapGraph**

Modify `describeMapGraph` to accept `shops: Shop[]` and append `[店铺]` to shop nodes:

Change the `render` function (line ~631):

```typescript
const shopNodeIds = new Set(shops?.map((s) => s.nodeId) ?? []);
const render = (n: MapNode, depth: number): void => {
  const indent = "  ".repeat(depth);
  const tagPart = n.tags.length > 0 ? n.tags.join("/") : n.privacy;
  const shopMarker = shopNodeIds.has(n.id) ? " [店铺]" : "";
  treeLines.push(`${indent}- ${n.name} [${n.id}]（${tagPart}）${shopMarker}`);
  for (const kid of childrenOf.get(n.id) ?? []) render(kid, depth + 1);
};
```

Also annotate in `describeLocalMap`:

```typescript
const shopNodeIds = new Set(shops?.map((s) => s.nodeId) ?? []);
const shopPrefix = shopNodeIds.has(here.id) ? "[店铺] " : "";
lines.push(`当前位置：${shopPrefix}${here.name} [${here.id}]（${here.privacy}, ${tagStr}）`);
```

- [ ] **Step 3: Inject shop info when character is at a shop**

In `buildUserPrompt`, after the local map section, if the character is at a shop node:

```typescript
const shop = shops.find((s) => s.nodeId === here.id);
if (shop) {
  lines.push(`\n你在【${here.name}】，这里可以购买：`);
  for (const gid of shop.goods) {
    const def = itemDefs.get(gid);
    if (def) lines.push(`  - ${def.name}（$${def.value}）：${def.description ?? "无描述"}`);
  }
  const isOwner = shop.ownerCharacterId === character.id;
  const isEmployee = shop.employeeCharacterId === character.id;
  if (isOwner) lines.push(`（你是本店店主，工资：$${shop.salary}/次）`);
  else if (isEmployee) lines.push(`（你在此工作，工资：$${shop.salary}/次）`);
}
```

- [ ] **Step 4: Pass shops/itemDefs from decide.ts**

In `backend/src/llm/decide.ts`, the `DecideInput` interface needs shops and itemDefs. Update `DecideInput`:

```typescript
shops: Shop[];
itemDefs: Map<string, ItemDefinition>;
```

And pass them through to `buildUserPrompt` call.

- [ ] **Step 5: Commit**

```bash
git add backend/src/llm/
git commit -m "feat: add shop annotations to map display and shop info prompt"
```

---

### Task 10: World bootstrap + store layer — shops loading/persistence

**Files:**
- Modify: `backend/src/systems/store.ts`
- Modify: `backend/src/systems/createWorld.ts`
- Modify: `backend/src/systems/addCharacter.ts`
- Modify: `backend/src/server/tick.ts`

- [ ] **Step 1: Add shops to LoadedWorld**

In `backend/src/systems/store.ts`, update `LoadedWorld`:

```typescript
export interface LoadedWorld {
  world: World;
  nodes: MapNode[];
  characters: Character[];
  shops: Shop[];
}
```

In `loadWorld()`, add shop loading:

```typescript
const shops = findShopsByWorld(worldId);
return { world, nodes, characters, shops };
```

Add import: `import { findShopsByWorld } from "../db/index";`

- [ ] **Step 2: Add shops persistence to saveWorld**

`solve` is in-memory only — shops are read on load. Employment changes need to be persisted immediately though. The `updateShopEmployment` DB function handles that. No change to `saveWorld`.

- [ ] **Step 3: Create shops in createWorld**

In `backend/src/systems/createWorld.ts`, after inserting nodes and characters, insert shops:

```typescript
import { loadShops, loadAllItems } from "../config/index";
import { insertShops } from "../db/index";

// Inside createWorldFromConfig, after character insertion (line ~210):
const shopDefs = loadShops(mapId);
for (const sd of shopDefs) {
  insertShops([{
    id: `shop-${sd.nodeId}`,
    worldId,
    nodeId: sd.nodeId,
    ownerCharacterId: sd.ownerCharacterId,
    employeeCharacterId: undefined,
    goods: sd.goods,
    salary: sd.salary,
  }]);
}
```

- [ ] **Step 4: Handle initialItems in createWorld and addCharacter**

In `createWorldFromConfig`, when inserting characters, add `inventoryJson`:

```typescript
const itemDefs = loadAllItems(mapId);
const initialInventory = (m.tpl.initialItems ?? []).map((itemId) => ({
  itemDefId: itemId,
  acquiredTick: 0,
}));
```

And in the insert values:

```typescript
inventoryJson: JSON.stringify(initialInventory),
```

Also update `addCharacterToWorld` similarly to load item defs and create initial inventory from `tpl.initialItems`.

- [ ] **Step 5: Update tick.ts to pass shops and itemDefs through**

In `backend/src/server/tick.ts`:

- Load shops from `loaded.shops`
- Load item defs via `loadAllItems(world.mapId)`
- Build an `itemDefs` Map
- Pass `shops` and `itemDefs` to `executeActions()`, `buildActionContext()`, and `llmDecide()`
- After dialogue action execution, call `updateShopEmployment()` for `setEmployment` state changes
- Update `buildMapView()` and `buildUserPrompt()` calls to include shops

In the tick loop where `executeActions` is called, find and pass `shops` and `itemDefs`:

```typescript
const itemDefsArr = loadAllItems(world.mapId);
const itemDefs = new Map(itemDefsArr.map((d) => [d.id, d]));

// Pass to executeActions:
const execResult = executeActions({
  worldId, tick: fromTick, epoch: world.epoch,
  characters, nodes, actions, shops: loaded.shops, itemDefs,
});
```

- [ ] **Step 6: Handle setEmployment after dialogue**

After the dialogue phase in tick.ts, check resolved actions for `setEmployment` state changes and apply them:

```typescript
for (const action of resolvedActions) {
  // Check outcome for setEmployment state change
  // Call updateShopEmployment(shopId, employeeId)
}
```

This should be done by checking the action's outcome for setEmployment. The simplest approach: after dialogue action execution succeeds, if the action type is `manage_employment`, extract the shop ID and update the DB + in-memory shop object.

- [ ] **Step 7: Commit**

```bash
git add backend/src/systems/ backend/src/server/
git commit -m "feat: wire shops and items into world bootstrap, store, and tick"
```

---

### Task 11: Tests — actions and economy

**Files:**
- Create: `backend/src/systems/economy.test.ts` (if not exists, add shop tests)
- Modify: `backend/src/systems/actions-builtin.test.ts`

- [ ] **Step 1: Write economy shop function tests**

Add to `economy.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { canWorkAt, findEmployment, findShopAtNode, findShopById } from "./economy";
import type { Shop, Character } from "../domain/index";

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1", worldId: "w1", name: "Test", age: 20, gender: "male",
    profession: "merchant", money: 500, incomeLevel: 2, expenseExempt: false,
    inventory: [], locationId: "node-1",
    personalProfile: { past: "", present: "" },
    personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
    vitals: { hunger: 0, fatigue: 0, hygiene: 0 },
    emotion: { mood: 0, stress: 0, social_satiety: 0 },
    abilities: [], appearance: 2, intelligence: 2, health: 2,
    activeConversationIds: [], lastConversationEndTick: 0,
    shortMemory: [], dailyMemory: [], longMemory: [],
    relations: {}, lastSleepTick: 0,
    impressionBook: {}, notebook: [],
    shortTermGoal: null, longTermGoal: null,
    liked: "", disliked: "",
    origin: "local",
    ...overrides,
  };
}

function makeShop(overrides: Partial<Shop> = {}): Shop {
  return {
    id: "shop-1", worldId: "w1", nodeId: "node-store",
    ownerCharacterId: "char-owner", employeeCharacterId: undefined,
    goods: ["bread", "water"], salary: 80,
    ...overrides,
  };
}

const shop = makeShop();
const shops = [shop];

describe("canWorkAt", () => {
  it("returns true for owner", () => {
    expect(canWorkAt(makeChar({ id: "char-owner" }), shop)).toBe(true);
  });
  it("returns true for employee", () => {
    expect(canWorkAt(makeChar({ id: "char-emp" }), makeShop({ employeeCharacterId: "char-emp" }))).toBe(true);
  });
  it("returns false for unrelated character", () => {
    expect(canWorkAt(makeChar({ id: "char-other" }), shop)).toBe(false);
  });
});

describe("findEmployment", () => {
  it("finds by owner", () => {
    expect(findEmployment(makeChar({ id: "char-owner" }), shops)!.id).toBe("shop-1");
  });
  it("finds by employee", () => {
    expect(findEmployment(makeChar({ id: "char-emp" }), [makeShop({ employeeCharacterId: "char-emp" })])!.id).toBe("shop-1");
  });
  it("returns undefined if not employed", () => {
    expect(findEmployment(makeChar({ id: "char-other" }), shops)).toBeUndefined();
  });
});

describe("findShopAtNode", () => {
  it("finds by nodeId", () => {
    expect(findShopAtNode("node-store", shops)!.id).toBe("shop-1");
  });
  it("returns undefined for non-shop node", () => {
    expect(findShopAtNode("nowhere", shops)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Write action tests**

Add to `actions-builtin.test.ts`:

```typescript
import {
  buyAction, useItemAction, giveItemAction,
  manageEmploymentAction, workAction,
} from "./actions-builtin";
import { findEmployment, findShopAtNode } from "./economy";
import type { ItemDefinition, Shop } from "../domain/index";

function makeItemDef(overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    id: "bread", name: "面包", value: 50, consumable: true,
    effects: { vitals: { hunger: 30 } },
    ...overrides,
  };
}

function makeCtx(overrides: any = {}) {
  const self = makeChar({ id: "char-1", ...overrides.self });
  const here = { id: "node-store", name: "便利店", tags: [], ...overrides.here };
  return {
    worldId: "w1", tick: 0, epoch: 0, self, here,
    companions: [], reachable: [], isSleepHour: false,
    facts: { activityNodeId: null, activityNodeName: null, restNodeId: null,
      restNodeName: null, hoursAtCurrentLocation: 0, todayActionCounts: {}, todayChatTargets: {} },
    shops: overrides.shops ?? [],
    itemDefs: overrides.itemDefs ?? new Map(),
  };
}

describe("buy action", () => {
  const itemDef = makeItemDef();
  const shop = makeShop({ nodeId: "node-store", goods: ["bread"] });
  const ctx = makeCtx({
    self: { id: "char-1", money: 100, inventory: [] },
    here: { id: "node-store" },
    shops: [shop],
    itemDefs: new Map([["bread", itemDef]]),
  });

  it("check passes when at shop with enough money", () => {
    expect(buyAction.check(ctx)).toBe(true);
  });

  it("check fails when not at shop", () => {
    const noShopCtx = makeCtx({
      self: { id: "char-1", money: 100 },
      here: { id: "nowhere" },
      shops: [],
      itemDefs: new Map(),
    });
    expect(buyAction.check(noShopCtx)).toBe(false);
  });

  it("validateParams rejects invalid item", () => {
    expect(buyAction.validateParams!({ item_def_id: "invalid" }, ctx)).toContain("不销售");
  });

  it("execute produces adjustMoney and addItem stateChanges", () => {
    const result = buyAction.execute(ctx, { item_def_id: "bread" });
    expect(result.stateChanges).toBeDefined();
    const hasAddItem = result.stateChanges!.some((sc) => sc.kind === "addItem" && sc.itemDefId === "bread");
    expect(hasAddItem).toBe(true);
  });
});

describe("use_item action", () => {
  const itemDef = makeItemDef();
  const ctx = makeCtx({
    self: { id: "char-1", inventory: [{ itemDefId: "bread", acquiredTick: 0 }] },
    itemDefs: new Map([["bread", itemDef]]),
  });

  it("check passes when inventory not empty", () => {
    expect(useItemAction.check(ctx)).toBe(true);
  });

  it("check fails when inventory empty", () => {
    const emptyCtx = makeCtx({
      self: { id: "char-1", inventory: [] },
    });
    expect(useItemAction.check(emptyCtx)).toBe(false);
  });

  it("execute applies vitals effect", () => {
    const result = useItemAction.execute(ctx, { item_def_id: "bread" });
    const hasHungerAdjust = result.stateChanges!.some(
      (sc) => sc.kind === "adjustVital" && sc.vital === "hunger"
    );
    expect(hasHungerAdjust).toBe(true);
  });

  it("execute removes consumable item", () => {
    const result = useItemAction.execute(ctx, { item_def_id: "bread" });
    const hasRemove = result.stateChanges!.some(
      (sc) => sc.kind === "removeItem" && sc.itemDefId === "bread"
    );
    expect(hasRemove).toBe(true);
  });
});

describe("give_item action", () => {
  const itemDef = makeItemDef();
  const target = makeChar({ id: "char-2", name: "Target", inventory: [] });
  const ctx = makeCtx({
    self: { id: "char-1", name: "Giver", inventory: [{ itemDefId: "bread", acquiredTick: 0 }] },
    companions: [target],
    itemDefs: new Map([["bread", itemDef]]),
  });

  it("is dialogue-only (check returns false)", () => {
    expect(giveItemAction.check(ctx)).toBe(false);
  });

  it("execute transfers item and produces dialogRecord", () => {
    const result = giveItemAction.execute(ctx, { target_id: "char-2", item_def_id: "bread" });
    expect(result.dialogRecord).toContain("面包");
    expect(result.dialogRecord).toContain("50");
    const hasRemove = result.stateChanges!.some((sc) => sc.kind === "removeItem");
    const hasAdd = result.stateChanges!.some((sc) => sc.kind === "addItem");
    expect(hasRemove).toBe(true);
    expect(hasAdd).toBe(true);
  });
});

describe("manage_employment action", () => {
  const shop = makeShop({ nodeId: "node-store", ownerCharacterId: "char-1" });
  const target = makeChar({ id: "char-2", name: "Target", inventory: [] });
  const ctx = makeCtx({
    self: { id: "char-1", name: "Owner" },
    companions: [target],
    shops: [shop],
    itemDefs: new Map(),
  });

  it("is dialogue-only", () => {
    expect(manageEmploymentAction.check(ctx)).toBe(false);
  });

  it("execute hire produces setEmployment stateChange", () => {
    const result = manageEmploymentAction.execute(ctx, {
      target_id: "char-2", employment_action: "hire",
    });
    const hasSet = result.stateChanges!.some(
      (sc) => sc.kind === "setEmployment" && sc.characterId === "char-2"
    );
    expect(hasSet).toBe(true);
    expect(result.targetMemory).toContain("雇佣");
  });

  it("execute fire produces setEmployment without characterId", () => {
    const fireCtx = makeCtx({
      self: { id: "char-1", name: "Owner" },
      companions: [target],
      shops: [makeShop({ ...shop, employeeCharacterId: "char-2" })],
      itemDefs: new Map(),
    });
    const result = manageEmploymentAction.execute(fireCtx, {
      target_id: "char-2", employment_action: "fire",
    });
    const hasSet = result.stateChanges!.some(
      (sc) => sc.kind === "setEmployment" && sc.characterId === undefined
    );
    expect(hasSet).toBe(true);
    expect(result.targetMemory).toContain("解雇");
  });
});

describe("work action (refactored)", () => {
  const shop = makeShop({ nodeId: "node-store", ownerCharacterId: "char-1", employeeCharacterId: "char-2" });
  it("check passes when employed and at shop", () => {
    const ctx = makeCtx({
      self: { id: "char-2" },
      here: { id: "node-store" },
      shops: [shop],
    });
    expect(workAction.check(ctx)).toBe(true);
  });

  it("check fails when not at shop", () => {
    const ctx = makeCtx({
      self: { id: "char-2" },
      here: { id: "other-node" },
      shops: [shop],
    });
    expect(workAction.check(ctx)).toBe(false);
  });

  it("check fails when not employed", () => {
    const ctx = makeCtx({
      self: { id: "char-3" },
      here: { id: "node-store" },
      shops: [shop],
    });
    expect(workAction.check(ctx)).toBe(false);
  });

  it("onComplete pays salary via stateChanges", () => {
    const ctx = makeCtx({
      self: { id: "char-2", money: 0 },
      here: { id: "node-store" },
      shops: [shop],
    });
    const result = workAction.onComplete!(ctx);
    const hasIncome = result.stateChanges!.some(
      (sc) => sc.kind === "adjustMoney" && sc.amount === 80
    );
    expect(hasIncome).toBe(true);
  });
});
```

- [ ] **Step 3: Write shop loader constraint test**

Create/modify `backend/src/config/loader.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

// Test that parent-child constraint rejects invalid shop configs.
// Requires a test map with parent-child nodes and a shops.json.

describe("loadShops parent-child constraint", () => {
  it("rejects child node shop when parent is already a shop", () => {
    // Setup: map has root > child; shops.json defines both as shops
    // Expect: loadShops throws
  });

  it("accepts sibling node shops", () => {
    // Setup: map has root > child1, root > child2; shops on child1 only
    // Expect: loadShops succeeds
  });
});
```

For the constraint tests, use an actual temp file or mock the file system. Since the existing test suite likely uses real scene files, follow the same pattern.

- [ ] **Step 4: Run tests**

```bash
cd backend && pnpm test
```

Fix any failures.

- [ ] **Step 5: Run full test suite**

```bash
pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/systems/*.test.ts backend/src/config/*.test.ts
git commit -m "test: add shop, item, and employment action tests"
```

---

### Task 12: Frontend type generation

**Files:**
- Modify: `frontend/src/types/api.generated.ts` (auto-generated)

- [ ] **Step 1: Regenerate shared types**

```bash
pnpm gen:types
```

- [ ] **Step 2: Verify type freshness**

```bash
pnpm check:types-fresh
```

- [ ] **Step 3: Commit if needed**

```bash
git add frontend/src/types/api.generated.ts
git commit -m "chore: regenerate frontend API types with new Item/Shop types"
```
