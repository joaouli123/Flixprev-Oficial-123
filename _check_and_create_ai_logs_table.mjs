import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:JEQhzbSS76UKBUoF@db.gyqsvfwwgiarmhibdjyp.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function run() {
  try {
    // Check if table exists
    const check = await pool.query(
      `SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ai_request_logs')`
    );
    console.log('Table ai_request_logs exists:', check.rows[0].exists);

    if (!check.rows[0].exists) {
      console.log('Creating table ai_request_logs...');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ai_request_logs (
          id BIGSERIAL PRIMARY KEY,
          user_id TEXT,
          conversation_id INTEGER,
          request_type TEXT NOT NULL DEFAULT 'chat_completion',
          model TEXT,
          status TEXT NOT NULL DEFAULT 'success',
          prompt_tokens INTEGER NOT NULL DEFAULT 0,
          completion_tokens INTEGER NOT NULL DEFAULT 0,
          total_tokens INTEGER NOT NULL DEFAULT 0,
          cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
          error_message TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_ai_request_logs_created_at
          ON ai_request_logs(created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_ai_request_logs_user_id
          ON ai_request_logs(user_id, created_at DESC);
      `);
      console.log('Table ai_request_logs created successfully!');
    }

    // Also enable RLS and grant access so Supabase REST can use it
    console.log('Configuring RLS and grants...');
    await pool.query(`ALTER TABLE ai_request_logs ENABLE ROW LEVEL SECURITY;`).catch(() => {});
    
    // Policy for service_role to do everything
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_request_logs' AND policyname = 'service_role_all') THEN
          CREATE POLICY service_role_all ON ai_request_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
        END IF;
      END $$;
    `).catch(e => console.warn('Policy creation note:', e.message));
    
    // Grant to anon and authenticated for reads, service_role for all
    await pool.query(`GRANT ALL ON ai_request_logs TO service_role;`).catch(() => {});
    await pool.query(`GRANT SELECT ON ai_request_logs TO authenticated;`).catch(() => {});
    await pool.query(`GRANT SELECT ON ai_request_logs TO anon;`).catch(() => {});
    await pool.query(`GRANT USAGE, SELECT ON SEQUENCE ai_request_logs_id_seq TO service_role;`).catch(() => {});
    await pool.query(`GRANT INSERT, SELECT, UPDATE, DELETE ON ai_request_logs TO service_role;`).catch(() => {});
    
    console.log('RLS and grants configured.');

    // Verify it works
    const countResult = await pool.query('SELECT COUNT(*) FROM ai_request_logs');
    console.log('Current row count:', countResult.rows[0].count);

    // Test insert
    const testInsert = await pool.query(`
      INSERT INTO ai_request_logs (user_id, request_type, model, status, prompt_tokens, completion_tokens, total_tokens, cost_usd)
      VALUES ('test', 'test_check', 'test-model', 'success', 0, 0, 0, 0)
      RETURNING id
    `);
    console.log('Test insert OK, id:', testInsert.rows[0].id);
    
    // Clean up test
    await pool.query(`DELETE FROM ai_request_logs WHERE user_id = 'test' AND request_type = 'test_check'`);
    console.log('Test row cleaned up.');
    
    console.log('\n✅ ai_request_logs table is ready!');
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await pool.end();
  }
}

run();
