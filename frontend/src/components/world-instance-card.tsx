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
    <div className="flex items-center gap-4 px-5 py-4 bg-black/25 backdrop-blur-md border border-white/10 rounded-md">
      {/* Status light */}
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: status.bg, boxShadow: status.shadow }}
        title={status.label}
      />

      <div className="flex-1 min-w-0">
        <div className="text-white/90 text-sm font-bold mb-0.5 truncate">
          {world.name}
        </div>
        <div className="text-white/50 text-[11px]">
          Tick {world.currentTick} · {world.characterCount} 角色
        </div>
      </div>

      <div className="flex gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => navigate(`/world/${world.id}`)}
          className="px-3 py-1.5 text-[11px] cursor-pointer border border-(--accent-strong) text-(--accent-strong)
                     bg-black/30 hover:bg-(--accent-strong) hover:text-black rounded transition-colors"
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
          className="px-3 py-1.5 text-[11px] cursor-pointer border border-red-400/60 text-red-300
                     bg-black/30 hover:bg-red-500/60 hover:text-white rounded transition-colors"
        >
          删除
        </button>
      </div>
    </div>
  );
}
