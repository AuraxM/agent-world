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
- `"local"`: Born/rooted in the world. Should have deep relations (3-6) and a fixed residence (`restNodeId`).
- `"visitor"`: Newly arrived or transient. Light relations (0-2), may lack a permanent residence. Spawns at entry node with travel fatigue unless overridden.

### `biography`
Required. First-person narrative (CoC character sheet style). Example:
> 私は斉藤。この町で20年医者をやっている。父も医者だった。患者の笑顔が何よりの報酬だ。

## Avatars

Single-emoji `avatar` is the easiest — used by `src/app/_lib/sprite.ts` as a render fallback. Pick an emoji that signals the character's energy at a glance.

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
