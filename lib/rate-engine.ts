import type { Types } from "mongoose";
import { timeToMinutes } from "@/lib/time-overlap";

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Duration in hours from HH:mm–HH:mm (same-day segment). */
export function billableHours(time_start: string, time_end: string): number {
  const ts = timeToMinutes(time_start);
  const te = timeToMinutes(time_end);
  if (!Number.isFinite(ts) || !Number.isFinite(te) || te <= ts) return NaN;
  return (te - ts) / 60;
}

export type RateRuleLike = {
  job_type_id: string | Types.ObjectId;
  client_hourly_rate: number;
  worker_hourly_rate: number;
};

export function findRuleForJobTypeId(
  jobTypeId: string,
  rules: RateRuleLike[],
): RateRuleLike | null {
  const key = jobTypeId.trim();
  if (!key) return null;
  return rules.find((r) => String(r.job_type_id) === key) ?? null;
}

export function suggestPrices(
  rule: RateRuleLike | null,
  hours: number,
): { client_price: number | null; worker_pay: number | null } {
  if (!rule || !Number.isFinite(hours) || hours <= 0) {
    return { client_price: null, worker_pay: null };
  }
  return {
    client_price: roundMoney(hours * rule.client_hourly_rate),
    worker_pay: roundMoney(hours * rule.worker_hourly_rate),
  };
}

/** Margin on revenue: (client − worker) / client when client > 0. */
export function marginMetrics(clientPrice: number, workerPay: number): {
  margin_amount: number;
  margin_pct: number | null;
} {
  const margin_amount = roundMoney(clientPrice - workerPay);
  const margin_pct =
    clientPrice > 0 && Number.isFinite(clientPrice)
      ? roundMoney((margin_amount / clientPrice) * 100)
      : null;
  return { margin_amount, margin_pct };
}
