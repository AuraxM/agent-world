"use client";

import { formatGameTime } from "../_lib/format";

export function TopBar({
  tick,
  worldName,
  loading,
  onAdvance,
  lastTickMs,
  tickProgress,
  error,
  autoMode,
  onStartAuto,
  onStopAuto,
}: {
  tick: number;
  worldName: string;
  loading: boolean;
  onAdvance: () => void;
  lastTickMs: number | null;
  tickProgress?: { done: number; total: number } | null;
  error: string | null;
  autoMode: { running: boolean; total: number; done: number } | null;
  onStartAuto: () => void;
  onStopAuto: () => void;
}) {
  const auto = autoMode?.running ?? false;
  return (
    <header className="flex items-center gap-4 px-4 py-2 bg-(--color-pixel-bg-2) border-b-2 border-(--color-pixel-border-dark)">
      <div className="flex items-baseline gap-3">
        <span className="text-(--color-pixel-accent) text-game-lg tracking-widest">
          ◆ {worldName}
        </span>
        <span className="text-(--color-pixel-fg) text-game-base">
          t={tick} · {formatGameTime(tick)}
        </span>
      </div>
      <div className="flex-1" />
      {lastTickMs !== null && (
        <span className="text-game-xs text-(--color-pixel-muted)">
          上次推进 {Math.round(lastTickMs)}ms
        </span>
      )}
      {error && (
        <span className="text-game-base text-(--color-pixel-danger) max-w-xs truncate">
          ⚠ {error}
        </span>
      )}
      {auto && autoMode && (
        <span className="text-game-xs text-(--color-pixel-accent)">
          自动 {autoMode.done}/{autoMode.total}
          {tickProgress && tickProgress.total > 0
            ? ` · 当前 ${tickProgress.done}/${tickProgress.total}`
            : ""}
        </span>
      )}
      {!auto && tickProgress && tickProgress.total > 0 && (
        <span className="text-game-xs text-(--color-pixel-accent)">
          {tickProgress.done}/{tickProgress.total}
        </span>
      )}
      {auto ? (
        <button
          type="button"
          onClick={onStopAuto}
          className="px-3 py-1 text-game-base bg-(--color-pixel-danger) text-(--color-pixel-border-dark) border-2 border-(--color-pixel-border-dark) shadow-[inset_0_-2px_0_var(--color-pixel-border-dark)] hover:brightness-110 active:translate-y-px"
        >
          停止 ⏹
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={onAdvance}
            disabled={loading}
            className="px-3 py-1 text-game-base bg-(--color-pixel-accent) text-(--color-pixel-border-dark) border-2 border-(--color-pixel-accent-dark) shadow-[inset_0_-2px_0_var(--color-pixel-accent-dark)] disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:translate-y-px"
          >
            {loading ? "推进中…" : "推进 1 小时 ▶"}
          </button>
          <button
            type="button"
            onClick={onStartAuto}
            disabled={loading}
            className="px-3 py-1 text-game-base bg-(--color-pixel-bg) text-(--color-pixel-fg) border-2 border-(--color-pixel-border-light) hover:border-(--color-pixel-accent) hover:text-(--color-pixel-accent) disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-px"
          >
            自动 24h ⏵⏵
          </button>
        </>
      )}
    </header>
  );
}
