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
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("mod", mod.id);
                  window.history.replaceState(null, "", url.toString());
                  loadWorlds(mod.id);
                }}
                className={`w-full text-left px-4 py-3.5 border-l-3 cursor-pointer transition-colors ${
                  selectedModId === mod.id
                    ? "border-l-(--accent-strong) bg-white/5 text-(--accent-strong)"
                    : "border-l-transparent text-white/50 hover:text-white hover:bg-white/5"
                }`}
              >
                <div className="text-sm mb-0.5">{mod.name}</div>
                <div className="text-[10px] text-white/30">
                  {worlds.filter((w) => w.mapId === mod.id).length} 个实例
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
                : "选择一个 Mod"}
            </span>
            <button
              type="button"
              className="px-3 py-1.5 text-[11px] cursor-pointer border border-(--accent-strong) text-(--accent-strong)
                         bg-black/30 hover:bg-(--accent-strong) hover:text-black rounded transition-colors"
              onClick={() => alert("Todo: 新建世界对话框")}
            >
              + 新建世界
            </button>
          </div>

          <div className="flex-1 overflow-auto p-5">
            {loading ? (
              <div className="text-white/50">加载中...</div>
            ) : worlds.length === 0 ? (
              <div className="text-white/50">暂无世界实例</div>
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
