# Action 系统优化设计

## 概述

五个优化改动：add_notebook_entry 降级为纯 tool、look_around/wait 合并、双人互动限制对话、think 改为 solo 推理会话、提示词沉浸感重写。

---

## 1. `add_notebook_entry` 从 action 降级为 tool

### 现状
`add_notebook_entry` 同时是 action（BUILTIN_ACTIONS 中注册，LLM 通过 decide_action 调用）和 dialogue tool（对话轮中通过 NOTEBOOK_TOOL_NAME 可用）。

### 改动
- 从 `BUILTIN_ACTIONS` 移除 `addNotebookEntryAction`
- **不**在主决策循环的辅助 tool 中加它——记事只能在 think 和对话中使用
- 对话轮中的 `NOTEBOOK_TOOL_NAME` 保持不变
- think 推理轮中同样提供此 tool

### 涉及文件
- `src/engine/actions-builtin.ts`：删除 `addNotebookEntryAction` 导出，从 `BUILTIN_ACTIONS` 数组移除

---

## 2. `look_around` 合并 `wait`，删除 `wait`

### 现状
- `look_around`：instant，观察周围环境
- `wait`：持续 5 tick，原地等待，有 onComplete/onInterrupt

### 改动
- `look_around` duration 从 `"instant"` → `5`
- 加上 ongoing action 机制（从 wait 搬过来）：setOngoingAction、onComplete、onInterrupt
- execute 保留原有的环顾观察逻辑
- 从 `BUILTIN_ACTIONS` 删除 `waitAction`
- 全局替换所有语义上的 `"wait"` fallback 为 `"look_around"`：
  - `tick.ts` salvage fallback（line 793）：`"wait"` → `"look_around"`
  - `dialog.ts` finalActions 占位（lines 1040-1062）：`"wait"` → `"look_around"`
  - `worldRules()` 中"选 action_type="wait"" → "选 action_type="look_around""
- **不动** `handleOngoingMove` 中 `skipExecution: true` 的 `"wait"` 占位——这些是引擎内部代理，不经过 actionRegistry

### 涉及文件
- `src/engine/actions-builtin.ts`：修改 lookAroundAction + 删除 waitAction
- `src/engine/tick.ts`：salvage fallback 替换
- `src/engine/dialog.ts`：finalActions 占位替换
- `src/llm/prompt.ts`：worldRules() 文案更新

---

## 3. 所有双人互动 action 改为仅对话可用

### 现状
- `give`：check() 要求短记忆中有经济困难关键词，usableInDialogue: true
- `kiss`/`caress`/`hug`（sakuraba-academy/actions.js）：check() 要求 companions.length > 0，usableInDialogue: true

### 改动
- 所有双人互动 action 的 `check()` 改为直接 `return false`
- 保留 `usableInDialogue: true`，对话中通过 `propose_dialogue_action` 仍然可用
- 对话内 propose→accept→execute 流程不变

### 涉及文件
- `src/engine/actions-builtin.ts`：give 的 check() 改为 `return false`
- `configs/maps/sakuraba-academy/actions.js`：kiss/caress/hug 的 check() 改为 `return false`

---

## 4. `think` 改为 solo 推理会话

### 现状
`think` 是 instant action，LLM 填一个 free_text，引擎写一条记忆就结束。没有真正"思考"的过程。

### 新设计

#### 触发
- think 仍然是独立 action type，LLM 通过 decide_action 选择
- prompt 中根据 social_satiety 给出倾向引导（见第 6 节）

#### ThinkSession（类似 Conversation 但 solo）
```
ThinkSession {
  id: string
  worldId: string
  characterId: string
  transcript: ThinkTurn[]
  tickStarted: number
  currentTickRounds: number
  status: "active" | "ending" | "ended"
}
```

#### ThinkTurn
```
ThinkTurn {
  kind: "thought"        // 一段思考
  text: string           // 思考内容
  reasoning: string      // 内心推理
}
```

#### 每 tick 推理流程（runOneTickThink）
1. 3 轮推理，角色交替…不，只有自己
2. 每轮 LLM 可用的 tool：
   - `submit_think_turn`：输出一段思考（{ text, reasoning }），计入轮次
   - `end_thinking`：主动结束思考，写入总结记忆
   - `recall`：回忆印象
   - `memorize`：记录/更新印象
   - `add_notebook_entry`：记待办
3. recall/memorize/notebook 不计入轮次，消耗一轮后延续
4. 3 轮完成后注入系统消息：
   > "已经 XX:XX 了，你已思考了 XX 分钟。如果思考得差不多了，调用 end_thinking 结束思考并写入记忆。"
5. 若未结束，下个 tick 继续（角色被锁定，不参与正常决策，类似对话中的角色）

#### think prompt 内容
- 角色自我认知（同对话的 buildSelfImage）
- 三层记忆（短期/日/周）
- 印象簿（impressionBook）
- 当前目标
- 当前所处地点、生理状态、情绪状态
- 最近感知的事件

#### 结束处理
- end_thinking 携带 summary（总结这次思考的收获）
- 写入 shortMemory
- 更新印象簿（如有 memorize 调用）
- 释放角色锁定

#### 新增/修改文件
- `src/domain/schemas.ts`：新增 `THINK_TOOL_NAME`、`END_THINKING_TOOL_NAME` 的 tool schema 和 Zod schema
- `src/domain/types.ts`：新增 `ThinkSession`、`ThinkTurn` 类型
- `src/llm/prompt.ts`：新增 `buildThinkPrompt()`、`injectThinkTimeMessage()`
- `src/llm/decide.ts`：新增 `llmThink()` 入口函数
- `src/engine/tick.ts`：think action 执行时触发 think session；think session 的持久化/恢复；角色锁定逻辑

---

## 5. 提示词沉浸感重写

### 现状问题
`worldRules()` 使用命令式/机器口吻：
- "你**只能**调用 decide_action 工具…"
- "禁止直接输出任何自然语言文本——直接吐文本视为本 tick 弃权"
- "这是硬性规则"
- 整体像在念说明书，LLM 难以代入

### 改写原则
- 用角色内心认知的方式描述机制，而非系统指令
- "你必须" → 角色自然的行为习惯
- "禁止" → "你不会…因为…"
- 保留所有功能约束，但用叙事语言包装
- 每条规则给一个角色能理解的理由

### 涉及文件
- `src/llm/prompt.ts`：`worldRules()` 整段重写

---

## 6. 社交满足感对 speak/think 选择的引导

### 机制
- `social_satiety >= 2`（社交满足/很充实/社交过度）：角色倾向独处反思，prompt 中自然引导选 think
- `social_satiety <= -2`（有点寂寞/很孤单/极度孤独）：角色渴望社交，prompt 中自然引导选 speak
- 中间值：性格主导

### 实现
- 在 `buildUserPrompt` 的社交满足感行后面加一句自然的内心感受描述
- 在 speak 和 think 的 guidance/hint 中根据 social_satiety 动态调整
- 不在 worldRules 中硬编码规则，而是作为角色当下的心理状态呈现

### 涉及文件
- `src/llm/prompt.ts`：`describeEmotion()` 或 `buildUserPrompt()` 中的社交满足感渲染
- `src/engine/actions-builtin.ts`：speak 和 think 的 guidance/hint 可考虑动态化
