# 总体技术架构

> 本文档为整体技术方案的设计基础。各 Stage 文档（stage-1 ~ stage-4-plus）描述每个阶段的具体实现范围。

---

## 1. 架构总览

```
┌─────────────────────────────────────────────────┐
│  Browser (Next.js / React)                      │
│  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ World View   │  │ State Store (Zustand)   │  │
│  │ Char View    │  │ ─ snapshot of world     │  │
│  │ Event Stream │  │ ─ event stream queue    │  │
│  │ Editor       │  │ ─ player commands       │  │
│  └──────────────┘  └─────────────────────────┘  │
│           ▲                       │              │
│           │ SSE (event push)      │ REST (cmd)   │
└───────────┼───────────────────────┼──────────────┘
            │                       ▼
┌─────────────────────────────────────────────────┐
│  Server (Next.js Route Handlers / Node)         │
│  ┌────────────────────────────────────────────┐ │
│  │  Simulation Engine (per-world, in-memory)  │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  │ │
│  │  │ Scheduler│→ │ Event Bus│→ │ Decision │  │ │
│  │  │  (tick)  │  │ (scope)  │  │  Worker  │  │ │
│  │  └──────────┘  └──────────┘  └─────┬────┘  │ │
│  │       ▲              ▲             ▼        │ │
│  │  ┌────┴──────────────┴──────────────────┐  │ │
│  │  │  Domain Model (Map/Char/Event/Hist) │  │ │
│  │  └──────────────┬──────────────────────┘  │ │
│  └─────────────────┼─────────────────────────┘ │
│                    ▼                            │
│  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ SQLite/Drizzle│  │ Anthropic SDK (Claude) │  │
│  │ ─ worlds     │  │ ─ prompt cache         │  │
│  │ ─ snapshots  │  │ ─ structured outputs   │  │
│  │ ─ events log │  │ ─ Sonnet/Haiku 分级    │  │
│  └──────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**核心思想**：每个"世界"是一个独立的内存中模拟引擎实例，引擎按 tick 推进；每个 tick 内并行调用 LLM 做决策；事件通过 SSE 推到前端实时渲染；快照定期落盘到 SQLite。

---

## 2. 技术选型

| 层 | 选型 | 理由 |
|---|---|---|
| 全栈框架 | **Next.js 15 (App Router)** | 单仓库前后端，SSE/Route Handler 原生支持 |
| UI | **React + TypeScript + Tailwind + shadcn/ui** | 主流栈，shadcn 直接给暗色 + 故事字体基线 |
| 客户端状态 | **Zustand** | 轻量，适合"世界快照"这种大对象的局部订阅 |
| 可视化 | **React Flow**（地图层级、关系图谱）+ **Framer Motion**（思考/行动动效） | React 生态主流 |
| 实时推送 | **SSE (EventSource)** | 比 WebSocket 简单，单向"服务端→前端事件流"刚好够用 |
| 数据库 | **SQLite + Drizzle ORM** | 零依赖、单文件、可导出；Drizzle schema 类型直通前端 |
| LLM | **Anthropic SDK + Claude Sonnet 4.6**（决策主力）+ **Haiku 4.5**（背景 NPC、摘要） | 成本/质量平衡 |
| 结构化输出 | **Claude tool use** | 强制 LLM 返回合法 action schema |
| 校验 | **Zod** | 统一 schema，前后端共享 |
| 测试 | **Vitest + Playwright** | 引擎单元测试 + 端到端 |

---

## 3. 领域模型（核心 Schema）

```typescript
// 时间：1 tick = 1 game hour
type Tick = number;  // 0 起算

// 地图节点
type MapNode = {
  id: string;
  worldId: string;
  parentId: string | null;
  name: string;
  description: string;
  tags: NodeTag[];           // ['public','indoor','dining',...]
  capacity: number | null;
  privacy: 'public' | 'semi' | 'private';
  visibleFromParent: boolean;
  accessRule?: AccessRule;
  shortcuts: string[];       // 特殊通道连接的其他节点 id
};

// 角色
type Character = {
  id: string;
  worldId: string;
  name: string;
  avatar?: string;
  locationId: string;
  personality: {            // 8 维 [-100, 100]
    extraversion: number; rationality: number; ambition: number;
    altruism: number; curiosity: number; aggression: number;
    honesty: number; stability: number;
  };
  statuses: Status[];       // [{ kind: 'hungry', level: 'medium', since }]
  abilities: Ability[];     // [{ kind: 'reading', tier: 3, exp }]
  shortMemory: Memory[];    // FIFO 50
  longMemory: Memory[];     // 重要度排序 100
  relations: Map<string, Relation>;  // 单向：A→B
  currentAction?: OngoingAction;     // 占用时间槽中
};

// 事件
type WorldEvent = {
  id: string;
  worldId: string;
  category: EventCategory;  // time/env/social/burst/quest/inner/system
  description: string;      // 自然语言供 LLM
  participants: string[];
  source: EventSource;
  intensity: 1 | 2 | 3 | 4 | 5;
  scope: EventScope;        // 私有/节点/父/子/全局 + 过滤器
  duration: number;         // tick 数
  suggestedActions?: string[];
  createdAt: Tick;
};

// 行动（封闭类型集，自由内容）
type ActionType =
  | 'move' | 'wait' | 'observe' | 'speak'
  | 'interact_object' | 'interact_person'
  | 'use_ability' | 'rest' | 'work' | 'eat'
  | 'attack' | 'flee' | 'help' | 'create'
  | 'gift' | 'steal' | 'read' | 'write'
  | ...;  // 约 30 种

type Action = {
  type: ActionType;
  actorId: string;
  targetId?: string;        // npc 或 object
  targetNodeId?: string;
  freeText?: string;        // 说话内容、行动具体描述
  reasoning: string;        // 内心独白
  emotionTag?: string;
  selfImportance: number;   // 1-5 自评要不要长期记
};
```

---

## 4. 模拟引擎核心循环

```
on tick(t):
  1. 系统事件注入：日历/天气/玩家排队的注入事件
  2. 状态衰减：每个 NPC 的 hunger/fatigue/+1
  3. 内部事件触发：状态越线产生 InnerEvent (饥饿/孤独…)
  4. Scope 分发：把所有当前 tick 的 event 按 scope 投递到 NPC 的 perception queue
  5. 收集所有"需要决策"的 NPC（perception 非空 或 currentAction 结束）
  6. 并行 LLM 决策（基于 t 时刻的 world snapshot）
  7. 收集 actions → 冲突仲裁（同时拿同一物品 → 触发 ConflictEvent）
  8. 执行 actions → 改状态、改关系、写记忆、产生衍生 event
  9. 长期记忆晋升 / 短期 FIFO
  10. 推送到前端 SSE
  11. 持久化快照（每 24 tick 一次 = 每个游戏日一次）
```

**关键设计：快照 + 事件溯源混合**
- 每个 tick 写入 `events_log` 表（事件溯源，支持回放与分支）
- 每 24 tick（1 游戏日）写一次完整 `world_snapshot`（性能：回放不必从零回放）
- 历史回放 = 加载最近快照 + 重放后续事件日志

---

## 5. LLM 决策模块

### 5.1 输入构造（每个 NPC 每次决策）

```
[CACHED · 几乎不变]
- World rules / NPC 自我画像（性格 + 能力）

[CACHED · 慢变]
- 长期记忆摘要 + 重要关系

[每次新输入]
- 当前位置环境 + 同节点其他 NPC 简介
- 触发本次决策的事件
- 可选行动列表（带来源标签）
- 近期短期记忆 5–8 条
```

缓存命中可降低 70%+ 成本（Anthropic prompt cache）。

### 5.2 输出（强制 JSON via tool use）

```typescript
{
  action_type: ActionType,         // 封闭枚举
  target_id?: string,
  target_node_id?: string,
  free_text?: string,              // 自由内容
  reasoning: string,
  emotion_tag?: string,
  self_importance: 1|2|3|4|5
}
```

### 5.3 分级模型策略（控成本）

- 玩家**聚焦中**的 NPC 或参与**强度 ≥ 4 的事件** → Sonnet 4.6
- 背景 NPC 的日常决策 → Haiku 4.5
- "快进 N 天"模式 → Haiku 4.5 + 批量请求 + 简化 prompt
- 失败/超时 → 兜底固定逻辑（吃饭/回家/闲逛）+ 写"愣神"经历

### 5.4 并发控制

- 单 tick 内最多 N 个 LLM 并发请求（避免限流）
- 队列化 + 流式推送已完成的决策（"先动起来"模式）

---

## 6. 存储与持久化

```sql
worlds(id, name, current_tick, config_json, created_at, updated_at)
nodes(id, world_id, parent_id, ...)
characters(id, world_id, ...)
events_log(id, world_id, tick, payload_json)        -- 事件溯源
snapshots(id, world_id, tick, payload_json)         -- 完整快照（每 24 tick）
memories(id, character_id, kind, content, importance, tick)
pending_events(id, world_id, payload_json, created_at)  -- 玩家投放队列
```

- 单世界导出 = `SELECT * WHERE world_id=X` → 一个 JSON 文件
- 分支 = `INSERT INTO worlds ... FROM snapshot at tick T`，新 world_id

---

## 7. 性能与成本控制

| 风险 | 对策 |
|---|---|
| LLM 响应慢，玩家等待 | 流式推送已完成的决策；思考动画；可后台快进+离开 |
| LLM 成本高 | Prompt cache；Haiku 跑背景 NPC；快进用批量+简化模板 |
| 20 NPC × 24 tick × 1 天 = 480 次调用 | 默认仅"被事件触发"才决策（不是每 tick 都决策）；Haiku 处理日常 |
| 行为循环 | 检测连续 3 tick 重复行动 → UI 提示玩家可投放打断事件 |
| 记忆爆炸 | 短期 FIFO 强制截断；长期按重要度淘汰；每天定时由 Haiku 生成"昨日纪事"压缩短期 |
| 状态空间大 | 同步快照只存 diff；事件日志压缩 |

---

## 8. 关键风险

1. **NPC 千人一面** → LLM 默认风格趋同。对策：在 prompt 中**强制引用性格维度的具体数值**（不是名字而是 "你的攻击性 +75，遇到挑衅你倾向于…"），并在系统消息中给出"差异化样例"。
2. **事件因果链丢失** → 事件衍生事件可能产生爆炸。对策：每个事件有 `source` 链，强度 ≤ 2 的衍生事件不再产生新衍生。
3. **玩家"无聊"** → 纯沙盒玩家会失去目标。对策：MVP 提供"故事种子"（每个模板内置 2-3 个潜在剧情线索的 NPC 配置）。
4. **回放不一致** → LLM 输出非确定。对策：所有 LLM 调用记录 `request_id` + 输出，回放时直接读日志而非重调。
