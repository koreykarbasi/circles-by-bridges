import { readFileSync } from "node:fs";
import { ANDROID_PASSWORD_HINT, authErrorMessage, finishAndroidSignup } from "../lib/android-only/auth-flow";
import { androidOrbitGeometry } from "../lib/android-only/orbit-geometry";
import { birthdaySelection, BIRTHDAY_YEARS, parseBirthdaySelection } from "../lib/android-only/birthday-date";
import { createWheelSelection } from "../lib/android-only/wheel-selection";

describe("Android signup without changing shared authentication policy", () => {
  test("normalizes email/name but preserves the exact password", async () => {
    const register = jest.fn().mockResolvedValue(undefined);
    const login = jest.fn().mockResolvedValue(undefined);
    await finishAndroidSignup(register, login, "  Test@Example.COM  ", " abcde", "  Test  ");
    expect(register).toHaveBeenCalledWith("test@example.com", " abcde", "Test");
    expect(login).toHaveBeenCalledWith("test@example.com", " abcde");
    expect(register.mock.invocationCallOrder[0]).toBeLessThan(login.mock.invocationCallOrder[0]);
  });
  test("only describes the real six-character requirement", () => {
    expect(ANDROID_PASSWORD_HINT).toContain("Minimum 6 characters");
    expect(ANDROID_PASSWORD_HINT).toContain("No other character requirements");
  });
  test("does not try login if registration failed", async () => {
    const register = jest.fn().mockRejectedValue(new Error('400: {"message":"Password must be at least 6 characters"}'));
    const login = jest.fn();
    await expect(finishAndroidSignup(register, login, "test@example.com", "abc")).rejects.toThrow("Password must");
    expect(login).not.toHaveBeenCalled();
  });
  test("gives conditional recovery guidance, not a false existing-account claim", async () => {
    const register = jest.fn().mockResolvedValue(undefined);
    const login = jest.fn().mockRejectedValue(new Error('401: {"message":"Invalid email or password"}'));
    await expect(finishAndroidSignup(register, login, "test@example.com", "abcdef")).rejects.toThrow(
      "If you already have an account with this email",
    );
    await expect(finishAndroidSignup(register, login, "test@example.com", "abcdef")).rejects.toThrow("Forgot password");
  });
  test("keeps network/server failures distinct from password errors", async () => {
    const register = jest.fn().mockResolvedValue(undefined);
    const login = jest.fn().mockRejectedValue(new Error('500: {"message":"Login failed"}'));
    await expect(finishAndroidSignup(register, login, "test@example.com", "abcdef")).rejects.toThrow(
      "Try signing in again. Login failed",
    );
  });
  test.each([
    ['429: {"message":"Too many requests"}', "Too many requests"],
    ["Failed to fetch", "Failed to fetch"],
    ["400: Bad request", "Bad request"],
  ])("extracts useful errors from %s", (raw, expected) => {
    expect(authErrorMessage(new Error(raw))).toBe(expected);
  });
});

describe("Android slow drag and fling selection", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const wheel = () => {
    const commit = jest.fn();
    const selection = createWheelSelection({ itemHeight: 34, itemCount: () => 12, commit });
    return { commit, selection };
  };
  test("commits a slow drag even without momentum events", () => {
    const { selection, commit } = wheel();
    selection.dragBegin();
    selection.scroll(70);
    selection.dragEnd(70);
    jest.advanceTimersByTime(180);
    expect(commit).toHaveBeenCalledWith(2);
    expect(selection.isMoving()).toBe(false);
  });
  test("does not commit while the finger is still dragging", () => {
    const { selection, commit } = wheel();
    selection.dragBegin();
    selection.scroll(70);
    jest.advanceTimersByTime(1000);
    expect(commit).not.toHaveBeenCalled();
  });
  test("commits the final fling offset, not the earlier drag-end offset", () => {
    const { selection, commit } = wheel();
    selection.dragBegin();
    selection.dragEnd(70);
    selection.momentumBegin();
    jest.advanceTimersByTime(100);
    selection.scroll(140);
    jest.advanceTimersByTime(100);
    expect(commit).not.toHaveBeenCalled();
    selection.momentumEnd(171);
    jest.advanceTimersByTime(500);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(5);
  });
  test("settles the latest offset when Android omits momentum-end", () => {
    const { selection, commit } = wheel();
    selection.dragBegin();
    selection.dragEnd(20);
    selection.momentumBegin();
    selection.scroll(200);
    jest.advanceTimersByTime(120);
    selection.scroll(240);
    jest.advanceTimersByTime(180);
    expect(commit).toHaveBeenCalledWith(7);
  });
  test("a new drag cancels the previous settle timer", () => {
    const { selection, commit } = wheel();
    selection.dragBegin();
    selection.dragEnd(20);
    selection.dragBegin();
    jest.advanceTimersByTime(500);
    expect(commit).not.toHaveBeenCalled();
    selection.dragEnd(100);
    jest.advanceTimersByTime(180);
    expect(commit).toHaveBeenCalledWith(3);
  });
  test("uses the current item count after a short-month change", () => {
    let count = 31;
    const commit = jest.fn();
    const selection = createWheelSelection({ itemHeight: 34, itemCount: () => count, commit });
    selection.dragBegin();
    selection.dragEnd(34 * 30);
    count = 28;
    jest.advanceTimersByTime(180);
    expect(commit).toHaveBeenCalledWith(27);
  });
  test("does not update an unmounted picker", () => {
    const { selection, commit } = wheel();
    selection.dragBegin();
    selection.dragEnd(70);
    selection.dispose();
    jest.advanceTimersByTime(500);
    expect(commit).not.toHaveBeenCalled();
  });
  test("updates the selected value before an immediate Confirm tap", () => {
    const preview = jest.fn();
    const selection = createWheelSelection({
      itemHeight: 34, itemCount: () => 12, commit: jest.fn(), preview,
    });
    selection.dragBegin();
    selection.scroll(70);
    expect(preview).toHaveBeenLastCalledWith(2);
    selection.dragEnd(100);
    expect(preview).toHaveBeenLastCalledWith(3);
    selection.momentumBegin();
    selection.scroll(140);
    expect(preview).toHaveBeenLastCalledWith(4);
    selection.dispose();
  });
});

describe("Android birthday persistence format and short-month handling", () => {
  test.each(["03/23", "12/31", "02/29", "2/29"])("preserves %s after close/reopen", (value) => {
    const parsed = parseBirthdaySelection(value);
    expect(parseBirthdaySelection(parsed.value).value).toBe(parsed.value);
    if (value.endsWith("/29")) expect(parsed.value).toBe("02/29");
  });
  test("clamps January 31 to April 30 and non-leap February 28", () => {
    const year = BIRTHDAY_YEARS.indexOf("1999");
    expect(birthdaySelection(3, 30, year).value).toBe("04/30");
    expect(birthdaySelection(1, 30, year).value).toBe("02/28");
    expect(birthdaySelection(1, 30, BIRTHDAY_YEARS.indexOf("2000")).value).toBe("02/29");
  });
});

describe("Android orbit geometry", () => {
  test.each([240, 320, 360, 375, 412, 480])("keeps clear gaps at viewport width %s", (width) => {
    const g = androidOrbitGeometry(width);
    const scale = Math.min(1, g.size / 272);
    const coreGap = g.coreOrbitRadius - (g.centerSize + g.coreAvatarSize) / 2;
    expect(coreGap).toBeGreaterThanOrEqual(8 * scale - 0.001);
    expect(g.coreOrbitRadius + g.coreAvatarSize / 2).toBeLessThan(g.innerRadius);
    expect(g.closeOrbitRadius - g.coreOrbitRadius).toBeGreaterThan((g.coreAvatarSize + g.closeAvatarSize) / 2);
    expect(g.friendsOrbitRadius - g.closeOrbitRadius).toBeGreaterThan((g.closeAvatarSize + g.friendsAvatarSize) / 2);
    // Radial separation is the minimum separation for any rotation angle.
    for (let angle = 0; angle < 360; angle += 15) {
      const radians = angle * Math.PI / 180;
      const distance = Math.hypot(Math.cos(radians) * g.coreOrbitRadius, Math.sin(radians) * g.coreOrbitRadius);
      expect(distance - (g.centerSize + g.coreAvatarSize) / 2).toBeGreaterThanOrEqual(8 * scale - 0.001);
    }
  });
});

describe("iOS isolation", () => {
  test.each(["android", "ios", "web"])("Expo Router selects only the intended %s route files", (platform) => {
    const { getRoutes } = require("expo-router/build/getRoutesCore");
    const context = Object.assign(() => ({ default: () => null }), {
      keys: () => ["./_layout.tsx", "./auth.tsx", "./auth.android.tsx", "./onboarding.tsx", "./onboarding.android.tsx"],
    });
    const tree = getRoutes(context, { platform, skipGenerated: true, importMode: "lazy" });
    const keys = tree.children.map((route: { contextKey: string }) => route.contextKey);
    expect(keys).toContain(platform === "android" ? "./auth.android.tsx" : "./auth.tsx");
    expect(keys).toContain(platform === "android" ? "./onboarding.android.tsx" : "./onboarding.tsx");
    expect(keys).toHaveLength(2);
  });
  test("only Android UI entry points import Android-only auth helpers", () => {
    for (const file of ["app/onboarding.tsx", "app/auth.tsx"]) {
      expect(readFileSync(file, "utf8")).not.toContain("android-only");
    }
    for (const file of [
      "components/android-only/OnboardingScreen.android.tsx",
      "components/android-only/AuthScreen.android.tsx",
    ]) {
      expect(readFileSync(file, "utf8")).toContain("finishAndroidSignup");
      expect(readFileSync(file, "utf8")).toContain("ANDROID_PASSWORD_HINT");
      expect(readFileSync(file, "utf8")).toContain(
        file.includes("Onboarding") ? "PasswordRecovery" : "Forgot password?",
      );
    }
  });
});
