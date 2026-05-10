/**
 * 8×8 MC-style pixel avatar generator.
 * Zero dependencies — uses Node.js built-in zlib for PNG encoding.
 */
import { deflateSync } from "node:zlib";

// NOTE: This module uses Math.random() for palette selection and hair mottling.
// Each call to generateAvatar() produces a unique result. This is acceptable for
// one-time generation at world creation. For deterministic (seed-based) generation,
// replace Math.random() with a seeded PRNG.

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

// NOTE: Avatar generation is intentionally non-deterministic — each call to pick() and
// mottle() uses Math.random() without a seed, so every character gets a unique appearance.
// This is acceptable for one-time generation at world creation. Future improvements
// could accept an optional seeded PRNG for reproducibility.

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

function buildGrid(): { grid: RGBA[][] } {
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

  return { grid };
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
