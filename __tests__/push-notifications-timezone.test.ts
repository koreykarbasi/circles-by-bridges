/**
 * Unit tests for timezone-sensitive helper functions in push-notifications.ts:
 *   - getLocalHour(timezone)
 *   - isNineAmLocalNow(timezone)
 *   - getLocalDayOfWeek(timezone)
 *
 * Strategy:
 *  - Mock the database layer so Jest never opens a real PostgreSQL connection.
 *  - Mock drizzle-orm and shared/schema (referenced at module scope).
 *  - Use jest.useFakeTimers() + jest.setSystemTime() to pin the clock to a
 *    known UTC instant, then assert that the helpers return the correct local
 *    hour / day for several representative timezones.
 */

jest.mock("../server/db", () => ({
  db: {},
  pool: { query: jest.fn() },
}));

jest.mock("drizzle-orm", () => ({
  isNotNull: jest.fn(),
  eq: jest.fn(),
}));

jest.mock("../shared/schema", () => ({
  users: {},
  contacts: {},
  hangoutVotes: {},
  hangoutOptions: {},
  hangoutPlans: {},
}));

import {
  getLocalHour,
  getLocalDayOfWeek,
  isNineAmLocalNow,
} from "../server/push-notifications";

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Pin the system clock to a specific UTC date/time string. */
function setUtcTime(isoString: string) {
  jest.setSystemTime(new Date(isoString));
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

// ─── getLocalHour ─────────────────────────────────────────────────────────────

describe("getLocalHour", () => {
  describe("UTC", () => {
    it("returns 9 when it is 09:30 UTC", () => {
      setUtcTime("2024-06-15T09:30:00Z");
      expect(getLocalHour("UTC")).toBe(9);
    });

    it("returns 0 when it is 00:00 UTC (Intl may emit '24' for midnight — normalized to 0)", () => {
      setUtcTime("2024-06-15T00:00:00Z");
      expect(getLocalHour("UTC")).toBe(0);
    });

    it("returns 23 when it is 23:45 UTC", () => {
      setUtcTime("2024-06-15T23:45:00Z");
      expect(getLocalHour("UTC")).toBe(23);
    });
  });

  describe("America/New_York — DST (summer, UTC-4)", () => {
    it("returns 9 when UTC is 13:00 (09:00 EDT)", () => {
      // June 15 is comfortably in DST (EDT = UTC-4)
      setUtcTime("2024-06-15T13:00:00Z");
      expect(getLocalHour("America/New_York")).toBe(9);
    });

    it("returns 8 when UTC is 12:00 (08:00 EDT)", () => {
      setUtcTime("2024-06-15T12:00:00Z");
      expect(getLocalHour("America/New_York")).toBe(8);
    });

    it("returns 10 when UTC is 14:00 (10:00 EDT)", () => {
      setUtcTime("2024-06-15T14:00:00Z");
      expect(getLocalHour("America/New_York")).toBe(10);
    });
  });

  describe("America/New_York — non-DST (winter, UTC-5)", () => {
    it("returns 9 when UTC is 14:00 (09:00 EST)", () => {
      // January 15 is solidly outside DST (EST = UTC-5)
      setUtcTime("2024-01-15T14:00:00Z");
      expect(getLocalHour("America/New_York")).toBe(9);
    });

    it("returns 8 when UTC is 13:00 (08:00 EST)", () => {
      setUtcTime("2024-01-15T13:00:00Z");
      expect(getLocalHour("America/New_York")).toBe(8);
    });

    it("returns 10 when UTC is 15:00 (10:00 EST)", () => {
      setUtcTime("2024-01-15T15:00:00Z");
      expect(getLocalHour("America/New_York")).toBe(10);
    });
  });

  describe("Australia/Sydney — AEST (winter, UTC+10)", () => {
    it("returns 9 when UTC is 23:00 previous day (09:00 AEST)", () => {
      // June in Australia = AEST (no DST), UTC+10
      // 2024-06-14T23:00:00Z → 2024-06-15 09:00 AEST
      setUtcTime("2024-06-14T23:00:00Z");
      expect(getLocalHour("Australia/Sydney")).toBe(9);
    });

    it("returns 8 when UTC is 22:00 (08:00 AEST)", () => {
      setUtcTime("2024-06-14T22:00:00Z");
      expect(getLocalHour("Australia/Sydney")).toBe(8);
    });

    it("returns 10 when UTC is 00:00 (10:00 AEST)", () => {
      setUtcTime("2024-06-15T00:00:00Z");
      expect(getLocalHour("Australia/Sydney")).toBe(10);
    });
  });

  describe("invalid timezone — falls back to UTC hour", () => {
    it("returns the UTC hour when timezone is invalid", () => {
      setUtcTime("2024-06-15T09:00:00Z");
      expect(getLocalHour("Not/A/Timezone")).toBe(9);
    });
  });
});

// ─── isNineAmLocalNow ─────────────────────────────────────────────────────────

describe("isNineAmLocalNow", () => {
  describe("returns true only at the 9am hour", () => {
    it("returns true at 09:00 UTC for UTC timezone", () => {
      setUtcTime("2024-06-15T09:00:00Z");
      expect(isNineAmLocalNow("UTC")).toBe(true);
    });

    it("returns true at 09:59 UTC for UTC timezone", () => {
      setUtcTime("2024-06-15T09:59:00Z");
      expect(isNineAmLocalNow("UTC")).toBe(true);
    });

    it("returns false at 08:59 UTC for UTC timezone", () => {
      setUtcTime("2024-06-15T08:59:00Z");
      expect(isNineAmLocalNow("UTC")).toBe(false);
    });

    it("returns false at 10:00 UTC for UTC timezone", () => {
      setUtcTime("2024-06-15T10:00:00Z");
      expect(isNineAmLocalNow("UTC")).toBe(false);
    });
  });

  describe("returns false for all other hours in UTC", () => {
    const allHoursExceptNine = Array.from({ length: 24 }, (_, i) => i).filter(
      (h) => h !== 9
    );

    it.each(allHoursExceptNine)(
      "returns false at %i:00 UTC",
      (hour) => {
        const utcIso = `2024-06-15T${String(hour).padStart(2, "0")}:00:00Z`;
        setUtcTime(utcIso);
        expect(isNineAmLocalNow("UTC")).toBe(false);
      }
    );
  });

  describe("America/New_York — DST (UTC-4)", () => {
    it("returns true when UTC is 13:00 (09:00 EDT)", () => {
      setUtcTime("2024-06-15T13:00:00Z");
      expect(isNineAmLocalNow("America/New_York")).toBe(true);
    });

    it("returns false when UTC is 12:00 (08:00 EDT)", () => {
      setUtcTime("2024-06-15T12:00:00Z");
      expect(isNineAmLocalNow("America/New_York")).toBe(false);
    });

    it("returns false when UTC is 14:00 (10:00 EDT)", () => {
      setUtcTime("2024-06-15T14:00:00Z");
      expect(isNineAmLocalNow("America/New_York")).toBe(false);
    });
  });

  describe("America/New_York — non-DST (UTC-5)", () => {
    it("returns true when UTC is 14:00 (09:00 EST)", () => {
      setUtcTime("2024-01-15T14:00:00Z");
      expect(isNineAmLocalNow("America/New_York")).toBe(true);
    });

    it("returns false when UTC is 13:00 (08:00 EST)", () => {
      setUtcTime("2024-01-15T13:00:00Z");
      expect(isNineAmLocalNow("America/New_York")).toBe(false);
    });

    it("returns false when UTC is 15:00 (10:00 EST)", () => {
      setUtcTime("2024-01-15T15:00:00Z");
      expect(isNineAmLocalNow("America/New_York")).toBe(false);
    });
  });

  describe("Australia/Sydney — AEST (UTC+10)", () => {
    it("returns true when UTC is 23:00 prev day (09:00 AEST)", () => {
      setUtcTime("2024-06-14T23:00:00Z");
      expect(isNineAmLocalNow("Australia/Sydney")).toBe(true);
    });

    it("returns false when UTC is 22:00 (08:00 AEST)", () => {
      setUtcTime("2024-06-14T22:00:00Z");
      expect(isNineAmLocalNow("Australia/Sydney")).toBe(false);
    });

    it("returns false when UTC is 00:00 (10:00 AEST)", () => {
      setUtcTime("2024-06-15T00:00:00Z");
      expect(isNineAmLocalNow("Australia/Sydney")).toBe(false);
    });
  });
});

// ─── getLocalDayOfWeek ────────────────────────────────────────────────────────

describe("getLocalDayOfWeek", () => {
  /**
   * Reference Sunday: 2024-03-03T12:00:00Z
   * UTC          → Sunday (0)
   * America/New_York (EST, UTC-5) → 07:00 Sunday → 0
   * America/Los_Angeles (PST, UTC-8) → 04:00 Sunday → 0
   * Australia/Sydney (AEDT, UTC+11 in March) → 23:00 Sunday → 0
   *   (2024-03-03 12:00 UTC + 11h = 2024-03-03 23:00 AEDT — still Sunday)
   */
  const SUNDAY_UTC = "2024-03-03T12:00:00Z";

  describe("Sunday=0 across multiple timezones", () => {
    it("returns 0 (Sunday) in UTC", () => {
      setUtcTime(SUNDAY_UTC);
      expect(getLocalDayOfWeek("UTC")).toBe(0);
    });

    it("returns 0 (Sunday) in America/New_York (EST, UTC-5 in early March)", () => {
      // 12:00 UTC = 07:00 EST — still Sunday
      setUtcTime(SUNDAY_UTC);
      expect(getLocalDayOfWeek("America/New_York")).toBe(0);
    });

    it("returns 0 (Sunday) in America/Los_Angeles (PST, UTC-8 before DST)", () => {
      // 12:00 UTC = 04:00 PST — still Sunday
      setUtcTime(SUNDAY_UTC);
      expect(getLocalDayOfWeek("America/Los_Angeles")).toBe(0);
    });

    it("returns 0 (Sunday) in Australia/Sydney (AEDT UTC+11 in March)", () => {
      // 12:00 UTC = 23:00 AEDT — still Sunday
      setUtcTime(SUNDAY_UTC);
      expect(getLocalDayOfWeek("Australia/Sydney")).toBe(0);
    });
  });

  describe("day rollover at timezone boundaries", () => {
    it("returns 6 (Saturday) in America/New_York when UTC Sunday midnight rolls back to Saturday", () => {
      // 2024-03-03T00:30:00Z = 2024-03-02 19:30 EST (Saturday)
      setUtcTime("2024-03-03T00:30:00Z");
      expect(getLocalDayOfWeek("America/New_York")).toBe(6);
    });

    it("returns 1 (Monday) in Australia/Sydney when UTC Sunday late night rolls forward to Monday", () => {
      // 2024-03-03T13:30:00Z = 2024-03-04 00:30 AEDT (Monday)
      setUtcTime("2024-03-03T13:30:00Z");
      expect(getLocalDayOfWeek("Australia/Sydney")).toBe(1);
    });
  });

  describe("full week cycle in UTC", () => {
    const weekDays = [
      { name: "Sunday", iso: "2024-03-03T12:00:00Z", expected: 0 },
      { name: "Monday", iso: "2024-03-04T12:00:00Z", expected: 1 },
      { name: "Tuesday", iso: "2024-03-05T12:00:00Z", expected: 2 },
      { name: "Wednesday", iso: "2024-03-06T12:00:00Z", expected: 3 },
      { name: "Thursday", iso: "2024-03-07T12:00:00Z", expected: 4 },
      { name: "Friday", iso: "2024-03-08T12:00:00Z", expected: 5 },
      { name: "Saturday", iso: "2024-03-09T12:00:00Z", expected: 6 },
    ];

    it.each(weekDays)(
      "returns $expected for $name in UTC",
      ({ iso, expected }) => {
        setUtcTime(iso);
        expect(getLocalDayOfWeek("UTC")).toBe(expected);
      }
    );
  });

  describe("invalid timezone — falls back gracefully", () => {
    it("returns a valid day index (0-6) when timezone is invalid", () => {
      setUtcTime(SUNDAY_UTC);
      const day = getLocalDayOfWeek("Not/A/Real/Zone");
      expect(day).toBeGreaterThanOrEqual(0);
      expect(day).toBeLessThanOrEqual(6);
    });
  });
});
