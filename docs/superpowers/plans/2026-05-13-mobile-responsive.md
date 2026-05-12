# Mobile Responsive Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the frontend responsive across PC (>=768px), tablet, and phone (<768px) using Tailwind `md:` prefixes, while preserving existing PC behavior.

**Architecture:** Two new shared components (`BottomTabBar`, `HamburgerDrawer`). World-view sidebar collapse logic inlined. PC paths unchanged, mobile paths added via `md:` conditional classes. No new dependencies.

**Tech Stack:** React 19, Tailwind CSS v4, TypeScript

**Breakpoint:** 768px (`md:` in Tailwind)

---

### Task 1: Global body scroll

**Files:**
- Modify: `frontend/index.html`

- [ ] **Step 1: Remove overflow-hidden from body and root div**

In `frontend/index.html`, change lines 19-20:

```html
<!-- Before -->
<body class="h-full flex flex-col overflow-hidden">
  <div id="root" class="h-full flex flex-col overflow-hidden"></div>

<!-- After -->
<body class="h-full flex flex-col">
  <div id="root" class="h-full flex flex-col"></div>
```

On PC, each page component already has its own `overflow-hidden`. On mobile, this allows natural vertical scroll where needed.

- [ ] **Step 2: Verify no regressions on PC**

Run: `cd frontend && pnpm dev`
Open http://localhost:3000 at >768px width. Confirm layout is identical to before.

- [ ] **Step 3: Commit**

```bash
git add frontend/index.html
git commit -m "fix: allow body scroll on mobile"
```

---

### Task 2: BottomTabBar component

**Files:**
- Create: `frontend/src/components/bottom-tab-bar.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

type Tab = "stream" | "gantt" | "chat" | "map";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "stream", label: "事件", icon: "📋" },
  { key: "gantt", label: "甘特", icon: "📊" },
  { key: "chat", label: "对话", icon: "💬" },
  { key: "map", label: "地图", icon: "🗺" },
];

export function BottomTabBar({
  active,
  onSelect,
}: {
  active: Tab;
  onSelect: (tab: Tab) => void;
}) {
  return (
    <div className="flex md:hidden border-t border-white/10 bg-black/30 flex-shrink-0">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onSelect(tab.key)}
          className={`flex-1 flex flex-col items-center justify-center py-1.5 transition-colors ${
            active === tab.key
              ? "text-(--accent-strong) border-t-2 border-(--accent-strong) -mt-px"
              : "text-white/35 border-t-2 border-transparent"
          }`}
        >
          <span className="text-[15px] leading-none">{tab.icon}</span>
          <span className="text-[9px] mt-0.5 tracking-[0.05em]">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/bottom-tab-bar.tsx
git commit -m "feat: add BottomTabBar component"
```

---

### Task 3: HamburgerDrawer component

**Files:**
- Create: `frontend/src/components/hamburger-drawer.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { type ReactNode, useState } from "react";

export function HamburgerDrawer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Top bar — mobile only */}
      <div className="md:hidden flex items-center px-4 py-2.5 border-b border-white/10 bg-black/30 flex-shrink-0">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-white/60 hover:text-white/90 transition-colors cursor-pointer p-1"
          aria-label="打开导航菜单"
        >
          <svg width="22" height="16" viewBox="0 0 22 16" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="0" y1="1" x2="22" y2="1" />
            <line x1="0" y1="8" x2="22" y2="8" />
            <line x1="0" y1="15" x2="22" y2="15" />
          </svg>
        </button>
        <span className="ml-3 text-white/70 text-[13px] font-semibold tracking-[0.1em]">Hub</span>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Drawer panel */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-black/95 backdrop-blur-xl border-r border-white/10 transform transition-transform duration-250 ease md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <span className="text-white/80 text-[12px] font-semibold tracking-[0.1em]">导航</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-white/40 hover:text-white/80 transition-colors cursor-pointer p-1"
            aria-label="关闭导航菜单"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="2" y1="2" x2="14" y2="14" />
              <line x1="14" y1="2" x2="2" y2="14" />
            </svg>
          </button>
        </div>
        {/* Any child click closes the drawer */}
        <div onClick={() => setOpen(false)} className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/hamburger-drawer.tsx
git commit -m "feat: add HamburgerDrawer component"
```

---

### Task 4: World View — collapsible sidebar, bottom tabs, responsive profile

**Files:**
- Modify: `frontend/src/components/world-view.tsx`

- [ ] **Step 1: Add import for CharacterAvatar and BottomTabBar**

Add at top of file, after existing imports:

```tsx
import { CharacterAvatar } from "./character-avatar";
import { BottomTabBar } from "./bottom-tab-bar";
```

- [ ] **Step 2: Add sidebarExpanded state**

After line 20 (`const [centerTab, setCenterTab] = ...`), add:

```tsx
const [sidebarExpanded, setSidebarExpanded] = useState(true);
```

- [ ] **Step 3: Replace the left column div (lines 82-99) with collapsible sidebar**

Remove these lines:
```tsx
{/* Left column */}
<div className="w-[260px] flex-shrink-0 flex flex-col border-r border-white/10 bg-black/80 backdrop-blur-md">
  <CharacterList ... />
  <TickControl ... />
</div>
```

Replace with the following three-part sidebar implementation:

**Part A — Mobile expanded overlay (when sidebarExpanded=true on mobile):**

```tsx
{/* Mobile: expanded sidebar overlay */}
{sidebarExpanded && (
  <>
    <div
      className="fixed inset-0 z-30 bg-black/50 md:hidden"
      onClick={() => setSidebarExpanded(false)}
    />
    <div className="fixed inset-y-0 left-0 z-40 w-[70vw] max-w-[260px] flex flex-col border-r border-white/10 bg-black/90 backdrop-blur-2xl md:hidden">
      <CharacterList
        characters={snapshot.characters}
        selectedId={profileId ?? undefined}
        onSelect={(id) => { handleSelectCharacter(id); setSidebarExpanded(false); }}
      />
      <TickControl
        tick={snapshot.world.currentTick}
        epoch={snapshot.world.epoch}
        loading={loading}
        onAdvance={advance}
        autoMode={autoMode}
        onStartAuto={startAuto}
        onStopAuto={stopAuto}
        lastTickMs={lastTickMs}
        tickProgress={tickProgress}
      />
      <div className="border-t border-white/10 p-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={() => setSidebarExpanded(false)}
          className="w-full py-1 text-white/30 hover:text-white/70 cursor-pointer text-[10px]"
        >
          ◀ 收起
        </button>
      </div>
    </div>
  </>
)}
```

**Part B — PC sidebar (inline, expandable/collapsible):**

```tsx
{/* PC: inline collapsible sidebar */}
<div
  className={`hidden md:flex flex-col border-r border-white/10 bg-black/80 backdrop-blur-md flex-shrink-0 transition-[width] duration-200 ${
    sidebarExpanded ? "w-[260px]" : "w-[48px]"
  }`}
>
  {sidebarExpanded ? (
    <>
      <CharacterList
        characters={snapshot.characters}
        selectedId={profileId ?? undefined}
        onSelect={handleSelectCharacter}
      />
      <TickControl
        tick={snapshot.world.currentTick}
        epoch={snapshot.world.epoch}
        loading={loading}
        onAdvance={advance}
        autoMode={autoMode}
        onStartAuto={startAuto}
        onStopAuto={stopAuto}
        lastTickMs={lastTickMs}
        tickProgress={tickProgress}
      />
    </>
  ) : (
    <div className="flex-1 flex flex-col items-center gap-1.5 pt-2 overflow-y-auto">
      {snapshot.characters.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => handleSelectCharacter(c.id)}
          title={c.name}
          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
            c.id === profileId
              ? "bg-white/[0.12] ring-1 ring-(--accent-strong)/40"
              : "bg-white/[0.04] hover:bg-white/[0.08]"
          }`}
        >
          <CharacterAvatar c={c} size={20} />
        </button>
      ))}
    </div>
  )}
  {/* Toggle button at bottom */}
  <div className="border-t border-white/10 p-1.5 flex-shrink-0">
    <button
      type="button"
      onClick={() => setSidebarExpanded((v) => !v)}
      className="w-full py-1 flex items-center justify-center text-white/30 hover:text-white/70 cursor-pointer text-[10px]"
      title={sidebarExpanded ? "收起侧边栏" : "展开侧边栏"}
    >
      {sidebarExpanded ? "◀" : "▶"}
    </button>
  </div>
</div>
```

**Part C — Mobile collapsed avatar strip (always visible inline when sidebarExpanded=false):**

```tsx
{/* Mobile: collapsed avatar strip */}
<div className="md:hidden flex flex-col items-center gap-1 pt-1.5 overflow-y-auto border-r border-white/10 bg-black/80 backdrop-blur-md flex-shrink-0 w-[36px]">
  {snapshot.characters.map((c) => (
    <button
      key={c.id}
      type="button"
      onClick={() => handleSelectCharacter(c.id)}
      title={c.name}
      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
        c.id === profileId
          ? "bg-white/[0.12] ring-1 ring-(--accent-strong)/40"
          : "bg-white/[0.04] hover:bg-white/[0.08]"
      }`}
    >
      <CharacterAvatar c={c} size={16} />
    </button>
  ))}
  <div className="flex-1" />
  <button
    type="button"
    onClick={() => setSidebarExpanded(true)}
    className="w-full py-1.5 text-white/30 hover:text-white/70 cursor-pointer text-[9px] border-t border-white/10"
    title="展开角色列表"
  >
    ▶
  </button>
</div>
```

- [ ] **Step 4: Add md:hidden to existing tab bar, add BottomTabBar below content**

Change the existing tab bar div (line 104) to hide on mobile:

```tsx
<div className="hidden md:flex px-3 border-b border-white/10 bg-black/15 flex-shrink-0">
```

After the tab content div (after `</div>` closing `{centerTab === "map" && (...)}`), add BottomTabBar:

```tsx
<BottomTabBar active={centerTab} onSelect={setCenterTab} />
```

- [ ] **Step 5: Change profile panel width to responsive**

Change profile panel className (line 181):
```tsx
// Before
className={`absolute inset-y-0 right-0 w-[420px] ...

// After
className={`absolute inset-y-0 right-0 w-[90vw] md:w-[420px] max-w-[420px] ...
```

- [ ] **Step 6: Verify compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Visual check**

Run: `cd frontend && pnpm dev`
Test at 375px, 768px, 1440px:
- PC: sidebar collapses/expands, tabs at top, profile 420px
- Mobile: avatar strip visible, expand → overlay, bottom tabs, profile 90vw
- Sidebar toggle button at bottom of expanded sidebar, and bottom of collapsed avatar strip

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/world-view.tsx
git commit -m "feat: add collapsible sidebar and mobile layout to world-view"
```

---

### Task 5: Hub — hamburger drawer on mobile

**Files:**
- Modify: `frontend/src/components/hub-layout.tsx`

- [ ] **Step 1: Add import**

```tsx
import { HamburgerDrawer } from "./hamburger-drawer";
```

- [ ] **Step 2: Hide PC nav on mobile, add HamburgerDrawer**

Change the `<nav>` className to add `hidden md:flex`:

```tsx
<nav className="hidden md:flex w-14 flex-shrink-0 flex-col items-center pt-3 gap-1 bg-black/30 backdrop-blur-md border-r border-white/10">
```

The nav body (NAV_ITEMS mapping + home button) stays exactly the same.

Before the `<main>` element, add the HamburgerDrawer with mobile nav items:

```tsx
{/* Mobile hamburger nav */}
<HamburgerDrawer>
  {NAV_ITEMS.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 text-[12px] transition-colors ${
          isActive
            ? "bg-white/[0.08] text-(--accent-strong) border-l-2 border-(--accent-strong)"
            : "text-white/50 hover:text-white hover:bg-white/[0.04] border-l-2 border-transparent"
        }`
      }
    >
      <PixelIcon data={[...item.icon]} className="w-5 h-5" />
      {item.label}
    </NavLink>
  ))}
  <div className="mt-auto border-t border-white/10 pt-2">
    <button
      type="button"
      onClick={() => navigate("/")}
      className="flex items-center gap-3 px-4 py-3 text-[12px] text-white/40 hover:text-white transition-colors cursor-pointer w-full"
    >
      <PixelIcon data={[...PIXEL_ICONS.home]} className="w-5 h-5" />
      返回封面
    </button>
  </div>
</HamburgerDrawer>
```

- [ ] **Step 3: Verify**

Run: `cd frontend && npx tsc --noEmit`
Run: `cd frontend && pnpm dev` — on mobile viewport: hamburger appears, opens drawer, nav items work.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/hub-layout.tsx
git commit -m "feat: add hamburger drawer for mobile Hub navigation"
```

---

### Task 6: Cover page responsive title

**Files:**
- Modify: `frontend/src/routes/cover.tsx`

- [ ] **Step 1: Change title font size to responsive**

Replace the `<h1>` element:

```tsx
<h1
  className="absolute left-1/2 tracking-[0.25em] whitespace-nowrap text-[48px] md:text-[144px]"
  style={{
    top: "33.33%",
    transform: "translate(-50%, -50%)",
    fontFamily: "var(--font-silkscreen, monospace)",
    color: "#fff",
    textShadow: "0 0 30px rgba(255,255,255,0.4)",
  }}
>
  AGENT WORLD
</h1>
```

- [ ] **Step 2: Verify**

Run: `cd frontend && pnpm dev` — check cover page at 375px and 1440px.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/cover.tsx
git commit -m "fix: responsive cover title (48px mobile, 144px PC)"
```

---

### Task 7: Mods gallery responsive grid

**Files:**
- Modify: `frontend/src/routes/mods.tsx`

- [ ] **Step 1: Replace inline grid style with responsive Tailwind**

Change line 30:
```tsx
// Before
<div className="grid gap-y-16 gap-x-5" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>

// After
<div className="grid grid-cols-1 md:grid-cols-4 gap-y-16 gap-x-5">
```

- [ ] **Step 2: Verify**

Run: `cd frontend && pnpm dev` — Mods page: 1 column at <768px, 4 columns at >=768px.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/routes/mods.tsx
git commit -m "fix: responsive Mods grid (1-col mobile, 4-col PC)"
```

---

### Task 8: Worlds page responsive

**Files:**
- Modify: `frontend/src/routes/worlds.tsx`

- [ ] **Step 1: Hide sidebar on mobile, add horizontal mod selector**

Change the `<aside>` (line 140) to hide on mobile:
```tsx
<aside className="hidden md:block w-[280px] flex-shrink-0 border-r border-white/10 bg-black/20 backdrop-blur-md flex flex-col overflow-hidden">
```

After the header div (line 136), add a mobile mod selector:
```tsx
{/* Mobile mod selector — horizontal scrollable pills */}
<div className="md:hidden px-3 py-2 border-b border-white/10 bg-black/15 flex gap-2 overflow-x-auto">
  <button
    type="button"
    onClick={() => selectMod("")}
    className={`flex-shrink-0 px-3 py-1 text-[11px] rounded border transition-colors ${
      !selectedModId
        ? "bg-white/10 border-(--accent-strong) text-(--accent-strong)"
        : "border-white/10 text-white/40 hover:text-white/70"
    }`}
  >
    全部
  </button>
  {mods.map((mod) => (
    <button
      key={mod.id}
      type="button"
      onClick={() => selectMod(mod.id === selectedModId ? "" : mod.id)}
      className={`flex-shrink-0 px-3 py-1 text-[11px] rounded border transition-colors ${
        selectedModId === mod.id
          ? "bg-white/10 border-(--accent-strong) text-(--accent-strong)"
          : "border-white/10 text-white/40 hover:text-white/70"
      }`}
    >
      {mod.name}
    </button>
  ))}
</div>
```

- [ ] **Step 2: Also hide the "所有世界实例" header on mobile (redundant with pills)**

No change needed — the header text provides useful context.

- [ ] **Step 3: Verify**

Run: `cd frontend && pnpm dev` — Worlds page: pill selector on mobile, sidebar on PC.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/routes/worlds.tsx
git commit -m "fix: responsive Worlds page with mobile mod selector"
```

---

### Task 9: World Map — default zoom-to-fit + touch zoom/pan on mobile

**Files:**
- Modify: `frontend/src/components/world-map.tsx`

- [ ] **Step 1: Add touch zoom/pan state and handlers**

Add after the `charsByLoc` useMemo:

```tsx
const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
const containerRef = useRef<HTMLDivElement>(null);
const lastDist = useRef<number | null>(null);
const lastPan = useRef<{ x: number; y: number } | null>(null);

// Initial zoom-to-fit on mobile
useEffect(() => {
  const el = containerRef.current;
  if (!el) return;
  if (window.innerWidth >= 768) return;
  const fitScale = Math.min(
    el.clientWidth / CANVAS,
    el.clientHeight / CANVAS,
    1,
  );
  setTransform({ scale: fitScale, x: 0, y: 0 });
}, []);

function handleTouchStart(e: React.TouchEvent) {
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    lastDist.current = Math.hypot(dx, dy);
  } else if (e.touches.length === 1) {
    lastPan.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
}

function handleTouchMove(e: React.TouchEvent) {
  if (e.touches.length === 2 && lastDist.current != null) {
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    const scaleChange = dist / lastDist.current;
    lastDist.current = dist;
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(0.15, Math.min(3, prev.scale * scaleChange)),
    }));
  } else if (e.touches.length === 1 && lastPan.current) {
    const dx = e.touches[0].clientX - lastPan.current.x;
    const dy = e.touches[0].clientY - lastPan.current.y;
    lastPan.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    setTransform((prev) => ({
      ...prev,
      x: prev.x + dx,
      y: prev.y + dy,
    }));
  }
}

function handleTouchEnd() {
  lastDist.current = null;
  lastPan.current = null;
}
```

- [ ] **Step 2: Apply transform to container**

Change the outer div:
```tsx
// Before
<div className="h-full w-full overflow-auto">

// After
<div
  ref={containerRef}
  className="h-full w-full overflow-hidden md:overflow-auto"
  onTouchStart={handleTouchStart}
  onTouchMove={handleTouchMove}
  onTouchEnd={handleTouchEnd}
>
```

Wrap the inner relative div with transform:
```tsx
<div
  style={{
    width: CANVAS,
    height: CANVAS,
    transform: `scale(${transform.scale}) translate(${transform.x / transform.scale}px, ${transform.y / transform.scale}px)`,
    transformOrigin: "0 0",
    position: "relative",
  }}
>
  {/* existing SVG + node cards unchanged */}
</div>
```

- [ ] **Step 3: Verify on mobile viewport**

Run: `cd frontend && pnpm dev`
Open at <768px with touch emulation in devtools. Map should zoom-to-fit, pinch to zoom, drag to pan.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/world-map.tsx
git commit -m "feat: add touch zoom/pan and auto-fit to world map on mobile"
```

---

### Task 10: EventStream responsive padding

**Files:**
- Modify: `frontend/src/components/event-stream.tsx`

- [ ] **Step 1: Reduce gap/padding on mobile**

Change header (line 138):
```tsx
// Before
<div className="flex items-center gap-3 px-4 py-2 border-b border-white/10 bg-black/15 flex-shrink-0">

// After
<div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 border-b border-white/10 bg-black/15 flex-shrink-0">
```

Change body (line 231):
```tsx
// Before
<div ref={bodyRef} className="flex-1 overflow-y-auto px-4 py-3">

// After
<div ref={bodyRef} className="flex-1 overflow-y-auto px-3 md:px-4 py-3">
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/event-stream.tsx
git commit -m "fix: reduce EventStream padding on mobile"
```

---

### Task 11: StrangerChat responsive

**Files:**
- Modify: `frontend/src/components/stranger-chat.tsx`

- [ ] **Step 1: Wider message bubbles on mobile, reduced input padding**

Change message max-width (line 199):
```tsx
// Before
className={`max-w-[75%] rounded-lg px-3 py-2 ...

// After
className={`max-w-[85%] md:max-w-[75%] rounded-lg px-3 py-2 ...
```

Change input area padding (line 268):
```tsx
// Before
<div className="flex-shrink-0 border-t border-white/10 p-3 bg-black/15">

// After
<div className="flex-shrink-0 border-t border-white/10 p-2.5 md:p-3 bg-black/15">
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/stranger-chat.tsx
git commit -m "fix: make StrangerChat more mobile-friendly"
```

---

### Task 12: Gantt touch scroll improvement

**Files:**
- Modify: `frontend/src/components/event-gantt.tsx`

- [ ] **Step 1: Add touch-action to cards area**

The Gantt chart already scrolls horizontally. On mobile, add `touch-action` to the cards div for smoother touch scroll. Change line 271:

```tsx
// Before
<div
  ref={cardsRef}
  className="flex-1"
  style={{ overflow: "auto" }}
  onScroll={handleCardsScroll}
>

// After
<div
  ref={cardsRef}
  className="flex-1"
  style={{ overflow: "auto", touchAction: "pan-x pan-y" }}
  onScroll={handleCardsScroll}
>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/event-gantt.tsx
git commit -m "fix: improve Gantt touch scroll behavior on mobile"
```

---

### Task 13: Final build and manual test

- [ ] **Step 1: Build check**

```bash
cd frontend && pnpm build
```
Expected: Build succeeds with no errors.

- [ ] **Step 2: Manual test at 375px, 768px, 1440px**

Run `cd frontend && pnpm dev`:

- [ ] Cover: title scales, button centered
- [ ] Hub: hamburger (mobile), icon nav (PC); drawer opens/closes
- [ ] Hub > Mods: 1-col (mobile), 4-col (PC)
- [ ] Hub > Worlds: pill selector (mobile), sidebar (PC); create dialog works
- [ ] Hub > LLM: form full-width mobile
- [ ] World View: sidebar collapse/expand both modes, bottom tabs (mobile), top tabs (PC)
- [ ] World View > EventStream: reduced padding mobile
- [ ] World View > Gantt: horizontal scroll works mobile
- [ ] World View > Chat: message bubbles, input bar mobile
- [ ] World View > Map: zoom-to-fit + pinch/drag mobile, scroll PC
- [ ] Profile panel: 90vw (mobile), 420px (PC)

- [ ] **Step 3: Commit any fixes from manual test**

```bash
git add -A
git commit -m "chore: final mobile responsive polish"
```
