# Map Layout Engine — 设计规范

## 概述

为 `agent-world-config` 技能引入基于规则的布局引擎，替代 LLM 手动指定节点坐标。算法先生成空间骨架（路网 + 分区 + 槽位），LLM 填充建筑内容，最后算法精算坐标。仅作用于**根节点 → 一级子节点**（地图地表层），建筑内部递归沿用现有 grid fallback。

## 动机

- LLM 缺乏空间推理：手动分配的 `x/y/w/h` 可能重叠、不符合现实空间逻辑
- 每次做地图都需要反复调坐标，体验差
- 宝可梦风格 2D 地图需要规则化的路网和分区

## 流水线

```
用户参数 → 算法生成骨架 → LLM 填筑建筑 → 算法精算坐标 → 校验输出
```

### 第一步：算法生成骨架

输入参数（用户指定或取默认值），输出 `skeleton.json`。

### 第二步：LLM 填筑

Claude 读取骨架，逐槽决定建筑内容，生成 node 列表。

### 第三步：坐标精算

根据 LLM 实际填充结果（合并/跳过/子节点），重新计算最终 `x/y/w/h`，逐对校验无重叠。

## 骨架格式

```json
{
  "canvas": { "w": 48, "h": 36 },
  "roads": [
    { "id": "r-main", "dir": "h", "y": 18, "w": 6, "name": "主街" },
    { "id": "r-cross1", "dir": "v", "x": 14, "w": 3, "name": "东竖街" }
  ],
  "elevations": [
    { "layer": 0, "yStart": 24, "yEnd": 36, "label": "山顶" },
    { "layer": 1, "yStart": 12, "yEnd": 24, "label": "山腰" },
    { "layer": 2, "yStart": 0,  "yEnd": 12, "label": "山脚" }
  ],
  "slots": [
    {
      "id": "slot-01",
      "zone": "commercial",
      "x": 2, "y": 14, "w": 5, "h": 4,
      "roadAccess": "r-main",
      "elevation": 2,
      "suggestedTags": ["public", "indoor", "dining"],
      "isEntry": false,
      "capacityHint": 15
    }
  ]
}
```

- **roads**：道路 id、方向（h/v）、位置、宽度
- **elevations**：高程带，纯视觉分层，无逻辑影响
- **slots**：建筑槽位，含预分配坐标、zone 类型、建议标签、容量提示

## 算法步骤（七层叠加）

### 1. 读取参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `canvasW` | 48 | 画布宽度（格） |
| `canvasH` | 36 | 画布高度（格） |
| `elevationLayers` | 3 | 高程层数 |
| `mainRoadCount` | 1 | 横贯主街数量 |
| `crossRoadCount` | [2, 4] | 竖街数量范围 |
| `density` | "medium" | 建筑密度：sparse / medium / dense |
| `zoneRatios` | { commercial: 0.20, residential: 0.45, public: 0.10, edge: 0.25 } | 分区面积占比 |
| `seed` | clock | 随机种子（可固定复现） |

### 2. 画高程带

将画布沿 y 轴均分为 N 个水平带。带间可设 1–2 格过渡区。

### 3. 铺设道路

- 主街：`dir: "h"`，`w: 6`，y 位置在 canvas 高度 40%–60% 区间
- 竖街：`dir: "v"`，`w: 3`，x 位置随机散布但间距 ≥12 格
- 高程变化处竖街可横向偏移形成阶梯感

### 4. 切割地块

道路围出的矩形区域即为 block。每个 block 独立管理。

### 5. 地块分区

| 条件 | zone |
|------|------|
| 紧邻主街 | `commercial` |
| 十字路口附近 | `public` |
| 非邻街、内侧 | `residential` |
| 画布外缘 | `edge` |

各区面积比例尽量接近 `zoneRatios` 参数。

### 6. 放置槽位

每个 block 内按 `density` 参数排布槽位：

- 横向 block：槽位左对齐排成一行
- 纵向 block：槽位上对齐排成一列
- 方形 block：内部网格（2×1 或 2×2）

LLM 可合并相邻同 zone 槽位、跳过槽位、在槽位内添加子节点，但**不能手动改变槽位坐标**。

### 7. 输出骨架

整合写入 skeleton JSON 文件。

## 防重叠（三层硬约束）

### 第一层：道路天然隔离

道路宽度（主街 6、竖街 3）保证跨 block 的槽位绝对不重叠。道路本身就是安全间距。

### 第二层：槽位顺序排列

同一 block 内槽位从左到右、从上到下填，相邻间距 ≥1 格。满足：
- 横向：`x[i+1] >= x[i] + w[i] + 1`
- 纵向：`y[i+1] >= y[i] + h[i] + 1`

### 第三层：输出硬校验

最终输出前对所有节点两两检查，任意一对不满足分离条件则标记冲突 → 自动推挤（最多 3 轮）→ 重检。

## 作用范围

- **只作用于**：根节点 → 一级子节点（地表建筑层）
- **不作用于**：建筑内部递归节点（房间、楼层等），这些沿用现有 grid fallback

## LLM 自由度

在填筑阶段，LLM 可以：
- **填充**：给槽位写入建筑内容（不改坐标）
- **合并**：在填入的 node 中声明 `mergedFrom: ["slot-01", "slot-02"]`，算法据此重算合并后的坐标
- **跳过**：声明槽位不用，算法回填空地/装饰物
- **覆盖标签**：`suggestedTags` 仅作参考，LLM 可选择更合适的标签组合
- **加子节点**：如住宅内添加浴室子节点（不涉及本轮布局）

## 文件规划

| 文件 | 用途 |
|------|------|
| `src/engine/layout.ts` | 布局引擎核心（算法步骤 2–7） |
| `scripts/generate-skeleton.ts` | CLI 入口，参数解析 + 调引擎输出骨架 |
| `scripts/resolve-coords.ts` | 坐标精算 + 重叠校验（流水线第三步） |
| `src/engine/layout.test.ts` | 布局引擎单元测试（确定性、防重叠、分区比例） |

中间产物 `skeleton.json` 写入 `.claude/skills/agent-world-config/` 目录（与 skill 的 tmp 文件同级）。最终输出为标准 `configs/maps/<id>.json`。

现有 `validate.ts` 不变，新增校验作为 `resolve-coords.ts` 的内置步骤。

## 集成点

`agent-world-config` 技能流程更新为：

```
用户描述 → 确认参数 → 运行 generate-skeleton.ts → 展示骨架摘要
→ Claude 逐区填筑建筑 → 运行 resolve-coords.ts → 输出完整 map.json
→ 运行 validate.ts（已有）
```

## 测试策略

1. **确定性**：相同 seed 输出相同骨架
2. **防重叠**：任意两个槽位的包围盒不相交
3. **分区比例**：各 zone 面积占比与参数偏差 ≤10%
4. **入口节点**：至少一个 slot 标记 `isEntry: true`
5. **边界**：极端参数（极小画布 16×12、dense 密度下最大建筑数）不崩溃
