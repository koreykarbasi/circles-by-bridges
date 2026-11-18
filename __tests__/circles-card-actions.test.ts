import { readFileSync } from "fs";
import { join } from "path";

test("Circles omits hangout without removing it from the reusable card", () => {
  const screen = readFileSync(join(__dirname, "../app/(tabs)/circles.tsx"), "utf8");
  const card = readFileSync(join(__dirname, "../components/ContactCard.tsx"), "utf8");
  expect(screen).not.toContain("onPlanHangout=");
  expect(card).toContain("onPlanHangout &&");
  expect(card).toContain("onPlanHangout()");
});
