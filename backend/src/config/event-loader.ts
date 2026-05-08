import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { GlobalEventDef } from "../domain/index";
import { BUILTIN_EVENTS } from "../domain/index";
import { loadManifest } from "./loader";

function scenesRoot(): string {
  return (
    process.env.AGENT_WORLD_SCENES_DIR ??
    path.resolve(process.cwd(), "scenes")
  );
}

/** Load mod events from a map pack's events.json file. */
function loadModEvents(packId: string, eventsFile: string): GlobalEventDef[] {
  const filePath = path.join(scenesRoot(), packId, eventsFile);
  if (!existsSync(filePath)) {
    console.warn(`Events file not found: ${filePath}`);
    return [];
  }
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    console.warn(`Events file is not an array: ${filePath}`);
    return [];
  }
  return parsed.filter((e: unknown) => {
    if (typeof e !== "object" || e === null) return false;
    const ev = e as Record<string, unknown>;
    if (typeof ev.id !== "string" || typeof ev.name !== "string" ||
        typeof ev.description !== "string" || typeof ev.start !== "string" ||
        typeof ev.end !== "string") {
      console.warn(`Skipping invalid event entry in ${filePath}:`, ev);
      return false;
    }
    return true;
  }) as GlobalEventDef[];
}

/**
 * Load all events for a world: builtin + mod (if manifest.events is set).
 * Mod events with the same id override builtin ones.
 */
export function loadEvents(packId: string): GlobalEventDef[] {
  const manifest = loadManifest(packId);
  const events: GlobalEventDef[] = [...BUILTIN_EVENTS];

  if (!manifest.events) return events;

  const modEvents = loadModEvents(packId, manifest.events);

  for (const mod of modEvents) {
    const idx = events.findIndex((b) => b.id === mod.id);
    if (idx >= 0) {
      events[idx] = mod;
    } else {
      events.push(mod);
    }
  }

  return events;
}
