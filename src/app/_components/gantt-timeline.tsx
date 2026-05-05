// src/app/_components/gantt-timeline.tsx
"use client";

import { DEFAULT_EPOCH_MS, formatHHMM } from "../_lib/format";
import { TICK_WIDTH, tickRangeDesc } from "../_lib/gantt-utils";

export function GanttTimeline({
  startTick,
  endTick,
}: {
  startTick: number;
  endTick: number;
}) {
  const ticks = tickRangeDesc(startTick, endTick);

  return (
    <div
      className="gantt-timeline"
      style={{
        display: "flex",
        gap: 0,
        paddingLeft: 100,
        position: "sticky",
        top: 0,
        zIndex: 3,
        background: "var(--frame)",
        borderBottom: "1px solid rgba(184,138,74,0.2)",
      }}
    >
      {ticks.map((t) => {
        const isNewest = t === endTick;
        return (
          <div
            key={t}
            style={{
              width: TICK_WIDTH,
              minWidth: TICK_WIDTH,
              maxWidth: TICK_WIDTH,
              textAlign: "center",
              padding: "4px 0 2px",
              boxSizing: "border-box",
              position: "relative",
            }}
          >
            <div
              className={`text-pixel-xs tracking-[var(--letter-pixel)] ${isNewest ? "text-(--accent-strong)" : "text-(--text-on-frame-muted)"}`}
            >
              T={t}
            </div>
            <div className="text-pixel-2xs text-(--text-on-frame-faint)">
              {formatHHMM(DEFAULT_EPOCH_MS, t)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
