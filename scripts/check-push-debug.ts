import { pool } from '../server/db';

async function main() {
  // Get actual columns in users table
  const userCols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'users'
    ORDER BY ordinal_position
  `);
  console.log('ACTUAL users TABLE COLUMNS:');
  userCols.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

  // Get actual notification_log columns
  const logCols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'notification_log'
    ORDER BY ordinal_position
  `);
  console.log('\nACTUAL notification_log COLUMNS:');
  logCols.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

  // Get users with push_token
  const users = await pool.query(`
    SELECT id, email, 
      LEFT(push_token, 60) as token_prefix, 
      LENGTH(push_token) as token_len,
      notification_timezone
    FROM users WHERE push_token IS NOT NULL
  `);
  console.log('\nUSERS WITH TOKENS:');
  console.log(JSON.stringify(users.rows, null, 2));

  // Recent notification log
  const logs = await pool.query(`
    SELECT user_id, contact_id, notif_type, sent_at 
    FROM notification_log 
    ORDER BY sent_at DESC 
    LIMIT 20
  `);
  console.log('\nRECENT NOTIFICATION LOG:');
  console.log(JSON.stringify(logs.rows, null, 2));

  // Check if suggestion columns exist
  try {
    const sug = await pool.query(`SELECT id, suggestion_notif_frequency, suggestion_notif_time FROM users LIMIT 3`);
    console.log('\nsuggestion_notif columns EXIST:', JSON.stringify(sug.rows, null, 2));
  } catch(e: any) {
    console.log('\nsuggestion_notif columns MISSING:', e.message);
  }

  await pool.end();
}
main().catch(console.error);
