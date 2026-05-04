# 全局事件系统设计 (2026-05-05)

## 概述

全局事件/节庆系统：学园祭、考试周、台风停课、情人节、修学旅行等全局事件同时影响所有角色，打乱日常作息，创造新互动。事件有持续时间，存在时决策 context 中附带全局事件信息。

- **调度方式**：固定日期（"MM-DD" = 每年重复，"YYYY-MM-DD" = 一次性）
- **效果范围**：仅 context 注入，LLM 自行决定角色如何应对
- **定义方式**：`events.json` 文件，与 `actions.js` 模式一致
- **内置事件**：仅新年（`new-year`）
- **Mod 支持**：map pack 可通过 events.json 定义自定义事件

## 附带 Bug 修复

移除 `GAME_EPOCH` 硬编码限制。当前 `src/app/_lib/format.ts` 中 `GAME_EPOCH = new Date("2026-05-01T00:00:00")`，`dateToTick()` 强制 `startDate >= 2026-05-01`。修复后：

- `GAME_EPOCH` 不再是全局常量，改为每个 world 持有自己的 `epoch`（来自 manifest.startDate）
- tick 0 = world 开始时刻
- 无 startDate 时回退到 `2026-05-01` 作为默认值
- `tickToDate(epoch, tick)` / `formatGameTime(epoch, tick)` 等函数接受 epoch 参数

## GlobalEvent 数据结构

```typescript
interface GlobalEvent {
  id: string;        // "new-year", "school-festival", ...
  name: string;      // "新年", "学园祭", ...
  description: string; // 注入 context 的描述文本
  start: string;     // "MM-DD" 或 "YYYY-MM-DD"
  end: string;       // 同上格式
}
```

**日期匹配规则：**
- `"MM-DD"` 格式：每年重复，系统以 world epoch 为基准推断年份
- `"YYYY-MM-DD"` 格式：一次性事件
- `end` 日期为 inclusive（含当天），即 `today >= start && today < end + 1 day`

## 文件变更

### 新增文件

| 文件 | 用途 |
|------|------|
| `src/domain/events.ts` | `GlobalEvent` 类型 + 日期匹配工具函数 |
| `src/engine/events-builtin.ts` | `BUILTIN_EVENTS` — 仅新年 |
| `src/config/event-loader.ts` | 加载 events.json，合并 builtin + mod 事件 |

### 修改文件

| 文件 | 变更内容 |
|------|----------|
| `src/app/_lib/format.ts` | 移除全局 `GAME_EPOCH`，函数增加 `epoch` 参数 |
| `src/config/schemas.ts` | `ManifestSchema` 增加 `events` 可选字段 |
| `src/config/types.ts` | `Manifest` type 增加 `events?: string` |
| `src/engine/createWorld.ts` | 移除 `GAME_EPOCH` 依赖，world 持有 `epoch`；初始加载事件 |
| `src/engine/tick.ts` | tick 前计算活跃事件，传入 context 构建 |
| `src/llm/prompt.ts` | `buildUserPrompt()` 新增活跃事件段落 |
| `src/db/schema.ts` | world 表增加 `epoch` 字段（或复用现有字段） |

## 数据流

```
1. 世界创建时
   manifest.json → loadManifest() → event-loader
     → builtin events + mod events (if manifest.events is set)
     → 存入 world.events[] (内存) + world.epoch (来自 manifest.startDate)

2. 每 tick 决策前
   tickToDate(world.epoch, world.currentTick) → 当前游戏日期
     → 遍历 world.events[]，筛选 start ≤ today ≤ end
     → activeEvents[]

3. Context 注入 (buildUserPrompt)
   如果 activeEvents.length > 0:
     追加段落 "## ⚠️ 当前全局事件"
     每项: "<name>（第 N - M 天）\n<description>"
   不活跃时整段省略
```

## Prompt 注入格式

```
## 当前时间
今天是第 15 天，下午 2 点 24 分（晴）

## ⚠️ 当前全局事件
新年（第 1 - 3 天）
一年之始，万象更新。街上张灯结彩，人们互相拜年问候。

学园祭（第 4 - 6 天）
一年一度的校园文化祭正在举行，各班级和社团准备了展示和活动，校园里热闹非凡。

## 当前位置
你在 教学楼 3F 走廊（室内·教育设施）
```

## events.json 示例

```json
[
  {
    "id": "school-festival",
    "name": "学园祭",
    "description": "一年一度的校园文化祭正在举行，各班级和社团准备了展示和活动，校园里热闹非凡，到处都是来参观的外校学生和家长。",
    "start": "2026-09-10",
    "end": "2026-09-12"
  },
  {
    "id": "exam-week",
    "name": "考试周",
    "description": "期末考试的紧张气氛笼罩着整个校园，学生们都在抓紧时间复习，图书馆和自习室座无虚席。",
    "start": "2026-07-15",
    "end": "2026-07-19"
  },
  {
    "id": "typhoon-closure",
    "name": "台风停课",
    "description": "强台风即将登陆，学校已经宣布停课。暴风雨来袭，所有人都被要求留在室内，不要外出。",
    "start": "2026-06-20",
    "end": "2026-06-21"
  },
  {
    "id": "valentine",
    "name": "情人节",
    "description": "今天是情人节，空气中弥漫着甜蜜的气息。学生们在悄悄交换巧克力和礼物，表白的勇气在心中萌芽。",
    "start": "02-14",
    "end": "02-14"
  },
  {
    "id": "school-trip",
    "name": "修学旅行",
    "description": "修学旅行开始了！学生们乘坐新干线前往京都，参观古迹、体验传统文化，这是一年中最期待的集体活动。",
    "start": "2026-05-20",
    "end": "2026-05-23"
  },
  {
    "id": "new-year",
    "name": "新年",
    "description": "一年之始，万象更新。街上张灯结彩，人们互相拜年问候。初詣的钟声回荡在城市上空。",
    "start": "01-01",
    "end": "01-03"
  }
]
```

## 配置约定

- `events.json` 放在 map pack 目录下（与 manifest.json 同级）
- manifest.json 通过 `"events": "events.json"` 引用
- 不设置 `events` 字段时，仅加载内置事件（新年）
- 内置事件始终加载，mod 事件与内置事件使用同一命名空间（mod 可覆盖同 id 的内置事件）
