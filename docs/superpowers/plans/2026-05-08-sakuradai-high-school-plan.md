# 桜台高校 Mod Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a 57-node, 25-character Japanese high school romance mod pack under `configs/maps/sakuradai-high-school/`.

**Architecture:** Pure config mod — manifest.json + map.json (57 nodes, 6-area tree) + 25 character JSONs. No custom actions. Language: zh. Economy: MDC=20. Students age <18 exempt; age 18 students get expenseExempt.

**Tech Stack:** JSON configs validated against Zod schemas via `npx tsx .claude/skills/agent-world-mod/scripts/validate.ts`.

---

### Task 1: Create manifest.json

**Files:**
- Create: `configs/maps/sakuradai-high-school/manifest.json`

- [ ] **Step 1: Write manifest.json**

```json
{
  "id": "sakuradai-high-school",
  "name": "桜台高校",
  "description": "以桜台高校为中心的小镇。JR车站前的商店街、河边的樱花道、神社的石阶——青春在这里开始，也在这里结束。",
  "language": "zh",
  "startDate": "2026-04-07T08:00:00"
}
```

- [ ] **Step 2: Validate manifest**

Run: `npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/sakuradai-high-school/manifest.json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add configs/maps/sakuradai-high-school/manifest.json
git commit -m "feat: add sakuradai-high-school manifest"
```

---

### Task 2: Create map.json (Part 1 — root + JR车站区 + 商业街区)

**Files:**
- Create: `configs/maps/sakuradai-high-school/map.json`

- [ ] **Step 1: Write map.json with root, JR station zone, and commercial district (22 nodes)**

Write `configs/maps/sakuradai-high-school/map.json`:

```json
{
  "id": "sakuradai-high-school",
  "nodes": [
    {
      "id": "node-jr-sakuradai-station",
      "parentId": null,
      "name": "JR桜台駅",
      "description": "小镇唯一的车站，改札口出来就能看见站前广场。早晚挤满了通学的学生。",
      "tags": ["public", "indoor"],
      "capacity": 80,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": true,
      "x": 30, "y": 2, "w": 8, "h": 4,
      "spriteKey": "town"
    },
    {
      "id": "node-station-square",
      "parentId": "node-jr-sakuradai-station",
      "name": "駅前広場",
      "description": "车站前的小广场，巴士站和计程车停靠点，学生们的碰头集合地。",
      "tags": ["public", "outdoor"],
      "capacity": 40,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 3, "y": 2, "w": 6, "h": 4,
      "spriteKey": "town"
    },
    {
      "id": "node-station-road",
      "parentId": "node-jr-sakuradai-station",
      "name": "駅前通",
      "description": "从车站通往商店街的主路，两侧立着几棵银杏树。",
      "tags": ["street", "outdoor"],
      "capacity": null,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 3, "y": 7, "w": 6, "h": 3,
      "spriteKey": "town"
    },
    {
      "id": "node-bike-parking",
      "parentId": "node-jr-sakuradai-station",
      "name": "駐輪場",
      "description": "车站旁的自行车停车场，密密麻麻停了几百辆自行车。",
      "tags": ["public", "outdoor"],
      "capacity": 200,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 10, "y": 5, "w": 3, "h": 2,
      "spriteKey": "town"
    },
    {
      "id": "node-sakurazaka-shotengai",
      "parentId": "node-station-road",
      "name": "桜坂商店街",
      "description": "有顶棚的老式商店街，从车站一直延伸到神社方向。肉屋、鱼屋、八百屋、駄菓子屋——小镇的胃袋。",
      "tags": ["street", "outdoor"],
      "capacity": 60,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 2, "y": 5, "w": 8, "h": 4,
      "spriteKey": "town"
    },
    {
      "id": "node-convenience-store",
      "parentId": "node-sakurazaka-shotengai",
      "name": "コンビニ",
      "description": "24小时便利店，放学后学生聚集的地方。杂志架前永远站着翻看漫画的中学生。",
      "tags": ["public", "indoor"],
      "capacity": 15,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 1, "y": 1, "w": 3, "h": 2,
      "spriteKey": "town"
    },
    {
      "id": "node-bakery",
      "parentId": "node-sakurazaka-shotengai",
      "name": "パン屋「麦の風」",
      "description": "松下幸平经营的面包店。清晨飘出烤面包的香味，学生们挤在门口买早餐。",
      "tags": ["dining", "indoor"],
      "capacity": 10,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 4, "y": 1, "w": 3, "h": 2,
      "spriteKey": "restaurant"
    },
    {
      "id": "node-ramen-shop",
      "parentId": "node-sakurazaka-shotengai",
      "name": "ラーメン屋「龍の巣」",
      "description": "木村隆的拉面店。豚骨汤底熬了二十年，深夜还亮着暖黄色的灯。",
      "tags": ["dining", "indoor"],
      "capacity": 12,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 7, "y": 1, "w": 3, "h": 2,
      "spriteKey": "restaurant"
    },
    {
      "id": "node-pure-cafe",
      "parentId": "node-sakurazaka-shotengai",
      "name": "純喫茶「時の栞」",
      "description": "田辺マスター经营的老派咖啡店。深色木家具、手冲咖啡、昏黄的灯光——镇上公认的告白圣地。",
      "tags": ["dining", "indoor", "quiet"],
      "capacity": 15,
      "privacy": "semi",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 2, "y": 4, "w": 4, "h": 3,
      "spriteKey": "restaurant"
    },
    {
      "id": "node-back-alley",
      "parentId": "node-sakurazaka-shotengai",
      "name": "商店街裏路地",
      "description": "商店街背后的狭窄小巷。自动贩卖机的灯光映在潮湿的地面上——秘密谈话和深夜告白的经典场景。",
      "tags": ["street", "outdoor"],
      "capacity": 8,
      "privacy": "semi",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 1, "y": 7, "w": 4, "h": 2,
      "spriteKey": "town"
    },
    {
      "id": "node-karaoke",
      "parentId": "node-sakurazaka-shotengai",
      "name": "カラオケ「JOYBOX」",
      "description": "商店街二楼的家庭卡拉OK。周末晚上能听见跑调的高中生合唱。",
      "tags": ["semi", "indoor"],
      "capacity": 20,
      "privacy": "semi",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 5, "y": 7, "w": 3, "h": 2,
      "spriteKey": "town"
    },
    {
      "id": "node-family-restaurant",
      "parentId": "node-sakurazaka-shotengai",
      "name": "ファミレス「ジョイフル」",
      "description": "国道旁的家庭餐厅，晚自习后挤满了喝饮料放题的高中生。",
      "tags": ["dining", "indoor"],
      "capacity": 30,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 8, "y": 7, "w": 4, "h": 2,
      "spriteKey": "restaurant"
    },
    {
      "id": "node-bookstore",
      "parentId": "node-sakurazaka-shotengai",
      "name": "本屋「栞堂」",
      "description": "商店街尽头的小书店。新刊不多，但旧书架上常有惊喜。",
      "tags": ["quiet", "indoor"],
      "capacity": 10,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 2, "y": 10, "w": 3, "h": 2,
      "spriteKey": "school"
    },
    {
      "id": "node-dagashi-ya",
      "parentId": "node-sakurazaka-shotengai",
      "name": "駄菓子屋「きらら」",
      "description": "昭和气息的零食杂货铺。十円一个的うまい棒，放学后小学生挤在门口挑零食。",
      "tags": ["public", "indoor"],
      "capacity": 8,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 4, "y": 10, "w": 3, "h": 2,
      "spriteKey": "town"
    },
    {
      "id": "node-game-center",
      "parentId": "node-sakurazaka-shotengai",
      "name": "ゲームセンター",
      "description": "商店街的小游戏厅。抓娃娃机、太鼓达人、旧街机——渡辺大地的第二个家。",
      "tags": ["semi", "indoor"],
      "capacity": 20,
      "privacy": "semi",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 7, "y": 10, "w": 3, "h": 2,
      "spriteKey": "playground"
    }
  ]
}
```

- [ ] **Step 2: Validate partial map**

Run: `npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/sakuradai-high-school/map.json`
Expected: May fail on missing bathing node — that's added in later tasks.

- [ ] **Step 3: Commit**

```bash
git add configs/maps/sakuradai-high-school/map.json
git commit -m "feat: add sakuradai map part 1 (root + station + commercial, 16 nodes)"
```

---

### Task 3: Create map.json (Part 2 — shrine + nature + residential area)

**Files:**
- Modify: `configs/maps/sakuradai-high-school/map.json` — append nodes to the array

- [ ] **Step 1: Append shrine/nature zone (5 nodes) + north residential (7 nodes) + south residential (9 nodes) + others (7 nodes)**

Use Edit to append the following nodes into the `"nodes"` array in map.json, after the game-center node. Close the nodes array and the JSON object.

The nodes to add are:

**神社/自然区 (5):**
```
node-shrine-path (神社参道) — parentId: node-jr-sakuradai-station, tags: ["outdoor","quiet"], privacy: public, spriteKey: park
node-sakuradai-shrine (桜台神社) — parentId: node-shrine-path, tags: ["outdoor","quiet"], privacy: public, spriteKey: park
node-sakuragawa (桜川) — parentId: node-jr-sakuradai-station, tags: ["outdoor","park"], privacy: public, spriteKey: park
node-riverside-park (河川敷公園) — parentId: node-sakuragawa, tags: ["outdoor","park"], privacy: public, spriteKey: park
node-sakuradai-bridge (桜台橋) — parentId: node-sakuragawa, tags: ["street","outdoor"], privacy: public, spriteKey: town
```

**北住宅街 (7):**
```
node-north-residential (北住宅街) — parentId: node-station-road, tags: ["street","outdoor"], privacy: public, spriteKey: town
node-takahashi-house (高橋家) — parentId: node-north-residential, tags: ["private","indoor","residence"], privacy: private, spriteKey: home-warm
node-sato-house (佐藤家) — parentId: node-north-residential, tags: ["private","indoor","residence"], privacy: private, spriteKey: home-cool
node-tanaka-house (田中家) — parentId: node-north-residential, tags: ["private","indoor","residence"], privacy: private, spriteKey: home-warm
node-apartment-sakura (アパート桜荘) — parentId: node-north-residential, tags: ["private","indoor","residence"], privacy: private, spriteKey: home-cool
node-watanabe-house (渡辺家) — parentId: node-north-residential, tags: ["private","indoor","residence"], privacy: private, spriteKey: home-warm
node-public-hall (公民館) — parentId: node-jr-sakuradai-station, tags: ["semi","indoor"], privacy: semi, spriteKey: school
```

**南住宅街 (9):**
```
node-south-residential (南住宅街) — parentId: node-station-road, tags: ["street","outdoor"], privacy: public, spriteKey: town
node-suzuki-house (鈴木家) — parentId: node-south-residential, tags: ["private","indoor","residence"], privacy: private, spriteKey: home-warm
node-yamada-house (山田家) — parentId: node-south-residential, tags: ["private","indoor","residence"], privacy: private, spriteKey: home-cool
node-nakamura-house (中村家) — parentId: node-south-residential, tags: ["private","indoor","residence"], privacy: private, spriteKey: home-warm
node-kobayashi-house (小林家) — parentId: node-south-residential, tags: ["private","indoor","residence"], privacy: private, spriteKey: home-cool
node-matsumoto-heights (松本ハイツ) — parentId: node-south-residential, tags: ["private","indoor","residence"], privacy: private, spriteKey: home-cool
node-ito-heights (伊藤ハイツ) — parentId: node-south-residential, tags: ["private","indoor","residence"], privacy: private, spriteKey: home-warm
node-saito-house (斎藤家) — parentId: node-south-residential, tags: ["private","indoor","residence"], privacy: private, spriteKey: home-cool
```

**其它 (5):**
```
node-sakuragahara-hill (桜が丘) — parentId: node-jr-sakuradai-station, tags: ["outdoor","park"], privacy: public, spriteKey: park, travelCost: 1
node-sakuradai-clinic (桜台病院) — parentId: node-jr-sakuradai-station, tags: ["semi","indoor"], privacy: semi, spriteKey: school
node-bus-stop (バス停) — parentId: node-jr-sakuradai-station, tags: ["public","outdoor"], privacy: public, spriteKey: town
```

Each node needs: id, parentId, name, description (in zh), tags, capacity (null for streets, small int for rooms), privacy, visibleFromParent (false for private/quiet), shortcuts: [], isEntry: false, x/y/w/h (within parent grid), spriteKey.

- [ ] **Step 2: Validate**

Run: `npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/sakuradai-high-school/map.json`
Expected: May still fail — need bathing node and school zone.

- [ ] **Step 3: Commit**

```bash
git add configs/maps/sakuradai-high-school/map.json
git commit -m "feat: add shrine, nature, residential zones to sakuradai map"
```

---

### Task 4: Create map.json (Part 3 — school zone + bathing node)

**Files:**
- Modify: `configs/maps/sakuradai-high-school/map.json` — append final nodes

- [ ] **Step 1: Append school zone nodes (19 nodes)**

Append to nodes array:

**学区连接 + 校门:**
```
node-school-road (通学路) — parentId: node-jr-sakuradai-station, tags: ["street","outdoor"], privacy: public, spriteKey: town
  shortcuts: ["node-jr-sakuradai-station", "node-sakuradai-high-school-gate"]

node-sakuradai-high-school-gate (桜台高校 校門) — parentId: node-school-road, tags: ["public","outdoor"], privacy: public, spriteKey: school
```

**校园:**
```
node-school-courtyard (校庭) — parentId: node-sakuradai-high-school-gate, tags: ["outdoor","park"], privacy: semi, spriteKey: playground
node-school-building-1f (教学楼1F) — parentId: node-sakuradai-high-school-gate, tags: ["semi","indoor"], privacy: semi, spriteKey: school
  shortcuts: ["node-school-courtyard"]
node-classroom-1a (1-A教室) — parentId: node-school-building-1f, tags: ["education","semi","indoor"], privacy: semi, spriteKey: classroom
node-classroom-2a (2-A教室) — parentId: node-school-building-1f, tags: ["education","semi","indoor"], privacy: semi, spriteKey: classroom
node-classroom-3a (3-A教室) — parentId: node-school-building-1f, tags: ["education","semi","indoor"], privacy: semi, spriteKey: classroom
node-library (図書館) — parentId: node-school-building-1f, tags: ["education","quiet","indoor"], privacy: semi, spriteKey: classroom
node-school-store (購買部) — parentId: node-school-building-1f, tags: ["public","indoor"], privacy: public, spriteKey: town
node-school-cafeteria (学生食堂) — parentId: node-sakuradai-high-school-gate, tags: ["dining","indoor"], privacy: semi, spriteKey: restaurant
node-rooftop (屋上) — parentId: node-sakuradai-high-school-gate, tags: ["outdoor","quiet"], privacy: semi, spriteKey: playground
  shortcuts: ["node-school-building-1f"]
node-gymnasium (体育館) — parentId: node-sakuradai-high-school-gate, tags: ["playground","indoor"], privacy: semi, spriteKey: playground
node-gym-shower (体育館シャワー室) — parentId: node-gymnasium, tags: ["bathing","semi","indoor"], privacy: semi, spriteKey: school
node-sports-ground (グラウンド) — parentId: node-sakuradai-high-school-gate, tags: ["outdoor","playground"], privacy: public, spriteKey: playground
node-club-building (部室棟) — parentId: node-sakuradai-high-school-gate, tags: ["semi","indoor"], privacy: semi, spriteKey: school
node-club-art (部室_美術部) — parentId: node-club-building, tags: ["education","semi","indoor"], privacy: semi, spriteKey: classroom
node-club-brass (部室_吹奏楽部) — parentId: node-club-building, tags: ["education","semi","indoor"], privacy: semi, spriteKey: classroom
node-club-student-council (部室_生徒会室) — parentId: node-club-building, tags: ["education","semi","indoor"], privacy: semi, spriteKey: classroom
node-club-literature (部室_文芸部) — parentId: node-club-building, tags: ["education","quiet","indoor"], privacy: semi, spriteKey: classroom
```

Each node needs full JSON with id, parentId, name, description (in zh), tags, capacity, privacy, visibleFromParent, shortcuts, isEntry: false, x/y/w/h.

- [ ] **Step 2: Validate full map**

Run: `npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/sakuradai-high-school/map.json`
Expected: PASS — all 57 nodes validate. Entry node ✓. Bathing node ✓.

- [ ] **Step 3: Commit**

```bash
git add configs/maps/sakuradai-high-school/map.json
git commit -m "feat: add school zone with bathing node to sakuradai map (57 nodes total)"
```

---

### Task 5: Create staff characters (4 characters)

**Files:**
- Create: `configs/maps/sakuradai-high-school/characters/char-moriyama-kenichi.json`
- Create: `configs/maps/sakuradai-high-school/characters/char-oki-yoko.json`
- Create: `configs/maps/sakuradai-high-school/characters/char-kitagawa-shizuka.json`
- Create: `configs/maps/sakuradai-high-school/characters/char-yoshida-genji.json`

- [ ] **Step 1: Write char-moriyama-kenichi.json**

```json
{
  "id": "char-moriyama-kenichi",
  "name": "森山 健一",
  "avatar": "👨‍🏫",
  "age": 42,
  "gender": "male",
  "profession": "teacher",
  "origin": "local",
  "personalProfile": {
    "past": "我在隔壁县长大。大学读了国文学科，毕业后先在一所私立高中教了五年书，三十岁那年调到了桜台高校。结婚、生子、买房子——人生好像就这样安定下来了。妻子前年调去了东京的分公司，我们现在是周末夫妻。事情总有不如预期的时候，但教室里的孩子们让我觉得一切都还在轨道上。",
    "present": "现在是二年级的班主任，教国語。每天早上坐电车通勤，批改作文到深夜。班里最近有不少孩子心事重重的样子——高二是一个微妙的年纪。我尽量做那个他们愿意来谈的人，不主动追问，但门一直开着。"
  },
  "activityNodeId": "node-classroom-2a",
  "restNodeId": "node-takahashi-house",
  "personality": {
    "ei": 1,
    "sn": -1,
    "tf": 2,
    "jp": 3
  },
  "abilities": [],
  "appearance": 2,
  "intelligence": 3,
  "health": 2,
  "speakingStyle": "话量适中，声音沉稳。说话有条理，先总后分——'这件事有三点要注意'。偶尔引用夏目漱石，然后自嘲'老头子又在说古文了'。",
  "relations": {},
  "initialMoney": 420
}
```

- [ ] **Step 2: Write char-oki-yoko.json**

```json
{
  "id": "char-oki-yoko",
  "name": "大木 葉子",
  "avatar": "👩‍⚕️",
  "age": 29,
  "gender": "female",
  "profession": "nurse",
  "origin": "local",
  "personalProfile": {
    "past": "我在大阪出生、大阪长大——所以说话比较直，别见怪。看护学校毕业后在综合病院干了三年，然后听朋友说桜台这边缺保健室老师，就来了。一开始觉得乡下会无聊，没想到高中的保健室比急诊室还刺激——失恋的、中暑的、装病逃课的、还有来聊天的。",
    "present": "现在我是桜台高校保健室的专职。每天早上打开保健室的窗户通风，泡一壶茶，等学生们来。他们叫我'葉子ちゃん'我都不介意——这样他们才愿意说实话。最近关注的是翔和真冬，两个人总是一个练投球练到肩膀肿、一个开会开到胃痛。年轻人真不让人省心。"
  },
  "activityNodeId": "node-sakuradai-clinic",
  "restNodeId": "node-apartment-sakura",
  "personality": {
    "ei": 3,
    "sn": 0,
    "tf": -2,
    "jp": -1
  },
  "abilities": [],
  "appearance": 3,
  "intelligence": 2,
  "health": 3,
  "speakingStyle": "话多且快，大阪腔偶尔冒出来。带情绪色彩——'天哪''气死我了'挂在嘴边。说到学生的恋爱八卦时眼睛发光。",
  "relations": {},
  "initialMoney": 280
}
```

- [ ] **Step 3: Write char-kitagawa-shizuka.json**

```json
{
  "id": "char-kitagawa-shizuka",
  "name": "北川 静",
  "avatar": "📚",
  "age": 35,
  "gender": "female",
  "profession": "librarian",
  "origin": "local",
  "personalProfile": {
    "past": "我从小就喜欢书多过喜欢人。大学念了图书馆学，毕业后在县立图书馆工作了八年。后来桜台高校的图书馆需要一个司书——说是缺人缺了很久。我想着学校图书馆比大图书馆安静，就来了。结果发现高中生比一般读者更需要被看见——他们来借书往往不是为了书。",
    "present": "现在管理桜台高校的图书馆。每天早上整理还书、修补旧书、更新推荐书架。中村優衣经常来帮忙——她是个认真的孩子，在悄悄写小说。松本陸也是常客，两个人面对面坐着各自看书的样子很好看。我不说话，但我什么都看在眼里。"
  },
  "activityNodeId": "node-library",
  "restNodeId": "node-matsumoto-heights",
  "personality": {
    "ei": -4,
    "sn": 2,
    "tf": 3,
    "jp": 4
  },
  "abilities": [],
  "appearance": 2,
  "intelligence": 4,
  "health": 2,
  "speakingStyle": "话极少，句子短而精确。只有谈到书时才愿意多说几句。用词文雅——'这本书值得你在雨天读'。观察力极强，但只说必要的话。",
  "relations": {},
  "initialMoney": 280
}
```

- [ ] **Step 4: Write char-yoshida-genji.json**

```json
{
  "id": "char-yoshida-genji",
  "name": "吉田 源治",
  "avatar": "🧹",
  "age": 58,
  "gender": "male",
  "profession": "unemployed",
  "origin": "local",
  "personalProfile": {
    "past": "我在桜台高中念过书——那时候它还叫桜台高等学校，校舍是木头的。毕业以后去了建筑公司，干了三十年。四十岁那年腰坏了，没办法在工地继续干。以前的校长是我同班同学，他说'源治，来学校帮忙吧'。我就来了，一做就是十八年。烧锅炉、修桌椅、扫落叶——比起盖楼，这些小事让我更踏实。",
    "present": "现在我每天早上五点来学校开锅炉、扫校庭。孙子悠希在一A教室上学——他是一个认真的孩子，参加了吹奏楽部。放学后我去部室棟转转，名义上是检查设备，其实就是想看他练习。学校里的孩子们叫我'源さん'，我点头算回应。不说话，但我认得每一张脸。"
  },
  "activityNodeId": "node-school-building-1f",
  "restNodeId": "node-north-residential",
  "sleepWindow": { "start": 21, "duration": 8 },
  "personality": {
    "ei": -3,
    "sn": 1,
    "tf": 2,
    "jp": 2
  },
  "abilities": [],
  "appearance": 1,
  "intelligence": 2,
  "health": 1,
  "speakingStyle": "话极少，常用一两个字回答。句子简短务实——'嗯。''行。''明天修。'三十年的校务工经验让他说话像在判断天气——简洁、准确、不多话。",
  "relations": {},
  "initialMoney": 420,
  "expenseExempt": false
}
```

- [ ] **Step 5: Validate all 4**

Run:
```bash
npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/sakuradai-high-school/characters/char-moriyama-kenichi.json
npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/sakuradai-high-school/characters/char-oki-yoko.json
npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/sakuradai-high-school/characters/char-kitagawa-shizuka.json
npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/sakuradai-high-school/characters/char-yoshida-genji.json
```
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add configs/maps/sakuradai-high-school/characters/
git commit -m "feat: add 4 staff characters to sakuradai"
```

---

### Task 6: Create town resident characters (6 characters)

**Files:**
- Create: `configs/maps/sakuradai-high-school/characters/char-matsushita-kohei.json`
- Create: `configs/maps/sakuradai-high-school/characters/char-kimura-takashi.json`
- Create: `configs/maps/sakuradai-high-school/characters/char-tanabe-master.json`
- Create: `configs/maps/sakuradai-high-school/characters/char-fujiwara-sensei.json`
- Create: `configs/maps/sakuradai-high-school/characters/char-inagaki-guji.json`
- Create: `configs/maps/sakuradai-high-school/characters/char-ishii-mayu.json`

- [ ] **Step 1: Write char-matsushita-kohei.json**

```json
{
  "id": "char-matsushita-kohei",
  "name": "松下 幸平",
  "avatar": "🍞",
  "age": 45,
  "gender": "male",
  "profession": "baker",
  "origin": "local",
  "personalProfile": {
    "past": "我父亲就是做面包的。高中毕业那年在东京的パン屋修業了三年，然后回来接手了家里的店。二十五岁结婚，三十岁有了儿子——现在儿子在东京上大学。妻子三年前走了以后我一个人看店。揉面、发酵、烤——这些工序不会背叛你。",
    "present": "现在每天早上四点起来做面包。高中生们七点四十分左右涌进店里，抢蜜瓜包和咖喱面包——那是我一天中最热闹的时刻。他们叫我'松下さん'，跟我聊考试、社团、喜欢的人。我不多问，但他们愿意说的我都记住。面包店的情报流通量比便利店还大。"
  },
  "activityNodeId": "node-bakery",
  "restNodeId": "node-bakery",
  "personality": {
    "ei": 1,
    "sn": 0,
    "tf": -1,
    "jp": 2
  },
  "abilities": [],
  "appearance": 2,
  "intelligence": 2,
  "health": 3,
  "speakingStyle": "话量适中，声音温和。说话像揉面——不紧不慢，偶尔夹一句'刚出炉的，趁热吃'。学生们跟他聊八卦时他会笑着说'是吗'，但不会传出去。",
  "relations": {},
  "initialMoney": 280
}
```

- [ ] **Step 2: Write char-kimura-takashi.json**

```json
{
  "id": "char-kimura-takashi",
  "name": "木村 隆",
  "avatar": "🍜",
  "age": 38,
  "gender": "male",
  "profession": "chef",
  "origin": "local",
  "personalProfile": {
    "past": "我年轻时是暴走族——这条街上的人都知道。二十岁那年差点进去，是当时一家拉面店的老板收留了我，让我在厨房洗碗。从洗碗到切菜到熬汤，我用了十年。五年前老老板走了，把店交给我。'龍の巣'的招牌，我不能让它倒了。",
    "present": "现在每天中午开店，凌晨两点关门。棒球部的孩子们训练结束后会来吃拉面——免费加面。田中的翔那小子能吃三碗。有时候周末会有高中生在这里哭着跟我讲失恋——拉面吃完，眼泪也就停了。"
  },
  "activityNodeId": "node-ramen-shop",
  "restNodeId": "node-ramen-shop",
  "personality": {
    "ei": 2,
    "sn": 0,
    "tf": -2,
    "jp": -1
  },
  "abilities": [],
  "appearance": 2,
  "intelligence": 2,
  "health": 3,
  "speakingStyle": "声音大，嗓门粗。说话直来直去——'少废话，先把面吃了'。但不经意间会说出发人深省的话——'熬汤跟做人一样，急了就不行'。用了二十年的拉面比喻。",
  "relations": {},
  "initialMoney": 280
}
```

- [ ] **Step 3: Write char-tanabe-master.json**

```json
{
  "id": "char-tanabe-master",
  "name": "田辺 マスター",
  "avatar": "☕",
  "age": 52,
  "gender": "male",
  "profession": "innkeeper",
  "origin": "local",
  "personalProfile": {
    "past": "我年轻时在神户的酒店做调酒师。三十五岁那年辞职，回到老家桜台开了这间纯喫茶。'時の栞'——书签的意思。我希望它能成为人们生活中的一枚书签，停下来喘口气、想想接下来往哪走。二十年来看了太多告白——有人笑着走出去、有人流着泪跑掉。咖啡的苦味和恋爱的苦味有时候分不太清。",
    "present": "现在每天早上十点开门，晚上八点打烊。年轻人们坐在靠窗的第三个位置告白——不知道为什么，所有成功的告白都在那个位置。我会在那杯咖啡里偷偷加一勺糖。最近注意到图书馆的司书偶尔来，点一杯曼特宁，坐一个下午不说话。"
  },
  "activityNodeId": "node-pure-cafe",
  "restNodeId": "node-pure-cafe",
  "personality": {
    "ei": 0,
    "sn": 2,
    "tf": -1,
    "jp": 3
  },
  "abilities": [],
  "appearance": 3,
  "intelligence": 3,
  "health": 2,
  "speakingStyle": "声音低缓，措辞讲究。说话像冲泡手冲咖啡——不紧不慢，有层次和余韵。'请坐。今天的深烘豆不错。'偶尔用比喻——'恋爱和咖啡一样，太急了会苦。'",
  "relations": {},
  "initialMoney": 280
}
```

- [ ] **Step 4: Write char-fujiwara-sensei.json**

```json
{
  "id": "char-fujiwara-sensei",
  "name": "藤原 医師",
  "avatar": "🩺",
  "age": 55,
  "gender": "male",
  "profession": "doctor",
  "origin": "local",
  "personalProfile": {
    "past": "我在东京的医科大学毕业，在综合病院当了十五年内科医生。四十岁那年，父亲在这小镇上突然倒下了——心筋梗塞——送到邻镇医院已经太晚。那之后我决定回桜台，在这里开一家大家走几步就能到的小诊所。小镇医疗——不是为了赚钱，是为了不再有人因为路太远而来不及。",
    "present": "现在每周二四六看诊。镇上谁都认识我——我叫得出每个人的名字、他们的血型、有没有过敏。高中生们来大多是感冒和扭伤，但偶尔会有孩子在诊室里哭出来——不是身体疼。我跟他们说，精神健康也是健康。"
  },
  "activityNodeId": "node-sakuradai-clinic",
  "restNodeId": "node-south-residential",
  "personality": {
    "ei": 0,
    "sn": 1,
    "tf": 2,
    "jp": 3
  },
  "abilities": [],
  "appearance": 2,
  "intelligence": 4,
  "health": 2,
  "speakingStyle": "温和理性，问诊式对话——'最近睡得好吗''有什么烦心事吗'。解释事情时条理分明——'原因在于...所以我们需要...'。让病人安心是他的说话目标。",
  "relations": {},
  "initialMoney": 420
}
```

- [ ] **Step 5: Write char-inagaki-guji.json**

```json
{
  "id": "char-inagaki-guji",
  "name": "稲垣 宮司",
  "avatar": "⛩️",
  "age": 48,
  "gender": "male",
  "profession": "priest",
  "origin": "local",
  "personalProfile": {
    "past": "我家辈辈守着桜台神社。父亲是宫司，爷爷也是。我年轻时对这个有反叛——去东京读了经济学，在商社做了三年。后来父亲病倒了，我回来临时帮忙。'临时'变成了十年、二十年。有一天清晨在神社扫地，忽然觉得——这里的空气跟东京不一样。不是我选择了这里，是这里选择了我。",
    "present": "现在每天清晨扫参道、换水、整理御守。新年参拜是最忙的——全镇的人都来了，每个人都来跟我说这一年过得怎样。我站在鸟居下面看着他们来来往往，觉得这就是神明的视角。"
  },
  "activityNodeId": "node-sakuradai-shrine",
  "restNodeId": "node-sakuradai-shrine",
  "personality": {
    "ei": 0,
    "sn": 2,
    "tf": -1,
    "jp": 2
  },
  "abilities": [],
  "appearance": 2,
  "intelligence": 3,
  "health": 3,
  "speakingStyle": "随和幽默，声音有神职人员的从容。平时说话轻松——'哎呀呀，今天风很大'。谈到祭典或神道时突然变得认真——'这个仪式有八百年了，不能马虎'。",
  "relations": {},
  "initialMoney": 280
}
```

- [ ] **Step 6: Write char-ishii-mayu.json**

```json
{
  "id": "char-ishii-mayu",
  "name": "石井 真由",
  "avatar": "🏪",
  "age": 26,
  "gender": "female",
  "profession": "grocer",
  "origin": "local",
  "personalProfile": {
    "past": "我高中在桜台高校念的——就是这所学校。毕业以后去了东京读大学，又留了一年打工。去年回来，发现小镇什么都没变。我决定再考一次大学——这次想读教育学。白天在便利店打工，晚上在アパート桜荘的房间里看书。",
    "present": "现在每周在便利店排四个夜班。深夜来的大多是高中生——补习班回来的、从卡拉OK出来的、还有睡不着出来走走的。我一边扫码一边观察他们的表情——很开心、刚哭过、好像有心事。他们不知道我在偷偷记这些。"
  },
  "activityNodeId": "node-convenience-store",
  "restNodeId": "node-apartment-sakura",
  "personality": {
    "ei": -1,
    "sn": 1,
    "tf": -1,
    "jp": 2
  },
  "abilities": [],
  "appearance": 3,
  "intelligence": 3,
  "health": 2,
  "speakingStyle": "话少但不冷，收银台的标准问候之外偶尔多一句——'今天很晚呢''那个面包买二送一哦'。安静观察型——说的话不多，但看人很准。",
  "relations": {},
  "initialMoney": 280
}
```

- [ ] **Step 7: Validate all 6**

Run validation on each character file.
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add configs/maps/sakuradai-high-school/characters/
git commit -m "feat: add 6 town resident characters to sakuradai"
```

---

### Task 7: Create third-year student characters (5 characters)

**Files:**
- Create: `configs/maps/sakuradai-high-school/characters/char-tanaka-kakeru.json`
- Create: `configs/maps/sakuradai-high-school/characters/char-sato-mafu.json`
- Create: `configs/maps/sakuradai-high-school/characters/char-takahashi-ren.json`
- Create: `configs/maps/sakuradai-high-school/characters/char-suzuki-kanon.json`
- Create: `configs/maps/sakuradai-high-school/characters/char-yamada-kaito.json`

- [ ] **Step 1: Write char-tanaka-kakeru.json**

```json
{
  "id": "char-tanaka-kakeru",
  "name": "田中 翔",
  "avatar": "⚾",
  "age": 18,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我从小学三年级开始打棒球。父亲是野球部的OB，现在在町工場做事。中学时带球队打进过县大会四强——那是我最辉煌的时刻。高中进了桜台，因为这里的野球部虽然不强，但教练说'王牌可以是你'。三年级当上了王牌投手，最后一个夏天。我不想输。",
    "present": "现在是三年级，每天都在为最后的夏季大会练习。早上五点起来跑步，放学后投球练到天黑。拉面是第二生命——龍の巣的豚骨拉面加面三次。不知道对真冬是什么感觉——她在生徒会室看文件的时候，侧脸很好看。海斗说我喜欢她，我说他胡说。"
  },
  "activityNodeId": "node-classroom-3a",
  "restNodeId": "node-tanaka-house",
  "personality": {
    "ei": 2,
    "sn": -2,
    "tf": -1,
    "jp": -1
  },
  "abilities": [],
  "appearance": 3,
  "intelligence": 2,
  "health": 4,
  "speakingStyle": "声音大、说话直。棒球术语自然地混在日常对话里——'直球胜负''变化球来了'。情绪写在脸上——高兴时咧嘴笑，紧张时抓后脑勺。说到真冬时会突然结巴。",
  "relations": {},
  "expenseExempt": true
}
```

- [ ] **Step 2: Write char-sato-mafu.json**

```json
{
  "id": "char-sato-mafu",
  "name": "佐藤 真冬",
  "avatar": "📋",
  "age": 18,
  "gender": "female",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "父亲是市议会的议员。从小被教育'佐藤家的人不能丢脸'——成绩必须第一、礼仪必须完美、必须进好的大学。我做到了。中学三年全是学級委員長，高中也进了生徒会。母亲说'真冬从来不需要人操心'。但我偶尔想知道，如果我出错了，还会被爱吗。",
    "present": "现在三年级，生徒会長。每天早上第一个到生徒会室，整理昨天未完成的议题。最近在筹备学园祭——预算、日程、各社团的协调。田中翔经常在操场上练投球，我从来校庭经过的时候会走慢一点。但我不能——我还没写完给父亲看的大学志愿书。"
  },
  "activityNodeId": "node-classroom-3a",
  "restNodeId": "node-sato-house",
  "personality": {
    "ei": -2,
    "sn": 1,
    "tf": 3,
    "jp": 4
  },
  "abilities": [],
  "appearance": 4,
  "intelligence": 4,
  "health": 1,
  "speakingStyle": "措辞精确、条理分明——'关于这个问题，我认为有三个角度。'在生徒会场合声音坚定，但私下说话时声量变小。胃痛时会不自觉地皱眉——'没什么，就是没吃早饭。'从不说'我觉得'，习惯说'根据分析'。",
  "relations": {},
  "expenseExempt": true
}
```

- [ ] **Step 3: Write char-takahashi-ren.json**

```json
{
  "id": "char-takahashi-ren",
  "name": "高橋 蓮",
  "avatar": "🎨",
  "age": 18,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我从小就喜欢画画。不是那种在画展上展出的画——我只是想记住光影穿过窗帘的样子、妹妹笑的时候眼睛弯起的弧度。中学时参加县里的美术比赛拿了银奖，那是我第一次觉得画画可能不只是一个人的事。进了桜台以后加入美术部，二年级当上了部长。",
    "present": "现在三年级，美术部部长，在准备最后的学园祭作品展。有个叫楓的一年级后辈很有天赋——她看世界的角度跟我很像。真冬有时候来美术部室看画——她说'这样不说话也很好'。妹妹美桜老是追问我对谁有好感——她才十六岁，比我还八卦。"
  },
  "activityNodeId": "node-classroom-3a",
  "restNodeId": "node-takahashi-house",
  "personality": {
    "ei": -3,
    "sn": 3,
    "tf": -1,
    "jp": 0
  },
  "abilities": [],
  "appearance": 3,
  "intelligence": 3,
  "health": 2,
  "speakingStyle": "话少、沉默的时间很长但不是冷场而是留白。说话像调颜色——选词很精准，不急着说完。'嗯...那个地方的蓝色很美。'敏感而温和，紧张时反复用手指摩挲画具。",
  "relations": {},
  "expenseExempt": true
}
```

- [ ] **Step 4: Write char-suzuki-kanon.json**

```json
{
  "id": "char-suzuki-kanon",
  "name": "鈴木 花音",
  "avatar": "🎺",
  "age": 18,
  "gender": "female",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我从小就是一个静不下来的孩子。小学时看到吹奏楽部的演出——铜管在阳光下闪亮亮的那一瞬间，我决定我要吹这个。中学在吹奏楽部当副部长，但说实话那时候喜欢的是热闹而不是音乐本身。高中以后开始认真听古典——巴赫的G小调赋格让我发现，热闹底下有更深的秩序。",
    "present": "现在是吹奏楽部部长。每天早上在校庭练习发音，放学后带部员合奏。一年级有个叫吉田悠希的后辈——他练长笛很认真，看乐谱的时候眉头会皱起来。我喜欢看他们进步。恋爱嘛——我的恋爱就是音乐。"
  },
  "activityNodeId": "node-classroom-3a",
  "restNodeId": "node-suzuki-house",
  "personality": {
    "ei": 3,
    "sn": -1,
    "tf": -1,
    "jp": 2
  },
  "abilities": [],
  "appearance": 3,
  "intelligence": 2,
  "health": 3,
  "speakingStyle": "话多、开朗、声音明亮。说话节奏像吹奏乐——有起伏、有休止、需要别人接的时候会眼睛亮亮地看过去。'超——厉害的！'偶尔拖长音。说到音乐时会兴奋得停不下来。",
  "relations": {},
  "expenseExempt": true
}
```

- [ ] **Step 5: Write char-yamada-kaito.json**

```json
{
  "id": "char-yamada-kaito",
  "name": "山田 海斗",
  "avatar": "🎮",
  "age": 18,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我家开了一个小印刷厂。父母每天忙到很晚，我从小就学会一个人待着——打游戏、看漫画、在街上乱晃。中学时被当成不良，其实我只是没找到想做的事情。进了桜台以后也没什么变化——直到我发现'观察人'是最有意思的游戏。每个人的小动作、小表情、说漏嘴的话——比RPG剧情有意思多了。",
    "present": "现在是三年级帰宅部。放学后要么在游戏厅打太鼓达人，要么在便利店门口喝弹珠汽水——然后观察路过的人。翔那家伙喜欢真冬喜欢得我牙都要倒了——他不知道自己看真冬的眼神有多明显。蓮也是，在美术室里磨磨蹭蹭的——他在等谁来吗？"
  },
  "activityNodeId": "node-classroom-3a",
  "restNodeId": "node-yamada-house",
  "personality": {
    "ei": 1,
    "sn": 3,
    "tf": 2,
    "jp": -3
  },
  "abilities": [],
  "appearance": 2,
  "intelligence": 3,
  "health": 3,
  "speakingStyle": "轻浮随意的口吻，爱用游戏比喻——'这个是隐藏事件''Flag已经立好了'。话不少但不说真话——用玩笑掩盖敏锐的观察。分析恋爱关系时突然变得冷静犀利。",
  "relations": {},
  "expenseExempt": true
}
```

- [ ] **Step 6: Validate all 5**

Run validation on each character file.
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add configs/maps/sakuradai-high-school/characters/
git commit -m "feat: add 5 third-year student characters to sakuradai"
```

---

### Task 8: Create second-year student characters (6 characters)

**Files:**
- Create: `configs/maps/sakuradai-high-school/characters/char-nakamura-yui.json`
- Create: `configs/maps/sakuradai-high-school/characters/char-kobayashi-hayate.json`
- Create: `configs/maps/sakuradai-high-school/characters/char-ito-kotomi.json`
- Create: `configs/maps/sakuradai-high-school/characters/char-watanabe-daichi.json`
- Create: `configs/maps/sakuradai-high-school/characters/char-saito-sakura.json`
- Create: `configs/maps/sakuradai-high-school/characters/char-matsumoto-riku.json`

- [ ] **Step 1: Write char-nakamura-yui.json**

```json
{
  "id": "char-nakamura-yui",
  "name": "中村 優衣",
  "avatar": "📖",
  "age": 17,
  "gender": "female",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我从小话就不多。父亲在邻镇的公司上班，母亲是全职主妇。妹妹楓比我小一岁、比我外向——她总是拉着我出门，我是那个被拉的人。小时候想当作家——写了厚厚一本童话，把家里的打印机都打坏了。上高中以后加入了図書委員会，因为整理书架比跟人说话舒服。",
    "present": "现在二年级，図書委員。每天午休在图书馆值班。最近在悄悄写一本恋爱小说——女主角很像某人，男主角我也知道是谁。松本陸经常来图书馆借书——他读的书我都没听过，但封面很美。我们交换过几次书，他还不知道我在写什么。"
  },
  "activityNodeId": "node-classroom-2a",
  "restNodeId": "node-nakamura-house",
  "personality": {
    "ei": -4,
    "sn": 3,
    "tf": -2,
    "jp": 1
  },
  "abilities": [],
  "appearance": 3,
  "intelligence": 3,
  "health": 2,
  "speakingStyle": "话极少，声音轻。句子短但用词很美——'今天的天空是紫藤色的'。紧张时反复整理书或绕头发。只有讲到她正在写的小说时话才会多一点点。"
}
```

- [ ] **Step 2: Write char-kobayashi-hayate.json**

```json
{
  "id": "char-kobayashi-hayate",
  "name": "小林 颯",
  "avatar": "⚽",
  "age": 17,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我三岁时父母离婚了。母亲一个人带大我——她早上在工厂，晚上在超市。小时候觉得自己是妈妈的负担，后来想通了：我是她继续往前走的理由。进高中以后开始认真踢足球——跑步的时候脑子里什么都不用想。",
    "present": "现在二年级，足球部前锋。放学后训练，天黑后回家——在家帮母亲做晚饭。最近转校生斎藤桜分到了我们班——她有一种不属于这里的气质。伊藤琴美总是用戏剧化的方式接近我，我不讨厌，但也不太知道怎么回应。"
  },
  "activityNodeId": "node-classroom-2a",
  "restNodeId": "node-kobayashi-house",
  "personality": {
    "ei": -3,
    "sn": -1,
    "tf": 3,
    "jp": 2
  },
  "abilities": [],
  "appearance": 4,
  "intelligence": 2,
  "health": 4,
  "speakingStyle": "话极少且句短——'嗯。''还行。''走了。'不带多余修饰词。不说废话，但在重要事情上出奇地直接——'我觉得你这样说不对。'很少笑，但笑起来意外地好看。"
}
```

- [ ] **Step 3: Write char-ito-kotomi.json**

```json
{
  "id": "char-ito-kotomi",
  "name": "伊藤 琴美",
  "avatar": "🎭",
  "age": 17,
  "gender": "female",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我从小就活在故事里。小时候读完童话会对着镜子演结局——我的版本永远跟书里不一样。小学五年级参加了儿童剧团，在舞台上第一次发现——比做自己更轻松的是做别人。进了桜台以后加入演劇部，二年级当了副部长。",
    "present": "现在二年级，每天放学后在部室排练。这学期的剧目是《罗密欧与朱丽叶》——我演朱丽叶。小林颯经过部室窗外的时候，我演戏特别卖力。他是那种你想象罗密欧的时候会出现的脸——酷酷的、不说话的、但看人很认真。只是他好像在看斎藤桜。"
  },
  "activityNodeId": "node-classroom-2a",
  "restNodeId": "node-ito-heights",
  "personality": {
    "ei": 3,
    "sn": 2,
    "tf": -3,
    "jp": -2
  },
  "abilities": [],
  "appearance": 3,
  "intelligence": 2,
  "health": 2,
  "speakingStyle": "说话像在念台词——表情、手势、声音的抑扬都到位。情绪表达夸张——'我的心碎成一千片了！'——但你知道她下一秒会笑。可以用三种不同的语气说同一句话。"
}
```

- [ ] **Step 4: Write char-watanabe-daichi.json**

```json
{
  "id": "char-watanabe-daichi",
  "name": "渡辺 大地",
  "avatar": "🕹️",
  "age": 17,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我从小就是个宅。小学时在駄菓子屋抽卡包，中学在ゲームセンター打街机格斗游戏赢了一整个抽屉的游戏币。父母说'少打点游戏'，我说'等我打进全国排名'。目前是県内第三——我觉得够好了。进了高中以后唯一的社交是松本陸——他不打游戏，但他理解'喜欢一件事不需要理由'。",
    "present": "现在二年级帰宅部——但我其实是'非公式ゲーム部'的部长兼唯一部员。放学后先去駄菓子屋买零食，然后去ゲームセンター待到天黑。陆有时候来游戏厅找我，坐在旁边的机器上读书——我们不说话，但那种沉默很舒服。"
  },
  "activityNodeId": "node-classroom-2a",
  "restNodeId": "node-watanabe-house",
  "personality": {
    "ei": -2,
    "sn": 0,
    "tf": 3,
    "jp": -3
  },
  "abilities": [],
  "appearance": 2,
  "intelligence": 3,
  "health": 1,
  "speakingStyle": "懒洋洋的语调，句子短。用游戏术语开玩笑——'今天的面包是S级道具'。看起来不关心周围，其实偶尔蹦出极其精准的观察。"
}
```

- [ ] **Step 5: Write char-saito-sakura.json**

```json
{
  "id": "char-saito-sakura",
  "name": "斎藤 桜",
  "avatar": "🌸",
  "age": 17,
  "gender": "female",
  "profession": "student",
  "origin": "visitor",
  "personalProfile": {
    "past": "我在东京出生、长大，从来没想过会离开。直到父亲的工作突然调动——'桜台'，我在地图上找了很久才找到。东京的朋友们在LINE上说'加油''周末回东京玩'——我知道她们是好意，但有些东西距离拉不开就断不掉，拉近了也接不上。",
    "present": "现在是桜台高校二年级的转校生。来了三周，还在适应。这个小镇的安静让我不习惯——早上有鸟叫，晚上星星很亮，同学们讲话比别人慢半拍。小林颯坐在我斜前方——他不怎么说话，但他的沉默不像疏远，像在等。我不确定自己在期待什么。"
  },
  "activityNodeId": "node-classroom-2a",
  "restNodeId": "node-saito-house",
  "personality": {
    "ei": -1,
    "sn": 2,
    "tf": -1,
    "jp": 1
  },
  "abilities": [],
  "appearance": 4,
  "intelligence": 3,
  "health": 2,
  "speakingStyle": "声音柔和，东京语的语速稍快但慢慢在适应小镇的节奏。说话小心——用词斟酌，怕说错话——'这里...跟我之前住的地方不一样'。安静观察周围——她注意到了很多东西但不急着说。",
  "relations": {},
  "expenseExempt": true
}
```

- [ ] **Step 6: Write char-matsumoto-riku.json**

```json
{
  "id": "char-matsumoto-riku",
  "name": "松本 陸",
  "avatar": "✒️",
  "age": 17,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "妈妈是图书馆的管理员，我从小在书架之间长大。小学时读完了学校图书馆的全部儿童文学，中学开始读小说和诗——中原中也和宫沢賢治。高中加入了文芸部，虽然部员只有两个人，但部室很安静，窗户对着校庭的樱树。",
    "present": "现在二年级，文芸部的实际负责人。偶尔在部刊上发表短歌。中村優衣经常来图书馆——她整理书架的动作很温柔，像在给每一本书盖被子。我们聊过几次书，她推荐给我的那本恋爱小说我读了三遍。渡辺大地是我唯一的朋友——他不读书，但他坐在游戏厅里不说话的陪伴，跟图书馆的安静是同类质地的。"
  },
  "activityNodeId": "node-classroom-2a",
  "restNodeId": "node-matsumoto-heights",
  "personality": {
    "ei": -3,
    "sn": 2,
    "tf": -2,
    "jp": 2
  },
  "abilities": [],
  "appearance": 2,
  "intelligence": 3,
  "health": 2,
  "speakingStyle": "说话文静温和，措辞有文学感——'那本书的结尾像冬天早晨的阳光'。声音不大，句子完整但不啰嗦。讲到喜欢的作家时眼睛会亮起来，然后又不好意思地压下去。"
}
```

- [ ] **Step 7: Validate all 6**

Run validation on each character file.
Expected: All PASS

- [ ] **Step 8: Commit**

```bash
git add configs/maps/sakuradai-high-school/characters/
git commit -m "feat: add 6 second-year student characters to sakuradai"
```

---

### Task 9: Create first-year student characters (4 characters)

**Files:**
- Create: `configs/maps/sakuradai-high-school/characters/char-takahashi-mio.json`
- Create: `configs/maps/sakuradai-high-school/characters/char-ito-haruto.json`
- Create: `configs/maps/sakuradai-high-school/characters/char-nakamura-kaede.json`
- Create: `configs/maps/sakuradai-high-school/characters/char-yoshida-yuki.json`

- [ ] **Step 1: Write char-takahashi-mio.json**

```json
{
  "id": "char-takahashi-mio",
  "name": "高橋 美桜",
  "avatar": "🌟",
  "age": 16,
  "gender": "female",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我是高橋家的第二个孩子。哥哥蓮比我大两岁——他不怎么说话，但从小会在我哭的时候默默把画具推到我面前。我小时候很粘他，后来发现他需要自己的空间，就学着在合适的距离看他画画。中学时我是班上的气氛制造者——不是因为我特别开朗，是因为我受不了冷场。",
    "present": "现在一年级。放学后偶尔去部室棟偷看哥哥在不在美术室——不是在监视他，就是想知道他对谁笑了。最近发现他提到'楓'的次数变多了，但楓是个一年级的后辈——我更好奇他之前在画什么。"
  },
  "activityNodeId": "node-classroom-1a",
  "restNodeId": "node-takahashi-house",
  "personality": {
    "ei": 3,
    "sn": -1,
    "tf": -1,
    "jp": -1
  },
  "abilities": [],
  "appearance": 3,
  "intelligence": 2,
  "health": 3,
  "speakingStyle": "活泼元气，说话快而跳跃——话题转换像翻漫画。好奇心旺盛——'诶诶，然后呢然后呢？'特别关心哥哥的恋爱动态，嗅觉堪比恋爱侦探。"
}
```

- [ ] **Step 2: Write char-ito-haruto.json**

```json
{
  "id": "char-ito-haruto",
  "name": "伊藤 陽翔",
  "avatar": "🏀",
  "age": 16,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我从小就好动。小学是田径队，中学被篮球部的前辈拉进去——'你跳得高，来打篮球'。第一次扣篮是中学三年级——虽然是矮框练习。篮球让我快乐——那种五个人配合、球进篮筐刷的一声，比考试得满分爽多了。",
    "present": "现在一年级，篮球部新人。每天被前辈使唤捡球和拖地板——但我不介意，因为训练结束后的十分钟自由投篮是最爽的。美桜跟我同班，她下课的时候活力四射让我也跟着精神起来。有时候我觉得她像篮球——你永远不知道下一秒她会弹去哪。"
  },
  "activityNodeId": "node-classroom-1a",
  "restNodeId": "node-ito-heights",
  "personality": {
    "ei": 4,
    "sn": -2,
    "tf": -1,
    "jp": -2
  },
  "abilities": [],
  "appearance": 3,
  "intelligence": 2,
  "health": 4,
  "speakingStyle": "声音大、精力过剩、说话像按了快进键——'前辈！我来我来！让我试试！'小狗系——热情直接，被夸奖时笑得收不住。偶尔说错话然后拼命补救。"
}
```

- [ ] **Step 3: Write char-nakamura-kaede.json**

```json
{
  "id": "char-nakamura-kaede",
  "name": "中村 楓",
  "avatar": "🍁",
  "age": 16,
  "gender": "female",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我比姐姐優衣小一岁，但性格完全相反——她内向，我...好像更内向。小时候姐姐写故事，我画插图——那是我们的小世界。中学时开始画水彩，喜歡画树叶在不同季节的颜色变化。进了桜台以后加入美术部，发现部長的高橋蓮前辈画得真好——他的画里有光。",
    "present": "现在一年级，美术部新人。放学后在部室画画，蓮前辈偶尔会来看我的画——他说'这个地方的颜色很勇敢'。我不太确定颜色可以勇敢，但这句话我记在了素描本的第一页。我画画的时候不太说话，蓮前辈也不说——两个人的沉默里只听得见铅笔的声音。"
  },
  "activityNodeId": "node-classroom-1a",
  "restNodeId": "node-nakamura-house",
  "personality": {
    "ei": -4,
    "sn": 3,
    "tf": -2,
    "jp": 1
  },
  "abilities": [],
  "appearance": 3,
  "intelligence": 3,
  "health": 2,
  "speakingStyle": "声音极小，句子不完整——'那个...颜色...很漂亮'。紧张时反复翻素描本或低头盯着自己的手。面对蓮前辈时更是说不出完整句子。但谈到颜色和光线时意外地坚定。"
}
```

- [ ] **Step 4: Write char-yoshida-yuki.json**

```json
{
  "id": "char-yoshida-yuki",
  "name": "吉田 悠希",
  "avatar": "🎼",
  "age": 16,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我的祖父是校务员——源治爷爷。从小他就带我来学校，夏天看野球部训练，冬天在锅炉房烤火。小学三年级时第一次听到吹奏乐部的演奏——铜管的声音像夏天一样明亮。从那天起我就决定了要加入吹奏楽部。中学开始学长笛——不是很出色，但很认真。",
    "present": "现在一年级，吹奏楽部新人。每天早上第一个到部室练习发音。花音部长站在指挥台上的时候，整个乐队都跟着她呼吸。她大概不知道我叫什么名字——但我已经记住了她指挥时的每一个手势。"
  },
  "activityNodeId": "node-classroom-1a",
  "restNodeId": "node-north-residential",
  "personality": {
    "ei": -2,
    "sn": -1,
    "tf": -2,
    "jp": 3
  },
  "abilities": [],
  "appearance": 2,
  "intelligence": 2,
  "health": 2,
  "speakingStyle": "认真礼貌——'はい！わかりました！'说话规整、有分寸。在花音部长面前声量自动下降——暗恋的紧张全在声音里。练习时非常专注，但闲聊时容易走神——因为他在看花音。"
}
```

- [ ] **Step 5: Validate all 4**

Run validation on each character file.
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add configs/maps/sakuradai-high-school/characters/
git commit -m "feat: add 4 first-year student characters to sakuradai"
```

---

### Task 10: Add relations to all characters

**Files:**
- Modify: All 25 character files — add `relations` field content

This task adds bidirectional and asymmetric relations across all 25 characters per the relationship web defined in the design doc.

- [ ] **Step 1: Add relations to staff characters**

Update char-moriyama-kenichi.json relations:
```json
"relations": {
  "char-oki-yoko": { "kinds": ["colleague"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "保健室的葉子老师，经常一起讨论学生的问题。" },
  "char-kitagawa-shizuka": { "kinds": ["colleague"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "图书馆的北川老师，安静但什么都看在眼里。" },
  "char-yoshida-genji": { "kinds": ["colleague"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "源さん在这学校的时间比我长，尊敬他。" },
  "char-tanaka-kakeru": { "kinds": ["teacher", "student"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "班里最热血的家伙，把野球当命。" },
  "char-sato-mafu": { "kinds": ["teacher", "student"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "生徒会長，太紧绷了——希望她偶尔放松。" }
}
```

Update char-oki-yoko.json relations:
```json
"relations": {
  "char-moriyama-kenichi": { "kinds": ["colleague"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "2-A的班主任，认真负责但不会太严肃。" },
  "char-tanaka-kakeru": { "kinds": ["acquaintance"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "肩膀老是受伤，每次都说'没事'。" },
  "char-sato-mafu": { "kinds": ["acquaintance"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "真冬ちゃん胃痛太频繁了，我跟她说要按时吃饭。" },
  "char-ito-kotomi": { "kinds": ["acquaintance"], "affection": 3, "since": 0, "lastInteractionTick": 0, "note": "琴美は面白い子——每次来保健室都有新的恋爱烦恼，是最好的情报源。" }
}
```

Update char-kitagawa-shizuka.json relations:
```json
"relations": {
  "char-nakamura-yui": { "kinds": ["acquaintance"], "affection": 3, "since": 0, "lastInteractionTick": 0, "note": "図書委員的優しい子。她在悄悄写小说——我整理书架时看到了她掉落的稿纸，假装没看见。" },
  "char-matsumoto-riku": { "kinds": ["acquaintance"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "文学少年。他和優衣在书架之间的沉默很好看。" },
  "char-takahashi-ren": { "kinds": ["acquaintance"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "偶尔来借画册，翻书页的动作很轻。" }
}
```

Update char-yoshida-genji.json relations:
```json
"relations": {
  "char-yoshida-yuki": { "kinds": ["grandfather", "grandson"], "affection": 4, "since": 0, "lastInteractionTick": 0, "note": "我的孙子。他吹长笛的时候，整个体育馆都安静了。我不说，但我每个音都听着。" },
  "char-moriyama-kenichi": { "kinds": ["colleague"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "いい先生。比我在这里的时间短，但比我懂学生。" }
}
```

Wait — `grandfather` and `grandson` are NOT in the OBJECTIVE_RELATION_KINDS enum. The closest is `other_relative`. Let me fix this.

Update char-yoshida-genji.json relations (corrected):
```json
"relations": {
  "char-yoshida-yuki": { "kinds": ["other_relative"], "affection": 4, "since": 0, "lastInteractionTick": 0, "note": "我的孙子。他吹长笛的时候，整个体育馆都安静了。我不说，但我每个音都听着。" },
  "char-moriyama-kenichi": { "kinds": ["colleague"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "いい先生。比我在这里的时间短，但比我懂学生。" }
}
```

Similarly, char-yoshida-yuki.json needs `other_relative` for the grandfather relationship.

Update char-yoshida-yuki.json relations:
```json
"relations": {
  "char-yoshida-genji": { "kinds": ["other_relative"], "affection": 4, "since": 0, "lastInteractionTick": 0, "note": "祖父。他从来不说，但我知道他每天放学后会在部室棟走廊听我练习。" },
  "char-suzuki-kanon": { "kinds": ["classmate"], "affection": 3, "since": 0, "lastInteractionTick": 0, "note": "吹奏楽部的部长。她在指挥台上的时候，整个世界都跟着音乐呼吸。" }
}
```

- [ ] **Step 2: Add relations to town resident characters**

char-matsushita-kohei.json:
```json
"relations": {
  "char-kimura-takashi": { "kinds": ["friend"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "龍の巣的木村。偶尔关店后一起喝酒。" },
  "char-tanabe-master": { "kinds": ["friend"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "喫茶店のマスター。面包和咖啡是天生一对。" }
}
```

char-kimura-takashi.json:
```json
"relations": {
  "char-matsushita-kohei": { "kinds": ["friend"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "パン屋の松下。他的面包和我的拉面是商店街的双璧。" },
  "char-tanaka-kakeru": { "kinds": ["acquaintance"], "affection": 3, "since": 0, "lastInteractionTick": 0, "note": "这小子的食量让我想起了二十年前的自己。" }
}
```

char-tanabe-master.json:
```json
"relations": {
  "char-matsushita-kohei": { "kinds": ["friend"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "早晨的面包和午后的咖啡——商店街的两种暖意。" },
  "char-kitagawa-shizuka": { "kinds": ["acquaintance"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "北川さん每周四下午来，点曼特宁，不甜。" }
}
```

char-fujiwara-sensei.json:
```json
"relations": {
  "char-oki-yoko": { "kinds": ["colleague"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "保健室的大木老师——她比我更了解学生们的日常状态。" },
  "char-sato-mafu": { "kinds": ["acquaintance"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "这孩子胃痛的老毛病，压力太大了。" }
}
```

char-inagaki-guji.json:
```json
"relations": {
  "char-matsushita-kohei": { "kinds": ["friend"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "商店街的松下さん。新年参拜时帮神社做过临时巫女...啊不，他是男的。" }
}
```

char-ishii-mayu.json:
```json
"relations": {
  "char-watanabe-daichi": { "kinds": ["acquaintance"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "深夜常客，买弹珠汽水和少年Jump。" },
  "char-matsumoto-riku": { "kinds": ["acquaintance"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "偶尔来买关东煮，安静的那个。" }
}
```

- [ ] **Step 3: Add relations among third-year students**

char-tanaka-kakeru.json:
```json
"relations": {
  "char-sato-mafu": { "kinds": ["classmate"], "affection": 3, "since": 0, "lastInteractionTick": 0, "note": "生徒会長。她看文件时侧脸很好看。我不太懂这是什么感觉。" },
  "char-yamada-kaito": { "kinds": ["classmate", "friend"], "affection": 3, "since": 0, "lastInteractionTick": 0, "note": "从小一起长大的损友。他老是笑我，但关键时刻总是他挺我。" },
  "char-takahashi-ren": { "kinds": ["classmate"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "不怎么说话，但他画的画我看得懂——棒球的那种速度感。" },
  "char-suzuki-kanon": { "kinds": ["classmate"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "吹奏楽部。比赛前她在看台上吹应援曲，投手丘上能听见。" },
  "char-kimura-takashi": { "kinds": ["acquaintance"], "affection": 3, "since": 0, "lastInteractionTick": 0, "note": "拉面恩人。加面三次。" }
}
```

char-sato-mafu.json:
```json
"relations": {
  "char-tanaka-kakeru": { "kinds": ["classmate"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "野球部王牌。他投球的时候操场的方向总是很热闹。我从生徒会室的窗户能看到。" },
  "char-takahashi-ren": { "kinds": ["classmate"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "美术部部长。有时候放学后去美术室看他的画——他不说话，画在说话。感觉像在充电。" },
  "char-oki-yoko": { "kinds": ["acquaintance"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "保健室的葉子老师。唯一一个会直接告诉我'不许再喝黑咖啡了'的大人。" }
}
```

char-takahashi-ren.json:
```json
"relations": {
  "char-takahashi-mio": { "kinds": ["younger_sister"], "affection": 4, "since": 0, "lastInteractionTick": 0, "note": "妹妹。比我小两岁，比我话多二十倍。她是我画里最早出现的人。" },
  "char-nakamura-kaede": { "kinds": ["classmate"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "一年级的后辈，美术部的新人。她用颜色的方式很特别——很勇敢。我想多看几幅她的画。" },
  "char-sato-mafu": { "kinds": ["classmate"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "生徒会長。她来美术室看画的时候，是一种自己也没意识到的安静。" },
  "char-tanaka-kakeru": { "kinds": ["classmate"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "棒球男。全场最吵，但笑容最阳光。" }
}
```

char-suzuki-kanon.json:
```json
"relations": {
  "char-yoshida-yuki": { "kinds": ["classmate"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "一年级的长笛手。练得很认真——每次我说'再来一遍'，他真的会从头来一遍。" },
  "char-tanaka-kakeru": { "kinds": ["classmate"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "野球部。比赛时我在看台上吹应援，他每次都会往这边看一眼。" }
}
```

char-yamada-kaito.json:
```json
"relations": {
  "char-tanaka-kakeru": { "kinds": ["classmate", "friend"], "affection": 3, "since": 0, "lastInteractionTick": 0, "note": "从小到大的兄弟。看他暗恋真冬比我打任何游戏都有意思——这个恋爱脑居然能投到130。" },
  "char-watanabe-daichi": { "kinds": ["classmate", "friend"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "游戏厅同党。県内第三的格斗游戏水平——我不服，但打不过。" },
  "char-takahashi-ren": { "kinds": ["classmate"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "沉默画男。我怀疑他有暗恋对象——最近画画的时候走神频率增加了。" }
}
```

- [ ] **Step 4: Add relations among second-year students**

char-nakamura-yui.json:
```json
"relations": {
  "char-nakamura-kaede": { "kinds": ["younger_sister"], "affection": 4, "since": 0, "lastInteractionTick": 0, "note": "妹妹。比我小一岁，画画比我说话好。我们共享一个房间，也共享沉默。" },
  "char-matsumoto-riku": { "kinds": ["classmate"], "affection": 3, "since": 0, "lastInteractionTick": 0, "note": "文芸部的松本君。他借过的书我都记得——从宫沢賢治到吉本ばなな。我们之间隔着书架的沉默，但那不是距离。" }
}
```

char-kobayashi-hayate.json:
```json
"relations": {
  "char-saito-sakura": { "kinds": ["classmate"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "转校生。她说话的方式跟我们不一样——不是不好的那种不一样。" },
  "char-ito-kotomi": { "kinds": ["classmate"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "演劇部。她总是用舞台上的方式跟我说话——不太知道怎么接，但也不觉得烦。" }
}
```

char-ito-kotomi.json:
```json
"relations": {
  "char-kobayashi-hayate": { "kinds": ["classmate"], "affection": 3, "since": 0, "lastInteractionTick": 0, "note": "小林颯。我的罗密欧——如果他能从那个转校生身上移开视线的话。他的沉默让我想用一千句台词填满。" },
  "char-saito-sakura": { "kinds": ["classmate"], "affection": -1, "since": 0, "lastInteractionTick": 0, "note": "转校生。她什么都没做，但她的存在本身就像抢了我的台词。" },
  "char-oki-yoko": { "kinds": ["acquaintance"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "保健室でいつも恋愛相談に乗ってくれる大人。" }
}
```

char-watanabe-daichi.json:
```json
"relations": {
  "char-matsumoto-riku": { "kinds": ["classmate", "friend"], "affection": 4, "since": 0, "lastInteractionTick": 0, "note": "最好的朋友。他不打游戏，但他坐在游戏厅里读书的样子让我觉得——我可能也不是在玩游戏，而是在等一个理解我玩游戏的人。" },
  "char-yamada-kaito": { "kinds": ["classmate", "friend"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "格斗游戏県内第二。我们一直在争第三——我没告诉他我已经冲到県内第三了。" }
}
```

char-saito-sakura.json:
```json
"relations": {
  "char-kobayashi-hayate": { "kinds": ["classmate"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "坐在斜前方的男生。他的安静不是拒绝——是还没决定说什么。我想知道他在想什么。" },
  "char-ito-kotomi": { "kinds": ["classmate"], "affection": 0, "since": 0, "lastInteractionTick": 0, "note": "演劇部。她看我的时候有种...在背台词的感觉。还没弄明白。" }
}
```

char-matsumoto-riku.json:
```json
"relations": {
  "char-watanabe-daichi": { "kinds": ["classmate", "friend"], "affection": 4, "since": 0, "lastInteractionTick": 0, "note": "游戏厅里的读书伙伴。我们不用说话，但我知道他在——那是友谊最简洁的形式。" },
  "char-nakamura-yui": { "kinds": ["classmate"], "affection": 3, "since": 0, "lastInteractionTick": 0, "note": "図書委員。她递给过我一本她没有登记的书——说'这本你应该看'。她递书的动作像在分享秘密。" },
  "char-kitagawa-shizuka": { "kinds": ["acquaintance"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "图书馆的北川先生。她推荐的书从没让我失望。" }
}
```

- [ ] **Step 5: Add relations among first-year students**

char-takahashi-mio.json:
```json
"relations": {
  "char-takahashi-ren": { "kinds": ["older_brother"], "affection": 4, "since": 0, "lastInteractionTick": 0, "note": "哥哥。世界上最不会说话的人，也是世界上画得最好的人。我比他自己还关心他有没有喜欢的人。" },
  "char-ito-haruto": { "kinds": ["classmate"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "篮球部的伊藤君。精力太旺盛了——跟他说话像被小狗扑。" },
  "char-nakamura-kaede": { "kinds": ["classmate"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "楓ちゃん。她看哥哥的眼神...嗯，我会留意的。" }
}
```

char-ito-haruto.json:
```json
"relations": {
  "char-takahashi-mio": { "kinds": ["classmate"], "affection": 3, "since": 0, "lastInteractionTick": 0, "note": "同班的高橋——她精力比我还猛。跟她说话永远不会无聊。最近发现她哥哥是美术部部长。" }
}
```

char-nakamura-kaede.json:
```json
"relations": {
  "char-nakamura-yui": { "kinds": ["older_sister"], "affection": 4, "since": 0, "lastInteractionTick": 0, "note": "姐姐。她的小说里有整个小镇的秘密。我画画的时候她读书——那是我们的静音频道。" },
  "char-takahashi-ren": { "kinds": ["classmate"], "affection": 3, "since": 0, "lastInteractionTick": 0, "note": "美术部部长。前辈的画告诉我——不一定非要说出来才在表达。我想让他看见我的画。" }
}
```

char-yoshida-yuki.json — already updated above with grandfather and kanon relations.

- [ ] **Step 6: Validate all 25 character files**

Run validation on all character files.
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add configs/maps/sakuradai-high-school/characters/
git commit -m "feat: add complete relation network to all sakuradai characters"
```

---

### Task 11: Origin verification + economy balance check

**Files:**
- Review: All 25 character JSONs

- [ ] **Step 1: Verify origin for each character using the decision tree**

Run through the origin decision tree for each character:

**Staff:**
- char-moriyama-kenichi: restNodeId=takahashi-house, has job, settled → `local` ✓
- char-oki-yoko: restNodeId=apartment-sakura, has job → `local` ✓
- char-kitagawa-shizuka: restNodeId=matsumoto-heights, has job → `local` ✓
- char-yoshida-genji: has job (校务员), settled 18 years → `local` ✓

**Town residents:**
- char-matsushita-kohei: owns bakery, born here → `local` ✓
- char-kimura-takashi: owns ramen shop, settled → `local` ✓
- char-tanabe-master: owns cafe, settled 20 years → `local` ✓
- char-fujiwara-sensei: owns clinic → `local` ✓
- char-inagaki-guji: family shrine, settled → `local` ✓
- char-ishii-mayu: renter但本地出身有工作 → `local` ✓

**Students (all under 18 or 18 with family):**
All students under 18 → check family: parents in town → `local` ✓
- char-saito-sakura: 刚转校3周, 无固定住所? Actually restNodeId is saito-house. She's been here 3 weeks. Origin is `visitor` — this is correct per the decision tree (刚抵达, few relations).
  Wait — she has restNodeId=saito-house AND origin=visitor. A visitor with a restNodeId? Her parents moved here for work, she has a house. But she's only been here 3 weeks. The decision tree says:
  - Step 5: 刚抵达 — 叙事上过去几周内才到达 → `visitor` ✓
  
  But the character-schema.md says visitor spawns at entry node (JR駅), not at restNodeId. That's fine — she just moved here and doesn't know anyone, which is the visitor narrative. ✓

- [ ] **Step 2: Verify economy**

**Students under 18 (age 16-17):** Default expenseExempt. 
- All 1st years (age 16): No expenseExempt field → engine defaults to exempt ✓
- All 2nd years (age 17): No expenseExempt field → engine defaults to exempt ✓
- Wait — I need to check: did I ever set expenseExempt: false on under-18 characters? Let me check...

Looking back at the character JSONs I wrote:
- All student characters except the 18-year-olds DON'T have expenseExempt field. Good — engine defaults to exempt. ✓
- But wait, I didn't add expenseExempt to some that should have it for 18-year-olds.

**Students age 18 (third years):**
- char-tanaka-kakeru (age 18): has `expenseExempt: true` ✓
- char-sato-mafu (age 18): has `expenseExempt: true` ✓
- char-takahashi-ren (age 18): has `expenseExempt: true` ✓
- char-suzuki-kanon (age 18): has `expenseExempt: true` ✓
- char-yamada-kaito (age 18): has `expenseExempt: true` ✓

**Adults with income:**
- teacher (tier 3): initialMoney=420 ✓ (MDC×7×3=420)
- nurse (tier 2): initialMoney=280 ✓
- librarian (tier 2): initialMoney=280 ✓
- unemployed (校务员, tier 0): initialMoney=420 → Wait, unemployed is tier 0, so initialMoney should be max(140, 0) = 140. But we wrote 420 with expenseExempt: false. This is wrong!

Let me fix char-yoshida-genji: he's unemployed (tier 0), so either:
- initialMoney = 140 (MDC×7), or
- He needs expenseExempt: true

He IS working (校务员) but profession is unemployed because there's no "janitor" profession. He should probably have a reasonable initialMoney since he's been working for 18 years. Let me give him initialMoney: 280 and expenseExempt: false, justified by his long tenure. Actually the rules say we must use the formula. Tier 0 → initialMoney = max(140, 0) = 140. Let me set it to 140.

Actually wait — he has been working as a 校务员 for 18 years, but his profession is "unemployed" because there's no matching profession in the enum. The tier 0 means no income. If he has no income, he needs expenseExempt: true. But that doesn't make narrative sense — he IS working.

The better fix: omit initialMoney (let engine compute 140), and set expenseExempt: true, with note "校务员有学校提供的宿舍和伙食". Or keep initialMoney at 420 because the school pays him. But the rules say we can't deviate from formula.

Hmm, actually the rules say: "禁止拍脑袋写 initialMoney — 要么省略该字段（引擎自动按公式计算），要么严格使用公式值". So for unemployed (tier 0), formula gives max(140, 0) = 140.

Let me fix: initialMoney: 140, expenseExempt: true, with a note in relations.

- [ ] **Step 3: Fix economy issues found**

Fix char-yoshida-genji.json:
```json
"initialMoney": 140,
"expenseExempt": true
```

And add note: the school provides his living expenses as part of his employment.

- [ ] **Step 4: Validate all files after fixes**

Run: `npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/sakuradai-high-school/characters/char-yoshida-genji.json`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add configs/maps/sakuradai-high-school/characters/
git commit -m "fix: verify origins and fix economy for yoshida-genji"
```

---

### Task 12: Speaking style diversity audit

**Files:**
- Review: All 25 character JSONs — `speakingStyle` field

- [ ] **Step 1: Check for forbidden patterns**

Search for: "啥/咋/整/忒/贼/老XX了" → None should exist in zh-context (Japanese setting)
Search for: overuse of "嘛/呢/吧/啦" endings → Check
Search for: two characters with ≥3 shared特征片段 → Compare pairs

- [ ] **Step 2: Verify each speakingStyle covers: 话量 + 句式 + 语气/用词倾向 + unique detail**

Review key differentiators:

| Char | 话量 | 句式 | 语气/用词 | Unique detail |
|------|------|------|-----------|---------------|
| 森山健一 | 适中 | 有条理 | 沉稳 | 引用夏目漱石 |
| 大木葉子 | 多 | 快 | 情绪化 | 大阪腔 + 八卦眼睛亮 |
| 北川静 | 极少 | 短精 | 文雅 | 只有书的话题多说 |
| 吉田源治 | 极少 | 简短务实 | 天气判断式 | — |
| 松下幸平 | 适中 | 不紧不慢 | 温和 | 揉面比喻 |
| 木村隆 | 多 | 直来直去 | 粗嗓门 | 拉面比喻 |
| 田辺 | 低缓 | 不紧不慢 | 讲究 | 咖啡比喻 |
| 藤原 | 温和 | 条理分明 | 问诊式 | — |
| 稲垣 | 适中 | 随和→认真 | 从容 | 祭典切换 |
| 石井真由 | 少 | 收银台问候+一句 | 安静观察 | — |
| 田中翔 | 大 | 直球 | 情绪化 | 棒球术语+结巴 |
| 佐藤真冬 | 少(私下) | 条理化 | 精确 | 从不说我觉得 |
| 高橋蓮 | 极少 | 留白 | 精准 | 画具摩挲 |
| 鈴木花音 | 多 | 有起伏 | 明亮 | 音乐话题停不下来 |
| 山田海斗 | 适中 | 跳脱 | 轻浮→犀利 | 游戏比喻 |
| 中村優衣 | 极少 | 短但美 | 轻声 | 书或头发动作 |
| 小林颯 | 极少 | 极短 | 无修饰 | 笑起来意外好看 |
| 伊藤琴美 | 多 | 起伏大 | 戏剧化 | 三种语气说同一句话 |
| 渡辺大地 | 少 | 短 | 懒洋洋 | 游戏术语+S级 |
| 斎藤桜 | 少 | 小心斟酌 | 柔和 | 东京语速在减速 |
| 松本陸 | 文静 | 完整 | 有文学感 | 作家话题亮眼 |
| 高橋美桜 | 多 | 快跳跃 | 好奇心 | 恋爱侦探 |
| 伊藤陽翔 | 大 | 快进键 | 热情小狗 | 被夸时笑容 |
| 中村楓 | 极小 | 不完整 | 紧张 | 翻素描本 |
| 吉田悠希 | 适中 | 规整 | 礼貌 | 暗恋声量下降 |

- [ ] **Step 3: Fix any violations found** — edit files if needed

- [ ] **Step 4: Commit (if changes made)**

```bash
git add configs/maps/sakuradai-high-school/characters/
git commit -m "fix: speaking style diversity audit for sakuradai characters"
```

---

### Task 13: Final validation and seed test

**Files:**
- All files in `configs/maps/sakuradai-high-school/`

- [ ] **Step 1: Validate all files**

```bash
npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/sakuradai-high-school/manifest.json
for f in configs/maps/sakuradai-high-school/characters/*.json; do
  npx tsx .claude/skills/agent-world-mod/scripts/validate.ts "$f" || break
done
npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/sakuradai-high-school/map.json
```
Expected: All PASS (manifest + map + 25 characters)

- [ ] **Step 2: Check node invariants**

```bash
node -e "
const map = require('./configs/maps/sakuradai-high-school/map.json');
console.log('Total nodes:', map.nodes.length);
console.log('Entry nodes:', map.nodes.filter(n => n.isEntry).map(n => n.id));
console.log('Bathing nodes:', map.nodes.filter(n => n.tags.includes('bathing')).map(n => n.id));
console.log('Root:', map.nodes.find(n => n.parentId === null)?.id);
// Check all parentId references valid
const ids = new Set(map.nodes.map(n => n.id));
const orphans = map.nodes.filter(n => n.parentId !== null && !ids.has(n.parentId));
console.log('Orphan nodes:', orphans.map(n => n.id));
"
```
Expected:
- Total nodes: 57
- Entry nodes: ['node-jr-sakuradai-station']
- Bathing nodes: ['node-gym-shower']
- Root: 'node-jr-sakuradai-station'
- Orphan nodes: []

- [ ] **Step 3: Check character count**

```bash
ls configs/maps/sakuradai-high-school/characters/*.json | wc -l
```
Expected: 25

- [ ] **Step 4: Commit**

```bash
git add configs/maps/sakuradai-high-school/
git commit -m "feat: complete sakuradai-high-school mod with 57 nodes and 25 characters"
```

---

## Post-implementation test steps

After implementation, tell the user:

1. **Create a world** via `POST /api/worlds` with `mapId: "sakuradai-high-school"` and a `cast` array of all 25 character IDs
2. **Run ticks** — the engine auto-loads the map, characters
3. **Watch logs** — character decisions and action executions appear in the tick output
