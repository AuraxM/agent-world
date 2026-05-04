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
| Characters | `references/character-schema.md` | Template shape, personality, relations, profession, origin, sleepWindow |
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
   - Origin (`"local"` or `"visitor"`) — determines spawn behavior, default vitals, relation density.
   - Name, age, gender, profession (from `PROFESSIONS` enum).
   - MBTI archetype — which 1-2 dimensions are strong (|3|-|4|)?
   - `activityNodeId` and `restNodeId` — where do they work and sleep?
   - `sleepWindow` — defaults to `{start: 22, duration: 8}` if omitted.
   - Target relations to existing characters.
2. **Read the current state:**
   - `configs/maps/<pack-id>/characters/` for existing character IDs and names.
   - `src/domain/enums.ts` for `PROFESSIONS`, `CHARACTER_ORIGINS`, `OBJECTIVE_RELATION_KINDS`, `GENDERS`.
3. **Draft the JSON** following `references/character-schema.md`.
4. **Validate:**
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

### Design principles

**Origin first.** This affects everything:

| Aspect | `"local"` | `"visitor"` |
|--------|-----------|-------------|
| Biography tone | Rooted, multi-generational | Arrived/moved, outside perspective |
| Relations | 3-6 deep connections, blood ties | 0-2 light connections |
| `restNodeId` | Their own residence | Optional; inn or temporary lodging |
| `activityNodeId` | Local workplace | May be absent |
| Initial spawn | At `restNodeId` | At entry node |
| Initial vitals | Fresh (hunger 0, fatigue 0) | Travel-worn (hunger 1, fatigue 2) |

**Personality restraint.** Keep most dims modest (0..±2). Strong values (|3|–|4|) should be storyline-load-bearing. Aim for 1–2 strong dims per character.

**Asymmetric relations.** Only declare the edge FROM this character. Don't try to keep everyone's relations symmetric — unrequited feelings are narratively valid.

**Blood relations** (father/mother/son/daughter/older_brother/younger_brother/older_sister/younger_sister/other_relative) cannot be removed by the engine or LLM. Use them deliberately.

### Style conventions

- **Names in Chinese, ids in kebab-case English** (e.g., `"char-zhangmo"`, `"node-restaurant"`).
- `avatar`: a single emoji is fine.
- `spriteKey`: match existing CSS palette tokens in `src/app/globals.css` (`town, school, classroom, playground, restaurant, park, home-cool, home-warm`). Reuse before inventing.

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
