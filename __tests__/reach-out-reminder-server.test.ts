jest.mock("../server/db", () => ({ db: { transaction: jest.fn() }, pool: { query: jest.fn() } }));
import express from "express";
import type { Server } from "http";
import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "../server/db";
import { addReachOutReminder, registerReachOutReminderRoutes } from "../server/reach-out-reminder";
import { buildReminderMessages } from "../server/push-notifications";

const current = {
  id: "alex", userId: "owner", name: "Alex", circleLevel: 4, notes: "Keep",
  lastContacted: "2026-10-01", labels: ["Work"], interests: ["Music"],
  customReminders: [{ label: "Anniversary", date: "06/12" }],
};
let row: any;
let tx: any;
let where: any;
let written: any;
beforeEach(() => {
  jest.clearAllMocks();
  row = { ...current, customReminders: [...current.customReminders] };
  written = undefined;
  tx = {
    execute: jest.fn(),
    select: () => ({ from: () => ({ where: (condition: any) => {
      where = condition;
      return { for: async () => row ? [row] : [] };
    } }) }),
    update: jest.fn(() => ({ set: (changes: any) => {
      written = changes;
      return { where: () => ({ returning: async () => {
        row = { ...row, ...changes };
        return [row];
      } }) };
    } })),
  };
  (db.transaction as jest.Mock).mockImplementation(fn => fn(tx));
});

test("appends only the reminder under the owner-scoped contact-edit lock", async () => {
  const result = await addReachOutReminder("owner", "alex", "12/01");
  expect(result).toEqual({
    contact: { ...current, customReminders: [...current.customReminders, { label: "Reach out", date: "12/01" }] },
    reminder: { label: "Reach out", date: "12/01" },
  });
  expect(Object.keys(written)).toEqual(["customReminders"]);
  const dialect = new PgDialect();
  expect(dialect.sqlToQuery(tx.execute.mock.calls[0][0]).params).toEqual(["owner"]);
  expect(dialect.sqlToQuery(where).params).toEqual(["alex", "owner"]);
});

test("preserves reminders saved since the editor opened and deduplicates retries of the same reminder", async () => {
  row.customReminders.push({ label: "Added elsewhere", date: "12/09" });
  await addReachOutReminder("owner", "alex", "12/01");
  await addReachOutReminder("owner", "alex", "12/01");
  expect(row.customReminders).toHaveLength(3);
  expect(row.customReminders[1].label).toBe("Added elsewhere");
  expect(tx.update).toHaveBeenCalledTimes(1);
});

test("rejects missing contacts and contacts no longer in Circle 4 without writing", async () => {
  row = undefined;
  expect(await addReachOutReminder("owner", "alex", "12/01")).toBeUndefined();
  row = { ...current, circleLevel: 2 };
  expect(await addReachOutReminder("owner", "alex", "12/01")).toEqual({ wrongCircle: true });
  expect(tx.update).not.toHaveBeenCalled();
});

describe("additive reminder HTTP endpoint", () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    registerReachOutReminderRoutes(app, (req, res, next) => {
      if (req.headers["x-test-user"] !== "owner") return void res.status(401).json({ message: "Not authenticated" });
      (req as any).session = { userId: "owner" };
      next();
    });
    server = await new Promise<Server>(resolve => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    });
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
  const post = (body: unknown, user = "owner") => fetch(`${base}/api/contacts/alex/reach-out-reminder`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-test-user": user },
    body: JSON.stringify(body),
  });
  test("requires authentication before database work", async () => {
    expect((await post({ date: "12/01" }, "other")).status).toBe(401);
    expect(db.transaction).not.toHaveBeenCalled();
  });
  test.each([{}, { date: "02/30" }, { date: "12/01", notes: "overwrite" }, { date: 12 }])("rejects invalid input %j", async body => {
    expect((await post(body)).status).toBe(400);
    expect(db.transaction).not.toHaveBeenCalled();
  });
  test("returns the persisted reminder and contact", async () => {
    const response = await post({ date: "12/01" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reminder: { label: "Reach out", date: "12/01" } });
  });
  test("handles owner-scoped not-found, wrong-circle, and save failures", async () => {
    row = undefined;
    expect((await post({ date: "12/01" })).status).toBe(404);
    row = { ...current, circleLevel: 3 };
    expect((await post({ date: "12/01" })).status).toBe(400);
    (db.transaction as jest.Mock).mockRejectedValue(new Error("offline"));
    expect((await post({ date: "12/01" })).status).toBe(500);
  });
});

test("scheduled Circle 4 reach-out pushes use concise copy and custom delivery on the chosen local day", () => {
  jest.useFakeTimers().setSystemTime(new Date("2026-12-01T14:00:00Z"));
  try {
    const messages = buildReminderMessages({
      ...current, customReminders: [{ label: "Reach out", date: "12/01" }],
      notificationsCooldownUntil: "2030-01-01",
    } as any, "America/Toronto");
    expect(messages).toEqual([{
      title: "Reach out to Alex", body: "A reminder to reach out to Alex.",
      contactId: "alex", notifType: "custom",
    }]);
    expect(buildReminderMessages({
      ...current, customReminders: [{ label: "Reach out", date: "12/02" }],
    } as any, "America/Toronto").filter(message => message.notifType === "custom")).toEqual([]);
  } finally { jest.useRealTimers(); }
});
