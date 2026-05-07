# Sakurano-Miya Mod Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `sakurano-miya` mod — a Japanese-style school romance world with ~57 nodes, 13 characters, 12 custom actions, and 10 seasonal events.

**Architecture:** Pure config-file creation under `configs/maps/sakurano-miya/`. No engine code changes. All files validated against Zod schemas via `validate.ts`. Reuses 3 intimate actions (kiss/caress/hug) from `sakuraba-academy/actions.js`.

**Tech Stack:** JSON configs (map, manifest, events), CommonJS JS (actions), Zod validation via `npx tsx`.

---

### Task 1: Create directory structure and manifest.json

**Files:**
- Create: `configs/maps/sakurano-miya/manifest.json`
- Create: `configs/maps/sakurano-miya/characters/` (directory)

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p configs/maps/sakurano-miya/characters
```

- [ ] **Step 2: Write manifest.json**

Write `configs/maps/sakurano-miya/manifest.json`:
```jsonc
{
  "id": "sakurano-miya",
  "name": "樱ノ宫",
  "description": "丘陵地带的学园小镇。高中与大学共享一片樱花丘陵，商店街、河边道、神社——人与人之间早已相互认识。春天，百年垂樱满开，新的相遇在旧的羁绊中萌芽。",
  "language": "zh",
  "startDate": "2026-04-07T08:00:00",
  "actions": "actions.js",
  "events": "events.json"
}
```

- [ ] **Step 3: Validate manifest**

```bash
npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/sakurano-miya/manifest.json
```
Expected: `✓ configs/maps/sakurano-miya/manifest.json passes ManifestSchema`

- [ ] **Step 4: Commit**

```bash
git add configs/maps/sakurano-miya/manifest.json
git commit -m "feat: add sakurano-miya manifest and directory structure"
```

---

### Task 2: Write map.json (~57 nodes)

**Files:**
- Create: `configs/maps/sakurano-miya/map.json`

**Spec:** MapConfigSchema validates `{ id, nodes[] }`. Nodes must have unique ids, exactly 1 root (parentId: null), ≥1 isEntry, ≥1 bathing tag, all parentIds resolve within file.

- [ ] **Step 1: Write the complete map.json**

Write `configs/maps/sakurano-miya/map.json` (content below — 57 nodes across 4 districts plus root):

```json
{
  "id": "sakurano-miya",
  "nodes": [
    {
      "id": "node-sakurano-hill",
      "parentId": null,
      "name": "樱ノ宫丘陵",
      "description": "樱ノ宫地区的最高点。一棵树龄近百年的垂樱伫立在丘陵顶端，枝条如瀑布般垂落，四月满开时全镇可望见这片淡粉色。丘陵南侧是高中，东侧是大学，北麓是小镇，西侧延伸向河边和后山。",
      "tags": ["public", "outdoor", "park"],
      "capacity": null,
      "privacy": "public",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 0, "y": 0, "w": 36, "h": 30,
      "spriteKey": "park"
    },
    {
      "id": "node-gate",
      "parentId": "node-sakurano-hill",
      "name": "高中正门",
      "description": "私立樱ノ宫高中的正门。两扇铁制校门上方是写着「私立桜ノ宮高等学校」的拱形看板。门柱两侧石墙上爬满常春藤。四月开学季，樱花花瓣飘过门柱，落在通学路的水泥地上。",
      "tags": ["public", "outdoor", "street"],
      "capacity": 20,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": ["node-station", "node-shrine-entrance"],
      "isEntry": true,
      "travelCost": 0,
      "x": 0, "y": 0, "w": 4, "h": 2,
      "spriteKey": "school"
    },
    {
      "id": "node-hs-main",
      "parentId": "node-sakurano-hill",
      "name": "高中本馆",
      "description": "四层米白色建筑，正门上方挂着「自主自律」的校训匾额。一楼走廊宽敞，揭示板上贴满了部活海报和进路情报。三楼窗口能望见丘陵上的垂樱。",
      "tags": ["semi", "indoor"],
      "capacity": 150,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 0, "y": 3, "w": 10, "h": 6,
      "spriteKey": "school"
    },
    {
      "id": "node-hs-3-1",
      "parentId": "node-hs-main",
      "name": "高中3年教室",
      "description": "三楼的教室，窗外正对中庭的樱树。黑板右上角写着高考倒计时。陽翔的座位靠窗倒数第二排，真昼在他斜前方靠窗。",
      "tags": ["semi", "indoor", "education"],
      "capacity": 30,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 0, "y": 0, "w": 3, "h": 2,
      "spriteKey": "classroom"
    },
    {
      "id": "node-hs-2-1",
      "parentId": "node-hs-main",
      "name": "高中2年教室",
      "description": "二楼的教室。悠斗的座位靠走廊侧，桌上摞着物理参考书和计算纸。千夏坐他前面三排靠窗——她上课时偶尔回头偷看他在写什么。",
      "tags": ["semi", "indoor", "education"],
      "capacity": 30,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 0, "y": 2, "w": 3, "h": 2,
      "spriteKey": "classroom"
    },
    {
      "id": "node-hs-1-1",
      "parentId": "node-hs-main",
      "name": "高中1年教室",
      "description": "一楼的教室。小春坐在中间偏前，课本下偶尔压着从图书馆借的漫画。優翔坐最后排靠门——这个位置最方便下课后第一个冲到操场。",
      "tags": ["semi", "indoor", "education"],
      "capacity": 30,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 0, "y": 4, "w": 3, "h": 2,
      "spriteKey": "classroom"
    },
    {
      "id": "node-hs-staff",
      "parentId": "node-hs-main",
      "name": "高中教员室",
      "description": "一楼走廊尽头的教员室。班主任们的办公桌分布其间，桌上摞着试卷、教学笔记和学生的进路面谈记录。窗外能看见中庭的樱树。",
      "tags": ["semi", "indoor"],
      "capacity": 15,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 7, "y": 5, "w": 3, "h": 2,
      "spriteKey": "school"
    },
    {
      "id": "node-special-building",
      "parentId": "node-sakurano-hill",
      "name": "特别栋",
      "description": "三层特别教室楼。音乐室的钢琴声、美术室的炭笔沙沙声、理科室的试管碰撞声、放送室的午间广播——各层各有自己的频率。",
      "tags": ["semi", "indoor"],
      "capacity": 80,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 12, "y": 3, "w": 5, "h": 6,
      "spriteKey": "school"
    },
    {
      "id": "node-music-room",
      "parentId": "node-special-building",
      "name": "音乐室",
      "description": "三楼的音乐室，隔音墙面、一架Grand piano、几十把谱架。放学后筝曲部的朱里有时借用这里练习。窗外望见丘陵上的垂樱。",
      "tags": ["semi", "indoor", "quiet"],
      "capacity": 25,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 0, "y": 0, "w": 2, "h": 2,
      "spriteKey": "classroom"
    },
    {
      "id": "node-art-room",
      "parentId": "node-special-building",
      "name": "美术室",
      "description": "二楼的画室。画架、石膏像、颜料管——松节油的气味永远飘在空中。真昼的风景画占据靠窗一面墙，她在这里待的时间比教室还长。",
      "tags": ["semi", "indoor", "quiet"],
      "capacity": 20,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 0, "y": 2, "w": 2, "h": 2,
      "spriteKey": "classroom"
    },
    {
      "id": "node-science-room",
      "parentId": "node-special-building",
      "name": "理科室",
      "description": "顶层的实验室。实验台上摆满了烧杯、试管、示波器。悠斗的固定座位是角落那张——桌面上用铅笔写着未完成的公式。",
      "tags": ["semi", "indoor", "quiet"],
      "capacity": 20,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 2, "y": 0, "w": 2, "h": 2,
      "spriteKey": "classroom"
    },
    {
      "id": "node-broadcast-room",
      "parentId": "node-special-building",
      "name": "放送室",
      "description": "一间小小的广播间。麦克风、混音台、隔音玻璃。午休时学生会轮值在这里播报校内广播和点歌——今天是誰为谁点的歌，全校都知道。",
      "tags": ["semi", "indoor"],
      "capacity": 4,
      "privacy": "semi",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 2, "y": 2, "w": 1, "h": 1,
      "spriteKey": "classroom"
    },
    {
      "id": "node-gym",
      "parentId": "node-sakurano-hill",
      "name": "体育馆",
      "description": "校内最大建筑之一。篮球场双面、排球网常设。入学式和毕业式都在这里举行。放学后篮球部占全场，球鞋摩擦地板的声音回荡在挑高的空间里。",
      "tags": ["semi", "indoor"],
      "capacity": 200,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 18, "y": 3, "w": 6, "h": 4,
      "spriteKey": "playground"
    },
    {
      "id": "node-gym-storage",
      "parentId": "node-gym",
      "name": "体育仓库",
      "description": "体育馆侧的器材仓库。跳箱、体操垫、篮球、排球——还有角落里不知谁藏的零食和漫画。",
      "tags": ["semi", "indoor"],
      "capacity": 5,
      "privacy": "semi",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 4, "y": 3, "w": 2, "h": 1,
      "spriteKey": "school"
    },
    {
      "id": "node-pool",
      "parentId": "node-sakurano-hill",
      "name": "泳池",
      "description": "25米户外泳池，只开放夏半年。千夏每天放学后在这里来回游——她的县大会记录牌挂在更衣室入口，那是这所学校的骄傲。",
      "tags": ["semi", "outdoor"],
      "capacity": 15,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 22, "y": 0, "w": 4, "h": 2,
      "spriteKey": "playground"
    },
    {
      "id": "node-field",
      "parentId": "node-sakurano-hill",
      "name": "操场",
      "description": "广阔的田径运动场。野球部在内野训练，足球部占外野半场，陆上部绕跑道。優翔每天在这里挥棒到天黑——这个一年级新生的挥棒声意外地响。",
      "tags": ["public", "outdoor", "playground"],
      "capacity": 100,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 18, "y": 8, "w": 8, "h": 4,
      "spriteKey": "playground"
    },
    {
      "id": "node-courtyard",
      "parentId": "node-sakurano-hill",
      "name": "中庭「樱庭」",
      "description": "高中校园正中的绿色庭院。一株年轻的垂樱是二十年前学生会种下的，如今刚好遮住半个庭院。午休时学生在这里吃便当、聊天、或者什么都不做只是晒太阳。",
      "tags": ["public", "outdoor", "park"],
      "capacity": 40,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 10, "y": 1, "w": 5, "h": 2,
      "spriteKey": "park"
    },
    {
      "id": "node-library",
      "parentId": "node-sakurano-hill",
      "name": "图书馆「樱ノ宫文库」",
      "description": "两层楼的图书馆，落地窗外的樱枝几乎碰到玻璃。一层是阅览区和参考书，二层是书库和自习座。午后阳光斜斜洒入，空气里有旧书和木头的气味。",
      "tags": ["semi", "indoor", "quiet"],
      "capacity": 40,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 3, "y": 10, "w": 4, "h": 3,
      "spriteKey": "home-cool"
    },
    {
      "id": "node-cafeteria",
      "parentId": "node-sakurano-hill",
      "name": "食堂",
      "description": "昼休时全校最热闹的地方。拉面是最人气的菜单，炸鸡块和咖喱紧随其后。窗边座位可以望见中庭，是最抢手的位置。",
      "tags": ["public", "indoor", "dining"],
      "capacity": 80,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 14, "y": 10, "w": 4, "h": 2,
      "spriteKey": "restaurant"
    },
    {
      "id": "node-nurse",
      "parentId": "node-sakurano-hill",
      "name": "保健室",
      "description": "教学楼一楼最安静的房间。白床单、白窗帘、淡淡的消毒水气味。有人真的不舒服来这里，有人只是不想上下一节课。",
      "tags": ["semi", "indoor"],
      "capacity": 8,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 14, "y": 0, "w": 2, "h": 1,
      "spriteKey": "home-cool"
    },
    {
      "id": "node-student-council",
      "parentId": "node-sakurano-hill",
      "name": "学生会室",
      "description": "本馆一层走廊尽头的小房间。一张大桌子、六把椅子、一个档案柜。陽翔是这里的主人——墙上的白板写满了学园祭的筹备进度和预算案。窗台上放着他从家里带来的小盆栽。",
      "tags": ["semi", "indoor"],
      "capacity": 8,
      "privacy": "semi",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 2, "y": 12, "w": 2, "h": 2,
      "spriteKey": "classroom"
    },
    {
      "id": "node-rooftop",
      "parentId": "node-hs-main",
      "name": "天台",
      "description": "高中本馆的天台。本来锁着的门被谁用一枚硬币卡住了。从高处能望见整个学园和远处的丘陵——以及那棵百年垂樱。午休时偶尔有人上来吃便当。放学后是告白发生最多的地方。",
      "tags": ["semi", "outdoor", "quiet"],
      "capacity": 15,
      "privacy": "semi",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 5, "y": 0, "w": 5, "h": 2,
      "spriteKey": "park"
    },
    {
      "id": "node-guidance",
      "parentId": "node-hs-main",
      "name": "进路指导室",
      "description": "一间小而重要的房间。墙上贴满了大学·短大·专门学校的资料。高三学生每周在这里和班主任面谈——有人目标明确，有人还在迷茫。",
      "tags": ["semi", "indoor", "quiet"],
      "capacity": 8,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 7, "y": 4, "w": 2, "h": 2,
      "spriteKey": "school"
    },
    {
      "id": "node-uni-gate",
      "parentId": "node-sakurano-hill",
      "name": "大学正门",
      "description": "樱ノ宫大学的正门。比高中正门更简约——一面石墙上嵌着金属字「桜ノ宮大学」。门卫室里的大叔记得每个学生的脸。",
      "tags": ["public", "outdoor"],
      "capacity": 20,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": ["node-station"],
      "isEntry": false,
      "x": 28, "y": 2, "w": 4, "h": 2,
      "spriteKey": "school"
    },
    {
      "id": "node-uni-main",
      "parentId": "node-sakurano-hill",
      "name": "大学本部栋",
      "description": "四层现代建筑，玻璃幕墙与白色外墙——和高中的红砖形成温柔的对比。一楼大堂的通天井里种着一棵小樱树。揭示板上贴满了讲义变更通知和サークル招新海报。",
      "tags": ["semi", "indoor"],
      "capacity": 200,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 28, "y": 5, "w": 8, "h": 5,
      "spriteKey": "school"
    },
    {
      "id": "node-lecture-hall",
      "parentId": "node-uni-main",
      "name": "大讲义室",
      "description": "能容纳两百人的阶梯教室。黑板是推拉式的，教授用麦克风讲课。最后一排是公认的"寝坊席"——暖气和午后阳光让人很难不睡着。",
      "tags": ["semi", "indoor", "education"],
      "capacity": 200,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 0, "y": 0, "w": 4, "h": 2,
      "spriteKey": "classroom"
    },
    {
      "id": "node-seminar-room",
      "parentId": "node-uni-main",
      "name": "研讨室",
      "description": "小型讨论教室，二十人的圆桌排列。陽菜在这里上日本文学研讨课，蓮在这里做工程伦理案例讨论——虽然两人从不同时出现在这里。",
      "tags": ["semi", "indoor", "education", "quiet"],
      "capacity": 20,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 4, "y": 0, "w": 2, "h": 2,
      "spriteKey": "classroom"
    },
    {
      "id": "node-uni-library",
      "parentId": "node-sakurano-hill",
      "name": "大学图书馆",
      "description": "三层楼的大学图书馆，藏书量是高中文库的十倍。地下一层是自习室，24小时开放。考试前这里一座难求。楓在二楼医学区有固定座位——靠窗第三桌，窗外是银杏树。",
      "tags": ["semi", "indoor", "quiet"],
      "capacity": 100,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 28, "y": 11, "w": 4, "h": 3,
      "spriteKey": "home-cool"
    },
    {
      "id": "node-uni-cafeteria",
      "parentId": "node-sakurano-hill",
      "name": "大学生协食堂",
      "description": "大学正门旁的食堂。定食¥450、カレー¥350——价格对大学生很友好。朱里每天在这里吃A定食，说吃了半年还没腻。",
      "tags": ["public", "indoor", "dining"],
      "capacity": 120,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 30, "y": 2, "w": 4, "h": 2,
      "spriteKey": "restaurant"
    },
    {
      "id": "node-circle-building",
      "parentId": "node-sakurano-hill",
      "name": "サークル栋",
      "description": "两层サークル活动楼。筝曲部、天文部、写真部、漫画研究会——二十几个サークル共享这个空间。走廊墙上贴满了各部招新海报。",
      "tags": ["semi", "indoor"],
      "capacity": 80,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 26, "y": 15, "w": 4, "h": 3,
      "spriteKey": "school"
    },
    {
      "id": "node-uni-garden",
      "parentId": "node-sakurano-hill",
      "name": "大学庭园",
      "description": "大学本部栋背后的安静庭园。几条长椅散落在树荫下，一个小喷泉。楓和蓮常在这里吃午饭——蓮看工程论文，楓看医学教科书，两个人可以半小时不说话也不尴尬。",
      "tags": ["public", "outdoor", "park", "quiet"],
      "capacity": 30,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 25, "y": 16, "w": 3, "h": 3,
      "spriteKey": "park"
    },
    {
      "id": "node-research-lab",
      "parentId": "node-sakurano-hill",
      "name": "研究室",
      "description": "大学本部栋旁的研究楼。楓的医学研究室在三楼——显微镜、培养皿、医学期刊堆满桌子。湊的生物标本箱占据二楼实验室的一个角落。",
      "tags": ["semi", "indoor", "quiet"],
      "capacity": 20,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 30, "y": 15, "w": 3, "h": 2,
      "spriteKey": "school"
    },
    {
      "id": "node-station",
      "parentId": "node-sakurano-hill",
      "name": "樱ノ宫站",
      "description": "本地私铁的小车站。一个站台、一间候车室、一台自动售票机。站前有一棵小樱树——是町内会在昭和时代种下的。早晚通学时间，制服群从这里涌向两个学校。",
      "tags": ["public", "outdoor", "street"],
      "capacity": 30,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": ["node-gate", "node-uni-gate"],
      "isEntry": false,
      "x": 8, "y": 22, "w": 4, "h": 2,
      "spriteKey": "town"
    },
    {
      "id": "node-shop-street",
      "parentId": "node-sakurano-hill",
      "name": "商店街「樱ノ宫通り」",
      "description": "车站前步行三分钟的商店街。短短两百米，聚齐了学生需要的一切——咖啡店、书店、便利店、甜品店。路灯柱上挂着「桜ノ宮通り」的小旗，黄昏时亮起暖橙色灯光。放学后和周末，制服和私服在这里交错。",
      "tags": ["public", "outdoor", "street"],
      "capacity": 30,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": ["node-station"],
      "isEntry": false,
      "x": 6, "y": 24, "w": 12, "h": 4,
      "spriteKey": "town"
    },
    {
      "id": "node-haru-no-ne",
      "parentId": "node-shop-street",
      "name": "咖啡店「はるのね」",
      "description": "商店街入口的咖啡店。暖色灯光、木地板、六张桌子。吧台后面的黑板上用粉笔写着本周的推荐豆和甜品。美咲店主记得每个学生的常点单品——楓的黑咖啡，蓮的冰拿铁，真昼的抹茶拿铁加可可粉。放学后这里半数是写作业的，半数是聊天的。",
      "tags": ["public", "indoor", "dining"],
      "capacity": 15,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 0, "y": 0, "w": 3, "h": 2,
      "spriteKey": "restaurant"
    },
    {
      "id": "node-fumi-no-mori",
      "parentId": "node-shop-street",
      "name": "书店「ふみの杜」",
      "description": "商店街中段的老书店。参考书、文库本、漫画、画集——书架高到天花板。陽菜每周三天在这里打工，她在收银台后面读书的样子让某个常客养成了每天来书店的习惯。角落里一张旧皮椅是蓮偶尔来翻工程杂志的位置。",
      "tags": ["semi", "indoor", "quiet"],
      "capacity": 10,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 3, "y": 0, "w": 2, "h": 2,
      "spriteKey": "school"
    },
    {
      "id": "node-convenience",
      "parentId": "node-shop-street",
      "name": "便利店「樱ノ宫マート」",
      "description": "商店街中段的便利店。炒面面包、冰棒、饮料、漫画杂志——学生需要的一切都有。優翔每天放学后在这里买运动饮料，小春每周五来买新发售的漫画。",
      "tags": ["public", "indoor"],
      "capacity": 10,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 5, "y": 0, "w": 2, "h": 2,
      "spriteKey": "town"
    },
    {
      "id": "node-sweets-shop",
      "parentId": "node-shop-street",
      "name": "甜品店「春いろ」",
      "description": "商店街尽头的小甜品店。樱花季限定「桜ノ宫パフェ」是镇上的名物。女生们放学后最爱来的地方——但偶尔也能看到男生一个人偷偷来买。",
      "tags": ["public", "indoor", "dining"],
      "capacity": 10,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 8, "y": 0, "w": 2, "h": 2,
      "spriteKey": "restaurant"
    },
    {
      "id": "node-diner",
      "parentId": "node-shop-street",
      "name": "定食屋「樱めし」",
      "description": "商店街背面的定食屋。日替わり定食¥600——量大管饱。楓和蓮每周三在这里解决晚饭，朱里偶尔加入。墙上贴着附近所有外卖菜单。",
      "tags": ["public", "indoor", "dining"],
      "capacity": 20,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 7, "y": 2, "w": 3, "h": 2,
      "spriteKey": "restaurant"
    },
    {
      "id": "node-sakura-so",
      "parentId": "node-sakurano-hill",
      "name": "学生公寓「樱庄」",
      "description": "两层的老公寓，离大学步行五分钟。六间单人房、共用厨房、共用客厅。朱里和蓮住在这里。一楼客厅的沙发是大家的共同财产——上面永远有人在睡觉或者在聊天。",
      "tags": ["semi", "indoor", "residence"],
      "capacity": 6,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 30, "y": 20, "w": 4, "h": 3,
      "spriteKey": "home-warm"
    },
    {
      "id": "node-sakura-so-bath",
      "parentId": "node-sakura-so",
      "name": "樱庄浴室",
      "description": "樱庄一楼的共用浴室。洗面台上放了六个人的洗面奶和牙刷。浴缸不大但够一个人泡。轮流使用的顺序贴在墙上。",
      "tags": ["semi", "indoor", "residence", "bathing"],
      "capacity": 2,
      "privacy": "semi",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 2, "y": 2, "w": 2, "h": 1,
      "spriteKey": "home-warm"
    },
    {
      "id": "node-kaede-kan",
      "parentId": "node-sakurano-hill",
      "name": "学生公寓「枫馆」",
      "description": "三层较新的公寓，离大学步行十分钟。十二间单人房，比樱庄稍贵但房间更大。楓和湊住二楼——两人的房间门对门。陽菜住三楼角落。",
      "tags": ["semi", "indoor", "residence"],
      "capacity": 12,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 34, "y": 20, "w": 4, "h": 3,
      "spriteKey": "home-cool"
    },
    {
      "id": "node-kaede-kan-bath",
      "parentId": "node-kaede-kan",
      "name": "枫馆浴室",
      "description": "枫馆一楼的共用浴室。比樱庄的大一点——淋浴间三间、浴池一口。牆上贴着"22時以降は静かに"的告示。",
      "tags": ["semi", "indoor", "residence", "bathing"],
      "capacity": 4,
      "privacy": "semi",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "x": 2, "y": 2, "w": 2, "h": 1,
      "spriteKey": "home-warm"
    },
    {
      "id": "node-north-residence",
      "parentId": "node-sakurano-hill",
      "name": "住宅区「北町」",
      "description": "车站北侧安静的住宅区。一户建的屋顶瓦片、门前的花盆、偶尔传出的钢琴声。真昼、小春和千夏的家都在这里——三户人家的距离刚好在"走过去五分钟"的范围内。",
      "tags": ["public", "outdoor"],
      "capacity": null,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 2, "y": 16, "w": 6, "h": 4,
      "spriteKey": "home-cool"
    },
    {
      "id": "node-south-residence",
      "parentId": "node-sakurano-hill",
      "name": "住宅区「南町」",
      "description": "车站南侧安静的住宅区。陽翔、優翔和悠斗的家在这里——陽翔家是町役场指定的职员住宅，優翔家隔壁就是小春家（虽然技术上隔了一条町界），悠斗家是五十嵐兄弟长大的老宅。",
      "tags": ["public", "outdoor"],
      "capacity": null,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 10, "y": 16, "w": 6, "h": 4,
      "spriteKey": "home-warm"
    },
    {
      "id": "node-clinic",
      "parentId": "node-sakurano-hill",
      "name": "樱ノ宫诊所",
      "description": "町内唯一的小诊所。老医生在这里干了三十年，给这个镇上三代人看过病。楓每周五下午在这里实习——这是医学部地域医疗实习的一部分。",
      "tags": ["semi", "indoor"],
      "capacity": 10,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 16, "y": 22, "w": 2, "h": 2,
      "spriteKey": "home-cool"
    },
    {
      "id": "node-post-office",
      "parentId": "node-sakurano-hill",
      "name": "邮局",
      "description": "小小的邮局。两个窗口、一台ATM。邮递员记得全镇的名字——这个镇不大。",
      "tags": ["public", "indoor"],
      "capacity": 10,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 18, "y": 22, "w": 2, "h": 1,
      "spriteKey": "town"
    },
    {
      "id": "node-town-hall",
      "parentId": "node-sakurano-hill",
      "name": "町役场",
      "description": "小镇的行政中心。陽翔的父亲在这里上班——他负责住民基本台账，对全镇人口的了解堪比户籍系统。",
      "tags": ["semi", "indoor"],
      "capacity": 20,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 16, "y": 24, "w": 2, "h": 2,
      "spriteKey": "town"
    },
    {
      "id": "node-sakura-yu",
      "parentId": "node-sakurano-hill",
      "name": "温泉「樱汤」",
      "description": "小镇唯一的温泉浴场。老建筑，木造更衣室，浴池用桧木。周末晚上成为学生们的非正式社交场所——男女浴池只隔一堵墙，透过水汽偶尔能听见隔壁的聊天声。",
      "tags": ["public", "indoor", "bathing"],
      "capacity": 20,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 20, "y": 24, "w": 3, "h": 2,
      "spriteKey": "home-warm"
    },
    {
      "id": "node-riverside-path",
      "parentId": "node-sakurano-hill",
      "name": "河边樱花道",
      "description": "沿河堤延伸的步行道，两侧栽满染井吉野樱。四月满开时，整条路变成粉色隧道，花瓣飘落在水面上流向远方。放学后的通学路、周末的散步道——以及告白场地第二名（仅次于天台）。",
      "tags": ["public", "outdoor", "street"],
      "capacity": null,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 0, "y": 24, "w": 6, "h": 4,
      "spriteKey": "park"
    },
    {
      "id": "node-riverbank",
      "parentId": "node-sakurano-hill",
      "name": "河堤",
      "description": "河边樱花道旁的草坡河堤。傍晚时分在这里坐着看夕阳的人不少——一个人来的，两个人来的。朱里偶尔在这练筝——她说水声是最好的伴奏。",
      "tags": ["public", "outdoor", "park"],
      "capacity": null,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 0, "y": 28, "w": 6, "h": 2,
      "spriteKey": "park"
    },
    {
      "id": "node-park",
      "parentId": "node-sakurano-hill",
      "name": "樱ノ宫公园",
      "description": "小镇中央的公园。秋千、滑梯、沙坑——以及几棵大樱树。周末有年轻父母带孩子来玩，放学后小学生在这里抢秋千。傍晚时分成高中生和中学生的偶遇地点。",
      "tags": ["public", "outdoor", "park"],
      "capacity": 40,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 14, "y": 18, "w": 4, "h": 3,
      "spriteKey": "park"
    },
    {
      "id": "node-observatory",
      "parentId": "node-sakurano-hill",
      "name": "展望台",
      "description": "丘陵顶端垂樱旁的小展望台。能俯瞰全镇、两所学校、河川、远处的山脉。据说在这里告白的情侣会永远在一起——藤村神主说那是他年轻时为吸引参拜客编的故事，但大家还是信了。",
      "tags": ["public", "outdoor", "quiet"],
      "capacity": 10,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 22, "y": 8, "w": 2, "h": 2,
      "spriteKey": "park"
    },
    {
      "id": "node-shrine-entrance",
      "parentId": "node-sakurano-hill",
      "name": "神社参道",
      "description": "从商店街尽头延伸到神社的石阶参道。两侧杉树参天，石灯笼上长满青苔。朱里每周三次爬这段石阶去跟藤村神主学筝——她说上坡容易下坡难，但从不迟到。",
      "tags": ["public", "outdoor"],
      "capacity": null,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": ["node-shop-street", "node-gate"],
      "isEntry": false,
      "x": 20, "y": 14, "w": 2, "h": 4,
      "spriteKey": "park"
    },
    {
      "id": "node-shrine",
      "parentId": "node-shrine-entrance",
      "name": "樱ノ宫神社",
      "description": "丘陵半山腰的神社。本殿是江户时代的木造建筑，拜殿前挂着巨大的注连绳。境内有几棵老樱树——其中一棵是垂樱，据说是丘陵顶端那棵的"子樱"。藤村清一在这里做了四十年神主。",
      "tags": ["public", "outdoor", "quiet", "park"],
      "capacity": 30,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 0, "y": 0, "w": 4, "h": 3,
      "spriteKey": "park"
    },
    {
      "id": "node-forest-path",
      "parentId": "node-sakurano-hill",
      "name": "后山林道",
      "description": "神社后面的山林步道。春天有新绿和野鸟，秋天有红叶和蘑菇。湊每周来这里采集昆虫标本——他说这片林子的甲虫种类比教科书上的还多。偶尔有情侣来"散步"。",
      "tags": ["public", "outdoor", "quiet"],
      "capacity": null,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 22, "y": 12, "w": 4, "h": 4,
      "spriteKey": "park"
    },
    {
      "id": "node-sports-park",
      "parentId": "node-sakurano-hill",
      "name": "运动公园",
      "description": "町营运动公园。一个棒球场、两个网球场、一个五人制足球场。周末有少年野球队的训练，優翔的弟弟（小学五年）在这里打球。千夏偶尔来这里跑步——这是她的秘密训练路线。",
      "tags": ["public", "outdoor", "playground"],
      "capacity": 50,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 10, "y": 22, "w": 4, "h": 2,
      "spriteKey": "playground"
    },
    {
      "id": "node-market-square",
      "parentId": "node-sakurano-hill",
      "name": "露天集市广场",
      "description": "商店街旁的小广场。每月第一和第三个周末有朝市——附近农家来卖菜、花、手工果酱。夏祭和樱ノ宫祭的主会场也在这里。平时只是一个空旷的铺石广场，鸽子比人多。",
      "tags": ["public", "outdoor"],
      "capacity": 100,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "x": 8, "y": 28, "w": 4, "h": 2,
      "spriteKey": "town"
    }
  ]
}
```

- [ ] **Step 2: Validate map.json**

```bash
npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/sakurano-miya/map.json
```
Expected: `✓ configs/maps/sakurano-miya/map.json passes MapConfigSchema`

- [ ] **Step 3: Quick sanity checks**

```bash
# Count nodes
grep -c '"id": "node-' configs/maps/sakurano-miya/map.json
# Verify exactly 1 root
grep -c '"parentId": null' configs/maps/sakurano-miya/map.json
# Verify at least 1 entry
grep -c '"isEntry": true' configs/maps/sakurano-miya/map.json
# Verify at least 1 bathing
grep -c '"bathing"' configs/maps/sakurano-miya/map.json
```
Expected: 55, 1, at least 1, at least 1.

- [ ] **Step 4: Commit**

```bash
git add configs/maps/sakurano-miya/map.json
git commit -m "feat: add sakurano-miya map with 55 nodes across 4 districts"
```

---

### Task 3: Write high school characters (6 files)

**Files:**
- Create: `configs/maps/sakurano-miya/characters/char-sakurai-haruto.json`
- Create: `configs/maps/sakurano-miya/characters/char-shiraishi-mahiru.json`
- Create: `configs/maps/sakurano-miya/characters/char-igarashi-yuto.json`
- Create: `configs/maps/sakurano-miya/characters/char-kirishima-chinatsu.json`
- Create: `configs/maps/sakurano-miya/characters/char-hoshino-koharu.json`
- Create: `configs/maps/sakurano-miya/characters/char-azuma-yusho.json`

- [ ] **Step 1: Write 桜井陽翔 (char-sakurai-haruto)**

Economy check: age 18, student (tier 0), needs `expenseExempt: true`. Origin: local (≥3 relations, own restNodeId = south residence).

Write `configs/maps/sakurano-miya/characters/char-sakurai-haruto.json`:
```json
{
  "id": "char-sakurai-haruto",
  "name": "桜井陽翔",
  "avatar": "🎓",
  "age": 18,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "biography": "我是桜井陽翔，私立樱ノ宫高中三年生，生徒会长。爸爸在町役场工作，妈妈是小学教师。我从小在这个镇上长大——上同样的幼儿园、同样的中小学、现在在同样的高中。朱里是我姐姐，她比我大三岁，性格比我自由一百倍。成绩年级前三——不是为了考东大，只是觉得既然做了就该做好。真昼……真昼在美术室画画的背影，我看了三年了。",
  "activityNodeId": "node-student-council",
  "restNodeId": "node-south-residence",
  "sleepWindow": { "start": 23, "duration": 7 },
  "personality": { "ei": -1, "sn": 2, "tf": 2, "jp": 3 },
  "abilities": [],
  "appearance": 3,
  "intelligence": 3,
  "health": 3,
  "speakingStyle": "说话斯文有礼，语速中等，先想清楚再开口。作为生徒会长习惯了"首先、其次"的结构化表达，但私下和朋友说话时会放松下来。说到真昼相关的话题时句子会变短、会停顿。",
  "relations": {
    "char-shiraishi-mahiru": { "kinds": ["classmate", "friend"], "affection": 3, "note": "在美术室里画画的背影，比任何志愿校都更难割舍。", "since": 0, "lastInteractionTick": 0 },
    "char-sakurai-akari": { "kinds": ["older_sister"], "affection": 0, "note": "比我大三年，性格完全相反的姐姐。她太自由了，但我知道她比谁都关心我。", "since": 0, "lastInteractionTick": 0 },
    "char-kirishima-chinatsu": { "kinds": ["classmate"], "affection": 0, "since": 0, "lastInteractionTick": 0 },
    "char-hoshino-koharu": { "kinds": ["classmate"], "affection": 1, "note": "今年入学的新生，入学式上她听我致辞时眼睛很亮。", "since": 0, "lastInteractionTick": 0 }
  },
  "expenseExempt": true,
  "impressionBook": {}
}
```

- [ ] **Step 2: Write 白石真昼 (char-shiraishi-mahiru)**

Economy check: age 18, student (tier 0), needs `expenseExempt: true`. Origin: local (≥3 relations, own restNodeId = north residence).

Write `configs/maps/sakurano-miya/characters/char-shiraishi-mahiru.json`:
```json
{
  "id": "char-shiraishi-mahiru",
  "name": "白石真昼",
  "avatar": "🎨",
  "age": 18,
  "gender": "female",
  "profession": "student",
  "origin": "local",
  "biography": "我叫白石真昼。是私立樱ノ宫高中三年生，美术部。我从小学起就在画——先是彩色铅笔，然后是水彩，现在是油画。美術室靠窗那个位置是我的。每天放学后画到太阳落山，看着窗外中庭的樱树发呆——有时候会想，画画是不是只是在拖时间，拖到不得不离开这个镇去上大学的那一天。咖啡店「はるのね」的抹茶拿铁很好喝——还有那里的咖啡师，他磨豆子时手指很长。陽翔是我三年来的同班同学，他很认真，是个好人——但我不知道该怎么回应他的关心。",
  "activityNodeId": "node-art-room",
  "restNodeId": "node-north-residence",
  "sleepWindow": { "start": 23, "duration": 7 },
  "personality": { "ei": -2, "sn": 3, "tf": -1, "jp": 1 },
  "abilities": [],
  "appearance": 4,
  "intelligence": 2,
  "health": 2,
  "speakingStyle": "安静温和，话不多但每句都经过感受力的过滤——会说'今天的阳光像是被樱树滤过一样'而非'今天天气不错'。用词带有视觉质感，偶尔不太确定自己在表达什么时会停顿。和不太熟的人说话时声音会变小。",
  "relations": {
    "char-sakurai-haruto": { "kinds": ["classmate", "friend"], "affection": 1, "note": "三年来的同班同学。他很可靠——但可靠和喜欢是两回事。", "since": 0, "lastInteractionTick": 0 },
    "char-kiriya-kaede": { "kinds": ["acquaintance"], "affection": 2, "note": "咖啡店「はるのね」的咖啡师。他磨豆子时手指很长。每次他来收空杯子时我都会低头假装画画。", "since": 0, "lastInteractionTick": 0 },
    "char-kirishima-chinatsu": { "kinds": ["classmate", "friend"], "affection": 1, "note": "一起在美术室待到很晚——她有时会来看我画画。", "since": 0, "lastInteractionTick": 0 }
  },
  "expenseExempt": true,
  "impressionBook": {}
}
```

- [ ] **Step 3: Write 五十嵐悠斗 (char-igarashi-yuto)**

Economy check: age 17 (minor), expenseExempt by engine default, omit field. Origin: local (≥3 relations including brother, own restNodeId = south residence).

Write `configs/maps/sakurano-miya/characters/char-igarashi-yuto.json`:
```json
{
  "id": "char-igarashi-yuto",
  "name": "五十嵐悠斗",
  "avatar": "🔬",
  "age": 17,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "biography": "我叫五十嵐悠斗，私立樱ノ宫高中二年生。我不太擅长说话——不是说不会，是说出来的话总是不对。但我在理科室的时候一切都对。示波器的波形、试管的反应、公式推导——这些不需要社交技巧。千夏坐在我前面三排靠窗，她上课时偶尔回头看我——我不知道她在看什么，她每次都说'没什么'。湊是我哥哥，他在大学读生物。我们住同一个房间到去年——现在他搬去枫馆了，房间突然变得很大。",
  "activityNodeId": "node-science-room",
  "restNodeId": "node-south-residence",
  "sleepWindow": { "start": 22, "duration": 8 },
  "personality": { "ei": -3, "sn": 4, "tf": 3, "jp": -1 },
  "abilities": [],
  "appearance": 2,
  "intelligence": 4,
  "health": 2,
  "speakingStyle": "极其寡言，日常对话不超过十个字——但当话题转到物理或实验时句子会突然变完整变长甚至带上热情。说话时眼睛通常看着桌面或实验台而非对方。语气平直，很少用情绪词，但偶尔会冒出意想不到的冷幽默——说完自己也不笑。",
  "relations": {
    "char-kirishima-chinatsu": { "kinds": ["classmate"], "affection": 3, "note": "她坐在我前面三排靠窗。她上课时偶尔回头看我——我不知道为什么。", "since": 0, "lastInteractionTick": 0 },
    "char-igarashi-minato": { "kinds": ["older_brother"], "affection": 2, "note": "湊是我哥。他搬去大学公寓后房间突然变得很大——我没有告诉他我有点不习惯。", "since": 0, "lastInteractionTick": 0 },
    "char-sakurai-haruto": { "kinds": ["classmate"], "affection": 0, "note": "生徒会长。有时候来理科室借器材。", "since": 0, "lastInteractionTick": 0 }
  },
  "impressionBook": {}
}
```

- [ ] **Step 4: Write 霧島千夏 (char-kirishima-chinatsu)**

Economy check: age 17 (minor), expenseExempt by engine default, omit field. Origin: local (own restNodeId = north residence, ≥3 relations).

Write `configs/maps/sakurano-miya/characters/char-kirishima-chinatsu.json`:
```json
{
  "id": "char-kirishima-chinatsu",
  "name": "霧島千夏",
  "avatar": "🏊",
  "age": 17,
  "gender": "female",
  "profession": "student",
  "origin": "local",
  "biography": "我是霧島千夏！樱ノ宫高中二年，水泳部！县大会自由泳银牌——金牌差0.3秒，今年夏天绝对要拿到。泳池是我的地盘，在水里比陆地上自在。悠斗那个理科狂——他坐在我后面三排，我有时候回头看他不是因为别的，只是好奇他整天在写什么。真的！但他认真得让人有点看不下去——明明是天才却以为自己很普通。",
  "activityNodeId": "node-pool",
  "restNodeId": "node-north-residence",
  "sleepWindow": { "start": 22, "duration": 8 },
  "personality": { "ei": 3, "sn": -1, "tf": -2, "jp": 2 },
  "abilities": [],
  "appearance": 3,
  "intelligence": 2,
  "health": 4,
  "speakingStyle": "语速快、声音亮、用词直接不做作。说话时经常加上手势——在泳池边说话时手还在比划泳姿。情绪外露，高兴时笑出声，不高兴时你也看得出来。偶尔会嘴硬——尤其是提到悠斗的时候。",
  "relations": {
    "char-igarashi-yuto": { "kinds": ["classmate"], "affection": 3, "note": "他坐我后面三排，上课时我偶尔回头看他——只是好奇他在写什么，真的。但他在理科室做实验的样子和在水里比赛的我有点像——都是只有自己懂的东西。", "since": 0, "lastInteractionTick": 0 },
    "char-sakurai-haruto": { "kinds": ["classmate"], "affection": 1, "note": "生徒会长，水泳部预算的审批者——所以要保持良好关系。", "since": 0, "lastInteractionTick": 0 },
    "char-shiraishi-mahiru": { "kinds": ["classmate", "friend"], "affection": 1, "note": "美术部的真昼——我的画画很烂但喜欢看她画。有时候训练完去美术室找她，顺便吐槽悠斗。", "since": 0, "lastInteractionTick": 0 }
  },
  "impressionBook": {}
}
```

- [ ] **Step 5: Write 星野小春 (char-hoshino-koharu)**

Economy check: age 16 (minor), expenseExempt by engine default, omit field. Origin: local (own restNodeId = north residence, neighbor/friend relations).

Write `configs/maps/sakurano-miya/characters/char-hoshino-koharu.json`:
```json
{
  "id": "char-hoshino-koharu",
  "name": "星野小春",
  "avatar": "🌸",
  "age": 16,
  "gender": "female",
  "profession": "student",
  "origin": "local",
  "biography": "我是星野小春！今年刚进樱ノ宫高中，一年生。入学式上生徒会长的致辞——怎么说呢，这个学校好像会有好事发生。優翔是我隔壁邻居，从小一起长大——他最近突然变高了，声音也变了，有点不知道该怎么和他说话了，明明以前什么都能说的。我喜欢漫画和甜品，放学后最期待去商店街的甜品店。以后想加入文艺部——或者漫画研究会也行。",
  "activityNodeId": "node-hs-1-1",
  "restNodeId": "node-north-residence",
  "sleepWindow": { "start": 22, "duration": 8 },
  "personality": { "ei": 2, "sn": -2, "tf": -2, "jp": -1 },
  "abilities": [],
  "appearance": 3,
  "intelligence": 2,
  "health": 3,
  "speakingStyle": "语调明亮起伏大，话多且跳跃——话题可以从昨天的漫画情节跳到今天食堂的拉面再跳到入学式。对新鲜事物充满好奇心外露的表达方式，感叹词使用频率高。说到優翔时句子会短暂地变得不确定——然后迅速切换到别的话题。",
  "relations": {
    "char-azuma-yusho": { "kinds": ["neighbor", "friend"], "affection": 3, "note": "从小一起长大的邻居。他最近变得我有点不太认识他了——明明还是同一个人。", "since": 0, "lastInteractionTick": 0 },
    "char-sakurai-haruto": { "kinds": ["classmate"], "affection": 1, "note": "生徒会长，入学式上的致辞很打动我。", "since": 0, "lastInteractionTick": 0 }
  },
  "impressionBook": {}
}
```

- [ ] **Step 6: Write 東優翔 (char-azuma-yusho)**

Economy check: age 16 (minor), expenseExempt by engine default, omit field. Origin: local (own restNodeId = south residence, neighbor/friend relations).

Write `configs/maps/sakurano-miya/characters/char-azuma-yusho.json`:
```json
{
  "id": "char-azuma-yusho",
  "name": "東優翔",
  "avatar": "⚾",
  "age": 16,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "biography": "我是東優翔！樱ノ宫高中一年，野球部！目标是甲子园——虽然我们学校还没打进过，但今年有我了。小春是我邻居，从小一起长大——她最近好像开始化妆了？不太懂。但她和我说话时好像和以前不太一样了。不管了，先挥棒一千次。",
  "activityNodeId": "node-field",
  "restNodeId": "node-south-residence",
  "sleepWindow": { "start": 22, "duration": 8 },
  "personality": { "ei": 3, "sn": -3, "tf": -1, "jp": -3 },
  "abilities": [],
  "appearance": 3,
  "intelligence": 1,
  "health": 4,
  "speakingStyle": "声音大、语速快、句子短、完全靠直觉说话。想到什么说什么，毫无过滤——经常说完才意识到刚才的话可能不太对。兴奋时手舞足蹈，训练后精疲力竭时话量直线下降。说到野球时眼睛会亮，说到小春时会突然摸后脑勺。",
  "relations": {
    "char-hoshino-koharu": { "kinds": ["neighbor", "friend"], "affection": 3, "note": "邻居小春。从小一起长大。她最近好像开始化妆了——不太懂但挺好看的。", "since": 0, "lastInteractionTick": 0 }
  },
  "impressionBook": {}
}
```

- [ ] **Step 7: Validate all 6 characters**

```bash
for f in char-sakurai-haruto char-shiraishi-mahiru char-igarashi-yuto char-kirishima-chinatsu char-hoshino-koharu char-azuma-yusho; do
  echo "=== $f ==="
  npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/sakurano-miya/characters/$f.json
done
```
Expected: All 6 pass `CharacterTemplateSchema`.

- [ ] **Step 8: Run origin decision tree check for each character**

Verify each character against the origin checklist:
1. 陽翔: ≥3 relations, own restNodeId → local ✓
2. 真昼: ≥3 relations, own restNodeId → local ✓
3. 悠斗: blood relation (brother), own restNodeId, minor with local parent → local ✓
4. 千夏: own restNodeId, ≥3 relations → local ✓
5. 小春: own restNodeId, minor, neighbor/friend → local ✓
6. 優翔: own restNodeId, minor, neighbor/friend → local ✓

- [ ] **Step 9: Commit**

```bash
git add configs/maps/sakurano-miya/characters/char-sakurai-haruto.json \
        configs/maps/sakurano-miya/characters/char-shiraishi-mahiru.json \
        configs/maps/sakurano-miya/characters/char-igarashi-yuto.json \
        configs/maps/sakurano-miya/characters/char-kirishima-chinatsu.json \
        configs/maps/sakurano-miya/characters/char-hoshino-koharu.json \
        configs/maps/sakurano-miya/characters/char-azuma-yusho.json
git commit -m "feat: add sakurano-miya high school characters (6)"
```

---

### Task 4: Write university characters (5 files)

**Files:**
- Create: `configs/maps/sakurano-miya/characters/char-kiriya-kaede.json`
- Create: `configs/maps/sakurano-miya/characters/char-sakurai-akari.json`
- Create: `configs/maps/sakurano-miya/characters/char-tachibana-hina.json`
- Create: `configs/maps/sakurano-miya/characters/char-wakamatsu-ren.json`
- Create: `configs/maps/sakurano-miya/characters/char-igarashi-minato.json`

- [ ] **Step 1: Write 桐谷楓 (char-kiriya-kaede)**

Economy check: age 22, student (tier 0), adult. Must have `expenseExempt: true` or initialMoney ≥ MDC×21=420. Set `expenseExempt: true` (his coffee shop part-time work isn't modeled in economy). Origin: local (own restNodeId at kaede-kan, born and raised in town).

Write `configs/maps/sakurano-miya/characters/char-kiriya-kaede.json`:
```json
{
  "id": "char-kiriya-kaede",
  "name": "桐谷楓",
  "avatar": "☕",
  "age": 22,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "biography": "我叫桐谷楓。樱ノ宫大学医学部四年生。我在这个镇出生、长大——小学、中学、高中、大学，一直在这里。毕业后想去县立医院做研修医。每周二四在「はるのね」打工——磨豆子、冲咖啡、洗杯子。美咲店主是第一个雇我的人，那时我刚进大学。有个常客每周来两三次，坐在靠窗位置画素描，每次都点抹茶拿铁加可可粉——我记住了她的名字，但还没和她说过多少话。",
  "activityNodeId": "node-research-lab",
  "restNodeId": "node-kaede-kan",
  "sleepWindow": { "start": 24, "duration": 6 },
  "personality": { "ei": -1, "sn": 3, "tf": 1, "jp": 2 },
  "abilities": [],
  "appearance": 4,
  "intelligence": 3,
  "health": 3,
  "speakingStyle": "沉稳温柔，语速适中偏慢。说话时带着医学生特有的分寸感——不会直接下结论但语气让人安心。在咖啡店工作时声音会变得和平时有些不一样——更轻快一点，像在安抚客人。说到在意的事时句子会变得更谨慎。",
  "relations": {
    "char-wakamatsu-ren": { "kinds": ["friend"], "affection": 2, "note": "大学入学以来的朋友。我们可以在大学庭园半小时不说话也不尴尬。", "since": 0, "lastInteractionTick": 0 },
    "char-sakurai-akari": { "kinds": ["friend"], "affection": 1, "note": "咖啡店的常客。她的筝曲演奏偶尔在大学庭园能听到。", "since": 0, "lastInteractionTick": 0 },
    "char-shiraishi-mahiru": { "kinds": ["acquaintance"], "affection": 1, "note": "咖啡店的常客，每次点抹茶拿铁加可可粉。她总是在画素描——笔触很安静。", "since": 0, "lastInteractionTick": 0 },
    "char-sato-misaki": { "kinds": ["colleague"], "affection": 2, "note": "「はるのね」的店主。她给了我来这个镇之后的第一份工。", "since": 0, "lastInteractionTick": 0 },
    "char-igarashi-minato": { "kinds": ["friend"], "affection": 2, "note": "共享公寓的邻居。他采集的昆虫标本有时会出现在我们共用的冰箱里。", "since": 0, "lastInteractionTick": 0 }
  },
  "expenseExempt": true,
  "impressionBook": {}
}
```

- [ ] **Step 2: Write 桜井朱里 (char-sakurai-akari)**

Economy check: age 19, student (tier 0), adult. Set `expenseExempt: true`. Origin: local (blood relation with haruto, own restNodeId at sakura-so).

Write `configs/maps/sakurano-miya/characters/char-sakurai-akari.json`:
```json
{
  "id": "char-sakurai-akari",
  "name": "桜井朱里",
  "avatar": "🎵",
  "age": 19,
  "gender": "female",
  "profession": "student",
  "origin": "local",
  "biography": "我叫桜井朱里！樱ノ宫大学音乐学部一年生，专攻筝曲。藤村神主是我筝曲老师——从中学开始跟他学，现在每周三次爬神社石阶去上课。陽翔是我弟弟——他太认真了，从小到大都是"別人家的孩子"，但我知道他压力有多大。我住在樱庄，一楼客厅的沙发是我的第二张床。喜欢拉着人去各种地方——河边、咖啡店、神社、祭典——一个人待着多无聊啊。",
  "activityNodeId": "node-music-room",
  "restNodeId": "node-sakura-so",
  "sleepWindow": { "start": 25, "duration": 7 },
  "personality": { "ei": 4, "sn": -2, "tf": -3, "jp": -2 },
  "abilities": [],
  "appearance": 3,
  "intelligence": 2,
  "health": 3,
  "speakingStyle": "话多健谈，语速快，情绪丰富——开心时笑声很大，感动时直接说'好感动'。想到什么说什么，话题跳跃但总能绕回来。是所有人中最会拉人一起做各种事的人——'一起嘛！'是她的口头禅。说到弟弟时的语气会突然从自由奔放切换到大姐专属的操心模式。",
  "relations": {
    "char-sakurai-haruto": { "kinds": ["younger_brother"], "affection": 2, "note": "我弟弟。认真过头了的笨蛋弟弟——但我比谁都清楚他有多好。", "since": 0, "lastInteractionTick": 0 },
    "char-tachibana-hina": { "kinds": ["friend"], "affection": 3, "note": "最好的朋友。她安静我话多——不知道怎么成朋友的但就是成了。", "since": 0, "lastInteractionTick": 0 },
    "char-fujimura-seiichi": { "kinds": ["teacher"], "affection": 2, "note": "我的筝曲老师。话少得可怕，但他的筝音能让人哭出来。", "since": 0, "lastInteractionTick": 0 },
    "char-kiriya-kaede": { "kinds": ["friend"], "affection": 1, "note": "咖啡店的楓。他冲的咖啡和他的人一样——很稳。", "since": 0, "lastInteractionTick": 0 },
    "char-wakamatsu-ren": { "kinds": ["friend"], "affection": 1, "note": "住在樱庄的蓮。他太钝了——有时候真的很想敲他。", "since": 0, "lastInteractionTick": 0 }
  },
  "expenseExempt": true,
  "impressionBook": {}
}
```

- [ ] **Step 3: Write 橘陽菜 (char-tachibana-hina)**

Economy check: age 20, student (tier 0), adult. Set `expenseExempt: true`. Has part-time job at bookstore but income not modeled. Origin: local (own restNodeId at kaede-kan, ≥3 relations).

Write `configs/maps/sakurano-miya/characters/char-tachibana-hina.json`:
```json
{
  "id": "char-tachibana-hina",
  "name": "橘陽菜",
  "avatar": "📚",
  "age": 20,
  "gender": "female",
  "profession": "student",
  "origin": "local",
  "biography": "我叫橘陽菜。樱ノ宫大学文学部二年生，专攻日本近代文学。每周三天在「ふみの杜」书店打工——收银台后面的位置是我最安心的视角。朱里是我最好的朋友——她那么吵我那么安静，不知道为什么就是合得来。蓮……他每周来书店翻工程杂志——他从来不在书店买书，每次都站在书架前翻完。我在收银台后面看了他快一年了。他没有发现。",
  "activityNodeId": "node-fumi-no-mori",
  "restNodeId": "node-kaede-kan",
  "sleepWindow": { "start": 23, "duration": 7 },
  "personality": { "ei": -2, "sn": 2, "tf": 1, "jp": 3 },
  "abilities": [],
  "appearance": 3,
  "intelligence": 3,
  "health": 2,
  "speakingStyle": "安静温柔，语调平稳，句子完整且有条理。用词有文学少女特有的精准——会选择最恰当的那个词而非第一个想到的词。在书店和客人的对话简短礼貌，和朱里在一起时话会变多但依然温和。说到蓮的话题时句尾会变轻——像是不确定该不该把这句话说完。",
  "relations": {
    "char-wakamatsu-ren": { "kinds": ["acquaintance"], "affection": 3, "note": "书店的常客——每周来翻工程杂志但从不买。他在书架前站着的侧脸我看了快一年。他不知道。", "since": 0, "lastInteractionTick": 0 },
    "char-sakurai-akari": { "kinds": ["friend"], "affection": 3, "note": "我最好的朋友。她那么吵我那么安静——但我们在一起时所有话都对。", "since": 0, "lastInteractionTick": 0 },
    "char-fujimura-seiichi": { "kinds": ["colleague"], "affection": 1, "note": "书店的常客，每次都来订和歌集。和朱里的筝曲老师是同一个人——这个镇真小。", "since": 0, "lastInteractionTick": 0 }
  },
  "expenseExempt": true,
  "impressionBook": {}
}
```

- [ ] **Step 4: Write 若松蓮 (char-wakamatsu-ren)**

Economy check: age 21, student (tier 0), adult. Set `expenseExempt: true`. Origin: local (own restNodeId at sakura-so).

Write `configs/maps/sakurano-miya/characters/char-wakamatsu-ren.json`:
```json
{
  "id": "char-wakamatsu-ren",
  "name": "若松蓮",
  "avatar": "🔧",
  "age": 21,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "biography": "我叫若松蓮。樱ノ宫大学工学部三年生，专攻机械工学。我认为世界上大部分问题都可以通过逻辑分析和正确的工程方法解决——人际关系除外，所以我通常不去想它。楓是我大学入学以来最好的朋友——我们可以在大学庭园坐很久什么都不说，那种沉默很有效率。住在樱庄，房间很简单——一张桌子、一台电脑、一架工具。书店有个店员每次我去都会看我一眼——大概是注意到我从来不买书吧。",
  "activityNodeId": "node-seminar-room",
  "restNodeId": "node-sakura-so",
  "sleepWindow": { "start": 24, "duration": 6 },
  "personality": { "ei": 1, "sn": 1, "tf": 4, "jp": 1 },
  "abilities": [],
  "appearance": 3,
  "intelligence": 3,
  "health": 3,
  "speakingStyle": "逻辑性强，因果词多（'因为''所以''按理说'），情绪词少。句子完整但不太长——说完重点就停。语气平稳不擅长察觉到对话中的情感暗示——对方在暗示什么时他通常真的没听懂。说到工程问题时眼睛会亮——那是他唯一会主动展开的领域。",
  "relations": {
    "char-kiriya-kaede": { "kinds": ["friend"], "affection": 2, "note": "大学入学以来最好的朋友。和他在一起时沉默不尴尬——这是很高的评价。", "since": 0, "lastInteractionTick": 0 },
    "char-tachibana-hina": { "kinds": ["acquaintance"], "affection": 0, "note": "书店的店员。她每次我看书时都会看我一眼——大概是注意到我从来不买书。", "since": 0, "lastInteractionTick": 0 },
    "char-sakurai-akari": { "kinds": ["friend"], "affection": 1, "note": "住在同一栋公寓的朱里。她很吵但人很好——虽然大部分时间我不太懂她在说什么。", "since": 0, "lastInteractionTick": 0 }
  },
  "expenseExempt": true,
  "impressionBook": {}
}
```

- [ ] **Step 5: Write 五十嵐湊 (char-igarashi-minato)**

Economy check: age 20, student (tier 0), adult. Set `expenseExempt: true`. Origin: local (blood relation with yuto, own restNodeId at kaede-kan).

Write `configs/maps/sakurano-miya/characters/char-igarashi-minato.json`:
```json
{
  "id": "char-igarashi-minato",
  "name": "五十嵐湊",
  "avatar": "🦋",
  "age": 20,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "biography": "我叫五十嵐湊，樱ノ宫大学理学部生物学科二年生。我观察人——不是有意的，只是习惯了。观察虫子也是一样——看它们在什么温度下最活跃、和谁分享同一片叶子。悠斗是我弟弟——我观察了他十七年，现在我搬去枫馆了，观察样本少了一个，但每周他会来大学图书馆自习——坐老位置，第三自习室靠墙。我没告诉他我知道。",
  "activityNodeId": "node-research-lab",
  "restNodeId": "node-kaede-kan",
  "sleepWindow": { "start": 24, "duration": 7 },
  "personality": { "ei": -2, "sn": 4, "tf": 2, "jp": 2 },
  "abilities": [],
  "appearance": 2,
  "intelligence": 3,
  "health": 3,
  "speakingStyle": "话不多，每句话像是观察之后得出的结论——精准、简短、偶尔让人意外。语气偏冷静但不像蓮那样纯理性——他的观察里带着对人的好奇。会突然说出一句切中要点的评论然后继续沉默。",
  "relations": {
    "char-igarashi-yuto": { "kinds": ["younger_brother"], "affection": 2, "note": "我观察了他十七年。他还没发现我每周在大学图书馆能看到他。", "since": 0, "lastInteractionTick": 0 },
    "char-kiriya-kaede": { "kinds": ["friend"], "affection": 2, "note": "共享公寓的邻居。他的医学教科书偶尔会混进我的生物学标本箱里。", "since": 0, "lastInteractionTick": 0 }
  },
  "expenseExempt": true,
  "impressionBook": {}
}
```

- [ ] **Step 6: Validate all 5 university characters**

```bash
for f in char-kiriya-kaede char-sakurai-akari char-tachibana-hina char-wakamatsu-ren char-igarashi-minato; do
  echo "=== $f ==="
  npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/sakurano-miya/characters/$f.json
done
```
Expected: All 5 pass `CharacterTemplateSchema`.

- [ ] **Step 7: Origin checks for university characters**

Verify:
- 楓: own restNodeId (kaede-kan), ≥5 relations, colleague → local ✓
- 朱里: blood relation (younger_brother haruto), own restNodeId (sakura-so) → local ✓
- 陽菜: own restNodeId (kaede-kan), ≥3 relations → local ✓
- 蓮: own restNodeId (sakura-so), ≥3 relations → local ✓
- 湊: blood relation (younger_brother yuto), own restNodeId (kaede-kan) → local ✓

- [ ] **Step 8: Commit**

```bash
git add configs/maps/sakurano-miya/characters/char-kiriya-kaede.json \
        configs/maps/sakurano-miya/characters/char-sakurai-akari.json \
        configs/maps/sakurano-miya/characters/char-tachibana-hina.json \
        configs/maps/sakurano-miya/characters/char-wakamatsu-ren.json \
        configs/maps/sakurano-miya/characters/char-igarashi-minato.json
git commit -m "feat: add sakurano-miya university characters (5)"
```

---

### Task 5: Write townspeople characters (2 files)

**Files:**
- Create: `configs/maps/sakurano-miya/characters/char-sato-misaki.json`
- Create: `configs/maps/sakurano-miya/characters/char-fujimura-seiichi.json`

- [ ] **Step 1: Write 佐藤美咲 (char-sato-misaki)**

Economy check: age 28, innkeeper (tier 2). BME=1.2 (age 28, health 3 → healthFactor=1.0). Daily income = 1.2 × 2 × 20 = 48. Daily costs ≈ 34. Net +14/day. Sustainable. initialMoney = max(140, 280) = 280. Omit or set to 280. Let's set it.

Origin: local (own business at node-haru-no-ne, restNodeId same as activityNodeId).

Write `configs/maps/sakurano-miya/characters/char-sato-misaki.json`:
```json
{
  "id": "char-sato-misaki",
  "name": "佐藤美咲",
  "avatar": "🏠",
  "age": 28,
  "gender": "female",
  "profession": "innkeeper",
  "origin": "local",
  "biography": "我叫佐藤美咲。「はるのね」的店主，在这里开店五年了。丈夫在邻市上班，每晚回来——所以店里晚班是我一个人。我喜欢记住每个客人的常点单品——楓的黑咖啡不加糖，蓮的冰拿铁少冰，真昼的抹茶拿铁加可可粉——这不是生意技巧，只是觉得被记住是件让人高兴的事。朱里偶尔深夜带朋友来——那孩子把咖啡店当成第二客厅了，我不介意。",
  "activityNodeId": "node-haru-no-ne",
  "restNodeId": "node-haru-no-ne",
  "sleepWindow": { "start": 24, "duration": 7 },
  "personality": { "ei": 3, "sn": 1, "tf": -1, "jp": 2 },
  "abilities": [],
  "appearance": 3,
  "intelligence": 2,
  "health": 3,
  "speakingStyle": "亲切健谈，语调温暖像在招呼家人。会记住每个人喜欢的温度和口味——这份记忆力自然流露在对话中。说话带着服务行业特有的分寸感——热络但不越线，关心但不八卦。偶尔会像姐姐一样给出简短的建议。",
  "relations": {
    "char-kiriya-kaede": { "kinds": ["colleague"], "affection": 2, "note": "咖啡店的兼职生。冲咖啡认真得让人觉得他在做实验——但冲出来的咖啡很好喝。", "since": 0, "lastInteractionTick": 0 },
    "char-sakurai-akari": { "kinds": ["friend"], "affection": 2, "note": "常客。她深夜带朋友来的时候咖啡店变成了青春剧的舞台——我负责提供背景音乐。", "since": 0, "lastInteractionTick": 0 },
    "char-tachibana-hina": { "kinds": ["friend"], "affection": 2, "note": "常客。安静的文学少女——她坐在角落读书的样子让咖啡店看起来更好了。", "since": 0, "lastInteractionTick": 0 }
  },
  "initialMoney": 280,
  "expenseExempt": false,
  "impressionBook": {}
}
```

- [ ] **Step 2: Write 藤村清一 (char-fujimura-seiichi)**

Economy check: age 65, priest (tier 2). BME: age 66+ base=0.75, health 3 → healthFactor=1.0 → BME=0.75. Daily income = 0.75 × 2 × 20 = 30. Daily costs ≈ 34. Net -4/day. Slightly deficit! Need to compensate: priest living at shrine might have reduced costs, or bump initialMoney. Let's set initialMoney = max(140, 560) = 560 for buffer, and set `expenseExempt: true` since shrine provides housing/food.

Origin: local (own shrine, ≥2 relations).

Write `configs/maps/sakurano-miya/characters/char-fujimura-seiichi.json`:
```json
{
  "id": "char-fujimura-seiichi",
  "name": "藤村清一",
  "avatar": "⛩️",
  "age": 65,
  "gender": "male",
  "profession": "priest",
  "origin": "local",
  "biography": "我叫藤村清一。在这神社做了四十年神主。年轻时在东京做过音乐人——那时候头发很长，弹电吉他。后来父亲病了我回到镇上，就再没离开过。朱里每周来学筝——那孩子手指有力，是天生的。我话不多——年轻时说得太多，现在觉得安静更好。每年四月樱花满开时，我在这神社里看着丘陵上那棵垂樱——它在，我也在。",
  "activityNodeId": "node-shrine",
  "restNodeId": "node-shrine",
  "sleepWindow": { "start": 21, "duration": 7 },
  "personality": { "ei": -4, "sn": 3, "tf": 2, "jp": 3 },
  "abilities": [],
  "appearance": 1,
  "intelligence": 3,
  "health": 3,
  "speakingStyle": "极其寡言——能说两个字不说三个。但每个字都经过筛选，像他的筝音一样精准安静。说话语速偏慢，偶尔会引用古事记或和歌——然后自己轻笑一下，觉得太装了。年轻时在东京做过音乐人——这个过去偶尔会在他说到音乐时露出一角。",
  "relations": {
    "char-sakurai-akari": { "kinds": ["student"], "affection": 2, "note": "筝曲的弟子。这孩子手指有力，悟性也好——但更重要的是她每次来都会说话，让这神社里有点人声。", "since": 0, "lastInteractionTick": 0 },
    "char-tachibana-hina": { "kinds": ["acquaintance"], "affection": 1, "note": "书店的姑娘。每次来订和歌集——现在读和歌的年轻人不多了。", "since": 0, "lastInteractionTick": 0 }
  },
  "initialMoney": 560,
  "expenseExempt": true,
  "impressionBook": {}
}
```

- [ ] **Step 3: Validate both townspeople characters**

```bash
for f in char-sato-misaki char-fujimura-seiichi; do
  echo "=== $f ==="
  npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/sakurano-miya/characters/$f.json
done
```
Expected: Both pass `CharacterTemplateSchema`.

- [ ] **Step 4: Economy verification**

For all 13 characters, verify:
- Minors (age < 18): no `expenseExempt: false` written → 悠斗(17), 千夏(17), 小春(16), 優翔(16) ✓ (field omitted)
- Adult students (tier 0): all have `expenseExempt: true` → 陽翔(18), 真昼(18), 楓(22), 朱里(19), 陽菜(20), 蓮(21), 湊(20) ✓
- Income earners: 佐藤(innkeeper, tier 2: 日收48, 日开销34, +14/day ✓), 藤村(priest, tier 2: deficit but expenseExempt+high initial ✓)

- [ ] **Step 5: Speaking style diversity check**

Verify no two characters share ≥3 same trait markers:
- 陽翔: structured, slow-medium pace, caring-big-brother
- 真昼: quiet, visual vocabulary, pauses, uncertain
- 悠斗: extremely terse, science-verbose, no eye contact
- 千夏: fast, loud, direct, tsundere about love interest
- 小春: bright, jumping topics, exclamation-heavy, avoidant about crush
- 優翔: loud, short sentences, zero filter, sports-obsessed
- 楓: calm, measured pace, medical precision, gentle
- 朱里: chatty, fast, emotional, topic-jumper, big-sister mode
- 陽菜: quiet, precise vocabulary, literary, trailing off
- 蓮: logical, causal connectors, flat tone, oblivious
- 湊: observational, short-precise comments, quiet curiosity
- 佐藤: warm, service-professional, memory-detail, big-sister
- 藤村: minimal words, ancient references, slow, music-tinged

No two share ≥3 traits. ✓

- [ ] **Step 6: Commit**

```bash
git add configs/maps/sakurano-miya/characters/char-sato-misaki.json \
        configs/maps/sakurano-miya/characters/char-fujimura-seiichi.json
git commit -m "feat: add sakurano-miya townspeople characters (2)"
```

---

### Task 6: Write actions.js (12 actions)

**Files:**
- Create: `configs/maps/sakurano-miya/actions.js`

- [ ] **Step 1: Write the complete actions.js**

Write `configs/maps/sakurano-miya/actions.js`:

```javascript
// Sakurano-Miya custom actions (9 new + 3 from sakuraba-academy)

// ============================================================
// 保留自 sakuraba-academy (kiss, caress, hug)
// ============================================================

var kissAction = {
  type: "kiss",
  duration: "instant",
  triggerHint: "亲吻可以用来表达爱意。",
  paramRule: "必填 target_id（亲吻对象）。仅在对话中可用。",
  check: function(ctx) { return false; },
  hint: function(ctx) {
    var target = ctx.companions[0];
    return target ? "亲吻 " + target.name : "亲吻对方";
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想亲吻对方但没找到人。" };
    }
    return {
      memory: "我亲吻了 " + target.name + "，心里泛起一阵暖意。",
      dialogRecord: ctx.self.name + " 亲吻了 " + target.name + "。",
      targetMemory: ctx.self.name + " 亲吻了我。",
      stateChanges: [
        { kind: "adjustMood", delta: 1 },
        { kind: "adjustStress", delta: -1 },
        { kind: "adjustSocialSatiety", delta: 1 }
      ]
    };
  },
  extraParams: { target_id: { type: "string", description: "亲吻对象角色 id。" } },
  extraRequired: ["target_id"],
  usableInDialogue: true
};

var caressAction = {
  type: "caress",
  duration: "instant",
  triggerHint: "抚摸可以安抚对方，增进感情。",
  paramRule: "必填 target_id（抚摸对象）。仅在对话中可用。",
  check: function(ctx) { return false; },
  hint: function(ctx) {
    var target = ctx.companions[0];
    return target ? "抚摸 " + target.name : "抚摸对方";
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想抚摸对方但没找到人。" };
    }
    return {
      memory: "我轻轻抚摸了 " + target.name + "，彼此都放松了下来。",
      dialogRecord: ctx.self.name + " 抚摸了 " + target.name + "。",
      targetMemory: ctx.self.name + " 轻轻抚摸了我。",
      stateChanges: [
        { kind: "adjustStress", delta: -1 },
        { kind: "adjustSocialSatiety", delta: 1 }
      ]
    };
  },
  extraParams: { target_id: { type: "string", description: "抚摸对象角色 id。" } },
  extraRequired: ["target_id"],
  usableInDialogue: true
};

var hugAction = {
  type: "hug",
  duration: "instant",
  triggerHint: "拥抱可以缓解压力，增进感情。",
  paramRule: "必填 target_id（拥抱对象）。仅在对话中可用。",
  check: function(ctx) { return false; },
  hint: function(ctx) {
    var target = ctx.companions[0];
    return target ? "拥抱 " + target.name : "拥抱对方";
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想拥抱对方但没找到人。" };
    }
    return {
      memory: "我拥抱了 " + target.name + "，感到彼此的连接更近了一些。",
      dialogRecord: ctx.self.name + " 拥抱了 " + target.name + "。",
      targetMemory: ctx.self.name + " 拥抱了我。",
      stateChanges: [
        { kind: "adjustMood", delta: 1 },
        { kind: "adjustStress", delta: -1 },
        { kind: "adjustSocialSatiety", delta: 1 }
      ]
    };
  },
  extraParams: { target_id: { type: "string", description: "拥抱对象角色 id。" } },
  extraRequired: ["target_id"],
  usableInDialogue: true
};

// ============================================================
// 新增恋爱互动 (7)
// ============================================================

var confessAction = {
  type: "confess",
  duration: "instant",
  triggerHint: "在想要向对方表明心意的关键时刻使用。选择安静而特别的场所——天台、河边樱花道、神社、展望台。",
  paramRule: "必填 target_id（告白对象）+ free_text（告白的话语）。需在 quiet 标签节点。",
  check: function(ctx) {
    return ctx.here.tags.indexOf("quiet") !== -1;
  },
  hint: function(ctx) {
    var target = ctx.companions[0];
    return target ? "向 " + target.name + " 告白" : "告白";
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我鼓起了勇气但对方不在身边。" };
    }
    return {
      memory: "我在" + ctx.here.name + "向 " + target.name + " 告白了。说出了：" + (input.free_text || "我喜欢你") + " ——这是我人生中最紧张也最释然的时刻。",
      dialogRecord: ctx.self.name + " 在" + ctx.here.name + "向 " + target.name + " 告白了。",
      targetMemory: ctx.self.name + " 在" + ctx.here.name + "向我告白了，他/她说：" + (input.free_text || "我喜欢你") + "。",
      stateChanges: [
        { kind: "adjustMood", delta: 2 },
        { kind: "adjustStress", delta: -2 },
        { kind: "adjustSocialSatiety", delta: 2 }
      ]
    };
  },
  extraParams: {
    target_id: { type: "string", description: "告白对象角色 id。" },
    free_text: { type: "string", description: "告白的话语。" }
  },
  extraRequired: ["target_id", "free_text"],
  usableInDialogue: true
};

var holdHandsAction = {
  type: "hold_hands",
  duration: "instant",
  triggerHint: "在并肩漫步或安静相处时，想迈出关系的第一步时使用。",
  paramRule: "必填 target_id（牵手对象）。需在 outdoor 标签节点。",
  check: function(ctx) {
    return ctx.here.tags.indexOf("outdoor") !== -1;
  },
  hint: function(ctx) {
    var target = ctx.companions[0];
    return target ? "牵 " + target.name + " 的手" : "牵手";
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想牵对方的手但没找到人。" };
    }
    return {
      memory: "我牵起了 " + target.name + " 的手。手心微微出汗——不知道谁先紧张的。",
      dialogRecord: ctx.self.name + " 牵起了 " + target.name + " 的手。",
      targetMemory: ctx.self.name + " 牵起了我的手。我能感觉到他/她的手心温度。",
      stateChanges: [
        { kind: "adjustMood", delta: 1 },
        { kind: "adjustStress", delta: -1 },
        { kind: "adjustSocialSatiety", delta: 1 }
      ]
    };
  },
  extraParams: { target_id: { type: "string", description: "牵手对象角色 id。" } },
  extraRequired: ["target_id"],
  usableInDialogue: true
};

var giveGiftAction = {
  type: "give_gift",
  duration: "instant",
  triggerHint: "在想要用物品表达心意时使用——生日、节日、或者只是想让对方知道你在想他/她。",
  paramRule: "必填 target_id（受礼者）+ free_text（礼物是什么）。",
  check: function(ctx) { return true; },
  hint: function(ctx) {
    var target = ctx.companions[0];
    return target ? "送礼物给 " + target.name : "送礼物";
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想送礼物但对方不在身边。" };
    }
    return {
      memory: "我把" + (input.free_text || "礼物") + "送给了 " + target.name + "。他/她收到时笑了。",
      dialogRecord: ctx.self.name + " 送给了 " + target.name + " " + (input.free_text || "一份礼物") + "。",
      targetMemory: ctx.self.name + " 送给了我" + (input.free_text || "一份礼物") + "。",
      stateChanges: [
        { kind: "adjustMood", delta: 1 },
        { kind: "adjustSocialSatiety", delta: 2 }
      ]
    };
  },
  extraParams: {
    target_id: { type: "string", description: "受礼者角色 id。" },
    free_text: { type: "string", description: "礼物是什么。" }
  },
  extraRequired: ["target_id", "free_text"],
  usableInDialogue: true
};

var inviteAction = {
  type: "invite",
  duration: 1,
  triggerHint: "想约对方一起去某个地方时使用——咖啡店、河边、祭典、一起回家。",
  paramRule: "必填 target_id（邀请对象）+ target_node_id（目的地）。",
  check: function(ctx) { return true; },
  hint: function(ctx) {
    var target = ctx.companions[0];
    if (!target) return null;
    return [
      { hint: "邀 " + target.name + " 去咖啡店", targetId: target.id, targetNodeId: "node-haru-no-ne" },
      { hint: "邀 " + target.name + " 去河边散步", targetId: target.id, targetNodeId: "node-riverside-path" },
      { hint: "邀 " + target.name + " 去神社", targetId: target.id, targetNodeId: "node-shrine" }
    ];
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想邀请对方但没找到人。" };
    }
    var targetNodeId = input.target_node_id;
    var reachable = ctx.reachable || [];
    var destination = reachable.find(function(n) { return n.id === targetNodeId; });
    var placeName = destination ? destination.name : (targetNodeId || "那个地方");
    return {
      memory: "我邀请了 " + target.name + " 一起去" + placeName + "。",
      dialogRecord: ctx.self.name + " 邀请了 " + target.name + " 一起去" + placeName + "。",
      targetMemory: ctx.self.name + " 邀请我一起去" + placeName + "。",
      stateChanges: [
        { kind: "adjustMood", delta: 1 },
        { kind: "adjustSocialSatiety", delta: 1 }
      ]
    };
  },
  extraParams: {
    target_id: { type: "string", description: "邀请对象角色 id。" },
    target_node_id: { type: "string", description: "目的地节点 id。" }
  },
  extraRequired: ["target_id", "target_node_id"],
  usableInDialogue: true
};

var writeLetterAction = {
  type: "write_letter",
  duration: 1,
  triggerHint: "在想要将无法当面说出的话写成文字时使用。适合内向或在远距离时表达心意。",
  paramRule: "必填 free_text（信的内容）。需在 quiet 标签节点。",
  check: function(ctx) {
    return ctx.here.tags.indexOf("quiet") !== -1;
  },
  hint: function(ctx) { return "写情书"; },
  execute: function(ctx, input) {
    return {
      memory: "我在" + ctx.here.name + "写了一封信。信里写着：" + (input.free_text || "我喜欢你") + " ——这些写在纸上的话，也许有一天会送到那个人手里。",
      stateChanges: [
        { kind: "adjustStress", delta: -1 }
      ]
    };
  },
  extraParams: { free_text: { type: "string", description: "信的内容。" } },
  extraRequired: ["free_text"],
  usableInDialogue: false
};

var comfortAction = {
  type: "comfort",
  duration: "instant",
  triggerHint: "在对方情绪低落或压力大的时候使用。有时候一个安静的陪伴比千言万语更有用。",
  paramRule: "必填 target_id（安慰对象）。需对方 stress ≥ 2 或 mood ≤ -1。",
  check: function(ctx) {
    var target = ctx.companions.find(function(c) {
      return (c.emotion && c.emotion.stress >= 2) || (c.emotion && c.emotion.mood <= -1);
    });
    return !!target;
  },
  hint: function(ctx) {
    var target = ctx.companions.find(function(c) {
      return (c.emotion && c.emotion.stress >= 2) || (c.emotion && c.emotion.mood <= -1);
    });
    return target ? "安慰 " + target.name : "安慰对方";
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想安慰对方但没找到人。" };
    }
    return {
      memory: "我安慰了 " + target.name + "。有时候不需要说什么——陪在旁边就够了。",
      dialogRecord: ctx.self.name + " 安慰了 " + target.name + "。",
      targetMemory: ctx.self.name + " 在我低落时安慰了我。只是简简单单地陪着我——但那就是我需要的一切。",
      stateChanges: [
        { kind: "adjustStress", delta: -2 },
        { kind: "adjustSocialSatiety", delta: 1 }
      ]
    };
  },
  extraParams: { target_id: { type: "string", description: "安慰对象角色 id。" } },
  extraRequired: ["target_id"],
  usableInDialogue: true
};

var teaseAction = {
  type: "tease",
  duration: "instant",
  triggerHint: "在和亲近的人开玩笑、逗对方时使用。适合青梅竹马、好友、以及——偷偷喜欢但不想被发现的人。",
  paramRule: "必填 target_id（捉弄对象）。需与对方 affection ≥ 1 或有 friend/classmate 关系。",
  check: function(ctx) {
    var target = ctx.companions[0];
    if (!target) return false;
    var rel = ctx.self.relations && ctx.self.relations[target.id];
    if (!rel) return false;
    var hasAffection = rel.affection >= 1;
    var hasKinds = rel.kinds && rel.kinds.some(function(k) {
      return k === "friend" || k === "classmate" || k === "neighbor";
    });
    return hasAffection || hasKinds;
  },
  hint: function(ctx) {
    var target = ctx.companions[0];
    return target ? "捉弄 " + target.name : "捉弄对方";
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想捉弄对方但没找到人。" };
    }
    var moodDelta = Math.random() < 0.7 ? 1 : -1;
    return {
      memory: "我捉弄了 " + target.name + " 一下。他/她" + (moodDelta > 0 ? "笑了——那是我最喜欢的表情。" : "好像有点生气——糟糕。"),
      dialogRecord: ctx.self.name + " 捉弄了 " + target.name + "。",
      targetMemory: ctx.self.name + " 捉弄了我。" + (moodDelta > 0 ? "虽然被捉弄了但挺开心的。" : "有点不爽——但也没真的生气。"),
      stateChanges: [
        { kind: "adjustMood", delta: moodDelta },
        { kind: "adjustSocialSatiety", delta: 1 }
      ]
    };
  },
  extraParams: { target_id: { type: "string", description: "捉弄对象角色 id。" } },
  extraRequired: ["target_id"],
  usableInDialogue: true
};

// ============================================================
// 校园特有 (2)
// ============================================================

var studyTogetherAction = {
  type: "study_together",
  duration: 3,
  triggerHint: "在想要和对方一起备考或学习时使用。图书馆或教室的安静时光——最适合关系的自然升温。",
  paramRule: "必填 target_id（学习同伴）。需在 education 或 quiet 标签节点。",
  check: function(ctx) {
    var hasEdu = ctx.here.tags.indexOf("education") !== -1;
    var hasQuiet = ctx.here.tags.indexOf("quiet") !== -1;
    return hasEdu || hasQuiet;
  },
  hint: function(ctx) {
    var target = ctx.companions[0];
    return target ? "和 " + target.name + " 一起学习" : "一起学习";
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想找对方一起学习但没找到人。" };
    }
    return {
      memory: "我和 " + target.name + " 在" + ctx.here.name + "一起学习了三个小时。中间休息了两次——一次是讨论题目，一次是只是看着窗外发呆。",
      dialogRecord: ctx.self.name + " 和 " + target.name + " 在" + ctx.here.name + "一起学习。",
      targetMemory: ctx.self.name + " 和我一起在" + ctx.here.name + "学习。他/她教我那道题的时候离得很近。",
      stateChanges: [
        { kind: "adjustMood", delta: 1 },
        { kind: "adjustSocialSatiety", delta: 1 }
      ]
    };
  },
  extraParams: { target_id: { type: "string", description: "学习同伴角色 id。" } },
  extraRequired: ["target_id"],
  usableInDialogue: false
};

var walkHomeAction = {
  type: "walk_home",
  duration: 2,
  triggerHint: "放学后邀请对方一起走过樱花道回家。最日常的互动——也最容易在不知不觉中拉近距离。",
  paramRule: "必填 target_id（同行者）。需在 outdoor 标签节点。",
  check: function(ctx) {
    return ctx.here.tags.indexOf("outdoor") !== -1;
  },
  hint: function(ctx) {
    var target = ctx.companions[0];
    return target ? "和 " + target.name + " 一起回家" : "一起回家";
  },
  execute: function(ctx, input) {
    var targetId = input.target_id;
    var target = ctx.companions.find(function(c) { return c.id === targetId; });
    if (!target) {
      return { memory: "我想找对方一起回家但没找到人。" };
    }
    return {
      memory: "我和 " + target.name + " 一起走过了樱花道。今天的樱花比昨天开得又多了一些——走慢一点也没关系。",
      dialogRecord: ctx.self.name + " 和 " + target.name + " 一起沿着樱花道回家。",
      targetMemory: ctx.self.name + " 和我一起走过了樱花道。我们聊了很多——有些话我记得很清楚，有些只是因为那个人的声音很好听。",
      stateChanges: [
        { kind: "adjustMood", delta: 1 },
        { kind: "adjustStress", delta: -1 },
        { kind: "adjustSocialSatiety", delta: 1 }
      ]
    };
  },
  extraParams: { target_id: { type: "string", description: "同行者角色 id。" } },
  extraRequired: ["target_id"],
  usableInDialogue: false
};

module.exports = [
  kissAction, caressAction, hugAction,
  confessAction,
  holdHandsAction,
  giveGiftAction,
  inviteAction,
  writeLetterAction,
  comfortAction,
  teaseAction,
  studyTogetherAction,
  walkHomeAction
];
```

- [ ] **Step 2: Validate actions.js structure**

```bash
node -e "
var defs = require('./configs/maps/sakurano-miya/actions.js');
var arr = Array.isArray(defs) ? defs : (defs.default || []);
for (var i = 0; i < arr.length; i++) {
  var d = arr[i];
  var errors = [];
  if (!d.type) errors.push('type');
  if (d.duration === undefined || d.duration === null) errors.push('duration');
  if (!d.check) errors.push('check');
  if (!d.hint) errors.push('hint');
  if (!d.execute) errors.push('execute');
  if (!d.triggerHint) errors.push('triggerHint');
  if (!d.paramRule) errors.push('paramRule');
  if (errors.length) {
    console.error('MISSING in ' + (d.type || '?') + ': ' + errors.join(', '));
  } else {
    console.log('OK: ' + d.type + ' (' + d.duration + ')');
  }
}
console.log('Total: ' + arr.length + ' actions');
"
```
Expected: All 12 actions pass with OK, Total: 12 actions.

- [ ] **Step 3: Commit**

```bash
git add configs/maps/sakurano-miya/actions.js
git commit -m "feat: add sakurano-miya actions (9 new + 3 from sakuraba)"
```

---

### Task 7: Write events.json (10 events)

**Files:**
- Create: `configs/maps/sakurano-miya/events.json`

- [ ] **Step 1: Write events.json**

Write `configs/maps/sakurano-miya/events.json`:
```json
[
  {
    "id": "entrance-ceremony",
    "name": "入学式",
    "description": "新学期开始，新生入学。樱花满开，高中正门前的樱花瓣飘落在新生制服上。桜井陽翔作为生徒会长在台上致辞——台下的小春抬头看着他，觉得这个学校好像会有好事发生。",
    "start": "04-07",
    "end": "04-07"
  },
  {
    "id": "sports-festival",
    "name": "体育祭",
    "description": "高中间红白对决！操场上一整天都是加油声和喇叭声。千夏在接力赛中担任最后一棒——她的冲刺让红组反败为胜。優翔的野球部表演赛吸引了全校的目光。午休时大家在操场边吃便当——朱里带着大学的朋友来给弟弟加油。",
    "start": "05-15",
    "end": "05-16"
  },
  {
    "id": "tanabata",
    "name": "七夕",
    "description": "神社里挂起了竹枝，町民们在短册上写下心愿。陽菜在短册上写了一个人的名字但没挂上去——折好放进了口袋里。朱里写了「希望我的筝能弹得更好」挂在最高的枝上。藤村神主看着满树的短册，想到了四十年前第一次挂的愿望。",
    "start": "07-07",
    "end": "07-07"
  },
  {
    "id": "summer-festival",
    "name": "夏祭·花火大会",
    "description": "一年中最盛大的夜晚。露天集市广场亮起灯笼，商店街摆出路边摊——章鱼烧、刨冰、金鱼捞。朱里和陽菜穿着浴衣手牵手逛摊位。楓在咖啡店的窗边看着外面的人流——直到蓮把他拉出去'社交一下'。花火在河面上空绽开时，河边樱花道上站满了仰望天空的人。優翔和小春站在同一棵樱树下——他想说点什么但烟花太响。真昼在人群中看见了楓的侧脸。",
    "start": "08-01",
    "end": "08-01"
  },
  {
    "id": "culture-festival",
    "name": "文化祭",
    "description": "高中文化祭两天！各班级和社团全力准备——3年A班做鬼屋（千夏负责吓人，悠斗负责做声效机关），美术部办画展（真昼的油画占最佳位置），学生会办咖啡店（陽翔穿着围裙的样子让一年生们议论纷纷）。大学サークル在サークル栋也有展示——朱里的筝曲演奏和湊的昆虫标本展在同一天。陽菜在书店加班——文化祭期间的参考书需求量翻倍。",
    "start": "10-20",
    "end": "10-21"
  },
  {
    "id": "christmas",
    "name": "圣诞节",
    "description": "商店街亮起灯饰。「はるのね」推出限定圣诞蛋糕——楓负责装饰（他手很稳）。佐藤店主给每个来店的客人准备了小礼物。大学考试周刚结束——蓮和楓在咖啡店交换了礼物（蓮送楓一套六角扳手，楓送蓮一本工程伦理的参考书——很符合他们）。陽菜在书店加班到闭店——她悄悄在蓮经常翻的那本工程杂志里夹了一张圣诞卡。",
    "start": "12-24",
    "end": "12-24"
  },
  {
    "id": "new-year",
    "name": "初诣",
    "description": "新年第一天。藤村神主凌晨四点就起来扫神社参道——这是他四十年的习惯。町民们陆续来参拜、抽签、喝甜酒。陽翔和朱里一家人来参拜——陽翔抽到大吉但他更在意真昼今年抽到了什么。千夏在签上写了「金」——目标是今年夏天县大会金牌。悠斗抽到末吉——湊说'以你的运气这个已经不错了'然后被弟弟瞪了一眼。",
    "start": "01-01",
    "end": "01-01"
  },
  {
    "id": "valentine",
    "name": "情人节",
    "description": "情人节。巧克力在书包里、便当袋里、放学后的鞋箱里。千夏在理科室门口等了二十分钟终于把本命巧克力塞给了悠斗——他收下时表情像是在分析巧克力成分。真昼做了一份抹茶松露——犹豫了一整天，最后放在了「はるのね」的吧台上然后跑走了。陽菜做了巧克力曲奇——和去年一样，還是没有送出去。小春一大早把巧克力放在優翔的鞋箱里——被同班的男生发现了，優翔追着那个男生跑了一个午休。",
    "start": "02-14",
    "end": "02-14"
  },
  {
    "id": "graduation",
    "name": "毕业式",
    "description": "高中三年生和大学四年生的毕业日。陽翔作为毕业生代表在体育馆台上致辞——这一次他的话里没有了'首先其次'的格式，只有真心。真昼穿着制服最后一次走过美术室——她的画被学校永久收藏，画架空了。楓拿到了医師国家試験的合格通知——这意味着他要离开这个镇去县立医院了。在毕业式后的咖啡店里，真昼和楓第一次面对面说了比'抹茶拿铁加可可粉'更长的话。",
    "start": "03-15",
    "end": "03-15"
  },
  {
    "id": "sakura-festival",
    "name": "樱ノ宫祭",
    "description": "町最大祭典。丘陵顶端百年垂樱满开——全镇人聚集在树下铺开蓝色塑料布。露天集市广场有食物摊、游戏摊、和纸灯笼。藤村神主主持奉纳演奏——朱里的筝是压轴曲目。夜幕降临时，垂樱被灯光照亮——树下是全镇人的笑脸。新一年的入学和相遇即将开始。",
    "start": "04-01",
    "end": "04-03"
  }
]
```

- [ ] **Step 2: Validate events.json**

```bash
# Basic JSON parse check
node -e "var e = require('./configs/maps/sakurano-miya/events.json'); console.log('Events:', e.length); e.forEach(function(ev) { console.log('  ' + ev.id + ': ' + ev.start + ' ~ ' + ev.end); });"
```
Expected: Events: 10, each with id and date range.

- [ ] **Step 3: Commit**

```bash
git add configs/maps/sakurano-miya/events.json
git commit -m "feat: add sakurano-miya events (10 seasonal events)"
```

---

### Task 8: Final integration validation

**Files:**
- Verify: `configs/maps/sakurano-miya/manifest.json`
- Verify: `configs/maps/sakurano-miya/map.json`
- Verify: `configs/maps/sakurano-miya/characters/*.json` (13 files)
- Verify: `configs/maps/sakurano-miya/actions.js`
- Verify: `configs/maps/sakurano-miya/events.json`

- [ ] **Step 1: Validate ALL files**

```bash
echo "=== Manifest ==="
npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/sakurano-miya/manifest.json
echo ""
echo "=== Map ==="
npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/sakurano-miya/map.json
echo ""
echo "=== Characters ==="
for f in configs/maps/sakurano-miya/characters/*.json; do
  npx tsx .claude/skills/agent-world-mod/scripts/validate.ts "$f" || exit 1
done
echo ""
echo "=== Actions ==="
node -e "
var defs = require('./configs/maps/sakurano-miya/actions.js');
var arr = Array.isArray(defs) ? defs : (defs.default || []);
console.log('Actions:', arr.length, '(expect 12)');
for (var i = 0; i < arr.length; i++) {
  var d = arr[i];
  if (!d.type || !d.triggerHint || !d.paramRule) {
    console.error('FAIL:', d.type || '?');
    process.exit(1);
  }
}
console.log('All actions validated.');
"
echo ""
echo "=== Events ==="
node -e "var e = require('./configs/maps/sakurano-miya/events.json'); console.log('Events:', e.length, '(expect 10)');"
echo ""
echo "=== All checks passed ==="
```
Expected: All validations pass with no errors.

- [ ] **Step 2: Count and verify files**

```bash
echo "=== File count ==="
echo "Characters: $(ls configs/maps/sakurano-miya/characters/*.json | wc -l) (expect 13)"
echo "Nodes: $(grep -c '"id": "node-' configs/maps/sakurano-miya/map.json) (expect 55)"
echo ""
echo "=== Map invariants ==="
echo "Root nodes: $(grep -c '"parentId": null' configs/maps/sakurano-miya/map.json) (expect 1)"
echo "Entry nodes: $(grep -c '"isEntry": true' configs/maps/sakurano-miya/map.json) (expect >=1)"
echo "Bathing nodes: $(grep -c '"bathing"' configs/maps/sakurano-miya/map.json) (expect >=1)"
echo ""
echo "=== Content summary ==="
echo "Total files: $(find configs/maps/sakurano-miya -type f | wc -l) (expect 18)"
```
Expected: 13 characters, 55 nodes, 1 root, ≥1 entry, ≥1 bathing, 18 total files (manifest + map + actions + events + 13 characters + 1 directory).

- [ ] **Step 3: Final commit**

```bash
git add configs/maps/sakurano-miya/
git status
git commit -m "feat: complete sakurano-miya mod — 55 nodes, 13 characters, 12 actions, 10 events

日式校园恋爱mod「樱ノ宫」。高中+大学共栖的学园小镇。
所有13名角色均为本地人(origin:local)。
保留sakuraba的kiss/caress/hug，新增9个恋爱/校园actions。
10个季节性事件覆盖全年学园日历。

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
Expected: Clean commit with all 17 files (plus directories).
```

---

## Self-Review Checklist

Before considering the plan ready, verify:

1. **Spec coverage**: Each spec section maps to a task:
   - Map design → Task 2
   - Character design (13 people) → Tasks 3-5
   - Actions design (12 actions) → Task 6
   - Events design (10 events) → Task 7
   - Manifest + assembly → Task 1 + Task 8

2. **No placeholders**: All code is complete — every JSON file, every JS action, every validation command is written out.

3. **Type consistency**: 
   - All character IDs use `char-` prefix, kebab-case
   - All node IDs use `node-` prefix, kebab-case
   - All action types are `snake_case`
   - Relations reference existing character IDs in the same pack
   - All tags from `NODE_TAGS` enum ✓
   - All professions from `PROFESSIONS` enum ✓
   - All relation kinds from `OBJECTIVE_RELATION_KINDS` enum ✓

4. **Invariants verified** per task:
   - Map: 1 root, ≥1 entry, ≥1 bathing, tree integrity, unique ids ✓
   - Characters: origin checked, economy balanced, no runtime fields ✓
   - Actions: triggerHint + paramRule present, CommonJS format ✓
   - Language: all text in zh ✓
