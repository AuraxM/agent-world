# 数值系统平衡设计

## 概述

构建一套底层数学框架，所有数值从一个核心锚点 **BME (Basal Metabolic Equivalent)** 推导。mod 只需提供角色的基础属性（age, health, 性格）和职业层级（tier 0-4），框架自动计算全部数值。目标：任何 mod/地图导入后角色都能长期稳定运行，涌现多样化的经济/心理状态。

---

## 第 1 节：核心锚点 — BME

### 公式

```
BME = metabolicBase(age) × healthFactor(health)
```

### metabolicBase(age)

| 年龄段 | 代谢基数 |
|--------|---------|
| 1-12 (儿童) | 0.6 |
| 13-17 (少年) | 0.85 |
| 18-50 (成年) | 1.0 |
| 51-65 (中年) | 0.9 |
| 66+ (老年) | 0.75 |

### healthFactor(health)

| health | 系数 |
|--------|------|
| 1 | 1.4 |
| 2 | 1.2 |
| 3 | 1.0 |
| 4 | 0.85 |

### 设计意图

BME 是纯生理参数，不依赖职业/地图/文化。它同时锚定消耗速度和劳动能力，形成"高消耗者的资源需求大"的涌现约束。

---

## 第 2 节：生理消耗系统

### 核心公式

```
decayRate(vital) = BME × baseRate(vital)
```

### baseRate 表

| 生理值 | baseRate | 说明 |
|--------|----------|------|
| hunger | 1.0/天 | 标准饥饿累积 |
| fatigue | 1.2/天 | 疲劳累积比饥饿快 20% |
| hygiene | 0.8/天 | 卫生下降比饥饿慢 20% |

### 生理值上限

统一为 16（BME=1.0 时约 16 天不进食达上限）。

### 阈值

| 生理值 | medium | severe |
|--------|--------|--------|
| hunger | 5 | 10 |
| fatigue | 5 | 10 |
| hygiene | 8 | 13 |

### 疲劳三阶段加速

| 阶段 (fatigue 值) | 速率 | BME=1.0 时效果 |
|-------------------|------|-----------------|
| 0-7 (正常) | BME × 0.5/天 | 慢速期 |
| 8-12 (中等) | BME × 1.0/天 | 标准速度 |
| 13-15 (严重) | BME × 2.0/天 | 加速崩溃 |

### 卫生活动修正

- 室内（residence 节点）：正常速率
- 室外：+30% 消耗

### 顶值惩罚

| 顶值持续 | 效果 |
|---------|------|
| 4 tick | mood -1 + 内心事件 |
| 8 tick | mood -1（累积 -2）+ stress +1 + 内心事件 |

---

## 第 3 节：经济系统

### 3.1 生存红线 (MDC)

```
MDC = eatCostPerDay + hygieneCostPerDay
eatCostPerDay    = 15
hygieneCostPerDay = 5
MDC = 20/天
```

### 3.2 收入层级

```
dailyIncome = BME × tierMultiplier × MDC
```

| tier | multiplier | BME=1.0 日收入 | 7日总收入 | 周净收入 (扣 MDC) |
|------|-----------|---------------|----------|------------------|
| 0 | 0 | 0 | 0 | -140 |
| 1 | 1.0 | 20 | 140 | 0 |
| 2 | 1.5 | 30 | 210 | +70 |
| 3 | 2.5 | 50 | 350 | +210 |
| 4 | 4.0 | 80 | 560 | +420 |

### 3.3 单次行动收支

```
eatCost = MDC × 0.75 = 15   // 重置 hunger
batheCost = MDC × 0.25 = 5  // 重置 hygiene
workIncomePerSession = dailyIncome / workSessionsPerDay
```

work 每次 10 tick（2 小时），角色自主决定每天工作次数（LLM 决策），fatigue 自然限制工作强度。

### 3.4 初始资金

```
initialMoney = MDC × 7 × tierMultiplier（clamp 最低 MDC × 7 = 140）
```

| tier | 初始资金 | 可支撑天数 |
|------|---------|-----------|
| 0 | 140 | 7 天 |
| 1 | 140 | 7 天 |
| 2 | 210 | 10.5 天 |
| 3 | 350 | 17.5 天 |
| 4 | 560 | 28 天 |

### 3.5 财富层级

保留现有 thresholds `[100, 500, 2000]`。
每周经济快照和平衡判定保留现有逻辑。

### 3.6 mod 作者使用方式

只需指定职业名和 tier (0-4)，框架自动计算所有收入数字。mod 可覆写 MDC 默认值以适配不同世界观。

---

## 第 4 节：情绪系统

### 4.1 mood

```
mood 向 0 回归速率 = 1.0 / (3 + |TF|)
```

| TF | 回归速率 | 从 ±3 回到 0 约需 |
|----|---------|-----------------|
| 0 (平衡) | 0.33/天 | 9 天 |
| ±2 | 0.20/天 | 15 天 |
| ±4 (极端) | 0.14/天 | 21 天 |

区间保持 [-4, +4] 不变。

### 4.2 stress

stress 不自动回归，仅由触发条件改变：

| 触发 | 变化 | 说明 |
|------|------|------|
| 8h 睡眠完成 | -1 | 主要减压手段 |
| 积极社交互动 | -0.5 | 社交减压 |
| 饥饿/疲劳/卫生顶值 8 tick | +1 | 身体极限导致压力 |

区间保持 [0, 4] 不变。同 tick 内同一情绪最多被事件修改 1 次。

### 4.3 social_satiety

```
每日衰减 = 0.4 + (EI + 4) × 0.075
每次社交获得 = 1.2 - |EI| × 0.1
```

| EI | 每日衰减 | +4 → -4 需 | 单次社交获得 |
|----|---------|-----------|-------------|
| -4 (极端内向) | 0.4/天 | ~20 天 | 1.6 |
| 0 (中性) | 0.7/天 | ~11 天 | 1.2 |
| +4 (极端外向) | 1.0/天 | ~8 天 | 0.8 |

区间保持 [-4, +4] 不变。

### 4.4 事件情绪影响

保留现有数值：

| 事件 | mood | stress |
|------|------|--------|
| attacked_self | -2 | +2 |
| received_help_gift | +1 | →0 |
| attacked_other | 0 | +1 |
| helped_gifted | +1 | 0 |
| negative_burst | -1 | +1 |
| positive_burst | +1 | 0 |

---

## 第 5 节：疾病系统

### 5.1 发病概率

```
baseProb(health):
  health=1: 0.20
  health=2: 0.10
  health=3: 0.05
  health=4: 0.02

modifiers:
  fatigue >= 12 && capTicks > 0  → ×1.5
  hunger >= 12 && capTicks > 0   → ×1.5
  hygiene >= 14                  → ×1.3

finalProb = min(baseProb × product(modifiers), 0.50)
```

### 5.2 持续时间

```
durationDays = base(health) + random(-2, +2), clamp [1, 10]
```

| health | base(天) | 范围 |
|--------|---------|------|
| 1 | 7 | 5-9 |
| 2 | 5 | 3-7 |
| 3 | 3 | 1-5 |
| 4 | 1 | 1-3 |

### 5.3 效果

- 发病时 mood -1
- 康复时 mood +1
- 疾病期间疲劳累积 ×2

---

## 第 6 节：行动系统

### 6.1 参数总览

| 行动 | 持续 | 消耗/获得 | 中断阈值 | 效果 |
|------|------|----------|---------|------|
| eat | 即时 | -MDC×0.75 | — | hunger → 0 |
| bathe | 即时 | -MDC×0.25 | — | hygiene → 0 |
| rest | 5 tick | 0 | 2 | fatigue -health |
| sleep | 40 tick | 0 | 3 | fatigue → 0, stress -1 |
| work | 10 tick | +dailyIncome/sessions | 3 | 获得收入 |
| move | 1 tick/步 | 0 | 3 | 移动路径 |
| wait | 5 tick | 0 | 2 | 等待 |

### 6.2 rest 恢复量

```
restFatigueReduction = health（直接取 health 值）
```

| health | 单次恢复 | 满疲劳恢复需 rest 次数 |
|--------|---------|---------------------|
| 4 | 4 | 4 |
| 3 | 3 | 6 |
| 2 | 2 | 8 |
| 1 | 1 | 16 |

### 6.3 睡眠窗口

- chronotype 窗口保留（start + duration，默认 22:00-06:00）
- 窗口外睡觉：fatigue 恢复效果打 7 折
- duration 范围保留 [4, 12] 小时

### 6.4 移动期间生理消耗

- hunger/fatigue 半数（仅 even hour tick 累积）
- hygiene 冻结

---

## 第 7 节：标准角色验证

BME=1.0, health=3, tier=2, 性格全中性：

| 系统 | 数值 |
|------|------|
| 饥饿累积 | +1.0/天 |
| 疲劳累积 | 0-7: +0.5/天; 8-12: +1.0/天; 13+: +2.0/天 |
| 卫生累积 | +0.8/天 |
| 吃饭 | 15/次 |
| 洗澡 | 5/次 |
| 日生存成本 | 20 |
| 日工作收入 (2次) | 30 |
| 日净收入 | +10 |
| 周净收入 | +70 |
| mood 回归 | 0.33/天 |
| stress | 每 8h 睡眠 -1 |
| 社交衰减 | 0.7/天 |
| 疾病概率 | 5%/天 |
| rest 恢复 | -3 fatigue |

---

## 表：完整数值速查

| 参数 | 值 | 来源 |
|------|-----|------|
| BME | 0.51 ~ 1.4 | age × health |
| VITAL_MAX | 16 | 固定 |
| hunger baseRate | 1.0/天 | 固定 |
| fatigue baseRate | 1.2/天 | 固定 |
| hygiene baseRate | 0.8/天 | 固定 |
| MDC | 20/天 | 固定（mod 可覆写） |
| eatCost | 15 | MDC × 0.75 |
| batheCost | 5 | MDC × 0.25 |
| tierMultiplier | [0, 1.0, 1.5, 2.5, 4.0] | tier 0-4 |
| initialMoney | MDC × 7 × tierMultiplier, min 140 | 公式 |
| sleepDuration | 8h (40 tick) | 固定 |
| workDuration | 2h (10 tick) | 固定 |
| restDuration | 1h (5 tick) | 固定 |
| restReduction | health 值 | health 属性 |
| mood 回归 | 1.0 / (3 + |TF|) /天 | TF 性格 |
| social 衰减 | 0.4 + (EI+4) × 0.075 /天 | EI 性格 |
| social 获得 | 1.2 - |EI| × 0.1 /次 | EI 性格 |
| stress 睡眠降 | -1/8h | 固定 |
| stress 社交降 | -0.5/次 | 固定 |
| sickness baseProb | [0.02, 0.05, 0.10, 0.20] | health 1-4 |
| sickness modifiers | ×1.5 (fatigue/hunger), ×1.3 (hygiene) | 固定 |
| sickness cap | 0.50 | 固定 |
| sickness duration | [1,10] 天 | health 驱动 |
| wealth thresholds | [100, 500, 2000] | 固定 |
