import { CIRCLE_CONFIG } from "@/lib/types";
import { CIRCLE_DESCRIPTIONS } from "@/shared/circle-descriptions";

describe("circle information copy", () => {
  it.each([
    [
      1,
      "Your closest people, the handful you'd call first in a crisis and celebrate first with. Does not have to be 5. People usually have 2-3 people they trust their lives with. The Limit is 5. You're probably already in touch all the time, so Bridges keeps nudges rare here.",
    ],
    [
      2,
      "Good friends you genuinely enjoy and want to keep growing with. People you trust fully but just arent in contact with as frequently as you'd want. Worth regular effort: a catch-up every month or two. Again doesnt have to be 10 but that is the limit.",
    ],
    [
      3,
      "Friends and friendly faces you like but see a few times a year. A check-in every few months keeps the connection warm.",
    ],
    [
      4,
      "Acquaintances worth keeping: mentors, former coworkers, people you'd like updates from. A hello roughly once a year is plenty.",
    ],
  ] as const)("maps circle %i to the exact circle name and explanation", (level, explanation) => {
    expect(CIRCLE_DESCRIPTIONS[level]).toEqual({
      name: CIRCLE_CONFIG[level].label,
      explanation,
    });
  });

  it("uses Acquaintances as the circle 4 display name", () => {
    expect(CIRCLE_DESCRIPTIONS[4].name).toBe("Acquaintances");
  });
});
