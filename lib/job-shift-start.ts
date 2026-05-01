import { formatJobDay } from "@/lib/job-date";

/** Local wall-clock start of shift from stored job date + `time_start` (HH:mm). */
export function combineJobShiftStart(jobDate: Date, timeStart: string): Date {
  const day = formatJobDay(jobDate);
  const [y, mo, d] = day.split("-").map(Number);
  const parts = String(timeStart).trim().split(":");
  const hh = Number(parts[0] ?? 0);
  const mm = Number(parts[1] ?? 0);
  return new Date(y, mo - 1, d, hh, mm, 0, 0);
}
