"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import type { Character, MapNode, WorldEvent } from "@/types/api.generated";
import {
  DEFAULT_TICK_WINDOW,
  getTickWindow,
  TICK_WIDTH,
  groupEventsByTick,
  isSleepTick,
  stackEventsAtTick,
} from "@/lib/gantt-utils";
import { GanttTimeline } from "./gantt-timeline";
import { GanttRow } from "./gantt-row";
import { GanttPopup } from "./gantt-popup";
import { CharacterAvatar } from "./character-avatar";

const NAME_COL_WIDTH = 100;

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

  // Pre-compute row heights (same logic as GanttRow)
  const rowHeights = useMemo(() => {
    return characters.map((c) => {
      const grouped = groupEventsByTick(events, c.id, startTick, endTick);
      const allRowEvents: WorldEvent[] = [];
      for (const evs of grouped.values()) allRowEvents.push(...evs);
      const stacked = stackEventsAtTick(allRowEvents, endTick);
      const maxTop = stacked.length > 0
        ? Math.max(...stacked.map((s) => s.top))
        : 0;
      return Math.max(60, maxTop + 54 + 12);
    });
  }, [events, characters, startTick, endTick]);

  const handleEventClick = useCallback((ev: WorldEvent, rect: DOMRect) => {
    setSelectedEvent(ev);
    setPopupAnchor(rect);
  }, []);

  const handleClosePopup = useCallback(() => {
    setSelectedEvent(null);
    setPopupAnchor(null);
  }, []);

  // Scroll sync refs
  const cardsRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const namesRef = useRef<HTMLDivElement>(null);

  const syncing = useRef(false);

  // Cards → timeline + names
  const syncFromCards = useCallback(() => {
    if (syncing.current) return;
    syncing.current = true;
    const cards = cardsRef.current;
    if (cards) {
      if (timelineRef.current) timelineRef.current.scrollLeft = cards.scrollLeft;
      if (namesRef.current) namesRef.current.scrollTop = cards.scrollTop;
    }
    syncing.current = false;
  }, []);

  // Names → cards (vertical)
  const syncFromNames = useCallback(() => {
    if (syncing.current) return;
    syncing.current = true;
    if (cardsRef.current && namesRef.current) {
      cardsRef.current.scrollTop = namesRef.current.scrollTop;
    }
    syncing.current = false;
  }, []);

  // Timeline → cards (horizontal)
  const syncFromTimeline = useCallback(() => {
    if (syncing.current) return;
    syncing.current = true;
    if (cardsRef.current && timelineRef.current) {
      cardsRef.current.scrollLeft = timelineRef.current.scrollLeft;
    }
    syncing.current = false;
  }, []);

  // Wheel handler: deltaY -> scrollLeft in the cards area
  useEffect(() => {
    const el = cardsRef.current;
    if (!el) return;

    function handleWheel(e: WheelEvent) {
      if (!(e.target instanceof HTMLElement && el!.contains(e.target))) return;
      if (e.shiftKey) return;
      e.preventDefault();
      el!.scrollLeft += e.deltaY;
    }

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  if (events.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center px-4 py-2 bg-black/15 border-b border-white/10">
          <span className="text-[11px] text-(--accent-strong) tracking-[0.1em] uppercase">
            甘特图
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center text-white/40 text-body-md">
          尚无事件
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-black/15 border-b border-white/10 flex-shrink-0">
        <span className="text-[11px] text-(--accent-strong) tracking-[0.1em] uppercase">
          甘特图
        </span>
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-[10px] text-white/40">
            T={startTick} ~ T={endTick}
          </span>
          <span className="text-[10px] text-white/25">
            {characters.length} 角色
          </span>
        </div>
      </div>

      {/* Body: four-quadrant layout */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top row: corner + timeline */}
        <div className="flex flex-shrink-0 overflow-hidden">
          {/* Corner */}
          <div
            style={{
              width: NAME_COL_WIDTH,
              flexShrink: 0,
              background: "rgba(0,0,0,0.35)",
              backdropFilter: "blur(8px)",
              borderBottom: "1px solid rgba(255,255,255,0.1)",
              borderRight: "1px solid rgba(255,255,255,0.1)",
              zIndex: 2,
            }}
          />
          {/* Timeline — syncs horizontal scroll */}
          <div
            ref={timelineRef}
            className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-hide"
            onScroll={syncFromTimeline}
          >
            <div style={{ width: contentWidth }}>
              <GanttTimeline startTick={startTick} endTick={endTick} epoch={epoch} />
            </div>
          </div>
        </div>

        {/* Bottom row: names + cards */}
        <div className="flex-1 flex overflow-hidden">
          {/* Name column — syncs vertical scroll */}
          <div
            ref={namesRef}
            className="overflow-y-auto overflow-x-hidden flex-shrink-0 scrollbar-hide"
            onScroll={syncFromNames}
            style={{ width: NAME_COL_WIDTH }}
          >
            {characters.map((c, i) => (
              <div
                key={c.id}
                style={{
                  height: rowHeights[i],
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  borderRight: "2px solid var(--accent-strong)",
                  background: "rgba(0,0,0,0.35)",
                  backdropFilter: "blur(8px)",
                  boxSizing: "border-box",
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
                  <CharacterAvatar c={c} size={18} />
                </span>
                <span
                  className="text-pixel-xs font-semibold text-white/70"
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

          {/* Cards area — scrolls both directions */}
          <div
            ref={cardsRef}
            className="flex-1"
            style={{ overflow: "auto" }}
            onScroll={syncFromCards}
          >
            <div style={{ width: contentWidth }}>
              {characters.map((c, i) => (
                <GanttRow
                  key={c.id}
                  character={c}
                  events={events}
                  startTick={startTick}
                  endTick={endTick}
                  characters={characters}
                  nodes={nodes}
                  rowHeight={rowHeights[i]}
                  onEventClick={handleEventClick}
                />
              ))}
            </div>
          </div>
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
