# Three-Tier Memory System (2026-05-03)

## Motivation

当前记忆系统仅有一层 FIFO 50 短期记忆，旧记忆直接丢弃，推理上下文只加载最近 8 条。角色每天睡醒后对前一天的记忆完全丢失——无法形成"昨天干了什么""这周发生了什么"的认知。需要三层压缩归档机制。

## Design

### Data Model

```
Character {
  shortMemory:  Memory[]   // 短期，FIFO 50（不变）
  dailyMemory:  Memory[]   // 中期，日记忆（新增）
  longMemory:   Memory[]   // 长期，周记忆（复用现有 longMemory）
}
```

DB `characters` 表新增 `dailyMemoryJson TEXT NOT NULL DEFAULT '[]'` 列。`longMemoryJson` 复用为周记忆存储。

压缩后的日/周记忆仍是 `Memory` 类型——content 存 LLM 摘要文本，tick 存压缩时的 tick，importance 固定为 3。

### Tiers

| 层级 | 存储 | 触发 | 上下文加载 |
|------|------|------|-----------|
| 短期 | shortMemory | 每 tick 写入 | 最近 6 条 |
| 中期(日) | dailyMemory | 睡觉开始时压缩清醒期 shortMemory | 最近 6 条 |
| 长期(周) | weeklyMemory (longMemory) | 每日睡觉时 dailyMemory 满 7 条 | 最近 6 条 |

### Compression Flow

睡觉开始时（sleepAction.execute 中 synchronous 触发）：

1. 收集上次睡觉至今的 shortMemory 全部条目
2. 调用 LLM 摘要 → 生成 1 条日记忆，push 到 dailyMemory
3. 检查 `dailyMemory.length >= 7`
   - 取最近 7 条日记忆，调用 LLM 摘要 → 生成 1 条周记忆，push 到 longMemory
   - 删除已被压缩的 7 条日记忆
4. 清空 shortMemory
5. 写入"我在 X 躺下准备睡觉。"到 shortMemory

### Context Loading

修改 `describeMemories()`，分块展示：

```
你的近期短期记忆：
- t=120: ...
(最近 6 条)

你的日记忆：
- 第 3 天: ...
(最近 6 条)

你的周记忆：
- 第 2 周: ...
(最近 6 条)
```

### LLM Summary Prompt

压缩摘要调用独立于角色决策 LLM 调用。输入是被压缩的记忆条目列表，输出是一条简体中文自然语言摘要（约 2-5 句话），用第一人称。

### Compression Metadata

需要追踪"上次睡觉 tick"以确定压缩边界。在 Character 上新增 `lastSleepTick: Tick` 字段，睡觉开始时读取并更新。

首次睡觉时 lastSleepTick = 0，压缩范围是 tick 0 到当前 tick 的所有 shortMemory。

### Errors

- 摘要 LLM 调用失败：跳过该次压缩，shortMemory 不清空（下次睡觉时重试，范围更大）
- 长期记忆不设上限（周记忆增长速度很慢）
