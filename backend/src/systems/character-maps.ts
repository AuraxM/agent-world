import { loadAllCharacters } from "../config/index";
import type { SleepWindow } from "../domain/index";

export function buildActivityNodeMap(): Map<string, string> {
  const m = new Map<string, string>();
  try {
    for (const tpl of loadAllCharacters()) {
      if (tpl.activityNodeId) m.set(tpl.id, tpl.activityNodeId);
    }
  } catch {
    /* configs 不可读时静默 */
  }
  return m;
}

export function buildRestNodeMap(): Map<string, string> {
  const m = new Map<string, string>();
  try {
    for (const tpl of loadAllCharacters()) {
      if (tpl.restNodeId) m.set(tpl.id, tpl.restNodeId);
    }
  } catch {
    /* configs 不可读时静默 */
  }
  return m;
}

export function buildSleepWindowMap(): Map<string, SleepWindow> {
  const m = new Map<string, SleepWindow>();
  try {
    for (const tpl of loadAllCharacters()) {
      if (tpl.sleepWindow) m.set(tpl.id, tpl.sleepWindow);
    }
  } catch {
    /* configs 不可读时静默 */
  }
  return m;
}
