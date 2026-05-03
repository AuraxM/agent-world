/**
 * Mod loader — loads map-pack override modules.
 *
 * Kept SEPARATE from loader.ts so that Turbopack/Next.js API routes don't
 * process it during bundle analysis. The Function constructor here is
 * intentionally opaque to bundlers, which is required for mod systems
 * where module paths are only known at runtime.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { loadManifest } from "./loader";
import type { ActionDefinition } from "@/domain/action-system";

function configsRoot(): string {
  return (
    process.env.AGENT_WORLD_CONFIGS_DIR ??
    path.resolve(process.cwd(), "configs")
  );
}

function mapsRoot(): string {
  return path.join(configsRoot(), "maps");
}

/** Load a CommonJS module at runtime without involving the bundler. */
function loadJSModule(filePath: string): unknown {
  const code = readFileSync(filePath, "utf8");
  const module = { exports: {} as unknown };
  // Function constructor is opaque to bundlers — by design for mod systems.
  // eslint-disable-next-line no-new-func
  const fn = new Function("module", "exports", code);
  fn(module, module.exports);
  return module.exports;
}

/** 加载地图包的自定义 ActionDefinition 列表（通过 manifest.actions 字段）。 */
export function loadModActions(packId: string): ActionDefinition[] {
  const manifest = loadManifest(packId);
  if (!manifest.actions) return [];

  const actionsPath = path.join(mapsRoot(), packId, manifest.actions);
  if (!existsSync(actionsPath)) {
    console.warn(`Mod actions file not found: ${actionsPath}`);
    return [];
  }

  const mod = loadJSModule(actionsPath);
  const defs: ActionDefinition[] = Array.isArray(mod)
    ? mod
    : ((mod as { default?: ActionDefinition[] }).default ?? []);
  return defs;
}
