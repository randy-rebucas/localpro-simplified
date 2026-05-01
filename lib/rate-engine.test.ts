import { describe, expect, it } from "vitest";
import {
  billableHours,
  findRuleForJobTypeId,
  marginMetrics,
  roundMoney,
  suggestPrices,
} from "./rate-engine";

describe("roundMoney", () => {
  it("rounds to two decimal places", () => {
    expect(roundMoney(12.399)).toBe(12.4);
    expect(roundMoney(12.344)).toBe(12.34);
    expect(roundMoney(0)).toBe(0);
  });
});

describe("billableHours", () => {
  it("computes same-day span in hours", () => {
    expect(billableHours("09:00", "17:00")).toBe(8);
  });

  it("returns NaN when end is not after start", () => {
    expect(billableHours("17:00", "09:00")).toBeNaN();
    expect(billableHours("09:00", "09:00")).toBeNaN();
  });
});

describe("findRuleForJobTypeId", () => {
  const rules = [
    { job_type_id: "507f1f77bcf86cd799439011", client_hourly_rate: 10, worker_hourly_rate: 5 },
  ];

  it("matches by string id", () => {
    expect(findRuleForJobTypeId("507f1f77bcf86cd799439011", rules)?.client_hourly_rate).toBe(10);
  });

  it("returns null when missing or blank", () => {
    expect(findRuleForJobTypeId("507f1f77bcf86cd799439012", rules)).toBeNull();
    expect(findRuleForJobTypeId("  ", rules)).toBeNull();
  });
});

describe("suggestPrices", () => {
  const rule = { job_type_id: "x", client_hourly_rate: 100, worker_hourly_rate: 60 };

  it("returns nulls without a rule or invalid hours", () => {
    expect(suggestPrices(null, 2)).toEqual({ client_price: null, worker_pay: null });
    expect(suggestPrices(rule, NaN)).toEqual({ client_price: null, worker_pay: null });
    expect(suggestPrices(rule, 0)).toEqual({ client_price: null, worker_pay: null });
  });

  it("multiplies hours by hourly rates", () => {
    expect(suggestPrices(rule, 2)).toEqual({ client_price: 200, worker_pay: 120 });
  });
});

describe("marginMetrics", () => {
  it("computes margin amount and percentage of revenue", () => {
    const m = marginMetrics(100, 60);
    expect(m.margin_amount).toBe(40);
    expect(m.margin_pct).toBe(40);
  });

  it("returns null margin_pct when client price is zero", () => {
    const m = marginMetrics(0, 0);
    expect(m.margin_amount).toBe(0);
    expect(m.margin_pct).toBeNull();
  });
});
