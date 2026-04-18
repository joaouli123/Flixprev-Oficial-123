const { Pool } = require('pg');
const p = new Pool({
  connectionString: 'postgresql://postgres:JEQhzbSS76UKBUoF@db.gyqsvfwwgiarmhibdjyp.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function main() {
  try {
    const r = await p.query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('profiles','usuarios','subscriptions','conversations','messages','ai_request_logs','platform_action_events')
      ORDER BY tablename
    `);
    console.log('RLS Status:');
    r.rows.forEach(row => console.log(' ', row.tablename, '=>', row.rowsecurity ? 'ENABLED' : 'DISABLED'));
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await p.end();
  }
}

main();
