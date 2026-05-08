"use client";

import type { MapNode } from "@/types/api.generated";
import { formatGameTime } from "@/lib/format";
import { pathFromRoot } from "@/lib/world";
import { ThemeSwitcher } from "./theme-switcher";

export function TopBar({
  tick,
  epoch,
  worldName,
  currentNodeId,
  nodes,
  followingName,
  onJumpToNode,
  onClearFollow,
}: {
  tick: number;
  epoch: number;
  worldName: string;
  currentNodeId: string | null;
  nodes: MapNode[];
  followingName: string | null;
  onJumpToNode: (nodeId: string) => void;
  onClearFollow: () => void;
}) {
  const breadcrumb =
    currentNodeId
      ? pathFromRoot(nodes, currentNodeId)
      : [];

  return (
    <header className="flex items-center gap-3 px-3 border-b-2 border-(--border) bg-gradient-to-b from-(--chrome-hi) to-(--chrome) shadow-[inset_0_-1px_0_var(--border-amber))]">
      <span className="text-pixel-lg tracking-[var(--letter-pixel)] text-(--accent-strong)">
        ◆ {worldName}
      </span>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-body-sm text-(--text-on-frame-muted)">
        {breadcrumb.map((n, i) => (
          <span key={n.id} className="flex items-center gap-1 whitespace-nowrap">
            {i > 0 && <span>›</span>}
            {i === breadcrumb.length - 1 ? (
              <b className="text-(--text-on-frame)">{n.name}</b>
            ) : (
              <button
                type="button"
                onClick={() => onJumpToNode(n.id)}
                className="hover:text-(--text-on-frame) cursor-pointer"
              >
                {n.name}
              </button>
            )}
          </span>
        ))}
      </nav>

      {/* Follow indicator */}
      {followingName && (
        <span className="flex items-center gap-1 px-2 py-0.5 text-body-xs bg-(--border-amber)/15 border border-(--border-amber) text-(--text-on-frame)">
          👁 跟随：{followingName}
          <button
            type="button"
            onClick={onClearFollow}
            className="ml-1.5 text-(--danger) cursor-pointer"
            title="取消跟随"
          >
            ✕
          </button>
        </span>
      )}

      <div className="flex-1" />

      {/* Icon buttons — all placeholder except theme */}
      <button
        type="button"
        disabled
        title="搜索 (Coming Soon)"
        className="w-7 h-7 bg-transparent border border-(--border-amber) text-(--text-on-frame-muted) text-sm cursor-not-allowed opacity-50"
      >
        🔍
      </button>
      <button
        type="button"
        disabled
        title="快照 (Coming Soon)"
        className="w-7 h-7 bg-transparent border border-(--border-amber) text-(--text-on-frame-muted) text-sm cursor-not-allowed opacity-50"
      >
        💾
      </button>
      <button
        type="button"
        disabled
        title="设置 (Coming Soon)"
        className="w-7 h-7 bg-transparent border border-(--border-amber) text-(--text-on-frame-muted) text-sm cursor-not-allowed opacity-50"
      >
        ⚙
      </button>
      <ThemeSwitcher />

      <span className="text-pixel-xs text-(--accent-strong) tracking-[var(--letter-pixel-tight)]">
        T={tick} · {formatGameTime(epoch, tick)}
      </span>
    </header>
  );
}
