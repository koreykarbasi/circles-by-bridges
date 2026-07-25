/**
 * Tests for suggestion cooldown logic:
 *  - C2 cooldown is 5 days (not 3)
 *  - isInCooldown boundaries
 *  - cooldownPool filter (same-day dismissals excluded)
 */

// suggestion-scheduler imports react-native (Platform) and AsyncStorage — mock both
jest.mock("react-native", () => ({ Platform: { OS: "web" } }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

import { CIRCLE_COOLDOWN_DAYS, isInCooldown, getDaysSinceLastSuggestedSync } from "../lib/suggestion-scheduler";

describe("CIRCLE_COOLDOWN_DAYS", () => {
  it("C1 = 7 days", () => expect(CIRCLE_COOLDOWN_DAYS[1]).toBe(7));
  it("C2 = 5 days (not 3)", () => expect(CIRCLE_COOLDOWN_DAYS[2]).toBe(5));
  it("C3 = 15 days", () => expect(CIRCLE_COOLDOWN_DAYS[3]).toBe(15));
});

describe("isInCooldown", () => {
  it("returns false when daysSince is null (never suggested)", () => {
    expect(isInCooldown(1, null)).toBe(false);
    expect(isInCooldown(2, null)).toBe(false);
    expect(isInCooldown(3, null)).toBe(false);
  });

  it("returns true on day 0 for all circles (swiped today)", () => {
    expect(isInCooldown(1, 0)).toBe(true);
    expect(isInCooldown(2, 0)).toBe(true);
    expect(isInCooldown(3, 0)).toBe(true);
  });

  describe("C2 (5-day window)", () => {
    it("day 1 → in cooldown", () => expect(isInCooldown(2, 1)).toBe(true));
    it("day 3 → still in cooldown (was exit point at old 3-day window)", () => expect(isInCooldown(2, 3)).toBe(true));
    it("day 4 → still in cooldown", () => expect(isInCooldown(2, 4)).toBe(true));
    it("day 5 → out of cooldown", () => expect(isInCooldown(2, 5)).toBe(false));
    it("day 6 → out of cooldown", () => expect(isInCooldown(2, 6)).toBe(false));
  });

  describe("C1 (7-day window)", () => {
    it("day 6 → in cooldown", () => expect(isInCooldown(1, 6)).toBe(true));
    it("day 7 → out of cooldown", () => expect(isInCooldown(1, 7)).toBe(false));
  });

  describe("C3 (15-day window)", () => {
    it("day 14 → in cooldown", () => expect(isInCooldown(3, 14)).toBe(true));
    it("day 15 → out of cooldown", () => expect(isInCooldown(3, 15)).toBe(false));
  });
});

describe("getDaysSinceLastSuggestedSync", () => {
  it("returns null for unknown contact", () => {
    expect(getDaysSinceLastSuggestedSync("unknown", {})).toBeNull();
  });

  it("returns 0 for contact suggested right now", () => {
    const dates = { a: new Date().toISOString() };
    expect(getDaysSinceLastSuggestedSync("a", dates)).toBe(0);
  });

  it("returns 2 for contact suggested 2 days ago", () => {
    const dates = { a: new Date(Date.now() - 2 * 86_400_000).toISOString() };
    expect(getDaysSinceLastSuggestedSync("a", dates)).toBe(2);
  });
});

describe("cooldownPool filter (same-day exclusion logic)", () => {
  // Mirrors the filter added to suggestions.tsx:
  //   daysSince === null || daysSince >= 1  → allowed in pool
  //   daysSince === 0                       → excluded from pool
  function appearsInCooldownPool(lastSuggestedIso: string | undefined): boolean {
    const dates: Record<string, string> = lastSuggestedIso ? { x: lastSuggestedIso } : {};
    const daysSince = getDaysSinceLastSuggestedSync("x", dates);
    return daysSince === null || daysSince >= 1;
  }

  it("never-suggested contact is allowed in pool", () => {
    expect(appearsInCooldownPool(undefined)).toBe(true);
  });

  it("contact swiped today (daysSince=0) is EXCLUDED from pool", () => {
    expect(appearsInCooldownPool(new Date().toISOString())).toBe(false);
  });

  it("contact swiped yesterday (daysSince=1) is allowed in pool", () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    expect(appearsInCooldownPool(yesterday)).toBe(true);
  });

  it("contact swiped 4 days ago is allowed in pool (cooldown, but not same-day)", () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 86_400_000).toISOString();
    expect(appearsInCooldownPool(fourDaysAgo)).toBe(true);
  });
});
