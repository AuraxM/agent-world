# Map config schema (`configs/maps/<id>.json`)

A map is a tree of nodes plus light metadata. Validated by `MapConfigSchema` in `src/config/schemas.ts`.

## Top-level shape

```jsonc
{
  "id": "morning-town",          // string, kebab-case, must match filename stem
  "name": "晨曦小镇",            // human-readable; shown in UI
  "description": "依山而建...",  // optional
  "nodes": [ /* MapNodeConfig[] */ ]
}
```

## Node shape (`MapNodeConfig`)

```jsonc
{
  "id": "node-park",                 // unique within this file
  "parentId": "node-town" | null,    // null = root; else must reference another node id
  "name": "中央公园",
  "description": "镇中心的小公园…",
  "tags": ["public", "outdoor"],     // see vocab below
  "capacity": 50,                    // null = unlimited; else positive integer
  "privacy": "public",               // "public" | "semi" | "private"
  "visibleFromParent": true,         // can the parent see the activity inside?
  "shortcuts": [],                   // extra-tree connections to other node ids (rare)
  "isEntry": true,                   // ≥1 per map MUST be true
  "x": 6, "y": 14, "w": 9, "h": 6,   // optional grid coords inside parent's canvas
  "spriteKey": "park"                // optional art key; matches CSS palette tokens
}
```

## Required invariants

- **Entry node:** at least one node has `isEntry: true`. Pick a node that makes narrative sense as "where outsiders arrive": 公交车站 / 码头 / 传送阵 / 城门 / 港口 / 飞艇站 / 主街 etc. The root node itself can be marked as the entry if the map is small.
- **Single root:** exactly one node should have `parentId: null` (the map root).
- **Tree integrity:** every non-root `parentId` must point to another node id in the same file. No cycles.
- **Unique ids** within the file.

## Vocabulary (closed sets — see `src/domain/enums.ts`)

### `tags` (any subset)

| tag           | meaning                              |
| ------------- | ------------------------------------ |
| `public`      | open access — anyone can enter       |
| `semi`        | semi-public (school, office)         |
| `private`     | private space (residence, vault)     |
| `indoor`      | inside a building                    |
| `outdoor`     | open air                             |
| `dining`      | food service                         |
| `education`   | school, classroom                    |
| `residence`   | someone's home                       |
| `park`        | green space                          |
| `street`      | road / passage                       |
| `playground`  | sports / recreation                  |

Use 1–3 tags per node; they affect which actions are available (see `src/engine/actions.ts`).

### `privacy`

- `public` — events default to broad visibility
- `semi` — events default to node-scoped visibility
- `private` — events default to node-only, often single-character

`privacy` and `tags.public/semi/private` should agree (e.g., a `private` residence shouldn't be tagged `public`).

## Layout fields (optional but recommended)

`x, y, w, h` are integer grid coordinates inside the **parent** node's canvas. Used by `src/app/_components/map-stage.tsx` for rendering. If you omit them, the dashboard falls back to an automatic layout — fine, but loses spatial intuition.

`spriteKey` should match a `--palette-<key>-*` set in `src/app/globals.css`. Existing keys: `town, school, classroom, playground, restaurant, park, home-cool, home-warm`. Reuse before inventing.

## Patterns

**Small map (single area + entry):** root with `isEntry: true`. Done.

**Medium map (one root, several siblings, one entry):** root with `isEntry: true` *or* one of its children (whichever is the obvious "arrival" point).

**Large map (multi-level):** typically the root is conceptual (the city itself) and one of its public-outdoor children is the entry (公交车站, 码头).

## Common mistakes

- Forgetting `isEntry: false` on every other node — it's required, not defaulted.
- Pointing `parentId` at a node defined later in the array. (Order doesn't matter for validation, but it makes diff review easier to put parents before children.)
- Mixing `privacy: "private"` with `visibleFromParent: true` — usually wrong; private spaces shouldn't broadcast.
- Inventing tags. The enum is closed; add to `enums.ts` first if needed.
