# Gantt View — Character Event Timeline

**Date:** 2026-05-03
**Status:** designed

## Overview

Add a new Gantt-chart-style event view to the dashboard. Each character gets one row; events appear as compact colored cards placed along a horizontal time axis. Newest events are on the left, and the view scrolls horizontally to see earlier ticks. Clicking a card opens a floating popup with full event details (reusing EventCard).

## Placement

New tab `gantt` in the dashboard center tab bar, between `map` and `relations`:

```
stream | map | gantt | relations
```

## Component Tree

```
EventGantt                      ← top-level container
├── GanttToolbar                ← time window navigation (prev/next, tick range label)
├── GanttTimeline               ← shared time-axis header (tick + game-hour per column)
├── GanttRow × N                ← one row per character
│   ├── GanttRowHeader          ← left-fixed: avatar + character name
│   └── GanttCard × M           ← event cards placed in tick-aligned slots
└── GanttPopup                  ← floating detail popup (renders EventCard inside)
```

## Data Flow

- Reuses the same `WorldEvent[]` and `Character[]` already fetched by `useWorldState`
- `EventGantt` filters events to the current time window, groups by character, and maps to tick columns
- No new API calls required

## Layout Rules

- **Time axis**: horizontal, newest on the left, earlier ticks to the right
- **Tick columns**: fixed equal width (72px), tick number + game hour label in header
- **Rows**: one per character, fixed order (by config file order / character ID)
- **Default window**: 8 ticks visible; horizontal scrollbar for viewing earlier ticks
- **Scrolling**: one shared horizontal scroll container for all rows + timeline header
- **Empty ticks**: blank cells with no content
- **Sleep window**: when a character's chronotype overlaps visible ticks, render a dashed semi-transparent bar spanning those columns, labeled with the sleep window time range

## GanttCard Design

Extremely compact card within a tick column:

- **Background**: semi-transparent color derived from `EventCategory` (uses existing category color scheme)
- **Content**: one emoji/icon representing the event category + short label (2-3 characters)
- **Participants**: when other characters are involved, show a small `+N` badge
- **Hover**: tooltip with brief description (browser native `title` attribute)
- **Click**: opens `GanttPopup` floating panel

## GanttPopup

- Floating panel anchored near the clicked card
- Content: renders the existing `EventCard` component (avatar, actor name, location chip, timestamp, important badge, description, quote, dialog transcript expansion, action buttons)
- Close on: click-away (outside click), Escape key, or close button

## Toolbar

- **Left button**: scroll to earlier ticks (increase tick range)
- **Right button**: scroll to newer ticks (decrease tick range), disabled when already at newest
- **Label**: current tick range (e.g. `T=92 ～ T=99`)
- **Summary**: character count

## Category Color Mapping

Reuse existing EventCard category colors:

| Category | Color | Icon |
|----------|-------|------|
| action | blue | ⚔️ |
| social | green | 🍽️ |
| dialog/social | purple | 💬 |
| inner | gray/italic | 💭 |
| sleep/rest (system) | amber | 💤 |
| env | slate | 🌦️ |
| burst | red | ⚡ |
| quest | gold | 📋 |
| time | muted | 🕐 |

## Files to Create / Modify

### New files
- `src/app/_components/event-gantt.tsx` — top-level Gantt component
- `src/app/_components/gantt-timeline.tsx` — time-axis header row
- `src/app/_components/gantt-row.tsx` — single character row
- `src/app/_components/gantt-card.tsx` — minimal event card for grid
- `src/app/_components/gantt-popup.tsx` — floating detail popup

### Modified files
- `src/app/_components/dashboard.tsx` — add `gantt` tab

## Out of Scope

- Drag-to-reorder character rows
- Category filter (use EventStream's filter if needed)
- Density control (Gantt shows one card per event per tick)
- Tick count configuration UI (hardcode default tick window size)
- Virtualized rendering (not needed for tick window < 50)

## Open Question

- Tick width default: 72px. Fine-tune during implementation based on actual content fit.
