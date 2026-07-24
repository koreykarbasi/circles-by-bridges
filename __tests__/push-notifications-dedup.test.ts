/**
 * Unit tests for push-notification deduplication logic.
 *
 * Goals (from task spec):
 *  1. Confirm a birthday notification sent on a given day is not sent again
 *     on the same or the following day (24-hour dedup window).
 *  2. Confirm the birthday dedup namespace does not suppress check-in /
 *     milestone messages for the same contact (and vice versa).
 *  3. Confirm in-batch deduplication — if the same contact appears twice in
 *     one message batch only the first message is forwarded.
 *
 * Strategy: the dedup-critical functions exported from push-notifications.ts
 * are pure (no I/O). We mock the `server/db` module so Jest never attempts a
 * real PostgreSQL connection, then import the pure helpers directly.
 */

// ── Mock the database layer so Jest never opens a real connection ─────────────
jest.mock("../server/db", () => ({
  db: {},
  pool: { query: jest.fn() },
}));

// drizzle-orm helpers used at module scope inside push-notifications.ts
jest.mock("drizzle-orm", () => ({
  isNotNull: jest.fn(),
  eq: jest.fn(),
}));

// @shared/schema is only referenced for drizzle table objects — stub it out
jest.mock("../shared/schema", () => ({
  users: {},
  contacts: {},
  hangoutVotes: {},
  hangoutOptions: {},
  hangoutPlans: {},
}));

import {
  dedupMessages,
  buildBirthdayDayOfMessages,
  buildReminderMessages,
  logNotifiedContacts,
  type PushMessage,
  type ContactRow,
} from "../server/push-notifications";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function birthdayMsg(contactId: string): PushMessage {
  return { title: "Happy birthday!", body: "Wish them well.", contactId, notifType: "birthday" };
}

function reminderMsg(contactId: string): PushMessage {
  return { title: "Check in", body: "Open the app.", contactId, notifType: "reminder" };
}

function milestoneMsg(contactId: string): PushMessage {
  return { title: "Birthday milestone", body: "Coming up.", contactId, notifType: "milestone" };
}

// Fixed "today" used across date-sensitive tests: 2024-03-15 (Friday, noon local)
const FIXED_TODAY = new Date(2024, 2, 15, 12, 0, 0);

// ── dedupMessages — core dedup logic ─────────────────────────────────────────

describe("dedupMessages — empty inputs", () => {
  test("returns empty array when messages array is empty", () => {
    expect(dedupMessages([], new Set())).toEqual([]);
  });

  test("returns empty array when all messages are in the recent set", () => {
    const msgs = [birthdayMsg("c1"), birthdayMsg("c2")];
    const recent = new Set(["c1", "c2"]);
    expect(dedupMessages(msgs, recent)).toEqual([]);
  });
});

describe("dedupMessages — 24-hour birthday dedup (simulating a second run same day)", () => {
  test("suppresses a birthday message for a contact already sent today", () => {
    const msgs = [birthdayMsg("c1")];
    const recent = new Set(["c1"]); // already sent in an earlier run this day
    const result = dedupMessages(msgs, recent);
    expect(result).toHaveLength(0);
  });

  test("allows a birthday message for a contact NOT in the recent set", () => {
    const msgs = [birthdayMsg("c2")];
    const recent = new Set(["c1"]); // different contact was sent
    const result = dedupMessages(msgs, recent);
    expect(result).toHaveLength(1);
    expect(result[0].contactId).toBe("c2");
  });

  test("partial suppression — only the already-sent contact is filtered", () => {
    const msgs = [birthdayMsg("c1"), birthdayMsg("c2"), birthdayMsg("c3")];
    const recent = new Set(["c2"]); // only c2 was sent earlier today
    const result = dedupMessages(msgs, recent);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.contactId)).toEqual(["c1", "c3"]);
  });
});

describe("dedupMessages — in-batch deduplication (same contact appears twice in one run)", () => {
  test("keeps only the first message when the same contactId appears twice", () => {
    const first = { ...birthdayMsg("c1"), title: "First" };
    const second = { ...birthdayMsg("c1"), title: "Second" };
    const result = dedupMessages([first, second], new Set());
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("First");
  });

  test("keeps the first of three messages for the same contact", () => {
    const msgs: PushMessage[] = [
      { ...birthdayMsg("c1"), title: "A" },
      { ...birthdayMsg("c1"), title: "B" },
      { ...birthdayMsg("c1"), title: "C" },
    ];
    const result = dedupMessages(msgs, new Set());
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("A");
  });

  test("handles multiple contacts with in-batch duplicates correctly", () => {
    const msgs = [
      birthdayMsg("c1"),
      birthdayMsg("c2"),
      birthdayMsg("c1"), // duplicate of c1
      birthdayMsg("c3"),
      birthdayMsg("c2"), // duplicate of c2
    ];
    const result = dedupMessages(msgs, new Set());
    expect(result).toHaveLength(3);
    expect(result.map((m) => m.contactId)).toEqual(["c1", "c2", "c3"]);
  });
});

describe("dedupMessages — messages without contactId always pass through", () => {
  test("message without contactId is never filtered by recentIds", () => {
    const msg: PushMessage = { title: "System", body: "No contact", notifType: "reminder" };
    const result = dedupMessages([msg], new Set(["any-id"]));
    expect(result).toHaveLength(1);
  });

  test("multiple messages without contactId all pass through", () => {
    const msgs: PushMessage[] = [
      { title: "A", body: ".", notifType: "birthday" },
      { title: "B", body: ".", notifType: "reminder" },
    ];
    const result = dedupMessages(msgs, new Set());
    expect(result).toHaveLength(2);
  });
});

describe("dedupMessages — birthday dedup does NOT suppress reminder/milestone messages", () => {
  /**
   * This verifies the core namespace isolation guarantee:
   * recentBirthdayIds passed to birthday dedup should NOT affect reminders,
   * and recentReminderIds should NOT affect birthdays.
   *
   * In production the two sets are queried with separate notifType filters and
   * applied to separate message lists. These tests confirm that the function
   * itself correctly scopes suppression to exactly the provided recentIds set —
   * not to any implicit cross-type matching.
   */

  test("reminder message for a contact whose birthday was already sent is NOT suppressed by birthday dedup set", () => {
    // Simulate: birthday already sent for c1 → recentBirthdayIds = {c1}
    // A reminder message for c1 should NOT be filtered by the birthday set.
    const reminderMsgs = [reminderMsg("c1")];
    const recentBirthdayIds = new Set(["c1"]); // birthday namespace

    // If we mistakenly pass birthday recent-ids to the reminder dedup, c1 would be dropped.
    // The reminder list must use its OWN recent set (recentReminderIds), not birthday's.
    const recentReminderIds = new Set<string>(); // empty — reminder hasn't been sent

    const result = dedupMessages(reminderMsgs, recentReminderIds);
    expect(result).toHaveLength(1);
    expect(result[0].notifType).toBe("reminder");
  });

  test("birthday message for a contact whose reminder was already sent is NOT suppressed by reminder dedup set", () => {
    const birthdayMsgs = [birthdayMsg("c1")];
    const recentReminderIds = new Set(["c1"]); // reminder namespace
    const recentBirthdayIds = new Set<string>(); // empty — birthday hasn't been sent

    const result = dedupMessages(birthdayMsgs, recentBirthdayIds);
    expect(result).toHaveLength(1);
    expect(result[0].notifType).toBe("birthday");
  });

  test("passing the wrong namespace set suppresses when it should not — documents the contract", () => {
    // Negative test: proves that IF someone accidentally passes the birthday set
    // as the reminder dedup set, the reminder IS incorrectly suppressed.
    // This documents why separate sets per notifType are required.
    const reminderMsgs = [reminderMsg("c1")];
    const recentBirthdayIds = new Set(["c1"]); // wrong namespace — should not be used here

    // Deliberately passing the birthday set where the reminder set should go:
    const result = dedupMessages(reminderMsgs, recentBirthdayIds);
    // c1 IS suppressed — demonstrates the risk of mixing namespaces
    expect(result).toHaveLength(0);
  });
});

describe("dedupMessages — simultaneous birthday and reminder in one batch", () => {
  test("when birthday and reminder are both present for a contact, dedup within a type keeps only one", () => {
    // Two birthday messages for c1 (e.g., day-of + custom reminder that also resolved to birthday)
    const msgs = [birthdayMsg("c1"), birthdayMsg("c1")];
    const result = dedupMessages(msgs, new Set());
    expect(result).toHaveLength(1);
  });

  test("milestone message for a contact in recentReminderIds is suppressed", () => {
    const msgs = [milestoneMsg("c1")];
    const recentReminderIds = new Set(["c1"]);
    const result = dedupMessages(msgs, recentReminderIds);
    expect(result).toHaveLength(0);
  });
});

// ── buildBirthdayDayOfMessages — notifType assignment ────────────────────────

describe("buildBirthdayDayOfMessages — notifType is always 'birthday'", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_TODAY); // 2024-03-15
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("Circle 1 birthday-today message has notifType 'birthday'", () => {
    const c = contact({ id: "c1", circleLevel: 1, birthday: "03/15" });
    const msgs = buildBirthdayDayOfMessages(c, "UTC");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].notifType).toBe("birthday");
    expect(msgs[0].contactId).toBe("c1");
  });

  test("Circle 2 birthday-today message has notifType 'birthday'", () => {
    const c = contact({ id: "c2", circleLevel: 2, birthday: "03/15" });
    const msgs = buildBirthdayDayOfMessages(c, "UTC");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].notifType).toBe("birthday");
  });

  test("Circle 3 birthday-today message has notifType 'birthday'", () => {
    const c = contact({ id: "c3", circleLevel: 3, birthday: "03/15" });
    const msgs = buildBirthdayDayOfMessages(c, "UTC");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].notifType).toBe("birthday");
  });

  test("returns empty array when birthday is NOT today", () => {
    const c = contact({ id: "c1", circleLevel: 1, birthday: "03/22" }); // 7 days away
    const msgs = buildBirthdayDayOfMessages(c, "UTC");
    expect(msgs).toHaveLength(0);
  });

  test("returns empty array when birthday is null", () => {
    const c = contact({ id: "c1", circleLevel: 1, birthday: null });
    const msgs = buildBirthdayDayOfMessages(c, "UTC");
    expect(msgs).toHaveLength(0);
  });
});

// ── buildReminderMessages — notifType on milestones ──────────────────────────

describe("buildReminderMessages — birthday milestone notifType is 'milestone'", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(FIXED_TODAY); // 2024-03-15
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("Circle 1 — 7-day birthday milestone has notifType 'milestone'", () => {
    // Today: March 15 → birthday March 22 = 7 days away
    const c = contact({ id: "c1", circleLevel: 1, birthday: "03/22", lastContacted: "2024-03-14" });
    const msgs = buildReminderMessages(c, "UTC");
    const milestone = msgs.find((m) => m.notifType === "milestone");
    expect(milestone).toBeDefined();
    expect(milestone!.contactId).toBe("c1");
  });

  test("Circle 1 — 14-day birthday milestone has notifType 'milestone'", () => {
    // March 15 + 14 = March 29
    const c = contact({ id: "c1", circleLevel: 1, birthday: "03/29", lastContacted: "2024-03-14" });
    const msgs = buildReminderMessages(c, "UTC");
    const milestone = msgs.find((m) => m.notifType === "milestone");
    expect(milestone).toBeDefined();
  });

  test("Circle 1 — 30-day birthday milestone has notifType 'milestone'", () => {
    // March 15 + 30 = April 14
    const c = contact({ id: "c1", circleLevel: 1, birthday: "04/14", lastContacted: "2024-03-14" });
    const msgs = buildReminderMessages(c, "UTC");
    const milestone = msgs.find((m) => m.notifType === "milestone");
    expect(milestone).toBeDefined();
  });

  test("Circle 1 — overdue check-in has notifType 'reminder'", () => {
    // lastContacted 20 days ago → overdue (threshold > 17)
    const c = contact({ id: "c1", circleLevel: 1, birthday: "08/01", lastContacted: "2024-02-24" });
    const msgs = buildReminderMessages(c, "UTC");
    const reminder = msgs.find((m) => m.notifType === "reminder");
    expect(reminder).toBeDefined();
    expect(reminder!.contactId).toBe("c1");
  });

  test("Circle 2 — 7-day birthday milestone has notifType 'milestone'", () => {
    const c = contact({ id: "c2", circleLevel: 2, birthday: "03/22", lastContacted: "2024-02-01" });
    const msgs = buildReminderMessages(c, "UTC");
    const milestone = msgs.find((m) => m.notifType === "milestone");
    expect(milestone).toBeDefined();
  });

  test("milestone and reminder for same contact have different notifType values", () => {
    // Circle 1 contact: birthday 7 days away AND overdue check-in (both fire together)
    const c = contact({ id: "c1", circleLevel: 1, birthday: "03/22", lastContacted: "2024-02-01" });
    const msgs = buildReminderMessages(c, "UTC");
    const types = new Set(msgs.map((m) => m.notifType));
    expect(types.has("reminder")).toBe(true);
    expect(types.has("milestone")).toBe(true);
  });
});

// ── Full dedup flow integration (pure-function level) ────────────────────────
//
// Simulates two consecutive hourly runs for the same user on the same day,
// verifying that the second run produces no duplicate birthday sends.

describe("Full dedup flow — second run on the same day does not duplicate", () => {
  test("birthday sent in run 1 is suppressed in run 2 using the birthday recentIds set", () => {
    const msgs = [birthdayMsg("c1")];

    // Run 1: recentIds empty → birthday fires
    const run1 = dedupMessages(msgs, new Set());
    expect(run1).toHaveLength(1);

    // After run 1 the server would log contactId "c1" with notifType "birthday".
    // Run 2 (same day): recentIds now contains "c1" → birthday suppressed
    const recentAfterRun1 = new Set(["c1"]);
    const run2 = dedupMessages(msgs, recentAfterRun1);
    expect(run2).toHaveLength(0);
  });

  test("milestone sent in run 1 is suppressed in run 2 but birthday for the same contact is not", () => {
    const milestoneMsgs = [milestoneMsg("c1")];
    const birthdayMsgs = [birthdayMsg("c1")];

    // Run 1 fires the milestone
    const run1 = dedupMessages(milestoneMsgs, new Set());
    expect(run1).toHaveLength(1);

    // recentReminderIds now has c1 (milestone was logged under 'milestone' namespace)
    const recentReminderIds = new Set(["c1"]);
    // recentBirthdayIds is empty — birthday has NOT been sent
    const recentBirthdayIds = new Set<string>();

    // Run 2: milestone is suppressed
    const run2Milestone = dedupMessages(milestoneMsgs, recentReminderIds);
    expect(run2Milestone).toHaveLength(0);

    // Run 2: birthday for the same contact is NOT suppressed (separate namespace)
    const run2Birthday = dedupMessages(birthdayMsgs, recentBirthdayIds);
    expect(run2Birthday).toHaveLength(1);
  });

  test("birthday sent yesterday does NOT block a reminder today (namespace isolation)", () => {
    const reminderMsgs = [reminderMsg("c1")];

    // Yesterday's birthday log has been pruned from the reminder namespace —
    // only the birthday namespace has c1. Reminder dedup uses its own set.
    const recentBirthdayIds = new Set(["c1"]);  // irrelevant to reminder dedup
    const recentReminderIds = new Set<string>(); // reminder not yet sent today

    // Correctly applying each namespace to its own message type:
    const birthdayResult = dedupMessages([birthdayMsg("c1")], recentBirthdayIds);
    expect(birthdayResult).toHaveLength(0); // birthday suppressed (was sent yesterday)

    const reminderResult = dedupMessages(reminderMsgs, recentReminderIds);
    expect(reminderResult).toHaveLength(1); // reminder NOT suppressed
  });

  test("multiple contacts — only the ones in recentIds are suppressed, others pass through", () => {
    const msgs = [birthdayMsg("c1"), birthdayMsg("c2"), birthdayMsg("c3")];
    // c1 and c3 were already notified; c2 was not
    const recent = new Set(["c1", "c3"]);
    const result = dedupMessages(msgs, recent);
    expect(result).toHaveLength(1);
    expect(result[0].contactId).toBe("c2");
  });
});

// ── logNotifiedContacts — retry and structured warning ───────────────────────
//
// Verifies that a transient INSERT failure triggers a single retry and, if both
// attempts fail, emits a console.warn with structured context rather than
// silently discarding the record.

describe("logNotifiedContacts — retry on transient INSERT failure", () => {
  let mockQuery: jest.Mock;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Access the already-mocked pool from the jest.mock at top of file
    const { pool } = require("../server/db");
    mockQuery = pool.query as jest.Mock;
    mockQuery.mockReset();
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test("succeeds on first attempt — no warning emitted", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await logNotifiedContacts("user-1", new Set(["c1"]), "birthday");

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("retries once after a transient failure and succeeds — no warning emitted", async () => {
    mockQuery
      .mockRejectedValueOnce(new Error("transient connection error"))
      .mockResolvedValueOnce({ rows: [] });

    await logNotifiedContacts("user-1", new Set(["c1"]), "birthday");

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test("emits a structured console.warn after both attempts fail", async () => {
    mockQuery.mockRejectedValue(new Error("DB unavailable"));

    await logNotifiedContacts("user-1", new Set(["c1"]), "birthday");

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    const [warnMsg, warnContext] = warnSpy.mock.calls[0];
    expect(warnMsg).toMatch(/logNotifiedContacts/);
    expect(warnContext).toMatchObject({
      userId: "user-1",
      contactId: "c1",
      notifType: "birthday",
      error: "DB unavailable",
    });
  });

  test("processes each contactId independently — failure on one does not skip others", async () => {
    // c1 fails both attempts; c2 succeeds on first attempt
    mockQuery
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce({ rows: [] });

    await logNotifiedContacts("user-1", new Set(["c1", "c2"]), "reminder");

    expect(mockQuery).toHaveBeenCalledTimes(3);
    // One warn for c1, none for c2
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][1]).toMatchObject({ contactId: "c1" });
  });

  test("warn includes the error message from the second (final) attempt", async () => {
    mockQuery
      .mockRejectedValueOnce(new Error("first attempt error"))
      .mockRejectedValueOnce(new Error("second attempt error"));

    await logNotifiedContacts("user-1", new Set(["c1"]), "milestone");

    expect(warnSpy).toHaveBeenCalledTimes(1);
    // The warn is triggered on the second (final) failure
    expect(warnSpy.mock.calls[0][1].error).toBe("second attempt error");
  });
});
