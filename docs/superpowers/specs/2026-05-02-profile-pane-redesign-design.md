# Profile Pane 重构 — 设计文档

- 创建时间：2026-05-02
- 范围：`src/app/_components/profile-pane.tsx` 内部重构 + 1 个新 helper 文件；不动 dashboard 布局，不动后端，不改 schema
- 不在范围：character-rail / map-stage / events-pane 的视觉调整；任何后端字段新增；abilities 详情面板（v1 仅 chips）

---

## 背景

当前 `profile-pane.tsx`（src/app/_components/profile-pane.tsx）有 3 类问题：

1. **信息密度 / 视觉层级**：所有 section 长得一样（uppercase 灰字标题 + 平铺内容），没有焦点；`关系` / `最近记忆` 都硬截 5 条且无展开入口；长 `lastThought.reasoning` 用 `max-h-40 overflow-y-auto` 内嵌滚动，体验别扭。
2. **信息呈现弱**：`生理` (vitals) 与 `情绪` (emotion) 直接平铺数字（`饿 4 累 7 脏 2`），但同 dashboard 的 `character-rail.tsx` 反而用了 `VitalBar` 进度条 — 父级 (profile) 信息层比子级 (rail) 还弱。
3. **信息不全**：`Character` 类型（src/domain/types.ts）已有 `currentAction`、`abilities`、`homeNodeId`、`relations[].note` 字段，profile-pane 都没显示。

agent-world 的产品定位是"玩家=导演/观察者"（来自项目 memory `project_agent_world.md`）。打开角色档案的最高频动机是观察 NPC 的当下状态与决策——profile-pane 是这个观察的核心载体，必须有清晰的视觉层级与完整的信息覆盖。

---

## 设计

### 整体结构（自上而下）

profile-pane 在 dashboard 中位于左下，宽 ~440px、高 ~50vh。沿用 A 策略（原地优化），不外推到 modal。

```
┌──────────────────────────────────────┐
│ Header                               │
│   avatar(60) | 名字 / 位置 / 家      │
│              | currentAction chip    │
├──────────────────────────────────────┤
│ 上一轮思考       (subdued card)      │
│   t=12 · move · OK + emotionTag      │
│   reasoning（截断 + 展开全文）       │
│   freeText                           │
├──────────────────────────────────────┤
│ 状态仪表盘       (gold-accent card) │
│   生理(3 bar)  |  情绪(3 bar)        │
├──────────────────────────────────────┤
│ 性格   (4 条 [-4..+4] 双向 bar)      │
├──────────────────────────────────────┤
│ 关系   (前 5 + "展开 ▾"，含 note)    │
├──────────────────────────────────────┤
│ 最近记忆 (前 5 + "展开 ▾")           │
├──────────────────────────────────────┤
│ 能力   (chips；空时显示占位)         │
└──────────────────────────────────────┘
```

整个 pane 仍保留外层 `flex-1 min-h-0 overflow-y-auto pixel-scroll`；空选中态（`character == null`）保持现有"点击左栏…"占位文案，不变。

### Section 1 — Header

- avatar：60×60 npc-chip（`npc-chip--lg npc-chip--selected pixelated`），保持现有 `NPC_EMOJI[character.id] ?? NPC_FALLBACK_EMOJI`
- 右侧三行：
  - 名字（`text-game-lg`）
  - 位置（按钮，跳转到 `onJumpToNode(locationId)`） + 同行 muted 文字 `· 家 ${homeNode.name}` ——**仅当 `homeNodeId` 非空、能在 `nodes` 中找到、且不等于当前 `locationId` 时显示**（避免和位置行重复）
  - `currentAction` chip：`${description} (t${startedAt}→t${endsAt})`（`description` 来自引擎写入，本身就是用户可读的中文如"在 张默家 睡觉"）—— **仅当 `character.currentAction` 存在时显示**；不存在则不渲染该行（不留空白）

### Section 2 — 上一轮思考（移到 header 之后）

之前在原位置（性格上方），现移到 header 紧下方。这是最具叙事价值的字段，玩家选中 NPC 后第一眼应能读到。

- Section label 行：`上一轮思考 · t=${tick} · ${action.type}` + 右侧 `OK` / `FAIL` chip
- 卡片体（`bg-pixel-bg-2 + border-pixel-border-dark`，**非金边**——视觉权重低于状态仪表盘）：
  - `emotionTag`（如 `😩 疲倦`）：accent chip
  - `reasoning`：默认 `line-clamp-4` 截断为 4 行；下方 "展开全文 ▾" 按钮，点击后切换为完整展开（去除 line-clamp）
  - `freeText`：底部 italic + 上方 1px dashed 分隔
- `lastThought` 为空时：保留现有"还没有过决策（推进 1 小时后再来看）。"占位文案

**展开状态用本地 `useState<boolean>` 维护；切换 character 时重置为收起。**

### Section 3 — 状态仪表盘（hero）

视觉权重最高：`bg-pixel-bg-2` + 2px `border-pixel-accent-dark` + `inset 1px pixel-accent`（金边强调，与 `lastThought` 卡片区分）。两列 grid：

**左列 · 生理**（vitals，0..16）

| 标签 | 单向 bar (0→100%) | 配色规则 |
| --- | --- | --- |
| 饿 | `hunger / 16 * 100%` | ≥10 danger / ≥6 accent / 否则 success |
| 累 | `fatigue / 16 * 100%` | 同上 |
| 脏 | `hygiene / 16 * 100%` | 同上 |

注意：当前 `character-rail.tsx` 的 `VitalBar` 用 `value * 10` 假设范围 0..10，与 schema 注释 0..16 不一致；此次重构不顺手改它，保留为已知不一致点（不影响本设计）。**新组件按 0..16 实现。**

**右列 · 情绪**（emotion）

| 标签 | bar 类型 | 范围 | 备注 |
| --- | --- | --- | --- |
| 心 | 双向 (-4..+4) | mood | <0 红 / >0 绿 / =0 居中标记 |
| 压 | 单向 (0..4) | stress | 进度越高越红（≥3 danger / ≥2 accent / 否则 success） |
| 社 | 双向 (-4..+4) | social_satiety | 同 mood |

双向 bar 沿用现有 `PersonalityBar` 的视觉模型（中央 1px 分隔线、负向左红 / 正向右绿）；提取一个共用的 `<BiBar>` helper 复用给"性格"section。

### Section 4 — 性格

完全沿用现有 `PersonalityBar`（4 条 `I/E`、`N/S`、`F/T`、`P/J`，[-4..+4] 双向）。从原位置（思考下方）保留 section，仍然显示在状态仪表盘之后。视觉上和情绪的双向 bar 一致——这是用户**明确要求保留的样式**。

不显示 MBTI 字母总结（v2 mockup 中曾尝试 INFP 4-block 显示，已被否）。

### Section 5 — 关系（含 note）

- Section label：`关系  ${shown}/${total}` —— `shown` = 实际渲染条数，`total` = `Object.keys(relations).length`；当 `total > shown` 时显示 "展开 ▾" 按钮
- 默认 `shown = 5`，按 `abs(affection)` 倒序（沿用现有逻辑）；点击 "展开 ▾" 后展示全部，按钮变 "收起 ▴"
- 每条三列 grid：
  - 头像（对方角色的 emoji）
  - 主体：第一行 `名字 + kinds(join "·")`；第二行 italic `note`（**单行 ellipsis 截断**），`note` 为空时省略第二行
  - 右端：`affection`（>0 success 绿 / <0 danger 红，符号显示）
- `relations` 为空对象时：显示 section label + "尚无任何关系"占位

### Section 6 — 最近记忆

- Section label：`最近记忆  ${shown}/${total}` + `展开 ▾`（同关系，`total = shortMemory.length`）
- 默认 `shown = 5`，按 `tick` 倒序（沿用现有逻辑）
- 每条：左侧 meta 列（`t=${tick}` + `★`×importance），右侧 content；星号用 `var(--color-pixel-accent)` 高亮
- `shortMemory` 为空时：显示 section label + "暂无记忆"占位

### Section 7 — 能力（新增）

- Section label：`能力  ${abilities.length}`
- 每个 ability 是一个 chip：`${kind} · t${tier}`（exp 暂不显示，避免噪音）
- `abilities` 为空数组时：显示 section label + "尚未习得任何能力"占位（**显示 section 而非整段隐藏**——用户已确认）

---

## 共用组件 / Helper

### 在 `profile-pane.tsx` 内新建私有组件

- **`BiBar({ label, value, min=-4, max=4 })`**：双向条；当前 `PersonalityBar` 的逻辑泛化版本。给 `性格` (4 条) 和 `情绪.心 / 情绪.社` (2 条) 共用。
- **`UniBar({ label, value, max, thresholds })`**：单向条；给 `生理` (3 条) 和 `情绪.压` 共用。`thresholds: { danger, warn }` 决定配色。
- **`SectionLabel({ children, count, total, expanded, onToggle })`**：统一 section 标题，封装 "X/Y" 计数与 "展开 ▾ / 收起 ▴" 按钮。

`PersonalityBar` 删除（改为调用 `BiBar`）。

### 不抽到独立文件

所有上述组件保留在 `profile-pane.tsx` 内为模块私有，不导出。重构后 profile-pane.tsx 预计 250-300 行，仍在单文件可承受范围。

### 新 helper：`src/app/_lib/profile-format.ts`

放置 3 个纯函数（无 React 依赖、便于单测）：

```ts
// thresholds 是显式参数：vitals 用 (10, 6)，stress 用 (3, 2)。max 派生不出来。
export function vitalThreshold(value: number, danger: number, warn: number): "ok" | "warn" | "danger";
export function affectionTone(value: number): "pos" | "neg" | "zero";
export function formatActionWindow(action: OngoingAction): string; // "在 张默家 睡觉 (t12→t19)"
```

---

## 数据流

无新增数据：所有显示字段已存在于 `Character` 类型（包括 `currentAction`、`abilities`、`homeNodeId`、`relations[i].note`）。

`profile-pane.tsx` 依然只接收四个 prop（`character`、`nodes`、`onJumpToNode`、`characters`），prop 类型不变。

新增的本地 state：

- `thoughtExpanded: boolean`（控制 reasoning 是否展开全文）
- `relationsExpanded: boolean`
- `memoriesExpanded: boolean`

均通过 `useEffect` 监听 `character?.id`，切换 character 时重置为初始值（思考收起、关系/记忆收起）。

---

## 错误 / 边界处理

- `character == null` → 现有占位文案，无变更
- `homeNodeId == null` 或 nodeById 找不到 → header 不显示家行
- `currentAction == null` → header 不显示 currentAction chip
- `lastThought == null` → 显示思考 section + 现有占位文案
- `relations == {}` / `shortMemory == []` / `abilities == []` → 显示对应 section label + 占位文案，不隐藏（用户明确选择）
- `vitals` 字段缺失（理论不应发生）：当成 0 处理，bar 显示空

---

## 测试

只有一个测试文件需要新增：

- `src/app/_lib/profile-format.test.ts`：覆盖 `vitalThreshold` / `affectionTone` / `formatActionWindow` 的边界（0、最大、负值、`endsAt == startedAt`）

profile-pane 本身是纯渲染组件，依赖 props；不写组件测试（与项目既有约定一致——`src/app/_components/` 下其他组件均无单测）。

---

## 不做的事

- 不调整 dashboard 布局（左下区域、宽高都不变）
- 不改 character-rail.tsx 的 `VitalBar`（已知 0..10 vs 0..16 不一致，留待单独修）
- 不增加 abilities 详情视图（v1 仅 chips；后续如需展开再做）
- 不改 schema、不动后端
- 不做横向滚动 / 紧凑模式切换 / 主题切换
- 不动 PixelFrame 的 `title="角色档案"`（dashboard.tsx 已写死）

---

## 视觉参考

最终 hi-fi mockup 见 `.superpowers/brainstorm/8585-1777716344/content/variant-b-v3.html`（本会话产物）。
