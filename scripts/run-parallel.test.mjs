import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, formatPrefix, COLORS } from "./run-parallel.mjs";

test("parseArgs returns dirs from argv", () => {
  assert.deepEqual(parseArgs(["node", "run-parallel.mjs", "frontend", "backend"]),
    ["frontend", "backend"]);
});

test("parseArgs returns empty array when no args given", () => {
  assert.deepEqual(parseArgs(["node", "run-parallel.mjs"]), []);
});

test("formatPrefix wraps name in selected color and resets", () => {
  const p = formatPrefix("frontend", 0);
  assert.ok(p.includes("frontend"));
  assert.ok(p.includes(COLORS[0]));
  assert.ok(p.includes("\x1b[0m"));
});

test("formatPrefix cycles colors on overflow", () => {
  const a = formatPrefix("a", 0);
  const b = formatPrefix("b", COLORS.length); // wraps to index 0
  assert.ok(a.includes(COLORS[0]) && b.includes(COLORS[0]));
});
