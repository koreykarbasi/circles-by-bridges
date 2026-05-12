// Hangout detail E2E tests.
//
// Session notes:
//   express-session sets secure:true, so no Set-Cookie is sent over plain HTTP.
//   loginAndForgeSession() verifies credentials then inserts a session row with
//   cookie.secure=false so requests to localhost:5000 are authenticated.
//
//   Chrome drops SameSite=None cookies on cross-origin (8081→5000) requests, so
//   hangout GET/PUT calls are proxied via Node's native fetch (runs in the test
//   process, bypasses page.route interception) to reach the real server.
//
//   Alert.alert is a static no-op in React Native Web.  injectAlertPatch()
//   intercepts Metro's __d before the bundle loads and replaces alert() so it
//   immediately calls the confirm button's onPress.

import { test, expect, Page } from "@playwright/test";
import { query, loginAndForgeSession, deleteTestSession } from "./helpers/db";

const EXPO_URL = "http://localhost:8081";
const API_URL = "http://localhost:5000";
const DEMO_EMAIL = "demo@bridges.app";
const DEMO_PASS = "demo123";

let planId: string;
let shareCode: string;
let actOpt1Id: string;
let actOpt2Id: string;
let timeOpt1Id: string;
let timeOpt2Id: string;
let demoUserId: string;
let testSessionCookie: string | null = null;

test.beforeEach(async () => {
  const [user] = await query(
    "SELECT id FROM users WHERE email = $1 LIMIT 1",
    [DEMO_EMAIL],
  );
  demoUserId = user.id;
  shareCode = `e2edetail${Date.now()}`;

  const [plan] = await query(
    `INSERT INTO hangout_plans
       (user_id, title, description, status, share_code, invitee_names, survey_mode, include_plus_one)
     VALUES ($1, $2, $3, 'active', $4, ARRAY['Carol','Dave'], 'standard', false)
     RETURNING id`,
    [demoUserId, "E2E Detail Test Plan", "Detail screen test", shareCode],
  );
  planId = plan.id;

  [{ id: actOpt1Id }] = await query(
    "INSERT INTO hangout_options (plan_id, label, question_type) VALUES ($1, 'Mini Golf', 'activity') RETURNING id",
    [planId],
  );
  [{ id: actOpt2Id }] = await query(
    "INSERT INTO hangout_options (plan_id, label, question_type) VALUES ($1, 'Board Games', 'activity') RETURNING id",
    [planId],
  );
  [{ id: timeOpt1Id }] = await query(
    "INSERT INTO hangout_options (plan_id, label, question_type) VALUES ($1, 'Friday 7pm', 'time') RETURNING id",
    [planId],
  );
  [{ id: timeOpt2Id }] = await query(
    "INSERT INTO hangout_options (plan_id, label, question_type) VALUES ($1, 'Saturday 3pm', 'time') RETURNING id",
    [planId],
  );
});

test.afterEach(async () => {
  if (testSessionCookie) {
    await deleteTestSession(testSessionCookie);
    testSessionCookie = null;
  }
  if (planId) {
    await query("DELETE FROM hangout_votes WHERE plan_id = $1", [planId]);
    await query("DELETE FROM hangout_options WHERE plan_id = $1", [planId]);
    await query("DELETE FROM hangout_plans WHERE id = $1", [planId]);
  }
});

// Intercept Metro's __d before the bundle loads to replace Alert.alert()
// with an implementation that immediately calls the confirm button's onPress.
async function injectAlertPatch(page: Page) {
  await page.addInitScript(() => {
    const ALERT_MODULE =
      "node_modules/react-native-web/dist/exports/Alert/index.js";
    Object.defineProperty(globalThis, "__d", {
      configurable: true,
      get() {
        return (globalThis as Record<string, unknown>).__dFn as
          | ((...a: unknown[]) => void)
          | undefined;
      },
      set(fn: (...a: unknown[]) => void) {
        (globalThis as Record<string, unknown>).__dFn = (
          factory: (...a: unknown[]) => void,
          moduleId: number,
          deps: unknown,
          name: string,
        ) => {
          if (name === ALERT_MODULE) {
            const wrapped = (...args: unknown[]) => {
              factory(...args);
              const mod = args[4] as {
                exports?: { default?: { alert: (...a: unknown[]) => void } };
              };
              const A = mod?.exports?.default;
              if (A) {
                A.alert = (
                  _t: unknown,
                  _m: unknown,
                  buttons: { text: string; onPress?: () => void }[],
                ) => {
                  const ok = (buttons ?? []).find((b) => b.text !== "Cancel");
                  ok?.onPress?.();
                };
              }
            };
            return fn(wrapped, moduleId, deps, name);
          }
          return fn(factory, moduleId, deps, name);
        };
      },
    });
  });
}

// Seed localStorage so the Expo app considers the user authenticated and
// onboarding complete without a real login handshake in the browser.
async function injectAuthMocks(page: Page) {
  const user = { id: demoUserId, email: DEMO_EMAIL, username: "Demo User" };
  await page.addInitScript((u: typeof user) => {
    localStorage.setItem("bridges_auth_cache_v1", JSON.stringify(u));
    localStorage.setItem("bridges_onboarding_complete", "true");
  }, user);
  await page.route("**/api/auth/me", (r) => r.fulfill({ json: user }));
  await page.route("**/api/contacts**", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/prompts**", (r) => r.fulfill({ json: {} }));
  return user;
}

// Install a page.route handler that proxies GET (and optionally PUT) requests
// for /api/hangouts through Node's native fetch so they reach localhost:5000
// with the forged session cookie.  Native fetch is not intercepted by
// page.route, so there is no recursion risk.
async function installHangoutsProxy(
  page: Page,
  cookie: string,
  onPut?: (payload: Record<string, unknown>) => void,
  authHeaders?: Record<string, string>,
) {
  const cookieHdr = { Cookie: `connect.sid=${encodeURIComponent(cookie)}` };
  await page.route("**/api/hangouts**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes("/calendar")) { route.continue(); return; }
    if (method === "DELETE") { route.fulfill({ json: { ok: true } }); return; }
    if (method === "GET") {
      const apiPath = new URL(url).pathname + (new URL(url).search || "");
      const real = await fetch(`${API_URL}${apiPath}`, { headers: cookieHdr });
      route.fulfill({
        status: real.status,
        body: await real.text(),
        headers: { "content-type": "application/json" },
      });
      return;
    }
    if (method === "PUT" && onPut && authHeaders) {
      const postData = route.request().postData();
      const payload = postData ? (JSON.parse(postData) as Record<string, unknown>) : {};
      onPut(payload);
      const real = await fetch(`${API_URL}${new URL(url).pathname}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify(payload),
      });
      route.fulfill({
        status: real.status,
        body: await real.text(),
        headers: { "content-type": "application/json" },
      });
      return;
    }
    route.continue();
  });
}

async function openDetailViaTab(page: Page) {
  await page.goto(EXPO_URL);
  const tab = page.getByRole("tab", { name: /hangouts/i });
  await expect(tab).toBeVisible({ timeout: 15000 });
  await tab.click();
  const row = page.getByText("E2E Detail Test Plan").first();
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.click();
  // Wait for the detail view to mount (invitee count is always present)
  await page.waitForFunction(
    () => document.body.innerText.includes("invited"),
    undefined,
    { timeout: 10000 },
  );
}

// Test 1: active plan — real server data with live Borda scores
test("active hangout detail: real vote data, Borda scores, share buttons, Lock-this-in button", async ({
  page,
  request,
}) => {
  await request.post(`${API_URL}/api/vote/${shareCode}`, {
    data: {
      voterName: "Voter1",
      votes: [
        { optionId: actOpt1Id, rank: 1 },
        { optionId: actOpt2Id, rank: 2 },
        { optionId: timeOpt1Id, rank: 1 },
        { optionId: timeOpt2Id, rank: 2 },
      ],
    },
  });
  await request.post(`${API_URL}/api/vote/${shareCode}`, {
    data: {
      voterName: "Voter2",
      votes: [
        { optionId: actOpt1Id, rank: 1 },
        { optionId: actOpt2Id, rank: 2 },
        { optionId: timeOpt1Id, rank: 1 },
        { optionId: timeOpt2Id, rank: 2 },
      ],
    },
  });

  testSessionCookie = await loginAndForgeSession(request, API_URL, DEMO_EMAIL, DEMO_PASS);

  await injectAuthMocks(page);
  await installHangoutsProxy(page, testSessionCookie);
  await openDetailViaTab(page);

  await page.waitForFunction(
    () =>
      document.body.innerText.includes("Mini Golf") &&
      document.body.innerText.includes("Lock this in"),
    undefined,
    { timeout: 8000 },
  );

  const body = await page.evaluate(() => document.body.innerText);
  expect(body).toContain("Mini Golf");
  expect(body).toContain("Friday 7pm");
  expect(body).toContain("2 voted");
  expect(body).toContain("Carol");
  expect(body).toContain("Board Games");
  expect(body).toContain("Saturday 3pm");
  expect(body).toContain("BEST PICKS SO FAR");

  await expect(page.getByText("Copy link")).toBeVisible();
  await expect(page.getByText("Copy message")).toBeVisible();
  await expect(page.getByText("Lock this in").first()).toBeVisible();

  // Verify exact Borda scores from the server (MAX_RANK=5, 2 voters each rank 1 = 10pts; rank 2 = 8pts)
  const voteRes = await request.get(`${API_URL}/api/vote/${shareCode}`);
  const voteData = await voteRes.json() as {
    options: { label: string; bordaScore: number }[];
    bestRecommendation: {
      bestActivity: { label: string; score: number } | null;
      bestTime: { label: string; score: number } | null;
      totalVoters: number;
    };
  };
  expect(voteData.bestRecommendation.bestActivity?.label).toBe("Mini Golf");
  expect(voteData.bestRecommendation.bestActivity?.score).toBe(10);
  expect(voteData.bestRecommendation.bestTime?.label).toBe("Friday 7pm");
  expect(voteData.bestRecommendation.bestTime?.score).toBe(10);
  expect(voteData.bestRecommendation.totalVoters).toBe(2);
  const miniGolf = voteData.options.find((o) => o.label === "Mini Golf");
  const boardGames = voteData.options.find((o) => o.label === "Board Games");
  expect(miniGolf?.bordaScore).toBe(10);
  expect(boardGames?.bordaScore).toBe(8);
});

// Test 2: real-auth finalize — demo credentials, Alert patched, UI fires PUT
test("real-auth finalize: demo credentials → Alert-patched UI click → PUT → finalized detail + calendar", async ({
  page,
  request,
}) => {
  await request.post(`${API_URL}/api/vote/${shareCode}`, {
    data: {
      voterName: "E2EVoter",
      votes: [
        { optionId: actOpt1Id, rank: 1 },
        { optionId: actOpt2Id, rank: 2 },
        { optionId: timeOpt1Id, rank: 1 },
        { optionId: timeOpt2Id, rank: 2 },
      ],
    },
  });

  testSessionCookie = await loginAndForgeSession(request, API_URL, DEMO_EMAIL, DEMO_PASS);
  const authHeaders = {
    "Content-Type": "application/json",
    Cookie: `connect.sid=${encodeURIComponent(testSessionCookie)}`,
  };

  // Lock the activity first so clicking "Lock this in" on a time slot finalizes
  const lockRes = await fetch(`${API_URL}/api/hangouts/${planId}`, {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({ finalizedOptionId: actOpt1Id }),
  });
  expect(lockRes.ok).toBe(true);

  await injectAlertPatch(page);
  await injectAuthMocks(page);

  let capturedFinalizePayload: Record<string, unknown> | null = null;
  await installHangoutsProxy(
    page,
    testSessionCookie,
    (payload) => { capturedFinalizePayload = payload; },
    authHeaders,
  );

  await openDetailViaTab(page);

  await page.waitForFunction(
    () => document.body.innerText.includes("Lock this in"),
    undefined,
    { timeout: 10000 },
  );

  // Alert.alert is patched → confirm onPress fires synchronously → real PUT
  await page.getByText("Lock this in").first().click();

  await page.waitForFunction(
    () =>
      !document.body.innerText.includes("Lock this in") &&
      document.body.innerText.includes("Add to my calendar"),
    undefined,
    { timeout: 10000 },
  );

  // PUT must have come from the UI action
  expect(capturedFinalizePayload).not.toBeNull();

  // Verify the server persisted the finalized state (activity + time option)
  const [dbPlan] = await query(
    "SELECT status, finalized_option_id, finalized_time_option_id FROM hangout_plans WHERE id = $1",
    [planId],
  );
  expect(dbPlan.status).toBe("finalized");
  expect(dbPlan.finalized_option_id).toBe(actOpt1Id);
  expect(dbPlan.finalized_time_option_id).toBe(timeOpt1Id);

  const body = await page.evaluate(() => document.body.innerText);
  expect(body).not.toContain("Lock this in");
  await expect(page.getByText("Add to my calendar")).toBeVisible();
  await expect(page.getByText("Share with guests")).toBeVisible();

  // Verify "Add to my calendar" triggers the calendar endpoint
  await page.evaluate(() => {
    (window as Record<string, unknown>).__calUrl = null;
    window.open = (url?: string | URL) => {
      (window as Record<string, unknown>).__calUrl = String(url ?? "");
      return null;
    };
  });
  await page.getByText("Add to my calendar").first().click();
  const openedUrl = await page.evaluate(
    () => (window as Record<string, unknown>).__calUrl as string | null,
  );
  expect(openedUrl).toContain(`/api/hangouts/${planId}/calendar`);

  const calRes = await request.get(`${API_URL}/api/hangouts/${planId}/calendar`);
  expect(calRes.ok()).toBe(true);
  expect(calRes.headers()["content-type"]).toContain("text/calendar");
  const ics = await calRes.text();
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics).toContain("SUMMARY:E2E Detail Test Plan");
  expect(ics).toContain("END:VCALENDAR");
});

// Test 3: pre-finalized plan — real server data, calendar button visible
test("finalized hangout detail: calendar button visible, finalize controls hidden", async ({
  page,
  request,
}) => {
  testSessionCookie = await loginAndForgeSession(request, API_URL, DEMO_EMAIL, DEMO_PASS);
  const authHeaders = {
    "Content-Type": "application/json",
    Cookie: `connect.sid=${encodeURIComponent(testSessionCookie)}`,
  };

  // Finalize via two API calls matching the UI's two-step flow
  await fetch(`${API_URL}/api/hangouts/${planId}`, {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({ finalizedOptionId: actOpt1Id }),
  });
  await fetch(`${API_URL}/api/hangouts/${planId}`, {
    method: "PUT",
    headers: authHeaders,
    body: JSON.stringify({ finalizedTimeOptionId: timeOpt1Id, status: "finalized" }),
  });

  await injectAuthMocks(page);
  await installHangoutsProxy(page, testSessionCookie);
  await openDetailViaTab(page);

  await page.waitForFunction(
    () => document.body.innerText.includes("Add to my calendar"),
    undefined,
    { timeout: 8000 },
  );

  const body = await page.evaluate(() => document.body.innerText);
  expect(body).toContain("E2E Detail Test Plan");
  expect(body).toContain("Friday 7pm");
  expect(body).not.toContain("BEST PICKS SO FAR");
  expect(body).not.toContain("Lock this in");
  expect(body).not.toContain("Copy link");

  await expect(page.getByText("Add to my calendar")).toBeVisible();
  await expect(page.getByText("Share with guests")).toBeVisible();
});

// API-only tests — no browser required

test("GET /api/hangouts/:id/calendar returns valid ICS for a finalized hangout", async ({
  request,
}) => {
  await query(
    `INSERT INTO hangout_votes (option_id, plan_id, voter_name, rank)
     VALUES ($1, $2, 'Voter1', 1), ($3, $2, 'Voter1', 1)`,
    [actOpt1Id, planId, timeOpt1Id],
  );
  await query(
    `UPDATE hangout_plans
     SET status = 'finalized', finalized_option_id = $1, finalized_time_option_id = $2
     WHERE id = $3`,
    [actOpt1Id, timeOpt1Id, planId],
  );

  const res = await request.get(`${API_URL}/api/hangouts/${planId}/calendar`);
  expect(res.ok()).toBe(true);
  expect(res.headers()["content-type"]).toContain("text/calendar");
  const body = await res.text();
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain("SUMMARY:E2E Detail Test Plan");
  expect(body).toContain("BEGIN:VEVENT");
  expect(body).toContain("END:VCALENDAR");
});

test("GET /api/hangouts/:id/calendar returns 404 for a non-finalized hangout", async ({
  request,
}) => {
  const res = await request.get(`${API_URL}/api/hangouts/${planId}/calendar`);
  expect(res.status()).toBe(404);
});

test("GET /api/vote/:shareCode returns correct bestRecommendation after votes are cast", async ({
  request,
}) => {
  await request.post(`${API_URL}/api/vote/${shareCode}`, {
    data: {
      voterName: "RecommendVoter",
      votes: [
        { optionId: actOpt1Id, rank: 1 },
        { optionId: actOpt2Id, rank: 2 },
        { optionId: timeOpt1Id, rank: 1 },
        { optionId: timeOpt2Id, rank: 2 },
      ],
    },
  });

  const res = await request.get(`${API_URL}/api/vote/${shareCode}`);
  expect(res.ok()).toBe(true);
  const data = await res.json() as {
    options: { label: string; bordaScore: number }[];
    bestRecommendation: {
      bestActivity: { label: string; score: number } | null;
      bestTime: { label: string; score: number } | null;
      totalVoters: number;
    };
  };

  expect(data.bestRecommendation.bestActivity?.label).toBe("Mini Golf");
  expect(data.bestRecommendation.bestTime?.label).toBe("Friday 7pm");
  expect(data.bestRecommendation.totalVoters).toBe(1);

  const miniGolf = data.options.find((o) => o.label === "Mini Golf");
  expect(miniGolf!.bordaScore).toBeGreaterThan(0);
});
