# World 运行页面重设计 spec

## 概述

废弃旧版 `Dashboard` 的 game-pixel 风格 3-column 网格布局，按 hub 的 frosted glass 风格重做 `/world/:id` 页面。仅保留 4 项核心功能：人物列表、人物 Profile、事件流、甘特图。

## 路由

```
/world/:id  →  WorldViewPage  →  WorldView（新组件，替换 Dashboard）
```

`App.tsx` 中路由不变，`WorldViewPage` 内部组件替换。

## 布局结构

双栏固定视口，**无浏览器级滚动条**（100vw × 100vh overflow:hidden）：

```
┌──────────────────┬──────────────────────────────────┐
│                  │  [事件流] [甘特图]                 │
│   人物列表        │                                  │
│                  │      事件流 / 甘特图               │
│   🐱 黑猫 发呆..  │                                  │
│   🐰 小白兔 走向.. │     （Profile 从右侧滑入覆盖此区）  │
│   🐻 大熊 吃午饭  │                                  │
│                  │                                  │
│                  │                                  │
├──────────────────┤                                  │
│ Tick 42  第3天   │                                  │
│ [步进一次] ⊘无限  │                                  │
│           42ms   │                                  │
└──────────────────┴──────────────────────────────────┘
          260px                      1fr
```

- **左栏** 260px flex-shrink:0：人物列表（flex:1 溢出滚动）+ Tick 控制（flex-shrink:0）
- **右栏** flex:1 min-width:0：Tab 栏 + 内容区 + Profile overlay

## 组件设计

### 新增

| 组件 | 文件 | 职责 |
|------|------|------|
| `WorldView` | `components/world-view.tsx` | 替换 `Dashboard`，编排左右两栏 + Profile 状态 |
| `CharacterList` | `components/character-list.tsx` | 左栏人物列表，每项展示 emoji + 名字 + 当前行动标签 |
| `TickControl` | `components/tick-control.tsx` | 左栏底部控制区：Tick 显示 + 步进按钮 + 无限运行 Toggle |

### 复用（改 UI 风格）

| 组件 | 文件 | 改动 |
|------|------|------|
| `EventStream` | `components/event-stream.tsx` | 内部逻辑不变，外层容器和事件卡片改为 frosted glass |
| `EventCard` | `components/event-card.tsx` | `.ev-card` 等 game-pixel 样式 → hub glass 样式 |
| `EventGantt` | `components/event-gantt.tsx` | 内部逻辑不变，容器和卡片改为 frosted glass |
| `GanttCard` / `GanttRow` / `GanttTimeline` / `GanttPopup` | 对应文件 | 样式迁移到 glass，逻辑不动 |
| `ProfilePane` | `components/profile-pane.tsx` | 复用 Tab 内容逻辑，外层改为滑入面板 |

### 删除

| 文件 | 原因 |
|------|------|
| `components/dashboard.tsx` | 被 `WorldView` 取代 |
| `components/tree-sidebar.tsx` | 树状侧栏废弃 |
| `components/relation-graph.tsx` | 关系图不在保留范围 |
| `components/map-stage.tsx` | 小地图废弃 |
| `components/top-bar.tsx` | 顶栏废弃 |
| `components/pixel-frame.tsx` | game-pixel 装饰容器不再使用 |
| `components/replay-mode.tsx` | 已为空桩 |
| `components/events-pane.tsx` | 旧事件面板，未使用 |
| `components/tick-bar.tsx` | 被 `TickControl` 取代 |

### 不需要动的

| 组件/文件 | 原因 |
|------|------|
| `hooks/use-world-state.ts` | 数据层不变 |
| `hooks/use-view-state.ts` | 选中角色状态不变 |
| `hooks/use-follow.ts` | Follow 模式不变 |
| `lib/world.ts`, `lib/api.ts`, `lib/format.ts`, `lib/gantt-utils.ts` | 工具函数不变 |
| 所有 hub 组件 | 不在改动范围 |

## 组件细节

### WorldView

- 获取 `useWorldState()`、`useViewState()`、`useFollow()` 的返回值
- 管理 `profileCharacterId: string | null`（null = 无 Profile / 滑出）
- 点击人物 → 设置 profileCharacterId；再次点击同一人物 → 设为 null
- 左栏 `<CharacterList>` + `<TickControl>`，右栏 tab 容器 + `<ProfilePane>` overlay

### CharacterList

Props: characters, selectedCharacterId, onSelect, onFollow, events（用于提取当前 action）

每项渲染：
```tsx
<div class="flex items-center justify-between px-3 py-2 rounded border border-white/5 bg-white/[0.04]">
  <span>{emoji} {name}</span>
  <span class="text-[9px] bg-white/10 rounded px-1.5 py-0.5 max-w-[84px] truncate">
    {currentAction}
  </span>
</div>
```
- 选中项：`border-(--accent-strong) bg-(--accent-strong)/8`
- 当前 action 从角色 `lastThought.action` 或最新相关事件中提取
- 列表内部 `overflow-y: auto`

### TickControl

```
┌─────────────────────────┐
│ Tick 42      第3天 08:24│
│ [    步进一次    ] ⊘无限│
│                   42ms  │
└─────────────────────────┘
```

Props: tick, epoch, loading, onAdvance, autoMode, onStartAuto, onStopAuto, lastTickMs

- Toggle 关闭（停止态）：开关灰色在左，"无限运行" 标签 dimmed
- Toggle 打开（运行态）：开关绿色在右，标签 "运行中" 绿色，步进按钮 disabled
- `autoMode` 中调用 `onStopAuto` 即立刻停止
- 样式：半透明底 `bg-black/20`，上边框 `border-white/10`

### EventStream（样式迁移）

- 外层容器：`bg-black/25 backdrop-blur-md`，圆角，`border-white/10`
- 事件卡片 `.ev-card` → `.event-glass-card`：
  ```css
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
  ```
- 选中/重要态用 accent 变体（`rgba(255,205,128,0.15)` border, 背景）
- tick separator 保持，颜色改为 `white/20`

### EventGantt（样式迁移）

- 容器同 EventStream 玻璃风格
- 卡片 `.gantt-card` → 玻璃卡片
- 时间轴线颜色改为 `white/10`

### ProfilePane（侧滑）

- 从右侧 CSS transition（`transform: translateX(0)` / `translateX(100%)`），duration 250ms ease
- 宽度为右栏的 ~85%，带 `backdrop-blur-xl` + `bg-black/50`
- 左边缘 `border-l border-white/10` + `shadow-[-4px_0_24px_rgba(0,0,0,0.4)]`
- 四个 Tab 内容逻辑复用现有 ProfilePane 内部实现

## 数据流

不变。`useWorldState`、`useViewState`、`useFollow` 三个 hook 保持不变：

```
useWorldState() ──→ snapshot, events, advance, autoMode, ...
useViewState() ──→ selectedCharacterId, currentNodeId
useFollow()    ──→ followingId, follow, clearFollow
```

## 样式策略

- **新增工具类**（`globals.css` 追加或组件内 Tailwind）：
  - `.glass-panel`：frosted glass 面板容器
  - `.glass-card`：玻璃风格卡片
  - `.event-glass-card` / `.event-glass-card--important`：事件卡片变体
- **删除样式**：`.pixel-frame`、`.pixel-frame--accent`、`.pixel-frame--danger` 若无其他使用者可清理（检查 MapStage 引用）
- **色调**：沿用 hub 的半透明黑底 + white/10 边框 + accent 高亮，不引入新 token

## 实现顺序

1. 创建 `WorldView` + `CharacterList` + `TickControl`，替换 `WorldViewPage` 中的 `Dashboard`
2. 迁移 EventStream / EventCard 样式到 glass
3. 迁移 EventGantt / GanttCard / GanttRow / GanttTimeline / GanttPopup 样式到 glass
4. 改造 ProfilePane 为侧滑面板
5. 删除废弃组件和样式
6. 验证 `/world/:id` 功能完整（步进、自动、事件流、甘特图、Profile、角色切换）
