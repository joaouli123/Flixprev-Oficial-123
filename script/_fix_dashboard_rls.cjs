const { Pool } = require('pg');
const p = new Pool({
  connectionString: 'postgresql://postgres:JEQhzbSS76UKBUoF@db.gyqsvfwwgiarmhibdjyp.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function main() {
  try {
    // Disable RLS on usuarios and subscriptions — app uses custom auth, not Supabase JWT
    // Server enforces access control via isAdminUser() before exposing data
    // This matches the existing approach for profiles, categories, agents, custom_links
    console.log('Disabling RLS on usuarios and subscriptions...');

    await p.query('ALTER TABLE public.usuarios DISABLE ROW LEVEL SECURITY');
    console.log('  usuarios => RLS DISABLED');

    await p.query('ALTER TABLE public.subscriptions DISABLE ROW LEVEL SECURITY');
    console.log('  subscriptions => RLS DISABLED');

    // Verify
    const r = await p.query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('profiles','usuarios','subscriptions')
      ORDER BY tablename
    `);
    console.log('\nVerification:');
    r.rows.forEach(row => console.log(' ', row.tablename, '=>', row.rowsecurity ? 'ENABLED' : 'DISABLED'));
    console.log('\nDone!');
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await p.end();
  }
}

main();
