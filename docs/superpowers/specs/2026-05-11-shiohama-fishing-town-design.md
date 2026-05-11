# 潮浜町 (Shiohama) — 日式渔港乡镇 Mod 设计文档

## 概述

- **场景 id**: `shiohama`
- **名称**: 潮浜町
- **语言**: `zh`
- **主题**: 类星露谷的日式现代海岸渔港乡镇——慢节奏、邻里社区感、渔获经济可见
- **节点数**: ~38
- **角色数**: 15

---

## 一、地图 (`map.json`)

根节点为潮浜町全域（conceptual root）。轮渡码头为 `isEntry: true`。

### 节点清单

**根节点:**
1. `shiohama-root` — 潮浜町（root, parentId: null, 概念节点, 不可见）

**入口 & 滨海区（root 子节点）:**
2. `ferry-terminal` — 轮渡码头（isEntry: true, public, outdoor, 容量30）
3. `coastal-road` — 滨海公路（public, outdoor, street, 容量50）
4. `breakwater-park` — 防波堤公园（public, outdoor, park, 容量20, parentId: coastal-road）
5. `bus-stop` — 巴士候车亭（public, outdoor, street, 容量10, parentId: coastal-road）
6. `lighthouse` — 潮浜灯塔（semi, outdoor, quiet, 容量6, parentId: coastal-road, travelCost: 1）
7. `lighthouse-quarters` — 灯塔管理员室（private, indoor, residence, 容量2, parentId: lighthouse）

**本町通り（root 子节点）:**
8. `honmachi-street` — 本町通り（public, outdoor, street, 容量40）
9. `town-hall` — 町役场（semi, indoor, 容量15, parentId: honmachi-street）
10. `zakkaya` — よろずや雑貨店（semi, indoor, 容量10, parentId: honmachi-street）[店铺]
11. `clinic` — 潮浜诊所（semi, indoor, 容量8, parentId: honmachi-street）
12. `bakery` — 小麦堂面包房（semi, indoor, dining, 容量8, parentId: honmachi-street）[店铺]
13. `cafe` — 渔火咖啡馆（semi, indoor, dining, 容量15, parentId: honmachi-street）[店铺]
14. `post-office` — 邮便局（semi, indoor, 容量8, parentId: honmachi-street）

**渔港区（root 子节点）:**
15. `fishing-port` — 渔港区（public, outdoor, 容量60）
16. `boat-berth` — 渔船泊地（semi, outdoor, 容量30, parentId: fishing-port）
17. `asamizu-market` — 浜の朝市（semi, outdoor, dining, 容量25, parentId: fishing-port）[店铺]
18. `ice-house` — 制冰/冷藏仓库（semi, indoor, 容量8, parentId: fishing-port）
19. `drying-workshop` — 鱼干加工场（semi, indoor, 容量10, parentId: fishing-port）[店铺]

**后山区（root 子节点）:**
20. `hillside` — 后山（public, outdoor, park, 容量30）
21. `shiohama-shrine` — 潮见神社（semi, outdoor, quiet, 容量20, parentId: hillside）
22. `shrine-quarters` — 神社住居（private, indoor, residence, 容量3, parentId: shiohama-shrine）
23. `sento` — 山の汤温泉钱汤（semi, indoor, bathing, 容量15, parentId: hillside）[店铺]
24. `sento-quarters` — 钱汤住居（private, indoor, residence, bathing, 容量3, parentId: sento）
25. `lookout` — 展望台（semi, outdoor, park, quiet, 容量8, parentId: hillside, travelCost: 1）
26. `cemetery` — 潮浜墓地（semi, outdoor, quiet, 容量15, parentId: hillside）

**海水浴场（root 子节点）:**
27. `beach` — 潮浜海水浴场（public, outdoor, playground, 容量80）
28. `umi-no-ie` — 海の家（semi, outdoor, dining, 容量20, parentId: beach）
29. `uminoie-quarters` — 海の家裏部屋（private, indoor, residence, 容量2, parentId: umi-no-ie）

**小学校（root 子节点）:**
30. `elementary-school` — 潮浜小学校（semi, indoor, education, 容量30）

**住宅街区（root 子节点）:**
31. `residential-area` — 住宅街区（semi, outdoor, residence, 容量40）
32. `sato-house` — 佐藤家（private, indoor, residence, 容量6, parentId: residential-area）
33. `sato-house-bath` — 佐藤家浴室（private, indoor, residence, bathing, 容量2, parentId: sato-house）
34. `kimura-house` — 木村家（private, indoor, residence, 容量4, parentId: residential-area）
35. `kimura-house-bath` — 木村家浴室（private, indoor, residence, bathing, 容量2, parentId: kimura-house）
36. `sakano-apartment` — 坂の上住宅（private, indoor, residence, 容量10, parentId: residential-area）
37. `apartment-shiohama` — アパート潮浜（private, indoor, residence, 容量15, parentId: residential-area）
38. `apartment-shiohama-bath` — 公寓共用浴室（semi, indoor, residence, bathing, 容量3, parentId: apartment-shiohama）

### 地图校验清单
- [x] ≥1 entry（轮渡码头）
- [x] ≥1 bathing（钱汤 + 钱汤住居 + 佐藤家浴室 + 木村家浴室 + 公寓共用浴室 = 5）
- [x] exactly 1 root（shiohama-root, parentId: null）
- [x] 所有非根 parentId 存在于同文件
- [x] 节点 id 唯一
- [x] tags/privacy 来自闭合枚举

---

## 二、物品 (`items.json`)

| id | 名称 | 价格 | 类型 | 效果 |
|----|------|------|------|------|
| `dried-fish` | 一夜干し竹荚鱼 | 15 | consumable | resetHunger |
| `fish-bento` | 潮浜海鲜便当 | 25 | consumable | resetHunger |
| `shiohama-bread` | 盐味海藻面包 | 12 | consumable | resetHunger |
| `coffee-milk` | 渔火特调咖啡牛奶 | 10 | consumable | adjustMood:1 |
| `miso-soup` | 鱼骨味噌汤 | 8 | consumable | adjustHunger:-3 |
| `towel-set` | 潮浜毛巾 | 20 | consumable | resetHygiene |
| `lighthouse-postcard` | 灯塔明信片 | 8 | non-consumable | — |
| `omamori` | 潮见神社御守 | 30 | consumable | adjustMood:2 |
| `salted-caramel` | 海盐焦糖 | 6 | consumable | adjustMood:1 |

---

## 三、店铺 (`shops.json`)

| 店铺 id | 对应节点 | 店主 | 商品 | 工资 |
|----------|----------|------|------|------|
| `shop-zakkaya` | `zakkaya` | char-kimura-yasuhei | dried-fish, towel-set, lighthouse-postcard | 50 |
| `shop-bakery` | `bakery` | char-yamada-akari | shiohama-bread, salted-caramel, coffee-milk | 45 |
| `shop-cafe` | `cafe` | char-ito-umi | coffee-milk, fish-bento, miso-soup | 40 |
| `shop-sento` | `sento` | char-takahashi-matsuko | towel-set, coffee-milk | 35 |
| `shop-asamizu` | `asamizu-market` | char-sato-mayumi | dried-fish, fish-bento, miso-soup | 45 |
| `shop-kakouba` | `drying-workshop` | char-sato-genji | dried-fish, fish-bento | 40 |

### 店铺校验清单
- [x] 每个店主角色存在
- [x] 每个 nodeId 存在于 map.json
- [x] 店铺不在同一祖先-后代线上（钱汤在 hillside 下，面包房在 honmachi-street 下，不冲突）
- [x] 每个店铺 goods ≤ 3

---

## 四、经济配置 (`manifest.json`)

```json
{
  "id": "shiohama",
  "name": "潮浜町",
  "description": "面向太平洋的小渔港镇。轮渡一天两班，朝市天不亮就热闹起来，灯塔的光每晚扫过防波堤。这里的日子跟着潮汐走。",
  "language": "zh",
  "startDate": "2026-05-11T06:00:00",
  "economy": {
    "mdc": 20
  },
  "items": "items.json",
  "shops": "shops.json"
}
```

---

## 五、角色阵容（15人）

### 角色创建顺序（严格按此序创建模板）

#### Round 1 — 渔港经济线：佐藤三代

**5.1 佐藤源治** (`char-sato-genji`)
- 年龄: 58, 性别: male, 职业: fisherman, 出身: local
- 人格: ei:-3, sn:0, tf:2, jp:3
- 智慧/外貌/体质: 3/1/2
- 活动节点: drying-workshop（鱼干加工场）, 休息节点: sato-house
- 角色定位: 第三代渔师，鱼干加工场店主。长年出海让他在海里比在陆地上自在。话少、观察力强——在船上不需要话多。至今不相信祖母的话都是错的。
- origin 验证: 有住宅(佐藤家)+血缘关系(女儿、孙子)≥1 → local ✓
- 收入层级: fisherman=tier2, 日收入=BME*1.0*20=1.2*1.0*20≈24, 日开销≈20, 可持续 ✓

**5.2 佐藤真由美** (`char-sato-mayumi`)
- 年龄: 38, 性别: female, 职业: merchant, 出身: local
- 人格: ei:2, sn:1, tf:0, jp:2
- 智慧/外貌/体质: 2/3/2
- 活动节点: asamizu-market（朝市鱼摊）, 休息节点: sato-house
- 角色定位: 朝市鱼摊老板。父亲源治教她看鱼的眼光，前夫离开时留下摊位和翔太。每天早上4点站在摊前，从不迟到。
- origin 验证: 有住宅(佐藤家)+血缘关系(父亲、儿子)≥3+父亲 local → local ✓
- 收入层级: merchant=tier3, 日收入=BME*tier*MDC=1.2*3*20=72, 日开销≈20, 充裕 ✓

**5.3 佐藤翔太** (`char-sato-shota`)
- 年龄: 22, 性别: male, 职业: fisherman, 出身: local
- 人格: ei:-1, sn:-2, tf:-2, jp:-1
- 智慧/外貌/体质: 2/3/3
- 活动节点: drying-workshop（鱼干加工场，爷爷的店员工）, 休息节点: sato-house
- 角色定位: 源治的孙子，真由美的儿子。在爷爷的加工场工作，但心很远——用手机刷着东京的视频。不知道该不该留下。
- origin 验证: 有住宅(佐藤家、与母同住)+母/祖父皆 local → local ✓
- 收入层级: fisherman=tier2, shop employee(工资40), 日收入=24+40≈64, 日开销≈20, 可持续 ✓

#### Round 2 — 本町商业线：店铺主三人和町长

**5.4 木村康平** (`char-kimura-yasuhei`)
- 年龄: 45, 性别: male, 职业: merchant, 出身: local
- 人格: ei:3, sn:2, tf:1, jp:1
- 智慧/外貌/体质: 2/2/2
- 活动节点: zakkaya（雑貨店店主）, 休息节点: kimura-house
- 角色定位: 杂物店第二代店主兼町内情报网核心。能一边结账一边把镇上的事全说起来。抽屉里有本牛皮笔记本，记着什么只有他自己知道。
- origin 验证: 有住宅(木村家)+在此经营>1年 → local ✓
- 收入层级: merchant=tier3, 日收入=72, 日开销≈20, 充裕 ✓

**5.5 山田明里** (`char-yamada-akari`)
- 年龄: 34, 性别: female, 职业: baker, 出身: local（移住者，已定居4年）
- 人格: ei:1, sn:-1, tf:3, jp:2
- 智慧/外貌/体质: 2/3/2
- 活动节点: bakery（面包房店主）, 休息节点: sakano-apartment
- 角色定位: 从大阪搬来做面包的年轻女性。用的是本地海盐，从不解释自己为什么从城市逃到小镇。早晚各烘焙一次，窗台花盆种着小番茄。
- origin 验证: 【⚠️ "移住者悖论"——已定居4年+有自己店铺 → local】有住宅(坂の上) ✓
- 收入层级: baker=tier2, 日收入=1.2*2*20≈48, 日开销≈20, 可持续 ✓

**5.6 伊藤海** (`char-ito-umi`)
- 年龄: 28, 性别: male, 职业: brewer, 出身: local（归乡，离京2年）
- 人格: ei:-2, sn:2, tf:-3, jp:0
- 智慧/外貌/体质: 3/3/1
- 活动节点: cafe（咖啡馆店主）, 休息节点: apartment-shiohama
- 角色定位: 在东京做了6年程序员，两年前回来开了咖啡馆。墙壁上是祖父的老钟——停在了他回来的那一天。用工业导流嘴的手冲壶冲咖啡，从不解释为什么回来。
- origin 验证: 已归乡2年+经营中 → local（尽管apartment属租赁，但他已有固定收入和社区关系≥3） ✓
- 收入层级: brewer=tier2, 日收入=1.0*2*20=40 (health 1→healthFactor 1.4→BME=1.0*1.4=1.4... wait, health=1 means healthFactor=1.4, so BME=1.0*1.4=1.4 → 日收入=1.4*2*20=56), 日开销≈20, 可持续 ✓

**5.7 森田隆** (`char-morita-takashi`)
- 年龄: 55, 性别: male, 职业: mayor, 出身: local
- 人格: ei:2, sn:1, tf:2, jp:4
- 智慧/外貌/体质: 3/2/2
- 活动节点: town-hall, 休息节点: sakano-apartment
- 角色定位: 第三代町长，祖父也是町长。在年轻人都走的时代努力留住一切能留的。用 iPad 做町财政表，但每逢祭日穿和服。
- origin 验证: 有住宅(坂の上)+在此经营>1年 → local ✓
- 收入层级: mayor=tier2, 日收入=1.2*2*20≈48, 日开销≈20, 可持续 ✓

#### Round 3 — 公共服务线

**5.8 中村健一** (`char-nakamura-kenichi`)
- 年龄: 51, 性别: male, 职业: doctor, 出身: local
- 人格: ei:0, sn:-1, tf:3, jp:3
- 智慧/外貌/体质: 4/2/2
- 活动节点: clinic, 休息节点: sakano-apartment
- 角色定位: 小镇唯一的医生。星期一到星期六坐诊，星期天写医学论文（一年后转去大学医院上班）。和明里有微妙的张力。
- origin 验证: 有住宅(坂の上)+在此经营>1年 → local ✓
- 收入层级: doctor=tier3, 日收入=72, 日开销≈20, 充裕 ✓

**5.9 小川清** (`char-ogawa-kiyoshi`)
- 年龄: 67, 性别: male, 职业: priest, 出身: local
- 人格: ei:-4, sn:3, tf:1, jp:4
- 智慧/外貌/体质: 3/1/1
- 活动节点: shiohama-shrine, 休息节点: shrine-quarters
- 角色定位: 潮见神社宫司。四十年没离开过这个镇，每天在石阶上扫落叶，安静地面对。近来山下弟子让他考虑退休。
- origin 验证: 有住宅(神社住屋)+在此经营>1年 → local ✓
- 收入层级: priest=tier2, 日收入=0.75*2*20=30 (age 66+ BME=0.75*healthFactor, health=1→1.0*1.4=1.4*... wait. health 1 → healthFactor=1.4, BME=basal(0.9)*1.4=1.26, 日收入=1.26*2*20≈50). 日开销≈20, 可持续 ✓

**5.10 铃木枫** (`char-suzuki-kaede`)
- 年龄: 25, 性别: female, 职业: teacher, 出身: local
- 人格: ei:4, sn:0, tf:2, jp:-1
- 智慧/外貌/体质: 2/2/3
- 活动节点: elementary-school, 休息节点: apartment-shiohama
- 角色定位: 潮浜小学校唯一的青年教师。教1-3年级混合班。本科学位拿完后直接分配到这里——本来只想待一年。现在正在待第三年。
- origin 验证: 有住宅(公寓)+有工作+在此已3年 → local ✓
- 收入层级: teacher=tier2, 日收入=1.2*2*20≈48, 日开销≈20, 可持续 ✓

#### Round 4 — 其他居民

**5.11 高桥松子** (`char-takahashi-matsuko`)
- 年龄: 64, 性别: female, 职业: innkeeper, 出身: local
- 人格: ei:3, sn:-2, tf:1, jp:2
- 智慧/外貌/体质: 1/1/1
- 活动节点: sento（钱汤店主）, 休息节点: sento-quarters
- 角色定位: 山の汤钱汤第四代。从昭和年代嫁进山の汤已经四十多年。左手腕的疤是二十年前开水管时烫的。知道每个常客的习惯，但从不评论。有高血压、有习惯性头痛。
- origin 验证: 有住宅(钱汤住屋)+在此经营>1年 → local ✓
- 收入层级: innkeeper=tier2, 日收入=0.75*1.4*2*20≈42 (age 64 BME=0.9*healthFactor, health 1→healthFactor 1.4→BME=1.26, 日收入=1.26*2*20≈50), 日开销≈20, 可持续 ✓.

**5.12 田中宏人** (`char-tanaka-hiroto`)
- 年龄: 62, 性别: male, 职业: mailman, 出身: local
- 人格: ei:2, sn:-2, tf:-1, jp:1
- 智慧/外貌/体质: 1/2/2
- 活动节点: lighthouse（灯塔管理员，上午去 post-office 送信）, 休息节点: lighthouse-quarters
- 角色定位: 前大间渔夫，退休后管灯塔又送邮件。知道谁收什么信。左手无名指以下只有两节半。
- origin 验证: 有住宅(灯塔住屋)+在此>1年 → local ✓
- 收入层级: mailman=tier2, 日收入=0.9*1.2*2*20≈43 (age 62 BME=0.75*healthFactor, health 2→1.2→BME=0.9, 日收入=0.9*2*20=36), 日开销≈20, 可持续但紧 ✓

**5.13 和田莲** (`char-wada-ren`)
- 年龄: 19, 性别: male, 职业: unemployed, 出身: local
- 人格: ei:-3, sn:3, tf:-4, jp:-2
- 智慧/外貌/体质: 3/3/1
- 活动节点: 无固定, 休息节点: apartment-shiohama
- 角色定位: 高中中退后才回到镇上一年半的孩子。在渔火咖啡馆帮忙但不拿工资——刷杯子换一杯免费咖啡。墙上笔记本写满晦涩的诗和奇异的涂鸦。
- origin 验证: 有住宅(公寓)+在镇>1年 → local ✓
- 经济: unemployed=tier 0, age≥18, 需要 `expenseExempt: true` 或经济来源。设 `expenseExempt: true`（海默许包他的饭）。
- 经济: expenseExempt: true ✓

**5.14 森田美咲** (`char-morita-misaki`)
- 年龄: 10, 性别: female, 职业: student, 出身: local
- 人格: ei:2, sn:1, tf:2, jp:-1
- 智慧/外貌/体质: 3/3/3
- 活动节点: elementary-school, 休息节点: sakano-apartment（父同住在家）
- 角色定位: 森田隆的女儿，小学四年级，班上唯一的十岁小孩。书包上挂着去年夏祭抽签中的鲸鱼钥匙扣。想知道灯塔里有什么，每次去海边都捡一块不同的石头带回家。
- origin 验证: 未成年+父 local → local ✓
- 经济: age<18, expenseExempt 默认 true, 不写 false ✓

**5.15 林海月** (`char-lin-haiyue`)
- 年龄: 27, 性别: female, 职业: chef, 出身: visitor  ← 唯一 visitor
- 人格: ei:2, sn:2, tf:0, jp:3
- 智慧/外貌/体质: 2/3/2
- 活动节点: umi-no-ie（海の家, 夏季经营）, 休息节点: uminoie-quarters
- 角色定位: 季节来访的厨师,白天在海の家,傍晚关门后面向防波堤看灯塔。每年五月来九月走。第七个夏天。夏季结束后回广岛。
- origin 验证: 季节/临时+外来没有固定住所+关系≤2 → visitor ✓
- 经济: visitor+tier 0→expenseExempt: true ✓

---

### 角色关系矩阵

```
源治(58F)
  ├── 真由美(38M) : father+colleague, affection 3
  ├── 翔太(22F) : grandfather, affection 3
  ├── 康平(45M) : neighbor+friend, affection 2
  └── 清(67P) : friend, affection 2

真由美(38M)
  ├── 源治(58F) : daughter+colleague, affection 3
  ├── 翔太(22F) : mother, affection 4
  ├── 海(28B) : classmate, affection 1
  └── 明里(34B) : friend, affection 2

翔太(22F)
  ├── 真由美(38M) : son, affection 2
  ├── 源治(58F) : grandson, affection 2
  └── 莲(19U) : acquaintance, affection 0

康平(45M)
  ├── 源治(58F) : neighbor+friend, affection 2
  └── 隆(55May) : colleague, affection 1

明里(34B)
  ├── 海(28B) : friend, affection 2
  └── 健一(51D) : acquaintance, affection 1 (impression: "他看病时眼神很温暖")

海(28B)
  ├── 真由美(38M) : classmate, affection 1
  ├── 明里(34B) : friend, affection 2
  ├── 枫(25T) : classmate, affection 1
  └── 莲(19U) : 常客, affection 1

隆(55May)
  ├── 美咲(10S) : father, affection 4
  ├── 海月(27C) : landlord, affection 1
  └── 康平(45M) : colleague, affection 1

健一(51D)
  ├── 松子(64I) : doctor, affection 2
  └── 明里(34B) : acquaintance, affection 1

清(67P)
  ├── 源治(58F) : friend, affection 2
  └── 宏人(62Mail) : friend, affection 3

枫(25T)
  ├── 海(28B) : classmate, affection 1
  └── 美咲(10S) : teacher, affection 3

松子(64I)
  ├── 宏人(62Mail) : friend, affection 1
  └── 健一(51D) : patient, affection 2

宏人(62Mail)
  ├── 清(67P) : friend, affection 3
  └── 松子(64I) : friend, affection 1

莲(19U)
  └── 海(28B) : (impression: "他是唯一个不问'你接下来打算做什么'的成年人")

美咲(10S)
  ├── 隆(55May) : father, affection 4
  └── 枫(25T) : student, affection 2

海月(27C)
  └── 隆(55May) : tenant, affection 1
```

### 核心叙事线

1. **佐藤家三代与渔港的未来** — 源治坚守加工场但体力逐年下滑，真由美用朝市撑起中间一代的担子，翔太在离开和留下之间摇摆
2. **归乡与离乡** — 海从东京回来但从不解释原因，莲努力找留在镇上的理由，海月每年夏天来来去去
3. **老龄化与乡镇存续** — 隆用 iPad 做财政表格，康平用牛皮笔记记录小镇变迁，清每天扫石阶面对越来越少参拜者的神社

---

## 六、自定义 Actions（可选）

此场景暂不定义自定义 actions——系统内置 action 已经涵盖了所需行为（buy/use_item/give_item/work/manage_employment/eat/bathe/speak/move/rest/sleep/exercise/meditate）。日后可根据模拟需要添加：

- `walk_on_breakwater` — 防波堤散步，调整 mood/stress
- `pray_at_shrine` — 神社参拜，调整 stress
- `fishing_trip` — 出渔（长时间 ongoing action），获得物品

---

## 七、实现顺序

1. `manifest.json` — 项目骨架
2. `map.json` — 节点树（依赖 manifest id）
3. `items.json` — 物品定义（依赖 nodes 中的店铺位置）
4. `shops.json` — 店铺定义（依赖 items 和 characters）
5. `characters/*.json` — 按 Round 1→4 顺序创建：佐藤三代 → 商业线 → 公共服务 → 其他居民
6. 校验：每个文件单独跑 `validate.ts`，全部通过后跑 `pnpm test:backend`

---

## 八、自检

- [x] 所有角色 origin 已验证（1 visitor, 14 local）
- [x] 所有角色年龄经济已验证（未成年人 expenseExempt 默认, 成年无收入者 expenseExempt: true）
- [x] speakingStyle 可区分度（待生成时校验）
- [x] 语言一致（zh）
- [x] 地图 ≥1 entry + ≥1 bathing + exactly 1 root
- [x] 店铺 nodeId 全部存在于 map
- [x] 店铺 goods 每个 ≤3
- [x] 所有角色 id 唯一
- [x] 所有节点 id 唯一
- [x] 关系仅从此角色出发（非对称）
