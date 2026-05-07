# 樱ノ宫 — 日式校园恋爱 Mod 设计文档

## 概述

- **ID**: `sakurano-miya`
- **名称**: 樱ノ宫
- **类型**: 日式校园恋爱（高中+大学）
- **语言**: zh
- **日期**: 2026-04-07T08:00:00（入学式当日，樱花满开）
- **规模**: ~57 节点，13 角色，12 自定义 actions，10 事件
- **参考**: sakuraba-academy（保留 kiss/caress/hug，其余全新设计）

## 世界观

樱ノ宫是一处丘陵地带的学园小镇。一所高中和一所大学共享这片丘陵，小镇因两所学校而存在。古老的垂樱是地标——传说建校时栽下，如今树龄近百年。每年四月满开时，全镇在树下办「樱ノ宫祭」。

所有 13 名角色都是本地人（origin: "local"），与这片土地有根的联系。他们在这里出生、长大、上学、恋爱——没有转校生，没有外来游客。故事发生在人与人之间早已相互认识的世界里。

## 地图设计（~57 节点）

### 树结构概要

```
樱ノ宫丘陵 (root)
├── 樱ノ宫高中
│   ├── 正门 [entry]
│   ├── 高中本馆
│   │   ├── 3年教室
│   │   ├── 2年教室
│   │   ├── 1年教室
│   │   └── 教员室
│   ├── 特别栋
│   │   ├── 音乐室
│   │   ├── 美术室
│   │   ├── 理科室
│   │   └── 放送室
│   ├── 体育馆
│   │   └── 体育仓库
│   ├── 操场
│   ├── 中庭「樱庭」
│   ├── 图书馆
│   ├── 食堂
│   ├── 保健室
│   ├── 学生会室
│   ├── 天台
│   └── 进路指导室
├── 樱ノ宫大学
│   ├── 大学正门
│   ├── 本部栋
│   ├── 大讲义室
│   ├── 研讨室
│   ├── 大学图书馆
│   ├── 学生食堂
│   ├── サークル栋
│   ├── 大学庭园
│   └── 研究室
├── 樱ノ宫町
│   ├── 车站
│   ├── 商店街「樱ノ宫通り」
│   │   ├── 咖啡店「はるのね」
│   │   ├── 书店「ふみの杜」
│   │   ├── 便利店
│   │   └── 甜品店
│   ├── 定食屋
│   ├── 学生公寓「樱庄」
│   │   └── 樱庄浴室 [bathing]
│   ├── 学生公寓「枫馆」
│   │   └── 枫馆浴室 [bathing]
│   ├── 住宅区「北町」
│   ├── 住宅区「南町」
│   ├── 诊所
│   ├── 邮局
│   ├── 町役场
│   └── 温泉「樱汤」[bathing]
└── 自然/户外
    ├── 河边樱花道
    ├── 河堤
    ├── 公园
    ├── 展望台
    ├── 神社「樱ノ宫神社」
    │   └── 神社参道
    ├── 后山林道
    ├── 运动公园
    └── 露天集市广场
```

### 关键 invariants

- Entry: 高中正门（`node-gate`）
- Bathing: 温泉「樱汤」、樱庄浴室、枫馆浴室（≥1 ✓）
- Root: 樱ノ宫丘陵（parentId: null, 唯一）
- 所有 tag 和 privacy 来自 `src/domain/enums.ts`
- isEntry 仅高中正门，符合叙事逻辑
- startDate: `2026-04-07T08:00:00`（4月入学式，樱花满开，春烂漫）

## 角色设计（13 人，全部 origin: "local"）

### 高中生（6人）

#### 1. 桜井陽翔（char-sakurai-haruto）
- 18岁，男，高中3年，生徒会长
- 性格: ei:-1 sn:2 tf:2 jp:3 — 沉稳有条理，内敛但不孤僻
- 暗恋真昼。父亲是町役场职员。活动: node-student-council / rest: node-south-residence
- 关系: 真昼(classmate+friend, aff+3), 朱里(older_sister), 千夏(classmate), 小春(classmate)

#### 2. 白石真昼（char-shiraishi-mahiru）
- 18岁，女，高中3年，美术部
- 性格: ei:-2 sn:3 tf:-1 jp:1 — 安静敏感，感受力强，艺术型
- 察觉陽翔的关心，但目光落在咖啡店打工的楓身上。活动: node-art-room / rest: node-north-residence
- 关系: 陽翔(classmate+friend, aff+1), 楓(acquaintance, aff+2)

#### 3. 五十嵐悠斗（char-igarashi-yuto）
- 17岁，男，高中2年，理科狂
- 性格: ei:-3 sn:4 tf:3 jp:-1 — 话极少但对科学话题滔滔不绝，高度专注型
- 对千夏有好感但无法表达。活动: node-science-room / rest: node-south-residence
- 关系: 千夏(classmate, aff+3), 湊(older_brother)

#### 4. 霧島千夏（char-kirishima-chinatsu）
- 17岁，女，高中2年，水泳部王牌
- 性格: ei:3 sn:-1 tf:-2 jp:2 — 开朗直率，情绪外露，行动先于思考
- 喜欢悠斗的认真但嫌他太闷。活动: node-pool / rest: node-north-residence
- 关系: 悠斗(classmate, aff+3), 陽翔(classmate)

#### 5. 星野小春（char-hoshino-koharu）
- 16岁，女，高中1年，新生
- 性格: ei:2 sn:-2 tf:-2 jp:-1 — 活泼好奇，情绪丰富，有时话多且跳跃
- 入学第一天被陽翔的迎新致辞打动。優翔的青梅竹马。活动: node-hs-1-1 / rest: node-north-residence
- 关系: 優翔(neighbor+friend, aff+3), 陽翔(classmate, aff+1)

#### 6. 東優翔（char-azuma-yusho）
- 16岁，男，高中1年，野球部
- 性格: ei:3 sn:-3 tf:-1 jp:-3 — 热血冲动，完全靠直觉行动，想到哪说哪
- 小春的青梅竹马，还没意识到自己的感情。活动: node-field / rest: node-south-residence
- 关系: 小春(neighbor+friend, aff+3)

### 大学生（5人）

#### 7. 桐谷楓（char-kiriya-kaede）
- 22岁，男，大学4年，医学部
- 性格: ei:-1 sn:3 tf:1 jp:2 — 沉稳温柔，观察力强，在咖啡店打工
- 对真昼在咖啡店画素描的身影有所察觉。活动: node-research-lab / rest: node-kaede-kan
- 关系: 蓮(friend), 朱里(friend), 真昼(acquaintance, aff+1), 佐藤(colleague)

#### 8. 桜井朱里（char-sakurai-akari）
- 19岁，女，大学1年，音乐学部·筝曲
- 性格: ei:4 sn:-2 tf:-3 jp:-2 — 话多健谈、情绪丰富、随性跳跃、自由奔放
- 陽翔的亲姐姐，性格完全相反。藤村神主的筝曲弟子。活动: node-music-room / rest: node-sakura-so
- 关系: 陽翔(younger_brother), 陽菜(friend), 藤村(teacher), 楓(friend)

#### 9. 橘陽菜（char-tachibana-hina）
- 20岁，女，大学2年，文学部
- 性格: ei:-2 sn:2 tf:1 jp:3 — 安静温柔，文学少女，在书店打工
- 对蓮有好感但对方完全没注意到。活动: node-seminar-room / rest: node-kaede-kan
- 关系: 蓮(acquaintance, aff+3), 朱里(friend), 藤村(colleague)

#### 10. 若松蓮（char-wakamatsu-ren）
- 21岁，男，大学3年，工学部
- 性格: ei:1 sn:1 tf:4 jp:1 — 极度务实理性，对恋爱完全钝感
- 楓的咖啡店常客搭档。活动: node-seminar-room / rest: node-sakura-so
- 关系: 楓(friend), 陽菜(acquaintance, aff+0)

#### 11. 五十嵐湊（char-igarashi-minato）
- 20岁，男，大学2年，生物学部
- 性格: ei:-2 sn:4 tf:2 jp:2 — 话不多观察力强，冷静分析型
- 悠斗的哥哥。和楓共享公寓。活动: node-research-lab / rest: node-kaede-kan
- 关系: 悠斗(younger_brother), 楓(friend)

### 小镇居民（2人）

#### 12. 佐藤美咲（char-sato-misaki）
- 28岁，女，咖啡店「はるのね」店主
- 性格: ei:3 sn:1 tf:-1 jp:2 — 亲切健谈，温暖的"姐姐"形象
- 记得每个学生的常点单品。丈夫在邻市上班。活动+rest: node-haru-no-ne
- 关系: 楓(colleague), 朱里(friend), 陽菜(friend)

#### 13. 藤村清一（char-fujimura-seiichi）
- 65岁，男，神社「樱ノ宫神社」神主
- 性格: ei:-4 sn:3 tf:2 jp:3 — 极其寡言但每句都有分量，年轻时在东京做过音乐人
- 朱里的筝曲老师。活动+rest: node-shrine
- 关系: 朱里(teacher/student)

### 核心关系张力图

```
陽翔(3年♂) ──→ 真昼(3年♀) ──→ 楓(大4♂)
                                      ↕ friend
                                    蓮(大3♂) ←── 陽菜(大2♀)

千夏(2年♀) ⇄ 悠斗(2年♂) [互相暗恋, 沟通不良]
                  ↕兄弟
                湊(大2♂)

優翔(1年♂) ⇄ 小春(1年♀) [青梅竹马, 双向未察觉]

朱里(大1♀) ── 陽翔(3年♂) [姐弟]
朱里 ── 藤村(神主) [师徒]
```

## Actions 设计（12 个）

### 保留（3个，直接复制自 sakuraba-academy/actions.js）
- `kiss` — 亲吻（instant, usableInDialogue）
- `caress` — 抚摸（instant, usableInDialogue）
- `hug` — 拥抱（instant, usableInDialogue）

### 新增恋爱互动（7个）

1. **`confess`** — 告白
   - duration: instant, usableInDialogue: true
   - triggerHint: "在想要向对方表明心意的关键时刻使用。"
   - paramRule: "必填 target_id。需在 quiet 标签节点（天台/河边/神社等安静场所）。"
   - 效果: 大幅 mood +2, target 根据 affection 产生不同记忆

2. **`hold_hands`** — 牵手
   - duration: instant, usableInDialogue: true
   - triggerHint: "在并肩漫步或安静相处时使用，迈出关系的第一步。"
   - paramRule: "必填 target_id。户外节点可用。"
   - 效果: mood +1, stress -1, socialSatiety +1

3. **`give_gift`** — 送礼物
   - duration: instant, usableInDialogue: true
   - triggerHint: "在想要用物品表达心意时使用。"
   - paramRule: "必填 target_id 和 item（物品描述）。"
   - 效果: 根据礼物类型不同效果

4. **`invite`** — 邀约
   - duration: 1, usableInDialogue: true
   - triggerHint: "想约对方一起去某个地方时使用。"
   - paramRule: "必填 target_id 和 node_id（目的地）。"
   - 效果: 创建 pending invitation，对方可在后续 tick 响应

5. **`write_letter`** — 写情书
   - duration: 1, usableInDialogue: false
   - triggerHint: "在想要将无法当面说出的话写成文字时使用。"
   - paramRule: "无需 target。quiet 标签节点可用。产出情书用于 give_gift。"
   - 效果: 产出信物，消耗 1 tick

6. **`comfort`** — 安慰
   - duration: instant, usableInDialogue: true
   - triggerHint: "在对方情绪低落或压力大时使用。"
   - paramRule: "必填 target_id。需对方 stress ≥ 2 或 mood ≤ -1。"
   - 效果: target stress -2, socialSatiety +1

7. **`tease`** — 捉弄
   - duration: instant, usableInDialogue: true
   - triggerHint: "在和亲近的人开玩笑、逗对方时使用。适合青梅竹马和好友。"
   - paramRule: "必填 target_id。需与对方 affections ≥ 1 或有 friend/classmate 关系。"
   - 效果: 随机 mood 微调（+1 或 -1），socialSatiety +1

### 校园特有（2个）

8. **`study_together`** — 一起学习
   - duration: 3, usableInDialogue: false
   - triggerHint: "在想要和对方一起备考或学习时使用。图书馆/教室可用。"
   - paramRule: "必填 target_id。需在 education 或 quiet 标签节点。"
   - 效果: 双方 intelligence 微调，mood +1，socialSatiety +1

9. **`walk_home`** — 一起回家
   - duration: 2, usableInDialogue: false
   - triggerHint: "放学后邀请对方一起走过樱花道回家。"
   - paramRule: "必填 target_id。需在 outdoor 标签节点。"
   - 效果: mood +1, stress -1, 触发 2 ticks 的陪伴移动

## 事件设计（10 个，全新）

围绕日本学年循环（4月开学→3月毕业），覆盖一整年的关键节点：

| # | id | 名称 | 日期 | 天数 | 说明 |
|---|-----|------|------|------|------|
| 1 | `entrance-ceremony` | 入学式 | 04-07 | 1 | 新学期开始，新生入学。樱花满开，高中正门前的集体照 |
| 2 | `sports-festival` | 体育祭 | 05-15 | 2 | 高中间红白对决。大学生的応援团也来助阵 |
| 3 | `tanabata` | 七夕 | 07-07 | 1 | 在短册上写下心愿挂在神社竹枝上。告白暗示的高峰期 |
| 4 | `summer-festival` | 夏祭·花火大会 | 08-01 | 1 | 露天集市+神社参道+河边花火。全mod最高潮的恋爱事件 |
| 5 | `culture-festival` | 文化祭 | 10-20 | 2 | 高中文化祭 + 大学学园祭同日。咖啡店变成女仆咖啡，教室变鬼屋 |
| 6 | `christmas` | 圣诞节 | 12-24 | 1 | 商店街亮灯，咖啡店限定蛋糕。告白第二高峰 |
| 7 | `new-year` | 新年参拜 | 01-01 | 1 | 神庙初诣，抽签，喝甜酒。一年的开始 |
| 8 | `valentine` | 情人节 | 02-14 | 1 | 本命巧克力和义理巧克力。情感清算日 |
| 9 | `graduation` | 毕业式 | 03-15 | 1 | 高中3年+大学4年毕业。樱花未开，但离别已至 |
| 10 | `sakura-festival` | 樱ノ宫祭 | 04-01 | 3 | 町最大祭典。垂樱满开下的全镇集会。新一年的入学与相遇 |

## 经济配置

沿用 `sakuraba-academy` 的 MDC 默认值（20）。所有未成年学生（高中1-2年）默认豁免生活开销。成年角色按公式计算 initialMoney。

manifest.json 中可选:
```json
"economy": {
  "mdc": 20
}
```

## 实施计划

### Phase 1: 地图 (map.json)
1. 阅读 `src/domain/enums.ts` 确认 NODE_TAGS 最新版本
2. 按上述树结构编写 map.json（~57 节点）
3. 验证: `npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/sakurano-miya/map.json`

### Phase 2: 角色 (characters/)
1. 按上述 13 人规格逐个编写 character JSON
2. 每个角色执行 origin 决策树检查（全为 local ✓）
3. 每个角色执行经济平衡检查
4. 全部验证

### Phase 3: Actions (actions.js)
1. 从 sakuraba 复制 kiss/caress/hug 三个 action
2. 新增 9 个自定义 action
3. 验证: `node -e "..."` 语法+必需字段检查

### Phase 4: Events (events.json)
1. 编写 10 个事件
2. 验证 JSON 格式

### Phase 5: 世界组装 (manifest.json)
1. 创建 manifest.json
2. 验证: `npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/sakurano-miya/manifest.json`

### Phase 6: 集成测试
1. 创建世界 POST /api/worlds
2. 运行几个 ticks 观察角色决策
3. 检查无校验错误

## 文件清单

```
configs/maps/sakurano-miya/
├── manifest.json
├── map.json
├── events.json
├── actions.js
└── characters/
    ├── char-sakurai-haruto.json
    ├── char-shiraishi-mahiru.json
    ├── char-igarashi-yuto.json
    ├── char-kirishima-chinatsu.json
    ├── char-hoshino-koharu.json
    ├── char-azuma-yusho.json
    ├── char-kiriya-kaede.json
    ├── char-sakurai-akari.json
    ├── char-tachibana-hina.json
    ├── char-wakamatsu-ren.json
    ├── char-igarashi-minato.json
    ├── char-sato-misaki.json
    └── char-fujimura-seiichi.json
```
