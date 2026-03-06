import dotenv from "dotenv";
import pkg from "pg";
dotenv.config();
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  // Count agents
  const agents = await pool.query("SELECT count(*) as total FROM agents");
  console.log("Agents no banco:", agents.rows[0].total);

  // Count categories
  const cats = await pool.query("SELECT count(*) as total FROM categories");
  console.log("Categories no banco:", cats.rows[0].total);

  // Sample agents
  const sample = await pool.query("SELECT id, title FROM agents LIMIT 5");
  console.log("\nPrimeiros agentes:");
  sample.rows.forEach(r => console.log(`  - ${r.title} (${r.id})`));

  // Sample categories
  const csample = await pool.query("SELECT id, name FROM categories LIMIT 5");
  console.log("\nPrimeiras categorias:");
  csample.rows.forEach(r => console.log(`  - ${r.name} (${r.id})`));

  // RLS status
  const rls = await pool.query(
    "SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('agents','categories','custom_links')"
  );
  console.log("\nRLS status:");
  rls.rows.forEach(r => console.log(`  ${r.tablename}: RLS=${r.rowsecurity}`));

  // Check RLS policies
  const policies = await pool.query(
    "SELECT tablename, policyname, permissive, roles, cmd FROM pg_policies WHERE tablename IN ('agents','categories','custom_links')"
  );
  console.log("\nPolicies:");
  if (policies.rows.length === 0) {
    console.log("  NENHUMA policy encontrada!");
  } else {
    policies.rows.forEach(r => console.log(`  ${r.tablename}: ${r.policyname} (${r.cmd}) roles=${r.roles} permissive=${r.permissive}`));
  }
} catch (err) {
  console.error("Erro:", err.message);
} finally {
  await pool.end();
}
