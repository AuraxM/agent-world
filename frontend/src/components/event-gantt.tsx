"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import type { Character, MapNode, WorldEvent } from "@/types/api.generated";
import { DEFAULT_TICK_WINDOW, getTickWindow, TICK_WIDTH } from "@/lib/gantt-utils";
import { GanttTimeline } from "./gantt-timeline";
import { GanttRow } from "./gantt-row";

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
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const { startTick, endTick } = useMemo(
    () => getTickWindow(events, tickCount),
    [events, tickCount],
  );

  const tickColumns = endTick - startTick + 1;
  const contentWidth = tickColumns * TICK_WIDTH;

  const handleEventClick = useCallback((ev: WorldEvent) => {
    setSelectedEventId((prev) => (prev === ev.id ? null : ev.id));
  }, []);

  // ---- wheel handler: deltaY -> scrollLeft ----
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function handleWheel(e: WheelEvent) {
      if (!(e.target instanceof HTMLElement && el!.contains(e.target))) return;
      if (e.shiftKey) return;
      const rect = el!.getBoundingClientRect();
      if (e.clientX < rect.left + 100) return;
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
      <div className="flex items-center gap-3 px-4 py-2 bg-black/15 border-b border-white/10">
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

      {/* Scrollable body */}
      <div
        ref={scrollRef}
        className="flex-1"
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
              selectedEventId={selectedEventId}
              epoch={epoch}
              onEventClick={handleEventClick}
              onJumpToNode={onJumpToNode}
              onSelectCharacter={onSelectCharacter}
              onFollow={onFollow}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
