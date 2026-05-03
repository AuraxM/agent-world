# Multi-Tool Action System

## Summary

将单一 `submit_action` tool 重构为每个 action 一个独立 tool，同时清理 prompt 中不存在 action 的描述，并启用 `tool_choice: "required"`。

## Changes

### 1. Prompt 清理
- 删除 `worldRules()` 中所有 `observe`、`nap` 的引用
- `nap` / `observe` 相关逻辑移除（`worldRules` 中不再提及不存在的 action）

### 2. `tool_choice: "required"`
- `decide.ts` 主决策路径加 `tool_choice: "required"`
- `llmSalvageDecide` 同样加
- 对话相关调用（`llmDialogTurn`、`llmDialogSummarize`、`llmAcceptDecide`）也加

### 3. 多 Tool 架构
- 每个 `ActionDefinition` 新增可选字段 `extraParams?: Record<string, any>` 定义专属 JSON Schema properties
- `schemas.ts` 新增 `buildActionTools()` 替代 `buildActionToolSchema()`
- 公共字段：`reasoning`*、`self_importance`*、`emotion_tag?`，每个 tool 都带
- Tool 命名：`action_<type>`
- `decide.ts` 从 `toolCall.function.name` 提取 action type，用对应 schema 校验
- `salvageDecide` 同样多 tool，过滤 speak 族
- `buildActionOptions` 不再需要在 prompt 里列 action 列表（LLM 直接从 tool 列表选）
- 兼容 mod action：`extraParams` 不提供时 tool 只有公共参数

## Files
- `src/llm/prompt.ts` — 清理 nap/observe
- `src/llm/decide.ts` — 多 tool + tool_choice required
- `src/domain/schemas.ts` — buildActionTools() 替代 buildActionToolSchema()
- `src/domain/action-system.ts` — ActionDefinition 加 extraParams
- `src/engine/actions-builtin.ts` — speak/move 加 extraParams
