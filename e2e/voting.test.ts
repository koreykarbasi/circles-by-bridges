import { test, expect } from "@playwright/test";
import { query, getDemoUserId, createTestSessionCookie, deleteTestSession } from "./helpers/db";

let planId: string;
let shareCode: string;
let actOpt1Id: string;
let actOpt2Id: string;
let timeOpt1Id: string;
let timeOpt2Id: string;

test.beforeEach(async () => {
  const userId = await getDemoUserId();
  shareCode = `e2evote${Date.now()}`;

  const [plan] = await query(
    `INSERT INTO hangout_plans
       (user_id, title, description, status, share_code, invitee_names, survey_mode, include_plus_one)
     VALUES ($1, $2, $3, 'active', $4, ARRAY['Alice','Bob'], 'standard', false)
     RETURNING id`,
    [userId, "E2E Vote Test Plan", "Automated test", shareCode],
  );
  planId = plan.id;

  [{ id: actOpt1Id }] = await query(
    "INSERT INTO hangout_options (plan_id, label, question_type) VALUES ($1, 'Bowling', 'activity') RETURNING id",
    [planId],
  );
  [{ id: actOpt2Id }] = await query(
    "INSERT INTO hangout_options (plan_id, label, question_type) VALUES ($1, 'Laser Tag', 'activity') RETURNING id",
    [planId],
  );
  [{ id: timeOpt1Id }] = await query(
    "INSERT INTO hangout_options (plan_id, label, question_type) VALUES ($1, 'Saturday 2pm', 'time') RETURNING id",
    [planId],
  );
  [{ id: timeOpt2Id }] = await query(
    "INSERT INTO hangout_options (plan_id, label, question_type) VALUES ($1, 'Sunday 4pm', 'time') RETURNING id",
    [planId],
  );
});

test.afterEach(async () => {
  if (planId) {
    await query("DELETE FROM hangout_votes WHERE plan_id = $1", [planId]);
    await query("DELETE FROM hangout_options WHERE plan_id = $1", [planId]);
    await query("DELETE FROM hangout_plans WHERE id = $1", [planId]);
  }
});

test("vote page renders plan details and options", async ({ page }) => {
  await page.goto(`/vote/${shareCode}`);

  await expect(page.locator("#app .logo-text")).toHaveText("Bridges");
  await expect(page.getByText("E2E Vote Test Plan")).toBeVisible();
  await expect(page.getByText(/survey by/i)).toBeVisible();
  await expect(page.getByText("Bowling")).toBeVisible();
  await expect(page.getByText("Laser Tag")).toBeVisible();
  await expect(page.getByText("Saturday 2pm")).toBeVisible();
  await expect(page.getByText("Sunday 4pm")).toBeVisible();

  const submitBtn = page.locator("#submitBtn");
  await expect(submitBtn).toBeDisabled();
});

test("submit button enables when voter name is entered", async ({ page }) => {
  await page.goto(`/vote/${shareCode}`);

  const submitBtn = page.locator("#submitBtn");
  await expect(submitBtn).toBeDisabled();

  await page.fill("#voterName", "TestVoter");
  await expect(submitBtn).toBeEnabled();
});

test("cast votes and verify Borda scores update", async ({ page, request }) => {
  // Pre-seed one voter and verify public results stay hidden while voting is open.
  // Each group has two choices: rank-1 = 2pts, rank-2 = 1pt.
  await request.post(`http://localhost:5000/api/vote/${shareCode}`, {
    headers: { "X-Forwarded-For": "198.51.100.54" },
    data: {
      voterName: "SeedVoter",
      votes: [
        { optionId: actOpt1Id, rank: 1 },
        { optionId: actOpt2Id, rank: 2 },
        { optionId: timeOpt1Id, rank: 1 },
        { optionId: timeOpt2Id, rank: 2 },
      ],
    },
  });

  await page.route(`**/api/vote/${shareCode}`, (route) => route.continue({
    headers: { ...route.request().headers(), "x-forwarded-for": "198.51.100.55" },
  }));
  await page.goto(`/vote/${shareCode}`);
  await page.fill("#voterName", "BordaVoter");
  await page.click("#submitBtn");

  await expect(page.getByText("Thanks for voting!")).toBeVisible({ timeout: 8000 });

  const pageText = await page.evaluate(() => document.body.innerText);
  expect(pageText).not.toContain(" pts");

  // Verify the UI submission was persisted
  const [row] = await query(
    "SELECT COUNT(*) AS cnt FROM hangout_votes WHERE plan_id = $1 AND voter_name = $2",
    [planId, "BordaVoter"],
  );
  expect(Number(row.cnt)).toBeGreaterThanOrEqual(1);
});

test("public API returns Borda scores after vote is cast", async ({
  request,
}) => {
  await request.post(`/api/vote/${shareCode}`, {
    headers: { "X-Forwarded-For": "198.51.100.53" },
    data: {
      voterName: "APIVoter",
      votes: [
        { optionId: actOpt1Id, rank: 1 },
        { optionId: actOpt2Id, rank: 2 },
        { optionId: timeOpt1Id, rank: 1 },
        { optionId: timeOpt2Id, rank: 2 },
      ],
    },
  });
  // Live tallies are intentionally private until voting closes.
  await query("UPDATE hangout_plans SET status = 'finalized' WHERE id = $1", [planId]);

  const res = await request.get(`/api/vote/${shareCode}`);
  expect(res.ok()).toBe(true);

  const data = await res.json();
  expect(data.title).toBe("E2E Vote Test Plan");

  // With 1 voter and two choices per group: rank 1 = 2pts, rank 2 = 1pt.
  const options = data.options as { id: string; label: string; bordaScore: number }[];
  const bowling = options.find((o) => o.id === actOpt1Id);
  const laserTag = options.find((o) => o.id === actOpt2Id);
  const sat2pm = options.find((o) => o.id === timeOpt1Id);
  const sun4pm = options.find((o) => o.id === timeOpt2Id);
  expect(bowling?.bordaScore).toBe(2);
  expect(laserTag?.bordaScore).toBe(1);
  expect(sat2pm?.bordaScore).toBe(2);
  expect(sun4pm?.bordaScore).toBe(1);

  const rec = data.bestRecommendation;
  expect(rec.bestActivity.label).toBe("Bowling");
  expect(rec.bestActivity.score).toBe(2);
  expect(rec.bestTime.label).toBe("Saturday 2pm");
  expect(rec.bestTime.score).toBe(2);
  expect(rec.totalVoters).toBe(1);
});

test("one shared link accepts invitees and more than three other names with no implicit cap", async ({ request }) => {
  const headers = { "X-Forwarded-For": "198.51.100.51" };
  const votes = [
    { optionId: actOpt1Id, rank: 1 },
    { optionId: actOpt2Id, rank: 2 },
    { optionId: timeOpt1Id, rank: 1 },
    { optionId: timeOpt2Id, rank: 2 },
  ];
  for (const name of ["Alice", "Bob", "Carol", "Dave", "Eve", "Frank"]) {
    const response = await request.post(`/api/vote/${shareCode}`, { headers, data: { voterName: name, votes } });
    expect(response.status(), `${name}: ${await response.text()}`).toBe(201);
  }
  const result = await (await request.get(`/api/vote/${shareCode}`)).json();
  expect(result.bestRecommendation).toBeNull();
  expect(result.voteLimit).toBeNull();
  expect(result).not.toHaveProperty("resolvedVoterName");
  expect(result).not.toHaveProperty("requiresToken");
  const [count] = await query(
    "SELECT COUNT(DISTINCT lower(voter_name)) AS count FROM hangout_votes WHERE plan_id = $1",
    [planId],
  );
  expect(Number(count.count)).toBe(6);
});

test("optional cap counts distinct names, not invited contacts, and still permits a ballot update", async ({ request }) => {
  await query("UPDATE hangout_plans SET vote_limit = 2 WHERE id = $1", [planId]);
  const votes = [
    { optionId: actOpt1Id, rank: 1 },
    { optionId: actOpt2Id, rank: 2 },
    { optionId: timeOpt1Id, rank: 1 },
    { optionId: timeOpt2Id, rank: 2 },
  ];
  const submit = (voterName: string) => request.post(`/api/vote/${shareCode}`, {
    headers: { "X-Forwarded-For": "198.51.100.52" },
    data: { voterName, votes },
  });
  expect((await submit("Someone not invited")).status()).toBe(201);
  expect((await submit("Another person")).status()).toBe(201);
  expect((await submit("Alice")).status()).toBe(400);
  expect((await submit("someone not invited")).status()).toBe(201);
  const [count] = await query(
    "SELECT COUNT(DISTINCT lower(voter_name)) AS count FROM hangout_votes WHERE plan_id = $1",
    [planId],
  );
  expect(Number(count.count)).toBe(2);
});

test("creator can make a survey without selecting friends or setting a limit", async ({ request }) => {
  const cookie = await createTestSessionCookie(await getDemoUserId());
  let createdId: string | undefined;
  try {
    const response = await request.post("/api/hangouts", {
      headers: { Cookie: `connect.sid=${encodeURIComponent(cookie)}` },
      data: {
        title: "Unlisted test survey",
        inviteeNames: [],
        voteLimit: null,
        surveyMode: "standard",
        options: [
          { label: "Walk", questionType: "activity" },
          { label: "Tomorrow", questionType: "time" },
        ],
      },
    });
    expect(response.status(), await response.text()).toBe(201);
    const plan = await response.json();
    createdId = plan.id;
    expect(plan.inviteeNames).toEqual([]);
    expect(plan.voteLimit).toBeNull();
    expect(plan).not.toHaveProperty("voterTokens");
  } finally {
    if (createdId) {
      await query("DELETE FROM hangout_options WHERE plan_id = $1", [createdId]);
      await query("DELETE FROM hangout_plans WHERE id = $1", [createdId]);
    }
    await deleteTestSession(cookie);
  }
});

test("X rejects activity and date, submits null ranks and compacts the remaining ranks", async ({ page }) => {
  await page.route(`**/api/vote/${shareCode}`, (route) => route.continue({
    headers: { ...route.request().headers(), "x-forwarded-for": "198.51.100.56" },
  }));
  await page.goto(`/vote/${shareCode}`);
  await page.fill("#voterName", "RejectTester");
  await page.locator(`#card-${actOpt1Id} .reject-btn`).click();
  await page.locator(`#card-${timeOpt1Id} .reject-btn`).click();
  await expect(page.locator(`#card-${actOpt1Id}`)).toHaveClass(/rejected/);
  await expect(page.locator(`#card-${timeOpt1Id}`)).toHaveClass(/rejected/);
  await expect(page.locator(`#card-${actOpt2Id} .rank-num`)).toHaveText("1");
  await expect(page.locator(`#card-${timeOpt2Id} .rank-num`)).toHaveText("1");
  await page.click("#submitBtn");
  await expect(page.getByText("Thanks for voting!")).toBeVisible();
  const rows = await query(
    "SELECT option_id, rank FROM hangout_votes WHERE plan_id = $1 AND voter_name = 'RejectTester'",
    [planId],
  );
  const ranks = Object.fromEntries(rows.map((row) => [row.option_id, row.rank]));
  expect(ranks[actOpt1Id]).toBeNull();
  expect(ranks[timeOpt1Id]).toBeNull();
  expect(ranks[actOpt2Id]).toBe(1);
  expect(ranks[timeOpt2Id]).toBe(1);
});

test("finalized plan shows finalized banner on vote page", async ({ page }) => {
  await query(
    "UPDATE hangout_plans SET status = $1, finalized_option_id = $2, finalized_time_option_id = $3 WHERE id = $4",
    ["finalized", actOpt1Id, timeOpt1Id, planId],
  );

  await page.goto(`/vote/${shareCode}`);

  await expect(page.getByText(/plan finalized/i)).toBeVisible();

  await expect(page.getByText(/Bowling/).first()).toBeVisible();
});
