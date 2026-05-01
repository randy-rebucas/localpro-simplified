import { JobType } from "@/models/JobType";

export async function assertActiveJobType(job_type_id: string) {
  const jt = await JobType.findById(job_type_id).lean();
  if (!jt) return { ok: false as const, error: "Job type not found" };
  if (!jt.active) return { ok: false as const, error: "Job type is inactive" };
  return { ok: true as const, doc: jt };
}
