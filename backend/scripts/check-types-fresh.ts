#!/usr/bin/env tsx
/**
 * Verify that frontend/src/types/api.generated.ts on disk is up-to-date
 * with backend/src/domain/{types,enums}.ts. Exits non-zero on drift.
 *
 * Usage: pnpm check:types-fresh
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export interface DriftReport {
  drifted: boolean;
  message: string;
}

export function computeDriftReport(input: { before: string; after: string }): DriftReport {
  if (input.before === input.after) {
    return { drifted: false, message: "frontend/src/types/api.generated.ts is up to date." };
  }
  return {
    drifted: true,
    message:
      "DRIFT DETECTED: frontend/src/types/api.generated.ts is stale.\n" +
      "Run `pnpm gen:types` from repo root and commit the result.",
  };
}

function main(): void {
  const __filename = fileURLToPath(import.meta.url);
  const backendRoot = resolve(dirname(__filename), "..");
  const repoRoot = resolve(backendRoot, "..");
  const generatedPath = join(repoRoot, "frontend/src/types/api.generated.ts");

  const before = readFileSync(generatedPath, "utf8");
  // Regenerate (in-place)
  execSync(`pnpm --dir "${backendRoot}" run gen:types`, { stdio: "inherit" });
  const after = readFileSync(generatedPath, "utf8");

  const report = computeDriftReport({ before, after });
  console.log(report.message);
  if (report.drifted) {
    process.exit(1);
  }
}

// Use pathToFileURL for Windows path normalization (same as generate-types.ts).
const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main();
}
