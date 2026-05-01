# Stage 1 · Skeleton（2 周）

## 目标

验证核心命题：**LLM agent 是否能在性格差异下做出可观察的不同决策**。

最小工程量，硬编码世界，文本化 UI。把"模拟引擎 + LLM 决策"的核心闭环跑通；一切叙事打磨、可视化、玩家创世留到后续阶段。

---

## 范围

### 包含
- Next.js 15 + TypeScript + Tailwind 项目骨架
- SQLite + Drizzle ORM + 数据迁移
- 领域模型类型定义（Map / Char / Event / Action）
- 硬编码种子世界：5 NPC × 8 节点的"晨曦小镇"
- 模拟引擎 v0：单 tick 推进
- LLM 集成：Anthropic SDK + Sonnet 4.6 + tool-use 强制 JSON 输出
- 后端 API：tick / 获取快照 / 获取事件日志
- 极简 UI：单页 dashboard 展示节点 / 角色 / 事件流 + "推进 1 小时"按钮

### 不包含（推迟）
- 地图层级可视化 → Stage 2
- **玩家事件投放 → Stage 2**
- 历史回放、分支 → Stage 3
- 编辑器、模板 → Stage 3
- Haiku 分级 / prompt 缓存 → Stage 2
- 短期 / 长期记忆双层（v0 用单层 50 条 FIFO）→ Stage 2
- 关系图谱 UI → Stage 2
- 暗色主题打磨 → Stage 3

---

## 项目结构

```
agent-world/
├─ app/
│  ├─ layout.tsx
│  ├─ page.tsx                     # 单页 dashboard
│  └─ api/
│     └─ worlds/[id]/
│        ├─ tick/route.ts          # POST 推进一步
│        ├─ route.ts               # GET 完整快照
│        └─ events/route.ts        # GET 事件日志
├─ src/
│  ├─ db/
│  │  ├─ schema.ts                 # Drizzle schema
│  │  ├─ client.ts                 # SQLite client
│  │  └─ migrate.ts
│  ├─ domain/
│  │  ├─ types.ts                  # MapNode, Character, WorldEvent, Action 等
│  │  ├─ enums.ts                  # ActionType, NodeTag, StatusKind, EventCategory
│  │  └─ schemas.ts                # Zod schemas（与 LLM tool 共享）
│  ├─ engine/
│  │  ├─ tick.ts                   # 主循环
│  │  ├─ perception.ts             # scope → 感知队列分发
│  │  ├─ actions.ts                # 可选行动收集
│  │  ├─ execute.ts                # 执行行动 → 改状态/写记忆/衍生事件
│  │  └─ status-decay.ts           # 自然衰减
│  ├─ llm/
│  │  ├─ client.ts                 # Anthropic SDK 包装
│  │  ├─ decide.ts                 # 单 NPC 决策入口
│  │  └─ prompt.ts                 # prompt 构造
│  └─ seed/
│     └─ morning-town.ts           # 晨曦小镇硬编码
├─ drizzle.config.ts
├─ package.json
├─ tsconfig.json
└─ .env.example                    # ANTHROPIC_API_KEY
```

---

## 数据库 Schema (Drizzle)

```typescript
// worlds: 一个世界一行
{ id, name, current_tick, created_at, updated_at }

// nodes: 地图节点
{ id, world_id, parent_id (nullable), name, description,
  tags_json, capacity, privacy, visible_from_parent,
  shortcuts_json, created_at }

// characters: 角色
{ id, world_id, name, location_id,
  personality_json,    // 8 维数值
  statuses_json,       // 当前状态数组
  abilities_json,      // 能力数组
  memory_json,         // v0 单层 FIFO 50 条
  relations_json,      // 单向关系 map
  current_action_json, // 持续行动（v0 仅占位，不实际使用）
  created_at, updated_at }

// events_log: 事件溯源
{ id, world_id, tick, payload_json, created_at }

// snapshots: 完整快照（每 24 tick 写一次）
{ id, world_id, tick, payload_json, created_at }
```

---

## 种子数据：晨曦小镇

**8 节点**：
```
晨曦小镇 (root)
├── 阳光中学
│   ├── 教室3-2
│   └── 操场
├── 老王饭馆
├── 中央公园
├── 张家
├── 李家
└── 主街
```

**5 NPC**（性格刻意对立）：

| 名 | 性格关键点 | 初始位置 | 初始关系 | 初始状态 |
|---|---|---|---|---|
| 张默 | 内向 -80 / 谨慎 -70 / 好奇 -50 | 张家 | 与李欢 = 朋友 | 无聊（轻） |
| 李欢 | 外向 +85 / 进取 +60 / 利他 +50 | 主街 | 与张默 = 朋友、暗恋小静 | 兴奋（轻） |
| 王刚 | 攻击性 +70 / 利己 +60 / 诚实 -40 | 老王饭馆 | 与张默 = 敌人 | 饥饿（轻） |
| 小静 | 情绪敏感 +80 / 好奇 +60 / 利他 +70 | 中央公园 | 与所有人都是熟人 | 好奇（轻） |
| 老李 | 理性 +70 / 利他 +50 / 情绪稳定 +80 | 李家 | 小静的舅舅 | 疲惫（中） |

设计意图：每对/每组 NPC 在同一事件下能产生肉眼可辨的反应差异。

---

## 实现任务清单

### 1. 项目初始化（D1）
- [ ] `npx create-next-app@latest agent-world --typescript --tailwind --app --src-dir`
- [ ] 安装：`@anthropic-ai/sdk`、`drizzle-orm`、`better-sqlite3`、`zod`
- [ ] 配置 `.env.local`：`ANTHROPIC_API_KEY`
- [ ] 提交基础脚手架

### 2. 数据库与领域模型（D1–D2）
- [ ] 编写 Drizzle schema（如上）
- [ ] 编写 `migrate.ts` 一键建表
- [ ] 定义 `domain/enums.ts`：
  - `ActionType`（v0 取约 15 种）
  - `NodeTag`、`StatusKind`、`EventCategory`、`EventScope`
- [ ] 定义 `domain/types.ts`：所有领域 TS 类型
- [ ] 定义 `domain/schemas.ts`：Zod schema，特别是 `ActionSchema`

### 3. 种子数据：晨曦小镇（D2）
- [ ] `seed/morning-town.ts`：硬编码 8 节点 + 5 NPC + 关系
- [ ] `npm run seed` 命令一键写入数据库
- [ ] 验证：用 SQLite GUI 查看数据无误

### 4. 模拟引擎 v0（D3–D5）
- [ ] `engine/status-decay.ts`：每 tick `hunger += 1, fatigue += 1`，越线（≥ 5 中度，≥ 10 严重）
- [ ] `engine/perception.ts`：按 scope 分发事件到每个 character 的感知队列
- [ ] `engine/actions.ts`：根据当前位置 / 状态 / 关系生成可选行动列表
- [ ] `engine/execute.ts`：执行 action → 改状态 / 写记忆 / 衍生事件
- [ ] `engine/tick.ts` 主循环：
  ```
  loadWorld → decay → triggerInnerEvents → injectScheduledEvents
  → dispatchPerception → collectDecisionNeeders
  → parallelDecide → executeActions → writeMemories
  → persistEventsLog → maybePersistSnapshot
  ```
- [ ] **冲突仲裁 v0 简化**：actions 顺序执行，后到的失败（先到先得）
- [ ] 单元测试：`tick.test.ts` 跑 1 步无 LLM 调用（mock）

### 5. LLM 决策模块（D6–D7）
- [ ] `llm/client.ts`：包装 Anthropic SDK，配置超时 30s、最多重试 1 次
- [ ] `llm/prompt.ts`：构造 system + user 消息
  - **system**: 世界规则 + 角色画像（含 8 维数值 + 性格描述）+ "在 reasoning 中至少引用一项你的性格维度数值"
  - **user**: 当前位置 + 同节点 NPC + 触发事件 + 可选行动列表 + 近期记忆 8 条
- [ ] `llm/decide.ts`：单次决策；用 tool-use 强制返回 ActionSchema
- [ ] 失败兜底：LLM 异常 → 该 NPC 行动 = `wait` + reasoning="LLM 调用失败"
- [ ] 单元测试：固定 prompt 验证返回符合 schema

### 6. API Routes（D8 上半）
- [ ] `POST /api/worlds/:id/tick`：触发引擎，返回新快照
- [ ] `GET /api/worlds/:id`：返回完整世界快照
- [ ] `GET /api/worlds/:id/events?since=tick`：返回事件日志

### 7. 极简 UI（D8 下半）
单页 `app/page.tsx`，无任何动效，刷新型 UI：
- 顶部：当前游戏时间（`tick → "2026/05/01 09:00"`）/ 世界名 / "推进 1 小时" 按钮
- 左栏（节点列表）：每节点缩进显示层级，节点内 NPC 用 emoji
- 中栏（角色简表）：名 / 位置 / 状态 tag / 最近行动（含 reasoning 截断）
- 右栏（事件流）：时间倒序，事件类别 + 描述

```tsx
// 伪代码
<button onClick={async () => {
  await fetch(`/api/worlds/${id}/tick`, { method: 'POST' });
  await refetchWorld();
}}>推进 1 小时</button>
```

### 8. 演示场景调试（D9）
- 启动后运行 24 tick（手动连点 24 次或写一个临时按钮）
- 观察五个 NPC 一天的轨迹
- 调 prompt：如果性格差异不明显，加强 system 中的性格强调

### 9. 验收（D10）

---

## 验收标准

1. ✅ `npm run dev` 启动后访问 / 可以看到 morning-town 初始状态
2. ✅ 点击"推进 1 小时"在 30 秒内返回结果
3. ✅ 推进 24 步无崩溃
4. ✅ **性格对立的两组 NPC 在相同事件下行动差异肉眼可辨**：
   - 内向 NPC（张默）选择"独自待在家"，外向 NPC（李欢）选择"上街找人"
   - 高攻击性 NPC（王刚）在偶遇敌人时选择"挑衅"，老李（高稳定）选择"礼貌避开"
5. ✅ 所有 LLM 输出符合 ActionSchema（无解析失败）
6. ✅ events_log 完整记录每个 tick 的所有事件与行动
7. ✅ 内心独白文本可读，且至少 80% 引用了性格特征

---

## 时间分解（10 工作日）

| 日 | 工作内容 |
|---|---|
| D1 | 项目初始化 + 安装依赖 + DB schema |
| D2 | 领域模型 + 种子数据写入 |
| D3 | engine: status-decay + perception |
| D4 | engine: actions + execute |
| D5 | engine: tick 主循环 + 单元测试 |
| D6 | LLM: client + prompt 模板 |
| D7 | LLM: decide + tool-use 调通 |
| D8 | API + 极简 UI |
| D9 | 演示场景调试 + prompt 调优 |
| D10 | 验收 + bug fix + 文档更新 |

---

## 风险与备案

| 风险 | 备案 |
|---|---|
| LLM 输出不稳定 | 早期就引入 Zod 校验 + tool-use；最差降级为"输出文本 + 正则解析" |
| 决策风格趋同 | 在 system prompt 里强制要求"reasoning 中至少引用一项性格维度数值"；并在示例里给出"内向/外向"对比样例 |
| Sonnet 成本超预期 | Stage 1 不接 Haiku，但保留切换接口；测试期每次决策约 $0.005，24 tick × 5 NPC ≈ $0.6/天 |
| prompt 太长 | Stage 1 不引 prompt cache，但保持 system/user 拆分清晰，便于 Stage 2 接入 |
| 单 tick 5 个 NPC 并行慢 | 用 `Promise.all` 并行；Anthropic 默认 RPM 足够 5 NPC |

---

## Stage 1 完成后产出

- 一个可启动的 Next.js 应用
- 一个 5 NPC × 8 节点的 demo world
- 一份"性格差异演示视频"（手动录屏）
- 引擎 + LLM 模块的单元测试覆盖

下一步进入 Stage 2，给玩家"导演"工具。
