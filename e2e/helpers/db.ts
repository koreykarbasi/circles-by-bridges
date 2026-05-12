import { Pool } from "pg";
import { createHmac, randomBytes } from "crypto";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function query(sql: string, params: unknown[] = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function getDemoUserId(): Promise<string> {
  const rows = await query("SELECT id FROM users WHERE email = $1 LIMIT 1", ["demo@bridges.app"]);
  if (!rows.length) throw new Error("Demo user not found");
  return rows[0].id;
}

/**
 * Verify demo credentials via real login, then forge an HTTP-compatible
 * session for the same user in the DB (secure:false bypasses express-session's
 * issecure() guard on plain-HTTP test requests).  Returns the signed
 * connect.sid value to inject into the Playwright context.
 *
 * Background: express-session never calls setcookie() over HTTP when the
 * cookie option is secure:true, so real login cannot yield a cookie.  This
 * helper bridges that gap while still exercising the real auth endpoint.
 */
export async function loginAndForgeSession(
  apiRequest: { post: (url: string, opts: { data: unknown }) => Promise<{ ok: () => boolean }> },
  apiUrl: string,
  email: string,
  password: string,
): Promise<string> {
  const res = await apiRequest.post(`${apiUrl}/api/auth/login`, { data: { email, password } });
  if (!res.ok()) throw new Error(`Login failed for ${email}`);

  const [{ id: userId }] = await query("SELECT id FROM users WHERE email = $1 LIMIT 1", [email]);
  return createTestSessionCookie(userId);
}

/**
 * Insert a session row with cookie.secure = false and return a signed
 * connect.sid value.  The secure:false flag lets express-session accept the
 * session on plain-HTTP requests (its issecure() guard only skips a session
 * when sess.cookie.secure is truthy AND the connection is not HTTPS).
 */
export async function createTestSessionCookie(userId: string): Promise<string> {
  const secret = process.env.SESSION_SECRET ?? "bridges-dev-secret-change-me";

  const sid = randomBytes(24)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const sessData = JSON.stringify({
    cookie: {
      originalMaxAge: 2592000000,
      expires: new Date(Date.now() + 86400000).toISOString(),
      httpOnly: true,
      secure: false,
      path: "/",
      sameSite: "none",
    },
    userId,
  });

  await query("INSERT INTO session (sid, sess, expire) VALUES ($1, $2, $3)", [
    sid,
    sessData,
    new Date(Date.now() + 86400 * 1000),
  ]);

  const sig = createHmac("sha256", secret)
    .update(sid)
    .digest("base64")
    .replace(/=+$/, "");

  return `s:${sid}.${sig}`;
}

export async function deleteTestSession(signedCookie: string): Promise<void> {
  const inner = signedCookie.slice(2);
  const sid = inner.slice(0, inner.lastIndexOf("."));
  await query("DELETE FROM session WHERE sid = $1", [sid]);
}
