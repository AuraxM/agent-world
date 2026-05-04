# Speak 长流程对话设计

## 概述

将 `speak` action 从单 tick 内完成的对话改为跨 tick 的长流程对话。每 tick 限制 3 轮（3+3=6 句），对话自然进行，系统不催促结束，但每 tick 结束注入时间消息。4 句发起时间消息的角色将会有 +1 轮。

---

## 1. Conversation 实体

### 新增类型 (`src/domain/types.ts`)

```typescript
interface Conversation {
  id: string;
  initiatorId: string;        // 发起者（锁在对话中）
  acceptorId: string;         // 接受者（仍可正常决策）
  transcript: DialogTurn[];   // 完整对话记录（累计）
  tickStarted: number;        // 开始于哪个 tick
  currentTickRounds: number;  // 当前 tick 已进行轮数 (0-3)
  status: "active" | "ending" | "ended";
  endedBy?: "initiator" | "acceptor" | "passive";
  pendingExtraRound?: boolean; // 3+4 规则
}
```

### 状态含义

| Status | 含义 | 发生于 |
|--------|------|--------|
| `active` | tick 1 正常对话 | 对话启动后 |
| `ending` | tick 2+ 角色主要考虑是否结束 | tick 1 完成 6 句后自动转入 |
| `ended` | 对话结束，等待总结 | 角色调用 end_conversation 或被动终止 |

### 存储

- World state 新增 `conversations: Conversation[]`
- Character 新增 `activeConversationIds: string[]`（接受者可同时在多段对话中）

---

## 2. Tick 流程

### 每 tick 的处理顺序

1. Phase 1-3: vitals、emotion、perception（不变）
2. 检查 world 中 `status !== "ended"` 的 Conversation
3. 角色决策：
   - **发起者**：`activeConversationIds` 非空 → 跳过正常 action 选择，直接进入对话续接
   - **接受者**：正常 action 选择。若 move 离开节点 → 对话被动结束。若满足对话条件 → 自动续接
4. Dialog Protocol 阶段：
   - 处理**进行中的对话**（恢复、续接）
   - 处理**新发起的 speak**（和现有机制一样的配对、接受）

### 对话结束后的处理（不变）

- LLM 总结对话
- 双方写入记忆："和 X 聊了：[summary]"
- 发起者恢复自由行动

---

## 3. 每 Tick 对话结构

### 消息序列

```
[sys prompt]
[user prompt]
[1] 角色 A 说...
[2] 角色 B 说...
[3] 角色 A 说...
[4] 角色 B 说...
[5] 角色 A 说...
[6] 角色 B 说...
[time] 当前时间：第 {day} 日 {hour}:00（{timeOfDay}），对话已持续 {duration}
```

### 轮次规则

- 每 tick：每个角色各说 3 句，交替进行
- 每句话一次 LLM 调用（`submit_dialog_turn`）
- 谁先开口延续上一 tick 的顺序

### 3+4 规则

任何 tick 中，若某个角色在第 6 句话（自己的第 3 句）调用了 `end_conversation`，另一方获得 +1 轮机会：
- 当 tick 变为 3+4 = 7 句
- 适用于所有 tick
- 目的：对话不戛然而止

---

## 4. Tool 变更

### 新增：`end_conversation`

```json
{
  "name": "end_conversation",
  "description": "结束当前对话",
  "parameters": {
    "type": "object",
    "properties": {
      "reasoning": { "type": "string", "description": "结束对话的理由（内心独白）" },
      "closing_line": { "type": "string", "description": "结束语（可选）" }
    },
    "required": ["reasoning"]
  }
}
```

### 修改：`submit_dialog_turn`

移除 `kind: "leave"`，只保留 `kind: "say"`：

```json
{
  "name": "submit_dialog_turn",
  "parameters": {
    "type": "object",
    "properties": {
      "kind": { "type": "string", "enum": ["say"] },
      "line": { "type": "string", "description": "说的话" },
      "reasoning": { "type": "string", "description": "简短内心独白" }
    },
    "required": ["kind", "line"]
  }
}
```

### 每 tick 可用 tool

两种角色、所有 tick，tool 集合相同：
- `submit_dialog_turn`（say）
- `end_conversation`

---

## 5. Prompt 设计

### 对话轮次 prompt（所有 tick 相同）

```
你正在和 {peerName} 对话。

[性格特征]

对话记录：
[累计 transcript...]

现在轮到你说话。调用 submit_dialog_turn 回复。
```

- 不催促结束
- 不提醒对话长度
- `end_conversation` tool 始终可见，角色自行决定是否结束

### 时间消息（每 tick 的 6 句后注入）

```
[当前时间：第 {day} 日 {hour}:00（{timeOfDay}），对话已持续 {duration}]
```

- 作为对话 transcript 的一部分
- 角色可据此自然反应

---

## 6. 对话启动（不变）

- 角色调用 `action_speak`，瞄准目标角色
- 双向 speak → 自动配对
- 单向 speak → 目标角色 accept/reject
- 接受后 → 创建 Conversation，status = "active"

---

## 7. 对话结束

### 正常结束

- 任一方调用 `end_conversation`
- 总结 + 记忆写入（不变）

### 被动结束

- 接受者 move 离开节点
- 发起者收到系统消息："{acceptorName} 离开了当前场景，对话终止"
- 仍然走总结 + 记忆写入流程

---

## 8. 边缘情况

- **接受者在多段对话中**：每段独立处理
- **同一 tick 多人对同一人发起 speak**：接受者可能同时接受多个，按现有配对逻辑
- **对话中角色 sleep**：被动结束
- **世界保存/加载**：Conversation 跟随 world state 序列化
