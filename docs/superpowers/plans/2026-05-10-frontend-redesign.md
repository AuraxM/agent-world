# 前端重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构前端入口为 CoverPage → HubLayout（Mod Gallery / Worlds Panel / LLM Config），解耦后端 1 mod = 1 world 限制。

**Architecture:** react-router-dom v7 三层嵌套路由。HubLayout 为 56px 左侧图标导航 + `<Outlet />` 内容区。世界管理双栏（左 Mod 列表 → 右实例列表）。Dashboard 改从 route param 取 world ID。后端 `POST /api/worlds` 已支持自定义 worldId，仅需加 `?mapId` 查询过滤和 maps 端点补字段。

**Tech Stack:** React 19, react-router-dom 7, Tailwind v4, Fastify, Drizzle ORM, SQLite

---

### Task 1: Backend — Maps 端点补字段 + Worlds 端点加 mapId 过滤

**Files:**
- Modify: `backend/src/server/routes/config.ts:29-55`
- Modify: `backend/src/server/routes/worlds.ts:41-64`

- [ ] **Step 1: 给 `GET /api/configs/maps` 加 `language` 和 `characterCount` 字段**

打开 `backend/src/server/routes/config.ts`，找到 `GET /maps` handler（约第 30 行），在 `return` 之前加上 `language` 和 `characterCount` 字段：

```ts
// GET /maps — list available maps
app.get("/maps", async (_req, reply) => {
  try {
    const maps = loadAllMaps().map((m) => {
      let name = m.id;
      let description = "";
      let language = "zh";
      let characterCount = 0;
      try {
        const manifest = loadManifest(m.id);
        name = manifest.name;
        description = manifest.description ?? "";
        language = manifest.language ?? "zh";
        const chars = loadCharactersForMap(m.id);
        characterCount = chars.length;
      } catch { /* use id as name */ }
      return {
        id: m.id,
        name,
        description,
        language,
        characterCount,
        nodeCount: m.nodes.length,
        entries: m.nodes
          .filter((n) => n.isEntry)
          .map((n) => ({ id: n.id, name: n.name })),
      };
    });
    return reply.send({ maps });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return reply.status(500).send({ error: message });
  }
});
```

需要加 import `loadCharactersForMap`：
```ts
import { loadAllCharacters, loadAllMaps, loadManifest, loadCharactersForMap } from "../../config/index";
```

- [ ] **Step 2: 给 `GET /api/worlds` 加 optional `?mapId=` query filter**

打开 `backend/src/server/routes/worlds.ts`，修改 `GET /` handler：

```ts
// GET / — list worlds
app.get<{ Querystring: { mapId?: string } }>("/", async (req, reply) => {
  let query = db
    .select({
      id: schema.worlds.id,
      name: schema.worlds.name,
      mapId: schema.worlds.mapId,
      currentTick: schema.worlds.currentTick,
      epoch: schema.worlds.epoch,
      createdAt: schema.worlds.createdAt,
      updatedAt: schema.worlds.updatedAt,
    })
    .from(schema.worlds)
    .orderBy(desc(schema.worlds.updatedAt));

  if (req.query.mapId) {
    query = query.where(eq(schema.worlds.mapId, req.query.mapId));
  }

  const rows = query.all();

  const worlds = rows.map((w) => {
    const charCount = db
      .select()
      .from(schema.characters)
      .where(eq(schema.characters.worldId, w.id))
      .all().length;
    return { ...w, characterCount: charCount };
  });

  return reply.send({ worlds });
});
```

需要加 `Querystring` 类型和 `eq` 已在文件顶部导入（`eq` 来自 drizzle-orm）。

- [ ] **Step 3: 验证后端编译通过**

```bash
cd backend && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/server/routes/config.ts backend/src/server/routes/worlds.ts
git commit -m "feat: add language/characterCount to maps endpoint, add mapId filter to worlds list"
```

---

### Task 2: 前端 — 路由重写 (App.tsx)

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/routes/home.tsx`
- Create: `frontend/src/routes/hub.tsx`
- Create: `frontend/src/routes/world-view.tsx`

- [ ] **Step 1: 创建 WorldView 路由页面**

创建 `frontend/src/routes/world-view.tsx`：

```tsx
import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard";

export default function WorldViewPage() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}
```

- [ ] **Step 2: 创建 HubLayout 路由页面（骨架）**

创建 `frontend/src/routes/hub.tsx`：

```tsx
import { Outlet } from "react-router-dom";
import { HubLayout } from "@/components/hub-layout";

export default function HubPage() {
  return (
    <HubLayout>
      <Outlet />
    </HubLayout>
  );
}
```

- [ ] **Step 3: 重写 App.tsx 路由**

修改 `frontend/src/App.tsx`：

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import CoverPage from "@/routes/cover";
import HubPage from "@/routes/hub";
import ModGallery from "@/routes/mods";
import WorldsPanel from "@/routes/worlds";
import LLMConfig from "@/routes/llm";
import WorldViewPage from "@/routes/world-view";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CoverPage />} />
        <Route path="/hub" element={<HubPage />}>
          <Route index element={<Navigate to="/hub/mods" replace />} />
          <Route path="mods" element={<ModGallery />} />
          <Route path="worlds" element={<WorldsPanel />} />
          <Route path="llm" element={<LLMConfig />} />
        </Route>
        <Route path="/world/:id" element={<WorldViewPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 4: 创建占位路由页面（先确保编译通过）**

创建 `frontend/src/routes/cover.tsx`：

```tsx
export default function CoverPage() {
  return <div>Cover</div>;
}
```

创建 `frontend/src/routes/mods.tsx`：

```tsx
export default function ModGalleryPage() {
  return <div>Mods</div>;
}
```

创建 `frontend/src/routes/worlds.tsx`：

```tsx
export default function WorldsPanelPage() {
  return <div>Worlds</div>;
}
```

创建 `frontend/src/routes/llm.tsx`：

```tsx
export default function LLMConfigPage() {
  return <div>LLM</div>;
}
```

- [ ] **Step 5: 修改 home.tsx 重定向到 /hub/mods**

修改 `frontend/src/routes/home.tsx`（保留文件但改内容，后续可能删除）：

```tsx
import { Navigate } from "react-router-dom";

export default function HomePage() {
  return <Navigate to="/hub/mods" replace />;
}
```

- [ ] **Step 6: 验证前端编译通过**

```bash
cd frontend && pnpm exec tsc --noEmit
```

Expected: no errors. (HubLayout 组件引用会报错 — 正常，下一步创建)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx frontend/src/routes/cover.tsx frontend/src/routes/hub.tsx frontend/src/routes/mods.tsx frontend/src/routes/worlds.tsx frontend/src/routes/llm.tsx frontend/src/routes/world-view.tsx
git commit -m "feat: rewrite routing for cover → hub → world structure"
```

---

### Task 3: 前端 — HubLayout 组件（左导航栏）

**Files:**
- Create: `frontend/src/components/hub-layout.tsx`

- [ ] **Step 1: 创建 HubLayout 组件**

创建 `frontend/src/components/hub-layout.tsx`：

```tsx
import { NavLink, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { to: "/hub/mods", label: "Mods", icon: "🎭" },
  { to: "/hub/worlds", label: "Worlds", icon: "🌍" },
  { to: "/hub/llm", label: "LLM", icon: "⚡" },
] as const;

export function HubLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left sidebar */}
      <nav className="w-14 flex-shrink-0 flex flex-col items-center pt-3 gap-1 bg-(--frame-2) border-r-2 border-(--border)">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            title={item.label}
            className={({ isActive }) =>
              `w-10 h-10 flex items-center justify-center text-lg rounded-md transition-colors ${
                isActive
                  ? "bg-(--frame) border border-(--accent-strong) text-(--accent-strong)"
                  : "text-(--text-on-frame-muted) hover:text-(--text-on-frame) hover:bg-(--frame)"
              }`
            }
          >
            {item.icon}
          </NavLink>
        ))}

        <div className="flex-1" />

        {/* Home / Cover */}
        <button
          type="button"
          title="返回封面"
          onClick={() => navigate("/")}
          className="w-10 h-10 flex items-center justify-center text-base text-(--text-on-frame-muted) hover:text-(--text-on-frame) hover:bg-(--frame) rounded-md mb-3 cursor-pointer transition-colors"
        >
          🏠
        </button>
      </nav>

      {/* Content area */}
      <main className="flex-1 min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译通过**

```bash
cd frontend && pnpm exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/hub-layout.tsx
git commit -m "feat: add HubLayout component with icon sidebar navigation"
```

---

### Task 4: 前端 — CoverPage 封面页

**Files:**
- Modify: `frontend/src/routes/cover.tsx`

- [ ] **Step 1: 实现 CoverPage**

重写 `frontend/src/routes/cover.tsx`：

```tsx
import { useNavigate } from "react-router-dom";

export default function CoverPage() {
  const navigate = useNavigate();

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center relative overflow-hidden bg-black">
      {/* 背景：封面图 */}
      <img
        src="/cover.png"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* 暗色叠加层 */}
      <div className="absolute inset-0 bg-black/30" />

      {/* 内容 */}
      <div className="relative z-10 flex flex-col items-center gap-10">
        <h1
          className="text-pixel-xl tracking-[0.25em]"
          style={{ color: "var(--color-pixel-accent, #c8b898)", textShadow: "0 0 20px rgba(200,184,152,0.3)" }}
        >
          AGENT WORLD
        </h1>

        <button
          type="button"
          onClick={() => navigate("/hub/mods")}
          className="px-12 py-4 text-pixel-lg tracking-[0.2em] cursor-pointer
                     bg-(--frame)/80 border-3 border-(--accent-strong) text-(--accent-strong)
                     hover:bg-(--accent-strong) hover:text-(--frame)
                     transition-colors"
        >
          ENTER WORLD
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译通过**

```bash
cd frontend && pnpm exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/cover.tsx
git commit -m "feat: add CoverPage with pixel art background and Enter World button"
```

---

### Task 5: 前端 — ModGallery + ModCard

**Files:**
- Modify: `frontend/src/routes/mods.tsx`
- Create: `frontend/src/components/mod-card.tsx`

- [ ] **Step 1: 创建 ModCard 组件**

创建 `frontend/src/components/mod-card.tsx`：

```tsx
import { useNavigate } from "react-router-dom";

export interface ModInfo {
  id: string;
  name: string;
  description: string;
  language: string;
  characterCount: number;
}

const LANG_LABEL: Record<string, string> = {
  zh: "中",
  en: "EN",
  ja: "日",
};

export function ModCard({ mod }: { mod: ModInfo }) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(`/hub/worlds?mod=${encodeURIComponent(mod.id)}`)}
      className="relative h-[130px] rounded-md overflow-hidden border-2 border-(--border) cursor-pointer
                 hover:border-(--accent-strong) hover:-translate-y-0.5 hover:shadow-lg
                 transition-all text-left w-full"
    >
      {/* 背景渐变 */}
      <div className="absolute inset-0 bg-linear-to-br from-(--frame) to-(--frame-2)" />

      {/* 左侧毛玻璃遮罩 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[55%] flex flex-col justify-center px-4 py-3
                   bg-(--frame)/70 backdrop-blur-[10px] -webkit-backdrop-blur-[10px]
                   border-r border-(--border)/20"
      >
        <div className="text-(--accent-strong) text-sm font-bold mb-1 truncate">
          {mod.name}
        </div>
        <div className="text-(--text-on-frame-muted) text-[10px] mb-1.5 flex gap-2">
          <span>{LANG_LABEL[mod.language] ?? mod.language}</span>
          <span>{mod.characterCount} 角色</span>
        </div>
        <div className="text-(--text-on-frame) text-[11px] leading-snug line-clamp-2">
          {mod.description}
        </div>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: 实现 ModGallery 路由页面**

重写 `frontend/src/routes/mods.tsx`：

```tsx
import { useEffect, useState } from "react";
import { ModCard, type ModInfo } from "@/components/mod-card";

interface MapsResponse {
  maps: ModInfo[];
}

export default function ModGalleryPage() {
  const [mods, setMods] = useState<ModInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/configs/maps")
      .then((r) => r.json())
      .then((d: MapsResponse) => setMods(d.maps))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b-2 border-(--border)">
        <h2 className="text-(--accent-strong) text-body-lg font-bold">Mod 展示</h2>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="text-(--text-on-frame-muted)">加载中...</div>
        ) : (
          <div className="grid gap-y-16 gap-x-5" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            {mods.map((mod) => (
              <ModCard key={mod.id} mod={mod} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 验证编译通过**

```bash
cd frontend && pnpm exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/mod-card.tsx frontend/src/routes/mods.tsx
git commit -m "feat: add ModGallery with frosted glass mod cards, 4 per row"
```

---

### Task 6: 前端 — WorldsPanel + WorldInstanceCard

**Files:**
- Modify: `frontend/src/routes/worlds.tsx`
- Create: `frontend/src/components/world-instance-card.tsx`

- [ ] **Step 1: 创建 WorldInstanceCard 组件**

创建 `frontend/src/components/world-instance-card.tsx`：

```tsx
import { useNavigate } from "react-router-dom";

export interface WorldInstanceInfo {
  id: string;
  name: string;
  mapId: string;
  currentTick: number;
  characterCount: number;
  updatedAt: number;
}

function statusColor(tick: number): { bg: string; shadow: string; label: string } {
  if (tick > 0) return { bg: "#4caf50", shadow: "0 0 8px #4caf50", label: "运行中" };
  return { bg: "#6a5858", shadow: "none", label: "未启动" };
}

export function WorldInstanceCard({
  world,
  onDelete,
}: {
  world: WorldInstanceInfo;
  onDelete: (id: string) => void;
}) {
  const navigate = useNavigate();
  const status = statusColor(world.currentTick);

  return (
    <div className="flex items-center gap-4 px-5 py-4 bg-(--frame) border-2 border-(--border) rounded-md">
      {/* Status light */}
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: status.bg, boxShadow: status.shadow }}
        title={status.label}
      />

      <div className="flex-1 min-w-0">
        <div className="text-(--text-on-frame) text-sm font-bold mb-0.5 truncate">
          {world.name}
        </div>
        <div className="text-(--text-on-frame-muted) text-[11px]">
          Tick {world.currentTick} · {world.characterCount} 角色
        </div>
      </div>

      <div className="flex gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => navigate(`/world/${world.id}`)}
          className="px-3 py-1.5 text-[11px] cursor-pointer border border-(--accent-strong) text-(--accent-strong)
                     bg-(--frame) hover:bg-(--accent-strong) hover:text-(--frame) rounded transition-colors"
        >
          进入
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(`确定删除世界 "${world.name}"？此操作不可撤销。`)) {
              onDelete(world.id);
            }
          }}
          className="px-3 py-1.5 text-[11px] cursor-pointer border border-(--danger) text-(--danger)
                     bg-(--frame) hover:bg-(--danger) hover:text-white rounded transition-colors"
        >
          删除
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 实现 WorldsPanel 路由页面**

重写 `frontend/src/routes/worlds.tsx`：

```tsx
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { WorldInstanceCard, type WorldInstanceInfo } from "@/components/world-instance-card";
import type { ModInfo } from "@/components/mod-card";

interface MapsResponse { maps: ModInfo[] }
interface WorldsResponse { worlds: WorldInstanceInfo[] }

export default function WorldsPanelPage() {
  const [searchParams] = useSearchParams();
  const selectedModId = searchParams.get("mod") ?? "";

  const [mods, setMods] = useState<ModInfo[]>([]);
  const [worlds, setWorlds] = useState<WorldInstanceInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const loadWorlds = useCallback((mapId?: string) => {
    const url = mapId ? `/api/worlds?mapId=${encodeURIComponent(mapId)}` : "/api/worlds";
    fetch(url)
      .then((r) => r.json())
      .then((d: WorldsResponse) => setWorlds(d.worlds))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/configs/maps")
      .then((r) => r.json())
      .then((d: MapsResponse) => setMods(d.maps))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadWorlds(selectedModId || undefined);
  }, [selectedModId, loadWorlds]);

  const handleDelete = useCallback(
    async (worldId: string) => {
      const res = await fetch(`/api/worlds/${worldId}`, { method: "DELETE" });
      if (res.ok) {
        loadWorlds(selectedModId || undefined);
      } else {
        const body = await res.json().catch(() => ({ error: "删除失败" }));
        alert(body.error ?? "删除失败");
      }
    },
    [loadWorlds, selectedModId],
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b-2 border-(--border)">
        <h2 className="text-(--accent-strong) text-body-lg font-bold">世界实例</h2>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left panel: Mod list */}
        <aside className="w-[280px] flex-shrink-0 border-r-2 border-(--border) bg-(--frame-2) flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-(--border) text-(--text-on-frame-muted) text-[11px] uppercase tracking-wider">
            Mod 列表
          </div>
          <div className="flex-1 overflow-auto">
            {mods.map((mod) => (
              <button
                key={mod.id}
                type="button"
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("mod", mod.id);
                  window.history.replaceState(null, "", url.toString());
                  loadWorlds(mod.id);
                }}
                className={`w-full text-left px-4 py-3.5 border-l-3 cursor-pointer transition-colors ${
                  selectedModId === mod.id
                    ? "border-l-(--accent-strong) bg-(--frame)/50 text-(--accent-strong)"
                    : "border-l-transparent text-(--text-on-frame-muted) hover:text-(--text-on-frame) hover:bg-(--frame)/30"
                }`}
              >
                <div className="text-sm mb-0.5">{mod.name}</div>
                <div className="text-[10px] text-(--text-on-frame-muted)/70">
                  {worlds.filter((w) => w.mapId === mod.id).length} 个实例
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Right panel: World instances */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-5 py-3 border-b border-(--border) flex items-center justify-between">
            <span className="text-(--text-on-frame) text-sm">
              {selectedModId
                ? `${mods.find((m) => m.id === selectedModId)?.name ?? selectedModId} 的世界实例`
                : "选择一个 Mod"}
            </span>
            <button
              type="button"
              className="px-3 py-1.5 text-[11px] cursor-pointer border border-(--accent-strong) text-(--accent-strong)
                         bg-(--frame) hover:bg-(--accent-strong) hover:text-(--frame) rounded transition-colors"
              onClick={() => alert("Todo: 新建世界对话框")}
            >
              + 新建世界
            </button>
          </div>

          <div className="flex-1 overflow-auto p-5">
            {loading ? (
              <div className="text-(--text-on-frame-muted)">加载中...</div>
            ) : worlds.length === 0 ? (
              <div className="text-(--text-on-frame-muted)">暂无世界实例</div>
            ) : (
              <div className="flex flex-col gap-3">
                {worlds.map((w) => (
                  <WorldInstanceCard key={w.id} world={w} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 验证编译通过**

```bash
cd frontend && pnpm exec tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/world-instance-card.tsx frontend/src/routes/worlds.tsx
git commit -m "feat: add WorldsPanel with dual-pane mod list and world instance cards"
```

---

### Task 7: 前端 — LLMConfig

**Files:**
- Modify: `frontend/src/routes/llm.tsx`

- [ ] **Step 1: 实现 LLMConfig 路由页面**

重写 `frontend/src/routes/llm.tsx`：

```tsx
import { useCallback, useEffect, useState } from "react";

interface LLMProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  isActive: boolean;
}

interface EntryConfig {
  entryName: string;
  providerId: string | null;
  thinkingEnabled: boolean;
}

interface ProvidersResponse { providers: LLMProvider[] }
interface EntryConfigsResponse { entryConfigs: EntryConfig[]; defaultProvider: { id: string; name: string; model: string } | null }

const ENTRY_LABELS: Record<string, string> = {
  decide: "主决策",
  salvage: "失败恢复",
  dialog_turn: "对话回合",
  dialog_summarize: "对话摘要",
  dialog_personal_memory: "个人记忆",
  accept_decision: "提案接受",
  character_placement: "角色放置",
  memory_compress: "记忆压缩",
};

export default function LLMConfigPage() {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [entries, setEntries] = useState<EntryConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [pRes, eRes] = await Promise.all([
      fetch("/api/admin/providers"),
      fetch("/api/admin/entry-configs"),
    ]);
    const pData: ProvidersResponse = await pRes.json();
    const eData: EntryConfigsResponse = await eRes.json();
    setProviders(pData.providers);
    setEntries(eData.entryConfigs);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleEntryChange = useCallback(
    (entryName: string, field: "providerId" | "thinkingEnabled", value: string | boolean) => {
      setEntries((prev) =>
        prev.map((e) => (e.entryName === entryName ? { ...e, [field]: value } : e)),
      );
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    await fetch("/api/admin/entry-configs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryConfigs: entries }),
    });
    setSaving(false);
  }, [entries]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b-2 border-(--border)">
        <h2 className="text-(--accent-strong) text-body-lg font-bold">LLM 配置</h2>
      </div>

      <div className="flex-1 overflow-auto p-6 flex flex-col gap-5">
        {loading ? (
          <div className="text-(--text-on-frame-muted)">加载中...</div>
        ) : (
          <>
            {/* Provider 列表 */}
            <section className="pixel-frame">
              <div className="flex items-center justify-between px-4 py-3 border-b border-(--border)">
                <h3 className="text-(--accent-strong) text-sm font-bold">Provider 管理</h3>
              </div>
              <div className="p-1">
                {providers.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-sm hover:bg-(--frame)/50"
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: p.isActive ? "#4caf50" : "#5a4848" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-(--text-on-frame) text-xs font-bold">{p.name}</div>
                      <div className="text-(--text-on-frame-muted) text-[10px]">
                        {p.baseUrl} · {p.model}
                      </div>
                    </div>
                    {p.isActive && (
                      <span className="text-[10px] text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                        Active
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Entry Thinking 配置 */}
            <section className="pixel-frame">
              <div className="px-4 py-3 border-b border-(--border)">
                <h3 className="text-(--accent-strong) text-sm font-bold">入口配置 & Thinking</h3>
              </div>
              <div>
                {entries.map((entry) => (
                  <div
                    key={entry.entryName}
                    className="flex items-center gap-4 px-3 py-2.5 border-b border-(--border)/30 last:border-b-0"
                  >
                    <div className="flex-1 text-(--text-on-frame) text-xs">
                      <code className="text-[11px]">{entry.entryName}</code>
                      <span className="text-(--text-on-frame-muted) ml-2">
                        — {ENTRY_LABELS[entry.entryName] ?? ""}
                      </span>
                    </div>
                    <select
                      value={entry.providerId ?? ""}
                      onChange={(e) =>
                        handleEntryChange(entry.entryName, "providerId", e.target.value || null)
                      }
                      className="text-xs bg-(--frame) text-(--text-on-frame) border border-(--border) rounded px-2 py-1 w-[150px]"
                    >
                      <option value="">默认 (Active Provider)</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-(--text-on-frame-muted) cursor-pointer whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={entry.thinkingEnabled}
                        onChange={(e) =>
                          handleEntryChange(entry.entryName, "thinkingEnabled", e.target.checked)
                        }
                        className="accent-(--accent-strong)"
                      />
                      Thinking
                    </label>
                  </div>
                ))}
              </div>
            </section>

            <div>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 text-sm cursor-pointer border border-(--accent-strong) text-(--accent-strong)
                           bg-(--frame) hover:bg-(--accent-strong) hover:text-(--frame) rounded transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "保存中..." : "保存配置"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译通过**

```bash
cd frontend && pnpm exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/llm.tsx
git commit -m "feat: add LLMConfig page with provider list and entry thinking toggles"
```

---

### Task 8: 前端 — useWorldState 改用 useParams

**Files:**
- Modify: `frontend/src/hooks/use-world-state.ts:1,4,39-41`

- [ ] **Step 1: 从 useSearchParams 切换为 useParams**

打开 `frontend/src/hooks/use-world-state.ts`，修改 import：

```ts
// 修改前
import { useSearchParams } from "react-router-dom";

// 修改后
import { useParams } from "react-router-dom";
```

修改 worldId 获取逻辑：

```ts
// 修改前
const [searchParams] = useSearchParams();
const worldId = searchParams.get("world") ?? DEFAULT_WORLD_ID;

// 修改后
const { id: routeWorldId } = useParams<{ id: string }>();
const worldId = routeWorldId ?? DEFAULT_WORLD_ID;
```

删除 `DEFAULT_WORLD_ID` 常量（或保留为 `null`）。

- [ ] **Step 2: 验证编译通过**

```bash
cd frontend && pnpm exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/use-world-state.ts
git commit -m "refactor: switch useWorldState from ?world= query param to /world/:id route param"
```

---

### Task 9: 清理旧文件

**Files:**
- Delete: `frontend/src/routes/admin.tsx`
- Delete: `frontend/src/routes/home.tsx`
- Delete: `frontend/src/components/inject-drawer.tsx`
- Modify: `frontend/src/components/dashboard.tsx` (remove InjectDrawer import + state)
- Modify: `frontend/src/App.tsx` (remove old imports)

- [ ] **Step 1: 从 dashboard.tsx 移除 InjectDrawer**

打开 `frontend/src/components/dashboard.tsx`，删除 import：
```tsx
// 删除这行
import { InjectDrawer } from "./inject-drawer";
```

删除 injectOpen state 和相关 JSX（约在第 22-24 行 state 声明，以及底部 `<InjectDrawer>` 渲染）。

在中心 tabs 行去掉"小地图"tab —— 找到 `centerTab` 定义和相关 tab 配置：

```tsx
// 修改前
const [centerTab, setCenterTab] = useState<"stream" | "map" | "gantt" | "relations">("stream");

// 修改后
const [centerTab, setCenterTab] = useState<"stream" | "gantt" | "relations">("stream");
```

修改 tab bar 中的 tabs 数组：
```tsx
{([
  ["stream", "事件流"],
  ["gantt", "甘特图"],
  ["relations", "关系图"],
] as const).map(([key, label]) => (
```

删除 tab content 中 `centerTab === "map"` 的 case（MapStage 渲染块）。

- [ ] **Step 2: 删除旧文件**

```bash
rm frontend/src/routes/admin.tsx
rm frontend/src/routes/home.tsx
rm frontend/src/components/inject-drawer.tsx
```

- [ ] **Step 3: 清理 App.tsx 中未使用的 import**

打开 `frontend/src/App.tsx`，确认所有 import 都对应实际使用的组件。

- [ ] **Step 4: 验证编译通过**

```bash
cd frontend && pnpm exec tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard.tsx frontend/src/App.tsx
git rm frontend/src/routes/admin.tsx frontend/src/routes/home.tsx frontend/src/components/inject-drawer.tsx
git commit -m "chore: remove old admin page, inject drawer, and map preview tab"
```

---

### Task 10: 端到端验证

- [ ] **Step 1: 启动后端**

```bash
cd backend && pnpm dev
```

Expected: `Server running on http://localhost:3001`

- [ ] **Step 2: 启动前端**

```bash
cd frontend && pnpm dev
```

Expected: Vite dev server on `http://localhost:3000`

- [ ] **Step 3: 手动验证以下流程**

1. 打开 `http://localhost:3000` → 看到封面图 + "ENTER WORLD" 按钮
2. 点击 ENTER WORLD → 跳转到 `/hub/mods`，看到 Mod Gallery（4 列卡片）
3. 点击一个 Mod 卡片 → 跳转到 `/hub/worlds?mod=<id>`，左侧该 Mod 高亮，右侧显示实例列表
4. 点击左侧导航 "Mods" 图标 → 回到 gallery
5. 点击 "LLM" 图标 → 看到 Provider 列表和 Entry Thinking 配置
6. 点击一个世界实例的 "进入" 按钮 → 跳转到 `/world/<id>`，Dashboard 正常加载

- [ ] **Step 4: 运行现有测试确保无回归**

```bash
cd backend && pnpm test
```

Expected: all existing tests pass.

```bash
cd frontend && pnpm test
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit any fixes**

If any issues found during verification, fix them and commit.
