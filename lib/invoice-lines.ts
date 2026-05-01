import { formatJobDay } from "@/lib/job-date";

/** Line description shown on invoices (PHP MVP). */
export function descriptionForInvoiceLine(job: {
  date: Date;
  time_start: string;
  time_end: string;
  job_type_id?: unknown;
}): string {
  let label = "Job";
  const jt = job.job_type_id;
  if (jt && typeof jt === "object" && "label" in jt && typeof (jt as { label?: unknown }).label === "string") {
    label = (jt as { label: string }).label;
  }
  return `${label} — ${formatJobDay(job.date)} ${job.time_start}–${job.time_end}`;
}
