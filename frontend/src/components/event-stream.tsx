"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Character, MapNode, WorldEvent } from "@/types/api.generated";
import { formatHHMM } from "@/lib/format";
import { EventCard } from "./event-card";
import { CharacterAvatar } from "./character-avatar";

type Filter = "dialogue" | "thinking" | "other";

const FILTER_LABELS: Record<Filter, string> = {
  dialogue: "对话",
  thinking: "思考",
  other: "其他",
};

export function EventStream({
  events,
  characters,
  nodes,
  followingId,
  epoch,
  selectedCharIds,
  onToggleChar,
  hasMore,
  loadingMore,
  onLoadMore,
  onJumpToNode,
  onSelectCharacter,
  onFollow,
}: {
  events: WorldEvent[];
  characters: Character[];
  nodes: MapNode[];
  followingId: string | null;
  epoch: number;
  selectedCharIds: Set<string>;
  onToggleChar: (id: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onJumpToNode: (id: string) => void;
  onSelectCharacter: (c: Character) => void;
  onFollow: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("dialogue");
  const [charDropdownOpen, setCharDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!charDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setCharDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [charDropdownOpen]);

  // Infinite scroll sentinel — root must be the scrollable body so visibility
  // is measured relative to the scroll container, not the viewport.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const body = bodyRef.current;
    if (!sentinel || !body || !hasMore || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { threshold: 0.1, root: body },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  const followedChar = useMemo(() => {
    if (!followingId) return null;
    return characters.find((c) => c.id === followingId) ?? null;
  }, [characters, followingId]);

  const filtered = useMemo(() => {
    let evs = events;

    // Character multi-select filter
    if (selectedCharIds.size < characters.length) {
      evs = evs.filter((ev) =>
        ev.participants.some((pid) => selectedCharIds.has(pid)) ||
        (ev.nodeId != null && characters.some(
          (c) => selectedCharIds.has(c.id) && c.locationId === ev.nodeId
        )) ||
        !ev.nodeId,
      );
    }

    // Follow filter
    if (followedChar) {
      evs = evs.filter(
        (ev) =>
          ev.participants.includes(followingId!) ||
          (ev.nodeId && ev.nodeId === followedChar.locationId) ||
          !ev.nodeId,
      );
    }

    // Type filter
    if (filter === "dialogue") {
      evs = evs.filter((ev) => ev.dialogTranscript && ev.dialogTranscript.length > 0);
    } else if (filter === "thinking") {
      evs = evs.filter((ev) => ev.source === "think");
    } else {
      evs = evs.filter((ev) => !(ev.dialogTranscript && ev.dialogTranscript.length > 0) && ev.source !== "think");
    }

    return evs;
  }, [events, filter, followingId, followedChar, selectedCharIds, characters]);

  // Group by tick (newest first)
  const groups = useMemo(() => {
    const tickMap = new Map<number, WorldEvent[]>();
    for (const ev of filtered) {
      const arr = tickMap.get(ev.tick) ?? [];
      arr.push(ev);
      tickMap.set(ev.tick, arr);
    }
    const ticks = Array.from(tickMap.keys()).sort((a, b) => b - a);
    return ticks.map((tick) => ({ tick, events: tickMap.get(tick)! }));
  }, [filtered]);

  const selectedCount = selectedCharIds.size;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 border-b border-white/10 bg-black/15 flex-shrink-0">
        {followedChar && (
          <span className="text-[11px] text-white/40">跟随中：{followedChar.name} 视角</span>
        )}
        {!followedChar && (
          <span className="text-[11px] text-(--accent-strong) tracking-[0.1em] uppercase">事件流</span>
        )}

        <div className="flex items-center gap-1 ml-auto">
          {(["dialogue", "thinking", "other"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`text-[10px] px-2 py-0.5 border border-white/10 cursor-pointer tracking-[0.1em] rounded transition-colors ${
                filter === f
                  ? "bg-white/10 text-white/90"
                  : "bg-transparent text-white/35 hover:text-white/60 hover:border-white/20"
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}

          {/* Character multi-select dropdown */}
          <div ref={dropdownRef} style={{ position: "relative", marginLeft: 8 }}>
            <button
              type="button"
              onClick={() => setCharDropdownOpen(!charDropdownOpen)}
              className="text-[10px] px-2 py-0.5 bg-transparent border border-white/10 text-white/50 rounded cursor-pointer tracking-[0.1em] hover:text-white/70"
            >
              角色 ▾ ({selectedCount})
            </button>
            {charDropdownOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: 4,
                  zIndex: 50,
                  minWidth: 180,
                  maxHeight: 320,
                  overflowY: "auto",
                  background: "rgba(0,0,0,0.92)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 4,
                  padding: "4px 0",
                }}
              >
                {characters.map((c) => {
                  const checked = selectedCharIds.has(c.id);
                  return (
                    <label
                      key={c.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 10px",
                        cursor: "pointer",
                        fontSize: 11,
                        color: checked ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
                        background: checked ? "rgba(255,255,255,0.06)" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!checked) e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                      }}
                      onMouseLeave={(e) => {
                        if (!checked) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleChar(c.id)}
                        style={{ accentColor: "var(--accent-strong)", width: 12, height: 12 }}
                      />
                      <CharacterAvatar c={c} size={14} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div ref={bodyRef} className="flex-1 overflow-y-auto px-3 md:px-4 py-3">
        {groups.length === 0 ? (
          <p className="text-sm text-white/30 text-center mt-20">
            此分类暂无事件
          </p>
        ) : (
          <>
            {groups.map((group) => (
              <div key={group.tick} className="mb-4">
                <div className="flex items-center gap-2 mb-3 text-white/30 text-[10px] font-mono">
                  <span>T={group.tick} · {formatHHMM(epoch, group.tick)}</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>
                {group.events.map((ev) => (
                  <div key={ev.id} className="mb-3">
                    <EventCard
                      event={ev}
                      characters={characters}
                      nodes={nodes}
                      epoch={epoch}
                      onJumpToNode={onJumpToNode}
                      onSelectCharacter={onSelectCharacter}
                      onFollow={onFollow}
                    />
                  </div>
                ))}
              </div>
            ))}

            {/* Sentinel for infinite scroll */}
            {hasMore && (
              <div ref={sentinelRef} className="text-center text-[11px] text-white/25 py-4">
                {loadingMore ? "加载中…" : "滚动加载更多"}
              </div>
            )}
            {!hasMore && groups.length > 0 && (
              <div className="text-center text-[11px] text-white/15 py-4">
                已加载全部事件
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
