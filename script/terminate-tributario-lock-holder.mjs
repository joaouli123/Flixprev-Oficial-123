import dotenv from "dotenv";
import pkg from "pg";
dotenv.config();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const pid = 264987;
const r = await pool.query("SELECT pg_terminate_backend($1) AS terminated", [pid]);
console.log(r.rows[0]);
await pool.end();
