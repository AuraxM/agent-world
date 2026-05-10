// src/app/_components/gantt-card.tsx
"use client";

import type { MapNode, WorldEvent } from "@/types/api.generated";
import {
  getCategoryIcon,
  getOtherParticipants,
} from "@/lib/gantt-utils";
import type { Character } from "@/types/api.generated";

export function GanttCard({
  event,
  charById,
  nodeById,
  excludeId,
  onClick,
}: {
  event: WorldEvent;
  charById: Map<string, Character>;
  nodeById: Map<string, MapNode>;
  excludeId: string;
  onClick: (rect: DOMRect) => void;
}) {
  const icon = getCategoryIcon(event.category);
  const others = getOtherParticipants(event, charById, excludeId);
  const important = event.intensity >= 3;
  const loc = event.nodeId ? nodeById.get(event.nodeId) : undefined;

  return (
    <button
      type="button"
      className={`gantt-card ${important ? "gantt-card--important" : ""}`}
      title={`T=${event.tick} ${event.description}`}
      onClick={(e) => onClick(e.currentTarget.getBoundingClientRect())}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 10, flexShrink: 0 }}>{icon}</span>
        <span
          style={{
            fontWeight: "bold",
            color: "rgba(255,255,255,0.8)",
            fontSize: 10,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {event.description}
        </span>
        <span
          style={{
            fontSize: 8,
            color: "rgba(255,255,255,0.25)",
            flexShrink: 0,
          }}
        >
          T={event.tick}
        </span>
      </div>
      <div style={{ display: "flex", gap: 3, alignItems: "center", minHeight: 16 }}>
        {loc && (
          <span className="gantt-card__location">
            📍 {loc.name}
          </span>
        )}
        {others.length > 0 && (
          <span className="gantt-card__badge">+{others.length}</span>
        )}
        {important && (
          <span className="gantt-card__important-badge">⚠ 重要</span>
        )}
      </div>
    </button>
  );
}
