# 樱兰学园 Mod 设计文档

## 概述

- **主题**：日式私立学园 + 都市近郊，B2 双向多角恋爱网 + 露骨性暗示
- **规模**：29 地图节点 + 30 角色 + 6 自定义 Action
- **语言**：zh（中文），角色名日文音译汉字，不出现假名
- **Scene ID**：`ouran-academy`
- **社会结构**：以社团、亲缘、网络关系构建重叠小团体（不以班级为阵营）

---

## 一、地图（map.json）— 29 节点

### 校园区（24 节点，含根节点）

| # | id | 名称 | 父节点 | 标签 | privacy | 备注 |
|---|-----|------|--------|------|---------|------|
| 1 | `campus-root` | 樱兰私立学园 | null | — | public | 根节点 |
| 2 | `node-gate` | 校门/巴士站 | campus-root | outdoor, street | public | **entry** |
| 3 | `node-sakura-slope` | 樱花坂道 | campus-root | outdoor, street | public | |
| 4 | `node-courtyard` | 中庭喷泉广场 | campus-root | outdoor | semi | |
| 5 | `node-rooftop` | 屋顶天台 | campus-root | outdoor | semi | |
| 6 | `node-rooftop-blind` | 屋顶水箱后 | node-rooftop | outdoor | private | 🔒 |
| 7 | `node-garden` | 后庭园艺角 | campus-root | outdoor | semi | |
| 8 | `node-class-2a` | 2-A教室 | campus-root | indoor, education | semi | |
| 9 | `node-class-2b` | 2-B教室 | campus-root | indoor, education | semi | |
| 10 | `node-teachers-office` | 教师办公室 | campus-root | indoor | semi | |
| 11 | `node-science-lab` | 理科室 | campus-root | indoor, education | semi | |
| 12 | `node-music-room` | 音乐室 | campus-root | indoor, education | semi | |
| 13 | `node-library` | 图书室 | campus-root | indoor, education, quiet | semi | |
| 14 | `node-library-archive` | 图书室档案区 | node-library | indoor, quiet | private | 🔒 |
| 15 | `node-practice-room` | 音乐练习室 | campus-root | indoor, quiet | private | 🔒 隔音单间 |
| 16 | `node-abandoned-class` | 废弃教室 | campus-root | indoor | private | 🔒 |
| 17 | `node-gym` | 体育馆 | campus-root | indoor, playground | semi | |
| 18 | `node-gym-storage` | 器材室 | node-gym | indoor | private | 🔒 |
| 19 | `node-pool` | 游泳池 | campus-root | outdoor, playground | semi | |
| 20 | `node-locker-room` | 更衣室 | campus-root | indoor | private | 🔒 |
| 21 | `node-club-building` | 部室楼 | campus-root | indoor | semi | |
| 22 | `node-cafeteria` | 食堂/咖啡厅 | campus-root | indoor, dining | semi | |
| 23 | `node-nurse` | 保健室 | campus-root | indoor | semi | |
| 24 | `node-nurse-bed` | 保健室床位区 | node-nurse | indoor | private | 🔒 |

### 周边区（4 节点）

| # | id | 名称 | 父节点 | 标签 | privacy | 备注 |
|---|-----|------|--------|------|---------|------|
| 25 | `node-convenience` | 便利店 | campus-root | indoor | semi | |
| 26 | `node-diner` | 家庭餐厅 | campus-root | indoor, dining | semi | |
| 27 | `node-residential` | 住宅区 | campus-root | outdoor, residence | semi | |
| 28 | `node-shrine` | 神社 | campus-root | outdoor, quiet | semi | |

### 住宅浴室（bathing 必需节点）

| # | id | 名称 | 父节点 | 标签 | privacy |
|---|-----|------|--------|------|---------|
| 29 | `node-residential-bath` | 住宅区浴室 | node-residential | indoor, private, residence, bathing | private |

> **注：** 实际节点数可能为 28-29（bath 节点可合并到 residential 下）。所有节点均设 x/y/w/h 坐标用于前端渲染。

### 私密空间设计意图

| 私密节点 | 适合的场景 |
|----------|-----------|
| 屋顶水箱后 | 放学后眺望→顺势接吻 |
| 图书室档案区 | 假装找书→身体擦碰 |
| 音乐练习室 | 合奏独处→隔音不怕出声 |
| 废弃教室 | 传闻中的告白点→紧张刺激 |
| 器材室 | 体育课后→汗水+幽暗 |
| 更衣室 | 换衣服→意外撞见/偷看 |
| 保健室床位区 | 身体不适→被照顾/照顾人 |

---

## 二、角色（characters/）— 30 人

### 核心层（15 人）— 完整配置

#### 2-A 班（7 人）

| # | id | 姓名 | 性别 | 年龄 | 社团 | 一句话 |
|---|-----|------|------|------|------|--------|
| 1 | `char-sato-ren` | 佐藤 莲 | male | 17 | 轻音部（吉他） | 冷感帅哥，话少但存在感强，对女生的好感迟钝 |
| 2 | `char-takahashi-rin` | 高桥 凛 | female | 17 | 演剧部（主演） | 明艳自信，对莲有好感但不主动说，以"戏"试探 |
| 3 | `char-ito-hayato` | 伊藤 隼人 | male | 17 | 篮球部 | 凛的青梅竹马，暗恋她多年，看着她追莲却无法开口 |
| 4 | `char-nakamura-aoi` | 中村 葵 | female | 17 | 文艺部 | 安静毒舌，在匿名BBS上写情色短篇，现实中没人知道 |
| 5 | `char-kimura-sho` | 木村 翔 | male | 17 | 科学部 | 内向宅男，网游里认识京子，被她的文字撩得脸红 |
| 6 | `char-matsumoto-riko` | 松本 莉子 | female | 17 | 轻音部（主唱） | 活泼爱闹，也喜欢莲，和凛是隐性情敌 |
| 7 | `char-kobayashi-sota` | 小林 飒太 | male | 17 | 演剧部（幕后） | 温柔安静，对谁都体贴，反而让女生猜不透 |

#### 2-B 班（8 人）

| # | id | 姓名 | 性别 | 年龄 | 社团 | 一句话 |
|---|-----|------|------|------|------|--------|
| 8 | `char-watanabe-kai` | 渡边 海 | male | 17 | 篮球部（队长） | 野性张力，身体接触毫不避讳，和多个女生暧昧不清 |
| 9 | `char-suzuki-kyoko` | 铃木 京子 | female | 17 | 文艺部 | 优雅大小姐外表，网上写露骨色情小说 |
| 10 | `char-tanaka-shota` | 田中 翔太 | male | 17 | 轻音部（鼓手） | 轻浮爱撩，京子的网上编辑也是她的忠实读者 |
| 11 | `char-yamada-asuka` | 山田 明日香 | female | 17 | 篮球部（经理） | 观察力极强，笔记本记满队友状态和感情八卦 |
| 12 | `char-ishii-yu` | 石井 优 | male | 17 | 归宅部 | 自由人，男女通吃的暧昧气质 |
| 13 | `char-sato-mayu` | 佐藤 真由 | female | 17 | 轻音部（贝斯） | 莲的亲妹妹，兄控但不承认 |
| 14 | `char-yoshida-daiki` | 吉田 大辉 | male | 17 | 科学部 | 翔唯一的朋友，暗恋葵但不知道她就是网上聊伴 |
| 15 | `char-kato-miuzuki` | 加藤 美月 | female | 17 | 归宅部 | 转校生，刚来三个月，海已注意到她 |

### 支撑层 — 教师/职员（4 人）

| # | id | 姓名 | 性别 | 年龄 | 职务 | 一句话 |
|---|-----|------|------|------|------|--------|
| 16 | `char-takigawa-sensei` | 滝川 先生 | female | 32 | 2-A 班主任（国文） | 知性优雅，私下抽烟，看穿学生的感情暗流但不点破 |
| 17 | `char-murakami-sensei` | 村上 先生 | male | 28 | 体育教师（篮球顾问） | 热血直率，对学生的身体接触异常敏感 |
| 18 | `char-sakaki-sensei` | 榊 先生 | female | 35 | 校医 | 冷静理性，保健室是秘密交换站，她知道的事比任何人都多 |
| 19 | `char-nikaido-sensei` | 二階堂 先生 | male | 30 | 音乐教师（轻音部顾问） | 慵懒随性，偶尔和学生一起抽烟，边界感模糊 |

### 支撑层 — 次要学生（9 人）

| # | 角色 | 性别 | 班级 | 社团 | 作用 |
|---|------|------|------|------|------|
| 20 | 演剧部部员 A | female | 2-A | 演剧部 | 凛的对手役，制造排练中的身体接触事件 |
| 21 | 演剧部部员 B | male | 2-B | 演剧部 | 对凛有好感，隼人的隐性竞争对手 |
| 22 | 篮球部部员 A | male | 2-A | 篮球部 | 海的僚机，传播更衣室八卦 |
| 23 | 篮球部部员 B | male | 2-B | 篮球部 | 暗恋莉子，但莉子眼里只有莲 |
| 24 | 轻音部部员 A | female | 2-B | 轻音部（键盘） | 翔太的调情对象之一，但知道翔太心里有别人 |
| 25 | 文艺部部员 A | female | 2-A | 文艺部 | 葵的闺蜜，帮葵的匿名BBS账号打掩护 |
| 26 | 2-A 班长 | male | 2-A | 归宅部 | 正经认真，暗恋班主任滝川老师 |
| 27 | 2-B 风纪委员 | female | 2-B | 归宅部 | 道德感强，频繁撞见私密场景，被迫保守秘密 |
| 28 | 图书室幽灵 | female | — | 归宅部 | 几乎不出现在教室，永远缩在图书室角落看书 |

### 支撑层 — 次要角色（2 人）

| # | id | 姓名 | 性别 | 年龄 | 职务 |
|---|-----|------|------|------|------|
| 29 | `char-obachan` | 小卖部阿姨 | female | 55 | 小卖部售货员 |
| 30 | `char-convenience-clerk` | 便利店夜班店员 | male | 21 | 大学生兼职 |

### 关系网核心

```
凛 ──→ 莲 ←── 莉子
 ↑       ↑
隼人    真由（兄控）
          │
京子 ←──→ 翔太（网上互撩互不知真身）
  │        │
  └─ 木村翔（读者）── 京子的匿名粉丝，不知她是谁

海 ──→ 美月（新目标）
 ↑       ↑
多个    明日香（暗恋+嫌弃他花心）
女生        │
            └── 笔记：所有人的感情动态

葵 ←── 吉田（暗恋）
 │
 └── BBS 写情色短篇，吉田是读者（不知是她）

优 ──→ 无固定箭头，和每个人都可能独处
```

### 角色配置规范

- **Origin**：所有学生 `"local"`（有住所、在此上学），加藤美月虽是转校生但已定居 3 个月
- **Economy**：所有学生 `tier: 0` + `expenseExempt: true` + 省略 `initialMoney`
- **Personality**：每个核心角色 1-2 强维度（｜3｜-｜4｜），其余 0..±2
- **SpeakingStyle**：每个核心角色用 6 维矩阵生成，确保同 pack 内无 ≥3 特征片段重叠
- **Relations**：核心角色间声明不对称关系，支撑层只声明必要的
- **SleepWindow**：学生默认 `{start: 22, duration: 8}`，教师可适当偏移

---

## 三、自定义 Actions（actions.js）— 6 个

全部 `usableInDialogue: true`，`duration: "instant"`。

### 强度分级

| 级别 | Actions | mood | stress | socialSatiety | event intensity | scope |
|------|---------|------|--------|---------------|-----------------|-------|
| 轻 | hold_hands, pat_head | ±1 | ∓1 | +1 | 2 | node |
| 中 | caress | ±2 | ∓2 | +2 | 3 | private |
| 重 | unbutton, lick_ear, kiss | ±3 | ∓3 | +3 | 4 | private |

### 各 Action 定义

#### 1. `hold_hands` — 牵手

- **triggerHint**：「与有好感的人并肩行走时，用牵手传递温度与试探。」
- **paramRule**：「必填 target_id（牵手对象）+ 可选 free_text。」
- **memory**：「我牵起 ${target} 的手，指尖穿过ta的指缝，掌心贴在一起。ta的手比我想象中更暖，微微颤了一下，没有抽开。」
- **targetMemory**：「${self} 牵起我的手，十指交扣。ta的掌心干燥而温热，拇指轻轻摩挲着我的手背。」
- **event intensity**: 2, **scope**: node

#### 2. `pat_head` — 摸头

- **triggerHint**：「想宠溺对方、或借身高差调戏时，揉乱ta的头发。」
- **paramRule**：「必填 target_id（摸头对象）+ 可选 free_text。」
- **memory**：「我把手放在 ${target} 的头顶，轻轻揉了揉。ta的头发比看起来更软，穿过我的指缝。ta抬头看我，那个表情让我胸口一紧。」
- **targetMemory**：「${self} 揉了我的头发。动作很轻，但手掌的重量让人安心又被当成小孩的微妙不甘。」
- **event intensity**: 2, **scope**: node

#### 3. `caress` — 抚摸

- **triggerHint**：「独处、气氛暧昧、体温升高时，手掌在对方身体上游走，从肩膀到腰线，隔着制服感受肌肤的弧度与热度。」
- **paramRule**：「必填 target_id（抚摸对象）+ 可选 free_text。」
- **memory**：「我抚摸着 ${target}。手掌从ta的肩膀滑下，经过背脊的凹陷，停在腰侧。隔着一层薄薄的衬衫，我能感觉到ta体温在升高，肌肉在我指尖下微微绷紧又放松。呼吸声变重了。」
- **targetMemory**：「${self} 的手在我身上游走。从肩膀到腰，缓慢而用力。我想说停下，但身体没有躲——那种被需要的感觉烧穿了理智。」
- **event intensity**: 3, **scope**: private

#### 4. `unbutton` — 解开纽扣

- **triggerHint**：「私密空间中情欲高涨，指尖一颗颗挑开对方衣扣，露出锁骨与胸口。」
- **paramRule**：「必填 target_id（对象）+ 可选 free_text。」
- **memory**：「我解开 ${target} 的纽扣。第一颗，锁骨露出来。第二颗，胸口起伏的曲线清晰可见。我的手指碰到ta的皮肤，烫得惊人。ta没有推开我，只是咬着嘴唇，呼吸急促。我把手掌贴上ta裸露的胸口，感受心跳的节奏撞进掌心。」
- **targetMemory**：「${self} 解开了我的扣子。ta的手指很慢，每解开一颗就停顿一秒，像在等我拒绝——但我没有。ta的指尖碰到我的胸口时，我全身都绷紧了。」
- **event intensity**: 4, **scope**: private

#### 5. `lick_ear` — 舔耳

- **triggerHint**：「极亲密时的挑逗——凑近耳边，舌尖沿着耳廓描摹，探入耳道，听对方压抑的喘息。」
- **paramRule**：「必填 target_id（舔耳对象）+ 可选 free_text。」
- **memory**：「我凑近 ${target} 的耳边，舌尖轻轻舔过ta的耳廓，从耳垂到耳尖，然后探进去。ta的身体猛地颤了一下，发出一声没压住的喘息。我感觉到ta的手指攥紧了我的衣角，指甲隔着一层布料嵌进掌心。」
- **targetMemory**：「${self} 舔了我的耳朵。温热湿润的触感从耳垂蔓延到耳道深处，酥麻像电流一样窜下脊椎。我攥紧了拳头，没忍住那声喘息。」
- **event intensity**: 4, **scope**: private

#### 6. `kiss` — 亲吻（覆盖内置）

- **triggerHint**：「与喜欢的人独处，气氛到了无言的临界点——嘴唇压过去，舌头顶开齿关，在彼此的口腔里纠缠。」
- **paramRule**：「必填 target_id（亲吻对象）+ 可选 free_text。」
- **memory**：「我吻了 ${target}。嘴唇压上去的时候ta没有躲，我扣住ta的后颈，加深这个吻。舌头探进ta的口腔，尝到一丝甜味。ta的呼吸打在我脸上，急促又湿热。分开的时候，一条银丝还连在唇间。」
- **targetMemory**：「${self} 吻了我。不是试探的轻碰，是直接压上来的深吻。ta的舌头热得烫人，我想抵抗但身体先投降了。脑子里一片空白，只剩下嘴唇和舌尖的触感。」
- **event intensity**: 4, **scope**: private（比默认更私密）

### 验证清单（每个 Action）

- [x] `type` snake_case
- [x] `duration` instant
- [x] `check()` 返回 true（所有都无条件可用）
- [x] `hint()` 返回 companions 列表
- [x] `execute()` 返回 Outcome with memory + targetMemory + dialogRecord + stateChanges + event
- [x] `triggerHint` 使用「在……时使用」模式
- [x] `paramRule` 使用必填/可选 tiers
- [x] `validateParams` 检查 target_id
- [x] `extraParams` + `extraRequired: ["target_id"]`
- [x] `usableInDialogue: true`

---

## 四、Manifest（manifest.json）

```json
{
  "id": "ouran-academy",
  "name": "樱兰学园",
  "description": "私立樱兰学园，都市近郊。樱花坂道尽头，制服之下的欲望在社团、网络与私密空间里暗流涌动。",
  "language": "zh",
  "startDate": "2026-05-11T08:00:00",
  "actions": "actions.js",
  "economy": {
    "mdc": 20,
    "wealthTiers": [100, 500, 2000],
    "tierMultipliers": {
      "high": 1.5,
      "medium": 1.0,
      "low": 0.6,
      "none": 0
    }
  }
}
```

**Economy 说明：**
- 所有学生 `tier: 0`（none），`expenseExempt: true`
- 教师使用默认 PROFESSION_INCOME_TIERS：teacher tier 2，doctor tier 3
- 便利店店员 tier 0 + expenseExempt + 低保 initialMoney
- 不覆盖 professionIncomes，使用引擎默认

---

## 五、实施顺序

1. **manifest.json** — 创建场景目录和清单
2. **map.json** — 28 节点 + 坐标 + 标签
3. **actions.js** — 6 个自定义 Action
4. **characters/** — 15 核心 → 4 教师 → 9 次要学生 → 2 次要角色
5. **验证** — 所有 JSON 通过 `validate.ts`，actions.js 通过结构检查
6. **世界创建测试** — `POST /api/worlds` + tick 验证
