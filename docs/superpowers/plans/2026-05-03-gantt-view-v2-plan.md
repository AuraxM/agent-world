# Gantt View v2 — Event Timeline Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Gantt chart from micro-cards + button pagination to event-card-style cards + wheel-based horizontal scrolling with tick-aligned absolute positioning.

**Architecture:** Split the Gantt body into a left fixed character-name column (80px) and a right scrollable timeline area. Cards use `position: absolute` within each character row, positioned by `left = (maxTick - event.tick) × TICK_WIDTH`. A `wheel` event handler on the scroll container translates vertical delta to horizontal scroll. No new files — all changes are rewrites of existing components and utilities.

**Tech Stack:** Next.js 15 App Router, React/TypeScript, Tailwind CSS + custom CSS variables, Vitest (node environment)

---

### Task 1: Update gantt-utils — TICK_WIDTH + stackEventsAtTick

**Files:**
- Modify: `src/app/_lib/gantt-utils.ts`
- Test: `src/app/_lib/gantt-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

In `gantt-utils.test.ts`, add a new describe block for `stackEventsAtTick`:

```typescript
import {
  getTickWindow,
  groupEventsByTick,
  getOtherParticipants,
  tickRangeDesc,
  isSleepTick,
  getCategoryIcon,
  getCategoryLabel,
  getCategoryStyle,
  stackEventsAtTick,
  TICK_WIDTH,
} from "./gantt-utils";

describe("TICK_WIDTH", () => {
  it("is 100", () => {
    expect(TICK_WIDTH).toBe(100);
  });
});

describe("stackEventsAtTick", () => {
  it("returns empty for empty events", () => {
    expect(stackEventsAtTick([], 100)).toEqual([]);
  });

  it("assigns positions for events at different ticks", () => {
    const events = [
      mkEvent({ id: "e1", tick: 99 }),
      mkEvent({ id: "e2", tick: 98 }),
    ];
    const stacked = stackEventsAtTick(events, 100);
    expect(stacked).toHaveLength(2);
    // Both at top=6 (first card at each tick)
    expect(stacked[0]!.top).toBe(6);
    expect(stacked[1]!.top).toBe(6);
    // left = (maxTick - event.tick) * TICK_WIDTH
    expect(stacked[0]!.left).toBe(100);  // (100-99)*100
    expect(stacked[1]!.left).toBe(200);  // (100-98)*100
  });

  it("stacks events at same tick vertically", () => {
    const events = [
      mkEvent({ id: "e1", tick: 99 }),
      mkEvent({ id: "e2", tick: 99 }),
    ];
    const stacked = stackEventsAtTick(events, 100);
    expect(stacked).toHaveLength(2);
    expect(stacked[0]!.top).toBe(6);
    expect(stacked[1]!.top).toBe(58); // 6 + 52
    expect(stacked[0]!.left).toBe(100);
    expect(stacked[1]!.left).toBe(100);
  });

  it("handles triple stack", () => {
    const events = [
      mkEvent({ id: "e1", tick: 99 }),
      mkEvent({ id: "e2", tick: 99 }),
      mkEvent({ id: "e3", tick: 99 }),
    ];
    const stacked = stackEventsAtTick(events, 100);
    expect(stacked).toHaveLength(3);
    expect(stacked[0]!.top).toBe(6);
    expect(stacked[1]!.top).toBe(58);
    expect(stacked[2]!.top).toBe(110);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
npx vitest run src/app/_lib/gantt-utils.test.ts
```
Expected: FAIL — `TICK_WIDTH` should be 72 but test expects 100; `stackEventsAtTick` is not exported.

- [ ] **Step 3: Change TICK_WIDTH and implement stackEventsAtTick**

In `gantt-utils.ts`, change line 3:

```typescript
export const TICK_WIDTH = 100;
```

Add at end of file:

```typescript
export type StackedEvent = {
  event: WorldEvent;
  left: number;
  top: number;
};

/**
 * Compute absolute positions for events within a character row.
 * left = (maxTick - event.tick) × TICK_WIDTH
 * Events at the same tick stack vertically: first at top=6, each subsequent +52.
 */
export function stackEventsAtTick(
  events: WorldEvent[],
  maxTick: number,
): StackedEvent[] {
  // Group by tick
  const byTick = new Map<number, WorldEvent[]>();
  for (const ev of events) {
    const arr = byTick.get(ev.tick) ?? [];
    arr.push(ev);
    byTick.set(ev.tick, arr);
  }

  const result: StackedEvent[] = [];
  for (const [tick, evs] of byTick) {
    const left = (maxTick - tick) * TICK_WIDTH;
    for (let i = 0; i < evs.length; i++) {
      result.push({
        event: evs[i]!,
        left,
        top: 6 + i * 52,
      });
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
npx vitest run src/app/_lib/gantt-utils.test.ts
```
Expected: PASS (all existing + new tests, 25 total)

- [ ] **Step 5: Commit**

```bash
git add src/app/_lib/gantt-utils.ts src/app/_lib/gantt-utils.test.ts
git commit -m "feat(gantt): TICK_WIDTH 72→100, add stackEventsAtTick utility"
```

---

### Task 2: Update gantt-card CSS to match ev-card style

**Files:**
- Modify: `src/app/globals.css` (lines 437–468)

- [ ] **Step 1: Replace gantt-card CSS**

Replace the existing `.gantt-card` block (lines 437–452) with:

```css
.gantt-card {
  position: absolute;
  width: 200px;
  height: 48px;
  background: var(--panel);
  border: var(--ring-2) solid var(--border);
  box-shadow:
    inset 0 0 0 var(--ring-2) var(--border-amber),
    0 var(--ring-1) 0 var(--border-soft);
  padding: 4px 6px;
  font-family: var(--font-pixel), monospace;
  font-size: var(--font-pixel-2xs);
  box-sizing: border-box;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  z-index: 1;
}

.gantt-card:hover {
  filter: brightness(1.1);
}
```

Replace `.gantt-card--important` (lines 457–459) with:

```css
.gantt-card--important {
  border-color: var(--danger);
  box-shadow:
    inset 0 0 0 var(--ring-2) var(--danger),
    0 var(--ring-1) 0 var(--border-soft);
}

.gantt-card--important::before {
  content: "";
  position: absolute;
  left: calc(-1 * var(--ring-2));
  top: calc(-1 * var(--ring-2));
  bottom: calc(-1 * var(--ring-2));
  width: 4px;
  background: var(--danger);
}
```

Replace `.gantt-card__badge` (lines 461–468) with:

```css
.gantt-card__badge {
  font-size: 7px;
  color: var(--text-on-frame);
  background: color-mix(in srgb, var(--border-amber) 20%, transparent);
  border-radius: 3px;
  padding: 0 3px;
  line-height: 1.4;
  white-space: nowrap;
}

.gantt-card__location {
  font-size: 7px;
  color: var(--text-on-frame-muted);
  border: var(--ring-1) solid var(--border-amber);
  padding: 0 3px;
  white-space: nowrap;
}

.gantt-card__important-badge {
  font-size: 7px;
  color: var(--panel);
  background: var(--danger);
  padding: 0 3px;
  white-space: nowrap;
}
```

- [ ] **Step 2: Run TypeScript check + tests**

```
npx tsc --noEmit 2>&1 | head -5
npx vitest run
```
Expected: no TS errors; 191 tests pass (no test changes in this task)

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style(gantt): update card CSS to ev-card panel style, absolute positioning, 200x48px"
```

---

### Task 3: Rewrite gantt-card component

**Files:**
- Modify: `src/app/_components/gantt-card.tsx`

- [ ] **Step 1: Rewrite the component**

Replace entire file content:

```typescript
// src/app/_components/gantt-card.tsx
"use client";

import type { WorldEvent } from "@/domain/types";
import {
  getCategoryIcon,
  getCategoryStyle,
  getOtherParticipants,
} from "../_lib/gantt-utils";
import type { Character } from "@/domain/types";

export function GanttCard({
  event,
  charById,
  excludeId,
  onClick,
}: {
  event: WorldEvent;
  charById: Map<string, Character>;
  excludeId: string;
  onClick: (rect: DOMRect) => void;
}) {
  const style = getCategoryStyle(event.category);
  const icon = getCategoryIcon(event.category);
  const others = getOtherParticipants(event, charById, excludeId);
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
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 10, flexShrink: 0 }}>{icon}</span>
        <span
          style={{
            fontWeight: "bold",
            color: "var(--text)",
            fontSize: 10,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {event.description}
        </span>
        <span
          style={{
            fontSize: 8,
            color: "var(--text-faint)",
            flexShrink: 0,
          }}
        >
          T={event.tick}
        </span>
      </div>
      <div style={{ display: "flex", gap: 3, alignItems: "center", minHeight: 16 }}>
        {event.nodeId && (
          <span className="gantt-card__location">
            📍 {event.nodeId}
          </span>
        )}
        {others.length > 0 && (
          <span className="gantt-card__badge">+{others.length}</span>
        )}
        {important && (
          <span className="gantt-card__important-badge">⚠ 重要</span>
        )}
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/gantt-card.tsx
git commit -m "feat(gantt): rewrite card — event description, location chip, ev-card style"
```

---

### Task 4: Update gantt-timeline — wider tick columns

**Files:**
- Modify: `src/app/_components/gantt-timeline.tsx`

- [ ] **Step 1: Update the component for wider ticks and sticky positioning**

Replace `TICK_WIDTH` usage — already imported from gantt-utils, so the value change does most of the work. Add `position: sticky; top: 0` and remove the `paddingLeft: 80` since the left column is now separate:

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
    <div
      className="gantt-timeline"
      style={{
        display: "flex",
        gap: 0,
        position: "sticky",
        top: 0,
        zIndex: 3,
        background: "var(--frame)",
        borderBottom: "1px solid rgba(184,138,74,0.2)",
      }}
    >
      {ticks.map((t) => {
        const isNewest = t === endTick;
        return (
          <div
            key={t}
            style={{
              width: TICK_WIDTH,
              minWidth: TICK_WIDTH,
              maxWidth: TICK_WIDTH,
              textAlign: "center",
              padding: "4px 0 2px",
              boxSizing: "border-box",
              position: "relative",
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

- [ ] **Step 2: Run TypeScript check**

```
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/gantt-timeline.tsx
git commit -m "feat(gantt): wider tick columns (100px), sticky header, remove left padding"
```

---

### Task 5: Rewrite gantt-row — absolute positioning + vertical stacking

**Files:**
- Modify: `src/app/_components/gantt-row.tsx`

- [ ] **Step 1: Rewrite the component**

Replace entire file content:

```typescript
// src/app/_components/gantt-row.tsx
"use client";

import type { Character, WorldEvent } from "@/domain/types";
import {
  TICK_WIDTH,
  groupEventsByTick,
  isSleepTick,
  stackEventsAtTick,
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
  const allRowEvents: WorldEvent[] = [];
  for (const evs of grouped.values()) {
    allRowEvents.push(...evs);
  }
  const stacked = stackEventsAtTick(allRowEvents, endTick);

  const hasSleepWindow = character.sleepWindow != null;
  const sleepTicks: number[] = [];
  if (hasSleepWindow) {
    for (let t = endTick; t >= startTick; t--) {
      if (isSleepTick(t, character.sleepWindow!)) {
        sleepTicks.push(t);
      }
    }
  }

  // Compute row height: max top + 54px card height + padding
  const maxTop = stacked.length > 0
    ? Math.max(...stacked.map((s) => s.top))
    : 0;
  const rowHeight = Math.max(60, maxTop + 54 + 12);

  // Sleep bar: find contiguous sleep ranges
  let sleepRanges: { left: number; width: number }[] = [];
  if (sleepTicks.length > 0) {
    sleepTicks.sort((a, b) => b - a); // descending
    let rangeStart = sleepTicks[0]!;
    let rangeEnd = sleepTicks[0]!;
    for (let i = 1; i < sleepTicks.length; i++) {
      if (sleepTicks[i] === rangeEnd - 1) {
        rangeEnd = sleepTicks[i]!;
      } else {
        sleepRanges.push({
          left: (endTick - rangeStart) * TICK_WIDTH,
          width: (rangeStart - rangeEnd + 1) * TICK_WIDTH,
        });
        rangeStart = sleepTicks[i]!;
        rangeEnd = sleepTicks[i]!;
      }
    }
    sleepRanges.push({
      left: (endTick - rangeStart) * TICK_WIDTH,
      width: (rangeStart - rangeEnd + 1) * TICK_WIDTH,
    });
  }

  return (
    <div
      className="gantt-row"
      style={{
        position: "relative",
        minHeight: rowHeight,
        borderBottom: "1px solid rgba(184,138,74,0.1)",
      }}
    >
      {stacked.map(({ event, left, top }) => (
        <div key={event.id} style={{ position: "absolute", left, top }}>
          <GanttCard
            event={event}
            charById={charById}
            excludeId={character.id}
            onClick={(rect) => onEventClick(event, rect)}
          />
        </div>
      ))}

      {/* Sleep window bars */}
      {sleepRanges.map((r, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: r.left,
            top: rowHeight - 12,
            width: r.width,
            height: 8,
            background: "rgba(212,168,87,0.15)",
            border: "1px dashed rgba(212,168,87,0.3)",
            borderRadius: 1,
            pointerEvents: "none",
          }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/gantt-row.tsx
git commit -m "feat(gantt): absolute card positioning, vertical stacking, sleep bar per contiguous range"
```

---

### Task 6: Rewrite event-gantt — split layout + wheel handler

**Files:**
- Modify: `src/app/_components/event-gantt.tsx`

- [ ] **Step 1: Rewrite the component**

Replace entire file content:

```typescript
"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import type { Character, MapNode, WorldEvent } from "@/domain/types";
import { DEFAULT_TICK_WINDOW, getTickWindow, TICK_WIDTH } from "../_lib/gantt-utils";
import { NPC_EMOJI, NPC_FALLBACK_EMOJI } from "../_lib/sprite";
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

  // ---- wheel handler: deltaY → scrollLeft ----
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function handleWheel(e: WheelEvent) {
      // Only hijack if the event target is within the scroll area (not the name column)
      if (e.target instanceof HTMLElement && el!.contains(e.target)) {
        // If Shift is held, let browser handle native horizontal scroll
        if (e.shiftKey) return;
        e.preventDefault();
        el!.scrollLeft += e.deltaY;
      }
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
            T={startTick} ～ T={endTick}
          </span>
          <span className="text-pixel-xs text-(--text-on-frame-faint)">
            {characters.length} 角色
          </span>
        </div>
      </div>

      {/* Body: flex row — left fixed + right scrollable */}
      <div className="flex-1 flex" style={{ overflow: "hidden" }}>
        {/* LEFT: fixed character name column */}
        <div
          style={{
            minWidth: 80,
            maxWidth: 80,
            background: "var(--frame)",
            borderRight: "2px solid var(--accent-strong)",
            flexShrink: 0,
            zIndex: 3,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
          }}
          className="pixel-scroll"
        >
          {/* Spacer matching timeline header height */}
          <div style={{ height: 42, borderBottom: "1px solid rgba(184,138,74,0.2)" }} />
          {characters.map((c) => (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 8px",
                borderBottom: "1px solid rgba(184,138,74,0.1)",
                minHeight: 60,
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
                  background: "var(--frame-2)",
                  flexShrink: 0,
                }}
              >
                {NPC_EMOJI[c.id] ?? NPC_FALLBACK_EMOJI}
              </span>
              <span
                className="text-pixel-xs font-semibold text-(--text-on-frame)"
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

        {/* RIGHT: scrollable timeline + cards */}
        <div
          ref={scrollRef}
          className="pixel-scroll"
          style={{ overflow: "auto", flex: 1 }}
        >
          <div style={{ width: contentWidth, display: "flex", flexDirection: "column" }}>
            <GanttTimeline startTick={startTick} endTick={endTick} />

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

- [ ] **Step 2: Run TypeScript check + tests**

```
npx tsc --noEmit
npx vitest run
```
Expected: no TS errors; all tests pass

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/event-gantt.tsx
git commit -m "feat(gantt): split layout, wheel-to-horizontal-scroll, remove pagination buttons"
```

---

### Task 7: Verify gantt-popup still works

**Files:**
- Verify: `src/app/_components/gantt-popup.tsx`

- [ ] **Step 1: Review the component**

Read the file. The popup receives `event`, `characters`, `nodes`, `anchorRect`, `onClose`, and action callbacks — all unchanged from v1. The EventCard it renders is also unchanged. No modifications needed.

- [ ] **Step 2: Run full test suite**

```
npx vitest run
```
Expected: all tests pass (no regressions)

- [ ] **Step 3: Commit (if any minor fixes needed, or skip)**

If no changes needed:
```bash
echo "gantt-popup unchanged — reuses existing EventCard popup"
```

---

### Task 8: Final integration test — gantt-utils.test full coverage

**Files:**
- Verify: `src/app/_lib/gantt-utils.test.ts`

- [ ] **Step 1: Run full test suite with verbose output**

```
npx vitest run --reporter=verbose
```
Expected: all test files pass, including 25 gantt-utils tests (22 original + 3 new TICK_WIDTH/stackEventsAtTick tests)

- [ ] **Step 2: Run TypeScript check across entire project**

```
npx tsc --noEmit
```
Expected: zero errors

- [ ] **Step 3: Final commit if any cleanup**

```bash
# Only if there are any remaining changes
git status
```
