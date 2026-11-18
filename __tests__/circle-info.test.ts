import { CIRCLE_CONFIG } from "@/lib/types";
import { CIRCLE_DESCRIPTIONS } from "@/shared/circle-descriptions";
import { CIRCLE_LEVELS, CIRCLE_LIMITS } from "@/shared/circles";

describe("circle information copy", () => {
  it.each(CIRCLE_LEVELS)("maps circle %i to its current name, explanation, and limit", (level) => {
    const explanation = CIRCLE_DESCRIPTIONS[level].explanation;
    expect(CIRCLE_DESCRIPTIONS[level]).toEqual({
      name: CIRCLE_CONFIG[level].label,
      explanation,
    });
    expect(explanation.toLowerCase()).toContain(`the limit is ${CIRCLE_LIMITS[level]}`);
    expect(explanation).not.toContain("undefined");
  });

  it("uses Acquaintances as the circle 4 display name", () => {
    expect(CIRCLE_DESCRIPTIONS[4].name).toBe("Acquaintances");
  });
});
