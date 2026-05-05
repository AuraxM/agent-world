# Mobile Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adapt the agent-world dashboard for phone (<768px), tablet (768-1023px), and desktop (≥1024px) using pure CSS responsive with media queries.

**Architecture:** Add responsive breakpoint variables and utility classes in globals.css. Modify Dashboard grid layout to switch between 3-col, 2-col, and single-col + tab bar. Adapt each component for mobile sizing/touch via CSS. One new component: MobileTabBar. No new dependencies.

**Tech Stack:** React, TypeScript, Tailwind CSS v4, CSS custom properties, no additional libs.

---

### Task 1: Add responsive breakpoint CSS variables and utility classes

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add breakpoint CSS variables and mobile utility classes**

Insert after the `--font-body` declaration block (before the node tile palettes section):

```css
/* ================================================================
 *  RESPONSIVE BREAKPOINTS
 * ================================================================ */

:root {
  --bp-tablet: 768px;
  --bp-desktop: 1024px;
}

/* Hide on mobile (show only tablet+) */
@media (max-width: 767px) {
  .hide-on-mobile {
    display: none !important;
  }
}

/* Hide on mobile+tablet (show only desktop) */
@media (max-width: 1023px) {
  .hide-on-narrow {
    display: none !important;
  }
}

/* Show only on mobile */
.show-on-mobile {
  display: none;
}
@media (max-width: 767px) {
  .show-on-mobile {
    display: block;
  }
}

/* Show only on tablet */
.show-on-tablet {
  display: none;
}
@media (min-width: 768px) and (max-width: 1023px) {
  .show-on-tablet {
    display: block;
  }
}

/* Touch-friendly: increase tap target */
@media (max-width: 1023px) {
  .touch-target {
    min-width: 44px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
}

/* Mobile body adjustments */
@media (max-width: 767px) {
  body {
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: none;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: add responsive breakpoint CSS variables and utility classes"
```

---

### Task 2: Dashboard responsive grid layout

**Files:**
- Modify: `src/app/_components/dashboard.tsx`

- [ ] **Step 1: Replace hardcoded grid style with responsive CSS**

Remove the inline `style` on the grid container div (lines 73-83) and replace with Tailwind responsive classes plus a new CSS class `dashboard-grid`. The grid container becomes:

```tsx
<div
  className="dashboard-grid flex-1 min-h-0 overflow-hidden"
>
```

- [ ] **Step 2: Add dashboard-grid CSS to globals.css**

Insert after the responsive utility classes added in Task 1:

```css
/* ================================================================
 *  DASHBOARD RESPONSIVE GRID
 * ================================================================ */

.dashboard-grid {
  display: grid;
  gap: 0;
  grid-template-columns: 200px 1fr 360px;
  grid-template-rows: 1fr 56px;
  grid-template-areas:
    "tree stream right"
    "bottom bottom bottom";
}

/* Tablet: 2-column, profile overlay via state */
@media (min-width: 768px) and (max-width: 1023px) {
  .dashboard-grid {
    grid-template-columns: 200px 1fr;
    grid-template-rows: 1fr 56px;
    grid-template-areas:
      "tree stream"
      "bottom bottom";
  }
}

/* Phone: single column + bottom tab bar */
@media (max-width: 767px) {
  .dashboard-grid {
    display: flex;
    flex-direction: column;
  }

  .dashboard-grid > [style*="grid-area"] {
    grid-area: unset !important;
  }

  /* Restore grid-area for bottom bar */
  .dashboard-grid > [data-area="bottom"] {
    order: 2;
  }
}
```

- [ ] **Step 3: Add data-area attributes to grid children**

The tree sidebar div:
```tsx
<div data-area="tree" className="min-h-0 min-w-0 overflow-hidden hide-on-mobile">
```

The center area div:
```tsx
<div data-area="stream" className="min-h-0 min-w-0 overflow-hidden flex flex-col">
```

The right panel div:
```tsx
<div data-area="right" className="min-h-0 min-w-0 overflow-hidden flex flex-col bg-(--frame-2) border-l-2 border-(--border) hide-on-narrow">
```

The bottom bar div:
```tsx
<div data-area="bottom" className="show-on-mobile">
  <TickBar ... />
</div>
```

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/dashboard.tsx src/app/globals.css
git commit -m "feat: add responsive dashboard grid layout for tablet and phone"
```

---

### Task 3: Create MobileTabBar component

**Files:**
- Create: `src/app/_components/mobile-tab-bar.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

const TABS = [
  { key: "stream", label: "事件流", emoji: "📜" },
  { key: "map", label: "地图", emoji: "🗺" },
  { key: "gantt", label: "甘特", emoji: "📊" },
  { key: "relations", label: "关系", emoji: "🔗" },
  { key: "characters", label: "角色", emoji: "👤" },
] as const;

export type PhoneTab = (typeof TABS)[number]["key"];

export function MobileTabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: PhoneTab;
  onTabChange: (tab: PhoneTab) => void;
}) {
  return (
    <nav className="show-on-mobile flex items-stretch bg-(--frame-2) border-t-2 border-(--border) shadow-[inset_0_1px_0_var(--border-amber))]">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onTabChange(tab.key)}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-pixel-2xs tracking-[var(--letter-pixel-tight)] cursor-pointer transition-colors touch-target ${
            activeTab === tab.key
              ? "text-(--accent-strong) bg-(--frame)"
              : "text-(--text-on-frame-muted) hover:text-(--text-on-frame)"
          }`}
        >
          <span className="text-sm">{tab.emoji}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/mobile-tab-bar.tsx
git commit -m "feat: add MobileTabBar component for phone navigation"
```

---

### Task 4: Wire MobileTabBar and phone tab state into Dashboard

**Files:**
- Modify: `src/app/_components/dashboard.tsx`

- [ ] **Step 1: Import and add phoneTab state**

Add import:
```tsx
import { MobileTabBar, type PhoneTab } from "./mobile-tab-bar";
```

Add state after the existing `centerTab` state (line 23):
```tsx
const [phoneTab, setPhoneTab] = useState<PhoneTab>("stream");
```

- [ ] **Step 2: Use unified tab visibility logic**

Instead of duplicating center components for mobile, use one set of components and derive visibility from the active tab. The desktop center tab bar gets `hide-on-mobile`. The 4 content components (EventStream, MapStage, EventGantt, RelationGraph) each check BOTH `centerTab` and `phoneTab`:

```tsx
{/* Desktop center tab bar — hidden on phone */}
<div className="hide-on-mobile flex px-2 bg-(--frame-2) border-b-2 border-(--border) shadow-[inset_0_-1px_0_var(--border-amber))]">
  {([
    ["stream", "事件流"],
    ["map", "小地图"],
    ["gantt", "甘特图"],
    ["relations", "关系图"],
  ] as const).map(([key, label]) => (
    <button
      key={key}
      type="button"
      onClick={() => setCenterTab(key)}
      className={`text-pixel-xs px-3 py-2 tracking-[var(--letter-pixel-tight)] uppercase cursor-pointer border-b-2 -mb-px transition-colors ${
        centerTab === key
          ? "text-(--accent-strong) border-(--accent-strong) bg-(--frame)"
          : "text-(--text-on-frame-muted) border-transparent hover:text-(--text-on-frame)"
      }`}
    >
      {label}
    </button>
  ))}
</div>

{/* Tab content — visibility derived from desktop OR phone tab */}
<div className="flex-1 min-h-0 overflow-hidden">
  {(centerTab === "stream" || phoneTab === "stream") && (
    <EventStream ... />
  )}
  {(centerTab === "map" || phoneTab === "map") && (
    <MapStage
      ...
      onSelectCharacter={onMapSelectCharacter}
    />
  )}
  {(centerTab === "gantt" || phoneTab === "gantt") && (
    <EventGantt ... />
  )}
  {(centerTab === "relations" || phoneTab === "relations") && (
    <RelationGraph ... />
  )}
  {phoneTab === "characters" && (
    <CharactersPhoneTab ... />
  )}
</div>
```

This avoids double-rendering complex components (EventStream, MapStage, etc.). Desktop and phone each have their own tab state, but the components render once. On desktop `phoneTab` stays at its initial value so the condition only matches via `centerTab`; on mobile the desktop tab bar is hidden and only `phoneTab` drives changes.

- [ ] **Step 3: Render MobileTabBar in the bottom area**

In the bottom div (`data-area="bottom"`), the TickBar always renders, followed by MobileTabBar (self-hidden on non-mobile):

```tsx
<div data-area="bottom">
  <TickBar ... />
  <MobileTabBar activeTab={phoneTab} onTabChange={setPhoneTab} />
</div>
```

- [ ] **Step 4: Unified character select callback for mobile/tablet**

Define a single `handleSelectCharacter` callback that replaces ALL inline `(c) => view.selectCharacter(c.id)` callbacks in the JSX. This handles phone tab switch and tablet drawer open:

```tsx
const handleSelectCharacter = useCallback((c: Character) => {
  view.selectCharacter(c.id);
  if (typeof window !== "undefined") {
    const w = window.innerWidth;
    if (w < 768) {
      setPhoneTab("characters");
    } else if (w >= 768 && w < 1024) {
      setTabletProfileOpen(true);
    }
  }
}, [view]);
```

Update ALL `onSelectCharacter` props to use `handleSelectCharacter`:
- TreeSidebar: `onSelectCharacter={handleSelectCharacter}`
- EventStream: `onSelectCharacter={handleSelectCharacter}`
- EventGantt: `onSelectCharacter={handleSelectCharacter}`
- MapStage: `onSelectCharacter={handleSelectCharacter}`
- CharactersPhoneTab: `onSelectCharacter={handleSelectCharacter}`

- [ ] **Step 5: Commit**

```bash
git add src/app/_components/dashboard.tsx
git commit -m "feat: wire MobileTabBar and phone tab routing into Dashboard"
```

---

### Task 5: TopBar responsive adaptation

**Files:**
- Modify: `src/app/_components/top-bar.tsx`

- [ ] **Step 1: Add responsive classes to hide breadcrumb on phone, shrink buttons**

The breadcrumb nav gets `hide-on-mobile`:
```tsx
<nav className="hide-on-mobile flex items-center gap-1 text-body-sm text-(--text-on-frame-muted)">
```

The world name stays (shrinks font):
```tsx
<span className="text-pixel-sm md:text-pixel-lg tracking-[var(--letter-pixel)] text-(--accent-strong)">
  ◆ {worldName}
</span>
```

Icon buttons (search, snapshot, settings) get `touch-target` class:
```tsx
className="w-7 h-7 touch-target bg-transparent ..."
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/top-bar.tsx
git commit -m "feat: adapt TopBar for mobile — hide breadcrumb, shrink buttons"
```

---

### Task 6: TickBar responsive adaptation

**Files:**
- Modify: `src/app/_components/tick-bar.tsx`

- [ ] **Step 1: Add responsive wrapping and spacing**

Add `flex-wrap` to the footer and `hide-on-mobile` to less critical groups. The speed selector and replay toggle get hidden on phone:

Group 3 (Speed): add `hide-on-mobile` to the container div.
Group 5 (Replay): add `hide-on-mobile` to the container div.

Group 4 (Auto): the input shrinks to `w-12` on phone:
```tsx
className="w-12 md:w-16 px-1 md:px-2 py-1 ..."
```

The inject button text shortens on phone:
```tsx
<span className="hide-on-mobile">⚡ 投放事件 (E)</span>
<span className="show-on-mobile">⚡ E</span>
```

Group 1 (Step controls): buttons get `touch-target`.

LastTickMs and tickProgress text use `hide-on-mobile`.

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/tick-bar.tsx
git commit -m "feat: adapt TickBar for mobile — hide secondary controls, shrink elements"
```

---

### Task 7: EventStream responsive adaptation

**Files:**
- Modify: `src/app/_components/event-stream.tsx`

- [ ] **Step 1: Adjust padding and font sizes for mobile**

Header — reduce padding:
```tsx
className="flex items-center gap-2 md:gap-3 px-3 md:px-6 py-2 bg-(--frame-2) ..."
```

Filter buttons — reduce gap, smaller padding:
```tsx
className="flex items-center gap-0.5 md:gap-1 ml-auto"
```

Body — reduce padding:
```tsx
className="flex-1 overflow-y-auto pixel-scroll px-3 md:px-6 py-3 md:py-4"
```

Density selector: add `hide-on-mobile` (too fiddly on small screens).

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/event-stream.tsx
git commit -m "feat: adapt EventStream for mobile — reduce padding and font sizes"
```

---

### Task 8: EventCard responsive font/padding

**Files:**
- Modify: `src/app/_components/event-card.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add mobile ev-card variant in globals.css**

```css
@media (max-width: 767px) {
  .ev-card {
    padding: var(--sp-3) var(--sp-4);
    font-size: var(--font-body-sm);
  }

  .ev-card__quote {
    padding: var(--sp-2) var(--sp-3);
    margin-top: var(--sp-2);
    line-height: var(--lh-normal);
  }
}
```

No changes needed in event-card.tsx beyond using the existing CSS classes — the media query handles it.

- [ ] **Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: add mobile event-card variant with reduced padding"
```

---

### Task 9: MapStage responsive adaptation

**Files:**
- Modify: `src/app/_components/map-stage.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Scale NPC chips down on mobile in globals.css**

```css
@media (max-width: 767px) {
  .npc-chip {
    width: 22px;
    height: 22px;
    font-size: 12px;
  }

  .npc-chip--lg {
    width: 32px;
    height: 32px;
    font-size: 18px;
  }
}
```

- [ ] **Step 2: Replace node-tile hover with active in globals.css**

```css
@media (max-width: 1023px) {
  .node-tile:hover {
    filter: none;
    transform: none;
  }

  .node-tile:active {
    filter: brightness(1.1);
    transform: translateY(-1px);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: adapt MapStage for mobile — smaller chips, active instead of hover"
```

---

### Task 10: EventGantt and GanttCard responsive adaptation

**Files:**
- Modify: `src/app/_components/event-gantt.tsx`
- Modify: `src/app/_components/gantt-card.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Shrink gantt-card width on mobile in globals.css**

```css
@media (max-width: 767px) {
  .gantt-card {
    width: 100px;
    height: 40px;
    padding: 2px 4px;
    font-size: 7px;
  }

  .gantt-card__badge,
  .gantt-card__location,
  .gantt-card__important-badge {
    font-size: 6px;
    padding: 0 1px;
  }
}
```

- [ ] **Step 2: Make gantt name column narrower on mobile**

In `gantt-row.tsx`, change the name cell `minWidth` to use a CSS variable or simply reduce to 80:

The name cell style should change from `minWidth: 100, maxWidth: 100` to responsive via CSS. Add a class:
```css
@media (max-width: 767px) {
  .gantt-name-cell {
    min-width: 70px !important;
    max-width: 70px !important;
    padding: 2px 4px !important;
    font-size: var(--font-pixel-2xs);
  }
}
```

In `gantt-row.tsx`, add `className="gantt-name-cell"` to the name cell div. Update `paddingLeft: 100` in `gantt-timeline.tsx` to `paddingLeft: "var(--gantt-name-width, 100px)"`:
```tsx
style={{
  display: "flex",
  gap: 0,
  paddingLeft: "var(--gantt-name-width, 100px)",
  ...
}}
```

Add CSS variable:
```css
:root { --gantt-name-width: 100px; }
@media (max-width: 767px) { :root { --gantt-name-width: 70px; } }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/event-gantt.tsx src/app/_components/gantt-card.tsx src/app/_components/gantt-row.tsx src/app/_components/gantt-timeline.tsx src/app/globals.css
git commit -m "feat: adapt EventGantt for mobile — smaller cards, responsive name column"
```

---

### Task 11: RelationGraph responsive adaptation

**Files:**
- Modify: `src/app/_components/relation-graph.tsx`

- [ ] **Step 1: Tie canvas size to container exactly (already done via ResizeObserver), adjust node radius on mobile**

In the `nodeRadius` call within `nodeCanvasObject`, the radius already scales. No code changes needed for sizing — the ResizeObserver already handles container-fill. The existing touch interactions (pinch-zoom, drag, pan) in `react-force-graph-2d` work on mobile.

For the tooltip: make it use touch position too. Add touch handlers alongside mouse handlers. In the component, add:

```tsx
const handleTouchMove = useCallback(
  (e: React.TouchEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect && e.touches.length === 1) {
      mouseRef.current = {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
  },
  [],
);
```

Add `onTouchMove={handleTouchMove}` to the container div.

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/relation-graph.tsx
git commit -m "feat: adapt RelationGraph for mobile — add touch tooltip tracking"
```

---

### Task 12: ProfilePane responsive — tablet drawer + mobile full-width

**Files:**
- Modify: `src/app/_components/profile-pane.tsx`
- Modify: `src/app/_components/dashboard.tsx`

- [ ] **Step 1: Add responsive CSS for ProfilePane in globals.css**

```css
/* Tablet/Phone profile pane — full width */
@media (max-width: 1023px) {
  .profile-pane-responsive {
    width: 100% !important;
  }
}

/* Tablet: overlay drawer */
@media (min-width: 768px) and (max-width: 1023px) {
  .profile-drawer-overlay {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 360px;
    max-width: 100vw;
    z-index: 40;
    display: flex;
    flex-direction: column;
  }

  .profile-drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.3);
    z-index: 39;
  }
}
```

- [ ] **Step 2: Add tabletProfileOpen state to Dashboard**

(Add alongside `phoneTab` state from Task 4, not as a separate callback — `handleSelectCharacter` from Task 4 Step 4 already handles the tablet case.)

```tsx
const [tabletProfileOpen, setTabletProfileOpen] = useState(false);
```

Update `handleSelectCharacter` (already defined in Task 4 Step 4) to include `setTabletProfileOpen` in its dependency list. The callback body already handles the `w >= 768 && w < 1024` branch.

- [ ] **Step 3: Render ProfilePane as drawer on tablet**

The desktop right panel gets `hide-on-narrow`:

```tsx
<div data-area="right" className="min-h-0 min-w-0 overflow-hidden flex flex-col bg-(--frame-2) border-l-2 border-(--border) hide-on-narrow">
  <ProfilePane ... />
</div>
```

Add tablet drawer overlay after the grid div (at Dashboard return top level):

```tsx
{/* Tablet profile drawer — renders outside grid */}
{tabletProfileOpen && (
  <>
    <div className="show-on-tablet profile-drawer-backdrop" onClick={() => setTabletProfileOpen(false)} />
    <div className="show-on-tablet profile-drawer-overlay">
      <ProfilePane
        character={selectedCharacter}
        nodes={snapshot.nodes}
        onJumpToNode={view.setCurrentNode}
        characters={snapshot.characters}
        events={events}
        onFollow={follow}
        isFollowing={selectedCharacter ? isFollowing(selectedCharacter.id) : false}
        epoch={snapshot.world.epoch}
        currentTick={snapshot.world.currentTick}
      />
    </div>
  </>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/dashboard.tsx src/app/globals.css
git commit -m "feat: add tablet ProfilePane drawer and responsive full-width for mobile"
```

---

### Task 13: TreeSidebar responsive — phone horizontal nav + grid NPCs

**Files:**
- Modify: `src/app/_components/tree-sidebar.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add responsive CSS**

```css
/* Phone: tree sidebar becomes horizontal scroll */
@media (max-width: 767px) {
  .tree-horizontal {
    display: flex;
    flex-direction: row;
    overflow-x: auto;
    gap: 4px;
    padding: 4px 8px;
    -webkit-overflow-scrolling: touch;
    flex-shrink: 0;
  }

  .tree-horizontal button {
    white-space: nowrap;
    flex-shrink: 0;
    padding: 4px 8px;
    font-size: var(--font-pixel-xs);
  }

  /* NPC grid on phone: 3 columns */
  .npc-grid-mobile {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    padding: 8px;
    overflow-y: auto;
  }

  .npc-grid-mobile button {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 4px;
    font-size: var(--font-pixel-xs);
    min-height: 56px;
  }
}
```

- [ ] **Step 2: Add className for tree nav and NPC list**

In `tree-sidebar.tsx`, the tree nav container at line 91:
```tsx
<div className="tree-horizontal md:overflow-y-auto md:pixel-scroll md:flex-shrink">
```

The NPC list container at line 109:
```tsx
<div className="npc-grid-mobile md:flex-1 md:overflow-y-auto md:pixel-scroll">
```

The collapse/expand button at line 78: add `hide-on-mobile` (no collapse on phone since it's inline).

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/tree-sidebar.tsx src/app/globals.css
git commit -m "feat: adapt TreeSidebar for mobile — horizontal nav, grid NPCs"
```

---

### Task 14: InjectDrawer responsive — full-screen modal on phone

**Files:**
- Modify: `src/app/_components/inject-drawer.tsx`

- [ ] **Step 1: Make drawer full-screen on phone**

Change the drawer div className from:
```tsx
className="fixed top-0 right-0 bottom-0 w-[420px] z-50 ..."
```
to:
```tsx
className="fixed top-0 right-0 bottom-0 w-full max-w-[420px] z-50 ..."
```

Add media query override in globals.css:
```css
@media (max-width: 767px) {
  .inject-drawer-mobile {
    max-width: 100vw !important;
    left: 0;
  }
}
```

Add `inject-drawer-mobile` class to the drawer div.

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/inject-drawer.tsx src/app/globals.css
git commit -m "feat: make InjectDrawer full-screen on mobile"
```

---

### Task 15: CharactersTab composite view (TreeSidebar + ProfilePane) for phone

**Files:**
- Create: internal to dashboard.tsx (inline component or separate small file)

- [ ] **Step 1: Build inline phone characters tab in Dashboard**

In dashboard.tsx, create a `CharactersPhoneTab` component before the Dashboard function:

```tsx
function CharactersPhoneTab({
  nodes, characters, currentNodeId, events, selectedCharacterId, followingId,
  onJumpToNode, onSelectCharacter, templates, onPlace, disabled,
  epoch, currentTick, onFollow, isFollowing,
}: {
  nodes: MapNode[];
  characters: Character[];
  currentNodeId: string;
  events: WorldEvent[];
  selectedCharacterId: string | null;
  followingId: string | null;
  onJumpToNode: (id: string) => void;
  onSelectCharacter: (c: Character) => void;
  templates: Array<{ id: string; name: string; avatar: string | null }>;
  onPlace: (id: string) => Promise<boolean>;
  disabled: boolean;
  epoch: number;
  currentTick: number;
  onFollow: (id: string) => void;
  isFollowing: (id: string) => boolean;
}) {
  const selectedCharacter = characters.find(c => c.id === selectedCharacterId) ?? null;
  return (
    <div className="h-full flex flex-col">
      <TreeSidebar
        nodes={nodes}
        characters={characters}
        currentNodeId={currentNodeId}
        events={events}
        selectedCharacterId={selectedCharacterId}
        followingId={followingId}
        onJumpToNode={onJumpToNode}
        onSelectCharacter={onSelectCharacter}
        templates={templates}
        onPlace={onPlace}
        disabled={disabled}
      />
      <div className="flex-1 min-h-0 overflow-hidden">
        <ProfilePane
          character={selectedCharacter}
          nodes={nodes}
          onJumpToNode={onJumpToNode}
          characters={characters}
          events={events}
          onFollow={onFollow}
          isFollowing={selectedCharacterId ? isFollowing(selectedCharacterId) : false}
          epoch={epoch}
          currentTick={currentTick}
        />
      </div>
    </div>
  );
}
```
No separate import needed — types come from dashboard.tsx's existing imports.

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/dashboard.tsx
git commit -m "feat: add CharactersPhoneTab combining TreeSidebar + ProfilePane"
```

---

**Deferred (out of scope for this plan, nice-to-have later):**
- Long-press timer for follow character on mobile (300ms touch hold)
- Swipe-to-close gesture on tablet ProfilePane drawer
- Double-tap relation graph node → radial focus (already works via existing 300ms double-click detection in relation-graph.tsx)
- Map tile viewport-relative scaling (current CSS handles basic responsiveness; fine-tune later if needed)

---

### Task 16: Final integration — verify all breakpoints and interactions

**Files:**
- Modify: `src/app/_components/dashboard.tsx` (cleanup, final wiring)

- [ ] **Step 1: Review and test desktop layout unchanged**

Run: `npx tsc --noEmit`
Expected: no errors.

Start dev server and verify at ≥1024px: the 3-column layout (tree | center | profile) with the bottom tick bar matches the current production layout exactly.

- [ ] **Step 2: Test tablet layout**

Resize to 800px width. Verify:
- Tree sidebar visible (200px)
- Center area fills remaining
- ProfilePane does NOT auto-show
- Click a character → ProfilePane slides in as overlay from right
- Click backdrop → drawer closes

- [ ] **Step 3: Test phone layout**

Resize to 375px width. Verify:
- Single column layout
- TopBar shows world name + time, no breadcrumb
- 5-tab bottom bar visible
- Each tab shows correct content
- TickBar shows compact controls
- Click character on map → auto-switches to Characters tab
- InjectDrawer takes full screen

- [ ] **Step 4: Touch interaction tests**

On phone emulation (Chrome DevTools):
- Tap node tiles on map (no hover flash)
- Tap gantt cards (popup opens on tap, not hover)
- Double-tap relation graph node → radial focus
- Long-press on event card → (future follow action, currently no-op)
- Scroll event stream with touch, verify momentum scrolling

- [ ] **Step 5: Commit any final adjustments**

```bash
git add src/app/_components/dashboard.tsx
git commit -m "chore: final mobile responsive integration and cleanup"
```
