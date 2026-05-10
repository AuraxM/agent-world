import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { WorldInstanceCard, type WorldInstanceInfo } from "@/components/world-instance-card";
import type { ModInfo } from "@/components/mod-card";

interface MapsResponse { maps: ModInfo[] }
interface WorldsResponse { worlds: WorldInstanceInfo[] }
interface CharsResponse { characters: { id: string; name: string }[] }

function generateWorldId() {
  const slug = crypto.randomUUID().slice(0, 8);
  return `world-${slug}`;
}

export default function WorldsPanelPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedModId = searchParams.get("mod") ?? "";

  const [mods, setMods] = useState<ModInfo[]>([]);
  const [allWorlds, setAllWorlds] = useState<WorldInstanceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

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

  // Right panel shows: selected mod's instances, or all worlds if none selected.
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

  const handleCreate = useCallback(async () => {
    if (!selectedModId) {
      alert("请先在左侧选择一个 Mod");
      return;
    }
    const mod = mods.find((m) => m.id === selectedModId);
    const worldName = prompt("输入世界名称", mod?.name ?? selectedModId);
    if (!worldName) return;

    setCreating(true);
    try {
      // Fetch characters for this mod
      const charRes = await fetch(`/api/configs/characters?mapId=${encodeURIComponent(selectedModId)}`);
      const charData: CharsResponse = await charRes.json();
      const cast = charData.characters.map((c) => ({ characterId: c.id }));

      if (cast.length === 0) {
        alert("该 Mod 没有可用角色");
        return;
      }

      const res = await fetch("/api/worlds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worldId: generateWorldId(),
          name: worldName,
          mapId: selectedModId,
          cast,
        }),
      });

      if (res.ok) {
        loadAllWorlds();
      } else {
        const body = await res.json().catch(() => ({ error: "创建失败" }));
        alert(body.error ?? "创建失败");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }, [mods, selectedModId, loadAllWorlds]);

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
              disabled={creating || !selectedModId}
              className="px-3 py-1.5 text-[11px] cursor-pointer border border-(--accent-strong) text-(--accent-strong)
                         bg-black/30 hover:bg-(--accent-strong) hover:text-black rounded transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleCreate}
            >
              {creating ? "创建中..." : "+ 新建世界"}
            </button>
          </div>

          <div className="flex-1 overflow-auto p-5">
            {loading ? (
              <div className="text-white/50">加载中...</div>
            ) : visibleWorlds.length === 0 ? (
              <div className="text-white/50">
                {selectedModId ? "暂无世界实例，点击右上角按钮创建" : "暂无世界实例"}
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
    </div>
  );
}
