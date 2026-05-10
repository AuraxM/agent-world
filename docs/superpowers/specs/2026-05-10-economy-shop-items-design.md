# Economy Shop + Items Design

## Overview

强化经济系统，新增物品（Item）和店铺（Shop）实体，重构工作（work）action 为店铺雇佣制，新增购买、使用物品、赠送物品、雇佣管理 action。

## Domain Types

### Item（运行时物品实例，`backend/src/domain/types.ts`）

```typescript
interface Item {
  itemDefId: string;       // 引用 ItemDefinition 的 id
  acquiredTick: number;    // 获得时的 tick
}
```

### ItemDefinition（物品定义，`backend/src/config/types.ts`）

```typescript
interface ItemDefinition {
  id: string;                    // 唯一ID，如 "onigiri"
  name: string;                  // 显示名，如 "饭团"
  description?: string;          // 描述，供 LLM 理解
  value: number;                 // 售价
  consumable: boolean;           // 使用即消耗
  effects: {
    vitals?: { hunger?: number; fatigue?: number; hygiene?: number };
    emotion?: { mood?: number; stress?: number; socialSatiety?: number };
  };
}
```

内置物品仅支持 vitals + emotion 调整（A 类效果）。Mod 物品通过 `actions.js` 自定义效果。

### Shop 运行时（`backend/src/domain/types.ts`）

```typescript
interface Shop {
  id: string;                   // 由 nodeId 派生
  worldId: string;
  nodeId: string;
  ownerCharacterId: string;
  employeeCharacterId?: string; // 当前雇员（至多一人）
  goods: string[];              // 最多3个 itemDefId
  salary: number;               // 每 10 tick 工资
}
```

### ShopDefinition（`backend/src/config/types.ts`）

```typescript
interface ShopDefinition {
  nodeId: string;
  ownerCharacterId: string;
  goods: string[];              // 最多3个
  salary: number;
}
```

### Character 扩展

```typescript
inventory: Item[];   // 新增字段
```

### StateChange 新增变体

```typescript
| { kind: "addItem"; itemDefId: string; count: number }
| { kind: "removeItem"; itemDefId: string; count: number }
| { kind: "setEmployment"; shopId: string; characterId?: string }  // undefined = 解雇
```

MapNode 不变 — 店铺信息不嵌入 MapNode。

## Config Layer

### 文件结构

```
scenes/<scene-id>/
  manifest.json
  map.json
  items.json        ← 新增
  shops.json        ← 新增
  actions.js
  characters/
```

### items.json — 全局物品池

```json
[
  { "id": "onigiri", "name": "饭团", "value": 30, "consumable": true,
    "effects": { "vitals": { "hunger": 30 } } },
  { "id": "bread", "name": "面包", "value": 50, "consumable": true,
    "effects": { "vitals": { "hunger": 50 } } },
  { "id": "water", "name": "矿泉水", "value": 20, "consumable": true,
    "effects": { "vitals": { "hunger": 10, "fatigue": 5 } } }
]
```

### shops.json — 店铺定义

```json
[
  { "nodeId": "convenience_store", "ownerCharacterId": "tanaka_owner",
    "goods": ["onigiri", "bread", "water"], "salary": 80 }
]
```

### Mod 覆盖

Mod 场景在 `actions.js` 同级放 `items.js`（返回数组，同 ID 覆盖全局物品池）。`shops.js` 同理。

### 父子节点约束

加载 `shops.json` 时校验：遍历所有店铺定义的 nodeId，检查是否有父子关系冲突（父节点已是店铺 → 子节点不能再定义店铺）。约束不满足时拒绝加载整个地图，报错退出。

### 角色模板扩展

```json
{
  "id": "tanaka_student",
  "initialItems": ["onigiri"]
}
```

## Actions

### `work`（修改现有）

- 类型：决策 action，`duration: 10`
- check：角色必须有雇佣关系（owner 或 employee），且所在节点有对应 Shop
- 执行：若不在店铺节点则先 pathfind 移动到达，到店后开始 10 tick 工作
- onComplete：`paySalary()` 发工资
- 中断重置（与之前一致）
- 替换旧 work action（移除 `rollWorkIncome` BME×tier×MDC 计算）

### `buy`（新增）

- 类型：决策 action，`duration: "instant"`
- check：节点有店铺 + `canAfford(self, 商品总价)`
- validateParams：LLM 从当前店铺 goods 中选择物品
- execute：扣钱 + addItem。若购买者是店主，钱转回店主（净零但记录交易）。店主收入记 `shop_sale`

### `use_item`（新增）

- 类型：决策 action，`duration: "instant"`
- check：inventory 非空
- validateParams：LLM 从 inventory 中选择物品
- execute：应用 effects（vitals/emotion 调整通过 stateChanges），消耗品则 removeItem

### `give_item`（新增，对话 action）

- 类型：`usableInDialogue: true`
- validateParams：选择要赠送的物品
- 走对话 propose→respond（accept/reject）流程
- Accept 后执行：赠送方 removeItem，接收方 addItem，注入系统消息 `"<赠送者> 赠送了 <物品名>（价值 <value>）给 <接收者>"`

### `manage_employment`（新增，对话 action）

- 类型：`usableInDialogue: true`
- check：仅店主（`ctx.self.id === shop.ownerCharacterId`）
- 参数：`action: "hire" | "fire"`
- 走对话 propose→respond 流程
- Accept 后执行：
  - hire：`shop.employeeCharacterId = targetId`
  - fire：清空 `shop.employeeCharacterId`
  - 两者均生成 WorldEvent 写入被操作方记忆：`"<店主名> 雇佣/解雇了你 在 <店铺节点名>"`

### Employment Constraints

- 每个角色只能被一个店铺雇佣
- 每个店铺只能雇佣一人
- hire 前检查目标是否已有雇佣 → 有则拒绝
- hire 前检查店铺是否已有雇员 → 有则拒绝（需先 fire）
- 店主不能雇佣自己

## Economy Integration

在 `backend/src/systems/economy.ts` 新增：

- `buyItem(character, shop, itemDef, count)` — 扣钱/店主净零/交易记录
- `paySalary(character, shop)` — 固定工资入账，不涉及店主钱包
- `canWorkAt(character, shop)` — 检查雇佣关系

新增 Transaction category：`"shop_sale"`、`"salary"`。

## DB Persistence

- Character inventory：JSON 列
- Shop：新建 `shops` 表（`nodeId`, `worldId`, `ownerCharacterId`, `employeeCharacterId`, `goods` JSON, `salary`）。世界观初始化时从 `shops.json` 创建；`employeeCharacterId` 运行时可变
- ItemDefinition：纯配置，不存 DB，启动时加载到内存 Map

## LLM Prompt

### 地图标注

节点列表遍历：若节点有对应 Shop，标注 `[店铺]`：

```
- 便利店 [店铺]: 货架上摆满了各种零食和饮料
- 教室3-A: 安静的教室
```

### 角色在店铺时

注入：

```
你当前在【便利店】，这里可以购买：
- 饭团（$30）：食用恢复饥饿
- 面包（$50）：食用恢复饥饿
- 矿泉水（$20）：补充水分，恢复少量疲劳

（你是店主 / 你在此工作，工资：$80/次）
```

### 对话 prompt

不注入店铺/商品信息。购买由 decide 产生，不由 chat 产生。

## Testing

| 测试范围 | 内容 |
|---------|------|
| `buy` action | 钱够/不够/店主买自己店净零/无雇佣可购买 |
| `use_item` action | 消耗品移除/非消耗品保留/效果正确应用 |
| `give_item` action | 赠送+物品转移+系统消息名称价值标注 |
| `work` action | 移动到达后开始/10 tick 后发工资/中断重置 |
| `manage_employment` | hire/fire/目标拒绝/已雇佣冲突/解雇事件消息 |
| `economy.ts` | `buyItem` 扣钱+店主净零+交易记录，`paySalary` 固定收入 |
| shop loader | 父子约束→拒绝加载地图/正常加载 |
| items loader | 内置加载/mod 覆盖/合并 |
| 集成测试 | `give_item` 和 `manage_employment` 的 propose→respond→execute 全流程 |
