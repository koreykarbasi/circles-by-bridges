/**
 * Tests for the 9am local-time gate applied to birthday day-of pushes.
 *
 * Goals (from task spec):
 *  1. Confirm that birthday day-of messages are only dispatched when the user's
 *     local time is in the 9am window (isNineAmLocalNow).
 *  2. Confirm that the gate works correctly for UTC users.
 *  3. Confirm that the gate works correctly for non-UTC users (Asia/Tokyo, UTC+9)
 *     who are far ahead of UTC — i.e. 9am JST = 00:00 UTC.
 *
 * Strategy:
 *  - Mock the database layer so no real PostgreSQL connection is opened.
 *  - Mock global `fetch` to intercept Expo push calls.
 *  - Use jest.useFakeTimers() / jest.setSystemTime() to control the clock.
 *  - Test `buildBirthdayDayOfMessages` (pure) for message production, then test
 *    `sendDailyReminders` (I/O path) for actual dispatch behaviour at 9am vs
 *    other hours.
 */

// ── Shared fake data ──────────────────────────────────────────────────────────

const FAKE_USER_ID = "user-birthday-gate-001";
const FAKE_CONTACT_ID = "contact-birthday-001";
const FAKE_PUSH_TOKEN = "ExponentPushToken[birthday_gate_test_token]";

// Fixed "today" in tests: 2024-03-15 (March 15)
const TODAY_YEAR = 2024;
const TODAY_MONTH = 2; // 0-indexed: March
const TODAY_DAY = 15;

// Birthday strings — MM/DD format (accepted by getDaysUntilBirthday)
const BIRTHDAY_TODAY = "03/15";    // daysUntil === 0 → birthday message
const BIRTHDAY_TOMORROW = "03/16"; // daysUntil === 1 → no birthday message

// ── DB mock helpers ───────────────────────────────────────────────────────────

function makeDbMockWithTz(contactList: object[], timezone: string) {
  let callIdx = 0;
  const fakeUser = {
    id: FAKE_USER_ID,
    pushToken: FAKE_PUSH_TOKEN,
    notificationTimezone: timezone,
  };

  const where = jest.fn().mockImplementation(() => {
    callIdx += 1;
    if (callIdx === 1) return Promise.resolve([fakeUser]);
    return Promise.resolve(contactList);
  });
  const from = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });

  return { select };
}

function makeDbMock(contactList: object[]) {
  return makeDbMockWithTz(contactList, "UTC");
}

// pool.query mock: empty dedup set (all messages eligible), no-op for inserts/deletes.
function makePoolMock() {
  return {
    query: jest.fn().mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.includes("SELECT")) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    }),
  };
}

// ── Jest module mocks (hoisted) ───────────────────────────────────────────────

jest.mock("../server/db", () => {
  const holder = { db: null as any, pool: null as any };
  return holder;
});

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

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import {
  buildBirthdayDayOfMessages,
  sendDailyReminders,
  type ContactRow,
} from "../server/push-notifications";

const dbModule = require("../server/db");

// ── Helper ────────────────────────────────────────────────────────────────────

function contact(overrides: Partial<ContactRow> & { id: string; circleLevel: number }): ContactRow {
  return {
    name: "Sam",
    birthday: null,
    lastContacted: null,
    lastHangout: null,
    customReminders: [],
    ...overrides,
  };
}

// Helper to extract birthday-related push calls from mock fetch.
function birthdayPushCalls(mockFetch: jest.Mock): any[] {
  return mockFetch.mock.calls.filter((call) => {
    try {
      const b = JSON.parse(call[1]?.body ?? "{}");
      return (
        b.title?.toLowerCase().includes("birthday") ||
        b.body?.toLowerCase().includes("birthday")
      );
    } catch {
      return false;
    }
  });
}

// ── Part 1: buildBirthdayDayOfMessages — pure function ───────────────────────
//
// Verifies the function produces the expected message only when daysUntil===0.

describe("buildBirthdayDayOfMessages — pure function", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(TODAY_YEAR, TODAY_MONTH, TODAY_DAY, 12, 0, 0)); // noon
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("Circle 1 contact with birthday today returns one birthday message", () => {
    const c = contact({ id: FAKE_CONTACT_ID, circleLevel: 1, birthday: BIRTHDAY_TODAY });
    const msgs = buildBirthdayDayOfMessages(c, "UTC");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].notifType).toBe("birthday");
    expect(msgs[0].contactId).toBe(FAKE_CONTACT_ID);
    expect(msgs[0].title.toLowerCase()).toContain("birthday");
  });

  test("Circle 2 contact with birthday today returns one birthday message", () => {
    const c = contact({ id: FAKE_CONTACT_ID, circleLevel: 2, birthday: BIRTHDAY_TODAY });
    const msgs = buildBirthdayDayOfMessages(c, "UTC");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].notifType).toBe("birthday");
    expect(msgs[0].contactId).toBe(FAKE_CONTACT_ID);
  });

  test("Circle 3 contact with birthday today returns one birthday message", () => {
    const c = contact({ id: FAKE_CONTACT_ID, circleLevel: 3, birthday: BIRTHDAY_TODAY });
    const msgs = buildBirthdayDayOfMessages(c, "UTC");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].notifType).toBe("birthday");
    expect(msgs[0].contactId).toBe(FAKE_CONTACT_ID);
  });

  test("Contact with birthday tomorrow returns no messages (daysUntil===1)", () => {
    const c = contact({ id: FAKE_CONTACT_ID, circleLevel: 1, birthday: BIRTHDAY_TOMORROW });
    const msgs = buildBirthdayDayOfMessages(c, "UTC");
    expect(msgs).toHaveLength(0);
  });

  test("Contact with no birthday returns no messages", () => {
    const c = contact({ id: FAKE_CONTACT_ID, circleLevel: 1, birthday: null });
    const msgs = buildBirthdayDayOfMessages(c, "UTC");
    expect(msgs).toHaveLength(0);
  });
});

// ── Part 2: sendDailyReminders — birthday 9am gate in UTC ────────────────────
//
// Verifies that sendDailyReminders dispatches birthday day-of pushes only during
// the 9am local window for users with timezone UTC.

describe("sendDailyReminders — birthday day-of gate (UTC user)", () => {
  let mockFetch: jest.Mock;

  const fakeContact = {
    id: FAKE_CONTACT_ID,
    userId: FAKE_USER_ID,
    name: "Sam",
    circleLevel: 1,
    birthday: BIRTHDAY_TODAY,
    lastContacted: "2024-03-14", // yesterday → not overdue (threshold > 17d)
    lastHangout: null,
    customReminders: [],
  };

  beforeEach(() => {
    jest.useFakeTimers();
    mockFetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("birthday push IS dispatched at 9am UTC", async () => {
    jest.setSystemTime(new Date(TODAY_YEAR, TODAY_MONTH, TODAY_DAY, 9, 0, 0));
    dbModule.db = makeDbMock([fakeContact]);
    dbModule.pool = makePoolMock();

    await sendDailyReminders();

    const calls = birthdayPushCalls(mockFetch);
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0][1].body);
    expect(body.title.toLowerCase()).toContain("birthday");
    expect(body.data?.contactId).toBe(FAKE_CONTACT_ID);
  });

  test("birthday push is NOT dispatched at 8am UTC (one hour before the window)", async () => {
    jest.setSystemTime(new Date(TODAY_YEAR, TODAY_MONTH, TODAY_DAY, 8, 0, 0));
    dbModule.db = makeDbMock([fakeContact]);
    dbModule.pool = makePoolMock();

    await sendDailyReminders();

    expect(birthdayPushCalls(mockFetch)).toHaveLength(0);
  });

  test("birthday push is NOT dispatched at 10am UTC (one hour after the window)", async () => {
    jest.setSystemTime(new Date(TODAY_YEAR, TODAY_MONTH, TODAY_DAY, 10, 0, 0));
    dbModule.db = makeDbMock([fakeContact]);
    dbModule.pool = makePoolMock();

    await sendDailyReminders();

    expect(birthdayPushCalls(mockFetch)).toHaveLength(0);
  });

  test("birthday push is NOT dispatched at midnight UTC", async () => {
    jest.setSystemTime(new Date(TODAY_YEAR, TODAY_MONTH, TODAY_DAY, 0, 0, 0));
    dbModule.db = makeDbMock([fakeContact]);
    dbModule.pool = makePoolMock();

    await sendDailyReminders();

    expect(birthdayPushCalls(mockFetch)).toHaveLength(0);
  });

  test("birthday push is NOT dispatched at 23:00 UTC (11pm)", async () => {
    jest.setSystemTime(new Date(TODAY_YEAR, TODAY_MONTH, TODAY_DAY, 23, 0, 0));
    dbModule.db = makeDbMock([fakeContact]);
    dbModule.pool = makePoolMock();

    await sendDailyReminders();

    expect(birthdayPushCalls(mockFetch)).toHaveLength(0);
  });
});

// ── Part 3: sendDailyReminders — 9am gate respects Asia/Tokyo (UTC+9) ────────
//
// Asia/Tokyo is JST = UTC+9, no DST. This is a timezone significantly ahead of
// UTC — the very scenario the task is designed to protect against.
//
//   9am JST = 00:00 UTC  → push MUST fire
//   9am UTC = 18:00 JST  → push must NOT fire (evening in Tokyo)
//   8am JST = 23:00 UTC previous day → push must NOT fire (still 8am in Tokyo)

describe("sendDailyReminders — birthday 9am gate respects Asia/Tokyo (UTC+9)", () => {
  let mockFetch: jest.Mock;

  const fakeContact = {
    id: FAKE_CONTACT_ID,
    userId: FAKE_USER_ID,
    name: "Sam",
    circleLevel: 1,
    birthday: BIRTHDAY_TODAY,
    lastContacted: "2024-03-14",
    lastHangout: null,
    customReminders: [],
  };

  beforeEach(() => {
    jest.useFakeTimers();
    mockFetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("birthday push IS dispatched at 00:00 UTC (= 9am JST, Asia/Tokyo)", async () => {
    // March 15, 2024 00:00 UTC = 09:00 JST (UTC+9)
    jest.setSystemTime(new Date(TODAY_YEAR, TODAY_MONTH, TODAY_DAY, 0, 0, 0));
    dbModule.db = makeDbMockWithTz([fakeContact], "Asia/Tokyo");
    dbModule.pool = makePoolMock();

    await sendDailyReminders();

    const calls = birthdayPushCalls(mockFetch);
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0][1].body);
    expect(body.title.toLowerCase()).toContain("birthday");
  });

  test("birthday push is NOT dispatched at 9:00 UTC (= 18:00 JST, evening in Asia/Tokyo)", async () => {
    // March 15, 2024 09:00 UTC = 18:00 JST (UTC+9) — local hour is 18, not 9
    jest.setSystemTime(new Date(TODAY_YEAR, TODAY_MONTH, TODAY_DAY, 9, 0, 0));
    dbModule.db = makeDbMockWithTz([fakeContact], "Asia/Tokyo");
    dbModule.pool = makePoolMock();

    await sendDailyReminders();

    expect(birthdayPushCalls(mockFetch)).toHaveLength(0);
  });

  test("birthday push is NOT dispatched at 23:00 UTC previous day (= 8am JST, one hour before window)", async () => {
    // March 14, 2024 23:00 UTC = March 15 08:00 JST (UTC+9) — local hour is 8, not 9
    // Note: the system clock is set to the day before at 23:00 UTC.
    // getDaysUntilBirthday reads new Date() which will see March 14 local time
    // in most TZs — but for Asia/Tokyo it is already March 15, so the birthday
    // still resolves to daysUntil===0. The 9am gate should block the push anyway.
    jest.setSystemTime(new Date(TODAY_YEAR, TODAY_MONTH, TODAY_DAY - 1, 23, 0, 0));
    dbModule.db = makeDbMockWithTz([fakeContact], "Asia/Tokyo");
    dbModule.pool = makePoolMock();

    await sendDailyReminders();

    expect(birthdayPushCalls(mockFetch)).toHaveLength(0);
  });

  test("birthday push is NOT dispatched at 15:00 UTC (= midnight JST, very early in Asia/Tokyo)", async () => {
    // March 15, 2024 15:00 UTC = March 16 00:00 JST (UTC+9) — local hour is 0, not 9
    jest.setSystemTime(new Date(TODAY_YEAR, TODAY_MONTH, TODAY_DAY, 15, 0, 0));
    dbModule.db = makeDbMockWithTz([fakeContact], "Asia/Tokyo");
    dbModule.pool = makePoolMock();

    await sendDailyReminders();

    expect(birthdayPushCalls(mockFetch)).toHaveLength(0);
  });
});

// ── Part 4: sendDailyReminders — 9am gate respects America/New_York (UTC-4) ──
//
// America/New_York in EDT (UTC-4, DST started March 10 2024):
//   9am EDT = 13:00 UTC → push MUST fire
//   9am UTC = 05:00 EDT → push must NOT fire (still early morning in NY)

describe("sendDailyReminders — birthday 9am gate respects America/New_York (UTC-4 EDT)", () => {
  let mockFetch: jest.Mock;

  const fakeContact = {
    id: FAKE_CONTACT_ID,
    userId: FAKE_USER_ID,
    name: "Sam",
    circleLevel: 2,
    birthday: BIRTHDAY_TODAY,
    lastContacted: "2024-03-14",
    lastHangout: null,
    customReminders: [],
  };

  beforeEach(() => {
    jest.useFakeTimers();
    mockFetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("birthday push IS dispatched at 13:00 UTC (= 9am EDT, America/New_York)", async () => {
    // March 15, 2024 13:00 UTC = 09:00 EDT (UTC-4)
    jest.setSystemTime(new Date(TODAY_YEAR, TODAY_MONTH, TODAY_DAY, 13, 0, 0));
    dbModule.db = makeDbMockWithTz([fakeContact], "America/New_York");
    dbModule.pool = makePoolMock();

    await sendDailyReminders();

    const calls = birthdayPushCalls(mockFetch);
    expect(calls).toHaveLength(1);
    const body = JSON.parse(calls[0][1].body);
    expect(body.title.toLowerCase()).toContain("birthday");
  });

  test("birthday push is NOT dispatched at 9:00 UTC (= 5am EDT, too early in America/New_York)", async () => {
    // March 15, 2024 09:00 UTC = 05:00 EDT (UTC-4) — local hour is 5, not 9
    jest.setSystemTime(new Date(TODAY_YEAR, TODAY_MONTH, TODAY_DAY, 9, 0, 0));
    dbModule.db = makeDbMockWithTz([fakeContact], "America/New_York");
    dbModule.pool = makePoolMock();

    await sendDailyReminders();

    expect(birthdayPushCalls(mockFetch)).toHaveLength(0);
  });
});
