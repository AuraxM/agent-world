# Prompt Agentic Refactor — 设计文档

## 目标

将 decide / dialog / think 三个 LLM 流程从"prompt 塞满上下文"重构为"agentic 自主信息收集"架构。

## 核心理念

- System prompt 只包含：规则 + 工具 + 目标
- 所有角色上下文通过 `read_*` 工具按需获取
- 所有输出通过 `write_*` 工具产出
- `read_*` 只读不写，`write_*` 才是产出
- 更长的 ReAct 循环（20 轮上限），read 工具不耗轮次

---

## 一、三个独立 Agent

| Agent | 目标 | 触发条件 |
|-------|------|----------|
| Decide Agent | 收集信息 → 做出行动决定 | 正常 tick |
| Dialog Agent | 在对话中言行符合人设 | 对话进行中 |
| Think Agent | 整理三个记忆盒子，记住重要的，腾出空间 | Short memory ≥ 55 条时强制触发 |

### System Prompt 结构（三者不同）

**共享部分**：
- 世界规则（你是普通人、需求优先级、生理 > 情绪 > 预约 > 自由）
- 行为准则（本能不可违但实现方式体现性格、预约可放鸽子、允许负面情绪）
- 工具使用指南（read_* 收集信息、write_* 产出内容、在行动前应先 read）
- 语言：中文

**各自目标**：
- Decide：做出一个行动决定，调用 write_decision
- Dialog：与对方对话，言行符合人设
- Think：整理记忆盒子，read → write/delete → end_thinking

---

## 二、工具清单

### Read 工具（13 个，全部 Agent 共享）

| 工具名 | 返回内容 |
|--------|----------|
| `read_profile` | 姓名/年龄/性别/职业/性格/语言风格/喜好/能力 |
| `read_vitals` | 饥饿/疲劳/卫生的定性描述 |
| `read_emotion` | 情绪/压力/社交饱足的定性描述 |
| `read_memories` | 按层 + 时间范围筛选，重要性降序 → 最近降序。参数: `layer`(short/daily/weekly), `time_range`(可选tick范围), `limit`(可选) |
| `read_goals` | 短/长期目标 |
| `read_economy` | 金钱/日常开销/警告 |
| `read_relations` | 与他人的关系标签 + 印象簿 |
| `read_character` | 指定角色的公开信息 + 外观 + 与自己的关系 + 印象 |
| `read_notebook` | 即将到来的预约事项 |
| `read_map` | 完整地图拓扑 + 标注自身位置 |
| `read_companions` | 当前所在节点的其他角色 |
| `read_events` | 近期感知事件 + 活跃全局事件 |
| `read_state` | 当前正在执行的动作/对话状态 |

### Write 工具

| 工具名 | 归属 | 作用 |
|--------|------|------|
| `write_decision` | Decide | 做出行动决定（action_type + 参数） |
| `write_dialog` | Dialog | 说一句话 |
| `write_propose_action` | Dialog | 在对话中向对方提议一个交互动作 |
| `write_respond_action` | Dialog | 接受/拒绝对方的动作提议 |
| `end_dialog` | Dialog | 结束当前对话 |
| `write_memory` | 全部 | 写入指定层的记忆条目 |
| `delete_memory` | Think | 删除指定层中指定 id 的记忆条目 |
| `write_impression` | 全部 | 记录/更新对某人的印象 |
| `write_notebook` | 全部 | 添加日程预约 |
| `write_like` | 全部 | 添加喜好 |
| `write_dislike` | 全部 | 添加厌恶 |
| `write_short_term_goal` | 全部 | 更新短期目标 |
| `write_long_term_goal` | 全部 | 更新长期目标 |
| `write_relation` | 全部 | 添加/移除与某人的关系标签 |
| `end_thinking` | Think | 结束记忆整理 |

---

## 三、ReAct 循环

- 硬上限：20 轮（Read 工具不消耗轮次）
- 到上限不 fallback → 下个 tick 继续
- Decide Agent：收集 info → write_decision 结束
- Dialog Agent：每 tick 多轮 ReAct，直到 end_dialog 或轮满
- Think Agent：read 三盒 → write_memory / delete_memory 整理 → end_thinking

---

## 四、记忆系统

### 三层盒子

| 层 | 容量 | 内容 |
|----|------|------|
| Short Memory | 60 | 最近事件 |
| Daily Memory | 20 | 每日精华 |
| Weekly Memory | 5 | 人生要事 |

### Memory 条目字段

- `id`: 唯一标识（供 delete 用）
- `content`: 文本内容
- `importance`: 1-5
- `tick`: 发生时间
- `layer`: "short" | "daily" | "weekly"

### 强制 Think 触发

- 条件：Short memory ≥ 55 条
- 行为：跳过 Decide，启动 Think Agent
- 前提：不打断当前正在执行的动作

### 去掉 Sleep 记忆压缩

- 删除 `llmMemoryCompress()` / `compressSleepMemories()`
- 记忆管理完全由 Think Agent 负责

---

## 五、对话后处理

| 组件 | 形式 | 产出 | 写入位置 |
|------|------|------|----------|
| Dialog Summarize | 独立 LLM 调用 | 1-2 句对话摘要 | WorldEvent 表 |
| Personal Memory | Dialog Agent 末尾追问 | 对心情/印象/主题的自然语言反思 | write_memory → short memory |

---

## 六、Chat 邀请处理

旧的 `llmAcceptDecide` 被去掉。当有人发起 chat 邀请时：

- 邀请作为 pending event 出现在 `read_events` 或 `read_state` 中
- Decide Agent 在 ReAct 过程中发现邀请，决定接受或忽略
- 接受 → `write_decision` 选择 chat action
- 忽略 → 不选 chat 即可，邀请者会在下个 tick 收到拒绝信号

---

## 七、Prompt Caching

System prompt（规则 + 工具 + 目标）对所有 NPC 相同，作为稳定前缀可被 LLM provider 缓存。

- 每个 Agent 的 system prompt 是固定字符串（除 Dialog Agent 的对方名字）
- 可变内容全部在 tool call 返回中（`read_*` 工具返回针对当前角色的动态数据）
- 不再需要手动构造"不变前缀 + 可变后缀"的 prompt 拼接逻辑

---

## 八、停止的旧组件

- `buildSystemPrompt()` / `buildUserPrompt()` / `buildDialogSystemPrompt()` 等组装式 prompt builder
- `buildCharacterStaticBlock()` / `buildSelfImage()` / `buildPeerImage()` 等性格注入函数
- `decisionPriorityAndRules()` 等规则注入函数
- `llmAcceptDecide()` chat 邀请接受/拒绝
- `llmMemoryCompress()` / `compressSleepMemories()` sleep 记忆压缩
- `llmThink()` 旧 think 流程（产出沉思文本）
- `submit_think_turn` / `submit_dialog_summary` / `submit_personal_memory` / `recall` / `memorize` / `view_map` / `decide_action` 等旧工具
- `MAX_TOOL_CALL_ROUNDS = 5` → 改为 20
