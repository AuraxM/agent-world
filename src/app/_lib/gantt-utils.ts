import type { WorldEvent, Character, SleepWindow } from "@/domain/types";

export const TICK_WIDTH = 72;
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

export const CATEGORY_LABELS: Record<string, string> = {
  action: "行动",
  social: "社交",
  burst: "突发",
  quest: "任务",
  inner: "独白",
  system: "休眠",
  time: "时间",
  env: "环境",
};

export const CATEGORY_STYLES: Record<string, { bg: string; border: string }> = {
  action:  { bg: "rgba(92,156,230,0.25)", border: "rgba(92,156,230,0.45)" },
  social:  { bg: "rgba(108,191,108,0.25)", border: "rgba(108,191,108,0.45)" },
  burst:   { bg: "rgba(239,68,68,0.25)",  border: "rgba(239,68,68,0.45)" },
  quest:   { bg: "rgba(234,179,8,0.25)",  border: "rgba(234,179,8,0.45)" },
  inner:   { bg: "rgba(148,163,184,0.2)", border: "rgba(148,163,184,0.35)" },
  system:  { bg: "rgba(212,168,87,0.2)",  border: "rgba(212,168,87,0.35)" },
  time:    { bg: "rgba(148,163,184,0.15)",border: "rgba(148,163,184,0.3)" },
  env:     { bg: "rgba(148,163,184,0.15)",border: "rgba(148,163,184,0.3)" },
};

export const FALLBACK_STYLE = {
  bg: "rgba(100,100,100,0.15)",
  border: "rgba(100,100,100,0.3)",
};

export function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category] ?? "";
}

export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function getCategoryStyle(category: string): { bg: string; border: string } {
  return CATEGORY_STYLES[category] ?? FALLBACK_STYLE;
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
