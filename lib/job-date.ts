/** Calendar-day parsing/storage helpers (local timezone, noon anchor). */

export function parseJobDateInput(input: unknown): Date {
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    const x = new Date(input);
    x.setHours(12, 0, 0, 0);
    return x;
  }

  const s = String(input ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (match) {
    const y = Number(match[1]);
    const mo = Number(match[2]);
    const d = Number(match[3]);
    return new Date(y, mo - 1, d, 12, 0, 0, 0);
  }

  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date");
  }
  parsed.setHours(12, 0, 0, 0);
  return parsed;
}

export function formatJobDay(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
