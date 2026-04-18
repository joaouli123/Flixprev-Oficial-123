import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:JEQhzbSS76UKBUoF@db.gyqsvfwwgiarmhibdjyp.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function run() {
  try {
    // Grant INSERT to anon and authenticated
    await pool.query('GRANT INSERT ON ai_request_logs TO anon');
    await pool.query('GRANT INSERT ON ai_request_logs TO authenticated');
    await pool.query('GRANT ALL ON ai_request_logs TO anon');
    await pool.query('GRANT ALL ON ai_request_logs TO authenticated');
    await pool.query('GRANT USAGE, SELECT ON SEQUENCE ai_request_logs_id_seq TO anon');
    await pool.query('GRANT USAGE, SELECT ON SEQUENCE ai_request_logs_id_seq TO authenticated');
    console.log('Grants OK');

    // Create RLS policies
    await pool.query('DROP POLICY IF EXISTS anon_insert ON ai_request_logs');
    await pool.query('DROP POLICY IF EXISTS anon_select ON ai_request_logs');
    await pool.query('DROP POLICY IF EXISTS authenticated_all ON ai_request_logs');
    
    await pool.query("CREATE POLICY anon_insert ON ai_request_logs FOR INSERT TO anon WITH CHECK (true)");
    await pool.query("CREATE POLICY anon_select ON ai_request_logs FOR SELECT TO anon USING (true)");
    await pool.query("CREATE POLICY authenticated_all ON ai_request_logs FOR ALL TO authenticated USING (true) WITH CHECK (true)");
    console.log('Policies OK');

    console.log('✅ Done - ai_request_logs is fully accessible via Supabase REST');
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
  }
}

run();
