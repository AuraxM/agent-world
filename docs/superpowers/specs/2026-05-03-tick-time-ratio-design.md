# Tick 时间换算比例修正（1h = 5 ticks）

## 背景

`TICKS_PER_HOUR = 5` 已在 `src/domain/enums.ts` 中定义，且引擎核心（tick.ts、execute.ts、vitals-emotion.ts、facts.ts）已正确引用该常量做计算。但仍有若干展示层和 prompt 文本残留了 `1 tick = 1 小时` 的硬编码假设，导致前后端时间显示与 LLM 上下文不一致。

## 目标

修正所有残留的 1:1 假设，建立集中的时间换算工具，使未来 tick 粒度变更只需改 `TICKS_PER_HOUR` 一处。

## 设计

### 1. `src/app/_lib/format.ts` — 集中时间工具

新增 `MS_PER_TICK` 常量与 `tickToDate` 辅助函数，三个公开函数全部收敛到此：

```ts
const MS_PER_TICK = 12 * 60 * 1000; // 1 tick = 12 游戏分钟（60min / 5）

function tickToDate(tick: number): Date {
  const start = new Date("2026-05-01T00:00:00");
  return new Date(start.getTime() + tick * MS_PER_TICK);
}
```

- `formatGameTime(tick)` → `"2026/05/01 08:24"`（新增分钟）
- `formatHHMM(tick)` → `"08:24"`（新增分钟）
- `formatDay(tick)` → 逻辑不变，底层改用 `tickToDate`

### 2. `src/llm/prompt.ts` — 文本修正

| 位置 | 当前 | 修正 |
|---|---|---|
| `worldRules()` 昼夜节律段 | `1 日 = 24 tick` | `1 日 = 120 tick（24 小时 × 5 tick/小时）` |
| `describeContinuity()` 距上次 rest/sleep | 直接用 tick 差值 | 除以 `TICKS_PER_HOUR` |
| `describeContinuity()` 距上次 eat | 直接用 tick 差值 | 除以 `TICKS_PER_HOUR` |

### 3. `use-world-state.ts` + `tick-bar.tsx` — 自动模式

- `startAuto` 默认参数 `n: number = 24` → `n: number = 24 * TICKS_PER_HOUR`
- 按钮文案 "自动 24h" 不变，语义保持"推一天"

### 4. `scripts/observe-circadian.ts` — 观测脚本

- `hour` 和 `day` 计算改用 `TICKS_PER_HOUR` 换算
- `TICKS = 48` → `TICKS = 48 * TICKS_PER_HOUR`（保持 2 天观测）

### 5. 测试

- `prompt.test.ts`：`describeContinuity` 段的断言数值需要更新（差值除以 5 后小时数变小）
- `vitals-emotion.test.ts` / `facts.test.ts` 已正确，无需改动

## 影响范围

| 文件 | 改动类型 |
|---|---|
| `src/app/_lib/format.ts` | 重写时间计算逻辑，新增分钟 |
| `src/llm/prompt.ts` | 修正 3 处文本 |
| `src/app/_hooks/use-world-state.ts` | 改默认参数 |
| `scripts/observe-circadian.ts` | 修正 hour/day 计算 + TICKS 常量 |
| `src/llm/prompt.test.ts` | 更新断言 |

## 不变的部分

- `TICKS_PER_HOUR` 自身不动
- 引擎核心（tick / execute / vitals-emotion / facts）不动
- vitals 数值体系不动（值仍是"小时"单位，仅在整小时 tick 边界变化）
- DB schema 不动
