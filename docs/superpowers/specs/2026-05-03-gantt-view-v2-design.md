# Gantt View v2 — Event Timeline Redesign

**Date:** 2026-05-03
**Status:** designed

## Overview

Redesign the Gantt chart event view with larger event cards (event-stream style), wheel-based horizontal time-axis scrolling, and tick-aligned card positioning. Replaces the previous micro-card + button-pagination design.

## Placement

Same tab `gantt` in dashboard center tab bar, between `map` and `relations`.

## Component Tree

```
EventGantt                         ← top-level container
├── Toolbar                        ← tick range label + character count (no buttons)
├── Body (flex row)
│   ├── Left: CharacterNameColumn  ← fixed 80px, no horizontal scroll
│   │   └── NameCell × N           ← avatar + name, one per character
│   └── Right: ScrollArea          ← overflow:auto, contains scrollbar
│       ├── GanttTimeline          ← sticky top, tick columns
│       ├── GanttRow × N           ← position:relative, contains absolutely-positioned cards
│       │   └── GanttCard × M       ← position:absolute, left = (maxTick - tick) × TICK_WIDTH
│       └── SleepOverlay           ← dashed bar spanning sleep window ticks
└── GanttPopup                     ← floating detail popup (reuses EventCard)
```

## Data Flow

- Reuses `WorldEvent[]` and `Character[]` from `useWorldState`
- `EventGantt` computes visible tick window from event data, groups events by tick per character
- No new API calls required

## Layout Rules

### Time Axis
- **Direction**: newest tick on the left, earlier ticks to the right (descending)
- **TICK_WIDTH**: `100px` per tick column
- **Default visible window**: all ticks with events shown; horizontal scroll for overflow
- **Tick header**: shows `T=N` + `HH:MM` per column, newest tick highlighted with accent color
- **Timeline header**: `position: sticky; top: 0` inside the scroll area

### Character Rows
- **Left column**: fixed 80px, avatar emoji + character name, `border-right: 2px solid --accent-strong`
- **Row order**: fixed by config file / character ID
- Each row is `position: relative`, min-height based on max stacked cards at any tick
- **Sleep window**: dashed semi-transparent bar spanning the sleep tick range

### Card Positioning
- Cards are `position: absolute` within each row
- `left = (maxTick - event.tick) × TICK_WIDTH` px
- Cards at the same tick stack vertically: `top += 52px` per additional card
- Card size: `200 × 48px`, fixed

## Card Design

Uses the same visual style as `.ev-card` (event stream cards): `--panel` background, `--border` border, `inset 0 0 0 1px var(--border-amber)` shadow.

### Card Content
| Field | Display | Notes |
|-------|---------|-------|
| Icon | ✅ emoji | Category emoji |
| Description | ✅ single-line truncated | Event description, NOT character name |
| Tick time | ✅ `T=NN` | Top-right small text |
| Location | ✅ chip | `📍 name` |
| Participants | ✅ `+N` badge | Excluding row's own character |
| Important | ✅ left red bar | `intensity >= 3`, `::before` pseudo-element |
| Character name | ❌ | Already shown in row header |
| Avatar | ❌ | Already shown in row header |
| Action buttons | ❌ | Available in popup |

### Hover / Click
- **Hover**: browser native `title` attribute with `T=N description`
- **Click**: opens `GanttPopup` floating panel with full EventCard

## Scrolling Behavior

### Horizontal (Time Axis)
- **Primary**: mouse wheel over card area → `deltaY` translated to `scrollLeft`
  - Implemented via `wheel` event listener with `e.preventDefault()`
  - Only activates when mouse is over the right-side scroll area
- **Fallback**: `Shift + wheel` → native browser horizontal scroll
- **Scrollbar**: `pixel-scroll` styled, appears only under the card/timeline area (right side)

### Vertical (Characters)
- **Primary**: mouse wheel over character name column → normal vertical scroll
- Mouse wheel over card area → horizontal scroll only (no vertical component)
- Vertical scrollbar on the right side of the scroll area when all rows exceed viewport

### Implementation Note
The scroll area container has `overflow: auto`. The `wheel` event handler:
1. Checks if the event target is within the scrollable timeline area
2. If yes: `e.preventDefault()`, `container.scrollLeft += e.deltaY`
3. If no (character name column): let browser handle normally

## Toolbar

- **Title**: "甘特图" (accent style)
- **Tick range**: `T={start} ~ T={end}` (right-aligned)
- **Character count**: `{N} 角色`
- **No pagination buttons**

## Sleep Window

When a character's `sleepWindow` overlaps visible ticks:
- A dashed semi-transparent amber bar spans the sleep ticks: `width = duration × TICK_WIDTH`
- Positioned below the card row content
- `background: rgba(212,168,87,0.15); border: 1px dashed rgba(212,168,87,0.3)`

## GanttPopup

- Floating panel anchored near clicked card (reuses existing implementation)
- Uses `getBoundingClientRect()` for positioning with viewport clamping
- Close on: click-away, Escape key, or close button
- Renders existing `EventCard` with all actions

## Category Mapping

Reuse existing category icons, labels, and color styles from `gantt-utils.ts`.

## Files to Modify

### Modified
- `src/app/_components/event-gantt.tsx` — rewrite: split layout, wheel handler, remove buttons
- `src/app/_components/gantt-timeline.tsx` — wider tick columns (100px)
- `src/app/_components/gantt-row.tsx` — absolute card positioning, vertical stacking
- `src/app/_components/gantt-card.tsx` — event-card style, description instead of label
- `src/app/_components/gantt-popup.tsx` — likely unchanged (reuse)
- `src/app/_lib/gantt-utils.ts` — TICK_WIDTH 72→100, add stacking helpers if needed
- `src/app/globals.css` — update gantt-card styles to match ev-card

### Unchanged
- `src/app/_components/dashboard.tsx` — tab already added
- `src/app/_components/event-card.tsx` — reused in popup

## Out of Scope

- Drag-to-reorder character rows
- Category filter
- Density control
- Virtualized rendering
- Tick count configuration UI
