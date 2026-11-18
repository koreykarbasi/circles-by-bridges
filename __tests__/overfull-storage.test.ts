jest.mock("../server/db", () => ({
  db: { transaction: jest.fn(), select: jest.fn() },
}));
import { db } from "../server/db";
import { DatabaseStorage } from "../server/storage";
import { CIRCLE_LIMITS } from "../shared/circles";
import type { CircleLevel } from "../shared/circles";

describe("storage capacity guards", () => {
  const storage = new DatabaseStorage();
  let existing: any[];
  let target: any;
  let tx: any;
  beforeEach(() => {
    jest.clearAllMocks();
    existing = [];
    target = undefined;
    tx = {
      execute: jest.fn().mockResolvedValue(undefined),
      select: () => ({ from: () => ({ where: async () => existing }) }),
      insert: jest.fn(() => ({
        values: (data: any) => ({ returning: async () => [{ id: "new", ...data }] }),
      })),
      update: jest.fn(() => ({
        set: (data: any) => ({ where: () => ({ returning: async () => [{ ...target, ...data }] }) }),
      })),
    };
    (db.transaction as jest.Mock).mockImplementation((fn) => fn(tx));
    (db.select as jest.Mock).mockImplementation(() => ({
      from: () => ({ where: async () => target ? [target] : [] }),
    }));
  });
  function fill(level: CircleLevel, count: number) {
    const people = Array.from({ length: count }, (_, i) => ({
      id: `${level}-${i}`, userId: "user", circleLevel: level, name: "Person",
    }));
    existing.push(...people);
    return people;
  }
  test.each([1, 2, 3, 4] as const)("blocks creation at/over circle %s limit, before writing", async (level) => {
    fill(level, CIRCLE_LIMITS[level]);
    const input = { userId: "user", name: "New", circleLevel: level, avatarColor: "#FFFFFF" };
    await expect(storage.createContact(input)).rejects.toThrow(/full/);
    fill(level, 1);
    await expect(storage.createContact(input)).rejects.toThrow(/full/);
    expect(tx.insert).not.toHaveBeenCalled();
  });
  test("allows creation into a different circle despite an existing overfull circle", async () => {
    fill(1, 7);
    await expect(storage.createContact({ userId: "user", name: "New", circleLevel: 2, avatarColor: "#FFFFFF" })).resolves.toMatchObject({ circleLevel: 2 });
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });
  test("allows unrelated edits while retaining an overfull circle", async () => {
    target = fill(1, 7)[0];
    await expect(storage.updateContact(target.id, { name: "Renamed", circleLevel: 1 })).resolves.toMatchObject({ name: "Renamed", circleLevel: 1 });
    expect(tx.update).toHaveBeenCalledTimes(1);
  });
  test("allows moving out even when the source remains overfull", async () => {
    target = fill(1, 7)[0];
    await expect(storage.updateContact(target.id, { circleLevel: 2 })).resolves.toMatchObject({ circleLevel: 2 });
  });
  test("rejects moving into an already overfull circle before any write", async () => {
    fill(1, 7);
    target = fill(2, 1)[0];
    await expect(storage.updateContact(target.id, { circleLevel: 1 })).rejects.toThrow(/full/);
    expect(tx.update).not.toHaveBeenCalled();
  });
});
