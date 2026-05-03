"use client";

import { useCallback, useEffect, useState } from "react";
import { PixelFrame } from "../_components/pixel-frame";

// ---- types ----

interface LLMProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  isActive: boolean;
  createdAt: number;
}

interface MapConfig {
  id: string;
  name: string;
  description: string;
  nodeCount: number;
  entryNodeId: string | null;
  rootNodes: string[];
  nodes: MapNodeConfig[];
}

interface MapNodeConfig {
  id: string;
  parentId: string | null;
  name: string;
  description: string;
  tags: string[];
  capacity: number | null;
  privacy: string;
  spriteKey?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  isEntry: boolean;
  children?: MapNodeConfig[];
}

interface WorldInfo {
  id: string;
  name: string;
  currentTick: number;
}

type Tab = "providers" | "reset" | "maps";

// ---- provider form ----

function providerFormData(form: HTMLFormElement) {
  return {
    name: (form.elements.namedItem("name") as HTMLInputElement).value.trim(),
    baseUrl: (form.elements.namedItem("baseUrl") as HTMLInputElement).value.trim(),
    apiKey: (form.elements.namedItem("apiKey") as HTMLInputElement).value.trim(),
    model: (form.elements.namedItem("model") as HTMLInputElement).value.trim(),
  };
}

// ---- helpers ----

const TAB_CLASSES: Record<Tab, string> = {
  providers: "px-4 py-2 text-game-base tracking-widest cursor-pointer border-b-2 transition-colors",
  reset: "px-4 py-2 text-game-base tracking-widest cursor-pointer border-b-2 transition-colors",
  maps: "px-4 py-2 text-game-base tracking-widest cursor-pointer border-b-2 transition-colors",
};

const TAB_LABELS: Record<Tab, string> = {
  providers: "LLM Provider",
  reset: "重置世界",
  maps: "地图预览",
};

function buildTree(nodes: MapNodeConfig[]): MapNodeConfig[] {
  const map = new Map<string, MapNodeConfig>();
  for (const n of nodes) map.set(n.id, { ...n, children: [] });
  const roots: MapNodeConfig[] = [];
  for (const n of map.values()) {
    if (n.parentId && map.has(n.parentId)) {
      map.get(n.parentId)!.children!.push(n);
    } else if (!n.parentId) {
      roots.push(n);
    }
  }
  return roots;
}

function TreeNode({ node, depth = 0 }: { node: MapNodeConfig; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const hasKids = (node.children?.length ?? 0) > 0;
  return (
    <div style={{ paddingLeft: depth * 16 }}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 py-1 text-game-base hover:text-(--color-pixel-accent) transition-colors text-left w-full"
      >
        <span className="w-3 text-(--color-pixel-muted)">
          {hasKids ? (open ? "▾" : "▸") : "·"}
        </span>
        <span className="text-(--color-pixel-fg)">{node.name}</span>
        <span className="text-(--color-pixel-muted) ml-1">({node.id})</span>
        {node.isEntry && (
          <span className="text-game-xs text-(--color-pixel-accent) ml-1">入口</span>
        )}
        {node.privacy === "private" && (
          <span className="text-game-xs text-(--color-pixel-danger)">🔒</span>
        )}
      </button>
      {open && hasKids && (
        <div>
          {node.children!.map((c) => (
            <TreeNode key={c.id} node={c} depth={depth + 1} />
          ))}
        </div>
      )}
      {open && !hasKids && depth >= 2 && (
        <div style={{ paddingLeft: 20 }} className="text-game-xs text-(--color-pixel-muted) mb-1">
          {node.description}
          {node.tags.length > 0 && (
            <span className="ml-1">[{node.tags.join(", ")}]</span>
          )}
        </div>
      )}
    </div>
  );
}

// ---- main page ----

export default function AdminPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <AdminContent />
    </div>
  );
}

function AdminContent() {
  const [tab, setTab] = useState<Tab>("providers");
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const [thinkingLoading, setThinkingLoading] = useState(false);
  const [language, setLanguage] = useState<"zh" | "en" | "ja">("zh");
  const [languageLoading, setLanguageLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        setThinkingEnabled(d.thinkingEnabled);
        if (d.language === "zh" || d.language === "en" || d.language === "ja") {
          setLanguage(d.language);
        }
      })
      .catch(() => { /* keep default */ });
  }, []);

  async function handleThinkingToggle() {
    const next = !thinkingEnabled;
    setThinkingLoading(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ thinkingEnabled: next }),
      });
      const data = await res.json();
      if (res.ok) setThinkingEnabled(data.thinkingEnabled);
    } catch {
      /* revert on error */
    } finally {
      setThinkingLoading(false);
    }
  }

  async function handleLanguageChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as "zh" | "en" | "ja";
    setLanguageLoading(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ language: next }),
      });
      const data = await res.json();
      if (res.ok) setLanguage(data.language);
    } catch {
      /* revert on error */
    } finally {
      setLanguageLoading(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* top bar */}
      <header className="flex items-center gap-4 px-4 py-2 border-b border-(--color-pixel-border-dark) bg-(--color-pixel-bg) shrink-0">
        <h1 className="text-game-lg tracking-widest text-(--color-pixel-accent)">
          ADMIN · 管理后台
        </h1>
        <label className="flex items-center gap-2 ml-auto cursor-pointer select-none">
          <span className="text-game-xs text-(--color-pixel-muted) whitespace-nowrap">
            语言
          </span>
          <select
            value={language}
            onChange={handleLanguageChange}
            disabled={languageLoading}
            className="px-2 py-0.5 text-game-xs bg-(--color-pixel-bg-2) border border-(--color-pixel-border-light) text-(--color-pixel-fg) outline-none focus:border-(--color-pixel-accent) disabled:opacity-50"
          >
            <option value="zh">简体中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-game-xs text-(--color-pixel-muted) whitespace-nowrap">
            {thinkingEnabled ? "LLM Thinking ON" : "LLM Thinking OFF"}
          </span>
          <button
            type="button"
            onClick={handleThinkingToggle}
            disabled={thinkingLoading}
            className={
              "w-10 h-5 rounded-full border transition-colors " +
              (thinkingEnabled
                ? "bg-(--color-pixel-accent) border-(--color-pixel-accent-dark)"
                : "bg-(--color-pixel-border-dark) border-(--color-pixel-border-light)")
            }
          >
            <span
              className={
                "block w-3.5 h-3.5 rounded-full bg-(--color-pixel-bg) transition-transform " +
                (thinkingEnabled ? "translate-x-5" : "translate-x-0.5")
              }
            />
          </button>
        </label>
        <a
          href="/"
          className="text-game-xs text-(--color-pixel-muted) hover:text-(--color-pixel-fg) transition-colors"
        >
          ← 返回游戏
        </a>
      </header>

      {/* tabs */}
      <nav className="flex gap-0 px-4 border-b border-(--color-pixel-border-dark) bg-(--color-pixel-bg-2) shrink-0">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={TAB_CLASSES[t] +
              (tab === t
                ? " border-(--color-pixel-accent) text-(--color-pixel-accent)"
                : " border-transparent text-(--color-pixel-muted) hover:text-(--color-pixel-fg)")
            }
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </nav>

      {/* tab content */}
      <div className="flex-1 min-h-0 overflow-auto p-4">
        {tab === "providers" && <ProvidersTab />}
        {tab === "reset" && <ResetTab />}
        {tab === "maps" && <MapsTab />}
      </div>
    </div>
  );
}

// ---- providers tab ----

function ProvidersTab() {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/providers");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "fetch failed");
      setProviders(data.providers);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProviders();
  }, [fetchProviders]);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const body = providerFormData(e.currentTarget);
    try {
      const res = await fetch("/api/admin/providers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "create failed");
      setShowAdd(false);
      await fetchProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    }
  }

  async function handleUpdate(id: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const body = providerFormData(e.currentTarget);
    try {
      const res = await fetch(`/api/admin/providers/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "update failed");
      setEditingId(null);
      await fetchProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("确定删除此 provider？")) return;
    setError("");
    try {
      const res = await fetch(`/api/admin/providers/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "delete failed");
      await fetchProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    }
  }

  async function handleActivate(id: string) {
    setError("");
    try {
      const res = await fetch(`/api/admin/providers/${id}/activate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "activate failed");
      await fetchProviders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-game-base tracking-widest text-(--color-pixel-muted)">
          LLM Provider 管理
        </h2>
        <button
          onClick={() => { setShowAdd(!showAdd); setEditingId(null); }}
          className="px-3 py-1 text-game-xs border border-(--color-pixel-border-light) bg-(--color-pixel-bg-2) text-(--color-pixel-fg) hover:border-(--color-pixel-accent) transition-colors"
        >
          {showAdd ? "取消" : "+ 添加 Provider"}
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 text-game-xs text-(--color-pixel-danger) border border-(--color-pixel-danger) bg-(--color-pixel-bg-2)">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-game-sm text-(--color-pixel-muted)">加载中…</div>
      ) : providers.length === 0 ? (
        <div className="text-game-sm text-(--color-pixel-muted)">
          暂无 provider，当前使用 .env.local 中的 DeepSeek 配置
        </div>
      ) : null}

      {/* add form */}
      {showAdd && (
        <PixelFrame title="新建 Provider">
          <ProviderForm onSubmit={handleAdd} onCancel={() => setShowAdd(false)} />
        </PixelFrame>
      )}

      {/* provider list */}
      {providers.map((p) => (
        <PixelFrame key={p.id} tone={p.isActive ? "accent" : "default"}>
          {editingId === p.id ? (
            <ProviderForm
              initial={p}
              onSubmit={(e) => handleUpdate(p.id, e)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-game-base text-(--color-pixel-fg) font-bold">{p.name}</span>
                  {p.isActive && (
                    <span className="text-game-2xs px-1 py-0.5 bg-(--color-pixel-accent) text-(--color-pixel-bg)">
                      ACTIVE
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {!p.isActive && (
                    <button
                      onClick={() => handleActivate(p.id)}
                      className="text-game-2xs px-2 py-1 border border-(--color-pixel-success) text-(--color-pixel-success) hover:bg-(--color-pixel-bg-2) transition-colors"
                    >
                      启用
                    </button>
                  )}
                  <button
                    onClick={() => setEditingId(p.id)}
                    className="text-game-2xs px-2 py-1 border border-(--color-pixel-border-light) text-(--color-pixel-muted) hover:text-(--color-pixel-fg) transition-colors"
                  >
                    编辑
                  </button>
                  {!p.isActive && (
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="text-game-2xs px-2 py-1 border border-(--color-pixel-danger) text-(--color-pixel-danger) hover:bg-(--color-pixel-bg-2) transition-colors"
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>
              <div className="text-game-xs text-(--color-pixel-muted) space-y-0.5">
                <div>Model: {p.model}</div>
                <div className="truncate">URL: {p.baseUrl}</div>
                <div>API Key: {p.apiKey.slice(0, 8)}…{p.apiKey.slice(-4)}</div>
              </div>
            </div>
          )}
        </PixelFrame>
      ))}
    </div>
  );
}

function ProviderForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: LLMProvider;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-game-2xs text-(--color-pixel-muted)">名称</span>
          <input
            name="name"
            defaultValue={initial?.name ?? ""}
            required
            placeholder="如 DeepSeek"
            className="w-full px-2 py-1 text-game-sm bg-(--color-pixel-bg) border border-(--color-pixel-border-light) text-(--color-pixel-fg) outline-none focus:border-(--color-pixel-accent)"
          />
        </label>
        <label className="space-y-1">
          <span className="text-game-2xs text-(--color-pixel-muted)">Model</span>
          <input
            name="model"
            defaultValue={initial?.model ?? ""}
            required
            placeholder="deepseek-v4-flash"
            className="w-full px-2 py-1 text-game-sm bg-(--color-pixel-bg) border border-(--color-pixel-border-light) text-(--color-pixel-fg) outline-none focus:border-(--color-pixel-accent)"
          />
        </label>
        <label className="space-y-1 col-span-2">
          <span className="text-game-2xs text-(--color-pixel-muted)">Base URL</span>
          <input
            name="baseUrl"
            defaultValue={initial?.baseUrl ?? ""}
            required
            placeholder="https://api.deepseek.com"
            className="w-full px-2 py-1 text-game-sm bg-(--color-pixel-bg) border border-(--color-pixel-border-light) text-(--color-pixel-fg) outline-none focus:border-(--color-pixel-accent)"
          />
        </label>
        <label className="space-y-1 col-span-2">
          <span className="text-game-2xs text-(--color-pixel-muted)">API Key</span>
          <input
            name="apiKey"
            defaultValue={initial?.apiKey ?? ""}
            required
            type="password"
            placeholder="sk-…"
            className="w-full px-2 py-1 text-game-sm bg-(--color-pixel-bg) border border-(--color-pixel-border-light) text-(--color-pixel-fg) outline-none focus:border-(--color-pixel-accent)"
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="px-3 py-1 text-game-xs border border-(--color-pixel-accent) text-(--color-pixel-accent) hover:bg-(--color-pixel-bg-2) transition-colors"
        >
          保存
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1 text-game-xs border border-(--color-pixel-border-light) text-(--color-pixel-muted) hover:text-(--color-pixel-fg) transition-colors"
        >
          取消
        </button>
      </div>
    </form>
  );
}

// ---- reset tab ----

function ResetTab() {
  const [world, setWorld] = useState<WorldInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  useEffect(() => {
    async function fetchWorld() {
      try {
        const res = await fetch("/api/worlds/world-yu-no-tani");
        if (res.ok) {
          const data = await res.json();
          setWorld({ id: data.world.id, name: data.world.name, currentTick: data.world.currentTick });
        }
      } catch {
        // world may not exist yet
      } finally {
        setLoading(false);
      }
    }
    void fetchWorld();
  }, []);

  async function handleReset() {
    if (!confirm("确定要重置游戏世界吗？所有存档数据将被清除并重新 seed。")) return;
    setResetting(true);
    setError("");
    setResult("");
    try {
      const res = await fetch("/api/admin/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "reset failed");
      setResult(`世界已重置。地图: ${data.world.mapId}，角色: ${data.world.characterIds.length} 个`);
      setWorld({ id: data.world.id, name: "月ノ谷", currentTick: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <h2 className="text-game-base tracking-widest text-(--color-pixel-muted)">重置游戏世界</h2>

      {error && (
        <div className="px-3 py-2 text-game-xs text-(--color-pixel-danger) border border-(--color-pixel-danger) bg-(--color-pixel-bg-2)">
          {error}
        </div>
      )}
      {result && (
        <div className="px-3 py-2 text-game-xs text-(--color-pixel-success) border border-(--color-pixel-success) bg-(--color-pixel-bg-2)">
          {result}
        </div>
      )}

      <PixelFrame>
        <div className="p-3 space-y-3">
          {loading ? (
            <div className="text-game-sm text-(--color-pixel-muted)">加载中…</div>
          ) : world ? (
            <div className="text-game-sm space-y-1">
              <div>
                <span className="text-(--color-pixel-muted)">世界：</span>
                <span className="text-(--color-pixel-fg)">{world.name}</span>
                <span className="text-(--color-pixel-muted) ml-1">({world.id})</span>
              </div>
              <div>
                <span className="text-(--color-pixel-muted)">当前 Tick：</span>
                <span className="text-(--color-pixel-fg)">{world.currentTick}</span>
              </div>
            </div>
          ) : (
            <div className="text-game-sm text-(--color-pixel-muted)">
              尚未创建世界，点击下方按钮 seed。
            </div>
          )}

          <button
            onClick={handleReset}
            disabled={resetting}
            className="px-4 py-2 text-game-xs border border-(--color-pixel-danger) text-(--color-pixel-danger) hover:bg-(--color-pixel-bg-2) transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resetting ? "重置中…" : "🔄 重置世界"}
          </button>
          <p className="text-game-2xs text-(--color-pixel-muted)">
            使用默认配置（moon-valley + 33 角色）重新 seed。此操作不可撤销。
          </p>
        </div>
      </PixelFrame>
    </div>
  );
}

// ---- maps tab ----

interface MapSummary {
  id: string;
  name: string;
  description: string;
  nodeCount: number;
}

function MapsTab() {
  const [maps, setMaps] = useState<MapSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<MapConfig | null>(null);
  const [error, setError] = useState("");

  // 首次加载地图列表
  useEffect(() => {
    async function fetchMaps() {
      try {
        const res = await fetch("/api/configs/maps");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "fetch failed");
        setMaps(data.maps);
        if (data.maps.length > 0) {
          setSelectedId(data.maps[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "unknown error");
      } finally {
        setListLoading(false);
      }
    }
    void fetchMaps();
  }, []);

  // 选中地图后加载完整配置
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setDetailLoading(true);
    setDetail(null);
    setError("");
    async function fetchDetail() {
      try {
        const res = await fetch(`/api/admin/maps/${selectedId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "fetch failed");
        if (!cancelled) setDetail(data.map);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "unknown error");
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }
    void fetchDetail();
    return () => { cancelled = true; };
  }, [selectedId]);

  return (
    <div className="max-w-3xl space-y-4">
      <h2 className="text-game-base tracking-widest text-(--color-pixel-muted)">地图配置预览</h2>

      {error && (
        <div className="px-3 py-2 text-game-xs text-(--color-pixel-danger) border border-(--color-pixel-danger) bg-(--color-pixel-bg-2)">
          {error}
        </div>
      )}

      {listLoading ? (
        <div className="text-game-sm text-(--color-pixel-muted)">加载中…</div>
      ) : null}

      {/* map selector */}
      <div className="flex gap-2 flex-wrap">
        {maps.map((m) => (
          <button
            key={m.id}
            onClick={() => setSelectedId(m.id)}
            className={
              "px-3 py-1 text-game-xs border transition-colors " +
              (m.id === selectedId
                ? "border-(--color-pixel-accent) text-(--color-pixel-accent) bg-(--color-pixel-bg-2)"
                : "border-(--color-pixel-border-light) text-(--color-pixel-muted) hover:text-(--color-pixel-fg)")
            }
          >
            {m.name}
          </button>
        ))}
      </div>

      {/* map detail */}
      {detailLoading && (
        <div className="text-game-sm text-(--color-pixel-muted)">加载地图配置…</div>
      )}
      {detail && !detailLoading && (
        <MapDetail map={detail} />
      )}
    </div>
  );
}

function MapDetail({ map }: { map: MapConfig }) {
  const tree = buildTree(map.nodes);

  return (
    <PixelFrame title={`${map.name} (${map.id})`}>
      <div className="p-3 space-y-3">
        <div className="text-game-xs text-(--color-pixel-muted)">
          {map.description}
        </div>

        {/* stats */}
        <div className="flex gap-4 text-game-xs">
          <span className="text-(--color-pixel-muted)">
            节点数: <span className="text-(--color-pixel-fg)">{map.nodeCount}</span>
          </span>
          <span className="text-(--color-pixel-muted)">
            入口: <span className="text-(--color-pixel-accent)">{map.entryNodeId ?? "无"}</span>
          </span>
        </div>

        {/* node tree */}
        <div className="border-t border-(--color-pixel-border-dark) pt-2">
          <div className="text-game-2xs text-(--color-pixel-muted) mb-2">节点树</div>
          {tree.map((n) => (
            <TreeNode key={n.id} node={n} />
          ))}
        </div>

        {/* node details table */}
        <div className="border-t border-(--color-pixel-border-dark) pt-2">
          <div className="text-game-2xs text-(--color-pixel-muted) mb-2">节点详情</div>
          <div className="overflow-x-auto">
            <table className="w-full text-game-2xs border-collapse">
              <thead>
                <tr className="text-(--color-pixel-muted) border-b border-(--color-pixel-border-dark)">
                  <th className="text-left py-1 px-2">ID</th>
                  <th className="text-left py-1 px-2">名称</th>
                  <th className="text-left py-1 px-2">父节点</th>
                  <th className="text-left py-1 px-2">隐私</th>
                  <th className="text-left py-1 px-2">容量</th>
                  <th className="text-left py-1 px-2">标签</th>
                  <th className="text-left py-1 px-2">坐标</th>
                </tr>
              </thead>
              <tbody>
                {map.nodes.map((n) => (
                  <tr
                    key={n.id}
                    className="border-b border-(--color-pixel-border-dark) hover:bg-(--color-pixel-bg-2)"
                  >
                    <td className="py-1 px-2 text-(--color-pixel-muted)">{n.id}</td>
                    <td className="py-1 px-2 text-(--color-pixel-fg)">
                      {n.name}
                      {n.isEntry && (
                        <span className="text-(--color-pixel-accent) ml-1">*</span>
                      )}
                    </td>
                    <td className="py-1 px-2 text-(--color-pixel-muted)">
                      {n.parentId ?? "—"}
                    </td>
                    <td className="py-1 px-2">
                      <span
                        className={
                          n.privacy === "private"
                            ? "text-(--color-pixel-danger)"
                            : n.privacy === "semi"
                              ? "text-(--color-pixel-accent)"
                              : "text-(--color-pixel-success)"
                        }
                      >
                        {n.privacy}
                      </span>
                    </td>
                    <td className="py-1 px-2 text-(--color-pixel-muted)">
                      {n.capacity ?? "—"}
                    </td>
                    <td className="py-1 px-2 text-(--color-pixel-muted)">
                      {n.tags.join(", ")}
                    </td>
                    <td className="py-1 px-2 text-(--color-pixel-muted)">
                      {n.x !== undefined ? `${n.x},${n.y} ${n.w}×${n.h}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PixelFrame>
  );
}
