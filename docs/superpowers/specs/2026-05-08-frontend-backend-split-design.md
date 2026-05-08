# Frontend/Backend 拆分重构设计

**日期**：2026-05-08
**状态**：Design approved, awaiting implementation plan
**作者**：brainstorming session

## 1. 目标与动机

把当前 pnpm monorepo（`apps/server` + `packages/{domain,systems,llm,db,config,shared}` + 根 `src/`）重构成两个**逻辑独立的项目**，并排放在同一个 git 仓库里：

- `frontend/` — Vite + React 单页应用，可作为静态资源部署，未来可被 Electron / Capacitor 打包；
- `backend/` — Fastify HTTP 服务 + 引擎（tick / LLM / DB），单一 Node 进程；
- 两边各持自己的 `package.json`、`pnpm-lock.yaml`、`tsconfig.json`、`eslint.config.mjs`、`vitest.config.ts`、`node_modules`，互不感知。

**核心动机（用户明确选定）**：为未来"前后端各自分仓"做好准备——两边在工程层面独立到拔掉根目录之后各自仍是一个完整可运行的项目。

**当前痛点**（重构要解决的）：
- 仓库根 `src/` 既有真前端代码（`src/app/*`），又有 6 个 re-export 兼容垫片目录（`src/{engine,llm,db,domain,config,util}/`），后者纯粹是上一次"迁移到 monorepo"的迁移惯性税；
- `apps/server/data/` 和根 `data/` 各有一份 SQLite 文件，不清楚哪份是真的；
- 根目录的 `next.config.ts` / `postcss.config.mjs` / `tsconfig.json` 和后端 `apps/server/` 共享根 package.json，前后端工程边界模糊；
- `packages/{domain,systems,llm,db,config,shared}` 6 个 workspace 包的唯一消费者就是 `apps/server`——拆包带来的 meta 复杂度没有真实收益。

## 2. 顶层目录布局

```
agent-world/
├── frontend/                  # 完全独立的 Vite + React 项目
│   ├── package.json           # 自己的依赖 + 自己的 lockfile
│   ├── pnpm-lock.yaml
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── eslint.config.mjs
│   ├── vitest.config.ts
│   ├── postcss.config.mjs
│   ├── tailwind.config.ts
│   ├── index.html
│   ├── public/                # 静态资源
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── routes/
│       │   ├── home.tsx
│       │   └── admin.tsx
│       ├── components/
│       ├── hooks/
│       ├── lib/
│       ├── styles/
│       │   └── globals.css
│       └── types/
│           └── api.generated.ts   # codegen 产物（签入 git）
│
├── backend/                   # 完全独立的 Node 项目
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── tsconfig.json
│   ├── eslint.config.mjs
│   ├── vitest.config.ts
│   ├── drizzle.config.ts
│   ├── .env.example
│   ├── scenes/                # 现 configs/maps/<pack>/ 拍平后入此（去掉 maps 中间层）
│   │   └── sakuradai-high-school/
│   │       ├── manifest.json
│   │       ├── map.json
│   │       ├── characters/
│   │       ├── events.json
│   │       └── actions.js
│   ├── data/
│   │   └── agent-world.db
│   ├── scripts/
│   │   ├── seed.ts
│   │   ├── db-reset.ts
│   │   ├── generate-types.ts      # 新增：codegen 入口
│   │   ├── check-types-fresh.ts   # 新增：CI/local 检查 codegen 产物未漂移
│   │   ├── benchmark-reasoning.ts
│   │   ├── observe-circadian.ts
│   │   ├── resolve-coords.ts
│   │   ├── smoke-llm.ts
│   │   ├── smoke-tick.ts
│   │   ├── verify-economy.ts
│   │   ├── migrate-llm-env.ts
│   │   ├── start.ps1
│   │   └── start.sh
│   └── src/
│       ├── domain/            # 类型、枚举、zod schemas、ActionRegistry、events
│       ├── shared/            # logger 等跨模块工具
│       ├── db/                # Drizzle ORM、repositories
│       │   └── migrations/    # 现 drizzle/ 内容入此
│       ├── config/            # 加载器代码（读 backend/scenes/<id>/）
│       ├── llm/               # OpenAI client、prompt、decide/dialog/think 调用入口
│       ├── systems/           # 引擎系统（vitals/emotion、pathfinding、perception、actions、facts、economy、layout、notebook、store 等）
│       └── server/            # Fastify 入口 + tick 编排 + HTTP routes
│           ├── index.ts
│           ├── tick.ts
│           ├── decideForCharacter.ts
│           └── routes/
│
├── docs/                      # 保留
├── scripts/
│   └── run-parallel.mjs       # 唯一根级辅助脚本：并发跑 frontend/backend 的 dev
├── package.json               # 极薄编排器 — 不持依赖、非 workspace、不生成 lockfile
├── README.md
├── AGENTS.md
├── CLAUDE.md                  # 增加 "DO NOT MODIFY ROOT package.json" 段落
├── .gitignore
└── .git/
```

**删除的老路径**：`apps/`、`packages/`、`src/`、根 `configs/`、根 `data/`、`drizzle/`（根级）、`pnpm-workspace.yaml`、`next.config.ts`、`postcss.config.mjs`（根级）、`next-env.d.ts`、`tsconfig.json`（根级）、`eslint.config.mjs`（根级）、`vitest.config.ts`（根级）、`drizzle.config.ts`（根级）、`tsconfig.tsbuildinfo`、根 `agent-world.db*`、`apps/server/data/agent-world.db*` 二选一删除（保留较新者迁入 `backend/data/`）。

## 3. 前端：Vite + React

### 3.1 框架与路由
- **Vite 5+** 作为 dev server 和 bundler。
- **React 19**（沿用现版本）。
- **react-router-dom** v6/v7，使用 `BrowserRouter`；只有两条路由：`/` → `home.tsx`、`/admin` → `admin.tsx`。
- 全局 chrome 拆进 `App.tsx` 用 `<Outlet />` 包裹。
- 上 Electron 时切换为 `HashRouter` 是单点替换。

### 3.2 API 客户端与开发代理
- `frontend/src/lib/api.ts` 从原 `src/app/_lib/api.ts` 平移。
- 通过 `import.meta.env.VITE_API_URL` 读后端地址；缺省 `http://localhost:3001`。
- Vite dev server 配 `server.proxy: { '/api': { target: env.VITE_API_URL, changeOrigin: true } }`，前端代码继续用相对路径 `/api/...`。
- 后端 `tick` 走 SSE 长连接；Vite 默认 proxy 支持 SSE，无需额外配置。

### 3.3 类型契约（codegen）
- **单一信源**：`backend/src/domain/types.ts`（纯 TS interface/type）+ `backend/src/domain/enums.ts`（`as const` 数组、字面量联合、值常量）。这两个文件全是 TS-native，**与 `schemas.ts`（zod）无关**——前端不消费 zod schemas。
- **工具**：`tsc --emitDeclarationOnly` + 一段 ~50 行的 Node 合并脚本。`typescript` 已是 backend dep，**不引入新的 npm dep**。
- **入口脚本**：`backend/scripts/generate-types.ts`，流程：
  1. 调 `tsc --emitDeclarationOnly --outDir <tmp> src/domain/types.ts src/domain/enums.ts`，得到 `<tmp>/types.d.ts` 与 `<tmp>/enums.d.ts`。
  2. 读两份 `.d.ts`，移除其中的 `import` 语句（types.d.ts 会有 `import type { ... } from "./enums"`，因为合并后 enums.ts 内容已并入同一文件，import 必须删）。
  3. 串接顺序：先 enums 内容、后 types 内容（types 引用 enums，被引用者要先声明）。
  4. 加头部注释 `⚠️ AUTO-GENERATED from backend/src/domain/{types,enums}.ts. Run \`pnpm gen:types\` from repo root to regen. Do not edit by hand.`。
  5. 写出到 `../frontend/src/types/api.generated.ts`。
- **常量值 export**：`enums.ts` 里的非类型 export（如 `export const TICKS_PER_HOUR = 5`、`export const NODE_TAGS = [...] as const`、`export const PROFESSION_INCOME_TIERS: Record<string, number> = {...}`）需要在前端**作为运行时值**使用——但 `tsc --emitDeclarationOnly` 只产生 `.d.ts`（仅声明，无实现）。所以 generate-types.ts 还要做第 6 步：从 `enums.ts` 源文件中**额外提取所有 `export const` 声明**（regex 或简单 AST），把它们的实现一并附在产物末尾。这样产物既是类型也是值。
- **产物文件**：自包含、零运行时依赖、是单一 `.ts` 文件（不是 `.d.ts`）；**签入 git** 作为版本化 API 契约。
- **漂移检查**：`backend/scripts/check-types-fresh.ts` 跑 `gen:types` 后比对 `git diff --exit-code frontend/src/types/api.generated.ts`；非空即报错。

### 3.4 样式与测试
- `tailwindcss@4` + `@tailwindcss/postcss` 配置整体迁入 `frontend/`。
- 全局 CSS：`frontend/src/styles/globals.css`，由 `main.tsx` 导入。
- 测试：Vitest + jsdom。当前所有 `_lib/*.test.ts`（gantt-utils、format、profile-format、relation-graph-utils）平移到 `frontend/src/lib/*.test.ts`，测试是纯函数零代码改动。

## 4. 后端：拍平的 Node 项目

### 4.1 模块边界
拍平后没有 workspace 强制约束，靠两层工具补齐：

**Import 风格约定**：
- 跨模块：相对路径（如 `../db/repos/character`）。
- 模块内：相对路径（如 `./helper`）。
- **不**使用 TS path alias（`@/...`），降低 tooling 配置摩擦。

**ESLint 边界规则**（`eslint-plugin-import` 的 `no-restricted-paths`）：
按 layer 定义模块依赖图，违反即报错。

依赖图：
- `domain` — 不准 import 任何其他模块（最底层）。
- `shared` — 仅可 import `domain`。
- `db` — 可 import `domain`、`shared`。
- `config` — 可 import `domain`、`shared`。
- `llm` — 可 import `domain`、`shared`、`config`、`db`、`systems`。
- `systems` — 可 import `domain`、`shared`、`db`。
- `server` — 顶层，可 import 所有模块。

### 4.2 运维资源
- **`backend/scenes/<scene-id>/`**：地图包内容（manifest / map / characters / events / actions）。从 `configs/maps/<pack>/` 平移并去掉 `maps/` 中间层。env var 由 `AGENT_WORLD_CONFIGS_DIR` 改名为 `AGENT_WORLD_SCENES_DIR`，缺省 `./scenes`。
- **`backend/data/agent-world.db`**：唯一一份 SQLite 文件（合并自当前两份）。`DATABASE_URL` 缺省 `./data/agent-world.db`。
- **`backend/src/db/migrations/`**：Drizzle 迁移脚本（从根 `drizzle/` 迁入；`drizzle.config.ts` 调整 `out` 路径）。
- **`backend/scripts/`**：所有 dev/maintenance 脚本归集于此（不再有根级 `scripts/<task>.ts`）。

### 4.3 Env 变量
- `DATABASE_URL` — SQLite 路径，缺省 `./data/agent-world.db`。
- `AGENT_WORLD_SCENES_DIR` — 地图包根目录，缺省 `./scenes`。
- `PORT` / `HOST` — Fastify 监听地址，缺省 `3001` / `0.0.0.0`。
- `OPENAI_API_KEY` 等 LLM 提供商配置照旧（具体值由 DB `llm_providers` 表持有）。
- `.env.example` 落 `backend/.env.example`。

### 4.4 测试
- `backend/vitest.config.ts`，`TZ=UTC` 保留。
- 现有所有 `*.test.ts` 按模块归属就近落位（如 `dialog.test.ts`、`facts.test.ts`、`tick.test.ts` 入 `backend/src/systems/` 或 `backend/src/server/`，看其依赖）。
- 因为不用 path alias，原 `@agw/<pkg>` 形式的 import 在迁移时全部改为相对路径；测试代码改动量等同于业务代码改动量。

## 5. 根目录与开发体验

### 5.1 根 `package.json`（极薄编排器）
- **无** `dependencies`、**无** `devDependencies`、**无** `pnpm` 字段、**无** lockfile。
- **不是** pnpm workspace（删除根 `pnpm-workspace.yaml`）。
- 仅承载便利脚本：

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
    "db:migrate":    "pnpm --dir backend run db:migrate",
    "db:reset":      "pnpm --dir backend run db:reset",
    "seed":          "pnpm --dir backend run seed",
    "install:all":   "pnpm --dir backend install && pnpm --dir frontend install"
  }
}
```

`pnpm --dir <subdir> <script>` 是 pnpm 自带能力，不需要 workspace。

### 5.2 `scripts/run-parallel.mjs`
唯一的根级辅助脚本，零外部依赖、跨平台。

接受子目录名参数序列；对每个子目录 spawn `pnpm --dir <name> dev`；前缀输出（`[frontend]` / `[backend]`）；Ctrl-C 转发给所有子进程；任一子进程退出杀掉其余。预计实现 ~40 行 Node.js，仅用 `node:child_process` / `node:process` 内置模块。

### 5.3 CLAUDE.md 增补段落
在 `CLAUDE.md` 顶部 `## Commands` 之前插入：

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

`## Commands`、`## Architecture` 节也需要更新以反映新目录；这部分由实施计划处理。

### 5.4 .gitignore（根级）
```
node_modules/
*.log
.env
.env.local
agent-world.db*
.DS_Store
```
子项目各自补充自己的 `.gitignore`（`dist/`、`.vite/`、`coverage/`）。

## 6. 迁移序列

### Phase 0：预备清理（同一分支首个 commit）
**目的**：把已死代码先扫掉，让主迁移 diff 真实反映"在搬什么"。

1. 删 `src/{engine,llm,db,config,util}/` 5 个 re-export 垫片目录。**`src/domain/` 不在此次删除范围**——`src/app/` 当前仍以 `@/domain/types`、`@/domain/enums` 形式依赖它，要等 step 1.2 把前端搬进 `frontend/` 并切到 codegen 产物之后才能删。
   验证方式：grep 全仓库 `from "@/(engine|llm|db|config|util)/` 应无任何命中（包括 `apps/server/`、`packages/*`、`scripts/`、`src/app/`）；如有，先把消费者直接改为 `from '@agw/<pkg>'` 再删垫片。
2. 删除冗余 SQLite：比较根 `agent-world.db` 与 `apps/server/data/agent-world.db` 修改时间，保留较新者，另一份 `git rm`。
3. 扫 `scripts/`，删除已不被任何 `package.json` 引用的脚本（**列表先确认再删**）。

**验证**：`pnpm test` 全绿（`src/domain/` 仍在，`src/app/` 测试继续工作）。
**Commit message**：`chore: remove dead re-export shims and stale db duplicates`。

### Phase 1：主重构（同一分支后续 commits，单 PR 合并）

**Step 1.1 — 建 `frontend/` 骨架**
新建 `frontend/{package.json,vite.config.ts,tsconfig.json,eslint.config.mjs,vitest.config.ts,postcss.config.mjs,tailwind.config.ts,index.html}`，`pnpm install` 生成自己的 lockfile。验证：`cd frontend && pnpm dev` 出 Vite welcome 页。

**Step 1.2 — 搬前端代码**
- `src/app/page.tsx` → `frontend/src/routes/home.tsx`
- `src/app/admin/page.tsx` → `frontend/src/routes/admin.tsx`
- `src/app/layout.tsx` 拆 chrome → `frontend/src/App.tsx`
- `src/app/_components/*` → `frontend/src/components/*`
- `src/app/_hooks/*` → `frontend/src/hooks/*`
- `src/app/_lib/*` → `frontend/src/lib/*`
- `src/app/globals.css` → `frontend/src/styles/globals.css`
- `src/app/favicon.ico`、根 `public/*` → `frontend/public/`

写 `main.tsx`、`App.tsx`（BrowserRouter + 两 route）。所有 `@/domain/*` import 改为从 `frontend/src/types/api.generated.ts` 引入（step 1.4 才生成真 codegen 产物，本步先放手写打底版本，包含 `Character`、`MapNode`、`World`、`WorldEvent`、`Action`、`OngoingAction`、`SleepWindow`、`Personality`、`Relation`、`ObjectiveRelationKind`、`TICKS_PER_HOUR` 等当前 src/app/ 实际用到的导出）。Vite 配 `server.proxy` 反代 `/api/*`。

此步完成后，`src/domain/` 不再有消费者；它将在 step 1.3 随 `src/` 整体删除。

验证：`pnpm dev:frontend` 起来，前端能渲染（API 失败是预期）。

**Step 1.3 — 建 `backend/` 骨架并搬代码**
- `git mv apps/server/* backend/src/server/`
- `git mv packages/{domain,systems,llm,db,config,shared}/src backend/src/<对应模块名>`
- `git mv configs backend/scenes`，把 `scenes/maps/<pack>/` 提升为 `scenes/<pack>/`；改 `backend/src/config/loader.ts` 中 `<configsDir>/maps/<id>` 路径逻辑为 `<scenesDir>/<id>`；**全仓库 grep `'maps/'` 字面量**确认无遗漏。
- `git mv data backend/data`（仅保留 phase 0 选定的那份）
- `git mv drizzle backend/src/db/migrations`，更新 `drizzle.config.ts` 的 `out` 字段。
- `git mv scripts/<除 run-parallel 外的所有>.ts backend/scripts/`，`scripts/start.{ps1,sh}` → `backend/scripts/`。
- 新建 `backend/{package.json,tsconfig.json,eslint.config.mjs,vitest.config.ts,drizzle.config.ts,.env.example}`。ESLint 配置含 `eslint-plugin-import` 的 `no-restricted-paths` layer 规则。
- 删根 `apps/`、`packages/`、`src/`、`pnpm-workspace.yaml`、`next.config.ts`、`postcss.config.mjs`、`next-env.d.ts`、`tsconfig.json`、`eslint.config.mjs`、`vitest.config.ts`、`drizzle.config.ts`（根级）、`tsconfig.tsbuildinfo`、`README.md` 暂不动。
- **批量改 import**：所有 `from '@agw/<pkg>'` 改为相对路径；用 IDE 全局重构。
- `pnpm install` 在 `backend/` 生成自己的 lockfile。
- 验证：`pnpm --dir backend lint && pnpm --dir backend test` 全绿；`pnpm dev:backend` 起来，`curl localhost:3001/api/worlds` 返回。

**Step 1.4 — 接通 codegen 管线**
- 写 `backend/scripts/generate-types.ts`：调用 `tsc --emitDeclarationOnly` 生成 `types.d.ts` + `enums.d.ts`，移除内部 `import`、串接（enums 在前 types 在后）、从 `enums.ts` 源文件提取 `export const` 实现并附在末尾、加警告头，写到 `../frontend/src/types/api.generated.ts`。详见 §3.3。
- 写 `backend/scripts/check-types-fresh.ts`：跑 codegen 后 `git diff --exit-code` 该产物，非零即失败。
- 跑 `pnpm gen:types`，对比与 step 1.2 手写打底版差异；以生成版为准。前端缺类型则回 backend 加 export。
- 后续 CI 系统接入时调用 `check-types-fresh.ts`。

**Step 1.5 — 写根 `package.json` + `scripts/run-parallel.mjs`**
- 落 §5.1 的 thin `package.json` 和 §5.2 的 `run-parallel.mjs`。
- 在 `CLAUDE.md` 顶部插入 §5.3 的 "DO NOT MODIFY ROOT package.json" 段落；同步更新 `## Commands`、`## Architecture` 节。
- 更新 `README.md`：写明仓库结构、`pnpm install:all`、`pnpm dev`、`pnpm gen:types` 流程。
- 删根 `eslint.config.mjs`、`vitest.config.ts`、`tsconfig.json`、`tsconfig.tsbuildinfo`。

**Step 1.6 — 全栈联调验证**（accpetance criteria）
- 干净 clone 上 `pnpm install:all` 通过。
- 根 `pnpm dev` 同时起两边，前端 `/admin` 渲染并拉到后端数据。
- 根 `pnpm test` 顺序跑两边全绿；`pnpm test:frontend` / `pnpm test:backend` 独立可跑。
- 根 `pnpm lint` 全绿；故意写一行违反 `no-restricted-paths` 的 import，确认 ESLint 报错。
- `pnpm gen:types` 幂等（第二次 git diff 为空）。
- `pnpm seed`、`pnpm db:reset`、`pnpm db:migrate` 在 `backend/` 上下文工作。
- `cd frontend && pnpm dev` 与 `cd backend && pnpm dev` 独立可跑。

### 提交策略
Phase 0 与 Phase 1 在**同一分支**进行；Phase 1 内部可拆多个原子 commit（"feat: scaffold frontend"、"feat: migrate backend"、"feat: codegen pipeline"、"chore: root orchestrator + cleanup"）；最终作为单个 PR 合并主干。

## 7. 不在本次范围

- **不**改 API endpoint 形态（保留现有 `/api/*` REST 路由、SSE 协议）。
- **不**引入 OpenAPI 规范文件、tRPC、GraphQL。
- **不**升级 React / Tailwind / 其他依赖大版本。
- **不**改 LLM 提示词、tick 编排、action 系统、DB schema、mod 加载机制（除 `scenes` 路径调整）。
- **不**做 Electron / Capacitor / 移动端打包配置——本次只是为后续清扫障碍。
- **不**搭建 CI 工作流——`check-types-fresh.ts` 等校验脚本就位即可，CI 由独立任务接入。

## 8. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| `tsc --emitDeclarationOnly` 生成的 `.d.ts` 在 inline 跨文件 import 后语法不合法（如 `import type` 路径丢失导致符号找不到） | codegen 产物前端无法 build | generate-types.ts 实现时先在临时目录跑通 tsc，再做合并；step 1.4 完成后用 `tsc --noEmit` 在 `frontend/` 上验证产物可被消费 |
| Drizzle migrations 路径调整破坏现有迁移记录 | DB 状态错乱 | 不改迁移文件内容，只改 `drizzle.config.ts` 的 `out`；先在副本 db 上验证 `db:migrate` 幂等 |
| `scenes/<pack>/` 路径调整漏改某个动态加载点 | 地图包加载失败 | 全仓库 grep `'maps/'` 字面量；`backend/src/config/{loader,mod-loader,event-loader}.ts` 三个文件重点 review |
| Vite SSE proxy 与 Next rewrite 行为微差异 | tick 推送中断 | step 1.6 验证清单包含手动跑一次 tick 看 SSE 能否正常推 |
| ESLint `no-restricted-paths` 规则误伤 | 阻塞日常开发 | 规则上线后立刻全量 lint；任何误报先把规则放宽为 warning，确认意图后再 error |
| 重构期间 git 历史的 file rename 跟踪丢失 | 后续 `git blame` / `git log --follow` 困难 | 用 `git mv` 而不是 删+建；阶段性 commit 不要把 mv 和编辑混在一个 commit |

## 9. 决策记录（for traceability）

按 brainstorming 顺序记录用户选择，避免后续偏离原意：

| # | 决策点 | 用户选择 |
|---|---|---|
| 1 | 重构动机 | (C) 双轨准备：未来可分仓 |
| 2 | 类型共享策略 | (A) 后端单一信源 + codegen |
| 3 | 前端框架 | (A) Vite + React + React Router (BrowserRouter) |
| 4 | 后端内部结构 | (A) 拍平到 `backend/src/<module>/` |
| 5 | 根 `package.json` | (β) 极薄编排器，不持依赖、非 workspace |
| 5b | 内容目录命名 | `backend/scenes/<scene-id>/`（原 `configs/maps/<pack>/`） |
| 6 | 迁移序列 | Phase 0（清死代码）→ Phase 1（主重构），同一分支单 PR |
| 7 | codegen 工具 | (B) `tsc --emitDeclarationOnly` + 自家合并脚本（无新 dep）。原选 `zod-to-ts` 在 plan 阶段被否：前端消费的是 `types.ts`/`enums.ts` TS-native 内容，`schemas.ts` 的 zod 与前端无关。 |
| 8 | 路由库 | `react-router-dom` |
| 9 | 测试 DOM 环境 | `jsdom` |
| 10 | TS path alias | 不用，全部相对路径；ESLint 边界用 `no-restricted-paths` |
| 11 | Drizzle migrations 位置 | `backend/src/db/migrations/`（不放 `backend/drizzle/`） |
| 12 | ESLint 边界规则 | 启用 |
| 13 | 测试运行模式 | 顺序跑（`backend` 先，`frontend` 后）；同时支持 per-side 独立运行 |
