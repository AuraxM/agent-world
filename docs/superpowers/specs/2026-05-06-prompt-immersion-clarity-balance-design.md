# 提示词沉浸感与调用精度分层设计

## 概述

`3384ef0` 将 `worldRules()` 从规则手册风格重写为沉浸式叙事，提升了 LLM 输出代入感，但导致参数调用精度全面下降（缺参数、选错 action、reasoning 质量退化）。

**根因**：让一段文本同时承担"角色扮演引导"和"工具调用规范"两个职责，结果两个都没做好。

**解决方案**：分层 — `worldRules` 纯叙事做灵魂，`triggerHint` + `paramRule` 做骨骼，同名 action 在两段各出现一次强化 LLM 关联记忆。

这是 `2026-05-06-action-optimization-design.md` 第 5 节（提示词沉浸感重写）的后续修正。

---

## 1. worldRules 重写

### 现状

`worldRules()` 混合了角色扮演引导（"你是小镇居民"）和技术规则（tick 计算、移动寻路、作息逻辑）。规则解释稀释了角色代入感，参数说明因叙事包装而模糊。

### 改动

`worldRules()` 只做一件事：让 LLM 相信自己是世界里的普通人。

```
你是这个小镇的居民。你每天在这里过日子——天亮了起床，饿了吃饭，困了睡觉，碰见熟人聊两句，一个人时也会发呆想心事。

你没有"玩家"这个概念。你活在你的身体里，能感觉到饿、困、脏、累。身体不舒服的时候，你会想办法让自己好受些——这是本能，不需要谁来提醒。

你做出的每个决定，都来自你的性格和当下的感受。性格决定了你的风格——有人喜欢热闹，有人偏爱独处；有人想到就做，有人反复掂量。但不管什么性格，饿了要吃、困了要睡——这些基本的需要，不会因为"不爱动弹"就不做了。

日子一天天过下去。你会记住让你在意的事，忘掉不重要的。遇见的人会和你产生关联，关系走动了才热络，不走动就淡了。

要做什么，调用 decide_action 工具来告诉世界。就像你抬起脚迈出一步那样自然。
```

**要点：**
- 不提 tick、参数名、寻路算法、作息窗口等技术机制
- 只说"人的体验"：身体感受、性格驱动、关系维护
- 最后一句轻描淡写带过"调用工具"，将其内化为自然行为

**涉及文件：** `src/llm/prompt.ts` — `worldRules()` 整段替换

---

## 2. Action 触发提示 + 参数规则分层

### 现状

每个 action 有 `guidance`（何时选择）和 `hint()`（显示文本），但 `guidance` 在 `describeOptions` 中以 `【guidance】` 追加，格式混乱，且没有参数约束提示。

### 新设计

Action 定义新增两个字段，替代现有的 `guidance`：

```typescript
// ActionDefinition 接口变更
guidance?: string;       // 移除

triggerHint: string;     // 新增：什么时候用
paramRule: string;       // 新增：怎么填参数
```

`ActionOption` 移除 `guidance` 字段。

User prompt 中 hint 和 rule 用统一的 `**action**: 描述` 格式分块展示：

```
## 你此刻能做的事

**eat**: 感到饥饿时使用，补充能量维持身体运转。
**rest**: 疲惫但不在睡眠时段时使用，在住处或隐私空间短暂休息。
**sleep**: 进入作息窗口、该睡觉时使用，完成整段睡眠恢复精力。
**bathe**: 感觉身体不干净时使用，保持个人卫生。
**speak**: 身边有人、想发起对话交流时使用。
**think**: 想一个人静静、回顾记忆整理思绪时使用。
**look_around**: 无事可做时四处看看。
**move**: 想要移动时使用。
**give**: 身边有人需要帮助，想给予金钱时使用。
**work**: 在工作/学习地点、该干活时使用，赚取收入。

---

## 调用规则（技术提示，不是叙事）

**eat**: 可选 free_text。需在餐厅/食堂类地点。
**rest**: 无需额外参数。持续 5 ticks，可被打断。
**sleep**: 无需额外参数。仅作息窗口内可用，需在住处。
**bathe**: 可选 free_text。需在浴室/洗浴类地点。
**speak**: 必填 target_id（说话对象）+ free_text（说什么）。
**think**: 可选 free_text（思考内容，越具体记忆质量越高）。
**look_around**: 无需额外参数。始终可用，兜底选项。
**move**: 必填 target_node_id（目的地 ID，在地图中查找）+ reason（移动原因）。可选 arrival_action。
**give**: 必填 target_id（给谁）+ amount（金额，正整数）。
**work**: 可选 free_text。需在个人的活动节点。持续 5 ticks。
```

**格式设计约束：**
- 每条 hint 一句话说清触发场景；每条 rule 用 `必填`/`可选`/`无需` 三档消除模糊
- 同一个 action 名在 hint 块和 rule 块各出现一次，LLM 先理解"什么时候用"，同一屏看到"怎么用"
- 规则块用 `---` 分隔 + "技术提示，不是叙事" 标注，与叙事块切割
- 仅当前可用的 action 出现（由 `check()` 过滤）
- `describeOptions` 保留但精简，去掉 `【guidance】` 追加逻辑

**涉及文件：**
- `src/domain/action-system.ts` — `ActionDefinition` 接口变更，`ActionOption` 移除 `guidance`
- `src/engine/actions-builtin.ts` — 10 个内置 action 新增 `triggerHint` / `paramRule`，移除 `guidance`
- `src/llm/prompt.ts` — 新增 `describeHints()` / `describeRules()` 函数，`describeOptions()` 精简
- `src/llm/decide.ts` — `ActionOption` 构造处移除 `guidance` 传递
- 各 mod action 文件（如 `configs/maps/sakuraba-academy/actions.js`）— 同步字段变更

---

## 3. agent-world-mod 技能更新

### 现状

`agent-world-mod` 技能在生成 action 定义时，使用 `guidance` 字段描述何时使用 action。

### 改动

技能规范中，action 定义模板改为使用 `triggerHint` + `paramRule` 替代 `guidance`：

- `triggerHint`：一句话描述触发场景（"在……时使用"句式），语言自然但信息精确
- `paramRule`：`必填`/`可选`/`无需` 三档明确参数要求，附加使用条件（地点限制等）
- 技能中给出 10 个内置 action 作为参考示例

---

## 4. 测试

### 需要更新

- `src/llm/prompt.test.ts`：`worldRules()` 快照测试更新；`describeOptions` 不再输出 `【guidance】` 的断言更新；新增 `describeHints` / `describeRules` 输出格式测试
- `src/domain/schemas.test.ts`：`buildDecideActionTool` 无变更（hint 仍在 tool description 中），但确认不受影响

### 手工验证

- 运行若干 tick，观察 LLM 调用的参数错误率是否下降
- 检查 reasoning 是否包含性格特征（`submitActionInstruction` 保留此约束）

---

## 5. 不涉及

- `submitActionInstruction` — 保持现有文案不变
- Tool JSON Schema (`DecideActionToolSchema`) — 参数 description 保持现有精确度，不做改动
- `buildDecideActionTool` — 动态 tool description 生成逻辑不变
- 对话系统（dialogue prompt）— 本次不改
- think 推理会话 prompt — 本次不改
