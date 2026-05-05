# Mobile Responsive Design

## Scope

Full responsive adaptation of the agent-world dashboard: desktop (≥1024px), tablet (768–1023px), phone (<768px). All existing features remain available on all breakpoints. Approach: pure CSS responsive with media queries (方案 A).

## Breakpoints & Layout

| Breakpoint | Width | Layout |
|---|---|---|
| Desktop | ≥1024px | 3-column Grid `200px 1fr 360px` (unchanged) |
| Tablet | 768–1023px | 2-column `200px 1fr`, ProfilePane becomes side drawer |
| Phone | <768px | Single column full-screen + bottom tab bar |

### Phone layout structure

```
+--------------------+
| TopBar (compact)   |
+--------------------+
| Tab Content        |
| (full-screen area) |
+--------------------+
| TickBar (compact)  |
+--------------------+
| [Stream][Map][Gantt][Relations][Chars] |  ← bottom tab bar
+--------------------+
```

Dashboard grid switches to `flex flex-col` at <768px. Tab content uses `display: none/block` (not conditional render) to preserve state across tab switches.

### Tablet layout

Two columns: TreeSidebar (200px) + center area. ProfilePane slides in from right as an overlay (positioned `fixed` or `absolute`, covers center area partially), triggered by character selection. Same `onSelectCharacter` flow, only the render target changes. Tap outside or close button dismisses.

## Tab Bar (phone only)

| Tab | Label | Content |
|---|---|---|
| Stream | 事件流 | EventStream |
| Map | 地图 | MapStage |
| Gantt | 甘特图 | EventGantt |
| Relations | 关系图 | RelationGraph |
| Characters | 角色 | TreeSidebar (tree nav on top) + ProfilePane below |

Selecting a character on Map triggers auto-switch to Characters tab.

## Interaction Adaptations

### Hover → Touch

- `node-tile:hover` → `:active`
- Gantt card hover popup → click-to-open
- Relation graph hover popover → click node to show
- Long-press (300ms timer) for secondary actions (follow character)

### Scrolling

All content areas: `overflow-y: auto` + `-webkit-overflow-scrolling: touch`.

### Drawers & Modals

- InjectDrawer: full-screen modal overlay on phone
- ProfilePane drawer on tablet: slides from right, swipe-to-close

## Component Adaptations

### TopBar
- Phone: hide breadcrumb, keep world name + time
- Shrink icon buttons to 28×28px touch targets

### TickBar
- Keep core controls (step, auto input, inject)
- Shrink spacing, input to w-12
- Timing/progress text wraps or truncates

### EventStream
- Cards: 100% width, reduced padding
- `ev-card` font: `--font-body-md` → `--font-body-sm`
- Quote blocks: reduced padding

### MapStage
- Node tiles scale with viewport (`vw` units)
- NPC chips: 22px
- Exit-current-node button: screen-edge snap

### EventGantt
- Gantt cards: 200px → 100px width
- Timeline: horizontal scroll via `overflow-x: auto`
- Character row labels: `position: sticky; left: 0`

### RelationGraph
- Full-screen canvas, pinch-zoom + drag
- Node radius: -20%
- Double-tap node → select + switch to Characters tab

### ProfilePane
- 100% width, no fixed constraint
- Internal tabs (attributes/relations/memories/notebook) keep horizontal scroll
- Content scrolls vertically

### TreeSidebar
- Embedded in Characters tab, tree nodes horizontal scroll on top
- NPC list: 2–3 column grid, large touch targets

## CSS Strategy

Media queries go into `globals.css` and individual component `<style>` blocks. Use Tailwind responsive prefixes (`md:`, `lg:`) where feasible; fall back to `@media` queries for non-Tailwind custom properties.

No new dependencies. No component splitting. Desktop behavior unchanged.

## New Components

### MobileTabBar
New file: `src/app/_components/mobile-tab-bar.tsx`. Renders only at <768px via CSS `hidden md:hidden lg:hidden`. Props: `activeTab`, `onTabChange`. Five tabs as defined above. Each tab icon is an emoji + label. Active tab highlighted with `--accent-strong`.

Dashboard imports and renders `<MobileTabBar>` inside the bottom area alongside TickBar. On desktop/tablet, it's `display: none`.

## Testing

- Visual regression: compare desktop layout at ≥1024px with current state
- Touch interaction: verify all hover-replaced interactions on phone emulation
- Tab switching: state preserved across tab changes
- Tablet drawer: open/close ProfilePane overlay
