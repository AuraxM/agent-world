# 樱叶学园 Mod 设计文档

## 概要

| 项目 | 内容 |
|------|------|
| **mod ID** | `sakuraba-academy` |
| **名称** | 私立樱叶学园 |
| **语言** | zh |
| **类型** | 全寮制高中+中学 |
| **节点数** | ~38（含 3 个学生寮浴场节点） |
| **角色数** | 40 |
| **基调** | 日常恋爱 |

## 节点树结构

```
私立樱叶学园 (root, public/outdoor) [spriteKey: school]
│
├── 正门 (isEntry, public/outdoor/street)
│
├── 商店街「樱叶通り」(public/outdoor/street) [spriteKey: town]
│   ├── 甜品店「シュガーポット」(public/indoor/dining) [spriteKey: restaurant]
│   ├── 便利店「樱叶マート」(public/indoor) [spriteKey: town]
│   ├── 游戏中心「スターダスト」(public/indoor) [spriteKey: town]
│   └── 书店「ふみの森」(semi/indoor/quiet) [spriteKey: school]
│
├── 高中部本馆 (semi/indoor) [spriteKey: school]
│   ├── 3年教室 (semi/indoor/education) [spriteKey: classroom]
│   ├── 2年教室 (semi/indoor/education) [spriteKey: classroom]
│   ├── 1年教室 (semi/indoor/education) [spriteKey: classroom]
│   ├── 高中教员室 (semi/indoor) [spriteKey: school]
│   └── 进路指导室 (semi/indoor) [spriteKey: school]
│
├── 中学部栋 (semi/indoor) [spriteKey: school]
│   ├── 中学3年教室 (semi/indoor/education) [spriteKey: classroom]
│   ├── 中学2年教室 (semi/indoor/education) [spriteKey: classroom]
│   ├── 中学1年教室 (semi/indoor/education) [spriteKey: classroom]
│   └── 中学教员室 (semi/indoor) [spriteKey: school]
│
├── 特别栋 (semi/indoor) [spriteKey: school]
│   ├── 音乐室 (semi/indoor/quiet) [spriteKey: classroom]
│   ├── 美术室 (semi/indoor/quiet) [spriteKey: classroom]
│   ├── 理科室 (semi/indoor/quiet) [spriteKey: classroom]
│   └── 放送室 (semi/indoor) [spriteKey: classroom]
│
├── 体育馆 (semi/indoor) [spriteKey: playground]
│   └── 体育仓库 (semi/indoor)
│
├── 泳池 (semi/outdoor) [spriteKey: playground]
├── 操场 (public/outdoor/playground) [spriteKey: playground]
├── 社团栋 (semi/indoor) [spriteKey: school]
│   ├── 学生会室 (semi/indoor) [spriteKey: school]
│   └── 部室（吹奏乐·轻音·美术·文艺·科学共用空间）
│
├── 图书馆「樱叶文库」(semi/indoor/quiet) [spriteKey: school]
├── 食堂 (public/indoor/dining) [spriteKey: restaurant]
├── 保健室 (semi/indoor) [spriteKey: home-cool]
├── 中庭「樱庭」(public/outdoor/park) [spriteKey: park]
├── 天台 (semi/outdoor/quiet) [spriteKey: park]
├── 教育相谈室 (semi/indoor/quiet) [spriteKey: school]
│
├── 高中男生寮 (semi/indoor/residence)
│   └── 高中男生浴室 (semi/indoor/residence/bathing)
├── 高中女生寮 (semi/indoor/residence)
│   └── 高中女生浴室 (semi/indoor/residence/bathing)
├── 中学寮 (semi/indoor/residence)
│   └── 中学浴室 (semi/indoor/residence/bathing)
└── 寮母值班室 (semi/indoor/residence)
```

### 关键节点说明

- **isEntry**: 正门
- **bathing × 3**: 高中男生浴室 / 高中女生浴室 / 中学浴室（均在各自寮内）
- **root**: 私立樱叶学园（概念根节点，parentId: null）
- **商店街**: shortcuted from 正门，作为放学后聚集地（教师不在此 map 中对应的活动）

## 角色设计（40 人）

### 高中 3 年级（6 人）— 核心恋爱圈

| # | ID | 姓名 | 性 | 年齢 | 役割 | E/I | N/S | F/T | P/J | 外貌 | 知性 | 健康 | 活动/休息节点 |
|---|-----|------|----|------|------|-----|-----|-----|-----|------|------|------|---------------|
| 1 | char-kiriya-ren | 桐谷蓮 | 男 | 18 | 生徒会長 / 前篮球部 | -1 | +2 | +2 | +3 | 3 | 3 | 3 | 学生会室 / 高中男生寮 |
| 2 | char-ogata-riku | 緒方陸 | 男 | 18 | 棒球部王牌 | +3 | -2 | -1 | -2 | 3 | 2 | 4 | 操场 / 高中男生寮 |
| 3 | char-miura-kenta | 三浦健太 | 男 | 18 | 放送部 / 吐槽役 | +2 | 0 | -2 | +1 | 2 | 3 | 2 | 放送室 / 高中男生寮 |
| 4 | char-sakurai-mahiru | 桜井真昼 | 女 | 18 | 美術部副部长 | +1 | +3 | -3 | 0 | 4 | 3 | 2 | 美术室 / 高中女生寮 |
| 5 | char-shiraishi-yuzuki | 白石柚月 | 女 | 17 | 文芸部部長 | -3 | +4 | +1 | +2 | 3 | 4 | 1 | 图书馆 / 高中女生寮 |
| 6 | char-hayakawa-kotomi | 早川琴美 | 女 | 18 | 吹奏楽部 / 钢琴 | -2 | +1 | +2 | +3 | 4 | 4 | 2 | 音乐室 / 高中女生寮 |

### 高中 2 年级（5 人）— 部活主力

| # | ID | 姓名 | 性 | 年齢 | 役割 | E/I | N/S | F/T | P/J | 外貌 | 知性 | 健康 | 活动/休息节点 |
|---|-----|------|----|------|------|-----|-----|-----|-----|------|------|------|---------------|
| 7 | char-sawamura-kaito | 沢村海斗 | 男 | 17 | 棒球部·次期王牌 | +4 | -3 | 0 | -3 | 2 | 2 | 4 | 操场 / 高中男生寮 |
| 8 | char-igarashi-yuto | 五十嵐悠斗 | 男 | 17 | 科学部部長 | -4 | +4 | +3 | +2 | 2 | 4 | 1 | 理科室 / 高中男生寮 |
| 9 | char-segawa-jin | 瀬川迅 | 男 | 17 | 軽音部ギター | +2 | +2 | -2 | -1 | 4 | 1 | 3 | 音乐室 / 高中男生寮 |
| 10 | char-toudou-chinatsu | 藤堂千夏 | 女 | 17 | 生徒会书记 / 水泳部 | +3 | 0 | +2 | +1 | 3 | 3 | 4 | 泳池 / 高中女生寮 |
| 11 | char-hoshino-koharu | 星野小春 | 女 | 17 | 吹奏楽部フルート | -1 | +2 | +3 | -1 | 3 | 3 | 2 | 音乐室 / 高中女生寮 |

### 高中 1 年级（5 人）— 新生

| # | ID | 姓名 | 性 | 年齢 | 役割 | E/I | N/S | F/T | P/J | 外貌 | 知性 | 健康 | 活动/休息节点 |
|---|-----|------|----|------|------|-----|-----|-----|-----|------|------|------|---------------|
| 12 | char-asakura-haruto | 朝倉陽翔 | 男 | 16 | 篮球部·特待生 | +2 | -1 | 0 | -2 | 3 | 2 | 4 | 体育馆 / 高中男生寮 |
| 13 | char-asakura-haruna | 朝倉陽菜 | 女 | 16 | 美術部 / 陽翔双胞胎妹 | -2 | +3 | +3 | 0 | 4 | 3 | 2 | 美术室 / 高中女生寮 |
| 14 | char-yano-akari | 矢野朱里 | 女 | 16 | 啦啦隊筹建中 | +4 | -2 | -1 | -1 | 3 | 2 | 4 | 操场 / 高中女生寮 |
| 15 | char-onodera-wakana | 小野寺和奏 | 女 | 16 | 軽音部ベース | +1 | +2 | +2 | -1 | 3 | 3 | 3 | 音乐室 / 高中女生寮 |
| 16 | char-azuma-yuto | 東優斗 | 男 | 16 | 科学部·天文班 | -3 | +4 | +2 | +3 | 2 | 4 | 1 | 理科室 / 高中男生寮 |

### 中学 3 年级（3 人）— 弟妹圈+同学

| # | ID | 姓名 | 性 | 年齢 | 役割 | E/I | N/S | F/T | P/J | 外貌 | 知性 | 健康 | 活动/休息节点 |
|---|-----|------|----|------|------|-----|-----|-----|-----|------|------|------|---------------|
| 17 | char-ogata-umi | 緒方海未 | 女 | 15 | 水泳部 / 図書委員（陸妹） | -1 | +2 | +2 | +1 | 3 | 3 | 4 | 泳池 / 中学寮 |
| 18 | char-miura-yui | 三浦結衣 | 女 | 15 | 家庭科部（健太妹） | +2 | +1 | +2 | 0 | 3 | 3 | 3 | 中庭 / 中学寮 |
| 19 | char-tanabe-sho | 田辺翔 | 男 | 15 | サッカー部·问题児 | +3 | -2 | -1 | -3 | 2 | 1 | 4 | 操场 / 中学寮 |

### 中学 2 年级（3 人）— 半熟期

| # | ID | 姓名 | 性 | 年齢 | 役割 | E/I | N/S | F/T | P/J | 外貌 | 知性 | 健康 | 活动/休息节点 |
|---|-----|------|----|------|------|-----|-----|-----|-----|------|------|------|---------------|
| 20 | char-kiriya-kaede | 桐谷楓 | 女 | 14 | 吹奏楽部（蓮妹） | -3 | +3 | +3 | +2 | 4 | 4 | 2 | 音乐室 / 中学寮 |
| 21 | char-sakurai-hiyori | 桜井日和 | 女 | 14 | 美術部（真昼妹） | +1 | +3 | -3 | 0 | 3 | 2 | 3 | 美术室 / 中学寮 |
| 22 | char-igarashi-minato | 五十嵐湊 | 男 | 14 | 科学部·生物（悠斗弟） | -4 | +4 | +2 | +3 | 2 | 4 | 1 | 理科室 / 中学寮 |

### 中学 1 年级（2 人）— 纯真期

| # | ID | 姓名 | 性 | 年齢 | 役割 | E/I | N/S | F/T | P/J | 外貌 | 知性 | 健康 | 活动/休息节点 |
|---|-----|------|----|------|------|-----|-----|-----|-----|------|------|------|---------------|
| 23 | char-hoshino-mafuyu | 星野真冬 | 男 | 13 | 吹奏楽部（小春弟） | -2 | +2 | +2 | +1 | 3 | 3 | 3 | 音乐室 / 中学寮 |
| 24 | char-hayakawa-miori | 早川美織 | 女 | 13 | 園芸（琴美妹） | +2 | +1 | +3 | -1 | 3 | 2 | 3 | 中庭 / 中学寮 |

### 教师/职员（12 人）

| # | ID | 姓名 | 性 | 年齢 | 职务 | 出身 | E/I | N/S | F/T | P/J | 外貌 | 知性 | 健康 |
|---|-----|------|----|------|------|------|-----|-----|-----|-----|------|------|------|
| 25 | char-sakuraba-shuzo | 桜庭周三 | 男 | 65 | 校長 | local | +2 | -1 | +1 | +3 | 2 | 3 | 1 |
| 26 | char-kito-seiichi | 鬼頭清一 | 男 | 48 | 教頭 | local | +3 | -3 | +3 | +4 | 2 | 4 | 3 |
| 27 | char-nonaka-toshiki | 野中俊樹 | 男 | 30 | 高3班主任/物理 | local | -1 | +2 | +2 | +1 | 3 | 4 | 3 |
| 28 | char-igarashi-mayumi | 五十嵐真由美 | 女 | 35 | 高2班主任/英語 | local | +3 | +1 | -2 | +1 | 3 | 3 | 3 |
| 29 | char-tachibana-yuka | 橘優花 | 女 | 24 | 高1班主任/国文 | local | -2 | +2 | +3 | +1 | 3 | 3 | 3 |
| 30 | char-koga-hiroshi | 古賀博 | 男 | 45 | 中学班主任/数学 | local | +1 | -1 | +3 | +2 | 2 | 3 | 2 |
| 31 | char-oshiro-ken | 大城健 | 男 | 33 | 体育教師/部活総監督 | local | +4 | -3 | -1 | -2 | 2 | 2 | 4 |
| 32 | char-kirishima-reiko | 霧島玲子 | 女 | 36 | 音楽教師/吹奏楽&軽音顧問 | local | +2 | +3 | -1 | +2 | 4 | 4 | 2 |
| 33 | char-yakushimaru-miwa | 薬師丸美和 | 女 | 38 | 保健医 | local | 0 | +2 | +3 | -2 | 3 | 4 | 2 |
| 34 | char-shinohara-kazuo | 篠原和男 | 男 | 55 | 図書館管理員 | local | -4 | +3 | +1 | +3 | 2 | 4 | 2 |
| 35 | char-matsubara-kinuyo | 松原絹代 | 女 | 52 | 食堂阿姨 | local | +3 | -1 | +3 | -1 | 2 | 2 | 3 |
| 36 | char-goda-yoshie | 郷田良江 | 女 | 47 | 寮母 | local | +2 | 0 | +3 | +4 | 2 | 2 | 3 |

教师/职员无 activityNode（不参与学生活动），restNode 如下：
- 校長·教頭 → 高中教员室
- 班主任 → 各自教员室
- 体育教師 → 体育仓库
- 音楽教師 → 音乐室
- 保健医 → 保健室
- 図書管理员 → 图书馆
- 食堂阿姨 → 食堂
- 寮母 → 寮母值班室

### 商店街（4 人）

| # | ID | 姓名 | 性 | 年齢 | 职务 | 出身 | E/I | N/S | F/T | P/J | 外貌 | 知性 | 健康 |
|---|-----|------|----|------|------|------|-----|-----|-----|-----|------|------|------|
| 37 | char-sato-mizuki | 佐藤瑞希 | 女 | 25 | 甜品店店主 | visitor | +2 | +2 | -2 | 0 | 4 | 2 | 3 |
| 38 | char-fujimura-fumiya | 藤村文也 | 男 | 60 | 书店店主 | local | -2 | +3 | +1 | +3 | 2 | 4 | 2 |
| 39 | char-takenaka-hiromi | 竹中博美 | 女 | 42 | 便利店长 | local | +3 | -2 | -1 | +1 | 2 | 2 | 3 |
| 40 | char-wakamatsu-shota | 若松翔太 | 男 | 22 | 游戏中心店员 | visitor | +2 | 0 | -1 | -3 | 3 | 2 | 3 |

商店街角色的 activityNode 为各自店铺，restNode 为学生寮（若松、瑞希）或各自店铺后方。

## 恋爱线关系图

### 核心三角
```
蓮 ──(互有好感)→ 真昼 ←──(青梅竹马单恋)── 陸
                      ↑暗中助攻
陸 ←──(死党吐槽)── 健太
```

### 分支线
```
悠斗 ──(暗恋)→ 千夏（千夏未回应，优先水泳+生徒会）
迅 ──(单恋/观望)→ 真昼（站远处，自知无优势）
小春 ──(缓冲/尊敬)→ 琴美（部活上下关系）
陽菜 ──(淡淡好感)→ 悠斗（看他指导弟弟的背影）
朱里 ──(单方面竞争)→ 海斗（互相较劲）
和奏 ──(后辈/制动器)→ 迅（乐队节奏搭档）
翔 ──(单向好感)→ 結衣（抢面包式表达）
真冬 ──(好感)→ 結衣（饼干理由）
若松 ──(暗恋)→ 瑞希（买可丽饼说不出话）
```

## 家族关系

- 五十嵐真由美 = 悠斗(高2) & 湊(中2) の母
- 朝倉陽翔 & 陽菜 = 双胞胎
- 桐谷蓮 & 楓 = 兄妹
- 緒方陸 & 海未 = 兄妹
- 三浦健太 & 結衣 = 兄妹
- 桜井真昼 & 日和 = 姐妹
- 星野小春 & 真冬 = 姐弟
- 早川琴美 & 美織 = 姐妹

## 未定事项

- **speakingStyle**: 每位角色从 age + MBTI + profession + intelligence 自动生成
- **biography**: 基于角色背景编写第一人称小传
- **relations**: 基于恋爱线+家族关系+部活关系展开为具体 JSON
- **economy**: 学园场景无需生存开销系统，考虑使用简化配置
- **actions.js**: 是否需要学园特有自定义 action（如「告白」「社团活动」「学园祭準備」等）

## 验证检查清单

- [ ] map.json: ≥1 isEntry, ≥1 bathing, exactly 1 root
- [ ] 所有角色: profession ∈ PROFESSIONS, origin ∈ CHARACTER_ORIGINS
- [ ] 角色文件不含 runtime 字段（locationId, vitals, emotion 等）
- [ ] personality 4 dims 均在 [-4, 4]
- [ ] appearance/intelligence/health 均在 [1, 4]
- [ ] relations.kinds ⊆ OBJECTIVE_RELATION_KINDS
- [ ] manifest.json: id 唯一, language = "zh"
