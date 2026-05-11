# Shiohama Fishing Town Mod — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the shiohama (潮浜町) Japanese coastal fishing town scene with 38 nodes, 15 characters, 9 items, 6 shops, and economy config.

**Architecture:** Data-only mod — creates `backend/scenes/shiohama/` with manifest, map, items, shops, and character templates. No custom actions needed; all built-in actions cover the required behavior. Validated against Zod schemas via `validate.ts`.

**Tech Stack:** JSON config files, CommonJS for shops/items (if JS needed), Zod validation via backend CLI scripts.

---

### Task 1: Create directory structure and manifest.json

**Files:**
- Create: `backend/scenes/shiohama/manifest.json`
- Create: `backend/scenes/shiohama/characters/` (directory)

- [ ] **Step 1: Create directories and manifest.json**

```bash
mkdir -p backend/scenes/shiohama/characters
```

- [ ] **Step 2: Write manifest.json**

Write `backend/scenes/shiohama/manifest.json`:

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

- [ ] **Step 3: Validate manifest**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/shiohama/manifest.json
```

Expected: passes with no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/scenes/shiohama/manifest.json
git commit -m "feat: add shiohama manifest"
```

---

### Task 2: Write map.json (nodes 1-19: root through 渔港区)

**Files:**
- Create: `backend/scenes/shiohama/map.json`

- [ ] **Step 1: Write map.json with first half of nodes**

Write `backend/scenes/shiohama/map.json`:

```json
{
  "id": "shiohama",
  "nodes": [
    {
      "id": "shiohama-root",
      "parentId": null,
      "name": "潮浜町",
      "description": "面向太平洋的小渔港镇。轮渡一天两班，朝市天不亮就热闹起来。",
      "tags": [],
      "capacity": null,
      "privacy": "public",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 0, "y": 0, "w": 60, "h": 48,
      "spriteKey": "town"
    },
    {
      "id": "ferry-terminal",
      "parentId": "shiohama-root",
      "name": "轮渡码头",
      "description": "一天两班的渡轮在此靠岸。海盐侵蚀了栈桥的铁栏杆，碎贝壳混在水泥地面的缝隙里。海风从太平洋长驱直入。",
      "tags": ["outdoor", "public"],
      "capacity": 30,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": true,
      "x": 2, "y": 42, "w": 10, "h": 6,
      "spriteKey": "town"
    },
    {
      "id": "coastal-road",
      "parentId": "shiohama-root",
      "name": "滨海公路",
      "description": "沿着海岸线蜿蜒的双车道公路。路面晒得发白，路肩长着耐盐的野草。一侧是海，一侧是山侧的防沙林。",
      "tags": ["outdoor", "public", "street"],
      "capacity": 50,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 2, "y": 32, "w": 56, "h": 8,
      "spriteKey": "town"
    },
    {
      "id": "breakwater-park",
      "parentId": "coastal-road",
      "name": "防波堤公园",
      "description": "混凝土防波堤上放着几张木制长椅。傍晚时分有老人钓鱼，浪花打在堤壁溅起冷雾。远处能看见轮渡的烟。",
      "tags": ["outdoor", "public", "park"],
      "capacity": 20,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 2, "y": 1, "w": 16, "h": 6,
      "spriteKey": "park"
    },
    {
      "id": "bus-stop",
      "parentId": "coastal-road",
      "name": "巴士候车亭",
      "description": "褪色的蓝铁皮候车亭，时刻表被海风吹得起皱。一天三班开往内陆的巴士从这里出发。候车椅上放着一把谁忘记的塑料伞。",
      "tags": ["outdoor", "public", "street"],
      "capacity": 10,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 44, "y": 1, "w": 6, "h": 6,
      "spriteKey": "town"
    },
    {
      "id": "lighthouse",
      "parentId": "coastal-road",
      "name": "潮浜灯塔",
      "description": "白色圆柱形灯塔矗立在镇北的岩岬上。塔内铁梯盘旋而上，灯室的地板被机油和汗水磨得锃亮。每晚光束扫过海面两次。",
      "tags": ["outdoor", "quiet"],
      "capacity": 6,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 1,
      "x": 2, "y": 22, "w": 6, "h": 8,
      "spriteKey": "school"
    },
    {
      "id": "lighthouse-quarters",
      "parentId": "lighthouse",
      "name": "灯塔管理员室",
      "description": "灯塔底层的两叠小间。铁架床、航海日志、一台老式短波收音机。窗外只有海和天。",
      "tags": ["indoor", "private", "residence"],
      "capacity": 2,
      "privacy": "private",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 1, "y": 1, "w": 4, "h": 3,
      "spriteKey": "fallback"
    },
    {
      "id": "honmachi-street",
      "parentId": "shiohama-root",
      "name": "本町通り",
      "description": "潮浜町唯一的商店街。遮雨棚连成一条弧线，下午的阳光从棚隙漏下来。偶尔有自行车铃声穿过。",
      "tags": ["outdoor", "public", "street"],
      "capacity": 40,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 14, "y": 2, "w": 30, "h": 8,
      "spriteKey": "town"
    },
    {
      "id": "town-hall",
      "parentId": "honmachi-street",
      "name": "町役场",
      "description": "昭和年代建的二层混凝土建筑。一楼的告示栏贴着观光振兴海报和潮位表。空气里有复印机碳粉和旧木头的味道。",
      "tags": ["indoor"],
      "capacity": 15,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 0, "y": 0, "w": 8, "h": 8,
      "spriteKey": "school"
    },
    {
      "id": "zakkaya",
      "parentId": "honmachi-street",
      "name": "よろずや雑貨店",
      "description": "从鱼线到酱油到灯塔明信片什么都卖的老式杂货店。货架挤到只容一人侧身通过，收银台上放着一台绿色记账机。",
      "tags": ["indoor"],
      "capacity": 10,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 8, "y": 0, "w": 5, "h": 8,
      "spriteKey": "restaurant"
    },
    {
      "id": "clinic",
      "parentId": "honmachi-street",
      "name": "潮浜诊所",
      "description": "白墙木框的小诊所。候诊室有三把椅子和一盆快枯死的绿萝，诊室里的血压计是十年前的老型号。消毒酒精的味道很淡。",
      "tags": ["indoor"],
      "capacity": 8,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 13, "y": 0, "w": 5, "h": 8,
      "spriteKey": "school"
    },
    {
      "id": "bakery",
      "parentId": "honmachi-street",
      "name": "小麦堂面包房",
      "description": "小小的面包店，玻璃柜里摆着海盐卷和焦糖奶油包。烤箱定时器每二十分钟响一次，整条街都能闻到黄油融化的甜味。",
      "tags": ["indoor", "dining"],
      "capacity": 8,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 18, "y": 0, "w": 5, "h": 8,
      "spriteKey": "restaurant"
    },
    {
      "id": "cafe",
      "parentId": "honmachi-street",
      "name": "渔火咖啡馆",
      "description": "旧木窗框、水泥地、一台意式咖啡机和祖父的老挂钟。墙上钉着一张手写菜单——字迹是归乡的咖啡师的手笔。靠窗座位能看到远处灯塔。",
      "tags": ["indoor", "dining"],
      "capacity": 15,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 23, "y": 0, "w": 7, "h": 8,
      "spriteKey": "restaurant"
    },
    {
      "id": "post-office",
      "parentId": "honmachi-street",
      "name": "邮便局",
      "description": "红邮筒立在门口，窗口后面的木格架上按町内区域分好邮件。午前有人送信，午后窗口开两小时。",
      "tags": ["indoor"],
      "capacity": 8,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 0, "y": 0, "w": 0, "h": 0,
      "spriteKey": "school"
    },
    {
      "id": "fishing-port",
      "parentId": "shiohama-root",
      "name": "渔港区",
      "description": "潮浜的作业心脏。渔船泊在混凝土栈桥旁，空气中弥漫着柴油、海藻和鱼腥的混合气味。天没亮就开始有引擎声。",
      "tags": ["outdoor", "public"],
      "capacity": 60,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 14, "y": 14, "w": 20, "h": 18,
      "spriteKey": "town"
    },
    {
      "id": "boat-berth",
      "parentId": "fishing-port",
      "name": "渔船泊地",
      "description": "七八艘渔船并排停靠，船舷碰着防撞轮胎。缆绳在桩上绕了又绕，甲板上叠着渔网和塑胶桶。",
      "tags": ["outdoor"],
      "capacity": 30,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 1, "y": 2, "w": 18, "h": 5,
      "spriteKey": "playground"
    },
    {
      "id": "asamizu-market",
      "parentId": "fishing-port",
      "name": "浜の朝市",
      "description": "渔港旁边的半露天市场。天亮前就开始营业，冰台上铺着竹荚鱼、鰤鱼和乌贼。叫卖声和泡沫箱开合的声音从未间断。",
      "tags": ["outdoor", "dining"],
      "capacity": 25,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 1, "y": 8, "w": 18, "h": 4,
      "spriteKey": "restaurant"
    },
    {
      "id": "ice-house",
      "parentId": "fishing-port",
      "name": "制冰/冷藏仓库",
      "description": "渔港旁的大型冷库。制冰机昼夜轰鸣，管壁上结着白霜。渔获从这里装箱，天亮前用卡车运往内陆。",
      "tags": ["indoor"],
      "capacity": 8,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 1, "y": 13, "w": 7, "h": 4,
      "spriteKey": "school"
    },
    {
      "id": "drying-workshop",
      "parentId": "fishing-port",
      "name": "鱼干加工场",
      "description": "佐藤家经营的加工场。竹架排满风干中的一夜干し，海风穿过纱窗带走水分。空气里是浓缩的鲜味和淡淡的烟熏气。",
      "tags": ["indoor"],
      "capacity": 10,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 9, "y": 13, "w": 10, "h": 4,
      "spriteKey": "school"
    }
  ]
}
```

- [ ] **Step 2: Append remaining nodes (hillside, beach, school, residential)**

Append the following nodes to the `"nodes"` array in `map.json`:

```json
    {
      "id": "hillside",
      "parentId": "shiohama-root",
      "name": "后山",
      "description": "镇南的缓坡丘陵，杉木林和杂木混在一起。石阶从山脚延伸到山顶，两侧立着风化了的石灯笼。风吹过树冠的声音像远方的海浪。",
      "tags": ["outdoor", "public", "park"],
      "capacity": 30,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 36, "y": 2, "w": 12, "h": 22,
      "spriteKey": "park"
    },
    {
      "id": "shiohama-shrine",
      "parentId": "hillside",
      "name": "潮见神社",
      "description": "坐落于后山半腰的小神社。朱红鸟居在海风中褪成浅粉，本殿前的手水舍水面映着树叶的影子。从参道望去可以看见整片海湾。",
      "tags": ["outdoor", "quiet"],
      "capacity": 20,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 1, "y": 1, "w": 10, "h": 6,
      "spriteKey": "park"
    },
    {
      "id": "shrine-quarters",
      "parentId": "shiohama-shrine",
      "name": "神社住居",
      "description": "本殿侧后方的木造住居。六叠一间，纸门推开就能看见参道的石灯。炉上总是搁着铁瓶，榻榻米有草席和线香交织的气味。",
      "tags": ["indoor", "private", "residence"],
      "capacity": 3,
      "privacy": "private",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 1, "y": 1, "w": 3, "h": 4,
      "spriteKey": "fallback"
    },
    {
      "id": "sento",
      "parentId": "hillside",
      "name": "山の汤温泉钱汤",
      "description": "山脚下经营了四代的温泉钱汤。脱衣所的木柜上刻着老顾客的名字，浴池的石壁上有一道天然裂纹——说是地震那年留下的。水汽氤氲，像另一个世界。",
      "tags": ["indoor", "bathing"],
      "capacity": 15,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 1, "y": 8, "w": 10, "h": 5,
      "spriteKey": "home-warm"
    },
    {
      "id": "sento-quarters",
      "parentId": "sento",
      "name": "钱汤住居",
      "description": "钱汤背后的三叠小间。壁橱里收着改了好几遍的账本，窗台上放着一排旧温泉入浴剂的空瓶。空气里永远有淡淡的硫磺味。",
      "tags": ["indoor", "private", "residence", "bathing"],
      "capacity": 3,
      "privacy": "private",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 1, "y": 1, "w": 3, "h": 3,
      "spriteKey": "fallback"
    },
    {
      "id": "lookout",
      "parentId": "hillside",
      "name": "展望台",
      "description": "后山顶的木制眺望台。整个潮浜町在眼底展开——渔港、灯塔、远处的海平线。栏干上刻满了来过的人的名字缩写。",
      "tags": ["outdoor", "park", "quiet"],
      "capacity": 8,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 1,
      "x": 1, "y": 14, "w": 10, "h": 4,
      "spriteKey": "park"
    },
    {
      "id": "cemetery",
      "parentId": "hillside",
      "name": "潮浜墓地",
      "description": "神社再往上走，一片朝着海的斜面墓地。花岗岩墓石排列整齐，新鲜的菊和干枯的菊混在一起。海风最大的时候，花会倒。",
      "tags": ["outdoor", "quiet"],
      "capacity": 15,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 1, "y": 19, "w": 10, "h": 3,
      "spriteKey": "park"
    },
    {
      "id": "beach",
      "parentId": "shiohama-root",
      "name": "潮浜海水浴场",
      "description": "镇北的小海湾沙滩。五月水还很凉，沙滩上只有海鸟的脚印和一两只空贝壳。整个夏天这里都是孩子们的声音。",
      "tags": ["outdoor", "public", "playground"],
      "capacity": 80,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 50, "y": 2, "w": 10, "h": 8,
      "spriteKey": "playground"
    },
    {
      "id": "umi-no-ie",
      "parentId": "beach",
      "name": "海の家",
      "description": "只在五月到九月营业的沙滩小屋。炒面酱的焦香和刨冰糖浆的甜味混在海风里。铁板烧得滋滋响，收音机一直在放老歌。",
      "tags": ["outdoor", "dining"],
      "capacity": 20,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 1, "y": 1, "w": 8, "h": 3,
      "spriteKey": "restaurant"
    },
    {
      "id": "uminoie-quarters",
      "parentId": "umi-no-ie",
      "name": "海の家裏部屋",
      "description": "海の家背后搭出来的四叠半。白天是更衣室也是仓库，晚上拉起布帘就成了临时居所。窗外正对防波堤，夜晚能看见灯塔的光扫过天花板。",
      "tags": ["indoor", "private", "residence"],
      "capacity": 2,
      "privacy": "private",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 1, "y": 1, "w": 2, "h": 2,
      "spriteKey": "fallback"
    },
    {
      "id": "elementary-school",
      "parentId": "shiohama-root",
      "name": "潮浜小学校",
      "description": "全镇唯一的小学。三层混凝土校舍，走廊窗台上放着朝颜的盆栽。操场上画着褪色的五十米跑道，旗杆上的旗在风中啪啪响。",
      "tags": ["indoor", "education"],
      "capacity": 30,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 50, "y": 12, "w": 8, "h": 6,
      "spriteKey": "school"
    },
    {
      "id": "residential-area",
      "parentId": "shiohama-root",
      "name": "住宅街区",
      "description": "缓坡上的住宅区。一户建和小公寓交错，狭窄的坡道在房子之间绕来绕去。傍晚时分家家户户亮起暖黄色灯光，窗台上晾着晚饭的碗。",
      "tags": ["outdoor", "residence"],
      "capacity": 40,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 50, "y": 20, "w": 10, "h": 16,
      "spriteKey": "home-warm"
    },
    {
      "id": "sato-house",
      "parentId": "residential-area",
      "name": "佐藤家",
      "description": "渔港区上方的一户建，佐藤三代同住。玄关里堆着好几双橡胶长靴，客厅神龛上供着船安全祈愿的御札。",
      "tags": ["indoor", "private", "residence"],
      "capacity": 6,
      "privacy": "private",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 0, "y": 0, "w": 3, "h": 5,
      "spriteKey": "home-warm"
    },
    {
      "id": "sato-house-bath",
      "parentId": "sato-house",
      "name": "佐藤家浴室",
      "description": "一楼的紧凑浴室。花洒头上包着除钙网，浴缸是深型的，出海回来的人在这里把盐分和疲惫一起泡掉。",
      "tags": ["indoor", "private", "residence", "bathing"],
      "capacity": 2,
      "privacy": "private",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 0, "y": 0, "w": 1, "h": 2,
      "spriteKey": "fallback"
    },
    {
      "id": "kimura-house",
      "parentId": "residential-area",
      "name": "木村家",
      "description": "雑貨店二楼的两室一厅。桌上永远铺着今早的报纸，抽屉里有那本谣传了多年的牛皮笔记。",
      "tags": ["indoor", "private", "residence"],
      "capacity": 4,
      "privacy": "private",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 3, "y": 0, "w": 3, "h": 5,
      "spriteKey": "home-cool"
    },
    {
      "id": "kimura-house-bath",
      "parentId": "kimura-house",
      "name": "木村家浴室",
      "description": "紧凑但整洁的浴室。镜前放着木村每天早晨刮胡子用的老式安全剃刀。",
      "tags": ["indoor", "private", "residence", "bathing"],
      "capacity": 2,
      "privacy": "private",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 0, "y": 0, "w": 1, "h": 2,
      "spriteKey": "fallback"
    },
    {
      "id": "sakano-apartment",
      "parentId": "residential-area",
      "name": "坂の上住宅",
      "description": "坡顶的三层小公寓。外墙是浅灰色的，每个阳台都挂着不同的窗帘。住着几个体面人——医生、町长、那个从大阪来的面包师。",
      "tags": ["indoor", "private", "residence"],
      "capacity": 10,
      "privacy": "private",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 6, "y": 0, "w": 4, "h": 8,
      "spriteKey": "home-cool"
    },
    {
      "id": "apartment-shiohama",
      "parentId": "residential-area",
      "name": "アパート潮浜",
      "description": "车站方向的两层木造公寓。租金便宜，墙壁薄——隔壁放唱片这边能跟着哼。住的都是年轻人。楼梯下的公告板上贴着手写的町内通知。",
      "tags": ["indoor", "private", "residence"],
      "capacity": 15,
      "privacy": "private",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 0, "y": 6, "w": 6, "h": 10,
      "spriteKey": "home-warm"
    },
    {
      "id": "apartment-shiohama-bath",
      "parentId": "apartment-shiohama",
      "name": "公寓共用浴室",
      "description": "一楼的共用浴室。泡澡顺序写在走廊的白板上——轮流，每人二十分钟。水垢在瓷砖缝里积了厚厚一层。",
      "tags": ["indoor", "residence", "bathing"],
      "capacity": 3,
      "privacy": "semi",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 1, "y": 1, "w": 2, "h": 2,
      "spriteKey": "fallback"
    }
```

Note: The post-office node was incorrectly placed under honmachi-street in the spec. The step above places it correctly as a child of `honmachi-street`. It has `"x": 0, "y": 0, "w": 0, "h": 0` as a fallback — the auto-layout will handle it since layout coordinates are optional.

- [ ] **Step 3: Validate map**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/shiohama/map.json
```

Expected: passes with no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/scenes/shiohama/map.json
git commit -m "feat: add shiohama map (38 nodes)"
```

---

### Task 3: Write items.json

**Files:**
- Create: `backend/scenes/shiohama/items.json`

- [ ] **Step 1: Write items.json**

Write `backend/scenes/shiohama/items.json`:

```json
[
  {
    "id": "dried-fish",
    "name": "一夜干し竹荚鱼",
    "description": "佐藤家加工场风干了一夜的竹荚鱼。肉质紧实，咸味刚好，稍微烤一下就是绝佳的下酒菜。",
    "value": 15,
    "consumable": true,
    "effects": { "hunger": "reset" }
  },
  {
    "id": "fish-bento",
    "name": "潮浜海鲜便当",
    "description": "用当天渔获做的便当。米饭上铺着烤鱼、鸡蛋烧和渍菜，分量扎实。",
    "value": 25,
    "consumable": true,
    "effects": { "hunger": "reset" }
  },
  {
    "id": "shiohama-bread",
    "name": "盐味海藻面包",
    "description": "小麦堂的招牌面包。用潮浜近海采的海藻和本地粗盐，外脆里软，有淡淡的海潮味。",
    "value": 12,
    "consumable": true,
    "effects": { "hunger": "reset" }
  },
  {
    "id": "coffee-milk",
    "name": "渔火特调咖啡牛奶",
    "description": "渔火咖啡馆的招牌。深烘咖啡兑冰牛奶，一比一。海在东京学会的配方。杯壁凝着水珠，喝一口心情会短暂地好起来。",
    "value": 10,
    "consumable": true,
    "effects": { "mood": 1 }
  },
  {
    "id": "miso-soup",
    "name": "鱼骨味噌汤",
    "description": "用早上卖剩的鱼骨熬的味噌汤。加了海带和豆腐，热腾腾的一碗下去胃就暖了。",
    "value": 8,
    "consumable": true,
    "effects": { "hunger": -3 }
  },
  {
    "id": "towel-set",
    "name": "潮浜毛巾",
    "description": "印着灯塔图案的白棉毛巾。山の汤钱汤也在用同款——洗完澡用它擦脸，吸水性很好。",
    "value": 20,
    "consumable": true,
    "effects": { "hygiene": "reset" }
  },
  {
    "id": "lighthouse-postcard",
    "name": "灯塔明信片",
    "description": "潮浜灯塔的摄影明信片，夕阳时分拍的，灯塔的轮廓剪影在橘子色的天空上。寄给远方的人刚好。",
    "value": 8,
    "consumable": false,
    "effects": {}
  },
  {
    "id": "omamori",
    "name": "潮见神社御守",
    "description": "潮见神社的交通安全御守，锦袋上绣着海浪纹。据做过的人说很灵——虽然也许只是心理作用。",
    "value": 30,
    "consumable": true,
    "effects": { "mood": 2 }
  },
  {
    "id": "salted-caramel",
    "name": "海盐焦糖",
    "description": "明里自己熬的焦糖，撒了潮浜的粗盐。甜和咸同时炸开，一小颗就能让嘴巴不寂寞。",
    "value": 6,
    "consumable": true,
    "effects": { "mood": 1 }
  }
]
```

- [ ] **Step 2: Validate items**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/shiohama/items.json
```

Expected: passes (items.json is validated as ItemDefinition array).

- [ ] **Step 3: Commit**

```bash
git add backend/scenes/shiohama/items.json
git commit -m "feat: add shiohama items (9 items)"
```

---

### Task 4: Write shops.json

**Files:**
- Create: `backend/scenes/shiohama/shops.json`

- [ ] **Step 1: Write shops.json**

Write `backend/scenes/shiohama/shops.json`:

```json
[
  {
    "nodeId": "zakkaya",
    "ownerCharacterId": "char-kimura-yasuhei",
    "goods": ["dried-fish", "towel-set", "lighthouse-postcard"],
    "salary": 50
  },
  {
    "nodeId": "bakery",
    "ownerCharacterId": "char-yamada-akari",
    "goods": ["shiohama-bread", "salted-caramel", "coffee-milk"],
    "salary": 45
  },
  {
    "nodeId": "cafe",
    "ownerCharacterId": "char-ito-umi",
    "goods": ["coffee-milk", "fish-bento", "miso-soup"],
    "salary": 40
  },
  {
    "nodeId": "sento",
    "ownerCharacterId": "char-takahashi-matsuko",
    "goods": ["towel-set", "coffee-milk"],
    "salary": 35
  },
  {
    "nodeId": "asamizu-market",
    "ownerCharacterId": "char-sato-mayumi",
    "goods": ["dried-fish", "fish-bento", "miso-soup"],
    "salary": 45
  },
  {
    "nodeId": "drying-workshop",
    "ownerCharacterId": "char-sato-genji",
    "goods": ["dried-fish", "fish-bento"],
    "salary": 40
  }
]
```

- [ ] **Step 2: Validate shops**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/shiohama/shops.json
```

Expected: passes (shops.json is validated as ShopDefinition array).

- [ ] **Step 3: Commit**

```bash
git add backend/scenes/shiohama/shops.json
git commit -m "feat: add shiohama shops (6 shops)"
```

---

### Task 5: Round 1 — Sato family (3 characters)

**Files:**
- Create: `backend/scenes/shiohama/characters/char-sato-genji.json`
- Create: `backend/scenes/shiohama/characters/char-sato-mayumi.json`
- Create: `backend/scenes/shiohama/characters/char-sato-shota.json`

- [ ] **Step 1: Write char-sato-genji.json**

SpeakingStyle derivation (age 58, ei:-3, tf:2, jp:3, profession:fisherman, intelligence:3):
- age 51-65: 语速偏慢、偶引往事或经验之谈
- ei -4~-2: 话少句短、被动应答、不主动展开
- tf 2~4: 偏逻辑分析、冷静克制、因果词多
- jp 2~4: 有条理、先总后分、结构词明显
- profession fisherman: 自然比喻（"跟种地一样""看天气的"）、简短务实
- intelligence 3: 词汇丰富、句式多变、善用比喻和成语

Combine (3-4 strongest dims): age(51-65) + ei(-3) + jp(3) + fisherman → 话少而每句都到点上，句子短、信息集中。偶尔引渔谚或航海旧事——只说一次，不重复。不主动开启话题，但被问到时回答条理井然。

```json
{
  "id": "char-sato-genji",
  "name": "佐藤 源治",
  "avatar": "🎣",
  "age": 58,
  "gender": "male",
  "profession": "fisherman",
  "origin": "local",
  "personalProfile": {
    "past": "你十四岁第一次跟父亲出船——那是昭和末期，潮浜的渔港还停着三十多条船。二十六岁那年父亲在台风中没回来，你继承了那条白底蓝纹的'源福丸'。此后三十年你几乎没有一天不在海上。你知道每种鱼在什么水深、什么潮时上钩，知道台风前海水的颜色会变得像暗绿的玻璃。",
    "present": "现在你把船卖了，只在加工场里处理别人捕上来的鱼。真由美在朝市撑住了，翔太却不像会留下来。你不说出口，但每天傍晚站在加工场门口看灯塔的光——那光每晚都一样，可看的人已经老得不像样子了。"
  },
  "personality": { "ei": -3, "sn": 0, "tf": 2, "jp": 3 },
  "appearance": 1,
  "intelligence": 3,
  "health": 2,
  "abilities": [],
  "speakingStyle": "话极少，句短，但每一句都到骨头里。不主动开启话题——被问到才会答，答得精准得像用鱼叉叉鱼。偶尔夹一句渔谚或航海旧事，只说一次，不会重复。句子有明显因果结构：'因为……所以就……'。",
  "relations": {
    "char-sato-mayumi": { "kinds": ["father", "colleague"], "affection": 3, "note": "她把朝市撑得比我在海上三十多年还好。", "since": 0, "lastInteractionTick": 0 },
    "char-sato-shota": { "kinds": ["other_relative"], "affection": 3, "note": "他是我孙子。他看手机的眼神和我当年看出海的眼神不一样。也许他就不该留下。", "since": 0, "lastInteractionTick": 0 },
    "char-kimura-yasuhei": { "kinds": ["neighbor", "friend"], "affection": 2, "note": "整个町只有他敢坐下来和我下棋，三十分钟不说话。", "since": 0, "lastInteractionTick": 0 },
    "char-ogawa-kiyoshi": { "kinds": ["friend"], "affection": 2, "note": "他扫石阶的时候从不抬头——但我每次去神社他都给我多放一杓水。", "since": 0, "lastInteractionTick": 0 }
  },
  "activityNodeId": "drying-workshop",
  "restNodeId": "sato-house",
  "sleepWindow": { "start": 21, "duration": 8 },
  "shortTermGoal": "在身体彻底不行之前教会翔太怎么处理一夜干し——如果他愿意学的话。",
  "longTermGoal": "给加工场找到接手的人。不一定姓佐藤。只要他还记得鱼是好东西。",
  "liked": "海面在日出前的银灰色、康平带的棋、一夜干し的香味",
  "disliked": "手机铃声、甜食、被问'你还好吗'",
  "impressionBook": {
    "char-sato-mayumi": "她比我强。我在海上躲了一辈子，她在朝市正面站着。",
    "char-sato-shota": "他眼里的海和我眼里的不一样。我的海是活的，他的海只是一个画面。"
  }
}
```

Economy check: fisherman=tier2, age 58+health 2 → BME = basal(0.75) × healthFactor(1.2) = 0.9. 日收入 = round(0.9 × 2.0 × 20) = 36. 日开销 = 10×2.5 + 4×1.5 = 31. 日净余 +5 (tight, supplemented by shop owner income). No `initialMoney` — engine computes default = max(140, round(140×1.0)) = 140. ✓

- [ ] **Step 2: Write char-sato-mayumi.json**

SpeakingStyle (age 38, ei:2, tf:0, jp:2, profession:merchant, intelligence:2):
- age 26-50: 成熟完整、语气沉稳、生活经验见于措辞
- ei 2~4: 话多健谈、主动描述细节、喜欢分享
- tf balanced: 情绪与逻辑趋于平衡
- profession merchant: 数字敏感、人际话题、客气体贴
- Combine: age(38) + ei(2) + merchant → 说话有做生意的节奏——快但不过分，招呼和说明一套接一套。数字记得很清（"今天竹荚鱼十五条""每公斤三百二十"），结束语通常是"谢谢"或"慢走"。

```json
{
  "id": "char-sato-mayumi",
  "name": "佐藤 真由美",
  "avatar": "🐟",
  "age": 38,
  "gender": "female",
  "profession": "merchant",
  "origin": "local",
  "personalProfile": {
    "past": "你从小在鱼腥味里长大。六岁那年父亲第一次带你上朝市——他把一条活竹荚鱼放在你手心，说'你记住这个冷，以后你就能认出好鱼'。二十二岁结婚，二十五岁有了翔太，二十八岁丈夫说'我不适合这里'就走了。父亲把朝市的摊位交给你。第一年你每天站八小时，回家膝盖肿得像柚子。你没有停。",
    "present": "现在是每天早上四点起来，泡沫箱打开、冰铺好、鱼排齐。老顾客知道你的鱼从来不吹——是什么就是什么。翔太在加工场帮忙，但你看出他不属于这里。你没有逼他留。有些东西你留不住——你学会了这一点。"
  },
  "personality": { "ei": 2, "sn": 1, "tf": 0, "jp": 2 },
  "appearance": 3,
  "intelligence": 2,
  "health": 2,
  "abilities": [],
  "speakingStyle": "说话有做生意的节奏——招呼短而热、说明有条理，数字记得清清楚楚（'今天竹荚鱼十五条，小的两百大的三百二'）。每句结束常带'谢谢'或'慢走'，是朝市练出来的习惯。说到翔太时语速会不自觉地慢下来。",
  "relations": {
    "char-sato-genji": { "kinds": ["daughter", "colleague"], "affection": 3, "note": "他从来不说'做得好'。但每天早上冰已经铺好——那是他的回答。", "since": 0, "lastInteractionTick": 0 },
    "char-sato-shota": { "kinds": ["mother"], "affection": 4, "note": "我不留他。他留还是走我都已经是他的妈。", "since": 0, "lastInteractionTick": 0 },
    "char-ito-umi": { "kinds": ["classmate"], "affection": 1, "note": "他回来了两年都还没说自己为什么离开东京。但我不问——每个人至少有一件不必回答的事。", "since": 0, "lastInteractionTick": 0 },
    "char-yamada-akari": { "kinds": ["friend"], "affection": 2, "note": "全町只有她的盐面包能配我的竹荚鱼。我们都从别处来到这儿——虽然她的来处比我的远得多。", "since": 0, "lastInteractionTick": 0 }
  },
  "activityNodeId": "asamizu-market",
  "restNodeId": "sato-house",
  "sleepWindow": { "start": 22, "duration": 6 },
  "shortTermGoal": "这个月的朝市营业额要做到能填补修'源福丸'那笔老账。",
  "longTermGoal": "把朝市的顾客群从镇上扩大到周边——如果有人愿意开车三十分钟来买好鱼，那潮浜就不是'快死了'。",
  "liked": "清晨码头的柴油引擎声、老顾客第二句话就说'今天竹荚鱼怎么样'、吃完晚饭看翔太洗碗的背影",
  "disliked": "手机上来路不明的新闻报道、'你们这地方还有年轻人吗'之类的问题、甜到齁的饮料",
  "impressionBook": {
    "char-yamada-akari": "她没说过自己为什么离开大阪。没关系的——我也不说，人和人之间有些裂缝不需要填。"
  }
}
```

Economy: merchant=tier3, age 38+health 2 → BME = 1.0 × 1.2 = 1.2. 日收入 = round(1.2 × 3.0 × 20) = 72. 日开销 = 31. 日净余 +41. No `initialMoney` — default = max(140, 420) = 420. ✓

- [ ] **Step 3: Write char-sato-shota.json**

SpeakingStyle (age 22, ei:-1, tf:-2, jp:-1, profession:fisherman, intelligence:2):
- age 18-25: 年轻活力、用词较新、可能带理想主义
- ei -1~1: 正常交流、适度展开
- tf -4~-2: 带情绪色彩、主观评价多、感受词丰富
- jp -4~-2: 松散跳跃、想到哪说哪、可能离题再绕回来
- Combine: age(22) + tf(-2) + jp(-1) → 说话像在思考的过程中直播——句子中间转方向，有时一句话里有三个"就是"。情绪词多（"好烦""很棒""不知道为什么"），说到海和爷爷时句子突然变短。

```json
{
  "id": "char-sato-shota",
  "name": "佐藤 翔太",
  "avatar": "📱",
  "age": 22,
  "gender": "male",
  "profession": "fisherman",
  "origin": "local",
  "personalProfile": {
    "past": "你在佐藤家长大，这意味着你的童年是柴油味和潮汐表。小学的时候，班上所有人都知道你爷爷是佐藤源治——那个在台风里死过父亲又自己成了船长的男人。初中你开始用手机看YouTube，十五岁看到一个东京的街头采访，发现世界上有人一辈子没摸过鱼。从那以后你的手机相册里存了六千张东京的照片。",
    "present": "你在爷爷的加工场上班，但内心已在别处。每天处理一夜干し的时候把手机立在调料架上看东京的vlog。妈妈没问你打算什么时候走——这比直接问更让你难受。你不知道自己是真的想去东京，还是只是想离开这个所有人都认识你的地方。"
  },
  "personality": { "ei": -1, "sn": -2, "tf": -2, "jp": -1 },
  "appearance": 3,
  "intelligence": 2,
  "health": 3,
  "abilities": [],
  "speakingStyle": "说话像在思考中直播——句子会中途绕道，'就是'出现得频繁（'那个地方就是、怎么说、就是很有未来感'）。情绪词多（'好烦''超厉害''不知道为什么'），偶尔整句是情绪。说到海或爷爷时句子忽然变短——那是他不需要解释的语言。",
  "relations": {
    "char-sato-mayumi": { "kinds": ["son"], "affection": 2, "note": "她说不留我。但每天准备便当的时候还是会多放一个腌梅子——跟小学的时候一样。", "since": 0, "lastInteractionTick": 0 },
    "char-sato-genji": { "kinds": ["other_relative"], "affection": 2, "note": "爷爷从不逼我学。他只把刀放在那里。我要是拿起来，他就教。我要是没拿，他也不会问。", "since": 0, "lastInteractionTick": 0 },
    "char-wada-ren": { "kinds": ["acquaintance"], "affection": 0, "note": "他发的那些诗我看不懂，但觉得挺厉害的。这镇上居然还有人在写诗。", "since": 0, "lastInteractionTick": 0 }
  },
  "activityNodeId": "drying-workshop",
  "restNodeId": "sato-house",
  "sleepWindow": { "start": 24, "duration": 7 },
  "shortTermGoal": "攒够五十万日元然后去东京。或者哪怕只是去看一眼。",
  "longTermGoal": "在东京或者横滨找个不用跟鱼打交道的工作。但是每次闻到一夜干し的烟熏味又觉得心虚。",
  "liked": "深夜戴耳机看东京街拍、渔火咖啡的冰咖啡、自己不说什么的时候爷爷也不说",
  "disliked": "台风——加工场停工没收入、被问'你什么时候走'或者'你什么时候留下'、船的安全检查",
  "impressionBook": {
    "char-wada-ren": "他在墙上写的东西我读不懂，但我偷偷拍了几张照片。要是有一天我真的离开这儿，这些诗能让我想起这里不只有鱼。"
  }
}
```

Economy: fisherman=tier2, age 22+health 3 → BME = 1.0 × 1.0 = 1.0. 日收入 = round(1.0 × 2.0 × 20) = 40. 日开销 = 31. 日净余 +9. Note: 翔太 is a shop employee at his grandfather's drying workshop (shop-kakouba). Employment is set at runtime via `manage_employment` action. During world creation, the shop starts with `employeeCharacterId: null`. His income from employment (salary 40) will only come after being hired in-game. His base fisherman income is sufficient for now. No `initialMoney` — defaults to 280 (tier 2 × mdc × 7). ✓

- [ ] **Step 4: Validate characters**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/shiohama/characters/char-sato-genji.json
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/shiohama/characters/char-sato-mayumi.json
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/shiohama/characters/char-sato-shota.json
```

Expected: all three pass.

- [ ] **Step 5: Commit**

```bash
git add backend/scenes/shiohama/characters/char-sato-genji.json backend/scenes/shiohama/characters/char-sato-mayumi.json backend/scenes/shiohama/characters/char-sato-shota.json
git commit -m "feat: add shiohama Round 1 characters (Sato family)"
```

---

### Task 6: Round 2 — Business line + mayor (4 characters)

**Files:**
- Create: `backend/scenes/shiohama/characters/char-kimura-yasuhei.json`
- Create: `backend/scenes/shiohama/characters/char-yamada-akari.json`
- Create: `backend/scenes/shiohama/characters/char-ito-umi.json`
- Create: `backend/scenes/shiohama/characters/char-morita-takashi.json`

- [ ] **Step 1: Write char-kimura-yasuhei.json**

SpeakingStyle (age 45, ei:3, jp:1, profession:merchant, intelligence:2):
- age 26-50: 成熟完整、语气沉稳
- ei 2~4: 话多健谈、主动描述细节、喜欢分享
- profession merchant: 数字敏感、人际话题、客气体贴
- Combine: 说话像永远在聊天——一边给东西一边讲它的来历。会主动切换话题（"啊说到这个，你知道前天……"），能从一件事跳到完全无关的另一件然后自然地回来。每件商品至少一句话的故事。

```json
{
  "id": "char-kimura-yasuhei",
  "name": "木村 康平",
  "avatar": "📒",
  "age": 45,
  "gender": "male",
  "profession": "merchant",
  "origin": "local",
  "personalProfile": {
    "past": "你父亲开了这家杂货店，你二十多岁接手的时候它只是个卖蚊香和电池的小铺子。你一家一家地加货——鱼线、海盐、手写的灯塔明信片——有人买的东西你都进。你开始在本子上记些东西：谁买了什么，谁说了什么，谁上周看起来心情不好。这本来只是你自己用来记事的，但日子久了，你成了这镇上唯一知道所有人发生了什么事的人。",
    "present": "现在每天早上开门第一件事是给门外的盆栽浇水——那是源治送的。抽屉里有三个笔记本，每个都写得密密麻麻。你看着町里少了一个又一个年轻人。最近隆在役场找你说'要不要一起做点什么'。你没回答。你知道什么样的'做点什么'可能有用。"
  },
  "personality": { "ei": 3, "sn": 2, "tf": 1, "jp": 1 },
  "appearance": 2,
  "intelligence": 2,
  "health": 2,
  "abilities": [],
  "speakingStyle": "说话像永远在聊天——一边结账一边讲每件东西的来历（'这个打火机是大阪一个老头做的，他比我话还多'）。能自然地从一条事跳到另一条，中间无缝。口吻老成但温暖，喜欢在每段话末加一句似问非问的结语（'是吧？'少用，改'你说这……'）。",
  "relations": {
    "char-sato-genji": { "kinds": ["neighbor", "friend"], "affection": 2, "note": "我下棋赢不了他，但我下棋的时候他不看手机。这是他的语言。", "since": 0, "lastInteractionTick": 0 },
    "char-morita-takashi": { "kinds": ["colleague"], "affection": 1, "note": "他想做好，但每次都太急了。我欣赏他的急——这镇上有太多不急的人。", "since": 0, "lastInteractionTick": 0 }
  },
  "activityNodeId": "zakkaya",
  "restNodeId": "kimura-house",
  "sleepWindow": { "start": 23, "duration": 7 },
  "shortTermGoal": "把笔记本里的情报整理成一个系统。说不定以后能用。",
  "longTermGoal": "成为这个镇的记忆者。不是写历史——是记日常。",
  "liked": "午后的店门口阳光、象棋落子的声音、源治偶尔说的'今天这个还行'",
  "disliked": "手机支付——我的店不收、'你们镇快没了'之类的话、下雨天生意差",
  "impressionBook": {
    "char-sato-genji": "他下棋从不悔棋。这和他在海上一样——做了的决定就是做了。"
  }
}
```

Economy: merchant=tier3, BME=1.0×1.2=1.2, 日收入=72, 日开销=31, 日净余+41. ✓

- [ ] **Step 2: Write char-yamada-akari.json**

SpeakingStyle (age 34, ei:1, tf:3, jp:2, profession:baker, intelligence:2):
- age 26-50: 成熟完整
- tf 2~4: 带情绪色彩、主观评价多、感受词丰富
- profession baker: 食物比喻、温度/时间敏感
- Combine: 说话带着面团的温度感——不急，但每一句都热乎。常能觉知周围人的情绪细节（"今天看起来有点累"）。用发酵和烘焙的比喻来描述人生（"放一放就发了""温度到了自然会好"）。

```json
{
  "id": "char-yamada-akari",
  "name": "山田 明里",
  "avatar": "🍞",
  "age": 34,
  "gender": "female",
  "profession": "baker",
  "origin": "local",
  "personalProfile": {
    "past": "你在大阪长大——一个闹哄哄的城市，每个人都走得很快。你做了十年的面包师，从连锁面包房做到独立工坊，从柜员做到主理。然后有一天凌晨，你站在店里的发酵箱前面，听见定时器响，突然不想再揉一块不属于自己的面团了。你把房子退了，车卖了，在地图上找了一个离海最近的地方。",
    "present": "这个镇接纳了你——虽然至今没几个人知道你为什么来。每天早上四点半开始揉面，七点开门，站在玻璃柜后面看面包被一只只手拿起。你在窗台种了小番茄，下午没人的时候给它们浇水。中村医生偶尔来买面包，他从来不问你的过去。"
  },
  "personality": { "ei": 1, "sn": -1, "tf": 3, "jp": 2 },
  "appearance": 3,
  "intelligence": 2,
  "health": 2,
  "abilities": [],
  "speakingStyle": "语速不快，像面团在发酵——温、绵、热乎。很容易注意到别人的情绪变化（'你今天看起来比昨天高兴'），但总是用食物作引子（'这个面包刚烤好，你尝尝'）。偶尔用烘焙比喻生活（'有些东西得放一放，才会发起来'），不像是刻意说的。",
  "relations": {
    "char-ito-umi": { "kinds": ["friend"], "affection": 2, "note": "他把我的海盐面包在菜单上写了'潮浜吐司'。那是第一个从别人口中听到这个镇的名字觉得好听的时候。", "since": 0, "lastInteractionTick": 0 },
    "char-nakamura-kenichi": { "kinds": ["acquaintance"], "affection": 1, "note": "他看病时眼神很温暖。每周来三个海藻面包——我怕它们凉了。", "since": 0, "lastInteractionTick": 0 }
  },
  "activityNodeId": "bakery",
  "restNodeId": "sakano-apartment",
  "sleepWindow": { "start": 21, "duration": 7 },
  "shortTermGoal": "开发出一种只用本地海盐的招牌面包——让游客记住潮浜的味道。",
  "longTermGoal": "不再为'逃离'和'开始'之间那条界线感到内疚。",
  "liked": "面团发酵后酸酸的气味、早晨五点的寂静、他看着面包的时候那种认真的眼神",
  "disliked": "被问'你什么时候回大阪'、面粉在打折日断货、烤箱突然不听话的那个下午",
  "impressionBook": {
    "char-nakamura-kenichi": "他从不问我不喜欢回答的问题。这是一种绅士吗？还是他也一样——有自己的沉默。"
  }
}
```

Economy: baker=tier2, BME=1.0×1.2=1.2, 日收入=round(1.2×2×20)=48, 日开销=31, 日净余+17. Shop owner income supplements. ✓

- [ ] **Step 3: Write char-ito-umi.json**

SpeakingStyle (age 28, ei:-2, tf:-3, jp:0, profession:brewer, intelligence:3):
- age 26-50: 成熟完整、语气沉稳
- ei -4~-2: 话少句短、被动应答、不主动展开
- tf -4~-2: 带情绪色彩、主观评价多
- intelligence 3: 词汇丰富、句式多变
- Combine: 话不多但句子的质感很高——像他手冲的咖啡，精准而带苦。偶尔会冒出很技术性的描述（"水流速度会影响萃取率"），然后忽然意识到自己在说，停下来，笑一下。问什么都给回应，但答案总比你期待的短一句。

```json
{
  "id": "char-ito-umi",
  "name": "伊藤 海",
  "avatar": "☕",
  "age": 28,
  "gender": "male",
  "profession": "brewer",
  "origin": "local",
  "personalProfile": {
    "past": "你是这镇上长大的孩子——小学校和真由美同桌，中学生时代和枫一起放学。十八岁拿到东京一所大学的入学通知书，你走得很快。在东京你做了六年程序员，写后端、改bug、深夜开standup。你过得不错。然后有一天你把终端关了，把公寓解约了，跟谁都说不清楚为什么。你买了张船票，在船上给妈妈发了一条'我回来了'。",
    "present": "回来两年了。你用工业界的精确来冲每一杯咖啡——秤重、计时、控制水温——但店名'渔火'是祖父去世那年的老挂钟上来的。莲每天来帮你刷杯子，你用免费咖啡付他的工资。你不解释为什么离开东京。连你自己都还没找到那个句子。"
  },
  "personality": { "ei": -2, "sn": 2, "tf": -3, "jp": 0 },
  "appearance": 3,
  "intelligence": 3,
  "health": 1,
  "abilities": [],
  "speakingStyle": "话不多但质感到位——语速平稳，用词精准（'这豆子烘得有点过，苦味盖住了酸味'）。偶尔技术性描述冒上来，会中途停住拿笑收尾。回答有人但总比对方预期的短一句。说到东京时声音会略轻。",
  "relations": {
    "char-sato-mayumi": { "kinds": ["classmate"], "affection": 1, "note": "她还是跟小时候一样——看到鱼就知道好不好。我在东京认不出好鱼，只知道哪家IT食堂最便宜。", "since": 0, "lastInteractionTick": 0 },
    "char-yamada-akari": { "kinds": ["friend"], "affection": 2, "note": "她可能也是从什么地方逃来的。我问不出口——因为如果她回答，我就得回答同样的问题。", "since": 0, "lastInteractionTick": 0 },
    "char-suzuki-kaede": { "kinds": ["classmate"], "affection": 1, "note": "她说她本来只打算待一年。第三年了还在。我们可能都困在某个东西里。", "since": 0, "lastInteractionTick": 0 },
    "char-wada-ren": { "kinds": ["friend"], "affection": 1, "note": "他刷杯子的方式跟我在东京debug的方式差不多——认真到忘记时间。", "since": 0, "lastInteractionTick": 0 }
  },
  "activityNodeId": "cafe",
  "restNodeId": "apartment-shiohama",
  "sleepWindow": { "start": 24, "duration": 7 },
  "shortTermGoal": "把咖啡馆的营业额做到不需要担心下个月的电费。",
  "longTermGoal": "找到一句话能说清为什么回来。或者找到一种不需要用语言解释它的方式。",
  "liked": "手冲壶水流切断那刻的静、祖父留下的钟（一直停在3:25）、莲每次刷完杯子厨房里滴水的声音",
  "disliked": "被问'在东京做什么工作'、手机信号差的时候它自动跳到3G、阴天没有人来店里",
  "impressionBook": {
    "char-wada-ren": "他在墙上写的是我能读懂的代码。但他的语言太晦涩——我们大概都需要翻译。"
  }
}
```

Economy: brewer=tier2, age 28+health 1 → BME = 1.0 × 1.4 = 1.4. 日收入 = round(1.4 × 2.0 × 20) = 56. 日开销 = 31. 日净余 +25. ✓

- [ ] **Step 4: Write char-morita-takashi.json**

SpeakingStyle (age 55, ei:2, tf:2, jp:4, profession:mayor, intelligence:3):
- age 51-65: 语速偏慢、偶引往事
- jp 2~4: 有条理、先总后分、结构词明显
- profession mayor: 偏审慎/大局观
- intelligence 3: 词汇丰富
- Combine: 说话有条理，先把事情从头到尾梳理一遍再给你总结。'首先''其次''总之'是常见路标。偶尔用行政术语（"振兴""政策"），但切换到'美咲说'时语气立刻软下来。

```json
{
  "id": "char-morita-takashi",
  "name": "森田 隆",
  "avatar": "📋",
  "age": 55,
  "gender": "male",
  "profession": "mayor",
  "origin": "local",
  "personalProfile": {
    "past": "你祖父是潮浜的第一任町长。那时候这里还是个热闹的渔港，渔船五十多条，小学六个年级都有。你父亲也做了町长，但那时候船已经少了。你二十年前接任，从传真机时代做到iPad时代——但潮浜的人口从一千二降到四百五。",
    "present": "你现在每周做两份表格——一份是町财政收支，一份是镇上年轻人的去向。你女儿美咲是班上唯一的孩子，枫老师教三个年级混合班。你不觉得这是绝望——你觉得这是最后的机会。最近你和康平在讨论镇上的店铺能不能吸引游客。"
  },
  "personality": { "ei": 2, "sn": 1, "tf": 2, "jp": 4 },
  "appearance": 2,
  "intelligence": 3,
  "health": 2,
  "abilities": [],
  "speakingStyle": "说话像在做陈述报告——先铺背景再列要点然后总结。'首先''其次''总之'是高频路标。对町政话题用正式语体（'振兴''区域活性化''人口结构'），但切换到女儿时句子会变短变软。偶尔在句末加一句'是吧'——不是在求赞同，是在用这个词来换对方的表情。",
  "relations": {
    "char-morita-misaki": { "kinds": ["father"], "affection": 4, "note": "她是我表格里面唯一不用数字衡量的一行。", "since": 0, "lastInteractionTick": 0 },
    "char-lin-haiyue": { "kinds": ["landlord"], "affection": 1, "note": "她每年只来四个月。但这四个月里海の家是唯一让小镇看起来像是活着的证据。", "since": 0, "lastInteractionTick": 0 },
    "char-kimura-yasuhei": { "kinds": ["colleague"], "affection": 1, "note": "他笔记本里的信息跟我的表格合在一起才是完整的潮浜。", "since": 0, "lastInteractionTick": 0 }
  },
  "activityNodeId": "town-hall",
  "restNodeId": "sakano-apartment",
  "sleepWindow": { "start": 23, "duration": 7 },
  "shortTermGoal": "在下一次町议会之前完成观光振兴方案的草案。",
  "longTermGoal": "让美咲长大后可以跟别人说'我回潮浜'，而不是'我离开潮浜'。",
  "liked": "町役场傍晚窗外的夕烧、美咲捡回来的石头（每颗都不一样）、iPad的电池百分比刚好是100",
  "disliked": "高速公路开通后小镇被'绕过去'的事实、'收缩'这个词——太冷了、台风——每次都要打电话确认所有老人的安全",
  "impressionBook": {
    "char-sato-genji": "他是我这一代里唯一不把町长当'上面的人'看的。他说'你那张表格改到第三版了还不对，隆'——这种话只有他敢说。"
  }
}
```

Economy: mayor=tier2, BME=1.2×1.0(health2)... wait, age 55 → basal 0.75, health 2 → 1.2, BME=0.9. 日收入=round(0.9×2×20)=36. 日开销=31. 日净余+5. Tight but sustainable. ✓

- [ ] **Step 5: Validate Round 2 characters**

```bash
for char in char-kimura-yasuhei char-yamada-akari char-ito-umi char-morita-takashi; do
  pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/shiohama/characters/${char}.json
done
```

Expected: all four pass.

- [ ] **Step 6: Commit**

```bash
git add backend/scenes/shiohama/characters/char-kimura-yasuhei.json backend/scenes/shiohama/characters/char-yamada-akari.json backend/scenes/shiohama/characters/char-ito-umi.json backend/scenes/shiohama/characters/char-morita-takashi.json
git commit -m "feat: add shiohama Round 2 characters (business + mayor)"
```

---

### Task 7: Round 3 — Public service (3 characters)

**Files:**
- Create: `backend/scenes/shiohama/characters/char-nakamura-kenichi.json`
- Create: `backend/scenes/shiohama/characters/char-ogawa-kiyoshi.json`
- Create: `backend/scenes/shiohama/characters/char-suzuki-kaede.json`

- [ ] **Step 1: Write char-nakamura-kenichi.json**

SpeakingStyle (age 51, ei:0, tf:3, jp:3, profession:doctor, intelligence:4):
- age 51-65: 语速偏慢、偶引往事
- tf 2~4: 偏逻辑分析
- jp 2~4: 有条理
- profession doctor: 关心语气、解释性表达
- intelligence 4: 精妙用典、可能带学术/文人气
- Combine: 说话像在给人写病历——清楚、不跳跃、留后路。'你看啊''原因在于'开头多。关心藏在专业术语后面（'你的血压有点高，不过不是什么大问题——下次来前少喝咖啡'）。说到医学之外的事会暂停半秒——不在自己领域内的时候他很谨慎。

```json
{
  "id": "char-nakamura-kenichi",
  "name": "中村 健一",
  "avatar": "🩺",
  "age": 51,
  "gender": "male",
  "profession": "doctor",
  "origin": "local",
  "personalProfile": {
    "past": "你是这个镇出身的第一个医学生。拿到执照后你在县立医院做完研修，然后做了一个所有人都觉得奇怪的决定——回来潮浜开诊所。父亲说你浪费。你说'他们需要一个医生'。那是二十年前。这二十年来全町只有你一个医生——星期一到星期六坐诊，星期天写论文。心血管疾病和老年糖尿病——你闭着眼睛都能诊断。",
    "present": "现在你每周写一篇论文发给东大医学部。去年他们告诉你——明年春天有一个准教授的席位。你可以在大学医院做一个不只是'乡村医生'的医生。但你还没把这件事告诉任何人。明里面前你尤其说不出口——她离开了一个更大的地方来到这里。你要离开一个更小的地方去更大的地方。这其中的倒转你自己都还没理清。"
  },
  "personality": { "ei": 0, "sn": -1, "tf": 3, "jp": 3 },
  "appearance": 2,
  "intelligence": 4,
  "health": 2,
  "abilities": [],
  "speakingStyle": "说话像在写病历——清楚不跳跃，'原因在于''你看啊'开头多。关心藏在专业性后面——'血压偏高——不过不是什么大问题，这周少喝两杯咖啡看看'。说到非医学话题会停半秒——像在做鉴别诊断，不在自己领域内绝不轻易下结论。",
  "relations": {
    "char-takahashi-matsuko": { "kinds": ["acquaintance"], "affection": 2, "note": "她是我的病人。她的血压是我最头疼的事——让她别吃太咸说了十年没用。但她依然每天来泡汤。也许她是对的。", "since": 0, "lastInteractionTick": 0 },
    "char-yamada-akari": { "kinds": ["acquaintance"], "affection": 1, "note": "她来买面包的时候总是多放一个海盐卷在柜台上——说是刚烤好请我试。这不是一个患者和一个医生的关系。", "since": 0, "lastInteractionTick": 0 }
  },
  "activityNodeId": "clinic",
  "restNodeId": "sakano-apartment",
  "sleepWindow": { "start": 23, "duration": 7 },
  "shortTermGoal": "在明年春天之前完成这篇关于老年高血压与盐分摄入的论文。",
  "longTermGoal": "做那个不需要在两个世界之间做选择的人。如果做不了——至少不后悔。",
  "liked": "看诊结束后一个人静坐诊所的五分钟、明里海盐卷的脆皮、星期天没有人打电话来",
  "disliked": "被叫'乡村医生'——那种语气；盐分超标的食物；自己每次对明里说不出想说的话",
  "impressionBook": {
    "char-yamada-akari": "她每天多给我放一只海盐卷。我治不了这种病——她放在那里的那个面包，我没有诊断代码可以写。"
  }
}
```

Economy: doctor=tier3, age 51+health 2 → BME = 0.9 × 1.2 = 1.08(use 0.75 basal? Let me check: age 51 → basal 0.75. health 2 → healthFactor 1.2. BME = 0.75 × 1.2 = 0.9). 日收入 = round(0.9 × 3.0 × 20) = 54. 日开销 = 31. 日净余 +23. ✓

- [ ] **Step 2: Write char-ogawa-kiyoshi.json**

SpeakingStyle (age 67, ei:-4, sn:3, jp:4, profession:priest, intelligence:3):
- age 66+: 缓慢沧桑、句子可能短、可能重复、常有"以前…"
- ei -4~-2: 话少句短、被动应答
- jp 2~4: 有条理
- profession priest: 偏仪式感/肃穆
- Combine: 说话有神社的节奏——慢、静、每个字之间都留白。句子短，但每个短句之间潜着多年的沉默。偶尔重复同一句话（像经文）。用自然现象代指人生——'叶子会落''海浪冲上来的东西也会被带走'。

```json
{
  "id": "char-ogawa-kiyoshi",
  "name": "小川 清",
  "avatar": "⛩️",
  "age": 67,
  "gender": "male",
  "profession": "priest",
  "origin": "local",
  "personalProfile": {
    "past": "你是潮见神社第四代宫司。二十六岁从父亲手上接过这把扫帚——现在扫了四十一年。你见过参拜的人排队排到石阶最下面一级，也见过整个正月只有三个人摇铃——源治、宏人、松子，每年都是这三个。你每一次都念同样的祝词，声音不大不小。",
    "present": "山下的弟子来问'什么时候退休'——你没有回答。每天早上六点扫石阶，七点敲太鼓，八点烧水。镇上的人越来越少来参拜了，但灯塔的光还是会扫过鸟居。你不确定这算不算信仰——也许只是惯性。但惯性也是某种信。"
  },
  "personality": { "ei": -4, "sn": 3, "tf": 1, "jp": 4 },
  "appearance": 1,
  "intelligence": 3,
  "health": 1,
  "abilities": [],
  "speakingStyle": "说话有神社的节奏——慢、静、字与字之间都留白。句子短得像是俳句的碎片（'叶子落了。今年也落了。'）。偶尔重复同一句话，像经文。用自然现象喻人生——'风吹过来的东西，风也会带走'。",
  "relations": {
    "char-sato-genji": { "kinds": ["friend"], "affection": 2, "note": "他每次参拜都多放一枚硬币在钱箱里——'多出来的是给海的'。他不信神。但他信海。", "since": 0, "lastInteractionTick": 0 },
    "char-tanaka-hiroto": { "kinds": ["friend"], "affection": 3, "note": "宏人送信上来的时候会跟我喝一杯茶。他说'今天潮水的颜色和昨天不一样'——听了四十二年。", "since": 0, "lastInteractionTick": 0 }
  },
  "activityNodeId": "shiohama-shrine",
  "restNodeId": "shrine-quarters",
  "sleepWindow": { "start": 21, "duration": 8 },
  "shortTermGoal": "在下个月的神社祭之前把褪了色的鸟居重新刷一遍朱漆。",
  "longTermGoal": "找到下一任宫司。或者接受'下一任可能不会来'。",
  "liked": "石阶上的落叶扫完后露出的石头的颜色、太鼓的皮面在晨光里的光泽、宏人每次带来的信——哪怕是账单",
  "disliked": "手机的震动——他不带，来参拜的人偶尔响起来会皱眉；'时代不同了'——他知道",
  "impressionBook": {
    "char-tanaka-hiroto": "他左手少了半根手指，但每次喝茶端茶杯从不晃。在海上待过的人——剩下的半根比一整根更有力。"
  }
}
```

Economy: priest=tier2, age 67+health 1 → BME = 0.75 × 1.4 = 1.05. 日收入 = round(1.05 × 2.0 × 20) = 42. 日开销 = 31. 日净余 +11. ✓

- [ ] **Step 3: Write char-suzuki-kaede.json**

SpeakingStyle (age 25, ei:4, tf:2, jp:-1, profession:teacher, intelligence:2):
- age 18-25: 年轻活力、用词较新、可能带理想主义
- ei 2~4: 话多健谈、主动描述细节
- teacher: 解释性表达、关心语气
- Combine: 说话总是很用力——像在跟全世界分享一个好消息。用很多表情词（"超有趣""好好笑""太感动"），句尾常上扬。解释东西的时候手势大概很多——句子里的破折号和括号能从一行跳到下一行。

```json
{
  "id": "char-suzuki-kaede",
  "name": "铃木 枫",
  "avatar": "📚",
  "age": 25,
  "gender": "female",
  "profession": "teacher",
  "origin": "local",
  "personalProfile": {
    "past": "你是从县立大学教育学部毕业的。本来想着先在乡下待一年攒经验然后申请都市的职位，结果分配到了潮浜小学校——一个你完全没听说过的地方。你在来潮浜的巴士上用手机搜'潮浜町 人口 减少'——结果让你胃紧了一下。",
    "present": "现在是教1-3年级混合班——全班只有三个学生，其中一个是美咲。你本来计划一年走的，但第三年了你还在。你不知道为什么——可能是潮浜的海太亮了，可能是小川宫司每天扫落叶的声音让你觉得这个镇有人不放弃。也可能是美咲。"
  },
  "personality": { "ei": 4, "sn": 0, "tf": 2, "jp": -1 },
  "appearance": 2,
  "intelligence": 2,
  "health": 3,
  "abilities": [],
  "speakingStyle": "说话总是能量很足——像在跟全世界分享好消息。解释东西时自带结构和手势——'这里的关键是——就是——水的浮力！'。句尾常上扬，'呢''啊'自然出但不是刻意堆的。说到这镇上的事时声音会沉下来——那是她没想好该怎么看的那部分。",
  "relations": {
    "char-ito-umi": { "kinds": ["classmate"], "affection": 1, "note": "他是我们那一届最聪明的人。他回来那天我刚好去巴士站接人——看到他下船。他装酷。我也会。", "since": 0, "lastInteractionTick": 0 },
    "char-morita-misaki": { "kinds": ["teacher"], "affection": 3, "note": "她书包上的鲸鱼钥匙扣每天响。班上只有三个人——她、还有两个比她小的。她可能是这个镇的未来。", "since": 0, "lastInteractionTick": 0 }
  },
  "activityNodeId": "elementary-school",
  "restNodeId": "apartment-shiohama",
  "sleepWindow": { "start": 23, "duration": 7 },
  "shortTermGoal": "这个学期结束之前让三个学生都学会写自己的名字和住址。还有——给自己一个答案：留下来还是走。",
  "longTermGoal": "成为那个让学生多年后会跟别人说'我小时候有个老师叫铃木，她让我觉得学东西很好玩'的老师。",
  "liked": "上课时从窗户射进来的海光（上午10点整）、美咲举手的样子、海店里的咖啡牛奶",
  "disliked": "PPT翻到最后一张没人提问的瞬间、'乡下小学'——这种说法；期末评估表格",
  "impressionBook": {
    "char-morita-misaki": "她捡石头的时候比我见过的任何成年人选重要东西的时候都认真。"
  }
}
```

Economy: teacher=tier2, BME=1.0×1.0=1.0 (health 3→1.0). 日收入=round(1.0×2×20)=40. 日开销=31. 日净余+9. ✓

- [ ] **Step 4: Validate Round 3 characters**

```bash
for char in char-nakamura-kenichi char-ogawa-kiyoshi char-suzuki-kaede; do
  pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/shiohama/characters/${char}.json
done
```

Expected: all three pass.

- [ ] **Step 5: Commit**

```bash
git add backend/scenes/shiohama/characters/char-nakamura-kenichi.json backend/scenes/shiohama/characters/char-ogawa-kiyoshi.json backend/scenes/shiohama/characters/char-suzuki-kaede.json
git commit -m "feat: add shiohama Round 3 characters (public service)"
```

---

### Task 8: Round 4 — Other residents (5 characters)

**Files:**
- Create: `backend/scenes/shiohama/characters/char-takahashi-matsuko.json`
- Create: `backend/scenes/shiohama/characters/char-tanaka-hiroto.json`
- Create: `backend/scenes/shiohama/characters/char-wada-ren.json`
- Create: `backend/scenes/shiohama/characters/char-morita-misaki.json`
- Create: `backend/scenes/shiohama/characters/char-lin-haiyue.json`

- [ ] **Step 1: Write char-takahashi-matsuko.json**

SpeakingStyle (age 64, ei:3, sn:-2, tf:1, profession:innkeeper, intelligence:1):
- age 51-65: 语速偏慢、偶引往事
- ei 2~4: 话多健谈
- profession innkeeper: 客气体贴、人际话题
- intelligence 1: 用词基础、句式单一
- Combine: 说话声音很大——在钱汤里练出来的，水声不小喊不过。跟谁都像跟熟人说话（'哎呀你好久没来了——进去进去水刚好！'）。句子结构简单，但表达有力——靠的是语调不是词汇。

```json
{
  "id": "char-takahashi-matsuko",
  "name": "高桥 松子",
  "avatar": "♨️",
  "age": 64,
  "gender": "female",
  "profession": "innkeeper",
  "origin": "local",
  "personalProfile": {
    "past": "你二十岁从邻镇嫁进山の汤，成了高桥家的四代目。丈夫教你怎么调温泉水的温度——四十二度正好，高了烫低了客会说你偷懒。丈夫十年前走后你每天还跟他的照片说早安。左手腕的疤是三十岁那年开水管烫的——你缝都没去缝，包了条毛巾继续开门。",
    "present": "现在你一个人守着钱汤。镇上的常客越来越少——宏人一个星期来两次，健一医生偶尔来泡，偶尔有用Google Maps找到这里的旅客。你把水还是调到四十二度。丈夫的照片还在那里。你跟他说：'今天又少了两个人。但宏人的腰还在疼——所以他肯定还会来的。'"
  },
  "personality": { "ei": 3, "sn": -2, "tf": 1, "jp": 2 },
  "appearance": 1,
  "intelligence": 1,
  "health": 1,
  "abilities": [],
  "speakingStyle": "声音大而洪亮——三十年在钱汤水声里练出来的，不大压不过。跟谁都像在招呼熟客（'进去进去水刚好——哎呀你头发该剪了！'）。句子结构简单但语调丰富，靠温度传话——从骂人的温度到关心的温度，差个两度，她练了四十年。",
  "relations": {
    "char-tanaka-hiroto": { "kinds": ["friend"], "affection": 1, "note": "他每次来都泡最热的池——四十四度。一般人受不了但他一声不吭。他就是那种人。", "since": 0, "lastInteractionTick": 0 },
    "char-nakamura-kenichi": { "kinds": ["acquaintance"], "affection": 2, "note": "他是我的医生。他说我要少吃盐。我说你管不了——我都吃了六十多年了——血压高就高吧。但每次他开了药我还是吃。", "since": 0, "lastInteractionTick": 0 }
  },
  "activityNodeId": "sento",
  "restNodeId": "sento-quarters",
  "sleepWindow": { "start": 22, "duration": 7 },
  "shortTermGoal": "下个月找出新锅炉的钱——旧的那个在冬天最忙的时候堵了二十分钟。",
  "longTermGoal": "守着这个钱汤直到身体守不住。不是为了钱。是为了那锅四十二度的水一直在那里。",
  "liked": "硫磺味、宏人泡完出来'呼'地一声那口气——松了、丈夫照片前点的那炷香烧完刚好",
  "disliked": "锅炉坏、年轻人只说'不用了谢谢'——她不确定他们是说钱汤还是说她、冬天关门时冷风从门缝灌进来",
  "impressionBook": {
    "char-tanaka-hiroto": "他左手少半根手指。每次泡完出来用剩下的四根手指拉拉门——这个动作我看了二十年。"
  }
}
```

Economy: innkeeper=tier2, age 64+health 1 → BME = 0.75 × 1.4 = 1.05. 日收入 = round(1.05 × 2.0 × 20) = 42. 日开销 = 31. 日净余 +11. Shop owner income supplements. ✓

- [ ] **Step 2: Write char-tanaka-hiroto.json**

SpeakingStyle (age 62, ei:2, sn:-2, profession:mailman, intelligence:1):
- age 51-65: 语速偏慢、偶引往事
- ei 2~4: 话多健谈
- profession mailman: 按职业推导——路上见到人就聊几句，简短
- intelligence 1: 用词基础、句式单一
- Combine: 说话像送信——每条消息都短，送到为止。'今天潮水的颜色和昨天不一样'式短句，不分析不评价。跟他聊啥都能扯回到海或者船——那是他一辈子的坐标系。

```json
{
  "id": "char-tanaka-hiroto",
  "name": "田中 宏人",
  "avatar": "✉️",
  "age": 62,
  "gender": "male",
  "profession": "mailman",
  "origin": "local",
  "personalProfile": {
    "past": "你在大间做了三十年渔夫。左手无名指有次收网被缆绳绞掉半截——船医说你这辈子不能出海了。你说'没有这辈子，到港口再说'。又出了十年。五十多岁从船上退下来搬到了潮浜——因为这里有灯塔，灯塔是你年轻时在海上唯一的坐标。你当了这个镇的邮递员。送信和开船没什么区别——都是找到人，把东西送到。",
    "present": "现在每天早上在灯塔擦灯室的玻璃，上午骑自行车送信，下午坐在防波堤上看海。你知道镇上谁收到了信谁没收到——但从不谈论。清每个星期天等你送信到神社——不是等信，是等你陪他喝杯茶。镇上的事你看在眼里，嘴闭得紧。"
  },
  "personality": { "ei": 2, "sn": -2, "tf": -1, "jp": 1 },
  "appearance": 2,
  "intelligence": 1,
  "health": 2,
  "abilities": [],
  "speakingStyle": "说话像送信——每个消息都短，送到为止。'今天潮水的颜色和昨天不一样'式报道，不分析不加评论。话题总拐回海、船、天气——那是他的坐标系。偶尔从过去的经历里捡一句话出来，像从口袋拿出被海水泡过的纸片——干了，但还是能读。",
  "relations": {
    "char-ogawa-kiyoshi": { "kinds": ["friend"], "affection": 3, "note": "我每个星期天送信到神社，他泡茶。我们两个人加起来一百三十岁——但从来没觉得非得说话。", "since": 0, "lastInteractionTick": 0 },
    "char-takahashi-matsuko": { "kinds": ["friend"], "affection": 1, "note": "她说我的腰疼是因为泡不够。她说对了一半——我泡够了。但疼还是疼。", "since": 0, "lastInteractionTick": 0 }
  },
  "activityNodeId": "lighthouse",
  "restNodeId": "lighthouse-quarters",
  "sleepWindow": { "start": 21, "duration": 8 },
  "shortTermGoal": "把灯室的旧透镜重新擦一遍——上次擦是半年前了。",
  "longTermGoal": "继续送信、继续擦透镜、继续在每个星期天喝茶。",
  "liked": "灯塔的光扫过防波堤时那一下子的白光、清泡的粗茶有焦香、邮袋里的信在早晨是冰凉的",
  "disliked": "雾——灯照不穿；无人签收的信——原路退回；脚上这个鸡眼——跟了他五年了",
  "impressionBook": {
    "char-ogawa-kiyoshi": "他泡的茶总是同一个温度。他烧了四十年——温度不用看就知道。"
  }
}
```

Economy: mailman=tier2, age 62+health 2 → BME = 0.75 × 1.2 = 0.9. 日收入 = round(0.9 × 2.0 × 20) = 36. 日开销 = 31. 日净余 +5. Tight but sustainable. ✓

- [ ] **Step 3: Write char-wada-ren.json**

SpeakingStyle (age 19, ei:-3, tf:-4, jp:-2, profession:unemployed, intelligence:3):
- age 18-25: 年轻活力
- ei -4~-2: 话少句短、被动应答
- tf -4~-2: 带情绪色彩（extreme）
- intelligence 3: 词汇丰富
- Combine: 说话极省——不是冷漠，是所有的能量都用在诗和文字上了。面对面说话像缩起来（"嗯""随便""不知道"），但在纸上写下能让你读三遍的句子。

```json
{
  "id": "char-wada-ren",
  "name": "和田 莲",
  "avatar": "📝",
  "age": 19,
  "gender": "male",
  "profession": "unemployed",
  "origin": "local",
  "personalProfile": {
    "past": "你是那种在课堂上从来举不了手的孩子。三年高中，你在笔记本而不是试卷上写满了东西——诗、不懂装懂的哲学、一行一句的情绪。高二那年你不再去学校了。妈妈没说什么，父亲也没有——他们也不知道说什么。你在房间里待了一年，然后搬进了アパート潮浜——远离所有问'你接下来打算做什么'的人。",
    "present": "现在你在渔火咖啡用免费咖啡换刷杯子的生活。海不问那些问题。你每天在公寓墙上写东西——不是破坏——是用笔写在小纸片上再用胶带贴在墙上。你写了五十多片。不知道谁在读。也许只有你自己。"
  },
  "personality": { "ei": -3, "sn": 3, "tf": -4, "jp": -2 },
  "appearance": 3,
  "intelligence": 3,
  "health": 1,
  "abilities": [],
  "speakingStyle": "面对面几乎没有句子——'嗯''随便''不知道'是最常的词。但在纸上能写出让你停下来读三遍的东西。偶尔真实想法漏出来——'你说灯塔每天早上是不是也累了'——然后马上缩回去。声音很轻——不是想藏，是习惯性不相信自己的声音。",
  "relations": {
    "char-ito-umi": { "kinds": ["friend"], "affection": 1, "note": "他是唯一个不问'你接下来打算做什么'的成年人。", "since": 0, "lastInteractionTick": 0 }
  },
  "sleepWindow": { "start": 26, "duration": 7 },
  "restNodeId": "apartment-shiohama",
  "expenseExempt": true,
  "shortTermGoal": "写完一首可以贴在渔火咖啡墙上的诗。海答应了——他说'只要你不贴在我钟上'。",
  "longTermGoal": "找到一种不用离开镇子也能活的方式。或者找到一个离开的方式但可以不用解释为什么。",
  "liked": "深夜独自在公寓听海浪、咖啡机蒸汽喷出来的嘶嘶声、墙上纸片被风吹起来又落下的样子",
  "disliked": "'你打算什么时候找个工作'、日光太强的时候——它不温柔；自己的声音",
  "impressionBook": {
    "char-ito-umi": "他的咖啡和我刷的杯子——这两个之间是整个世界唯一让我觉得我存在的地方。"
  }
}
```

Economy: unemployed=tier0, expenseExempt=true. No income, no survival costs. ✓

- [ ] **Step 4: Write char-morita-misaki.json**

SpeakingStyle (age 10, ei:2, tf:2, profession:student, intelligence:3):
- age 1-12: 用词简单、句子短、语气天真、好奇心外露
- Combine: 说话像跳石头——话题从灯塔跳到钥匙扣跳到昨天的发现，之间只有她自己知道怎么连的。每个句子都带着惊叹或者困惑（"好奇怪""可是为什么"）。

```json
{
  "id": "char-morita-misaki",
  "name": "森田 美咲",
  "avatar": "🐳",
  "age": 10,
  "gender": "female",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "你是潮浜町长森田隆的女儿。你就在这里出生——在背后那个町役场旁边的诊所。你从小在町役场走廊里玩，职员们都认识你。三岁那年你捡了第一块石头——在海滩上，白色椭圆像一只鲸鱼。从那天起你开始在书包里放一个小盒子——专门装你在镇上各处找到的石头。",
    "present": "现在是四年级。你全班只有三个学生——你是最大的。枫老师刚来时说要给你们教到六年级——但她看上去不像会留下来那么久。你每天放学后在海滩捡石头——每颗都不一样。你在想——如果每颗石头都不一样，那爸爸说'潮浜只有四百五十人'，那些人也都不一样吧。"
  },
  "personality": { "ei": 2, "sn": 1, "tf": 2, "jp": -1 },
  "appearance": 3,
  "intelligence": 3,
  "health": 3,
  "abilities": [],
  "speakingStyle": "说话像跳石头——从一个话题蹦到另一个，之间只有她自己明白怎么连的。每句都带着惊叹或疑问（'好奇怪！''可是为什么？''爸爸说——可是我觉得……'）。不怯生——会直接问大人问题。句子短，但组合出的思考常常意外地深。",
  "relations": {
    "char-morita-takashi": { "kinds": ["father"], "affection": 4, "note": "他总是说'为了下一个世代'。我就是下一个世代。不过我觉得他现在做的事不是错的。", "since": 0, "lastInteractionTick": 0 },
    "char-suzuki-kaede": { "kinds": ["student"], "affection": 2, "note": "枫老师说我写的作文很有画面。这是第一个老师这么说。", "since": 0, "lastInteractionTick": 0 }
  },
  "activityNodeId": "elementary-school",
  "restNodeId": "sakano-apartment",
  "sleepWindow": { "start": 21, "duration": 9 },
  "shortTermGoal": "这个星期找到一块黑色的石头。还缺一块黑色的。",
  "longTermGoal": "长大以后去很远的地方，然后回来。很多人说'离开这里'——但从不说'回来这里'。她要把'回来'加上。",
  "liked": "各色石头排成一排在窗台上、书包上的鲸鱼钥匙扣——去年夏祭抽到的、枫老师的作文评语",
  "disliked": "雨天不能捡石头——沙滩的石头都变成灰的；班上只有三个人的时候没来的人永远没来"
}
```

Economy: student=tier0, age=10 < 18 → expenseExempt defaults to true. Do NOT write `expenseExempt: false`. Omit the field entirely. ✓

- [ ] **Step 5: Write char-lin-haiyue.json**

SpeakingStyle (age 27, ei:2, jp:3, profession:chef, intelligence:2):
- age 26-50 (borderline with 18-25): 成熟与活力的混合
- ei 2~4: 话多健谈
- profession chef: 食物比喻
- Combine: 说话带着厨房的节奏——利索、准时、每句都像在切菜（快速、稳、不长）。说到炒面时会认真起来——那是她认真对待的少数几件事之一。

```json
{
  "id": "char-lin-haiyue",
  "name": "林 海月",
  "avatar": "🏖️",
  "age": 27,
  "gender": "female",
  "profession": "chef",
  "origin": "visitor",
  "personalProfile": {
    "past": "你在广岛长大——另一个海边的城市。大学的时候在広島港旁边的一个海鲜居酒屋打工。你发现站在铁板前面比坐在教室里让你更像你。毕业后你开始做季节厨师——冬天在北海道的旅馆，夏天在潮浜的海の家。你的生活是季风驱动的。",
    "present": "第七个夏天。每年五月来，九月走——行李箱比去年少了一件。傍晚关门后你一个人坐在防波堤上看灯塔——那光每十五秒一次——你已经数了七年。森田町长每年都来问你要不要签年约。你说不要。不是因为这镇不好——是因为你怕一旦不走了，就再也不会走了。"
  },
  "personality": { "ei": 2, "sn": 2, "tf": 0, "jp": 3 },
  "appearance": 3,
  "intelligence": 2,
  "health": 2,
  "abilities": [],
  "speakingStyle": "说话带着厨房的节奏——利索准时，每句都像在切菜（快、稳、不长）。说到炒面和酱汁突然认真——那是她认真对待的少数几件事。末尾喜欢加一句'是吧'——不是在问你意见，是在借你一秒钟调整自己的呼吸。",
  "relations": {
    "char-morita-takashi": { "kinds": ["tenant"], "affection": 1, "note": "他每年问同一句话——'要不要签年约'。我每年说不要。他尊重这点。这很罕见。", "since": 0, "lastInteractionTick": 0 }
  },
  "activityNodeId": "umi-no-ie",
  "restNodeId": "uminoie-quarters",
  "sleepWindow": { "start": 23, "duration": 7 },
  "expenseExempt": true,
  "shortTermGoal": "这个夏天开发一道新的酱汁——用本地海盐和一种从广岛带来的秘制酱油。",
  "longTermGoal": "搞清楚为什么每年都回来。不是因为炒面——炒面在哪儿都能做。",
  "liked": "防波堤上傍晚的风（第七个夏天的风跟前六个一样）、灯塔的光扫过海面那一下——每十五秒一次；炒面酱在铁板上焦了的那一瞬间",
  "disliked": "'你就这样一直跑来跑去吗'——问的人通常语气里带了某种她不想分析的怜悯；九月——九月她得走"
}
```

Economy: chef=tier2 BUT origin=visitor → expenseExempt=true (no survival costs, no regular income). visitor characteristic — short stay, no local income stream. ✓

- [ ] **Step 6: Validate Round 4 characters**

```bash
for char in char-takahashi-matsuko char-tanaka-hiroto char-wada-ren char-morita-misaki char-lin-haiyue; do
  pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/shiohama/characters/${char}.json
done
```

Expected: all five pass.

- [ ] **Step 7: Commit**

```bash
git add backend/scenes/shiohama/characters/char-takahashi-matsuko.json backend/scenes/shiohama/characters/char-tanaka-hiroto.json backend/scenes/shiohama/characters/char-wada-ren.json backend/scenes/shiohama/characters/char-morita-misaki.json backend/scenes/shiohama/characters/char-lin-haiyue.json
git commit -m "feat: add shiohama Round 4 characters (other residents)"
```

---

### Task 9: Full validation

**Files:** none new — validates all existing files

- [ ] **Step 1: Validate all scene files**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/shiohama/manifest.json
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/shiohama/map.json
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/shiohama/items.json
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/shiohama/shops.json
for f in backend/scenes/shiohama/characters/*.json; do
  pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../$f
done
```

Expected: all files pass validation with no errors.

- [ ] **Step 2: Check cross-file integrity**

```bash
# Check all character IDs referenced in shops exist
node -e "
const shops = require('./backend/scenes/shiohama/shops.json');
const fs = require('fs');
const chars = fs.readdirSync('./backend/scenes/shiohama/characters/').map(f => f.replace('.json',''));
for (const s of shops) {
  if (!chars.includes(s.ownerCharacterId)) console.error('MISSING OWNER:', s.ownerCharacterId);
  else console.log('OK owner:', s.ownerCharacterId);
}
"
```

Expected: all 6 owners found.

```bash
# Check all shop nodeIds exist in map
node -e "
const shops = require('./backend/scenes/shiohama/shops.json');
const map = JSON.parse(require('fs').readFileSync('./backend/scenes/shiohama/map.json','utf8'));
const nodeIds = new Set(map.nodes.map(n => n.id));
for (const s of shops) {
  if (!nodeIds.has(s.nodeId)) console.error('MISSING NODE:', s.nodeId);
  else console.log('OK node:', s.nodeId);
}
"
```

Expected: all 6 nodes found.

```bash
# Check all character relations reference existing characters
node -e "
const fs = require('fs');
const dir = './backend/scenes/shiohama/characters/';
const charFiles = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
const charIds = new Set(charFiles.map(f => f.replace('.json','')));
for (const f of charFiles) {
  const c = JSON.parse(fs.readFileSync(dir + f, 'utf8'));
  if (c.relations) {
    for (const targetId of Object.keys(c.relations)) {
      if (!charIds.has(targetId)) console.error(f, '-> MISSING TARGET:', targetId);
      else console.log(f, '->', targetId, 'OK');
    }
  }
}
"
```

Expected: all relation targets exist.

- [ ] **Step 3: Run backend tests to check no regressions**

```bash
pnpm test:backend
```

Expected: all existing tests pass (shiohama scene data is not loaded by existing tests so no new tests are expected).

- [ ] **Step 4: Commit validation fixes (if any) or proceed**

---

### Task 10: speakingStyle diversity self-check + final review

**Files:** may modify character JSONs

- [ ] **Step 1: Check speakingStyle diversity**

Run a manual diversity check — for each character, extract speakingStyle features and ensure no two characters share ≥3 same features:

```bash
node -e "
const chars = [
  { id:'genji', age:'58', ei:'-3', tf:'2', jp:'3', prof:'fisherman', intel:'3' },
  { id:'mayumi', age:'38', ei:'2', tf:'0', jp:'2', prof:'merchant', intel:'2' },
  { id:'shota', age:'22', ei:'-1', tf:'-2', jp:'-1', prof:'fisherman', intel:'2' },
  { id:'yasuhei', age:'45', ei:'3', tf:'1', jp:'1', prof:'merchant', intel:'2' },
  { id:'akari', age:'34', ei:'1', tf:'3', jp:'2', prof:'baker', intel:'2' },
  { id:'umi', age:'28', ei:'-2', tf:'-3', jp:'0', prof:'brewer', intel:'3' },
  { id:'takashi', age:'55', ei:'2', tf:'2', jp:'4', prof:'mayor', intel:'3' },
  { id:'kenichi', age:'51', ei:'0', tf:'3', jp:'3', prof:'doctor', intel:'4' },
  { id:'kiyoshi', age:'67', ei:'-4', tf:'1', jp:'4', prof:'priest', intel:'3' },
  { id:'kaede', age:'25', ei:'4', tf:'2', jp:'-1', prof:'teacher', intel:'2' },
  { id:'matsuko', age:'64', ei:'3', tf:'1', jp:'2', prof:'innkeeper', intel:'1' },
  { id:'hiroto', age:'62', ei:'2', tf:'-1', jp:'1', prof:'mailman', intel:'1' },
  { id:'ren', age:'19', ei:'-3', tf:'-4', jp:'-2', prof:'unemployed', intel:'3' },
  { id:'misaki', age:'10', ei:'2', tf:'2', jp:'-1', prof:'student', intel:'3' },
  { id:'haiyue', age:'27', ei:'2', tf:'0', jp:'3', prof:'chef', intel:'2' },
];
// Quick check: any two chars sharing ≥3 features?
for (let i=0; i<chars.length; i++) {
  for (let j=i+1; j<chars.length; j++) {
    const a = chars[i], b = chars[j];
    let shared = 0;
    if (a.age === b.age) shared++;
    if (a.ei === b.ei) shared++;
    if (a.tf === b.tf) shared++;
    if (a.jp === b.jp) shared++;
    if (a.prof === b.prof) shared++;
    if (a.intel === b.intel) shared++;
    if (shared >= 4) console.log('WARNING: ' + a.id + ' and ' + b.id + ' share ' + shared + ' dims');
  }
}
console.log('Diversity check complete.');
"
```

Expected: no warnings (shared dims < 4 for all pairs).

- [ ] **Step 2: Final commit**

```bash
git add -A
git commit -m "chore: final review and adjustments for shiohama mod"
```
