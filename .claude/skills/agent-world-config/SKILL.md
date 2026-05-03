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
   - For a map: theme, scale (rough node count), tone, what kind of "entry" makes sense (公交车站 / 码头 / 传送阵 / 港口 / 城门 / 机场…), and what "bathing" facility fits the setting (公共浴池 / 家中浴室 / 河边温泉 …).
   - For a **character**: origin (local/visitor), name, age, gender, profession (from `PROFESSIONS` enum), MBTI archetype, `activityNodeId`, `restNodeId`, `sleepWindow`, and target relations to existing characters.
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
- ≥1 node has the `bathing` tag. Without it, no NPC can ever `bathe`, hygiene grows unbounded and forces constant ⚠ reminders. (公共浴池 / 家中带 bathing 标签的浴室 都行。)
- Exactly 1 root (`parentId: null`) is required (more is allowed but odd; usually 1).
- Every non-root `parentId` must reference another node in the same file.
- Node ids are unique within the file.
- `tags`, `privacy`, `nodeTag` values come from `src/domain/enums.ts`.
- `travelCost` (optional, integer ≥ 0) marks a node as "remote": entering it consumes that many ticks. Default 0 = free move. Shortcuts always cost 0.

**Characters**
- Personality: 4 MBTI dims `ei / sn / tf / jp`, each integer in `[-4, 4]`. ALL keys required.
- `relations[*].kinds` must be a non-empty subarray of `OBJECTIVE_RELATION_KINDS` (see `src/domain/enums.ts`).
- `relations[*].affection` must be an integer in `[-4, 4]`.
- `relations[*].since` and `lastInteractionTick` must be non-negative integers (use 0 for fresh templates).
- The template is **location-agnostic** — do NOT add `locationId`, `worldId`, `vitals`, `emotion`, `shortMemory`, `longMemory`, `currentAction`, or `lastThought`. Those are runtime concerns.
- `origin`: `"local"` | `"visitor"` (from `CHARACTER_ORIGINS` enum). Determines spawn behavior, default vitals, and narrative framing. See design principles below.

## Style conventions

- **Names in Chinese, ids in kebab-case English** (mirrors prior files: `node-restaurant`, `char-zhangmo`).
- Each entry node should have a `description` that mentions the entry mechanism naturally ("镇口的公交车站就停在喷泉旁。").
- Use `spriteKey` for nodes that have art; use `avatar` for characters (a single emoji is fine).
- MBTI: keep most dims modest (±1..±2). Strong values (|3|–|4|) should be storyline-load-bearing and recognizable in the LLM's reasoning. Aim for 1–2 strong dims per character.
- Relations: only declare the asymmetric edge from this character. Don't try to keep everyone's relations symmetric — that's a design choice, not a hard rule.
- Blood relations (`father / mother / son / daughter / older_brother / younger_brother / older_sister / younger_sister / other_relative`) cannot be ended by the engine or LLM. Use them deliberately.

## Character design principles

### Origin

Start every character design by deciding their origin. This affects everything: biography tone, relation density, node assignments, and vitals.

| Aspect | `"local"` | `"visitor"` |
|--------|-----------|-------------|
| Biography | Rooted in the place, multi-generational, "I've been here my whole life" tone | Arrived / moved / passing through, outside perspective, "I came here because..." narrative |
| Relations | 3-6 deep connections, blood ties, long-standing bonds | 0-2 light connections, often one indirect contact |
| `restNodeId` | Should point to their own residence | Optional; may point to inn or temporary lodging |
| `activityNodeId` | Local workplace / usual spot | May be absent or point to transient locations |
| Initial spawn | At `restNodeId` (home) | At entry node (bus stop etc.) |
| Initial vitals | Fresh: hunger 0, fatigue 0 | Travel-worn: hunger 1, fatigue 2 |
| Seed cast | All locals in CAST | 1-2 visitors placed as "recently arrived"; rest in candidate pool for mid-game placement |

## When the user asks for something that doesn't fit

If the user's request can't be expressed in the current schema (e.g. "add a stamina stat", "characters should have inventories"), STOP and tell them. Don't invent fields that the validator will reject. Suggest extending `src/domain/types.ts` + `src/db/schema.ts` first.

## Quick reference: CHARACTER_ORIGINS enum

`"local"` | `"visitor"`
