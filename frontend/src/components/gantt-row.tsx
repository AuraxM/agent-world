"use client";

import type { Character, MapNode, WorldEvent } from "@/types/api.generated";
import {
  TICK_WIDTH,
  groupEventsByTick,
  isSleepTick,
  stackEventsAtTick,
} from "@/lib/gantt-utils";
import { CharacterAvatar } from "./character-avatar";
import { GanttCard } from "./gantt-card";

export function GanttRow({
  character,
  events,
  startTick,
  endTick,
  characters,
  nodes,
  rowHeight,
  onEventClick,
}: {
  character: Character;
  events: WorldEvent[];
  startTick: number;
  endTick: number;
  characters: Character[];
  nodes: MapNode[];
  rowHeight: number;
  onEventClick: (event: WorldEvent, rect: DOMRect) => void;
}) {
  const charById = new Map(characters.map((c) => [c.id, c]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const grouped = groupEventsByTick(events, character.id, startTick, endTick);
  const allRowEvents: WorldEvent[] = [];
  for (const evs of grouped.values()) {
    allRowEvents.push(...evs);
  }
  const stacked = stackEventsAtTick(allRowEvents, endTick);

  const hasSleepWindow = character.sleepWindow != null;
  const sleepTicks: number[] = [];
  if (hasSleepWindow) {
    for (let t = endTick; t >= startTick; t--) {
      if (isSleepTick(t, character.sleepWindow!)) {
        sleepTicks.push(t);
      }
    }
  }

  const sleepRanges: { left: number; width: number }[] = [];
  if (sleepTicks.length > 0) {
    sleepTicks.sort((a, b) => b - a);
    let rangeStart = sleepTicks[0]!;
    let rangeEnd = sleepTicks[0]!;
    for (let i = 1; i < sleepTicks.length; i++) {
      if (sleepTicks[i] === rangeEnd - 1) {
        rangeEnd = sleepTicks[i]!;
      } else {
        sleepRanges.push({
          left: (endTick - rangeStart) * TICK_WIDTH,
          width: (rangeStart - rangeEnd + 1) * TICK_WIDTH,
        });
        rangeStart = sleepTicks[i]!;
        rangeEnd = sleepTicks[i]!;
      }
    }
    sleepRanges.push({
      left: (endTick - rangeStart) * TICK_WIDTH,
      width: (rangeStart - rangeEnd + 1) * TICK_WIDTH,
    });
  }

  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        height: rowHeight,
        background: "rgba(255,255,255,0.02)",
        boxSizing: "border-box",
      }}
    >
      {/* Sticky name cell */}
      <div
        style={{
          minWidth: 100,
          maxWidth: 100,
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          borderRight: "2px solid var(--accent-strong)",
          background: "rgba(0,0,0,0.15)",
          position: "sticky",
          left: 0,
          zIndex: 2,
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            background: "rgba(255,255,255,0.05)",
            flexShrink: 0,
          }}
        >
          <CharacterAvatar c={character} size={18} />
        </span>
        <span
          className="text-pixel-xs font-semibold text-white/70"
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {character.name}
        </span>
      </div>

      {/* Cards area */}
      <div style={{ flex: 1, position: "relative" }}>
        {stacked.map(({ event, left, top }) => (
          <div key={event.id} style={{ position: "absolute", left, top }}>
            <GanttCard
              event={event}
              charById={charById}
              nodeById={nodeById}
              excludeId={character.id}
              onClick={(rect) => onEventClick(event, rect)}
            />
          </div>
        ))}

        {sleepRanges.map((r, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: r.left,
              top: rowHeight - 12,
              width: r.width,
              height: 8,
              background: "rgba(255,255,255,0.05)",
              border: "1px dashed rgba(255,255,255,0.1)",
              borderRadius: 1,
              pointerEvents: "none",
            }}
          />
        ))}
      </div>
    </div>
  );
}
