# 关系图谱设计

> 将角色关系数据可视化，提供力导向全图 + 径向聚焦双模式。

---

## 1. 数据模型

不修改现有数据模型。直接使用 `Character.relations: Record<string, Relation>`（单向）：

```ts
interface Relation {
  kinds: ObjectiveRelationKind[];  // 23 种关系类型
  affection: number;               // -4..+4 好感度
  note?: string;                   // 自然语言备注
  since: Tick;
  lastInteractionTick: Tick;
}
```

### 图数据构建

从 `useWorldState().snapshot.characters` 构建 `{ nodes[], links[] }`：

- **Node**: `{ id, name, avatar, relationCount }` — `relationCount` 为该角色 `relations` 的 key 数量
- **Link**: `{ source, target, affection, kinds, note }` — source 为关系持有者（A.relations[B] → source=A, target=B）

---

## 2. 依赖

新增 `react-force-graph-2d` 依赖（Canvas + d3-force，~15KB gzip）。

不新增后端路由、DB 查询。所有数据通过现有 `useWorldState()` 的 `snapshot` 提供。

---

## 3. 组件树

```
RelationGraph (容器)
├── ForceGraph2D (react-force-graph-2d)
│   ├── nodeCanvasObject  → 节点绘制（emoji + 名字 + 大小）
│   └── linkCanvasObject  → 连线绘制（颜色 + 箭头 + 类型标签）
└── RelationTooltip       → hover 浮层（类型、好感值、note）
```

### 状态

| 状态 | 类型 | 说明 |
|------|------|------|
| `focusId` | `string \| null` | 当前聚焦角色（双击设置），null=全图模式 |
| `highlightIds` | `Set<string>` | 聚焦模式下需高亮的节点集合（聚焦角色 + 其一度关系角色） |
| `tooltip` | `{ x, y, targetId, relation } \| null` | hover tooltip 位置和内容 |

---

## 4. 视觉编码

### 节点

- Emoji 头像（复用 `characterEmoji()`）+ 角色名（8px 像素字体）
- 节点面积 ∝ `relationCount`：最小 28px，最大 56px
- 被选中节点显示高亮圆环（`--accent-strong` 色）
- 聚焦模式下：`highlightIds` 内节点正常渲染，其余节点 opacity 降至 0.15

### 连线

- `affection > 0` → 绿色渐变，`affection < 0` → 红色渐变，`affection === 0` → 灰色
- 颜色深浅随 `|affection|` 线性映射：±1 最浅，±4 最深
- 箭头从 source 指向 target（表达"A 对 B 的认知"）
- 线上标注 `kinds[0]`（首个关系类型标签，像素字体 6px）
- 双向关系（A→B 且 B→A）渲染为两条微微弯曲的独立弧线（顺时针=A→B，逆时针=B→A）

### Tooltip

Hover 连线时显示在光标锚点上方：
- 目标角色名
- 完整关系类型列表（`kinds.join("/")`）
- 好感值（带正负号）
- note 备注（如有）
- 格式文案："A 对 B 的认知"

---

## 5. 交互

### 全局

| 操作 | 行为 |
|------|------|
| 滚轮 | 缩放 |
| 拖背景 | 平移 |
| 空白双击 | 退出聚焦模式，回到全图力导向 |

### 节点

| 操作 | 行为 |
|------|------|
| 拖拽 | 移动节点，松手后 force 恢复 |
| 悬停 | 高亮该节点及其所有一度连线 |
| 单击 | 选中角色 → `view.selectCharacter(id)` 同步右侧 ProfilePane |
| 双击 | 进入径向聚焦模式（当前选中角色置于画布中心，一度关系角色按好感度排布外圈） |

### 聚焦模式

- 聚焦角色移至画布中心，一度关系角色按 `affection` 排列：正好感内侧，负好感外侧
- 非相关角色半透明退缩到背景
- 双击已聚焦角色或双击空白 → 退出聚焦

### 孤岛节点

无关系的角色仍正常显示，力导向将其推至图形边缘。聚焦一个无关系角色时，画布中央显示 "该角色暂无关系" 提示。

---

## 6. 集成

**Dashboard 传参**（最小化改动）：

```tsx
<RelationGraph
  characters={snapshot.characters}
  selectedCharacterId={view.selectedCharacterId}
  nodes={snapshot.nodes}
  onSelectCharacter={(id) => view.selectCharacter(id)}
/>
```

**不需要的联动**（MVP 不做）：
- 关系变化时的连线动画
- 事件流点击跳转关系图
- 关系图过滤/搜索

### 容器尺寸

使用 `ResizeObserver` 监听容器 div 尺寸变化，传入 ForceGraph2D 的 `width`/`height` 保证 Canvas 始终填满可用空间。

---

## 7. 边界情况

| 场景 | 处理 |
|------|------|
| 世界无角色 | 显示 "暂无角色数据" |
| 所有角色无关系 | 全图仅显示散落节点，无连线 |
| 单个角色关系数量为 0 | 正常渲染为孤岛节点 |
| 角色已被删除但 relations 仍引用 | 过滤掉无效 target，不渲染该连线 |
| 聚焦角色无关系 | 中心显示提示 "该角色暂无关系" |
| Canvas resize | ResizeObserver 防抖更新尺寸 |
| 大量角色（>50） | ForceGraph2D 的 force 迭代次数增加，节点大小下限缩至 20px |
