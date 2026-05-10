"use client";

import type { Character, MapNode, WorldEvent } from "@/types/api.generated";
import { getCategoryIcon, getOtherParticipants } from "@/lib/gantt-utils";

const CARD_WIDTH = 200;
const EXPANDED_WIDTH = 580;
const TRANSCRIPT_WIDTH = EXPANDED_WIDTH - CARD_WIDTH - 12;

export function GanttCard({
  event,
  charById,
  nodeById,
  excludeId,
  isSelected,
  epoch: _epoch,
  characters,
  nodes,
  onJumpToNode,
  onSelectCharacter,
  onFollow,
  onClick,
}: {
  event: WorldEvent;
  charById: Map<string, Character>;
  nodeById: Map<string, MapNode>;
  excludeId: string;
  isSelected?: boolean;
  epoch: number;
  characters: Character[];
  nodes: MapNode[];
  onJumpToNode: (id: string) => void;
  onSelectCharacter: (c: Character) => void;
  onFollow: (id: string) => void;
  onClick: () => void;
}) {
  const icon = getCategoryIcon(event.category);
  const others = getOtherParticipants(event, charById, excludeId);
  const important = event.intensity >= 3;
  const loc = event.nodeId ? nodeById.get(event.nodeId) : undefined;
  const hasTranscript = event.dialogTranscript && event.dialogTranscript.length > 0;

  return (
    <button
      type="button"
      className={`gantt-card ${important ? "gantt-card--important" : ""} ${isSelected ? "gantt-card--selected" : ""}`}
      title={isSelected ? undefined : `T=${event.tick} ${event.description}`}
      onClick={onClick}
      style={{ width: isSelected ? EXPANDED_WIDTH : CARD_WIDTH }}
    >
      {/* Left: normal card content */}
      <div style={{ width: CARD_WIDTH, flexShrink: 0 }}>
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
      </div>

      {/* Right: expanded transcript */}
      {isSelected && hasTranscript && (
        <div
          style={{
            width: TRANSCRIPT_WIDTH,
            borderLeft: "1px solid rgba(255,255,255,0.1)",
            padding: "4px 8px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {event.dialogTranscript!.map((turn, i) => {
            if (!turn || turn.speakerId === "__system__") return null;
            const speakerName = charById.get(turn.speakerId)?.name ?? turn.speakerId;
            return (
              <div
                key={i}
                style={{
                  fontSize: 9,
                  lineHeight: 1.3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <span style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>
                  {speakerName}：
                </span>
                <span style={{ color: "rgba(255,255,255,0.7)" }}>
                  {turn.line ?? ""}
                </span>
              </div>
            );
          })}
          {event.dialogTranscript!.length > 6 && (
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", textAlign: "center" }}>
              … 共 {event.dialogTranscript!.filter(t => t && t.speakerId !== "__system__").length} 条对话
            </div>
          )}
        </div>
      )}
    </button>
  );
}
