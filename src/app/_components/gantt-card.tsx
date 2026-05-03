// src/app/_components/gantt-card.tsx
"use client";

import type { WorldEvent } from "@/domain/types";
import {
  getCategoryIcon,
  getCategoryStyle,
  getOtherParticipants,
} from "../_lib/gantt-utils";
import type { Character } from "@/domain/types";

export function GanttCard({
  event,
  charById,
  excludeId,
  onClick,
}: {
  event: WorldEvent;
  charById: Map<string, Character>;
  excludeId: string;
  onClick: (rect: DOMRect) => void;
}) {
  const style = getCategoryStyle(event.category);
  const icon = getCategoryIcon(event.category);
  const others = getOtherParticipants(event, charById, excludeId);
  const important = event.intensity >= 3;

  return (
    <button
      type="button"
      className={`gantt-card ${important ? "gantt-card--important" : ""}`}
      style={{
        background: style.bg,
        borderColor: style.border,
      }}
      title={`T=${event.tick} ${event.description}`}
      onClick={(e) => onClick(e.currentTarget.getBoundingClientRect())}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 10, flexShrink: 0 }}>{icon}</span>
        <span
          style={{
            fontWeight: "bold",
            color: "var(--text)",
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
            color: "var(--text-faint)",
            flexShrink: 0,
          }}
        >
          T={event.tick}
        </span>
      </div>
      <div style={{ display: "flex", gap: 3, alignItems: "center", minHeight: 16 }}>
        {event.nodeId && (
          <span className="gantt-card__location">
            📍 {event.nodeId}
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
