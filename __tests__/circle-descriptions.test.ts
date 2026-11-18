import { CIRCLE_DESCRIPTIONS } from "../shared/circle-descriptions";
import { CIRCLE_LIMITS } from "../shared/circles";
import { CIRCLE_CONFIG } from "../lib/types";

test.each([1, 2, 3, 4] as const)("circle %s explanation uses its current shared limit", (circle) => {
  expect(CIRCLE_DESCRIPTIONS[circle].explanation).toContain(`limit is ${CIRCLE_LIMITS[circle]}`);
});

test("Acquaintances has the requested short description", () => {
  expect(CIRCLE_CONFIG[4].description).toBe("People worth keeping up with");
});
