// Never import the application's pool: even when database secrets are present,
// storage can only reach the disposable cluster created below.
jest.mock("../server/db", () => ({ db: { transaction: jest.fn() } }));

import { getTableConfig } from "drizzle-orm/pg-core";
import { db } from "../server/db";
import { DatabaseStorage } from "../server/storage";
import { contacts } from "../shared/schema";
import { CircleMoveValidationError, type CircleMove } from "../shared/circle-moves";
import { CIRCLE_LIMITS, type CircleLevel } from "../shared/circles";
import { isolatedPostgres } from "./fixtures/isolated-postgres";

jest.setTimeout(60_000);

describe("moveContacts PostgreSQL transactions", () => {
  const storage = new DatabaseStorage();
  const queries: { sql: string; params: unknown[] }[] = [];
  let fixture: Awaited<ReturnType<typeof isolatedPostgres>>;

  beforeAll(async () => {
    fixture = await isolatedPostgres({
      logQuery(sql, params) { queries.push({ sql, params }); },
    });
    // Use the current Drizzle column definitions so SELECT * remains compatible.
    // Only contacts is needed; this private fixture intentionally has no users,
    // foreign keys, migrations, or access to existing application records.
    const columns = getTableConfig(contacts).columns.map(column =>
      `"${column.name}" ${column.getSQLType()}${column.notNull ? " NOT NULL" : ""}${column.primary ? " PRIMARY KEY" : ""}`,
    );
    await fixture.pool.query(`
      CREATE TABLE contacts (${columns.join(", ")});
      CREATE SEQUENCE move_attempts;
      CREATE TABLE move_fault (contact_id text);
      CREATE TABLE move_audit (contact_id text, circle_level integer);
      CREATE FUNCTION fail_circle_move() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE earlier_writes integer;
      BEGIN
        -- The two-int advisory key must belong to this user on this connection.
        -- This guard also fails if writes escape the locked transaction.
        IF NOT EXISTS (
          SELECT 1 FROM pg_locks
          WHERE locktype = 'advisory' AND pid = pg_backend_pid()
            AND classid = (hashtext(NEW.user_id)::bigint & 4294967295)::oid
            AND objid = 245001 AND objsubid = 2 AND granted
        ) THEN
          RAISE EXCEPTION 'missing per-user advisory transaction lock';
        END IF;
        PERFORM nextval('move_attempts');
        SELECT count(*) INTO earlier_writes FROM move_audit;
        IF EXISTS (SELECT 1 FROM move_fault WHERE contact_id = NEW.id) THEN
          RAISE EXCEPTION 'injected circle write failure after % successful writes', earlier_writes;
        END IF;
        INSERT INTO move_audit VALUES (NEW.id, NEW.circle_level);
        RETURN NEW;
      END $$;
      CREATE TRIGGER circle_write_fault AFTER UPDATE ON contacts
        FOR EACH ROW EXECUTE FUNCTION fail_circle_move();
    `);
    // Delegate to real Drizzle transaction/BEGIN/COMMIT/ROLLBACK, not a mock tx.
    (db.transaction as jest.Mock).mockImplementation(
      (...args: Parameters<typeof fixture.db.transaction>) => fixture.db.transaction(...args),
    );
  });

  afterAll(async () => { await fixture?.close(); });

  beforeEach(async () => {
    await fixture.pool.query(`
      TRUNCATE contacts, move_fault, move_audit;
      ALTER SEQUENCE move_attempts RESTART WITH 1;
    `);
    queries.length = 0;
    jest.clearAllMocks();
  });

  async function seed(extra = 0) {
    const rows = ([1, 2, 3, 4] as const).flatMap(level =>
      Array.from({ length: CIRCLE_LIMITS[level] + extra }, (_, index) => ({
        id: `owner-${level}-${index}`,
        userId: "owner",
        name: `Fixture ${level} ${index}`,
        circleLevel: level,
        avatarColor: "#123456",
        interests: [],
        labels: [],
        sortOrder: index,
        lastContacted: index === 0 ? null : "2026-01-01",
        emptyLastContactPromptDueAt: new Date("2026-02-01T12:00:00Z"),
        createdAt: new Date("2026-01-01T12:00:00Z"),
      })),
    );
    await fixture.db.insert(contacts).values([
      ...rows,
      { ...rows[0], id: "other-user-contact", userId: "other-user" },
    ]);
  }

  async function snapshot() {
    return (await fixture.pool.query("SELECT * FROM contacts ORDER BY id")).rows;
  }

  function expectTransaction(end: "commit" | "rollback") {
    expect(queries[0].sql).toBe("begin");
    expect(queries[1]).toEqual({
      sql: "SELECT pg_advisory_xact_lock(hashtext($1), 245001)",
      params: ["owner"],
    });
    expect(queries[2].sql).toMatch(/^select .* from "contacts" where "contacts"."user_id" = \$1$/);
    expect(queries[2].params).toEqual(["owner"]);
    for (const query of queries.filter(query => query.sql.startsWith("update"))) {
      expect(query.sql).toMatch(/where \("contacts"."id" = \$\d+ and "contacts"."user_id" = \$\d+\)$/);
      expect(query.params.at(-1)).toBe("owner");
    }
    expect(queries.at(-1)?.sql).toBe(end);
  }

  const swap: CircleMove[] = [
    { contactId: "owner-1-0", circleLevel: 2 },
    { contactId: "owner-2-0", circleLevel: 1 },
  ];
  const chain: CircleMove[] = [
    { contactId: "owner-1-0", circleLevel: 2 },
    { contactId: "owner-2-0", circleLevel: 3 },
    { contactId: "owner-3-0", circleLevel: 4 },
    { contactId: "owner-4-0", circleLevel: 1 },
  ];

  test.each([
    { label: "full-circle swap", extra: 0, moves: swap, failAt: 2 },
    { label: "overfull-circle swap", extra: 2, moves: swap, failAt: 2 },
    { label: "full-circle chain", extra: 0, moves: chain, failAt: 3 },
    { label: "overfull-circle chain", extra: 2, moves: chain, failAt: 3 },
  ])("$label rolls back earlier writes and can be retried", async ({ extra, moves, failAt }) => {
    await seed(extra);
    const before = await snapshot();
    await fixture.pool.query("INSERT INTO move_fault VALUES ($1)", [moves[failAt - 1].contactId]);
    queries.length = 0;

    // Drizzle wraps driver errors; check the actual PostgreSQL trigger failure.
    let failure: unknown;
    try {
      await storage.moveContacts("owner", moves);
    } catch (error) {
      failure = error;
    }
    expect((failure as Error)?.cause).toMatchObject({
      message: `injected circle write failure after ${failAt - 1} successful writes`,
      code: "P0001",
    });
    expectTransaction("rollback");
    // Sequences are not rolled back: proves we reached the injected write.
    expect((await fixture.pool.query("SELECT last_value, is_called FROM move_attempts")).rows)
      .toEqual([{ last_value: String(failAt), is_called: true }]);
    expect(await snapshot()).toEqual(before); // Includes sort order and prompt dates.
    expect((await fixture.pool.query("SELECT * FROM move_audit")).rows).toEqual([]);

    await fixture.pool.query("DELETE FROM move_fault");
    queries.length = 0;
    const result = await storage.moveContacts("owner", moves);
    expectTransaction("commit");
    expect(result).toHaveLength(before.length - 1);
    expect(result.every(contact => contact.userId === "owner")).toBe(true);
    const after = await snapshot();
    for (const original of before) {
      const moved = moves.find(move => move.contactId === original.id);
      const saved = after.find(contact => contact.id === original.id);
      if (moved) {
        expect(saved).toMatchObject({
          circle_level: moved.circleLevel,
          sort_order: null,
        });
        expect(result.find(contact => contact.id === original.id)?.circleLevel).toBe(moved.circleLevel);
      } else {
        expect(saved).toEqual(original);
      }
    }
    for (const level of [1, 2, 3, 4] as CircleLevel[]) {
      expect(result.filter(contact => contact.circleLevel === level)).toHaveLength(CIRCLE_LIMITS[level] + extra);
    }
    expect((await fixture.pool.query("SELECT * FROM move_audit ORDER BY contact_id")).rows)
      .toEqual(moves.map(move => ({ contact_id: move.contactId, circle_level: move.circleLevel }))
        .sort((a, b) => a.contact_id.localeCompare(b.contact_id)));
    // The xact lock must not leak from either rollback or commit.
    expect((await fixture.pool.query("SELECT * FROM pg_locks WHERE locktype = 'advisory'")).rows).toEqual([]);
  });

  test.each(["other-user-contact", "missing-contact"])(
    "rejects %s before any write, even after a valid move in the batch",
    async contactId => {
      await seed();
      const before = await snapshot();
      queries.length = 0;
      await expect(storage.moveContacts("owner", [
        swap[0], { contactId, circleLevel: 1 },
      ])).rejects.toBeInstanceOf(CircleMoveValidationError);
      expectTransaction("rollback");
      expect(queries.some(query => query.sql.startsWith("update"))).toBe(false);
      expect((await fixture.pool.query("SELECT is_called FROM move_attempts")).rows).toEqual([{ is_called: false }]);
      expect(await snapshot()).toEqual(before);
    },
  );
});
