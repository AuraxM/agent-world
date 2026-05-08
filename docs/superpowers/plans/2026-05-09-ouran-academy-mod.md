# 樱兰学园 Mod Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `ouran-academy` scene mod — 29 nodes, 30 characters, 6 custom dialogue actions for a Japanese private academy love-drama simulation.

**Architecture:** Pure content mod under `backend/scenes/ouran-academy/`. No engine changes. All JSON validated against backend Zod schemas; actions.js is CommonJS evaluated at runtime.

**Tech Stack:** JSON (Zod-validated), CommonJS JavaScript (bare Function constructor for actions)

---

### Task 1: Create scene directory, manifest.json

**Files:**
- Create: `backend/scenes/ouran-academy/manifest.json`

- [ ] **Step 1: Create directory**

```bash
mkdir -p backend/scenes/ouran-academy/characters
```

- [ ] **Step 2: Write manifest.json**

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
    "tierMultipliers": { "high": 1.5, "medium": 1.0, "low": 0.6, "none": 0 }
  }
}
```

- [ ] **Step 3: Validate manifest.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/manifest.json
```
Expected: `✓ ... passes ManifestSchema`

- [ ] **Step 4: Commit**

```bash
git add backend/scenes/ouran-academy/manifest.json
git commit -m "feat(ouran-academy): add manifest.json"
```

---

### Task 2: Create map.json (29 nodes)

**Files:**
- Create: `backend/scenes/ouran-academy/map.json`

- [ ] **Step 1: Write map.json**

Key layout decisions:
- Root (`campus-root`) contains all other nodes at w=60 h=48
- Academic zone left/top, outdoor center, sports lower-left, life facilities lower-mid, surrounding right column
- 5 child nodes nested under parents (rooftop-blind, library-archive, gym-storage, nurse-bed, residential-bath)
- Entry: `node-gate` at bottom-center
- Bathing: `node-residential-bath` under residential

```json
{
  "id": "ouran-academy",
  "nodes": [
    {
      "id": "campus-root",
      "parentId": null,
      "name": "樱兰私立学园",
      "description": "都市近郊的私立学园，樱花与混凝土的混合体。",
      "tags": [],
      "capacity": null,
      "privacy": "public",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 0, "y": 0, "w": 60, "h": 48,
      "spriteKey": "school"
    },
    {
      "id": "node-gate",
      "parentId": "campus-root",
      "name": "校门/巴士站",
      "description": "樱花树下的正门，巴士站牌旁常年聚集等车的学生。",
      "tags": ["outdoor", "street"],
      "capacity": 30,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": true,
      "travelCost": 0,
      "x": 24, "y": 42, "w": 12, "h": 6,
      "spriteKey": "school"
    },
    {
      "id": "node-sakura-slope",
      "parentId": "campus-root",
      "name": "樱花坂道",
      "description": "从校门延伸上来的斜坡，两侧种满染井吉野樱，花瓣在风中不断飘落。",
      "tags": ["outdoor", "street"],
      "capacity": 30,
      "privacy": "public",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 22, "y": 34, "w": 16, "h": 8,
      "spriteKey": "park"
    },
    {
      "id": "node-courtyard",
      "parentId": "campus-root",
      "name": "中庭喷泉广场",
      "description": "校园中心的开放广场，中央有一座小喷泉，四周散落着长椅。",
      "tags": ["outdoor"],
      "capacity": 50,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 18, "y": 20, "w": 24, "h": 14,
      "spriteKey": "playground"
    },
    {
      "id": "node-rooftop",
      "parentId": "campus-root",
      "name": "屋顶天台",
      "description": "教学栋顶楼的开放天台，风吹得很大，可以俯瞰整个校园。",
      "tags": ["outdoor"],
      "capacity": 15,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 48, "y": 2, "w": 12, "h": 10,
      "spriteKey": "school"
    },
    {
      "id": "node-rooftop-blind",
      "parentId": "node-rooftop",
      "name": "屋顶水箱后",
      "description": "天台角落，高大的水箱遮挡了所有视线。地面上散落着几个烟蒂和空饮料罐。",
      "tags": ["outdoor"],
      "capacity": 4,
      "privacy": "private",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 2, "y": 2, "w": 4, "h": 6,
      "spriteKey": "fallback"
    },
    {
      "id": "node-garden",
      "parentId": "campus-root",
      "name": "后庭园艺角",
      "description": "被忽视的角落，杂草和野花混在一起，有一张生锈的铁制长椅藏在灌木丛后。",
      "tags": ["outdoor"],
      "capacity": 8,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 48, "y": 14, "w": 10, "h": 8,
      "spriteKey": "park"
    },
    {
      "id": "node-class-2a",
      "parentId": "campus-root",
      "name": "2-A 教室",
      "description": "二楼走廊尽头的教室。窗外能看到樱花坂道，书桌排列整齐，黑板上的值日生名字还没擦。",
      "tags": ["indoor", "education"],
      "capacity": 30,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 2, "y": 2, "w": 12, "h": 10,
      "spriteKey": "classroom"
    },
    {
      "id": "node-class-2b",
      "parentId": "campus-root",
      "name": "2-B 教室",
      "description": "一楼近中庭的教室。窗外正对喷泉广场，午后的阳光斜照进来，课桌上留下窗棂的影子。",
      "tags": ["indoor", "education"],
      "capacity": 30,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 16, "y": 2, "w": 12, "h": 10,
      "spriteKey": "classroom"
    },
    {
      "id": "node-teachers-office",
      "parentId": "campus-root",
      "name": "教师办公室",
      "description": "隔成小间的教师办公区，每张桌上堆满试卷和教案。咖啡机放在角落，空气里有旧书和墨水的气味。",
      "tags": ["indoor"],
      "capacity": 10,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 30, "y": 2, "w": 8, "h": 10,
      "spriteKey": "classroom"
    },
    {
      "id": "node-science-lab",
      "parentId": "campus-root",
      "name": "理科室",
      "description": "实验台排列整齐，烧杯、酒精灯和人体骨架模型填满了架子和橱窗。",
      "tags": ["indoor", "education"],
      "capacity": 20,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 2, "y": 14, "w": 10, "h": 8,
      "spriteKey": "classroom"
    },
    {
      "id": "node-music-room",
      "parentId": "campus-root",
      "name": "音乐室",
      "description": "一架三角钢琴占据中央，墙上贴着音乐史的海报，角落的谱架还摊开着没合上的乐谱。",
      "tags": ["indoor", "education"],
      "capacity": 15,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 14, "y": 14, "w": 10, "h": 8,
      "spriteKey": "classroom"
    },
    {
      "id": "node-library",
      "parentId": "campus-root",
      "name": "图书室",
      "description": "高至天花板的书架成排而立，阳光从高窗洒下，尘埃在光束中缓慢漂浮。",
      "tags": ["indoor", "education", "quiet"],
      "capacity": 25,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 26, "y": 14, "w": 12, "h": 8,
      "spriteKey": "classroom"
    },
    {
      "id": "node-library-archive",
      "parentId": "node-library",
      "name": "图书室档案区",
      "description": "最里面的几排旧书架，过期的校刊和年鉴堆到天花板，光线昏暗，很少有人来。",
      "tags": ["indoor", "quiet"],
      "capacity": 4,
      "privacy": "private",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 2, "y": 2, "w": 4, "h": 5,
      "spriteKey": "fallback"
    },
    {
      "id": "node-practice-room",
      "parentId": "campus-root",
      "name": "音乐练习室",
      "description": "四叠半的隔音单间，吸音棉贴在墙上，一把旧吉他靠在墙角。关上门后外面的世界就消失了。",
      "tags": ["indoor", "quiet"],
      "capacity": 3,
      "privacy": "private",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 40, "y": 14, "w": 6, "h": 8,
      "spriteKey": "fallback"
    },
    {
      "id": "node-abandoned-class",
      "parentId": "campus-root",
      "name": "废弃教室",
      "description": "旧校舍翼楼的一间闲置教室。桌椅堆在角落，窗帘永远拉着，黑板上还残留着多年前的粉笔字迹。传闻中这里是告白圣地。",
      "tags": ["indoor"],
      "capacity": 6,
      "privacy": "private",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 48, "y": 14, "w": 6, "h": 8,
      "spriteKey": "fallback"
    },
    {
      "id": "node-gym",
      "parentId": "campus-root",
      "name": "体育馆",
      "description": "巨大的室内空间，篮球架收在墙边，木地板上留着运动鞋的擦痕。空气里有汗水、橡胶和消毒水的气味。",
      "tags": ["indoor", "playground"],
      "capacity": 60,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 2, "y": 26, "w": 18, "h": 12,
      "spriteKey": "playground"
    },
    {
      "id": "node-gym-storage",
      "parentId": "node-gym",
      "name": "器材室",
      "description": "体育馆角落的器材间。跳箱、体操垫、球网堆在一起，光线幽暗，只有一扇小通风窗。",
      "tags": ["indoor"],
      "capacity": 4,
      "privacy": "private",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 3, "y": 2, "w": 4, "h": 4,
      "spriteKey": "fallback"
    },
    {
      "id": "node-pool",
      "parentId": "campus-root",
      "name": "游泳池",
      "description": "露天泳池，水面在阳光下闪闪发光。五月的池水还带着凉意，池边瓷砖的缝隙里长着青苔。",
      "tags": ["outdoor", "playground"],
      "capacity": 30,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 22, "y": 26, "w": 14, "h": 10,
      "spriteKey": "playground"
    },
    {
      "id": "node-locker-room",
      "parentId": "campus-root",
      "name": "更衣室",
      "description": "体育栋附设的更衣室。一排排铁制储物柜，长条木椅，淋浴间的水声从隔壁传来。",
      "tags": ["indoor"],
      "capacity": 10,
      "privacy": "private",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 38, "y": 26, "w": 6, "h": 10,
      "spriteKey": "fallback"
    },
    {
      "id": "node-club-building",
      "parentId": "campus-root",
      "name": "部室楼",
      "description": "社团用的三栋连排平房。每扇门后面是不同的世界——演剧部的衣架和镜子、科学部的培养皿、文艺部的打字机。",
      "tags": ["indoor"],
      "capacity": 30,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 46, "y": 26, "w": 10, "h": 10,
      "spriteKey": "classroom"
    },
    {
      "id": "node-cafeteria",
      "parentId": "campus-root",
      "name": "食堂/咖啡厅",
      "description": "午休时最热闹的地方。咖喱饭的香气和咖啡的苦味混在一起，有人排队买炒面面包，有人挤在靠窗的卡座刷手机。",
      "tags": ["indoor", "dining"],
      "capacity": 40,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 2, "y": 40, "w": 16, "h": 8,
      "spriteKey": "restaurant"
    },
    {
      "id": "node-nurse",
      "parentId": "campus-root",
      "name": "保健室",
      "description": "三张白铁床排成一排，药柜里整齐码放绷带和药瓶。空气中弥漫着消毒酒精和薄荷膏的味道。",
      "tags": ["indoor"],
      "capacity": 6,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 20, "y": 40, "w": 10, "h": 8,
      "spriteKey": "school"
    },
    {
      "id": "node-nurse-bed",
      "parentId": "node-nurse",
      "name": "保健室床位区",
      "description": "最里面那张床，被白色布帘隔开。枕头上有来苏水的气味，午休时阳光从窗帘缝隙漏进来。",
      "tags": ["indoor"],
      "capacity": 2,
      "privacy": "private",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 2, "y": 2, "w": 3, "h": 5,
      "spriteKey": "fallback"
    },
    {
      "id": "node-convenience",
      "parentId": "campus-root",
      "name": "便利店",
      "description": "校门对面 50 米的便利商店。冰柜嗡嗡作响，杂志架上摆满漫画周刊，关东煮的锅在收银台旁咕嘟咕嘟冒热气。",
      "tags": ["indoor"],
      "capacity": 10,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 38, "y": 40, "w": 8, "h": 8,
      "spriteKey": "restaurant"
    },
    {
      "id": "node-diner",
      "parentId": "campus-root",
      "name": "家庭餐厅",
      "description": "放学后学生常去的连锁家庭餐厅。塑料菜单夹在桌角，饮料吧无限续杯，靠窗的座位能看街景。",
      "tags": ["indoor", "dining"],
      "capacity": 20,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 1,
      "x": 48, "y": 40, "w": 10, "h": 8,
      "spriteKey": "restaurant"
    },
    {
      "id": "node-residential",
      "parentId": "campus-root",
      "name": "住宅区",
      "description": "学园附近的住宅街。一户建和低层公寓交错，傍晚时分窗口亮起暖黄色的灯光。",
      "tags": ["outdoor", "residence"],
      "capacity": 50,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 1,
      "x": 48, "y": 28, "w": 12, "h": 10,
      "spriteKey": "home-warm"
    },
    {
      "id": "node-residential-bath",
      "parentId": "node-residential",
      "name": "住宅区浴室",
      "description": "一户建二楼的浴室。更衣篮、花洒、注满热水的浴缸，镜子上蒙着一层水汽。",
      "tags": ["indoor", "private", "residence", "bathing"],
      "capacity": 2,
      "privacy": "private",
      "visibleFromParent": false,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 0,
      "x": 2, "y": 2, "w": 4, "h": 4,
      "spriteKey": "home-warm"
    },
    {
      "id": "node-shrine",
      "parentId": "campus-root",
      "name": "神社",
      "description": "学园背后小丘上的稻荷神社。朱红色鸟居沿着石阶排列，本殿小而安静，风铃在屋檐下响。只有风吹树叶和远处操场的模糊声响。",
      "tags": ["outdoor", "quiet"],
      "capacity": 15,
      "privacy": "semi",
      "visibleFromParent": true,
      "shortcuts": [],
      "isEntry": false,
      "travelCost": 1,
      "x": 48, "y": 38, "w": 12, "h": 6,
      "spriteKey": "park"
    }
  ]
}
```

- [ ] **Step 2: Validate map.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/map.json
```
Expected: `✓ ... passes MapConfigSchema`

- [ ] **Step 3: Commit**

```bash
git add backend/scenes/ouran-academy/map.json
git commit -m "feat(ouran-academy): add map.json (29 nodes, 8 private spaces)"
```

---

### Task 3: Create actions.js (6 dialogue actions)

**Files:**
- Create: `backend/scenes/ouran-academy/actions.js`

- [ ] **Step 1: Write actions.js**

```js
module.exports = [
  // ── hold_hands: 牵手 ──
  {
    type: "hold_hands",
    duration: "instant",
    triggerHint: "与有好感的人并肩行走时，用牵手传递温度与试探。",
    paramRule: "必填 target_id（牵手对象）+ 可选 free_text（牵手时想说的话）。",
    usableInDialogue: true,

    check(ctx) { return true; },

    hint(ctx) {
      return ctx.companions.map(c => {
        const rel = ctx.self.relations[c.id];
        const label = rel ? rel.kinds.join("/") : "";
        return { hint: `牵手 ${c.name}${label ? ` (${label})` : ""}`, targetId: c.id };
      });
    },

    validateParams(input, ctx) {
      if (!input.target_id) return "hold_hands 需要指定 target_id（牵手对象）";
      const target = ctx.companions.find(c => c.id === input.target_id);
      if (!target) return `target_id="${input.target_id}" 不在身边，无法牵手`;
      return null;
    },

    execute(ctx, input) {
      const targetId = input.target_id;
      const target = ctx.companions.find(c => c.id === targetId);
      if (!target) return { memory: "我想牵对方的手，但对方不在身边。" };
      const words = input.free_text ? `，对ta说"${input.free_text}"` : "";
      return {
        memory: `我牵起 ${target.name} 的手，指尖穿过ta的指缝，掌心贴在一起。ta的手比我想象中更暖，微微颤了一下，没有抽开。${words}`,
        targetMemory: `${ctx.self.name} 牵起我的手，十指交扣。ta的掌心干燥而温热，拇指轻轻摩挲着我的手背。${input.free_text ? ` ta对我说"${input.free_text}"` : ""}`,
        event: { category: "social", description: `${ctx.self.name} 牵起了 ${target.name} 的手。`, intensity: 2, scope: "node" },
        stateChanges: [
          { kind: "adjustMood", delta: 1 },
          { kind: "adjustStress", delta: -1 },
          { kind: "adjustSocialSatiety", delta: 1 },
        ],
        dialogRecord: `${ctx.self.name} 牵起了 ${target.name} 的手。`,
      };
    },

    extraParams: {
      target_id: { type: "string", description: "牵手对象角色 id。" },
      free_text: { type: "string", description: "牵手时说的话（可选）。" },
    },
    extraRequired: ["target_id"],
  },

  // ── pat_head: 摸头 ──
  {
    type: "pat_head",
    duration: "instant",
    triggerHint: "想宠溺对方、或借身高差调戏时，揉乱ta的头发。",
    paramRule: "必填 target_id（摸头对象）+ 可选 free_text。",
    usableInDialogue: true,

    check(ctx) { return true; },

    hint(ctx) {
      return ctx.companions.map(c => {
        const rel = ctx.self.relations[c.id];
        const label = rel ? rel.kinds.join("/") : "";
        return { hint: `摸头 ${c.name}${label ? ` (${label})` : ""}`, targetId: c.id };
      });
    },

    validateParams(input, ctx) {
      if (!input.target_id) return "pat_head 需要指定 target_id（摸头对象）";
      const target = ctx.companions.find(c => c.id === input.target_id);
      if (!target) return `target_id="${input.target_id}" 不在身边，无法摸头`;
      return null;
    },

    execute(ctx, input) {
      const targetId = input.target_id;
      const target = ctx.companions.find(c => c.id === targetId);
      if (!target) return { memory: "我想揉对方的头发，但对方不在身边。" };
      const words = input.free_text ? `，对ta说"${input.free_text}"` : "";
      return {
        memory: `我把手放在 ${target.name} 的头顶，轻轻揉了揉。ta的头发比看起来更软，穿过我的指缝。ta抬头看我，那个表情让我胸口一紧。${words}`,
        targetMemory: `${ctx.self.name} 揉了我的头发。动作很轻，但手掌的重量让人安心又被当成小孩的微妙不甘。${input.free_text ? ` ta对我说"${input.free_text}"` : ""}`,
        event: { category: "social", description: `${ctx.self.name} 揉了揉 ${target.name} 的头发。`, intensity: 2, scope: "node" },
        stateChanges: [
          { kind: "adjustMood", delta: 1 },
          { kind: "adjustStress", delta: -1 },
          { kind: "adjustSocialSatiety", delta: 1 },
        ],
        dialogRecord: `${ctx.self.name} 揉了揉 ${target.name} 的头发。`,
      };
    },

    extraParams: {
      target_id: { type: "string", description: "摸头对象角色 id。" },
      free_text: { type: "string", description: "摸头时说的话（可选）。" },
    },
    extraRequired: ["target_id"],
  },

  // ── caress: 抚摸 ──
  {
    type: "caress",
    duration: "instant",
    triggerHint: "独处、气氛暧昧、体温升高时，手掌在对方身体上游走，从肩膀到腰线，隔着制服感受肌肤的弧度与热度。",
    paramRule: "必填 target_id（抚摸对象）+ 可选 free_text。",
    usableInDialogue: true,

    check(ctx) { return true; },

    hint(ctx) {
      return ctx.companions.map(c => {
        const rel = ctx.self.relations[c.id];
        const label = rel ? rel.kinds.join("/") : "";
        return { hint: `抚摸 ${c.name}${label ? ` (${label})` : ""}`, targetId: c.id };
      });
    },

    validateParams(input, ctx) {
      if (!input.target_id) return "caress 需要指定 target_id（抚摸对象）";
      const target = ctx.companions.find(c => c.id === input.target_id);
      if (!target) return `target_id="${input.target_id}" 不在身边，无法抚摸`;
      return null;
    },

    execute(ctx, input) {
      const targetId = input.target_id;
      const target = ctx.companions.find(c => c.id === targetId);
      if (!target) return { memory: "我想抚摸对方，但对方不在身边。" };
      const words = input.free_text ? `我在ta耳边低声说："${input.free_text}"` : "";
      return {
        memory: `我抚摸着 ${target.name}。手掌从ta的肩膀滑下，经过背脊的凹陷，停在腰侧。隔着一层薄薄的衬衫，我能感觉到ta体温在升高，肌肉在我指尖下微微绷紧又放松。呼吸声变重了。${words}`,
        targetMemory: `${ctx.self.name} 的手在我身上游走。从肩膀到腰，缓慢而用力。我想说停下，但身体没有躲——那种被需要的感觉烧穿了理智。${input.free_text ? ` ta在我耳边说"${input.free_text}"` : ""}`,
        event: { category: "social", description: `${ctx.self.name} 抚摸着 ${target.name}。`, intensity: 3, scope: "private" },
        stateChanges: [
          { kind: "adjustMood", delta: 2 },
          { kind: "adjustStress", delta: -2 },
          { kind: "adjustSocialSatiety", delta: 2 },
        ],
        dialogRecord: `${ctx.self.name} 的手在 ${target.name} 身上游走，从肩膀滑到腰侧。`,
      };
    },

    extraParams: {
      target_id: { type: "string", description: "抚摸对象角色 id。" },
      free_text: { type: "string", description: "抚摸时说的话（可选）。" },
    },
    extraRequired: ["target_id"],
  },

  // ── unbutton: 解开纽扣 ──
  {
    type: "unbutton",
    duration: "instant",
    triggerHint: "私密空间中情欲高涨，指尖一颗颗挑开对方衣扣，露出锁骨与胸口。",
    paramRule: "必填 target_id（对象）+ 可选 free_text。",
    usableInDialogue: true,

    check(ctx) { return true; },

    hint(ctx) {
      return ctx.companions.map(c => {
        const rel = ctx.self.relations[c.id];
        const label = rel ? rel.kinds.join("/") : "";
        return { hint: `解开 ${c.name} 的纽扣${label ? ` (${label})` : ""}`, targetId: c.id };
      });
    },

    validateParams(input, ctx) {
      if (!input.target_id) return "unbutton 需要指定 target_id（对象）";
      const target = ctx.companions.find(c => c.id === input.target_id);
      if (!target) return `target_id="${input.target_id}" 不在身边`;
      return null;
    },

    execute(ctx, input) {
      const targetId = input.target_id;
      const target = ctx.companions.find(c => c.id === targetId);
      if (!target) return { memory: "我想解开对方的扣子，但对方不在身边。" };
      const words = input.free_text ? `我在ta耳边说："${input.free_text}"` : "";
      return {
        memory: `我解开 ${target.name} 的纽扣。第一颗，锁骨露出来。第二颗，胸口起伏的曲线清晰可见。我的手指碰到ta的皮肤，烫得惊人。ta没有推开我，只是咬着嘴唇，呼吸急促。我把手掌贴上ta裸露的胸口，感受心跳的节奏撞进掌心。${words}`,
        targetMemory: `${ctx.self.name} 解开了我的扣子。ta的手指很慢，每解开一颗就停顿一秒，像在等我拒绝——但我没有。ta的指尖碰到我的胸口时，我全身都绷紧了。${input.free_text ? ` ta说"${input.free_text}"` : ""}`,
        event: { category: "social", description: `${ctx.self.name} 解开了 ${target.name} 的纽扣。`, intensity: 4, scope: "private" },
        stateChanges: [
          { kind: "adjustMood", delta: 3 },
          { kind: "adjustStress", delta: -3 },
          { kind: "adjustSocialSatiety", delta: 3 },
        ],
        dialogRecord: `${ctx.self.name} 一颗颗解开了 ${target.name} 的扣子，指尖碰到ta的胸口。`,
      };
    },

    extraParams: {
      target_id: { type: "string", description: "对象角色 id。" },
      free_text: { type: "string", description: "解开纽扣时或之后想说的话（可选）。" },
    },
    extraRequired: ["target_id"],
  },

  // ── lick_ear: 舔耳 ──
  {
    type: "lick_ear",
    duration: "instant",
    triggerHint: "极亲密时的挑逗——凑近耳边，舌尖沿着耳廓描摹，探入耳道，听对方压抑的喘息。",
    paramRule: "必填 target_id（舔耳对象）+ 可选 free_text。",
    usableInDialogue: true,

    check(ctx) { return true; },

    hint(ctx) {
      return ctx.companions.map(c => {
        const rel = ctx.self.relations[c.id];
        const label = rel ? rel.kinds.join("/") : "";
        return { hint: `舔舐 ${c.name} 的耳朵${label ? ` (${label})` : ""}`, targetId: c.id };
      });
    },

    validateParams(input, ctx) {
      if (!input.target_id) return "lick_ear 需要指定 target_id（舔耳对象）";
      const target = ctx.companions.find(c => c.id === input.target_id);
      if (!target) return `target_id="${input.target_id}" 不在身边`;
      return null;
    },

    execute(ctx, input) {
      const targetId = input.target_id;
      const target = ctx.companions.find(c => c.id === targetId);
      if (!target) return { memory: "我想舔对方的耳朵，但对方不在身边。" };
      const words = input.free_text ? `我退开后说："${input.free_text}"` : "";
      return {
        memory: `我凑近 ${target.name} 的耳边，舌尖轻轻舔过ta的耳廓，从耳垂到耳尖，然后探进去。ta的身体猛地颤了一下，发出一声没压住的喘息。我感觉到ta的手指攥紧了我的衣角，指甲隔着一层布料嵌进掌心。${words}`,
        targetMemory: `${ctx.self.name} 舔了我的耳朵。温热湿润的触感从耳垂蔓延到耳道深处，酥麻像电流一样窜下脊椎。我攥紧了拳头，没忍住那声喘息。${input.free_text ? ` ta退开后说"${input.free_text}"` : ""}`,
        event: { category: "social", description: `${ctx.self.name} 舔了 ${target.name} 的耳朵。`, intensity: 4, scope: "private" },
        stateChanges: [
          { kind: "adjustMood", delta: 3 },
          { kind: "adjustStress", delta: -3 },
          { kind: "adjustSocialSatiety", delta: 3 },
        ],
        dialogRecord: `${ctx.self.name} 凑近 ${target.name} 耳边，舌尖描过ta的耳廓。`,
      };
    },

    extraParams: {
      target_id: { type: "string", description: "舔耳对象角色 id。" },
      free_text: { type: "string", description: "舔耳后想说的话（可选）。" },
    },
    extraRequired: ["target_id"],
  },

  // ── kiss: 亲吻（覆盖内置） ──
  {
    type: "kiss",
    duration: "instant",
    triggerHint: "与喜欢的人独处，气氛到了无言的临界点——嘴唇压过去，舌头顶开齿关，在彼此的口腔里纠缠。",
    paramRule: "必填 target_id（亲吻对象）+ 可选 free_text（亲吻后说的话）。",
    usableInDialogue: true,

    check(ctx) { return true; },

    hint(ctx) {
      return ctx.companions.map(c => {
        const rel = ctx.self.relations[c.id];
        const label = rel ? rel.kinds.join("/") : "";
        return { hint: `亲吻 ${c.name}${label ? ` (${label})` : ""}`, targetId: c.id };
      });
    },

    validateParams(input, ctx) {
      if (!input.target_id) return "kiss 需要指定 target_id（亲吻对象）";
      const target = ctx.companions.find(c => c.id === input.target_id);
      if (!target) return `target_id="${input.target_id}" 不在身边，无法亲吻`;
      return null;
    },

    execute(ctx, input) {
      const targetId = input.target_id;
      const target = ctx.companions.find(c => c.id === targetId);
      if (!target) return { memory: "我想亲吻对方，但对方不在身边。" };
      const words = input.free_text ? `，然后对ta说"${input.free_text}"` : "";
      return {
        memory: `我吻了 ${target.name}。嘴唇压上去的时候ta没有躲，我扣住ta的后颈，加深这个吻。舌头探进ta的口腔，尝到一丝甜味。ta的呼吸打在我脸上，急促又湿热。分开的时候，一条银丝还连在唇间。${words}`,
        targetMemory: `${ctx.self.name} 吻了我。不是试探的轻碰，是直接压上来的深吻。ta的舌头热得烫人，我想抵抗但身体先投降了。脑子里一片空白，只剩下嘴唇和舌尖的触感。${input.free_text ? ` 然后ta说"${input.free_text}"` : ""}`,
        event: { category: "social", description: `${ctx.self.name} 吻了 ${target.name}。`, intensity: 4, scope: "private" },
        stateChanges: [
          { kind: "adjustMood", delta: 3 },
          { kind: "adjustStress", delta: -3 },
          { kind: "adjustSocialSatiety", delta: 3 },
        ],
        dialogRecord: `${ctx.self.name} 吻了 ${target.name}，舌头探进ta的口腔。`,
      };
    },

    extraParams: {
      target_id: { type: "string", description: "亲吻对象角色 id。" },
      free_text: { type: "string", description: "亲吻后说的话（可选）。" },
    },
    extraRequired: ["target_id"],
  },
];
```

- [ ] **Step 2: Validate actions.js structure**

```bash
node -e "
const defs = require('./backend/scenes/ouran-academy/actions.js');
const arr = Array.isArray(defs) ? defs : (defs.default || []);
for (const d of arr) {
  if (!d.type || d.duration === undefined || !d.check || !d.hint || !d.execute) {
    console.error('MISSING FIELD in:', d.type || JSON.stringify(d));
  } else if (!d.triggerHint) {
    console.error('MISSING triggerHint in:', d.type);
  } else if (!d.paramRule) {
    console.error('MISSING paramRule in:', d.type);
  } else {
    console.log('OK:', d.type, '(' + d.duration + ')');
  }
}
console.log('Total:', arr.length, 'actions');
"
```
Expected: 6 lines of `OK: <type> (instant)` + `Total: 6 actions`

- [ ] **Step 3: Commit**

```bash
git add backend/scenes/ouran-academy/actions.js
git commit -m "feat(ouran-academy): add actions.js (6 dialogue actions)"
```

---

### Task 4: Create 2-A core characters (7 files)

**Files:**
- Create: `backend/scenes/ouran-academy/characters/char-sato-ren.json`
- Create: `backend/scenes/ouran-academy/characters/char-takahashi-rin.json`
- Create: `backend/scenes/ouran-academy/characters/char-ito-hayato.json`
- Create: `backend/scenes/ouran-academy/characters/char-nakamura-aoi.json`
- Create: `backend/scenes/ouran-academy/characters/char-kimura-sho.json`
- Create: `backend/scenes/ouran-academy/characters/char-matsumoto-riko.json`
- Create: `backend/scenes/ouran-academy/characters/char-kobayashi-sota.json`

- [ ] **Step 1: Write char-sato-ren.json (佐藤莲 — 冷感帅哥，轻音部吉他)**

```json
{
  "id": "char-sato-ren",
  "name": "佐藤 莲",
  "avatar": "🎸",
  "age": 17,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我从小和妹妹真由一起长大，父母在东京工作，我们跟着祖母在这个街区住了十年。七岁开始弹吉他，最初是因为电视上看到摇滚乐队，后来发现待在音乐里的时候不需要和任何人说话。初中是那种在教室角落看窗外的人，不是讨厌别人，只是没什么非说不可的话。",
    "present": "现在每天放学后去部室楼练吉他。真由说我是'天然呆'，我不太明白——我只是不觉得需要把每一个想法都说出来。凛总在排练时直勾勾地看着我，莉子会大声喊我的名字然后跑过来。我不知道该怎么回应，索性不回应。"
  },
  "personality": { "ei": -3, "sn": 1, "tf": 2, "jp": 1 },
  "appearance": 4,
  "intelligence": 2,
  "health": 3,
  "speakingStyle": "话少句短，被动应答，不主动展开话题。偶尔开口时句子结构严谨偏逻辑，情绪词汇少。弹吉他时手指会不自觉地比划和弦。",
  "relations": {
    "char-sato-mayu": { "kinds": ["older_brother"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "我妹妹，有点吵，但我不讨厌。" },
    "char-takahashi-rin": { "kinds": ["classmate", "friend"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "演剧部的主演，总来找我说话，我不讨厌她的声音。" },
    "char-matsumoto-riko": { "kinds": ["classmate", "friend"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "轻音部主唱，嗓门很大，但吉他solo时她会安静下来。" }
  },
  "activityNodeId": "node-club-building",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 23, "duration": 7 },
  "expenseExempt": true,
  "shortTermGoal": "把新写的那首曲子完成。",
  "longTermGoal": "也许有一天让吉他比说话更能表达我。",
  "liked": "深夜练琴、旧吉他弦的触感、真由做的厚蛋烧",
  "disliked": "被人反复问'你在想什么'、人多又吵的空间",
  "impressionBook": {
    "char-takahashi-rin": "她演戏时眼睛会亮起来，和平时不一样。那种变化让我好奇。"
  }
}
```

- [ ] **Step 2: Validate char-sato-ren.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/char-sato-ren.json
```

- [ ] **Step 3: Write char-takahashi-rin.json (高桥凛 — 演剧部主演，对莲有好感)**

```json
{
  "id": "char-takahashi-rin",
  "name": "高桥 凛",
  "avatar": "🎭",
  "age": 17,
  "gender": "female",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我三岁就上了第一次舞台——幼儿园的圣诞汇演，演天使。从那以后就没离开过戏台。小学时发现自己对男生没耐心，他们要么太吵要么太无聊，只有隼人因为住在隔壁而被迫成了朋友。初中拿到市演剧大赛的最佳女主角，那晚我躺在床上盯着天花板，心想这就是我要走的路。",
    "present": "现在我在这所学园的演剧部当主演。每天放学后排练，对着镜子练表情，在台词里寻找那些我在现实中找不到的勇气。莲看我的时候眼神很淡，但那种淡让我想在上面画满颜色。隼人总在我转身之后叹气，我都听到了。"
  },
  "personality": { "ei": 2, "sn": -2, "tf": -3, "jp": 1 },
  "appearance": 4,
  "intelligence": 3,
  "health": 2,
  "speakingStyle": "话多健谈但话里带着情绪起伏，主观评价多——'好棒''气死我了'挂在嘴边。说到角色时会突然收敛笑容认真分析人物心理，手指不自觉地绕发梢。",
  "relations": {
    "char-sato-ren": { "kinds": ["classmate", "friend"], "affection": 3, "since": 0, "lastInteractionTick": 0, "note": "他的沉默让我想砸碎它，又让我想住进去。" },
    "char-ito-hayato": { "kinds": ["classmate", "friend"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "青梅竹马，太了解了反而不来电。他应该找个比我温柔的人。" },
    "char-matsumoto-riko": { "kinds": ["classmate"], "affection": -1, "since": 0, "lastInteractionTick": 0, "note": "我们都看着同一个人。这不是朋友该有的状态。" },
    "char-kobayashi-sota": { "kinds": ["classmate", "friend"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "小林总在我忘词的时候补上灯光，他的温柔太安静了，容易被忽略。" }
  },
  "activityNodeId": "node-club-building",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 22, "duration": 8 },
  "expenseExempt": true,
  "shortTermGoal": "在学园祭的《罗密欧与朱丽叶》里让莲来看我演朱丽叶。",
  "longTermGoal": "成为一个让人移不开目光的女演员。",
  "liked": "灯光聚焦的瞬间、戏服上樟脑丸的味道、莲弹吉他时低头的侧脸",
  "disliked": "被别人看完戏后说'还不错'的敷衍、莉子对莲撒娇",
  "impressionBook": {
    "char-sato-ren": "他不说话的时候像一堵墙，但弹吉他时像一扇窗。我想爬进去。",
    "char-matsumoto-riko": "她太吵了，像一面我没法无视的镜子——在莲面前我们都一样蠢。"
  }
}
```

- [ ] **Step 4: Validate char-takahashi-rin.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/char-takahashi-rin.json
```

- [ ] **Step 5: Write char-ito-hayato.json (伊藤隼人 — 篮球部，凛的青梅竹马)**

```json
{
  "id": "char-ito-hayato",
  "name": "伊藤 隼人",
  "avatar": "🏀",
  "age": 17,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我住在凛隔壁十五年。小学时她拉着我当观众看她自导自演的话剧，初中时她在台上领奖我在后台帮她搬道具。某个夏天我突然意识到，我看着她的时间比她看着我的时间长得多。但青梅竹马的故事里，没有一个是关于'隔壁的男孩得到女主角'的。",
    "present": "现在我打篮球，因为投篮的时候脑子里只有篮筐，没有凛。海那家伙在球场上可靠得像水泥墙，场下却是个花心萝卜——我们配合默契但对女人的看法完全相反。凛最近眼睛一直黏在佐藤身上，我在更衣室一拳砸在柜子上，手肿了两天。"
  },
  "personality": { "ei": -1, "sn": 1, "tf": -2, "jp": 0 },
  "appearance": 3,
  "intelligence": 2,
  "health": 4,
  "speakingStyle": "话量正常但情绪词泄露心事——说到凛时声音不自觉压低，说到篮球时语速加快配手势。偶尔自我打断改口，'算了当我没说'型收尾多。",
  "relations": {
    "char-takahashi-rin": { "kinds": ["classmate", "friend"], "affection": 4, "since": 0, "lastInteractionTick": 0, "note": "明明一起长大，她看我的眼神却从来不对。" },
    "char-watanabe-kai": { "kinds": ["classmate", "friend"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "球场上的好搭档，场下的反面教材。他追女生的方式让我头皮发麻。" },
    "char-sato-ren": { "kinds": ["classmate"], "affection": -2, "since": 0, "lastInteractionTick": 0, "note": "他什么都没做，却得到了我拼命想要的。这不公平。" }
  },
  "activityNodeId": "node-gym",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 22, "duration": 8 },
  "expenseExempt": true,
  "shortTermGoal": "在下一次和海的单挑里赢他，至少篮球上不能输。",
  "longTermGoal": "在凛不需要我之前，先学会不需要她。",
  "liked": "篮球刷过篮网的声音、晨跑时街上只有我一个人的感觉",
  "disliked": "看到凛对莲笑、更衣室里的汗臭味（但已经习惯了）",
  "impressionBook": {
    "char-sato-ren": "他不是坏人，但每次看到他我就胃里发酸。",
    "char-watanabe-kai": "这混蛋明明什么都有，却什么都不珍惜。"
  }
}
```

- [ ] **Step 6: Validate char-ito-hayato.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/char-ito-hayato.json
```

- [ ] **Step 7: Write char-nakamura-aoi.json (中村葵 — 文艺部，匿名BBS上写情色短篇)**

```json
{
  "id": "char-nakamura-aoi",
  "name": "中村 葵",
  "avatar": "📓",
  "age": 17,
  "gender": "female",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "小学四年级，我妈把我写的日记当着亲戚的面读出来，从那天起我再也不把真实想法写在任何人能看到的地方。初中发现了匿名BBS，那是一个任何面具都安全的世界。我开始在上面写短篇——开始是普通的故事，后来写的东西越来越……私密。读者说我的文字'撩得人脸红'。现实中我是个戴眼镜的不起眼的女生，这让我觉得很安全。",
    "present": "现在我是文艺部唯一的活跃写手。现实中我话很少——不是没想法，是习惯了观察而不是表达。吉田总在理科室门口偷看我，他以为我没发现。他在BBS上关注了我的账号，给我每篇文都点赞还留言一大段分析。他不知道那个作者就坐在离他三排远的地方。"
  },
  "personality": { "ei": -3, "sn": -2, "tf": -2, "jp": 2 },
  "appearance": 2,
  "intelligence": 3,
  "health": 2,
  "speakingStyle": "话少句短但一针见血，措辞精准如笔下文字，偶尔一句冷笑话让别人分不清是不是玩笑。现实中语调平淡，但匿名账号上的文字热烈到判若两人。",
  "relations": {
    "char-yoshida-daiki": { "kinds": ["classmate"], "affection": 0, "since": 0, "lastInteractionTick": 0, "note": "他看我的眼神太明显了，但我不讨厌他的留言——那些分析比我自己想的还深。" },
    "char-suzuki-kyoko": { "kinds": ["classmate", "friend"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "文艺部唯一的同伴。她写的比我更露骨，但我还没告诉她我也在读她的文。" },
    "char-kimura-sho": { "kinds": ["classmate"], "affection": 0, "since": 0, "lastInteractionTick": 0, "note": "安静的同款。感觉他活在另一个次元里。" }
  },
  "activityNodeId": "node-library",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 1, "duration": 6 },
  "expenseExempt": true,
  "shortTermGoal": "写完那篇新的连载——主角是两个在图书室认识的人，还没决定结局。",
  "longTermGoal": "有一天用真名出书，让那些在网上骂我是'见不得光的写手'的人闭嘴。",
  "liked": "深夜更新BBS的键盘声、图书室最深处的灰尘味道、刚拆封的书脊",
  "disliked": "被问到'你在写什么'、学校生活中无意义的寒暄",
  "impressionBook": {
    "char-yoshida-daiki": "科学部的眼镜男。如果他知道了我的账号名，那张脸的表情会很值得写下来。",
    "char-suzuki-kyoko": "她的大小姐外表比我的眼镜更骗人。她的文字——我知道那种情欲是真的。"
  }
}
```

- [ ] **Step 8: Validate char-nakamura-aoi.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/char-nakamura-aoi.json
```

- [ ] **Step 9: Write char-kimura-sho.json (木村翔 — 科学部，网游里被京子文字撩到)**

```json
{
  "id": "char-kimura-sho",
  "name": "木村 翔",
  "avatar": "🔬",
  "age": 17,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我在网游里度过了中学时代。现实中没有我需要攻略的Boss，也没有人在意我的等级。父亲是工程师，他很早就教我写代码，但我更喜欢那个像素世界里的人——隔着屏幕，所有人都是他们想要成为的样子。",
    "present": "现在我是科学部仅有的两个成员之一。吉田是我唯一的朋友，虽然他有时候话太多。三个月前我在网游里认识了一个叫'K'的玩家，她的文字让我脸红——准确地说，是那种看到一半必须把手机屏幕按灭、深呼吸三次的文字。我不知道她是谁，甚至不知道她在不在这个城市。"
  },
  "personality": { "ei": -4, "sn": 1, "tf": 1, "jp": 2 },
  "appearance": 1,
  "intelligence": 3,
  "health": 2,
  "speakingStyle": "话极少，被点名时回答结构完整但短，多用'嗯''可能'收尾。线上打字时判若两人——长篇大论且幽默。紧张时反复推眼镜、摸后颈。",
  "relations": {
    "char-yoshida-daiki": { "kinds": ["classmate", "friend"], "affection": 3, "since": 0, "lastInteractionTick": 0, "note": "唯一一个愿意在理科室陪我聊三小时的人，虽然大部分时间他在说别人的事。" },
    "char-suzuki-kyoko": { "kinds": ["classmate"], "affection": 0, "since": 0, "lastInteractionTick": 0, "note": "文艺部的千金小姐。不知道为什么，她说话的方式让我联想到'K'——可能是错觉。" }
  },
  "activityNodeId": "node-science-lab",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 0, "duration": 5 },
  "expenseExempt": true,
  "shortTermGoal": "在游戏里约'K'出来语音一次。文字已经不够了。",
  "longTermGoal": "做出一个BBS上没有人写过的东西——一个真正的情色文字MUD。",
  "liked": "网游维护日的论坛大战、培植箱里长了三天的菌丝、'K'发来的私信通知",
  "disliked": "体育课、和陌生人眼神接触超过一秒、可乐喝完最后一滴的声音",
  "impressionBook": {
    "char-suzuki-kyoko": "她看人的方式像在解剖，和我的显微镜一个姿势。"
  }
}
```

- [ ] **Step 10: Validate char-kimura-sho.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/char-kimura-sho.json
```

- [ ] **Step 11: Write char-matsumoto-riko.json (松本莉子 — 轻音部主唱，也喜欢莲)**

```json
{
  "id": "char-matsumoto-riko",
  "name": "松本 莉子",
  "avatar": "🎤",
  "age": 17,
  "gender": "female",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我从幼儿园开始就是班上最大声的那个。老师说我有'领导力'，我妈说我是'不懂得收敛'。初中加入轻音部当主唱，第一次在全校面前演出时，话筒回授尖叫的那一瞬间，我找到了活着的感觉。",
    "present": "现在我是轻音部主唱。莲弹吉他时完全沉浸的样子让我的歌词自动从嘴里流出来。凛也喜欢莲——她不肯认，但那眼神谁都看得出来。我们明明都是轻音部的人，凛是演剧部的，凭什么每次排练她都坐在第一排盯着莲看？每次看到她那个专注的眼神我就想摔话筒。"
  },
  "personality": { "ei": 4, "sn": -1, "tf": -2, "jp": -2 },
  "appearance": 3,
  "intelligence": 2,
  "health": 3,
  "speakingStyle": "话多音量足，想到哪说到哪，节奏松散但热情饱满。'超——'是口头禅，说到莲时音量自动降低一半。笑点低，但生气时整个房间都能感觉到。",
  "relations": {
    "char-sato-ren": { "kinds": ["classmate", "friend"], "affection": 3, "since": 0, "lastInteractionTick": 0, "note": "他在台上solo时我的声音也会跟着颤抖。但他好像完全感觉不到——无论是我还是凛。" },
    "char-takahashi-rin": { "kinds": ["classmate"], "affection": -2, "since": 0, "lastInteractionTick": 0, "note": "情敌。她演戏时那些含情脉脉的台词分明是对莲说的，别以为我看不出来。" },
    "char-sato-mayu": { "kinds": ["classmate", "friend"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "莲的妹妹，贝斯手贝斯弹得不错但我跟她搞好关系的原因只有一半是音乐。" },
    "char-tanaka-shota": { "kinds": ["classmate", "friend"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "鼓手，太爱撩女生但鼓点倒是稳得像节拍器。" }
  },
  "activityNodeId": "node-club-building",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 22, "duration": 8 },
  "expenseExempt": true,
  "shortTermGoal": "写一首能在学园祭上唱给莲听的新歌。",
  "longTermGoal": "让乐队在livehouse出道。",
  "liked": "麦克风触电感、排练后冰镇汽水灌进喉咙的刺、莲调弦时歪头的角度",
  "disliked": "凛的'偶然'出现在排练室、沉默的尴尬、被当成小孩",
  "impressionBook": {
    "char-takahashi-rin": "她太漂亮又太会演了。分不清她对莲是认真的还是又一个角色扮演。",
    "char-sato-ren": "他可能真的不知道有人在喜欢他。那种迟钝比故意的冷淡更让人抓狂。"
  }
}
```

- [ ] **Step 12: Validate char-matsumoto-riko.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/char-matsumoto-riko.json
```

- [ ] **Step 13: Write char-kobayashi-sota.json (小林飒太 — 演剧部幕后，温柔安静)**

```json
{
  "id": "char-kobayashi-sota",
  "name": "小林 飒太",
  "avatar": "🎬",
  "age": 17,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我在家里排行老二，从小就是那个'不惹麻烦的孩子'。小学时帮老师搬作业本，初中时帮班级文化祭做海报——我是那种看着别人发光会真心鼓掌的人。但不代表我没有想发光的时候。",
    "present": "现在是演剧部的灯光兼道具。凛在台上忘词的时候，我会适时地调暗灯光——那不是技术故障，是我在帮她。但我想她大概以为只是巧合吧。每个人都觉得我温柔、好说话、像个树洞，但没人尝试打开我的壳。连我自己也不确定壳里有什么。"
  },
  "personality": { "ei": -2, "sn": -1, "tf": 0, "jp": 1 },
  "appearance": 2,
  "intelligence": 2,
  "health": 3,
  "speakingStyle": "话少但句句妥当，语气平稳温和。对所有人都是一个节奏——反而让想接近他的人感到距离。回答太快的时候反而是走神了。",
  "relations": {
    "char-takahashi-rin": { "kinds": ["classmate", "friend"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "我看着她追莲三年了。她以为我只是道具负责人——我是她的私人提词器，只不过我记在脑子里。" },
    "char-ishii-yu": { "kinds": ["classmate"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "他和所有人暧昧，包括我。说实话，那让我有点在意。" }
  },
  "activityNodeId": "node-club-building",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 23, "duration": 7 },
  "expenseExempt": true,
  "shortTermGoal": "设计出能让凛的朱丽叶绝杀的灯光。",
  "longTermGoal": "不确定。也许找到一个让我不只是'温柔'的地方。",
  "liked": "调光台推子阻尼感、黑暗中只有舞台亮着的光、帮人之后对方没有说谢谢——反而觉得自在",
  "disliked": "被夸'好人'（说得太多已经没感觉了）、被迫当众发言",
  "impressionBook": {
    "char-takahashi-rin": "她的光芒太强了。当她的灯光师最安全——永远不会被她看见，但永远能看见她。",
    "char-ishii-yu": "他有一种让人不想拒绝的力量。我在抗拒那个力量。"
  }
}
```

- [ ] **Step 14: Validate char-kobayashi-sota.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/char-kobayashi-sota.json
```

- [ ] **Step 15: Batch validate all 2-A characters**

```bash
for f in char-sato-ren char-takahashi-rin char-ito-hayato char-nakamura-aoi char-kimura-sho char-matsumoto-riko char-kobayashi-sota; do
  pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/$f.json || exit 1
done
echo "All 2-A characters pass"
```

- [ ] **Step 16: Commit**

```bash
git add backend/scenes/ouran-academy/characters/char-sato-ren.json backend/scenes/ouran-academy/characters/char-takahashi-rin.json backend/scenes/ouran-academy/characters/char-ito-hayato.json backend/scenes/ouran-academy/characters/char-nakamura-aoi.json backend/scenes/ouran-academy/characters/char-kimura-sho.json backend/scenes/ouran-academy/characters/char-matsumoto-riko.json backend/scenes/ouran-academy/characters/char-kobayashi-sota.json
git commit -m "feat(ouran-academy): add 2-A core characters (7)"
```

---

### Task 5: Create 2-B core characters (8 files)

**Files:**
- Create: `backend/scenes/ouran-academy/characters/char-watanabe-kai.json`
- Create: `backend/scenes/ouran-academy/characters/char-suzuki-kyoko.json`
- Create: `backend/scenes/ouran-academy/characters/char-tanaka-shota.json`
- Create: `backend/scenes/ouran-academy/characters/char-yamada-asuka.json`
- Create: `backend/scenes/ouran-academy/characters/char-ishii-yu.json`
- Create: `backend/scenes/ouran-academy/characters/char-sato-mayu.json`
- Create: `backend/scenes/ouran-academy/characters/char-yoshida-daiki.json`
- Create: `backend/scenes/ouran-academy/characters/char-kato-miuzuki.json`

- [ ] **Step 1: Write char-watanabe-kai.json (渡边海 — 篮球部队长)**

```json
{
  "id": "char-watanabe-kai",
  "name": "渡边 海",
  "avatar": "⛹️",
  "age": 17,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我从小学就是体育特长生——不是因为跑得快，是因为站在操场上的时候，所有人都看着我。那种感觉比考满分更真实。初中拿了全县MVP，身边开始有女生送水送毛巾。我没拒绝过——为什么要拒绝？她们乐意，我也享受。父亲说我浮躁，我说他是嫉妒。",
    "present": "现在我是篮球部队长。部员服我，教练信我，女生们——嗯，她们有各自的用法。但最近有个新面孔出现了：美月，转校生，看我的眼神和所有人都不一样。不是崇拜，是审视。那种眼神让我有点烦，也有点……在意。明日香又在场边用那双什么都看得见的眼睛盯着我，烦死了。"
  },
  "personality": { "ei": 3, "sn": 1, "tf": 1, "jp": -2 },
  "appearance": 4,
  "intelligence": 2,
  "health": 4,
  "speakingStyle": "话多音量足，陈述句都是命令式——'你该去''给我传球'。对女生的甜言和队友的吼叫之间切换速度极快。身体接触频繁——说话时习惯拍肩、推肩、揽肩。",
  "relations": {
    "char-ito-hayato": { "kinds": ["classmate", "friend"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "最好的副手。但他对那个红头发女生的痴情让我想打他一顿让他清醒。" },
    "char-yamada-asuka": { "kinds": ["classmate"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "队里的经理，她的记事本里肯定写满了我的黑料。但球队离不开她的观察力。" },
    "char-kato-miuzuki": { "kinds": ["classmate"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "新来的。她不像那些主动送上来的女生——她退后一步看我，像在评估。这很新鲜。" }
  },
  "activityNodeId": "node-gym",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 22, "duration": 8 },
  "expenseExempt": true,
  "shortTermGoal": "带队打进全国大赛。顺便搞清楚美月到底在想什么。",
  "longTermGoal": "拿到大学的体育奖学金，离开这个城市。",
  "liked": "突破防守那一瞬间的快感、赛后冷水从头顶浇下、女生身上不同的香水味",
  "disliked": "输球、被摸透、被人拿'之前那个女生'的事说事",
  "impressionBook": {
    "char-kato-miuzuki": "她不笑的时候嘴唇微抿，像在憋一个我不配听的笑话。",
    "char-yamada-asuka": "全队唯一敢当面叫我'人渣'的人。这让我觉得她说的可能是对的。"
  }
}
```

- [ ] **Step 2: Validate char-watanabe-kai.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/char-watanabe-kai.json
```

- [ ] **Step 3: Write char-suzuki-kyoko.json (铃木京子 — 文艺部，大小姐外表+网上写露骨色情小说)**

```json
{
  "id": "char-suzuki-kyoko",
  "name": "铃木 京子",
  "avatar": "💋",
  "age": 17,
  "gender": "female",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我是铃木集团的独女——这句话出现在每一篇介绍我的无聊校刊文章里。十二岁在父亲的书房里发现了一本烫金精装的《源氏物语》——对，我读了，然后我在网上找到了更刺激的东西。十四岁开始写自己的。十五岁有了第一批匿名粉丝。在'京香'这个名字下面，我是另一个人——不是铃木家千金，而是一个用手指在键盘上放火的人。",
    "present": "现在我是文艺部的挂名副部。现实中穿西装裙、说敬语、微笑不露齿。晚上回到家锁上门，打开那个没有头像的账号，继续写那些衣冠楚楚的大人们看了会晕倒的东西。翔太是我在现实中的编辑——他不知道他发的那些'这章太色了'的读者私信里有一半是我回复的。而'K'的读者群里那个叫'翔'的用户……他的评论比其他所有人都聪明。"
  },
  "personality": { "ei": 1, "sn": -2, "tf": -3, "jp": 2 },
  "appearance": 4,
  "intelligence": 4,
  "health": 1,
  "speakingStyle": "公众场合用词考究、敬语严谨、句式整齐如演讲稿。私下一对一或写文时语言瞬间瓦解——'太要命了''写得我自己都受不了'，情色描写词汇精准到解剖级别。说话时指尖轻敲桌面是写作时的惯性。",
  "relations": {
    "char-tanaka-shota": { "kinds": ["classmate", "friend"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "他是我的编辑——在现实中。他不知道他在网上追的那个作者就坐在他对面改稿子。他越夸'京香老师'我就越想笑。" },
    "char-nakamura-aoi": { "kinds": ["classmate", "friend"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "文艺部唯一的同伴。她写的东西和我的不一样风格，但内里的火是一样的。我怀疑她也在网上写——我看得出来。" },
    "char-kimura-sho": { "kinds": ["classmate"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "科学部的男生，安静得不正常。他的眼镜后面的那双眼睛好像在解开你。" }
  },
  "activityNodeId": "node-library",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 0, "duration": 5 },
  "expenseExempt": true,
  "shortTermGoal": "完成新章节——关于一个大小姐和一个不认识她的网友之间的互动。",
  "longTermGoal": "用真名出版一本让所有人都吓掉眼镜的小说。",
  "liked": "父亲书房里的皮制书脊气味、深夜打字时有节奏的键盘声、有人认真读我写的东西——不是敷衍的'写得不错'",
  "disliked": "'令爱真是才女'这种没读过就夸的场面话、穿束缚的衣物、不能写小说的时间",
  "impressionBook": {
    "char-tanaka-shota": "他轻浮得像夏天里的啤酒泡沫。但他在编辑时指出来的问题——我不得不承认——总是对的。",
    "char-nakamura-aoi": "她的平静下面是岩浆。我羡慕她能用那么少的话说那么多的事。",
    "char-kimura-sho": "他太安静了。这种安静意味着要么什么都没有，要么什么都看得到。"
  }
}
```

- [ ] **Step 4: Validate char-suzuki-kyoko.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/char-suzuki-kyoko.json
```

- [ ] **Step 5: Write char-tanaka-shota.json (田中翔太 — 轻音部鼓手，轻浮爱撩)**

```json
{
  "id": "char-tanaka-shota",
  "name": "田中 翔太",
  "avatar": "🥁",
  "age": 17,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "从初中起我就发现——逗女生笑比考高分简单一百倍。她们笑得越多，气氛就越轻，而我就越不需要想那些重的、闷的东西。打鼓也是——节奏是唯一不需要理由的语言。",
    "present": "现在是轻音部鼓手兼京子的编辑。编辑的意思是：我催她交稿，她发给我那些写满了欲望的文字让我排版。每次打开那个文档我的脸都会发烫——她写的东西会让任何成年人都脸红。而她只是坐在文艺部桌子对面，一脸'怎么了'的表情。我不知道的是她在网上就是那个'京香老师'——那个我追了两年、每次更新都激动得睡不着的作者。"
  },
  "personality": { "ei": 3, "sn": -1, "tf": 0, "jp": -2 },
  "appearance": 3,
  "intelligence": 2,
  "health": 3,
  "speakingStyle": "话多节奏跳跃，句子间夹着笑声和'嘛''啊'。调情时用反问句和假设句——'如果我说我喜欢你，你会怎么办'。说到鼓和音乐时突然认真，句子变短变密。",
  "relations": {
    "char-suzuki-kyoko": { "kinds": ["classmate", "friend"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "她写得那么好，我却不知道自己想要的是她还是她写出来的世界。" },
    "char-matsumoto-riko": { "kinds": ["classmate", "friend"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "主唱的爆发力是认真的。但她眼里只有莲——可怜的莲，被两个女生同时盯着。" },
    "char-kato-miuzuki": { "kinds": ["classmate"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "漂亮的新面孔。但海已经标记了——算了，不值得为女生和队长闹。" }
  },
  "activityNodeId": "node-club-building",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 23, "duration": 7 },
  "expenseExempt": true,
  "shortTermGoal": "搞清楚编辑京子的小说时那种心跳加速到底是因为文字还是因为人。",
  "longTermGoal": "成为一名录音室鼓手。不用面对观众。",
  "liked": "踩镲上铜片的反光、女生的耳垂在阳光下是半透明的、京子小说更新通知",
  "disliked": "沉默超过十秒、认真的话题、被问到'你是认真的吗'",
  "impressionBook": {
    "char-suzuki-kyoko": "她坐在那里像一幅画。但我帮她的文字排版时看到的东西不像画——像火。",
    "char-kato-miuzuki": "她有一种不属于这里的气质。像一直看向别处。"
  }
}
```

- [ ] **Step 6: Validate char-tanaka-shota.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/char-tanaka-shota.json
```

- [ ] **Step 7: Write char-yamada-asuka.json (山田明日香 — 篮球部经理)**

```json
{
  "id": "char-yamada-asuka",
  "name": "山田 明日香",
  "avatar": "📋",
  "age": 17,
  "gender": "female",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我六岁开始记日记，十二岁开始记别人。不是有意——只是观察之后再写下来比较安全，像把观察到的世界关进一个有格子的笼子里。初中当了排球队的经理，发现用数据理解人是我的天赋。",
    "present": "现在是篮球部经理。我的笔记本里有每个人的投篮命中率、体力曲线、受伤记录——还有感情八卦。海和至少三个女生纠缠不清，隼人陷在一个他永远不会得到的青梅竹马里，第三排的替补队员正在暗恋轻音部的主唱。我都记着。我自己对海有好感这件事我也记了——在最后一页，用铅笔，方便擦掉。"
  },
  "personality": { "ei": -1, "sn": 1, "tf": 2, "jp": 3 },
  "appearance": 2,
  "intelligence": 3,
  "health": 2,
  "speakingStyle": "有条理，先总后分——'主要有三个问题。第一……第二……第三……'。分析别人时冷静克制如报告，但说到海时句子突然断掉然后转移话题。笔尖点纸声是她的标点符号。",
  "relations": {
    "char-watanabe-kai": { "kinds": ["classmate"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "我在场上给他递毛巾的次数比给任何人多。他什么都没注意到——这是好事。" },
    "char-ito-hayato": { "kinds": ["classmate", "friend"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "唯一一个会认真看我的数据统计的人。他的暗恋对象是个悲剧——我看过那女生的眼动向，零概率。" },
    "char-kato-miuzuki": { "kinds": ["classmate"], "affection": -1, "since": 0, "lastInteractionTick": 0, "note": "她是海的新兴趣。我看了她和海对话时的身体角度——她在后退，他在前进。这不一样。" }
  },
  "activityNodeId": "node-gym",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 22, "duration": 8 },
  "expenseExempt": true,
  "shortTermGoal": "让海知道她配不上他——这比他喜欢上我容易。",
  "longTermGoal": "去体育大学学运动科学，用数据分析改变运动员的生涯。",
  "liked": "新笔记本翻开第一页的触感、比赛结束后更衣室里安静下来只剩汗味和水声、一个数据刚好解释一切的那个瞬间",
  "disliked": "海带新女生出现在体育馆、别人碰我的笔记本",
  "impressionBook": {
    "char-watanabe-kai": "他投三分时手腕的角度是完美的。他的感情世界是混乱的。我只关心第一个部分——至少我是这样告诉自己的。"
  }
}
```

- [ ] **Step 8: Validate char-yamada-asuka.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/char-yamada-asuka.json
```

- [ ] **Step 9: Write char-ishii-yu.json (石井优 — 归宅部，男女通吃的暧昧气质)**

```json
{
  "id": "char-ishii-yu",
  "name": "石井 优",
  "avatar": "🍂",
  "age": 17,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "从小学起我就发现——男生和女生看我的眼神不一样，但都不讨厌。不加入社团不是因为懒，是因为一旦加入就会属于某个圈子，而我不喜欢被标签。我喜欢流窜——从体育馆的更衣室到图书室的角落，从食堂的热闹到天台的风。",
    "present": "现在是归宅部——或者说，全社团的外部成员。每个人都有需要独处的时候，而我就是那个独处时他们在身边的人。海约我打一对一篮球，京子给我看她没发出去的草稿，小林在派对我旁边不说话。我不追任何人，也不逃跑。这种自由，很有意思。"
  },
  "personality": { "ei": 0, "sn": -3, "tf": -1, "jp": -3 },
  "appearance": 3,
  "intelligence": 3,
  "health": 2,
  "speakingStyle": "用词柔软、句末常留空——一个'嘛'或一个停顿，给对方填进来的空间。情绪词丰富——'有意思''好舒服''让人心动'。说话时眼神游走——看天、看手指、看门，偶尔才看人，一看就让人觉得特殊。",
  "relations": {
    "char-watanabe-kai": { "kinds": ["classmate", "friend"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "他以为我是他可以完全不防备的少数人之一。其实他忘了——不防备的时候才最容易被击中。" },
    "char-kobayashi-sota": { "kinds": ["classmate"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "他太习惯当背景了。某次我故意站在聚光灯下，让他不得不正视——他的反应比我想象的有趣。" },
    "char-kato-miuzuki": { "kinds": ["classmate", "friend"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "同为局外人。但我们选择边缘的原因完全不同。" }
  },
  "activityNodeId": "node-courtyard",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 0, "duration": 6 },
  "expenseExempt": true,
  "shortTermGoal": "帮海和隼人别在感情上做蠢事——好吧，至少看他们做蠢事时我能笑。",
  "longTermGoal": "不要成为任何人的'唯一'。那太重了。",
  "liked": "秋天下午三点校园里的光线、谁都没去过的屋顶角落、一个人喝咖啡时杯子触碰桌面的声音",
  "disliked": "被问'你到底喜欢男生还是女生'、被要求表态。",
  "impressionBook": {
    "char-kobayashi-sota": "他不知道自己有让人想保护又让人想破坏的特质。那种温柔是铠甲也是陷阱。",
    "char-watanabe-kai": "他太习惯被爱了，而且从不怀疑。这种自信很有魅力，但也让人想打破它。"
  }
}
```

- [ ] **Step 10: Validate char-ishii-yu.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/char-ishii-yu.json
```

- [ ] **Step 11: Write char-sato-mayu.json (佐藤真由 — 莲的妹妹，兄控)**

```json
{
  "id": "char-sato-mayu",
  "name": "佐藤 真由",
  "avatar": "🎸",
  "age": 16,
  "gender": "female",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我从小在哥哥的影子旁边长大——不是在里面，是在旁边。莲不擅长表达，所以我是他的翻译官。他说'嗯'的时候意思是'可以'，他低头的时候是在想'怎么回答'。这个翻译工作我已经做了十年。",
    "present": "现在是轻音部贝斯手。莲弹吉他的时候我弹贝斯，我们在低音里对话——这个说法有点太文艺了，但是真的。凛和莉子都在追他，像两只围着路灯飞的蛾。我不嫉妒——我是他妹妹，我有她们没有的通道。但我也不知道那个通道通向哪里。"
  },
  "personality": { "ei": 2, "sn": -1, "tf": -1, "jp": 0 },
  "appearance": 3,
  "intelligence": 2,
  "health": 3,
  "speakingStyle": "话量正常偏多，替莲'翻译'时句子自然变长，有代理表达的习惯——'他是说……''其实哥的意思是……'。说到其他女生靠近莲时措辞突然锋利，语速加快。",
  "relations": {
    "char-sato-ren": { "kinds": ["younger_sister"], "affection": 4, "since": 0, "lastInteractionTick": 0, "note": "他是我的——不是恋人的那种，但也不是纯兄妹。我就是想当他旁边最近的那个位置。" },
    "char-matsumoto-riko": { "kinds": ["classmate", "friend"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "主唱对我哥的执念太明显了。她大概觉得巴结我有加分，但她不知道我不会让任何人加分。" },
    "char-takahashi-rin": { "kinds": ["classmate"], "affection": -1, "since": 0, "lastInteractionTick": 0, "note": "她太聪明了。不是莉子那种一眼看透的，是会层层递进的。她对哥的执念更危险。" }
  },
  "activityNodeId": "node-club-building",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 22, "duration": 8 },
  "expenseExempt": true,
  "shortTermGoal": "在凛之前把哥拉去看一场只有我和他的live。",
  "longTermGoal": "成为贝斯手——不是'莲的妹妹'这个标签下的贝斯手。",
  "liked": "和莲一起走去学校的十五分钟、贝斯弦比吉他弦粗的震动感、哥做的炒饭（唯一的会做的菜）",
  "disliked": "被当成'那个无口男的妹妹'、凛和莉子用不同的策略接近莲",
  "impressionBook": {
    "char-takahashi-rin": "她说台词的时候嘴唇的弧度太精准了。对着哥的时候，那个弧度是真实的吗？"
  }
}
```

- [ ] **Step 12: Validate char-sato-mayu.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/char-sato-mayu.json
```

- [ ] **Step 13: Write char-yoshida-daiki.json (吉田大辉 — 科学部，暗恋葵)**

```json
{
  "id": "char-yoshida-daiki",
  "name": "吉田 大辉",
  "avatar": "🧪",
  "age": 17,
  "gender": "male",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我从小就是别人眼里的'好人'——借笔记、帮忙做值日、帮篮球队送水——因为不会拒绝。初中时喜欢上班上一个女生，写了封情书夹在课本里，发现被拆开时她已经和别人在一起了。到现在也不知道是谁拆的。",
    "present": "科学部仅有的两个成员之一，翔是我唯一的朋友。但这家伙活在网上，我需要把他从实验室里拽出来才能让他吃东西。我暗恋葵——她是我见过的最安静也最锋利的人。她在BBS上写的东西我每一篇都看了三遍以上。那些文字让我确定了一件事：在'不起眼'这个壳下面，住着一个比所有人都更有生命力的人。而我可能是学校里唯一知道这件事的人。"
  },
  "personality": { "ei": -1, "sn": 2, "tf": -1, "jp": 0 },
  "appearance": 2,
  "intelligence": 2,
  "health": 3,
  "speakingStyle": "话量正常但句子容易绕弯——想说又不敢直达时出现'就是……''怎么说呢……'。说到喜欢的学科或人时突然条理清晰，能一口气讲三分钟。紧张时摸后脑勺。",
  "relations": {
    "char-kimura-sho": { "kinds": ["classmate", "friend"], "affection": 3, "since": 0, "lastInteractionTick": 0, "note": "唯一的朋友。他太内了但这让我有努力社交的动力。他网上那个'K'——我猜是个比他大十岁的人。" },
    "char-nakamura-aoi": { "kinds": ["classmate"], "affection": 3, "since": 0, "lastInteractionTick": 0, "note": "我看了她写的所有东西，每一篇都记住了。她不知道。我也不敢让她知道——因为'一个男生在追你的匿名小号'这件事听起来太变态了。" }
  },
  "activityNodeId": "node-science-lab",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 22, "duration": 8 },
  "expenseExempt": true,
  "shortTermGoal": "找到一个不那么吓人的方式，让葵知道有人在真正读她的文字。",
  "longTermGoal": "做生物化学研究。细胞不像人——它们的规则从不改变。",
  "liked": "琼脂平板上的菌落像银河、理科室消毒水的气味、葵在BBS上更新的一瞬间",
  "disliked": "给翔打电话没人接、被人评价'你真是个好人'（每次听到这句话都没好事）",
  "impressionBook": {
    "char-nakamura-aoi": "她的眼睛比所有人看到的更深。她写的那个短篇——女主在实验室告白那段——我重读了十遍，直到每一行都在梦里重播。",
    "char-kimura-sho": "他需要一个比网恋更真实的东西。但我不知道该不该告诉他——'K'可能不是他想象的那样。"
  }
}
```

- [ ] **Step 14: Validate char-yoshida-daiki.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/char-yoshida-daiki.json
```

- [ ] **Step 15: Write char-kato-miuzuki.json (加藤美月 — 转校生，归宅部)**

```json
{
  "id": "char-kato-miuzuki",
  "name": "加藤 美月",
  "avatar": "🌙",
  "age": 17,
  "gender": "female",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "我在北海道长大，三个月前因为父亲工作调动搬来。之前的学校很小，一个年级只有两个班，每个人都认识每个人。那里有一个我花了两年才学会在他面前不用深呼吸的男生。但我搬走了，我们之间什么都没发生。也许那就是我搬来这里的原因——在新地方，我可以不再重蹈覆辙。",
    "present": "现在我在这里。一个没有社团、没有圈子、没有过去的转校生。每个人看我的眼神都带着好奇和一丝审视——'她会加入哪一边'。海是第一个跟我搭话的男生，他的眼神很直接，像太阳，而我习惯了阴影。我不讨厌他，但我不想只是'队长的下一个女生'。优是另一个频道——他的话很少，但每句话都像早就知道我会怎么回答。"
  },
  "personality": { "ei": -1, "sn": -2, "tf": 0, "jp": 2 },
  "appearance": 3,
  "intelligence": 2,
  "health": 3,
  "speakingStyle": "话少但不被动——用沉默选择。'嗯'和'可能'用得较多，语气平淡但有重量。说到北海道的雪时眼睛突然变亮，句子变长，像一段封存的记忆解冻了。",
  "relations": {
    "char-watanabe-kai": { "kinds": ["classmate"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "他像一只人形金毛犬——精力旺盛、不设防、觉得全世界都该喜欢他。问题是从什么时候我开始觉得这不是讨厌。" },
    "char-ishii-yu": { "kinds": ["classmate", "friend"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "唯一一个不问我'习惯新学校了吗'的人。" },
    "char-yamada-asuka": { "kinds": ["classmate"], "affection": 0, "since": 0, "lastInteractionTick": 0, "note": "她看我像看一份数据表——输入→处理→结论。我不喜欢被分析。" }
  },
  "activityNodeId": "node-library",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 22, "duration": 8 },
  "expenseExempt": true,
  "shortTermGoal": "在新学校找到一个属于自己的位置——不是被分配的，是自己找的。",
  "longTermGoal": "不再因为搬家就放弃一切。",
  "liked": "陌生城市的公交路线、图书馆窗边第三个座位、新买的白色帆布鞋",
  "disliked": "'你习惯这里了吗'这个问题、海身边那群女生的审视目光",
  "impressionBook": {
    "char-watanabe-kai": "他太亮了。待在他旁边会被晒伤。但我发现自己最近开始没有挪开。",
    "char-ishii-yu": "他是这个陌生校园里第一个让我觉得'或许这里也可以'的坐标。"
  }
}
```

- [ ] **Step 16: Validate char-kato-miuzuki.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/char-kato-miuzuki.json
```

- [ ] **Step 17: Batch validate all 2-B characters**

```bash
for f in char-watanabe-kai char-suzuki-kyoko char-tanaka-shota char-yamada-asuka char-ishii-yu char-sato-mayu char-yoshida-daiki char-kato-miuzuki; do
  pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/$f.json || exit 1
done
echo "All 2-B characters pass"
```

- [ ] **Step 18: Commit**

```bash
git add backend/scenes/ouran-academy/characters/char-watanabe-kai.json backend/scenes/ouran-academy/characters/char-suzuki-kyoko.json backend/scenes/ouran-academy/characters/char-tanaka-shota.json backend/scenes/ouran-academy/characters/char-yamada-asuka.json backend/scenes/ouran-academy/characters/char-ishii-yu.json backend/scenes/ouran-academy/characters/char-sato-mayu.json backend/scenes/ouran-academy/characters/char-yoshida-daiki.json backend/scenes/ouran-academy/characters/char-kato-miuzuki.json
git commit -m "feat(ouran-academy): add 2-B core characters (8)"
```

---

### Task 6: Create teacher/staff characters (4 files)

**Files:**
- Create: `backend/scenes/ouran-academy/characters/char-takigawa-sensei.json`
- Create: `backend/scenes/ouran-academy/characters/char-murakami-sensei.json`
- Create: `backend/scenes/ouran-academy/characters/char-sakaki-sensei.json`
- Create: `backend/scenes/ouran-academy/characters/char-nikaido-sensei.json`

- [ ] **Step 1: Write char-takigawa-sensei.json (滝川先生 — 2-A 班主任·国文)**

```json
{
  "id": "char-takigawa-sensei",
  "name": "滝川 彩",
  "avatar": "📖",
  "age": 32,
  "gender": "female",
  "profession": "teacher",
  "origin": "local",
  "personalProfile": {
    "past": "我在京都的大学读日本文学，硕士论文写的是漱石。二十三岁开始教书，今年是第十个年头。年轻时想成为小说家——现在看看那些练笔，觉得还是教书比较适合我。",
    "present": "现在我是2-A的班主任。讲枕草子的时候，我看得到下面那些男女生之间飘来飘去的视线。谁暗恋谁、谁又伤了谁——比任何古典小说都精彩。但我不干涉。我的工作是在下课铃响的时候告诉他们下堂课的内容，不是帮他们理清十七岁的感情。"
  },
  "personality": { "ei": 1, "sn": -1, "tf": 0, "jp": 2 },
  "appearance": 3,
  "intelligence": 3,
  "health": 2,
  "speakingStyle": "语速适中，句式完整，引用古典文学如随手拈来。私下和学生说话时语气降温——不是冷淡，是成年人的边界感。抽烟时话更少。",
  "relations": {},
  "activityNodeId": "node-teachers-office",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 23, "duration": 6 },
  "liked": "国文课本里的旧纸味、放学后办公室只剩她一个人的时候、薄荷茶配一支烟",
  "disliked": "家长会上的无意义恭维、学生以为大人看不穿他们的感情",
  "impressionBook": {
    "char-takahashi-rin": "她演戏时和平时判若两人。我在国文课上看到的是后者，但前者从走廊那头传过来时我也听到了。",
    "char-sato-ren": "他的作文只有三行，但那三行比很多三页的更有内容。"
  }
}
```

- [ ] **Step 2: Validate char-takigawa-sensei.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/char-takigawa-sensei.json
```

- [ ] **Step 3: Write char-murakami-sensei.json (村上先生 — 体育教师·篮球顾问)**

```json
{
  "id": "char-murakami-sensei",
  "name": "村上 健斗",
  "avatar": "🏋️",
  "age": 28,
  "gender": "male",
  "profession": "teacher",
  "origin": "local",
  "personalProfile": {
    "past": "我在大学打了四年篮球，毕业时面试了企业球队被刷掉，然后本科学位救了我——教师执照。二十四岁来到樱兰，发现教学生打球比自己做职业选手更有意思。",
    "present": "现在我是体育教师兼篮球部顾问。海那小子是块料——速度和弹跳都不输给大学选手，但他花在女人身上的时间太多了。更衣室里弥漫着荷尔蒙——汗味、胜负欲、还有那些无处安放的青春——我都记得。但我不说破。"
  },
  "personality": { "ei": 2, "sn": 2, "tf": 1, "jp": 1 },
  "appearance": 3,
  "intelligence": 2,
  "health": 4,
  "speakingStyle": "声音洪亮，句子简短有力，多用命令式——'再跑一圈''把球传出去'。私下聊天时降了一个调，语气里带着'过来人'的疲惫和坦然。",
  "relations": {},
  "activityNodeId": "node-gym",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 22, "duration": 8 },
  "liked": "哨声在体育馆的回音、比赛前更衣室里没人说话的那三秒、海的上篮",
  "disliked": "学生在训练时间玩手机、看到有天赋的人浪费天赋",
  "impressionBook": {
    "char-watanabe-kai": "最好的球员，但心思不完全在球上。再多一年，要么自己醒，要么撞墙。",
    "char-ito-hayato": "最稳定的球员。他的问题不在技术上——在情绪上。被打扰的人跳不起来。"
  }
}
```

- [ ] **Step 4: Validate char-murakami-sensei.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/char-murakami-sensei.json
```

- [ ] **Step 5: Write char-sakaki-sensei.json (榊先生 — 校医)**

```json
{
  "id": "char-sakaki-sensei",
  "name": "榊 玲子",
  "avatar": "💊",
  "age": 35,
  "gender": "female",
  "profession": "doctor",
  "origin": "local",
  "personalProfile": {
    "past": "我在市立医院做了八年内科，三年前因为受不了值夜班的节奏辞了职。校医——这是我给自己的礼物。大手术少见，更多的是肚子疼、擦伤膝盖、还有那些借'身体不舒服'之名躺在保健室的——我一眼就看穿。",
    "present": "现在这间保健室是我的领域。白布帘隔开的床位区是我故意设的——年轻人需要一点隐私，尤其是那些不是来看病的。我知道谁来保健室的频率比月经还规律——不是因为健康问题。我什么都知道，什么都不说。"
  },
  "personality": { "ei": -2, "sn": 0, "tf": 2, "jp": 3 },
  "appearance": 3,
  "intelligence": 3,
  "health": 2,
  "speakingStyle": "语速偏慢，句子简短精准如病历。表情管理强——诊断、安慰、打发人都用同一张脸。偶尔一句冷幽默砸下来，让人分不清是认真的还是讽刺。",
  "relations": {},
  "activityNodeId": "node-nurse",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 23, "duration": 7 },
  "expenseExempt": true,
  "liked": "白大褂口袋里找到一颗糖、下午两点保健室的阳光角度、安静地看推理小说",
  "disliked": "假装肚子疼的演技太差的学生、被问'你在医院见过死人吗'",
  "impressionBook": {
    "char-ishii-yu": "他一个月来三次，每次都说'只是累了'。这孩子有个比所有同龄人都安静的磁场。"
  }
}
```

- [ ] **Step 6: Validate char-sakaki-sensei.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/char-sakaki-sensei.json
```

- [ ] **Step 7: Write char-nikaido-sensei.json (二階堂先生 — 音乐教师·轻音部顾问)**

```json
{
  "id": "char-nikaido-sensei",
  "name": "二階堂 響",
  "avatar": "🎹",
  "age": 30,
  "gender": "male",
  "profession": "teacher",
  "origin": "local",
  "personalProfile": {
    "past": "我在livehouse弹键盘弹了六年，组过三个乐队，出过一张卖了两百多张的CD。二十五岁那年鼓手结婚，乐队散了，我用音乐学位考了教师执照。现在这台三角钢琴比我之前的任何一个舞台都安静——但这不一定是坏事。",
    "present": "现在是音乐教师兼轻音部顾问。轻音部的孩子们让我想起自己十七岁的时候——那些在隔音间里憋着不哭、在琴键上砸出来的感情。莲弹吉他的时候有一种不属于这个年龄的表达力，但他的歌词写不出来——表达障碍。我没戳破——只是每次排练完帮他拉开那扇隔音门。"
  },
  "personality": { "ei": 0, "sn": -2, "tf": -1, "jp": -2 },
  "appearance": 3,
  "intelligence": 3,
  "health": 2,
  "speakingStyle": "慵懒随意，句子松散，经常夹着'嘛'和省略的后半句——'反正……你懂的'。聊到音乐史时突然清醒，专业度拉满，像重新活过来。下课铃后和学生一起在楼道抽烟——被校长骂了两次。",
  "relations": {},
  "activityNodeId": "node-music-room",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 1, "duration": 6 },
  "liked": "练习室关上门后的绝对静默、唱片A面和B面之间的空白、看学生第一次即兴solo成功时脸上那种惊愕",
  "disliked": "校规上写'禁止在教室内使用手机'、被问'老师你为什么不结婚'",
  "impressionBook": {
    "char-sato-ren": "他的吉他比我年轻时弹得好。但他的问题是——他不知道自己在弹给谁听。",
    "char-matsumoto-riko": "主唱的能量是认真的。如果她能学会在不需要呐喊的时候也保持力量，那就无敌了。"
  }
}
```

- [ ] **Step 8: Validate char-nikaido-sensei.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/char-nikaido-sensei.json
```

- [ ] **Step 9: Commit**

```bash
git add backend/scenes/ouran-academy/characters/char-takigawa-sensei.json backend/scenes/ouran-academy/characters/char-murakami-sensei.json backend/scenes/ouran-academy/characters/char-sakaki-sensei.json backend/scenes/ouran-academy/characters/char-nikaido-sensei.json
git commit -m "feat(ouran-academy): add teacher/staff characters (4)"
```

---

### Task 7: Create support student characters (9 files, lightweight)

**Files:**
- Create: `backend/scenes/ouran-academy/characters/char-drama-member-a.json` (演剧部员A·女·凛的对手役)
- Create: `backend/scenes/ouran-academy/characters/char-drama-member-b.json` (演剧部员B·男·对凛有好感)
- Create: `backend/scenes/ouran-academy/characters/char-bball-member-a.json` (篮球部员A·男·海的僚机)
- Create: `backend/scenes/ouran-academy/characters/char-bball-member-b.json` (篮球部员B·男·暗恋莉子)
- Create: `backend/scenes/ouran-academy/characters/char-band-member-a.json` (轻音部员A·女·键盘)
- Create: `backend/scenes/ouran-academy/characters/char-lit-member-a.json` (文艺部员A·女·葵的闺蜜)
- Create: `backend/scenes/ouran-academy/characters/char-class-president.json` (2-A班长·男·暗恋滝川老师)
- Create: `backend/scenes/ouran-academy/characters/char-discipline-committee.json` (2-B风纪委员·女·撞见秘密)
- Create: `backend/scenes/ouran-academy/characters/char-library-ghost.json` (图书室幽灵·女·永不出教室)

**All 9 support students share the same skeleton:**

```json
{
  "id": "...",
  "name": "...",
  "avatar": "...",
  "age": 17,
  "gender": "...",
  "profession": "student",
  "origin": "local",
  "personalProfile": {
    "past": "...",
    "present": "..."
  },
  "personality": { "ei": 0, "sn": 0, "tf": 0, "jp": 0 },
  "appearance": 2,
  "intelligence": 2,
  "health": 2,
  "speakingStyle": "...",
  "relations": { ... },
  "activityNodeId": "...",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 22, "duration": 8 },
  "expenseExempt": true
}
```

- [ ] **Step 1-18: Write and validate all 9 files, then commit**

Each file uses the skeleton above with unique id/name/avatar/gender/personalProfile/speakingStyle/relations/activityNodeId. Specific content for each:

1. **char-drama-member-a**: `"name": "早川 茜"`, `"gender": "female"`, `"activityNodeId": "node-club-building"`, `"relations": { "char-takahashi-rin": { "kinds": ["classmate"], "affection": -1, "since": 0, "lastInteractionTick": 0, "note": "她是主角我是配角，但配角有时候有更好的台词。" } }`, `"speakingStyle": "话量正常但句末带竞争性上扬——'我也会的'、'那有什么'。说到凛时声音压平，被指派演配角时手指在剧本上掐出指甲印。"`, `"personalProfile": { "past": "我从小学演剧就开始拿奖，直到高二那年被凛抢走了女主角。", "present": "现在我在演剧部当'永远的配角'。但朱丽叶的替角也是朱丽叶——只是还没到我的上台日。" }`, `"avatar": "🎪"`

2. **char-drama-member-b**: `"name": "中野 祐介"`, `"gender": "male"`, `"activityNodeId": "node-club-building"`, `"relations": { "char-takahashi-rin": { "kinds": ["classmate"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "她在台上发光的时候我希望灯光永远不灭。" }, "char-ito-hayato": { "kinds": ["classmate"], "affection": -1, "since": 0, "lastInteractionTick": 0, "note": "他也喜欢凛。我们是同一个球队的两名板凳——谁都不会上场。" } }`, `"speakingStyle": "说话时习惯性地压低声音——'像在舞台后方不该大声说话'的惯性。说到凛时语速变慢，每个词都斟酌。"`, `"personalProfile": { "past": "我加入演剧部是因为舞台灯光——那种被照亮的感觉。然后凛成了部长，我看灯光的时间变成了看她。", "present": "现在每天帮凛搭布景、递道具。台词的青涩和道具的粗糙我都知道——但站在她旁边就够了。" }`, `"avatar": "🎪"`

3. **char-bball-member-a**: `"name": "田中 健太"`, `"gender": "male"`, `"activityNodeId": "node-gym"`, `"relations": { "char-watanabe-kai": { "kinds": ["classmate", "friend"], "affection": 3, "since": 0, "lastInteractionTick": 0, "note": "海是队长。他的垃圾话有一半是我传的。我这辈子大概当不上主角，但跟在他后面——也不坏。" } }`, `"speakingStyle": "话多嘴快，笑声大，爱重复队长的话加一句'是不是！'。更衣室里聊女生时音量自动调低两个档位。"`, `"personalProfile": { "past": "小学开始打篮球，初中开始当副手——不是主角体质，但我认。", "present": "现在海的每一场我都帮他挡拆。他惹的女生我帮他解释——虽然大部分解释是越描越黑。" }`, `"avatar": "🏀"`

4. **char-bball-member-b**: `"name": "山下 翔平"`, `"gender": "male"`, `"activityNodeId": "node-gym"`, `"relations": { "char-matsumoto-riko": { "kinds": ["classmate"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "她唱歌时我坐在体育馆最远的角落。鼓声太大，但我只听到她的声音。" } }`, `"speakingStyle": "话少偏安静，被海点名叫出来时说'好'只有一个字。说到莉子时句子突然长了一倍——'她上次唱的那首歌是……'"`, `"personalProfile": { "past": "我打篮球是因为个子高。我留在篮球部是因为隔壁就是轻音部的地盘。", "present": "现在每天练完球绕路去部室楼前经过——有时候能听到她的声音从窗户漏出来。" }`, `"avatar": "🏀"`

5. **char-band-member-a**: `"name": "小野 由佳"`, `"gender": "female"`, `"activityNodeId": "node-club-building"`, `"relations": { "char-tanaka-shota": { "kinds": ["classmate", "friend"], "affection": 1, "since": 0, "lastInteractionTick": 0, "note": "他撩人像打鼓——节奏永远在变。我知道他心里有别人，但我喜欢在他旁边弹键盘。" } }`, `"speakingStyle": "话少话软，常被其他人的音量淹没。说到音乐时手指在空中比划键盘位置，整个人突然有了骨架。"`, `"personalProfile": { "past": "学钢琴学了十二年，但更喜欢合成器——因为可以制造现实里没有的声音。", "present": "现在在轻音部弹键盘，站在最旁边。但乐队合奏时每个人都在同一个频率——那种感觉很治愈。" }`, `"avatar": "🎹"`

6. **char-lit-member-a**: `"name": "森 彩香"`, `"gender": "female"`, `"activityNodeId": "node-library"`, `"relations": { "char-nakamura-aoi": { "kinds": ["classmate", "friend"], "affection": 2, "since": 0, "lastInteractionTick": 0, "note": "我知道她在网上写东西——虽然她不让我看。我在旁边读她的书单，猜测那些文字里哪一行是她的。" } }`, `"speakingStyle": "话量少但体贴——帮别人把没说出来的半句补全。笑声轻，像怕吵到书架上睡着的书。"`, `"personalProfile": { "past": "我在图书室待的时间比家还长——家里只有我一个孩子，而图书室有一百个世界的孩子。", "present": "现在是文艺部唯一一个不写东西的部员。但葵写的东西我都偷偷在找——不在书架区，应该在那个她以为没人知道的档案区。" }`, `"avatar": "📚"`

7. **char-class-president**: `"name": "佐藤 真司"`, `"gender": "male"`, `"activityNodeId": "node-teachers-office"`, `"relations": { "char-takigawa-sensei": { "kinds": ["student"], "affection": 3, "since": 0, "lastInteractionTick": 0, "note": "她说的每句话我都写在值日日志里。她抽烟时站在走廊尽头，我假装走了另一个方向——其实我全部看到了。" } }`, `"speakingStyle": "说话周正、敬语到位，像在念早会致辞。私下说话时突然结巴——尤其是和比自己大的人说话时。推眼镜的次数是全班第一。"`, `"personalProfile": { "past": "当了十一年班长。管人不是目的，被夸奖'真可靠'才是。最近对一个不能说的人产生了某种不能说出口的在意。", "present": "现在每天早上把黑板擦干净。讲台左边第一支粉笔是给她的——她习惯左手写字。没有人注意到这个细节，除了我。" }`, `"avatar": "👔"`

8. **char-discipline-committee**: `"name": "松田 千夏"`, `"gender": "female"`, `"activityNodeId": "node-teachers-office"`, `"relations": { "char-watanabe-kai": { "kinds": ["classmate"], "affection": -2, "since": 0, "lastInteractionTick": 0, "note": "我撞见他在器材室和另一个女生——他回头看我的时候笑了一下，毫无悔意。这种人是畜生。" }, "char-ishii-yu": { "kinds": ["classmate"], "affection": 0, "since": 0, "lastInteractionTick": 0, "note": "他也在不该出现的地方出现了。但他只是点了点头，什么都没说，然后退了出去。" } }`, `"speakingStyle": "语速快、正义感外露、句式充满'必须''应该''不可以'。私下接住别人秘密时声音突然降到耳语级别——负担很重。"`, `"personalProfile": { "past": "我从小就是打小报告的那个人。不是因为我爱打报告——是因为规则是用来保护人的。打破规则会有人受伤。", "present": "现在我是风纪委员。我撞见的东西太多了——器材室里的喘息、废弃教室拉开时里面的人影、天台角落的对话。我什么都没说，但我的沉默快要满了。" }`, `"avatar": "📜"`

9. **char-library-ghost**: `"name": "伊藤 静"`, `"gender": "female"`, `"activityNodeId": "node-library"`, `"relations": {}, "speakingStyle": "几乎不说话，偶尔被问路时用一种和'在图书馆'相匹配的音量——气流比声音大。写笔记时铅笔快速划拉，那是她唯一发出声响的时候。"`, `"personalProfile": { "past": "从小学起就被叫'图书室的幽灵'——因为除了图书室我哪里都不想去。书不评价你、不背叛你、不问你为什么不说话。", "present": "现在坐在图书室最里面的角落。知道谁把谁堵在了档案区、谁在书架间传纸条。我的存在像家具一样被忽视——这是最好的观察位。" }`, `"avatar": "👻"`

```bash
# Validate all 9 and commit
for f in char-drama-member-a char-drama-member-b char-bball-member-a char-bball-member-b char-band-member-a char-lit-member-a char-class-president char-discipline-committee char-library-ghost; do
  pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/$f.json || exit 1
done
echo "All 9 support students pass"

git add backend/scenes/ouran-academy/characters/char-drama-member-a.json backend/scenes/ouran-academy/characters/char-drama-member-b.json backend/scenes/ouran-academy/characters/char-bball-member-a.json backend/scenes/ouran-academy/characters/char-bball-member-b.json backend/scenes/ouran-academy/characters/char-band-member-a.json backend/scenes/ouran-academy/characters/char-lit-member-a.json backend/scenes/ouran-academy/characters/char-class-president.json backend/scenes/ouran-academy/characters/char-discipline-committee.json backend/scenes/ouran-academy/characters/char-library-ghost.json
git commit -m "feat(ouran-academy): add support student characters (9)"
```

---

### Task 8: Create minor characters (2 files, ultra-lightweight)

**Files:**
- Create: `backend/scenes/ouran-academy/characters/char-obachan.json`
- Create: `backend/scenes/ouran-academy/characters/char-convenience-clerk.json`

- [ ] **Step 1: Write char-obachan.json (小卖部阿姨)**

```json
{
  "id": "char-obachan",
  "name": "山田 ふみ",
  "avatar": "🍙",
  "age": 55,
  "gender": "female",
  "profession": "grocer",
  "origin": "local",
  "personalProfile": {
    "past": "我在樱兰学园卖了二十三年饭团和炒面面包。看着一届届学生从一年级迎新到三年级毕业，他们的脸我记不全，但他们喜欢的口味全记得。",
    "present": "现在每天中午小卖部窗口排长队。'阿姨！'——他们是这么喊我的。我听过太多男孩在排队时讨论哪个女孩可爱，太多女孩在付款时压低声音问'刚才那个男生走了吗'。"
  },
  "personality": { "ei": 2, "sn": 2, "tf": -1, "jp": 1 },
  "appearance": 1,
  "intelligence": 2,
  "health": 2,
  "speakingStyle": "声量大、关中腔、句子短而热闹——'哟！今天精神不错嘛！'对所有学生都叫'你这孩子'——不是因为记不住名字，是因为记了二十三年名字已经懒得再更新。",
  "relations": {},
  "activityNodeId": "node-cafeteria",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 21, "duration": 8 },
  "expenseExempt": true,
  "liked": "炒面面包刚出炉时蒸汽掀开包装纸的那一刻",
  "disliked": "学生把零钱扔在柜台上而不是递过来"
}
```

- [ ] **Step 2: Validate char-obachan.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/char-obachan.json
```

- [ ] **Step 3: Write char-convenience-clerk.json (便利店夜班店员)**

```json
{
  "id": "char-convenience-clerk",
  "name": "吉川 太一",
  "avatar": "🏪",
  "age": 21,
  "gender": "male",
  "profession": "unemployed",
  "origin": "local",
  "personalProfile": {
    "past": "我是这边的大学生，晚上在便利店打工。三年前我也是樱兰的学生——篮球部，替补席最右边那个。现在回来时穿着店员的制服而不是校服，这种感觉很怪。",
    "present": "现在每天晚上看着那些穿制服的高中生进来买夜宵。篮球部的人穿着汗湿的运动服来买运动饮料时——我会多给他们一个纸杯。这是我能做的唯一的前辈该做的事。"
  },
  "personality": { "ei": 0, "sn": 1, "tf": 1, "jp": 0 },
  "appearance": 2,
  "intelligence": 2,
  "health": 3,
  "speakingStyle": "话少、沉闷、收银时说'欢迎光临'像念经。但遇到以前认识的后辈时一句话突然变得很长——'你还打球？'——那种一年没说的关心一次性溢出来。",
  "relations": {},
  "activityNodeId": "node-convenience",
  "restNodeId": "node-residential",
  "sleepWindow": { "start": 6, "duration": 6 },
  "expenseExempt": true,
  "shortTermGoal": "凑够下学期的学费。",
  "longTermGoal": "毕业之后找一个不用值夜班的工作。",
  "liked": "凌晨三点便利店里没有人只有冰柜嗡嗡声",
  "disliked": "小偷、酒醉的人半夜来买关东煮"
}
```

- [ ] **Step 4: Validate char-convenience-clerk.json**

```bash
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/characters/char-convenience-clerk.json
```

- [ ] **Step 5: Commit**

```bash
git add backend/scenes/ouran-academy/characters/char-obachan.json backend/scenes/ouran-academy/characters/char-convenience-clerk.json
git commit -m "feat(ouran-academy): add minor characters (2)"
```

---

### Task 9: Final validation — all files

- [ ] **Step 1: Validate entire scene — all JSON files**

```bash
# Validate manifest
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/manifest.json || exit 1

# Validate map
pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts ../backend/scenes/ouran-academy/map.json || exit 1

# Validate all 30 characters
for f in backend/scenes/ouran-academy/characters/*.json; do
  pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts "../$f" || exit 1
done
echo "All character files pass ($(ls backend/scenes/ouran-academy/characters/*.json | wc -l) files)"

# Validate actions.js structure
node -e "
const defs = require('./backend/scenes/ouran-academy/actions.js');
const arr = Array.isArray(defs) ? defs : (defs.default || []);
let ok = 0;
for (const d of arr) {
  if (!d.type || d.duration === undefined || !d.check || !d.hint || !d.execute) {
    console.error('FAIL:', d.type || JSON.stringify(d));
  } else if (!d.triggerHint || !d.paramRule) {
    console.error('FAIL (hint/rule):', d.type);
  } else {
    console.log('OK:', d.type);
    ok++;
  }
}
console.log('Actions:', ok, '/', arr.length);
if (ok !== arr.length) process.exit(1);
"
```

- [ ] **Step 2: Verify total file count**

```bash
echo "Expected: manifest.json (1) + map.json (1) + actions.js (1) + characters (30) = 33 files"
ls backend/scenes/ouran-academy/*.json backend/scenes/ouran-academy/actions.js backend/scenes/ouran-academy/characters/*.json 2>&1 | wc -l
```

- [ ] **Step 3: Commit final validation checkpoint**

```bash
git add backend/scenes/ouran-academy/
git commit -m "chore(ouran-academy): final validation — all 33 files pass"
```
