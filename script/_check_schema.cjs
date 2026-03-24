const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
p.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='agents' ORDER BY ordinal_position")
  .then(r => { console.log(r.rows.map(c => c.column_name + ' (' + c.data_type + ')').join('\n')); p.end(); })
  .catch(e => { console.error(e.message); p.end(); });
