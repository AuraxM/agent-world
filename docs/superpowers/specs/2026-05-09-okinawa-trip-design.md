# 冲绳修学旅行 mod 设计文档

## 概述

场景 ID: `okinawa-trip`
名称: 冲绳修学旅行
语言: `zh`
类型: 日式高中修学旅行小型 mod
动作: 复用 `ouran-academy/actions.js`（6 个亲密社交动作）

## 地图 (15 节点)

线性海岸布局，旅馆为枢纽连通所有景点。

```
root (不可见根)
│
├── hotel (public, outdoor)
│   ├── hotel-lobby (public, indoor)
│   ├── hotel-dining (semi, indoor, dining)
│   ├── hotel-onsen (semi, indoor, bathing)
│   └── hotel-rooms (semi, indoor)
│       ├── room-301 海景 (private, indoor, residence)
│       ├── room-302 海景 (private, indoor, residence)
│       ├── room-303 海景 (private, indoor, residence)
│       ├── room-304 花园 (private, indoor, residence)
│       ├── room-305 花园 (private, indoor, residence)
│       ├── room-306 花园 (private, indoor, residence)
│       └── room-307 花园 (private, indoor, residence)
│
└── route (不可见路线)
    ├── beach (outdoor, public, playground) — 翡翠海滩
    ├── aquarium (indoor, semi, education) — 美丽海水族馆
    ├── old-village (outdoor, semi, education, quiet) — 琉球古民家
    ├── cafe (indoor, semi, dining) — 海边咖啡店
    ├── cape-manzamo (outdoor, public, park) — 万座毛展望岬
    ├── shuri-castle (outdoor, semi, education, quiet) — 首里城
    └── market-street (outdoor, public, street, dining) — 国际通商店街
```

### 设计要点

- `hotel` 同时作为入口节点
- 所有角色 `restNodeId` 指向各自的 `room-30x`
- 景点沿 `route` 线性排列，由北向南模拟真实冲绳行程
- `travelCost` 默认 1，最远端点（cape-manzamo, shuri-castle）为 2
- 无自定义事件

## 角色 (7 人)

全员高二同班，`origin: "visitor"`（除林海音为 `"local"`），`profession: "student"`，**`expenseExempt: false` 必须显式写**（引擎对未成年人默认豁免，不写 false 会导致费用永远不扣）。

### 经济设定

沿用 ouran-academy 的 economy 配置（survivalCosts: eat 15, bathe 10）。

| 角色 | 房间 | 性别 | initialMoney | 设定 |
|------|------|------|-------------|------|
| 林海音 | 301 | 女 | 650 | 冲绳本地渔业家庭，游泳部王牌 |
| 高桥真央 | 302 | 女 | 800 | 医生家庭独生女，摄影部 |
| 佐佐木优 | 303 | 女 | 200 | 父亲严厉，第一次离开东京看海 |
| 田中大翔 | 304 | 男 | 450 | 篮球部阳光男，暗恋海音 |
| 伊藤凉 | 305 | 男 | 500 | 吉他部酷帅男，真央的青梅竹马 |
| 小林夏希 | 306 | 女 | 350 | 排球部活宝，兄弟姐妹多 |
| 山田健太 | 307 | 男 | 300 | 单亲家庭，精打细算学习委员 |

### 预埋关系

- 大翔 → 海音: 暗恋，海音未察觉
- 真央 ↔ 凉: 青梅竹马，互有好感未捅破
- 夏希 ↔ 健太: 朋友以上恋人未满，夏希主导
- 优 → 海音: 崇拜/依赖
- 优 ↔ 真央: 室友，真央教优拍照

### 性格多样性

- 海音: 开朗外向 (ei: 3)，偏感性 (tf: -2)，冲绳本地人视角
- 真央: 健谈 (ei: 2)，有时间观念 (jp: 2)，社交达人
- 优: 内向 (ei: -3)，感性敏感 (tf: -3)，缺乏安全感
- 大翔: 阳光 (ei: 2)，情绪化 (tf: -2)，藏不住事
- 凉: 话少 (ei: -2)，冷静克制 (tf: 3)，观察力强
- 夏希: 话多活泼 (ei: 3, jp: -2)，随时随地搞事
- 健太: 内向温和 (ei: -1)，有条理 (jp: 3)，踏实但被动

## 动作

直接复用 `ouran-academy/actions.js`，包含 6 个亲密社交动作：

- `hold_hands` — 牵手
- `pat_head` — 摸头
- `caress` — 抚摸
- `unbutton` — 解开纽扣
- `lick_ear` — 舔耳
- `kiss` — 亲吻（覆盖内置）

## 不在范围内

- 无自定义事件
- 无自定义动作（纯复用）
- 无自定义 economy 配置（复用 ouran-academy 默认值）
