import { CHECKIN_THRESHOLDS, isCheckinQuickPickEligible } from "../shared/reminder-thresholds";
import { CIRCLE_LIMITS, isCircleLevel, visibleContactsForClient, homeCircleContacts } from "../shared/circles";
import { computeProfileCompletion } from "../lib/profile-completion";
import { generateReminders } from "../lib/reminders";
import type { Contact } from "../lib/types";
import { CIRCLE_COOLDOWN_DAYS, ELEVATION_SCORE_BONUS, ELEVATION_DELAY_HOURS, ELEVATION_LIFETIME_HOURS } from "../shared/suggestion-priority";

const contact: Contact = { id: "network", name: "Network", circleLevel: 4, interests: [], labels: [], avatarColor: "#FFB84D" };

test("Circle 4 never contributes an orbit or overflow contact to Home", () => {
  const inner = [1, 2, 3].map(circleLevel => ({ ...contact, id: `c${circleLevel}`, circleLevel }));
  expect(homeCircleContacts([...inner, ...Array.from({ length: 100 }, (_, i) => ({ ...contact, id: `n${i}` }))])).toEqual(inner);
  expect(homeCircleContacts([contact])).toEqual([]);
});

test("Circle 4 is valid with a 100-contact cap and 320-day check-in interval", () => {
  expect(isCircleLevel(4)).toBe(true);
  expect(isCircleLevel(5)).toBe(false);
  expect(CIRCLE_LIMITS[4]).toBe(100);
  expect(CHECKIN_THRESHOLDS[4]).toBe(320);
  expect(isCheckinQuickPickEligible(contact, 4, 320, 999)).toBe(false);
  expect(isCheckinQuickPickEligible(contact, 4, 321, 999)).toBe(true);
  expect(CIRCLE_COOLDOWN_DAYS[4]).toBe(30);
  expect(ELEVATION_SCORE_BONUS[4]).toBe(500);
  expect(ELEVATION_DELAY_HOURS[4]).toBe(96);
  expect(ELEVATION_LIFETIME_HOURS[4]).toBe(216);
});

test("legacy clients never receive Circle 4 in their contacts list", () => {
  const contacts = [{ ...contact, id: "core", circleLevel: 1 }, contact];
  expect(visibleContactsForClient(contacts).map(c => c.id)).toEqual(["core"]);
  expect(visibleContactsForClient(contacts, "1").map(c => c.id)).toEqual(["core"]);
  expect(visibleContactsForClient(contacts, "2").map(c => c.id)).toEqual(["core", "network"]);
});

test("Circle 4 never requires birthday or profile completion", () => {
  expect(computeProfileCompletion([contact]).incompleteAnyContact).toEqual([]);
  expect(generateReminders([contact]).filter(r => r.type === "birthday")).toEqual([]);
});

test("an existing Circle 4 birthday has only a day-of reminder", () => {
  jest.useFakeTimers().setSystemTime(new Date("2026-11-11T12:00:00"));
  try {
    expect(generateReminders([{ ...contact, birthday: "11/12" }]).filter(r => r.type === "birthday")).toHaveLength(0);
    const birthdays = generateReminders([{ ...contact, birthday: "11/11" }]).filter(r => r.type === "birthday");
    expect(birthdays).toHaveLength(1);
    expect(birthdays[0].circleLevel).toBe(4);
  } finally {
    jest.useRealTimers();
  }
});
