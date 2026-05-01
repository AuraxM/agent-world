# 角色系统重设计（2026-05-01）

## 背景

Stage 1 跑通后，原有角色系统在以下方面表达力不足：

- **性格 8 维 + 暴露数值**：维度过多且字段语义重叠（如 stability/aggression），prompt 直接出现 `+85` 让 reasoning 形成模板化"我的 X = +N 让我..."
- **关系单维度**：`affinity + 9 种 RelationKind` 不能同时表达"客观身份"与"情感"，且单选 kind 无法描述"舅甥+邻居"这类多重身份
- **状态单薄**：仅 hunger / fatigue 两个数值化 vital；离散 statuses 数组在引擎层从未被更新；情绪完全没有运行时演化
- **行动同质**：15 类 action 没有"自我可完成 vs 需要交互"的概念分层；缺日常生理维护（sleep 持续多 tick / bathe / hygiene）和情绪维护（meditate / write）出口
- **移动 1 tick 1 步**：在 8 节点小镇里"从张家走到中央公园"消耗 1 小时严重不真实，且让 LLM 在沿途无法表达"路过看见某人改主意"

本 spec 重构以上五块。本轮**不**改：长期记忆、玩家事件投放、prompt-cache、UI 布局。

---

## 一、性格系统：MBTI 4 维

### Schema

```ts
export interface Personality {
  /** -4 极内向 (I) ←→ +4 极外向 (E) */
  ei: number;
  /** -4 极直觉 (N) ←→ +4 极实感 (S) */
  sn: number;
  /** -4 极情感 (F) ←→ +4 极思考 (T) */
  tf: number;
  /** -4 极感知 (P) ←→ +4 极判断 (J) */
  jp: number;
}
```

每维取值为整数，范围 `[-4, 4]`（9 档）。Zod schema 同步。

字段命名采用维度对（`ei/sn/tf/jp`）而不是单边名（如 `extraversion`），避免暗示哪一端是基线。

### Prompt 翻译规则

每维 9 档对应文本描述（**不暴露数值**）：

| 数值 | ei | sn | tf | jp |
|---|---|---|---|---|
| +4 | 极度外向，离不开人群 | 极度务实，只信眼见为实 | 极度理性，凡事先讲逻辑 | 极度有计划，无规划即焦虑 |
| +3 | 非常外向 | 很务实 | 很理性 | 很有规划 |
| +2 | 偏外向 | 偏务实 | 偏理性 | 偏有规划 |
| +1 | 略偏外向 | 略偏务实 | 略偏理性 | 略偏有规划 |
| 0 | 内外平衡 | 直觉与务实并重 | 理性与情感并重 | 灵活与计划并重 |
| -1 | 略偏内向 | 略偏直觉 | 略偏感性 | 略偏随性 |
| -2 | 偏内向 | 偏直觉 | 偏感性 | 偏随性 |
| -3 | 非常内向 | 想象力丰富，凭直觉 | 很感性 | 很随性 |
| -4 | 极度内向，只想独处 | 极度直觉化，常忽略事实 | 极度感性，凡事先看感受 | 极度随性，讨厌任何计划 |

### Prompt 硬规则改写

原："reasoning 必须显式引用一项你自己的性格维度数值（例：我的内向度 -80）"
新："reasoning 必须显式引用一项你的性格特征（用上面的文字描述，不要写数值）"

### 配置迁移

直接删除现有 5 个 `configs/characters/*.json` 与 `configs/maps/morning-town.json`，由用户/技能后续重新生成（不做自动映射）。

---

## 二、关系系统：客观 + 情感

### Schema

```ts
export const OBJECTIVE_RELATION_KINDS = [
  // 血缘 9（不可被引擎或 LLM 删除）
  "father", "mother", "son", "daughter",
  "older_brother", "younger_brother", "older_sister", "younger_sister",
  "other_relative",
  // 社会 13
  "classmate", "teacher", "student",
  "colleague", "boss", "subordinate",
  "neighbor", "landlord", "tenant",
  "spouse", "partner", "ex_partner",
  "friend",
  // 偶遇 1（引擎自动管理）
  "acquaintance",
] as const;
export type ObjectiveRelationKind = (typeof OBJECTIVE_RELATION_KINDS)[number];

export const BLOOD_RELATION_KINDS: ReadonlySet<ObjectiveRelationKind> = new Set([
  "father", "mother", "son", "daughter",
  "older_brother", "younger_brother", "older_sister", "younger_sister",
  "other_relative",
]);

/** 单向：A 对 B 的认知。仅在 kinds 非空时存在。 */
export interface Relation {
  /** 至少一项；同一对角色双方各自维护一份（不对称） */
  kinds: ObjectiveRelationKind[];
  /** -4 极厌恶 → +4 极喜爱 */
  affection: number;
  /** 自由备注 */
  note?: string;
  /** 关系建立的 tick；用于 acquaintance 衰减计算 */
  since: Tick;
  /** 上一次同节点交互的 tick；用于 acquaintance 衰减计算 */
  lastInteractionTick: Tick;
}
```

`Character.relations: Record<otherId, Relation>` 仍是单向 map，但同一对角色双方各自维护一份独立 Relation。

旧 `RelationKind`（9 个枚举）、`Relation.affinity`、`RELATION_KINDS` 全部移除。

### 引擎自动行为

| 触发 | 处理 |
|---|---|
| 两人首次同节点 + 任一交互行为（speak/help/attack/gift/interact_person） | 双方各自 `relations[other]` 若不存在 → 创建 `{ kinds: ["acquaintance"], affection: 0, since: tick, lastInteractionTick: tick }` |
| 任一同节点交互（包括上面的首次） | 双方 `lastInteractionTick = tick` |
| 关系包含 acquaintance 且 `tick - lastInteractionTick ≥ 336`（14 游戏日） | 从 kinds 移除 acquaintance；如 kinds 变空 → 整条 relation 删除 |
| 自己 help / gift 成功 → 对方 | 双方 affection +1（封顶 +4）|
| 自己 attack 成功 → 对方 | 双方 affection -2（封底 -4）|

> 自动调整作用于"提交方→对方"和"对方→提交方"两侧，因为感受是双向的。

### LLM 主动变更

新增一种 ActionType `update_relation`（归交互类）。Action schema 扩展：

```ts
ActionSchema = ActionSchema.extend({
  change_type: z.enum([
    "become_partner",
    "end_partnership",
    "become_spouse",
    "end_friendship",
    "end_other_relative",
  ]).optional(),
});
```

`type === "update_relation"` 时，`target_id` 与 `change_type` 必填。语义：

| change_type | 前置 | 效果 |
|---|---|---|
| become_partner | 自身已含某客观关系（含 acquaintance） | 双方 kinds 添加 partner（去重）；双方 affection +1（封顶）|
| end_partnership | 自身 kinds 含 partner | 双方 kinds 中 partner → ex_partner |
| become_spouse | 双方均含 partner | 双方 partner → spouse |
| end_friendship | 自身 kinds 含 friend | 双方 kinds 移除 friend；双方 affection -1（封底）|
| end_other_relative | 自身 kinds 含 other_relative（且仅此条本血缘可剔） | 双方 kinds 移除 other_relative |

试图改变血缘 9 标签或目标无效 → `success=false`，写"我尝试..但不行"内心记忆。

become_partner Stage 1 简化为单方提议即生效（不需双方同意）。

### Prompt 翻译

`affection` → 文字（`-4 极厌恶 / -3 很讨厌 / -2 不喜欢 / -1 略反感 / 0 中性 / +1 略有好感 / +2 有好感 / +3 很喜欢 / +4 非常喜欢`）。

prompt 中"其他角色信息"硬上限 = **5 人**，按以下优先级排序后取前 5：

1. 同节点 companions（始终优先）
2. 强客观关系：spouse / partner / 任一血缘标签
3. `|affection|` 高者
4. 接近 acquaintance 衰减阈值者（`(336 - (currentTick - lastInteractionTick)) ≤ 48`）

prompt 中告知 LLM acquaintance 衰减规则的存在（"超过 14 游戏日没和某熟人接触，对方将从你的关系中淡出"），让性格驱使的"主动联络"成为可能。

---

## 三、状态系统：生理 vital + 情绪

### Schema 重构

```ts
export interface Vitals {
  hunger: number;   // 0..16
  fatigue: number;  // 0..16
  hygiene: number;  // 0..16
}

export interface Emotion {
  mood: number;            // -4..+4
  stress: number;          // 0..4
  social_satiety: number;  // -4..+4
}

export interface Character {
  // ...
  vitals: Vitals;
  emotion: Emotion;
  // 删除：statuses[]、Status、StatusKind、StatusLevel、STATUS_KINDS
}
```

旧 `STATUS_KINDS` / `StatusLevel` / `StatusSchema` 全部移除。

### 衰减/演化（每 tick 引擎自动跑）

| 字段 | 每 tick 变化 | 行动重置/降低 |
|---|---|---|
| hunger | +1（封顶 16） | `eat` → 0 |
| fatigue | +1（封顶 16） | `rest` → -2（封底 0）；`sleep` → 0（连续 8 tick） |
| hygiene | 偶数 tick +1（封顶 16） | `bathe` → 0；`groom` → -1（封底 0） |
| mood | 偶数 tick 朝 0 走 1（自然回归） | 事件驱动（见下表） |
| stress | 每 24 tick 末 -1（封底 0） | 事件驱动；`meditate` → -2（封底 0） |
| social_satiety | 偶数 tick：同节点有同伴 → +1（封顶 +4）；独处 → -1（封底 -4） | 上一行动 type ∈ {speak, help, gift, interact_person} → +1（封顶 +4）|

`social_satiety` 没有独立的"自然回归 0"逻辑——独处和有伴互斥，自然漂移由这两种状态的反向推动产生。极端社交者会稳定在 +4，极端独处者稳定在 -4，混合者会在中间徘徊。

### 事件驱动情绪规则

| 事件 | mood | stress |
|---|---|---|
| 被 attack（自己是受害者） | -2 | +2 |
| 被 help / gift / 受赞 | +1 | 0 |
| 自己 attack 别人 | 0 | +1 |
| 自己 help / gift | +1 | 0 |
| 感知到强度 ≥ 4 的负面 burst 事件 | -1 | +1 |
| 感知到强度 ≥ 4 的正面 burst 事件 | +1 | 0 |

所有数值改动均封顶/封底到对应轴的范围内。

### 越线 inner 提醒（节流）

| 字段 | 越线判定 | 提醒频率 |
|---|---|---|
| hunger | ≥ 5 medium / ≥ 10 severe | medium 每 5 tick / severe 每 3 tick |
| fatigue | ≥ 5 medium / ≥ 10 severe | medium 每 5 tick / severe 每 3 tick |
| hygiene | ≥ 8 medium / ≥ 13 severe | medium 每 8 tick / severe 每 4 tick |
| mood | ≤ -3 | 每 6 tick |
| stress | ≥ 3 | 每 6 tick |
| social_satiety | ≤ -3 | 每 6 tick |
| social_satiety | ≥ +3 | 仅一次（首次跨入） |

越线 inner 事件 scope=private，audienceCharacterId=本人。

### Prompt 翻译

7 个轴全部用文字定性描述（沿用现有 `qualifyVital` 风格扩展），不暴露原始数字。具体档位与文案在实现阶段定，写在 `src/llm/prompt.ts`。

---

## 四、行动系统：默认 vs 交互 + 持续行动锁定

### 分类

按"行动结果是否改变他人/物体/关系状态"划分（口径 2）：

- **默认（只动自己）**：move, wait, observe, rest, eat, read, work, use_ability, sleep, bathe, exercise, meditate, write, groom, pace
- **交互（动他人/物体/关系）**：speak, interact_object, interact_person, attack, flee, help, gift, update_relation

`ActionType` 枚举：

```ts
export const ACTION_TYPES = [
  "move", "wait", "observe", "rest", "eat", "read", "work", "use_ability",
  "sleep", "bathe", "exercise", "meditate", "write", "groom", "pace",
  "speak", "interact_object", "interact_person",
  "attack", "flee", "help", "gift",
  "update_relation",
] as const;
```

23 个，相比旧 15 个新增 8 个（7 默认 + 1 交互）。

### 新默认行为执行规则

| 类型 | 前置条件 | 效果 |
|---|---|---|
| `sleep` | 节点 tag 含 `residence` 或 privacy=private | 锁 8 tick；结束时 fatigue → 0；锁定期可被中断（见下方）|
| `bathe` | 节点 tag 含 `bathing`（新 NodeTag） | hygiene → 0 |
| `exercise` | 节点 tag 含 `outdoor` 或 `playground` | mood +1, stress -1, fatigue +2 |
| `meditate` | privacy=private 或 节点 tag 含 `quiet`（新 NodeTag） | stress -2 |
| `write` | 节点 tag 含 `indoor` | mood ±1（依 reasoning 自评）|
| `groom` | 节点 tag 含 `residence` 或 privacy=private | hygiene -1（不重置） |
| `pace` | 任意节点 | 无数值变化；产生 1 条 action 事件（scope=node）|

### 新增 NodeTag

`NODE_TAGS` 新增两个：`bathing`、`quiet`。可与现有 tag 共存。

地图重新生成时需保证 `bathing` 节点存在（通常作为住宅子节点 `bathroom`），`quiet` 是软推荐（任何节点可选标）。

### 持续行动锁定（通用机制，sleep 是首例）

`OngoingAction` 升级为真实机制：

```ts
export interface OngoingAction {
  type: ActionType;
  startedAt: Tick;
  endsAt: Tick;
  description: string;
  /** 中断阈值：感知到 intensity ≥ 此值的事件即提前唤醒/中止 */
  interruptThreshold: 1 | 2 | 3 | 4 | 5;
}
```

引擎主循环在决策前对每个 NPC 检查 `currentAction`：

1. 若 `currentAction` 存在 + 当前 tick `≤ endsAt`：
   - 检查 perception 队列：若有 `intensity ≥ interruptThreshold` 的事件 →
     - 清掉 currentAction
     - 写 inner 事件"被 X 惊醒/打断"（scope=private）
     - 给 fatigue 部分降幅：`fatigue -= floor((tick - startedAt) / 2)`，封底 0
     - 本 tick 让 LLM 正常决策
   - 否则：
     - 引擎自动登记 `wait` 等价行动，跳过 LLM
     - 写一条"仍在 sleep / bathe / 等"内部事件（scope=private，节流：每 4 tick 一条）
2. 若 `currentAction` 存在 + 当前 tick == `endsAt`：
   - 执行最终效果（如 fatigue → 0）
   - 清掉 currentAction
   - 本 tick 让 LLM 正常决策（角色"刚醒来"）

`sleep` 的 `interruptThreshold` 默认 = 4。其他多 tick 行动的阈值可在执行时按 type 写死，本轮只 sleep 用到。

### `update_relation` 执行

按 §二 的语义；失败兜底：写"我尝试..但不行"内心记忆，`success=false`。

### `getAvailableActions` 改造

- 若 `currentAction` 非空 → 引擎不调 LLM，无需 options
- 否则按节点 tag 与角色状态生成默认 + 当前合规交互列表
- LLM 仍可输出枚举内任何 type（封闭枚举约束保留），hint 列表只标"推荐"

---

## 五、移动免费规则 + 节点字段

### Schema 改动

```ts
export interface MapNode {
  // ... 既有字段不变
  /**
   * 进入此节点（从 parent 或同级 sibling 通过常规拓扑路径）所需 tick 数。
   * 默认 0（免费）；山路/远郊等可设 1+。
   * shortcuts 始终视为 cost=0（密道/传送门概念上即时）。
   */
  travelCost?: number;
}
```

`MapNodeConfig` 同步加可选字段；`MapNodeConfigSchema` 加 `travelCost: z.number().int().min(0).optional()`。

### 引擎主循环改造

每 tick、每 NPC 独立维护一个本 tick 内的 `freeMovesUsed` 计数器（NPC 间互不影响；下个 tick 重置为 0）：

```
maxFreeMoves = 5
freeMovesUsed = 0  // 每个 NPC 每 tick 起始为 0
loop:
  ctx = buildActionContext(c, ...)
  options = getAvailableActions(ctx, hints)
  action = await decideFn({ ..., options })
  
  if action.type !== "move":
    break  // 进入 execute 阶段
  
  cost = (action.targetNodeId 来自 here.shortcuts) ? 0 : (target.travelCost ?? 0)
  
  if cost > 0:
    break  // 落入 execute 阶段，按 currentAction 锁多个 tick 处理
  
  if freeMovesUsed >= maxFreeMoves:
    写 inner 事件"想继续走但只能停下想想"（scope=private）
    break
  
  // free move
  apply move (改 locationId、写 1 条 move 事件 scope=node)
  freeMovesUsed++
  // 重新感知：把"已经在本 tick 内于新节点产生过、且 scope 命中
  //          (private/node/parent/children 按规则) 该 NPC 的事件"
  //          补进感知队列，让"路过看见某人"成立。不调用 dispatchPerception 全图刷新。
  append-perceive new-location's already-emitted events for this character
```

`break` 后进入 `executeActions`：
- 非 move 行动正常处理
- cost ≥ 1 的 move：locationId 即时改到目标，并设 `currentAction = { type: "move", startedAt: t, endsAt: t + cost, description: "途中", interruptThreshold: 5 }`，期间 LLM 跳过决策（见 §四 持续行动机制）

### Prompt 内提示

system prompt 新增段落：

> 移动机制：除标注 ⏱ 的远途节点外，move 不消耗时间——你可以本 tick 多次 move 后再做事，每次 move 后会重新感知新位置。但若你连续 5 次 move 仍未做事，会被强制停下。

available options 渲染格式：

```
6. (type=move, target_node_id=node-mountain) 前往 后山（私密, outdoor, ⏱ 需 2 小时）
```

### LLM 调用次数预估

旧：5 NPC × 24 tick = 120 次/天
新（典型）：~180 次/天（每 tick 平均 0.5 次 free move）
新（最坏）：5 × 24 × 6 = 720 次/天（每 tick 都用满 5 次 free move）

---

## 六、配套清理与重新生成

### 删除

- `configs/characters/*.json`（全部 5 个）
- `configs/maps/morning-town.json`
- 数据库中现有 `worlds / nodes / characters / events_log / snapshots / agent_thoughts` 数据（`npm run db:migrate` 重置或人工 drop）

### 重新生成

由用户在 spec 完成后通过 `agent-world-config` 技能生成新角色与地图。新地图必须：

- 至少 1 个 `bathing` 节点（建议在每个 residence 下）
- 可选 `quiet` 节点（如图书馆、寺庙、湖边）
- 至少 1 个 `dining`、1 个 `residence`、1 个 `outdoor` 节点（满足新默认行为前置条件）

### 更新 Claude 技能

`.claude/skills/agent-world-config/` 下的 `SKILL.md` 与 `references/` 必须同步：

- 角色 JSON 模板：`personality` 改为 4 维 `{ ei, sn, tf, jp }`，每维 [-4, 4]
- 角色 JSON 模板：`relations` 改为 `{ [otherId]: { kinds: string[], affection: -4..+4, note?, since, lastInteractionTick } }`
- 角色 JSON 模板：去掉 `statuses`，新增 `vitals: { hunger, fatigue, hygiene }`、`emotion: { mood, stress, social_satiety }`
- 地图 JSON 模板：节点支持新 tag `bathing` / `quiet`，可选 `travelCost`
- 词表（OBJECTIVE_RELATION_KINDS）写入参考文档，作为生成时的 enum 依据

---

## 七、不在本轮范围

- 长期记忆（仍单层 FIFO 50）
- 玩家事件投放（Stage 2）
- 交互行为扩展（cook / clean / fight 团战 / 教学 等下轮）
- 临时状况（sick / drunk / injured 下轮）
- prompt-cache、Haiku 分级

---

## 八、验收口号补充

在原 Stage 1 验收基础上：

1. ✅ 每个 NPC 在 22:00 仍未睡且 fatigue ≥ 8 时，下 1 tick 选择 `sleep` 或 `move` 回 home 的概率 ≥ 80%
2. ✅ NPC reasoning 中包含至少一项 MBTI 文字描述（不出现 ±数字）
3. ✅ 24 tick 内至少有 1 个 NPC 触发 free move 链（≥ 2 次连续 move 同 tick）
4. ✅ 24 tick 内至少有 1 个 NPC 通过 `bathe` 或 `meditate` 主动维护 hygiene/stress
5. ✅ 关系自动 acquaintance 增删机制能在两人首次同节点 + 任一交互后自动出现 acquaintance 标签
6. ✅ 模拟跑 30 游戏日后无 acquaintance 关系 lastInteractionTick > 336 仍未删除（即衰减规则确实生效）
