# Character Origin: Local vs Visitor

## Summary

Add an `origin` field to character templates to distinguish **locals** (born/rooted in the world) from **visitors** (newly arrived, placed mid-game or recently). This affects config generation workflows, schema validation, default spawn behavior, and initial vitals.

## Motivation

Currently all characters are treated uniformly — same default spawn, same vitals, same prompt framing. In practice, a visitor arriving at the bus stop should feel meaningfully different from a local waking up at home. This distinction also enables a "mid-game join" UX where visitors are held in a candidate pool and placed at chosen moments.

## Design

### 1. Schema & types

**New enum** in `src/domain/enums.ts`:

```ts
export const CHARACTER_ORIGINS = ["local", "visitor"] as const;
export type CharacterOrigin = (typeof CHARACTER_ORIGINS)[number];
```

**New required field `origin`** on both `CharacterTemplate` (config type) and `Character` (runtime type):

```ts
origin: CharacterOrigin;
```

**Validation** in `CharacterTemplateSchema`:

```ts
origin: z.enum(CHARACTER_ORIGINS),
```

**Migration**: all 13 existing character configs get `"origin": "local"`.

### 2. Config generation (skill)

The `agent-world-config` skill is updated to:

- Ask origin first when designing a character, before biography/sleep/etc.
- **Local design rule**: deep relationship web (3-6 links), `restNodeId` = own residence, biography reflects rootedness in the place, `sleepWindow` matches long-term profession rhythm.
- **Visitor design rule**: light relationship web (0-2 links, often one indirect contact), `restNodeId` may be absent or point to inn/temporary lodging, biography reflects "just arrived / moved / passing through", `sleepWindow` often shifted (travel fatigue, unfamiliar environment).
- **Seed guidance**: all locals go in CAST. 1-2 visitors placed as "recently arrived" at world start; remaining visitors stay in pool for mid-game placement.
- **Vitals defaults**: visitors get `fatigue: 2-3` (travel weariness) + `hunger: 1-2` automatically at spawn.

### 3. Runtime behavior

**`createWorldFromConfig`** (initial seed):

| Origin   | Default spawn           | Default vitals             |
|----------|-------------------------|----------------------------|
| local    | `restNodeId` → entry   | `hunger:0 fatigue:0 hygiene:0` |
| visitor  | entry node             | `hunger:1 fatigue:2 hygiene:0` |

**`addCharacterToWorld`** (mid-game placement):
- No change to spawn priority (explicit > restNodeId > entry).
- Visitor default vitals same as above.
- Entry node fallback unchanged.

**`GET /api/configs/characters`**: response gains `origin` field so the frontend can categorize.

### 4. Files changed

| File | Change |
|------|--------|
| `src/domain/enums.ts` | Add `CHARACTER_ORIGINS` and type |
| `src/domain/types.ts` | Add `origin` to `Character` |
| `src/config/types.ts` | Add `origin` to `CharacterTemplate` |
| `src/config/schemas.ts` | Add `origin` to `CharacterTemplateSchema` |
| `src/engine/createWorld.ts` | Origin-aware default spawn + visitor vitals |
| `src/engine/addCharacter.ts` | Visitor default vitals |
| `scripts/seed.ts` | Explicit origin logic (locals default home, visitors default entry) |
| `src/app/api/admin/reset/route.ts` | Same as seed |
| `src/app/api/configs/characters/route.ts` | Return `origin` in response |
| `configs/characters/*.json` (13 files) | Add `"origin": "local"` |
| `.claude/skills/agent-world-config/SKILL.md` | Origin-first design workflow |
| `.claude/skills/agent-world-config/references/character-schema.md` | Document `origin` field |

## Non-goals

- **No leave/exit mechanism** for visitors — they stay permanently once placed.
- **No runtime origin change** (visitor → local transition) in this iteration.
- **No subfolder restructuring** — all character configs stay flat under `configs/characters/`.
- No new character configs — this spec only modifies the toolchain for existing configs.
