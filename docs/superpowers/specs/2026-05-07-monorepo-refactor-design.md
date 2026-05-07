# Monorepo 全量重构设计

## 目标

前端后端分离，以 pnpm workspaces monorepo 组织目录结构。分离基于规则的游戏逻辑和 LLM 驱动的角色行为逻辑，提高代码可读性和可维护性。

## 技术选型

| 层面 | 选择 |
|------|------|
| Monorepo 工具 | pnpm workspaces |
| 前端 | Next.js 16 (App Router) + React 19 + Tailwind 4 |
| 后端 | Fastify (独立 Node.js 服务) |
| 数据库 | SQLite + Drizzle ORM |
| 测试 | Vitest |

## 目录结构

```
agent-world/
├── packages/
│   ├── domain/              # 领域类型、枚举、Action/Event 接口（零依赖）
│   ├── shared/              # 共享工具（logger）
│   ├── db/                  # 数据访问层（Drizzle schema、migrations、repository）
│   ├── systems/             # 规则驱动的游戏逻辑（不调用 LLM）
│   └── llm/                 # LLM 驱动的角色行为（prompt、决策、对话、思考）
├── apps/
│   ├── web/                 # Next.js 前端（纯 UI，通过 HTTP 消费 server）
│   └── server/              # Fastify 后端（编排 systems + llm + db，暴露 API）
├── configs/                 # 地图/角色/行为 JSON 配置（保持不变）
├── scripts/                 # 运维脚本
├── pnpm-workspace.yaml
└── package.json
```

### 依赖方向（单向）

```
domain ← shared ← db ← systems ← llm ← server
                                    web (HTTP only → server)
```

## 各包职责

### packages/domain/

从 `src/domain/` 迁移。内容最稳定，零内部依赖。

- `types.ts` — Character, MapNode, Action, WorldEvent, Memory, Emotion, Vitals, Conversation, ThinkSession 等所有领域类型
- `enums.ts` — 所有枚举常量
- `action-system.ts` — ActionDefinition, ActionContext, ActionRegistry, Outcome, StateChange 接口 + 全局 actionRegistry 单例
- `events.ts` — GlobalEventDef 接口 + getActiveEvents()
- `schemas.ts` — Zod schemas（LLM tool output 校验用）

ActionDefinition 是 systems 和 llm 之间的核心契约：
- systems 通过 ActionRegistry.buildOptions(ctx) 提供可选行动列表
- llm 通过 ActionRegistry.get(type) 查找定义并构造 tool schema
- ActionRegistry 单例放在 domain，同时被 systems/actions-builtin 和 llm/decide 使用

### packages/shared/

从 `src/util/` 迁移。

- `logger.ts` — 结构化日志

### packages/db/

从 `src/db/` 迁移。新增 repository 层封装 CRUD。

- `schema.ts` — Drizzle schema（worlds, nodes, characters, events_log, agent_thoughts, snapshots, llm_providers, llm_entry_configs, transactions, conversations, think_sessions, notebook_entries）
- `migrate.ts` — 迁移入口
- `migrations/` — SQL 迁移文件
- `repository/` — 每表一个 repository 文件，封装 JSON 序列化/反序列化和 SQL 操作

### packages/systems/

从 `src/engine/` 提取规则逻辑，**不含任何 LLM 调用**。

- `vitals-emotion.ts` — vitals 衰减、emotion 演化、疾病检查（纯函数，输入 state 输出 delta）
- `pathfinding.ts` — BFS 寻路
- `perception.ts` — 事件感知分发（角色在节点能看到哪些事件）
- `economy.ts` — 经济系统（生存成本计算、经济快照更新）
- `bme.ts` — 社交满足度衰减/增长系数
- `facts.ts` — 从 tick 状态派生 AggregatedFacts（供 llm 构造 prompt 上下文）
- `actions-builtin.ts` — 内建 action 注册（sleep, move, eat, work, look_around, talk 等）
- `actions.ts` — buildActionContext() + getAvailableActions()（LLM 决策前构造上下文和可选行动列表）
- `execute.ts` — executeActions() + applyStateChange()（纯状态改写，无 LLM）
- `notebook.ts` — 记事本到期检查、条目描述生成（CRUD 在 db 层）
- `memory-compression.ts` — memory 压缩编排（压缩策略/阈值/触发条件，LLM 调用通过回调注入）
- `layout.ts` — 节点自动布局算法
- `store.ts` — loadWorld / saveWorld / persistSnapshot（纯 DB 读写，不含 LLM）
- `config/` — 从 `src/config/` 迁移（loader.ts, mod-loader.ts, event-loader.ts, schemas.ts, types.ts），负责读取 `configs/` 下的 JSON 文件

### packages/llm/

从 `src/llm/` 迁移，加上从 `src/engine/` 提取的 LLM 调用逻辑。

- `client.ts` + `providers.ts` — LLM 客户端和 provider 管理
- `prompt.ts` — system prompt（世界规则 + 角色画像）和 user prompt（时间 + 位置 + 同伴 + 事件 + 记忆 + 行动列表）构造
- `decide.ts` — llmDecide() 主决策函数
- `dialog.ts` — 对话处理（runDialogPhase, llmDialogTurn, llmAcceptDecide, llmDialogSummarize, llmDialogPersonalMemory, llmSalvageDecide）
- `think-sessions.ts` — 思考会话处理（llmThink 调用 + turn 管理）
- `memory-compression-llm.ts` — memory 压缩的 LLM 调用部分

### apps/server/

tick 主循环作为编排逻辑放在这里。这是唯一同时依赖 systems、llm、db 的包。

- `tick.ts` — 主循环编排（薄编排层，~200 行）：
  1. 调用 systems 做 vitals + emotion 衰减
  2. 调用 systems 做感知分发
  3. 遍历角色 → 调用 llm 做并行决策
  4. 调用 llm 做对话 + 思考（与决策互斥角色并行的独立阶段）
  5. 调用 systems 执行行动
  6. 调用 systems 做关系管理 + 经济更新 + memory compression
  7. 通过 db 持久化
- `router.ts` — Fastify 路由注册
- `sse.ts` — SSE 推送端点

### apps/web/

当前 `src/app/` 的前端部分，删除所有 API routes。

- 页面和布局组件
- `_components/` — 全部 UI 组件
- `_hooks/` — React hooks
- `_lib/api.ts` — HTTP 客户端，指向 Fastify 后端

## API 设计

前端通过 HTTP 消费后端，不直接访问 SQLite：

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | /api/worlds | 世界列表 |
| POST | /api/worlds | 创建世界 |
| GET | /api/worlds/:id | 世界快照 |
| POST | /api/worlds/:id/tick | 推进一 tick（SSE 流式响应） |
| GET | /api/worlds/:id/characters | 角色列表 |
| GET | /api/worlds/:id/characters/:cid | 单角色详情 |
| POST | /api/worlds/:id/characters/place | 投放新角色 |
| GET | /api/worlds/:id/events | 事件流 |
| GET | /api/configs/characters | 可用角色模板 |
| GET | /api/configs/maps | 可用地图 |
| * | /api/admin/* | 管理端点 |

SSE 推送格式：
```
event: decision
data: {"characterId":"...","characterName":"...","action":{...}}

event: tick-complete
data: {"fromTick":42,"toTick":43,"events":[...]}
```

## 迁移策略

分 6 个阶段，每阶段保持可运行：

1. **建立骨架** — 初始化 pnpm workspaces，创建 domain + shared 包，创建 server 骨架
2. **拆出 DB 层** — 迁移 schema + migrations + repository，旧路径改为 re-export
3. **拆出 systems** — 逐个迁移规则逻辑文件，每步跑测试
4. **拆出 llm** — 迁移 prompt/decide/dialog/think-sessions
5. **建立 server 编排层** — 重写 tick.ts，迁移 API routes 到 Fastify
6. **清理** — 删除 web 中 API routes，删除旧冗余代码，统一 tsconfig

每个迁移步骤完成后运行 `vitest run` 确认不回归。

## 测试策略

- systems 中规则逻辑设计为纯函数，不依赖 DB 或网络，单元测试覆盖 100%
- llm 中 LLM 调用通过依赖注入 mock，保持当前 dialog-give.test.ts 风格
- 阶段 5 完成后添加端到端 API 测试（Fastify inject() 方法）
