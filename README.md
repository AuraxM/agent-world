# Agent World

LLM-powered NPCs inhabiting configurable maps and making autonomous decisions each tick.

## Repository layout

This is a co-located monorepo containing two **logically independent** projects:

- `frontend/` — Vite + React admin dashboard (port 3000)
- `backend/`  — Fastify HTTP API + simulation engine (port 3001)

Each side has its own `package.json` / `pnpm-lock.yaml` / `node_modules` / tooling. The root `package.json` holds only convenience scripts. See `CLAUDE.md` for AI-assisted development conventions.

## Quick start

```
pnpm install:all   # install deps in both frontend/ and backend/
pnpm db:migrate    # set up backend SQLite database
pnpm dev           # run both servers concurrently
```

Open http://localhost:3000/admin.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run frontend (:3000) + backend (:3001) concurrently |
| `pnpm dev:frontend` / `pnpm dev:backend` | Run one side |
| `pnpm test` / `pnpm test:frontend` / `pnpm test:backend` | Run tests |
| `pnpm lint` | Lint both sides |
| `pnpm build` | Production build of both sides |
| `pnpm gen:types` | Regenerate `frontend/src/types/api.generated.ts` from `backend/src/domain/{types,enums}.ts` |
| `pnpm check:types-fresh` | Fail if the generated types file is stale (use in CI) |
| `pnpm db:migrate` / `pnpm db:reset` | Backend database tasks |

You can also work in a subproject directly: `cd frontend && pnpm dev`.

## Architecture

See `CLAUDE.md` and `docs/superpowers/specs/2026-05-08-frontend-backend-split-design.md`.
