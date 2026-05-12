# LLM Agent Loop 时间预算控制

## 目标

用**时间预算**替换现有的固定轮次上限，控制 decide / dialog_turn / think 三个 agent loop 入口每 tick 内的 LLM 推理时间。

## 核心机制

- 每次 LLM API 返回后检查 `Date.now() - startTime > timeBudgetMs`
- 超时 → agent loop 返回 `kind: "exhausted"` + 已累积的 `messages`
- 现有暂停-恢复机制完全复用（`pendingDecideMessages` / `pendingThinkMessages` / `Conversation.sharedMessages`）
- 不做 `maxRounds` 兜底

## 配置

### DDL

```sql
ALTER TABLE llm_entry_configs
  ADD COLUMN time_budget_ms INTEGER NOT NULL DEFAULT 5000;
```

### 默认值

| 入口 | time_budget_ms |
|------|---------------|
| decide | 5000 |
| dialog_turn | 5000 |
| think（复用 dialog_turn 配置） | 5000 |
| dialog_personal_memory | 3000 |

## 改动文件

### 1. `backend/src/llm/agent-loop.ts`

- 参数 `maxRounds?: number` → `timeBudgetMs?: number` (default 5000)
- `while (round < maxRounds)` → `while (true)` + 每轮开始时检查时间
- 超时前至少保证完成 1 轮 API 调用
- 诊断日志：轮次计数改为 `round X / elapsed: Xms / budget: Xms`

### 2. `backend/src/llm/decide.ts`

- `maxRounds: 20` → `timeBudgetMs: config.timeBudgetMs`
- 从 `getEntryConfig("decide")` 读取

### 3. `backend/src/llm/think.ts`

- `maxRounds: 20` → `timeBudgetMs: config.timeBudgetMs`
- 从 `getEntryConfig("dialog_turn")` 读取（think 复用 dialog_turn 的 LLM 配置）

### 4. `backend/src/llm/dialog.ts`

- 移除 `TURNS_PER_TICK = 3` 和 `MAX_INNER_LOOPS = 3`
- `newDialogTurn`：agent loop 调用传 `timeBudgetMs`（从 dialog_turn 配置读取）
- `runOneTickDialog`：for 循环改为 `while (true)`，每次说话前检查总时间是否超 budget；超时则 `break`，下 tick 继续
- `generatePersonalMemory`：`maxRounds: 3` → `timeBudgetMs`

### 5. `backend/src/llm/providers.ts`

- `getEntryConfig()` 返回值包含 `timeBudgetMs`

## 不改动

- `llmDialogSummarize` / `llmAcceptDecide`：不走 agent loop，单次 API 调用 + 重试
- `tick.ts`：编排逻辑不变
- `memory_compress`：如果不是 agent loop 则不动

## 风险

- **死循环风险**：去掉 maxRounds 后，LLM 可能走极端一直调 read tools。实际风险低，因为 terminal tool 机制在第 1-2 轮就会触发 `write_*` 或 `end_*`
- **极端短预算**：如果 timeBudgetMs < 单次 API 耗时，仍然保证至少完成 1 轮，不会退化到完全无决策
