# 前端重设计 spec — 封面 + 世界管理 + LLM 配置

## 概述

为期一页的前端入口重新设计。现有 `/` 直接加载 Dashboard、`/admin` 隐藏管理的结构废弃，替换为：
- `/` — 像素风封面
- `/hub` — 世界管理中心（Mod 展示 / 世界实例 / LLM 配置）
- `/world/:id` — 现有 Dashboard（基本不动）

同时解耦后端 "一个 Mod = 一个 World" 的限制。

## 路由结构

```
/              → CoverPage（像素风封面，可重复进入）
/hub           → HubLayout（左导航 + 内容区）
  /hub/mods    → ModGallery（Mod 展示卡片，每行 4 个）
  /hub/worlds  → WorldsPanel（左 Mod 列表 + 右世界实例）
  /hub/llm     → LLMConfig（Provider 管理 + Entry Thinking 配置）
/world/:id     → WorldView（现有 Dashboard，基本不动）
```

**页面流转**：
- `/` 点击 "ENTER WORLD" → `/hub/mods`
- Mod 卡片点击 → `/hub/worlds?mod=<modId>`（自动选中该 Mod）
- `/hub/worlds` 中点击实例的"进入" → `/world/:id`
- 侧栏底部 Home 图标 → `/`（封面）
- 侧栏三个导航图标在 `/hub/*` 之间切换

**路由实现**：
- `react-router-dom` v7，嵌套路由
- `App.tsx` 改为三层 route：
  ```tsx
  <Routes>
    <Route path="/" element={<CoverPage />} />
    <Route path="/hub" element={<HubLayout />}>
      <Route index element={<Navigate to="/hub/mods" />} />
      <Route path="mods" element={<ModGallery />} />
      <Route path="worlds" element={<WorldsPanel />} />
      <Route path="llm" element={<LLMConfig />} />
    </Route>
    <Route path="/world/:id" element={<WorldView />} />
  </Routes>
  ```
- `HubLayout` 使用 `<Outlet />` 渲染子路由
- 旧 `/admin` 路由移除

## 组件设计

### 新增组件（`frontend/src/components/`）

| 组件 | 职责 |
|------|------|
| `CoverPage` | 全屏像素风封面，标题 + ENTER WORLD 按钮，CSS 动画（星光闪烁、窗灯明灭、月亮辉光） |
| `HubLayout` | 56px 左侧图标导航栏 + `<Outlet />` 内容区。导航项：🎭 Mods / 🌍 Worlds / ⚡ LLM / 🏠 Home（底部） |
| `ModGallery` | 4 列 Mod 卡片 grid，每卡左侧毛玻璃遮罩 55% + 右侧背景透出，宽扁形状（~130px 高），列 gap 20px，行 gap 64px |
| `ModCard` | 单张 Mod 卡片。背景色取自 manifest（或随机渐变），毛玻璃区显示标题、语言、角色数、简介（最多 2 行） |
| `WorldsPanel` | 双栏：左 280px Mod 列表 + 右世界实例列表。URL `?mod=` query 控制选中 |
| `WorldInstanceCard` | 单张实例卡片。状态灯（绿/灰/橙）+ 名称 + Tick + 角色数 + 创建日期 + 进入/删除按钮 |
| `LLMConfig` | Provider 管理 + Entry Thinking 配置，单页上下排布 |

### 现有组件改动

| 组件 | 改动 |
|------|------|
| `App.tsx` | 路由重写，三层嵌套 |
| `dashboard.tsx` | 基本不动，作为 `WorldView` 使用。中心 tab 去掉"地图预览"（3 个 tab 保留：事件流、甘特图、关系图），Minimap（MapStage）保留 |
| `use-world-state.ts` | 从 `useSearchParams`(`?world=<id>`) 改为 `useParams`(`/world/:id`)，API 调用路径不变 |
| `admin.tsx` | **删除**（功能迁移到 HubLayout 各子页面） |

### 组件树

```
App
├── CoverPage          (/)
├── HubLayout          (/hub/*)
│   ├── Sidebar        (56px 左导航)
│   ├── ModGallery     (/hub/mods)
│   │   └── ModCard[]
│   ├── WorldsPanel    (/hub/worlds)
│   │   ├── ModList
│   │   └── WorldInstanceCard[]
│   └── LLMConfig      (/hub/llm)
│       ├── ProviderSection
│       └── EntryConfigTable
└── WorldView          (/world/:id) — 现有 Dashboard
    ├── TopBar
    ├── TreeSidebar
    ├── EventStream / MapStage / EventGantt / RelationGraph
    ├── ProfilePane
    └── TickBar
```

## 数据流

### 现有 API 复用

| 端点 | 用途 | 变更 |
|------|------|------|
| `GET /api/configs/maps` | Mod 列表（gallery） | 无 |
| `GET /api/worlds` | 世界实例列表 | 无（已有 `listWorlds`） |
| `GET /api/admin/providers` | Provider 列表 | 无 |
| `GET /api/admin/entry-configs` | Entry Thinking 配置 | 无 |
| `POST /api/worlds` | 新建世界实例 | 需改 — worldId 接受用户指定或自动生成 |
| `DELETE /api/worlds/:id` | 删除世界实例 | 无 |
| `GET /api/worlds/:id` | 进入世界（Dashboard 用） | 无 |
| `GET /api/admin/map-packs` | 原 admin 地图包列表 | 保留但简化（不再需要 map preview 数据） |

### 新增/修改 API

1. **`POST /api/worlds`** — CreateWorldBody 必须允许传入自定义 `worldId`（nanoid），不再从 mapId 派生
2. **`GET /api/worlds?mapId=<mapId>`** — 可选的 mapId 过滤，用于 WorldsPanel 左栏选中 Mod 后查实例

### 前端数据获取

- **ModGallery**: `useEffect` → `GET /api/configs/maps`，取 `{ id, name, description, language, characterCount }` 渲染卡片
- **WorldsPanel**: `GET /api/configs/maps`（左栏）+ `GET /api/worlds`（右栏，按选中 Mod 的 mapId 过滤）
- **LLMConfig**: `GET /api/admin/providers` + `GET /api/admin/entry-configs`

## 后端改动

### World ID 解耦

**现状**：`backend/src/server/routes/admin.ts` 中：
```ts
const worldId = `${WORLD_ID_PREFIX}-${mapId}`; // "world-ouran-academy"
```
一个 mapId 只能对应一个 world 实例。

**改为**：
- `POST /api/worlds` 接受 `worldId` 参数（必填，前端生成 nanoid）
- `POST /api/admin/worlds/load` 废弃或改为批量创建
- `worlds` 表 `map_id` 列已存在，无需加字段
- 唯一约束从 `(id)` 已足够，不再隐式要求 `map_id` 唯一

### 不需要的改动

- `characters` 表无需改动（角色实例化流程不变）
- `nodes` 表无需改动
- LLM provider / entry config 表无需改动
- 无需新增数据表

### 可移除

- `GET /api/admin/maps/:id` — 地图预览详情（不再使用）
- 前端 `MapStage` 组件保留（Dashboard 内部用），仅移除 admin 的"地图预览"tab

## 样式策略

**沿用现有体系**，不引入新的设计系统：

- CSS 变量 tokens：`--frame`、`--panel`、`--border`、`--accent`、`--danger` 等（`globals.css`）
- `.pixel-frame` / `.pixel-frame--accent` 等卡片容器类
- Tailwind v4 工具类用于布局（flex、grid、gap 等）
- 字体：现有 monospace/pixel 字体栈（`.text-pixel-*`）
- 暗色主题为主（Agent World 的基调），亮色主题保留兼容

**新增样式**（`globals.css` 追加）：
- `.mod-card` — Mod 卡片容器（毛玻璃遮罩 + 背景）
- `.instance-card` — 世界实例卡片
- `.sidebar-icon` — 侧栏图标状态
- `.cover-overlay` — 封面毛玻璃按钮底板
- 封面像素画用 pure CSS `box-shadow` 像素块实现（或引入一张 PNG 素材作为背景）

## 不需要的功能

- **地图预览**（`/admin` 的 maps tab）— 完全移除
- **旧 Admin 页面** — 整个 `routes/admin.tsx` 删除
- **InjectDrawer** — 当前已是 placeholder，删除

## 风险与约束

1. **数据库迁移** — World ID 生成逻辑改变不影响现有数据，`map_id` 列不变
2. **Dashboard 兼容** — `/world/:id` 路由不变，现有 Dashboard 逻辑不需要改动
3. **SSE tick 流** — `useWorldState` hook 中的 SSE 逻辑不变，仅调用方式从 `?world=<id>` 变为路由参数 `:id`
4. **后端路由冲突** — Character routes 也挂载在 `/api/worlds` 下，修改 `POST /api/worlds` 时注意不影响 `POST /api/worlds/:id/characters`

## 实现顺序

1. 后端：World ID 解耦（`POST /api/worlds` 改为接受自定义 worldId）
2. 前端：路由重写（`App.tsx`）
3. 前端：`HubLayout` + 侧栏导航
4. 前端：`CoverPage`
5. 前端：`ModGallery` + `ModCard`
6. 前端：`WorldsPanel` + `WorldInstanceCard`
7. 前端：`LLMConfig`
8. 清理：删除 `admin.tsx`、移除地图预览相关代码
9. 验证：`/world/:id` Dashboard 正常运行
