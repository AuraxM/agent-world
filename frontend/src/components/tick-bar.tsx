"use client";

import { useState } from "react";
import { formatGameTime } from "@/lib/format";

export function TickBar({
  tick,
  epoch,
  loading,
  onAdvance,
  autoMode,
  onStartAuto,
  onStopAuto,
  lastTickMs,
  tickProgress,
  onOpenInject,
}: {
  tick: number;
  epoch: number;
  loading: boolean;
  onAdvance: () => void;
  autoMode: { running: boolean; total: number; done: number } | null;
  onStartAuto: (n: number) => void;
  onStopAuto: () => void;
  lastTickMs: number | null;
  tickProgress?: { done: number; total: number } | null;
  onOpenInject?: () => void;
}) {
  const auto = autoMode?.running ?? false;
  const [tickCount, setTickCount] = useState(120);

  return (
    <footer className="flex items-center gap-2 px-4 bg-gradient-to-b from-(--chrome) to-(--chrome-hi) border-t-2 border-(--border) shadow-[inset_0_1px_0_var(--border-amber))]">
      {/* Group 1: Step controls */}
      <div className="flex items-center gap-1 pr-3 border-r border-(--border)">
        <TickBtn disabled title="单步回退 (Coming Soon)">⏮</TickBtn>
        <TickBtn primary onClick={onAdvance} disabled={loading}>
          ▶
        </TickBtn>
        <TickBtn disabled title="暂停 (Coming Soon)">⏸</TickBtn>
        <TickBtn disabled title="单步前进 (Coming Soon)">⏭</TickBtn>
      </div>

      {/* Group 2: Clock */}
      <div className="pr-3 border-r border-(--border)">
        <span className="text-pixel-md text-(--accent-strong) tracking-[var(--letter-pixel-tight)]">
          {formatGameTime(epoch, tick)}
        </span>
      </div>

      {/* Group 3: Speed */}
      <div className="flex items-center gap-0 pr-3 border-r border-(--border)">
        <SpeedBtn active disabled={false}>1×</SpeedBtn>
        <SpeedBtn disabled>2×</SpeedBtn>
        <SpeedBtn disabled>4×</SpeedBtn>
      </div>

      {/* Group 4: Auto */}
      <div className="flex items-center gap-1 pr-3 border-r border-(--border)">
        {auto ? (
          <>
            <span className="text-pixel-xs text-(--text-on-frame)">
              {autoMode!.done}/{autoMode!.total}
            </span>
            <button
              type="button"
              onClick={onStopAuto}
              className="px-3 py-1 text-pixel-sm bg-(--danger) text-(--panel) border border-(--border) cursor-pointer hover:brightness-110"
            >
              停止 ⏹
            </button>
          </>
        ) : (
          <>
            <input
              type="number"
              min={1}
              max={9999}
              value={tickCount}
              onChange={(e) => setTickCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-16 px-2 py-1 text-pixel-sm bg-(--frame) text-(--text-on-frame) border border-(--border) text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={() => onStartAuto(tickCount)}
              disabled={loading}
              className="px-3 py-1 text-pixel-sm bg-(--border-amber) text-(--text-on-frame) border border-(--border) cursor-pointer disabled:opacity-50 hover:brightness-110"
            >
              ⏵⏵ 自动
            </button>
          </>
        )}
      </div>

      {/* Group 5: Replay mode toggle */}
      <div className="pr-3 border-r border-(--border)">
        <button
          type="button"
          disabled
          title="历史回放 (Coming Soon)"
          className="px-3 py-1 text-pixel-xs bg-transparent border border-(--border-amber) text-(--text-on-frame-muted) cursor-not-allowed opacity-50"
        >
          ↻ 历史回放
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Progress / timing info */}
      {lastTickMs !== null && (
        <span className="text-pixel-xs text-(--text-on-frame-faint) pr-2">
          上次 {Math.round(lastTickMs)}ms
        </span>
      )}
      {!auto && tickProgress && tickProgress.total > 0 && (
        <span className="text-pixel-xs text-(--accent-strong) pr-2">
          {tickProgress.done}/{tickProgress.total}
        </span>
      )}

      {/* Group 6: Inject event */}
      {onOpenInject && (
        <button
          type="button"
          onClick={onOpenInject}
          className="px-4 py-1.5 text-pixel-sm bg-(--danger) text-(--panel) border-2 border-(--danger-shadow) shadow-[inset_0_2px_0_var(--danger-hi),inset_0_-2px_0_var(--danger-shadow)] cursor-pointer hover:brightness-110 active:translate-y-px tracking-[var(--letter-pixel-tight)]"
        >
          ⚡ 投放事件 (E)
        </button>
      )}
    </footer>
  );
}

/* ---- helpers ---- */

function TickBtn({
  children,
  primary,
  disabled,
  onClick,
  title,
}: {
  children: React.ReactNode;
  primary?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`px-2 py-1 text-pixel-sm border border-(--border-amber) cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 ${
        primary
          ? "bg-(--border-amber) text-(--text-on-frame)"
          : "bg-(--frame-2) text-(--text-on-frame)"
      }`}
    >
      {children}
    </button>
  );
}

function SpeedBtn({
  children,
  active,
  disabled,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`px-2 py-1 text-pixel-sm border border-(--border-amber) cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
        active
          ? "bg-(--accent-hi) text-(--border)"
          : "bg-(--frame-2) text-(--text-on-frame)"
      }`}
    >
      {children}
    </button>
  );
}
