# Admin 管理页设计

- **状态**：已确认（2026-05-01 brainstorm 完成）
- **作者**：Claude × 用户
- **关联代码**：`src/app/admin/`、`src/app/api/admin/`、`src/llm/`、`src/db/schema.ts`

## 1. 背景与目标

agent-world 目前没有运维侧界面。LLM 配置只能改 `.env.local` 后重启；想换地图或重置世界要跑 npm 脚本；想看地图配置只能读 JSON。本设计在游戏 UI 之外加一个独立的 `/admin` 路由，提供三块运维能力：

1. **LLM Provider 管理** —— 多协议（OpenAI 兼容 + Anthropic 原生）、多 provider、运行时切换 active。
2. **重置当前世界** —— 保留 maps / characters / providers 配置，删除当前 worldId 的运行时数据，并允许在重置时切换 map / cast。
3. **预览已有地图配置** —— 多地图列表 + 详情（节点树 + 像素地图渲染 + 节点详情卡）。

风格沿用游戏主页的像素 UI（`--color-pixel-*` token、`pixel-frame`、Silkscreen 字体），不引入新视觉语言。

## 2. 路由结构

### 2.1 前端

```
src/app/admin/
├── layout.tsx              admin 共享 layout：顶栏（标题 + 返回游戏链接）+ 左侧 sidebar 导航
├── page.tsx                /admin → redirect /admin/llm
├── llm/
│   ├── page.tsx            provider 列表 + CRUD + 激活 + 测试
│   └── _components/        ProviderForm / ProviderList / ProtocolBadge
├── reset/
│   └── page.tsx            重置当前世界表单
├── maps/
│   ├── page.tsx            地图列表
│   └── [mapId]/page.tsx    地图详情：节点树 + MapStage + 节点详情卡
└── _components/            admin 共享 UI：Sidebar、SectionFrame
```

`/admin` 直接 redirect 到 `/admin/llm`（运维高频）。

### 2.2 API

新增：

| 路径 | 方法 | 用途 |
|---|---|---|
| `/api/admin/providers` | GET | 列出所有 provider，apiKey 字段统一掩码 |
| `/api/admin/providers` | POST | 新建 provider |
| `/api/admin/providers/[id]` | PATCH | 编辑（不传 apiKey 时不动 key） |
| `/api/admin/providers/[id]` | DELETE | 删除（active 不允许删，返 400） |
| `/api/admin/providers/[id]/activate` | POST | 激活 + 触发 LLM 客户端重建 |
| `/api/admin/providers/[id]/test` | POST | 用最小 ping 验证配置（200 总返回，body 携带 ok / error） |
| `/api/admin/world/reset` | POST | 重置当前 world：删除 + `createWorldFromConfig` |
| `/api/configs/maps/[mapId]` | GET | 返回完整 MapConfig（含全部 nodes） |

复用现有：`/api/configs/maps`（列表）、`/api/configs/characters`（角色模板列表）、`/api/worlds/[id]`（snapshot，用于重置表单的预填）。

## 3. LLM Provider 子系统

### 3.1 数据库

`src/db/schema.ts` 新增表：

```ts
export const llmProviders = sqliteTable("llm_providers", {
  id: text("id").primaryKey(),                    // crypto.randomUUID()
  name: text("name").notNull(),                   // 显示名
  protocol: text("protocol").notNull(),           // "openai" | "anthropic"
  baseUrl: text("base_url"),                      // null → SDK 默认
  apiKey: text("api_key").notNull(),              // 明文，仅本地 dev
  model: text("model").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => [
  index("llm_providers_active_idx").on(t.isActive),
]);
```

### 3.2 激活原子性

`activate(id)` 用 `db.transaction` 包裹两步 UPDATE：

```ts
db.transaction((tx) => {
  tx.update(llmProviders).set({ isActive: false }).run();
  tx.update(llmProviders).set({ isActive: true, updatedAt: now() }).where(eq(llmProviders.id, id)).run();
});
```

保证全表只有一行 `isActive=true`。

### 3.3 ENV 兼容迁移

为了不让现有 `.env.local` 用户升级后 LLM 直接停摆：

- 在 `src/db/migrate.ts` CLI 脚本内（即 `npm run db:migrate` 命令），新增 `llm_providers` 表的 `CREATE TABLE IF NOT EXISTS` 后，执行一段 idempotent 兜底逻辑：
  - 读取 `llm_providers` 行数
  - 若为 0，且 `process.env.DEEPSEEK_API_KEY` 非空，则插入：
    ```ts
    {
      id: crypto.randomUUID(),
      name: "DeepSeek (from .env)",
      protocol: "openai",
      baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
      isActive: true,
    }
    ```
- 该逻辑只在"表为空"时触发，多次执行 `npm run db:migrate` 幂等。
- **不在 app 启动时懒加载**：避免 `next dev` / `next start` 路径上做隐式 DB 写入。用户升级流程：拉取代码 → `npm run db:migrate` → 自动迁移完成。

### 3.4 协议抽象

`src/llm/` 重组：

```
src/llm/
├── client.ts            getActiveProvider() 读 DB
├── decide.ts            按 protocol 分发到 adapter
├── prompt.ts            (无变动)
└── protocols/
    ├── types.ts         ProtocolAdapter / ActiveProviderConfig 类型
    ├── openai.ts        openaiAdapter
    └── anthropic.ts     anthropicAdapter
```

**Adapter 接口**：

```ts
export interface ActiveProviderConfig {
  id: string;
  protocol: "openai" | "anthropic";
  baseUrl: string | null;
  apiKey: string;
  model: string;
}

export interface ProtocolAdapter {
  callTool(args: {
    config: ActiveProviderConfig;
    system: string;
    user: string;
    tool: { name: string; description: string; parameters: object };  // JSON Schema
  }): Promise<unknown>;  // 解析后的 tool input，未经 ActionSchema 校验
}
```

**openaiAdapter**：把现 `decide.ts` 中 `chat.completions.create + tools + tool_choice="required" + thinking:disabled` 的代码原样搬入；client 改成 per-call `new OpenAI({ apiKey, baseURL, timeout: 30_000, maxRetries: 1 })`。

**anthropicAdapter**：用 `@anthropic-ai/sdk` 的 `messages.create`：

- `system` 顶层参数（不在 messages 数组里）
- `tools: [{ name, description, input_schema }]`
- `tool_choice: { type: "tool", name }`
- 从 `response.content` 中找 `type === "tool_use"` 的 block，返回其 `input`
- 异常 → 抛标准 Error

**decide.ts 改造后**：

```ts
export const llmDecide: DecideFn = async (input) => {
  const cfg = await getActiveProvider();
  if (!cfg) return waitFallback(input, "未配置 active provider");
  const adapter = cfg.protocol === "openai" ? openaiAdapter : anthropicAdapter;
  const system = buildSystemPrompt({ character: input.character, worldName: input.worldName });
  const user = buildUserPrompt({ character: input.character, here: input.here, companions: input.companions, perceived: input.perceived, options: input.options, tick: input.tick });
  const tool = {
    name: ACTION_TOOL_NAME,
    description: "提交你这一 tick 的行动。type 必须是封闭枚举之一；reasoning 必须显式引用至少一项你自己的性格维度数值。",
    parameters: ActionToolInputSchema,
  };
  try {
    const raw = await adapter.callTool({ config: cfg, system, user, tool });
    const parsed = ActionSchema.safeParse(raw);
    if (!parsed.success) throw new Error(parsed.error.message);
    return payloadToAction(parsed.data, input.character.id);
  } catch (err) {
    return waitFallback(input, errorMessage(err));
  }
};
```

### 3.5 客户端实例化策略

废弃现有 `globalThis.__agent_world_llm__` 单例 + `__setLLMClientForTest`。改成 **per-call 构造 SDK 实例**：每个 adapter 在 `callTool` 内 `new OpenAI(...)` / `new Anthropic(...)`。

理由：
- 1 tick = 5 NPC 决策，per-call 实例化开销 < 1ms
- HMR、多 worker、active 切换之间的一致性问题彻底消除
- 测试用 mock SDK（vi.mock）替换，比 `__setLLMClientForTest` 更标准

### 3.6 UI（`/admin/llm`）

- **列表**：每行 `name · protocol badge · masked key · model`，右侧操作按钮：`[激活●] [测试] [编辑] [删]`
- **新建/编辑表单**字段：
  - `name`（text）
  - `protocol`（radio: openai / anthropic）
  - `baseUrl`（text，可空，placeholder 提示协议默认 URL）
  - `apiKey`（password，编辑模式 placeholder = "保留现有 key"）
  - `model`（text + hint：常用 model 名清单）
- **测试按钮**：调 `/api/admin/providers/[id]/test`，发一组最小假 prompt，断言 SDK 调用不抛异常 + 能解出 `tool_use.input`。UI 显示 `✔ 通过 (xxx ms)` 或 `⚠ 错误：xxx`。
- **掩码**：所有 GET 返回的 `apiKey` 形如 `sk-***1234`（保留末 4 位）。POST/PATCH 接受明文写入，不回显。

### 3.7 API 行为细节

- POST `/api/admin/providers/[id]/activate`：先校验 id 存在 → activate 事务 → 200 返回新 active provider（key 掩码）
- DELETE active provider → 400 `{ error: "cannot delete active provider; switch to another first" }`
- 如果数据库中无任何 provider 且 ENV 也无 key → admin 页显示空状态 + 引导新建；游戏侧 `decide()` 走 wait fallback（与现有"未配置 key"等价）

## 4. 重置世界子系统

### 4.1 API

`POST /api/admin/world/reset`

```ts
// Request
{
  worldId: string,         // 通常 = 当前 URL ?world= 值
  name: string,
  mapId: string,
  cast: [
    { characterId: string, locationId: string }   // vitals 一律归零，不暴露
  ]
}

// Response 201: { worldId, mapId, characterIds, defaultEntryNodeId }
//          400: { error: "invalid body" | "cannot ..." }
//          404: { error: "map not found" | "character template not found" }
//          500: { error: "..." }
```

### 4.2 实现

```ts
db.transaction((tx) => {
  tx.delete(worlds).where(eq(worlds.id, worldId)).run();
  // cascade 自动清 nodes / characters / events_log / agent_thoughts / snapshots
  createWorldFromConfig({ worldId, name, mapId, cast }, tx);  // 改造接受可选 tx
});
```

`createWorldFromConfig` 当前是同步的、用全局 `db` 实例。本次需要让它接受可选 `tx` 参数（fallback 全局 db），保证 reset 整体在单事务内。如果它内部抛错，整个 transaction 自动回滚——避免"删了旧世界但没建成新世界"的中间状态。

### 4.3 UI（`/admin/reset`）

- 页面打开时调 `/api/worlds/[id]`（已有）拿当前 snapshot，预填表单：
  - 世界名称 = 当前 name
  - 地图下拉 = 当前 mapId
  - cast 勾选状态 = 当前 5 人，每人位置 = 当前 locationId
- 切换地图下拉时，调 `/api/configs/maps/[mapId]` 拿新地图 nodes，重新渲染 cast 行的位置下拉，**强制清空之前选择**让用户重选。
- 「重置世界」按钮二次确认：点击后按钮变红，文案变「再次点击确认」，3 秒内未再点则恢复。
- 提交成功后 toast `✓ 已重置`，redirect 回 `/?world=<id>`。

### 4.4 当前 worldId 的来源

读 `searchParams.get("world")` ⤜ `DEFAULT_WORLD_ID = "world-morning-town"`。把这段 fallback 逻辑从 `use-world-state.ts` 抽到 `_lib/world-id.ts`，在 admin layout 的 React context 里提供，让 `/admin/reset` 直接消费。

## 5. 地图预览子系统

### 5.1 API

`GET /api/configs/maps/[mapId]`

```ts
// 200
{ id, name, description, nodes: MapNode[] }

// 404
{ error: "map not found" }
```

实现：在 `src/config/loader.ts` 中新增 `loadMapById(mapId)`，从 `configs/maps/${mapId}.json` 读、过 schema 校验。

### 5.2 列表页（`/admin/maps`）

调 `/api/configs/maps`（已有，已返回 id / name / description / nodeCount / entries），渲染卡片列表，每张卡片有「预览 →」按钮跳 `/admin/maps/[mapId]`。

### 5.3 详情页（`/admin/maps/[mapId]`）

布局复用主页 dashboard 的三列网格：

```
┌──────────────┬──────────────────────────┬──────────────┐
│ 节点树       │ MapStage（像素画布）     │ 节点详情卡  │
└──────────────┴──────────────────────────┴──────────────┘
```

- **节点树（左）**：新组件 `_components/map-tree.tsx`，递归渲染，节点带图标（entry / 私密锁）。点击 → 切换 currentNodeId + 选中 detail。
- **MapStage（中）**：直接复用 `src/app/_components/map-stage.tsx`：
  - `characters` 传 `[]`
  - `selectedCharacterId` 传 `null`
  - `onSelectCharacter` 传 `() => {}`
  - `onEnterNode` 同步选中节点树该项
- **节点详情卡（右）**：新组件 `_components/node-detail-pane.tsx`，纯展示当前选中节点的所有字段：name / id / parentId / description / privacy / capacity / tags / isEntry / shortcuts / spriteKey / x,y,w,h。

URL 不持久化 currentNodeId（React state，刷新回到 entry 节点）。

## 6. 错误处理与边界情况

| 场景 | 行为 |
|---|---|
| 无 active provider 时调 `decide()` | wait fallback `reasoning="未配置 active provider"` |
| 删 active provider | 400 `cannot delete active provider; switch to another first` |
| DB 0 provider + ENV 有 key | 启动迁移自动建一条 active=true |
| DB 0 provider + ENV 无 key | admin 页空状态引导新建；游戏侧 wait fallback |
| 重置时 worldId 不存在 | DELETE 影响 0 行不报错，createWorldFromConfig 当首次创建处理（幂等） |
| 重置时 mapId / characterId 不存在 | 404，事务回滚，旧世界保留 |
| 重置时 locationId 不在新 map | 400，事务回滚，旧世界保留 |
| Anthropic 调用 schema 不匹配 | adapter 抛 Error → 外层 catch → wait fallback |
| 测试 ping baseUrl/key 错 | API 200 返回 `{ ok: false, error }`，前端展示 `⚠ 错误：...` |
| Provider 切换瞬间正在跑 tick | 进行中的请求用旧 provider，下一个请求才用新——可接受 |

## 7. 测试

### 7.1 单元测试（vitest）

- `src/llm/protocols/openai.test.ts`：mock `OpenAI`，断言 `chat.completions.create` 入参（messages/tools/tool_choice/thinking 关闭）；断言能从 `tool_calls` 提取 args。
- `src/llm/protocols/anthropic.test.ts`：mock `@anthropic-ai/sdk`，断言 `messages.create` 入参（system 顶层、tool_choice forced）；断言从 `content[].tool_use.input` 提取 args。
- `src/llm/decide.test.ts`：保留现 e2e 形态，但改成 mock `getActiveProvider` + mock 两个 adapter `callTool`。
- `src/db/llm-providers.test.ts`：activate 事务后只剩一行 active；删 active 抛错；ENV-fallback 迁移幂等。
- `src/app/api/admin/world/reset.test.ts`：seed 一份世界 → POST reset 改 mapId → 断言新 nodes 是新 map、events 表清空、新世界 tick=0。

### 7.2 手动验证

- 新建 OpenAI 兼容 provider（DeepSeek） + 测试通过 + 激活 + 推进游戏一步成功
- 新建 Anthropic provider（Claude）+ 测试通过 + 激活 + 推进游戏一步成功
- 重置：保持当前配置、切 map、切 cast 三种路径
- 地图预览：列表 → 详情 → 节点树点击 → MapStage 同步

不引入前端测试框架。

## 8. 依赖变更

- `package.json` 新增 `@anthropic-ai/sdk`（最新稳定版）
- provider id 用 `crypto.randomUUID()`（Node 20+ 自带），不引入新依赖

## 9. 不在本设计范围内（YAGNI）

- 多用户 / 鉴权（本地 dev 工具）
- API key 加密存储（明文 OK，仅本地）
- Provider 配置导入/导出
- 地图配置编辑（只读预览）
- 节点详情页 deep-link（`?node=xxx` 参数）
- MapStage 添加"play / preview" mode 开关——目前直接复用，未来若有冲突再拆

## 10. 实现顺序建议（供后续 plan 参考）

1. DB schema + migration + ENV-fallback 迁移
2. Protocol adapter 抽象 + 把 OpenAI 路径搬过去（保持游戏可跑）
3. Anthropic adapter
4. `/api/admin/providers/*` API
5. `/admin/llm` UI
6. `/api/admin/world/reset` + 让 `createWorldFromConfig` 接 tx 参数
7. `/admin/reset` UI
8. `/api/configs/maps/[mapId]` + `loadMapById`
9. `/admin/maps` + `/admin/maps/[mapId]` UI
10. admin layout / sidebar / `/admin` redirect / `_lib/world-id.ts` 抽取
