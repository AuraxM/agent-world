# Stage 2 · Playable（3 周）

## 目标

把 Skeleton 升级为**可玩的导演工具**。玩家可以以"上帝/导演"身份观察并主动投放事件，体验 NPC 涌现行为。

---

## 范围

### 包含
- React Flow 集成：地图层级可视化 + 关系图谱
- 角色详情卡 + 内心独白面板
- **事件投放抽屉 + 模板库（P0 核心玩法）**
- SSE 事件流推送
- 完整时间控件：暂停 / 播放 / 单步 / 倍速 / 快进 N 步
- 短期 FIFO + 长期重要度晋升的双层记忆
- Haiku 4.5 分级决策（聚焦 NPC = Sonnet, 背景 NPC = Haiku）
- Prompt cache（缓存性格 + 长期记忆段）
- 冲突调解事件（多 NPC 行动相撞 → 自动产生 ConflictEvent）
- 状态衰减自动触发的内部事件完整化（30+ 状态全覆盖）

### 不包含
- 编辑器 / 模板 → Stage 3
- 历史回放 / 分支 → Stage 3
- 导入导出 → Stage 3
- 暗色主题打磨 → Stage 3

---

## 新增 / 重构结构

### 前端
```
app/worlds/[id]/page.tsx          # 主视图（C 方案布局）
src/components/
├─ TimeControls.tsx               # 底部固定漂浮
├─ MapCanvas.tsx                  # React Flow 渲染层级
├─ Breadcrumb.tsx                 # 顶部
├─ SidebarTree.tsx                # 左侧可折叠
├─ CharacterDrawer.tsx            # 右抽屉（含独白面板）
├─ EventStream.tsx                # 右抽屉，SSE 接收
├─ InjectEventFAB.tsx             # 紫色 FAB
├─ InjectDrawer.tsx               # 投放表单 + 模板
├─ RelationGraph.tsx              # 关系图谱
└─ StoryBanner.tsx                # 强度≥4 故事横幅 / 强度=5 特写

src/store/
└─ worldStore.ts                  # Zustand: snapshot + event queue + UI state

src/hooks/
└─ useEventStream.ts              # SSE 客户端封装
```

### 后端
```
app/api/worlds/[id]/
├─ stream/route.ts                # GET, SSE
├─ inject/route.ts                # POST 投放事件
└─ run/route.ts                   # POST 自动播放（持续 tick）

src/engine/
├─ conflict-resolution.ts         # 行动冲突 → ConflictEvent
├─ scheduler.ts                   # 自动播放/快进的节奏控制
└─ memory/
   ├─ short-term.ts               # FIFO 50
   ├─ long-term.ts                # 重要度晋升 100
   └─ promote.ts                  # 短期 → 长期晋升规则

src/llm/
├─ tier-selector.ts               # Sonnet 还是 Haiku
└─ cache.ts                       # prompt cache 配置

src/templates/
└─ inject-events/
   ├─ environment.ts              # 下雨/停电/火警/...
   ├─ burst.ts                    # 袭击/意外/陌生人
   ├─ social.ts                   # 谣言/邀请/八卦
   └─ index.ts                    # 汇总导出
```

---

## 关键实现要点

### 1. 事件投放流程（P0）

```
玩家操作                     →  POST /api/worlds/:id/inject
                            →  写入 pending_events 表
                            →  SSE 立刻推送 "⚡ 你投放了..."（高亮）
                            →  下一 tick 引擎 from pending_events 拉取
                            →  合并到事件总线
                            →  各 NPC 感知 + 决策
```

**InjectDrawer 表单字段**：
| 字段 | 控件 | 默认值 |
|---|---|---|
| 地点 | 节点选择器（树） | 当前焦点节点 |
| 参与者 | 多选（NPC） | 空（= 节点内全员） |
| 类型 | 下拉（环境/突发/社交/任务） | 环境 |
| 强度 | 5 档点选 | 3 |
| 可见性 | 单选（节点 / 父层级 / 全局） | 节点 |
| 自由文本 | textarea | 模板填充 |

**模板库**（Stage 2 至少 15 个）：
- **环境类**：下雨 / 停电 / 火警 / 节日游行 / 寒潮 / 雾霾
- **突发类**：街头袭击 / 意外摔倒 / 陌生人闯入 / 物品丢失 / 走失儿童
- **社交类**：谣言扩散 / 公开邀请 / 小道消息
- **任务类**：匿名信 / 失物招领 / 神秘委托

每个模板 = 预填充 type/强度/默认描述。

**撤销逻辑**：仅在投放后、未被任何 NPC 感知前可撤销（即同一 tick 内，且 tick 尚未推进）。撤销 = 从 pending_events 删除。

### 2. SSE 事件推送

```typescript
// app/api/worlds/[id]/stream/route.ts
export async function GET(req, { params }) {
  const stream = new ReadableStream({
    start(controller) {
      const subscribe = (event: WorldEvent) => {
        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
      };
      eventBus.on(params.id, subscribe);
      // 心跳包每 15 秒
      const hb = setInterval(() => controller.enqueue(': heartbeat\n\n'), 15000);
      req.signal.addEventListener('abort', () => {
        clearInterval(hb);
        eventBus.off(params.id, subscribe);
      });
    }
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
}
```

前端 `useEventStream` hook：自动重连 + 接入 Zustand store。

### 3. 自动播放 / 快进

```
"推进 1 天" = 24 tick 串行执行
- 每个 tick 完成立即 SSE 推送（先动起来）
- 玩家可随时点"暂停"中断队列
- "推进 7 天" = 168 tick，前端可关闭页面，后端继续
```

实现：`scheduler.ts` 维护每个 worldId 的 tick 队列；`/api/worlds/:id/run` 提交批次任务。

### 4. Prompt 缓存策略

Anthropic prompt cache 标记：

| 段 | 缓存生命 | 内容 |
|---|---|---|
| 静态块 | 长 | 世界规则、NPC 性格描述（数值 + 文字） |
| 半静态块 | 中 | 长期记忆摘要、重要关系 |
| 动态块 | 不缓存 | 当前事件、可选行动、短期记忆 |

目标：缓存命中率 ≥ 60%（监控埋点）。

### 5. Tier Selector 规则

```typescript
function pickModel(npc, event, ui): 'sonnet' | 'haiku' {
  if (ui.followingNpcId === npc.id) return 'sonnet';
  if (event.intensity >= 4) return 'sonnet';
  if (ui.recentlyViewed.has(npc.id)) return 'sonnet';
  if (ui.fastForwardMode) return 'haiku';
  return 'haiku';
}
```

### 6. 双层记忆晋升

```
新经历产生
  ↓
push 到 shortMemory (FIFO)
  ↓
shortMemory.length > 50?
  ↓ 是
取出最旧的一条 → 评估晋升:
  - 自评 importance ≥ 4? OR
  - 涉及核心关系（亲密度 ≥ 70 或 ≤ -70）? OR
  - 强度 ≥ 4 事件?
  ↓ 命中其一
push 到 longMemory
  ↓
longMemory.length > 100?
  ↓ 是
按 importance 升序丢弃最低
```

### 7. 冲突仲裁

```typescript
function detectConflicts(actions: Action[]): ConflictEvent[] {
  const conflicts = [];
  // 同一物品被多人 interact_object
  // 同一座位被多人 occupy
  // 同一目标被多人 attack
  for (const group of groupBy(actions, a => a.targetId)) {
    if (group.length > 1) {
      conflicts.push({
        category: 'system',
        description: `${group.map(a => a.actorId)} 同时争夺 ${group[0].targetId}`,
        participants: group.map(a => a.actorId),
        scope: { kind: 'node', nodeId: group[0].locationId },
        intensity: 3,
      });
    }
  }
  return conflicts;
}
```

冲突事件注入下一 tick 的 pending_events，让涉及方各自决策；当前 tick 的冲突 actions 全部失败。

### 8. 状态衰减完整化

每 tick 处理 30+ 状态：

| 类型 | 示例 | 衰减规则 |
|---|---|---|
| 生理 | 饥饿、疲惫、口渴 | 每 tick +1，到阈值升档 |
| 心理 | 无聊（独处时 +1，社交时清零）| 上下文敏感 |
| 社交 | 孤独（无交互 4h+1） | 长间隔触发 |

每个状态阈值上探时产生对应内部事件（如 hunger ≥ 5 → InnerEvent: "肚子饿了"）。

---

## 实现任务清单

### Week 1: 基础升级
- [ ] 集成 React Flow + dagre 布局，渲染层级树
- [ ] 节点点击、双击钻入、面包屑、侧栏树三件套
- [ ] CharacterDrawer：性格雷达、状态、记忆、关系
- [ ] 内心独白面板（实时显示 LLM reasoning）
- [ ] 双层记忆引擎实现 + 晋升规则
- [ ] 30+ 状态衰减规则
- [ ] 测试：5 NPC × 24 tick 跑出有差异的"一天"

### Week 2: 核心交互
- [ ] InjectDrawer 表单 + 字段校验
- [ ] 模板库（≥ 15 个）
- [ ] `/api/worlds/:id/inject` 路由 + 引擎合并逻辑
- [ ] 撤销最近一次投放
- [ ] SSE stream 路由 + 前端 EventSource 客户端 + 心跳
- [ ] 时间控件全套（单步/播放/倍速/快进 N 步）
- [ ] `/api/worlds/:id/run` 路由 + scheduler
- [ ] 关系图谱视图
- [ ] 冲突仲裁逻辑

### Week 3: LLM 优化与打磨
- [ ] Haiku 客户端 + Tier Selector
- [ ] Prompt cache 接入 + 命中率监控埋点
- [ ] 思考动画（Framer Motion）
- [ ] 故事横幅（强度≥4）/ 特写蒙版（强度=5）
- [ ] 跟随观察模式
- [ ] 性能压测：20 NPC × 50 节点 × 24 tick
- [ ] 演示视频：投放"突然停电"看 5 NPC 反应差异

---

## 验收标准

1. ✅ 玩家可在地图任意节点上点右键投放事件，下一 tick 即生效
2. ✅ 投放"突然停电"在教室 → 教室内 5 个不同性格 NPC 反应肉眼可辨
3. ✅ "推进 24 小时" → 5 分钟内完成，且事件流内容连贯可读
4. ✅ 跟随某 NPC 后事件流自动过滤
5. ✅ 内心独白展示符合性格的推理
6. ✅ Prompt cache 命中率 ≥ 60%（监控日志中验证）
7. ✅ 20 NPC × 50 节点世界初始化 + 跑 1 天无崩溃
8. ✅ 强度=5 事件触发特写蒙版，时间自动暂停
9. ✅ 同 tick 内 2+ NPC 抢同一物品 → 下一 tick 出现 ConflictEvent
10. ✅ 双层记忆：短期 50 条满了能正确晋升到长期

---

## 风险与备案

| 风险 | 备案 |
|---|---|
| SSE 长连接稳定性 | 心跳包 15s + 前端自动重连（指数退避，上限 30s） |
| React Flow 大量节点性能 | 50 节点应足够流畅；超出则启用虚拟化或仅渲染当前层 |
| 快进模式下 LLM 限流 | 引擎内置请求队列与 RPM 限制；超限 → 自动等待 |
| 冲突仲裁逻辑爆炸 | 仅做最简单的检测（同物品 / 同座位 / 同攻击目标）；其他冲突让 LLM 自己处理 |
| Haiku 决策质量下降 | A/B：聚焦 NPC 仍用 Sonnet；如 Haiku 太弱可针对 prompt 加强角色画像 |
| 玩家投放滥用 | UI 上明显区分"⚡ 注入"和"自然事件"图标，便于复盘；无频次限制 |

---

## 性能与成本预估

20 NPC × 24 tick × 1 天：
- 假设 60% 触发决策（不是每 tick 都决策）→ 约 290 次调用
- 60% Haiku（背景），40% Sonnet（聚焦）→ 约 175 次 Haiku + 115 次 Sonnet
- Haiku ≈ $0.001/次，Sonnet ≈ $0.005/次
- 单日成本 ≈ $0.75；启用 prompt cache 后 ≈ $0.30
- 端到端时间：每 tick 约 5–10 秒（并行决策）→ 24 tick ≈ 2–4 分钟

---

## Stage 2 完成后产出

- 一个真正可玩的"导演工具"：玩家可暂停、快进、投放事件、跟随 NPC、看到关系演化
- 内置"晨曦小镇"+ 一个 20 NPC × 50 节点压测世界
- 双层记忆 + Tier Selector + prompt cache 完整接入
- 冲突仲裁 + 状态衰减完整化

下一步进入 Stage 3，让玩家可创世。
