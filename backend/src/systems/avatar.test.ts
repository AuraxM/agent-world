import { describe, expect, it } from "vitest";
import { generateAvatar, type GeneratedAvatar } from "./avatar";

describe("generateAvatar", () => {
  it("returns a valid PNG data URI", () => {
    const a = generateAvatar();
    expect(a.dataUri).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
  });

  it("returns an 8x8 RGBA grid", () => {
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

  it("has pupil-colored pixels at eye centers and eye whites in surrounding positions", () => {
    const a = generateAvatar();

    // Grid layout:
    // Row 3: [H,  EW, EW, ..., EW, EW, H]  — eye whites at cols 1,2,5,6
    // Row 4: [H,  EW,  E, ...,  E, EW, H]  — pupils at cols 2,5; whites at 1,6
    // Row 5: [S,  EW,  E, ...,  E, EW, S]  — pupils at cols 2,5; whites at 1,6

    // Pupils at (2,4), (5,4), (2,5), (5,5) should be dark
    for (const col of [2, 5]) {
      for (const row of [4, 5]) {
        const p = a.grid[row][col];
        const sum = p[0] + p[1] + p[2];
        expect(sum).toBeLessThan(600);
      }
    }

    // Eye whites at cols 1,2,5,6 for row 3 should be bright
    for (const col of [1, 2, 5, 6]) {
      const p = a.grid[3][col];
      const sum = p[0] + p[1] + p[2];
      expect(sum).toBeGreaterThan(600);
    }

    // Eye whites at cols 1,6 for rows 4 and 5 should be bright
    for (const col of [1, 6]) {
      for (const row of [4, 5]) {
        const p = a.grid[row][col];
        const sum = p[0] + p[1] + p[2];
        expect(sum).toBeGreaterThan(600);
      }
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
    // Row 4: [H, EW, E, S, S, E, EW, H] — cols 0 and 7 are hair
    const skinRef = a.grid[6][3]; // center skin pixel at row 6
    for (const x of [0, 7]) {
      const hp = a.grid[4][x];
      // Hair should differ from skin
      const same =
        hp[0] === skinRef[0] && hp[1] === skinRef[1] && hp[2] === skinRef[2];
      expect(same).toBe(false);
    }
  });
});
