# World 运行页面重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Dashboard's game-pixel 3-column layout with a frosted-glass dual-pane world-running page.

**Architecture:** New `WorldView` component orchestrates two fixed columns — left 260px (CharacterList + TickControl), right flex:1 (event-stream/gantt tabs + ProfilePane slide-overlay). Existing event/gantt/profile components get style-only changes; hooks and data flow are untouched.

**Tech Stack:** React 19, Tailwind v4, CSS custom properties (no new deps)

---

### Task 1: Create WorldView component

**Files:**
- Create: `frontend/src/components/world-view.tsx`

- [ ] **Step 1: Write WorldView skeleton**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useWorldState } from "@/hooks/use-world-state";
import { useViewState } from "@/hooks/use-view-state";
import { useFollow } from "@/hooks/use-follow";
import { CharacterList } from "./character-list";
import { TickControl } from "./tick-control";
import { EventStream } from "./event-stream";
import { EventGantt } from "./event-gantt";
import { ProfilePane } from "./profile-pane";

export function WorldView() {
  const { snapshot, events, loading, error, lastTickMs, tickProgress, advance, autoMode, startAuto, stopAuto } = useWorldState();
  const view = useViewState();
  const { followingId, follow, clear: clearFollow, isFollowing } = useFollow();
  const [centerTab, setCenterTab] = useState<"stream" | "gantt">("stream");
  const [profileId, setProfileId] = useState<string | null>(null);

  const selectedCharacter = useMemo(() => {
    if (!snapshot || !profileId) return null;
    return snapshot.characters.find((c) => c.id === profileId) ?? null;
  }, [snapshot, profileId]);

  const handleSelectCharacter = (id: string) => {
    view.selectCharacter(id);
    setProfileId((prev) => prev === id ? null : id);
  };

  if (!snapshot) {
    return (
      <div className="h-full flex items-center justify-center text-white/40 text-body-lg">
        {error ? `加载失败：${error}` : loading ? "加载中…" : "无数据"}
      </div>
    );
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left column */}
      <div className="w-[260px] flex-shrink-0 flex flex-col border-r border-white/10 bg-black/30 backdrop-blur-md">
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
      </div>

      {/* Right column */}
      <div className="flex-1 min-w-0 flex flex-col bg-black/25 backdrop-blur-md relative overflow-hidden">
        {/* Tab bar */}
        <div className="flex px-3 border-b border-white/10 bg-black/15 flex-shrink-0">
          {(["stream", "gantt"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setCenterTab(key)}
              className={`px-4 py-2.5 text-[11px] tracking-[0.1em] uppercase cursor-pointer border-b-2 -mb-px transition-colors ${
                centerTab === key
                  ? "text-(--accent-strong) border-(--accent-strong)"
                  : "text-white/35 border-transparent hover:text-white/60"
              }`}
            >
              {key === "stream" ? "事件流" : "甘特图"}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {centerTab === "stream" && (
            <EventStream
              events={events}
              characters={snapshot.characters}
              nodes={snapshot.nodes}
              followingId={followingId}
              epoch={snapshot.world.epoch}
              onJumpToNode={view.setCurrentNode}
              onSelectCharacter={(c) => handleSelectCharacter(c.id)}
              onFollow={follow}
            />
          )}
          {centerTab === "gantt" && (
            <EventGantt
              events={events}
              characters={snapshot.characters}
              nodes={snapshot.nodes}
              epoch={snapshot.world.epoch}
              onJumpToNode={view.setCurrentNode}
              onSelectCharacter={(c) => handleSelectCharacter(c.id)}
              onFollow={follow}
            />
          )}
        </div>

        {/* Profile slide-in overlay */}
        <div
          className={`absolute inset-y-0 right-0 w-[85%] bg-black/50 backdrop-blur-xl border-l border-white/10 shadow-[-4px_0_24px_rgba(0,0,0,0.4)] transition-transform duration-250 ease ${
            profileId ? "translate-x-0" : "translate-x-full"
          }`}
        >
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
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/world-view.tsx
git commit -m "feat: add WorldView component with dual-pane glass layout"
```

---

### Task 2: Create CharacterList component

**Files:**
- Create: `frontend/src/components/character-list.tsx`

- [ ] **Step 1: Write CharacterList component**

```tsx
"use client";

import type { Character } from "@/types/api.generated";
import { characterEmoji } from "@/lib/sprite";

function actionLabel(c: Character): string {
  if (c.lastThought?.action?.type) return c.lastThought.action.type;
  if (c.currentAction) {
    if (typeof c.currentAction === "string") return c.currentAction;
    return c.currentAction.type ?? "…";
  }
  return "…";
}

export function CharacterList({
  characters,
  selectedId,
  onSelect,
}: {
  characters: Character[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-white/10 text-white/40 text-[10px] uppercase tracking-wider flex-shrink-0">
        人物
      </div>
      <div className="flex-1 overflow-y-auto flex flex-col gap-0.5 p-1.5">
        {characters.map((c) => {
          const isSelected = c.id === selectedId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={`flex items-center justify-between px-3 py-2 rounded text-left cursor-pointer transition-colors ${
                isSelected
                  ? "bg-white/[0.08] border border-(--accent-strong)/30 text-(--accent-strong)"
                  : "border border-transparent text-white/85 hover:bg-white/[0.04] hover:border-white/5"
              }`}
            >
              <span className="text-[12px] truncate min-w-0">
                <span className="mr-1.5">{characterEmoji(c)}</span>
                {c.name}
              </span>
              <span
                className={`text-[9px] rounded px-1.5 py-0.5 max-w-[84px] truncate flex-shrink-0 ml-2 ${
                  isSelected
                    ? "bg-(--accent-strong)/15 text-(--accent-strong)/70"
                    : "bg-white/[0.08] text-white/35"
                }`}
              >
                {actionLabel(c)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/character-list.tsx
git commit -m "feat: add CharacterList component with action tag"
```

---

### Task 3: Create TickControl component

**Files:**
- Create: `frontend/src/components/tick-control.tsx`

- [ ] **Step 1: Write TickControl component**

```tsx
"use client";

import { formatHHMM } from "@/lib/format";

export function TickControl({
  tick,
  epoch,
  loading,
  onAdvance,
  autoMode,
  onStartAuto,
  onStopAuto,
  lastTickMs,
  tickProgress,
}: {
  tick: number;
  epoch: number;
  loading: boolean;
  onAdvance: () => Promise<boolean>;
  autoMode: { running: boolean; total: number; done: number } | null;
  onStartAuto: () => Promise<void>;
  onStopAuto: () => void;
  lastTickMs: number | null;
  tickProgress: { done: number; total: number } | null;
}) {
  const isRunning = autoMode?.running ?? false;

  return (
    <div className="border-t border-white/10 px-3 py-2.5 bg-black/20 flex-shrink-0">
      {/* Tick display */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-white/50 font-mono">Tick {tick}</span>
        <span className="text-[9px] text-white/30">第{epoch + 1}天 {formatHHMM(epoch, tick)}</span>
      </div>

      {/* Progress bar (when loading) */}
      {tickProgress && tickProgress.total > 0 && (
        <div className="h-1 bg-white/5 rounded mb-2 overflow-hidden">
          <div
            className="h-full bg-(--accent-strong)/50 transition-all duration-200"
            style={{ width: `${(tickProgress.done / tickProgress.total) * 100}%` }}
          />
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={loading || isRunning}
          onClick={() => void onAdvance()}
          className={`flex-1 py-1.5 text-[10px] font-mono rounded border transition-colors ${
            loading || isRunning
              ? "bg-white/[0.03] border-white/[0.08] text-white/20 cursor-not-allowed"
              : "bg-(--accent-strong)/10 border-(--accent-strong)/25 text-(--accent-strong) hover:bg-(--accent-strong)/20 cursor-pointer"
          }`}
        >
          步进一次
        </button>

        {/* Toggle */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`text-[9px] ${isRunning ? "text-green-400/70" : "text-white/35"}`}>
            {isRunning ? "运行中" : "无限运行"}
          </span>
          <button
            type="button"
            onClick={() => isRunning ? onStopAuto() : onStartAuto()}
            className={`w-9 h-5 rounded-full border relative cursor-pointer transition-colors ${
              isRunning
                ? "bg-green-400/25 border-green-400/40"
                : "bg-white/[0.1] border-white/[0.15]"
            }`}
          >
            <div
              className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white/80 transition-all ${
                isRunning ? "right-0.5" : "left-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Last tick ms */}
      {lastTickMs !== null && (
        <div className="text-right mt-1.5 text-[8px] text-white/20">{Math.round(lastTickMs)}ms</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/tick-control.tsx
git commit -m "feat: add TickControl component with step+infinite toggle"
```

---

### Task 4: Wire WorldView into WorldViewPage route

**Files:**
- Modify: `frontend/src/routes/world-view.tsx`

- [ ] **Step 1: Replace Dashboard with WorldView**

```tsx
import { Suspense } from "react";
import { WorldView } from "@/components/world-view";

export default function WorldViewPage() {
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center text-white/40 text-body-lg">加载中…</div>}>
      <WorldView />
    </Suspense>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/routes/world-view.tsx
git commit -m "feat: wire WorldView into WorldViewPage route"
```

---

### Task 5: Migrate EventStream and EventCard styles to glass

**Files:**
- Modify: `frontend/src/components/event-stream.tsx`
- Modify: `frontend/src/components/event-card.tsx`

- [ ] **Step 1: Update EventStream outer container**

Change EventStream's outermost div (line 122) and header (lines 124-158) from game-pixel to glass style. Replace:

```tsx
// OLD (line 122):
<div className="h-full flex flex-col bg-(--frame)">
  {/* OLD header (lines 124-158): */}
  <div className="flex items-center gap-3 px-6 py-2.5 bg-(--frame-2) border-b-2 border-(--border) shadow-[inset_0_-1px_0_var(--border-amber))]">
    <span className="text-pixel-sm text-(--accent-strong) tracking-[var(--letter-pixel)] uppercase">
      事件流
    </span>
    ...
    {/* Filter buttons: border-(--border-amber), bg-(--border-amber) → glass style */}
    ...
  </div>
  {/* OLD body (line 162): */}
  <div className="flex-1 overflow-y-auto pixel-scroll px-6 py-4">
```

With:

```tsx
<div className="h-full flex flex-col">
  {/* Header */}
  <div className="flex items-center gap-3 px-4 py-2 border-b border-white/10 bg-black/15 flex-shrink-0">
    {followedChar && (
      <span className="text-[11px] text-white/40">
        跟随中：{followedChar.name} 视角
      </span>
    )}
    {!followedChar && (
      <span className="text-[11px] text-(--accent-strong) tracking-[0.1em] uppercase">
        事件流
      </span>
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
      <select
        value={density}
        onChange={(e) => setDensityWithPersist(e.target.value as Density)}
        className="ml-2 text-[10px] px-2 py-0.5 bg-transparent border border-white/10 text-white/50 cursor-pointer tracking-[0.1em] rounded"
      >
        <option value="sparse">密度：稀</option>
        <option value="medium">密度：中</option>
        <option value="dense">密度：密</option>
      </select>
    </div>
  </div>

  {/* Body */}
  <div className="flex-1 overflow-y-auto px-4 py-3">
```

And replace the tick separator (line 171):

```tsx
// OLD:
<div className="tick-sep mb-3">
  <span>T={group.tick} · {formatHHMM(epoch, group.tick)}</span>
  <div className="tick-sep__line" />
</div>

// NEW:
<div className="flex items-center gap-2 mb-3 text-white/30 text-[10px] font-mono">
  <span>T={group.tick} · {formatHHMM(epoch, group.tick)}</span>
  <div className="flex-1 h-px bg-white/10" />
</div>
```

And replace the aggregated row (line 193):

```tsx
// OLD:
<div className="ev-card--aggregated mb-3">

// NEW:
<div className="text-center text-[11px] text-white/25 border border-dashed border-white/10 rounded px-3 py-2 cursor-pointer hover:text-white/40 mb-3">
```

- [ ] **Step 2: Update EventCard styles**

Replace the EventCard's root className and internal style classes from game-pixel (`.ev-card`, `.ev-card--important`, `.ev-card__quote`, `.npc-chip`, `--text`, `--text-muted`, `--border-amber`, `--danger`, `--panel`, `--accent-strong`) to glass equivalents:

```tsx
// Root div (line 45):
<div className={`rounded border px-4 py-3 ${
  important
    ? "bg-(--accent-strong)/8 border-(--accent-strong)/25"
    : "bg-white/[0.04] border-white/[0.08]"
}`}>

// Important left stripe (instead of ::before pseudo-element), add as child:
{important && (
  <div className="absolute left-0 top-0 bottom-0 w-1 bg-(--accent-strong)/60 rounded-l" />
)}
// ... and add "relative overflow-hidden" to the root div

// Actor chip (line 50): replace npc-chip with inline emoji
<span className="text-base">{characterEmoji(actor)}</span>

// Actor name button (line 54):
<button
  type="button"
  onClick={() => onSelectCharacter(actor)}
  className="text-[13px] font-semibold text-white/80 hover:underline cursor-pointer"
>
  {actor.name}
</button>

// Location chip (line 90):
<button
  type="button"
  onClick={() => onJumpToNode(loc.id)}
  className="text-[10px] text-white/40 bg-white/5 px-1.5 py-0.5 rounded cursor-pointer hover:bg-white/10"
>
  📍 {loc.name}
</button>

// Important tag (line 98):
<span className="text-[9px] bg-(--accent-strong)/20 text-(--accent-strong) px-1.5 py-0.5 rounded">
  ⚠ 重要
</span>

// Description (line 110):
<div className="text-[13px] text-white/70 leading-[1.6]">
  {event.description}
</div>

// Inner quote (line 116):
<div className="mt-1.5 px-3 py-1.5 bg-white/[0.04] border-l-3 border-white/15 text-white/50 italic text-[12px] leading-[1.75]">
  &ldquo;{event.description}&rdquo;
</div>

// Transcript expand button (line 127):
<button
  type="button"
  onClick={() => setExpanded(!expanded)}
  className="text-[10px] text-(--accent-strong) mt-2 hover:underline cursor-pointer"
>

// Transcript container (line 134):
<div className="mt-2 p-3 bg-white/[0.04] border border-white/10 rounded space-y-1">

// Speaker name in transcript (line 152):
<span className="font-semibold text-(--accent-strong)">

// Transcript line (line 155):
<span className="text-[12px] text-white/60">

// Action buttons (line 219):
function ActionBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[10px] text-white/40 border border-white/10 bg-transparent px-2 py-0.5 rounded cursor-pointer hover:bg-white/10 hover:text-white/60 uppercase"
    >
      {children}
    </button>
  );
}
```

Also replace `genderIcon` `text-pixel-2xs text-(--text-faint)` (line 76) with `text-[9px] text-white/40`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/event-stream.tsx frontend/src/components/event-card.tsx
git commit -m "style: migrate EventStream and EventCard to frosted glass style"
```

---

### Task 6: Migrate EventGantt and sub-components styles to glass

**Files:**
- Modify: `frontend/src/components/event-gantt.tsx`
- Modify: `frontend/src/components/gantt-card.tsx`
- Modify: `frontend/src/components/gantt-row.tsx`
- Modify: `frontend/src/components/gantt-timeline.tsx`
- Modify: `frontend/src/components/gantt-popup.tsx`

- [ ] **Step 1: Update EventGantt container and GanttTimeline**

In `event-gantt.tsx`, change the outermost wrapper to glass style. Read the file first to get exact line numbers, then replace container classes:

The outermost div in EventGantt should change to `h-full flex flex-col`. The header bar (if any) changes to `border-b border-white/10 bg-black/15`.

In `gantt-timeline.tsx`, change colors from game-pixel tokens to glass tokens:
- Text: `--text-on-frame-muted` → `text-white/30`
- Background: `--frame-2` → `bg-black/15`
- Borders: `--border` → `border-white/10`

- [ ] **Step 2: Update GanttCard styles**

In `gantt-card.tsx`, replace `.gantt-card` CSS class references with inline glass style:
- Background: `rgba(255,255,255,0.06)` instead of `var(--panel)`
- Border: `1px solid rgba(255,255,255,0.08)` instead of pixel-frame
- No box-shadow double-border (clean flat glass)
- Text colors: `white/70` for primary, `white/40` for muted, `white/25` for faint
- Hover: `bg-white/[0.10]` instead of brightness filter
- Important: `border-(--accent-strong)/30 bg-(--accent-strong)/5` instead of danger-red

- [ ] **Step 3: Update GanttRow styles**

In `gantt-row.tsx`, change:
- Row background/hover from pixel tones to `bg-white/[0.02]` / `hover:bg-white/[0.04]`
- Character name cell: `text-white/70` text, no pixel borders
- Sleep bars: from `--border-amber` to `white/10`

- [ ] **Step 4: Update GanttPopup styles**

In `gantt-popup.tsx`, replace `.gantt-popup` CSS class with inline glass style:
- Background: `bg-black/60 backdrop-blur-xl`
- Border: `border border-white/15`
- Shadow: `shadow-[0_4px_20px_rgba(0,0,0,0.5)]`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/event-gantt.tsx frontend/src/components/gantt-card.tsx frontend/src/components/gantt-row.tsx frontend/src/components/gantt-timeline.tsx frontend/src/components/gantt-popup.tsx
git commit -m "style: migrate Gantt components to frosted glass style"
```

---

### Task 7: Adapt ProfilePane for slide-in overlay context

**Files:**
- Modify: `frontend/src/components/profile-pane.tsx`

- [ ] **Step 1: Update ProfilePane outer styling and empty state**

The ProfilePane now lives inside a slide-in panel (handled by WorldView). It should fill its container fully and use glass-appropriate styles.

Change the outermost wrapper (line 237) from:

```tsx
// OLD:
<div className="flex-1 min-h-0 flex flex-col">
```

To:

```tsx
<div className="h-full flex flex-col">
```

Change the empty state (lines 197-206) text colors from game-pixel to glass:

```tsx
if (!character) {
  return (
    <div className="h-full flex items-center justify-center p-4">
      <p className="text-[12px] text-white/30 text-center max-w-xs leading-relaxed">
        点击左栏角色查看完整档案。
      </p>
    </div>
  );
}
```

Change the tab header bar (lines 239-275): replace `bg-(--chrome)` and `border-(--border)` with glass tokens:

```tsx
<div className="flex items-center border-b border-white/10 bg-white/[0.03] flex-shrink-0">
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
        className={`text-[10px] px-3 py-2 tracking-[0.1em] uppercase cursor-pointer border-b-2 -mb-px transition-colors ${
          profileTab === key
            ? "text-(--accent-strong) border-(--accent-strong)"
            : "text-white/35 border-transparent hover:text-white/60"
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
      className={`mr-2 px-2 py-1 text-[10px] border border-white/10 rounded cursor-pointer transition-colors ${
        isFollowing
          ? "bg-white/10 text-white/80"
          : "bg-transparent text-white/35 hover:text-white/60"
      }`}
    >
      {isFollowing ? "👁 已跟随" : "👁 跟随她"}
    </button>
  )}
</div>
```

Change all content area classes: replace `pixel-scroll` with standard scroll, replace all `text-(--color-pixel-*)` with `text-white/*` equivalents, replace `border-(--color-pixel-border-dark)` etc with `border-white/10` etc. The key mappings:

| Old token | New style |
|-----------|-----------|
| `bg-(--color-pixel-bg)` | `bg-white/[0.04]` |
| `bg-(--color-pixel-bg-2)` | `bg-white/[0.06]` |
| `border-(--color-pixel-border-dark)` | `border-white/10` |
| `border-(--color-pixel-border-light)` | `border-white/15` |
| `border-(--color-pixel-accent-dark)` | `border-(--accent-strong)/30` |
| `text-(--color-pixel-fg)` | `text-white/80` |
| `text-(--color-pixel-muted)` | `text-white/40` |
| `text-(--color-pixel-accent)` | `text-(--accent-strong)` |
| `text-(--color-pixel-accent-dark)` | `text-(--accent)` |
| `box-shadow` (pixel double-border) | `none` |

For the character header (lines 281-364): remove `npc-chip` classes, use plain emoji. Simplify the layout:

```tsx
<div className="flex items-start gap-3">
  <span className="text-[36px]">{characterEmoji(character)}</span>
  <div className="flex-1 min-w-0 space-y-1">
    <div className="text-[15px] text-white/85">{character.name}</div>
    <div className="text-[11px] text-white/40">
      {PROFESSION_LABELS[character.profession] ?? character.profession}
      {" · "}{character.age} 岁
      {" · "}{character.gender === "male" ? "男" : character.gender === "female" ? "女" : "其他"}
    </div>
    ...
  </div>
</div>
```

For `BiBar` and `UniBar`: replace `bg-(--color-pixel-bg) border-(--color-pixel-border-dark)` with `bg-white/[0.06] border-white/10`. Keep the fill colors (success/accent/danger) since they have semantic meaning.

For the impression popover (lines 802-847): replace game-pixel styling with glass:

```tsx
<div className="fixed inset-0 z-50 bg-black/40" onClick={() => setImpressionPopover(null)}>
  <div
    className="absolute bg-black/70 backdrop-blur-xl border border-white/10 rounded p-3 max-w-[320px] shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
    style={{ left: impressionPopover.x, top: impressionPopover.y }}
    onClick={(e) => e.stopPropagation()}
  >
    ...
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/profile-pane.tsx
git commit -m "style: adapt ProfilePane for glass slide-in overlay"
```

---

### Task 8: Delete deprecated components and clean up

**Files:**
- Delete: `frontend/src/components/dashboard.tsx`
- Delete: `frontend/src/components/tree-sidebar.tsx`
- Delete: `frontend/src/components/relation-graph.tsx`
- Delete: `frontend/src/components/map-stage.tsx`
- Delete: `frontend/src/components/top-bar.tsx`
- Delete: `frontend/src/components/pixel-frame.tsx`
- Delete: `frontend/src/components/replay-mode.tsx`
- Delete: `frontend/src/components/events-pane.tsx`
- Delete: `frontend/src/components/tick-bar.tsx`

- [ ] **Step 1: Delete the files**

```bash
git rm frontend/src/components/dashboard.tsx
git rm frontend/src/components/tree-sidebar.tsx
git rm frontend/src/components/relation-graph.tsx
git rm frontend/src/components/map-stage.tsx
git rm frontend/src/components/top-bar.tsx
git rm frontend/src/components/pixel-frame.tsx
git rm frontend/src/components/replay-mode.tsx
git rm frontend/src/components/events-pane.tsx
git rm frontend/src/components/tick-bar.tsx
```

- [ ] **Step 2: Remove deprecated CSS from globals.css**

Remove these now-unused sections from `frontend/src/styles/globals.css`:
- `.pixel-frame` and `.pixel-frame--accent` / `.pixel-frame--danger` (lines 267-288)
- `.node-tile` and related (lines 291-367) — only used by MapStage
- `.npc-chip` and `.npc-chip--lg` / `.npc-chip--selected` (lines 345-367) — only used by old event-card and profile-pane
- `.ev-card` / `.ev-card--important` / `.ev-card--aggregated` / `.ev-card__quote` styles (lines 389-436) — replaced by inline glass styles
- `.gantt-card` / `.gantt-card--important` / `.gantt-card__badge` / `.gantt-card__location` / `.gantt-card__important-badge` / `.gantt-popup` (lines 464-538) — replaced by inline glass styles
- `.tick-sep` / `.tick-sep__line` (lines 441-456) — replaced by inline styles
- `.pixel-scroll` (lines 370-383) — keep for now, may still be used elsewhere

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ frontend/src/styles/globals.css
git commit -m "chore: remove deprecated components and CSS"
```

---

### Task 9: Verify build and type check

**Files:** none (verification only)

- [ ] **Step 1: Run TypeScript check on frontend**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no type errors. If errors: fix missing imports, stale references to deleted components.

- [ ] **Step 2: Verify frontend build**

```bash
cd frontend && pnpm build
```

Expected: build succeeds.

- [ ] **Step 3: Verify backend tests still pass (no backend changes expected)**

```bash
cd backend && pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve type and build issues from world-view redesign"
```
