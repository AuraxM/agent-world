import { describe, it, expect } from "vitest";
import { mergeDeclarations, extractValueExports } from "./generate-types";

describe("mergeDeclarations", () => {
  it("strips inter-file imports and concatenates in order", () => {
    const enumsDts = `export type Color = "red" | "blue";\n`;
    const typesDts =
      `import type { Color } from "./enums";\n` +
      `export interface Item { color: Color; }\n`;

    const merged = mergeDeclarations({ enums: enumsDts, types: typesDts });

    expect(merged).toContain('export type Color = "red" | "blue"');
    expect(merged).toContain("export interface Item");
    expect(merged).not.toContain('from "./enums"');
    // enums must appear before types (referenced first)
    const enumsAt = merged.indexOf("export type Color");
    const typesAt = merged.indexOf("export interface Item");
    expect(enumsAt).toBeLessThan(typesAt);
  });

  it("handles `import { type X } from \"./enums\"` form", () => {
    const enumsDts = `export type Color = "red" | "blue";\n`;
    const typesDts =
      `import { type Color } from "./enums";\n` +
      `export interface Item { color: Color; }\n`;
    const merged = mergeDeclarations({ enums: enumsDts, types: typesDts });
    expect(merged).not.toContain('from "./enums"');
  });
});

describe("extractValueExports", () => {
  it("extracts a simple const numeric export", () => {
    const src = `export const TICKS_PER_HOUR = 5;\n`;
    expect(extractValueExports(src)).toContain("export const TICKS_PER_HOUR = 5;");
  });

  it("extracts a const array as const", () => {
    const src = `export const NODE_TAGS = [\n  "a",\n  "b",\n] as const;\nexport type NodeTag = (typeof NODE_TAGS)[number];\n`;
    const out = extractValueExports(src);
    expect(out).toContain("export const NODE_TAGS");
    expect(out).toContain("\"a\"");
    expect(out).toContain("\"b\"");
    expect(out).toContain("as const");
  });

  it("does not include type-only exports", () => {
    const src = `export type Color = "red" | "blue";\nexport const X = 1;\n`;
    const out = extractValueExports(src);
    expect(out).not.toContain("export type Color");
    expect(out).toContain("export const X = 1");
  });
});
