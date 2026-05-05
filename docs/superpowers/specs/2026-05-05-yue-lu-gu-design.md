# 月露谷 (Yue Lu Gu) 世界设计

## 概述

月露谷是一个受《星露谷物语》启发的 agent-world mod，语言为简体中文。核心体验为**村庄社交**，设定在**湖滨小镇**，以**月亮与萤火虫传说**为灵魂。世界结构为**线性湖岸式**——沿湖主路从西到东展开，湖是贯穿始终的风景线。

## 世界总览

| 属性 | 值 |
|------|-----|
| ID | `yue-lu-gu` |
| 名称 | 月露谷 |
| 语言 | `zh` |
| 入口 | 巴士站「月露谷」 |
| 结构 | 线性湖岸式 |
| 规模 | 42 地点、25 角色 |
| 自定义动作 | 无，使用内置系统 |

## 地图节点（42个）

### 西端·入口区（3节点）

- **巴士站「月露谷」** (`node-bus-stop`) — 入口节点。县道终点小候车亭，吉田光代每日三班车。`tags: [public, outdoor, street]`
  - 候车亭杂货摊 — 简单的售货棚
  - 巴士站停车场·公共厕所

### 中段·湖畔主街（12节点）

沿湖石板路，灯笼柱列，湖在左手边，店铺在右手边。

- **湖畔主街** (`node-main-street`) — 主干道。`tags: [public, outdoor, street]`
  - 杂货店「月の店」(`node-general-store`) — 日用百货兼邮便。`tags: [public, indoor]`
    - 杂货店内宅 (`node-store-quarters`) — 林月生独居。`tags: [private, indoor, residence, dining, bathing]`
  - 酒馆「蛍火」(`node-tavern`) — 年轻人聚集的社交中心。`tags: [public, indoor, dining]`
    - 酒馆二楼 (`node-tavern-quarters`) — 萤独居。`tags: [private, indoor, residence, dining, bathing]`
  - 月露谷诊疗所 (`node-clinic`) — 木下环三代目医师。`tags: [semi, indoor]`
    - 诊疗所内宅 (`node-clinic-quarters`) — 木下环、白川杏同住。`tags: [private, indoor, residence, dining, bathing]`
  - 木工房 (`node-carpenter`) — 山根健的桧木工房兼住宅。`tags: [private, indoor, residence, dining, bathing]`
  - 铁匠铺 (`node-blacksmith`) — 黑川铁三代目。`tags: [semi, indoor]`
  - 町立文库 (`node-library`) — 旧校舍改造。`tags: [semi, indoor, quiet]`
    - 文库管理员宅 (`node-library-quarters`) — 青野千夏独居。`tags: [private, indoor, residence, dining, bathing]`
  - 湖畔广场 (`node-town-square`) — 市集与节庆场地。`tags: [public, outdoor]`
  - 镇公所 (`node-town-hall`) — 月露谷役场。`tags: [public, indoor]`

### 湖面区（4节点）

- **月露湖** (`node-lake`) — 山间天然湖。`tags: [public, outdoor]`
  - 码头 (`node-dock`) — 小船停泊·钓鱼。`tags: [public, outdoor]`
  - 湖心岛 (`node-island`) — 古木之岛，小舟可达。`tags: [public, outdoor, quiet]`
    - 月见台 (`node-moon-viewing`) — 赏月最佳点。`tags: [public, outdoor, quiet]`
  - 湖畔钓台 (`node-fishing-pier`) — 伸入湖中的木栈台。`tags: [public, outdoor]`

### 东端·神社与森林区（7节点）

- **月之神社** (`node-shrine`) — 祭月古社，萤火虫传说起点。`tags: [semi, outdoor, quiet]`
  - 神社本殿 (`node-shrine-hall`) — 祭月之仪式的场所。`tags: [semi, indoor]`
  - 石灯笼参道 (`node-shrine-path`) — 百段石灯笼，入夜如梦。`tags: [public, outdoor]`
  - 宫司宅 (`node-priest-house`) — 宫司清独居。`tags: [private, indoor, residence, dining, bathing]`
- **萤火虫之森** (`node-firefly-forest`) — 神社后的天然林。`tags: [public, outdoor, quiet]`
  - 萤之丘 (`node-firefly-hill`) — 萤火虫最密集处。`tags: [public, outdoor, quiet]`
  - 月见岩 (`node-moon-rock`) — 传说中月之落泪处。`tags: [public, outdoor, quiet]`

### 南坡·生产区（8节点）

- **南坡农田** (`node-farmland`) — 湖畔缓坡耕地。`tags: [semi, outdoor]`
  - 月浦农园 (`node-farm`) — 朝仓夫妇的蔬菜农园。`tags: [semi, outdoor]`
    - 农园宅 (`node-farmhouse`) — 朝仓一家三口。`tags: [private, indoor, residence, dining, bathing]`
  - 老农户宅 (`node-old-farmhouse`) — 田边丰、田边菊和孙女芽。`tags: [private, indoor, residence, dining, bathing]`
  - 直卖所 (`node-farm-stand`) — 晨采蔬菜直销。`tags: [public, outdoor]`
- **丘上牧场** (`node-ranch`) — 南坡高处放牧地。`tags: [semi, outdoor]`
  - 牛舍·鸡舍 (`node-barn`) — `tags: [semi, indoor]`
  - 牧场主宅 (`node-ranch-house`) — 牧野骏独居。`tags: [private, indoor, residence, dining, bathing]`

### 外围散落·独立住宅（5节点）

- 湖岸小舍 (`node-fisher-hut`) — 古贺渚独居。`tags: [private, indoor, residence, dining, bathing]`
- 退休教员宅 (`node-teacher-house`) — 柳田和歌独居。`tags: [private, indoor, residence, dining, bathing]`
- 画家的小屋 (`node-painter-hut`) — 都市移住画家。`tags: [private, indoor, residence, dining, bathing]`
- 猎师山小屋 (`node-hunter-hut`) — 狩野熊独居。`tags: [private, indoor, residence, dining, bathing]`
- 养蜂人宅 (`node-beekeeper-house`) — 峰小雪独居。`tags: [private, indoor, residence, dining, bathing]`

## 角色（25人）

### 年轻世代（12人 · 18-26岁）

| ID | 姓名 | 年龄 | 性别 | 职业 | 起源 | 居住地 |
|----|------|------|------|------|------|--------|
| char-lin-yuesheng | 林月生 | 24 | male | grocer | local | 杂货店内宅 |
| char-ying | 萤 | 22 | female | innkeeper | local | 酒馆二楼 |
| char-asakura-yu | 朝仓悠 | 25 | male | farmer | local | 农园宅 |
| char-asakura-kasumi | 朝仓花澄 | 24 | female | farmer | local | 农园宅 |
| char-aono-chinatsu | 青野千夏 | 23 | female | librarian | visitor | 文库管理员宅 |
| char-kurokawa-tetsu | 黑川铁 | 26 | male | blacksmith | local | 铁匠铺 |
| char-mizushima-ren | 水岛莲 | 21 | female | tailor | local | 仕立屋 |
| char-shirakawa-an | 白川杏 | 22 | female | nurse | local | 诊疗所内宅 |
| char-koga-nagisa | 古贺渚 | 25 | male | fisherman | local | 湖岸小舍 |
| char-mine-koyuki | 峰小雪 | 23 | female | unemployed | visitor | 养蜂人宅 |
| char-makino-shun | 牧野骏 | 24 | male | rancher | local | 牧场主宅 |
| char-kusakabe-yuzu | 日下部柚 | 19 | female | student | visitor | 酒馆二楼（寄宿） |

### 中年世代（6人 · 42-58岁）

| ID | 姓名 | 年龄 | 性别 | 职业 | 起源 | 居住地 |
|----|------|------|------|------|------|--------|
| char-yanagida-masakazu | 柳田正和 | 48 | male | mayor | local | 镇公所 |
| char-kishita-tamaki | 木下环 | 52 | female | doctor | local | 诊疗所内宅 |
| char-tanabe-yutaka | 田边丰 | 55 | male | farmer | local | 老农户宅 |
| char-guji-kiyoshi | 宫司清 | 58 | male | priest | local | 宫司宅 |
| char-yamane-ken | 山根健 | 42 | male | carpenter | local | 木工房 |
| char-yoshida-mitsuyo | 吉田光代 | 45 | female | mailman | local | 巴士站旁 |

### 长者世代（4人 · 68-76岁）

| ID | 姓名 | 年龄 | 性别 | 职业 | 起源 | 居住地 |
|----|------|------|------|------|------|--------|
| char-tanabe-kiku | 田边菊 | 76 | female | unemployed | local | 老农户宅 |
| char-kano-kuma | 狩野熊 | 68 | male | hunter | local | 猎师山小屋 |
| char-yanagida-waka | 柳田和歌 | 72 | female | teacher | local | 退休教员宅 |
| char-shioda-gen | 潮田源 | 70 | male | fisherman | local | 码头小屋 |

### 孩子（3人 · 8-12岁）

| ID | 姓名 | 年龄 | 性别 | 职业 | 起源 | 居住地 |
|----|------|------|------|------|------|--------|
| char-asakura-taichi | 朝仓太一 | 8 | male | student | local | 农园宅 |
| char-tanabe-mei | 田边芽 | 12 | female | student | visitor | 老农户宅 |
| char-yanagida-koharu | 柳田小春 | 11 | female | student | local | 镇公所 |

## 核心角色关系

### 家族关系

- 朝仓悠 ↔ 朝仓花澄：spouse（夫妻）
- 朝仓悠+花澄 → 朝仓太一：son（儿子）
- 林月生 → 杂货店前店主（未实装）：继承
- 田边丰 → 田边菊：son（母子）
- 田边丰 → 田边芽：grandfather（外祖父），芽是访客
- 日下部柚 → 萤：cousin（表妹），暑假寄宿酒馆
- 柳田正和 → 柳田小春：father（父女）
- 柳田和歌 → 柳田正和：mother（母子）
- 木下环 → 前代医师（未实装）：三代目继承

### 师徒/职业关系

- 潮田源 → 古贺渚：师傅（钓鱼）
- 狩野熊 → 牧野骏：熟识（猎人常去牧场）
- 宫司清 ↔ 柳田和歌：旧识（神社与教员）

### 社交核心节点

- **萤**（酒馆女将）：全镇社交枢纽，知道所有人
- **林月生**（杂货店）：日常物资，全镇必经
- **吉田光代**（巴士司机）：外界信息的唯一通道

## 经济设定

```json
{
  "mdc": 20,
  "survivalCosts": { "eat": 10, "bathe": 4 },
  "professionIncomes": {
    "high": { "min": 80, "max": 120 },
    "medium": { "min": 40, "max": 70 },
    "low": { "min": 10, "max": 30 },
    "none": { "min": 0, "max": 0 }
  },
  "wealthTiers": [100, 500, 2000],
  "balanceThresholds": {
    "positive": [10, 50, 150, 400],
    "negative": [0.1, 0.3, 0.6, 1.0]
  }
}
```

收入层级：doctor/merchant/mayor → high，nurse/student/unemployed → low，其余 → medium。

## 验证清单

- [ ] 至少 1 个 `isEntry: true` 节点（巴士站）
- [ ] 至少 1 个 `bathing` 标签节点（所有住宅）
- [ ] 刚好 1 个根节点（`parentId: null`）
- [ ] 所有 `parentId` 引用存在
- [ ] 所有 `tags` 和 `privacy` 来自 `NODE_TAGS` 枚举
- [ ] `manifest.json` 的 `language: "zh"`，`id: "yue-lu-gu"`
- [ ] 角色 `profession` 来自 `PROFESSIONS` 枚举
- [ ] 角色 `personality` 4 维度完整
- [ ] 未使用运行时字段（worldId, locationId, vitals, emotion 等）
