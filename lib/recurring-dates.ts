/** Calendar occurrence helpers for recurring bookings (local calendar, noon anchor). */

export function calendarDaysApart(anchor: Date, d: Date): number {
  const a = new Date(anchor);
  a.setHours(0, 0, 0, 0);
  const b = new Date(d);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function addDaysNoon(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  x.setHours(12, 0, 0, 0);
  return x;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

function nextMonthlyOccurrence(from: Date, dom: number): Date {
  const y = from.getFullYear();
  const m = from.getMonth();
  const nm = m + 1;
  const ny = nm > 11 ? y + 1 : y;
  const mon = nm % 12;
  const dim = daysInMonth(ny, mon);
  const day = Math.min(dom, dim);
  return new Date(ny, mon, day, 12, 0, 0, 0);
}

function firstMonthlyOnOrAfter(start: Date, dom: number): Date {
  const y = start.getFullYear();
  const m = start.getMonth();
  const dim = daysInMonth(y, m);
  const day = Math.min(dom, dim);
  const candidate = new Date(y, m, day, 12, 0, 0, 0);
  if (candidate >= start) return candidate;
  return nextMonthlyOccurrence(candidate, dom);
}

/** Dates (noon-local) for each occurrence from starts_on through `through`, respecting ends_on. */
export function occurrenceDatesInRange(params: {
  frequency: "weekly" | "biweekly" | "monthly";
  weekdays: number[];
  day_of_month: number | null;
  starts_on: Date;
  ends_on: Date | null;
  through: Date;
  /** If set, drop occurrences strictly before this calendar day (materialization horizon). */
  not_before?: Date | null;
}): Date[] {
  const { frequency, weekdays, day_of_month, starts_on, ends_on, through, not_before } = params;

  const start = new Date(starts_on);
  start.setHours(12, 0, 0, 0);

  const until = new Date(through);
  until.setHours(12, 0, 0, 0);

  let bound = until;
  if (ends_on) {
    const e = new Date(ends_on);
    e.setHours(12, 0, 0, 0);
    if (e < bound) bound = e;
  }

  const out: Date[] = [];

  if (frequency === "monthly") {
    if (day_of_month == null || day_of_month < 1 || day_of_month > 31) return [];
    let cur = firstMonthlyOnOrAfter(start, day_of_month);
    while (cur <= bound) {
      out.push(new Date(cur));
      cur = nextMonthlyOccurrence(cur, day_of_month);
    }
  } else {
    const weekdaySet = new Set(weekdays);
    let d = new Date(start);
    d.setHours(12, 0, 0, 0);

    while (d <= bound) {
      const dow = d.getDay();
      if (!weekdaySet.has(dow)) {
        d = addDaysNoon(d, 1);
        continue;
      }
      if (frequency === "weekly") {
        out.push(new Date(d));
      } else if (frequency === "biweekly") {
        const w = Math.floor(calendarDaysApart(start, d) / 7);
        if (w % 2 === 0) out.push(new Date(d));
      }
      d = addDaysNoon(d, 1);
    }
  }

  if (not_before) {
    const nb = new Date(not_before);
    nb.setHours(12, 0, 0, 0);
    return out.filter((d) => d >= nb);
  }
  return out;
}
