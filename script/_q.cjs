const{Pool}=require('pg');require('dotenv').config();
const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
p.query(`
  SELECT a.id, a.title, a.role, length(a.instructions) AS instr_len,
    (SELECT count(*)::int FROM document_chunks dc WHERE dc.agent_id=a.id) AS chunks
  FROM agents a
  WHERE a.user_id IS NULL
    AND (a.title ILIKE '%DirTrab%' OR a.title ILIKE '%AtosTr%' OR a.title ILIKE '%NR%Pro%'
      OR a.title ILIKE '%mulasC%' OR a.title ILIKE '%PrecedentX%' OR a.title ILIKE '%JurisPrud%')
  ORDER BY a.title
`).then(r=>{console.table(r.rows);p.end()}).catch(e=>{console.error(e.message);p.end()});
