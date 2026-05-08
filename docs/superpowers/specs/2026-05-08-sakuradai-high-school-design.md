# 桜台高校 Mod 设计文档

## 概览

| 属性 | 值 |
|------|-----|
| pack-id | `sakuradai-high-school` |
| 语言 | `zh` (Chinese) |
| 基调 | 混合（轻松日常 + 青春成长） |
| 节点总数 | 57 |
| 角色总数 | 25 |
| 入口节点 | JR桜台駅 |
| 洗浴节点 | 体育館シャワー室 + 角色各住宅 |

## 地图结构

### 节点分区

| 区域 | 节点数 | 包含 |
|------|--------|------|
| JR车站区 | 4 | JR桜台駅(入口), 駅前広場, 駅前通, 駐輪場 |
| 商业街区 | 11 | 桜坂商店街, コンビニ, パン屋, ラーメン屋, 純喫茶, 商店街裏路地, カラオケ, ファミレス, 本屋, 駄菓子屋, ゲームセンター |
| 神社/自然区 | 5 | 神社参道, 桜台神社, 桜川, 河川敷公園, 桜台橋 |
| 住宅区 | 18 | 北住宅街, 南住宅街, アパート桜荘, 高橋家, 佐藤家, 田中家, 鈴木家, 山田家, 中村家, 小林家, 松本ハイツ, 渡辺家, 伊藤ハイツ, 斎藤家, 公民館, 桜台病院, 桜が丘, バス停 |
| 学区 | 19 | 桜台高校 校門, 校庭, 教学楼1F, 1-A教室, 2-A教室, 3-A教室, 図書館, 学生食堂, 屋上, 体育館, 体育館シャワー室, グラウンド, 部室棟, 部室_美術部, 部室_吹奏楽部, 部室_生徒会室, 部室_文芸部, 購買部, 通学路 |

### 节点树层次

```
JR桜台駅 (root, entry)
├── 駅前広場
├── 駅前通
│   ├── 桜坂商店街
│   │   ├── [11商业节点]
│   ├── 北住宅街
│   │   └── [5住宅节点]
│   └── 南住宅街
│       └── [7住宅节点]
├── 駐輪場
├── 通学路
│   └── 桜台高校 校門
│       └── [19学区节点]
├── 神社参道
│   └── 桜台神社
├── 桜川
│   ├── 河川敷公園
│   └── 桜台橋
├── 桜が丘
├── 桜台病院
├── バス停
└── 公民館
```

## 角色构成

### 教职员工 (4)

| # | ID | 姓名 | 年龄 | 性别 | 职业 | 定位 |
|---|----|------|------|------|------|------|
| 1 | char-moriyama-kenichi | 森山 健一 | 42 | male | teacher | 2-A班主任，国語教師，稳重宽厚 |
| 2 | char-oki-yoko | 大木 葉子 | 29 | female | nurse | 保健室老师，开朗爱八卦 |
| 3 | char-kitagawa-shizuka | 北川 静 | 35 | female | librarian | 图书馆司书，安静寡言 |
| 4 | char-yoshida-genji | 吉田 源治 | 58 | male | unemployed | 校务员，沉默寡言的老爷子 |

### 小镇居民 (6)

| # | ID | 姓名 | 年龄 | 性别 | 职业 | 定位 |
|---|----|------|------|------|------|------|
| 5 | char-matsushita-kohei | 松下 幸平 | 45 | male | baker | 面包店店主，小镇情报站 |
| 6 | char-kimura-takashi | 木村 隆 | 38 | male | chef | 拉面店店主，热血豪爽 |
| 7 | char-tanabe-master | 田辺 マスター | 52 | male | innkeeper | 纯喫茶店主，绅士风度 |
| 8 | char-fujiwara-sensei | 藤原 医師 | 55 | male | doctor | 小镇诊所医生，温和理性 |
| 9 | char-inagaki-guji | 稲垣 宮司 | 48 | male | priest | 神社宫司，随和幽默 |
| 10 | char-ishii-mayu | 石井 真由 | 26 | female | grocer | 便利店店员，备考大学中 |

### 三年级 (5)

| # | ID | 姓名 | 年龄 | 性别 | 职业 | 定位 |
|---|----|------|------|------|------|------|
| 11 | char-tanaka-kakeru | 田中 翔 | 18 | male | student | 野球部王牌投手，热血直率 |
| 12 | char-sato-mafu | 佐藤 真冬 | 18 | female | student | 生徒会長，冷静完美主义 |
| 13 | char-takahashi-ren | 高橋 蓮 | 18 | male | student | 美術部部長，寡言敏锐 |
| 14 | char-suzuki-kanon | 鈴木 花音 | 18 | female | student | 吹奏楽部部长，开朗活泼 |
| 15 | char-yamada-kaito | 山田 海斗 | 18 | male | student | 帰宅部，轻浮爱玩 |

### 二年级 (6)

| # | ID | 姓名 | 年龄 | 性别 | 职业 | 定位 |
|---|----|------|------|------|------|------|
| 16 | char-nakamura-yui | 中村 優衣 | 17 | female | student | 図書委員，内向书虫 |
| 17 | char-kobayashi-hayate | 小林 颯 | 17 | male | student | サッカー部，酷酷的单亲少年 |
| 18 | char-ito-kotomi | 伊藤 琴美 | 17 | female | student | 演劇部，戏剧化表达 |
| 19 | char-watanabe-daichi | 渡辺 大地 | 17 | male | student | 帰宅部ゲーマー，懒散敏锐 |
| 20 | char-saito-sakura | 斎藤 桜 | 17 | female | student | 转校生，神秘美少女 |
| 21 | char-matsumoto-riku | 松本 陸 | 17 | male | student | 文芸部，温和文静 |

### 一年级 (4)

| # | ID | 姓名 | 年龄 | 性别 | 职业 | 定位 |
|---|----|------|------|------|------|------|
| 22 | char-takahashi-mio | 高橋 美桜 | 16 | female | student | 蓮的妹妹，活泼元气 |
| 23 | char-ito-haruto | 伊藤 陽翔 | 16 | male | student | バスケ部新人，小狗系后辈 |
| 24 | char-nakamura-kaede | 中村 楓 | 16 | female | student | 美術部，内向害羞 |
| 25 | char-yoshida-yuki | 吉田 悠希 | 16 | male | student | 吹奏楽部，认真努力型 |

### 核心关系线

- 高橋蓮(兄) ↔ 高橋美桜(妹)：兄妹
- 中村優衣(姉) ↔ 中村楓(妹)：姐妹
- 佐藤真冬(生徒会長) × 田中翔(野球部)：优等生 × 热血运动笨蛋
- 伊藤琴美 → 小林颯 → 斎藤桜：三角单箭头
- 松本陸 ↔ 中村優衣：读书认识的微妙关系
- 渡辺大地 ↔ 松本陸：游戏伙伴
- 大木葉子(保健室)：学生恋爱谈心站

## 经济配置

manifest economy: `mdc: 20`

学生(age<18)默认 expenseExempt，18岁学生需 expenseExempt 或 initialMoney 缓冲。
教职员工和居民按 profession tier 计算 initialMoney。

## 无自定义 Actions

使用内置 actions 即可覆盖所有必要行为。无需 actions.js。
