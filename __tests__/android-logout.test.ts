import { finishAndroidLogout, revokeAndroidSession, ANDROID_AUTH_CACHE_KEYS } from "../lib/android-only/logout-flow";
import { readFileSync } from "fs";

describe("Android-only logout", () => {
  const actions = () => ({
    markSignedOut: jest.fn(async () => {}),
    invalidatePendingAuth: jest.fn(),
    clearCachedAuth: jest.fn(async () => {}),
    revokeSession: jest.fn(async () => {}),
    clearUser: jest.fn(),
  });

  test("persists the sign-out guard before invalidating auth and clearing user", async () => {
    const a = actions();
    expect(await finishAndroidLogout(a)).toEqual([]);
    expect(a.clearUser).toHaveBeenCalledTimes(1);
    expect(a.markSignedOut.mock.invocationCallOrder[0]).toBeLessThan(a.invalidatePendingAuth.mock.invocationCallOrder[0]);
    expect(a.invalidatePendingAuth.mock.invocationCallOrder[0]).toBeLessThan(a.clearUser.mock.invocationCallOrder[0]);
    expect(a.clearCachedAuth).toHaveBeenCalledTimes(1);
    expect(a.revokeSession).toHaveBeenCalledTimes(1);
  });

  test("server failure no longer traps the user in Profile", async () => {
    const a = actions();
    a.revokeSession.mockRejectedValueOnce(new Error("503: Logout failed"));
    const warnings = await finishAndroidLogout(a);
    expect(a.clearUser).toHaveBeenCalledTimes(1);
    expect(warnings.join(" ")).toContain("signed out on this device");
    expect(warnings.join(" ")).toContain("server session and notifications may remain active");
    expect(warnings.join(" ")).toContain("retried before your next sign-in");
  });

  test("cache cleanup failure is reported, but the persisted guard prevents restoration", async () => {
    const a = actions();
    a.clearCachedAuth.mockRejectedValueOnce(new Error("Disk error"));
    expect((await finishAndroidLogout(a)).join(" ")).toContain("Automatic sign-in is disabled");
    expect(a.markSignedOut).toHaveBeenCalledTimes(1);
    expect(a.clearUser).toHaveBeenCalledTimes(1);
  });

  test("does not falsely report durable logout if guard persistence fails", async () => {
    const a = actions();
    a.markSignedOut.mockRejectedValueOnce(new Error("Disk error"));
    await expect(finishAndroidLogout(a)).rejects.toThrow("Disk error");
    expect(a.clearUser).not.toHaveBeenCalled();
    expect(a.revokeSession).not.toHaveBeenCalled();
  });

  test("clears legacy auth data as well as current profile/photo caches", () => {
    expect(ANDROID_AUTH_CACHE_KEYS).toEqual([
      "bridges_auth_slim_v1", "bridges_auth_photo_v1", "bridges_auth_cache_v1",
    ]);
  });

  test("sends the existing session cookie and validates successful server cleanup", async () => {
    const fetcher = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true }) }));
    await revokeAndroidSession(fetcher, "https://example.com/api/auth/logout");
    expect(fetcher).toHaveBeenCalledWith("https://example.com/api/auth/logout", expect.objectContaining({
      method: "POST", credentials: "include", body: "{}", signal: expect.any(AbortSignal),
    }));
  });

  test.each([
    { ok: false, status: 500, json: async () => ({}) },
    { ok: true, status: 200, json: async () => ({}) },
    { ok: true, status: 200, json: async () => { throw new Error("HTML, not JSON"); } },
  ])("does not mistake a bad server response for completed logout", async (response) => {
    await expect(revokeAndroidSession(async () => response, "https://example.com/api/auth/logout")).rejects.toThrow();
  });

  test("aborts even when a native fetch never resolves", async () => {
    jest.useFakeTimers();
    let signal: AbortSignal | undefined;
    const pending = revokeAndroidSession(async (_url, options) => {
      signal = options.signal as AbortSignal;
      return new Promise(() => {});
    }, "https://example.com/api/auth/logout", 8000);
    const assertion = expect(pending).rejects.toThrow("timed out");
    await jest.advanceTimersByTimeAsync(8000);
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  test("the Android provider and Profile use guarded logout without modifying originals", () => {
    const android = readFileSync("lib/auth-context.android.tsx", "utf8");
    expect(android).toContain('AsyncStorage.getItem(ANDROID_SIGNED_OUT_KEY) === "1"');
    expect(android).toContain("if (pendingLogout.current) return pendingLogout.current");
    expect(android).toContain("version !== authVersion.current");
    expect(android).toContain("await prepareSignIn()");
    for (const file of ["lib/auth-context.tsx", "app/profile.tsx"]) {
      expect(readFileSync(file, "utf8")).not.toContain("android-only");
    }
    const profile = readFileSync("components/android-only/ProfileScreen.android.tsx", "utf8");
    expect(profile).toContain('Alert.alert("Couldn\'t sign out"');
    expect(profile).toContain('signingOut ? "Signing out…"');
    expect(profile).not.toContain('await logout();\n            router.replace("/auth");');
  });
});
