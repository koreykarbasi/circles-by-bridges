import { initialLastContacted } from "../shared/checkin-policy";
import { CHECKIN_THRESHOLDS, isCheckinQuickPickEligible } from "../shared/reminder-thresholds";

describe("new Circle 4 starting last-contact dates", () => {
  const now = new Date("2026-11-12T12:00:00Z");
  const age = (date: string | null) => Math.round((now.getTime() - new Date(date!).getTime()) / 86400000);

  test("uses the inclusive 60–120 day boundaries without modifying the reference date", () => {
    expect(age(initialLastContacted(4, undefined, now, () => 0))).toBe(60);
    expect(age(initialLastContacted(4, undefined, now, () => 0.999999))).toBe(120);
    expect(now.toISOString()).toBe("2026-11-12T12:00:00.000Z");
  });

  test("five contacts added on one day can have spread-out starting dates", () => {
    const startingDates = [0, 0.25, 0.5, 0.75, 0.999999]
      .map(random => initialLastContacted(4, undefined, now, () => random));
    expect(startingDates.map(age)).toEqual([60, 75, 90, 105, 120]);
    expect(new Set(startingDates).size).toBe(5);
    expect(CHECKIN_THRESHOLDS[4]).toBe(320);
    expect(startingDates.map(date => 320 - age(date))).toEqual([260, 245, 230, 215, 200]);
    for (const date of startingDates) {
      expect(isCheckinQuickPickEligible({ id: "new", lastContacted: date }, 4, age(date), 0)).toBe(false);
    }
  });

  test("preserves any supplied date without sampling randomness", () => {
    const random = jest.fn();
    expect(initialLastContacted(4, "2026-10-01T12:00:00Z", now, random)).toBe("2026-10-01T12:00:00Z");
    expect(random).not.toHaveBeenCalled();
  });

  test("does not sample or change the unknown-date policy for Circles 1–3", () => {
    const random = jest.fn();
    for (const circle of [1, 2, 3] as const) {
      expect(initialLastContacted(circle, undefined, now, random)).toBeNull();
      expect(initialLastContacted(circle, "2026-10-01", now, random)).toBe("2026-10-01");
    }
    expect(random).not.toHaveBeenCalled();
  });

  test("a persisted starting date is preserved on subsequent use", () => {
    const sampled = initialLastContacted(4, null, now, () => 0.5);
    const random = jest.fn();
    expect(initialLastContacted(4, sampled, new Date("2027-01-01"), random)).toBe(sampled);
    expect(random).not.toHaveBeenCalled();
  });
});
