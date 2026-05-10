import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { WorldInstanceCard, type WorldInstanceInfo } from "@/components/world-instance-card";
import type { ModInfo } from "@/components/mod-card";

interface MapsResponse { maps: ModInfo[] }
interface WorldsResponse { worlds: WorldInstanceInfo[] }
interface CharsResponse { characters: { id: string; name: string }[] }

function generateWorldId() {
  const slug = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return `world-${slug}`;
}

export default function WorldsPanelPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedModId = searchParams.get("mod") ?? "";

  const [mods, setMods] = useState<ModInfo[]>([]);
  const [allWorlds, setAllWorlds] = useState<WorldInstanceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Create dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogName, setDialogName] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Always fetch ALL worlds — left panel counts depend on the full list.
  const loadAllWorlds = useCallback(() => {
    fetch("/api/worlds")
      .then((r) => r.json())
      .then((d: WorldsResponse) => setAllWorlds(d.worlds))
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
    loadAllWorlds();
  }, [loadAllWorlds]);

  // Focus input when dialog opens
  useEffect(() => {
    if (dialogOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [dialogOpen]);

  const visibleWorlds = selectedModId
    ? allWorlds.filter((w) => w.mapId === selectedModId)
    : allWorlds;

  const selectMod = useCallback(
    (modId: string) => {
      setSearchParams(modId ? { mod: modId } : {}, { replace: true });
    },
    [setSearchParams],
  );

  const handleDelete = useCallback(
    async (worldId: string) => {
      const res = await fetch(`/api/worlds/${worldId}`, { method: "DELETE" });
      if (res.ok) {
        loadAllWorlds();
      } else {
        const body = await res.json().catch(() => ({ error: "删除失败" }));
        alert(body.error ?? "删除失败");
      }
    },
    [loadAllWorlds],
  );

  const openCreateDialog = useCallback(() => {
    if (!selectedModId) return;
    const mod = mods.find((m) => m.id === selectedModId);
    setDialogName(mod?.name ?? selectedModId);
    setDialogError(null);
    setDialogOpen(true);
  }, [mods, selectedModId]);

  const handleCreate = useCallback(async () => {
    if (!dialogName.trim()) {
      setDialogError("请输入世界名称");
      return;
    }

    setCreating(true);
    setDialogError(null);
    try {
      const charRes = await fetch(`/api/configs/characters?mapId=${encodeURIComponent(selectedModId)}`);
      const charData: CharsResponse = await charRes.json();
      const cast = charData.characters.map((c) => ({ characterId: c.id }));

      if (cast.length === 0) {
        setDialogError("该 Mod 没有可用角色");
        return;
      }

      const res = await fetch("/api/worlds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worldId: generateWorldId(),
          name: dialogName.trim(),
          mapId: selectedModId,
          cast,
        }),
      });

      if (res.ok) {
        setDialogOpen(false);
        loadAllWorlds();
      } else {
        const body = await res.json().catch(() => ({ error: "创建失败" }));
        setDialogError(body.error ?? "创建失败");
      }
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }, [dialogName, selectedModId, loadAllWorlds]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-white/10 bg-black/20 backdrop-blur-sm">
        <h2 className="text-(--accent-strong) text-body-lg font-bold">世界实例</h2>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left panel: Mod list */}
        <aside className="w-[280px] flex-shrink-0 border-r border-white/10 bg-black/20 backdrop-blur-md flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 text-white/40 text-[11px] uppercase tracking-wider">
            Mod 列表
          </div>
          <div className="flex-1 overflow-auto">
            {mods.map((mod) => (
              <button
                key={mod.id}
                type="button"
                onClick={() => selectMod(mod.id === selectedModId ? "" : mod.id)}
                className={`w-full text-left px-4 py-3.5 border-l-3 cursor-pointer transition-colors ${
                  selectedModId === mod.id
                    ? "border-l-(--accent-strong) bg-white/5 text-(--accent-strong)"
                    : "border-l-transparent text-white/50 hover:text-white hover:bg-white/5"
                }`}
              >
                <div className="text-sm mb-0.5">{mod.name}</div>
                <div className="text-[10px] text-white/30">
                  {allWorlds.filter((w) => w.mapId === mod.id).length} 个实例
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* Right panel: World instances */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10 bg-black/20 backdrop-blur-sm flex items-center justify-between">
            <span className="text-white/80 text-sm">
              {selectedModId
                ? `${mods.find((m) => m.id === selectedModId)?.name ?? selectedModId} 的世界实例`
                : "所有世界实例"}
            </span>
            <button
              type="button"
              disabled={!selectedModId}
              className="px-3 py-1.5 text-[11px] cursor-pointer border border-(--accent-strong) text-(--accent-strong)
                         bg-black/30 hover:bg-(--accent-strong) hover:text-black rounded transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={openCreateDialog}
            >
              + 新建世界
            </button>
          </div>

          <div className="flex-1 overflow-auto p-5">
            {loading ? (
              <div className="text-white/50">加载中...</div>
            ) : visibleWorlds.length === 0 ? (
              <div className="text-white/50">
                {selectedModId ? "暂无世界实例，点击右上角按钮创建" : "选择一个 Mod 查看实例"}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {visibleWorlds.map((w) => (
                  <WorldInstanceCard key={w.id} world={w} onDelete={handleDelete} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create world dialog */}
      {dialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => { if (!creating) setDialogOpen(false); }}
        >
          <div
            className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-lg p-6 w-[380px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-(--accent-strong) text-sm font-bold mb-4">新建世界</h3>

            <input
              ref={inputRef}
              type="text"
              value={dialogName}
              onChange={(e) => { setDialogName(e.target.value); setDialogError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              placeholder="输入世界名称"
              disabled={creating}
              className="w-full px-3 py-2 text-sm text-white/90 bg-black/30 border border-white/10 rounded
                         placeholder:text-white/20 outline-none focus:border-(--accent-strong)
                         disabled:opacity-40"
            />

            {dialogError && (
              <div className="mt-3 text-xs text-red-300 bg-red-500/10 border border-red-400/20 rounded px-3 py-2">
                {dialogError}
              </div>
            )}

            <div className="flex justify-end gap-2.5 mt-4">
              <button
                type="button"
                disabled={creating}
                onClick={() => setDialogOpen(false)}
                className="px-4 py-1.5 text-xs text-white/50 hover:text-white border border-white/10 rounded
                           bg-transparent hover:bg-white/5 transition-colors disabled:opacity-40"
              >
                取消
              </button>
              <button
                type="button"
                disabled={creating || !dialogName.trim()}
                onClick={handleCreate}
                className="px-5 py-1.5 text-xs border border-(--accent-strong) text-(--accent-strong)
                           bg-black/30 hover:bg-(--accent-strong) hover:text-black rounded transition-colors
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {creating ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
