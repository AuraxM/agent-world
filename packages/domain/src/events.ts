import { TICKS_PER_HOUR } from "./enums";

export interface GlobalEventDef {
  id: string;
  name: string;
  description: string;
  /** "MM-DD" for recurring yearly, or "YYYY-MM-DD" for one-time */
  start: string;
  /** Same format as start; inclusive (event is active on the end date) */
  end: string;
}

const MS_PER_TICK = (60 / TICKS_PER_HOUR) * 60 * 1000;

/** Convert "MM-DD" or "YYYY-MM-DD" to a Date in the given year. */
function parseEventDate(raw: string, year: number): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    // "YYYY-MM-DD" — use the string directly
    return new Date(raw + "T00:00:00");
  }
  // "MM-DD" — attach to given year
  return new Date(`${year}-${raw}T00:00:00`);
}

/**
 * Get the active events at a given tick.
 * `epoch` = world start ms timestamp, `tick` = current tick.
 */
export function getActiveEvents(
  events: GlobalEventDef[],
  epoch: number,
  tick: number,
): GlobalEventDef[] {
  const now = new Date(epoch + tick * MS_PER_TICK);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return events.filter((e) => {
    const isOneTime = /^\d{4}-\d{2}-\d{2}$/.test(e.start);

    const startYear = isOneTime ? 0 : today.getFullYear();
    const start = parseEventDate(e.start, startYear);

    // For recurring events: if start date this year has already passed,
    // check if we're still within last year's event
    if (!isOneTime && start > today) {
      start.setFullYear(start.getFullYear() - 1);
    }

    const endYear = isOneTime ? 0 : start.getFullYear();
    const end = parseEventDate(e.end, endYear);

    // end is inclusive — add one day for comparison
    const endExclusive = new Date(end);
    endExclusive.setDate(endExclusive.getDate() + 1);

    return today >= start && today < endExclusive;
  });
}
