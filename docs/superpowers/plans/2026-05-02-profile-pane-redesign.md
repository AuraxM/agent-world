# Profile Pane Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `src/app/_components/profile-pane.tsx` per the design in `docs/superpowers/specs/2026-05-02-profile-pane-redesign-design.md`: status dashboard as visual hero, last-thought moved above the dashboard, vitals/emotion as bars, surface missing fields (currentAction, abilities, homeNodeId, relations[].note), add expand toggles for relations/memories.

**Architecture:** One-component refactor with private subcomponents (`BiBar`, `UniBar`, `SectionLabel`) inside `profile-pane.tsx`; one new helper file `src/app/_lib/profile-format.ts` with three pure functions for unit testing the threshold/format logic. Existing `PersonalityBar` is generalized into the new `BiBar` and removed.

**Tech Stack:** Next.js 16, React 19, Vitest (already installed). No new dependencies.

---

## File Structure

- **Create:** `src/app/_lib/profile-format.ts` — 3 pure functions: `vitalThreshold`, `affectionTone`, `formatActionWindow`
- **Create:** `src/app/_lib/profile-format.test.ts` — Vitest unit tests for the above
- **Modify:** `src/app/_components/profile-pane.tsx` — Section-by-section rewrite

No other files touched. Schema, backend, dashboard layout all stay as-is.

---

## Task 1: helper — `vitalThreshold`

**Files:**
- Create: `src/app/_lib/profile-format.ts`
- Test: `src/app/_lib/profile-format.test.ts`

- [ ] **Step 1.1: Write failing tests**

Create `src/app/_lib/profile-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { vitalThreshold } from "./profile-format";

describe("vitalThreshold", () => {
  it("returns ok when value below warn", () => {
    expect(vitalThreshold(5, 10, 6)).toBe("ok");
  });

  it("returns warn at exactly warn threshold", () => {
    expect(vitalThreshold(6, 10, 6)).toBe("warn");
  });

  it("returns warn between warn and danger", () => {
    expect(vitalThreshold(8, 10, 6)).toBe("warn");
  });

  it("returns danger at exactly danger threshold", () => {
    expect(vitalThreshold(10, 10, 6)).toBe("danger");
  });

  it("returns danger above danger threshold", () => {
    expect(vitalThreshold(15, 10, 6)).toBe("danger");
  });

  it("returns ok at zero", () => {
    expect(vitalThreshold(0, 10, 6)).toBe("ok");
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npm test -- profile-format`
Expected: FAIL with "Cannot find module './profile-format'"

- [ ] **Step 1.3: Write minimal implementation**

Create `src/app/_lib/profile-format.ts`:

```ts
/** Stat-bar color tier. Caller passes the thresholds — intentionally not a max-derived helper because vitals (0..16) and stress (0..4) use different cutoffs. */
export function vitalThreshold(
  value: number,
  danger: number,
  warn: number,
): "ok" | "warn" | "danger" {
  if (value >= danger) return "danger";
  if (value >= warn) return "warn";
  return "ok";
}
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `npm test -- profile-format`
Expected: PASS, 6 tests green.

- [ ] **Step 1.5: Commit**

```bash
git add src/app/_lib/profile-format.ts src/app/_lib/profile-format.test.ts
git commit -m "feat(profile-format): add vitalThreshold helper with tests"
```

---

## Task 2: helper — `affectionTone`

**Files:**
- Modify: `src/app/_lib/profile-format.ts`
- Modify: `src/app/_lib/profile-format.test.ts`

- [ ] **Step 2.1: Add failing test**

Append to `src/app/_lib/profile-format.test.ts`:

```ts
import { affectionTone } from "./profile-format";

describe("affectionTone", () => {
  it("returns pos for positive values", () => {
    expect(affectionTone(3)).toBe("pos");
    expect(affectionTone(1)).toBe("pos");
  });

  it("returns neg for negative values", () => {
    expect(affectionTone(-1)).toBe("neg");
    expect(affectionTone(-4)).toBe("neg");
  });

  it("returns zero for zero", () => {
    expect(affectionTone(0)).toBe("zero");
  });
});
```

Update the existing import line at the top of the file from:
```ts
import { vitalThreshold } from "./profile-format";
```
to:
```ts
import { affectionTone, vitalThreshold } from "./profile-format";
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `npm test -- profile-format`
Expected: FAIL with "affectionTone is not a function" or import error.

- [ ] **Step 2.3: Add implementation**

Append to `src/app/_lib/profile-format.ts`:

```ts
/** Sign-based color tier for relation affection ([-4..+4]). */
export function affectionTone(value: number): "pos" | "neg" | "zero" {
  if (value > 0) return "pos";
  if (value < 0) return "neg";
  return "zero";
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `npm test -- profile-format`
Expected: PASS, all tests green.

- [ ] **Step 2.5: Commit**

```bash
git add src/app/_lib/profile-format.ts src/app/_lib/profile-format.test.ts
git commit -m "feat(profile-format): add affectionTone helper"
```

---

## Task 3: helper — `formatActionWindow`

**Files:**
- Modify: `src/app/_lib/profile-format.ts`
- Modify: `src/app/_lib/profile-format.test.ts`

- [ ] **Step 3.1: Add failing test**

Append to `src/app/_lib/profile-format.test.ts`:

```ts
import { formatActionWindow } from "./profile-format";
import type { OngoingAction } from "@/domain/types";

function mkAction(partial: Partial<OngoingAction> = {}): OngoingAction {
  return {
    type: "sleep",
    startedAt: 12,
    endsAt: 19,
    description: "在 张默家 睡觉",
    interruptThreshold: 3,
    ...partial,
  };
}

describe("formatActionWindow", () => {
  it("formats normal sleep window", () => {
    expect(formatActionWindow(mkAction())).toBe("在 张默家 睡觉 (t12→t19)");
  });

  it("formats instant action where endsAt equals startedAt", () => {
    expect(
      formatActionWindow(mkAction({ startedAt: 5, endsAt: 5, description: "等待" })),
    ).toBe("等待 (t5→t5)");
  });

  it("preserves arbitrary description text", () => {
    expect(
      formatActionWindow(
        mkAction({ description: "走去 学校 (3 步)", startedAt: 0, endsAt: 3 }),
      ),
    ).toBe("走去 学校 (3 步) (t0→t3)");
  });
});
```

Update the import line to include `formatActionWindow`:
```ts
import { affectionTone, formatActionWindow, vitalThreshold } from "./profile-format";
```

- [ ] **Step 3.2: Run test to verify it fails**

Run: `npm test -- profile-format`
Expected: FAIL — `formatActionWindow` not exported.

- [ ] **Step 3.3: Add implementation**

Append to `src/app/_lib/profile-format.ts`:

```ts
import type { OngoingAction } from "@/domain/types";

/** "在 张默家 睡觉 (t12→t19)" — description comes from engine and is already user-readable. */
export function formatActionWindow(action: OngoingAction): string {
  return `${action.description} (t${action.startedAt}→t${action.endsAt})`;
}
```

- [ ] **Step 3.4: Run test to verify it passes**

Run: `npm test -- profile-format`
Expected: PASS, all tests green.

- [ ] **Step 3.5: Commit**

```bash
git add src/app/_lib/profile-format.ts src/app/_lib/profile-format.test.ts
git commit -m "feat(profile-format): add formatActionWindow helper"
```

---

## Task 4: profile-pane Header redesign

**Files:**
- Modify: `src/app/_components/profile-pane.tsx`

Goal: enlarge avatar to 60×60, show `currentAction` chip when present, show `· 家 ${homeNode.name}` when `homeNodeId` is set AND not equal to current `locationId`. No structural reordering yet.

- [ ] **Step 4.1: Add formatActionWindow import**

In `src/app/_components/profile-pane.tsx`, add to the existing imports (near the top):

```ts
import { formatActionWindow } from "../_lib/profile-format";
```

- [ ] **Step 4.2: Replace the Header block**

Find the existing `{/* 头部 */}` block (around lines 78–93). Replace the entire block with:

```tsx
{/* 头部 */}
<div className="flex items-start gap-3">
  <span className="npc-chip npc-chip--lg npc-chip--selected pixelated" style={{ fontSize: "36px", width: "60px", height: "60px" }}>
    {NPC_EMOJI[character.id] ?? NPC_FALLBACK_EMOJI}
  </span>
  <div className="flex-1 min-w-0 space-y-1">
    <div className="text-game-lg text-(--color-pixel-fg)">{character.name}</div>
    <div className="text-game-sm">
      <button
        type="button"
        onClick={() => onJumpToNode(character.locationId)}
        className="text-(--color-pixel-accent) hover:underline"
      >
        @ {here?.name ?? character.locationId} ↗
      </button>
      {character.homeNodeId
        && character.homeNodeId !== character.locationId
        && nodeById.get(character.homeNodeId) && (
          <span className="text-(--color-pixel-muted)">
            {" · 家 "}
            {nodeById.get(character.homeNodeId)?.name}
          </span>
        )}
    </div>
    {character.currentAction && (
      <div>
        <span
          className="inline-block px-1 text-game-xs"
          style={{
            background: "var(--color-pixel-accent)",
            color: "var(--color-pixel-border-dark)",
            border: "1px solid var(--color-pixel-accent-dark)",
          }}
        >
          {formatActionWindow(character.currentAction)}
        </span>
      </div>
    )}
  </div>
</div>
```

- [ ] **Step 4.3: Lint check**

Run: `npm run lint`
Expected: PASS (no new errors).

- [ ] **Step 4.4: Commit**

```bash
git add src/app/_components/profile-pane.tsx
git commit -m "feat(profile-pane): header — bigger avatar, currentAction chip, home node line"
```

---

## Task 5: profile-pane — last-thought line-clamp + expand + move to top

**Files:**
- Modify: `src/app/_components/profile-pane.tsx`

Goal: make `reasoning` use `line-clamp-4` with a "展开全文 ▾" toggle that removes the clamp; reset to collapsed when the selected character changes; move the entire 上一轮思考 section to immediately after the Header (currently it's between Header and 性格 — it stays in the same relative position because nothing else moves up, but the dashboard will land below it in Task 6).

- [ ] **Step 5.1: Add useState + useEffect imports**

At the top of `src/app/_components/profile-pane.tsx`, replace:

```ts
"use client";

import type { Character, MapNode, Personality } from "@/domain/types";
```

with:

```ts
"use client";

import { useEffect, useState } from "react";
import type { Character, MapNode, Personality } from "@/domain/types";
```

- [ ] **Step 5.2: Add expand state inside ProfilePane**

Inside the `ProfilePane` function, place these lines **BEFORE the `if (!character)` early return** (Rules of Hooks: hooks must run unconditionally on every render):

```tsx
const characterId = character?.id;
const [thoughtExpanded, setThoughtExpanded] = useState(false);

useEffect(() => {
  setThoughtExpanded(false);
}, [characterId]);
```

The optional-chained `characterId` keeps the dependency stable when `character` is null (no hook is called after the early return).

- [ ] **Step 5.3: Replace the 上一轮思考 block**

Find the existing `{/* 上一轮思考 */}` section (around lines 95–140). Replace the entire `<section>` with:

```tsx
{/* 上一轮思考 */}
<section className="border-2 border-(--color-pixel-border-dark) bg-(--color-pixel-bg-2) p-2 space-y-1">
  <div className="flex items-center gap-2 text-game-xs uppercase tracking-widest text-(--color-pixel-accent)">
    <span>上一轮思考</span>
    {lastThought && (
      <>
        <span className="text-(--color-pixel-muted)">·</span>
        <span className="text-(--color-pixel-muted)">t={lastThought.tick}</span>
        <span className="text-(--color-pixel-muted)">·</span>
        <span className="text-(--color-pixel-muted)">{lastThought.action.type}</span>
        <span
          className="ml-auto px-1 text-game-2xs"
          style={{
            background: lastThought.success
              ? "var(--color-pixel-success)"
              : "var(--color-pixel-danger)",
            color: "var(--color-pixel-border-dark)",
          }}
        >
          {lastThought.success ? "OK" : "FAIL"}
        </span>
      </>
    )}
  </div>
  {!lastThought ? (
    <p className="text-game-sm text-(--color-pixel-muted)">
      还没有过决策（推进 1 小时后再来看）。
    </p>
  ) : (
    <>
      {lastThought.action.emotionTag && (
        <div className="inline-block text-game-xs px-1 bg-(--color-pixel-accent) text-(--color-pixel-border-dark)">
          {lastThought.action.emotionTag}
        </div>
      )}
      <div
        className={`text-game-sm leading-relaxed text-(--color-pixel-fg) whitespace-pre-wrap ${
          thoughtExpanded ? "" : "line-clamp-4"
        }`}
      >
        {lastThought.action.reasoning}
      </div>
      <div className="text-right">
        <button
          type="button"
          onClick={() => setThoughtExpanded((v) => !v)}
          className="text-game-xs text-(--color-pixel-accent) hover:underline"
        >
          {thoughtExpanded ? "收起 ▴" : "展开全文 ▾"}
        </button>
      </div>
      {lastThought.action.freeText && (
        <div className="text-game-sm text-(--color-pixel-muted) italic border-t border-(--color-pixel-border-dark) pt-1">
          &ldquo;{lastThought.action.freeText}&rdquo;
        </div>
      )}
    </>
  )}
</section>
```

Note the changes vs the original:
- Border changed from `border-(--color-pixel-accent-dark)` to `border-(--color-pixel-border-dark)` (subdued — the gold accent is reserved for the dashboard hero coming in Task 6)
- The reasoning `<div>` no longer has `max-h-40 overflow-y-auto pixel-scroll`; instead it uses `line-clamp-4` (or no clamp when `thoughtExpanded`)
- New "展开全文 ▾ / 收起 ▴" toggle button below the reasoning

The 上一轮思考 section already sits right after the Header block from Task 4 — no reordering required for this task.

- [ ] **Step 5.4: Lint check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5.5: Commit**

```bash
git add src/app/_components/profile-pane.tsx
git commit -m "feat(profile-pane): thought reasoning — line-clamp-4 + expand toggle"
```

---

## Task 6: profile-pane — status dashboard (vitals + emotion as bars, hero card)

**Files:**
- Modify: `src/app/_components/profile-pane.tsx`

Goal: introduce private `BiBar` and `UniBar` components; replace the flat 生理 + 情绪 sections with a single gold-bordered "status dashboard" card that contains both as a 2-column grid of bars; place this dashboard immediately AFTER the 上一轮思考 section.

- [ ] **Step 6.1: Add helper imports**

Add to the imports at the top of `src/app/_components/profile-pane.tsx`:

```ts
import { affectionTone, vitalThreshold } from "../_lib/profile-format";
```

(Combined with the `formatActionWindow` import from Task 4, the import line now reads:
```ts
import { affectionTone, formatActionWindow, vitalThreshold } from "../_lib/profile-format";
```
)

The `affectionTone` import will be used in Task 8 (relations) but is added here to avoid a separate import edit.

- [ ] **Step 6.2: Add BiBar and UniBar components**

Inside `src/app/_components/profile-pane.tsx`, immediately AFTER the existing `PersonalityBar` function and BEFORE the `ProfilePane` function, add:

```tsx
/** [-min..+max] 双向条；居中分隔线，负值左红、正值右绿。 */
function BiBar({
  label,
  value,
  min = -4,
  max = 4,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
}) {
  const span = max - min;
  const pct = ((value - min) / span) * 100;
  const isNeg = value < 0;
  const fillStart = isNeg ? pct : 50;
  const fillEnd = isNeg ? 50 : pct;
  return (
    <div className="flex items-center gap-2 text-game-xs">
      <span className="w-8 text-(--color-pixel-muted)">{label}</span>
      <div className="flex-1 h-2 bg-(--color-pixel-bg) border border-(--color-pixel-border-dark) relative">
        <div className="absolute inset-y-0 left-1/2 w-px bg-(--color-pixel-border-light)" />
        <div
          className="absolute inset-y-0"
          style={{
            left: `${fillStart}%`,
            width: `${fillEnd - fillStart}%`,
            background: isNeg
              ? "var(--color-pixel-danger)"
              : "var(--color-pixel-success)",
          }}
        />
      </div>
      <span className="w-8 text-right text-(--color-pixel-fg)">{value}</span>
    </div>
  );
}

/** [0..max] 单向条；颜色按 (danger, warn) 阈值渐变。 */
function UniBar({
  label,
  value,
  max,
  danger,
  warn,
}: {
  label: string;
  value: number;
  max: number;
  danger: number;
  warn: number;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const tier = vitalThreshold(value, danger, warn);
  const color =
    tier === "danger"
      ? "var(--color-pixel-danger)"
      : tier === "warn"
        ? "var(--color-pixel-accent)"
        : "var(--color-pixel-success)";
  return (
    <div className="flex items-center gap-2 text-game-xs">
      <span className="w-8 text-(--color-pixel-muted)">{label}</span>
      <div className="flex-1 h-2 bg-(--color-pixel-bg) border border-(--color-pixel-border-dark) overflow-hidden">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-8 text-right text-(--color-pixel-fg)">{value}</span>
    </div>
  );
}
```

- [ ] **Step 6.3: Replace the 生理 and 情绪 sections with a status dashboard**

Find the two existing `<section>` blocks for `{/* 生理状态 */}` and `{/* 情绪 */}` (the two flat `<span>饿 ...</span>` lists). Replace BOTH sections with a single dashboard:

```tsx
{/* 状态仪表盘（hero） */}
<section
  className="border-2 border-(--color-pixel-accent-dark) bg-(--color-pixel-bg-2) p-2"
  style={{ boxShadow: "inset 0 0 0 1px var(--color-pixel-accent)" }}
>
  <div className="grid grid-cols-2 gap-3">
    <div>
      <div className="text-game-xs uppercase tracking-widest text-(--color-pixel-muted) mb-1">
        生理
      </div>
      <div className="space-y-0.5">
        <UniBar label="饿" value={character.vitals.hunger} max={16} danger={10} warn={6} />
        <UniBar label="累" value={character.vitals.fatigue} max={16} danger={10} warn={6} />
        <UniBar label="脏" value={character.vitals.hygiene} max={16} danger={10} warn={6} />
      </div>
    </div>
    <div>
      <div className="text-game-xs uppercase tracking-widest text-(--color-pixel-muted) mb-1">
        情绪
      </div>
      <div className="space-y-0.5">
        <BiBar label="心" value={character.emotion.mood} />
        <UniBar label="压" value={character.emotion.stress} max={4} danger={3} warn={2} />
        <BiBar label="社" value={character.emotion.social_satiety} />
      </div>
    </div>
  </div>
</section>
```

Place this dashboard IMMEDIATELY AFTER the 上一轮思考 section and BEFORE the 性格 section. Final order in the JSX should now read: Header → 上一轮思考 → **状态仪表盘** → 性格 → 关系 → 最近记忆.

- [ ] **Step 6.4: Lint check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 6.5: Commit**

```bash
git add src/app/_components/profile-pane.tsx
git commit -m "feat(profile-pane): status dashboard hero — vitals + emotion as bars"
```

---

## Task 7: profile-pane — 性格 use BiBar, delete PersonalityBar

**Files:**
- Modify: `src/app/_components/profile-pane.tsx`

Goal: switch the 性格 section to use the shared `BiBar` (with default min=-4, max=4) and delete the now-redundant `PersonalityBar` function.

- [ ] **Step 7.1: Replace PersonalityBar usage in the 性格 section**

Find the 性格 section that currently reads:

```tsx
{(Object.entries(character.personality) as Array<[keyof Personality, number]>).map(
  ([k, v]) => (
    <PersonalityBar key={k} label={PERSONALITY_LABELS[k]} value={v} />
  ),
)}
```

Replace with:

```tsx
{(Object.entries(character.personality) as Array<[keyof Personality, number]>).map(
  ([k, v]) => (
    <BiBar key={k} label={PERSONALITY_LABELS[k]} value={v} />
  ),
)}
```

- [ ] **Step 7.2: Delete the PersonalityBar function**

Find and delete the entire `PersonalityBar` function definition (the function at the top of the file, currently between `PERSONALITY_LABELS` and `ProfilePane`). It's been fully replaced by `BiBar`.

- [ ] **Step 7.3: Lint check**

Run: `npm run lint`
Expected: PASS — no "PersonalityBar is defined but never used" warnings.

- [ ] **Step 7.4: Commit**

```bash
git add src/app/_components/profile-pane.tsx
git commit -m "refactor(profile-pane): 性格 uses shared BiBar; delete PersonalityBar"
```

---

## Task 8: profile-pane — 关系 (SectionLabel + note + expand)

**Files:**
- Modify: `src/app/_components/profile-pane.tsx`

Goal: introduce a private `SectionLabel` component that handles label + count + expand toggle; refactor the 关系 section to use it; surface `relations[].note` as a second line per entry; show "展开 ▾" / "收起 ▴" when total > 5; render placeholder when relations is empty.

- [ ] **Step 8.1: Add SectionLabel component**

Inside `src/app/_components/profile-pane.tsx`, immediately AFTER the `UniBar` function (added in Task 6) and BEFORE `ProfilePane`, add:

```tsx
/** Section 标题：label + 可选 X/Y 计数 + 可选展开/收起按钮。 */
function SectionLabel({
  children,
  shown,
  total,
  expanded,
  onToggle,
}: {
  children: React.ReactNode;
  shown?: number;
  total?: number;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const showCount = total !== undefined;
  const showToggle = onToggle !== undefined && total !== undefined && shown !== undefined && total > shown;
  return (
    <div className="flex items-center gap-2 text-game-xs uppercase tracking-widest text-(--color-pixel-muted) mb-1">
      <span>{children}</span>
      {showCount && (
        <span className="px-1 bg-(--color-pixel-bg-2) border border-(--color-pixel-border-dark) text-game-2xs normal-case tracking-normal">
          {shown !== undefined ? `${shown}/${total}` : total}
        </span>
      )}
      {showToggle && (
        <button
          type="button"
          onClick={onToggle}
          className="ml-auto text-(--color-pixel-accent) hover:underline normal-case tracking-normal"
        >
          {expanded ? "收起 ▴" : "展开 ▾"}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 8.2: Add relations expand state**

Inside `ProfilePane`, BEFORE the `if (!character)` early return and alongside the existing `thoughtExpanded` state (added in Task 5), add a second piece of state:

```tsx
const [relationsExpanded, setRelationsExpanded] = useState(false);
```

Update the `useEffect` that resets state on character change to also reset this (still keyed on `characterId`):

```tsx
useEffect(() => {
  setThoughtExpanded(false);
  setRelationsExpanded(false);
}, [characterId]);
```

- [ ] **Step 8.3: Update relations computation**

Find the existing `topRelations` line in `ProfilePane`:

```tsx
const topRelations = Object.entries(character.relations)
  .sort((a, b) => Math.abs(b[1].affection) - Math.abs(a[1].affection))
  .slice(0, 5);
```

Replace with:

```tsx
const sortedRelations = Object.entries(character.relations).sort(
  (a, b) => Math.abs(b[1].affection) - Math.abs(a[1].affection),
);
const totalRelations = sortedRelations.length;
const visibleRelations = relationsExpanded ? sortedRelations : sortedRelations.slice(0, 5);
```

- [ ] **Step 8.4: Replace the 关系 section JSX**

Find the existing `{/* 关系 */}` block. Replace the ENTIRE conditional block (starting from `{topRelations.length > 0 && (`) with:

```tsx
{/* 关系 */}
<section>
  <SectionLabel
    shown={Math.min(visibleRelations.length, totalRelations)}
    total={totalRelations}
    expanded={relationsExpanded}
    onToggle={() => setRelationsExpanded((v) => !v)}
  >
    关系
  </SectionLabel>
  {totalRelations === 0 ? (
    <p className="text-game-sm text-(--color-pixel-muted)">尚无任何关系</p>
  ) : (
    <ul className="space-y-1">
      {visibleRelations.map(([id, rel]) => {
        const tone = affectionTone(rel.affection);
        return (
          <li key={id} className="text-game-sm grid grid-cols-[18px_1fr_auto] gap-2 items-baseline">
            <span className="text-base">
              {NPC_EMOJI[id] ?? NPC_FALLBACK_EMOJI}
            </span>
            <div className="min-w-0">
              <div>
                <span className="text-(--color-pixel-fg)">
                  {charById.get(id)?.name ?? id}
                </span>
                <span className="text-(--color-pixel-muted) text-game-xs"> · {rel.kinds.join("/")}</span>
              </div>
              {rel.note && (
                <div className="text-game-xs text-(--color-pixel-muted) italic truncate">
                  &ldquo;{rel.note}&rdquo;
                </div>
              )}
            </div>
            <span
              style={{
                color:
                  tone === "pos"
                    ? "var(--color-pixel-success)"
                    : tone === "neg"
                      ? "var(--color-pixel-danger)"
                      : "var(--color-pixel-muted)",
              }}
            >
              {rel.affection > 0 ? "+" : ""}
              {rel.affection}
            </span>
          </li>
        );
      })}
    </ul>
  )}
</section>
```

- [ ] **Step 8.5: Lint check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 8.6: Commit**

```bash
git add src/app/_components/profile-pane.tsx
git commit -m "feat(profile-pane): 关系 — note inline, X/Y count, expand toggle"
```

---

## Task 9: profile-pane — 最近记忆 expand toggle

**Files:**
- Modify: `src/app/_components/profile-pane.tsx`

Goal: add an `memoriesExpanded` state and SectionLabel to the 最近记忆 section; render placeholder when empty.

- [ ] **Step 9.1: Add memoriesExpanded state**

Inside `ProfilePane`, BEFORE the `if (!character)` early return and alongside `thoughtExpanded` / `relationsExpanded`, add:

```tsx
const [memoriesExpanded, setMemoriesExpanded] = useState(false);
```

Update the reset `useEffect` (still keyed on `characterId`):

```tsx
useEffect(() => {
  setThoughtExpanded(false);
  setRelationsExpanded(false);
  setMemoriesExpanded(false);
}, [characterId]);
```

- [ ] **Step 9.2: Update memories computation**

Find the existing `recentMemories` line:

```tsx
const recentMemories = [...character.shortMemory]
  .sort((a, b) => b.tick - a.tick)
  .slice(0, 5);
```

Replace with:

```tsx
const sortedMemories = [...character.shortMemory].sort((a, b) => b.tick - a.tick);
const totalMemories = sortedMemories.length;
const visibleMemories = memoriesExpanded ? sortedMemories : sortedMemories.slice(0, 5);
```

- [ ] **Step 9.3: Replace the 最近记忆 section**

Find the existing `{/* 短期记忆 */}` block. Replace the entire conditional (starting from `{recentMemories.length > 0 && (`) with:

```tsx
{/* 最近记忆 */}
<section>
  <SectionLabel
    shown={Math.min(visibleMemories.length, totalMemories)}
    total={totalMemories}
    expanded={memoriesExpanded}
    onToggle={() => setMemoriesExpanded((v) => !v)}
  >
    最近记忆
  </SectionLabel>
  {totalMemories === 0 ? (
    <p className="text-game-sm text-(--color-pixel-muted)">暂无记忆</p>
  ) : (
    <ul className="space-y-1">
      {visibleMemories.map((m) => (
        <li key={m.id} className="text-game-sm text-(--color-pixel-fg) leading-snug">
          <span className="text-(--color-pixel-muted)">
            t={m.tick}·<span className="text-(--color-pixel-accent)">{"★".repeat(m.importance)}</span>
          </span>{" "}
          {m.content}
        </li>
      ))}
    </ul>
  )}
</section>
```

- [ ] **Step 9.4: Lint check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 9.5: Commit**

```bash
git add src/app/_components/profile-pane.tsx
git commit -m "feat(profile-pane): 最近记忆 — X/Y count, expand toggle, star repeat"
```

---

## Task 10: profile-pane — 能力 section (new)

**Files:**
- Modify: `src/app/_components/profile-pane.tsx`

Goal: add a new 能力 section at the bottom; chips for each ability (`${kind} · t${tier}`); placeholder when `abilities.length === 0`.

- [ ] **Step 10.1: Append the 能力 section**

Immediately AFTER the 最近记忆 section (which is the current last section in the JSX), append:

```tsx
{/* 能力 */}
<section>
  <SectionLabel total={character.abilities.length}>能力</SectionLabel>
  {character.abilities.length === 0 ? (
    <p className="text-game-sm text-(--color-pixel-muted)">尚未习得任何能力</p>
  ) : (
    <div className="flex flex-wrap gap-1">
      {character.abilities.map((a, i) => (
        <span
          key={`${a.kind}-${i}`}
          className="text-game-xs px-1 bg-(--color-pixel-bg-2) border border-(--color-pixel-border-dark) text-(--color-pixel-fg)"
        >
          {a.kind} · <span className="text-(--color-pixel-accent)">t{a.tier}</span>
        </span>
      ))}
    </div>
  )}
</section>
```

Without `shown`, the count chip renders just the total (e.g. "0" or "3") and no toggle button — matches abilities' "flat list, no expand" semantics.

- [ ] **Step 10.2: Lint check**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 10.3: Commit**

```bash
git add src/app/_components/profile-pane.tsx
git commit -m "feat(profile-pane): add 能力 section with chips"
```

---

## Task 11: full smoke test

**Files:** none modified.

Goal: visually verify the redesigned profile-pane against the spec by running the dev server and clicking through several characters.

- [ ] **Step 11.1: Start dev server**

Run: `npm run dev`

Open http://localhost:3000.

- [ ] **Step 11.2: Verify each section**

Click a character in the rail. Confirm:

1. **Header** — avatar is enlarged (~60×60), name is on top, location button works (jumps the map). If the character has `homeNodeId` different from current `locationId`, the home node name appears with `· 家 X`. If `currentAction` is set (try a sleeping character — advance ticks until someone sleeps), an accent chip shows `${description} (t${start}→t${end})`.
2. **上一轮思考** — sits IMMEDIATELY below the header. reasoning is line-clamped to 4 lines by default; clicking "展开全文 ▾" expands fully and the button toggles to "收起 ▴". `emotionTag` is an accent chip when present. `freeText` shows below.
3. **状态仪表盘** — gold-bordered card BELOW 思考. Two columns: 生理 (饿/累/脏 single-direction bars 0..16) and 情绪 (心/社 bidirectional, 压 single-direction 0..4). Bar colors match thresholds.
4. **性格** — 4 bidirectional bars (I/E, N/S, F/T, P/J), [-4..+4]. Visually identical to the old PersonalityBar style.
5. **关系** — count badge `2/12` etc. `note` shows as italic gray line below name+kinds (single-line ellipsis when long). `affection` value is green/red/gray. "展开 ▾" reveals all relations; "收起 ▴" goes back to top 5.
6. **最近记忆** — count badge. `★` repeats per importance. "展开 ▾" works.
7. **能力** — chips for each ability, or "尚未习得任何能力" when empty.

Switch to a different character — confirm all toggles (思考 / 关系 / 记忆) reset to collapsed state.

- [ ] **Step 11.3: Run full test suite**

Run: `npm test`
Expected: PASS — including the 3 new helper test cases.

- [ ] **Step 11.4: No commit needed**

Smoke test produces no diff. Stop the dev server.

---

## Summary

10 implementation tasks + 1 verification task. All commits leave the dev server in a working state — at every checkpoint the page should render without errors, just with progressively more of the redesign applied.
