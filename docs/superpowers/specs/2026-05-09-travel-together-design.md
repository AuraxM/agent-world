# Design: travel_together (结伴同行) built-in action

## Summary

对话中可用的双人同步移动 action。一方在对话中 propose，对方 accept 后，双方锁定决策权，沿 BFS 最短路径每 tick 同步移动一步。移动与对话并行进行——对话照常推进，移动在引擎层自动步进。对话结束后若移动未完成，双方继续被锁直到到达目的地。

## Motivation

现有对话中可用的 action 只有 `give`（金钱交易），缺乏"结伴同行"这类改变空间位置 + 延续对话的社交行为。这限制了角色在对话中产生自然社交互动的能力。

## Data model changes

### `OngoingAction` 新增字段 (`domain/types.ts:83-98`)

```ts
/** travel_together 专属：同行伙伴的角色 ID */
partnerId?: string;
```

## New action definition (`systems/actions-builtin.ts`)

- `type`: `"travel_together"`
- `duration`: `0`（实际时长由 BFS path length 决定）
- `usableInDialogue`: `true`
- `check`: 始终 true（dialogue-only，由对话上下文保证同节点）
- `validateParams`: 校验 `target_node_id`（可达、非当前位置）、`reason`
- `extraParams`: `target_node_id`, `reason`, `free_text`
- `extraRequired`: `["target_node_id", "reason"]`

## Dialogue execution (`llm/dialog.ts`)

在 `executeDialogueAction` 中为 `"travel_together"` 新增分支：

1. 计算 BFS path（`findPath(currentLoc, targetNodeId, nodes)`）
2. 给**双方**设置 `currentAction`：
   - `type`: `"travel_together"`
   - `path`: BFS 节点序列
   - `stepIndex`: `0`
   - `partnerId`: 对方角色 ID
   - `interruptThreshold`: `5`（不可打断）
   - `reason`: 移动原因
3. 双方第一步（`stepIndex 0→1`）立即移动位置到 `path[1]`
4. 单步路径（`path.length <= 2`）：直接标记到达，清理 ongoing action
5. transcript 插入系统消息："X 和 Y 结伴前往 Z"

## Tick loop changes (`server/tick.ts`)

在**角色决策并发前**（Phase 6 之前），新增 `travel_together` 专属处理块：

```
for each character with currentAction.type === "travel_together":
  if tick < endsAt:
    找到 partner（partnerId）
    双方同步推进 path：stepIndex++
    双方 locationId = path[stepIndex]
    如果到达终点:
      清理双方 currentAction
      写入到达记忆（双方各自）
      生成到达事件
    如果未到达:
      将双方加入 lockedCharacterIds
      生成 skipExecution placeholder action
  else:
    和现有 Phase 6b 一致：onComplete 结算
```

关键约束：
- 移动步骤中**不检查 interrupt**（interruptThreshold: 5 确保现有逻辑不会触发）
- 移动步骤**独立于对话生命周期**：对话 active/ending/ended 都继续走
- 只要 `travel_together` ongoing action 存在，角色就被锁在 `lockedCharacterIds` 中

## Per-tick execution order (for travel_together pair)

```
1. travel_together movement step (engine, zero LLM cost)
2. Dialogue turns (if conversation is still active/ending)
```

两个过程并行推进，互不阻塞。

## Edge cases

| 场景 | 行为 |
|------|------|
| 对话中 accept，路径长 | 对话 + 移动并行；每 tick 对话 3 turns + 移动 1 step |
| 移动未完成，对话先结束 | 移动继续，双方被 travel_together 锁；每 tick 自动步进 |
| 移动完成，对话未结束 | 清理 ongoing action；对话继续；可再次 propose travel_together |
| 移动完成，对话已结束 | 双方解放，各自正常决策 |
| 路径长 1（相邻节点） | `path.length <= 2`：立即到达，清理 ongoing action |
| 一方在 accept 前离开节点 | 不会发生——accept 时双方必在同节点，且对话锁保证无人离开 |

## Files to modify

| File | Change |
|------|--------|
| `domain/types.ts` | `OngoingAction` 加 `partnerId?` |
| `systems/actions-builtin.ts` | 新增 `travelTogetherAction` + 注册到 `BUILTIN_ACTIONS` |
| `llm/dialog.ts` | `executeDialogueAction` 加 `travel_together` 分支 |
| `server/tick.ts` | 新增 `travel_together` ongoing action 处理块 |
