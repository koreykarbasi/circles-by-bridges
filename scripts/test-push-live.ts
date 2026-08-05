import { pool } from '../server/db';

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

async function testSendPush(token: string, title: string, body: string) {
  console.log(`\nSending to token: ${token.slice(0, 50)}...`);
  const payload = { to: token, title, body, sound: "default", data: {} };
  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  console.log(`HTTP status: ${res.status}`);
  console.log(`Response: ${text}`);
  return { status: res.status, body: text };
}

async function main() {
  // Get users with tokens
  const users = await pool.query(`
    SELECT id, email, push_token, notification_timezone
    FROM users WHERE push_token IS NOT NULL
  `);

  console.log(`Found ${users.rows.length} users with push tokens\n`);

  for (const user of users.rows) {
    console.log(`\n=== User: ${user.email} (${user.id.slice(0,8)}) ===`);
    console.log(`Token: ${user.push_token}`);
    console.log(`Timezone: ${user.notification_timezone}`);
    
    // Check what hour it is in their timezone
    const localHour = new Intl.DateTimeFormat("en-US", {
      timeZone: user.notification_timezone ?? "UTC",
      hour: "numeric",
      hour12: false,
    }).format(new Date());
    console.log(`Local hour: ${localHour}`);

    // Send a test push directly
    await testSendPush(
      user.push_token,
      "Bridges test push",
      `Test from server at ${new Date().toISOString()}`
    );
  }

  // Also check contacts for notification eligibility
  for (const user of users.rows) {
    console.log(`\n=== Contacts for ${user.email} ===`);
    
    const contacts = await pool.query(`
      SELECT id, name, circle_level, birthday, last_contacted,
        CASE WHEN birthday IS NOT NULL AND birthday != '' THEN
          -- days until birthday
          EXTRACT(DOY FROM (
            DATE_TRUNC('year', NOW()) + 
            (DATE_TRUNC('year', NOW()) + (TO_DATE(SUBSTRING(birthday, 6, 5), 'MM-DD') - DATE_TRUNC('year', NOW())) - DATE_TRUNC('year', NOW()))
          ) - EXTRACT(DOY FROM NOW()))::int
        ELSE NULL END as days_until_bday,
        CASE WHEN last_contacted IS NOT NULL THEN
          EXTRACT(DAY FROM NOW() - last_contacted::timestamptz)::int
        ELSE NULL END as days_since_contact
      FROM contacts 
      WHERE user_id = $1
      ORDER BY circle_level, name
      LIMIT 20
    `, [user.id]);

    console.log(`Circle 1 contacts: ${contacts.rows.filter(c => c.circle_level === 1).length}`);
    console.log(`Circle 2 contacts: ${contacts.rows.filter(c => c.circle_level === 2).length}`);
    console.log(`Circle 3 contacts: ${contacts.rows.filter(c => c.circle_level === 3).length}`);
    
    // Check for overdue check-ins
    const c1Overdue = contacts.rows.filter(c => 
      c.circle_level === 1 && (c.days_since_contact === null || c.days_since_contact > 17)
    );
    const c2Overdue = contacts.rows.filter(c => 
      c.circle_level === 2 && c.days_since_contact !== null && c.days_since_contact > 48
    );
    console.log(`C1 overdue for check-in (>17d): ${c1Overdue.length}`);
    console.log(`C2 overdue for check-in (>48d): ${c2Overdue.length}`);
    console.log('C1 overdue samples:', c1Overdue.slice(0,3).map(c => `${c.name}(${c.days_since_contact}d)`));
  }

  // Check if server_dist is outdated (look for wrong URL)
  const { execSync } = await import('child_process');
  try {
    const grepResult = execSync('grep -c "exp.host/api/v2" server_dist/index.js 2>/dev/null || echo "0"').toString().trim();
    const correctUrl = execSync('grep -c "exp.host/--/api/v2" server_dist/index.js 2>/dev/null || echo "0"').toString().trim();
    console.log(`\n=== server_dist URL check ===`);
    console.log(`Old wrong URL (exp.host/api/v2) occurrences: ${grepResult}`);
    console.log(`Correct URL (exp.host/--/api/v2) occurrences: ${correctUrl}`);
  } catch(e) {
    console.log('Could not check server_dist');
  }

  await pool.end();
}

main().catch(console.error);
