"use client";

import { useMemo, useState, useCallback } from "react";
import type { Character, MapNode, WorldEvent } from "@/domain/types";
import { DEFAULT_TICK_WINDOW, getTickWindow } from "../_lib/gantt-utils";
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
  const [tickCount, setTickCount] = useState(DEFAULT_TICK_WINDOW);
  const [selectedEvent, setSelectedEvent] = useState<WorldEvent | null>(null);
  const [popupAnchor, setPopupAnchor] = useState<DOMRect | null>(null);

  const { startTick, endTick } = useMemo(
    () => getTickWindow(events, tickCount),
    [events, tickCount],
  );

  const canGoEarlier = startTick > 0;
  const canGoNewer = tickCount > DEFAULT_TICK_WINDOW;

  const handlePageEarlier = useCallback(() => {
    setTickCount((n) => n + DEFAULT_TICK_WINDOW);
  }, []);

  const handlePageNewer = useCallback(() => {
    setTickCount((n) => Math.max(DEFAULT_TICK_WINDOW, n - DEFAULT_TICK_WINDOW));
  }, []);

  const handleEventClick = useCallback((ev: WorldEvent, rect: DOMRect) => {
    setSelectedEvent(ev);
    setPopupAnchor(rect);
  }, []);

  const handleClosePopup = useCallback(() => {
    setSelectedEvent(null);
    setPopupAnchor(null);
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

  const tickColumns = endTick - startTick + 1;

  return (
    <div className="h-full flex flex-col bg-(--frame)">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-2.5 bg-(--frame-2) border-b-2 border-(--border) shadow-[inset_0_-1px_0_var(--border-amber))]">
        <span className="text-pixel-sm text-(--accent-strong) tracking-[var(--letter-pixel)] uppercase">
          甘特图
        </span>

        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={handlePageEarlier}
            disabled={!canGoEarlier}
            className="text-pixel-xs px-2 py-0.5 border border-(--border-amber) bg-transparent text-(--text-on-frame-muted) cursor-pointer hover:bg-(--border-amber)/20 tracking-[var(--letter-pixel-tight)] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← 更早
          </button>
          <span className="text-pixel-xs text-(--text-on-frame-muted) tracking-[var(--letter-pixel)]">
            T={startTick} ～ T={endTick}
          </span>
          <button
            type="button"
            onClick={handlePageNewer}
            disabled={!canGoNewer}
            className="text-pixel-xs px-2 py-0.5 border border-(--border-amber) bg-transparent text-(--text-on-frame-muted) cursor-pointer hover:bg-(--border-amber)/20 tracking-[var(--letter-pixel-tight)] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            更新 →
          </button>
          <span className="text-pixel-xs text-(--text-on-frame-faint)">
            {characters.length} 角色
          </span>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-auto pixel-scroll">
        {/* Extra width = tickColumns * TICK_WIDTH + 80 (row header) + 8 padding */}
        <div
          style={{
            minWidth: tickColumns * 72 + 80 + 8,
          }}
        >
          <GanttTimeline startTick={startTick} endTick={endTick} />

          <div>
            {characters.map((c) => (
              <GanttRow
                key={c.id}
                character={c}
                events={events}
                startTick={startTick}
                endTick={endTick}
                characters={characters}
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
