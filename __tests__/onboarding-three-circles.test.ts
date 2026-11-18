import { readFileSync } from "fs";
import { join } from "path";
import { homeCircleContacts } from "../shared/circles";

test.each(["app/onboarding.tsx", "components/android-only/OnboardingScreen.android.tsx"])(
  "%s restores the original three-circle introduction",
  (file) => {
    const source = readFileSync(join(__dirname, "..", file), "utf8");
    expect(source).toContain(">Your 3 Circles</Text>");
    expect(source).toContain("Based on Dunbar's research, we organize your relationships into three levels of closeness.");
    expect(source).not.toContain("four thoughtful circles");
    expect(source).not.toContain("[1, 2, 3, 4]");
    expect(source).toContain("([1, 2, 3] as const).map");
  },
);

test("the Home orbit still excludes Acquaintances", () => {
  expect(homeCircleContacts([{ circleLevel: 1 }, { circleLevel: 4 }])).toEqual([{ circleLevel: 1 }]);
});
