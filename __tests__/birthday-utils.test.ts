import { getDaysUntilBirthday, getDaysSince } from "../server/birthday-utils";

// Pin "today" to a fixed local date for all tests: 2024-03-15 (a Friday)
const FIXED_TODAY = new Date(2024, 2, 15, 12, 0, 0); // March 15 2024, noon local time

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_TODAY);
});

afterEach(() => {
  jest.useRealTimers();
});

// ── Null / invalid inputs ────────────────────────────────────────────────────

describe("getDaysUntilBirthday — null / invalid inputs", () => {
  test("returns null for undefined", () => {
    expect(getDaysUntilBirthday(undefined)).toBeNull();
  });

  test("returns null for null", () => {
    expect(getDaysUntilBirthday(null)).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(getDaysUntilBirthday("")).toBeNull();
  });

  test("returns null for a completely unparseable string", () => {
    expect(getDaysUntilBirthday("not-a-date")).toBeNull();
  });

  test("returns null for out-of-range month (13)", () => {
    expect(getDaysUntilBirthday("13/01")).toBeNull();
  });

  test("returns null for out-of-range day (0)", () => {
    expect(getDaysUntilBirthday("01/00")).toBeNull();
  });

  test("returns null for out-of-range day (32)", () => {
    expect(getDaysUntilBirthday("01/32")).toBeNull();
  });

  test("returns null for a single-segment string", () => {
    expect(getDaysUntilBirthday("15")).toBeNull();
  });
});

// ── Day-of: birthday is today (should be 0) ──────────────────────────────────

describe("getDaysUntilBirthday — day-of birthday = 0", () => {
  // Fixed today: March 15 2024

  test("MM/DD today returns 0", () => {
    expect(getDaysUntilBirthday("03/15")).toBe(0);
  });

  test("MM/DD/YYYY today returns 0", () => {
    expect(getDaysUntilBirthday("03/15/1990")).toBe(0);
  });

  test("YYYY-MM-DD today returns 0", () => {
    expect(getDaysUntilBirthday("1990-03-15")).toBe(0);
  });
});

// ── Tomorrow: birthday is tomorrow (should be 1) ─────────────────────────────

describe("getDaysUntilBirthday — tomorrow = 1", () => {
  // Fixed today: March 15 → tomorrow: March 16

  test("MM/DD tomorrow returns 1", () => {
    expect(getDaysUntilBirthday("03/16")).toBe(1);
  });

  test("MM/DD/YYYY tomorrow returns 1", () => {
    expect(getDaysUntilBirthday("03/16/1985")).toBe(1);
  });

  test("YYYY-MM-DD tomorrow returns 1", () => {
    expect(getDaysUntilBirthday("1985-03-16")).toBe(1);
  });
});

// ── Future dates ─────────────────────────────────────────────────────────────

describe("getDaysUntilBirthday — future dates", () => {
  // Fixed today: March 15 2024

  test("7 days away returns 7 (MM/DD)", () => {
    // March 22
    expect(getDaysUntilBirthday("03/22")).toBe(7);
  });

  test("14 days away returns 14 (YYYY-MM-DD)", () => {
    // March 29
    expect(getDaysUntilBirthday("1990-03-29")).toBe(14);
  });

  test("30 days away returns 30 (MM/DD/YYYY)", () => {
    // April 14
    expect(getDaysUntilBirthday("04/14/1995")).toBe(30);
  });
});

// ── 364 days away (birthday was yesterday → wraps to next year) ──────────────

describe("getDaysUntilBirthday — 364 days away (day after today, year wrapped)", () => {
  // Fixed today: March 15 2024
  // March 14 was yesterday — birthday that passed wraps to 2025
  // From March 15 2024 to March 14 2025:
  //   2024 is a leap year → 366 days total in 2024
  //   March 15 to Dec 31 2024 = 291 days (366 - 75)
  //   Jan 1 to March 14 2025 = 73 days
  //   Total = 291 + 73 = 364 days

  test("birthday yesterday wraps to next year and returns 364 (leap year 2024)", () => {
    expect(getDaysUntilBirthday("03/14")).toBe(364);
  });

  test("YYYY-MM-DD format also returns 364 for birthday yesterday", () => {
    expect(getDaysUntilBirthday("1990-03-14")).toBe(364);
  });
});

// ── Leap day edge cases ──────────────────────────────────────────────────────

describe("getDaysUntilBirthday — leap day (Feb 29)", () => {
  // Fixed today: March 15 2024 (2024 is a leap year, so Feb 29 2024 already passed).
  // The function builds `new Date(2024, 1, 29)` = Feb 29 2024, sees it is in the past,
  // then calls `setFullYear(2025)`.  JavaScript's Date rolls Feb 29 → March 1 when
  // the target year has no Feb 29 (2025 is not a leap year).
  // Distance from March 15 2024 to March 1 2025:
  //   Mar 15→Mar 31: 16 days | Apr: 30 | May: 31 | Jun: 30 | Jul: 31 | Aug: 31
  //   Sep: 30 | Oct: 31 | Nov: 30 | Dec: 31 | Jan 2025: 31 | Feb 2025: 28 | Mar 1: 1
  //   Total: 351 days

  test("leap day (Feb 29) MM/DD format returns a positive value without throwing", () => {
    const result = getDaysUntilBirthday("02/29");
    expect(result).not.toBeNull();
    // Rolls to March 1 2025 — 351 days from March 15 2024
    expect(result).toBe(351);
  });

  test("leap day YYYY-MM-DD format returns the same result as MM/DD", () => {
    const mmdd = getDaysUntilBirthday("02/29");
    const iso = getDaysUntilBirthday("1992-02-29");
    expect(mmdd).toBe(iso);
  });
});

// ── UTC timezone-shift regression ────────────────────────────────────────────
//
// The old bug: `new Date("1990-03-15")` creates a UTC midnight Date, which in
// any timezone behind UTC (e.g. UTC-5) is the *previous* calendar day. This
// caused day-of birthdays to be reported as "1 day away" instead of 0.
// Verify the current implementation never falls into that trap.

describe("getDaysUntilBirthday — UTC midnight off-by-one regression", () => {
  // Fixed today: March 15 2024, noon local time.
  // new Date("1990-03-15") → UTC midnight March 15 → in UTC-5: March 14 23:00
  // The old implementation would compare that UTC timestamp to local noon and
  // return 1 instead of 0.  The correct implementation must return 0.

  test("YYYY-MM-DD birthday-today never returns 1 due to UTC midnight shift", () => {
    const result = getDaysUntilBirthday("1990-03-15");
    expect(result).toBe(0);
    expect(result).not.toBe(1);
  });

  test("using new Date(birthday) directly would have produced wrong result for ISO strings", () => {
    // This test documents the OLD buggy behaviour so we can see it was fixed.
    // If someone accidentally reverts to new Date(birthday), ISO strings parsed
    // as UTC would be off-by-one in negative UTC offset timezones.
    // We cannot force the timezone in Jest without extra packages, but we can
    // at least assert the new implementation uses calendar arithmetic (no UTC
    // Date object for the birthday).
    //
    // Approach: compare the result for YYYY-MM-DD vs MM/DD for the same date.
    // Both formats should return the same value because both avoid UTC parsing.
    const isoResult = getDaysUntilBirthday("1990-03-15");
    const slashResult = getDaysUntilBirthday("03/15");
    expect(isoResult).toBe(slashResult);
  });

  test("YYYY-MM-DD and MM/DD/YYYY agree for a future birthday", () => {
    const iso = getDaysUntilBirthday("1985-03-29");
    const slash = getDaysUntilBirthday("03/29/1985");
    expect(iso).toBe(slash);
    expect(iso).toBe(14);
  });

  test("YYYY-MM-DD and MM/DD agree across a month boundary", () => {
    // April 14 = 30 days away
    const iso = getDaysUntilBirthday("1990-04-14");
    const slash = getDaysUntilBirthday("04/14");
    expect(iso).toBe(slash);
    expect(iso).toBe(30);
  });
});

// ── getDaysSince ─────────────────────────────────────────────────────────────
//
// Fixed today: 2024-03-15 noon local time (same FIXED_TODAY as above).

describe("getDaysSince — null / invalid inputs", () => {
  test("returns null for undefined", () => {
    expect(getDaysSince(undefined)).toBeNull();
  });

  test("returns null for null", () => {
    expect(getDaysSince(null)).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(getDaysSince("")).toBeNull();
  });

  test("returns null for an unparseable string", () => {
    expect(getDaysSince("not-a-date")).toBeNull();
  });
});

describe("getDaysSince — today = 0", () => {
  // Fixed today: 2024-03-15

  test("YYYY-MM-DD today returns 0", () => {
    expect(getDaysSince("2024-03-15")).toBe(0);
  });

  test("MM/DD/YYYY today returns 0", () => {
    expect(getDaysSince("03/15/2024")).toBe(0);
  });
});

describe("getDaysSince — yesterday = 1", () => {
  // 2024-03-14 is one calendar day before 2024-03-15

  test("YYYY-MM-DD yesterday returns 1", () => {
    expect(getDaysSince("2024-03-14")).toBe(1);
  });

  test("MM/DD/YYYY yesterday returns 1", () => {
    expect(getDaysSince("03/14/2024")).toBe(1);
  });
});

describe("getDaysSince — one week ago = 7", () => {
  // 2024-03-08 is 7 calendar days before 2024-03-15

  test("YYYY-MM-DD one week ago returns 7", () => {
    expect(getDaysSince("2024-03-08")).toBe(7);
  });

  test("MM/DD/YYYY one week ago returns 7", () => {
    expect(getDaysSince("03/08/2024")).toBe(7);
  });
});

describe("getDaysSince — UTC midnight off-by-one regression", () => {
  // The old bug: `new Date("2024-03-15")` creates a UTC midnight Date.
  // In any timezone behind UTC (e.g. UTC-5) that resolves to local March 14
  // 23:00, making the date appear to be 1 day ago instead of 0.
  // The fixed implementation parses parts and uses new Date(year, month, day)
  // (local midnight), so today always returns 0 regardless of timezone offset.

  test("YYYY-MM-DD today never returns 1 due to UTC midnight shift", () => {
    const result = getDaysSince("2024-03-15");
    expect(result).toBe(0);
    expect(result).not.toBe(1);
  });

  test("YYYY-MM-DD and MM/DD/YYYY agree for the same date", () => {
    // If one used UTC parsing and the other didn't, they'd disagree at day boundaries.
    const iso = getDaysSince("2024-03-08");
    const slash = getDaysSince("03/08/2024");
    expect(iso).toBe(slash);
    expect(iso).toBe(7);
  });

  test("YYYY-MM-DD yesterday is exactly 1, not 0 or 2", () => {
    expect(getDaysSince("2024-03-14")).toBe(1);
  });
});
