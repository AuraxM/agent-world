# Character template schema (`configs/characters/<id>.json`)

A character template is a **location-agnostic** identity definition. Where the character starts and what their hunger / fatigue / hygiene / mood are at game-start are decided by the cast spec at world creation, not by this file. Validated by `CharacterTemplateSchema` in `src/config/schemas.ts`.

## Top-level shape

```jsonc
{
  "id": "char-zhangmo",       // kebab-case, must match filename stem
  "name": "张默",              // display name (Chinese OK)
  "avatar": "🤐",              // optional; single emoji works as a sprite stand-in
  "age": 25,                   // 1-120
  "gender": "male",            // "male" | "female" | "other"
  "profession": "farmer",      // from PROFESSIONS enum (23 values)
  "origin": "local",           // "local" | "visitor" from CHARACTER_ORIGINS enum
  "biography": "我是...",       // first-person bio, CoC-style; required
  "activityNodeId": "node-farm", // optional; work/study/daily activity location
  "restNodeId": "node-home",    // optional; sleep/private time location
  "sleepWindow": { ... },      // optional; defaults to {start:22, duration:8}
  "personality": { ... },     // MBTI 4 dims, all required
  "abilities": [],            // v0 placeholder; usually empty
  "appearance": 2,             // 1-4, 外貌
  "intelligence": 2,           // 1-4, 思维活跃度
  "health": 2,                 // 1-4, 健康/体质
  "speakingStyle": "说话...",  // optional; generated from other attributes
  "relations": { ... }        // map of other character id → relation
}
```

**Do NOT** include `worldId`, `locationId`, `vitals`, `emotion`, `shortMemory`, `longMemory`, `currentAction`, or `lastThought`. The validator will reject those fields — they're runtime state, not template data.

## Personality (`personality`) — MBTI 4 dims

Integer values in `[-4, 4]` (9 levels per dim). ALL 4 keys required.

| key  | -4 ↔ +4 axis                                           | mapping                |
| ---- | ------------------------------------------------------ | ---------------------- |
| `ei` | introvert ↔ extravert                                  | E/I                    |
| `sn` | intuitive (gut feel) ↔ sensing (concrete facts)        | N/S                    |
| `tf` | feeling (subjective) ↔ thinking (objective logic)      | F/T                    |
| `jp` | perceiving (flexible) ↔ judging (planned, structured)  | P/J                    |

The prompt translates each value to a 9-level Chinese phrase (e.g. `ei: -3` → "非常内向"). The LLM is required to cite at least one of these phrases when reasoning. **Do not write numeric values in any prose** — they exist only here.

**Style guidance:**
- Most dims should sit at 0..±2 unless the trait is identity-forming. A character maxed on all 4 axes reads as a caricature.
- Strong values (|3|..|4|) drive recognizable behavior. Aim for 1–2 strong dims per character.

## Relations (`relations`)

Map of `targetCharacterId → relation`. Each relation:

```jsonc
{
  "kinds": ["friend"],                 // 1+ entries from OBJECTIVE_RELATION_KINDS
  "affection": 2,                      // -4..+4, how much *this* character likes the target
  "note": "童年好友...",                // optional natural-language flavor
  "since": 0,                          // tick when relation first established (0 for fresh templates)
  "lastInteractionTick": 0             // tick of last interaction (0 for fresh templates)
}
```

### `OBJECTIVE_RELATION_KINDS` (closed enum, see `src/domain/enums.ts`)

| group          | kinds                                                                                  | engine constraint                |
| -------------- | -------------------------------------------------------------------------------------- | -------------------------------- |
| 血缘 (9)       | `father`, `mother`, `son`, `daughter`, `older_brother`, `younger_brother`, `older_sister`, `younger_sister`, `other_relative` | **Cannot** be removed by engine or LLM (`other_relative` is an exception via `update_relation: end_other_relative`) |
| 社会 (13)      | `classmate`, `teacher`, `student`, `colleague`, `boss`, `subordinate`, `neighbor`, `landlord`, `tenant`, `spouse`, `partner`, `ex_partner`, `friend` | LLM can transition some via `update_relation` |
| 偶遇 (1)       | `acquaintance`                                                                         | Engine auto-adds on first same-node interaction; auto-removes after 14 game days (336 ticks) without contact |

**A relation can carry multiple kinds simultaneously** — e.g. `["spouse", "colleague"]` for a couple working together, `["father", "boss"]` for a family-run business. List them in the order most central to the character's perception.

### `affection`

Integer in `[-4, 4]`. Maps to qualitative phrases in prompts (`-4`=极厌恶 … `+4`=非常喜爱). Engine adjusts ±1 / ±2 on `help`/`gift`/`attack` actions, clamped at the bounds.

### Asymmetry

A's relation to B is independent from B's relation to A. Crushes / unrequited feelings are usually one-sided. Family is usually mutual. **Don't enforce symmetry** — let each character speak for themselves.

Only include relations to characters that actually exist in `configs/characters/`. The validator does NOT cross-reference this; the runtime tolerates orphan relation keys but the LLM ignores them.

## `activityNodeId` and `restNodeId`

Both optional. `activityNodeId` is where the character goes for work/study/daily activity; `restNodeId` is where they sleep. They can be the same node. The LLM prompt will tell the character about both locations.

If omitted, the character won't have location-based work/study hints and won't get rest-location guidance when tired.

## Identity fields

### `age`
Required. Integer 1-120.

### `gender`
Required. One of `"male"`, `"female"`, `"other"`.

### `profession`
Required. Must be one of the 23 `PROFESSIONS` enum values (see `src/domain/enums.ts`):
- 农业与采集: `farmer`, `rancher`, `fisherman`, `lumberjack`, `hunter`
- 餐饮与食品: `chef`, `baker`, `brewer`
- 手工与制造: `blacksmith`, `carpenter`, `tailor`
- 商业与服务: `merchant`, `grocer`, `innkeeper`
- 医疗与教育: `doctor`, `nurse`, `teacher`, `librarian`
- 公共与其他: `priest`, `mailman`, `mayor`, `student`, `unemployed`

### `origin`

Required. One of `"local"` or `"visitor"` from the `CHARACTER_ORIGINS` enum.

`origin` 决定了角色在世界创建时的**出生点**、初始 vitals、关系密度基线，是模板中最具引擎影响力的字段之一。**写完所有其他字段之后必须回头验证 origin 是否正确。**

#### 决策流程（按顺序检查，命中即停）

1. **关系密度检查** — 拥有 ≥3 段 relation，且其中包含血缘/婚姻关系（father/mother/son/daughter/spouse 等）？→ `"local"`
2. **住宅检查** — `restNodeId` 指向一个**属于角色自己的**独立住宅（而非酒馆二楼、旅店、亲属家的临时床位）？→ `"local"`
3. **家庭一致性检查** — 角色的子女/配偶已是 `"local"` 且同住？→ `"local"`（不允许父 visitor 子 local 的矛盾）
4. **季节性/临时停留** — 角色只在特定期段出现（暑假、祭典、探亲），常住地在 pack 之外？→ `"visitor"`
5. **刚抵达** — 角色叙事上在过去几周内才到达，尚无固定住所，关系 ≤2？→ `"visitor"`
6. **其他情况** — 默认 `"local"`（当角色已有固定住所和收入来源时）

#### 快速判定表

| 条件 | origin |
|------|--------|
| 有自己的住宅 + 血缘关系 ≥1 | `"local"` |
| 有自己的住宅 + 在此经营 ≥1 年 | `"local"` |
| restNodeId 指向自己家（非借宿） | `"local"` |
| 未成年且父母已是 local | `"local"` |
| 季节性学生/短期探亲 | `"visitor"` |
| 无固定住所 + 关系 ≤2 | `"visitor"` |

#### 引擎行为

| | `"local"` | `"visitor"` |
|--|-----------|-------------|
| 出生点 | `restNodeId`（自己的住所） | 地图 entry node（如巴士站） |
| 初始 vitals | 饥饿 0 / 疲惫 0 | 饥饿 1 / 疲惫 2（旅行疲劳） |
| 关系密度预期 | 3-6，含血缘 | 0-2，轻关系 |

**⚠️ 常见错误：** 角色有自己的住宅和生意，但因 "biography 写了从外地搬来" 而设为 `visitor`。**只要角色已在此定居、拥有自己的住宅，就是 `local`**——biography 中的 "移住" 只是背景故事，不影响 initial spawn 逻辑。

### `biography`
Required. First-person narrative (CoC character sheet style). **Must be written in the pack's declared language** (see SKILL.md "语言纪律").

Example (`language: "zh"`):
> 我叫张默，在这镇上种了十五年地。爹也是农民。庄稼长得好，日子就踏实。

Example (`language: "ja"`):
> 私は斉藤。この町で20年医者をやっている。父も医者だった。患者の笑顔が何よりの報酬だ。

## Avatars

Single-emoji `avatar` is the easiest — used by `src/app/_lib/sprite.ts` as a render fallback. Pick an emoji that signals the character's energy at a glance.

## Base attributes (`appearance`, `intelligence`, `health`)

Three required integer attributes, range [1, 4]. 1 = low, 4 = high.

| Attribute | Meaning | Notes |
|-----------|---------|-------|
| `appearance` | 外貌 | Age-appropriate descriptions; 1=平凡, 4=出众 |
| `intelligence` | 思维活跃度 | NOT IQ — 1=木讷/按部就班, 4=头脑灵活/多想法 |
| `health` | 健康/体质 | Affects daily sickness probability; 1=体弱多病, 4=强健 |

### `speakingStyle`

Optional. 2-3 句自然中文描述角色的说话方式，必须涵盖：话量 + 句式 + 语气/用词倾向，至少一处 unique 细节（如"说到X时眼睛会亮""紧张时反复做Y"）。

If omitted, the agent-world-mod skill generates it from a 6-dimension matrix (age / ei / tf / jp / profession / intelligence). See SKILL.md "口吻差异化" section.

**禁止：**
- 笼统描述（如"话不多不少""语气温和"）——没有区分度
- 北方口语词（"啥/咋/整/忒/贼/老XX了"）除非角色背景明确有北方地域标签
- 语气词堆砌（"嘛/呢/吧/啦"过多）
- 同 pack 内两个角色的 speakingStyle 共享 ≥3 个相同特征片段

### `initialMoney`

Optional integer ≥ 0. Initial money carried at world creation.

**禁止拍脑袋写。** 要么省略（引擎按公式自动计算），要么严格按公式赋值。

| tier | 公式 `max(MDC×7, MDC×7×tierMultiplier)` | MDC=20 时 |
|------|------------------------------------------|-----------|
| 0 | `max(140, 0)` | 140 |
| 2 | `max(140, 280)` | 280 |
| 3 | `max(140, 420)` | 420 |

如果角色的 profession 与收入不匹配（如 mayor 退休当志愿者），通过 relations 中的经济来源（spouse/child/landlord）来体现，而非随意调低 initialMoney。

### `expenseExempt`

Optional boolean. If `true`, character is exempt from survival costs (eat/bathe).

**规则：**
- **age < 18**：禁止写 `"expenseExempt": false`（引擎默认豁免，显式 false 会覆盖导致破产）；如需豁免写 `true` 或省略
- **student/unemployed（age ≥ 18）**：必须设为 `true`，或 `initialMoney ≥ MDC × 21` + relations 中注明经济来源
- **visitor（短期停留）**：建议 `true`（除非有本地收入来源）
- **其余职业者**：省略或 `false`

### `incomeMultiplier`

Optional number ≥ 0. 收入倍率，默认 1.0。用于调整个体收入（如半职=0.5，加班=1.5）。一般不设。

## Character creation order

The agent-world-mod skill must follow this sequence:

1. **Identity** — name, age, gender, profession, origin, biography
2. **Numerical attributes** — personality (ei/sn/tf/jp), appearance, intelligence, health
3. **Derived text** — speakingStyle (from steps 1-2, via 6-dimension matrix)
4. **Economy** — resolve income tier → verify daily balance → set initialMoney/expenseExempt per formula
5. **Relations**
6. **Locations** — activityNodeId, restNodeId
7. **Other** — sleepWindow

## Common mistakes

- Including `locationId`, `vitals`, `emotion`, or `statuses` in the template — those are runtime state.
- Forgetting required fields: `age`, `gender`, `profession`, or `biography`.
- Using a `profession` value not in the closed enum.
- `age` outside 1-120 range.
- Personality values out of `[-4, 4]` or non-integer — the validator rejects.
- Forgetting `since` / `lastInteractionTick` on relations — both are required (use 0 for fresh templates).
- Single-kind `kinds: []` — must have ≥ 1 entry; use the closed enum.
- Using removed shapes from earlier versions: 8 personality dims, `kind` (singular), `affinity`, or `statuses[]` — all gone.
- Setting all 4 personality dims to extreme values — the character becomes noise to the LLM.
- Forgetting `origin` — it's a required field; every character must declare `"local"` or `"visitor"`.
- Forgetting `appearance`, `intelligence`, or `health` — all three are required (1-4).
- **Language:** biography/speakingStyle/notes 中包含外语完整句子 —— 必须翻译为 pack 语言（专有名词除外）。
- **Speaking:** speakingStyle 使用"啥/咋/整/忒/贼/老XX了"等北方口语词 —— 禁止，除非角色背景有明确北方地域标签。
- **Speaking:** 同 pack 内角色 speakingStyle 雷同 —— 每个角色必须有不同的特征片段组合。
- **Economy:** 拍脑袋写 `initialMoney`（100/150/200 等魔术数字）—— 必须按公式或省略。
- **Economy:** 未成年人（age<18）设置 `"expenseExempt": false` —— 禁止，显式 false 会覆盖引擎默认豁免。
- **Economy:** 成年无收入者（student/unemployed）不豁免且无经济来源 —— 必须豁免或注明资助关系。
