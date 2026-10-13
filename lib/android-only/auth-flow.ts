/**
 * Android-only auth copy/flow. The shared registration endpoint intentionally
 * does not reveal whether an email already exists.
 */
export const ANDROID_PASSWORD_HINT = "Minimum 6 characters. No other character requirements.";

export function authErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Something went wrong. Please try again.";
  const jsonStart = raw.indexOf("{");
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart));
      if (typeof parsed.message === "string") return parsed.message;
    } catch {}
  }
  return raw.replace(/^\d+:\s*/, "");
}

export async function finishAndroidSignup(
  register: (email: string, password: string, name?: string) => Promise<void>,
  login: (email: string, password: string) => Promise<void>,
  email: string,
  password: string,
  name?: string,
): Promise<void> {
  await register(email.trim().toLowerCase(), password, name?.trim() || undefined);
  try {
    await login(email.trim().toLowerCase(), password);
  } catch (error) {
    const message = authErrorMessage(error);
    if (/^401:/.test(error instanceof Error ? error.message : "") ||
        message === "Invalid email or password") {
      throw new Error(
        "Couldn't finish sign-up. If you already have an account with this email, sign in with your existing password or use Forgot password.",
      );
    }
    // Registration may already have succeeded. Do not encourage repeatedly
    // creating accounts when login failed because of connectivity or a 5xx.
    throw new Error(`Couldn't sign in after sign-up. Try signing in again. ${message}`);
  }
}
