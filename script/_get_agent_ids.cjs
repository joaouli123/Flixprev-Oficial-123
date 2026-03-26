require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const names = [
  'DTrib', 'FedTax', 'CTN Expert', 'REFIS-IA',
  'Regime Próprio de Previdência Social',
  '25% Sobre Aposentadoria por Incapacidade Permanente',
  'Regras de Transição'
];
p.query("SELECT id, title FROM agents WHERE title = ANY($1::text[]) ORDER BY title", [names])
  .then(r => { r.rows.forEach(a => console.log(a.id + ' | ' + a.title)); p.end(); })
  .catch(e => { console.error(e); p.end(); });
