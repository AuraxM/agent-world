"use client";

import { useState, useRef } from "react";
import type { Character, MapNode, WorldEvent } from "@/types/api.generated";
import { characterEmoji } from "@/lib/sprite";
import { formatHHMM } from "@/lib/format";

export function GanttPopup({
  event,
  characters,
  nodes,
  epoch,
  anchorRect,
  onClose,
  onJumpToNode,
  onSelectCharacter,
  onFollow,
}: {
  event: WorldEvent;
  characters: Character[];
  nodes: MapNode[];
  epoch: number;
  anchorRect: DOMRect | null;
  onClose: () => void;
  onJumpToNode: (id: string) => void;
  onSelectCharacter: (c: Character) => void;
  onFollow: (id: string) => void;
}) {
  const [dialogExpanded, setDialogExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const charById = new Map(characters.map((c) => [c.id, c]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const hasTranscript = event.dialogTranscript && event.dialogTranscript.length > 0;
  const transcriptMsgCount = hasTranscript
    ? event.dialogTranscript!.filter((t) => t && t.speakerId !== "__system__").length
    : 0;

  const dialogueSpeakers = hasTranscript
    ? [...new Set(event.dialogTranscript!.filter(
        (t) => t && t.speakerId !== "__system__"
      ).map((t) => t.speakerId))]
        .map((id) => charById.get(id))
        .filter(Boolean) as Character[]
    : [];

  const actor = event.participants.length > 0
    ? charById.get(event.participants[0])
    : undefined;
  const loc = event.nodeId ? nodeById.get(event.nodeId) : undefined;
  const important = event.intensity >= 3;

  const panelWidth = dialogExpanded ? 640 : 320;
  const detailWidth = 320;

  // Compute position: prefer to the right of the anchor card
  let left: number;
  let top: number;
  if (anchorRect) {
    // Try right side first, fallback to left side if it overflows
    if (anchorRect.right + 12 + panelWidth < window.innerWidth - 20) {
      left = anchorRect.right + 12;
    } else {
      left = Math.max(20, anchorRect.left - panelWidth - 12);
    }
    // Align top with card, clamp to keep panel on screen
    top = Math.max(20, Math.min(anchorRect.top, window.innerHeight - 420));
  } else {
    left = (window.innerWidth - panelWidth) / 2;
    top = 120;
  }

  // Close on Escape
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      ref={panelRef}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" />

      {/* Panel */}
      <div
        className="absolute bg-black/80 backdrop-blur-2xl border border-white/10 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden transition-all duration-200"
        style={{ left, top, width: panelWidth, maxHeight: 380 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 bg-white/[0.03] flex-shrink-0">
          {actor && (
            <>
              <span className="text-base">{characterEmoji(actor)}</span>
              <button
                type="button"
                onClick={() => onSelectCharacter(actor)}
                className="text-[12px] font-semibold text-white/80 hover:underline"
              >
                {actor.name}
              </button>
            </>
          )}
          {!actor && dialogueSpeakers.length > 0 && (
            <div className="flex items-center gap-1.5">
              {dialogueSpeakers.map((s, i) => (
                <span key={s.id} className="flex items-center gap-1">
                  <span className="text-base">{characterEmoji(s)}</span>
                  <button
                    type="button"
                    onClick={() => onSelectCharacter(s)}
                    className="text-[12px] font-semibold text-white/80 hover:underline"
                  >
                    {s.name}
                  </button>
                  {i < dialogueSpeakers.length - 1 && (
                    <span className="text-white/30 text-[10px]">·</span>
                  )}
                </span>
              ))}
            </div>
          )}
          {loc && (
            <button
              type="button"
              onClick={() => onJumpToNode(loc.id)}
              className="text-[10px] text-white/40 bg-white/5 px-1.5 py-0.5 rounded hover:bg-white/10"
            >
              📍 {loc.name}
            </button>
          )}
          {important && (
            <span className="text-[9px] bg-(--accent-strong)/20 text-(--accent-strong) px-1.5 py-0.5 rounded">
              ⚠ 重要
            </span>
          )}
          <span className="ml-auto text-[10px] text-white/25 font-mono">
            T={event.tick} · {formatHHMM(epoch, event.tick)}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-white/30 hover:text-white/60 text-sm ml-1"
          >
            ✕
          </button>
        </div>

        {/* Body: side-by-side layout */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Left: event info */}
          <div
            className="flex-shrink-0 overflow-y-auto px-4 py-3 flex flex-col gap-3"
            style={{ width: detailWidth }}
          >
            {/* Description */}
            <div className="text-[13px] text-white/75 leading-[1.6]">
              {event.description}
            </div>

            {/* Inner event quote */}
            {event.category === "inner" && (
              <div className="px-3 py-2 bg-white/[0.04] border-l-[3px] border-white/15 text-white/40 italic text-[11px] leading-[1.75]">
                &ldquo;{event.description}&rdquo;
              </div>
            )}

            {/* Dialog expand button */}
            {hasTranscript && (
              <button
                type="button"
                onClick={() => setDialogExpanded(!dialogExpanded)}
                className="text-[10px] text-(--accent-strong) hover:underline self-start"
              >
                {dialogExpanded
                  ? `收起对话 ▲（${transcriptMsgCount} 条）`
                  : `展开对话 ▼（${transcriptMsgCount} 条）${event.dialogEndedBy ? "" : " · 进行中"}`}
              </button>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 mt-auto pt-2 border-t border-white/5">
              {loc && (
                <button
                  type="button"
                  onClick={() => onJumpToNode(loc.id)}
                  className="text-[10px] text-white/40 border border-white/10 bg-transparent px-2 py-1 rounded hover:bg-white/10 hover:text-white/60 uppercase"
                >
                  📍 跳到地点
                </button>
              )}
              {actor && (
                <>
                  <button
                    type="button"
                    onClick={() => onSelectCharacter(actor)}
                    className="text-[10px] text-white/40 border border-white/10 bg-transparent px-2 py-1 rounded hover:bg-white/10 hover:text-white/60 uppercase"
                  >
                    ⬡ 查看角色
                  </button>
                  <button
                    type="button"
                    onClick={() => onFollow(actor.id)}
                    className="text-[10px] text-white/40 border border-white/10 bg-transparent px-2 py-1 rounded hover:bg-white/10 hover:text-white/60 uppercase"
                  >
                    👁 跟随
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Right: dialog transcript — slides in */}
          {dialogExpanded && hasTranscript && (
            <div className="flex-1 overflow-y-auto border-l border-white/10 px-4 py-3">
              <div className="space-y-2">
                {event.dialogTranscript!.map((turn, i) => {
                  if (!turn) return null;
                  if (turn.speakerId === "__system__") {
                    return (
                      <div key={i} className="flex items-center gap-2 my-2">
                        <div className="flex-1 h-px bg-white/10" />
                        <span className="text-[9px] text-white/25 whitespace-nowrap">
                          {turn.line ?? ""}
                        </span>
                        <div className="flex-1 h-px bg-white/10" />
                      </div>
                    );
                  }
                  const speakerName =
                    charById.get(turn.speakerId)?.name ?? turn.speakerId;
                  return (
                    <div key={i}>
                      <span className="font-semibold text-(--accent-strong) text-[11px]">
                        {speakerName}：
                      </span>
                      <span className="text-[12px] text-white/60">
                        {turn.line ?? ""}
                      </span>
                    </div>
                  );
                })}
                {event.dialogEndedBy && event.dialogEndedBy !== "natural" && (
                  <div className="text-[9px] text-white/25 mt-2 pt-1 border-t border-white/5">
                    结束方式：{event.dialogEndedBy}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
