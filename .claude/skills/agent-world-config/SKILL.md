---
name: agent-world-config
description: Use when the user asks you to create, design, add, or modify a map, scene, or NPC for the agent-world project (configs/maps or configs/characters). Triggers include "新地图"、"新增场景"、"加一个角色"、"新角色"、"add a map"、"make an NPC"、"new scene". Use this skill before writing any JSON file under configs/.
---

# Agent-world config skill

This project drives an LLM-NPC simulation off two folders of JSON configs:

- `configs/maps/<map-id>.json` — one map per file (a tree of nodes)
- `configs/characters/<char-id>.json` — one character template per file (location-agnostic)

The runtime engine reads them through `src/config/loader.ts` (Zod-validated). Every change must round-trip through that validator or seeding will fail.

## Workflow

1. **Clarify with the user first.** Don't draft anything until you know:
   - For a map: theme, scale (rough node count), tone, what kind of "entry" makes sense (公交车站 / 码头 / 传送阵 / 港口 / 城门 / 机场…).
   - For a character: name, role, personality archetype, target relations to existing characters.
2. **Read the current state** so you don't collide:
   - `configs/maps/` and `configs/characters/` for existing ids/names.
   - `src/domain/enums.ts` for the canonical closed vocabularies (the only source of truth).
3. **Draft the JSON** following the schema docs:
   - `references/map-schema.md`
   - `references/character-schema.md`
   - Examples: `references/examples/map.json`, `references/examples/character.json`.
4. **Validate** before declaring done:
   ```bash
   tsx .claude/skills/agent-world-config/scripts/validate.ts <path-to-file>
   ```
   The validator uses the same Zod schemas the loader uses; passing here means the seed/load path will accept the file.
5. **Tell the user** how to test the new config end-to-end:
   - Maps: create a fresh world via `POST /api/worlds` with `mapId: "<new-id>"` and a cast.
   - Characters: include in a `cast` member at world creation, or `POST /api/worlds/:id/characters` to inject mid-run.

## Hard invariants (the validator will reject otherwise)

**Maps**
- ≥1 node has `isEntry: true`. This is non-negotiable — runtime falls back to "first entry node" when defaulting cast positions and when injecting new characters.
- Exactly 1 root (`parentId: null`) is required (more is allowed but odd; usually 1).
- Every non-root `parentId` must reference another node in the same file.
- Node ids are unique within the file.
- `tags`, `privacy`, `nodeTag` values come from `src/domain/enums.ts`.

**Characters**
- Personality 8 dims must be integers in `[-100, 100]`. All 8 keys required.
- `statuses[].kind` must be one of `hungry / fatigue / bored / excited / curious / lonely / angry`.
- `statuses[].level` must be one of `light / medium / severe`.
- `relations[*].kind` must be one of `stranger / acquaintance / friend / close_friend / lover / crush / rival / enemy / family`.
- `relations[*].affinity` must be in `[-100, 100]`.
- The template is **location-agnostic** — do NOT add a `locationId`, `worldId`, or `vitals` field. Those are runtime concerns.

## Style conventions

- **Names in Chinese, ids in kebab-case English** (mirrors existing files: `node-restaurant`, `char-zhangmo`).
- Each entry node should have a `description` that mentions the entry mechanism naturally ("镇口的公交车站就停在喷泉旁。").
- Use `spriteKey` for nodes that have art; use `avatar` for characters (a single emoji is fine).
- Personality values: keep most dimensions near 0 unless the trait is part of the character's identity. Strong values ($\pm 60$+) should be storyline-load-bearing.
- Relations: only declare the asymmetric edge from this character. Don't try to keep everyone's relations symmetric — that's a design choice, not a hard rule.

## When the user asks for something that doesn't fit

If the user's request can't be expressed in the current schema (e.g. "add a stamina stat", "characters should have inventories"), STOP and tell them. Don't invent fields that the validator will reject. Suggest extending `src/domain/types.ts` + `src/db/schema.ts` first.
