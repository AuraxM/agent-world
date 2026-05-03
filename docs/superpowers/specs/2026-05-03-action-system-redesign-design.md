# Action System Redesign

## Motivation

当前 action 系统有 28 种封闭枚举类型，通过 switch-case 执行。问题：

- 新增 action 必须改枚举、改 schema、改 switch-case
- 无法由地图包（未来 mod）注入自定义行为
- 社交 action（attack/flee/help/gift/update_relation 等）和部分自身 action（read/write/meditate/exercise 等）逻辑未充分开发却占位

## Goals

1. Action 从封闭枚举变成可注册的开放结构，内建 8 种，mod 可注入更多
2. Action 统一接口：`ActionDefinition`，内建和 mod action 使用同一套 API
3. 明确"瞬时行为"与"持续行为"的区别，持续行为有 4 个生命周期 hook
4. Mod 通过 `.js` 文件注入 action definition
5. 不影响现有对话协议、寻路、perception、vitals 系统

---

## Core Interface

### ActionDefinition

```typescript
interface ActionDefinition {
  type: string;
  duration: "instant" | number;  // "instant" 或持续 tick 数（0 表示引擎动态计算，如 move）

  check(ctx: ActionContext): boolean;
  hint(ctx: ActionContext): string | Array<{ hint: string; targetId?: string; targetNodeId?: string }>;

  /** instant: 直接执行; ongoing: 执行 onStart */
  execute(ctx: ActionContext, input: ActionInput): Outcome;

  /** 仅 ongoing */
  onTick?(ctx: ActionContext): Outcome | null;      // null = 本 tick 无事发生
  onComplete?(ctx: ActionContext): Outcome;
  onInterrupt?(ctx: ActionContext, reason: string): Outcome;
}
```

### Outcome

```typescript
interface Outcome {
  memory: string;                    // 必定写入角色记忆
  event?: {
    category: EventCategory;
    description: string;
    intensity?: 1 | 2 | 3 | 4 | 5;
    scope?: EventScope;
  };
  stateChanges?: StateChange[];
  dialogRequest?: {                  // 仅 speak 使用，标记需要 dialog 展开
    targetId: string;
    openingLine: string;
  };
}
```

### StateChange

```typescript
type StateChange =
  | { kind: "resetVital"; vital: "hunger" | "fatigue" | "hygiene" }
  | { kind: "adjustVital"; vital: "hunger" | "fatigue" | "hygiene"; delta: number }
  | { kind: "setLocation"; nodeId: string }
  | { kind: "adjustMood"; delta: number }
  | { kind: "adjustStress"; delta: number }
  | { kind: "setOngoingAction"; action: OngoingAction }
  | { kind: "clearOngoingAction" };
```

### ActionContext

```typescript
interface ActionContext {
  worldId: string;
  tick: number;
  self: Character;
  here: MapNode;
  companions: Character[];
  reachable: MapNode[];
  isSleepHour: boolean;
  facts: AggregatedFacts;
}
```

### ActionInput

LLM tool call 参数，由引擎传入：

```typescript
interface ActionInput {
  target_id?: string;
  target_node_id?: string;
  free_text?: string;
  reason?: string;                  // move 专属
  arrival_action?: { ... };         // move 专属
  [key: string]: unknown;
}
```

---

## Built-in Actions (8 types)

| Action | Duration | check | execute 效果 |
|--------|----------|-------|-------------|
| `eat` | instant | here has `dining` tag | resetVital("hunger") |
| `bathe` | instant | here has `bathing` tag | resetVital("hygiene") |
| `rest` | instant | here has `residence` or privacy="private" | adjustVital("fatigue", -2) |
| `work` | instant | here == activityNodeId && profession != "unemployed" | 无 vitals 变化 |
| `think` | instant | always | 无（仅写记忆） |
| `speak` | instant | companions.length > 0 | 产 dialogRequest，引擎交 dialog protocol |
| `sleep` | 40 tick | isSleepHour && (residence / private) | execute: 无; onComplete: resetVital("fatigue"); onInterrupt: 部分恢复 |
| `move` | 0 (引擎计算) | target_node_id 存在 | 走现有 BFS 寻路 + 多步路径逻辑，不改 |

---

## ActionRegistry

```typescript
class ActionRegistry {
  private _defs: Map<string, ActionDefinition>;

  register(def: ActionDefinition): void;      // 同名覆盖，允许 mod 替换内建
  registerAll(defs: ActionDefinition[]): void;
  has(type: string): boolean;
  get(type: string): ActionDefinition | undefined;
  buildOptions(ctx: ActionContext): ActionOption[];  // 遍历 check → hint → 组装选项
}
```

全局单例，启动时注册 8 个内建 action。Mod 加载后追加/覆盖。

---

## Mod 注入

地图包 `manifest.json` 新增可选字段：

```json
{
  "id": "yu-no-tani",
  "name": "湯の谷",
  "language": "ja",
  "actions": "./actions.js"
}
```

`actions.js` 通过 `module.exports = [...]` 导出一组 `ActionDefinition` 对象。引擎在 `loadWorld()` / tick 初始化时 `require()` 并逐条 `register()`。

允许 mod 覆盖同 type 的内建 action。

---

## LLM Schema 适配

当前 `ActionToolInputSchema` 的 `action_type` 是固定 enum（28 个值）。改为从 registry 动态生成：

```typescript
function buildActionToolSchema(): object {
  const types = Array.from(registry.types());
  return {
    type: "object",
    properties: {
      action_type: { type: "string", enum: types },
      // ... 其它字段不变
    },
    required: ["action_type", "reasoning", "self_importance"],
  };
}
```

`free_text` 不再强制用于 speak（speak 的内容从 `free_text` 取），`reason` 保留用于 move。

---

## Engine Integration

### 原 execute.ts

switch-case 替换为：

1. `const def = registry.get(action.type)` → 找不到则 fallback wait
2. `def.execute(ctx, action.input)` → 获得 Outcome
3. 遍历 `Outcome.stateChanges` → 逐一 apply
4. 写 `Outcome.memory` → pushMemory
5. 有 `Outcome.dialogRequest` → 入 dialog 队列
6. 生成 `WorldEvent`

### 原 actions.ts

`getAvailableActions()` 替换为 `registry.buildOptions(ctx)`。

### 原 tick.ts

Ongoing 管理逻辑保留，但改为：

- `onTick` 每 tick 调用，返回 Outcome 就 commit（写记忆 + apply stateChanges）
- 到期调 `onComplete`
- 中断调 `onInterrupt`

Dialog 后处理、寻路、perception、vitals 衰减 —— 不变。

### 移除的功能

以下 action 及所有关联逻辑移除：

- `nap`, `read`, `study`, `write`, `groom`, `pace`, `exercise`, `meditate`, `use_ability`
- `interact_object`, `interact_person`
- `attack`, `flee`, `help`, `gift`, `update_relation`
- `accept_speak`, `reject_speak`, `leave_dialog`（dialog 协议内部保留，但不再作为注册的 action type）

Relation 自动管理（acquaintance 衰减）保留。

---

## Files Changed

| File | Change |
|------|--------|
| `src/domain/types.ts` | 新增 ActionDefinition/Outcome/StateChange/ActionContext/ActionInput 接口；Action 类型简化 |
| `src/domain/enums.ts` | 移除 ACTION_TYPES 枚举（或缩小为内建 8 + speak 枚举） |
| `src/domain/schemas.ts` | LLM tool schema 的 action_type enum 改为动态生成 |
| **NEW** `src/engine/action-registry.ts` | 注册、查询、buildOptions |
| **NEW** `src/engine/actions-builtin.ts` | 8 个内建 ActionDefinition |
| `src/engine/actions.ts` | 删除 getAvailableActions()，改为调用 registry |
| `src/engine/execute.ts` | 删除 switch-case，改为 registry lookup + apply Outcome |
| `src/engine/tick.ts` | ongoing 管理适配新接口；移除被删除 action 的特殊逻辑 |
| `src/config/loader.ts` | 加载 manifest.actions 字段 |
| `src/config/types.ts` | Manifest 类型加 `actions?: string` |

---

## Test Impact

- `tick.test.ts`：现有测试涉及被移除的 action type 需要更新
- 引擎现有 action 执行行为不变（eat/bathe/rest/sleep/move/work/think/speak 逻辑保持一致）
- 新增：registry 注册/覆盖/动态 schema 的单测
