# Stage 3 · Studio（2 周）

## 目标

让玩家**从"玩 demo 世界"升级为"创作自己的世界"**，并能完整复盘已发生的故事。

---

## 范围

### 包含
- 世界编辑器（创建/编辑节点、NPC、初始关系）
- 模板库（小镇 / 校园 / 公司 / 家庭剧 / 中世纪村庄 ≥ 5 个）
- 时间轴回放视图
- 分支创建（从历史某 tick 派生新世界）
- 导入 / 导出（单世界 JSON）
- 暗色主题 + 故事字体打磨
- 多世界管理（首页选择世界）

### 不包含
- 多人协作 / 共享 → Stage 4+
- 国际化 i18n → Stage 4+
- 移动端深度优化 → Stage 4+

---

## 新增结构

```
app/
├─ worlds/page.tsx                  # 多世界首页
├─ worlds/new/page.tsx              # 新建：模板 / 自定义
├─ worlds/[id]/editor/page.tsx      # 编辑器
├─ worlds/[id]/replay/page.tsx      # 回放
└─ api/worlds/
   ├─ route.ts                      # POST 创建 / GET 列表
   ├─ [id]/branch/route.ts          # POST 从某 tick 派生
   ├─ [id]/export/route.ts          # GET 导出 JSON
   └─ import/route.ts               # POST 导入 JSON

src/components/editor/
├─ MapEditor.tsx                    # React Flow 节点 CRUD
├─ NodeForm.tsx                     # 节点属性面板
├─ CharacterEditor.tsx              # 角色编辑（性格雷达图可拖动）
├─ RelationMatrix.tsx               # 关系矩阵
└─ TemplatePicker.tsx               # 模板选择卡片

src/components/replay/
├─ Timeline.tsx                     # 时间游标
├─ ReplayControls.tsx               # 倍速、跳转
└─ KeyMomentList.tsx                # 关键事件锚点

src/templates/worlds/
├─ small-town.ts
├─ school.ts
├─ office.ts
├─ family.ts
└─ medieval-village.ts

src/theme/
├─ tokens.ts                        # 设计 tokens（颜色、字号、间距）
└─ globals.css                      # 暗色为默认 + 故事字体导入
```

---

## 关键实现要点

### 1. 世界编辑器

#### 地图编辑
- React Flow 节点拖拽 + 父子连线
- 节点点击 → 右侧 NodeForm（名称、描述、tags、容量、私密度、可见性）
- 实时校验：
  - 父子层级合法性（深度 ≤ 6、不可成环）
  - 节点名重复检测（同父下唯一）
  - 容量正数

#### NPC 编辑
- 性格雷达图：8 维滑块；可点选预设档位（极内向/内向/中性/外向/极外向）
- 性格描述自动生成：根据数值组合，从模板库选一段描述
- 能力多选 + 等级
- 初始状态多选
- 头像：Stage 3 用 emoji 或预设头像库（avatar 生成留 P1）

#### 关系矩阵
- N×N 表格，每个 cell 点击 → 弹窗设置（好感、信任、熟悉、依赖）
- 单向：A→B 与 B→A 是两个 cell
- 关系类型选择（朋友/敌人/家人/...）+ 4 维数值

#### 实时校验与孤儿检测
- 提交保存前校验：
  - 没有节点 → 拒绝
  - NPC `locationId` 必须在节点列表中
  - 关系中引用的 NPC ID 必须存在

#### 保存为模板
- 编辑完成后可"另存为模板" → 输出 `template.json`（剥离 events_log + snapshots）
- 用户模板存在 `user_templates` 表

### 2. 模板库

每个内置模板包含：
- 完整地图（节点 + 父子关系）
- 完整 NPC 集（性格 + 能力 + 初始状态）
- 初始关系矩阵
- **故事种子**：一组潜在剧情线的 NPC 配置
  - 例：校园模板的"暗恋同班同学的内向少女"
  - 例：小镇模板的"与邻居有宿怨的脾气暴躁老头"

模板文件结构：
```typescript
type WorldTemplate = {
  id: string;
  name: string;
  description: string;
  tags: string[];           // ['校园','现代','日常']
  thumbnail?: string;
  nodes: MapNode[];
  characters: Character[];
  initialRelations: Relation[];
  storySeeds: string[];     // 给玩家的"开始建议"
};
```

### 3. 时间轴回放

#### 数据加载策略
```
玩家拖动到 tick T
  ↓
找到最近一个 snapshot（snapshot.tick ≤ T 的最大值）
  ↓
从 snapshot 反序列化世界状态
  ↓
重放 events_log[snapshot.tick .. T] 应用到状态
  ↓
渲染该 tick 的世界
```

不重新调 LLM —— 所有决策结果从 events_log 读取。

#### 关键锚点
- 强度 ≥ 4 的事件自动作为时间轴上的可点击锚点
- 玩家可手动添加"故事书签"

#### 倍速回放
- 仅前端动效加速，不重新调 LLM

### 4. 分支

```
点击"从此分支" (在某个 tick T)
  ↓
POST /api/worlds/[id]/branch?fromTick=T
  ↓
后端:
  - 创建新 world (newId, parentWorldId=id, branchedAtTick=T)
  - 复制 nodes + characters（基于 T 时刻的 snapshot 重建）
  - 复制 events_log[0..T]
  - 设 current_tick = T
  ↓
返回 newId → 前端跳转到新世界
```

UI：在世界列表展示"血缘树"——某世界派生自哪个世界的哪个 tick。

### 5. 导入 / 导出

#### 导出
```
GET /api/worlds/:id/export
  ↓
SELECT * FROM worlds, nodes, characters, events_log, snapshots WHERE world_id=:id
  ↓
打包为 JSON，文件名 `world-${name}-${tick}.json`
```

#### 导入
```
POST /api/worlds/import (multipart/form-data 或 application/json)
  ↓
解析 + 校验 schema (Zod)
  ↓
分配新 worldId（避免冲突）
  ↓
INSERT 全部表
  ↓
返回新 worldId
```

#### 仅模板导出
- 选项："导出为模板"：剥离 events_log + snapshots，仅保留初始状态

### 6. 主题与排版

#### 设计 tokens
```typescript
// src/theme/tokens.ts
export const tokens = {
  colors: {
    bg: { primary: '#0F0F14', secondary: '#181821', card: '#1F1F2A' },
    text: { primary: '#E8E4D6', secondary: '#A8A498', muted: '#6B6859' },
    accent: { primary: '#9F7AEA', warning: '#F59E0B', danger: '#EF4444' },
    status: { calm: '#60A5FA', heated: '#F87171', joyful: '#FBBF24', sad: '#818CF8' },
  },
  fonts: {
    ui: 'Inter, system-ui, sans-serif',
    story: '"Source Han Serif", "Noto Serif SC", serif',  // 内心独白 + 经历
  },
  spacing: { ... },
  radius: { ... },
};
```

#### 全局样式
- `<body>` 默认应用暗色背景
- 故事字体：内心独白、经历、事件描述用 serif
- UI 字体：按钮、菜单、表单用 sans
- 行高 1.7、最大宽度 65 字符（故事文本块）

### 7. 多世界首页

```
/worlds
  ├─ 列表：每个世界的卡片
  │   ├─ 名称 + 缩略图 + 当前时间 + NPC 数 + 节点数
  │   └─ 操作：进入 / 编辑 / 导出 / 删除（带确认）
  └─ "+ 新建世界" → /worlds/new
```

`/worlds/new`：
- 模板卡片网格 + "完全自定义"入口
- 选择模板 → 立即创建并跳转到主视图（模板已加载）
- 完全自定义 → 跳转到编辑器

---

## 实现任务清单

### Week 1: 编辑器 + 模板
- [ ] 多世界首页（worlds/page.tsx）
- [ ] 新建流程（worlds/new/page.tsx）
- [ ] 编辑器骨架（worlds/[id]/editor/page.tsx）
- [ ] MapEditor：节点 CRUD + 拖拽连接父子 + 实时校验
- [ ] NodeForm：所有节点属性的编辑
- [ ] CharacterEditor：8 维性格雷达 + 能力 + 状态
- [ ] RelationMatrix：N×N 关系编辑
- [ ] 5 个内置模板 + 故事种子文案
- [ ] "另存为模板"功能

### Week 2: 回放 + 分支 + 导入导出 + 主题
- [ ] Timeline + ReplayControls：拖动游标、倍速、跳转
- [ ] KeyMomentList：自动锚点（强度 ≥ 4）+ 手动书签
- [ ] 回放数据加载策略（snapshot + events_log 重放）
- [ ] "从此分支"功能 + 血缘树展示
- [ ] 导出 / 导入 API + 前端按钮
- [ ] 仅模板导出
- [ ] 应用 design tokens 到全局
- [ ] 故事字体导入（Source Han Serif / Noto Serif SC）
- [ ] 验收 demo

---

## 验收标准

1. ✅ 玩家可从 0 创建一个 5 NPC × 8 节点的世界，全程不写代码
2. ✅ 应用模板"校园" → 30 秒内进入可玩状态
3. ✅ 回放任一历史时点 → 准确还原当时的世界状态
4. ✅ 从 tick=12 派生新世界，注入不同事件，故事走向不同
5. ✅ 导出某世界 → 导入到另一台机器 → 状态完整一致
6. ✅ 编辑器对非法配置（孤儿 NPC、循环引用）有明确报错
7. ✅ 全局暗色主题，长文本（独白）使用 serif 字体，可读性好
8. ✅ 多世界首页一目了然，能区分"原创世界 vs 派生世界"

---

## 风险与备案

| 风险 | 备案 |
|---|---|
| 编辑器复杂度爆炸 | 严格按"最小可用"做：能创建+编辑就行；高级特性（拖拽移动子树、批量操作）留 P1 |
| 回放性能（大事件日志）| snapshot 间隔从 24 tick 减到 12；超大世界开启"只读模式"，禁用部分动效 |
| 分支血缘树视觉混乱 | 仅展示一层（直接父世界）；多层用列表而非图 |
| 导入恶意 JSON | 严格 Zod 校验 + 字段白名单；导入前预览 |
| 字体加载慢 | self-host + font-display: swap；fallback 到系统 serif |

---

## Stage 3 完成后产出

- 完整的"创世工具":  从模板/空白创建 → 编辑 → 模拟 → 回放 → 分支 → 导出/分享
- 5 个高质量内置模板（含故事种子）
- 暗色主题 + 故事字体的完整视觉打磨
- 多世界并存管理

到此 MVP 完成。下一步进入 Stage 4+，根据真实玩家反馈决定优先级。
