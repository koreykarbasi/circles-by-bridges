const { Pool } = require('pg');
(async () => {
  const pool = new Pool({ connectionString: process.env.SUPABASE_URL || process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const userRes = await client.query("SELECT id FROM users LIMIT 1");
    const userId = userRes.rows[0].id;
    const shareCode = 'TESTCODE' + Date.now();
    const planRes = await client.query(
      `INSERT INTO hangout_plans (user_id, title, invitee_names, status, share_code, survey_mode)
       VALUES ($1, 'Test Hangout', $2, 'draft', $3, 'multiple') RETURNING id`,
      [userId, ['Alice','Bob'], shareCode]
    );
    const planId = planRes.rows[0].id;
    const opt1 = await client.query(`INSERT INTO hangout_options (plan_id, label, question_type) VALUES ($1,'Bowling','activity') RETURNING id`, [planId]);
    const opt2 = await client.query(`INSERT INTO hangout_options (plan_id, label, question_type) VALUES ($1,'Movies','activity') RETURNING id`, [planId]);
    console.log(JSON.stringify({shareCode, opt1: opt1.rows[0].id, opt2: opt2.rows[0].id}));
  } finally {
    client.release();
    await pool.end();
  }
})();
