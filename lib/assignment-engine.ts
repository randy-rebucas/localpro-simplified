import mongoose from "mongoose";
import { Worker } from "@/models/Worker";
import { JobType } from "@/models/JobType";
import { Client } from "@/models/Client";
import { findTimeOverlapForWorker } from "@/lib/job-queries";
import { assertActiveJobType } from "@/lib/job-type-assert";
import { timeToMinutes } from "@/lib/time-overlap";
import { HttpError } from "@/lib/http-error";

export type AssignmentSuggestion = {
  id: string;
  full_name: string;
  skill: string;
  status: string;
  rating: number;
  rated_by_clients_avg: number | null;
  effective_rating: number;
  location: string;
  /** Preferred worker.skill from job type slug, when inferable. */
  preferred_skill: "cleaner" | "helper" | "technician" | null;
  skill_matches_job_type: boolean;
  breakdown: {
    location: number;
    skill: number;
    availability: number;
    rating: number;
  };
  score: number;
};

type PopulatedUser = { display_name?: string };

const MAX_DIM = 25;

function tokenSet(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2),
  );
}

/** Match client site vs worker base location (0–max). Uses substring + token Jaccard overlap. */
export function scoreLocationMatch(clientAddress: string, workerLocation: string, maxPts = MAX_DIM): number {
  const ca = clientAddress.trim();
  const wl = workerLocation.trim();
  if (!ca || !wl) return 0;
  const c = ca.toLowerCase();
  const w = wl.toLowerCase();
  if (w.length >= 3 && c.includes(w)) return maxPts;
  if (c.length >= 3 && w.includes(c)) return maxPts;
  const A = tokenSet(ca);
  const B = tokenSet(wl);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) {
    if (B.has(t)) inter += 1;
  }
  const union = A.size + B.size - inter;
  const j = union === 0 ? 0 : inter / union;
  return Math.round(j * maxPts);
}

function scoreSkillFit(
  workerSkill: string,
  preferred: "cleaner" | "helper" | "technician" | null,
  maxPts = MAX_DIM,
): { pts: number; matches: boolean } {
  if (!preferred) {
    return { pts: Math.round(maxPts / 2), matches: false };
  }
  const matches = workerSkill === preferred;
  return { pts: matches ? maxPts : 0, matches };
}

function scoreAvailability(status: string, maxPts = MAX_DIM): number {
  return status === "available" ? maxPts : Math.round(maxPts * 0.4);
}

function scoreRating(effectiveRating: number, maxPts = MAX_DIM): number {
  const r = Math.min(5, Math.max(1, effectiveRating));
  return Math.round(((r - 1) / 4) * maxPts);
}

/** Infer preferred worker.skill from job type slug heuristics (best-effort). */
export function preferredSkillFromJobTypeSlug(slug: string): "cleaner" | "helper" | "technician" | null {
  const s = slug.toLowerCase();
  if (/tech|repair|maint|hvac|elect|plumb|install/i.test(s)) return "technician";
  if (/help|assist|move|load|haul/i.test(s)) return "helper";
  if (/clean|maid|house|sanitize|janitorial|deep/i.test(s)) return "cleaner";
  return null;
}

/**
 * Rank workers for a calendar slot (overlap-free). Each eligible worker is scored on four dimensions
 * (each 0–25): **location** vs client address, **skill** vs inferred job-type preference,
 * **availability** status, and **rating** (job ★ when present, else ops rating).
 */
export async function suggestWorkersForSlot(params: {
  client_id: string;
  date: Date;
  time_start: string;
  time_end: string;
  job_type_id?: string | null;
  exclude_worker_ids?: string[];
  exclude_job_id?: mongoose.Types.ObjectId | null;
}): Promise<AssignmentSuggestion[]> {
  const {
    client_id,
    date,
    time_start,
    time_end,
    job_type_id,
    exclude_worker_ids = [],
    exclude_job_id,
  } = params;

  if (!mongoose.isValidObjectId(client_id)) {
    throw new HttpError(400, "Invalid client_id");
  }

  const clientDoc = await Client.findById(client_id).select("_id address").lean();
  if (!clientDoc) throw new HttpError(404, "Client not found");
  const clientAddress = String(clientDoc.address ?? "");

  const ts = timeToMinutes(time_start);
  const te = timeToMinutes(time_end);
  if (!Number.isFinite(ts) || !Number.isFinite(te) || te <= ts) {
    throw new HttpError(400, "time_end must be after time_start (HH:mm)");
  }

  let preferredSkill: ReturnType<typeof preferredSkillFromJobTypeSlug> = null;
  if (job_type_id != null && String(job_type_id).trim() !== "" && mongoose.isValidObjectId(String(job_type_id))) {
    const jtCheck = await assertActiveJobType(String(job_type_id));
    if (!jtCheck.ok) throw new HttpError(400, jtCheck.error);
    const jt = await JobType.findById(job_type_id).select("slug").lean();
    if (jt?.slug) preferredSkill = preferredSkillFromJobTypeSlug(String(jt.slug));
  }

  const excludeIds = new Set(
    exclude_worker_ids.filter((id) => mongoose.isValidObjectId(id)).map((id) => String(id)),
  );

  const workerFilter: Record<string, unknown> = { status: { $ne: "inactive" } };
  if (excludeIds.size > 0) {
    workerFilter._id = {
      $nin: [...excludeIds].map((id) => new mongoose.Types.ObjectId(id)),
    };
  }

  const workers = await Worker.find(workerFilter)
    .populate("user_id", "display_name")
    .select("user_id skill status rating rated_by_clients_avg location")
    .lean();

  const out: AssignmentSuggestion[] = [];

  for (const w of workers) {
    const wid = w._id as mongoose.Types.ObjectId;
    const overlap = await findTimeOverlapForWorker(
      wid,
      date,
      time_start,
      time_end,
      exclude_job_id ?? undefined,
      undefined,
    );
    if (overlap) continue;

    const u = w.user_id as mongoose.Types.ObjectId | PopulatedUser | undefined;
    let full_name = "";
    if (u && typeof u === "object" && "display_name" in u) {
      const dn = (u as PopulatedUser).display_name;
      full_name = typeof dn === "string" ? dn : "";
    }

    const skill = String(w.skill);
    const status = String(w.status);
    const rating = typeof w.rating === "number" ? w.rating : 3;
    const rated_by_clients_avg =
      typeof w.rated_by_clients_avg === "number" ? w.rated_by_clients_avg : null;
    const effective_rating = rated_by_clients_avg ?? rating;

    const workerLoc = String(w.location ?? "");

    const locationPts = scoreLocationMatch(clientAddress, workerLoc);
    const { pts: skillPts, matches: skill_matches_job_type } = scoreSkillFit(skill, preferredSkill);
    const availabilityPts = scoreAvailability(status);
    const ratingPts = scoreRating(effective_rating);

    const breakdown = {
      location: locationPts,
      skill: skillPts,
      availability: availabilityPts,
      rating: ratingPts,
    };
    const score = locationPts + skillPts + availabilityPts + ratingPts;

    out.push({
      id: wid.toString(),
      full_name: full_name.trim() || "Worker",
      skill,
      status,
      rating,
      rated_by_clients_avg,
      effective_rating,
      location: workerLoc,
      preferred_skill: preferredSkill,
      skill_matches_job_type,
      breakdown,
      score,
    });
  }

  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.full_name.localeCompare(b.full_name, undefined, { sensitivity: "base" });
  });

  return out;
}
