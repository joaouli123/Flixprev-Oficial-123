require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const failedNames = [
  '25% Sobre Aposentadoria por Incapacidade Permanente',
  'Auxílio-Acidente',
  'Aposentadoria da Pessoa com Deficiência',
  'Benefício de Prestação Continuada',
  'Agente AtosTr',
  'Aposentadoria por Idade Urbana',
  'Salário-Família',
  'Carência e Qualidade de Segurado',
  'Manutenção de Benefícios',
];

(async () => {
  const r = await pool.query(
    `SELECT a.id, a.title, count(dc.id)::int AS chunks
     FROM agents a
     JOIN documents d ON d.agent_id = a.id
     JOIN document_chunks dc ON dc.document_id = d.id
     GROUP BY a.id, a.title HAVING count(dc.id) >= 10
     ORDER BY a.title`
  );
  
  const matched = r.rows.filter(a => failedNames.some(n => a.title.includes(n) || n.includes(a.title)));
  console.log('Matched agents:');
  matched.forEach(a => console.log(a.id + ' | ' + a.title + ' | ' + a.chunks + ' chunks'));
  console.log('\\nIDs for --agent-ids:');
  console.log(matched.map(a => a.id).join(','));
  
  await pool.end();
})().catch(e => { console.error(e); pool.end(); });
