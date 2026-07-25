/**
 * Regression guard: custom-reminder cards (advance AND day-of) must NEVER
 * carry `actionType` or `suggestedMessage`.  Those fields drive the "Text"
 * button in the UI and are only appropriate for birthday day-of cards.
 *
 * Covered windows:
 *   Circle 1 — advance at 30d / 14d / 7d, plus day-of (0d)
 *   Circle 2 — advance at 7d, plus day-of (0d)
 *   Circle 3 — day-of (0d) only
 */

import { generateReminders, type Reminder } from "../lib/reminders";
import type { Contact } from "../lib/types";

// ── Fixed clock: 2024-03-15 (a Friday) noon local time ───────────────────────
const FIXED_TODAY = new Date(2024, 2, 15, 12, 0, 0); // March 15 2024

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_TODAY);
});

afterEach(() => {
  jest.useRealTimers();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal Contact with a single custom reminder on the given date (MM/DD)
 * and circle level.  Birthday is omitted so birthday reminders don't interfere.
 */
function makeContactWithCustomReminder(
  id: string,
  circleLevel: 1 | 2 | 3,
  customDate: string,
  label = "Work Anniversary",
): Contact {
  return {
    id,
    name: "Test Contact",
    circleLevel,
    interests: [],
    labels: [],
    avatarColor: "#aabbcc",
    // No birthday — prevents birthday reminders from mixing in
    birthday: undefined,
    lastContacted: "2024-03-14", // recent — suppresses check-in reminders
    createdAt: "2024-01-01",
    customReminders: [{ label, date: customDate }],
  };
}

/** Return only custom-reminder-type reminders for a contact. */
function customReminders(contact: Contact): Reminder[] {
  return generateReminders([contact]).filter((r) => r.type === "custom-reminder");
}

// ── Circle 1 — 30-day advance card ───────────────────────────────────────────

describe("circle 1 — 30-day advance custom-reminder card has no actionType or suggestedMessage", () => {
  // April 14 = 30 days from March 15
  const DATE_30D = "04/14";

  test("circle 1 30d custom-reminder advance card is produced", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c1-30d", 1, DATE_30D));
    expect(reminders).toHaveLength(1);
  });

  test("no actionType on circle 1 30d custom-reminder advance card", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c1-30d", 1, DATE_30D));
    expect(reminders[0].actionType).toBeUndefined();
  });

  test("no suggestedMessage on circle 1 30d custom-reminder advance card", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c1-30d", 1, DATE_30D));
    expect(reminders[0].suggestedMessage).toBeUndefined();
  });

  test("circle 1 30d card id uses -30d suffix", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c1-30d", 1, DATE_30D));
    expect(reminders[0].id).toMatch(/-30d$/);
  });
});

// ── Circle 1 — 14-day advance card ───────────────────────────────────────────

describe("circle 1 — 14-day advance custom-reminder card has no actionType or suggestedMessage", () => {
  // March 29 = 14 days from March 15
  const DATE_14D = "03/29";

  test("circle 1 14d custom-reminder advance card is produced", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c1-14d", 1, DATE_14D));
    expect(reminders).toHaveLength(1);
  });

  test("no actionType on circle 1 14d custom-reminder advance card", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c1-14d", 1, DATE_14D));
    expect(reminders[0].actionType).toBeUndefined();
  });

  test("no suggestedMessage on circle 1 14d custom-reminder advance card", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c1-14d", 1, DATE_14D));
    expect(reminders[0].suggestedMessage).toBeUndefined();
  });

  test("circle 1 14d card id uses -14d suffix", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c1-14d", 1, DATE_14D));
    expect(reminders[0].id).toMatch(/-14d$/);
  });
});

// ── Circle 1 — 7-day advance card ────────────────────────────────────────────

describe("circle 1 — 7-day advance custom-reminder card has no actionType or suggestedMessage", () => {
  // March 22 = 7 days from March 15
  const DATE_7D = "03/22";

  test("circle 1 7d custom-reminder advance card is produced", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c1-7d", 1, DATE_7D));
    expect(reminders).toHaveLength(1);
  });

  test("no actionType on circle 1 7d custom-reminder advance card", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c1-7d", 1, DATE_7D));
    expect(reminders[0].actionType).toBeUndefined();
  });

  test("no suggestedMessage on circle 1 7d custom-reminder advance card", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c1-7d", 1, DATE_7D));
    expect(reminders[0].suggestedMessage).toBeUndefined();
  });

  test("circle 1 7d card id uses -7d suffix", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c1-7d", 1, DATE_7D));
    expect(reminders[0].id).toMatch(/-7d$/);
  });
});

// ── Circle 1 — day-of card ────────────────────────────────────────────────────

describe("circle 1 — day-of custom-reminder card has no actionType or suggestedMessage", () => {
  // March 15 = today (daysUntil === 0)
  const DATE_TODAY = "03/15";

  test("circle 1 day-of custom-reminder card is produced", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c1-0d", 1, DATE_TODAY));
    expect(reminders).toHaveLength(1);
  });

  test("no actionType on circle 1 day-of custom-reminder card", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c1-0d", 1, DATE_TODAY));
    expect(reminders[0].actionType).toBeUndefined();
  });

  test("no suggestedMessage on circle 1 day-of custom-reminder card", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c1-0d", 1, DATE_TODAY));
    expect(reminders[0].suggestedMessage).toBeUndefined();
  });

  test("circle 1 day-of card id uses -0d suffix", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c1-0d", 1, DATE_TODAY));
    expect(reminders[0].id).toMatch(/-0d$/);
  });
});

// ── Circle 2 — 7-day advance card ────────────────────────────────────────────

describe("circle 2 — 7-day advance custom-reminder card has no actionType or suggestedMessage", () => {
  // March 22 = 7 days from March 15
  const DATE_7D = "03/22";

  test("circle 2 7d custom-reminder advance card is produced", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c2-7d", 2, DATE_7D));
    expect(reminders).toHaveLength(1);
  });

  test("no actionType on circle 2 7d custom-reminder advance card", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c2-7d", 2, DATE_7D));
    expect(reminders[0].actionType).toBeUndefined();
  });

  test("no suggestedMessage on circle 2 7d custom-reminder advance card", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c2-7d", 2, DATE_7D));
    expect(reminders[0].suggestedMessage).toBeUndefined();
  });
});

// ── Circle 2 — day-of card ────────────────────────────────────────────────────

describe("circle 2 — day-of custom-reminder card has no actionType or suggestedMessage", () => {
  const DATE_TODAY = "03/15";

  test("circle 2 day-of custom-reminder card is produced", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c2-0d", 2, DATE_TODAY));
    expect(reminders).toHaveLength(1);
  });

  test("no actionType on circle 2 day-of custom-reminder card", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c2-0d", 2, DATE_TODAY));
    expect(reminders[0].actionType).toBeUndefined();
  });

  test("no suggestedMessage on circle 2 day-of custom-reminder card", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c2-0d", 2, DATE_TODAY));
    expect(reminders[0].suggestedMessage).toBeUndefined();
  });
});

// ── Circle 3 — day-of card ────────────────────────────────────────────────────

describe("circle 3 — day-of custom-reminder card has no actionType or suggestedMessage", () => {
  const DATE_TODAY = "03/15";

  test("circle 3 day-of custom-reminder card is produced", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c3-0d", 3, DATE_TODAY));
    expect(reminders).toHaveLength(1);
  });

  test("no actionType on circle 3 day-of custom-reminder card", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c3-0d", 3, DATE_TODAY));
    expect(reminders[0].actionType).toBeUndefined();
  });

  test("no suggestedMessage on circle 3 day-of custom-reminder card", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c3-0d", 3, DATE_TODAY));
    expect(reminders[0].suggestedMessage).toBeUndefined();
  });
});

// ── Circle 3 — no advance cards at all ───────────────────────────────────────

describe("circle 3 — no custom-reminder cards for dates beyond day-of", () => {
  test("circle 3 produces no custom-reminder cards for a 7d advance date", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c3-7d", 3, "03/22"));
    expect(reminders).toHaveLength(0);
  });

  test("circle 3 produces no custom-reminder cards for a 30d advance date", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c3-30d", 3, "04/14"));
    expect(reminders).toHaveLength(0);
  });
});

// ── Boundary: 8 days out still produces an advance card with no action ────────

describe("boundary — 8-day custom reminder for circle 1 falls in 14d bucket", () => {
  // March 23 = 8 days from March 15
  const DATE_8D = "03/23";

  test("circle 1 produces a custom-reminder card 8 days out", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c1-8d", 1, DATE_8D));
    expect(reminders).toHaveLength(1);
  });

  test("no actionType on circle 1 custom-reminder card 8 days away", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c1-8d", 1, DATE_8D));
    expect(reminders[0].actionType).toBeUndefined();
  });

  test("no suggestedMessage on circle 1 custom-reminder card 8 days away", () => {
    const reminders = customReminders(makeContactWithCustomReminder("c1-8d", 1, DATE_8D));
    expect(reminders[0].suggestedMessage).toBeUndefined();
  });
});
