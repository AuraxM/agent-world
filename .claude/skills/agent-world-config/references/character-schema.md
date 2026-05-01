# Character template schema (`configs/characters/<id>.json`)

A character template is a **location-agnostic** identity definition. Where the character starts and what their hunger/fatigue are at game-start are decided by the cast spec at world creation, not by this file. Validated by `CharacterTemplateSchema` in `src/config/schemas.ts`.

## Top-level shape

```jsonc
{
  "id": "char-zhangmo",       // kebab-case, must match filename stem
  "name": "张默",              // display name (Chinese OK)
  "avatar": "🤐",              // optional; single emoji works as a sprite stand-in
  "personality": { ... },     // 8 dims, all required
  "statuses": [ ... ],        // initial discrete states (often 0–2)
  "abilities": [],            // v0 placeholder; usually empty
  "relations": { ... }        // map of other character id → relation
}
```

**Do NOT** include `worldId`, `locationId`, `vitals`, `shortMemory`, `longMemory`, `currentAction`, or `lastThought`. The validator will reject those fields — they're runtime state, not template data.

## Personality (`personality`)

8 integer dims, each in `[-100, 100]`. ALL keys required.

| key          | -100 ↔ +100 axis                       |
| ------------ | -------------------------------------- |
| extraversion | introvert ↔ extravert                  |
| rationality  | impulsive ↔ analytical                 |
| ambition     | content ↔ driven                       |
| altruism     | self-serving ↔ self-sacrificing        |
| curiosity    | incurious ↔ inquisitive                |
| aggression   | gentle ↔ hostile                       |
| honesty      | manipulative ↔ candid                  |
| stability    | volatile ↔ even-keeled                 |

**Style guidance:**
- Most dims should sit near 0 unless the trait is identity-forming. A character defined by 8 strong opinions reads as a caricature.
- Strong values (≥ |60|) should drive recognizable behavior (the LLM is told to cite a personality dim when reasoning).
- Aim for 2–4 strong values per character.

## Statuses (`statuses[]`)

Each entry:
```jsonc
{ "kind": "<StatusKind>", "level": "light" | "medium" | "severe", "since": 0 }
```

`kind` ∈ closed enum:

| kind      | when to use                                  |
| --------- | -------------------------------------------- |
| hungry    | derived from vitals — set if you also pass an initial hunger >= 5 in the cast spec |
| fatigue   | same, for fatigue >= 5                       |
| bored     | character starts uninterested in surroundings|
| excited   | character starts hyped                       |
| curious   | character starts seeking info                |
| lonely    | character starts isolated                    |
| angry     | character starts irritated                   |

`since` should be `0` for fresh templates (it's measured in ticks; the engine resets after status change).

Most templates have 0–1 status. Two is fine. More than two is unusual and should reflect a clearly stressed/complex character.

## Relations (`relations`)

Map of `targetCharacterId → relation`. Each relation:
```jsonc
{
  "kind": "friend",        // closed enum, see below
  "affinity": 60,          // -100..100 — how much *this* character likes the target
  "note": "童年好友..."    // optional natural-language flavor
}
```

`kind` ∈ closed enum:

| kind          | meaning                            |
| ------------- | ---------------------------------- |
| stranger      | no relationship                    |
| acquaintance  | knows but not close                |
| friend        | friendly                           |
| close_friend  | trusted                            |
| lover         | romantic, mutual (usually)         |
| crush         | romantic, one-sided                |
| rival         | competitive but not enemies        |
| enemy         | active animosity                   |
| family        | blood / chosen family              |

**Asymmetric by design.** A's relation to B is independent from B's relation to A. Crushes are usually one-sided. Family is usually mutual. Don't try to enforce symmetry — let each character speak for themselves.

Only include relations to characters that actually exist in `configs/characters/`. The validator does NOT cross-reference this; the runtime tolerates orphan relation keys but the LLM ignores them.

## Avatars

Single-emoji `avatar` is the easiest — used by `src/app/_lib/sprite.ts` as a render fallback. Examples already in use: 🤐 😄 😤 🌸 🧓. Pick an emoji that signals the character's energy at a glance.

## Common mistakes

- Including `locationId` or `vitals` in the template — those go in the cast spec at world creation.
- Personality values out of `[-100, 100]` — the validator rejects.
- Inventing status kinds or relation kinds — closed enums.
- Asymmetric relations triggering "but B has no relation back to A!" anxiety — that's fine; it's a feature.
- Setting all 8 personality dims to extreme values — the character becomes noise to the LLM.
