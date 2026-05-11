# Event Batch Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace full event loading with 40-tick batched loading for event stream (infinite scroll down) and Gantt chart (infinite scroll right), and replace event stream density dropdown with character multi-select filter.

**Architecture:** Backend adds `until` query param for tick-range queries via new `findEventsInRange` repository function. Frontend `use-world-state` manages cumulative loaded event state with a `loadMore` function. EventStream uses IntersectionObserver sentinel; EventGantt uses scroll-boundary detection. Both receive `hasMore`/`loadingMore`/`onLoadMore` props from world-view.

**Tech Stack:** Fastify + Drizzle ORM (backend), React 19 + TypeScript (frontend)

---

## File Structure

| File | Role |
|------|------|
| `backend/src/db/repository/events.ts` | Add `findEventsInRange` with `since`–`until` tick range query |
| `backend/src/systems/store.ts` | Add `loadEventsInRange` wrapper, import new repo function |
| `backend/src/server/routes/worlds.ts` | Accept optional `until` query param on GET `/:id/events` |
| `frontend/src/hooks/use-world-state.ts` | Batch state management: `loadedSince`, `hasMore`, `loadingMore`, `loadMore` |
| `frontend/src/components/event-stream.tsx` | Remove density; add character multi-select dropdown; add IntersectionObserver infinite scroll |
| `frontend/src/components/event-gantt.tsx` | Accept `loadedSince`/`hasMore`/`loadingMore`/`onLoadMore`; horizontal scroll-boundary detection |
| `frontend/src/components/world-view.tsx` | Own `selectedCharIds` state; wire new props to children |

---

### Task 1: Backend — `findEventsInRange` repository function

**Files:**
- Modify: `backend/src/db/repository/events.ts`
- Test: `backend/src/db/repository/events.test.ts` (create)

- [ ] **Step 1: Write the test**

Create `backend/src/db/repository/events.test.ts`:

```ts
import { describe, expect, it } from "vitest";

// findEventsInRange is tested via the store layer integration-style
// because it requires a live DB. This test file validates the SQL
// construction indirectly through loadEventsInRange (Task 2).
//
// For now, verify the function exists and is callable.
describe("findEventsInRange", () => {
  it("is exported from repository", async () => {
    const mod = await import("./events");
    expect(typeof mod.findEventsInRange).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/db/repository/events.test.ts`
Expected: FAIL — `findEventsInRange` is not a function / undefined

- [ ] **Step 3: Add `findEventsInRange` to `backend/src/db/repository/events.ts`**

Replace the import line and add the new function. Current file:

```ts
import { and, desc, eq, gte } from "drizzle-orm";
import { db, schema } from "../client";
import type { WorldEvent } from "../../domain/index";

export function appendEvents(worldId: string, events: WorldEvent[]): void {
  if (events.length === 0) return;
  db.transaction((tx) => {
    for (const ev of events) {
      tx.insert(schema.eventsLog).values({
        id: ev.id, worldId, tick: ev.tick,
        payloadJson: JSON.stringify(ev), createdAt: new Date(),
      }).onConflictDoUpdate({
        target: schema.eventsLog.id,
        set: { tick: ev.tick, payloadJson: JSON.stringify(ev) },
      }).run();
    }
  });
}

export function findEventsSince(worldId: string, sinceTick: number): WorldEvent[] {
  return db.select().from(schema.eventsLog)
    .where(and(eq(schema.eventsLog.worldId, worldId), gte(schema.eventsLog.tick, sinceTick)))
    .orderBy(desc(schema.eventsLog.tick)).all()
    .map((r) => JSON.parse(r.payloadJson) as WorldEvent);
}
```

Change to:

```ts
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "../client";
import type { WorldEvent } from "../../domain/index";

export function appendEvents(worldId: string, events: WorldEvent[]): void {
  if (events.length === 0) return;
  db.transaction((tx) => {
    for (const ev of events) {
      tx.insert(schema.eventsLog).values({
        id: ev.id, worldId, tick: ev.tick,
        payloadJson: JSON.stringify(ev), createdAt: new Date(),
      }).onConflictDoUpdate({
        target: schema.eventsLog.id,
        set: { tick: ev.tick, payloadJson: JSON.stringify(ev) },
      }).run();
    }
  });
}

export function findEventsSince(worldId: string, sinceTick: number): WorldEvent[] {
  return db.select().from(schema.eventsLog)
    .where(and(eq(schema.eventsLog.worldId, worldId), gte(schema.eventsLog.tick, sinceTick)))
    .orderBy(desc(schema.eventsLog.tick)).all()
    .map((r) => JSON.parse(r.payloadJson) as WorldEvent);
}

export function findEventsInRange(
  worldId: string,
  since: number,
  until: number,
): WorldEvent[] {
  return db.select().from(schema.eventsLog)
    .where(and(
      eq(schema.eventsLog.worldId, worldId),
      gte(schema.eventsLog.tick, since),
      lte(schema.eventsLog.tick, until),
    ))
    .orderBy(desc(schema.eventsLog.tick)).all()
    .map((r) => JSON.parse(r.payloadJson) as WorldEvent);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/db/repository/events.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/repository/events.ts backend/src/db/repository/events.test.ts
git commit -m "feat: add findEventsInRange with tick upper-bound filter"
```

---

### Task 2: Backend — store.ts wrapper + routes.ts query param

**Files:**
- Modify: `backend/src/systems/store.ts`
- Modify: `backend/src/server/routes/worlds.ts`

- [ ] **Step 1: Add `loadEventsInRange` to `backend/src/systems/store.ts`**

In the import block, add `findEventsInRange as findEventsInRangeRepo`:

```ts
import {
  getWorldOrThrow,
  findNodesByWorld,
  findCharactersByWorld,
  findShopsByWorld,
  findLatestThoughts,
  findNotebookEntries,
  saveWorldMeta,
  saveAllCharacters,
  appendEvents as appendEventsRepo,
  findEventsSince as findEventsSinceRepo,
  findEventsInRange as findEventsInRangeRepo,
  appendThoughts as appendThoughtsRepo,
  findRecentThoughts as findRecentThoughtsRepo,
  createSnapshot,
} from "../db/index";
```

After `loadEventsSince` (line 93), add:

```ts
export function loadEventsInRange(
  worldId: string,
  since: number,
  until: number,
): WorldEvent[] {
  return findEventsInRangeRepo(worldId, since, until);
}
```

- [ ] **Step 2: Update routes to support `until` param in `backend/src/server/routes/worlds.ts`**

Replace the import (line 15) to also import `loadEventsInRange`:

```ts
import { loadWorld, loadEventsSince, loadEventsInRange } from "../../systems/index";
```

Note: check that `backend/src/systems/index.ts` re-exports from store.ts — if store exports `loadEventsInRange` and index re-exports store, no change needed there.

Check with: `grep "loadEventsSince\|store" backend/src/systems/index.ts`

If `index.ts` does `export * from "./store"`, the new function is auto-exported.

Then replace the event route handler (lines 143–158):

```ts
  // GET /:id/events — event log
  app.get<{ Params: { id: string }; Querystring: { since?: string; until?: string } }>("/:id/events", async (req, reply) => {
    const { id } = req.params;
    const sinceParam = req.query.since;
    const untilParam = req.query.until;
    const since = sinceParam ? Number.parseInt(sinceParam, 10) : 0;
    if (Number.isNaN(since) || since < 0) {
      return reply.status(400).send({ error: "invalid `since` query param" });
    }
    try {
      if (untilParam !== undefined) {
        const until = Number.parseInt(untilParam, 10);
        if (Number.isNaN(until) || until < 0 || until < since) {
          return reply.status(400).send({ error: "invalid `until` query param" });
        }
        const events = loadEventsInRange(id, since, until);
        return reply.send({ events });
      }
      const events = loadEventsSince(id, since);
      return reply.send({ events });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: message });
    }
  });
```

- [ ] **Step 3: Verify the route compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/systems/store.ts backend/src/server/routes/worlds.ts
git commit -m "feat: add until query param to events endpoint for tick-range queries"
```

---

### Task 3: Frontend — batch loading in `use-world-state.ts`

**Files:**
- Modify: `frontend/src/hooks/use-world-state.ts`

- [ ] **Step 1: Add batch loading state and `loadMore`**

In `frontend/src/hooks/use-world-state.ts`, add new state variables after the existing `events` state (after line 43):

```ts
const [events, setEvents] = useState<WorldEvent[]>([]);
const [loadedSince, setLoadedSince] = useState<number | null>(null);
const [hasMore, setHasMore] = useState(false);
const [loadingMore, setLoadingMore] = useState(false);
```

Modify `refresh` (lines 62–87) to do initial batch load. Replace the fetch line for events:

```ts
const refresh = useCallback(async () => {
  if (!worldId) {
    setLoading(false);
    loadingRef.current = false;
    return;
  }
  loadingRef.current = true;
  try {
    const snapRes = await fetch(`/api/worlds/${worldId}`, { cache: "no-store" });
    if (!snapRes.ok) throw new Error(`snapshot ${snapRes.status}`);
    const snap = (await snapRes.json()) as WorldSnapshot;

    const currentTick = snap.world.currentTick;
    const initialSince = Math.max(0, currentTick - 39);
    const evRes = await fetch(
      `/api/worlds/${worldId}/events?since=${initialSince}&until=${currentTick}`,
      { cache: "no-store" },
    );
    if (!evRes.ok) throw new Error(`events ${evRes.status}`);
    const ev = (await evRes.json()) as { events: WorldEvent[] };

    setSnapshot(snap);
    setEvents(ev.events);
    setLoadedSince(initialSince);
    setHasMore(initialSince > 0);
    setError(null);
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
  } finally {
    setLoading(false);
    loadingRef.current = false;
  }
}, [worldId]);
```

Add `loadMore` after `refresh`:

```ts
const loadMore = useCallback(async () => {
  if (!worldId || loadedSince === null || !hasMore || loadingMore) return;
  setLoadingMore(true);
  try {
    const until = loadedSince - 1;
    const since = Math.max(0, loadedSince - 40);
    const res = await fetch(
      `/api/worlds/${worldId}/events?since=${since}&until=${until}`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error(`events ${res.status}`);
    const data = (await res.json()) as { events: WorldEvent[] };
    setEvents((prev) => [...prev, ...data.events]);
    setLoadedSince(since);
    setHasMore(since > 0);
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
  } finally {
    setLoadingMore(false);
  }
}, [worldId, loadedSince, hasMore, loadingMore]);
```

Update the return statement to include the new fields (after `tickProgress`):

```ts
return {
  snapshot,
  events,
  loadedSince,
  hasMore,
  loadingMore,
  loadMore,
  loading,
  error,
  lastTickMs,
  tickProgress,
  refresh,
  advance,
  autoMode,
  startAuto,
  stopAuto,
  templates,
  placeCharacter,
};
```

Update the `UseWorldState` interface (lines 22–37) to include the new fields:

```ts
export interface UseWorldState {
  snapshot: WorldSnapshot | null;
  events: WorldEvent[];
  loadedSince: number | null;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
  loading: boolean;
  error: string | null;
  lastTickMs: number | null;
  tickProgress: { done: number; total: number } | null;
  refresh: () => Promise<void>;
  advance: () => Promise<boolean>;
  autoMode: { running: boolean; total: number; done: number } | null;
  startAuto: (n?: number) => Promise<void>;
  stopAuto: () => void;
  templates: Array<{ id: string; name: string; avatar: string | null }>;
  placeCharacter: (characterId: string) => Promise<boolean>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors (or only pre-existing errors unrelated to our changes)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/use-world-state.ts
git commit -m "feat: add batched event loading with loadMore to use-world-state"
```

---

### Task 4: Frontend — event-stream: character filter + infinite scroll

**Files:**
- Modify: `frontend/src/components/event-stream.tsx`

- [ ] **Step 1: Rewrite `event-stream.tsx`**

Replace the entire file with:

```tsx
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

  // Infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { threshold: 0.1 },
    );
    observer.observe(el);
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
      <div className="flex-1 overflow-y-auto px-4 py-3">
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/event-stream.tsx
git commit -m "feat: replace density with character multi-select filter, add infinite scroll to event stream"
```

---

### Task 5: Frontend — event-gantt: horizontal infinite scroll

**Files:**
- Modify: `frontend/src/components/event-gantt.tsx`

- [ ] **Step 1: Update `event-gantt.tsx`**

Replace the file with:

```tsx
"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import type { Character, MapNode, WorldEvent } from "@/types/api.generated";
import {
  TICK_WIDTH,
  groupEventsByTick,
  stackEventsAtTick,
} from "@/lib/gantt-utils";
import { GanttTimeline } from "./gantt-timeline";
import { GanttRow } from "./gantt-row";
import { GanttPopup } from "./gantt-popup";
import { CharacterAvatar } from "./character-avatar";

const NAME_COL_WIDTH = 100;
const GANTT_BATCH_TICKS = 40;
const SCROLL_THRESHOLD = 200;

export function EventGantt({
  events,
  characters,
  nodes,
  epoch,
  loadedSince,
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
  epoch: number;
  loadedSince: number | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onJumpToNode: (id: string) => void;
  onSelectCharacter: (c: Character) => void;
  onFollow: (id: string) => void;
}) {
  const endTick = useMemo(() => {
    if (events.length === 0) return 0;
    return Math.max(...events.map((e) => e.tick));
  }, [events]);

  const startTick = loadedSince ?? (endTick > 0 ? Math.max(0, endTick - GANTT_BATCH_TICKS + 1) : 0);

  const tickColumns = endTick - startTick + 1;
  const contentWidth = tickColumns * TICK_WIDTH;

  const [selectedEvent, setSelectedEvent] = useState<WorldEvent | null>(null);
  const [popupAnchor, setPopupAnchor] = useState<DOMRect | null>(null);

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

  // Horizontal infinite scroll detection
  const handleCardsScroll = useCallback(() => {
    syncFromCards();
    const el = cardsRef.current;
    if (!el || !hasMore || loadingMore) return;
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - SCROLL_THRESHOLD) {
      onLoadMore();
    }
  }, [syncFromCards, hasMore, loadingMore, onLoadMore]);

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
          {loadingMore && (
            <span className="text-[10px] text-(--accent-strong)">加载中…</span>
          )}
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

          {/* Cards area — scrolls both directions, triggers infinite scroll */}
          <div
            ref={cardsRef}
            className="flex-1"
            style={{ overflow: "auto" }}
            onScroll={handleCardsScroll}
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/event-gantt.tsx
git commit -m "feat: add horizontal infinite scroll and 40-tick window to Gantt"
```

---

### Task 6: Frontend — world-view.tsx: wire everything together

**Files:**
- Modify: `frontend/src/components/world-view.tsx`

- [ ] **Step 1: Update `world-view.tsx`**

Add `selectedCharIds` state and wire new props. The key changes:

Add after `profileId` state (line 19):

```ts
const [selectedCharIds, setSelectedCharIds] = useState<Set<string>>(new Set());
```

Add effect to initialize `selectedCharIds` when snapshot loads:

```ts
useEffect(() => {
  if (!snapshot) return;
  setSelectedCharIds((prev) => {
    // Only initialize if empty (first load)
    if (prev.size === 0) {
      return new Set(snapshot.characters.map((c) => c.id));
    }
    // Add any new characters that appeared since last snapshot
    const next = new Set(prev);
    for (const c of snapshot.characters) {
      if (!next.has(c.id)) next.add(c.id);
    }
    return next;
  });
}, [snapshot]);
```

Add `onToggleChar`:

```ts
const onToggleChar = (id: string) => {
  setSelectedCharIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  });
};
```

Destructure new fields from `useWorldState()` (line 15):

```ts
const { snapshot, events, loadedSince, hasMore, loadingMore, loadMore, loading, error, lastTickMs, tickProgress, advance, autoMode, startAuto, stopAuto } = useWorldState();
```

Update EventStream JSX (lines 92–103):

```tsx
{centerTab === "stream" && (
  <EventStream
    events={events}
    characters={snapshot.characters}
    nodes={snapshot.nodes}
    followingId={followingId}
    epoch={snapshot.world.epoch}
    selectedCharIds={selectedCharIds}
    onToggleChar={onToggleChar}
    hasMore={hasMore}
    loadingMore={loadingMore}
    onLoadMore={loadMore}
    onJumpToNode={view.setCurrentNode}
    onSelectCharacter={(c) => handleSelectCharacter(c.id)}
    onFollow={follow}
  />
)}
```

Update EventGantt JSX (lines 104–113):

```tsx
{centerTab === "gantt" && (
  <EventGantt
    events={events}
    characters={snapshot.characters}
    nodes={snapshot.nodes}
    epoch={snapshot.world.epoch}
    loadedSince={loadedSince}
    hasMore={hasMore}
    loadingMore={loadingMore}
    onLoadMore={loadMore}
    onJumpToNode={view.setCurrentNode}
    onSelectCharacter={(c) => handleSelectCharacter(c.id)}
    onFollow={follow}
  />
)}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/world-view.tsx
git commit -m "feat: wire batch loading and character filter props in world-view"
```

---

### Task 7: End-to-end smoke test

- [ ] **Step 1: Start the dev server and verify**

Run: `pnpm dev`

1. Open `http://localhost:3000`, select a world
2. **Event stream tab:**
   - Verify character dropdown appears (replaces density)
   - Uncheck a character → their events disappear
   - Recheck → events reappear
   - Scroll to bottom → verify "加载中…" then more events load
   - Verify "已加载全部事件" appears when no more events
3. **Gantt tab:**
   - Verify it shows ~40 tick columns
   - Scroll to far right → verify more tick columns load
   - Verify tick range display updates

- [ ] **Step 2: Commit if any fixes were needed**

Only if fixes were required during smoke test.
