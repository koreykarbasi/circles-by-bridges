import {
  C3_CHECKIN_OPTIONS,
  dateForCheckinOption,
  emptyContactPromptDueAt,
  canSaveContactEdit,
  normalizeLastContacted,
  promptDueAfterContactUpdate,
  randomInclusive,
} from "../shared/checkin-policy";
import { getCheckinDaysSince } from "../shared/checkin-time";
import { isCheckinQuickPickEligible } from "../shared/reminder-thresholds";
import {
  LEGACY_C1_C2_MISSING_CREATED_AT_BACKFILL_SQL,
  LEGACY_C3_PROMPT_BACKFILL_SQL,
  legacyC3PromptDueAt,
  migrateEmptyContactPromptDueDates,
} from "../server/contact-prompt-rollout";
import {
  ELEVATION_DELAY_HOURS,
  elevationBonusForAge,
  shouldDeferSuggestion,
  shouldSuppressCheckin,
} from "../shared/suggestion-priority";
import { generateReminders } from "../lib/reminders";

describe("C3 check-in policy", () => {
  const now = new Date("2026-02-18T12:00:00.000Z");
  beforeAll(() => jest.useFakeTimers().setSystemTime(now));
  afterAll(() => jest.useRealTimers());

  test("uses the approved inclusive ranges", () => {
    expect(C3_CHECKIN_OPTIONS).toEqual([
      { label: "This month", minDaysAgo: 3, maxDaysAgo: 25 },
      { label: "This quarter", minDaysAgo: 35, maxDaysAgo: 75 },
      { label: "This year", minDaysAgo: 100, maxDaysAgo: 150 },
      { label: "Longer", minDaysAgo: 175, maxDaysAgo: 300 },
    ]);
    expect(randomInclusive(14, 30, () => 0)).toBe(14);
    expect(randomInclusive(14, 30, () => 0.999999)).toBe(30);
  });

  test("maps option boundaries to full calendar days", () => {
    const longer = C3_CHECKIN_OPTIONS[3];
    expect(dateForCheckinOption(longer, now, () => 0).toISOString()).toBe("2025-08-27T12:00:00.000Z");
    expect(dateForCheckinOption(longer, now, () => 0.999999).toISOString()).toBe("2025-04-24T12:00:00.000Z");
  });

  test("requires more than 160 full days for known C3 dates", () => {
    expect(isCheckinQuickPickEligible(3, 160, 999, null, now)).toBe(false);
    expect(isCheckinQuickPickEligible(3, 161, 0, null, now)).toBe(true);
  });

  test("uses persisted empty-contact due dates instead of createdAt", () => {
    expect(isCheckinQuickPickEligible(3, null, 999, "2026-02-18T11:59:59Z", now)).toBe(true);
    expect(isCheckinQuickPickEligible(3, null, 999, "2026-02-18T12:00:00Z", now)).toBe(false);
    expect(isCheckinQuickPickEligible(3, null, 999, null, now)).toBe(false);
  });

  test("keeps legacy C1/C2 createdAt grace fallback", () => {
    expect(isCheckinQuickPickEligible(1, null, 7, null, now)).toBe(false);
    expect(isCheckinQuickPickEligible(1, null, 8, null, now)).toBe(true);
    expect(isCheckinQuickPickEligible(2, null, 7, null, now)).toBe(false);
    expect(isCheckinQuickPickEligible(2, null, 8, null, now)).toBe(true);
    expect(isCheckinQuickPickEligible(2, null, null, null, now)).toBe(false);
    expect(isCheckinQuickPickEligible(2, null, null, "2026-02-18T11:00:00Z", now)).toBe(true);
  });

  test("anchors rollout to a fake first-production-start clock", () => {
    expect(legacyC3PromptDueAt(now, () => 0)).toEqual(emptyContactPromptDueAt(3, now, () => 0));
    expect(legacyC3PromptDueAt(now, () => 0.999999).toISOString()).toBe("2026-03-20T12:00:00.000Z");
    expect(LEGACY_C3_PROMPT_BACKFILL_SQL).toContain("CURRENT_TIMESTAMP");
    expect(LEGACY_C3_PROMPT_BACKFILL_SQL).toContain("empty_last_contact_prompt_due_at IS NULL");
    expect(LEGACY_C3_PROMPT_BACKFILL_SQL).toContain("NULLIF(BTRIM(last_contacted), '') IS NULL");
    expect(LEGACY_C1_C2_MISSING_CREATED_AT_BACKFILL_SQL).toContain("created_at IS NULL");
    expect(LEGACY_C1_C2_MISSING_CREATED_AT_BACKFILL_SQL).toContain("empty_last_contact_prompt_due_at IS NULL");
  });

  test("does not elevate C3 through any ranking path before 72 hours", () => {
    expect(ELEVATION_DELAY_HOURS[3]).toBe(72);
    expect(elevationBonusForAge(3, 71.999)).toBe(0);
    expect(elevationBonusForAge(3, 72)).toBe(1001);
    expect(elevationBonusForAge(3, 8 * 24)).toBe(0);
  });

  test("defers ordinary Home/Suggestions ranking but suppresses check-in for the full lifetime", () => {
    expect(shouldDeferSuggestion("c3", true, false, [])).toBe(true);
    expect(shouldDeferSuggestion("c3", false, false, ["c3"])).toBe(true);
    expect(shouldDeferSuggestion("c3", true, true, [])).toBe(false);
    expect(shouldSuppressCheckin("c3", false, ["c3"])).toBe(true);
    expect(shouldSuppressCheckin("c3", true, [])).toBe(true);
  });

  test("keeps check-in calendar ages aligned across UTC boundaries and DST", () => {
    const torontoNow = new Date("2025-03-10T03:30:00.000Z"); // Mar 9 locally
    expect(getCheckinDaysSince("2024-09-30T23:00:00.000Z", "America/Toronto", torontoNow)).toBe(160);
    expect(getCheckinDaysSince("2024-09-30T23:00:00.000Z", "UTC", torontoNow)).toBe(161);

    const kiritimatiNow = new Date("2025-03-09T11:00:00.000Z"); // Mar 10 locally
    expect(getCheckinDaysSince("2024-10-01T01:00:00.000Z", "Pacific/Kiritimati", kiritimatiNow)).toBe(160);
    expect(getCheckinDaysSince("2024-10-01T01:00:00.000Z", "UTC", kiritimatiNow)).toBe(159);
  });

  test("persists unknown-date schedules and recalculates only clears/circle changes", () => {
    expect(normalizeLastContacted("   ")).toBeNull();
    const originalDue = new Date("2026-03-01T12:00:00.000Z");
    expect(promptDueAfterContactUpdate({
      previousCircleLevel: 3,
      previousLastContacted: null,
      previousDueAt: originalDue,
      nextCircleLevel: 3,
      nextLastContacted: null,
      now,
      random: () => 0,
    })).toBe(originalDue);
    expect(promptDueAfterContactUpdate({
      previousCircleLevel: 2,
      previousLastContacted: null,
      previousDueAt: originalDue,
      nextCircleLevel: 3,
      nextLastContacted: null,
      now,
      random: () => 0,
    })?.toISOString()).toBe("2026-03-04T12:00:00.000Z");
    expect(promptDueAfterContactUpdate({
      previousCircleLevel: 3,
      previousLastContacted: "2026-02-01T12:00:00Z",
      previousDueAt: null,
      nextCircleLevel: 3,
      nextLastContacted: null,
      now,
      random: () => 0.999999,
    })?.toISOString()).toBe("2026-03-20T12:00:00.000Z");
    expect(promptDueAfterContactUpdate({
      previousCircleLevel: 3,
      previousLastContacted: null,
      previousDueAt: originalDue,
      nextCircleLevel: 1,
      nextLastContacted: "2026-02-02T12:00:00Z",
      now,
    })).toBeNull();
  });

  test("prevents stale edit PUTs while a quick-contact save is pending", () => {
    expect(canSaveContactEdit("Cam", false, true)).toBe(false);
    expect(canSaveContactEdit("Cam", false, false)).toBe(true);
  });

  test("integrates persisted C3 due dates with repeatable reminder generation", () => {
    const base = {
      id: "empty-c3",
      name: "Cam",
      circleLevel: 3,
      interests: [],
      labels: [],
      avatarColor: "#000",
      lastContacted: null,
      createdAt: "2020-01-01T00:00:00Z",
    };
    expect(generateReminders([{
      ...base,
      emptyLastContactPromptDueAt: "2026-02-19T12:00:00Z",
    }])).toHaveLength(0);
    expect(generateReminders([{
      ...base,
      emptyLastContactPromptDueAt: "2026-02-17T12:00:00Z",
    }]).some((reminder) => reminder.type === "check-in-quickpick")).toBe(true);
  });

  test("runs additive DDL in development but backfills only in production transactions", async () => {
    const poolQuery = jest.fn(async (_sql: string) => ({}));
    const clientQuery = jest.fn(async (_sql: string) => ({}));
    const release = jest.fn();
    const pool = {
      query: poolQuery,
      connect: jest.fn(async () => ({ query: clientQuery, release })),
    };
    await migrateEmptyContactPromptDueDates(pool, false);
    expect(poolQuery).toHaveBeenCalledWith(expect.stringContaining("ADD COLUMN IF NOT EXISTS"));
    expect(pool.connect).not.toHaveBeenCalled();

    await migrateEmptyContactPromptDueDates(pool, true);
    expect(clientQuery.mock.calls.map(([sql]) => sql.trim())).toEqual([
      "BEGIN",
      LEGACY_C1_C2_MISSING_CREATED_AT_BACKFILL_SQL.trim(),
      LEGACY_C3_PROMPT_BACKFILL_SQL.trim(),
      "COMMIT",
    ]);
    expect(release).toHaveBeenCalled();
  });
});