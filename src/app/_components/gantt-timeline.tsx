// src/app/_components/gantt-timeline.tsx
"use client";

import { formatHHMM } from "../_lib/format";
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
    <div className="gantt-timeline" style={{ display: "flex", paddingLeft: 80, gap: 0 }}>
      {ticks.map((t) => {
        const isNewest = t === endTick;
        return (
          <div
            key={t}
            style={{
              width: TICK_WIDTH,
              minWidth: TICK_WIDTH,
              textAlign: "center",
              padding: "4px 0 2px",
            }}
          >
            <div
              className={`text-pixel-xs tracking-[var(--letter-pixel)] ${isNewest ? "text-(--accent-strong)" : "text-(--text-on-frame-muted)"}`}
            >
              T={t}
            </div>
            <div className="text-pixel-2xs text-(--text-on-frame-faint)">
              {formatHHMM(t)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
