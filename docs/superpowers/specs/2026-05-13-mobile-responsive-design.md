# Mobile Responsive Design Spec

## Overview

Make the frontend compatible with mobile devices (phones and tablets) while keeping the PC browser experience largely unchanged. Breakpoint: **768px** (Tailwind `md:` prefix).

## Breakpoint Strategy

| Range | Layout |
|-------|--------|
| < 768px | Mobile layout |
| >= 768px | PC layout (existing behavior preserved) |

Tablet landscape uses PC layout. Tablet portrait uses mobile layout.

## Global Changes

- `body` allow vertical scroll on mobile (`overflow-hidden` only on `md:`)
- All fixed pixel widths use responsive pattern: `w-[Xpx] md:w-[Ypx]`
- Touch targets minimum 44px (iOS HIG)
- Font sizes use responsive scaling where needed

## Page-by-Page Design

### World View (`world-view.tsx`)

| Element | PC (>=768px) | Mobile (<768px) |
|---------|-------------|-----------------|
| Character sidebar | Collapsible 260px / 48px, toggle at bottom | 36px avatar column, expands as overlay covering ~70% width |
| Tab bar | Horizontal tabs at top (4 tabs) | Bottom tab bar, 4 tabs (事件流/甘特图/对话/地图) |
| Profile panel | Slide from right, 420px | Slide from right, 90% viewport width, backdrop overlay |
| Sidebar toggle button | At bottom of sidebar | At bottom of sidebar |

**Collapsed state**: Shows character avatars only in a vertical column. Clicking an avatar selects that character. Expanding shows full list with names.

**Tab labels on mobile**: Shortened as needed to fit 4 tabs in bottom bar width.

### Gantt Chart (inside World View)

- Already supports horizontal scroll via existing Gantt implementation
- Mobile: no layout change needed, user scrolls horizontally
- `TICK_WIDTH` may reduce on mobile for better density

### World Map (`world-map.tsx`)

- Default zoom-to-fit on mobile (scale canvas to viewport)
- Pinch-to-zoom and drag/pan via touch events
- PC: existing 2000px canvas with scroll behavior unchanged

### Hub Layout (`hub-layout.tsx`)

| Element | PC (>=768px) | Mobile (<768px) |
|---------|-------------|-----------------|
| Navigation | 56px left icon bar (unchanged) | Hamburger (☰) in top bar → left slide-out drawer 260px |
| Drawer items | N/A | Mods / Worlds / LLM with icons |

### Mods Gallery

| Element | PC (>=768px) | Mobile (<768px) |
|---------|-------------|-----------------|
| Grid | 4 columns (unchanged) | Single column horizontal cards (`grid-cols-1 md:grid-cols-4`) |
| Card | Icon + title + description in a row |

### Worlds List

| Element | PC (>=768px) | Mobile (<768px) |
|---------|-------------|-----------------|
| Layout | 280px sidebar + content area | Full-screen list; tap opens detail view |

### LLM Config

- Full-width form on mobile, reduced padding (`p-4 md:p-6`)

### Cover Page (`cover.tsx`)

- Title: 144px → responsive `text-[48px] md:text-[144px]`
- Button positioning remains proportional

### Stranger Chat (`stranger-chat.tsx`)

- Character selector in top bar area
- Chat area fills remaining screen
- Input bar at bottom, above mobile tab bar when inside world view

### Event Stream (`event-stream.tsx`)

- Full width on mobile, reduced horizontal padding
- Filter controls may collapse or reduce to essential filters

## Implementation Approach

Use Tailwind CSS v4 responsive prefixes (`md:`) throughout. No additional CSS framework or library.

- **No** new CSS files
- **No** new dependencies
- **No** changes to backend
- One shared component for collapsible sidebar used by both PC and mobile
- Bottom tab bar component created once, used in world-view mobile layout

## Component Changes

Files to modify:
- `world-view.tsx` — responsive sidebar, bottom tab bar, profile panel width
- `hub-layout.tsx` — hamburger drawer on mobile
- `cover.tsx` — responsive title font size
- `event-stream.tsx` — responsive padding/filters
- `stranger-chat.tsx` — mobile layout
- `world-map.tsx` — touch zoom/pan
- `gantt-*.tsx` — responsive tick width, card sizing
- `globals.css` — responsive body overflow, responsive font utilities

Files to create:
- `collapsible-sidebar.tsx` — shared collapsible character sidebar component
- `bottom-tab-bar.tsx` — mobile bottom tab bar component
- `hamburger-drawer.tsx` — mobile hamburger drawer navigation

## Non-Goals

- No backend changes
- No new CSS framework or library
- No PWA/service worker
- No native app wrapper
- No landscape-specific mobile layouts beyond the md: breakpoint
