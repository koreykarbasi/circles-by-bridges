import { pool } from '../server/db';

async function main() {
  const users = await pool.query(`
    SELECT id, email, push_token, notification_timezone,
      suggestion_notif_frequency, suggestion_notif_time
    FROM users WHERE push_token IS NOT NULL
  `);
  console.log('USERS WITH TOKENS:');
  for (const u of users.rows) {
    console.log(`  ${u.id.slice(0,8)} | ${u.email} | tz=${u.notification_timezone} | token=${u.push_token}`);
  }

  // Test push all tokens right now
  const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
  console.log('\nTESTING ALL TOKENS:');
  for (const u of users.rows) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ to: u.push_token, title: "Bridges test", body: "Diagnostic test", sound: "default" }),
    });
    const body = await res.text();
    console.log(`  ${u.id.slice(0,8)} (${u.email}): HTTP ${res.status} → ${body}`);
  }

  await pool.end();
}
main().catch(console.error);
