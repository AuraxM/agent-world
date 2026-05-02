"use client";

import { useMemo, useState } from "react";
import type { Character, MapNode, WorldEvent } from "@/domain/types";
import { formatHHMM } from "../_lib/format";
import { EventCard } from "./event-card";

type Filter = "all" | "action" | "inner" | "social" | "other";
type Density = "sparse" | "medium" | "dense";

const FILTER_CATEGORIES: Record<Exclude<Filter, "all">, string[]> = {
  action: ["action"],
  inner: ["inner"],
  social: ["social", "quest", "burst"],
  other: ["time", "env", "system"],
};

const DENSITY_LIMITS: Record<Density, number> = {
  sparse: 2,
  medium: 5,
  dense: Infinity,
};

const FILTER_LABELS: Record<Filter, string> = {
  all: "全部",
  action: "行动",
  inner: "独白",
  social: "互动",
  other: "其他",
};

export function EventStream({
  events,
  characters,
  nodes,
  followingId,
  onJumpToNode,
  onSelectCharacter,
  onFollow,
}: {
  events: WorldEvent[];
  characters: Character[];
  nodes: MapNode[];
  followingId: string | null;
  onJumpToNode: (id: string) => void;
  onSelectCharacter: (c: Character) => void;
  onFollow: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [density, setDensity] = useState<Density>(() => {
    try {
      return (localStorage.getItem("agent-world.stream-density") as Density) ?? "medium";
    } catch {
      return "medium";
    }
  });

  const setDensityWithPersist = (d: Density) => {
    setDensity(d);
    try { localStorage.setItem("agent-world.stream-density", d); } catch {}
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

    // Category filter
    if (filter !== "all") {
      const cats = FILTER_CATEGORIES[filter];
      evs = evs.filter((ev) => cats.includes(ev.category));
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
    <div className="h-full flex flex-col bg-(--frame)">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-2.5 bg-(--frame-2) border-b-2 border-(--border) shadow-[inset_0_-1px_0_var(--border-amber))]">
        <span className="text-pixel-sm text-(--accent-strong) tracking-[var(--letter-pixel)] uppercase">
          事件流
        </span>
        {followedChar && (
          <span className="text-body-xs text-(--text-on-frame-muted)">
            跟随中：{followedChar.name} 视角
          </span>
        )}

        <div className="flex items-center gap-1 ml-auto">
          {(["all", "action", "inner", "social", "other"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`text-pixel-xs px-2 py-0.5 border border-(--border-amber) cursor-pointer tracking-[var(--letter-pixel-tight)] ${
                filter === f
                  ? "bg-(--border-amber) text-(--panel)"
                  : "bg-transparent text-(--text-on-frame-muted) hover:bg-(--border-amber)/20"
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
          <select
            value={density}
            onChange={(e) => setDensityWithPersist(e.target.value as Density)}
            className="ml-2 text-pixel-xs px-2 py-0.5 bg-transparent border border-(--border-amber) text-(--text-on-frame) cursor-pointer tracking-[var(--letter-pixel-tight)]"
          >
            <option value="sparse">密度：稀</option>
            <option value="medium">密度：中</option>
            <option value="dense">密度：密</option>
          </select>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto pixel-scroll px-6 py-4">
        {groups.length === 0 ? (
          <p className="text-body-md text-(--text-on-frame-muted) text-center mt-20">
            {filter !== "all" ? "此分类暂无事件" : "尚无事件…"}
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.tick} className="mb-4">
              {/* Tick separator */}
              <div className="tick-sep mb-3">
                <span>T={group.tick} · {formatHHMM(group.tick)}</span>
                <div className="tick-sep__line" />
              </div>

              {/* Cards */}
              {group.events.map((ev) => (
                <div key={ev.id} className="mb-3">
                  <EventCard
                    event={ev}
                    characters={characters}
                    nodes={nodes}
                    onJumpToNode={onJumpToNode}
                    onSelectCharacter={onSelectCharacter}
                    onFollow={onFollow}
                  />
                </div>
              ))}

              {/* Aggregated row */}
              {group.aggregatedCount > 0 && (
                <div className="ev-card--aggregated mb-3">
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
