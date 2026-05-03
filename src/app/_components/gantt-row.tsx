// src/app/_components/gantt-row.tsx
"use client";

import type { Character, MapNode, WorldEvent } from "@/domain/types";
import { NPC_EMOJI, NPC_FALLBACK_EMOJI } from "../_lib/sprite";
import {
  TICK_WIDTH,
  tickRangeDesc,
  groupEventsByTick,
  isSleepTick,
} from "../_lib/gantt-utils";
import { GanttCard } from "./gantt-card";

export function GanttRow({
  character,
  events,
  startTick,
  endTick,
  characters,
  onEventClick,
}: {
  character: Character;
  events: WorldEvent[];
  startTick: number;
  endTick: number;
  characters: Character[];
  onEventClick: (event: WorldEvent, rect: DOMRect) => void;
}) {
  const charById = new Map(characters.map((c) => [c.id, c]));
  const grouped = groupEventsByTick(events, character.id, startTick, endTick);
  const ticks = tickRangeDesc(startTick, endTick);
  const hasSleepWindow = character.sleepWindow != null;

  return (
    <div className="gantt-row" style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
      {/* Row header: avatar + name */}
      <div
        className="gantt-row__header"
        style={{
          minWidth: 80,
          maxWidth: 80,
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          borderRight: "1px solid var(--border-amber)",
          borderBottom: "1px solid rgba(184,138,74,0.15)",
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
            fontSize: 12,
            background: "var(--frame-2)",
            flexShrink: 0,
          }}
        >
          {NPC_EMOJI[character.id] ?? NPC_FALLBACK_EMOJI}
        </span>
        <span
          className="text-pixel-xs font-semibold text-(--text-on-frame)"
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {character.name}
        </span>
      </div>

      {/* Tick slots */}
      <div style={{ display: "flex", gap: 0, flex: 1 }}>
        {ticks.map((t) => {
          const cellEvents = grouped.get(t) ?? [];

          // Sleep window indicator
          const sleeping = hasSleepWindow && isSleepTick(t, character.sleepWindow!);

          return (
            <div
              key={t}
              style={{
                width: TICK_WIDTH,
                minWidth: TICK_WIDTH,
                minHeight: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "2px 1px",
                borderRight: "1px solid rgba(184,138,74,0.1)",
                borderBottom: "1px solid rgba(184,138,74,0.1)",
                background: sleeping
                  ? "rgba(212,168,87,0.06)"
                  : undefined,
              }}
            >
              {cellEvents.length > 0 ? (
                cellEvents.map((ev) => (
                  <GanttCard
                    key={ev.id}
                    event={ev}
                    charById={charById}
                    onClick={(rect) => onEventClick(ev, rect)}
                  />
                ))
              ) : sleeping ? (
                <span
                  className="text-pixel-2xs text-(--text-on-frame-faint)"
                  style={{ opacity: 0.3 }}
                >
                  💤
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
