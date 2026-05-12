import { test, expect } from "@playwright/test";
import { query, getDemoUserId } from "./helpers/db";

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

  await expect(page.getByText("Bridges")).toBeVisible();
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
  // Pre-seed one voter so the results page shows known scores after UI submission.
  // MAX_RANK=5: Bowling rank-1 = 5pts, Laser Tag rank-2 = 4pts (one voter each)
  await request.post(`http://localhost:5000/api/vote/${shareCode}`, {
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

  await page.goto(`/vote/${shareCode}`);
  await page.fill("#voterName", "BordaVoter");
  await page.click("#submitBtn");

  await expect(page.getByText("Thanks for voting!")).toBeVisible({ timeout: 8000 });

  // Results show cumulative scores from 2 voters, each submitting default ranks (rank 1 = 5pts, rank 2 = 4pts)
  // SeedVoter (API) + BordaVoter (UI, default position order): Bowling = 5+5 = 10pts, LaserTag = 4+4 = 8pts
  await expect(page.getByText(/pts/).first()).toBeVisible({ timeout: 5000 });
  const pageText = await page.evaluate(() => document.body.innerText);
  expect(pageText).toContain("10 pts");
  expect(pageText).toContain("8 pts");

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

  const res = await request.get(`/api/vote/${shareCode}`);
  expect(res.ok()).toBe(true);

  const data = await res.json();
  expect(data.title).toBe("E2E Vote Test Plan");

  // With 1 voter and MAX_RANK=5: rank 1 = (5+1-1)=5pts, rank 2 = (5+1-2)=4pts
  const options = data.options as { id: string; label: string; bordaScore: number }[];
  const bowling = options.find((o) => o.id === actOpt1Id);
  const laserTag = options.find((o) => o.id === actOpt2Id);
  const sat2pm = options.find((o) => o.id === timeOpt1Id);
  const sun4pm = options.find((o) => o.id === timeOpt2Id);
  expect(bowling?.bordaScore).toBe(5);
  expect(laserTag?.bordaScore).toBe(4);
  expect(sat2pm?.bordaScore).toBe(5);
  expect(sun4pm?.bordaScore).toBe(4);

  const rec = data.bestRecommendation;
  expect(rec.bestActivity.label).toBe("Bowling");
  expect(rec.bestActivity.score).toBe(5);
  expect(rec.bestTime.label).toBe("Saturday 2pm");
  expect(rec.bestTime.score).toBe(5);
  expect(rec.totalVoters).toBe(1);
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
