jest.mock("../server/db", () => ({ db: { transaction: jest.fn() } }));
import express from "express";
import type { Server } from "http";
import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "../server/db";
import { fillContactFromPhone, registerContactRefreshRoutes } from "../server/contact-refresh";

const current = { id: "contact", userId: "owner", name: "Alex", email: "mine@example.test", phone: null, birthday: "", photoUri: null,
  circleLevel: 4, lastContacted: "2026-01-01", notes: "Private", labels: ["Keep"], notificationsCooldownUntil: "2027-01-01" };
let tx: any;
let row: any;
let where: any;
beforeEach(() => {
  jest.clearAllMocks();
  row = { ...current };
  tx = {
    execute: jest.fn().mockResolvedValue(undefined),
    select: () => ({ from: () => ({
      where: (condition: any) => { where = condition; return { for: async () => row ? [row] : [] }; },
    }) }),
    update: jest.fn(() => ({ set: (changes: any) => ({
      where: () => ({ returning: async () => [{ ...row, ...changes }] }),
    }) })),
  };
  (db.transaction as jest.Mock).mockImplementation(fn => fn(tx));
});

test("under the contact-edit lock, only still-empty allowlisted fields are written", async () => {
  const result = await fillContactFromPhone("owner", "contact", {
    email: "replace@example.test", phone: "123", birthday: "02/29",
    notes: "overwrite", circleLevel: 1, lastContacted: "2000-01-01",
  } as any);
  expect(result).toEqual({
    contact: { ...current, phone: "123", birthday: "02/29" }, appliedFields: ["phone", "birthday"],
  });
  expect(tx.execute).toHaveBeenCalledTimes(1);
  const dialect = new PgDialect();
  expect(dialect.sqlToQuery(tx.execute.mock.calls[0][0]).params).toEqual(["owner"]);
  expect(dialect.sqlToQuery(where).params).toEqual(["contact", "owner"]);
  expect(result?.contact.notes).toBe("Private");
});

test("if another edit filled a field since preview, the server keeps it and reports no update", async () => {
  row.phone = "user entered";
  const result = await fillContactFromPhone("owner", "contact", { phone: "imported" });
  expect(result?.appliedFields).toEqual([]);
  expect(result?.contact.phone).toBe("user entered");
  expect(tx.update).not.toHaveBeenCalled();
});

test("a missing or inaccessible contact causes no write", async () => {
  row = undefined;
  expect(await fillContactFromPhone("other-user", "contact", { phone: "123" })).toBeUndefined();
  expect(new PgDialect().sqlToQuery(where).params).toEqual(["contact", "other-user"]);
  expect(tx.update).not.toHaveBeenCalled();
});

describe("additive refresh endpoint", () => {
  let server: Server;
  let origin: string;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    registerContactRefreshRoutes(app, (req, res, next) => {
      if (req.headers["x-test-user"] !== "owner") { res.status(401).json({ message: "Not authenticated" }); return; }
      req.session = { userId: "owner" } as any;
      next();
    });
    server = await new Promise<Server>(resolve => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    origin = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  const post = (body: unknown, authenticated = true) => fetch(`${origin}/api/contacts/contact/refresh-from-phone`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(authenticated ? { "X-Test-User": "owner" } : {}) },
    body: JSON.stringify(body),
  });
  test("requires the existing authentication middleware", async () => {
    expect((await post({ phone: "123" }, false)).status).toBe(401);
    expect(db.transaction).not.toHaveBeenCalled();
  });
  test.each([{ notes: "overwrite" }, { circleLevel: 1 }, { phone: "123", lastContacted: "now" }, {}, { birthday: "99/99" }])(
    "rejects invalid or unapproved input %j", async body => {
      expect((await post(body)).status).toBe(400);
      expect(db.transaction).not.toHaveBeenCalled();
    },
  );
  test("returns applied fields and canonical contact for a valid request", async () => {
    const response = await post({ email: "do-not-replace@example.test", phone: "123" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      contact: { email: "mine@example.test", phone: "123", circleLevel: 4 }, appliedFields: ["phone"],
    });
  });
  test("does not reveal a contact from another account", async () => {
    row = undefined;
    expect((await post({ phone: "123" })).status).toBe(404);
  });
});
