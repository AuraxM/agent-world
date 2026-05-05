# Character Notebook (角色记事本)

## Overview

为角色增加未来待办事项的记录与提醒功能。角色可通过 action 添加记录，引擎在 tick 决策和对话中注入即将到期的提醒，过期条目自动清理。

## Data Model

### NotebookEntry

```typescript
// src/domain/types.ts
interface NotebookEntry {
  id: string;
  scheduledTick: Tick;   // 内部 tick，用于范围查询
  content: string;        // 自由文本，如"和XX在公园约会"
  createdAt: Tick;
}
```

### Character 扩展

```typescript
// Character 新增字段
notebook: NotebookEntry[];
```

运行时字段，不写入 characters 表 JSON 列。与 conversations 模式一致，独立 SQLite 表持久化。

## DB Schema

```sql
-- src/db/schema.ts: notebookEntries table
-- 新增 migration 0004_notebook.sql
CREATE TABLE notebook_entries (
  world_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (world_id, character_id, id),
  FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
);
CREATE INDEX notebook_char_tick_idx ON notebook_entries(world_id, character_id);
```

## Module: `src/engine/notebook.ts`

纯模块，职责：

```typescript
// 加载
function loadNotebookEntries(worldId: string): Map<string, NotebookEntry[]>

// 持久化（upsert / delete）
function saveNotebookEntry(worldId: string, characterId: string, entry: NotebookEntry): void
function deleteNotebookEntry(worldId: string, characterId: string, entryId: string): void

// 清理：删除 scheduledTick < currentTick 的条目
function cleanExpiredEntries(worldId: string, currentTick: Tick): void

// 范围过滤
function getUpcoming(entries: NotebookEntry[], fromTick: Tick, toTick: Tick): NotebookEntry[]
function getTodayEntries(entries: NotebookEntry[], currentTick: Tick): NotebookEntry[]
function getNextHourEntries(entries: NotebookEntry[], currentTick: Tick): NotebookEntry[]

// 格式化（tick → HH:mm 文本，给 LLM 看）
function formatScheduledTime(tick: Tick, epoch: number): string
//   返回 "第N日 HH:MM" 或 "HH:MM"
function describeEntries(entries: NotebookEntry[], currentTick: Tick, epoch: number): string
//   返回 "今日待办：- 14:00 — 和XX在公园约会"
//   或 "未来一小时内：- 16:00 — ..."
```

### 时间格式化规则

使用与 `timeOfDay()` 一致的 epoch 基准计算，确保 notebook 显示的时间与 prompt 中的时间一致：

```
MS_PER_TICK = (60 / 5) * 60 * 1000 = 720000  // 12 分钟
gameDate = new Date(epoch + tick * MS_PER_TICK)
hour = gameDate.getHours()
minute = gameDate.getMinutes()
day = Math.floor(tick / 120)  // 游戏天，tick 基准
```

- 同一天：显示 `HH:MM`；不同天：`第N日 HH:MM`
- 所有格式化函数接受 `epoch: number` 参数

## Action: `add_notebook_entry`

### 定义

| 属性 | 值 |
|------|-----|
| type | `add_notebook_entry` |
| duration | `instant` |
| usableInDialogue | `true` |

### 参数 (LLM 可见)

```
scheduled_day: number      // 第几游戏天（和 prompt 中 "第 N 日" 一致）
scheduled_hour: number     // 0-23
scheduled_minute: number   // 0-55（按 12 分钟取整到最近 tick）
free_text: string          // 内容描述
```

### validateParams

- `scheduled_day >= 0`
- `scheduled_hour` 在 0-23
- `scheduled_minute` 在 0-59
- 转换后 `scheduledTick > currentTick`

### 内部转换

```
scheduledTick = scheduled_day * 120 + scheduled_hour * 5 + floor(scheduled_minute / 12)
```

### hint

```
添加记事本（当前时间：第 {day} 日 {hour}:{minute}）
  - scheduled_day: 目标游戏天
  - scheduled_hour: 目标小时 (0-23)
  - scheduled_minute: 目标分钟 (0-55, 12分钟一档)
  - free_text: 待办描述
```

可供 对话中使用（`propose_dialogue_action` / 对话 action list）。

## Tick 集成

### 决策 prompt 注入 (`buildUserPrompt`)

在"当前时间"行之前插入，从 Character.notebook 取今日条目（`currentTick .. currentTick + 120`）：

```
今日待办：
- 14:00 — 和XX在公园约会
- 18:00 — 去酒馆帮田中搬酒
```

无条目时省略整段。

### 对话 prompt 注入

保持 `injectTimeMessage` 不变 — 继续作为共享时间通知追加到 transcript（`__system__` 行），双方可见。

角色专属的待办提醒通过 `buildDialogTurnPrompt` 注入：新增可选参数 `upcomingEntries?: NotebookEntry[]`。在 `runOneTickDialog` 中，每轮 turn 之前从 speaker 的 notebook 取未来 1 小时条目（`tick .. tick + 5`），通过 `turnDecide` 传入。

每条待办在 turn prompt 中追加一行：

```
（你未来一小时内的待办：14:24 — 和供销社确认进货）
```

无条目时不追加。此信息不在 shared transcript 中，对方不可见。

### 过期清理

每 tick 开始时（tick.ts 阶段 1 之后），调用 `cleanExpiredEntries(worldId, currentTick)` 删除所有角色的过期条目。

## Implementation Checklist

1. `src/domain/types.ts` — 新增 `NotebookEntry`；`Character.notebook`
2. `src/domain/schemas.ts` — `NotebookEntrySchema`
3. `src/db/schema.ts` — `notebook_entries` 表定义
4. `src/db/migrations/0004_notebook.sql` — migration
5. `src/engine/notebook.ts` — 全部函数
6. `src/engine/actions-builtin.ts` — `add_notebook_entry` action 注册
7. `src/engine/store.ts` — `loadWorld` / `saveWorld` 挂载 notebook 加载
8. `src/engine/tick.ts` — 过期清理 + 决策 prompt 注入
9. `src/llm/prompt.ts` — `buildUserPrompt` 注入今日待办；`buildDialogTurnPrompt` 新增 `upcomingEntries` 参数注入角色专属未来 1 小时提醒
10. `src/engine/dialog.ts` — `runOneTickDialog` 中为每轮 turn 计算 speaker 的 upcoming 并传入 `turnDecide`

## Scope

- 仅 runtime + DB 持久化，无 UI 变更
- 初始无 NL 解析能力（"明天下午" 等），LLM 自行计算 day/hour/minute
