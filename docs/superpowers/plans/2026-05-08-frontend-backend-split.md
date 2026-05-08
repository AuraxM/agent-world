# Frontend/Backend Split Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the current pnpm monorepo (`apps/server` + `packages/{domain,systems,llm,db,config,shared}` + root `src/`) into two co-located but logically independent projects (`frontend/` + `backend/`), each with its own `package.json` / `pnpm-lock.yaml` / tooling, ready for future separation into independent repos.

**Architecture:** A thin root `package.json` carries only convenience scripts (no deps, no workspace). `frontend/` is a Vite + React SPA; `backend/` is a flat Node project with all engine modules under `backend/src/<module>/`. Types are shared via signed-in codegen output (`backend/src/domain/{types,enums}.ts` → `frontend/src/types/api.generated.ts`).

**Tech Stack:** Vite 5, React 19, react-router-dom v7, Tailwind 4, TypeScript 5, Fastify 5, Drizzle ORM, better-sqlite3, OpenAI SDK, zod, Vitest, ESLint 9 with `eslint-plugin-import` `no-restricted-paths`.

**Spec:** `docs/superpowers/specs/2026-05-08-frontend-backend-split-design.md`. The plan implements that spec literally; deviations require updating the spec first.

**Branch convention:** All work happens on a feature branch (e.g. `refactor/frontend-backend-split`). Phase 0 is the first commit; Phase 1 commits follow on the same branch and are merged as a single PR.

---

## Phase 0 — Pre-cleanup (one commit on the feature branch)

**Goal:** Remove dead code and duplicate files so the main refactor's diff reflects real moves.

### Task 0.1: Delete 5 re-export shim directories from `src/`

**Background:** The 6 directories `src/{engine,llm,db,domain,config,util}/` were left behind by an earlier monorepo migration. Five of them (`engine`, `llm`, `db`, `config`, `util`) are no longer consumed by anything that survives this refactor — they are pure re-export files like `export * from "../../packages/llm/src"`. We delete those five.

**`src/domain/` is NOT deleted in Phase 0**: `src/app/` still imports from `@/domain/types` and `@/domain/enums`, and the codegen pipeline that replaces those imports doesn't exist yet. `src/domain/` dies in Phase 1 Step 1.2 once the frontend is moved and pointed at the codegen output.

**Files:**
- Delete: `src/engine/` (entire directory)
- Delete: `src/llm/` (entire directory)
- Delete: `src/db/` (entire directory)
- Delete: `src/config/` (entire directory)
- Delete: `src/util/` (entire directory)

- [ ] **Step 1: Verify no surviving consumers of the 5 dirs**

Run from repo root:
```
grep -rn "from [\"']@/\(engine\|llm\|db\|config\|util\)/" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=.next .
```
(On Windows PowerShell, use the `Grep` tool with the same regex.)

Expected: zero matches. (`src/app/` only uses `@/domain/*`; the 5 shim dirs have no live consumers.)

If any matches appear, change them to import from `@agw/<pkg>` directly (e.g. `from "@/engine/tick"` → `from "@agw/systems/tick"` or whatever the package's actual export shape is) and re-run the grep.

- [ ] **Step 2: Delete the 5 directories**

```
git rm -r src/engine src/llm src/db src/config src/util
```

- [ ] **Step 3: Verify build + tests**

```
pnpm install
pnpm test
pnpm lint
```

Expected: all green. `src/domain/` shim is still in place, so `src/app/` imports still resolve.

- [ ] **Step 4: Stage but do not commit yet** (combined with later Phase 0 tasks)

Skip; Task 0.3 commits everything together.

---

### Task 0.2: Resolve duplicate SQLite database files

**Background:** Both `agent-world.db` (root) and `apps/server/data/agent-world.db` exist; only one is the live one. Keep the newer file, delete the other. The survivor is moved to `backend/data/` in Phase 1 Step 1.3.

**Files:**
- Delete: one of `agent-world.db*` (root) OR `apps/server/data/agent-world.db*`

- [ ] **Step 1: Compare modification times**

PowerShell:
```
Get-Item agent-world.db, apps/server/data/agent-world.db | Select-Object FullName, LastWriteTime
```
Bash:
```
ls -la agent-world.db apps/server/data/agent-world.db
```

Identify the file with the more recent `LastWriteTime` (or larger size if times are equal). That is the survivor.

- [ ] **Step 2: Delete the loser (and its `-shm` / `-wal` siblings)**

If root was newer, delete `apps/server/data/`:
```
git rm -r --cached apps/server/data 2>/dev/null || true
rm -rf apps/server/data
```
(The `apps/server/data/` directory is currently untracked per `git status` snapshot; `git rm --cached` is no-op then.)

If `apps/server/data/agent-world.db` was newer, delete root copies:
```
rm -f agent-world.db agent-world.db-shm agent-world.db-wal
```

- [ ] **Step 3: Verify only one .db remains**

```
find . -name "agent-world.db" -not -path "./node_modules/*" -not -path "./.worktrees/*"
```

Expected: exactly one path (either `./agent-world.db` or `./apps/server/data/agent-world.db`).

- [ ] **Step 4: Stage; do not commit yet**

---

### Task 0.3: Prune unused root-level scripts and commit Phase 0

**Background:** `scripts/` contains TypeScript entry points; some may have been orphaned. Identify which ones are still referenced by `package.json scripts` or by `start.sh` / `start.ps1`, and delete the rest.

**Files:**
- Inspect: `scripts/*.ts` (all)
- Delete: scripts confirmed orphaned (none guessed in advance — must enumerate)

- [ ] **Step 1: Build the live-script reference set**

List every `tsx scripts/<name>.ts` reference:
```
grep -rn "tsx scripts/" package.json apps/server/package.json packages/*/package.json scripts/start.sh scripts/start.ps1 2>/dev/null
```

The current root `package.json` references `scripts/seed.ts` and `scripts/db-reset.ts`. Other scripts (`benchmark-reasoning.ts`, `migrate-llm-env.ts`, `observe-circadian.ts`, `resolve-coords.ts`, `smoke-llm.ts`, `smoke-tick.ts`, `verify-economy.ts`, `generate-skeleton.ts`) need a manual decision:

- If the script is one you currently use occasionally (smoke tests, benchmarks), **keep** it (it migrates to `backend/scripts/` in Phase 1).
- If the script is clearly dead (e.g. `migrate-llm-env.ts` was a one-shot from a past refactor), **delete** it.

**This is a judgment call. Output the list of scripts to delete and confirm with the human operator before proceeding.** If executing autonomously, default to KEEPING all scripts (conservative).

- [ ] **Step 2: Delete confirmed-orphan scripts (if any)**

```
git rm scripts/<orphan>.ts
```
Repeat per orphan.

- [ ] **Step 3: Verify build + tests after pruning**

```
pnpm test
pnpm lint
```

Expected: all green.

- [ ] **Step 4: Commit Phase 0**

```
git add -A
git commit -m "chore: remove dead re-export shims and stale db duplicates

- Remove src/{engine,llm,db,config,util}/ re-export shim directories
  (left over from the earlier monorepo migration; no live consumers).
- Remove duplicate agent-world.db (kept newer of root vs apps/server/data/).
- Prune orphan scripts in scripts/ (if any).

src/domain/ is intentionally retained — src/app/ still depends on it
until the Phase 1 codegen pipeline lands."
```

- [ ] **Step 5: Verify commit is clean**

```
git status
git log -1 --stat
```

Expected: working tree clean; the commit shows only the deletions described.

---

## Phase 1 — Main refactor

### Task 1.1.1: Scaffold `frontend/` project skeleton

**Background:** Create an empty Vite + React project at `frontend/` with its own `package.json`, lockfile, and tooling configs. Code migration happens in Task 1.2.

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/eslint.config.mjs`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/postcss.config.mjs`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/.gitignore`
- Create: `frontend/.env.example`

- [ ] **Step 1: Create `frontend/` and initial files**

`frontend/package.json`:
```json
{
  "name": "agent-world-frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint ."
  },
  "dependencies": {
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "react-router-dom": "^7.1.0",
    "react-force-graph-2d": "^1.29.1"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^4.3.4",
    "eslint": "^9",
    "eslint-plugin-react-hooks": "^5.1.0",
    "eslint-plugin-react-refresh": "^0.4.18",
    "globals": "^15.14.0",
    "jsdom": "^25.0.1",
    "postcss": "^8",
    "tailwindcss": "^4",
    "typescript": "^5",
    "typescript-eslint": "^8.18.2",
    "vite": "^6.0.7",
    "vitest": "^4.1.5"
  }
}
```

`frontend/vite.config.ts`:
```ts
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiUrl = env.VITE_API_URL ?? "http://localhost:3001";
  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        "/api": {
          target: apiUrl,
          changeOrigin: true,
          // Long-running SSE for tick — disable proxy timeout
          timeout: 0,
          proxyTimeout: 0,
        },
      },
    },
  };
});
```

`frontend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": false,
    "verbatimModuleSyntax": true,
    "useDefineForClassFields": true
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`frontend/tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

`frontend/eslint.config.mjs`:
```js
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "src/types/api.generated.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  }
);
```

`frontend/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    env: { TZ: "UTC" },
  },
});
```

`frontend/postcss.config.mjs`:
```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

`frontend/tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

`frontend/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/x-icon" href="/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agent World</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`frontend/.gitignore`:
```
node_modules/
dist/
.vite/
coverage/
*.log
.env
.env.local
```

`frontend/.env.example`:
```
# Backend API base URL (used by Vite dev proxy and prod runtime)
VITE_API_URL=http://localhost:3001
```

- [ ] **Step 2: Create the temporary entry point so dev server boots**

`frontend/src/main.tsx`:
```tsx
import { createRoot } from "react-dom/client";
import { StrictMode } from "react";

const root = document.getElementById("root");
if (!root) throw new Error("#root element not found in index.html");

createRoot(root).render(
  <StrictMode>
    <div style={{ fontFamily: "system-ui", padding: 24 }}>
      Agent World frontend skeleton — code migration pending.
    </div>
  </StrictMode>
);
```

- [ ] **Step 3: Install deps and verify dev server boots**

```
cd frontend
pnpm install
pnpm dev
```

Expected: Vite dev server starts on `http://localhost:3000`, page shows "Agent World frontend skeleton — code migration pending."
Stop with Ctrl-C.

- [ ] **Step 4: Verify lockfile created**

```
ls frontend/pnpm-lock.yaml
```

Expected: file exists.

- [ ] **Step 5: Commit**

```
git add frontend/
git commit -m "feat(frontend): scaffold Vite + React project skeleton"
```

---

### Task 1.2.1: Move `src/app/` content into `frontend/src/`

**Background:** Move all real frontend code with `git mv` to preserve history. Routing/imports get fixed in subsequent tasks; this task only relocates files.

**Files (moves only):**
- `src/app/page.tsx` → `frontend/src/routes/home.tsx`
- `src/app/admin/page.tsx` → `frontend/src/routes/admin.tsx`
- `src/app/layout.tsx` → `frontend/src/_layout.old.tsx` (kept temporarily as reference; deleted after Task 1.2.2)
- `src/app/globals.css` → `frontend/src/styles/globals.css`
- `src/app/_components/*` → `frontend/src/components/*`
- `src/app/_hooks/*` → `frontend/src/hooks/*`
- `src/app/_lib/*` → `frontend/src/lib/*`
- `src/app/favicon.ico` → `frontend/public/favicon.ico`
- `public/*.svg` → `frontend/public/*.svg`

- [ ] **Step 1: Create target directories**

```
mkdir -p frontend/src/routes frontend/src/components frontend/src/hooks frontend/src/lib frontend/src/styles frontend/public
```

- [ ] **Step 2: Move route files**

```
git mv src/app/page.tsx frontend/src/routes/home.tsx
git mv src/app/admin/page.tsx frontend/src/routes/admin.tsx
git mv src/app/layout.tsx frontend/src/_layout.old.tsx
```

- [ ] **Step 3: Move components, hooks, libs, styles**

```
git mv src/app/_components/* frontend/src/components/
git mv src/app/_hooks/* frontend/src/hooks/
git mv src/app/_lib/* frontend/src/lib/
git mv src/app/globals.css frontend/src/styles/globals.css
```

- [ ] **Step 4: Move public assets**

```
git mv src/app/favicon.ico frontend/public/favicon.ico
git mv public/file.svg frontend/public/file.svg
git mv public/globe.svg frontend/public/globe.svg
git mv public/next.svg frontend/public/next.svg
git mv public/vercel.svg frontend/public/vercel.svg
git mv public/window.svg frontend/public/window.svg
```

- [ ] **Step 5: Remove now-empty `src/app/` and root `public/`**

```
rmdir src/app/admin src/app/_components src/app/_hooks src/app/_lib src/app
rmdir public
```

(If any directory is non-empty because of files we missed, list them and add the appropriate `git mv`. Do not commit until `src/app` is fully gone.)

- [ ] **Step 6: Verify the moves**

```
git status
```

Expected: `git status` shows `R` (renames) for all files moved above. No `??` (untracked) entries from `src/app/`. `frontend/src/{routes,components,hooks,lib,styles}/` all populated.

- [ ] **Step 7: Stage but do not commit yet** (Task 1.2.2 finishes the migration)

---

### Task 1.2.2: Write the handwritten codegen-output stub `frontend/src/types/api.generated.ts`

**Background:** Until Task 1.4 produces the real codegen output, the moved frontend code's `@/domain/*` imports need a target. Create a hand-written stub containing exactly the types and constants `frontend/src/` consumes today. The real codegen will overwrite this file in Task 1.4.

**File:**
- Create: `frontend/src/types/api.generated.ts`

The exact symbols frontend currently consumes (verified by grep on `src/app/`):
- Types: `Character`, `MapNode`, `World`, `WorldEvent`, `Action`, `OngoingAction`, `Personality`, `SleepWindow`, `Relation`
- Type from enums: `ObjectiveRelationKind`
- Value from enums: `TICKS_PER_HOUR`

- [ ] **Step 1: Write the stub**

`frontend/src/types/api.generated.ts`:
```ts
/**
 * ⚠️ AUTO-GENERATED stub — will be overwritten by `pnpm gen:types` (Task 1.4).
 * Hand-maintained until the codegen pipeline is wired up. Do not add new exports
 * here; instead add them to backend/src/domain/{types,enums}.ts and regenerate.
 */

// ── from enums.ts ─────────────────────────────────────────────────────────────

export const TICKS_PER_HOUR = 5;

export type ObjectiveRelationKind =
  | "father" | "mother" | "son" | "daughter"
  | "older_brother" | "younger_brother" | "older_sister" | "younger_sister"
  | "other_relative"
  | "classmate" | "teacher" | "student"
  | "colleague" | "boss" | "subordinate"
  | "neighbor" | "landlord" | "tenant"
  | "spouse" | "partner" | "ex_partner"
  | "friend"
  | "acquaintance";

// ── from types.ts ─────────────────────────────────────────────────────────────
//
// Stub policy: copy the EXACT shape currently used by `frontend/src/`. If a
// frontend file imports a type that's missing here, copy that type's definition
// from the original `packages/domain/src/types.ts` (now `backend/src/domain/types.ts`
// after Task 1.3). Keep stubs to fields actually read by the frontend; do not
// guess at additional fields. Codegen in Task 1.4 will produce the canonical
// shape.

// TODO-FOR-IMPLEMENTER: copy the shapes of Character, MapNode, World, WorldEvent,
// Action, OngoingAction, Personality, SleepWindow, Relation from the current
// packages/domain/src/types.ts. Verbatim is fine — type-only definitions, no
// imports. Replace any `import type { X } from "./enums"` references with the
// inline definitions from the enums.ts block above (only ObjectiveRelationKind
// is currently cross-referenced).
```

- [ ] **Step 2: Fill the TODO with verbatim type definitions**

Open `packages/domain/src/types.ts` (which still exists at this point — moved to backend in Task 1.3). Copy each of the 9 types listed above into `frontend/src/types/api.generated.ts`, replacing the file's TODO comment. Strip the file's top `import type { ... } from "./enums"` line; the only enum used is `ObjectiveRelationKind` which is already inlined above.

If a copied type references another enum not yet inlined (e.g. `NodeTag`, `Privacy`, `EventScope`, `EventCategory`, `EventSource`, `Profession`, `Gender`, `CharacterOrigin`), inline that enum's `type X = "a" | "b" | ...` form from `packages/domain/src/enums.ts` into the enums block. Do not bring `as const` arrays into the stub unless a frontend file actually reads the array (verified by `grep -rn "NODE_TAGS\|PROFESSIONS\|GENDERS" frontend/src/`).

- [ ] **Step 3: Verify the stub satisfies frontend type-check**

The frontend can't be type-checked yet because imports in moved files still say `@/domain/...`. Move on to Task 1.2.3 which fixes that.

---

### Task 1.2.3: Repoint frontend imports from `@/domain/*` and `@/app/_lib/*` to local paths

**Background:** Moved files still import via the old Next.js `@/` alias. Replace with relative paths or with `@/types/api.generated`. After this task, the frontend type-checks and Vite builds without touching `src/domain/` or `src/app/`.

**Files (modify):**
- `frontend/src/components/*.tsx` — every file with `@/domain/...` import
- `frontend/src/hooks/*.ts`
- `frontend/src/lib/*.ts` and `*.test.ts`
- `frontend/src/routes/home.tsx`
- `frontend/src/routes/admin.tsx`

- [ ] **Step 1: Add path alias `@/` → `frontend/src/` in tsconfig + Vite + Vitest**

Edit `frontend/tsconfig.json`, add to `compilerOptions`:
```json
"baseUrl": ".",
"paths": {
  "@/*": ["./src/*"]
}
```

Edit `frontend/vite.config.ts`, add to the returned config object:
```ts
resolve: {
  alias: {
    "@": new URL("./src", import.meta.url).pathname,
  },
},
```

Edit `frontend/vitest.config.ts`, add:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    globals: false,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    env: { TZ: "UTC" },
  },
});
```

- [ ] **Step 2: Bulk-replace `@/domain/types` → `@/types/api.generated`**

Use the `Edit` tool with `replace_all: true` on every affected file, OR run a recursive sed (Bash):
```
find frontend/src -name "*.ts" -o -name "*.tsx" | xargs sed -i 's|from "@/domain/types"|from "@/types/api.generated"|g'
find frontend/src -name "*.ts" -o -name "*.tsx" | xargs sed -i 's|from "@/domain/enums"|from "@/types/api.generated"|g'
```

PowerShell equivalent:
```powershell
Get-ChildItem -Path frontend/src -Recurse -Include *.ts,*.tsx |
  ForEach-Object {
    (Get-Content $_.FullName -Raw) `
      -replace '"@/domain/types"', '"@/types/api.generated"' `
      -replace '"@/domain/enums"', '"@/types/api.generated"' |
    Set-Content $_.FullName -NoNewline
  }
```

- [ ] **Step 3: Repoint `@/app/_lib/*` to `@/lib/*`**

Same approach:
```
find frontend/src -name "*.ts" -o -name "*.tsx" | xargs sed -i 's|from "@/app/_lib/|from "@/lib/|g'
```
PowerShell: replace `"@/app/_lib/` with `"@/lib/`.

- [ ] **Step 4: Verify no stale imports remain**

```
grep -rn '@/domain\|@/app/' frontend/src/
```

Expected: zero matches.

- [ ] **Step 5: Write the route entry `frontend/src/App.tsx`**

`frontend/src/App.tsx`:
```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "@/routes/home";
import AdminPage from "@/routes/admin";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 6: Replace `frontend/src/main.tsx` with the real entry**

`frontend/src/main.tsx`:
```tsx
import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import App from "@/App";
import "@/styles/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root element not found in index.html");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 7: Port `src/app/layout.tsx`'s chrome into `App.tsx` if needed, then delete `_layout.old.tsx`**

Open `frontend/src/_layout.old.tsx`. If it contains `<html>`/`<body>` boilerplate plus children pass-through (the typical Next.js root layout), most content can stay in `index.html`; only `<body>`-level wrappers (theme providers, global UI) need to move into `App.tsx` wrapping `<Routes>`. Apply minimally; verify the result still renders both routes.

```
git rm frontend/src/_layout.old.tsx
```

- [ ] **Step 8: Default exports for routes**

Confirm `frontend/src/routes/home.tsx` and `frontend/src/routes/admin.tsx` each `export default function ...`. Next.js's `page.tsx` already required default exports, so they should. If not, add `export default`.

- [ ] **Step 9: Verify frontend typechecks and dev server boots**

```
cd frontend
pnpm exec tsc -b --noEmit
pnpm dev
```

Expected:
- `tsc` reports zero errors.
- Vite serves on :3000.
- Visiting `http://localhost:3000/` shows the home page rendering.
- Visiting `http://localhost:3000/admin` shows the admin dashboard skeleton (API calls will fail with network errors — that is expected; backend has not been brought up yet).

Stop with Ctrl-C.

- [ ] **Step 10: Run frontend tests**

```
cd frontend
pnpm test
```

Expected: all tests in `src/lib/*.test.ts` pass (gantt-utils, format, profile-format, relation-graph-utils — all pure-function tests, no DOM).

- [ ] **Step 11: Commit**

```
git add -A
git commit -m "feat(frontend): migrate src/app/ to frontend/src/ with React Router

- git mv src/app/{page,admin/page,layout,_components,_hooks,_lib,globals.css,favicon.ico}
  → frontend/src/{routes,components,hooks,lib,styles,public}/.
- Replace Next App Router with react-router-dom BrowserRouter (2 routes).
- Repoint @/domain/* imports to @/types/api.generated (handwritten stub).
- Add path alias @/ → frontend/src/ in tsconfig, vite.config, vitest.config.

src/domain/ shim is intentionally NOT removed yet — it is deleted in Task 1.3
as part of the bulk src/ removal."
```

---

### Task 1.3.1: Move `apps/server/` and `packages/*/src/` into `backend/src/`

**Background:** Move all server / engine source files into the flat backend layout. Imports and configs are fixed in subsequent tasks; this task is pure relocation.

**Files (moves):**
- `apps/server/src/*` → `backend/src/server/*`
- `packages/domain/src/*` → `backend/src/domain/*`
- `packages/systems/src/*` → `backend/src/systems/*`
- `packages/llm/src/*` → `backend/src/llm/*`
- `packages/db/src/*` → `backend/src/db/*` (drizzle migrations folder included)
- `packages/config/src/*` → `backend/src/config/*`
- `packages/shared/src/*` → `backend/src/shared/*`

- [ ] **Step 1: Create target directories**

```
mkdir -p backend/src/{server,domain,systems,llm,db,config,shared}
```

- [ ] **Step 2: Move server**

```
git mv apps/server/src/index.ts backend/src/server/index.ts
git mv apps/server/src/tick.ts backend/src/server/tick.ts
git mv apps/server/src/decideForCharacter.ts backend/src/server/decideForCharacter.ts
git mv apps/server/src/routes backend/src/server/routes
```

- [ ] **Step 3: Move package sources**

```
git mv packages/domain/src/* backend/src/domain/
git mv packages/systems/src/* backend/src/systems/
git mv packages/llm/src/* backend/src/llm/
git mv packages/db/src/* backend/src/db/
git mv packages/config/src/* backend/src/config/
git mv packages/shared/src/* backend/src/shared/
```

(Note: `packages/db/src/` includes `migrations/` — that subdirectory comes along.)

- [ ] **Step 4: Verify all sources moved**

```
git status
```

Expected: `R` (rename) entries for every `.ts` file moved above. The directories `apps/server/src/`, `packages/*/src/` are now empty (dirs themselves still exist with only their `package.json` siblings).

- [ ] **Step 5: Stage; do not commit yet** (Task 1.3.2 etc. continue the migration on the same atomic commit)

---

### Task 1.3.2: Move `configs/` → `backend/scenes/` and flatten the `maps/` middle layer

**Background:** Rename the content directory from `configs` to `scenes` and remove the redundant `maps/` middle layer. Currently each scene lives at `configs/maps/<scene-id>/`; after this task it lives at `backend/scenes/<scene-id>/`. The loader code in `backend/src/config/` (already moved in Task 1.3.1) is updated to match.

**Files:**
- Move directory: `configs/maps/<scene-id>/` → `backend/scenes/<scene-id>/` (for each scene)
- Modify: `backend/src/config/loader.ts` — change path resolution
- Modify: `backend/src/config/mod-loader.ts` — same
- Modify: any other file that hardcodes `'maps/'` (verified by grep)

- [ ] **Step 1: Identify scenes and move them**

```
ls configs/maps/
```

Expected output: one or more scene directories (e.g. `sakuradai-high-school`).

For each scene `<id>`:
```
mkdir -p backend/scenes
git mv configs/maps/<id> backend/scenes/<id>
```

- [ ] **Step 2: Remove now-empty `configs/`**

```
rmdir configs/maps configs
```

If `configs/` is non-empty (other top-level files), enumerate and decide per-file. The known structure has only `configs/maps/`.

- [ ] **Step 3: Find every hard-coded `'maps/'` reference**

```
grep -rn "maps/" backend/src/ --include="*.ts" | grep -v "// "
```

Inspect each match. The known load points are:
- `backend/src/config/loader.ts` — `path.join(configsDir, "maps", id, ...)` style.
- `backend/src/config/mod-loader.ts` — likely the same pattern for loading `actions.js`.
- `backend/src/config/event-loader.ts` — for `events.json`.

For each occurrence, change `path.join(configsDir, "maps", id, ...)` → `path.join(scenesDir, id, ...)`.

Also rename the parameter / variable from `configsDir` → `scenesDir` for clarity (keeps the loader internally consistent with the env-var rename below).

- [ ] **Step 4: Rename env var `AGENT_WORLD_CONFIGS_DIR` → `AGENT_WORLD_SCENES_DIR`**

```
grep -rn "AGENT_WORLD_CONFIGS_DIR" backend/ --include="*.ts"
```

Replace each with `AGENT_WORLD_SCENES_DIR`. Default-value strings change from `./configs` (or `<root>/configs`) to `./scenes` (or `<backend-root>/scenes`).

Repeat for any references in scripts (`backend/scripts/seed.ts` etc.).

- [ ] **Step 5: Verify with grep**

```
grep -rn "AGENT_WORLD_CONFIGS_DIR\|configs/maps\|configsDir" backend/ --include="*.ts"
```

Expected: zero matches.

- [ ] **Step 6: Stage; do not commit yet**

---

### Task 1.3.3: Move `data/`, `drizzle/` migrations, and root `scripts/`

**Background:** Move runtime resources into `backend/`.

**Files:**
- `data/agent-world.db*` → `backend/data/agent-world.db*` (or `apps/server/data/agent-world.db*` if that was the survivor from Task 0.2)
- `drizzle/<migration files>` → `backend/src/db/migrations/` (NOTE: `packages/db/src/migrations/` already came across in Task 1.3.1; merge with that)
- `scripts/<all .ts files>` → `backend/scripts/`
- `scripts/start.sh`, `scripts/start.ps1` → DELETE (replaced by root `pnpm dev` orchestration; see Task 1.5)

- [ ] **Step 1: Move the SQLite db**

If the surviving copy is at root:
```
mkdir -p backend/data
git mv agent-world.db backend/data/agent-world.db
# also move -shm and -wal if present:
[ -f agent-world.db-shm ] && git mv agent-world.db-shm backend/data/
[ -f agent-world.db-wal ] && git mv agent-world.db-wal backend/data/
```

If the survivor was `apps/server/data/agent-world.db`:
```
mkdir -p backend/data
git mv apps/server/data/agent-world.db backend/data/agent-world.db
[ -f apps/server/data/agent-world.db-shm ] && git mv apps/server/data/agent-world.db-shm backend/data/
[ -f apps/server/data/agent-world.db-wal ] && git mv apps/server/data/agent-world.db-wal backend/data/
rmdir apps/server/data
```

- [ ] **Step 2: Reconcile drizzle migrations**

There are two possible migration directories:
- `drizzle/` (root) — created by `drizzle-kit` at the root level.
- `packages/db/src/migrations/` — referenced as `out` in the existing `drizzle.config.ts`. After Task 1.3.1 this content is at `backend/src/db/migrations/`.

Verify both:
```
ls drizzle/ 2>/dev/null
ls backend/src/db/migrations/ 2>/dev/null
```

If `drizzle/` exists with content, merge it into `backend/src/db/migrations/`:
```
cp -rn drizzle/* backend/src/db/migrations/
git rm -r drizzle
```

(The two locations should hold the same files. If they conflict, prefer `backend/src/db/migrations/` per spec §4.2.)

- [ ] **Step 3: Move scripts**

```
mkdir -p backend/scripts
git mv scripts/seed.ts backend/scripts/seed.ts
git mv scripts/db-reset.ts backend/scripts/db-reset.ts
# Move any other surviving scripts (Task 0.3 may have pruned some):
for f in scripts/*.ts; do
  [ -f "$f" ] && git mv "$f" backend/scripts/$(basename "$f")
done
```

PowerShell:
```powershell
Get-ChildItem scripts -Filter *.ts | ForEach-Object {
  git mv $_.FullName "backend/scripts/$($_.Name)"
}
```

- [ ] **Step 4: Delete `scripts/start.sh` and `scripts/start.ps1`**

These shell scripts orchestrate "install + migrate + seed + start both" — that role is replaced by the root `package.json`'s `pnpm install:all` / `pnpm db:migrate` / `pnpm seed` / `pnpm dev` chain (Task 1.5). Per spec §6 Step 1.3, delete them rather than migrating:

```
git rm scripts/start.sh
# scripts/start.ps1 is currently untracked in the working tree; delete it directly:
rm scripts/start.ps1 2>/dev/null || true
```

- [ ] **Step 5: Remove now-empty `scripts/`**

```
rmdir scripts
```

(`scripts/run-parallel.mjs` will be created in Task 1.5; the directory is recreated then.)

- [ ] **Step 6: Stage; do not commit yet**

---

### Task 1.3.4: Write `backend/package.json`, `tsconfig.json`, and supporting configs

**Background:** Create the `backend/` project root configs. Dependencies are the union of all six package.json files plus `apps/server/package.json`, deduped. No `workspace:*` references — those packages no longer exist as workspaces.

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/vitest.config.ts`
- Create: `backend/drizzle.config.ts`
- Create: `backend/.env.example`
- Create: `backend/.gitignore`

- [ ] **Step 1: Write `backend/package.json`**

```json
{
  "name": "agent-world-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server/index.ts",
    "build": "tsc",
    "start": "node dist/server/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:reset": "tsx scripts/db-reset.ts && tsx src/db/migrate.ts",
    "seed": "tsx scripts/seed.ts",
    "gen:types": "tsx scripts/generate-types.ts",
    "check:types-fresh": "tsx scripts/check-types-fresh.ts"
  },
  "dependencies": {
    "@fastify/cors": "^11",
    "better-sqlite3": "^12.9.0",
    "drizzle-orm": "^0.45.2",
    "fastify": "^5",
    "openai": "^6.35.0",
    "zod": "^4.4.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^20",
    "drizzle-kit": "^0.31.10",
    "eslint": "^9",
    "eslint-plugin-import": "^2.31.0",
    "tsx": "^4.21.0",
    "typescript": "^5",
    "typescript-eslint": "^8.18.2",
    "vitest": "^4.1.5"
  },
  "pnpm": {
    "onlyBuiltDependencies": ["better-sqlite3", "esbuild"]
  }
}
```

- [ ] **Step 2: Write `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": false,
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "useDefineForClassFields": true
  },
  "include": ["src/**/*.ts", "scripts/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Write `backend/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: { TZ: "UTC" },
  },
});
```

- [ ] **Step 4: Write `backend/drizzle.config.ts`**

```ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "./data/agent-world.db",
  },
} satisfies Config;
```

- [ ] **Step 5: Write `backend/.env.example`**

```
# SQLite DB path (relative to backend/ working directory)
DATABASE_URL=./data/agent-world.db

# Scenes (map packs) directory (relative to backend/)
AGENT_WORLD_SCENES_DIR=./scenes

# Server bind
PORT=3001
HOST=0.0.0.0
```

- [ ] **Step 6: Write `backend/.gitignore`**

```
node_modules/
dist/
coverage/
*.log
.env
.env.local
data/*.db-shm
data/*.db-wal
```

(Note: `.db` itself is committed — current repo behavior.)

- [ ] **Step 7: Stage; do not commit yet**

---

### Task 1.3.5: Write `backend/eslint.config.mjs` with module-boundary rules

**Background:** Replace the `packages/*/package.json`-enforced dependency graph with `eslint-plugin-import`'s `no-restricted-paths` zones (spec §4.1).

**File:**
- Create: `backend/eslint.config.mjs`

- [ ] **Step 1: Write the ESLint config**

`backend/eslint.config.mjs`:
```js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "src/db/migrations/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    plugins: { import: importPlugin },
    settings: {
      "import/resolver": { typescript: true, node: true },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "import/no-restricted-paths": ["error", {
        zones: [
          // domain: bottom layer — cannot import any other module
          { target: "./src/domain", from: "./src", except: ["./src/domain"] },

          // shared: only domain
          { target: "./src/shared", from: "./src",
            except: ["./src/shared", "./src/domain"] },

          // db: domain + shared
          { target: "./src/db", from: "./src",
            except: ["./src/db", "./src/domain", "./src/shared"] },

          // config: domain + shared
          { target: "./src/config", from: "./src",
            except: ["./src/config", "./src/domain", "./src/shared"] },

          // systems: domain + shared + db
          { target: "./src/systems", from: "./src",
            except: ["./src/systems", "./src/domain", "./src/shared", "./src/db"] },

          // llm: domain + shared + config + db + systems
          { target: "./src/llm", from: "./src",
            except: ["./src/llm", "./src/domain", "./src/shared",
                     "./src/config", "./src/db", "./src/systems"] },

          // server: top layer — can import any module (no zone restriction)
        ],
      }],
    },
  }
);
```

- [ ] **Step 2: Stage; do not commit yet**

---

### Task 1.3.6: Bulk-rewrite `@agw/<pkg>` imports to relative paths inside `backend/src/`

**Background:** Every `@agw/domain`, `@agw/systems`, `@agw/llm`, `@agw/db`, `@agw/config`, `@agw/shared` import in the moved code must become a relative path.

Mapping:
- `@agw/domain` → `../domain` (depth-adjusted)
- `@agw/systems` → `../systems`
- `@agw/llm` → `../llm`
- `@agw/db` → `../db`
- `@agw/config` → `../config`
- `@agw/shared` → `../shared`

**The depth depends on the importer's location:**
- `backend/src/server/index.ts` → `../domain`, `../systems`, etc.
- `backend/src/server/routes/admin.ts` → `../../domain`, `../../systems`, etc.
- `backend/src/llm/decide.ts` (cross-module to domain) → `../domain`, `../shared`, etc.

**Files (modify):** every `.ts` file under `backend/src/` that imports `@agw/...`.

- [ ] **Step 1: Enumerate all `@agw/*` imports**

```
grep -rn "from [\"']@agw/" backend/src/ --include="*.ts" | sort
```

Group by importer directory (each group needs the same depth correction).

- [ ] **Step 2: Rewrite per directory layer**

For each importer-directory layer, run a sed/Edit pass:

**Layer 1** (importer is direct child of `backend/src/<module>/`, e.g. `backend/src/server/index.ts`, `backend/src/llm/decide.ts`):
- `from "@agw/domain"` → `from "../domain/index"` (or `from "../domain"` if `index.ts` is the module entry)
- `from "@agw/domain/<x>"` → `from "../domain/<x>"`
- Same pattern for the other 5 packages.

PowerShell for layer 1:
```powershell
$layer1 = @(
  "backend/src/server/index.ts",
  "backend/src/server/tick.ts",
  "backend/src/server/decideForCharacter.ts"
) + (Get-ChildItem backend/src/llm -File -Filter *.ts).FullName `
  + (Get-ChildItem backend/src/systems -File -Filter *.ts).FullName `
  + (Get-ChildItem backend/src/db -File -Filter *.ts).FullName `
  + (Get-ChildItem backend/src/config -File -Filter *.ts).FullName `
  + (Get-ChildItem backend/src/shared -File -Filter *.ts).FullName

foreach ($file in $layer1) {
  $content = Get-Content $file -Raw
  foreach ($pkg in @("domain","systems","llm","db","config","shared")) {
    $content = $content -replace "from `"@agw/$pkg`"", "from `"../$pkg/index`""
    $content = $content -replace "from `"@agw/$pkg/", "from `"../$pkg/"
  }
  Set-Content -NoNewline -Path $file -Value $content
}
```

**Layer 2** (importer is one level deeper, e.g. `backend/src/server/routes/admin.ts`):
- Same replacements but with `../../<pkg>/` prefix.

```powershell
$layer2 = (Get-ChildItem backend/src/server/routes -File -Filter *.ts).FullName

foreach ($file in $layer2) {
  $content = Get-Content $file -Raw
  foreach ($pkg in @("domain","systems","llm","db","config","shared")) {
    $content = $content -replace "from `"@agw/$pkg`"", "from `"../../$pkg/index`""
    $content = $content -replace "from `"@agw/$pkg/", "from `"../../$pkg/"
  }
  Set-Content -NoNewline -Path $file -Value $content
}
```

**Layer 3+:** repeat with deeper `../` prefix if any importer lives 3+ levels deep. Confirm with the grep from Step 1.

- [ ] **Step 3: Drop `/index` suffixes if the package's index re-exports everything**

Check `backend/src/<pkg>/index.ts` — if it's a barrel re-export, the path `../domain/index` is functionally equivalent to `../domain`. Some import-resolution configs require the explicit `/index`; with `"moduleResolution": "bundler"` in `backend/tsconfig.json`, both resolve. **Keep the explicit `/index` form** — it's unambiguous and refactor-safe.

- [ ] **Step 4: Verify no `@agw/*` imports remain**

```
grep -rn "from [\"']@agw/" backend/ --include="*.ts"
```

Expected: zero matches.

- [ ] **Step 5: Verify no `workspace:*` references remain in any `package.json`**

```
grep -rn "workspace:\*" --include="package.json" .
```

Expected: zero matches outside `node_modules/`.

- [ ] **Step 6: Stage; do not commit yet**

---

### Task 1.3.7: Delete obsolete root files and directories; install backend deps; verify

**Background:** Now that all live code has moved, delete the obsolete shells.

**Files (delete):**
- `apps/` (entire directory)
- `packages/` (entire directory)
- `src/` (entire directory — including the still-extant `src/domain/` shim)
- `pnpm-workspace.yaml`
- `next.config.ts`
- `postcss.config.mjs` (root)
- `next-env.d.ts`
- `tsconfig.json` (root)
- `tsconfig.tsbuildinfo`
- `eslint.config.mjs` (root)
- `vitest.config.ts` (root)
- `drizzle.config.ts` (root)
- `package-lock.json` (legacy npm artefact, current repo has both pnpm and a stale package-lock — verify before deleting)

**Note:** Root `package.json` is NOT deleted — it gets rewritten in Task 1.5 as the thin orchestrator. Root `pnpm-lock.yaml` IS deleted (the root will not have a lockfile).

**Note:** `README.md`, `AGENTS.md`, `CLAUDE.md` are NOT touched here — they are updated in Task 1.5.

- [ ] **Step 1: Delete the structural directories**

```
git rm -r apps packages src
```

- [ ] **Step 2: Delete root configs**

```
git rm pnpm-workspace.yaml next.config.ts postcss.config.mjs next-env.d.ts tsconfig.json eslint.config.mjs vitest.config.ts drizzle.config.ts
git rm pnpm-lock.yaml
[ -f package-lock.json ] && git rm package-lock.json
[ -f tsconfig.tsbuildinfo ] && rm tsconfig.tsbuildinfo
```

- [ ] **Step 3: Verify the working tree**

Top-level `ls` should show roughly:
```
.git  .gitignore  .env.example  AGENTS.md  CLAUDE.md  README.md
backend/  docs/  frontend/  package.json
```

(Plus the `.worktrees/` and any other dotfiles that exist independently of this refactor.)

- [ ] **Step 4: Install backend deps**

```
cd backend
pnpm install
```

Expected: install completes; `backend/pnpm-lock.yaml` created; `backend/node_modules/` populated.

- [ ] **Step 5: Run backend type-check, tests, and lint**

```
cd backend
pnpm exec tsc --noEmit
pnpm test
pnpm lint
```

Expected:
- `tsc` reports zero errors. (If errors appear, they are typically: missing relative-import depth fixes from Task 1.3.6 step 2, or `@agw/*` strings still lurking — run the grep again and patch.)
- `vitest run` reports all tests passing.
- `eslint` reports zero errors. The `no-restricted-paths` rule should silently pass; if any pre-existing import violates the layered graph, fix it (most likely candidate: a leak between `systems` and `llm` since the original `packages/llm/package.json` declared both directions).

If the lint reveals real violations of the dependency graph that pre-date this refactor, **stop and surface to the user**. Do not loosen the rule to make the lint pass — the rule encodes the spec's intended architecture.

- [ ] **Step 6: Smoke-test backend dev server**

```
cd backend
pnpm dev
```

Expected: Fastify starts on `:3001`. In another terminal:
```
curl http://localhost:3001/api/worlds
```
Returns the worlds list (or `[]` if empty). Stop server with Ctrl-C.

- [ ] **Step 7: Commit Phase 1.3 (entire backend migration)**

```
git add -A
git commit -m "feat(backend): flatten apps/server + packages/* into backend/src/

- git mv apps/server/src/* into backend/src/server/.
- git mv packages/{domain,systems,llm,db,config,shared}/src/* into
  backend/src/<module>/ (no internal workspace; flat directory tree).
- git mv configs/maps/<scene>/ into backend/scenes/<scene>/ (drop the
  redundant maps/ middle layer); rename env var AGENT_WORLD_CONFIGS_DIR
  → AGENT_WORLD_SCENES_DIR.
- git mv data/, drizzle/, scripts/ into backend/.
- Delete scripts/start.{sh,ps1} (replaced by root pnpm dev orchestration).
- Rewrite all @agw/* imports to relative paths.
- Add backend/{package,tsconfig,vitest,drizzle,eslint}.config* with
  eslint-plugin-import no-restricted-paths layer enforcement.
- Delete apps/, packages/, src/, root tsconfig/eslint/vitest/drizzle
  configs, root pnpm-workspace.yaml and pnpm-lock.yaml.

Root package.json is left untouched temporarily; rewrites in Task 1.5."
```

---

### Task 1.4.1: Write `backend/scripts/generate-types.ts` (codegen)

**Background:** Build the codegen pipeline (spec §3.3, decision (B)). Pipeline:
1. Run `tsc --emitDeclarationOnly` on `src/domain/types.ts` + `src/domain/enums.ts` → `<tmp>/{types,enums}.d.ts`.
2. Read both `.d.ts` files; strip `import type ... from "./enums"` (and similar inter-file imports).
3. Concatenate enums first, then types, with the warning header.
4. Read `src/domain/enums.ts` and extract `export const` declarations (their values, not just types) to append at the end (so consumers can use `TICKS_PER_HOUR` and the `as const` arrays at runtime).
5. Write the result to `../frontend/src/types/api.generated.ts`.

**Files:**
- Create: `backend/scripts/generate-types.ts`

This task uses TDD: write a unit test for the merge logic first.

- [ ] **Step 1: Write the failing test for the merge logic**

`backend/scripts/generate-types.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mergeDeclarations, extractValueExports } from "./generate-types";

describe("mergeDeclarations", () => {
  it("strips inter-file imports and concatenates in order", () => {
    const enumsDts = `export type Color = "red" | "blue";\n`;
    const typesDts =
      `import type { Color } from "./enums";\n` +
      `export interface Item { color: Color; }\n`;

    const merged = mergeDeclarations({ enums: enumsDts, types: typesDts });

    expect(merged).toContain('export type Color = "red" | "blue"');
    expect(merged).toContain("export interface Item");
    expect(merged).not.toContain('from "./enums"');
    // enums must appear before types (referenced first)
    const enumsAt = merged.indexOf("export type Color");
    const typesAt = merged.indexOf("export interface Item");
    expect(enumsAt).toBeLessThan(typesAt);
  });

  it("handles `import { type X } from \"./enums\"` form", () => {
    const enumsDts = `export type Color = "red" | "blue";\n`;
    const typesDts =
      `import { type Color } from "./enums";\n` +
      `export interface Item { color: Color; }\n`;
    const merged = mergeDeclarations({ enums: enumsDts, types: typesDts });
    expect(merged).not.toContain('from "./enums"');
  });
});

describe("extractValueExports", () => {
  it("extracts a simple const numeric export", () => {
    const src = `export const TICKS_PER_HOUR = 5;\n`;
    expect(extractValueExports(src)).toContain("export const TICKS_PER_HOUR = 5;");
  });

  it("extracts a const array as const", () => {
    const src = `export const NODE_TAGS = [\n  "a",\n  "b",\n] as const;\nexport type NodeTag = (typeof NODE_TAGS)[number];\n`;
    const out = extractValueExports(src);
    expect(out).toContain("export const NODE_TAGS");
    expect(out).toContain("\"a\"");
    expect(out).toContain("\"b\"");
    expect(out).toContain("as const");
  });

  it("does not include type-only exports", () => {
    const src = `export type Color = "red" | "blue";\nexport const X = 1;\n`;
    const out = extractValueExports(src);
    expect(out).not.toContain("export type Color");
    expect(out).toContain("export const X = 1");
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails**

```
cd backend
pnpm exec vitest run scripts/generate-types.test.ts
```

Expected: FAIL — `mergeDeclarations` and `extractValueExports` don't exist yet.

- [ ] **Step 3: Implement `backend/scripts/generate-types.ts`**

```ts
#!/usr/bin/env tsx
/**
 * Generate frontend/src/types/api.generated.ts from backend/src/domain/{types,enums}.ts.
 *
 * Pipeline:
 *   1. tsc --emitDeclarationOnly on the two source files → <tmp>/{types,enums}.d.ts
 *   2. Strip cross-file imports.
 *   3. Concatenate enums-first, types-second.
 *   4. Append `export const` value declarations from enums.ts source.
 *   5. Write with warning header.
 */

import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HEADER = `/**
 * ⚠️ AUTO-GENERATED from backend/src/domain/{types,enums}.ts.
 * Run \`pnpm gen:types\` from repo root to regenerate. Do not edit by hand.
 */
\n`;

export function mergeDeclarations(input: {
  enums: string;
  types: string;
}): string {
  const stripImports = (src: string): string =>
    src
      // matches:  import type { X } from "./enums";
      //           import { type X } from "./enums";
      //           import { X } from "./enums";
      .replace(/^\s*import\s+(?:type\s+)?\{[^}]*\}\s+from\s+["']\.\/[^"']+["'];?\s*$/gm, "")
      // matches:  import * as X from "./enums";
      .replace(/^\s*import\s+\*\s+as\s+\w+\s+from\s+["']\.\/[^"']+["'];?\s*$/gm, "");

  return stripImports(input.enums).trimEnd() + "\n\n" + stripImports(input.types).trimEnd() + "\n";
}

/**
 * Extract `export const ...` declarations (with their full RHS) from a TS source file.
 * Skips `export type` / `export interface` / `export function`.
 */
export function extractValueExports(src: string): string {
  const lines = src.split("\n");
  const out: string[] = [];
  let buf: string[] = [];
  let inExportConst = false;
  let depth = 0;

  const trackBraces = (line: string) => {
    for (const ch of line) {
      if (ch === "{" || ch === "[" || ch === "(") depth++;
      else if (ch === "}" || ch === "]" || ch === ")") depth--;
    }
  };

  for (const line of lines) {
    if (!inExportConst) {
      // Match start of "export const NAME"
      if (/^\s*export\s+const\s+/.test(line)) {
        inExportConst = true;
        buf = [line];
        depth = 0;
        trackBraces(line);
        // Single-line declaration: ends with ";" and balanced braces
        if (/;\s*$/.test(line) && depth === 0) {
          out.push(buf.join("\n"));
          inExportConst = false;
          buf = [];
        }
      }
      // Skip everything else (type/interface/function/comment/blank)
    } else {
      buf.push(line);
      trackBraces(line);
      if (depth === 0 && /;\s*$/.test(line)) {
        out.push(buf.join("\n"));
        inExportConst = false;
        buf = [];
      }
    }
  }

  return out.join("\n\n");
}

function main(): void {
  const __filename = fileURLToPath(import.meta.url);
  const backendRoot = resolve(dirname(__filename), "..");
  const repoRoot = resolve(backendRoot, "..");

  const typesPath = join(backendRoot, "src/domain/types.ts");
  const enumsPath = join(backendRoot, "src/domain/enums.ts");
  const outPath = join(repoRoot, "frontend/src/types/api.generated.ts");

  const tmp = mkdtempSync(join(tmpdir(), "agw-codegen-"));
  try {
    // Step 1: emit .d.ts
    const tsc = join(backendRoot, "node_modules/.bin/tsc");
    execSync(
      `"${tsc}" --emitDeclarationOnly --declaration --outDir "${tmp}" --rootDir "${join(backendRoot, "src")}" --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck "${typesPath}" "${enumsPath}"`,
      { stdio: "inherit" }
    );

    // Step 2-3: read and merge
    const typesDts = readFileSync(join(tmp, "domain/types.d.ts"), "utf8");
    const enumsDts = readFileSync(join(tmp, "domain/enums.d.ts"), "utf8");
    const merged = mergeDeclarations({ enums: enumsDts, types: typesDts });

    // Step 4: append value exports from enums.ts source
    const enumsSrc = readFileSync(enumsPath, "utf8");
    const valueExports = extractValueExports(enumsSrc);

    const final = HEADER + merged + "\n// ── Runtime values from enums.ts ─────────────────────────────────────────────\n\n" + valueExports + "\n";

    writeFileSync(outPath, final);
    console.log(`✓ Wrote ${outPath}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Only run main when invoked directly (not when imported by tests)
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1] ?? "")) {
  main();
}
```

- [ ] **Step 4: Run the unit tests, confirm they pass**

```
cd backend
pnpm exec vitest run scripts/generate-types.test.ts
```

Expected: PASS for both `mergeDeclarations` and `extractValueExports` tests.

- [ ] **Step 5: Run the full pipeline end-to-end**

```
cd backend
pnpm gen:types
```

Expected: prints `✓ Wrote .../frontend/src/types/api.generated.ts`. The handwritten stub from Task 1.2.2 is now overwritten by real codegen output.

- [ ] **Step 6: Verify the generated file**

```
head -20 frontend/src/types/api.generated.ts
```

Expected: starts with the warning header; contains `export type Color`-style enum exports first, then `export interface Character`/etc. types, then a `// ── Runtime values from enums.ts ──` separator, then `export const TICKS_PER_HOUR = 5;` and other const declarations.

- [ ] **Step 7: Verify frontend type-checks against the generated file**

```
cd frontend
pnpm exec tsc -b --noEmit
```

Expected: zero errors. If a frontend file imports a type missing from the generated output, the source of truth is `backend/src/domain/types.ts` — add the missing type as an `export` there and re-run `pnpm gen:types`.

- [ ] **Step 8: Verify frontend tests still pass**

```
cd frontend
pnpm test
```

Expected: all tests in `src/lib/*.test.ts` pass.

- [ ] **Step 9: Commit**

```
git add backend/scripts/generate-types.ts backend/scripts/generate-types.test.ts frontend/src/types/api.generated.ts
git commit -m "feat(codegen): generate frontend types from backend/src/domain/

Pipeline: tsc --emitDeclarationOnly → strip inter-file imports →
concatenate (enums first, types second) → append const value exports
from enums.ts source. Output is committed to git as the API contract."
```

---

### Task 1.4.2: Write `backend/scripts/check-types-fresh.ts` (CI guard)

**Background:** Detect when the codegen output drifts from the source. Used by CI (and the operator pre-PR) to fail loudly if someone changed `domain/{types,enums}.ts` without regenerating.

**Files:**
- Create: `backend/scripts/check-types-fresh.ts`

- [ ] **Step 1: Write the test for the script's logic**

`backend/scripts/check-types-fresh.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeDriftReport } from "./check-types-fresh";

describe("computeDriftReport", () => {
  it("returns clean when before and after are identical", () => {
    const r = computeDriftReport({ before: "const X = 1;", after: "const X = 1;" });
    expect(r.drifted).toBe(false);
  });

  it("reports drift when after differs", () => {
    const r = computeDriftReport({ before: "const X = 1;", after: "const X = 2;" });
    expect(r.drifted).toBe(true);
    expect(r.message).toContain("api.generated.ts");
  });
});
```

- [ ] **Step 2: Run, confirm fails**

```
cd backend
pnpm exec vitest run scripts/check-types-fresh.test.ts
```

Expected: FAIL — `computeDriftReport` not defined.

- [ ] **Step 3: Implement the script**

`backend/scripts/check-types-fresh.ts`:
```ts
#!/usr/bin/env tsx
/**
 * Verify that frontend/src/types/api.generated.ts on disk is up-to-date
 * with backend/src/domain/{types,enums}.ts. Exits non-zero on drift.
 *
 * Usage: pnpm check:types-fresh
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface DriftReport {
  drifted: boolean;
  message: string;
}

export function computeDriftReport(input: { before: string; after: string }): DriftReport {
  if (input.before === input.after) {
    return { drifted: false, message: "frontend/src/types/api.generated.ts is up to date." };
  }
  return {
    drifted: true,
    message:
      "DRIFT DETECTED: frontend/src/types/api.generated.ts is stale.\n" +
      "Run `pnpm gen:types` from repo root and commit the result.",
  };
}

function main(): void {
  const __filename = fileURLToPath(import.meta.url);
  const backendRoot = resolve(dirname(__filename), "..");
  const repoRoot = resolve(backendRoot, "..");
  const generatedPath = join(repoRoot, "frontend/src/types/api.generated.ts");

  const before = readFileSync(generatedPath, "utf8");
  // Regenerate (in-place)
  execSync(`pnpm --dir "${backendRoot}" run gen:types`, { stdio: "inherit" });
  const after = readFileSync(generatedPath, "utf8");

  const report = computeDriftReport({ before, after });
  console.log(report.message);
  if (report.drifted) {
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1] ?? "")) {
  main();
}
```

- [ ] **Step 4: Run the test, confirm pass**

```
cd backend
pnpm exec vitest run scripts/check-types-fresh.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the script end-to-end (should report up-to-date)**

```
cd backend
pnpm check:types-fresh
```

Expected: prints "frontend/src/types/api.generated.ts is up to date." and exits 0.

- [ ] **Step 6: Smoke-test drift detection**

```
echo "// drift test" >> frontend/src/types/api.generated.ts
cd backend
pnpm check:types-fresh
echo "exit code: $?"
```

Expected: prints "DRIFT DETECTED ..." and exits 1.

Restore the file:
```
cd backend
pnpm gen:types
```

- [ ] **Step 7: Commit**

```
git add backend/scripts/check-types-fresh.ts backend/scripts/check-types-fresh.test.ts
git commit -m "feat(codegen): add check-types-fresh.ts CI drift guard"
```

---

### Task 1.5.1: Write `scripts/run-parallel.mjs`

**Background:** Zero-dependency Node script that spawns `pnpm --dir <subdir> dev` per argument, prefixes their output, and shuts everything down on Ctrl-C or when one child exits.

**Files:**
- Create: `scripts/run-parallel.mjs`
- Create: `scripts/run-parallel.test.mjs`

This task uses TDD with Node's built-in `node:test` (no test runner dep at root — root has zero deps). The test exercises the script's public utility functions (`formatPrefix`, `parseArgs`) which we factor out for testability; the spawn/IO behavior is smoke-tested manually.

- [ ] **Step 1: Write the failing test**

`scripts/run-parallel.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, formatPrefix, COLORS } from "./run-parallel.mjs";

test("parseArgs returns dirs from argv", () => {
  assert.deepEqual(parseArgs(["node", "run-parallel.mjs", "frontend", "backend"]),
    ["frontend", "backend"]);
});

test("parseArgs returns empty array when no args given", () => {
  assert.deepEqual(parseArgs(["node", "run-parallel.mjs"]), []);
});

test("formatPrefix wraps name in selected color and resets", () => {
  const p = formatPrefix("frontend", 0);
  assert.ok(p.includes("frontend"));
  assert.ok(p.includes(COLORS[0]));
  assert.ok(p.includes("\x1b[0m"));
});

test("formatPrefix cycles colors on overflow", () => {
  const a = formatPrefix("a", 0);
  const b = formatPrefix("b", COLORS.length); // wraps to index 0
  assert.ok(a.includes(COLORS[0]) && b.includes(COLORS[0]));
});
```

- [ ] **Step 2: Run, confirm fails**

```
cd <repo-root>
node --test scripts/run-parallel.test.mjs
```

Expected: FAIL — module `./run-parallel.mjs` does not exist.

- [ ] **Step 3: Implement the script**

`scripts/run-parallel.mjs`:
```js
#!/usr/bin/env node
/**
 * Run `pnpm --dir <subdir> dev` for each argument concurrently. Prefix output
 * with `[<subdir>]` in a unique color per child. Forward Ctrl-C / SIGTERM to
 * all children; if any child exits, kill the rest and propagate the exit code.
 *
 * Usage: node scripts/run-parallel.mjs <dir1> [<dir2> ...]
 */

import { spawn } from "node:child_process";
import process from "node:process";

export const COLORS = ["\x1b[36m", "\x1b[35m", "\x1b[33m", "\x1b[32m"];
const RESET = "\x1b[0m";

export function parseArgs(argv) {
  return argv.slice(2);
}

export function formatPrefix(name, index) {
  const color = COLORS[index % COLORS.length];
  return `${color}[${name}]${RESET} `;
}

function pipeWithPrefix(stream, sink, prefix) {
  let buf = "";
  stream.on("data", (chunk) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) sink.write(prefix + line + "\n");
  });
  stream.on("end", () => {
    if (buf) sink.write(prefix + buf + "\n");
  });
}

function main() {
  const dirs = parseArgs(process.argv);
  if (dirs.length === 0) {
    console.error("Usage: node scripts/run-parallel.mjs <dir1> [<dir2> ...]");
    process.exit(1);
  }

  const isWindows = process.platform === "win32";
  const pnpmCmd = isWindows ? "pnpm.cmd" : "pnpm";

  const procs = dirs.map((dir, i) => {
    const prefix = formatPrefix(dir, i);
    const child = spawn(pnpmCmd, ["--dir", dir, "dev"], {
      stdio: ["inherit", "pipe", "pipe"],
      shell: false,
    });
    pipeWithPrefix(child.stdout, process.stdout, prefix);
    pipeWithPrefix(child.stderr, process.stderr, prefix);
    return { dir, child };
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const { child } of procs) {
      if (!child.killed) child.kill(signal);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  let exitCode = 0;
  let remaining = procs.length;
  for (const { dir, child } of procs) {
    child.on("exit", (code, signal) => {
      remaining -= 1;
      const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
      console.log(`[run-parallel] ${dir} exited (${reason}); shutting down others...`);
      if (code != null && code !== 0) exitCode = code;
      if (!shuttingDown) shutdown("SIGTERM");
      if (remaining === 0) process.exit(exitCode);
    });
  }
}

// Only run main when invoked directly (not when imported by tests)
const invokedAsScript = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"));
if (invokedAsScript) {
  main();
}
```

- [ ] **Step 4: Run tests, confirm pass**

```
cd <repo-root>
node --test scripts/run-parallel.test.mjs
```

Expected: PASS for all four tests.

- [ ] **Step 5: Smoke-test the orchestrator manually**

The tests cover argv/prefix logic but not the spawn behavior — verify manually:

```
cd <repo-root>
node scripts/run-parallel.mjs frontend backend
```

Expected: Both `[frontend]` and `[backend]` lines appear interleaved in different colors. After ~5 seconds, hit Ctrl-C; both processes shut down and the orchestrator exits.

- [ ] **Step 6: Commit**

```
git add scripts/run-parallel.mjs scripts/run-parallel.test.mjs
git commit -m "feat(scripts): add zero-dep run-parallel.mjs orchestrator"
```

---

### Task 1.5.2: Rewrite root `package.json` as the thin orchestrator

**Background:** Replace the current root `package.json` with the spec §5.1 thin version: no deps, no devDeps, no `pnpm` field, no workspace, no lockfile. Only convenience scripts.

**Files:**
- Modify: `package.json` (root)
- Verify deletion: root `pnpm-lock.yaml` (already deleted in Task 1.3.7)

- [ ] **Step 1: Overwrite `package.json` with the orchestrator**

```json
{
  "name": "agent-world-monorepo",
  "version": "0.1.0",
  "private": true,
  "description": "Two independent projects (frontend, backend) co-located. See CLAUDE.md before modifying.",
  "scripts": {
    "dev":           "node scripts/run-parallel.mjs frontend backend",
    "dev:frontend":  "pnpm --dir frontend dev",
    "dev:backend":   "pnpm --dir backend dev",
    "build":         "pnpm --dir backend build && pnpm --dir frontend build",
    "build:frontend":"pnpm --dir frontend build",
    "build:backend": "pnpm --dir backend build",
    "test":          "pnpm --dir backend test && pnpm --dir frontend test",
    "test:frontend": "pnpm --dir frontend test",
    "test:backend":  "pnpm --dir backend test",
    "lint":          "pnpm --dir backend lint && pnpm --dir frontend lint",
    "lint:frontend": "pnpm --dir frontend lint",
    "lint:backend":  "pnpm --dir backend lint",
    "gen:types":     "pnpm --dir backend run gen:types",
    "check:types-fresh": "pnpm --dir backend run check:types-fresh",
    "db:migrate":    "pnpm --dir backend run db:migrate",
    "db:reset":      "pnpm --dir backend run db:reset",
    "seed":          "pnpm --dir backend run seed",
    "install:all":   "pnpm --dir backend install && pnpm --dir frontend install"
  }
}
```

- [ ] **Step 2: Verify no lockfile or node_modules at root**

```
ls -la
```

Expected: no `pnpm-lock.yaml`, no `package-lock.json`, no `node_modules/` at the repo root.

If `node_modules/` still exists at root from before, delete it:
```
rm -rf node_modules
```

- [ ] **Step 3: Verify the convenience scripts work**

```
cd <repo-root>
pnpm test
```

Expected: runs `backend test` first (all green), then `frontend test` (all green).

```
pnpm lint
```

Expected: runs `backend lint` then `frontend lint`, both green.

```
pnpm dev
```

Expected: spawns frontend (Vite on :3000) and backend (Fastify on :3001) with prefixed colored output. Open `http://localhost:3000/admin` — admin dashboard renders, fetches data from `/api/...` (proxied to :3001), displays world state. Ctrl-C → both shut down.

- [ ] **Step 4: Commit**

```
git add package.json
git commit -m "feat: rewrite root package.json as thin convenience orchestrator

No deps, no devDeps, not a pnpm workspace, no lockfile. Just scripts."
```

---

### Task 1.5.3: Update `CLAUDE.md` with the "DO NOT MODIFY ROOT package.json" preamble and new architecture

**Background:** `CLAUDE.md` is loaded into every Claude Code conversation; it must reflect the new structure. Two changes:
1. Insert the "Repository Structure (DO NOT MODIFY ROOT package.json)" preamble at the top.
2. Update the existing `## Commands` and `## Architecture` sections to match the new layout.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Read current `CLAUDE.md`**

Read the file in full to understand its current structure, then plan the edits:
```
cat CLAUDE.md | head -100
```

The current top of the file goes straight into `## Commands`. We need to insert a new `## Repository Structure` section before it.

- [ ] **Step 2: Insert the preamble immediately after the file's title/intro**

Locate the line after the file's H1 / intro paragraph and insert:

```markdown
## Repository Structure (DO NOT MODIFY ROOT package.json)

This monorepo deliberately contains TWO independent projects:
- `frontend/` — Vite + React SPA (own package.json, own pnpm-lock.yaml)
- `backend/`  — Fastify Node service (own package.json, own pnpm-lock.yaml)

The root `package.json` is intentionally **thin**: it holds convenience scripts only.
**DO NOT**:
- Add dependencies/devDependencies to the root package.json.
- Make the root a pnpm workspace.
- Generate a root pnpm-lock.yaml.
- Cross-import code between frontend/ and backend/ (use codegen for shared types — see backend/scripts/generate-types.ts).

If you need a tool that runs at the root, write it as a zero-dependency Node script in `scripts/`.

```

- [ ] **Step 3: Rewrite `## Commands` section**

Replace the existing commands block with:

````markdown
## Commands

```bash
# From repo root (orchestrator scripts):
pnpm install:all      # Install deps in both frontend/ and backend/
pnpm dev              # Run frontend (:3000) + backend (:3001) concurrently
pnpm dev:frontend     # Frontend only
pnpm dev:backend      # Backend only
pnpm test             # Run backend tests then frontend tests sequentially
pnpm test:frontend    # Frontend tests only
pnpm test:backend     # Backend tests only
pnpm lint             # Lint both
pnpm build            # Build both
pnpm gen:types        # Regenerate frontend/src/types/api.generated.ts
pnpm check:types-fresh # CI guard: fail if codegen output is stale
pnpm db:migrate       # Drizzle migrations on backend/data/agent-world.db
pnpm db:reset         # Reset DB then re-migrate
pnpm seed             # Seed data via backend/scripts/seed.ts

# Or work in a subproject directly:
cd frontend && pnpm dev
cd backend  && pnpm dev
```

Tests in `backend/src/**/*.test.ts` and `frontend/src/**/*.test.ts`. Vitest in both uses `globals: false` — import `describe`/`it`/`expect` explicitly. Both set `TZ=UTC`.

Environment variables (backend): `DATABASE_URL`, `AGENT_WORLD_SCENES_DIR`, `PORT`, `HOST`. See `backend/.env.example`.
Environment variables (frontend): `VITE_API_URL` (Vite dev proxy + prod runtime). See `frontend/.env.example`.
````

- [ ] **Step 4: Rewrite `## Architecture` section**

Replace the existing architecture block. The package table is gone (no more workspace packages); replace with the new flat layout:

````markdown
## Architecture

This is a co-located but **logically independent** two-project layout. `frontend/` and `backend/` each have their own `package.json` / `pnpm-lock.yaml` / `node_modules` / tooling, and could be split into separate repos with no code changes. The root holds only convenience scripts.

### Top-level layout

```
frontend/   Vite + React SPA (port 3000)
backend/    Fastify + engine (port 3001)
docs/       Specs and plans
scripts/    Root-level utilities (run-parallel.mjs only — zero deps)
```

### Frontend (`frontend/`)

- Vite + React 19 + react-router-dom v7. Two routes: `/` and `/admin`.
- Components, hooks, libs in `frontend/src/{components,hooks,lib}/`.
- Talks to backend via `/api/*` (Vite dev proxy in dev, `VITE_API_URL` direct in prod).
- Shared types come from `frontend/src/types/api.generated.ts` — regenerated by `pnpm gen:types`. **Do not hand-edit this file**.

### Backend (`backend/`)

Single flat Node project. Module boundaries enforced by ESLint (`no-restricted-paths`).

```
backend/src/
  domain/    Types, enums, zod schemas, ActionRegistry — bottom layer
  shared/    Logger and tiny utilities (depends on domain only)
  db/        Drizzle ORM, repositories, migrations (depends on domain, shared)
  config/    Scene loaders (read backend/scenes/<id>/) (depends on domain, shared)
  systems/   Engine systems: vitals/emotion, pathfinding, perception, actions,
             facts, economy, layout, notebook, store (depends on domain, shared, db)
  llm/       OpenAI integration: prompts, decide, dialog, think, memory compression
             (depends on domain, shared, config, db, systems)
  server/    Fastify entry + tick orchestration + HTTP routes (top layer — may
             import any module)
backend/scenes/<scene-id>/   Map packs (manifest, map, characters, events, actions.js)
backend/data/agent-world.db  SQLite database
backend/scripts/             Dev utilities (seed, db-reset, generate-types,
                             check-types-fresh, smoke-*, etc.)
```

### Type sharing

`backend/src/domain/{types,enums}.ts` is the single source of truth. The codegen pipeline (`backend/scripts/generate-types.ts`) runs `tsc --emitDeclarationOnly`, strips inter-file imports, concatenates, and appends `export const` runtime values from `enums.ts`. Output: `frontend/src/types/api.generated.ts` (committed to git as the API contract). Drift is caught by `pnpm check:types-fresh`.

### Core tick flow

`tick()` in `backend/src/server/tick.ts` orchestrates each simulation step. The flow is unchanged from before the refactor — see file for details:
1. Vitals decay → inner events
2. Emotion evolution
3. Perception dispatch
4. Concurrent LLM decisions
5. Ongoing action processing
6. Dialogue / think sessions
7. Action execution via `ActionRegistry`
8. Relations, economy, sleep memory compression
9. Persistence + 24h snapshots

### Action / scene system

Built-in actions in `backend/src/systems/actions-builtin.ts`. Mod actions loaded from `backend/scenes/<scene>/actions.js`. Loaders in `backend/src/config/{loader,mod-loader,event-loader}.ts`. Env var: `AGENT_WORLD_SCENES_DIR`.

### LLM integration

`backend/src/llm/` uses an OpenAI-compatible API. Multiple named entry points (`decide`, `dialog_turn`, `dialog_summarize`, `memory_compress`, `accept_decision`, `dialog_personal_memory`) can route to different providers configured in the `llm_providers` / `llm_entry_configs` DB tables. Tool-calling is mandatory; pure-text responses trigger re-prompting (max 3 rounds). DeepSeek `reasoning_content` is preserved across rounds. Fallback action on any LLM failure: `look_around`.

### Key domain constants (game)

- 1 tick = 1/5 game hour (`TICKS_PER_HOUR = 5`)
- Short memory FIFO: 50 entries
- Sleep duration: 40 ticks (8h); nap: 20 ticks (4h)
- Max LLM tool-call rounds: 3
- LLM timeout: 30s, max 1 retry
- Facts lookback: 48 game hours
- Think turns per tick: 3
````

- [ ] **Step 5: Verify the file is well-formed**

```
head -40 CLAUDE.md
```

Expected: title → "Repository Structure (DO NOT MODIFY ...)" preamble → "## Commands" → "## Architecture".

- [ ] **Step 6: Commit**

```
git add CLAUDE.md
git commit -m "docs: rewrite CLAUDE.md for frontend/backend split layout"
```

---

### Task 1.5.4: Update `README.md` and `.gitignore` (root)

**Background:** Bring the user-facing README in line with the new structure; tighten the root `.gitignore`.

**Files:**
- Modify: `README.md`
- Modify: `.gitignore` (root)

- [ ] **Step 1: Rewrite `README.md`**

Replace the entire file with:

```markdown
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
pnpm seed          # seed the example scene
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
| `pnpm db:migrate` / `pnpm db:reset` / `pnpm seed` | Backend database tasks |

You can also work in a subproject directly: `cd frontend && pnpm dev`.

## Architecture

See `CLAUDE.md` and `docs/superpowers/specs/2026-05-08-frontend-backend-split-design.md`.
```

- [ ] **Step 2: Update root `.gitignore`**

Replace contents with:

```
node_modules/
*.log
.env
.env.local
.DS_Store
# Old SQLite databases that may have been left at root pre-refactor:
agent-world.db
agent-world.db-shm
agent-world.db-wal
# Build output (each subproject also has its own .gitignore):
dist/
.next/
.vite/
coverage/
tsconfig.tsbuildinfo
```

- [ ] **Step 3: Commit**

```
git add README.md .gitignore
git commit -m "docs: rewrite README and root .gitignore for new layout"
```

---

### Task 1.6.1: End-to-end acceptance verification

**Background:** Final pre-PR sweep. Every check below must pass; if any fails, fix it on the same branch before opening the PR. This task does NOT add a commit unless a fix is required.

- [ ] **Step 1: Clean install verification**

Simulate a fresh clone:
```
rm -rf frontend/node_modules backend/node_modules
pnpm install:all
```

Expected: both sides install cleanly. No "missing peer dep" or "workspace not found" errors. `frontend/pnpm-lock.yaml` and `backend/pnpm-lock.yaml` exist; root has no lockfile.

- [ ] **Step 2: Type-check both sides**

```
cd backend && pnpm exec tsc --noEmit && cd ..
cd frontend && pnpm exec tsc -b --noEmit && cd ..
```

Expected: zero errors on both.

- [ ] **Step 3: Run all tests**

```
pnpm test
```

Expected: backend tests run first (all green), then frontend tests (all green). Total green test count ≥ the count from before the refactor (no regressions).

- [ ] **Step 4: Run all lints**

```
pnpm lint
```

Expected: zero errors.

- [ ] **Step 5: Verify ESLint module boundary rules actually fire**

Add a deliberate violation:
```
echo 'import { whatever } from "../server/index";' >> backend/src/domain/types.ts
cd backend && pnpm lint
```

Expected: ESLint reports a `no-restricted-paths` error on that line. Revert:
```
git checkout backend/src/domain/types.ts
```

- [ ] **Step 6: Codegen idempotence**

```
pnpm gen:types
git diff frontend/src/types/api.generated.ts
```

Expected: empty diff (running codegen twice produces the same output).

- [ ] **Step 7: Codegen drift detection**

```
echo "// drift" >> frontend/src/types/api.generated.ts
pnpm check:types-fresh
echo "exit code: $?"
```

Expected: prints "DRIFT DETECTED ...", exits 1. Restore:
```
pnpm gen:types
```

- [ ] **Step 8: Backend dev server smoke test**

```
pnpm dev:backend &
sleep 3
curl -s http://localhost:3001/api/worlds | head -c 200
echo
# Stop the server: find its PID and kill, or use Ctrl-C if foreground
```

Expected: `/api/worlds` returns valid JSON (worlds array, possibly empty).

- [ ] **Step 9: DB migrate / reset / seed work**

On a copy of the database (do NOT damage the live one):
```
cp backend/data/agent-world.db backend/data/agent-world.db.bak
pnpm db:migrate          # idempotent — should be no-op
pnpm db:reset            # destructive — db is recreated
pnpm seed                # populates from backend/scenes/<id>
# Restore original:
mv backend/data/agent-world.db.bak backend/data/agent-world.db
```

Expected: each command exits 0.

- [ ] **Step 10: Full-stack `pnpm dev` smoke test**

```
pnpm dev
```

Expected: both `[frontend]` and `[backend]` lines appear in distinct colors. Open `http://localhost:3000/admin` in a browser:
- Page renders without console errors.
- Network tab shows requests to `/api/...` returning 200, served by the Vite dev proxy → backend on :3001.
- Tick stream (SSE) — if the admin page uses it — connects and updates.

Hit Ctrl-C: both processes shut down cleanly within ~2 seconds.

- [ ] **Step 11: Run-once-per-side independence check**

```
cd frontend && pnpm dev &
sleep 3
curl -s http://localhost:3000 | head -c 100
kill %1
cd ../backend && pnpm dev &
sleep 3
curl -s http://localhost:3001/api/worlds | head -c 100
kill %1
```

Expected: each side starts standalone with no reference to the other. Confirms "independent project" intent.

- [ ] **Step 12: Final git status check**

```
git status
git log --oneline <feature-branch> ^master | head -20
```

Expected:
- working tree clean
- commit history follows the spec's structure: phase 0 chore + phase 1 feat commits in order

If everything passes, the branch is ready for PR.

---

## Plan Self-Review

**Spec coverage check** (each spec section → tasks that implement it):

| Spec section | Tasks |
|---|---|
| §1 目标动机 | (no tasks — informational) |
| §2 顶层目录布局 | Task 1.1.1 (frontend skel), 1.3.1–1.3.7 (backend layout + cleanup), 1.5.4 (.gitignore) |
| §3 前端 | 1.1.1 (scaffold), 1.2.1–1.2.3 (move + repoint + entry) |
| §3.3 codegen 管线 | 1.4.1 (generate-types), 1.4.2 (check-types-fresh) |
| §4 后端 | 1.3.1 (move sources), 1.3.2 (scenes rename), 1.3.3 (data/scripts), 1.3.4 (configs), 1.3.5 (eslint boundaries), 1.3.6 (import rewrites) |
| §5.1 根 package.json | 1.5.2 |
| §5.2 run-parallel.mjs | 1.5.1 |
| §5.3 CLAUDE.md 增补 | 1.5.3 |
| §5.4 .gitignore | 1.5.4 |
| §6 迁移序列 | All Phase 0 + Phase 1 tasks follow the spec's step order |
| §7 不在本次范围 | (no tasks — exclusions) |
| §8 风险表 | Mitigations baked into individual tasks (e.g. Task 1.4.1 step 2 verifies tsc emits valid d.ts; Task 1.6.1 step 5 confirms ESLint boundary rule fires) |
| §9 决策记录 | (no tasks — informational) |

**Placeholder scan:** No "TBD" / "TODO" / "fill in details" / "similar to Task N" patterns found. The one `TODO-FOR-IMPLEMENTER` marker in Task 1.2.2 step 1 is followed immediately by step 2 which gives the concrete instruction — it's a deliberate two-step where step 1 lays the file scaffold and step 2 fills it.

**Type / signature consistency:**
- `mergeDeclarations` and `extractValueExports` (Task 1.4.1) — same names referenced in test (Step 1) and implementation (Step 3). ✓
- `computeDriftReport` (Task 1.4.2) — same in test and impl. ✓
- `parseArgs`, `formatPrefix`, `COLORS` (Task 1.5.1) — same in test and impl. ✓
- env var `AGENT_WORLD_SCENES_DIR` — consistent across spec, Task 1.3.2, Task 1.3.4 (`backend/.env.example`), and CLAUDE.md (Task 1.5.3). ✓
- Path aliases: `@/` → `frontend/src/` declared in Task 1.2.3 step 1, used in Tasks 1.2.3 step 5 / step 6. ✓
- Backend uses **no** path alias; relative imports throughout. Spec §4.1 confirms; Task 1.3.6 implements. ✓

**Gaps found and fixed inline:**
- Initially missing: explicit step to install backend deps and verify backend tests pass before Phase 1.4 (codegen). Added as Task 1.3.7 steps 4–6.
- Initially missing: handling of `apps/server/data/` directory (currently untracked per `git status`). Added as Task 1.3.3 step 1 conditional path.
- Initially missing: clarifying that `src/domain/` survives Phase 0 and dies in Phase 1.3 with the rest of `src/`. Spec already noted this in Phase 0 description; plan reiterates in Tasks 0.1, 1.2.3, 1.3.7.

**Handoff to execution:** see end-of-plan section.






