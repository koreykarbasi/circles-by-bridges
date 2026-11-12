import { getCheckinThreshold, isCheckinQuickPickEligible } from "../shared/reminder-thresholds";
import { generateReminders } from "../lib/reminders";
import type { Contact } from "../lib/types";

describe("Circle 1 spread-out check-ins", () => {
  const lastContacted = "2026-01-01T12:00:00.000Z";
  const contact = { id: "person-1", lastContacted };

  test("is deterministic and always an integer in the inclusive 30–90 range", () => {
    const values = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const c = { id: `person-${i}`, lastContacted };
      const threshold = getCheckinThreshold(1, c);
      expect(threshold).toBe(getCheckinThreshold(1, c));
      expect(Number.isInteger(threshold)).toBe(true);
      expect(threshold).toBeGreaterThanOrEqual(30);
      expect(threshold).toBeLessThanOrEqual(90);
      values.add(threshold);
    }
    expect(values.size).toBe(61);
  });

  test("uses both contact identity and the last-contact value", () => {
    const threshold = getCheckinThreshold(1, contact);
    expect(getCheckinThreshold(1, { ...contact, lastContacted: "2026-02-01T12:00:00.000Z" })).not.toBe(threshold);
    expect(new Set(Array.from({ length: 20 }, (_, i) =>
      getCheckinThreshold(1, { ...contact, id: `${i}` }))).size).toBeGreaterThan(1);
  });

  test("client and server predicate use the threshold, not the former 14-day rule", () => {
    const threshold = getCheckinThreshold(1, contact);
    expect(isCheckinQuickPickEligible(contact, 1, 15, 999)).toBe(false);
    expect(isCheckinQuickPickEligible(contact, 1, threshold, 999)).toBe(false);
    expect(isCheckinQuickPickEligible(contact, 1, threshold + 1, 999)).toBe(true);
  });

  test("keeps other circles and never-contacted paths unchanged", () => {
    expect(getCheckinThreshold(2, contact)).toBe(45);
    expect(getCheckinThreshold(3, contact)).toBe(160);
    expect(isCheckinQuickPickEligible({ id: "empty" }, 1, null, 7)).toBe(false);
    expect(isCheckinQuickPickEligible({ id: "empty" }, 1, null, 8)).toBe(true);
  });

  test("Home reminder eligibility and severity use the same per-contact interval", () => {
    const threshold = getCheckinThreshold(1, contact);
    jest.useFakeTimers().setSystemTime(new Date(lastContacted).getTime() + (threshold + 1) * 86400000);
    try {
      const reminders = generateReminders([{ ...contact, name: "Test", circleLevel: 1, interests: [], labels: [], avatarColor: "#FF6B8A" } as Contact]);
      expect(reminders.find(r => r.type === "check-in-quickpick")?.priority).toBe(133);
    } finally {
      jest.useRealTimers();
    }
  });
});
