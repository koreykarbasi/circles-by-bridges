import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";
import {
  C3_CHECKIN_OPTIONS, C4_CHECKIN_OPTIONS, dateForCheckinOption, initialLastContacted,
} from "../shared/checkin-policy";
import { getCheckinDaysSince } from "../shared/checkin-time";
import { getCheckinThreshold, isCheckinQuickPickEligible } from "../shared/reminder-thresholds";
import { formatContactLastContacted, formatLastContacted } from "../lib/helpers";
import { isReminderMonthDay, reachOutReminderDate } from "../shared/reach-out-reminder";
import { generateReminders } from "../lib/reminders";
import type { Contact } from "../lib/types";

const now = new Date(2026, 10, 18, 12);
beforeEach(() => { jest.useFakeTimers().setSystemTime(now); });
afterEach(() => jest.useRealTimers());
const daysAgo = (days: number) => {
  const result = new Date(now);
  result.setDate(result.getDate() - days);
  return result.toISOString();
};

test("Circle 4 options have the exact requested labels and inclusive ranges", () => {
  expect(C4_CHECKIN_OPTIONS).toEqual([
    { label: "Recently", minDaysAgo: 30, maxDaysAgo: 120 },
    { label: "Past Year", minDaysAgo: 121, maxDaysAgo: 300 },
    { label: "Years ago", minDaysAgo: 350, maxDaysAgo: 450 },
  ]);
  for (const option of C4_CHECKIN_OPTIONS) {
    const first = dateForCheckinOption(option, now, () => 0);
    const last = dateForCheckinOption(option, now, () => 0.99999999);
    expect(getCheckinDaysSince(first)).toBe(option.minDaysAgo);
    expect(getCheckinDaysSince(last)).toBe(option.maxDaysAgo);
  }
  expect(C3_CHECKIN_OPTIONS.map(o => o.label)).toEqual(["This month", "This quarter", "This year", "Longer"]);
});

test.each([
  [29, "This month"], [30, "Recently"], [120, "Recently"], [121, "Past Year"],
  [300, "Past Year"], [301, "Past Year"], [320, "Past Year"], [349, "Past Year"],
  [350, "Years ago"], [450, "Years ago"], [500, "Years ago"],
] as const)("Circle 4 card status at %i days is %s even with a stale saved label", (days, label) => {
  expect(formatContactLastContacted(4, daysAgo(days), "Longer")).toBe(label);
});

test("other circles retain their exact saved-label and fallback behavior", () => {
  for (const circle of [1, 2, 3]) {
    expect(formatContactLastContacted(circle, daysAgo(200), "Custom label")).toBe("Custom label");
    expect(formatContactLastContacted(circle, daysAgo(200))).toBe(formatLastContacted(daysAgo(200)));
  }
  expect(formatContactLastContacted(4, null, "Past Year")).toBe("Never");
  expect(formatContactLastContacted(4, daysAgo(0), "Years ago")).toBe("Today");
});

test("creation defaults remain 60–120, and Past Year choices stay below the unchanged threshold", () => {
  expect(getCheckinDaysSince(initialLastContacted(4, null, now, () => 0))).toBe(60);
  expect(getCheckinDaysSince(initialLastContacted(4, null, now, () => 0.999999))).toBe(120);
  expect(initialLastContacted(4, "2020-01-01", now, () => { throw new Error("must not sample"); })).toBe("2020-01-01");
  expect(getCheckinThreshold(4, { id: "contact" })).toBe(320);
  expect(isCheckinQuickPickEligible({ id: "contact" }, 4, 300, 999)).toBe(false);
  expect(isCheckinQuickPickEligible({ id: "contact" }, 4, 320, 999)).toBe(false);
  expect(isCheckinQuickPickEligible({ id: "contact" }, 4, 321, 999)).toBe(true);
});

test("manual creation and device imports continue through the existing server-side default", () => {
  const source = (file: string) => readFileSync(join(__dirname, "..", file), "utf8");
  for (const file of ["app/add-contact.tsx", "app/import-contacts.tsx"]) {
    expect(source(file)).toContain("await addContact({");
    expect(source(file)).toContain("lastContacted: undefined");
  }
  expect(source("lib/contacts-context.tsx")).toContain('apiRequest("POST", "/api/contacts", body)');
  expect(source("server/routes.ts")).toContain("initialLastContacted(level as 1 | 2 | 3 | 4, safe.lastContacted)");
});

test("reach-out shortcut samples 7 and 21 local calendar days, once, and stores existing MM/DD shape", () => {
  for (const [value, days] of [[0, 7], [0.9999999, 21]]) {
    const random = jest.fn(() => value);
    const result = reachOutReminderDate(now, random);
    const expected = new Date(now);
    expected.setDate(expected.getDate() + days);
    expect(result.scheduledFor).toEqual(expected);
    expect(result.reminder).toEqual({
      label: "Reach out",
      date: `${String(expected.getMonth() + 1).padStart(2, "0")}/${String(expected.getDate()).padStart(2, "0")}`,
    });
    expect(random).toHaveBeenCalledTimes(1);
  }
  expect(now).toEqual(new Date(2026, 10, 18, 12));
});

test.each(["America/Toronto", "Australia/Sydney"])("future reminder preserves the local day across DST/year changes in %s", timezone => {
  const output = execFileSync(process.execPath, ["--import", "tsx", "-e", `
    const { reachOutReminderDate } = require('./shared/reach-out-reminder.ts');
    const starts = [[2026,2,1], [2026,9,25], [2026,11,25]];
    console.log(JSON.stringify(starts.map(([y,m,d]) => {
      const now = new Date(y,m,d,23,45);
      const { scheduledFor, reminder } = reachOutReminderDate(now, () => 0.999999);
      const expected = new Date(y,m,d+21,23,45);
      return [scheduledFor.getTime() === expected.getTime(), reminder.date];
    })));
  `], { cwd: join(__dirname, ".."), env: { ...process.env, TZ: timezone }, encoding: "utf8" });
  expect(JSON.parse(output)).toEqual([[true, "03/22"], [true, "11/15"], [true, "01/15"]]);
});

test.each(["00/01", "13/01", "02/30", "04/31", "1/02", "2026-01-01"])("rejects invalid reminder date %s", value => {
  expect(isReminderMonthDay(value)).toBe(false);
});

test("reach-out reminder uses plain outreach copy, existing reminder type, and survives snooze", () => {
  const contact: Contact = {
    id: "alex", name: "Alex", circleLevel: 4, labels: [], interests: [], avatarColor: "#000",
    lastContacted: daysAgo(60), notificationsCooldownUntil: "2030-01-01",
    customReminders: [{ label: "Reach out", date: "11/18" }, { label: "Anniversary", date: "11/18" }],
  };
  const reminders = generateReminders([contact]);
  expect(reminders.find(r => r.title === "Reach out to Alex")).toMatchObject({
    type: "custom-reminder", subtitle: "Today", contactId: "alex",
  });
  expect(reminders.find(r => r.title === "Today is Alex's Anniversary")).toBeDefined();
  expect(reminders.find(r => r.title === "Reach out to Alex")).not.toHaveProperty("actionType");
});
