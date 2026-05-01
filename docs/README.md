# agent-world 项目文档

LLM-as-NPC 模拟世界游戏。玩家以"导演 / 观察者"身份创建小型虚拟世界，向特定地点投放事件，观察由 LLM 驱动的 NPC 各自做出符合性格的反应。

## 文档结构

```
docs/
├── requirements/         # 需求设计文档
│   ├── 00-decisions.md       # 已收口的关键决策（先看这个）
│   ├── 01-map-system.md      # 地图系统
│   ├── 02-character-system.md# 角色系统
│   ├── 03-event-action-system.md # 事件与行动
│   ├── 04-game-loop.md       # 游戏循环与玩家定位
│   └── 05-frontend-ux.md     # Web 前端交互
└── tech-plan/            # 技术实现方案
    ├── 00-architecture.md    # 总体架构
    ├── stage-1-skeleton.md   # Stage 1 骨架
    ├── stage-2-playable.md   # Stage 2 可玩
    ├── stage-3-studio.md     # Stage 3 创作
    └── stage-4-plus.md       # Stage 4+ 候选
```

## 阶段路线图

| 阶段 | 时长 | 目标 |
|------|------|------|
| Stage 1 · Skeleton | 2 周 | 验证"性格能否驱动 NPC 差异化决策"——5 NPC × 8 节点的硬编码小镇 |
| Stage 2 · Playable | 3 周 | 升级为可玩的导演工具——事件注入、地图可视化、角色详情、暂停/快进 |
| Stage 3 · Studio | 2 周 | 让玩家可创世——世界编辑器、模板、历史回放、分支、导入导出 |
| Stage 4+ | P1 | 快照分享、多世界比较、永久死亡、国际化、移动端 |

## 关键决策一览

- **玩家** = 导演 / 观察者；不扮演 NPC，不与 NPC 对话；唯一主动交互方式是事件注入
- **时间步** = 1 游戏小时；1 日 = 24 步
- **地图** = 严格树形 4–6 层 + 显式特殊通道
- **决策** = LLM 选择封闭枚举的行动类型 + 自由生成行动内容
- **MVP 规模** = ≤ 20 NPC × ≤ 50 节点

详见 `requirements/00-decisions.md`。
