import { initialLastContacted, promptDueAfterContactUpdate } from "../shared/checkin-policy";
import { isCheckinQuickPickEligible } from "../shared/reminder-thresholds";

describe("initial last-contact dates for newly added contacts", () => {
  const now = new Date("2026-11-12T12:00:00Z");
  const ages = [[1, 1, 7], [2, 1, 14], [3, 14, 35], [4, 60, 120]] as const;
  const daysAgo = (value: string) => Math.round((now.getTime() - new Date(value).getTime()) / 86400000);

  it.each(ages)("samples the inclusive range for Circle %i", (circle, min, max) => {
    expect(daysAgo(initialLastContacted(circle, undefined, now, () => 0))).toBe(min);
    expect(daysAgo(initialLastContacted(circle, undefined, now, () => 0.999999))).toBe(max);
    const sampled = Array.from({ length: 101 }, (_, index) =>
      daysAgo(initialLastContacted(circle, undefined, now, () => index / 101)));
    expect(Math.min(...sampled)).toBeGreaterThanOrEqual(min);
    expect(Math.max(...sampled)).toBeLessThanOrEqual(max);
    expect(new Set(sampled).size).toBe(max - min + 1);
    expect(now.toISOString()).toBe("2026-11-12T12:00:00.000Z");
  });

  it.each(ages)("preserves explicit dates and persisted starting values for Circle %i", circle => {
    const random = jest.fn();
    const value = "2026-09-01T12:00:00Z";
    expect(initialLastContacted(circle, value, now, random)).toBe(value);
    const sampled = initialLastContacted(circle, null, now, () => 0.5);
    expect(initialLastContacted(circle, sampled, new Date("2027-01-01"), random)).toBe(sampled);
    expect(random).not.toHaveBeenCalled();
  });

  it.each(ages)("assigns a date for all missing-value forms in Circle %i", circle => {
    for (const missing of [undefined, null, "", "   "]) {
      expect(initialLastContacted(circle, missing, now, () => 0.5)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it.each(ages)("starts Circle %i without an immediate check-in or missing-date prompt", circle => {
    const sampled = initialLastContacted(circle, undefined, now, () => 0.999999);
    expect(isCheckinQuickPickEligible({ id: "new-contact", lastContacted: sampled }, circle, daysAgo(sampled), 0)).toBe(false);
    expect(promptDueAfterContactUpdate({
      previousCircleLevel: circle,
      previousLastContacted: sampled,
      previousDueAt: null,
      nextCircleLevel: circle,
      nextLastContacted: sampled,
      now,
    })).toBeNull();
  });
});
