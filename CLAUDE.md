# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Full stack: Fastify server (port 3001) + Next.js web (port 3000)
pnpm dev:server       # Server only (hot reload via tsx watch)
pnpm dev:web          # Next.js dev server only
pnpm test             # Vitest run (single pass)
pnpm test:watch       # Vitest in watch mode
pnpm lint             # ESLint across all packages
pnpm build            # Build all workspace packages
pnpm db:migrate       # Run Drizzle migrations
pnpm db:reset         # Reset DB + re-migrate
pnpm seed             # Seed data via scripts/seed.ts
```

Tests are in `src/**/*.test.ts` and `packages/*/src/**/*.test.ts`. Vitest uses `globals: false` — import `describe`/`it`/`expect` explicitly. `TZ=UTC` is set in vitest config.

Environment variables: `DATABASE_URL` (path to SQLite db), `AGENT_WORLD_CONFIGS_DIR` (path to `configs/`), `PORT`/`HOST` for the Fastify server, `API_URL` for Next.js rewrite proxy target.

## Architecture

This is a **pnpm monorepo** for a multi-agent simulation where LLM-powered NPCs inhabit configurable maps and make autonomous decisions each tick.

### Package structure

| Package | Purpose |
|---------|---------|
| `@agw/domain` | Core types (`Character`, `Action`, `MapNode`, `WorldEvent`, etc.), enums, Zod schemas for LLM tool calls, `ActionRegistry` |
| `@agw/systems` | Engine systems: vitals/emotion decay, pathfinding (BFS), perception dispatch, action execution, facts aggregation, economy |
| `@agw/llm` | LLM integration: OpenAI-compatible client, decision loop, dialogue protocol, think sessions, memory compression, prompts |
| `@agw/config` | Map/character config loaders with Zod validation from `configs/maps/<pack-id>/` |
| `@agw/db` | Drizzle ORM + SQLite (better-sqlite3) — schema, repositories, migrations |
| `@agw/shared` | Logger utility |
| `@agw/server` (`apps/server/`) | Fastify API on port 3001: CRUD for worlds, characters, configs; tick execution |
| `@agw/web` (`src/`) | Next.js 16 admin dashboard with react-force-graph-2d node visualization |

### Map/character configs

Each map pack lives in `configs/maps/<pack-id>/`:
- `manifest.json` — metadata, language (`zh`/`en`/`ja`), economy config, optional `actions` reference
- `map.json` — nodes with parent/child hierarchy, tags, privacy, shortcuts, entry points
- `characters/*.json` — NPC templates with MBTI personality, profession, vitals, relations, biography
- `events.json` (optional) — scheduled/triggered world events
- `actions.js` (optional) — custom `ActionDefinition` array, registered into the global `actionRegistry`

The `@agw/config` loader validates all JSON against Zod schemas. `AGENT_WORLD_CONFIGS_DIR` env var sets the configs root.

### Core tick flow

`tick()` in `apps/server/src/tick.ts` orchestrates each simulation step:

1. **Vitals decay** (hunger, fatigue, hygiene) — produce inner events
2. **Emotion evolution** — mood/stress/social_satiety drift
3. **Perception dispatch** — each NPC sees events visible at their location (privacy/scope-based)
4. **Concurrent LLM decisions** — each free NPC calls `decide_action` tool (with `recall`/`memorize` sub-tools). Characters in ongoing conversations or think sessions are locked and skip normal decisions.
5. **Ongoing action processing** — move step-by-step along BFS paths; sleep with interrupt thresholds
6. **Dialogue phase** — `speak` actions trigger accept/reject → multi-turn LLM conversation protocol
7. **Think sessions** — `think` actions create solo reflection sessions with configurable turns per tick
8. **Action execution** — via `ActionRegistry`, applying state changes, writing memories, generating WorldEvents
9. **Relation management, economy snapshots, sleep memory compression**
10. **Persistence** — events, thoughts, character state, conversations, think sessions, snapshots (every 24 game hours)

### Action system

`ActionRegistry` (global singleton) holds `ActionDefinition` instances. Each definition has:
- `check(ctx)` — is the action available now?
- `hint(ctx)` — description for the LLM prompt
- `execute(ctx, input)` — produce `Outcome` (memory + optional event + state changes)
- `validateParams(input, ctx)` — validate LLM-provided params; return error string or null
- `onTick`/`onComplete`/`onInterrupt` — lifecycle hooks for ongoing actions
- `usableInDialogue` — whether it can be proposed inside a conversation
- `triggerHint` / `paramRule` — prompt-building metadata

Built-in actions are in `packages/systems/src/actions-builtin.ts`. Mod actions are loaded from `configs/maps/<pack-id>/actions.js`.

### LLM integration

`@agw/llm` uses OpenAI-compatible API. Multiple named entry points (`decide`, `dialog_turn`, `dialog_summarize`, `memory_compress`, `accept_decision`, `dialog_personal_memory`) can each route to different providers configured in the `llm_providers` / `llm_entry_configs` DB tables. Clients are cached globally per providerId.

Key LLM patterns:
- **Tool-calling**: All decisions go through function calling. The LLM must call a tool — pure text responses trigger re-prompting (max 3 rounds).
- **Thinking/reasoning**: DeepSeek `reasoning_content` is preserved across tool-call rounds.
- **Context building**: System + user prompts include personality, vitals, emotion, memories, relations, perceptions, notebook entries.
- **Fallback**: On any LLM failure, `look_around` is the safe default action.

### Key domain constants

- 1 tick = 1/5 game hour (`TICKS_PER_HOUR = 5`)
- Short memory FIFO: 50 entries
- Sleep duration: 40 ticks (8 game hours)
- Nap duration: 20 ticks (4 game hours)
- Max LLM tool-call rounds: 3
- LLM timeout: 30s, max 1 retry
- Facts lookback: 48 game hours
- Think turns per tick: 3
