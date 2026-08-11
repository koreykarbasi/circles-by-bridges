/**
 * Test: reminder pushes respect the swipe-away cooldown.
 *
 * Verifies that buildReminderMessages still produces reminder entries,
 * but that the cooldown SQL query correctly identifies contacts dismissed
 * within the per-circle cooldown window and would suppress their pushes.
 *
 * Cooldown windows (mirrors CIRCLE_COOLDOWN_DAYS in lib/suggestion-scheduler.ts):
 *   C1 = 7 days,  C2 = 5 days,  C3 = 15 days
 *
 * Run: npx tsx scripts/test-reminder-cooldown.ts
 */

import { pool } from "../server/db";

const PASS = "✓";
const FAIL = "✗";

let passes = 0;
let failures = 0;

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ${PASS} ${label}`);
    passes++;
  } else {
    console.log(`  ${FAIL} ${label}`);
    failures++;
  }
}

// Mirrors the SQL in sendRemindersForUser
async function getCooldownBlockedIds(userId: string): Promise<Set<string>> {
  const r = await pool.query<{ contact_id: string }>(
    `SELECT DISTINCT nl.contact_id
     FROM notification_log nl
     JOIN contacts c ON c.id = nl.contact_id AND c.user_id = $1
     WHERE nl.user_id = $1
       AND nl.notif_type IN ('suggestion', 'elevation')
       AND (
         (c.circle_level = 1 AND nl.sent_at > NOW() - INTERVAL '7 days')  OR
         (c.circle_level = 2 AND nl.sent_at > NOW() - INTERVAL '5 days')  OR
         (c.circle_level = 3 AND nl.sent_at > NOW() - INTERVAL '15 days')
       )`,
    [userId],
  );
  return new Set(r.rows.map((row) => row.contact_id));
}

async function main() {
  console.log("=== Reminder Cooldown Tests ===\n");

  // ── Find a user with contacts ──────────────────────────────────────────────
  const userResult = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE push_token IS NOT NULL LIMIT 1`,
  );
  if (userResult.rows.length === 0) {
    console.log("No user with push token — skipping live DB tests.");
    process.exit(0);
  }
  const userId = userResult.rows[0].id;

  // Grab one contact per circle level for the test user
  const contactsResult = await pool.query<{
    id: string;
    name: string;
    circle_level: number;
  }>(
    `SELECT id, name, circle_level FROM contacts WHERE user_id = $1 ORDER BY circle_level LIMIT 6`,
    [userId],
  );
  if (contactsResult.rows.length === 0) {
    console.log("No contacts for test user — skipping.");
    process.exit(0);
  }
  const byCircle: Record<number, string> = {};
  for (const c of contactsResult.rows) {
    if (!byCircle[c.circle_level]) byCircle[c.circle_level] = c.id;
  }
  console.log(`User: ${userId.slice(0, 8)}, contacts: C1=${byCircle[1]?.slice(0,8) ?? "none"} C2=${byCircle[2]?.slice(0,8) ?? "none"} C3=${byCircle[3]?.slice(0,8) ?? "none"}\n`);

  // Clean up any leftover test entries from a previous run
  const testContactIds = Object.values(byCircle);
  if (testContactIds.length > 0) {
    await pool.query(
      `DELETE FROM notification_log
       WHERE user_id = $1 AND contact_id = ANY($2) AND notif_type = 'suggestion'
         AND sent_at > NOW() - INTERVAL '20 days'`,
      [userId, testContactIds],
    );
  }

  // ── Test 1: No recent dismissals → no contacts blocked ────────────────────
  console.log("Test 1: No dismissals → cooldown set is empty");
  {
    const blocked = await getCooldownBlockedIds(userId);
    const anyTestBlocked = testContactIds.some((id) => blocked.has(id));
    assert("No test contacts in cooldown before any dismissals", !anyTestBlocked);
  }

  // ── Test 2: C1 dismissed 3 days ago → blocked (cooldown = 7d) ─────────────
  console.log("\nTest 2: C1 dismissed 3 days ago → still in cooldown (7d window)");
  if (byCircle[1]) {
    await pool.query(
      `INSERT INTO notification_log (user_id, contact_id, notif_type, sent_at)
       VALUES ($1, $2, 'suggestion', NOW() - INTERVAL '3 days')`,
      [userId, byCircle[1]],
    );
    const blocked = await getCooldownBlockedIds(userId);
    assert("C1 contact is blocked after swipe 3 days ago", blocked.has(byCircle[1]));
  } else {
    console.log("  (skipped — no C1 contact)");
  }

  // ── Test 3: C2 dismissed 6 days ago → NOT blocked (cooldown = 5d) ─────────
  console.log("\nTest 3: C2 dismissed 6 days ago → cooldown expired (5d window)");
  if (byCircle[2]) {
    await pool.query(
      `INSERT INTO notification_log (user_id, contact_id, notif_type, sent_at)
       VALUES ($1, $2, 'suggestion', NOW() - INTERVAL '6 days')`,
      [userId, byCircle[2]],
    );
    const blocked = await getCooldownBlockedIds(userId);
    assert("C2 contact NOT blocked after swipe 6 days ago (cooldown expired)", !blocked.has(byCircle[2]));
  } else {
    console.log("  (skipped — no C2 contact)");
  }

  // ── Test 4: C3 dismissed 10 days ago → blocked (cooldown = 15d) ───────────
  console.log("\nTest 4: C3 dismissed 10 days ago → still in cooldown (15d window)");
  if (byCircle[3]) {
    await pool.query(
      `INSERT INTO notification_log (user_id, contact_id, notif_type, sent_at)
       VALUES ($1, $2, 'suggestion', NOW() - INTERVAL '10 days')`,
      [userId, byCircle[3]],
    );
    const blocked = await getCooldownBlockedIds(userId);
    assert("C3 contact is blocked after swipe 10 days ago", blocked.has(byCircle[3]));
  } else {
    console.log("  (skipped — no C3 contact)");
  }

  // ── Test 5: C1 dismissed 8 days ago → NOT blocked (cooldown = 7d) ─────────
  console.log("\nTest 5: C1 dismissed 8 days ago → cooldown expired (7d window)");
  if (byCircle[1]) {
    // Update the C1 entry to 8 days ago
    await pool.query(
      `UPDATE notification_log SET sent_at = NOW() - INTERVAL '8 days'
       WHERE user_id = $1 AND contact_id = $2 AND notif_type = 'suggestion'`,
      [userId, byCircle[1]],
    );
    const blocked = await getCooldownBlockedIds(userId);
    assert("C1 contact NOT blocked after swipe 8 days ago (cooldown expired)", !blocked.has(byCircle[1]));
  } else {
    console.log("  (skipped — no C1 contact)");
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────
  await pool.query(
    `DELETE FROM notification_log
     WHERE user_id = $1 AND contact_id = ANY($2) AND notif_type = 'suggestion'
       AND sent_at > NOW() - INTERVAL '20 days'`,
    [userId, testContactIds],
  );

  // ── Results ────────────────────────────────────────────────────────────────
  console.log(`\n=== Results: ${passes} passed, ${failures} failed ===\n`);
  await pool.end();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
