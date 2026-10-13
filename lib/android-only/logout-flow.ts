export const ANDROID_SIGNED_OUT_KEY = "bridges_android_signed_out_v1";
export const ANDROID_AUTH_CACHE_KEYS = [
  "bridges_auth_slim_v1",
  "bridges_auth_photo_v1",
  "bridges_auth_cache_v1",
];

/** A hung native request must not leave the Sign out confirmation stuck forever. */
export async function revokeAndroidSession(
  fetcher: (url: string, options: {
    method: "POST";
    credentials: "include";
    headers: Record<string, string>;
    signal: AbortSignal;
    body: string;
  }) => Promise<Pick<Response, "ok" | "status" | "json">>,
  url: string,
  timeoutMs = 8000,
): Promise<void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      (async () => {
        const response = await fetcher(url, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          // Some Android transports send a NUL byte for a bodyless JSON request.
          // Send valid JSON explicitly; this endpoint does not need any fields.
          body: "{}",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Logout failed (${response.status})`);
        const body = await response.json();
        if (body?.success !== true) throw new Error("Invalid logout response");
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Logout request timed out"));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function finishAndroidLogout(actions: {
  markSignedOut: () => Promise<void>;
  invalidatePendingAuth: () => void;
  clearCachedAuth: () => Promise<void>;
  revokeSession: () => Promise<void>;
  clearUser: () => void;
}): Promise<string[]> {
  // Persist this first: a surviving cookie must not restore the account on restart.
  // If storage fails, do not falsely report a durable logout.
  await actions.markSignedOut();
  actions.invalidatePendingAuth();
  const results = await Promise.allSettled([
    Promise.resolve().then(actions.clearCachedAuth),
    Promise.resolve().then(actions.revokeSession),
  ]);
  actions.clearUser();
  const warnings: string[] = [];
  if (results[0].status === "rejected") {
    warnings.push("Saved account information could not be fully removed. Automatic sign-in is disabled on this device.");
  }
  if (results[1].status === "rejected") {
    warnings.push("You're signed out on this device. Server sign-out could not be completed, so your server session and notifications may remain active. Cleanup will be retried before your next sign-in.");
  }
  return warnings;
}
