# UI 重设计 — 烛光夜读主题 + 事件流主体布局

- 创建时间：2026-05-02
- 范围：`src/app/globals.css` 全面重写 token + 主屏布局重做（`dashboard.tsx` 及其子组件）+ 主题切换基础设施 + 中文字体加载 + 新增若干占位组件入口
- 不在范围：关系图谱 / 内心独白 / 历史回放 / 事件投放抽屉的**业务逻辑**实现（本次仅落地 UI 入口与占位）；移动端布局；i18n；高对比主题；`/admin` 编辑器内部页面；后端 schema；引擎逻辑

---

## 背景

用户在使用过程中反馈三条主要 UI 不适：

1. **太暗**：当前默认背景 `#0e1018`、面板 `#1b1d2a`，长时间观察 NPC 行为时眼睛累
2. **字太小**：现有 type scale `text-game-2xs`(11) / `xs`(12) / `sm`(13) / `base`(14) / `lg`(17) / `xl`(22) — 中文在 11-13px 段不舒服
3. **颜色不好分辨**：accent / muted / 状态色相互之间在低饱和暗背景下区分度低

根因审计后发现两个深层问题：

- **字体回退链断裂**：`layout.tsx` 装载的 `Silkscreen` 不支持 CJK，CSS `font-family` 一路 fallback 到 `Courier New`，Windows 上 Courier 中文渲染粗糙——所有"中文体验"的根源都在这里
- **像素调色板未为长文阅读优化**：当前 panel 是低对比深紫蓝，文字是 `#e9e6cf` 偏冷米；适合"游戏 HUD"但不适合"读 NPC 独白 / 经历这种长文"——而 agent-world 产品定位（来自 memory `project_agent_world.md`）就是"导演/观察者"，长文阅读是核心场景

此外，当前主屏布局（`dashboard.tsx` 中 480 / 1fr / 360 三栏 + 顶部 bar）也有结构问题：

- 事件流被压在右栏 360px，但事件流是 LLM-as-NPC 涌现剧情的主要呈现媒介，**应当是主体**而非侧栏
- 角色档案在左下高度被挤掉一半（`flex-[0_0_45%]`）
- 没有时间控件 / 速度档 / 历史回放 / 事件投放抽屉等 spec 5、9 章列出的核心入口
- 没有跨地点跳转（spec §1.2）所需的层级树
- 没有跟随指示（spec §4.4）

本次设计同时解决"皮 + 布局 + 字体 + 主题"四个层面，作为一次完整的 UI 重设计。

---

## 决策摘要

| 维度 | 选择 | 替代 / 来由 |
|---|---|---|
| 视觉家族 | 像素游戏风（保留是硬约束） | 用户明确否决转向衬线 / 仪表盘等方向 |
| 调色板 | **V3 烛光夜读** + **浅色 parchment 作为默认** | 用户最终选 B：默认浅色 + 暗主题作为可切换副选 |
| 字体策略 | **T3** = Silkscreen（chrome）+ Noto Sans SC（中文正文） | 解决 Courier 回退的中文糊化问题 |
| 主屏布局 | **L3-v3** — 事件流为中央主体；地图缩为右上 minimap；角色档案在右下 | 用户原话："事件流是主体，能够给更多的视觉占比" |
| 收纳哲学 | 折叠（树）+ tab（minimap / 角色 / view-mode / filter）+ drawer（事件投放）+ 独立路由（编辑器） | 用户原话："太多了，希望能折叠或者切 tab 显得整洁一些" |

**与 spec §9.2 的偏离**：spec 写"暗色为默认"；本次用户主动改为浅色为默认（"先做亮的"），暗色 V3 为可切换副选。这是有意的偏离，记录在此。

**与 spec §1 视图清单的对应**：1.1 World Overview = 主屏整体；1.2 Map Detail = 右上 minimap + tree 跳转；1.3 Character Detail = 右下 character-section；1.4 Event Stream = 中央 stream（主体）；1.5 关系图谱 = minimap tab 切换；1.6 内心独白 = character-section tab；1.7 编辑器 = `/admin` 独立路由；1.8 历史回放 = 底部时间条 mode-toggle；1.9 事件投放 = ⚡ FAB / 底部按钮 / 快捷键 E 触发的 drawer。

---

## 设计 token

所有 token 通过 CSS 变量定义。`<html data-theme="light|dark">` 作开关，body 不再硬编码颜色。

### 共享 token（与主题无关）

```css
/* 字号 scale，所有像素 chrome / 数字 / 标签用 px，长文用 px 但语义化 */
--font-pixel-2xs: 9px;     /* 极小标签：tab letter-spacing 后 */
--font-pixel-xs:  10px;    /* 时间戳、tab 文字 */
--font-pixel-sm:  11px;    /* chrome 标题 */
--font-pixel-md:  12px;    /* 较强 chrome（bottom 控件按钮）*/
--font-pixel-lg:  13px;    /* world title */

--font-body-xs:   12px;    /* 树 item / minimap 标注 */
--font-body-sm:   13px;    /* 二级正文（事件 actor 行）*/
--font-body-md:   14px;    /* 默认正文（事件卡 .what）*/
--font-body-lg:   16px;    /* 长文阅读模式 */
--font-display-sm: 18px;   /* 角色名 */
--font-display-md: 22px;   /* 大标题 / 重要数字 */

--lh-tight: 1.3;
--lh-normal: 1.6;
--lh-loose: 1.75;          /* 长独白 */

--letter-pixel: 0.18em;    /* 像素 chrome 标准间距 */
--letter-pixel-tight: 0.1em;

/* 间距 */
--sp-1: 4px;
--sp-2: 6px;
--sp-3: 8px;
--sp-4: 10px;
--sp-5: 12px;
--sp-6: 14px;
--sp-7: 16px;
--sp-8: 20px;
--sp-9: 24px;

/* 像素双层边框工具变量 — 各主题下 border / inner 颜色不同但结构一致 */
--ring-1: 1px;
--ring-2: 2px;
--ring-3: 3px;
```

### 浅色（默认）

```css
:root[data-theme="light"], :root {
  --frame:        #e6d5b0;  /* 牛皮纸外壳 */
  --frame-2:      #ddc9a0;  /* 树 / minimap section bg */
  --chrome:       #c4a574;  /* 顶/底/侧栏 header 渐变中色 */
  --chrome-hi:    #d4b88a;  /* 渐变高色 */
  --panel:        #faf3e0;  /* 事件卡 / 档案专用近白 cream */
  --panel-2:      #f4ecd0;  /* 次级 panel */

  --border:       #4a2e15;  /* 深木边 */
  --border-soft:  #6e4a25;  /* 软边 / chrome 边 */
  --border-amber: #b88a4a;  /* 像素双层边的 inner（amber 高光带）*/

  --text:         #3d2a16;  /* 沉色正文 */
  --text-muted:   #7a5230;  /* 二级正文 */
  --text-faint:   #a8845a;  /* 占位 / +N */

  --accent:       #b88a4a;  /* 主 amber */
  --accent-strong:#8c6e2a;  /* 较深 amber 用作"标题色"于浅 panel */
  --accent-hi:    #d4a04a;  /* 高光 */

  --danger:       #c44e2a;  /* 警告 / 重要事件尾杆 / fatigue 顶值 */
  --danger-hi:    #ff8a5c;  /* FAB 高光 */
  --danger-shadow:#6a1a0a;  /* FAB 阴影 */
  --success:      #4a8d4a;  /* 健康 / 成功 */

  --map-bg-from:  #c4d2e8;  /* 海雾上 */
  --map-bg-to:    #6b8aa3;  /* 海面下 */
}
```

### 暗色（V3 烛光夜读，可切换）

```css
:root[data-theme="dark"] {
  --frame:        #1a1410;
  --frame-2:      #221913;
  --chrome:       #2a1f17;
  --chrome-hi:    #6e4a25;
  --panel:        #e8d4a3;
  --panel-2:      #d4c08a;

  --border:       #4a2e15;
  --border-soft:  #2a1306;
  --border-amber: #b88a4a;

  --text:         #3d2a16;          /* panel 上 */
  --text-muted:   #7a5230;
  --text-faint:   #a8845a;

  /* dark 模式下"在 frame 上"的文本另用一组 token，避免在每个组件里 if 主题 */
  --text-on-frame:        #e8d4a3;
  --text-on-frame-muted:  #b88a4a;
  --text-on-frame-faint:  #8a6a40;

  --accent:       #b88a4a;
  --accent-strong:#ffd980;          /* dark 模式下重要 chrome 文本（如 ◆ 月ノ谷）*/
  --accent-hi:    #ffd980;

  --danger:       #c44e2a;
  --danger-hi:    #ff8a5c;
  --danger-shadow:#6a1a0a;
  --success:      #6ec07a;

  --map-bg-from:  #2c4055;
  --map-bg-to:    #0c1620;
}
```

> **注意：** 浅色模式没有定义 `--text-on-frame` 系列——浅色 frame 与 panel 都偏亮，沿用 `--text` / `--text-muted` 即可。组件实现时优先使用 `--text-on-frame`（如存在）回退到 `--text`，详见 §组件规范.

### 现有 `--palette-*` 节点 tile 8 套配色

**保留，本次不改**（用户决策"先不改，跑起来看"）。下一轮如视觉跳脱再调。

---

## 字体加载

### 改动

1. `src/app/layout.tsx`：在 Silkscreen 旁追加 Noto Sans SC（来自 `next/font/google`），暴露为 `--font-body` 变量；**不再用 Silkscreen 作为 body 默认字体**
2. `src/app/globals.css`：body 默认 `font-family: var(--font-body), "Microsoft YaHei", "PingFang SC", system-ui, sans-serif`；像素位置（chrome、stat-label、tick-sep 等）显式 `font-family: var(--font-pixel)`

### 加载策略

- 两个字体都用 `next/font/google` SSR 注入，`display: swap`
- Silkscreen 只装载 `400` + `700` 两个 weight；subset `latin`
- Noto Sans SC 装载 `400` + `500` + `700`；subset `chinese-simplified`
- 中文 fallback 链显式给 `Microsoft YaHei`（Windows）+ `PingFang SC`（macOS）+ `system-ui`，确保 FOUT 期间也不糊

### FOUT 缓解

`layout.tsx` 在 `<html>` 元素的 className 里同时挂载两个 CSS 变量。`html { font-family: var(--font-body) }` 的提前生效让首屏不会出现 Silkscreen 渲染中文方块的瞬间。

---

## 主屏布局（L3-v3）

### 网格

```
┌──────────────────────────────────────────────────────────────┐
│ TOP BAR                                              [44px]   │
├─────────┬────────────────────────────────────┬───────────────┤
│         │ STREAM HEADER                       │ MINIMAP TABS  │
│  TREE   │  filters · density                  │ ┌────────────┐│
│ [200px] │ ──────────────────────────────────  │ │  CANVAS    ││
│         │ STREAM BODY (events main subject)   │ │  [220px]   ││
│         │                                     │ └────────────┘│
│         │   tick=14 ────────────────────      ├───────────────┤
│         │   ┌─────────────────────────┐      │ CHARACTER     │
│         │   │ Event Card              │      │ TABS          │
│         │   │  avatar · actor · loc   │      │ ┌────────────┐│
│         │   │  what                   │      │ │ name       ││
│         │   │  "quote"                │      │ │ stats      ││
│         │   │  [actions]              │      │ │ section    ││
│         │   └─────────────────────────┘      │ └────────────┘│
│         │                                     │               │
├─────────┴─────────────────────────────────────┴───────────────┤
│ BOTTOM TICK BAR                                      [56px]   │
└──────────────────────────────────────────────────────────────┘
```

CSS Grid：

```css
.dashboard {
  grid-template-columns: 200px 1fr 360px;
  grid-template-rows: 44px 1fr 56px;
  grid-template-areas:
    "top    top      top"
    "tree   stream   right"
    "bottom bottom   bottom";
}
```

最小宽度断点：`min-width: 1200px`。低于此值（暂不专门优化，spec §6.2 移动端不在本次范围）按 `min-width` 下溢，可横向滚动；不做塌缩。

### 折叠状态

- **左树折叠**：点 ◀ 按钮，`tree` 列宽从 `200px` 变 `36px`（只剩竖向"地图层级 ▶"提示），`grid-template-columns` 切到 `36px 1fr 360px`。状态存 localStorage `agent-world.tree-collapsed`。
- **右栏不折叠**：minimap 与 character 始终常驻。极端窄屏时整体下溢。

---

## 五个区组件规范

### ① 顶 bar（TopBar，44px）

`src/app/_components/top-bar.tsx` 重写。

布局（左→右）：
- `◆ {worldName}` — pixel-lg + accent-strong
- `{breadcrumb}` — 各级可点（`onJumpToNode`），当前级 `<b>`
- `👁 跟随：{name} ✕` — 仅当 `followingId != null` 时；点 ✕ 调 `clearFollow()`
- spacer
- 🔍 搜索图标按钮（**占位，禁用 / "Coming Soon" tooltip**，P2）
- 💾 快照图标按钮（**占位**，P2）
- ⚙ 设置图标按钮（**占位**，P2）
- 🌙/☀ 主题切换按钮（**功能化**，调 `toggleTheme()`）
- `T={tick} · {HH:mm}` — pixel-xs，accent

### ② 左侧树（TreeSidebar，200px / 36px 折叠）

新增 `src/app/_components/tree-sidebar.tsx`。

内容：
- 顶部 ◀ 折叠按钮
- "地图层级" 分组：递归渲染 nodes 树；当前节点 active；其他有"重要事件未读"的节点显示 `●` pulse；点击 = `onJumpToNode(id)`
- "活跃 NPC" 分组：列出 `characters.filter(c => c.locationId 在当前显示树范围内)`；选中 active；点击 = `onSelectCharacter(c)`；超过 N 条折叠为"+M"

数据：
- 重要事件 pulse 来源：`events.filter(e => e.importance >= 3 && e.locationId === id && tickAfter > lastReadTick)`。`lastReadTick` 存 localStorage `agent-world.read-tick.{nodeId}`。读取定义为"当前节点 = 此节点"或"用户点击 pulse"。
- 此处 importance 字段如不存在，**降级为：所有同 tick 的事件都不打 pulse，只有用户切换节点后产生的新事件才在原节点打 pulse**（避免用户每开一次都满屏红点）。

### ③ 中央事件流（EventStream，主体）

新增 `src/app/_components/event-stream.tsx` + `event-card.tsx`。

#### Stream Header

- "事件流" pixel 标题（accent-strong）
- 跟随状态文字："跟随中：{name} 视角" 或空
- Filter 按钮组：**全部 / 行动 / 独白 / 互动 / 其他** —— 映射到 `WorldEvent.category`：行动=action；独白=inner；互动=social+quest+burst；其他=time+env+system。单选，存 useState 不入 localStorage（每次会话默认"全部"）
- 密度选择器：稀 / 中 / 密 — 用 `<select>`-like dropdown；存 localStorage `agent-world.stream-density`

#### Stream Body

按 tick 分组渲染。每 tick 顶部一条 `tick-sep`：`T=14 · 14:00 ─────────`。

#### Event Card

每张卡基于 `WorldEvent`（`src/domain/types.ts`）渲染。注意 `WorldEvent` schema 已含 `intensity:1-5`、`category`、`participants:string[]`、`source`、`scope`、`nodeId` 字段——本设计直接用，不假装 actor / witness 等非现有字段。

```tsx
<div className={cn("ev-card", isImportant(ev) && "ev-card--important")}>
  <div className="head">
    {actor && <Avatar npc={actor} size={28} />}
    {actor && <span className="actor">{actor.name}</span>}
    {ev.nodeId && (
      <span className="at" onClick={() => onJumpToNode(ev.nodeId!)}>
        📍 {nodeName(ev.nodeId)}
      </span>
    )}
    {isImportant(ev) && <span className="important-tag">⚠ 重要</span>}
    <span className="when">{formatHHMM(ev.tick)}</span>
  </div>
  <div className="what">{ev.description}</div>
  {ev.category === "inner" && (
    <div className="quote">"{ev.description}"</div>
  )}
  <div className="actions">
    <button onClick={...}>📍 跳到地点</button>
    {actor && <button onClick={...}>⬡ 查看角色</button>}
    <button onClick={...}>🔖 收藏</button>
  </div>
</div>
```

实现细节：
- **actor 推断**：`actor = ev.participants[0]` 时映射到 `Character`；如 participants 为空，不画 avatar/actor 行（如 system / time / env 类事件）
- **重要程度判定**：`isImportant(ev) = ev.intensity >= 3`。直接用 schema 已有字段，无需启发式
- **inner 类事件**的 description 本身就是内心独白，渲染时加引号 + `.quote` 样式（不重复在 .what 显示）
- 节点名通过 `nodes.find(n => n.id === ev.nodeId)?.name` 解析
- `.ev-card` 用 panel + 像素双层边（border + inset border-amber + drop shadow border-soft）
- `.ev-card--important`：`box-shadow: inset 0 0 0 2px var(--accent-hi)`，左侧 `::before` 4px 红色尾杆
- 操作按钮 `🔖 收藏` 在 v1 仅切换 localStorage，无收藏列表视图（P2）

#### 聚合行

同 tick 内**非重要**事件超过密度阈值时合并为：

```
⊕ 同时刻 神社 / 酒馆 共 3 条次要事件 — 点击展开
```

阈值规则：
- 密度=稀：每 tick 至多 2 条；其余聚合
- 密度=中：每 tick 至多 5 条；其余聚合
- 密度=密：不聚合

#### 跟随过滤

`followingId != null` 时：
- 流中只显示 `ev.participants.includes(followingId)` **或** `ev.nodeId === followedCharacter.locationId`（同地点旁观者也包含）
- 不引入 schema 不存在的 actor/witness 字段；participants 已涵盖 actor 与主要参与者两种角色

### ④ 右上 minimap（MinimapSection，220px）

复用 `src/app/_components/map-stage.tsx`，但缩为 220px 高，外加 tab 切换。

Tabs：
- **小地图**（默认）：当前层级地图渲染（沿用现有 nodes / npcs 渲染逻辑），节点 tile 角上画 pulse、NPC dot 选中态
- **关系图**（**占位**）：新建 `src/app/_components/relation-graph.tsx`，v1 渲染一句话 "关系图谱开发中…"。后续单独项目。

minimap 与中央事件流双向联动：
- 点 minimap 上的节点 → `onJumpToNode`（也更新 breadcrumb）
- 点 minimap 上的 NPC → `onSelectCharacter`（同时更新 character-section）
- character-section 点"📍 跳到地点" → minimap 同步切节点

### ⑤ 右下角色档案（CharacterSection）

复用 `src/app/_components/profile-pane.tsx`（已重构过），但拆出 tab 头：
- **档案**（默认）：现有 profile 内容（生理 / 情绪 / 性格 / 关系 / 最近记忆 / 能力）
- **独白**（占位 → 部分功能）：单独显示 `lastThought.reasoning` 全文 + 历史 N 条独白列表（取 `events.filter(ev => ev.category === "inner" && ev.participants.includes(character.id))`）
- **关系**（占位 → 部分功能）：详情即"自我中心一度关系"——从现有 character.relations 渲染为单角色为中心的星状图（可用现有数据；如时间不足落 P2，v1 显示纯列表）
- **经历**（占位 → 部分功能）：同 events 流但 actorId === character.id 的过滤视图

跟随按钮放在 character-section header（不是事件卡）：`👁 跟随她`。

### ⑥ 底部时间条（TickBar，56px）

新增 `src/app/_components/tick-bar.tsx`，替代现 `top-bar.tsx` 中的"推进 / 自动"按钮。

布局（左→右，分组 `border-right` 分隔）：

| 分组 | 内容 |
|---|---|
| 1. 单步控件 | ⏮ 单步回退 / ▶ 播放 / ⏸ 暂停 / ⏭ 单步前进 |
| 2. 时钟 | `2026/05/02 14:00` (pixel-md, accent-strong) |
| 3. 倍速 | 1× / 2× / 4× — 互斥按钮组，存 localStorage `agent-world.speed` |
| 4. 自动 | ⏵⏵ 自动 24h（与现有 startAuto 对应）；运行时变"停止 ⏹"（同现状） |
| 5. 模式切换 | ↻ 历史回放（**v1 占位**，点击 noop + tooltip "Coming Soon"） |
| spacer | flex: 1 |
| 6. 投放事件 | ⚡ 投放事件 (E) — 主 CTA，红色（danger） |

倍速 / 单步回退 / 历史回放 在 v1 是占位（按钮可见，点击 noop 或 toast）。**仅 ▶ / ⏸ / ⏭ / 自动 24h / ⚡ 投放事件 是 P0 功能化**，其余 P2。

### ⑦ 事件投放抽屉（InjectDrawer，触发后从右滑入）

新增 `src/app/_components/inject-drawer.tsx`，**v1 占位**：
- 抽屉骨架（panel + 标题 "投放事件" + 关闭 ✕）
- 表单字段占位（地点 / 参与者 / 类型 / 强度 / 自由文本 / 可见性 6 字段，每个都用 disabled mock input）
- "投放"按钮 disabled
- 唯一可工作部分：能从 ⚡ FAB / 底部 ⚡ 按钮 / 快捷键 E 三处入口打开/关闭抽屉

逻辑实装走后续单独项目；这里只确保入口与样式承接。

---

## 主题切换基础设施

### Hook

新增 `src/app/_hooks/use-theme.ts`：

```ts
type Theme = "light" | "dark";
const KEY = "agent-world.theme";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const saved = localStorage.getItem(KEY) as Theme | null;
    const initial = saved ?? "light";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);
  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem(KEY, next);
    document.documentElement.setAttribute("data-theme", next);
  };
  return { theme, toggle };
}
```

### SSR 闪烁规避

`layout.tsx` 在 `<head>` 内联一段 script，在水合前从 localStorage 读出 theme 并设置 data-theme，避免首屏闪烁：

```tsx
<script dangerouslySetInnerHTML={{ __html: `
  try {
    const t = localStorage.getItem("agent-world.theme") || "light";
    document.documentElement.setAttribute("data-theme", t);
  } catch (_) {}
`}} />
```

### Tailwind 配合

由于现项目使用 Tailwind 4 的 `@theme inline`（见 `globals.css`），主题变量在两个 selector 下声明即可，所有 `bg-(--color-*)` 用法自动响应。

---

## 跟随（Follow）基础设施

新增 `src/app/_hooks/use-follow.ts`：

```ts
export function useFollow() {
  const [followingId, setFollowingId] = useState<string | null>(null);
  return {
    followingId,
    follow: (id: string) => setFollowingId(id),
    clear: () => setFollowingId(null),
    isFollowing: (id: string) => followingId === id,
  };
}
```

不存 localStorage——跟随是会话级，刷新即消。

跟随影响：
- TopBar 显示指示器
- EventStream 过滤逻辑
- CharacterRail/Tree 相应 NPC 行加 👁 标记

---

## 文件级影响

### 改动

| 路径 | 改动类型 | 说明 |
|---|---|---|
| `src/app/layout.tsx` | 改 | 加 Noto Sans SC；改 body 默认字体；加 SSR theme script |
| `src/app/globals.css` | 几乎重写 | token 全更新；保留 `.pixel-frame` / `.npc-chip` / `.node-tile` / `.pixel-scroll` 工具类（适配新 token）；删除/重写 `.text-game-*` 改为 `.text-pixel-*` / `.text-body-*` 两套 |
| `src/app/_components/dashboard.tsx` | 重写 | 5 区 grid；接入 useTheme / useFollow；状态注入 |
| `src/app/_components/top-bar.tsx` | 重写 | 面包屑、跟随、icon 按钮、theme toggle、tick——把"推进 1h"和"自动 24h"按钮迁出到 tick-bar |
| `src/app/_components/character-rail.tsx` | 删除（合并） | 内容合并到新 `tree-sidebar.tsx` 的"活跃 NPC" 分组；现有"放置 NPC"功能（templates / placeCharacter）暂保留，作为该分组的一个 footer 按钮 → 弹小 modal |
| `src/app/_components/profile-pane.tsx` | 改 | 头部加 tab 头（档案 / 独白 / 关系 / 经历）；现有内容进"档案" tab；新增 3 个 tab 的占位/简版实现；加"👁 跟随她"按钮 |
| `src/app/_components/events-pane.tsx` | 删除（替换） | 由新 `event-stream.tsx` 接管；现 events-pane 的渲染逻辑（如分组、avatar 解析）部分代码可拷贝过去 |
| `src/app/_components/map-stage.tsx` | 改 | 缩为 220px 高的 minimap；外层加 tab 头；逻辑（节点渲染 / NPC 渲染）核心保留 |
| `src/app/_components/pixel-frame.tsx` | 不动 | 旧 `--color-pixel-*` 变量经别名映射自动指向新 token；API 不变 |

### 新增

| 路径 | 说明 |
|---|---|
| `src/app/_components/tree-sidebar.tsx` | 左侧树 |
| `src/app/_components/event-stream.tsx` | 中央事件流容器 |
| `src/app/_components/event-card.tsx` | 单条事件卡 |
| `src/app/_components/tick-bar.tsx` | 底部时间条 |
| `src/app/_components/theme-switcher.tsx` | 顶 bar 按钮（薄封装 useTheme） |
| `src/app/_components/inject-drawer.tsx` | 投放抽屉（占位 UI） |
| `src/app/_components/relation-graph.tsx` | 关系图（占位） |
| `src/app/_components/replay-mode.tsx` | 回放模式覆盖（占位） |
| `src/app/_hooks/use-theme.ts` | 主题切换 |
| `src/app/_hooks/use-follow.ts` | 跟随状态 |
| `src/app/_lib/format.ts`（已有）| 加 `formatHHMM(tick)` 辅助 |

**关于 `/admin` 路由**：现有 `src/app/admin/page.tsx` 是 LLM Provider / Map 配置面板，**与 spec §1.7 的"世界编辑器"是不同东西**——前者是开发期工具，后者是面向终端用户的世界搭建器。本次重设计：
- 现有 `/admin` 不动功能；视觉随全局 token 重写**自然继承**（其代码内 `bg-(--color-pixel-bg)` 等用法在 token 重映射后会自动呈现新主题，无需逐处改写）
- spec §1.7 世界编辑器（B4）**不在本次范围**；后续单独立项时建议落到 `/admin/editor` 或独立路由，不入主屏

### 旧 token 兼容（关键）

`text-game-*`（110 处）和 `--color-pixel-*`（227 处）在 9-10 个组件文件中广泛使用。**直接改名会需要每处都改一次**。本次采用**别名映射**策略：

`globals.css` 内保留 `--color-pixel-bg` / `--color-pixel-bg-2` / `--color-pixel-fg` / `--color-pixel-muted` / `--color-pixel-border-light` / `--color-pixel-border-dark` / `--color-pixel-accent` / `--color-pixel-accent-dark` / `--color-pixel-danger` / `--color-pixel-success` 这 10 个旧变量，**值改为新 token 的 alias**：

```css
:root, :root[data-theme="light"] {
  /* ...新 token... */

  /* 旧 token 兼容映射（让现有组件自动响应主题）*/
  --color-pixel-bg:           var(--frame);
  --color-pixel-bg-2:         var(--frame-2);
  --color-pixel-fg:           var(--text);
  --color-pixel-muted:        var(--text-muted);
  --color-pixel-border-light: var(--border-amber);
  --color-pixel-border-dark:  var(--border);
  --color-pixel-accent:       var(--accent);
  --color-pixel-accent-dark:  var(--accent-strong);
  --color-pixel-danger:       var(--danger);
  --color-pixel-success:      var(--success);
}
```

`text-game-*` 同理：原有 `.text-game-2xs` 等 6 个工具类**保留不删**，`globals.css` 内的 `font-size` 值改为 `var(--font-body-*)` / `var(--font-pixel-*)` 中合适者。本次新组件统一使用新 token；旧组件原地工作。

> 这意味着：阶段 1 token 重写完成后，**整个项目无需逐个组件改字符串**，旧界面自动呈现浅色 V3。后续阶段在重做的组件里才用新 token。

---

## 实施顺序

每阶段独立可跑、可见、可回退。

### 阶段 1 — 字体与 token 基建

1. layout.tsx 装 Noto Sans SC + 加 SSR theme script
2. globals.css 重写：建立两套 theme token（light + dark）+ 通用 type/spacing/letter token
3. body 默认字体改成 Noto Sans SC
4. **验收**：现有页面切到浅色 V3 token + 中文不再糊；右上手动加临时 toggle 按钮验证主题切换通畅

### 阶段 2 — 主题切换 hook

5. `use-theme.ts` + `theme-switcher.tsx`
6. **验收**：刷新后保持选择；无 SSR 闪烁

### 阶段 3 — 布局骨架

7. dashboard.tsx 切 5 区 grid（先空壳，子区直接放 placeholder div）
8. tick-bar.tsx + 把推进 / 自动按钮从 top-bar 迁过来
9. top-bar.tsx 重写（保留 worldName + tick；先不做面包屑/跟随）
10. **验收**：5 区在屏，时间推进可用

### 阶段 4 — 树侧栏 + 跟随基建

11. tree-sidebar.tsx — 渲染 nodes + 活跃 NPC，无 pulse；接 onJumpToNode / onSelectCharacter
12. dashboard 移除原 character-rail；commit
13. `use-follow.ts` + top-bar 跟随指示器；character-section 加跟随按钮

### 阶段 5 — 事件流主体

14. event-card.tsx — 单卡渲染
15. event-stream.tsx — 列表 + tick 分组 + filter / density 头
16. dashboard 接入；删除 events-pane.tsx
17. 跟随过滤接入；聚合行接入
18. **验收**：事件流可读、卡片信息层级清晰、filter / density 改变可见

### 阶段 6 — 右栏 minimap + character

19. map-stage.tsx 改造为 minimap-section（含 tab 头）
20. relation-graph.tsx 占位
21. profile-pane.tsx 加 tab 头（档案 / 独白 / 关系 / 经历）+ 各 tab 内容（占位/简版）
22. **验收**：右栏不再压缩主体；tab 切换流畅

### 阶段 7 — 事件投放抽屉占位 + admin 路由

23. inject-drawer.tsx 占位 UI + 三处入口（FAB / 底部按钮 / E 快捷键）
24. **验收**：抽屉能开合；快捷键 E 工作；现有 `/admin` 视觉随主题自动迁移

### 阶段 8 — 像素细节

26. 重要事件红尾杆 + ⚠ tag
27. 节点 tile 角 pulse（可暂仅在 minimap 显示）
28. 树节点 pulse（用 `lastReadTick` 简化逻辑）
29. NPC dot 思考动画（移植现有逻辑）
30. **验收**：手感与"小剧场"感对位

---

## 开放问题（实施时再决）

- **节点 tile 8 套 palette 的视觉适配**：用户已选"先不改"，但浅色主题 + parchment frame 下，原 #6b8ec4（school）、#5a9a6b（park）等 tile 在浅色 frame 上可能"太鲜艳"。先观察，必要时 P2 调整
- **重要事件判定阈值**：v1 取 `intensity >= 3`；如运行后发现 ⚠ 标签太密或太稀，调到 4。schema 已含 intensity 字段，无引擎改动需求
- **跟随过滤的 nodeId 兜底**：`ev.nodeId` 在 scope=global 时可能为空——这种全局事件无论是否跟随都常驻流中
- **倍速 2× / 4×**：需要引擎层支持"批推进 N tick + 中途遇到重要事件提前停"的语义；本期 UI 出按钮但禁用，等引擎跟上
- **历史回放（B3）**：完整实现需要 snapshot diff 与 timeline scrubber 的引擎能力，超出本次范围；本期仅占位入口
- **关系图 / 独白 / 经历 tab**：v1 实现深度待定。必须保证 tab 头 + 框架到位；内容用现有数据降级渲染（关系=列表，独白=lastThought，经历=actor 过滤事件流）；后续可不动外壳直接升级
- **CharacterRail 的"放置 NPC"流程**：现有 templates / placeCharacter 移到树的 footer 弹 modal——modal 形态本期出小骨架（select + 输入位置 + 确认），不引入新设计语言

---

## 验收（整体）

整个重设计完成的判断标准：

1. 默认主题为浅色（牛皮纸 + cream panel），点 🌙 切到 V3 烛光夜读暗色
2. 中文正文使用 Noto Sans SC，肉眼判断不再糊
3. 主屏五区到位：树（可折叠）/ 事件流主体 / minimap / 角色档案（tabbed）/ 时间条
4. 事件以"小剧场卡片"为单位呈现：avatar + 角色 + 地点 chip + 行动文 + 独白引用 + 操作按钮；重要事件视觉上有显著区分
5. 顶 bar 跟随指示器、底部时间条、⚡ 投放事件抽屉、底部历史回放占位、admin 路由占位 — 五个入口齐备
6. 主题切换、字体加载、folding 状态在刷新后保持
7. spec §1 列出的 9 个视图至少有 7 个有 UI 入口（剩余的 1.7 编辑器为独立路由占位、1.8 回放为按钮占位）
