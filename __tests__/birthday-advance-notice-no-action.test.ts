/**
 * Regression guard: birthday advance-notice cards (7d, 14d, 30d) must NEVER
 * carry `actionType` or `suggestedMessage`.  Those fields are reserved for the
 * day-of card (daysUntil === 0) which drives the "Text" button in the UI.
 * A regression here would show a "Happy Birthday" Text button days before the
 * actual birthday.
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

/** Build a minimal Contact with the given birthday (MM/DD) and circle. */
function makeContact(
  id: string,
  circleLevel: 1 | 2 | 3,
  birthday: string,
): Contact {
  return {
    id,
    name: "Test Contact",
    circleLevel,
    interests: [],
    labels: [],
    avatarColor: "#aabbcc",
    birthday,
    // Set lastContacted recently so check-in reminders are suppressed
    lastContacted: "2024-03-14",
    createdAt: "2024-01-01",
    customReminders: [],
  };
}

/** Return only birthday-type reminders for a contact. */
function birthdayReminders(contact: Contact): Reminder[] {
  return generateReminders([contact]).filter((r) => r.type === "birthday");
}

// ── Day-of cards DO carry actionType + suggestedMessage ───────────────────────
//
// These tests establish the positive baseline: day-of cards (March 15 = today)
// must have actionType: "text" and a suggestedMessage.

describe("birthday day-of card — actionType and suggestedMessage present", () => {
  const BIRTHDAY_TODAY = "03/15"; // daysUntil === 0

  test("circle 1 day-of card has actionType 'text'", () => {
    const reminders = birthdayReminders(makeContact("c1-0d", 1, BIRTHDAY_TODAY));
    expect(reminders).toHaveLength(1);
    expect(reminders[0].actionType).toBe("text");
  });

  test("circle 1 day-of card has a suggestedMessage", () => {
    const reminders = birthdayReminders(makeContact("c1-0d", 1, BIRTHDAY_TODAY));
    expect(reminders[0].suggestedMessage).toBeDefined();
    expect(typeof reminders[0].suggestedMessage).toBe("string");
    expect(reminders[0].suggestedMessage!.length).toBeGreaterThan(0);
  });

  test("circle 2 day-of card has actionType 'text'", () => {
    const reminders = birthdayReminders(makeContact("c2-0d", 2, BIRTHDAY_TODAY));
    expect(reminders).toHaveLength(1);
    expect(reminders[0].actionType).toBe("text");
  });

  test("circle 2 day-of card has a suggestedMessage", () => {
    const reminders = birthdayReminders(makeContact("c2-0d", 2, BIRTHDAY_TODAY));
    expect(reminders[0].suggestedMessage).toBeDefined();
    expect(typeof reminders[0].suggestedMessage).toBe("string");
    expect(reminders[0].suggestedMessage!.length).toBeGreaterThan(0);
  });

  test("circle 3 day-of card has actionType 'text'", () => {
    const reminders = birthdayReminders(makeContact("c3-0d", 3, BIRTHDAY_TODAY));
    expect(reminders).toHaveLength(1);
    expect(reminders[0].actionType).toBe("text");
  });

  test("circle 3 day-of card has a suggestedMessage", () => {
    const reminders = birthdayReminders(makeContact("c3-0d", 3, BIRTHDAY_TODAY));
    expect(reminders[0].suggestedMessage).toBeDefined();
    expect(typeof reminders[0].suggestedMessage).toBe("string");
    expect(reminders[0].suggestedMessage!.length).toBeGreaterThan(0);
  });
});

// ── Circle 1 advance-notice cards ─────────────────────────────────────────────
//
// Circle 1 shows advance cards at 7d, 14d, and 30d.  None should carry
// actionType or suggestedMessage.

describe("circle 1 — 7-day advance card has no actionType or suggestedMessage", () => {
  // March 22 = 7 days from March 15
  const BIRTHDAY_7D = "03/22";

  test("no actionType on 7d advance card", () => {
    const reminders = birthdayReminders(makeContact("c1-7d", 1, BIRTHDAY_7D));
    expect(reminders).toHaveLength(1);
    expect(reminders[0].actionType).toBeUndefined();
  });

  test("no suggestedMessage on 7d advance card", () => {
    const reminders = birthdayReminders(makeContact("c1-7d", 1, BIRTHDAY_7D));
    expect(reminders[0].suggestedMessage).toBeUndefined();
  });

  test("7d advance card id uses birthday-7d prefix", () => {
    const reminders = birthdayReminders(makeContact("c1-7d", 1, BIRTHDAY_7D));
    expect(reminders[0].id).toMatch(/birthday-7d/);
  });
});

describe("circle 1 — 14-day advance card has no actionType or suggestedMessage", () => {
  // March 29 = 14 days from March 15
  const BIRTHDAY_14D = "03/29";

  test("no actionType on 14d advance card", () => {
    const reminders = birthdayReminders(makeContact("c1-14d", 1, BIRTHDAY_14D));
    expect(reminders).toHaveLength(1);
    expect(reminders[0].actionType).toBeUndefined();
  });

  test("no suggestedMessage on 14d advance card", () => {
    const reminders = birthdayReminders(makeContact("c1-14d", 1, BIRTHDAY_14D));
    expect(reminders[0].suggestedMessage).toBeUndefined();
  });

  test("14d advance card id uses birthday-14d prefix", () => {
    const reminders = birthdayReminders(makeContact("c1-14d", 1, BIRTHDAY_14D));
    expect(reminders[0].id).toMatch(/birthday-14d/);
  });
});

describe("circle 1 — 30-day advance card has no actionType or suggestedMessage", () => {
  // April 14 = 30 days from March 15
  const BIRTHDAY_30D = "04/14";

  test("no actionType on 30d advance card", () => {
    const reminders = birthdayReminders(makeContact("c1-30d", 1, BIRTHDAY_30D));
    expect(reminders).toHaveLength(1);
    expect(reminders[0].actionType).toBeUndefined();
  });

  test("no suggestedMessage on 30d advance card", () => {
    const reminders = birthdayReminders(makeContact("c1-30d", 1, BIRTHDAY_30D));
    expect(reminders[0].suggestedMessage).toBeUndefined();
  });

  test("30d advance card id uses birthday-30d prefix", () => {
    const reminders = birthdayReminders(makeContact("c1-30d", 1, BIRTHDAY_30D));
    expect(reminders[0].id).toMatch(/birthday-30d/);
  });
});

// ── Circle 2 advance-notice card ──────────────────────────────────────────────
//
// Circle 2 shows a single advance card at 7d only.

describe("circle 2 — 7-day advance card has no actionType or suggestedMessage", () => {
  // March 22 = 7 days from March 15
  const BIRTHDAY_7D = "03/22";

  test("no actionType on circle 2 7d advance card", () => {
    const reminders = birthdayReminders(makeContact("c2-7d", 2, BIRTHDAY_7D));
    expect(reminders).toHaveLength(1);
    expect(reminders[0].actionType).toBeUndefined();
  });

  test("no suggestedMessage on circle 2 7d advance card", () => {
    const reminders = birthdayReminders(makeContact("c2-7d", 2, BIRTHDAY_7D));
    expect(reminders[0].suggestedMessage).toBeUndefined();
  });

  test("circle 2 7d advance card id uses birthday-7d prefix", () => {
    const reminders = birthdayReminders(makeContact("c2-7d", 2, BIRTHDAY_7D));
    expect(reminders[0].id).toMatch(/birthday-7d/);
  });
});

// Circle 2 does not show 14d or 30d advance cards, so no further advance tests.

// ── Circle 3 does not produce advance-notice birthday cards ───────────────────
//
// Circle 3 only shows a birthday card on the day itself; a birthday 7 days
// away must produce zero birthday reminders.

describe("circle 3 — no advance birthday card at all", () => {
  const BIRTHDAY_7D = "03/22"; // 7 days away

  test("circle 3 produces no birthday reminders for a 7d advance birthday", () => {
    const reminders = birthdayReminders(makeContact("c3-7d", 3, BIRTHDAY_7D));
    expect(reminders).toHaveLength(0);
  });
});

// ── Boundary: 8 days out is still an advance card with no action ──────────────
//
// Ensures the guard applies even when daysUntil is not exactly 7/14/30 but
// still falls in the advance window (2–7 for circle 2; 2–30 for circle 1).

describe("boundary — 8-day birthday for circle 1 falls in 14d bucket", () => {
  // March 23 = 8 days from March 15 (lands in the 8–14d bucket for circle 1)
  const BIRTHDAY_8D = "03/23";

  test("no actionType on circle 1 birthday card 8 days away", () => {
    const reminders = birthdayReminders(makeContact("c1-8d", 1, BIRTHDAY_8D));
    expect(reminders).toHaveLength(1);
    expect(reminders[0].actionType).toBeUndefined();
  });

  test("no suggestedMessage on circle 1 birthday card 8 days away", () => {
    const reminders = birthdayReminders(makeContact("c1-8d", 1, BIRTHDAY_8D));
    expect(reminders[0].suggestedMessage).toBeUndefined();
  });
});
