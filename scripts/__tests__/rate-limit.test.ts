import { describe, it, expect } from "vitest";
import { RateLimitTracker } from "../src/rate-limit.js";

describe("RateLimitTracker", () => {
  it("starts with unknown budget until first update", () => {
    const tracker = new RateLimitTracker(500);
    expect(tracker.canContinue()).toBe(true);
  });

  it("returns true when remaining is above threshold", () => {
    const tracker = new RateLimitTracker(500);
    tracker.update({ limit: 5000, remaining: 4000, cost: 10, resetAt: "" });
    expect(tracker.canContinue()).toBe(true);
    expect(tracker.remaining).toBe(4000);
  });

  it("returns false when remaining drops below threshold", () => {
    const tracker = new RateLimitTracker(500);
    tracker.update({ limit: 5000, remaining: 400, cost: 10, resetAt: "" });
    expect(tracker.canContinue()).toBe(false);
  });

  it("returns false at exactly the threshold", () => {
    const tracker = new RateLimitTracker(500);
    tracker.update({ limit: 5000, remaining: 500, cost: 10, resetAt: "" });
    expect(tracker.canContinue()).toBe(false);
  });
});
