jest.mock("../server/db", () => ({ db: {}, pool: { query: jest.fn() } }));
import { isContactOnCooldown } from "../shared/contact-cooldown";
import { isCheckinQuickPickEligible } from "../shared/reminder-thresholds";
import { buildBirthdayDayOfMessages, buildReminderMessages, selectSuggestionPushCandidates } from "../server/push-notifications";
import { generateReminders } from "../lib/reminders";
import type { Contact } from "../lib/types";

describe("30-day contact notification cooldown", () => {
  const now = new Date("2026-11-12T12:00:00Z");
  const until = new Date("2026-12-12T12:00:00Z");
  const contact: Contact = {
    id: "cooled", userId: "user", name: "Test", circleLevel: 1,
    interests: [], labels: [], avatarColor: "#FF6B8A",
    lastContacted: "2025-01-01T12:00:00Z", birthday: "11/12",
    notificationsCooldownUntil: until.toISOString(),
    customReminders: [{ label: "Important", date: "11/12" }],
  };
  beforeEach(() => jest.useFakeTimers().setSystemTime(now));
  afterEach(() => jest.useRealTimers());

  test("expires by timestamp with no cleanup job", () => {
    expect(isContactOnCooldown(contact, now)).toBe(true);
    expect(isContactOnCooldown(contact, until)).toBe(false);
    expect(isContactOnCooldown({ notificationsCooldownUntil: null }, now)).toBe(false);
    expect(isContactOnCooldown({ notificationsCooldownUntil: "invalid" }, now)).toBe(false);
  });

  test("shared eligibility excludes cooldown in every circle and the never-contacted path", () => {
    for (const circle of [1, 2, 3, 4] as const) {
      expect(isCheckinQuickPickEligible(contact, circle, 999, 999, null, now)).toBe(false);
      expect(isCheckinQuickPickEligible(contact, circle, null, 999, "2020-01-01", now)).toBe(false);
      expect(isCheckinQuickPickEligible({ ...contact, notificationsCooldownUntil: null }, circle, 999, 999, null, now)).toBe(true);
    }
  });

  test("Home keeps birthdays and custom reminders, but not check-in quick-picks", () => {
    const reminders = generateReminders([contact]);
    expect(reminders.some(r => r.type === "check-in-quickpick")).toBe(false);
    expect(reminders.some(r => r.type === "birthday")).toBe(true);
    expect(reminders.some(r => r.type === "custom-reminder")).toBe(true);
  });

  const serverContact = {
    ...contact, createdAt: new Date("2020-01-01"), emptyLastContactPromptDueAt: null,
    notificationsCooldownUntil: until,
  } as Parameters<typeof buildReminderMessages>[0];

  test("server check-in messages obey the same exclusion without blocking birthdays or custom events", () => {
    const messages = buildReminderMessages(serverContact, "UTC");
    expect(messages.some(m => m.notifType === "reminder")).toBe(false);
    expect(messages.some(m => m.notifType === "custom")).toBe(true);
    expect(buildBirthdayDayOfMessages(serverContact, "UTC")).toHaveLength(1);
  });

  test("suggestion push candidate selection skips a cooled top contact even in the fallback path", () => {
    const cohort = [
      { ...serverContact, score: 9999, elevationPhase: "none" },
      { ...serverContact, id: "next", score: 9998, elevationPhase: "none", notificationsCooldownUntil: null },
    ] as Parameters<typeof selectSuggestionPushCandidates>[0];
    expect(selectSuggestionPushCandidates(cohort, "UTC", now).map(c => c.id)).toEqual(["next"]);
  });
});
