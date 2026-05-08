# Map config schema (`backend/scenes/<scene-id>/map.json`)

A map is a tree of nodes plus light metadata. Validated by `MapConfigSchema` in `backend/src/config/schemas.ts`. The `name`, `description`, `language`, etc. live in the sibling `manifest.json` — `map.json` itself only carries `id` and `nodes`.

## Top-level shape

```jsonc
{
  "id": "morning-town",          // string, kebab-case, must match scene id
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
  "shortcuts": [],                   // extra-tree connections to other node ids (always cost 0)
  "isEntry": true,                   // ≥1 per map MUST be true
  "travelCost": 2,                   // optional; ticks consumed when entering this node (default 0)
  "x": 6, "y": 14, "w": 9, "h": 6,   // optional grid coords inside parent's canvas
  "spriteKey": "park"                // optional art key; matches CSS palette tokens
}
```

## Required invariants

- **Entry node:** at least one node has `isEntry: true`. Pick a node that makes narrative sense as "where outsiders arrive": 公交车站 / 码头 / 传送阵 / 城门 / 港口 / 飞艇站 / 主街 etc. The root node itself can be marked as the entry if the map is small.
- **Bathing facility:** at least one node has the `bathing` tag. Without it nobody can ever `bathe`, so `hygiene` accumulates and triggers permanent ⚠ reminders. Common patterns: a `公共浴池` node, or each residence containing a `浴室` child with `tags: ["private", "indoor", "residence", "bathing"]`.
- **Single root:** exactly one node should have `parentId: null` (the map root).
- **Tree integrity:** every non-root `parentId` must point to another node id in the same file. No cycles.
- **Unique ids** within the file.

## Vocabulary (closed sets — see `backend/src/domain/enums.ts`)

### `tags` (any subset of NODE_TAGS)

| tag           | meaning                              | unlocks actions                |
| ------------- | ------------------------------------ | ------------------------------ |
| `public`      | open access — anyone can enter       | —                              |
| `semi`        | semi-public (school, office)         | —                              |
| `private`     | private space (residence, vault)     | unlocks `meditate`             |
| `indoor`      | inside a building                    | unlocks `read`, `write`        |
| `outdoor`     | open air                             | unlocks `exercise`             |
| `dining`      | food service                         | unlocks `eat`                  |
| `education`   | school, classroom                    | unlocks `work`                 |
| `residence`   | someone's home                       | unlocks `rest`, `sleep`, `groom` |
| `park`        | green space                          | —                              |
| `street`      | road / passage                       | —                              |
| `playground`  | sports / recreation                  | unlocks `exercise`             |
| `bathing`     | bath / shower facility               | unlocks `bathe`                |
| `quiet`       | quiet space (library, monastery)     | unlocks `meditate`             |

Use 1–3 tags per node; they affect which actions are available (see `backend/src/systems/actions.ts`). `private` privacy alone also unlocks `rest`/`sleep`/`groom`/`meditate`, so a private bedroom usually doesn't need `quiet`.

### `privacy`

- `public` — events default to broad visibility
- `semi` — events default to node-scoped visibility
- `private` — events default to node-only, often single-character

`privacy` and `tags.public/semi/private` should agree (e.g., a `private` residence shouldn't be tagged `public`).

## `travelCost` and free movement

The engine implements **free movement**: a `move` to a `travelCost: 0` (default) sibling/parent/child/shortcut consumes no tick — the actor immediately re-perceives the new location and can decide again, up to 5 chained free moves per tick.

Set `travelCost: N` (integer ≥ 0) for "remote" nodes that should consume time:
- A bus ride to the next town: `travelCost: 2`.
- A long mountain hike: `travelCost: 6`.
- A teleport pad: keep it 0 or use `shortcuts` (which are always 0).

Travel during a non-zero cost is implemented as a multi-tick `OngoingAction` — the character is committed and only an `intensity ≥ 5` perception can interrupt them.

## Layout fields (optional but recommended)

`x, y, w, h` are integer grid coordinates inside the **parent** node's canvas. Used by `frontend/src/components/map-stage.tsx` for rendering. If you omit them, the dashboard falls back to an automatic layout — fine, but loses spatial intuition.

`spriteKey` should match a `--palette-<key>-*` set in `frontend/src/styles/globals.css`. Existing keys: `town, school, classroom, playground, restaurant, park, home-cool, home-warm`. Reuse before inventing.

## Patterns

**Small map (single area + entry + bath):** root with `isEntry: true`, plus at least one child or shortcut node tagged `bathing`. Done.

**Medium map (one root, several siblings, one entry):** root with `isEntry: true` *or* one of its children. Add a `公共浴池` sibling so anyone in the public area can bathe.

**Large map (multi-level):** typically the root is conceptual (the city itself) and one of its public-outdoor children is the entry (公交车站, 码头). Each residence subtree should contain a `bathing` room, OR add a `公共浴池` near the entry.

## Common mistakes

- Forgetting `isEntry: false` on every other node — it's required, not defaulted.
- Forgetting any `bathing` node — `hygiene` becomes a permanent ⚠ for everyone.
- Pointing `parentId` at a node defined later in the array. (Order doesn't matter for validation, but it makes diff review easier to put parents before children.)
- Mixing `privacy: "private"` with `visibleFromParent: true` — usually wrong; private spaces shouldn't broadcast.
- Inventing tags. The enum is closed; add to `backend/src/domain/enums.ts` first if needed.
