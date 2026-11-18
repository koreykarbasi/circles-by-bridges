import { calculateSocialHealth, socialHealthBand, type SocialHealthContact } from "../shared/social-health";
import { CHECKIN_THRESHOLDS } from "../shared/reminder-thresholds";

const now = new Date("2026-11-18T12:00:00Z");
const options = { now, timezone: "UTC" };
const contact = (circleLevel: number, days: number, extra: Partial<SocialHealthContact> = {}): SocialHealthContact => ({
  circleLevel, lastContacted: new Date(now.getTime() - days * 86400000), ...extra,
});

test("weights Close Friends twice as much as Friends and returns per-circle counts", () => {
  expect(calculateSocialHealth([contact(2, 0), contact(3, 200), contact(3, 200)], options)).toEqual({
    score: 50, circles: { 2: { total: 1, inRange: 1 }, 3: { total: 2, inRange: 0 } },
  });
});

test("rounds the weighted result to an integer", () => {
  expect(calculateSocialHealth([contact(2, 0), contact(2, 100), contact(3, 0), contact(3, 200)], options)?.score).toBe(50);
  expect(calculateSocialHealth([contact(2, 0), contact(3, 200), contact(3, 200), contact(3, 200)], options)?.score).toBe(40);
  expect(calculateSocialHealth([contact(3, 0), contact(3, 200), contact(3, 200)], options)?.score).toBe(33);
});

test("uses inclusive shared thresholds for both circles", () => {
  const result = calculateSocialHealth([
    contact(2, CHECKIN_THRESHOLDS[2]), contact(2, CHECKIN_THRESHOLDS[2] + 1),
    contact(3, CHECKIN_THRESHOLDS[3]), contact(3, CHECKIN_THRESHOLDS[3] + 1),
  ], options);
  expect(result).toEqual({ score: 50, circles: { 2: { total: 2, inRange: 1 }, 3: { total: 2, inRange: 1 } } });
});

test("excludes Circle 1, Acquaintances, missing/invalid dates, and active snoozes entirely", () => {
  const scored = [contact(2, 0), contact(3, 200), contact(3, 0)];
  expect(calculateSocialHealth([
    ...scored, contact(1, 1000), contact(4, 1000),
    contact(2, 0, { lastContacted: null }), contact(3, 0, { lastContacted: "invalid" }),
    contact(2, 0, { notificationsCooldownUntil: "2026-11-19T00:00:00Z" }),
  ], options)).toEqual(calculateSocialHealth(scored, options));
});

test.each([0, 1, 2])("returns null for %s scored contacts, regardless of unscored contacts", count => {
  expect(calculateSocialHealth([
    ...Array.from({ length: count }, () => contact(2, 0)),
    contact(1, 0), contact(4, 0), contact(2, 0, { notificationsCooldownUntil: "2027-01-01" }),
  ], options)).toBeNull();
});

test("expired snoozes count again and missing snooze state is backwards compatible", () => {
  expect(calculateSocialHealth([
    contact(2, 0, { notificationsCooldownUntil: now }), contact(3, 0), contact(3, 0),
  ], options)?.score).toBe(100);
});

test("calendar days, not elapsed 24-hour periods, determine eligibility in the chosen timezone", () => {
  const contacts = [
    { circleLevel: 2, lastContacted: "2026-10-04T03:30:00Z" },
    contact(3, 200), contact(3, 200),
  ];
  expect(calculateSocialHealth(contacts, { now, timezone: "UTC" })?.score).toBe(50);
  expect(calculateSocialHealth(contacts, { now, timezone: "America/Toronto" })?.score).toBe(0);
});

test("logging a catch-up changes the result immediately from the supplied contacts", () => {
  const people = [contact(2, 100), contact(3, 200), contact(3, 200)];
  expect(calculateSocialHealth(people, options)?.score).toBe(0);
  expect(calculateSocialHealth([{ ...people[0], lastContacted: now }, ...people.slice(1)], options)?.score).toBe(50);
});

test.each([[0, "danger"], [39, "danger"], [40, "warning"], [69, "warning"], [70, "success"], [100, "success"]])(
  "score %s has band %s", (score, band) => expect(socialHealthBand(score as number)).toBe(band),
);
