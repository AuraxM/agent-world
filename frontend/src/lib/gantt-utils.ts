import type { WorldEvent, Character, SleepWindow } from "@/types/api.generated";

export const TICK_WIDTH = 200;
export const DEFAULT_TICK_WINDOW = 8;

export const CATEGORY_ICONS: Record<string, string> = {
  action: "⚔️",
  social: "🍽️",
  burst: "⚡",
  quest: "📋",
  inner: "💭",
  system: "💤",
  time: "🕐",
  env: "🌦️",
};

export function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category] ?? "";
}

/** Compute visible tick window: newest at endTick, span back tickCount ticks. */
export function getTickWindow(
  events: WorldEvent[],
  tickCount: number = DEFAULT_TICK_WINDOW,
): { startTick: number; endTick: number } {
  if (events.length === 0) return { startTick: 0, endTick: 0 };
  const maxTick = Math.max(...events.map((e) => e.tick));
  const start = Math.max(0, maxTick - tickCount + 1);
  return { startTick: start, endTick: maxTick };
}

/** Group events by tick for a single character within the tick window. */
export function groupEventsByTick(
  events: WorldEvent[],
  characterId: string,
  startTick: number,
  endTick: number,
): Map<number, WorldEvent[]> {
  const map = new Map<number, WorldEvent[]>();
  // descending: newest at left
  for (let t = endTick; t >= startTick; t--) {
    map.set(t, []);
  }
  for (const ev of events) {
    if (
      ev.tick >= startTick &&
      ev.tick <= endTick &&
      ev.participants.includes(characterId)
    ) {
      map.get(ev.tick)!.push(ev);
    }
  }
  return map;
}

/** Get other participant characters (excluding the given character). */
export function getOtherParticipants(
  event: WorldEvent,
  charById: Map<string, Character>,
  excludeId: string,
): Character[] {
  return event.participants
    .filter((id) => id !== excludeId)
    .slice(0, 5)
    .map((id) => charById.get(id))
    .filter((c): c is Character => c != null);
}

/** Build descending tick array for iteration. */
export function tickRangeDesc(startTick: number, endTick: number): number[] {
  const arr: number[] = [];
  for (let t = endTick; t >= startTick; t--) {
    arr.push(t);
  }
  return arr;
}

/** Check if a tick falls within the character's sleep window. */
export function isSleepTick(tick: number, sleepWindow: SleepWindow): boolean {
  const hour = tick % 24;
  const end = (sleepWindow.start + sleepWindow.duration) % 24;
  if (sleepWindow.start < end) {
    return hour >= sleepWindow.start && hour < end;
  }
  // wraps midnight
  return hour >= sleepWindow.start || hour < end;
}

export type StackedEvent = {
  event: WorldEvent;
  left: number;
  top: number;
};

/**
 * Compute absolute positions for events within a character row.
 * left = (maxTick - event.tick) * TICK_WIDTH
 * Events at the same tick stack vertically: first at top=6, each subsequent +52.
 */
export function stackEventsAtTick(
  events: WorldEvent[],
  maxTick: number,
): StackedEvent[] {
  // Group by tick
  const byTick = new Map<number, WorldEvent[]>();
  for (const ev of events) {
    const arr = byTick.get(ev.tick) ?? [];
    arr.push(ev);
    byTick.set(ev.tick, arr);
  }

  const result: StackedEvent[] = [];
  for (const [tick, evs] of byTick) {
    const left = (maxTick - tick) * TICK_WIDTH;
    for (let i = 0; i < evs.length; i++) {
      result.push({
        event: evs[i]!,
        left,
        top: 6 + i * 52,
      });
    }
  }
  return result;
}
