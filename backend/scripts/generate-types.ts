#!/usr/bin/env tsx
/**
 * Generate frontend/src/types/api.generated.ts from backend/src/domain/{types,enums}.ts.
 *
 * Pipeline:
 *   1. tsc --emitDeclarationOnly on the two source files → <tmp>/{types,enums}.d.ts
 *   2. Strip cross-file imports.
 *   3. Concatenate enums-first, types-second.
 *   4. Append `export const` value declarations from enums.ts source.
 *   5. Write with warning header.
 */

import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HEADER = `/**
 * AUTO-GENERATED from backend/src/domain/{types,enums}.ts.
 * Run \`pnpm gen:types\` from the backend package to regenerate. Do not edit by hand.
 */
\n`;

export function mergeDeclarations(input: {
  enums: string;
  types: string;
  actionSystem?: string;
}): string {
  const stripImports = (src: string): string =>
    src
      // matches:  import type { X } from "./enums";
      //           import { type X } from "./enums";
      //           import { X } from "./enums";
      .replace(/^\s*import\s+(?:type\s+)?\{[^}]*\}\s+from\s+["']\.\/[^"']+["'];?\s*$/gm, "")
      // matches:  import * as X from "./enums";
      .replace(/^\s*import\s+\*\s+as\s+\w+\s+from\s+["']\.\/[^"']+["'];?\s*$/gm, "");

  // Strip `export declare const NAME ...;` declarations — these conflict with
  // the runtime `export const NAME = ...` values we append at the bottom.
  // Type aliases like `(typeof NAME)[number]` still resolve against the runtime const.
  // Handles both `export declare const X: Type;` and `export declare const X = literal;`.
  const stripDeclareConst = (src: string): string => {
    const lines = src.split("\n");
    const out: string[] = [];
    let skipping = false;
    let depth = 0;
    const trackBraces = (line: string) => {
      for (const ch of line) {
        if (ch === "{" || ch === "[" || ch === "(") depth++;
        else if (ch === "}" || ch === "]" || ch === ")") depth--;
      }
    };
    for (const line of lines) {
      if (!skipping) {
        if (/^\s*export\s+declare\s+const\s+/.test(line)) {
          skipping = true;
          depth = 0;
          trackBraces(line);
          if (depth === 0 && /;\s*$/.test(line)) {
            skipping = false;
          }
          continue;
        }
        out.push(line);
      } else {
        trackBraces(line);
        if (depth === 0 && /;\s*$/.test(line)) {
          skipping = false;
        }
      }
    }
    return out.join("\n");
  };

  // Inline `import("./X").Y` type references (TS auto-emits these for cross-file
  // type deps that weren't in the rootDir/include set). When we DO include the
  // referenced file, the inline import becomes redundant — strip the `import("./X").`
  // prefix so the bare type name resolves to the merged declaration.
  const inlineImportRefs = (src: string): string =>
    src.replace(/import\(["']\.\/[^"']+["']\)\./g, "");

  const parts = [
    stripDeclareConst(stripImports(input.enums)).trimEnd(),
    input.actionSystem ? stripDeclareConst(stripImports(input.actionSystem)).trimEnd() : "",
    stripDeclareConst(stripImports(input.types)).trimEnd(),
  ].filter((s) => s.length > 0);

  return inlineImportRefs(parts.join("\n\n")) + "\n";
}

/**
 * Extract `export const ...` declarations (with their full RHS) from a TS source file.
 * Skips `export type` / `export interface` / `export function`.
 */
export function extractValueExports(src: string): string {
  const lines = src.split("\n");
  const out: string[] = [];
  let buf: string[] = [];
  let inExportConst = false;
  let depth = 0;

  const trackBraces = (line: string) => {
    for (const ch of line) {
      if (ch === "{" || ch === "[" || ch === "(") depth++;
      else if (ch === "}" || ch === "]" || ch === ")") depth--;
    }
  };

  for (const line of lines) {
    if (!inExportConst) {
      // Match start of "export const NAME"
      if (/^\s*export\s+const\s+/.test(line)) {
        inExportConst = true;
        buf = [line];
        depth = 0;
        trackBraces(line);
        // Single-line declaration: ends with ";" and balanced braces
        if (/;\s*$/.test(line) && depth === 0) {
          out.push(buf.join("\n"));
          inExportConst = false;
          buf = [];
        }
      }
      // Skip everything else (type/interface/function/comment/blank)
    } else {
      buf.push(line);
      trackBraces(line);
      if (depth === 0 && /;\s*$/.test(line)) {
        out.push(buf.join("\n"));
        inExportConst = false;
        buf = [];
      }
    }
  }

  return out.join("\n\n");
}

function main(): void {
  const __filename = fileURLToPath(import.meta.url);
  const backendRoot = resolve(dirname(__filename), "..");
  const repoRoot = resolve(backendRoot, "..");

  const typesPath = join(backendRoot, "src/domain/types.ts");
  const enumsPath = join(backendRoot, "src/domain/enums.ts");
  const actionSystemPath = join(backendRoot, "src/domain/action-system.ts");
  const outPath = join(repoRoot, "frontend/src/types/api.generated.ts");

  const tmp = mkdtempSync(join(tmpdir(), "agw-codegen-"));
  try {
    // Step 1: emit .d.ts. We include action-system.ts because types.ts
    // references `import("./action-system").ActionInput` inline; including it
    // here lets us resolve those references in the merged output.
    const tsc = join(backendRoot, "node_modules/.bin/tsc");
    execSync(
      `"${tsc}" --emitDeclarationOnly --declaration --outDir "${tmp}" --rootDir "${join(backendRoot, "src")}" --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck "${typesPath}" "${enumsPath}" "${actionSystemPath}"`,
      { stdio: "inherit" }
    );

    // Step 2-3: read and merge
    const typesDts = readFileSync(join(tmp, "domain/types.d.ts"), "utf8");
    const enumsDts = readFileSync(join(tmp, "domain/enums.d.ts"), "utf8");
    const actionSystemDts = readFileSync(join(tmp, "domain/action-system.d.ts"), "utf8");
    const merged = mergeDeclarations({
      enums: enumsDts,
      types: typesDts,
      actionSystem: actionSystemDts,
    });

    // Step 4: append value exports from enums.ts source
    const enumsSrc = readFileSync(enumsPath, "utf8");
    const valueExports = extractValueExports(enumsSrc);

    const final =
      HEADER +
      merged +
      "\n// Runtime values from enums.ts -----------------------------------------------\n\n" +
      valueExports +
      "\n";

    writeFileSync(outPath, final);
    console.log(`Wrote ${outPath}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Only run main when invoked directly (not when imported by tests).
// Use pathToFileURL to normalize Windows paths (backslashes vs forward slashes).
const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main();
}
