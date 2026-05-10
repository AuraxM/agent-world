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
