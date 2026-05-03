"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import type { Character, MapNode, WorldEvent } from "@/domain/types";
import { DEFAULT_TICK_WINDOW, getTickWindow, TICK_WIDTH } from "../_lib/gantt-utils";
import { NPC_EMOJI, NPC_FALLBACK_EMOJI } from "../_lib/sprite";
import { GanttTimeline } from "./gantt-timeline";
import { GanttRow } from "./gantt-row";
import { GanttPopup } from "./gantt-popup";

export function EventGantt({
  events,
  characters,
  nodes,
  onJumpToNode,
  onSelectCharacter,
  onFollow,
}: {
  events: WorldEvent[];
  characters: Character[];
  nodes: MapNode[];
  onJumpToNode: (id: string) => void;
  onSelectCharacter: (c: Character) => void;
  onFollow: (id: string) => void;
}) {
  const tickCount = useMemo(() => {
    if (events.length === 0) return DEFAULT_TICK_WINDOW;
    const max = Math.max(...events.map((e) => e.tick));
    const min = Math.min(...events.map((e) => e.tick));
    return Math.max(DEFAULT_TICK_WINDOW, max - min + 1);
  }, [events]);
  const [selectedEvent, setSelectedEvent] = useState<WorldEvent | null>(null);
  const [popupAnchor, setPopupAnchor] = useState<DOMRect | null>(null);

  const { startTick, endTick } = useMemo(
    () => getTickWindow(events, tickCount),
    [events, tickCount],
  );

  const tickColumns = endTick - startTick + 1;
  const contentWidth = tickColumns * TICK_WIDTH;

  const handleEventClick = useCallback((ev: WorldEvent, rect: DOMRect) => {
    setSelectedEvent(ev);
    setPopupAnchor(rect);
  }, []);

  const handleClosePopup = useCallback(() => {
    setSelectedEvent(null);
    setPopupAnchor(null);
  }, []);

  // ---- wheel handler: deltaY -> scrollLeft ----
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function handleWheel(e: WheelEvent) {
      // Only hijack if the event target is within the scroll area (not the name column)
      if (e.target instanceof HTMLElement && el!.contains(e.target)) {
        // If Shift is held, let browser handle native horizontal scroll
        if (e.shiftKey) return;
        e.preventDefault();
        el!.scrollLeft += e.deltaY;
      }
    }

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  if (events.length === 0) {
    return (
      <div className="h-full flex flex-col bg-(--frame)">
        <div className="flex items-center px-6 py-2.5 bg-(--frame-2) border-b-2 border-(--border) shadow-[inset_0_-1px_0_var(--border-amber))]">
          <span className="text-pixel-sm text-(--accent-strong) tracking-[var(--letter-pixel)] uppercase">
            甘特图
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center text-(--text-on-frame-muted) text-body-md">
          尚无事件
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-(--frame)">
      {/* Toolbar — no buttons */}
      <div className="flex items-center gap-3 px-6 py-2.5 bg-(--frame-2) border-b-2 border-(--border) shadow-[inset_0_-1px_0_var(--border-amber))]">
        <span className="text-pixel-sm text-(--accent-strong) tracking-[var(--letter-pixel)] uppercase">
          甘特图
        </span>
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-pixel-xs text-(--text-on-frame-muted) tracking-[var(--letter-pixel)]">
            T={startTick} ~ T={endTick}
          </span>
          <span className="text-pixel-xs text-(--text-on-frame-faint)">
            {characters.length} 角色
          </span>
        </div>
      </div>

      {/* Body: flex row — left fixed names + right scrollable */}
      <div className="flex-1 flex" style={{ overflow: "hidden" }}>
        {/* LEFT: fixed character name column */}
        <div
          style={{
            minWidth: 80,
            maxWidth: 80,
            background: "var(--frame)",
            borderRight: "2px solid var(--accent-strong)",
            flexShrink: 0,
            zIndex: 3,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
          }}
          className="pixel-scroll"
        >
          {/* Spacer matching timeline header height */}
          <div style={{ height: 42, borderBottom: "1px solid rgba(184,138,74,0.2)" }} />
          {characters.map((c) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 8px",
                borderBottom: "1px solid rgba(184,138,74,0.1)",
                minHeight: 60,
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
                  background: "var(--frame-2)",
                  flexShrink: 0,
                }}
              >
                {NPC_EMOJI[c.id] ?? NPC_FALLBACK_EMOJI}
              </span>
              <span
                className="text-pixel-xs font-semibold text-(--text-on-frame)"
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {c.name}
              </span>
            </div>
          ))}
        </div>

        {/* RIGHT: scrollable timeline + cards area */}
        <div
          ref={scrollRef}
          className="pixel-scroll"
          style={{ overflow: "auto", flex: 1 }}
        >
          <div style={{ width: contentWidth, display: "flex", flexDirection: "column" }}>
            <GanttTimeline startTick={startTick} endTick={endTick} />

            {characters.map((c) => (
              <GanttRow
                key={c.id}
                character={c}
                events={events}
                startTick={startTick}
                endTick={endTick}
                characters={characters}
                nodes={nodes}
                onEventClick={handleEventClick}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Popup */}
      {selectedEvent && (
        <GanttPopup
          event={selectedEvent}
          characters={characters}
          nodes={nodes}
          anchorRect={popupAnchor}
          onClose={handleClosePopup}
          onJumpToNode={onJumpToNode}
          onSelectCharacter={onSelectCharacter}
          onFollow={onFollow}
        />
      )}
    </div>
  );
}
