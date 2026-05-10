// src/app/_components/gantt-timeline.tsx
"use client";

import { formatHHMM } from "@/lib/format";
import { TICK_WIDTH, tickRangeDesc } from "@/lib/gantt-utils";

export function GanttTimeline({
  startTick,
  endTick,
  epoch,
}: {
  startTick: number;
  endTick: number;
  epoch: number;
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
        background: "rgba(0,0,0,0.15)",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
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
              className={`text-[10px] ${isNewest ? "text-(--accent-strong)" : "text-white/30"}`}
            >
              T={t}
            </div>
            <div className="text-[10px] text-white/30">
              {formatHHMM(epoch, t)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
