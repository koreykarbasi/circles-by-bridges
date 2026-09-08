const userContacts = [
  {
    id: "c3",
    userId: "user-1",
    name: "Cam",
    circleLevel: 3,
    lastContacted: "2024-01-01T12:00:00.000Z",
    birthday: null,
    customReminders: [],
  },
  {
    id: "c2",
    userId: "user-1",
    name: "Ben",
    circleLevel: 2,
    lastContacted: "2026-01-01T12:00:00.000Z",
    birthday: null,
    customReminders: [],
  },
];

const poolQuery = jest.fn();
jest.mock("../server/db", () => ({
  db: {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(async () => userContacts),
      })),
    })),
  },
  pool: { query: (...args: unknown[]) => poolQuery(...args) },
}));
jest.mock("jose", () => ({ importPKCS8: jest.fn(), SignJWT: jest.fn() }));
jest.mock("drizzle-orm", () => ({ isNotNull: jest.fn(), eq: jest.fn() }));
jest.mock("../shared/schema", () => ({
  users: {},
  contacts: {},
  hangoutVotes: {},
  hangoutOptions: {},
  hangoutPlans: {},
}));

import { getPrioritySuggestionCohort, selectSuggestionPushCandidates } from "../server/push-notifications";

describe("server elevation cohort integration", () => {
  beforeEach(() => poolQuery.mockReset());

  function mockElevation(elevatedAt: string, contactId = "c3") {
    poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("suggestion_dismissed', 'elevation")) {
        return {
          rows: [{ contact_id: contactId, notif_type: "elevation", sent_at: elevatedAt }],
        };
      }
      return { rows: [] };
    });
  }

  test("excludes C3 entirely before pushDue, including ordinary ranking", async () => {
    mockElevation("2026-02-16T12:01:00.000Z");
    const cohort = await getPrioritySuggestionCohort(
      "user-1",
      "UTC",
      new Date("2026-02-18T12:00:00.000Z"),
    );
    expect(cohort.map((contact) => contact.id)).toEqual(["c2"]);
  });

  test("includes and elevates C3 when the 72-hour delay is due", async () => {
    mockElevation("2026-02-15T12:00:00.000Z");
    const cohort = await getPrioritySuggestionCohort(
      "user-1",
      "UTC",
      new Date("2026-02-18T12:00:00.000Z"),
    );
    expect(cohort[0].id).toBe("c3");
    expect(cohort[0].elevationPhase).toBe("due");
    expect(cohort[0].score).toBeGreaterThan(cohort[1].score);
  });

  test("does not change Circle 2 ordinary suggestion eligibility during its existing delay", async () => {
    mockElevation("2026-02-17T12:00:00.000Z", "c2");
    const now = new Date("2026-02-18T12:00:00.000Z");
    const cohort = await getPrioritySuggestionCohort("user-1", "UTC", now);
    const circle2 = cohort.find((contact) => contact.id === "c2");
    expect(circle2).toBeDefined();
    expect(circle2?.elevationPhase).toBe("deferred");
    expect(selectSuggestionPushCandidates([circle2!], "UTC", now)).toEqual([circle2]);
  });
});