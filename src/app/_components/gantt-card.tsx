// src/app/_components/gantt-card.tsx
"use client";

import type { Character, WorldEvent } from "@/domain/types";
import {
  getCategoryIcon,
  getCategoryStyle,
  getCategoryLabel,
  getOtherParticipants,
} from "../_lib/gantt-utils";

export function GanttCard({
  event,
  charById,
  onClick,
}: {
  event: WorldEvent;
  charById: Map<string, Character>;
  onClick: (rect: DOMRect) => void;
}) {
  const style = getCategoryStyle(event.category);
  const icon = getCategoryIcon(event.category);
  const label = getCategoryLabel(event.category);
  const others = getOtherParticipants(event, charById);
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
      <span className="text-body-xs leading-none">{icon}</span>
      <span className="text-pixel-2xs tracking-[var(--letter-pixel-tight)] truncate">
        {label}
      </span>
      {others.length > 0 && (
        <span className="gantt-card__badge">+{others.length}</span>
      )}
    </button>
  );
}
