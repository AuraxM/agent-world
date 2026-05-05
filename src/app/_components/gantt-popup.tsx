"use client";

import { useEffect, useRef } from "react";
import type { Character, MapNode, WorldEvent } from "@/domain/types";
import { EventCard } from "./event-card";

const POPUP_WIDTH = 380;

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
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    }
    // delay listener to avoid immediate close from the click that opened it
    const id = setTimeout(() => {
      window.addEventListener("keydown", handleKey);
      window.addEventListener("mousedown", handleClick);
    }, 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("mousedown", handleClick);
    };
  }, []);

  const style = computePopupStyle(anchorRect);

  return (
    <div ref={ref} className="gantt-popup" style={style}>
      <button
        type="button"
        onClick={onClose}
        className="text-pixel-sm text-(--text-muted) hover:text-(--text) cursor-pointer"
        style={{
          position: "absolute",
          top: 6,
          right: 8,
          background: "transparent",
          border: "none",
          zIndex: 1,
          lineHeight: 1,
        }}
      >
        ✕
      </button>
      <EventCard
        event={event}
        characters={characters}
        nodes={nodes}
        epoch={epoch}
        onJumpToNode={onJumpToNode}
        onSelectCharacter={onSelectCharacter}
        onFollow={onFollow}
      />
    </div>
  );
}

function computePopupStyle(anchorRect: DOMRect | null): React.CSSProperties {
  if (!anchorRect) {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      maxWidth: POPUP_WIDTH,
      maxHeight: "calc(100vh - 16px)",
      overflowY: "auto",
      zIndex: 100,
    };
  }

  const centerX = anchorRect.left + anchorRect.width / 2;
  let left = centerX - POPUP_WIDTH / 2;
  const viewportW = typeof window === "undefined" ? 0 : window.innerWidth;
  const viewportH = typeof window === "undefined" ? 0 : window.innerHeight;

  // keep within viewport
  if (left < 8) left = 8;
  if (left + POPUP_WIDTH > viewportW - 8) {
    left = viewportW - POPUP_WIDTH - 8;
  }

  let top = anchorRect.bottom + 8;
  const estimatedHeight = 400;
  if (top + estimatedHeight > viewportH - 8) {
    top = anchorRect.top - estimatedHeight - 8;
  }
  if (top < 8) top = 8;

  return {
    position: "fixed",
    top,
    left,
    maxWidth: POPUP_WIDTH,
    width: POPUP_WIDTH,
    maxHeight: "calc(100vh - 16px)",
    overflowY: "auto",
    zIndex: 100,
  };
}
