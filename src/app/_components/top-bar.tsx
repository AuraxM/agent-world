"use client";

import { formatGameTime } from "../_lib/format";

export function TopBar({
  tick,
  worldName,
  loading,
  onAdvance,
  lastTickMs,
  error,
}: {
  tick: number;
  worldName: string;
  loading: boolean;
  onAdvance: () => void;
  lastTickMs: number | null;
  error: string | null;
}) {
  return (
    <header className="flex items-center gap-4 px-4 py-2 bg-(--color-pixel-bg-2) border-b-2 border-(--color-pixel-border-dark)">
      <div className="flex items-baseline gap-3">
        <span className="text-(--color-pixel-accent) text-sm tracking-widest">
          ◆ {worldName}
        </span>
        <span className="text-(--color-pixel-fg) text-xs">
          t={tick} · {formatGameTime(tick)}
        </span>
      </div>
      <div className="flex-1" />
      {lastTickMs !== null && (
        <span className="text-[10px] text-(--color-pixel-muted)">
          上次推进 {Math.round(lastTickMs)}ms
        </span>
      )}
      {error && (
        <span className="text-xs text-(--color-pixel-danger) max-w-xs truncate">
          ⚠ {error}
        </span>
      )}
      <button
        type="button"
        onClick={onAdvance}
        disabled={loading}
        className="px-3 py-1 text-xs bg-(--color-pixel-accent) text-(--color-pixel-border-dark) border-2 border-(--color-pixel-accent-dark) shadow-[inset_0_-2px_0_var(--color-pixel-accent-dark)] disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:translate-y-px"
      >
        {loading ? "推进中…" : "推进 1 小时 ▶"}
      </button>
    </header>
  );
}
