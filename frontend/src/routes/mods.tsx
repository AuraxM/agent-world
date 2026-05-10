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
