import { describe, expect, it } from "vitest";
import { rangesOverlap, timeToMinutes } from "./time-overlap";

describe("timeToMinutes", () => {
  it("parses HH:mm", () => {
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("00:00")).toBe(0);
  });

  it("returns NaN for invalid input", () => {
    expect(timeToMinutes("abc")).toBeNaN();
    expect(timeToMinutes("12:xx")).toBeNaN();
  });
});

describe("rangesOverlap", () => {
  it("detects overlap", () => {
    expect(rangesOverlap("09:00", "12:00", "11:00", "14:00")).toBe(true);
  });

  it("treats touching endpoints as non-overlapping", () => {
    expect(rangesOverlap("09:00", "12:00", "12:00", "14:00")).toBe(false);
    expect(rangesOverlap("12:00", "14:00", "09:00", "12:00")).toBe(false);
  });

  it("returns false when separated", () => {
    expect(rangesOverlap("09:00", "10:00", "11:00", "12:00")).toBe(false);
  });

  it("returns false when any bound is unparseable", () => {
    expect(rangesOverlap("bad", "12:00", "09:00", "11:00")).toBe(false);
  });
});
