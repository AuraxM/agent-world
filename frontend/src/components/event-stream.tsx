"use client";

import { useMemo, useState } from "react";
import type { Character, MapNode, WorldEvent } from "@/types/api.generated";
import { formatHHMM } from "@/lib/format";
import { EventCard } from "./event-card";

type Filter = "dialogue" | "thinking" | "other";
type Density = "sparse" | "medium" | "dense";

const DENSITY_LIMITS: Record<Density, number> = {
  sparse: 2,
  medium: 5,
  dense: Infinity,
};

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
  onJumpToNode,
  onSelectCharacter,
  onFollow,
}: {
  events: WorldEvent[];
  characters: Character[];
  nodes: MapNode[];
  followingId: string | null;
  epoch: number;
  onJumpToNode: (id: string) => void;
  onSelectCharacter: (c: Character) => void;
  onFollow: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("dialogue");
  const [density, setDensity] = useState<Density>(() => {
    try {
      return (localStorage.getItem("agent-world.stream-density") as Density) ?? "medium";
    } catch {
      return "medium";
    }
  });

  const setDensityWithPersist = (d: Density) => {
    setDensity(d);
    try { localStorage.setItem("agent-world.stream-density", d); } catch { /* intentionally empty: storage unavailable, fall back to in-memory state */ }
  };

  // Find followed character
  const followedChar = useMemo(() => {
    if (!followingId) return null;
    return characters.find((c) => c.id === followingId) ?? null;
  }, [characters, followingId]);

  // Filter + follow-filter events
  const filtered = useMemo(() => {
    let evs = events;

    // Follow filter
    if (followedChar) {
      evs = evs.filter(
        (ev) =>
          ev.participants.includes(followingId!) ||
          (ev.nodeId && ev.nodeId === followedChar.locationId) ||
          !ev.nodeId, // global events always stay
      );
    }

    // Filter by type
    if (filter === "dialogue") {
      evs = evs.filter((ev) => ev.dialogTranscript && ev.dialogTranscript.length > 0);
    } else if (filter === "thinking") {
      evs = evs.filter((ev) => ev.source === "think");
    } else {
      evs = evs.filter((ev) => !(ev.dialogTranscript && ev.dialogTranscript.length > 0) && ev.source !== "think");
    }

    return evs;
  }, [events, filter, followingId, followedChar]);

  // Group by tick + aggregate per density
  const groups = useMemo(() => {
    const tickMap = new Map<number, WorldEvent[]>();
    for (const ev of filtered) {
      const arr = tickMap.get(ev.tick) ?? [];
      arr.push(ev);
      tickMap.set(ev.tick, arr);
    }

    // Sort ticks descending (newest first)
    const ticks = Array.from(tickMap.keys()).sort((a, b) => b - a);

    // Per tick: split important + non-important, limit non-important
    const limit = DENSITY_LIMITS[density];
    return ticks.map((tick) => {
      const tickEvents = tickMap.get(tick)!;
      const important = tickEvents.filter((ev) => ev.intensity >= 3);
      const nonImportant = tickEvents.filter((ev) => ev.intensity < 3);

      if (limit < nonImportant.length) {
        const shown = nonImportant.slice(0, limit);
        return {
          tick,
          events: [...important, ...shown],
          aggregatedCount: nonImportant.length - limit,
          aggregatedFrom: nonImportant.slice(limit),
        };
      }

      return { tick, events: tickEvents, aggregatedCount: 0, aggregatedFrom: [] };
    });
  }, [filtered, density]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10 bg-black/15 flex-shrink-0">
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
          <select
            value={density}
            onChange={(e) => setDensityWithPersist(e.target.value as Density)}
            className="ml-2 text-[10px] px-2 py-0.5 bg-transparent border border-white/10 text-white/50 rounded cursor-pointer tracking-[0.1em]"
          >
            <option value="sparse">密度：稀</option>
            <option value="medium">密度：中</option>
            <option value="dense">密度：密</option>
          </select>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {groups.length === 0 ? (
          <p className="text-sm text-white/30 text-center mt-20">
            此分类暂无事件
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.tick} className="mb-4">
              {/* Tick separator */}
              <div className="flex items-center gap-2 mb-3 text-white/30 text-[10px] font-mono">
                <span>T={group.tick} · {formatHHMM(epoch, group.tick)}</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Cards */}
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

              {/* Aggregated row */}
              {group.aggregatedCount > 0 && (
                <div className="text-center text-[11px] text-white/25 border border-dashed border-white/10 rounded px-3 py-2 cursor-pointer hover:text-white/40 mb-3">
                  ⊕ 同时刻{" "}
                  {group.aggregatedFrom.slice(0, 3).map((ev) => {
                    const loc = ev.nodeId ? nodes.find((n) => n.id === ev.nodeId) : null;
                    return loc ? ` ${loc.name}` : "";
                  }).join(" /")}{" "}
                  共 {group.aggregatedCount} 条次要事件 — 点击展开
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
