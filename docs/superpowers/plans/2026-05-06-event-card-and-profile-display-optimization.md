# Event Card & Profile Display Optimization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show both parties with gender+age in dialogue event cards; add clickable impression popover on relation names in profile pane.

**Architecture:** Two isolated changes in existing components. Event-card.tsx gets a `genderIcon` helper and dual-participant rendering for dialogue events. Profile-pane.tsx gets an `impressionPopover` state and a positioned popover overlay triggered by clicking relation character names that have impression book entries.

**Tech Stack:** React (Next.js App Router client components), Tailwind CSS, TypeScript.

---

### Task 1: Add `genderIcon` helper and dual-party display in event-card

**Files:**
- Modify: `src/app/_components/event-card.tsx`

- [ ] **Step 1: Add `genderIcon` helper and update the card header to show both parties for dialogue events**

Replace the card header JSX (lines 41-81) with the following. Add `genderIcon` function, and conditionally render multi-speaker layout for dialogue events.

```tsx
function genderIcon(gender: string): string {
  if (gender === "male") return "♂";
  if (gender === "female") return "♀";
  return "⚧";
}

// Inside EventCard component, replace the header div (lines 41-81):

const dialogueSpeakers = hasTranscript
  ? [...new Set(event.dialogTranscript!.filter(t => t.speakerId !== "__system__").map(t => t.speakerId))]
      .map(id => charById.get(id))
      .filter(Boolean) as Character[]
  : [];

// …

<div className="flex items-center gap-2 mb-1.5">
  {/* Single actor (non-dialogue) */}
  {!hasTranscript && actor && (
    <>
      <span className="npc-chip w-7 h-7 text-base">
        {characterEmoji(actor)}
      </span>
      <button
        type="button"
        onClick={() => onSelectCharacter(actor)}
        className="text-body-sm font-semibold text-(--text) hover:underline cursor-pointer"
      >
        {actor.name}
      </button>
    </>
  )}

  {/* Multi-speaker (dialogue events) */}
  {hasTranscript && dialogueSpeakers.map((speaker, i) => (
    <span key={speaker.id} className="flex items-center gap-1">
      <span className="npc-chip w-7 h-7 text-base">
        {characterEmoji(speaker)}
      </span>
      <button
        type="button"
        onClick={() => onSelectCharacter(speaker)}
        className="text-body-sm font-semibold text-(--text) hover:underline cursor-pointer"
      >
        {speaker.name}
      </button>
      <span className="text-pixel-2xs text-(--text-faint)">
        {genderIcon(speaker.gender)} {speaker.age}岁
      </span>
      {i < dialogueSpeakers.length - 1 && (
        <span className="text-(--text-faint) mx-0.5">·</span>
      )}
    </span>
  ))}

  {/* Location chip, important tag, time — unchanged */}
  {/* ... existing code for loc, important, time ... */}
</div>
```

- [ ] **Step 2: Verify it looks correct**

Start the dev server and check:
- Non-dialogue events: display unchanged (single actor name)
- Dialogue events with transcript: both speakers shown with gender icon + age
- Dialogue events: each name clickable → opens profile

- [ ] **Step 3: Commit**

```bash
git add src/app/_components/event-card.tsx
git commit -m "feat: show both parties with gender+age in dialogue event cards"
```

---

### Task 2: Add impression popover to profile pane relations

**Files:**
- Modify: `src/app/_components/profile-pane.tsx`

- [ ] **Step 1: Add `impressionPopover` state and popover UI in the "档案" tab relations section**

Add state at the top of the ProfilePane component (after the existing state declarations, around line 177):

```tsx
const [impressionPopover, setImpressionPopover] = useState<{ targetId: string; x: number; y: number } | null>(null);
```

In the "档案" tab relations list (around lines 498-516), replace the name display with a clickable version:

```tsx
// Replace the name span (lines 504-508):
<div className="min-w-0">
  <div>
    {imp ? (
      <button
        type="button"
        onClick={(e) => {
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          setImpressionPopover({ targetId: id, x: rect.left, y: rect.bottom + 4 });
        }}
        className="text-(--color-pixel-fg) hover:underline cursor-pointer"
      >
        {charById.get(id)?.name ?? id}
      </button>
    ) : (
      <span className="text-(--color-pixel-fg)">
        {charById.get(id)?.name ?? id}
      </span>
    )}
    <span className="text-(--color-pixel-muted) text-game-xs"> · {rel.kinds.join("/")}</span>
  </div>
  {imp && (
    <div className="text-game-xs text-(--color-pixel-muted) italic truncate">
      &ldquo;{imp}&rdquo;
    </div>
  )}
</div>
```

- [ ] **Step 2: Add the popover overlay (rendered at the bottom of the component, before the closing `</div>`)**

```tsx
{/* Impression popover */}
{impressionPopover && (() => {
  const targetId = impressionPopover.targetId;
  const targetChar = charById.get(targetId);
  const impText = character.impressionBook[targetId];
  return (
    <div className="fixed inset-0 z-50" onClick={() => setImpressionPopover(null)}>
      <div
        className="absolute bg-(--color-pixel-bg) border-2 border-(--color-pixel-accent-dark) p-3 shadow-lg max-w-xs"
        style={{
          left: impressionPopover.x,
          top: impressionPopover.y,
          boxShadow: "4px 4px 0 var(--color-pixel-border-dark)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="npc-chip w-6 h-6 text-sm">
            {characterEmoji(targetChar ?? { id: targetId })}
          </span>
          <span className="text-game-sm font-semibold text-(--color-pixel-fg)">
            {targetChar?.name ?? targetId} 的印象
          </span>
          <button
            type="button"
            onClick={() => setImpressionPopover(null)}
            className="ml-auto text-(--color-pixel-muted) hover:text-(--color-pixel-fg) cursor-pointer"
          >
            ✕
          </button>
        </div>
        <p className="text-game-sm text-(--color-pixel-fg) italic leading-relaxed">
          &ldquo;{impText}&rdquo;
        </p>
      </div>
    </div>
  );
})()}
```

- [ ] **Step 3: Apply same clickable name pattern to the "关系" tab**

In the "关系" tab (around lines 670-700), replace the name span with the same clickable button pattern:

```tsx
// Replace the name span:
{imp ? (
  <button
    type="button"
    onClick={(e) => {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setImpressionPopover({ targetId, x: rect.left, y: rect.bottom + 4 });
    }}
    className="text-(--color-pixel-fg) hover:underline cursor-pointer"
  >
    {charById.get(id)?.name ?? id}
  </button>
) : (
  <span className="text-(--color-pixel-fg)">
    {charById.get(id)?.name ?? id}
  </span>
)}
```

- [ ] **Step 4: Reset popover when switching characters**

In the character-switch reset block (around line 188), add reset of `impressionPopover`:

```tsx
setImpressionPopover(null);
```

- [ ] **Step 5: Verify it works**

Start the dev server and check:
- Click a relation character with impression → popover appears with full impression text
- Click another → popover switches to that character
- Click outside / close button → popover closes
- Click a relation character without impression → no popover (name is plain text)
- Switch to a different character → popover resets

- [ ] **Step 6: Commit**

```bash
git add src/app/_components/profile-pane.tsx
git commit -m "feat: add impression popover on relation character name click"
```
