# Gantt View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Gantt-chart event timeline view to the dashboard center tabs.

**Architecture:** Pure utility functions in `_lib/gantt-utils.ts` handle data transformations (tick window calculation, event grouping, category styling). Five React components render the grid: `EventGantt` (container + state), `GanttTimeline` (header), `GanttRow` (per-character), `GanttCard` (minimal cell), `GanttPopup` (floating detail). CSS Grid-like layout via flexbox with fixed-width (72px) tick columns and shared horizontal scrolling.

**Tech Stack:** React, TypeScript, Tailwind CSS + custom CSS variables (pixel theme), Vitest

---

### Task 1: Utility Functions + Tests

**Files:**
- Create: `src/app/_lib/gantt-utils.ts`
- Create: `src/app/_lib/gantt-utils.test.ts`

- [ ] **Step 1: Write the utility module**

```typescript
// src/app/_lib/gantt-utils.ts
import type { WorldEvent, Character, SleepWindow } from "@/domain/types";

export const TICK_WIDTH = 72;
export const DEFAULT_TICK_WINDOW = 8;

export const CATEGORY_ICONS: Record<string, string> = {
  action: "⚔️",
  social: "🍽️",
  burst: "⚡",
  quest: "📋",
  inner: "💭",
  system: "💤",
  time: "🕐",
  env: "🌦️",
};

export const CATEGORY_LABELS: Record<string, string> = {
  action: "行动",
  social: "社交",
  burst: "突发",
  quest: "任务",
  inner: "独白",
  system: "休眠",
  time: "时间",
  env: "环境",
};

export const CATEGORY_STYLES: Record<string, { bg: string; border: string }> = {
  action:  { bg: "rgba(92,156,230,0.25)", border: "rgba(92,156,230,0.45)" },
  social:  { bg: "rgba(108,191,108,0.25)", border: "rgba(108,191,108,0.45)" },
  burst:   { bg: "rgba(239,68,68,0.25)",  border: "rgba(239,68,68,0.45)" },
  quest:   { bg: "rgba(234,179,8,0.25)",  border: "rgba(234,179,8,0.45)" },
  inner:   { bg: "rgba(148,163,184,0.2)", border: "rgba(148,163,184,0.35)" },
  system:  { bg: "rgba(212,168,87,0.2)",  border: "rgba(212,168,87,0.35)" },
  time:    { bg: "rgba(148,163,184,0.15)",border: "rgba(148,163,184,0.3)" },
  env:     { bg: "rgba(148,163,184,0.15)",border: "rgba(148,163,184,0.3)" },
};

export const FALLBACK_STYLE = {
  bg: "rgba(100,100,100,0.15)",
  border: "rgba(100,100,100,0.3)",
};

export function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category] ?? "";
}

export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function getCategoryStyle(category: string): { bg: string; border: string } {
  return CATEGORY_STYLES[category] ?? FALLBACK_STYLE;
}

/** Compute visible tick window: newest at endTick, span back tickCount ticks. */
export function getTickWindow(
  events: WorldEvent[],
  tickCount: number = DEFAULT_TICK_WINDOW,
): { startTick: number; endTick: number } {
  if (events.length === 0) return { startTick: 0, endTick: 0 };
  const maxTick = Math.max(...events.map((e) => e.tick));
  const start = Math.max(0, maxTick - tickCount + 1);
  return { startTick: start, endTick: maxTick };
}

/** Group events by tick for a single character within the tick window. */
export function groupEventsByTick(
  events: WorldEvent[],
  characterId: string,
  startTick: number,
  endTick: number,
): Map<number, WorldEvent[]> {
  const map = new Map<number, WorldEvent[]>();
  // descending: newest at left
  for (let t = endTick; t >= startTick; t--) {
    map.set(t, []);
  }
  for (const ev of events) {
    if (
      ev.tick >= startTick &&
      ev.tick <= endTick &&
      ev.participants.includes(characterId)
    ) {
      map.get(ev.tick)!.push(ev);
    }
  }
  return map;
}

/** Get other participant characters (excluding the first/actor). */
export function getOtherParticipants(
  event: WorldEvent,
  charById: Map<string, Character>,
): Character[] {
  return event.participants
    .slice(1)
    .map((id) => charById.get(id))
    .filter((c): c is Character => c != null);
}

/** Build descending tick array for iteration. */
export function tickRangeDesc(startTick: number, endTick: number): number[] {
  const arr: number[] = [];
  for (let t = endTick; t >= startTick; t--) {
    arr.push(t);
  }
  return arr;
}

/** Check if a tick falls within the character's sleep window. */
export function isSleepTick(tick: number, sleepWindow: SleepWindow): boolean {
  const hour = tick % 24;
  const end = (sleepWindow.start + sleepWindow.duration) % 24;
  if (sleepWindow.start < end) {
    return hour >= sleepWindow.start && hour < end;
  }
  // wraps midnight
  return hour >= sleepWindow.start || hour < end;
}
```

- [ ] **Step 2: Write the tests**

```typescript
// src/app/_lib/gantt-utils.test.ts
import { describe, expect, it } from "vitest";
import {
  getTickWindow,
  groupEventsByTick,
  getOtherParticipants,
  tickRangeDesc,
  isSleepTick,
  getCategoryIcon,
  getCategoryStyle,
} from "./gantt-utils";
import type { WorldEvent } from "@/domain/types";

function mkEvent(overrides: Partial<WorldEvent> = {}): WorldEvent {
  return {
    id: "evt-001",
    worldId: "w-1",
    tick: 100,
    category: "action",
    description: "test event",
    participants: ["char-a"],
    source: "actor",
    intensity: 1,
    scope: "node",
    duration: 1,
    ...overrides,
  };
}

describe("getTickWindow", () => {
  it("returns zero range for empty events", () => {
    expect(getTickWindow([])).toEqual({ startTick: 0, endTick: 0 });
  });

  it("returns window ending at max tick spanning tickCount", () => {
    const events = [
      mkEvent({ tick: 5 }),
      mkEvent({ tick: 100 }),
    ];
    expect(getTickWindow(events, 8)).toEqual({ startTick: 93, endTick: 100 });
  });

  it("clamps start to 0", () => {
    const events = [mkEvent({ tick: 3 })];
    expect(getTickWindow(events, 8)).toEqual({ startTick: 0, endTick: 3 });
  });

  it("single event with default window", () => {
    const events = [mkEvent({ tick: 42 })];
    expect(getTickWindow(events)).toEqual({ startTick: 35, endTick: 42 });
  });
});

describe("groupEventsByTick", () => {
  it("creates buckets for every tick in window descending", () => {
    const events: WorldEvent[] = [];
    const map = groupEventsByTick(events, "char-1", 95, 100);
    // 6 ticks: 100, 99, 98, 97, 96, 95
    expect(map.size).toBe(6);
    // order check via keys
    const keys = [...map.keys()];
    expect(keys[0]).toBe(100);
    expect(keys[keys.length - 1]).toBe(95);
  });

  it("assigns events to correct tick buckets", () => {
    const e1 = mkEvent({ tick: 98, participants: ["char-1"] });
    const e2 = mkEvent({ tick: 99, participants: ["char-2"] }); // other char
    const e3 = mkEvent({ tick: 97, participants: ["char-1"] });
    const map = groupEventsByTick([e1, e2, e3], "char-1", 97, 99);
    expect(map.get(99)).toEqual([]);
    expect(map.get(98)).toEqual([e1]);
    expect(map.get(97)).toEqual([e3]);
  });

  it("excludes events outside window", () => {
    const e1 = mkEvent({ tick: 50, participants: ["char-1"] });
    const map = groupEventsByTick([e1], "char-1", 95, 100);
    for (const evs of map.values()) {
      expect(evs).toHaveLength(0);
    }
  });
});

describe("getOtherParticipants", () => {
  it("returns empty when only the actor", () => {
    const event = mkEvent({ participants: ["char-a"] });
    const charById = new Map();
    expect(getOtherParticipants(event, charById)).toEqual([]);
  });

  it("returns characters after the first participant", () => {
    const event = mkEvent({
      participants: ["char-a", "char-b", "char-c"],
    });
    const charById = new Map([
      ["char-b", { id: "char-b", name: "Bob" } as any],
      ["char-c", { id: "char-c", name: "Cal" } as any],
    ]);
    const others = getOtherParticipants(event, charById);
    expect(others).toHaveLength(2);
    expect(others[0]!.name).toBe("Bob");
  });

  it("skips missing participants", () => {
    const event = mkEvent({
      participants: ["char-a", "char-b", "char-x"],
    });
    const charById = new Map([
      ["char-b", { id: "char-b", name: "Bob" } as any],
    ]);
    const others = getOtherParticipants(event, charById);
    expect(others).toHaveLength(1);
    expect(others[0]!.name).toBe("Bob");
  });
});

describe("tickRangeDesc", () => {
  it("returns descending array", () => {
    expect(tickRangeDesc(97, 100)).toEqual([100, 99, 98, 97]);
  });

  it("single tick range", () => {
    expect(tickRangeDesc(5, 5)).toEqual([5]);
  });
});

describe("isSleepTick", () => {
  it("inside simple window", () => {
    expect(isSleepTick(2, { start: 0, duration: 8 })).toBe(true);
  });

  it("outside simple window", () => {
    expect(isSleepTick(14, { start: 0, duration: 8 })).toBe(false);
  });

  it("wrapped window (start 22, duration 8 -> 22-06)", () => {
    expect(isSleepTick(23, { start: 22, duration: 8 })).toBe(true);
    expect(isSleepTick(3, { start: 22, duration: 8 })).toBe(true);
    expect(isSleepTick(12, { start: 22, duration: 8 })).toBe(false);
  });
});

describe("getCategoryIcon", () => {
  it("maps known category", () => {
    expect(getCategoryIcon("action")).toBe("⚔️");
  });

  it("returns empty for unknown", () => {
    expect(getCategoryIcon("unknown" as any)).toBe("");
  });
});

describe("getCategoryStyle", () => {
  it("maps known category", () => {
    const s = getCategoryStyle("action");
    expect(s.bg).toContain("rgba");
    expect(s.border).toContain("rgba");
  });

  it("returns fallback for unknown", () => {
    const s = getCategoryStyle("unknown" as any);
    expect(s.bg).toBeDefined();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail (file not created yet)**

Run: `npx vitest run src/app/_lib/gantt-utils.test.ts`
Expected: FAIL with module not found

- [ ] **Step 4: Run tests to verify they pass after writing utils**

Run: `npx vitest run src/app/_lib/gantt-utils.test.ts`
Expected: 17+ tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/_lib/gantt-utils.ts src/app/_lib/gantt-utils.test.ts
git commit -m "feat(gantt): add gantt utility functions — tick window, event grouping, category styling"
```

---

### Task 2: GanttCard — Minimal Event Card

**Files:**
- Create: `src/app/_components/gantt-card.tsx`

- [ ] **Step 1: Write the component**

```typescript
// src/app/_components/gantt-card.tsx
"use client";

import type { Character, WorldEvent } from "@/domain/types";
import {
  getCategoryIcon,
  getCategoryStyle,
  getCategoryLabel,
  getOtherParticipants,
} from "../_lib/gantt-utils";

export function GanttCard({
  event,
  charById,
  onClick,
}: {
  event: WorldEvent;
  charById: Map<string, Character>;
  onClick: (rect: DOMRect) => void;
}) {
  const style = getCategoryStyle(event.category);
  const icon = getCategoryIcon(event.category);
  const label = getCategoryLabel(event.category);
  const others = getOtherParticipants(event, charById);
  const important = event.intensity >= 3;

  return (
    <button
      type="button"
      className={`gantt-card ${important ? "gantt-card--important" : ""}`}
      style={{
        background: style.bg,
        borderColor: style.border,
      }}
      title={`T=${event.tick} ${event.description}`}
      onClick={(e) => onClick(e.currentTarget.getBoundingClientRect())}
    >
      <span className="text-body-xs leading-none">{icon}</span>
      <span className="text-pixel-2xs tracking-[var(--letter-pixel-tight)] truncate">
        {label}
      </span>
      {others.length > 0 && (
        <span className="gantt-card__badge">+{others.length}</span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/gantt-card.tsx
git commit -m "feat(gantt): add GanttCard — minimal event cell with category color/icon/participant badge"
```

---

### Task 3: GanttPopup — Floating Detail Popup

**Files:**
- Create: `src/app/_components/gantt-popup.tsx`

- [ ] **Step 1: Write the component**

```typescript
// src/app/_components/gantt-popup.tsx
"use client";

import { useEffect, useRef } from "react";
import type { Character, MapNode, WorldEvent } from "@/domain/types";
import { EventCard } from "./event-card";

const POPUP_WIDTH = 380;

export function GanttPopup({
  event,
  characters,
  nodes,
  anchorRect,
  onClose,
  onJumpToNode,
  onSelectCharacter,
  onFollow,
}: {
  event: WorldEvent;
  characters: Character[];
  nodes: MapNode[];
  anchorRect: DOMRect | null;
  onClose: () => void;
  onJumpToNode: (id: string) => void;
  onSelectCharacter: (c: Character) => void;
  onFollow: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
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
  }, [onClose]);

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
      zIndex: 100,
    };
  }

  const centerX = anchorRect.left + anchorRect.width / 2;
  let left = centerX - POPUP_WIDTH / 2;
  // keep within viewport
  if (left < 8) left = 8;
  if (left + POPUP_WIDTH > window.innerWidth - 8) {
    left = window.innerWidth - POPUP_WIDTH - 8;
  }

  let top = anchorRect.bottom + 8;
  // if too close to bottom, show above
  const estimatedHeight = 300;
  if (top + estimatedHeight > window.innerHeight - 8) {
    top = anchorRect.top - estimatedHeight - 8;
  }
  if (top < 8) top = 8;

  return {
    position: "fixed",
    top,
    left,
    maxWidth: POPUP_WIDTH,
    width: POPUP_WIDTH,
    zIndex: 100,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/gantt-popup.tsx
git commit -m "feat(gantt): add GanttPopup — floating detail panel reusing EventCard"
```

---

### Task 4: GanttTimeline — Time Axis Header

**Files:**
- Create: `src/app/_components/gantt-timeline.tsx`

- [ ] **Step 1: Write the component**

```typescript
// src/app/_components/gantt-timeline.tsx
"use client";

import { formatHHMM } from "../_lib/format";
import { TICK_WIDTH, tickRangeDesc } from "../_lib/gantt-utils";

export function GanttTimeline({
  startTick,
  endTick,
}: {
  startTick: number;
  endTick: number;
}) {
  const ticks = tickRangeDesc(startTick, endTick);

  return (
    <div className="gantt-timeline" style={{ display: "flex", paddingLeft: 80, gap: 0 }}>
      {ticks.map((t) => {
        const isNewest = t === endTick;
        return (
          <div
            key={t}
            style={{
              width: TICK_WIDTH,
              minWidth: TICK_WIDTH,
              textAlign: "center",
              padding: "4px 0 2px",
            }}
          >
            <div
              className={`text-pixel-xs tracking-[var(--letter-pixel)] ${isNewest ? "text-(--accent-strong)" : "text-(--text-on-frame-muted)"}`}
            >
              T={t}
            </div>
            <div className="text-pixel-2xs text-(--text-on-frame-faint)">
              {formatHHMM(t)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/gantt-timeline.tsx
git commit -m "feat(gantt): add GanttTimeline — shared tick header row"
```

---

### Task 5: GanttRow — Character Row with Cards

**Files:**
- Create: `src/app/_components/gantt-row.tsx`

- [ ] **Step 1: Write the component**

```typescript
// src/app/_components/gantt-row.tsx
"use client";

import type { Character, MapNode, WorldEvent } from "@/domain/types";
import { NPC_EMOJI, NPC_FALLBACK_EMOJI } from "../_lib/sprite";
import {
  TICK_WIDTH,
  tickRangeDesc,
  groupEventsByTick,
  isSleepTick,
} from "../_lib/gantt-utils";
import { GanttCard } from "./gantt-card";

export function GanttRow({
  character,
  events,
  startTick,
  endTick,
  characters,
  onEventClick,
}: {
  character: Character;
  events: WorldEvent[];
  startTick: number;
  endTick: number;
  characters: Character[];
  onEventClick: (event: WorldEvent, rect: DOMRect) => void;
}) {
  const charById = new Map(characters.map((c) => [c.id, c]));
  const grouped = groupEventsByTick(events, character.id, startTick, endTick);
  const ticks = tickRangeDesc(startTick, endTick);
  const hasSleepWindow = character.sleepWindow != null;

  return (
    <div className="gantt-row" style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
      {/* Row header: avatar + name */}
      <div
        className="gantt-row__header"
        style={{
          minWidth: 80,
          maxWidth: 80,
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          borderRight: "1px solid var(--border-amber)",
          borderBottom: "1px solid rgba(184,138,74,0.15)",
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
            fontSize: 12,
            background: "var(--frame-2)",
            flexShrink: 0,
          }}
        >
          {NPC_EMOJI[character.id] ?? NPC_FALLBACK_EMOJI}
        </span>
        <span
          className="text-pixel-xs font-semibold text-(--text-on-frame)"
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {character.name}
        </span>
      </div>

      {/* Tick slots */}
      <div style={{ display: "flex", gap: 0, flex: 1 }}>
        {ticks.map((t) => {
          const cellEvents = grouped.get(t) ?? [];

          // Sleep window indicator
          const sleeping = hasSleepWindow && isSleepTick(t, character.sleepWindow!);

          return (
            <div
              key={t}
              style={{
                width: TICK_WIDTH,
                minWidth: TICK_WIDTH,
                minHeight: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "2px 1px",
                borderRight: "1px solid rgba(184,138,74,0.1)",
                borderBottom: "1px solid rgba(184,138,74,0.1)",
                background: sleeping
                  ? "rgba(212,168,87,0.06)"
                  : undefined,
              }}
            >
              {cellEvents.length > 0 ? (
                cellEvents.map((ev) => (
                  <GanttCard
                    key={ev.id}
                    event={ev}
                    charById={charById}
                    onClick={(rect) => onEventClick(ev, rect)}
                  />
                ))
              ) : sleeping ? (
                <span
                  className="text-pixel-2xs text-(--text-on-frame-faint)"
                  style={{ opacity: 0.3 }}
                >
                  💤
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/gantt-row.tsx
git commit -m "feat(gantt): add GanttRow — character row with header + tick-aligned event cards + sleep indicator"
```

---

### Task 6: EventGantt — Top-Level Container

**Files:**
- Create: `src/app/_components/event-gantt.tsx`

- [ ] **Step 1: Write the component**

```typescript
// src/app/_components/event-gantt.tsx
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
        {/* Extra width = tickColumns * TICK_WIDTH + 80 (row header) */}
        <div
          style={{
            minWidth: tickRangeDesc(startTick, endTick).length * TICK_WIDTH + 80,
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
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/event-gantt.tsx
git commit -m "feat(gantt): add EventGantt — top-level container with toolbar, scroll, popup state"
```

---

### Task 7: Integrate into Dashboard

**Files:**
- Modify: `src/app/_components/dashboard.tsx:13,22,103-148`

- [ ] **Step 1: Add import**

At `dashboard.tsx:13` (after other component imports), add:
```typescript
import { EventGantt } from "./event-gantt";
```

- [ ] **Step 2: Add "gantt" to the centerTab type union**

At `dashboard.tsx:22`, change:
```typescript
const [centerTab, setCenterTab] = useState<"stream" | "map" | "relations">("stream");
```
To:
```typescript
const [centerTab, setCenterTab] = useState<"stream" | "map" | "gantt" | "relations">("stream");
```

- [ ] **Step 3: Add "甘特图" tab button and tab content**

In the tab bar (around `dashboard.tsx:104-108`), add `["gantt", "甘特图"]` between `["map", "小地图"]` and `["relations", "关系图"]`:

```typescript
{([
  ["stream", "事件流"],
  ["map", "小地图"],
  ["gantt", "甘特图"],
  ["relations", "关系图"],
] as const).map(([key, label]) => (
```

In the tab content area (around `dashboard.tsx:137`), add the gantt case after the map case:

```typescript
{centerTab === "gantt" && (
  <EventGantt
    events={events}
    characters={snapshot.characters}
    nodes={snapshot.nodes}
    onJumpToNode={view.setCurrentNode}
    onSelectCharacter={(c) => view.selectCharacter(c.id)}
    onFollow={follow}
  />
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/dashboard.tsx
git commit -m "feat(gantt): wire EventGantt into dashboard center tabs"
```

---

### Task 8: CSS Styles

**Files:**
- Modify: `src/app/globals.css` (append after existing ev-card / tick-sep section)

- [ ] **Step 1: Add gantt CSS classes**

Append to `globals.css` after line 431 (end of tick-sep section):

```css
/* ================================================================
 *  GANTT VIEW
 * ================================================================ */

.gantt-card {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px;
  border: var(--ring-1) solid;
  border-radius: 2px;
  cursor: pointer;
  font-family: var(--font-pixel), monospace;
  font-size: var(--font-pixel-2xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: filter 0.1s;
  width: calc(100% - 2px);
}
.gantt-card:hover {
  filter: brightness(1.3);
}

.gantt-card--important {
  box-shadow: inset 0 0 0 var(--ring-1) var(--danger);
}

.gantt-card__badge {
  font-size: 7px;
  color: var(--text-on-frame-faint);
  background: rgba(255,255,255,0.15);
  border-radius: 3px;
  padding: 0 2px;
  line-height: 1.2;
}

.gantt-row__header {
  flex-shrink: 0;
  border-right: var(--ring-1) solid var(--border-amber);
}

.gantt-popup {
  background: var(--panel);
  border: var(--ring-2) solid var(--border);
  box-shadow:
    inset 0 0 0 var(--ring-2) var(--border-amber),
    0 var(--ring-3) var(--sp-3) rgba(0,0,0,0.3);
  border-radius: 2px;
  position: relative;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "style(gantt): add Gantt card/row/popup CSS classes"
```

---

### Task 9: Build Verification

- [ ] **Step 1: Type-check the project**

Run: `npx tsc --noEmit`
Expected: No new type errors

- [ ] **Step 2: Run all unit tests**

Run: `npx vitest run`
Expected: All existing tests still pass + new gantt-utils tests pass

