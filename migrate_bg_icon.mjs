import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  try {
    await pool.query('ALTER TABLE IF EXISTS public.agents ADD COLUMN IF NOT EXISTS bg_icon text;');
    console.log('Migration successful');
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
run();
