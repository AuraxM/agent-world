# Event Card & Profile Display Optimization

## 1. Event Card: Show Both Parties for Dialogue Events

**Goal**: In dialogue events, show both participants' names with gender icon and age, instead of just the first participant.

**File**: `src/app/_components/event-card.tsx`

**Logic**:
- When `hasTranscript` is true (dialogue event), extract unique speaker IDs from `dialogTranscript` (excluding `__system__`)
- Display each speaker: emoji avatar + name + gender icon (♂/♀/⚧) + age
- Each name is clickable via `onSelectCharacter`
- Non-dialogue events keep the current single-actor display

**Gender icon mapping**: `male` → ♂, `female` → ♀, other → ⚧

## 2. Profile Relations: Click-to-View Impression Popover

**Goal**: In the profile pane's relations section, clicking a character name opens a popover showing the full impression text from `impressionBook`.

**File**: `src/app/_components/profile-pane.tsx`

**Logic**:
- If `impressionBook[id]` exists, the character name becomes a clickable button
- Clicking sets `impressionPopover` state to the target character's ID
- A positioned popover appears showing: target character name + full impression text
- Close via close button in the popover
- Applies to both the "档案" tab relations section and the "关系" tab

**Popover positioning**: Absolute positioned overlay near the clicked relation row.
