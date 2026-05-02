# UI 重设计 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 agent-world UI 重设计：浅色默认主题 + V3 烛光夜读暗色副选 + Noto Sans SC 字体 + L3-v3 事件流主体五区布局 + 9 个视图入口齐全。

**Architecture:** 8 阶段渐进迁移。阶段 1 用 CSS 变量别名映射策略（保留旧 `--color-pixel-*` / `text-game-*` 名字但重指到新 token），让 9 个组件 337 处旧用法立即可在新主题下工作；后续阶段逐组件替换为新 token。新组件（tree-sidebar / event-stream / event-card / tick-bar / inject-drawer）从头使用新 token。主题状态通过 `html[data-theme="light|dark"]` 属性 + localStorage 驱动，layout.tsx 内联 script 消除 SSR 闪烁。

**Tech Stack:** Next.js (App Router), React 19, Tailwind CSS 4, next/font/google (Silkscreen + Noto Sans SC), TypeScript

---

## File Structure

New files created:

| File | Responsibility |
|---|---|
| `src/app/_hooks/use-theme.ts` | Theme toggle state, localStorage persistence, `data-theme` attribute sync |
| `src/app/_hooks/use-follow.ts` | Follow character state (session-only, no localStorage) |
| `src/app/_components/theme-switcher.tsx` | Thin button calling `useTheme().toggle`, renders 🌙/☀ |
| `src/app/_components/tree-sidebar.tsx` | Left column: collapsible map hierarchy tree + active NPC list |
| `src/app/_components/tick-bar.tsx` | Bottom bar: step controls, clock, speed, auto, replay toggle, inject button |
| `src/app/_components/event-stream.tsx` | Center main: event list grouped by tick, with filter/density header |
| `src/app/_components/event-card.tsx` | Single event card: avatar, actor, location chip, description, quote, action buttons |
| `src/app/_components/inject-drawer.tsx` | Slide-in placeholder drawer for event injection |
| `src/app/_components/relation-graph.tsx` | Placeholder ("关系图谱开发中…") |
| `src/app/_components/replay-mode.tsx` | Placeholder overlay for history replay mode |

Files heavily modified:

| File | Change |
|---|---|
| `src/app/globals.css` | Almost entirely rewritten: new token system, alias old vars, keep utility classes |
| `src/app/layout.tsx` | Add Noto Sans SC font, SSR theme script, change body default font |
| `src/app/_components/dashboard.tsx` | Rewrite: 5-area CSS grid, subscribe to useTheme/useFollow, wire state to children |
| `src/app/_components/top-bar.tsx` | Rewrite: breadcrumb, follow indicator, icon buttons, theme toggle, remove advance/auto buttons |
| `src/app/_components/map-stage.tsx` | Adapt: shrink to minimap with tab header, keep core render logic |
| `src/app/_components/profile-pane.tsx` | Add tab header (档案/独白/关系/经历), add follow button, placeholder tabs |
| `src/app/_lib/format.ts` | Add `formatHHMM(tick)` helper |

Files deleted/replaced:

| File | Replaced by |
|---|---|
| `src/app/_components/character-rail.tsx` | Merged into `tree-sidebar.tsx` (active NPC section) |
| `src/app/_components/events-pane.tsx` | Replaced by `event-stream.tsx` + `event-card.tsx` |

Files unchanged (auto-adapt via alias tokens):

| File | Why |
|---|---|
| `src/app/_components/pixel-frame.tsx` | Uses `--color-pixel-*` vars → alias maps to new tokens |
| `src/app/admin/page.tsx` | Same auto-adapt |

---

## Plan

### Task 1: Add formatHHMM helper

**Files:**
- Modify: `src/app/_lib/format.ts`

- [ ] **Step 1: Add formatHHMM to format.ts**

```ts
// append to src/app/_lib/format.ts

/** tick → "HH:00" short format for event cards. */
export function formatHHMM(tick: number): string {
  const start = new Date("2026-05-01T00:00:00");
  const d = new Date(start.getTime() + tick * 60 * 60 * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  return `${hh}:00`;
}

/** tick → "2026/05/02" date-only for tick-sep when day boundary crossed. */
export function formatDay(tick: number): string {
  const start = new Date("2026-05-01T00:00:00");
  const d = new Date(start.getTime() + tick * 60 * 60 * 1000);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -5`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/app/_lib/format.ts
git commit -m "feat(format): add formatHHMM and formatDay helpers"
```

---

### Task 2: CSS token system rewrite

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Replace globals.css with full new token system**

Write the complete file. The key is **alias compatibility** — old `--color-pixel-*` and `text-game-*` names survive with new values, so existing components work immediately.

```css
@import "tailwindcss";

/* ================================================================
 *  SHARED TOKEN (theme-independent)
 * ================================================================ */

:root, :root[data-theme="light"], :root[data-theme="dark"] {
  /* font size scale */
  --font-pixel-2xs: 9px;
  --font-pixel-xs:  10px;
  --font-pixel-sm:  11px;
  --font-pixel-md:  12px;
  --font-pixel-lg:  13px;

  --font-body-xs:   12px;
  --font-body-sm:   13px;
  --font-body-md:   14px;
  --font-body-lg:   16px;
  --font-display-sm: 18px;
  --font-display-md: 22px;

  /* line heights */
  --lh-tight: 1.3;
  --lh-normal: 1.6;
  --lh-loose: 1.75;

  /* letter spacing */
  --letter-pixel: 0.18em;
  --letter-pixel-tight: 0.1em;

  /* spacing */
  --sp-1: 4px;
  --sp-2: 6px;
  --sp-3: 8px;
  --sp-4: 10px;
  --sp-5: 12px;
  --sp-6: 14px;
  --sp-7: 16px;
  --sp-8: 20px;
  --sp-9: 24px;

  /* ring widths for pixel double-border */
  --ring-1: 1px;
  --ring-2: 2px;
  --ring-3: 3px;
}

/* ================================================================
 *  LIGHT THEME (default) — parchment + cream
 * ================================================================ */

:root, :root[data-theme="light"] {
  --frame:        #e6d5b0;
  --frame-2:      #ddc9a0;
  --chrome:       #c4a574;
  --chrome-hi:    #d4b88a;
  --panel:        #faf3e0;
  --panel-2:      #f4ecd0;

  --border:       #4a2e15;
  --border-soft:  #6e4a25;
  --border-amber: #b88a4a;

  --text:         #3d2a16;
  --text-muted:   #7a5230;
  --text-faint:   #a8845a;

  --accent:       #b88a4a;
  --accent-strong:#8c6e2a;
  --accent-hi:    #d4a04a;

  --danger:       #c44e2a;
  --danger-hi:    #ff8a5c;
  --danger-shadow:#6a1a0a;
  --success:      #4a8d4a;

  --map-bg-from:  #c4d2e8;
  --map-bg-to:    #6b8aa3;

  /* text-on-frame (same as text for light — frame is also light) */
  --text-on-frame:       var(--text);
  --text-on-frame-muted: var(--text-muted);
  --text-on-frame-faint: var(--text-faint);

  /* ---- OLD TOKEN ALIASES (compatibility with 9 existing components) ---- */
  --color-pixel-bg:           var(--frame);
  --color-pixel-bg-2:         var(--frame-2);
  --color-pixel-fg:           var(--text);
  --color-pixel-muted:        var(--text-muted);
  --color-pixel-border-light: var(--border-amber);
  --color-pixel-border-dark:  var(--border);
  --color-pixel-accent:       var(--accent);
  --color-pixel-accent-dark:  var(--accent-strong);
  --color-pixel-danger:       var(--danger);
  --color-pixel-success:      var(--success);
}

/* ================================================================
 *  DARK THEME (V3 — candle-lit reading)
 * ================================================================ */

:root[data-theme="dark"] {
  --frame:        #1a1410;
  --frame-2:      #221913;
  --chrome:       #2a1f17;
  --chrome-hi:    #6e4a25;
  --panel:        #e8d4a3;
  --panel-2:      #d4c08a;

  --border:       #4a2e15;
  --border-soft:  #2a1306;
  --border-amber: #b88a4a;

  --text:         #3d2a16;
  --text-muted:   #7a5230;
  --text-faint:   #a8845a;

  --text-on-frame:       #e8d4a3;
  --text-on-frame-muted: #b88a4a;
  --text-on-frame-faint: #8a6a40;

  --accent:       #b88a4a;
  --accent-strong:#ffd980;
  --accent-hi:    #ffd980;

  --danger:       #c44e2a;
  --danger-hi:    #ff8a5c;
  --danger-shadow:#6a1a0a;
  --success:      #6ec07a;

  --map-bg-from:  #2c4055;
  --map-bg-to:    #0c1620;

  /* ---- OLD TOKEN ALIASES ---- */
  --color-pixel-bg:           var(--frame);
  --color-pixel-bg-2:         var(--frame-2);
  --color-pixel-fg:           var(--text-on-frame);
  --color-pixel-muted:        var(--text-on-frame-muted);
  --color-pixel-border-light: var(--border-amber);
  --color-pixel-border-dark:  var(--border);
  --color-pixel-accent:       var(--accent-strong);
  --color-pixel-accent-dark:  var(--accent);
  --color-pixel-danger:       var(--danger);
  --color-pixel-success:      var(--success);
}

/* ================================================================
 *  TAILWIND THEME REGISTRATION
 * ================================================================ */

@theme inline {
  --color-background: var(--frame);
  --color-foreground: var(--text);
  --font-pixel: var(--font-pixel);
}

/* ================================================================
 *  FONT UTILITY CLASSES
 * ================================================================ */

/* pixel chrome */
.text-pixel-2xs { font-family: var(--font-pixel), monospace; font-size: var(--font-pixel-2xs); }
.text-pixel-xs  { font-family: var(--font-pixel), monospace; font-size: var(--font-pixel-xs); }
.text-pixel-sm  { font-family: var(--font-pixel), monospace; font-size: var(--font-pixel-sm); }
.text-pixel-md  { font-family: var(--font-pixel), monospace; font-size: var(--font-pixel-md); }
.text-pixel-lg  { font-family: var(--font-pixel), monospace; font-size: var(--font-pixel-lg); }

/* body text */
.text-body-xs { font-size: var(--font-body-xs); }
.text-body-sm { font-size: var(--font-body-sm); }
.text-body-md { font-size: var(--font-body-md); }
.text-body-lg { font-size: var(--font-body-lg); }
.text-display-sm { font-size: var(--font-display-sm); }
.text-display-md { font-size: var(--font-display-md); }

/* ---- OLD COMPAT (keep old class names, update values) ---- */
.text-game-2xs  { font-size: var(--font-pixel-2xs); }
.text-game-xs   { font-size: var(--font-body-xs); }
.text-game-sm   { font-size: var(--font-body-sm); }
.text-game-base { font-size: var(--font-body-md); }
.text-game-lg   { font-size: var(--font-body-lg); }
.text-game-xl   { font-size: var(--font-display-md); }

/* ================================================================
 *  GLOBAL
 * ================================================================ */

body {
  background: var(--frame);
  color: var(--text);
  font-family: var(--font-body), "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
}

/* ================================================================
 *  PIXEL UTILITY CLASSES (adapt to new tokens)
 * ================================================================ */

.pixelated {
  image-rendering: pixelated;
  image-rendering: -moz-crisp-edges;
}

.pixel-frame {
  position: relative;
  background: var(--panel);
  border: var(--ring-2) solid var(--border);
  box-shadow:
    inset 0 0 0 var(--ring-1) var(--border-amber),
    0 0 0 var(--ring-1) var(--border-soft);
}

.pixel-frame--accent {
  border-color: var(--border);
  box-shadow:
    inset 0 0 0 var(--ring-1) var(--accent-hi),
    0 0 0 var(--ring-1) var(--border);
}

/* node tiles */
.node-tile {
  position: absolute;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--tile-base);
  border: var(--ring-2) solid var(--tile-shadow);
  box-shadow:
    inset 0 4px 0 var(--tile-hi),
    inset 0 -4px 0 var(--tile-shadow),
    0 0 0 var(--ring-2) var(--border);
  transition: transform 80ms steps(2), filter 80ms;
}

.node-tile:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.node-tile--current {
  outline: var(--ring-2) solid var(--accent);
  outline-offset: 2px;
}

.node-tile--private .node-tile__header::after {
  content: " 🔒";
}

.node-tile__header {
  flex-shrink: 0;
  text-align: center;
  padding: 2px 4px;
  font-size: var(--font-pixel-sm);
  letter-spacing: var(--letter-pixel);
  color: var(--border);
  text-shadow: 0 var(--ring-1) 0 var(--panel);
  background: var(--tile-hi);
  border-bottom: var(--ring-1) solid var(--tile-shadow);
}

.node-tile__body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  justify-content: center;
  align-content: flex-start;
  padding: 3px 2px;
  min-height: 0;
}

/* NPC chips */
.npc-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--border-amber);
  border: var(--ring-2) solid var(--border);
  box-shadow: inset 0 0 0 var(--ring-1) var(--accent-hi);
  font-size: 16px;
  line-height: 1;
}

.npc-chip--lg {
  width: 40px;
  height: 40px;
  font-size: 22px;
}

.npc-chip--selected {
  border-color: var(--border);
  box-shadow: inset 0 0 0 var(--ring-1) var(--accent-hi), 0 0 0 var(--ring-1) var(--accent-strong);
}

/* pixel scrollbar */
.pixel-scroll::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
.pixel-scroll::-webkit-scrollbar-track {
  background: var(--frame-2);
}
.pixel-scroll::-webkit-scrollbar-thumb {
  background: var(--border-amber);
  border: var(--ring-2) solid var(--frame-2);
}
.pixel-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--accent);
}

/* ================================================================
 *  EVENT CARD STYLES
 * ================================================================ */

.ev-card {
  background: var(--panel);
  color: var(--text);
  border: var(--ring-2) solid var(--border);
  box-shadow:
    inset 0 0 0 var(--ring-2) var(--border-amber),
    0 var(--ring-1) 0 var(--border-soft);
  padding: var(--sp-5) var(--sp-6);
  position: relative;
  font-family: var(--font-body), "Microsoft YaHei", sans-serif;
}

.ev-card--important {
  box-shadow:
    inset 0 0 0 var(--ring-2) var(--accent-hi),
    0 var(--ring-1) 0 var(--border-soft);
}

.ev-card--important::before {
  content: "";
  position: absolute;
  left: calc(-1 * var(--ring-2));
  top: calc(-1 * var(--ring-2));
  bottom: calc(-1 * var(--ring-2));
  width: 4px;
  background: var(--danger);
}

.ev-card--aggregated {
  background: color-mix(in srgb, var(--border-amber) 12%, transparent);
  border: var(--ring-1) dashed var(--text-muted);
  box-shadow: none;
  color: var(--text-muted);
  padding: var(--sp-3) var(--sp-6);
  text-align: center;
  cursor: pointer;
}

.ev-card__quote {
  font-style: italic;
  padding: var(--sp-3) var(--sp-5);
  margin-top: var(--sp-3);
  background: color-mix(in srgb, var(--border-amber) 15%, transparent);
  border-left: var(--ring-3) solid var(--border-amber);
  color: var(--text);
  line-height: var(--lh-loose);
}

/* ================================================================
 *  TICK SEPARATOR
 * ================================================================ */

.tick-sep {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  color: var(--text-on-frame-muted);
  font-family: var(--font-pixel), monospace;
  font-size: var(--font-pixel-xs);
  letter-spacing: var(--letter-pixel);
}

.tick-sep__line {
  flex: 1;
  height: 1px;
  background: var(--border-amber);
  opacity: 0.5;
}
```

- [ ] **Step 2: Verify build compiles with new CSS**

Run: `cd E:/Projects/agent-world && npx next build 2>&1 | tail -20`

If the build fails due to CSS errors, fix them. Note: **the page will look different but functional** since old components now use new token values through aliases.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(css): rewrite token system — light parchment + dark V3 themes with old-var aliases"
```

---

### Task 3: Font loading (Noto Sans SC + SSR theme script)

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Rewrite layout.tsx**

```tsx
import type { Metadata } from "next";
import { Silkscreen, Noto_Sans_SC } from "next/font/google";
import "./globals.css";

const silkscreen = Silkscreen({
  variable: "--font-pixel",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

const notoSansSC = Noto_Sans_SC({
  variable: "--font-body",
  subsets: ["chinese-simplified"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "agent-world · 月ノ谷",
  description: "LLM-as-NPC 模拟世界 · 北海道の村",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${silkscreen.variable} ${notoSansSC.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem("agent-world.theme") || "light";
                document.documentElement.setAttribute("data-theme", t);
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="h-full flex flex-col overflow-hidden">
        {children}
      </body>
    </html>
  );
}
```

Key changes from current:
- Added `Noto_Sans_SC` import
- Body no longer has `bg-(--color-pixel-bg) text-(--color-pixel-fg)` — inherited from `globals.css` body rule
- SSR theme script injected in `<head>`
- `suppressHydrationWarning` so React doesn't warn about theme attribute mismatch

- [ ] **Step 2: Dev server test**

Run: `npx next dev -p 3000`
Open `http://localhost:3000` — verify:
- Body font is Noto Sans SC (Chinese text no longer uses Courier)
- Background is parchment (#e6d5b0) not dark (#0e1018)
- Silkscreen still works in pixel-labeled elements

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(layout): add Noto Sans SC font + SSR theme script"
```

---

### Task 4: useTheme hook + ThemeSwitcher button

**Files:**
- Create: `src/app/_hooks/use-theme.ts`
- Create: `src/app/_components/theme-switcher.tsx`

- [ ] **Step 1: Create useTheme hook**

```ts
// src/app/_hooks/use-theme.ts
"use client";

import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "agent-world.theme";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const saved = localStorage.getItem(KEY) as Theme | null;
    const initial = saved ?? "light";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem(KEY, next);
      document.documentElement.setAttribute("data-theme", next);
      return next;
    });
  }, []);

  return { theme, toggle };
}
```

- [ ] **Step 2: Create ThemeSwitcher**

```tsx
// src/app/_components/theme-switcher.tsx
"use client";

import { useTheme } from "../_hooks/use-theme";

export function ThemeSwitcher({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className={`w-7 h-7 bg-(--border-amber) text-(--panel) border border-(--border) text-sm cursor-pointer ${className}`}
      title={theme === "light" ? "切到暗主题" : "切到亮主题"}
    >
      {theme === "light" ? "\u{1F319}" : "\u{2600}\u{FE0F}"}
    </button>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/_hooks/use-theme.ts src/app/_components/theme-switcher.tsx
git commit -m "feat(theme): add useTheme hook + ThemeSwitcher component"
```

---

### Task 5: useFollow hook

**Files:**
- Create: `src/app/_hooks/use-follow.ts`

- [ ] **Step 1: Create useFollow hook**

```ts
// src/app/_hooks/use-follow.ts
"use client";

import { useCallback, useState } from "react";

export function useFollow() {
  const [followingId, setFollowingId] = useState<string | null>(null);

  const follow = useCallback((id: string) => setFollowingId(id), []);
  const clear = useCallback(() => setFollowingId(null), []);
  const isFollowing = useCallback(
    (id: string) => followingId === id,
    [followingId],
  );

  return { followingId, follow, clear, isFollowing };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_hooks/use-follow.ts
git commit -m "feat(follow): add useFollow hook for session-level NPC following"
```

---

### Task 6: New TopBar

**Files:**
- Modify: `src/app/_components/top-bar.tsx`

- [ ] **Step 1: Rewrite top-bar.tsx**

```tsx
// src/app/_components/top-bar.tsx
"use client";

import type { MapNode } from "@/domain/types";
import { formatGameTime } from "../_lib/format";
import { pathFromRoot } from "../_lib/world";
import { ThemeSwitcher } from "./theme-switcher";

export function TopBar({
  tick,
  worldName,
  currentNodeId,
  nodes,
  followingName,
  onJumpToNode,
  onClearFollow,
}: {
  tick: number;
  worldName: string;
  currentNodeId: string | null;
  nodes: MapNode[];
  followingName: string | null;
  onJumpToNode: (nodeId: string) => void;
  onClearFollow: () => void;
}) {
  const breadcrumb =
    currentNodeId
      ? pathFromRoot(nodes, currentNodeId)
      : [];

  return (
    <header className="flex items-center gap-3 px-3 border-b-2 border-(--border) bg-gradient-to-b from-(--chrome-hi) to-(--chrome) shadow-[inset_0_-1px_0_var(--border-amber))]">
      <span className="text-pixel-lg tracking-[var(--letter-pixel)] text-(--accent-strong)">
        ◆ {worldName}
      </span>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-body-sm text-(--text-on-frame-muted)">
        {breadcrumb.map((n, i) => (
          <span key={n.id} className="flex items-center gap-1 whitespace-nowrap">
            {i > 0 && <span>›</span>}
            {i === breadcrumb.length - 1 ? (
              <b className="text-(--text-on-frame)">{n.name}</b>
            ) : (
              <button
                type="button"
                onClick={() => onJumpToNode(n.id)}
                className="hover:text-(--text-on-frame) cursor-pointer"
              >
                {n.name}
              </button>
            )}
          </span>
        ))}
      </nav>

      {/* Follow indicator */}
      {followingName && (
        <span className="flex items-center gap-1 px-2 py-0.5 text-body-xs bg-(--border-amber)/15 border border-(--border-amber) text-(--text-on-frame)">
          👁 跟随：{followingName}
          <button
            type="button"
            onClick={onClearFollow}
            className="ml-1.5 text-(--danger) cursor-pointer"
            title="取消跟随"
          >
            ✕
          </button>
        </span>
      )}

      <div className="flex-1" />

      {/* Icon buttons — all placeholder except theme */}
      <button
        type="button"
        disabled
        title="搜索 (Coming Soon)"
        className="w-7 h-7 bg-transparent border border-(--border-amber) text-(--text-on-frame-muted) text-sm cursor-not-allowed opacity-50"
      >
        🔍
      </button>
      <button
        type="button"
        disabled
        title="快照 (Coming Soon)"
        className="w-7 h-7 bg-transparent border border-(--border-amber) text-(--text-on-frame-muted) text-sm cursor-not-allowed opacity-50"
      >
        💾
      </button>
      <button
        type="button"
        disabled
        title="设置 (Coming Soon)"
        className="w-7 h-7 bg-transparent border border-(--border-amber) text-(--text-on-frame-muted) text-sm cursor-not-allowed opacity-50"
      >
        ⚙
      </button>
      <ThemeSwitcher />

      <span className="text-pixel-xs text-(--accent-strong) tracking-[var(--letter-pixel-tight)]">
        T={tick} · {formatGameTime(tick)}
      </span>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/top-bar.tsx
git commit -m "refactor(top-bar): rewrite with breadcrumb, follow indicator, theme toggle, placeholder icons"
```

---

### Task 7: TickBar — bottom control bar

**Files:**
- Create: `src/app/_components/tick-bar.tsx`

- [ ] **Step 1: Create tick-bar.tsx**

```tsx
// src/app/_components/tick-bar.tsx
"use client";

import { formatGameTime } from "../_lib/format";

export function TickBar({
  tick,
  loading,
  onAdvance,
  autoMode,
  onStartAuto,
  onStopAuto,
  lastTickMs,
  tickProgress,
  onOpenInject,
}: {
  tick: number;
  loading: boolean;
  onAdvance: () => void;
  autoMode: { running: boolean; total: number; done: number } | null;
  onStartAuto: () => void;
  onStopAuto: () => void;
  lastTickMs: number | null;
  tickProgress?: { done: number; total: number } | null;
  onOpenInject: () => void;
}) {
  const auto = autoMode?.running ?? false;

  return (
    <footer className="flex items-center gap-2 px-4 bg-gradient-to-b from-(--chrome) to-(--chrome-hi) border-t-2 border-(--border) shadow-[inset_0_1px_0_var(--border-amber))]">
      {/* Group 1: Step controls */}
      <div className="flex items-center gap-1 pr-3 border-r border-(--border)">
        <TickBtn disabled title="单步回退 (Coming Soon)">⏮</TickBtn>
        <TickBtn primary onClick={onAdvance} disabled={loading}>
          ▶
        </TickBtn>
        <TickBtn disabled title="暂停 (Coming Soon)">⏸</TickBtn>
        <TickBtn disabled title="单步前进 (Coming Soon)">⏭</TickBtn>
      </div>

      {/* Group 2: Clock */}
      <div className="pr-3 border-r border-(--border)">
        <span className="text-pixel-md text-(--accent-strong) tracking-[var(--letter-pixel-tight)]">
          {formatGameTime(tick)}
        </span>
      </div>

      {/* Group 3: Speed */}
      <div className="flex items-center gap-0 pr-3 border-r border-(--border)">
        <SpeedBtn active disabled={false}>1×</SpeedBtn>
        <SpeedBtn disabled>2×</SpeedBtn>
        <SpeedBtn disabled>4×</SpeedBtn>
      </div>

      {/* Group 4: Auto */}
      <div className="pr-3 border-r border-(--border)">
        {auto ? (
          <button
            type="button"
            onClick={onStopAuto}
            className="px-3 py-1 text-pixel-sm bg-(--danger) text-(--panel) border border-(--border) cursor-pointer hover:brightness-110"
          >
            停止 ⏹
          </button>
        ) : (
          <button
            type="button"
            onClick={onStartAuto}
            disabled={loading}
            className="px-3 py-1 text-pixel-sm bg-(--border-amber) text-(--text-on-frame) border border-(--border) cursor-pointer disabled:opacity-50 hover:brightness-110"
          >
            ⏵⏵ 自动 24h
          </button>
        )}
      </div>

      {/* Group 5: Replay mode toggle */}
      <div className="pr-3 border-r border-(--border)">
        <button
          type="button"
          disabled
          title="历史回放 (Coming Soon)"
          className="px-3 py-1 text-pixel-xs bg-transparent border border-(--border-amber) text-(--text-on-frame-muted) cursor-not-allowed opacity-50"
        >
          ↻ 历史回放
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Progress / timing info */}
      {lastTickMs !== null && (
        <span className="text-pixel-xs text-(--text-on-frame-faint) pr-2">
          上次 {Math.round(lastTickMs)}ms
        </span>
      )}
      {!auto && tickProgress && tickProgress.total > 0 && (
        <span className="text-pixel-xs text-(--accent-strong) pr-2">
          {tickProgress.done}/{tickProgress.total}
        </span>
      )}

      {/* Group 6: Inject event */}
      <button
        type="button"
        onClick={onOpenInject}
        className="px-4 py-1.5 text-pixel-sm bg-(--danger) text-(--panel) border-2 border-(--danger-shadow) shadow-[inset_0_2px_0_var(--danger-hi),inset_0_-2px_0_var(--danger-shadow)] cursor-pointer hover:brightness-110 active:translate-y-px tracking-[var(--letter-pixel-tight)]"
      >
        ⚡ 投放事件 (E)
      </button>
    </footer>
  );
}

/* ---- helpers ---- */

function TickBtn({
  children,
  primary,
  disabled,
  onClick,
  title,
}: {
  children: React.ReactNode;
  primary?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`px-2 py-1 text-pixel-sm border border-(--border-amber) cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 ${
        primary
          ? "bg-(--border-amber) text-(--text-on-frame)"
          : "bg-(--frame-2) text-(--text-on-frame)"
      }`}
    >
      {children}
    </button>
  );
}

function SpeedBtn({
  children,
  active,
  disabled,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`px-2 py-1 text-pixel-sm border border-(--border-amber) cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
        active
          ? "bg-(--accent-hi) text-(--border)"
          : "bg-(--frame-2) text-(--text-on-frame)"
      }`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/tick-bar.tsx
git commit -m "feat(tick-bar): add bottom control bar with step/speed/auto/replay/inject"
```

---

### Task 8: Dashboard grid skeleton

**Files:**
- Modify: `src/app/_components/dashboard.tsx`

- [ ] **Step 1: Rewrite dashboard.tsx with 5-area grid**

```tsx
// src/app/_components/dashboard.tsx
"use client";

import { useEffect, useMemo } from "react";
import { useViewState } from "../_hooks/use-view-state";
import { useWorldState } from "../_hooks/use-world-state";
import { useTheme } from "../_hooks/use-theme";
import { useFollow } from "../_hooks/use-follow";
import { findRootNode } from "../_lib/world";
import { TopBar } from "./top-bar";
import { TickBar } from "./tick-bar";
import { TreeSidebar } from "./tree-sidebar";
import { EventStream } from "./event-stream";
import { ProfilePane } from "./profile-pane";
import { MapStage, MinimapTabs } from "./map-stage";
import { RelationGraph } from "./relation-graph";
import { InjectDrawer } from "./inject-drawer";

export function Dashboard() {
  const { snapshot, events, loading, error, lastTickMs, tickProgress, advance, autoMode, startAuto, stopAuto, templates, placeCharacter } = useWorldState();
  const view = useViewState();
  const { theme } = useTheme();
  const { followingId, follow, clear: clearFollow, isFollowing } = useFollow();

  useEffect(() => {
    if (!snapshot) return;
    const root = findRootNode(snapshot.nodes);
    if (root) view.initRootIfNeeded(root.id);
  }, [snapshot, view]);

  const selectedCharacter = useMemo(() => {
    if (!snapshot || !view.selectedCharacterId) return null;
    return snapshot.characters.find((c) => c.id === view.selectedCharacterId) ?? null;
  }, [snapshot, view.selectedCharacterId]);

  const followingCharacter = useMemo(() => {
    if (!snapshot || !followingId) return null;
    return snapshot.characters.find((c) => c.id === followingId) ?? null;
  }, [snapshot, followingId]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <TopBar
        tick={snapshot?.world.currentTick ?? 0}
        worldName={snapshot?.world.name ?? "加载中…"}
        currentNodeId={view.currentNodeId}
        nodes={snapshot?.nodes ?? []}
        followingName={followingCharacter?.name ?? null}
        onJumpToNode={view.setCurrentNode}
        onClearFollow={clearFollow}
      />

      {!snapshot || !view.currentNodeId ? (
        <div className="flex-1 flex items-center justify-center text-(--text-on-frame-muted) text-body-lg">
          {error ? `加载失败：${error}` : loading ? "加载中…" : "无数据"}
        </div>
      ) : (
        <div
          className="flex-1 min-h-0 grid gap-0 overflow-hidden"
          style={{
            gridTemplateColumns: "200px 1fr 360px",
            gridTemplateRows: "1fr 56px",
            gridTemplateAreas: `
              "tree stream right"
              "bottom bottom bottom"
            `,
            minWidth: 1200,
          }}
        >
          {/* Left: Tree sidebar */}
          <div style={{ gridArea: "tree" }} className="min-h-0 min-w-0 overflow-hidden">
            <TreeSidebar
              nodes={snapshot.nodes}
              characters={snapshot.characters}
              currentNodeId={view.currentNodeId}
              events={events}
              selectedCharacterId={view.selectedCharacterId}
              followingId={followingId}
              onJumpToNode={view.setCurrentNode}
              onSelectCharacter={(c) => view.selectCharacter(c.id)}
              templates={templates}
              onPlace={placeCharacter}
              disabled={loading || (autoMode?.running ?? false)}
            />
          </div>

          {/* Center: Event stream */}
          <div style={{ gridArea: "stream" }} className="min-h-0 min-w-0 overflow-hidden">
            <EventStream
              events={events}
              characters={snapshot.characters}
              nodes={snapshot.nodes}
              followingId={followingId}
              onJumpToNode={view.setCurrentNode}
              onSelectCharacter={(c) => view.selectCharacter(c.id)}
              onFollow={follow}
            />
          </div>

          {/* Right: minimap + character */}
          <div style={{ gridArea: "right" }} className="min-h-0 min-w-0 overflow-hidden flex flex-col">
            {/* Minimap section with tabs (map / relation graph) */}
            <div className="flex-[0_0_220px] min-h-0 overflow-hidden">
              <MinimapTabs>
                <MapStage
                  nodes={snapshot.nodes}
                  characters={snapshot.characters}
                  currentNodeId={view.currentNodeId}
                  selectedCharacterId={view.selectedCharacterId}
                  onEnterNode={view.setCurrentNode}
                  onSelectCharacter={(c) => view.selectCharacter(c.id)}
                />
                <RelationGraph />
              </MinimapTabs>
            </div>

            {/* Character profile (tabbed) */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <ProfilePane
                character={selectedCharacter}
                nodes={snapshot.nodes}
                onJumpToNode={view.setCurrentNode}
                characters={snapshot.characters}
                events={events}
                onFollow={follow}
                isFollowing={selectedCharacter ? isFollowing(selectedCharacter.id) : false}
              />
            </div>
          </div>

          {/* Bottom: Tick bar */}
          <div style={{ gridArea: "bottom" }}>
            <TickBar
              tick={snapshot.world.currentTick}
              loading={loading}
              onAdvance={() => void advance()}
              autoMode={autoMode}
              onStartAuto={() => void startAuto()}
              onStopAuto={stopAuto}
              lastTickMs={lastTickMs}
              tickProgress={tickProgress}
              onOpenInject={() => {} /* TODO: inject drawer */}
            />
          </div>
        </div>
      )}

      {/* Inject drawer (rendered at root level for slide-in) */}
      <InjectDrawer isOpen={false} onClose={() => {}} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/dashboard.tsx
git commit -m "feat(dashboard): rewrite with 5-area CSS grid — tree/stream/minimap+profile/tickbar"
```

---

### Task 9: TreeSidebar

**Files:**
- Create: `src/app/_components/tree-sidebar.tsx`

- [ ] **Step 1: Create tree-sidebar.tsx**

```tsx
// src/app/_components/tree-sidebar.tsx
"use client";

import { useState, useCallback } from "react";
import type { Character, MapNode, WorldEvent } from "@/domain/types";
import { NPC_EMOJI, NPC_FALLBACK_EMOJI } from "../_lib/sprite";
import { childrenOf, indexNodes } from "../_lib/world";

interface Template {
  id: string;
  name: string;
  avatar: string | null;
}

export function TreeSidebar({
  nodes,
  characters,
  currentNodeId,
  events,
  selectedCharacterId,
  followingId,
  onJumpToNode,
  onSelectCharacter,
  templates,
  onPlace,
  disabled,
}: {
  nodes: MapNode[];
  characters: Character[];
  currentNodeId: string;
  events: WorldEvent[];
  selectedCharacterId: string | null;
  followingId: string | null;
  onJumpToNode: (id: string) => void;
  onSelectCharacter: (c: Character) => void;
  templates: Template[];
  onPlace: (characterId: string) => Promise<boolean>;
  disabled: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const nodeById = indexNodes(nodes);
  const root = nodes.find((n) => n.parentId === null);

  // Group characters by location
  const charsByLoc = new Map<string, Character[]>();
  for (const c of characters) {
    const arr = charsByLoc.get(c.locationId) ?? [];
    arr.push(c);
    charsByLoc.set(c.locationId, arr);
  }

  // Pulse: nodes with events >= intensity 3 at that node
  const pulsingNodes = new Set<string>();
  for (const ev of events) {
    if (ev.intensity >= 3 && ev.nodeId) pulsingNodes.add(ev.nodeId);
  }

  const collapsedWidth = 36;

  if (collapsed) {
    return (
      <div
        className="h-full flex flex-col items-center pt-3 bg-(--frame-2) border-r-2 border-(--border) shadow-[inset_-1px_0_0_var(--border-amber))]"
        style={{ width: collapsedWidth }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="text-pixel-xs text-(--text-on-frame-muted) hover:text-(--text-on-frame) cursor-pointer"
          title="展开地图树"
        >
          ▶
        </button>
        <span
          className="mt-2 text-pixel-xs text-(--text-on-frame-faint) tracking-[var(--letter-pixel)]"
          style={{ writingMode: "vertical-rl" }}
        >
          地图层级
        </span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-(--frame-2) border-r-2 border-(--border) shadow-[inset_-1px_0_0_var(--border-amber))] overflow-hidden">
      {/* Collapse button */}
      <div className="flex justify-end px-2 pt-2">
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="px-1.5 py-0.5 text-pixel-xs bg-(--chrome) text-(--text-on-frame-muted) border border-(--border-amber) cursor-pointer hover:text-(--text-on-frame)"
          title="折叠地图树"
        >
          ◀
        </button>
      </div>

      {/* Map hierarchy */}
      <div className="text-pixel-xs text-(--text-on-frame-faint) tracking-[var(--letter-pixel)] uppercase px-3 pt-2 pb-1 border-b border-(--border)">
        地图层级
      </div>
      <div className="overflow-y-auto pixel-scroll flex-shrink">
        {root && (
          <TreeItem
            node={root}
            nodeById={nodeById}
            childrenOf={childrenOf}
            currentNodeId={currentNodeId}
            pulsingNodes={pulsingNodes}
            onJumpToNode={onJumpToNode}
            depth={0}
          />
        )}
      </div>

      {/* Active NPCs */}
      <div className="text-pixel-xs text-(--text-on-frame-faint) tracking-[var(--letter-pixel)] uppercase px-3 pt-3 pb-1 border-b border-t border-(--border)">
        活跃 NPC
      </div>
      <div className="flex-1 overflow-y-auto pixel-scroll">
        {characters.map((c) => {
          const here = nodeById.get(c.locationId);
          const selected = c.id === selectedCharacterId;
          const followed = c.id === followingId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelectCharacter(c)}
              className={`w-full text-left px-3 py-1.5 text-body-xs flex items-center gap-2 cursor-pointer transition-colors ${
                selected
                  ? "bg-(--border-amber) text-(--panel)"
                  : "text-(--text-on-frame-muted) hover:bg-(--border-amber)/20"
              }`}
            >
              <span className="text-sm">
                {NPC_EMOJI[c.id] ?? NPC_FALLBACK_EMOJI}
              </span>
              <span className="flex-1 truncate">{c.name}</span>
              {followed && <span className="text-pixel-xs text-(--accent-strong)">👁</span>}
              {selected && !followed && <span className="text-pixel-xs opacity-50">◆</span>}
            </button>
          );
        })}
        <div className="px-3 py-1.5 text-body-xs text-(--text-on-frame-faint) opacity-50">
          共 {characters.length} 人
        </div>
      </div>

      {/* Place character button */}
      {templates.length > 0 && (
        <div className="p-2 border-t border-(--border)">
          <button
            type="button"
            disabled={disabled}
            className="w-full py-1 text-pixel-xs text-(--text-on-frame-muted) border border-(--border-amber) bg-(--frame) cursor-pointer hover:text-(--text-on-frame) disabled:opacity-40"
            title="从模板中投放角色到当前节点"
          >
            + 投放角色
          </button>
        </div>
      )}
    </div>
  );
}

/* ---- recursive tree item ---- */

function TreeItem({
  node,
  nodeById,
  childrenOf,
  currentNodeId,
  pulsingNodes,
  onJumpToNode,
  depth,
}: {
  node: MapNode;
  nodeById: Map<string, MapNode>;
  childrenOf: (nodes: MapNode[], parentId: string | null) => MapNode[];
  currentNodeId: string;
  pulsingNodes: Set<string>;
  onJumpToNode: (id: string) => void;
  depth: number;
}) {
  const active = node.id === currentNodeId;
  const hasPulse = pulsingNodes.has(node.id);
  const kids = childrenOf(
    Array.from(nodeById.values()),
    node.id,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => onJumpToNode(node.id)}
        className={`w-full text-left px-3 py-1.5 text-body-xs flex items-center gap-1.5 cursor-pointer transition-colors ${
          active
            ? "bg-(--border-amber) text-(--panel)"
            : "text-(--text-on-frame-muted) hover:bg-(--border-amber)/20"
        }`}
      >
        <span className="opacity-50 text-pixel-xs">
          {"　".repeat(depth)}
        </span>
        <span className="text-pixel-xs text-(--text-on-frame-faint)">
          {kids.length > 0 ? "▾" : "▸"}
        </span>
        <span className="flex-1 truncate">{node.name}</span>
        {hasPulse && (
          <span className="text-(--danger) text-pixel-xs">●</span>
        )}
      </button>
      {active &&
        kids.map((kid) => (
          <TreeItem
            key={kid.id}
            node={kid}
            nodeById={nodeById}
            childrenOf={childrenOf}
            currentNodeId={currentNodeId}
            pulsingNodes={pulsingNodes}
            onJumpToNode={onJumpToNode}
            depth={depth + 1}
          />
        ))}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/tree-sidebar.tsx
git commit -m "feat(tree): add collapsible map hierarchy tree + active NPC list"
```

---

### Task 10: EventCard component

**Files:**
- Create: `src/app/_components/event-card.tsx`

- [ ] **Step 1: Create event-card.tsx**

```tsx
// src/app/_components/event-card.tsx
"use client";

import type { Character, MapNode, WorldEvent } from "@/domain/types";
import { NPC_EMOJI, NPC_FALLBACK_EMOJI } from "../_lib/sprite";
import { formatHHMM } from "../_lib/format";

export function EventCard({
  event,
  characters,
  nodes,
  onJumpToNode,
  onSelectCharacter,
  onFollow,
}: {
  event: WorldEvent;
  characters: Character[];
  nodes: MapNode[];
  onJumpToNode: (id: string) => void;
  onSelectCharacter: (c: Character) => void;
  onFollow: (id: string) => void;
}) {
  const charById = new Map(characters.map((c) => [c.id, c]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const important = event.intensity >= 3;
  const actor = event.participants.length > 0
    ? charById.get(event.participants[0])
    : undefined;
  const loc = event.nodeId ? nodeById.get(event.nodeId) : undefined;

  return (
    <div className={`ev-card ${important ? "ev-card--important" : ""}`}>
      <div className="flex items-center gap-2 mb-1.5">
        {/* Avatar */}
        {actor && (
          <span className="npc-chip w-7 h-7 text-base">
            {NPC_EMOJI[actor.id] ?? NPC_FALLBACK_EMOJI}
          </span>
        )}

        {/* Actor name */}
        {actor && (
          <button
            type="button"
            onClick={() => onSelectCharacter(actor)}
            className="text-body-sm font-semibold text-(--text) hover:underline cursor-pointer"
          >
            {actor.name}
          </button>
        )}

        {/* Location chip */}
        {loc && (
          <button
            type="button"
            onClick={() => onJumpToNode(loc.id)}
            className="text-pixel-xs text-(--text-muted) tracking-[var(--letter-pixel-tight)] bg-(--border-amber)/20 px-1.5 py-0.5 cursor-pointer hover:bg-(--border-amber)/40"
          >
            📍 {loc.name}
          </button>
        )}

        {/* Important tag */}
        {important && (
          <span className="text-pixel-2xs bg-(--danger) text-(--panel) px-1.5 py-0.5 tracking-[var(--letter-pixel)]">
            ⚠ 重要
          </span>
        )}

        {/* Time */}
        <span className="ml-auto text-pixel-xs text-(--text-faint) tracking-[var(--letter-pixel-tight)]">
          {formatHHMM(event.tick)}
        </span>
      </div>

      {/* Description */}
      <div className="text-body-md text-(--text) leading-[var(--lh-normal)]">
        {event.description}
      </div>

      {/* Quote for inner events */}
      {event.category === "inner" && (
        <div className="ev-card__quote">
          &ldquo;{event.description}&rdquo;
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mt-3">
        {loc && (
          <ActionBtn onClick={() => onJumpToNode(loc.id)}>
            📍 跳到地点
          </ActionBtn>
        )}
        {actor && (
          <>
            <ActionBtn onClick={() => onSelectCharacter(actor)}>
              ⬡ 查看角色
            </ActionBtn>
            <ActionBtn onClick={() => onFollow(actor.id)}>
              👁 跟随
            </ActionBtn>
          </>
        )}
        <ActionBtn onClick={() => {
          try {
            const saved = localStorage.getItem("agent-world.bookmarks") ?? "[]";
            const arr = JSON.parse(saved) as string[];
            if (!arr.includes(event.id)) {
              arr.push(event.id);
              localStorage.setItem("agent-world.bookmarks", JSON.stringify(arr));
            }
          } catch { /* ignore */ }
        }}>
          🔖 收藏
        </ActionBtn>
      </div>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-pixel-xs text-(--text-muted) border border-(--border-amber) bg-transparent px-2 py-0.5 cursor-pointer hover:bg-(--border-amber)/20 hover:text-(--text) tracking-[var(--letter-pixel-tight)] uppercase"
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/event-card.tsx
git commit -m "feat(event): add EventCard — avatar, actor, location chip, description, quote, actions"
```

---

### Task 11: EventStream — central event list

**Files:**
- Create: `src/app/_components/event-stream.tsx`

- [ ] **Step 1: Create event-stream.tsx**

```tsx
// src/app/_components/event-stream.tsx
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

  // Follow the selected character
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

const FILTER_LABELS: Record<Filter, string> = {
  all: "全部",
  action: "行动",
  inner: "独白",
  social: "互动",
  other: "其他",
};

- [ ] **Step 2: Verify build**

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/event-stream.tsx
git commit -m "feat(stream): add EventStream — tick-grouped event cards with filter/density/aggregation"
```

---

### Task 12: Update MapStage for minimap (shrink + add tabs)

**Files:**
- Modify: `src/app/_components/map-stage.tsx`
- Create: `src/app/_components/relation-graph.tsx`

- [ ] **Step 1: Create relation-graph placeholder**

```tsx
// src/app/_components/relation-graph.tsx
"use client";

export function RelationGraph() {
  return (
    <div className="h-full flex items-center justify-center text-body-sm text-(--text-on-frame-muted)">
      关系图谱开发中…
    </div>
  );
}
```

- [ ] **Step 2: Update map-stage.tsx — add tab header + shrink height**

The key change: wrap existing `PixelFrame` content with a tab selector at the top of the 220px section. The MapStage component itself stays mostly the same but removes the outer `PixelFrame` wrapper (the parent will frame it).

Edit `map-stage.tsx`:
- Keep all existing exports and rendering logic the same
- Just change the return structure to not wrap in full-height `PixelFrame`, instead use the parent's tab context

Actually, since the minimap lives in a fixed 220px section, the simplest approach is to keep `MapStage` unchanged in logic (it already renders children of `currentNodeId` correctly) and handle the tab switching in a new wrapper component that sits in dashboard.

Let's create a `MinimapSection` wrapper instead of modifying MapStage's internals:

```tsx
// append to src/app/_components/map-stage.tsx (or as separate export)

"use client";

import { useState } from "react";

export function MinimapTabs({
  children,
}: {
  children: [React.ReactNode, React.ReactNode]; // [map, relationGraph]
}) {
  const [tab, setTab] = useState<"map" | "relations">("map");
  return (
    <div className="h-full flex flex-col bg-(--frame-2) border-l-2 border-(--border) shadow-[inset_1px_0_0_var(--border-amber))]">
      <div className="flex px-2 bg-(--chrome) border-b border-(--border)">
        <button
          type="button"
          onClick={() => setTab("map")}
          className={`text-pixel-xs px-2.5 py-2 tracking-[var(--letter-pixel-tight)] uppercase cursor-pointer border-b-2 -mb-px transition-colors ${
            tab === "map"
              ? "text-(--accent-strong) border-(--accent-strong) bg-(--frame)"
              : "text-(--text-on-frame-muted) border-transparent hover:text-(--text-on-frame)"
          }`}
        >
          小地图
        </button>
        <button
          type="button"
          onClick={() => setTab("relations")}
          className={`text-pixel-xs px-2.5 py-2 tracking-[var(--letter-pixel-tight)] uppercase cursor-pointer border-b-2 -mb-px transition-colors ${
            tab === "relations"
              ? "text-(--accent-strong) border-(--accent-strong) bg-(--frame)"
              : "text-(--text-on-frame-muted) border-transparent hover:text-(--text-on-frame)"
          }`}
        >
          关系图
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "map" ? children[0] : children[1]}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/app/_components/map-stage.tsx src/app/_components/relation-graph.tsx
git commit -m "feat(minimap): add MinimapTabs wrapper + RelationGraph placeholder"
```

---

### Task 13: Update ProfilePane — add tabs + follow button

**Files:**
- Modify: `src/app/_components/profile-pane.tsx`

- [ ] **Step 1: Add tab header + follow button to profile-pane**

Read the current profile-pane.tsx (it was recently refactored with header / vitals / personality / relations / memories / abilities sections).

We need to:
1. Wrap the existing content in a "档案" tab
2. Add tab header bar (档案 / 独白 / 关系 / 经历)
3. Add onFollow / isFollowing props
4. Add placeholder tabs for 独白 / 关系 / 经历

Since profile-pane.tsx is substantial (already refactored), the edit is surgical:

**Change the component signature** — add props `events`, `onFollow`, `isFollowing`:

```tsx
// in profile-pane.tsx — add to existing props interface
export function ProfilePane({
  character,
  nodes,
  onJumpToNode,
  characters,
  // NEW:
  events = [],
  onFollow,
  isFollowing,
}: {
  character: Character | null;
  nodes: MapNode[];
  onJumpToNode: (nodeId: string) => void;
  characters: Character[];
  events?: WorldEvent[];
  onFollow?: (id: string) => void;
  isFollowing?: boolean;
}) {
  const [profileTab, setProfileTab] = useState<"profile" | "monologue" | "relations" | "history">("profile");
  // ... existing logic ...
```

**Add the tab header** right after the outer conditional for `if (!character)` and before the main profile content.

When `character` exists, before rendering existing profile sections, add:

```tsx
{/* Tab header + follow */}
<div className="flex items-center border-b border-(--border) bg-(--chrome)">
  <div className="flex">
    {([
      ["profile", "档案"],
      ["monologue", "独白"],
      ["relations", "关系"],
      ["history", "经历"],
    ] as const).map(([key, label]) => (
      <button
        key={key}
        type="button"
        onClick={() => setProfileTab(key)}
        className={`text-pixel-xs px-3 py-2 tracking-[var(--letter-pixel-tight)] uppercase cursor-pointer border-b-2 -mb-px transition-colors ${
          profileTab === key
            ? "text-(--accent-strong) border-(--accent-strong) bg-(--frame)"
            : "text-(--text-on-frame-muted) border-transparent hover:text-(--text-on-frame)"
        }`}
      >
        {label}
      </button>
    ))}
  </div>
  <div className="flex-1" />
  {onFollow && character && (
    <button
      type="button"
      onClick={() => onFollow(character.id)}
      className={`mr-2 px-2 py-1 text-pixel-xs border border-(--border-amber) cursor-pointer tracking-[var(--letter-pixel-tight)] ${
        isFollowing
          ? "bg-(--border-amber) text-(--panel)"
          : "bg-transparent text-(--text-on-frame-muted) hover:text-(--text-on-frame)"
      }`}
    >
      {isFollowing ? "👁 已跟随" : "👁 跟随她"}
    </button>
  )}
</div>
```

**Tab content switch**: wrap existing profile sections in `profileTab === "profile" && (...)`, and add placeholder content for the 3 new tabs:

```tsx
{profileTab === "profile" && (
  <>{/* existing header, vitals, personality, relations, memories, abilities sections */}</>
)}

{profileTab === "monologue" && (
  <div className="flex-1 overflow-y-auto pixel-scroll p-4">
    {character?.lastThought?.action?.reasoning ? (
      <div>
        <div className="text-pixel-xs text-(--text-on-frame-muted) tracking-[var(--letter-pixel)] mb-2">最近思考</div>
        <div className="text-body-sm text-(--text-on-frame) leading-[var(--lh-loose)]">
          {character.lastThought.action.reasoning}
        </div>
        <div className="mt-4">
          <div className="text-pixel-xs text-(--text-on-frame-muted) tracking-[var(--letter-pixel)] mb-2">历史独白</div>
          {events
            .filter((ev) => ev.category === "inner" && ev.participants.includes(character.id))
            .slice(0, 20)
            .map((ev) => (
              <div key={ev.id} className="mb-2 text-body-sm text-(--text-on-frame) leading-[var(--lh-normal)] italic border-l-2 border-(--border-amber) pl-3">
                &ldquo;{ev.description}&rdquo;
                <div className="text-pixel-xs text-(--text-on-frame-faint) mt-0.5">
                  T={ev.tick}
                </div>
              </div>
            ))}
        </div>
      </div>
    ) : (
      <p className="text-body-sm text-(--text-on-frame-muted) text-center mt-10">暂无独白记录</p>
    )}
  </div>
)}

{profileTab === "relations" && (
  <div className="flex-1 overflow-y-auto pixel-scroll p-4">
    {character && character.relations && character.relations.length > 0 ? (
      <ul className="space-y-2">
        {character.relations.map((rel, i) => {
          const other = characters.find((c) => c.id === rel.targetId);
          return (
            <li key={i} className="text-body-sm text-(--text-on-frame) flex items-center gap-2">
              <span className="text-pixel-xs text-(--accent-strong)">
                {other?.name ?? rel.targetId}
              </span>
              <span className="text-pixel-xs text-(--text-on-frame-muted)">
                {rel.kind}
              </span>
              {rel.note && (
                <span className="text-body-xs text-(--text-on-frame-faint) italic">
                  — {rel.note}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    ) : (
      <p className="text-body-sm text-(--text-on-frame-muted) text-center mt-10">暂无关系</p>
    )}
  </div>
)}

{profileTab === "history" && (
  <div className="flex-1 overflow-y-auto pixel-scroll p-4">
    {character ? (
      (() => {
        const charEvents = events.filter((ev) => ev.participants.includes(character.id));
        return charEvents.length > 0 ? (
          <div className="space-y-3">
            {charEvents.slice(0, 30).map((ev) => (
              <div key={ev.id} className="text-body-sm text-(--text-on-frame) leading-[var(--lh-normal)]">
                <span className="text-pixel-xs text-(--text-on-frame-faint) mr-2">
                  T={ev.tick}
                </span>
                {ev.description}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-body-sm text-(--text-on-frame-muted) text-center mt-10">暂无经历</p>
        );
      })()
    ) : (
      <p className="text-body-sm text-(--text-on-frame-muted) text-center mt-10">选择角色以查看经历</p>
    )}
  </div>
)}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/profile-pane.tsx
git commit -m "feat(profile): add tab header (档案/独白/关系/经历) + follow button + placeholder tabs"
```

---

### Task 14: InjectDrawer placeholder

**Files:**
- Create: `src/app/_components/inject-drawer.tsx`

- [ ] **Step 1: Create inject-drawer.tsx with placeholder form**

```tsx
// src/app/_components/inject-drawer.tsx
"use client";

export function InjectDrawer({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 bottom-0 w-[420px] z-50 bg-(--panel) border-l-2 border-(--border) shadow-[inset_1px_0_0_var(--border-amber))] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-b from-(--chrome-hi) to-(--chrome) border-b-2 border-(--border) shadow-[inset_0_-1px_0_var(--border-amber))]">
          <span className="text-pixel-sm text-(--accent-strong) tracking-[var(--letter-pixel)]">
            ⚡ 投放事件
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="text-pixel-md text-(--text-on-frame-muted) hover:text-(--text-on-frame) cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Form (placeholder) */}
        <div className="flex-1 overflow-y-auto pixel-scroll p-4 space-y-4">
          <Field label="地点" placeholder="当前节点 / 选择其他节点…" />
          <Field label="参与者" placeholder="选择 NPC（留空=随机）…" />
          <Field label="事件类型" placeholder="突发 / 社交 / 环境 / 任务…" />
          <Field label="强度 (1–5)" placeholder="3" />
          <Field label="自由文本" placeholder="描述你要注入的事件…" multiline />
          <Field label="可见范围" placeholder="节点内 / 父级 / 全图 / 私密" />
        </div>

        {/* Footer */}
        <div className="p-4 border-t-2 border-(--border) shadow-[inset_0_1px_0_var(--border-amber))]">
          <button
            type="button"
            disabled
            className="w-full py-2 text-pixel-sm text-(--panel) bg-(--border-amber) border border-(--border) cursor-not-allowed opacity-50 tracking-[var(--letter-pixel-tight)]"
          >
            投放 (Coming Soon)
          </button>
        </div>
      </div>
    </>
  );
}

function Field({
  label,
  placeholder,
  multiline,
}: {
  label: string;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-pixel-xs text-(--text-muted) tracking-[var(--letter-pixel)] uppercase">
        {label}
      </span>
      {multiline ? (
        <textarea
          disabled
          placeholder={placeholder}
          rows={3}
          className="mt-1 w-full px-3 py-2 text-body-sm text-(--text) bg-(--frame) border border-(--border-amber) placeholder:text-(--text-faint) resize-none cursor-not-allowed opacity-60"
        />
      ) : (
        <input
          disabled
          placeholder={placeholder}
          className="mt-1 w-full px-3 py-2 text-body-sm text-(--text) bg-(--frame) border border-(--border-amber) placeholder:text-(--text-faint) cursor-not-allowed opacity-60"
        />
      )}
    </label>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/inject-drawer.tsx
git commit -m "feat(inject): add InjectDrawer placeholder with 6-field form skeleton"
```

---

### Task 15: Wire InjectDrawer open/close in dashboard + keyboard shortcut

**Files:**
- Modify: `src/app/_components/dashboard.tsx`

- [ ] **Step 1: Add inject drawer state + keyboard listener**

Edit dashboard.tsx to add:

```tsx
// after existing hooks
const [injectOpen, setInjectOpen] = useState(false);

// keyboard shortcut
useEffect(() => {
  function handleKey(e: KeyboardEvent) {
    if (e.key === "E" || e.key === "e") {
      // ignore if user is typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      setInjectOpen((prev) => !prev);
    }
  }
  window.addEventListener("keydown", handleKey);
  return () => window.removeEventListener("keydown", handleKey);
}, []);
```

Then update `onOpenInject` prop on TickBar:
```tsx
onOpenInject={() => setInjectOpen(true)}
```

And update InjectDrawer at the bottom:
```tsx
<InjectDrawer isOpen={injectOpen} onClose={() => setInjectOpen(false)} />
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/dashboard.tsx
git commit -m "feat(inject): wire inject drawer open/close + keyboard shortcut E"
```

---

### Task 16: Remove old components

**Files:**
- Remove: `src/app/_components/character-rail.tsx`
- Remove: `src/app/_components/events-pane.tsx`
- Modify: `src/app/_components/dashboard.tsx` (remove old imports)

- [ ] **Step 1: Delete old components and clean imports**

```bash
rm src/app/_components/character-rail.tsx
rm src/app/_components/events-pane.tsx
```

Edit `dashboard.tsx` — remove any remaining imports of `CharacterRail` and `EventsPane` (they should already be gone from Task 8 rewrite).

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -20`
Expected: build succeeds

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove character-rail and events-pane (replaced by tree-sidebar and event-stream)"
```

---

### Task 17: Acceptance validation

- [ ] **Step 1: Start dev server and check visually**

```bash
npx next dev -p 3000
```

Checklist (from spec §验收):
1. Default theme is light (parchment + cream panel)
2. Click 🌙 → switches to V3 dark; reload → persists
3. Chinese text uses Noto Sans SC, no longer blurry
4. Five zones on screen: tree (collapsible) / event stream / minimap / character profile (tabbed) / tick bar
5. Events render as cards with avatar + actor + location chip + description + action buttons
6. Top bar has follow indicator, theme toggle; bottom bar has step/speed/auto/replay placeholder/inject button
7. Event intensity >= 3 shows red tail bar + ⚠ important tag
8. Event stream filter buttons change visible events
9. Density selector aggregates non-important events
10. Follow button on character section filters event stream
11. Keyboard `E` opens/closes inject drawer

- [ ] **Step 2: Fix any visual issues found**

Address any CSS cascade issues, incorrect token references, or component layout problems.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "fix(ui): acceptance polish — token references, layout tweaks, visual QA"
```

---

### Task 18: Create replay-mode placeholder

**Files:**
- Create: `src/app/_components/replay-mode.tsx`

- [ ] **Step 1: Create replay-mode.tsx**

```tsx
// src/app/_components/replay-mode.tsx
"use client";

export function ReplayMode() {
  return null; // v1: unused — the button in TickBar is disabled. Future: overlay with timeline scrubber.
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/_components/replay-mode.tsx
git commit -m "feat(replay): add ReplayMode placeholder component"
```
