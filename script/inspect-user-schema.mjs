import dotenv from "dotenv";
import pkg from "pg";

dotenv.config();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const tables = await pool.query(`
  SELECT table_schema, table_name
  FROM information_schema.tables
  WHERE table_schema='public' AND table_name IN ('profiles','usuarios','subscriptions')
  ORDER BY table_name;
`);
console.log('TABLES:', tables.rows);

for (const t of ['profiles','usuarios']) {
  const cols = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
    ORDER BY ordinal_position;
  `, [t]);
  console.log(`COLUMNS ${t}:`, cols.rows);
}

await pool.end();
