/**
 * Medication plan schedule (the `schedule` jsonb on Medication, Notion §7).
 *
 * v1 supports fixed daily clock times in the Lar's local timezone:
 *   { times: ["08:00", "20:00"], daysOfWeek: [1,2,3,4,5,6,7] }
 * - times: "HH:MM" (24h), interpreted in `timeZone` (default Europe/Lisbon).
 * - daysOfWeek: ISO weekday 1=Mon..7=Sun; omitted = every day.
 * - no/empty times = PRN (as-needed) plan → scheduler materialises nothing.
 */
export interface MedicationSchedule {
  times?: string[];
  daysOfWeek?: number[];
}

const DEFAULT_TZ = 'Europe/Lisbon';
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Offset (local − UTC) in ms for `instant` in `timeZone`. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - instant.getTime();
}

/** UTC instant for a wall-clock time on a calendar day in `timeZone`. */
function wallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Two-pass to settle DST: offset can shift between the naive guess and the
  // real instant near a transition.
  const o1 = zoneOffsetMs(new Date(guess), timeZone);
  const o2 = zoneOffsetMs(new Date(guess - o1), timeZone);
  return new Date(guess - o2);
}

/**
 * UTC instant for 00:00 (local) of the calendar day that `instant` falls on in
 * `timeZone`. "Today" in the spec means the Lar's local day, not UTC — used for
 * the eMAR daily window so slots near local midnight aren't dropped.
 */
export function startOfDayInZone(instant: Date, timeZone: string = DEFAULT_TZ): Date {
  // en-CA formats as YYYY-MM-DD; gives the local calendar day.
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(instant)
    .split('-')
    .map(Number);
  return wallTimeToUtc(y, m, d, 0, 0, timeZone);
}

/** ISO weekday (1=Mon..7=Sun) for a UTC instant, as seen in `timeZone`. */
function isoWeekday(instant: Date, timeZone: string): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(instant);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[wd];
}

/**
 * All scheduled administration instants in [fromInclusive, toExclusive).
 * Pure — the caller clamps the window to the plan's start/end and the horizon.
 */
export function expandSchedule(
  schedule: MedicationSchedule,
  fromInclusive: Date,
  toExclusive: Date,
  timeZone: string = DEFAULT_TZ,
): Date[] {
  const times = (schedule.times ?? []).filter((t) => HHMM.test(t));
  if (times.length === 0) return [];
  const days = schedule.daysOfWeek;

  const slots: Date[] = [];
  // Over-generate one calendar day either side of the UTC window, then filter —
  // robust against the timezone offset shifting the local day boundary.
  const cursor = new Date(
    Date.UTC(
      fromInclusive.getUTCFullYear(),
      fromInclusive.getUTCMonth(),
      fromInclusive.getUTCDate(),
    ),
  );
  cursor.setUTCDate(cursor.getUTCDate() - 1);
  const end = new Date(
    Date.UTC(toExclusive.getUTCFullYear(), toExclusive.getUTCMonth(), toExclusive.getUTCDate()),
  );
  end.setUTCDate(end.getUTCDate() + 1);

  for (let d = cursor; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    for (const t of times) {
      const [hh, mm] = t.split(':').map(Number);
      const instant = wallTimeToUtc(y, m, day, hh, mm, timeZone);
      if (instant < fromInclusive || instant >= toExclusive) continue;
      if (days && !days.includes(isoWeekday(instant, timeZone))) continue;
      slots.push(instant);
    }
  }
  slots.sort((a, b) => a.getTime() - b.getTime());
  // De-dup (a day's slot can be generated from adjacent calendar iterations).
  return slots.filter((s, i) => i === 0 || s.getTime() !== slots[i - 1].getTime());
}
