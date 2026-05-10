"use client";

import { formatGameTime } from "@/lib/format";

export function TickControl({
  tick,
  epoch,
  loading,
  onAdvance,
  autoMode,
  onStartAuto,
  onStopAuto,
  lastTickMs,
  tickProgress,
}: {
  tick: number;
  epoch: number;
  loading: boolean;
  onAdvance: () => Promise<boolean>;
  autoMode: { running: boolean; total: number; done: number } | null;
  onStartAuto: () => Promise<void>;
  onStopAuto: () => void;
  lastTickMs: number | null;
  tickProgress: { done: number; total: number } | null;
}) {
  const isRunning = autoMode?.running ?? false;

  return (
    <div className="border-t border-white/10 px-3 py-2.5 flex-shrink-0">
      {/* Tick display */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-white/50 font-mono">Tick {tick}</span>
        <span className="text-[9px] text-white/30">{formatGameTime(epoch, tick)}</span>
      </div>

      {/* Progress bar (when loading) */}
      {tickProgress && tickProgress.total > 0 && (
        <div className="h-1 bg-white/5 rounded mb-2 overflow-hidden">
          <div
            className="h-full bg-(--accent-strong)/50 transition-all duration-200"
            style={{ width: `${(tickProgress.done / tickProgress.total) * 100}%` }}
          />
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={loading || isRunning}
          onClick={() => void onAdvance()}
          className={`flex-1 py-1.5 text-[10px] font-mono border transition-colors ${
            loading || isRunning
              ? "bg-white/[0.03] border-white/[0.08] text-white/20 cursor-not-allowed"
              : "bg-(--accent-strong)/10 border-(--accent-strong)/25 text-(--accent-strong) hover:bg-(--accent-strong)/20 cursor-pointer"
          }`}
        >
          TICK
        </button>

        {/* Toggle */}
        <button
          type="button"
          onClick={() => isRunning ? onStopAuto() : onStartAuto()}
          className={`flex-shrink-0 w-9 h-5 border cursor-pointer transition-colors font-pixel text-[7px] ${
            isRunning
              ? "bg-green-400/25 border-green-400/40 text-green-400/70"
              : "bg-white/[0.1] border-white/[0.15] text-white/35"
          }`}
        >
          {isRunning ? "ON" : "OFF"}
        </button>
      </div>

      {/* Last tick ms */}
      {lastTickMs !== null && (
        <div className="text-right mt-1.5 text-[8px] text-white/20">{Math.round(lastTickMs)}ms</div>
      )}
    </div>
  );
}
