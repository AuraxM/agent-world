# Stranger Chat — 陌生人对话功能设计

## 概述

在 world-view 中新增"对话"tab，用户以匿名陌生人身份与 NPC 对话。
NPC 使用和普通 NPC 间对话相同的 system prompt，可以翻阅自己的记忆来回答问题，
但不能修改任何持久状态（记忆、印象、关系等）。
仅在 tick 停止时可用。

## 后端

### 新路由 `backend/src/server/routes/stranger-chat.ts`

`POST /api/worlds/:id/stranger-chat`

请求体：
```json
{
  "characterId": "char-1",
  "message": "你对李四这个人怎么看？",
  "sessionId": "sess-abc123"  // 可选，首次消息不传，后续消息传入
}
```

响应体：
```json
{
  "sessionId": "sess-abc123",
  "reply": "我觉得他是个实在人...",
  "reasoning": "首先我需要了解李四是谁...",
  "toolCalls": [
    {
      "name": "read_relations",
      "args": { "target_id": "char-2" },
      "result": { "relations": [...] }
    }
  ]
}
```

### Tick 运行中拒绝

- 从 `tick.ts` 暴露 `isTickActive(worldId): boolean`，基于已有的 `_activeTicks` Set（检查是否有以 `${worldId}:` 开头的 key）
- tick 运行中时返回 `409 { error: "tick 运行中，无法对话" }`

### 会话管理

- 内存 Map：`Map<string, ChatSession>`，key 为 `sessionId`
- `ChatSession`：`{ worldId, characterId, sharedMessages: any[], lastActivity: number }`
- 每次请求更新 `lastActivity`
- TTL 清理：每 10 分钟扫描一次，30 分钟无活动自动清除

### 提示词

复用 `buildDialogSystemPrompt(selfName, "一个陌生的路人")`：
- 不传 `peerId`（陌生人没有角色 ID）
- 去掉 "你可以在对话中提议动作" 这一行（陌生人不能提议动作）

### Agent Loop 配置

- LLM entry：复用 `dialog_turn`
- Read tools：全部（read_profile, read_memories, read_vitals, read_emotion, read_relations, read_character, read_map, read_companions, read_events, read_state, read_goals, read_economy, read_notebook）
- Terminal tools：`write_dialog`、`end_dialog`
- 不暴露：`write_memory`、`write_propose_action`、`write_respond_action`、`write_impression`、`write_relation`、`write_like`、`write_dislike`、`write_short_term_goal`、`write_long_term_goal`、`write_notebook`、`delete_memory`
- `maxRounds`: 20
- 无 `customWriteHandlers`（不需要 propose/respond action 捕获）

### end_dialog 行为

与普通对话不同，陌生人 chat 中 `end_dialog` 不会触发对方 farewell turn。
当 LLM 调用 `end_dialog` 时，直接以 NPC 最后一句话作为 reply 返回，
summary 内容附带在 reasoning 区域展示。

### Reasoning 和 Tool Calls 提取

从 `runAgentLoop` 返回的 `messages` 中：
- 提取所有 `reasoning_content`（DeepSeek 推理内容）
- 提取所有 assistant tool_calls 和对应的 tool result messages
- 序列化为 `toolCalls[]` 返回前端

### 服务端注册

在 `backend/src/server/index.ts` 中：
```typescript
await app.register(strangerChatRoutes, { prefix: "/api/worlds" });
```

## 前端

### world-view.tsx 修改

- `centerTab` 类型：`"stream" | "gantt"` → `"stream" | "gantt" | "chat"`
- tab bar 增加值："对话"
- tab content 增加 `<StrangerChat>` 组件
- 传入 `loading`（tick 运行状态）、`snapshot`（角色列表）

### 新组件 `stranger-chat.tsx`

布局：
```
┌──────────────────────────────────────────┐
│ [角色选择器: ▼ 张三]                       │
├──────────────────────────────────────────┤
│ 消息列表（flex-1, overflow-y-auto）        │
│  - 用户消息右对齐，蓝色气泡                 │
│  - NPC 回复左对齐，灰色气泡                 │
│  - 每条 NPC 回复下方 > 思考过程（可展开）    │
├──────────────────────────────────────────┤
│ [输入框________________________] [发送]    │
│ tick 运行中时禁用                           │
└──────────────────────────────────────────┘
```

关键状态：
- `selectedCharId: string | null` — 当前选中的角色
- `sessionId: string | null` — 当前会话 ID（首次发送后从 API 获取）
- `messages: Message[]` — 消息列表
- `loading: boolean` — 正在等待 NPC 回复
- `expandedReasonings: Set<number>` — 展开的思考过程索引

交互细节：
- 切换角色时清空消息和 sessionId
- tick 运行中（`loading === true`）时输入框和发送按钮禁用，placeholder 显示 "Tick 运行中，请等待..."
- 发送后显示加载状态（"正在输入..."），直到收到回复
- 思考过程默认折叠，点击 "▶ 思考过程（N 个工具调用）" 展开
- 展开后显示 reasoning 文本 + 每个 tool call 的名称/参数/返回值（格式化 JSON）

### 组件签名

```typescript
export function StrangerChat({
  worldId,
  characters,
  loading,
}: {
  worldId: string;
  characters: Character[];
  loading: boolean;
})
```

### API 调用

在组件内直接 fetch：
```typescript
const res = await fetch(`/api/worlds/${worldId}/stranger-chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    characterId: selectedCharId,
    message: inputText,
    sessionId, // null on first message
  }),
});
```

## 测试

- 后端单元测试：验证 `isTickActive`、session 管理、agent loop 配置（只读工具）
- 前端组件测试：切换角色清空、tick 禁用状态、思考过程展开

## 非目标

- 不持久化陌生人对话（会话纯内存，重启丢失）
- 不保存陌生人对话历史到数据库
- 不在 Gantt 图/事件流中显示陌生人对话事件
- 不支持陌生人和多个 NPC 同时对话
