# 8×8 Pixel Avatar Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate MC-style 8×8 pixel avatars as PNG data URIs for each character on world creation, replacing emoji placeholders.

**Architecture:** Zero-dependency PNG encoder in `backend/src/systems/avatar.ts` using Node.js built-in `zlib.deflateSync`. Called from `createWorld.ts` after character insert. Frontend replaces emoji `<span>` with `<img>` when avatar is a data URI via a new `CharacterAvatar` component.

**Tech Stack:** TypeScript (backend + frontend), Node.js `zlib`, React 19, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/src/systems/avatar.ts` | **Create** | Pixel grid builder + PNG encoder, exports `generateAvatar()` |
| `backend/src/systems/avatar.test.ts` | **Create** | Unit tests: grid rules, PNG validity, palette coverage |
| `backend/src/systems/createWorld.ts` | **Modify** | Call `generateAvatar()` after character construct |
| `backend/src/db/repository/characters.ts` | **Modify** | Add `avatar` to `updateCharacter` SET clause |
| `frontend/src/components/character-avatar.tsx` | **Create** | React component: `<img>` for data URI, `<span>` for emoji fallback |
| `frontend/src/components/profile-pane.tsx` | **Modify** | Replace `characterEmoji()` span with `CharacterAvatar` |
| `frontend/src/components/event-card.tsx` | **Modify** | Replace `characterEmoji()` span with `CharacterAvatar` |
| `frontend/src/components/character-list.tsx` | **Modify** | Replace `characterEmoji()` span with `CharacterAvatar` |
| `frontend/src/components/gantt-row.tsx` | **Modify** | Replace `characterEmoji()` span with `CharacterAvatar` |

---

### Task 1: Write the avatar generator with PNG encoder

**Files:**
- Create: `backend/src/systems/avatar.ts`

- [ ] **Step 1: Create `backend/src/systems/avatar.ts`**

```typescript
/**
 * 8×8 MC-style pixel avatar generator.
 * Zero dependencies — uses Node.js built-in zlib for PNG encoding.
 */
import { deflateSync } from "node:zlib";

// ---- Color palettes ----

const SKIN_TONES: [number, number, number][] = [
  [0xf5, 0xd5, 0xb0], // fair
  [0xe4, 0xc0, 0x90], // tan
  [0xc4, 0x9a, 0x6c], // brown
  [0x8d, 0x6e, 0x4c], // dark
];

const HAIR_COLORS: [number, number, number][] = [
  [0x3a, 0x1c, 0x0a], // dark brown
  [0xd4, 0xa0, 0x40], // blonde
  [0xe8, 0xe8, 0xe8], // white/gray
  [0xc0, 0x40, 0x40], // red
  [0x20, 0x20, 0x20], // black
  [0x50, 0x40, 0xa0], // purple (special)
];

const EYE_COLORS: [number, number, number][] = [
  [0x30, 0x48, 0x88], // blue
  [0x38, 0x70, 0x30], // green
  [0x88, 0x60, 0x30], // brown
  [0x80, 0x38, 0x38], // red
  [0x60, 0x60, 0x60], // gray
  [0x68, 0x48, 0x88], // violet
];

const EYE_WHITE: [number, number, number] = [0xf0, 0xf0, 0xf0];

// ---- Helpers ----

type RGBA = [number, number, number, number];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function brighten(c: [number, number, number]): [number, number, number] {
  return c.map((v) => Math.min(255, Math.round(v * 1.25))) as [number, number, number];
}

function darken(c: [number, number, number]): [number, number, number] {
  return c.map((v) => Math.max(0, Math.round(v * 0.7))) as [number, number, number];
}

function mouthColor(skin: [number, number, number]): [number, number, number] {
  // Slightly darker/redder than skin
  return [
    Math.min(255, Math.round(skin[0] * 0.85)),
    Math.max(0, Math.round(skin[1] * 0.55)),
    Math.max(0, Math.round(skin[2] * 0.5)),
  ];
}

// ---- 8×8 Grid Builder ----

function buildGrid(): { grid: RGBA[][]; palette: Record<string, RGBA> } {
  const skin = pick(SKIN_TONES);
  const hair = pick(HAIR_COLORS);
  const hairHi = brighten(hair);
  const hairLo = darken(hair);
  const eye = pick(EYE_COLORS);
  const mouth = mouthColor(skin);
  const mouthLo: [number, number, number] = [
    Math.max(0, Math.round(mouth[0] * 0.75)),
    Math.max(0, Math.round(mouth[1] * 0.6)),
    Math.max(0, Math.round(mouth[2] * 0.6)),
  ];

  const T: RGBA = [0, 0, 0, 0]; // transparent
  const S: RGBA = [...skin, 255];
  const H: RGBA = [...hair, 255];
  const HH: RGBA = [...hairHi, 255];
  const HL: RGBA = [...hairLo, 255];
  const E: RGBA = [...eye, 255];
  const EW: RGBA = [...EYE_WHITE, 255];
  const M: RGBA = [...mouth, 255];
  const ML: RGBA = [...mouthLo, 255];

  const grid: RGBA[][] = [
    // row 0: hair + corner cuts at (0,0) and (7,0)
    [T, H, mottle(H, HH, HL), mottle(H, HH, HL), mottle(H, HH, HL), mottle(H, HH, HL), H, T],
    // row 1: full hair
    [H, mottle(H, HH, HL), mottle(H, HH, HL), mottle(H, HH, HL), mottle(H, HH, HL), mottle(H, HH, HL), mottle(H, HH, HL), H],
    // row 2: hair
    [mottle(H, HH, HL), mottle(H, HH, HL), mottle(H, HH, HL), mottle(H, HH, HL), mottle(H, HH, HL), mottle(H, HH, HL), mottle(H, HH, HL), mottle(H, HH, HL)],
    // row 3: hair sides + eye tops (white only)
    [H, EW, EW, mottle(H, HH, HL), mottle(H, HH, HL), EW, EW, H],
    // row 4: eye middle (pupil), hair sides extend
    [H, EW, E, S, S, E, EW, H],
    // row 5: eye bottom (pupil)
    [S, EW, E, S, S, E, EW, S],
    // row 6: lower face (skin)
    [S, S, S, S, S, S, S, S],
    // row 7: mouth 2px center + chin
    [S, S, S, M, ML, S, S, S],
  ];

  return {
    grid,
    palette: {
      hair: H, hairHi: HH, hairLo: HL,
      skin: S, eye: E, eyeWhite: EW, mouth: M, mouthLo: ML,
    },
  };
}

/** Replace a hair pixel with highlight or shadow variant ~30% of the time. */
function mottle(base: RGBA, hi: RGBA, lo: RGBA): RGBA {
  const r = Math.random();
  if (r < 0.15) return hi;
  if (r < 0.30) return lo;
  return base;
}

// ---- PNG Encoder ----

function encodePNG(grid: RGBA[][]): Buffer {
  const w = 8;
  const h = 8;

  // Build raw RGBA scanlines (filter byte 0x00 = None per row)
  const raw: Buffer[] = [];
  for (let y = 0; y < h; y++) {
    raw.push(Buffer.from([0x00])); // filter: None
    for (let x = 0; x < w; x++) {
      raw.push(Buffer.from(grid[y][x]));
    }
  }
  const rawData = Buffer.concat(raw);

  // Compress with zlib
  const compressed = deflateSync(rawData);

  // ---- Chunk helpers ----
  function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeB = Buffer.from(type, "ascii");
    const crcData = Buffer.concat([typeB, data]);
    const crc = crc32(crcData);
    const crcB = Buffer.alloc(4);
    crcB.writeUInt32BE(crc >>> 0, 0);
    return Buffer.concat([len, typeB, data, crcB]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);  // width
  ihdr.writeUInt32BE(h, 4);  // height
  ihdr[8] = 8;                // bit depth
  ihdr[9] = 6;                // color type: RGBA
  ihdr[10] = 0;               // compression
  ihdr[11] = 0;               // filter
  ihdr[12] = 0;               // interlace

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** CRC32 for PNG chunks (per PNG spec, polynomial 0xEDB88320). */
function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return crc ^ 0xffffffff;
}

// ---- Public API ----

export interface GeneratedAvatar {
  /** data URI ready for <img src="..."> */
  dataUri: string;
  /** Base64-encoded PNG bytes (without the data: prefix) */
  base64: string;
  /** Raw RGBA 8×8 grid (for debugging / inspection) */
  grid: RGBA[][];
}

export function generateAvatar(): GeneratedAvatar {
  const { grid } = buildGrid();
  const png = encodePNG(grid);
  const base64 = png.toString("base64");
  return {
    dataUri: `data:image/png;base64,${base64}`,
    base64,
    grid,
  };
}
```

---

### Task 2: Write tests for the avatar generator

**Files:**
- Create: `backend/src/systems/avatar.test.ts`

- [ ] **Step 1: Create `backend/src/systems/avatar.test.ts`**

```typescript
import { describe, expect, it } from "vitest";
import { generateAvatar, type GeneratedAvatar } from "./avatar";

describe("generateAvatar", () => {
  it("returns a valid PNG data URI", () => {
    const a = generateAvatar();
    expect(a.dataUri).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
  });

  it("returns an 8×8 RGBA grid", () => {
    const a = generateAvatar();
    expect(a.grid.length).toBe(8);
    for (const row of a.grid) {
      expect(row.length).toBe(8);
      for (const px of row) {
        expect(px.length).toBe(4);
        for (const ch of px) expect(ch).toBeGreaterThanOrEqual(0);
        for (const ch of px) expect(ch).toBeLessThanOrEqual(255);
      }
    }
  });

  it("has transparent pixels at corner cuts (0,0) and (7,0)", () => {
    // Run multiple times since palette is random
    for (let i = 0; i < 20; i++) {
      const a = generateAvatar();
      expect(a.grid[0][0][3]).toBe(0); // (0,0) alpha=0
      expect(a.grid[0][7][3]).toBe(0); // (7,0) alpha=0
    }
  });

  it("has non-zero alpha on all other pixels", () => {
    const a = generateAvatar();
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if ((y === 0 && x === 0) || (y === 0 && x === 7)) continue;
        expect(a.grid[y][x][3]).toBe(255);
      }
    }
  });

  it("has eye-colored pixels in eye regions (rows 3-5, cols 1-2 and 5-6)", () => {
    const a = generateAvatar();
    // Pupil color should be in positions (1,4), (2,4), (1,5), (2,5) and mirrored right
    // These should NOT be skin-colored and NOT fully white
    for (const [lx, rx] of [[1, 5], [2, 6]]) {
      for (const y of [4, 5]) {
        // Pupil rows: should be dark (not white, not skin-like bright)
        const lp = a.grid[y][lx];
        const rp = a.grid[y][rx];
        // White pixels are [240,240,240,255], pupil should be notably darker
        expect(lp[0] + lp[1] + lp[2]).toBeLessThan(600);
        expect(rp[0] + rp[1] + rp[2]).toBeLessThan(600);
      }
    }
    // Row 3 should be eye white (bright)
    for (const [lx, rx] of [[1, 5], [2, 6]]) {
      const lp = a.grid[3][lx];
      const rp = a.grid[3][rx];
      expect(lp[0] + lp[1] + lp[2]).toBeGreaterThan(600);
      expect(rp[0] + rp[1] + rp[2]).toBeGreaterThan(600);
    }
  });

  it("has mouth pixels at row 7, cols 3-4", () => {
    const a = generateAvatar();
    // Mouth pixels should be reddish (not skin-colored, not transparent)
    for (const x of [3, 4]) {
      const p = a.grid[7][x];
      expect(p[3]).toBe(255);
      expect(p[0]).toBeGreaterThan(p[2]); // red > blue (mouth is reddish)
    }
  });

  it("produces different results on successive calls (randomness)", () => {
    const avatars: GeneratedAvatar[] = [];
    for (let i = 0; i < 5; i++) {
      avatars.push(generateAvatar());
    }
    // At least one should differ in some pixel (hair mottling or palette)
    const allSame = avatars.every(
      (a) =>
        a.grid[0][1][0] === avatars[0].grid[0][1][0] &&
        a.grid[0][1][1] === avatars[0].grid[0][1][1] &&
        a.grid[0][1][2] === avatars[0].grid[0][1][2],
    );
    expect(allSame).toBe(false);
  });

  it("hair side extensions at row 4, cols 0 and 7 are hair-colored (not skin)", () => {
    const a = generateAvatar();
    // Hair side pixels should differ from skin color at row 6 (reference skin)
    const skinRef = a.grid[6][3]; // center skin pixel
    for (const x of [0, 7]) {
      const hp = a.grid[4][x];
      // Hair should differ from skin
      const same =
        hp[0] === skinRef[0] && hp[1] === skinRef[1] && hp[2] === skinRef[2];
      expect(same).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd backend && pnpm vitest run src/systems/avatar.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/systems/avatar.ts backend/src/systems/avatar.test.ts
git commit -m "feat: add 8×8 pixel avatar generator with PNG encoder"
```

---

### Task 3: Wire avatar generation into world creation

**Files:**
- Modify: `backend/src/systems/createWorld.ts`

- [ ] **Step 1: Import and call `generateAvatar()` in character insertion loop**

In `backend/src/systems/createWorld.ts`, add import at top:

```typescript
import { generateAvatar } from "./avatar";
```

In the character insert loop (inside `db.transaction`), change line 172:

```typescript
// Before:
avatar: m.tpl.avatar ?? null,
// After:
avatar: generateAvatar().dataUri,
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd backend && pnpm tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/systems/createWorld.ts
git commit -m "feat: generate pixel avatars on world creation"
```

---

### Task 4: Add `avatar` to `updateCharacter`

**Files:**
- Modify: `backend/src/db/repository/characters.ts`

- [ ] **Step 1: Add `avatar` to the SET clause in `updateCharacter`**

In `updateCharacter()` at line 78-88, add `avatar: row.avatar,` to the set object:

```typescript
export function updateCharacter(c: Character): void {
  const row = characterToRow(c);
  db.update(schema.characters).set({
    avatar: row.avatar,
    locationId: row.locationId, money: row.money,
    incomeLevel: row.incomeLevel, expenseExempt: row.expenseExempt,
    vitalsJson: row.vitalsJson, emotionJson: row.emotionJson,
    shortMemoryJson: row.shortMemoryJson, dailyMemoryJson: row.dailyMemoryJson,
    longMemoryJson: row.longMemoryJson, impressionBookJson: row.impressionBookJson,
    shortTermGoalJson: row.shortTermGoalJson, longTermGoalJson: row.longTermGoalJson,
    liked: row.liked, disliked: row.disliked, relationsJson: row.relationsJson,
    activeConversationIdsJson: row.activeConversationIdsJson,
    currentActionJson: row.currentActionJson, lastSleepTick: row.lastSleepTick,
    sicknessJson: row.sicknessJson, updatedAt: new Date(),
  }).where(eq(schema.characters.id, c.id)).run();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd backend && pnpm tsc --noEmit
```

- [ ] **Step 3: Run all backend tests**

```bash
cd backend && pnpm vitest run
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/repository/characters.ts
git commit -m "fix: include avatar in updateCharacter SET clause"
```

---

### Task 5: Create `CharacterAvatar` frontend component

**Files:**
- Create: `frontend/src/components/character-avatar.tsx`

- [ ] **Step 1: Create `frontend/src/components/character-avatar.tsx`**

```tsx
import { characterEmoji } from "@/lib/sprite";

interface CharacterAvatarProps {
  c: { id: string; avatar?: string | null };
  size?: number; // px, default 24
}

export function CharacterAvatar({ c, size = 24 }: CharacterAvatarProps) {
  if (c.avatar && c.avatar.startsWith("data:image/")) {
    return (
      <img
        src={c.avatar}
        alt={c.id}
        style={{
          width: size,
          height: size,
          imageRendering: "pixelated",
          flexShrink: 0,
        }}
      />
    );
  }
  const emoji = characterEmoji(c);
  return (
    <span
      style={{ fontSize: Math.round(size * 0.75), flexShrink: 0 }}
      role="img"
      aria-label={c.id}
    >
      {emoji}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/character-avatar.tsx
git commit -m "feat: add CharacterAvatar component for data URI + emoji fallback"
```

---

### Task 6: Replace `characterEmoji()` usage with `CharacterAvatar` across frontend

**Files:**
- Modify: `frontend/src/components/profile-pane.tsx`
- Modify: `frontend/src/components/event-card.tsx`
- Modify: `frontend/src/components/character-list.tsx`
- Modify: `frontend/src/components/gantt-row.tsx`

- [ ] **Step 1: `profile-pane.tsx` — three call sites**

Import at top (add alongside existing imports):

```typescript
import { CharacterAvatar } from "./character-avatar";
```

Line 280-282, replace:

```tsx
// Before:
<span className="text-[36px]">
  {characterEmoji(character)}
</span>
// After:
<CharacterAvatar c={character} size={36} />
```

Line 537, replace:

```tsx
// Before:
{characterEmoji(charById.get(id) ?? { id })}
// After:
<CharacterAvatar c={charById.get(id) ?? { id }} size={14} />
```

Line 803, replace:

```tsx
// Before:
{characterEmoji(targetChar ?? { id: targetId })}
// After:
<CharacterAvatar c={targetChar ?? { id: targetId }} size={14} />
```

- [ ] **Step 2: `event-card.tsx` — two call sites**

Import at top:

```typescript
import { CharacterAvatar } from "./character-avatar";
```

Line 57-59, replace:

```tsx
// Before:
<span className="text-base">
  {characterEmoji(actor)}
</span>
// After:
<CharacterAvatar c={actor} size={16} />
```

Line 73-75, replace:

```tsx
// Before:
<span className="text-base">
  {characterEmoji(speaker)}
</span>
// After:
<CharacterAvatar c={speaker} size={16} />
```

- [ ] **Step 3: `character-list.tsx` — one call site**

Import at top:

```typescript
import { CharacterAvatar } from "./character-avatar";
```

Line 44, replace:

```tsx
// Before:
<span className="mr-1.5">{characterEmoji(c)}</span>
// After:
<CharacterAvatar c={c} size={14} />
```

- [ ] **Step 4: `gantt-row.tsx` — one call site**

Import at top:

```typescript
import { CharacterAvatar } from "./character-avatar";
```

Lines 112-121, replace the entire emoji span:

```tsx
// Before:
<span
  className="gantt-avatar"
  style={{
    width: 24,
    height: 24,
    borderRadius: 4,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    background: "rgba(255,255,255,0.05)",
    flexShrink: 0,
  }}
>
  {characterEmoji(character)}
</span>
// After:
<span
  className="gantt-avatar"
  style={{
    width: 24,
    height: 24,
    borderRadius: 4,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255,255,255,0.05)",
    flexShrink: 0,
  }}
>
  <CharacterAvatar c={character} size={18} />
</span>
```

- [ ] **Step 5: Verify frontend compiles**

```bash
cd frontend && pnpm tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 6: Run frontend tests**

```bash
cd frontend && pnpm vitest run
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/profile-pane.tsx frontend/src/components/event-card.tsx frontend/src/components/character-list.tsx frontend/src/components/gantt-row.tsx
git commit -m "feat: switch avatar rendering from emoji span to CharacterAvatar component"
```

---

### Task 7: End-to-end verification

- [ ] **Step 1: Start backend + frontend**

```bash
pnpm dev
```

- [ ] **Step 2: Create a new world via admin panel and verify characters have pixel avatars**

- [ ] **Step 3: Open profile pane and verify avatar renders as crisp pixel art**

- [ ] **Step 4: Check event cards, character list, and Gantt row for correct avatar display**

- [ ] **Step 5: Run full test suite**

```bash
pnpm test
```
