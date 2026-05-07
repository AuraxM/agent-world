# Monorepo 全量重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将单体 Next.js 应用重构为 pnpm workspaces monorepo，分离前端/后端，分离规则逻辑（systems）和 LLM 行为（llm），提高可读性和可维护性。

**Architecture:** 6 个内部包（domain → shared → db → systems → llm）和 2 个应用（web, server）。依赖单向：`domain ← shared ← db ← systems ← llm ← server`，`web` 仅通过 HTTP 与 `server` 通信。

**Tech Stack:** pnpm workspaces, Next.js 16, Fastify, SQLite + Drizzle ORM, TypeScript 5, Vitest

---

## Phase 1: 建立骨架

### Task 1: 初始化 pnpm workspace 和 root package.json

**Files:**
- Create: `pnpm-workspace.yaml`
- Modify: `package.json`
- Create: `.npmrc`

- [ ] **Step 1: 创建 pnpm-workspace.yaml**

```bash
cat > /Users/arana/Projects/agent-world/pnpm-workspace.yaml << 'EOF'
packages:
  - "packages/*"
  - "apps/*"
EOF
```

- [ ] **Step 2: 更新 root package.json 为 workspace root**

Read current `package.json` then rewrite with workspace scripts:

```bash
cat > /Users/arana/Projects/agent-world/package.json << 'EOF'
{
  "name": "agent-world",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter @agw/server dev & pnpm --filter @agw/web dev",
    "dev:server": "pnpm --filter @agw/server dev",
    "dev:web": "pnpm --filter @agw/web dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5",
    "vitest": "^4.1.5"
  }
}
EOF
```

- [ ] **Step 3: 创建 .npmrc**

```bash
cat > /Users/arana/Projects/agent-world/.npmrc << 'EOF'
shamefully-hoist=false
strict-peer-dependencies=false
EOF
```

- [ ] **Step 4: 运行 pnpm install 验证**

```bash
pnpm install
```

Expected: 成功安装，无错误。

- [ ] **Step 5: 提交**

```bash
git add pnpm-workspace.yaml package.json .npmrc
git commit -m "chore: initialize pnpm workspaces"
```

---

### Task 2: 创建 packages/domain

**Files:**
- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`
- Create: `packages/domain/src/index.ts` (barrel)
- Create: `packages/domain/src/types.ts` (copy from src/domain/types.ts)
- Create: `packages/domain/src/enums.ts` (copy from src/domain/enums.ts)
- Create: `packages/domain/src/action-system.ts` (copy from src/domain/action-system.ts)
- Create: `packages/domain/src/events.ts` (copy from src/domain/events.ts)
- Create: `packages/domain/src/schemas.ts` (copy from src/domain/schemas.ts)

- [ ] **Step 1: 创建 package.json**

```bash
mkdir -p /Users/arana/Projects/agent-world/packages/domain/src
```

```json
{
  "name": "@agw/domain",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {},
  "dependencies": {
    "zod": "^4.4.1"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 复制源文件并创建 barrel**

```bash
cp /Users/arana/Projects/agent-world/src/domain/types.ts /Users/arana/Projects/agent-world/packages/domain/src/types.ts
cp /Users/arana/Projects/agent-world/src/domain/enums.ts /Users/arana/Projects/agent-world/packages/domain/src/enums.ts
cp /Users/arana/Projects/agent-world/src/domain/action-system.ts /Users/arana/Projects/agent-world/packages/domain/src/action-system.ts
cp /Users/arana/Projects/agent-world/src/domain/events.ts /Users/arana/Projects/agent-world/packages/domain/src/events.ts
cp /Users/arana/Projects/agent-world/src/domain/schemas.ts /Users/arana/Projects/agent-world/packages/domain/src/schemas.ts
```

Barrel file `packages/domain/src/index.ts`:

```typescript
export * from "./types";
export * from "./enums";
export * from "./action-system";
export * from "./events";
export * from "./schemas";
```

- [ ] **Step 4: 修复内部 import 路径**

`packages/domain/src/schemas.ts` import 了 `@/domain/types` 和 `@/domain/enums` 和 `@/domain/action-system`。改为相对路径：

```typescript
// 旧: import { ... } from "@/domain/types"
// 新: import { ... } from "./types"
```

同样处理 `action-system.ts` 中的 `@/engine/facts` → 需要改为引用 domain 内部类型。检查 `action-system.ts` 的 import：`import type { AggregatedFacts } from "@/engine/facts"` — 这个类型需要移到 domain 或改为泛型。

**处理方案**：在 `packages/domain/src/action-system.ts` 中将 `AggregatedFacts` 改为 `Record<string, unknown>` 或内联定义所需字段（`lastSleepDay`, `lastSleepHour` 等）。`AggregatedFacts` 留待 `systems` 阶段重新连接。

同样处理 `packages/domain/src/schemas.ts` 中的 `@/engine/notebook` import — 改为内联 `tickFromCalendar` 等函数签名，或用 `unknown` 替代。

- [ ] **Step 5: 运行 pnpm install 验证**

```bash
pnpm install
```

Expected: 成功，`@agw/domain` 可被解析。

- [ ] **Step 6: 提交**

```bash
git add packages/domain/
git commit -m "feat: add @agw/domain package with types, enums, action-system"
```

---

### Task 3: 创建 packages/shared

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/logger.ts` (copy from src/util/logger.ts)

- [ ] **Step 1: 创建包结构**

```bash
mkdir -p /Users/arana/Projects/agent-world/packages/shared/src
```

```json
{
  "name": "@agw/shared",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {},
  "dependencies": {
    "@agw/domain": "workspace:*"
  }
}
```

- [ ] **Step 2: 复制 logger 并创建 barrel**

```bash
cp /Users/arana/Projects/agent-world/src/util/logger.ts /Users/arana/Projects/agent-world/packages/shared/src/logger.ts
cp /Users/arana/Projects/agent-world/src/util/logger.test.ts /Users/arana/Projects/agent-world/packages/shared/src/logger.test.ts
```

`packages/shared/src/index.ts`:
```typescript
export { createLogger } from "./logger";
```

- [ ] **Step 3: 运行测试验证**

```bash
pnpm install
pnpm vitest run packages/shared/src/logger.test.ts
```

Expected: logger 测试通过。

- [ ] **Step 4: 提交**

```bash
git add packages/shared/
git commit -m "feat: add @agw/shared package with logger"
```

---

### Task 4: 创建 apps/server 骨架

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/src/index.ts`

- [ ] **Step 1: 创建 Fastify 入口**

```bash
mkdir -p /Users/arana/Projects/agent-world/apps/server/src
```

```json
{
  "name": "@agw/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@agw/domain": "workspace:*",
    "fastify": "^5"
  },
  "devDependencies": {
    "@types/node": "^20",
    "tsx": "^4.21.0"
  }
}
```

- [ ] **Step 2: 创建最小 Fastify 服务**

`apps/server/src/index.ts`:
```typescript
import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get("/api/health", async () => ({ status: "ok" }));

const start = async () => {
  try {
    await app.listen({ port: 3001, host: "0.0.0.0" });
    console.log("Server running on http://localhost:3001");
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
```

- [ ] **Step 3: 安装依赖并启动验证**

```bash
pnpm install
pnpm --filter @agw/server dev &
sleep 3
curl http://localhost:3001/api/health
kill %1
```

Expected: `{"status":"ok"}`

- [ ] **Step 4: 提交**

```bash
git add apps/server/
git commit -m "feat: add @agw/server skeleton with Fastify health check"
```

---

### Task 5: 验证 monorepo 全局构建

- [ ] **Step 1: 从 root 验证所有包可解析**

```bash
pnpm install
pnpm -r exec node -e "console.log('ok')"
```

Expected: 每个包输出 `ok`，无错误。

- [ ] **Step 2: 确认现有 Next.js 应用仍可运行**

```bash
pnpm dev:web &
sleep 5
curl -s http://localhost:3000 | head -5
kill %1
```

Expected: 返回 Next.js 页面 HTML。

- [ ] **Step 3: 提交（如有 lockfile 变更）**

```bash
git add pnpm-lock.yaml 2>/dev/null; git commit -m "chore: update lockfile after workspace setup" || true
```

---

## Phase 2: 拆出 DB 层

### Task 6: 创建 packages/db — Schema + Client + Migrate

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/schema.ts` (copy from src/db/schema.ts)
- Create: `packages/db/src/client.ts` (copy from src/db/client.ts)
- Create: `packages/db/src/migrate.ts` (copy from src/db/migrate.ts)
- Create: `packages/db/drizzle.config.ts` (adapted from root drizzle.config.ts)

- [ ] **Step 1: 创建包结构**

```bash
mkdir -p /Users/arana/Projects/agent-world/packages/db/src/migrations
```

```json
{
  "name": "@agw/db",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "db:migrate": "tsx src/migrate.ts"
  },
  "dependencies": {
    "@agw/domain": "workspace:*",
    "@agw/shared": "workspace:*",
    "better-sqlite3": "^12.9.0",
    "drizzle-orm": "^0.45.2"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "drizzle-kit": "^0.31.10",
    "tsx": "^4.21.0"
  }
}
```

- [ ] **Step 2: 复制源文件**

```bash
cp /Users/arana/Projects/agent-world/src/db/schema.ts /Users/arana/Projects/agent-world/packages/db/src/schema.ts
cp /Users/arana/Projects/agent-world/src/db/client.ts /Users/arana/Projects/agent-world/packages/db/src/client.ts
cp /Users/arana/Projects/agent-world/src/db/migrate.ts /Users/arana/Projects/agent-world/packages/db/src/migrate.ts
cp /Users/arana/Projects/agent-world/src/db/migrations/*.sql /Users/arana/Projects/agent-world/packages/db/src/migrations/
```

- [ ] **Step 3: 修复 import 路径**

`packages/db/src/client.ts` 中 `import { schema } from "@/db/client"` 改为自引用。检查当前文件：`import { db, schema } from "@/db/client"` — 这有点奇怪，client.ts 自己导出了 db 和 schema。需要调整为从 `./schema` import schema，`db` 直接创建。

Read `src/db/client.ts` to check exact structure, then fix:

```typescript
// packages/db/src/client.ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database("agent-world.db");
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export { schema };
```

- [ ] **Step 4: 复制 migrations 目录并适配 drizzle.config**

```bash
mkdir -p /Users/arana/Projects/agent-world/packages/db
```

`packages/db/drizzle.config.ts`:
```typescript
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./src/migrations",
  dialect: "sqlite",
  dbCredentials: { url: "../../data/agent-world.db" },
});
```

- [ ] **Step 5: Barrel 导出**

`packages/db/src/index.ts`:
```typescript
export { db, schema } from "./client";
export { migrate } from "./migrate";
```

- [ ] **Step 6: 验证迁移可用**

```bash
pnpm install
pnpm --filter @agw/db db:migrate
```

Expected: 迁移成功运行（或报告 "already up to date"）。

- [ ] **Step 7: 提交**

```bash
git add packages/db/ .gitignore
git commit -m "feat: add @agw/db package with schema, client, migrations"
```

---

### Task 7: 创建 Repository 层

**Files:**
- Create: `packages/db/src/repository/worlds.ts`
- Create: `packages/db/src/repository/nodes.ts`
- Create: `packages/db/src/repository/characters.ts`
- Create: `packages/db/src/repository/events.ts`
- Create: `packages/db/src/repository/thoughts.ts`
- Create: `packages/db/src/repository/snapshots.ts`
- Create: `packages/db/src/repository/conversations.ts`
- Create: `packages/db/src/repository/think-sessions.ts`
- Create: `packages/db/src/repository/notebook-entries.ts`
- Create: `packages/db/src/repository/transactions.ts`

**说明**: 从 `src/engine/store.ts` 提取所有 DB 操作逻辑，加上从 `src/engine/notebook.ts`、`src/engine/think-sessions.ts`、`src/engine/dialog.ts` 中提取的 DB 读写部分。每表一个 repository 文件。

- [ ] **Step 1: 创建 worlds repository**

`packages/db/src/repository/worlds.ts`:
```typescript
import { eq } from "drizzle-orm";
import { db, schema } from "../client";
import type { World } from "@agw/domain";

export function findWorld(worldId: string): World | undefined {
  const w = db.select().from(schema.worlds).where(eq(schema.worlds.id, worldId)).get();
  if (!w) return undefined;
  return {
    id: w.id,
    name: w.name,
    mapId: w.mapId,
    currentTick: w.currentTick,
    epoch: w.epoch.getTime(),
    createdAt: w.createdAt.getTime(),
    updatedAt: w.updatedAt.getTime(),
  };
}

export function getWorldOrThrow(worldId: string): World {
  const w = findWorld(worldId);
  if (!w) throw new Error(`world not found: ${worldId}`);
  return w;
}

export function listWorlds(): World[] {
  return db.select().from(schema.worlds).all().map((w) => ({
    id: w.id,
    name: w.name,
    mapId: w.mapId,
    currentTick: w.currentTick,
    epoch: w.epoch.getTime(),
    createdAt: w.createdAt.getTime(),
    updatedAt: w.updatedAt.getTime(),
  }));
}

export function insertWorld(world: World): void {
  db.insert(schema.worlds).values({
    id: world.id,
    name: world.name,
    mapId: world.mapId,
    currentTick: world.currentTick,
    epoch: new Date(world.epoch),
  }).run();
}

export function updateWorldTick(worldId: string, tick: number): void {
  db.update(schema.worlds).set({
    currentTick: tick,
    updatedAt: new Date(),
  }).where(eq(schema.worlds.id, worldId)).run();
}

export function updateWorldMapId(worldId: string, mapId: string): void {
  db.update(schema.worlds).set({ mapId, updatedAt: new Date() })
    .where(eq(schema.worlds.id, worldId)).run();
}
```

- [ ] **Step 2: 创建 nodes repository**

`packages/db/src/repository/nodes.ts`:
```typescript
import { and, eq } from "drizzle-orm";
import { db, schema } from "../client";
import type { MapNode } from "@agw/domain";
import type { NodeTag, Privacy } from "@agw/domain";

type NodeRow = typeof schema.nodes.$inferSelect;

function rowToNode(n: NodeRow): MapNode {
  return {
    id: n.id,
    worldId: n.worldId,
    parentId: n.parentId,
    name: n.name,
    description: n.description,
    tags: JSON.parse(n.tagsJson) as NodeTag[],
    capacity: n.capacity,
    privacy: n.privacy as Privacy,
    visibleFromParent: !!n.visibleFromParent,
    shortcuts: JSON.parse(n.shortcutsJson) as string[],
    isEntry: !!n.isEntry,
    travelCost: n.travelCost ?? undefined,
    x: n.x ?? undefined,
    y: n.y ?? undefined,
    w: n.w ?? undefined,
    h: n.h ?? undefined,
    spriteKey: n.spriteKey ?? undefined,
  };
}

function nodeToRow(n: MapNode, worldId: string) {
  return {
    id: n.id,
    worldId,
    parentId: n.parentId,
    name: n.name,
    description: n.description,
    tagsJson: JSON.stringify(n.tags),
    capacity: n.capacity ?? null,
    privacy: n.privacy,
    visibleFromParent: n.visibleFromParent,
    shortcutsJson: JSON.stringify(n.shortcuts),
    isEntry: n.isEntry,
    travelCost: n.travelCost ?? null,
    x: n.x ?? null,
    y: n.y ?? null,
    w: n.w ?? null,
    h: n.h ?? null,
    spriteKey: n.spriteKey ?? null,
  };
}

export function findNodesByWorld(worldId: string): MapNode[] {
  return db.select().from(schema.nodes)
    .where(eq(schema.nodes.worldId, worldId)).all().map(rowToNode);
}

export function insertNodes(worldId: string, nodes: MapNode[]): void {
  db.transaction((tx) => {
    for (const n of nodes) {
      tx.insert(schema.nodes).values(nodeToRow(n, worldId)).run();
    }
  });
}
```

- [ ] **Step 3: 创建 characters repository**

`packages/db/src/repository/characters.ts` — 封装所有 Character JSON 序列化/反序列化，与 store.ts 中 `loadWorld` 和 `saveWorld` 的 character 部分对应。

```typescript
import { and, eq } from "drizzle-orm";
import { db, schema } from "../client";
import type { Character } from "@agw/domain";

type CharRow = typeof schema.characters.$inferSelect;

export function rowToCharacter(c: CharRow): Character {
  return {
    id: c.id,
    worldId: c.worldId,
    name: c.name,
    avatar: c.avatar ?? undefined,
    age: c.age,
    gender: c.gender as Character["gender"],
    profession: c.profession as Character["profession"],
    money: c.money,
    incomeLevel: c.incomeLevel,
    expenseExempt: !!c.expenseExempt,
    biography: c.biography,
    origin: c.origin as Character["origin"],
    locationId: c.locationId,
    personality: JSON.parse(c.personalityJson),
    vitals: JSON.parse(c.vitalsJson),
    emotion: JSON.parse(c.emotionJson),
    abilities: JSON.parse(c.abilitiesJson),
    shortMemory: JSON.parse(c.shortMemoryJson),
    dailyMemory: JSON.parse(c.dailyMemoryJson),
    longMemory: JSON.parse(c.longMemoryJson),
    impressionBook: JSON.parse(c.impressionBookJson ?? "{}") as Record<string, string>,
    shortTermGoal: c.shortTermGoalJson ? JSON.parse(c.shortTermGoalJson) : null,
    longTermGoal: c.longTermGoalJson ? JSON.parse(c.longTermGoalJson) : null,
    liked: c.liked ?? "",
    disliked: c.disliked ?? "",
    relations: JSON.parse(c.relationsJson),
    currentAction: c.currentActionJson ? JSON.parse(c.currentActionJson) : undefined,
    lastSleepTick: c.lastSleepTick,
    appearance: c.appearance,
    intelligence: c.intelligence,
    health: c.health,
    sickness: c.sicknessJson ? JSON.parse(c.sicknessJson) : undefined,
    speakingStyle: c.speakingStyle ?? undefined,
    activeConversationIds: JSON.parse(c.activeConversationIdsJson),
    notebook: [],
  };
}

export function characterToRow(c: Character) {
  return {
    id: c.id,
    worldId: c.worldId,
    name: c.name,
    avatar: c.avatar ?? null,
    age: c.age,
    gender: c.gender,
    profession: c.profession,
    money: c.money,
    incomeLevel: c.incomeLevel,
    expenseExempt: c.expenseExempt,
    incomeMultiplier: 1.0,
    appearance: c.appearance,
    intelligence: c.intelligence,
    health: c.health,
    sicknessJson: c.sickness ? JSON.stringify(c.sickness) : null,
    activeConversationIdsJson: JSON.stringify(c.activeConversationIds),
    speakingStyle: c.speakingStyle ?? null,
    biography: c.biography,
    origin: c.origin,
    locationId: c.locationId,
    personalityJson: JSON.stringify(c.personality),
    vitalsJson: JSON.stringify(c.vitals),
    emotionJson: JSON.stringify(c.emotion),
    abilitiesJson: JSON.stringify(c.abilities),
    shortMemoryJson: JSON.stringify(c.shortMemory),
    dailyMemoryJson: JSON.stringify(c.dailyMemory),
    longMemoryJson: JSON.stringify(c.longMemory),
    impressionBookJson: JSON.stringify(c.impressionBook),
    shortTermGoalJson: c.shortTermGoal ? JSON.stringify(c.shortTermGoal) : null,
    longTermGoalJson: c.longTermGoal ? JSON.stringify(c.longTermGoal) : null,
    liked: c.liked,
    disliked: c.disliked,
    relationsJson: JSON.stringify(c.relations),
    currentActionJson: c.currentAction ? JSON.stringify(c.currentAction) : null,
    lastSleepTick: c.lastSleepTick,
  };
}

export function findCharactersByWorld(worldId: string): Character[] {
  return db.select().from(schema.characters)
    .where(eq(schema.characters.worldId, worldId)).all().map(rowToCharacter);
}

export function updateCharacter(c: Character): void {
  const row = characterToRow(c);
  db.update(schema.characters).set({
    locationId: row.locationId,
    money: row.money,
    incomeLevel: row.incomeLevel,
    expenseExempt: row.expenseExempt,
    vitalsJson: row.vitalsJson,
    emotionJson: row.emotionJson,
    shortMemoryJson: row.shortMemoryJson,
    dailyMemoryJson: row.dailyMemoryJson,
    longMemoryJson: row.longMemoryJson,
    impressionBookJson: row.impressionBookJson,
    shortTermGoalJson: row.shortTermGoalJson,
    longTermGoalJson: row.longTermGoalJson,
    liked: row.liked,
    disliked: row.disliked,
    relationsJson: row.relationsJson,
    activeConversationIdsJson: row.activeConversationIdsJson,
    currentActionJson: row.currentActionJson,
    lastSleepTick: row.lastSleepTick,
    sicknessJson: row.sicknessJson,
    updatedAt: new Date(),
  }).where(eq(schema.characters.id, c.id)).run();
}

export function saveAllCharacters(characters: Character[]): void {
  db.transaction((tx) => {
    for (const c of characters) {
      const row = characterToRow(c);
      tx.update(schema.characters).set({
        locationId: row.locationId,
        money: row.money,
        incomeLevel: row.incomeLevel,
        expenseExempt: row.expenseExempt,
        vitalsJson: row.vitalsJson,
        emotionJson: row.emotionJson,
        shortMemoryJson: row.shortMemoryJson,
        dailyMemoryJson: row.dailyMemoryJson,
        longMemoryJson: row.longMemoryJson,
        impressionBookJson: row.impressionBookJson,
        shortTermGoalJson: row.shortTermGoalJson,
        longTermGoalJson: row.longTermGoalJson,
        liked: row.liked,
        disliked: row.disliked,
        relationsJson: row.relationsJson,
        activeConversationIdsJson: row.activeConversationIdsJson,
        currentActionJson: row.currentActionJson,
        lastSleepTick: row.lastSleepTick,
        sicknessJson: row.sicknessJson,
        updatedAt: new Date(),
      }).where(eq(schema.characters.id, c.id)).run();
    }
  });
}

export function insertCharacter(c: Character): void {
  db.insert(schema.characters).values(characterToRow(c)).run();
}
```

- [ ] **Step 4: 创建 events repository**

`packages/db/src/repository/events.ts`:
```typescript
import { and, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "../client";
import type { WorldEvent } from "@agw/domain";

export function appendEvents(worldId: string, events: WorldEvent[]): void {
  if (events.length === 0) return;
  db.transaction((tx) => {
    for (const ev of events) {
      tx.insert(schema.eventsLog).values({
        id: ev.id,
        worldId,
        tick: ev.tick,
        payloadJson: JSON.stringify(ev),
        createdAt: new Date(),
      }).onConflictDoUpdate({
        target: schema.eventsLog.id,
        set: { tick: ev.tick, payloadJson: JSON.stringify(ev) },
      }).run();
    }
  });
}

export function findEventsSince(worldId: string, sinceTick: number): WorldEvent[] {
  return db.select().from(schema.eventsLog)
    .where(and(eq(schema.eventsLog.worldId, worldId), gte(schema.eventsLog.tick, sinceTick)))
    .orderBy(desc(schema.eventsLog.tick))
    .all()
    .map((r) => JSON.parse(r.payloadJson) as WorldEvent);
}
```

- [ ] **Step 5a: 创建 thoughts repository**

`packages/db/src/repository/thoughts.ts`:
```typescript
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db, schema } from "../client";
import type { Action, AgentThought } from "@agw/domain";

export function appendThoughts(
  worldId: string,
  entries: Array<{ characterId: string; tick: number; action: Action; success: boolean }>,
): void {
  if (entries.length === 0) return;
  db.transaction((tx) => {
    for (const e of entries) {
      tx.insert(schema.agentThoughts).values({
        worldId, characterId: e.characterId, tick: e.tick,
        actionJson: JSON.stringify(e.action), success: e.success,
      }).onConflictDoUpdate({
        target: [schema.agentThoughts.worldId, schema.agentThoughts.characterId, schema.agentThoughts.tick],
        set: { actionJson: JSON.stringify(e.action), success: e.success },
      }).run();
    }
  });
}

export function findRecentThoughts(worldId: string, characterId: string, sinceTick: number): AgentThought[] {
  return db.select().from(schema.agentThoughts)
    .where(and(eq(schema.agentThoughts.worldId, worldId), eq(schema.agentThoughts.characterId, characterId), gte(schema.agentThoughts.tick, sinceTick)))
    .orderBy(desc(schema.agentThoughts.tick)).all()
    .map((r) => ({ worldId: r.worldId, characterId: r.characterId, tick: r.tick, action: JSON.parse(r.actionJson) as Action, success: !!r.success, createdAt: r.createdAt.getTime() }));
}

export function findLatestThoughts(worldId: string, characterIds: string[]): Map<string, AgentThought> {
  if (characterIds.length === 0) return new Map();
  const rows = db.select().from(schema.agentThoughts)
    .where(and(eq(schema.agentThoughts.worldId, worldId), inArray(schema.agentThoughts.characterId, characterIds)))
    .orderBy(desc(schema.agentThoughts.tick)).all();
  const out = new Map<string, AgentThought>();
  for (const r of rows) {
    if (out.has(r.characterId)) continue;
    out.set(r.characterId, { worldId: r.worldId, characterId: r.characterId, tick: r.tick, action: JSON.parse(r.actionJson) as Action, success: !!r.success, createdAt: r.createdAt.getTime() });
  }
  return out;
}
```

- [ ] **Step 5b: 创建 snapshots repository**

`packages/db/src/repository/snapshots.ts`:
```typescript
import { randomUUID } from "node:crypto";
import { db, schema } from "../client";
import type { WorldSnapshot } from "@agw/domain";
import { findEventsSince } from "./events";

export function insertSnapshot(snapshot: WorldSnapshot): void {
  db.insert(schema.snapshots).values({
    id: `snap-${snapshot.worldId}-${snapshot.tick}-${randomUUID().slice(0, 8)}`,
    worldId: snapshot.worldId, tick: snapshot.tick,
    payloadJson: JSON.stringify(snapshot),
  }).run();
}

export function createSnapshot(worldId: string, tick: number, epoch: number, nodes: any[], characters: any[]): void {
  const recentEvents = findEventsSince(worldId, Math.max(0, tick - 24));
  insertSnapshot({ worldId, tick, epoch, nodes, characters, recentEvents });
}
```

- [ ] **Step 5c: 创建 conversations repository**

`packages/db/src/repository/conversations.ts`:
```typescript
import { and, eq } from "drizzle-orm";
import { db, schema } from "../client";
import type { Conversation } from "@agw/domain";

export function findConversations(worldId: string): Conversation[] {
  return db.select().from(schema.conversations)
    .where(eq(schema.conversations.worldId, worldId)).all()
    .map((r) => JSON.parse(r.payloadJson) as Conversation);
}

export function upsertConversation(conv: Conversation): void {
  db.insert(schema.conversations).values({
    id: conv.id, worldId: conv.worldId,
    payloadJson: JSON.stringify(conv),
    createdAt: new Date(), updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [schema.conversations.worldId, schema.conversations.id],
    set: { payloadJson: JSON.stringify(conv), updatedAt: new Date() },
  }).run();
}

export function deleteConversation(worldId: string, id: string): void {
  db.delete(schema.conversations)
    .where(and(eq(schema.conversations.worldId, worldId), eq(schema.conversations.id, id))).run();
}
```

- [ ] **Step 5d: 创建 think-sessions, notebook-entries, transactions repositories**

剩余 3 个 repository 文件遵循相同 JSON payload 模式（从 `src/engine/store.ts` 和 `src/engine/notebook.ts` 提取对应的 DB 操作）：

- `think-sessions.ts` — `findThinkSessions()`, `upsertThinkSession()`, `deleteThinkSession()`
- `notebook-entries.ts` — `findNotebookEntries()`, `upsertNotebookEntry()`, `deleteNotebookEntry()`, `deleteExpiredNotebookEntries()`
- `transactions.ts` — `insertTransaction()`, `findTransactionsByCharacter()`

- [ ] **Step 6: 更新 barrel 导出**

`packages/db/src/index.ts`:
```typescript
export { db, schema } from "./client";
export { migrate } from "./migrate";
export * from "./repository/worlds";
export * from "./repository/nodes";
export * from "./repository/characters";
export * from "./repository/events";
export * from "./repository/thoughts";
export * from "./repository/snapshots";
export * from "./repository/conversations";
export * from "./repository/think-sessions";
export * from "./repository/notebook-entries";
export * from "./repository/transactions";
```

- [ ] **Step 7: 编译验证**

```bash
pnpm install
pnpm --filter @agw/db exec tsc --noEmit
```

- [ ] **Step 8: 提交**

```bash
git add packages/db/src/repository/ packages/db/src/index.ts
git commit -m "feat: add repository layer to @agw/db"
```

---

### Task 8: 使旧代码通过 re-export 使用新 DB 包

**Files:**
- Modify: `src/db/client.ts` → re-export from `@agw/db`
- Modify: `src/engine/store.ts` → use `@agw/db` repositories

- [ ] **Step 1: 更新 src/db/client.ts 为 re-export**

```typescript
// src/db/client.ts — 改为 re-export
export { db, schema } from "@agw/db";
```

- [ ] **Step 2: 更新 src/engine/store.ts import**

将 `store.ts` 中直接使用 drizzle 查询的部分改为调用 `@agw/db` 的 repository 函数。先只改 import 路径：

```typescript
// 旧: import { db, schema } from "@/db/client"
// 新: import { db, schema, findNodesByWorld, findCharactersByWorld, ... } from "@agw/db"
```

`loadWorld` 中的 `db.select().from(schema.nodes)...` 改为 `findNodesByWorld(worldId)`。其余函数类似。

- [ ] **Step 3: 运行全部测试确认不回归**

```bash
pnpm vitest run
```

Expected: 所有现有测试通过。

- [ ] **Step 4: 提交**

```bash
git add src/db/client.ts src/engine/store.ts
git commit -m "refactor: wire @agw/db repositories into store.ts"
```

---

### Task 9: 删除旧 DB 文件中的冗余代码

**Files:**
- Delete: `src/db/schema.ts` (已迁移到 packages/db)
- Delete: `src/db/migrate.ts` (已迁移)
- Delete: `src/db/migrations/` (已迁移)
- Modify: `src/db/client.ts` → 极简 re-export

- [ ] **Step 1: 删除已迁移文件，保留 client.ts 为 re-export**

```bash
rm /Users/arana/Projects/agent-world/src/db/schema.ts
rm /Users/arana/Projects/agent-world/src/db/migrate.ts
rm -rf /Users/arana/Projects/agent-world/src/db/migrations
```

`src/db/client.ts` 保持为:
```typescript
export { db, schema, migrate } from "@agw/db";
```

- [ ] **Step 2: 更新 drizzle.config.ts (root) 指向新路径**

```typescript
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./packages/db/src/schema.ts",
  out: "./packages/db/src/migrations",
  dialect: "sqlite",
  dbCredentials: { url: "./data/agent-world.db" },
});
```

- [ ] **Step 3: 运行测试确认**

```bash
pnpm vitest run
```

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "refactor: remove redundant old db files, delegate to @agw/db"
```

---

## Phase 3: 拆出 systems

### Task 10: 创建 packages/systems 包骨架 + 迁移 vitals-emotion

**Files:**
- Create: `packages/systems/package.json`
- Create: `packages/systems/tsconfig.json`
- Create: `packages/systems/src/index.ts`
- Create: `packages/systems/src/vitals-emotion.ts` (copy from src/engine/vitals-emotion.ts)

- [ ] **Step 1: 创建包结构**

```bash
mkdir -p /Users/arana/Projects/agent-world/packages/systems/src
```

```json
{
  "name": "@agw/systems",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "@agw/domain": "workspace:*",
    "@agw/shared": "workspace:*",
    "@agw/db": "workspace:*"
  }
}
```

- [ ] **Step 2: 复制 vitals-emotion.ts 并修复 import**

```bash
cp /Users/arana/Projects/agent-world/src/engine/vitals-emotion.ts /Users/arana/Projects/agent-world/packages/systems/src/vitals-emotion.ts
```

检查 `vitals-emotion.ts` 的 import：
- `@/domain/enums` → `@agw/domain`
- `@/domain/types` → `@agw/domain`
- 确认无 LLM 相关 import

- [ ] **Step 3: 同时复制测试文件**

```bash
cp /Users/arana/Projects/agent-world/src/engine/vitals-emotion.test.ts /Users/arana/Projects/agent-world/packages/systems/src/vitals-emotion.test.ts
```

修复测试中的 import 路径。

- [ ] **Step 4: 更新旧路径为 re-export**

`src/engine/vitals-emotion.ts`:
```typescript
export * from "@agw/systems/vitals-emotion";
```

Wait — 直接 re-export 会有 barrel 循环问题。先用更精确的方式：

```typescript
export {
  decayVitals,
  evolveEmotions,
  checkSickness,
  clamp,
} from "@agw/systems";
```

（确保 `@agw/systems` barrel 导出了这些函数。）

- [ ] **Step 5: 运行测试**

```bash
pnpm install
pnpm vitest run
```

- [ ] **Step 6: 提交**

```bash
git add packages/systems/ src/engine/vitals-emotion.ts
git commit -m "feat: add @agw/systems with vitals-emotion migration"
```

---

### Task 11: 迁移 pathfinding + perception

**Files:**
- Create: `packages/systems/src/pathfinding.ts` (copy from src/engine/pathfinding.ts)
- Create: `packages/systems/src/perception.ts` (copy from src/engine/perception.ts)

每个 systems 文件迁移遵循相同模式：复制文件 → 修复 import (`@/domain/*` → `@agw/domain`) → 旧路径改 re-export → 运行测试 → 提交。

- [ ] **Step 1: 复制文件并修复 import**

```bash
cp /Users/arana/Projects/agent-world/src/engine/pathfinding.ts /Users/arana/Projects/agent-world/packages/systems/src/pathfinding.ts
cp /Users/arana/Projects/agent-world/src/engine/perception.ts /Users/arana/Projects/agent-world/packages/systems/src/perception.ts
```

修复 `pathfinding.ts` 中 `@/domain/types` → `@agw/domain`，`perception.ts` 中 `@/domain/types` 和 `@/domain/enums` → `@agw/domain`。

- [ ] **Step 2: 旧路径改 re-export**

`src/engine/pathfinding.ts`:
```typescript
export { findPath } from "@agw/systems";
```

`src/engine/perception.ts`:
```typescript
export { dispatchPerception } from "@agw/systems";
```

- [ ] **Step 3: 更新 barrel 并运行测试**

```bash
pnpm vitest run
```

- [ ] **Step 4: 提交**

```bash
git add packages/systems/src/pathfinding.ts packages/systems/src/perception.ts src/engine/pathfinding.ts src/engine/perception.ts packages/systems/src/index.ts
git commit -m "feat: migrate pathfinding and perception to @agw/systems"
```

---

### Task 12: 迁移 economy + bme

- [ ] **Step 1: 复制文件并修复 import**

```bash
cp /Users/arana/Projects/agent-world/src/engine/economy.ts /Users/arana/Projects/agent-world/packages/systems/src/economy.ts
cp /Users/arana/Projects/agent-world/src/engine/bme.ts /Users/arana/Projects/agent-world/packages/systems/src/bme.ts
```

- [ ] **Step 2: 旧路径改 re-export**

- [ ] **Step 3: 更新 barrel，运行测试，提交**

---

### Task 13: 迁移 facts + layout

- [ ] **Step 1: 复制文件 + 测试**

```bash
cp /Users/arana/Projects/agent-world/src/engine/facts.ts /Users/arana/Projects/agent-world/packages/systems/src/facts.ts
cp /Users/arana/Projects/agent-world/src/engine/facts.test.ts /Users/arana/Projects/agent-world/packages/systems/src/facts.test.ts
cp /Users/arana/Projects/agent-world/src/engine/layout.ts /Users/arana/Projects/agent-world/packages/systems/src/layout.ts
cp /Users/arana/Projects/agent-world/src/engine/layout-types.ts /Users/arana/Projects/agent-world/packages/systems/src/layout-types.ts
cp /Users/arana/Projects/agent-world/src/engine/layout.test.ts /Users/arana/Projects/agent-world/packages/systems/src/layout.test.ts
```

- [ ] **Step 2: 修复 import，旧路径改 re-export**

- [ ] **Step 3: 运行测试，更新 barrel，提交**

---

### Task 14: 迁移 actions + actions-builtin + execute + events-builtin

- [ ] **Step 1: 复制文件 + 测试**

```bash
cp /Users/arana/Projects/agent-world/src/engine/actions.ts /Users/arana/Projects/agent-world/packages/systems/src/actions.ts
cp /Users/arana/Projects/agent-world/src/engine/actions-builtin.ts /Users/arana/Projects/agent-world/packages/systems/src/actions-builtin.ts
cp /Users/arana/Projects/agent-world/src/engine/execute.ts /Users/arana/Projects/agent-world/packages/systems/src/execute.ts
cp /Users/arana/Projects/agent-world/src/engine/events-builtin.ts /Users/arana/Projects/agent-world/packages/systems/src/events-builtin.ts
```

重点：`actions-builtin.ts` 依赖 `ActionRegistry` 单例来自 `@agw/domain`，`execute.ts` 中 `applyStateChange()` 确认无 LLM 调用。

- [ ] **Step 2: 修复 import**

`actions.ts` 中的 `@/domain/action-system` → `@agw/domain`，`@/engine/facts` → `./facts`。

- [ ] **Step 3: 旧路径改 re-export，更新 barrel，运行测试，提交**

---

### Task 15: 迁移 notebook

- [ ] **Step 1: 复制文件 + 测试**

```bash
cp /Users/arana/Projects/agent-world/src/engine/notebook.ts /Users/arana/Projects/agent-world/packages/systems/src/notebook.ts
cp /Users/arana/Projects/agent-world/src/engine/notebook.test.ts /Users/arana/Projects/agent-world/packages/systems/src/notebook.test.ts
```

- [ ] **Step 2: DB 操作改为调用 @agw/db repository**

`notebook.ts` 中直接操作 drizzle 的部分改为调用 `@agw/db` 的 `findNotebookEntries`, `upsertNotebookEntry`, `deleteNotebookEntry`, `deleteExpiredNotebookEntries`。

- [ ] **Step 3: 旧路径改 re-export，更新 barrel，运行测试，提交**

---

### Task 16: 迁移 memory-compression（依赖反转）

- [ ] **Step 1: 复制文件 + 测试**

```bash
cp /Users/arana/Projects/agent-world/src/engine/memory-compression.ts /Users/arana/Projects/agent-world/packages/systems/src/memory-compression.ts
cp /Users/arana/Projects/agent-world/src/engine/memory-compression.test.ts /Users/arana/Projects/agent-world/packages/systems/src/memory-compression.test.ts
```

- [ ] **Step 2: 引入 CompressionCallbacks 接口（依赖反转）**

```typescript
// packages/systems/src/memory-compression.ts
import type { Character, Memory } from "@agw/domain";

export interface CompressionCallbacks {
  compressShortToDaily: (character: Character, memories: Memory[], tick: number, epoch: number, language: string) => Promise<Memory[]>;
  compressDailyToWeekly: (character: Character, memories: Memory[], language: string) => Promise<Memory[]>;
}

export async function compressSleepMemories(
  character: Character,
  tick: number,
  epoch: number,
  language: string,
  callbacks: CompressionCallbacks,
): Promise<void> {
  const awakeSince = character.lastSleepTick;
  const awakeMemories = character.shortMemory.filter((m) => m.tick >= awakeSince);
  // 压缩策略逻辑：何时触发、压缩哪些 memory
  if (awakeMemories.length >= 10) {
    const compressed = await callbacks.compressShortToDaily(character, awakeMemories, tick, epoch, language);
    character.dailyMemory.push(...compressed);
    if (character.dailyMemory.length > 50) character.dailyMemory.splice(0, character.dailyMemory.length - 50);
  }
  if (character.dailyMemory.length >= 7) {
    const weekly = await callbacks.compressDailyToWeekly(character, character.dailyMemory.slice(-7), language);
    character.longMemory.push(...weekly);
    character.dailyMemory = [];
  }
  character.lastSleepTick = tick;
}
```

`@agw/llm` 将在 Task 21 中实现 `CompressionCallbacks`。

- [ ] **Step 3: 旧路径改 re-export，更新 barrel，运行测试，提交**

---

### Task 17: 迁移 store + config + addCharacter + createWorld

- [ ] **Step 1: 迁移 config/ 目录**

```bash
mkdir -p /Users/arana/Projects/agent-world/packages/systems/src/config
cp /Users/arana/Projects/agent-world/src/config/*.ts /Users/arana/Projects/agent-world/packages/systems/src/config/
```

修复 import：`@/domain/types` → `@agw/domain`，`@/domain/enums` → `@agw/domain`。

- [ ] **Step 2: 迁移 store.ts → 重构使用 @agw/db repositories**

```bash
cp /Users/arana/Projects/agent-world/src/engine/store.ts /Users/arana/Projects/agent-world/packages/systems/src/store.ts
```

`store.ts` 中的 `loadWorld` 改为委托 `@agw/db` 的 `getWorldOrThrow`, `findNodesByWorld`, `findCharactersByWorld`。`saveWorld` 改为委托 `saveAllCharacters` + `updateWorldTick`。`appendEventsLog` 改为委托 `appendEvents`。

- [ ] **Step 3: 迁移 addCharacter.ts + createWorld.ts**

```bash
cp /Users/arana/Projects/agent-world/src/engine/addCharacter.ts /Users/arana/Projects/agent-world/packages/systems/src/addCharacter.ts
cp /Users/arana/Projects/agent-world/src/engine/createWorld.ts /Users/arana/Projects/agent-world/packages/systems/src/createWorld.ts
```

- [ ] **Step 4: 提取 manageRelations 到 systems**

从 `src/engine/tick.ts:1240-1291` 提取 `manageRelations` 和 `ensureAcquaintance` 函数到 `packages/systems/src/relations.ts`。这是纯规则逻辑（遍历同节点角色、检查互动事件、建立 acquaintances），不依赖 LLM。

- [ ] **Step 5: 旧路径改 re-export，更新 barrel，运行测试，提交**

---

## Phase 4: 拆出 llm

### Task 18: 创建 packages/llm 包骨架 + 迁移 prompt

**Files:**
- Create: `packages/llm/package.json`
- Create: `packages/llm/tsconfig.json`
- Create: `packages/llm/src/index.ts`
- Create: `packages/llm/src/prompt.ts` (copy from src/llm/prompt.ts)
- Create: `packages/llm/src/client.ts` (copy from src/llm/client.ts)
- Create: `packages/llm/src/providers.ts` (copy from src/llm/providers.ts)

- [ ] **Step 1: 创建包结构**

```bash
mkdir -p /Users/arana/Projects/agent-world/packages/llm/src
```

```json
{
  "name": "@agw/llm",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "dependencies": {
    "@agw/domain": "workspace:*",
    "@agw/shared": "workspace:*",
    "@agw/systems": "workspace:*",
    "openai": "^6.35.0",
    "zod": "^4.4.1"
  }
}
```

- [ ] **Step 2: 迁移 client + providers + prompt**

```bash
cp /Users/arana/Projects/agent-world/src/llm/client.ts /Users/arana/Projects/agent-world/packages/llm/src/client.ts
cp /Users/arana/Projects/agent-world/src/llm/providers.ts /Users/arana/Projects/agent-world/packages/llm/src/providers.ts
cp /Users/arana/Projects/agent-world/src/llm/prompt.ts /Users/arana/Projects/agent-world/packages/llm/src/prompt.ts
cp /Users/arana/Projects/agent-world/src/llm/prompt.test.ts /Users/arana/Projects/agent-world/packages/llm/src/prompt.test.ts
```

修复 import：
- `@/domain/*` → `@agw/domain`
- `@/llm/*` → 相对路径 `./`
- `@/engine/actions` → `@agw/systems`
- `@/engine/facts` → `@agw/systems`
- `@/config/types` → `@agw/systems` (config types 在 systems 中)
- `@/engine/notebook` → `@agw/systems`

- [ ] **Step 3: 旧路径改 re-export**

`src/llm/prompt.ts`:
```typescript
export { buildSystemPrompt, buildUserPrompt, ... } from "@agw/llm";
```

- [ ] **Step 4: 运行测试**

```bash
pnpm install
pnpm vitest run
```

- [ ] **Step 5: 提交**

```bash
git add packages/llm/ src/llm/prompt.ts src/llm/client.ts src/llm/providers.ts
git commit -m "feat: add @agw/llm with prompt, client, providers"
```

---

### Task 19: 迁移 decide.ts

- [ ] **Step 1: 复制并修复 import**

```bash
cp /Users/arana/Projects/agent-world/src/llm/decide.ts /Users/arana/Projects/agent-world/packages/llm/src/decide.ts
cp /Users/arana/Projects/agent-world/src/llm/decide.test.ts /Users/arana/Projects/agent-world/packages/llm/src/decide.test.ts
```

修复所有 `@/` import → `@agw/` 或相对路径。

- [ ] **Step 2: 旧路径改 re-export**

- [ ] **Step 3: 运行测试 → 提交**

---

### Task 20: 迁移 dialog.ts

从 `src/engine/dialog.ts` 复制到 `packages/llm/src/dialog.ts`。

- 这是最大的单文件迁移（1120 行）
- `runDialogPhase` 及其内部所有 LLM 调用函数移到 `@agw/llm`
- 旧路径 `src/engine/dialog.ts` 改为 re-export

复制测试：`dialog.test.ts`, `dialog-give.test.ts`

---

### Task 21: 迁移 think-sessions.ts + memory-compression-llm.ts

- `src/engine/think-sessions.ts` → `packages/llm/src/think-sessions.ts`
- `src/engine/memory-compression.ts` 中的 LLM 调用部分 → `packages/llm/src/memory-compression-llm.ts`

---

## Phase 5: 建立 server 编排层

### Task 22: 编写 apps/server/src/tick.ts（薄编排层）

**Files:**
- Create: `apps/server/src/tick.ts`
- Modify: `apps/server/src/index.ts` (add tick route)

- [ ] **Step 1: 编写完整 tick 编排函数**

从 `src/engine/tick.ts` 参考完整逻辑，编写薄编排层 `apps/server/src/tick.ts`（~200 行）。
核心结构——系统调用 (systems) 和 LLM 调用 (llm) 严格分离：

```typescript
// apps/server/src/tick.ts
import {
  decayVitals, evolveEmotions, checkSickness,
  dispatchPerception, buildActionContext, getAvailableActions,
  executeActions, deriveAggregatedFacts,
  manageRelations,
} from "@agw/systems";
import { compressSleepMemories, type CompressionCallbacks } from "@agw/systems";
import { updateAllEconomicSnapshots } from "@agw/systems";
import { loadManifest, loadEconomyConfig, loadAllCharacters } from "@agw/systems/config";
import { loadEvents, getActiveEvents } from "@agw/systems/config";
import {
  llmDecide, llmAcceptDecide, llmDialogTurn,
  llmDialogSummarize, llmDialogPersonalMemory, llmSalvageDecide,
  llmThink, runDialogPhase, compressShortToDaily, compressDailyToWeekly,
} from "@agw/llm";
import {
  getWorldOrThrow, findNodesByWorld, findCharactersByWorld,
  saveAllCharacters, appendEvents, findEventsSince, updateWorldTick,
  findRecentThoughts, appendThoughts, insertSnapshot,
  findConversations, upsertConversation, deleteConversation,
  findThinkSessions, upsertThinkSession, deleteThinkSession,
} from "@agw/db";
import type { WorldEvent, Action, Character, Conversation, ThinkSession } from "@agw/domain";
import { actionRegistry, TICKS_PER_HOUR } from "@agw/domain";
import { createLogger } from "@agw/shared";

const log = createLogger("tick");

export async function tick(worldId: string, options: {
  onCharacterDecision?: (data: { characterId: string; characterName: string; action: Action }) => void;
} = {}) {
  const world = getWorldOrThrow(worldId);
  const nodes = findNodesByWorld(worldId);
  const characters = findCharactersByWorld(worldId);
  const fromTick = world.currentTick;
  const allEvents: WorldEvent[] = [];

  // ── Phase 1: Vitals + Emotion (systems only) ──
  allEvents.push(...decayVitals({ characters, worldId, tick: fromTick }));
  if (fromTick % 120 === 0) allEvents.push(...checkSickness({ characters, worldId, tick: fromTick }));
  allEvents.push(...evolveEmotions({ characters, worldId, tick: fromTick }));

  // ── Phase 2: Perception (systems only) ──
  const perceptions = dispatchPerception(nodes, characters, allEvents);

  // ── Phase 3: Character Decisions (llm, parallel) ──
  const locationSnapshot = new Map(characters.map(c => [c.id, c.locationId]));
  const decisions = await Promise.all(characters.map(async (c) => {
    const ctx = buildActionContext(c, nodes, characters, worldId, fromTick, world.epoch, false, {} as any, locationSnapshot);
    const opts = getAvailableActions(ctx);
    let action: Action;
    try {
      action = await llmDecide({ character: c, nodes, here: ctx.here, companions: ctx.companions, reachable: ctx.reachable, perceived: perceptions.get(c.id) ?? [], options: opts, worldName: world.name, tick: fromTick, epoch: world.epoch, facts: ctx.facts, language: "zh", ctx, allCharacters: characters, activeEventDefs: [], upcomingNotebookText: "" });
    } catch (err) {
      action = { type: "look_around", actorId: c.id, reasoning: `LLM 调用失败：${err}`, selfImportance: 1 };
    }
    options.onCharacterDecision?.({ characterId: c.id, characterName: c.name, action });
    return { action, finalLocationId: c.locationId };
  }));

  // ── Phase 4: Dialog + Think (llm) ──
  const conversations = findConversations(worldId);
  const thinkSessions = findThinkSessions(worldId);
  const actionsForExecution = decisions.map(d => d.action);

  const [updatedThinkSessions, dialogResult] = await Promise.all([
    processThinkSessions(thinkSessions, characters, nodes, fromTick, world.epoch),
    runDialogPhase({ /* ... pass llm callbacks and context ... */ } as any),
  ]);

  // ── Phase 5: Execute (systems only) ──
  const execResult = executeActions({ worldId, tick: fromTick, epoch: world.epoch, characters, nodes, actions: actionsForExecution });
  allEvents.push(...execResult.events);

  // ── Phase 6: Relations + Economy + Memory Compression (systems + llm callbacks) ──
  manageRelations(characters, fromTick, allEvents);
  if (world.currentTick % (24 * TICKS_PER_HOUR) === 0) {
    updateAllEconomicSnapshots(worldId, world.currentTick, characters, loadEconomyConfig(world.mapId));
  }
  const compressionCallbacks: CompressionCallbacks = { compressShortToDaily, compressDailyToWeekly };
  await Promise.all(
    actionsForExecution.filter(a => a.type === "sleep").map(a => {
      const c = characters.find(ch => ch.id === a.actorId);
      return c ? compressSleepMemories(c, fromTick, world.epoch, "zh", compressionCallbacks) : Promise.resolve();
    }),
  );

  // ── Phase 7: Persist (db) ──
  appendEvents(worldId, allEvents);
  saveAllCharacters(characters);
  updateWorldTick(worldId, fromTick + 1);
  appendThoughts(worldId, execResult.resolvedActions.map(r => ({
    characterId: r.action.actorId, tick: fromTick, action: r.action, success: r.success,
  })));

  return { worldId, fromTick, toTick: fromTick + 1, events: allEvents, decisions };
}
```


- [ ] **Step 2: 在 Fastify 中注册 tick 端点**

`apps/server/src/index.ts` 追加：
```typescript
import { tick } from "./tick";

app.post("/api/worlds/:id/tick", async (req, reply) => {
  const { id } = req.params as { id: string };
  const result = await tick(id);
  return result;
});
```

- [ ] **Step 3: 验证端点**

```bash
pnpm --filter @agw/server dev &
sleep 2
curl -X POST http://localhost:3001/api/worlds/test-world/tick
kill %1
```

- [ ] **Step 4: 提交**

---

### Task 23: 迁移 API routes 到 Fastify

**Files:**
- Create: `apps/server/src/routes/worlds.ts`
- Create: `apps/server/src/routes/characters.ts`
- Create: `apps/server/src/routes/configs.ts`
- Create: `apps/server/src/routes/admin.ts`
- Modify: `apps/server/src/index.ts` (register route plugins)

- [ ] **Step 1-4: 逐个创建 route 文件**

每个 route 文件对应一组 API 端点。从 `src/app/api/` 中的每个 `route.ts` 提取 handler 逻辑，改造为 Fastify route handler。

模式：
```typescript
// apps/server/src/routes/worlds.ts
import type { FastifyInstance } from "fastify";
import { listWorlds, getWorldOrThrow, findNodesByWorld, findCharactersByWorld } from "@agw/db";

export async function worldRoutes(app: FastifyInstance) {
  app.get("/api/worlds", async () => {
    return listWorlds();
  });

  app.get("/api/worlds/:id", async (req) => {
    const { id } = req.params as { id: string };
    const world = getWorldOrThrow(id);
    const nodes = findNodesByWorld(id);
    const characters = findCharactersByWorld(id);
    return { world, nodes, characters };
  });

  // ... 其余端点
}
```

- [ ] **Step 5: 更新 vitest.config 添加 API 测试路径**

- [ ] **Step 6: 提交**

---

### Task 24: SSE 推送端点

**Files:**
- Create: `apps/server/src/sse.ts`
- Modify: `apps/server/src/routes/worlds.ts` (update tick endpoint to use SSE)

- [ ] **Step 1: 改造 tick 端点为 SSE 流**

```typescript
// apps/server/src/routes/worlds.ts (tick endpoint with SSE)
app.post("/api/worlds/:id/tick", async (req, reply) => {
  const { id } = req.params as { id: string };

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const result = await tick(id, {
    onCharacterDecision: (data) => {
      reply.raw.write(`event: decision\ndata: ${JSON.stringify(data)}\n\n`);
    },
  });

  reply.raw.write(`event: tick-complete\ndata: ${JSON.stringify({
    fromTick: result.fromTick,
    toTick: result.toTick,
    events: result.events,
  })}\n\n`);
  reply.raw.end();
});
```

- [ ] **Step 2: 验证 SSE 流**

```bash
curl -N -X POST http://localhost:3001/api/worlds/test-world/tick
```

Expected: 看到 `event: decision` 和 `event: tick-complete` 流式输出。

- [ ] **Step 3: 提交**

---

## Phase 6: 清理

### Task 25: 删除 web 中的 API routes

**Files:**
- Delete: `src/app/api/` (entire directory)

- [ ] **Step 1: 删除 API routes 目录**

```bash
rm -rf /Users/arana/Projects/agent-world/src/app/api
```

- [ ] **Step 2: 更新 _lib/api.ts 指向 Fastify**

`src/app/_lib/api.ts` 中的 fetch URL 改为 `http://localhost:3001/api/...`（开发环境）或使用环境变量 `NEXT_PUBLIC_API_URL`。

- [ ] **Step 3: 配置 Next.js rewrites 代理 API 请求（开发环境）**

`next.config.ts`:
```typescript
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3001/api/:path*",
      },
    ];
  },
};
export default nextConfig;
```

- [ ] **Step 4: 验证前端可正常工作**

```bash
pnpm --filter @agw/server dev &
pnpm --filter @agw/web dev &
sleep 5
curl -s http://localhost:3000 | head -5
kill %1 %2
```

- [ ] **Step 5: 提交**

---

### Task 26: 删除旧冗余代码，统一 tsconfig

**Files:**
- Delete: `src/engine/` (除保留 re-export 的文件外全部删除)
- Delete: `src/llm/` (全部删除，已迁移到 @agw/llm)
- Delete: `src/db/` (全部删除，已迁移到 @agw/db)
- Delete: `src/domain/` (全部删除，已迁移到 @agw/domain)
- Delete: `src/util/` (全部删除，已迁移到 @agw/shared)
- Delete: `src/config/` (全部删除，已迁移到 @agw/systems)
- Modify: `tsconfig.json` (简化 paths)
- Modify: `vitest.config.ts` (更新 resolve aliases)

- [ ] **Step 1: 删除旧源代码目录**

```bash
rm -rf /Users/arana/Projects/agent-world/src/engine
rm -rf /Users/arana/Projects/agent-world/src/llm
rm -rf /Users/arana/Projects/agent-world/src/db
rm -rf /Users/arana/Projects/agent-world/src/domain
rm -rf /Users/arana/Projects/agent-world/src/util
rm -rf /Users/arana/Projects/agent-world/src/config
```

- [ ] **Step 2: 更新 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: 更新 vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    env: { TZ: "UTC" },
  },
});
```

- [ ] **Step 4: 更新 package.json scripts**

```json
{
  "scripts": {
    "dev": "pnpm --filter @agw/server dev & pnpm --filter @agw/web dev",
    "dev:server": "pnpm --filter @agw/server dev",
    "dev:web": "pnpm --filter @agw/web dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "pnpm --filter @agw/db db:migrate",
    "seed": "tsx scripts/seed.ts"
  }
}
```

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "refactor: remove old source dirs, unify tsconfig and vitest config"
```

---

### Task 27: 最终验证

- [ ] **Step 1: 全量测试**

```bash
pnpm install
pnpm test
```

Expected: 所有测试通过。

- [ ] **Step 2: TypeScript 编译检查**

```bash
pnpm --filter @agw/domain exec tsc --noEmit
pnpm --filter @agw/shared exec tsc --noEmit
pnpm --filter @agw/db exec tsc --noEmit
pnpm --filter @agw/systems exec tsc --noEmit
pnpm --filter @agw/llm exec tsc --noEmit
pnpm --filter @agw/server exec tsc --noEmit
```

Expected: 所有包无类型错误。

- [ ] **Step 3: 前端构建验证**

```bash
pnpm --filter @agw/web build
```

Expected: Next.js 构建成功。

- [ ] **Step 4: 端到端验证**

```bash
pnpm --filter @agw/server dev &
pnpm --filter @agw/web dev &
sleep 5
# 验证健康检查
curl http://localhost:3001/api/health
# 验证前端页面
curl -s http://localhost:3000 | grep -o '<title>.*</title>'
kill %1 %2
```

- [ ] **Step 5: 提交最终 lockfile**

```bash
git add pnpm-lock.yaml
git commit -m "chore: final lockfile update after refactoring"
```
