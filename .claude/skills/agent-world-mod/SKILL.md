---
name: agent-world-mod
description: Use when the user asks to create, design, add, or modify a map, scene, NPC, action, or world for the agent-world project. Triggers include "新地图"、"新增场景"、"加一个角色"、"新角色"、"新action"、"加一个动作"、"自定义行为"、"add a map"、"make an NPC"、"new scene"、"create an action"、"mod action"、"actions.js"、"manifest"、"map.json"、"character.json"、"create a world"、"新建世界"。Use this skill before writing any file under configs/ or any action definition code.
---

# Agent-world mod development

This project drives an LLM-NPC simulation from config files under `configs/`. A **mod** (map pack) bundles everything a world needs:

```
configs/maps/<pack-id>/
├── manifest.json              # id, name, description, language, optional actions path
├── map.json                   # pure node tree (id + nodes, no name/description at top level)
├── characters/                # character templates
│   ├── char-alice.json
│   └── char-bob.json
└── actions.js                 # custom action definitions (optional, CommonJS)
```

The runtime engine reads all of these through `src/config/loader.ts` (Zod-validated JSON) and `src/config/mod-loader.ts` (runtime JS evaluation for actions). Every change must round-trip through validation or the world won't seed.

## When to use which reference

This skill covers three tracks. Read the relevant reference when you start working on that track:

| Track | Reference | What it covers |
|-------|-----------|----------------|
| Map / nodes | `references/map-schema.md` | Node tree structure, tags, privacy, travelCost, invariants (entry node, bathing node) |
| Characters | `references/character-schema.md` | Template shape, personality, relations, profession, origin, sleepWindow, economy fields, language discipline |
| Actions | `references/action-system.md` | ActionDefinition interface, ActionContext, Outcome, StateChange, EventCategory |

Also available:
- `references/examples/map.json` — a complete 10-node map with annotations
- `references/examples/character.json` — a character template with relations

Read examples only if you're unsure about structure after reading the schema reference.

## Track A: Map (map.json)

A map is a tree of nodes — locations characters can be in. Each node has tags that unlock actions, a privacy level that controls event visibility, and optional grid coordinates for the map renderer.

### Workflow

1. **Clarify with the user:**
   - Theme, scale (rough node count), tone
   - What kind of entry point fits the setting (公交车站 / 码头 / 传送阵 / 城门 / 港口 / 机场…)
   - What bathing facility fits (公共浴池 / 家中浴室 / 河边温泉…)
   - **Language** (`"zh"` | `"en"` | `"ja"`) — REQUIRED. Ask explicitly; do not default.
2. **Read the current state:**
   - `configs/maps/` for existing pack IDs and names.
   - `src/domain/enums.ts` for `NODE_TAGS` — the only source of truth for valid tags.
3. **Draft the JSON** following `references/map-schema.md`. Include examples in `references/examples/map.json`.
4. **Validate:**
   ```bash
   npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/<pack-id>/manifest.json
   npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/<pack-id>/map.json
   ```

### Hard invariants (the validator will reject otherwise)

- ≥1 node has `isEntry: true`. Pick a node that makes narrative sense as the arrival point.
- ≥1 node has the `bathing` tag. Without it, no NPC can ever `bathe`, and hygiene grows unbounded.
- Exactly 1 root (`parentId: null`).
- Every non-root `parentId` must reference another node in the same file.
- Node ids are unique within the file.
- `tags` and `privacy` come from closed enums in `src/domain/enums.ts`.
- `travelCost` is optional, integer ≥ 0. Default 0 = free movement.
- The map.json top level has `id` and `nodes` only — no `name` or `description` (those are in manifest.json).

## Track B: Characters (characters/*.json)

A character template is a **location-agnostic** identity. Runtime state (location, vitals, emotion, memory) is assigned by the engine at world creation.

### Workflow

1. **Clarify with the user:**
   - Origin (`"local"` or `"visitor"`) — this dictates spawn point, initial vitals, and relation density. Follow the origin decision flow below.
   - Name, age, gender, profession (from `PROFESSIONS` enum).
   - MBTI archetype — which 1-2 dimensions are strong (|3|-|4|)?
   - `activityNodeId` and `restNodeId` — where do they work and sleep?
   - `sleepWindow` — defaults to `{start: 22, duration: 8}` if omitted.
   - Target relations to existing characters.
2. **Read the current state:**
   - `configs/maps/<pack-id>/characters/` for existing character IDs and names.
   - `src/domain/enums.ts` for `PROFESSIONS`, `CHARACTER_ORIGINS`, `OBJECTIVE_RELATION_KINDS`, `GENDERS`.
3. **Draft the JSON** following `references/character-schema.md`.
4. **Validate origin before saving** — run the origin decision tree below against the completed template. A wrong origin is the #1 cause of "character spawns at bus stop instead of their own home."
5. **Validate JSON:**
   ```bash
   npx tsx .claude/skills/agent-world-mod/scripts/validate.ts configs/maps/<pack-id>/characters/char-name.json
   ```

### Hard invariants

- Do NOT include `worldId`, `locationId`, `vitals`, `emotion`, `shortMemory`, `longMemory`, `currentAction`, or `lastThought`. These are runtime state, not template data.
- `personality`: 4 MBTI dims `ei / sn / tf / jp`, each integer in `[-4, 4]`. ALL keys required.
- `relations[*].kinds` — non-empty subarray of `OBJECTIVE_RELATION_KINDS`.
- `relations[*].affection` — integer in `[-4, 4]`.
- `relations[*].since` and `lastInteractionTick` — non-negative integers (use 0 for fresh templates).
- `origin`: `"local"` | `"visitor"` — required.
- `profession` — must be one of the 23 `PROFESSIONS` enum values.
- `age` — 1-120.
- `gender` — `"male"` | `"female"` | `"other"`.

### 语言纪律（Language discipline）

**所有文本字段必须使用 manifest 声明的 `language` 书写。** 文化背景≠输出语言——日式小镇设定不等于角色说日语。

受此约束的字段：`biography`、`speakingStyle`、`relations[*].note`、`impressionBook` 的值。

**允许例外：**
- 角色名、地名、专有名词可保留原文或音译（如"鸟居""味噌""月読命""の店"）
- 单一外来词在中文句子中自然出现是允许的（如"她是我的 senpai"）

**禁止：**
- 完整的外语句子出现在 biography 中（如 `「この校舎で四十年教えたのよ」`）
- 外语段落或对话引用——应翻译为 pack 语言 + 用描述传达原语言感受
  - ❌ `她说「ここは私の家です」`
  - ✅ `她用日语说这里就是她的家`
- 外语填充词/语气词（如日语 `あの`、`えっと`）——应替换为对应中文语气词

**创建后自检：**
1. 逐字段扫描非 pack 语言字符集（如 `language: "zh"` 时扫描ひらがな/カタカナ/韓글）
2. 发现完整外语句子 → 翻译重写
3. 发现外语语气词 → 替换为中文对应词

### Design principles

**Origin first.** `origin` controls spawn point, initial vitals, and relation density. Wrong origin = character spawns at bus stop instead of their own home. Follow `references/character-schema.md#origin` decision flow.

### Origin decision tree（创建完成后必检）
1. **关系密度检查** — ≥3 段 relation，含血缘/婚姻？→ `"local"`
2. **住宅检查** — `restNodeId` 指向自己拥有的住宅（非借宿酒馆/旅店）？→ `"local"`
3. **家庭一致性检查** — 配偶/子女已是 `"local"` 且同住？→ `"local"`（禁止父 visitor 子 local）
4. **季节性/临时** — 只在特定时段出现，常住地在外？→ `"visitor"`
5. **刚抵达** — 叙事上最近几周才到，无固定住所，关系 ≤2？→ `"visitor"`
6. **其他** — 默认 `"local"`（有自己住宅和收入来源就是 local）

**⚠️ "移住者悖论"：** biography 写"我从XX搬来"不代表角色是 visitor。只要已定居、有自己的住宅、在此经营 ≥1 年，就是 `local`——"移住"只是背景故事，不影响引擎 spawn 逻辑。这个错误已经造成月露谷 4 个角色站在巴士站而不是自己家。

**Personality restraint.** Keep most dims modest (0..±2). Strong values (|3|–|4|) should be storyline-load-bearing. Aim for 1–2 strong dims per character.

**Asymmetric relations.** Only declare the edge FROM this character. Don't try to keep everyone's relations symmetric — unrequited feelings are narratively valid.

**Blood relations** (father/mother/son/daughter/older_brother/younger_brother/older_sister/younger_sister/other_relative) cannot be removed by the engine or LLM. Use them deliberately.

### Style conventions

- **Names in Chinese, ids in kebab-case English** (e.g., `"char-zhangmo"`, `"node-restaurant"`).
- `avatar`: a single emoji is fine.
- `spriteKey`: match existing CSS palette tokens in `src/app/globals.css` (`town, school, classroom, playground, restaurant, park, home-cool, home-warm`). Reuse before inventing.

### 口吻差异化（Speaking style diversity）

`speakingStyle` 是 2-3 句自然中文，描述角色如何说话。必须从以下属性中提取特征并组合——**禁止**仅凭直觉写一条笼统的描述。

**输入维度与特征片段对照表：**

| 维度 | 档位 | 特征片段 |
|------|------|---------|
| age | 1-12 | 用词简单、句子短、语气天真、好奇心外露 |
| | 13-17 | 带青春期色彩——热情/反叛/羞怯之一；用词较新 |
| | 18-25 | 年轻活力、用词较新、可能带理想主义 |
| | 26-50 | 成熟完整、语气沉稳、生活经验见于措辞 |
| | 51-65 | 语速偏慢、偶引往事或经验之谈 |
| | 66+ | 缓慢沧桑、句子可能短、可能重复、常有"以前…" |
| ei | -4~-2 | 话少句短、被动应答、不主动展开 |
| | -1~1 | 正常交流、适度展开、看情境而定 |
| | 2~4 | 话多健谈、主动描述细节、喜欢分享 |
| tf | -4~-2 | 带情绪色彩、主观评价多、感受词丰富（"觉得""好感动""气人"） |
| | -1~1 | 情绪与逻辑趋于平衡 |
| | 2~4 | 偏逻辑分析、冷静克制、因果词多（"因为""所以""按理说"） |
| jp | -4~-2 | 松散跳跃、想到哪说哪、可能离题再绕回来 |
| | -1~1 | 适度组织、偶尔离题 |
| | 2~4 | 有条理、先总后分、结构词明显（"首先""其次""总之"） |
| profession | 农业/采集 | 自然比喻（"跟种地一样""看天气的"）、简短务实 |
| | 餐饮/食品 | 食物比喻、温度/时间敏感（"火候""时候""刚好"） |
| | 手工/制造 | 材料比喻（"跟木头一样实在"）、尺寸/精确性词汇 |
| | 商业/服务 | 数字敏感、人际话题、客气体贴 |
| | 医疗/教育 | 关心语气、解释性表达（"你看啊""原因在于"）、温和/威信 |
| | 学生 | 求知或懒散语气、同辈用语 |
| | 公共/其他 | 按具体职业推导——如 priest 偏仪式感/肃穆，mayor 偏审慎/大局观 |
| intelligence | 1 | 用词基础、句式单一、少用修饰 |
| | 2 | 正常词汇量、偶用成语/歇后语 |
| | 3 | 词汇丰富、句式多变、善用比喻和成语 |
| | 4 | 精妙用典、修辞层次丰富、可能带学术/文人气 |

**合成规则：**
1. 从 6 个维度各取特征片段
2. 选取 3-4 个最突出的维度特征（age + ei/tf 二选一 + profession + intelligence 可选）组合为 2-3 句描述
3. 句子必须包含：话量 + 句式 + 语气/用词倾向，至少一处 unique 细节（如"说到X时眼睛会亮""紧张时反复做Y"）
4. **同 pack 内自检**：任意两个角色的 speakingStyle 共享特征片段不得超过 2 个

**禁止特征清单：**
- ❌ "啥/咋/整/忒/贼/老XX了/可XX了/贼XX" 等北方口语词 —— 除非角色背景确有明确北方地域标签
- ❌ "嘛/呢/吧/啦" 滥用堆砌结尾
- ❌ 所有人都是"话不多不少""语气温和"——这是无特征的默认态，没有区分度

### 经济平衡（Economy balance）

角色创建时必须保证收支可持续。**禁止拍脑袋写 `initialMoney`**——要么省略让引擎按公式计算，要么严格使用以下公式。

**核心公式（与 `src/engine/bme.ts` 一致）：**

`MDC`（每日最低生存成本）= `economy.mdc ?? 20`（取 manifest economy 配置或默认 20）

| 变量 | 公式 |
|------|------|
| `initialMoney` 默认值 | `max(MDC × 7, MDC × 7 × tierMultiplier)` |
| 日收入 | `BME × tierMultiplier × MDC`（分 4 次工作 session 获得） |
| 日生存开销 | `eatCost × 2.5 + batheCost × 1.5`（2-3 餐 + 1-2 次洗浴） |
| eatCost | `round(MDC × 0.5)` |
| batheCost | `round(MDC × 0.2)` |
| BME | `metabolicBase(age) × healthFactor(health)` |

**强制规则：**

1. **禁止拍脑袋写 `initialMoney`** —— 要么省略该字段（引擎自动按公式计算），要么严格使用公式值。不得写 100、150、200 等无依据的魔术数字
2. **未成年豁免（age < 18）**：**禁止写 `"expenseExempt": false`**。引擎默认给未成年人豁免，但模板显式写 `false` 会覆盖引擎默认值导致破产。如需豁免请写 `true`，否则省略该字段
3. **成年无收入者（student/unemployed，age ≥ 18）**：必须满足以下之一：
   - `"expenseExempt": true`
   - 或 `initialMoney ≥ MDC × 21`（三周缓冲）+ `relations` 中注明经济来源（如父母资助）
4. **生存自检**：创建每个角色后，核验 `日收入 × 7 ≥ 周生存开销`（豁免者除外）。不满足则需调整 profession/tier 或增加 initialMoney

**速查表（MDC=20 为例）：**

| tier | 默认 initialMoney | 日收入(BME=1.2) | 日开销(≈) | 日净余(≈) | 判定 |
|------|------------------|-----------------|-----------|----------|------|
| 0 | 140 | 0 | 34 | -34 | ❌ 必须豁免 |
| 2 | 280 | 48 | 34 | +14 | ✓ 可持续 |
| 3 | 420 | 72 | 34 | +38 | ✓ 充裕 |

**注意：** BME 随 age 和 health 浮动。age 1-12（BME=0.6×healthFactor）和 age 66+（BME=0.75×healthFactor）的角色的日收入和日开销都低于上表。创建后应用实际 BME 重新核算。

## Track C: Actions (actions.js)

Custom actions extend what NPCs can do in a world. They're loaded at runtime via the `Function` constructor (bypassing the bundler) and registered into the global `ActionRegistry`. An action with the same `type` as a built-in overrides it for this world.

### Workflow

1. **Clarify with the user:**
   - What does the action **do** narratively?
   - **Availability**: location tags, time, vitals, companions?
   - **Duration**: `"instant"` or a positive integer (number of ticks)?
   - **Effects**: vitals changes? mood/stress? location? dialog?
   - Should the LLM supply `free_text` or pick a `target`?
2. **Read the current state:**
   - The existing `actions.js` in the target map pack.
   - `src/engine/actions-builtin.ts` for reference implementations of the 9 built-in actions.
3. **Draft** following `references/action-system.md`.
4. **Wire it up:**
   - If no `actions.js` exists yet, create it with `module.exports = [ ... ]`.
   - If `manifest.json` lacks an `"actions"` field, add `"actions": "actions.js"`.
5. **Validate:**
   ```bash
   node -e "
   const defs = require('./configs/maps/<pack-id>/actions.js');
   const arr = Array.isArray(defs) ? defs : (defs.default || []);
   for (const d of arr) {
     if (!d.type || !d.duration || !d.check || !d.hint || !d.execute) {
       console.error('MISSING FIELD in:', d.type || JSON.stringify(d));
     } else {
       console.log('OK:', d.type, '(' + d.duration + ')');
     }
   }
   console.log('Total:', arr.length, 'actions');
   "
   ```

### Hard invariants

- `type`: unique string within the registry (use `snake_case` for mod actions, e.g. `"brew_tea"`).
- `duration`: `"instant"` or a positive integer. Do NOT use `0` (reserved for `move`).
- `check()`: returns boolean. Gate on `ctx.here.tags`, `ctx.here.privacy`, `ctx.self.vitals`, `ctx.companions.length`, `ctx.isSleepHour`.
- `hint()`: returns a string (single option) or an array of `{hint, targetId?, targetNodeId?}` (multiple sub-options).
- `execute()`: returns an `Outcome` with at least `memory` (first-person string in the map pack's language).
- Use `stateChanges` for side effects — never mutate `ctx.self` directly.
- File must use CommonJS (`module.exports = [...]`), not ESM.
- No imports or `require()` — the file runs in a bare `Function` constructor.

## Track D: World assembly (manifest.json + seeding)

The manifest.json ties everything together and controls world creation.

```jsonc
{
  "id": "yu-no-tani",                    // kebab-case, matches directory name
  "name": "汤之谷",                       // display name
  "description": "深山幽谷...",           // optional but recommended
  "language": "zh",                       // "zh" | "en" | "ja" — REQUIRED
  "startDate": "2026-05-03T08:00:00",    // optional ISO 8601 for initial world clock
  "actions": "actions.js"                 // optional, path relative to pack directory
}
```

### Manifest invariants

- `id` must be unique across all map packs.
- `language` is required and must be one of `"zh"`, `"en"`, `"ja"`.
- `startDate` must be valid ISO 8601 if present.
- `actions` must point to an existing file if present.

### After creating a mod, tell the user how to test:

1. **Create a world** via `POST /api/worlds` with `mapId: "<pack-id>"` and a `cast` array of character IDs.
2. **Run ticks** — the engine auto-loads the map, characters, and custom actions.
3. **Watch logs** — character decisions and action executions appear in the tick output.
4. **Inject mid-run** via `POST /api/worlds/:id/characters` to add characters to a running world.

## Quick reference: Node tags (closed enum)

| Tag | Meaning | Unlocks |
|-----|---------|---------|
| `public` | Open access | — |
| `semi` | Semi-public (school, office) | — |
| `private` | Private space | `rest`, `sleep` |
| `indoor` | Inside a building | — |
| `outdoor` | Open air | — |
| `dining` | Food service | `eat` |
| `education` | School, classroom | `work` (student) |
| `residence` | Someone's home | `rest`, `sleep` |
| `park` | Green space | — |
| `street` | Road / passage | — |
| `playground` | Sports / recreation | — |
| `bathing` | Bath / shower | `bathe` |
| `quiet` | Quiet space (library, monastery) | — |

Use 1–3 tags per node. `privacy: "private"` alone also unlocks `rest`/`sleep`, so a private bedroom usually doesn't need extra tags.

## Quick reference: Professions (closed enum)

**农业与采集:** `farmer`, `rancher`, `fisherman`, `lumberjack`, `hunter`
**餐饮与食品:** `chef`, `baker`, `brewer`
**手工与制造:** `blacksmith`, `carpenter`, `tailor`
**商业与服务:** `merchant`, `grocer`, `innkeeper`
**医疗与教育:** `doctor`, `nurse`, `teacher`, `librarian`
**公共与其他:** `priest`, `mailman`, `mayor`, `student`, `unemployed`

## When something doesn't fit

If the user's request can't be expressed in the current schema (e.g. "add a stamina stat", "inventories", "weather system"), STOP. Don't invent fields the validator will reject. Suggest extending `src/domain/types.ts` + `src/db/schema.ts` + `src/config/schemas.ts` first, then adding config fields.
