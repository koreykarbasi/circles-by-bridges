import { projectCircleMoves, validateCircleMoves, CircleMoveValidationError, increasesOverCapacity } from "../shared/circle-moves";
import { CIRCLE_LEVELS, CIRCLE_LIMITS } from "../shared/circles";

const fullCircles = () => CIRCLE_LEVELS.flatMap(circleLevel =>
  Array.from({ length: CIRCLE_LIMITS[circleLevel] }, (_, i) => ({ id: `${circleLevel}-${i}`, circleLevel })));

describe("capacity-safe circle move drafts", () => {
  test("existing overfull circles allow no-op edits and unrelated moves", () => {
    const contacts = [...fullCircles(), { id: "extra", circleLevel: 1 }];
    expect(() => validateCircleMoves(contacts, [])).not.toThrow();
    expect(() => validateCircleMoves(contacts, [{ contactId: "extra", circleLevel: 1 }])).not.toThrow();
    expect(() => validateCircleMoves(contacts, [
      { contactId: "2-0", circleLevel: 3 }, { contactId: "3-0", circleLevel: 2 },
    ])).not.toThrow();
  });

  test("a move out may leave its source overfull, without blocking Save", () => {
    const contacts = [
      ...fullCircles().filter(c => c.id !== "2-9"),
      { id: "extra-1", circleLevel: 1 }, { id: "extra-2", circleLevel: 1 },
    ];
    const result = validateCircleMoves(contacts, [{ contactId: "extra-1", circleLevel: 2 }]);
    expect(result.counts[1]).toBe(6);
    expect(result.overfullCircles).toEqual([1]);
    expect(result.blockingCircles).toEqual([]);
  });

  test("increasing an already-overfull destination is still rejected", () => {
    const contacts = [...fullCircles(), { id: "extra", circleLevel: 1 }];
    expect(() => validateCircleMoves(contacts, [{ contactId: "2-0", circleLevel: 1 }])).toThrow();
  });

  test.each(CIRCLE_LEVELS)("creation at or above circle %s capacity remains blocked", level => {
    expect(increasesOverCapacity(level, CIRCLE_LIMITS[level] - 1, CIRCLE_LIMITS[level])).toBe(false);
    expect(increasesOverCapacity(level, CIRCLE_LIMITS[level], CIRCLE_LIMITS[level] + 1)).toBe(true);
    expect(increasesOverCapacity(level, CIRCLE_LIMITS[level] + 4, CIRCLE_LIMITS[level] + 5)).toBe(true);
    expect(increasesOverCapacity(level, CIRCLE_LIMITS[level] + 4, CIRCLE_LIMITS[level] + 3)).toBe(false);
  });
  test("a move into a full circle stays a draft and cannot be saved", () => {
    const contacts = fullCircles();
    const moves = [{ contactId: "1-0", circleLevel: 2 as const }];
    expect(projectCircleMoves(contacts, moves).overfullCircles).toEqual([2]);
    expect(() => validateCircleMoves(contacts, moves)).toThrow(CircleMoveValidationError);
    expect(contacts.filter(c => c.circleLevel === 1)).toHaveLength(5);
  });

  test("a full-circle swap is balanced without temporary overflow", () => {
    const result = validateCircleMoves(fullCircles(), [
      { contactId: "1-0", circleLevel: 2 }, { contactId: "2-0", circleLevel: 1 },
    ]);
    expect(result.overfullCircles).toEqual([]);
    expect(result.counts).toEqual(CIRCLE_LIMITS);
    expect(result.assignments.find(c => c.id === "1-0")?.circleLevel).toBe(2);
    expect(result.assignments.find(c => c.id === "2-0")?.circleLevel).toBe(1);
  });

  test("move chains can pass through all four full circles", () => {
    const result = validateCircleMoves(fullCircles(), [
      { contactId: "1-0", circleLevel: 2 }, { contactId: "2-0", circleLevel: 3 },
      { contactId: "3-0", circleLevel: 4 }, { contactId: "4-0", circleLevel: 1 },
    ]);
    expect(result.counts).toEqual(CIRCLE_LIMITS);
  });

  test("chains may finish at a circle with a free slot", () => {
    const contacts = fullCircles().filter(c => c.id !== "4-99");
    const result = validateCircleMoves(contacts, [
      { contactId: "1-0", circleLevel: 2 }, { contactId: "2-0", circleLevel: 4 },
    ]);
    expect(result.counts).toEqual({ 1: 4, 2: 10, 3: 35, 4: 100 });
  });

  test("unknown contacts, duplicate moves, and invalid destinations are rejected", () => {
    const contacts = fullCircles();
    expect(() => validateCircleMoves(contacts, [{ contactId: "foreign", circleLevel: 1 }])).toThrow();
    expect(() => validateCircleMoves(contacts, [
      { contactId: "1-0", circleLevel: 2 }, { contactId: "1-0", circleLevel: 3 },
    ])).toThrow(/one destination/);
    expect(() => validateCircleMoves(contacts, [
      { contactId: "1-0", circleLevel: 5 as 1 },
    ])).toThrow(/valid destination/);
  });

  test("undoing a draft leaves original contacts untouched", () => {
    const contacts = fullCircles();
    const original = JSON.stringify(contacts);
    projectCircleMoves(contacts, [{ contactId: "1-0", circleLevel: 2 }]);
    expect(projectCircleMoves(contacts, []).counts).toEqual(CIRCLE_LIMITS);
    expect(JSON.stringify(contacts)).toBe(original);
  });
});
