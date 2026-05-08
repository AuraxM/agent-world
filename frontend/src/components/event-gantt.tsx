"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import type { Character, MapNode, WorldEvent } from "@/types/api.generated";
import { DEFAULT_TICK_WINDOW, getTickWindow, TICK_WIDTH } from "@/lib/gantt-utils";
import { GanttTimeline } from "./gantt-timeline";
import { GanttRow } from "./gantt-row";
import { GanttPopup } from "./gantt-popup";

export function EventGantt({
  events,
  characters,
  nodes,
  epoch,
  onJumpToNode,
  onSelectCharacter,
  onFollow,
}: {
  events: WorldEvent[];
  characters: Character[];
  nodes: MapNode[];
  epoch: number;
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
      if (!(e.target instanceof HTMLElement && el!.contains(e.target))) return;
      if (e.shiftKey) return;
      // Left of 100px = name column → native vertical scroll
      const rect = el!.getBoundingClientRect();
      if (e.clientX < rect.left + 100) return;
      // Right side = card area → wheel Y → horizontal scroll
      e.preventDefault();
      el!.scrollLeft += e.deltaY;
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

      {/* Body: single scroll container */}
      <div
        ref={scrollRef}
        className="flex-1 pixel-scroll"
        style={{ overflow: "auto" }}
      >
        <div style={{ width: contentWidth + 100, display: "flex", flexDirection: "column" }}>
          <GanttTimeline startTick={startTick} endTick={endTick} epoch={epoch} />

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

      {/* Popup */}
      {selectedEvent && (
        <GanttPopup
          event={selectedEvent}
          characters={characters}
          nodes={nodes}
          epoch={epoch}
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
