/**
 * Tests for the 9am local-time gate applied to custom reminder day-of pushes.
 *
 * Goals (from task spec):
 *  1. Confirm that a custom reminder with daysUntil===0 produces a notification
 *     only when the user's local time is in the 9am window (isNineAmLocalNow).
 *  2. Confirm that advance-milestone custom reminders (7d, 14d, 30d) are NOT
 *     gated to 9am — they are delivered in any hourly run.
 *
 * Strategy:
 *  - Mock the database layer so no real PostgreSQL connection is opened.
 *  - Mock global `fetch` to intercept Expo push calls.
 *  - Use jest.useFakeTimers() / jest.setSystemTime() to control the clock.
 *  - Test `buildReminderMessages` (pure) for notifType assignment, then test
 *    `sendDailyReminders` (I/O path) for actual dispatch behaviour at 9am vs
 *    other hours.
 */

// ── Shared fake data ──────────────────────────────────────────────────────────

const FAKE_USER_ID = "user-abc-123";
const FAKE_CONTACT_ID = "contact-xyz-789";
const FAKE_PUSH_TOKEN = "ExponentPushToken[fake_token_abc]";

// Fixed "today" in tests: 2024-03-15 (March 15)
const TODAY_MONTH = 2; // 0-indexed March
const TODAY_DAY = 15;
const TODAY_YEAR = 2024;

// Custom reminder date strings relative to the fixed today
const DATE_TODAY = "03/15";      // daysUntil===0 → notifType "birthday" → 9am gated
const DATE_7D = "03/22";        // daysUntil===7  → notifType "milestone" → not gated
const DATE_14D = "03/29";       // daysUntil===14 → notifType "milestone" → not gated
const DATE_30D = "04/14";       // daysUntil===30 → notifType "milestone" → not gated

// ── DB mock helpers ───────────────────────────────────────────────────────────

function makeDbMock(contacts: object[]) {
  let callIdx = 0;
  const fakeUser = {
    id: FAKE_USER_ID,
    pushToken: FAKE_PUSH_TOKEN,
    notificationTimezone: "UTC", // UTC so Intl.DateTimeFormat hour === system hour
  };

  const where = jest.fn().mockImplementation(() => {
    callIdx += 1;
    // 1st call: users query → return the fake user
    // 2nd call: contacts query → return the provided contacts
    if (callIdx === 1) return Promise.resolve([fakeUser]);
    return Promise.resolve(contacts);
  });
  const from = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });

  return { select };
}

// pool.query mock: return empty sets for dedup (all msgs eligible) and
// handle pruning/logging with no-ops.
function makePoolMock() {
  return {
    query: jest.fn().mockImplementation((sql: string) => {
      // Dedup SELECT → empty result (nothing recently sent)
      if (typeof sql === "string" && sql.includes("SELECT")) {
        return Promise.resolve({ rows: [] });
      }
      // INSERT / DELETE → no-op
      return Promise.resolve({ rows: [] });
    }),
  };
}

// ── Jest module mocks (hoisted) ───────────────────────────────────────────────

jest.mock("../server/db", () => {
  const dbMockHolder = { db: null as any, pool: null as any };
  return dbMockHolder;
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
  buildReminderMessages,
  sendDailyReminders,
  type ContactRow,
} from "../server/push-notifications";

// Re-import the mocked module so we can mutate it per test
const dbModule = require("../server/db");

// ── Helper ───────────────────────────────────────────────────────────────────

function contact(overrides: Partial<ContactRow> & { id: string; circleLevel: number }): ContactRow {
  return {
    name: "Alice",
    birthday: null,
    lastContacted: null,
    lastHangout: null,
    customReminders: [],
    ...overrides,
  };
}

// ── Part 1: buildReminderMessages — pure function notifType checks ─────────────
//
// The 9am gate in sendDailyReminders is triggered by notifType === "birthday"
// on messages that come back from buildReminderMessages. These tests pin that
// contract so a future refactor cannot silently change the type assignment.

describe("buildReminderMessages — custom reminder notifType contract", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(TODAY_YEAR, TODAY_MONTH, TODAY_DAY, 12, 0, 0)); // noon
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Day-of (daysUntil===0) → notifType "birthday" (9am-gated) ────────────

  test("C1 custom reminder day-of produces notifType 'birthday' (9am gate applies)", () => {
    const c = contact({
      id: FAKE_CONTACT_ID,
      circleLevel: 1,
      birthday: null,
      lastContacted: "2024-03-14",
      customReminders: [{ label: "Anniversary", date: DATE_TODAY }],
    });
    const msgs = buildReminderMessages(c);
    const dayOf = msgs.filter((m) => m.title.includes("Anniversary") || m.body.includes("Anniversary"));
    expect(dayOf).toHaveLength(1);
    expect(dayOf[0].notifType).toBe("birthday");
    expect(dayOf[0].contactId).toBe(FAKE_CONTACT_ID);
  });

  test("C2 custom reminder day-of produces notifType 'birthday' (9am gate applies)", () => {
    const c = contact({
      id: FAKE_CONTACT_ID,
      circleLevel: 2,
      lastContacted: "2024-02-01",
      customReminders: [{ label: "Work anniversary", date: DATE_TODAY }],
    });
    const msgs = buildReminderMessages(c);
    const dayOf = msgs.filter((m) => m.body.includes("Work anniversary"));
    expect(dayOf).toHaveLength(1);
    expect(dayOf[0].notifType).toBe("birthday");
  });

  test("C3 custom reminder day-of produces notifType 'birthday' (9am gate applies)", () => {
    const c = contact({
      id: FAKE_CONTACT_ID,
      circleLevel: 3,
      lastContacted: "2024-01-01",
      customReminders: [{ label: "Friendiversary", date: DATE_TODAY }],
    });
    const msgs = buildReminderMessages(c);
    const dayOf = msgs.filter((m) => m.body.includes("Friendiversary"));
    expect(dayOf).toHaveLength(1);
    expect(dayOf[0].notifType).toBe("birthday");
  });

  // ── Advance milestones → notifType "milestone" (no 9am gate) ─────────────

  test("C1 custom reminder 7 days away produces notifType 'milestone' (not gated)", () => {
    const c = contact({
      id: FAKE_CONTACT_ID,
      circleLevel: 1,
      lastContacted: "2024-03-14",
      customReminders: [{ label: "Anniversary", date: DATE_7D }],
    });
    const msgs = buildReminderMessages(c);
    const advance = msgs.filter((m) => m.title.includes("Anniversary") || m.body.includes("Anniversary"));
    expect(advance).toHaveLength(1);
    expect(advance[0].notifType).toBe("milestone");
  });

  test("C1 custom reminder 14 days away produces notifType 'milestone' (not gated)", () => {
    const c = contact({
      id: FAKE_CONTACT_ID,
      circleLevel: 1,
      lastContacted: "2024-03-14",
      customReminders: [{ label: "Anniversary", date: DATE_14D }],
    });
    const msgs = buildReminderMessages(c);
    const advance = msgs.filter((m) => m.title.includes("Anniversary") || m.body.includes("Anniversary"));
    expect(advance).toHaveLength(1);
    expect(advance[0].notifType).toBe("milestone");
  });

  test("C1 custom reminder 30 days away produces notifType 'milestone' (not gated)", () => {
    const c = contact({
      id: FAKE_CONTACT_ID,
      circleLevel: 1,
      lastContacted: "2024-03-14",
      customReminders: [{ label: "Anniversary", date: DATE_30D }],
    });
    const msgs = buildReminderMessages(c);
    const advance = msgs.filter((m) => m.title.includes("Anniversary") || m.body.includes("Anniversary"));
    expect(advance).toHaveLength(1);
    expect(advance[0].notifType).toBe("milestone");
  });

  test("C2 custom reminder 7 days away produces notifType 'milestone' (not gated)", () => {
    const c = contact({
      id: FAKE_CONTACT_ID,
      circleLevel: 2,
      lastContacted: "2024-02-01",
      customReminders: [{ label: "Work anniversary", date: DATE_7D }],
    });
    const msgs = buildReminderMessages(c);
    const advance = msgs.filter((m) => m.body.includes("Work anniversary"));
    expect(advance).toHaveLength(1);
    expect(advance[0].notifType).toBe("milestone");
  });

  test("contact with both day-of and advance custom reminders: day-of is 'birthday', advance is 'milestone'", () => {
    const c = contact({
      id: FAKE_CONTACT_ID,
      circleLevel: 1,
      lastContacted: "2024-03-14",
      customReminders: [
        { label: "Big Day", date: DATE_TODAY },   // daysUntil===0 → birthday
        { label: "Big Day", date: DATE_7D },      // daysUntil===7  → milestone
      ],
    });
    const msgs = buildReminderMessages(c);
    const dayOf = msgs.find((m) => m.notifType === "birthday" && m.body.includes("Big Day"));
    const advance = msgs.find((m) => m.notifType === "milestone" && (m.title.includes("Big Day") || m.body.includes("Big Day")));
    expect(dayOf).toBeDefined();
    expect(advance).toBeDefined();
  });
});

// ── Part 2: sendDailyReminders — 9am gate dispatch behaviour ─────────────────
//
// These tests mock the full I/O path and verify that `sendDailyReminders`
// dispatches (or withholds) custom reminder day-of pushes based on local time.

describe("sendDailyReminders — custom reminder day-of gate", () => {
  let mockFetch: jest.Mock;

  const fakeContact = {
    id: FAKE_CONTACT_ID,
    userId: FAKE_USER_ID,
    name: "Alice",
    circleLevel: 1,
    birthday: null,
    lastContacted: "2024-03-14", // 1 day ago → not overdue (threshold > 17d)
    lastHangout: null,
    customReminders: [{ label: "Anniversary", date: DATE_TODAY }], // day-of today
  };

  beforeEach(() => {
    jest.useFakeTimers();

    // Fresh pool mock per test
    const pool = makePoolMock();

    // Fresh db mock per test (uses fresh callIdx)
    const db = makeDbMock([fakeContact]);
    dbModule.db = db;
    dbModule.pool = pool;

    // Mock global fetch so sendExpoPush never hits the network
    mockFetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("day-of custom reminder IS dispatched at 9am UTC", async () => {
    // 9:00 UTC on March 15 2024
    jest.setSystemTime(new Date(TODAY_YEAR, TODAY_MONTH, TODAY_DAY, 9, 0, 0));

    await sendDailyReminders();

    expect(mockFetch).toHaveBeenCalledWith(
      "https://exp.host/api/v2/push/send",
      expect.objectContaining({ method: "POST" }),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.title).toContain("Anniversary");
  });

  test("day-of custom reminder is NOT dispatched at 10am UTC (outside the 9am window)", async () => {
    jest.setSystemTime(new Date(TODAY_YEAR, TODAY_MONTH, TODAY_DAY, 10, 0, 0));

    await sendDailyReminders();

    // fetch should not have been called with a push for Anniversary
    const anniversaryCalls = mockFetch.mock.calls.filter((call) => {
      try {
        const b = JSON.parse(call[1]?.body ?? "{}");
        return b.title?.includes("Anniversary") || b.body?.includes("Anniversary");
      } catch {
        return false;
      }
    });
    expect(anniversaryCalls).toHaveLength(0);
  });

  test("day-of custom reminder is NOT dispatched at 8am UTC (one hour before the window)", async () => {
    jest.setSystemTime(new Date(TODAY_YEAR, TODAY_MONTH, TODAY_DAY, 8, 0, 0));

    await sendDailyReminders();

    const anniversaryCalls = mockFetch.mock.calls.filter((call) => {
      try {
        const b = JSON.parse(call[1]?.body ?? "{}");
        return b.title?.includes("Anniversary") || b.body?.includes("Anniversary");
      } catch {
        return false;
      }
    });
    expect(anniversaryCalls).toHaveLength(0);
  });

  test("day-of custom reminder is NOT dispatched at midnight UTC", async () => {
    jest.setSystemTime(new Date(TODAY_YEAR, TODAY_MONTH, TODAY_DAY, 0, 0, 0));

    await sendDailyReminders();

    const anniversaryCalls = mockFetch.mock.calls.filter((call) => {
      try {
        const b = JSON.parse(call[1]?.body ?? "{}");
        return b.title?.includes("Anniversary") || b.body?.includes("Anniversary");
      } catch {
        return false;
      }
    });
    expect(anniversaryCalls).toHaveLength(0);
  });
});

// ── Part 3: sendDailyReminders — advance milestones bypass the 9am gate ───────

describe("sendDailyReminders — advance milestone custom reminders are NOT gated to 9am", () => {
  let mockFetch: jest.Mock;

  const fakeContactWith7dReminder = {
    id: FAKE_CONTACT_ID,
    userId: FAKE_USER_ID,
    name: "Alice",
    circleLevel: 1,
    birthday: null,
    lastContacted: "2024-03-14",
    lastHangout: null,
    // 7 days away → notifType 'milestone' → NOT subject to 9am gate
    customReminders: [{ label: "Anniversary", date: DATE_7D }],
  };

  beforeEach(() => {
    jest.useFakeTimers();

    const pool = makePoolMock();
    const db = makeDbMock([fakeContactWith7dReminder]);
    dbModule.db = db;
    dbModule.pool = pool;

    mockFetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("7-day advance custom reminder IS dispatched at 10am (outside the 9am window)", async () => {
    // Not 9am — if the gate applied to milestones this would produce no push
    jest.setSystemTime(new Date(TODAY_YEAR, TODAY_MONTH, TODAY_DAY, 10, 0, 0));

    await sendDailyReminders();

    const anniversaryCalls = mockFetch.mock.calls.filter((call) => {
      try {
        const b = JSON.parse(call[1]?.body ?? "{}");
        return b.title?.includes("Anniversary") || b.body?.includes("Anniversary");
      } catch {
        return false;
      }
    });
    expect(anniversaryCalls).toHaveLength(1);
  });

  test("7-day advance custom reminder IS dispatched at 8am (before the 9am window)", async () => {
    jest.setSystemTime(new Date(TODAY_YEAR, TODAY_MONTH, TODAY_DAY, 8, 0, 0));

    await sendDailyReminders();

    const anniversaryCalls = mockFetch.mock.calls.filter((call) => {
      try {
        const b = JSON.parse(call[1]?.body ?? "{}");
        return b.title?.includes("Anniversary") || b.body?.includes("Anniversary");
      } catch {
        return false;
      }
    });
    expect(anniversaryCalls).toHaveLength(1);
  });

  test("7-day advance custom reminder IS dispatched at midnight", async () => {
    jest.setSystemTime(new Date(TODAY_YEAR, TODAY_MONTH, TODAY_DAY, 0, 0, 0));

    await sendDailyReminders();

    const anniversaryCalls = mockFetch.mock.calls.filter((call) => {
      try {
        const b = JSON.parse(call[1]?.body ?? "{}");
        return b.title?.includes("Anniversary") || b.body?.includes("Anniversary");
      } catch {
        return false;
      }
    });
    expect(anniversaryCalls).toHaveLength(1);
  });

  test("7-day advance custom reminder IS also dispatched at 9am (just confirming no suppression)", async () => {
    jest.setSystemTime(new Date(TODAY_YEAR, TODAY_MONTH, TODAY_DAY, 9, 0, 0));

    await sendDailyReminders();

    const anniversaryCalls = mockFetch.mock.calls.filter((call) => {
      try {
        const b = JSON.parse(call[1]?.body ?? "{}");
        return b.title?.includes("Anniversary") || b.body?.includes("Anniversary");
      } catch {
        return false;
      }
    });
    expect(anniversaryCalls).toHaveLength(1);
  });
});
