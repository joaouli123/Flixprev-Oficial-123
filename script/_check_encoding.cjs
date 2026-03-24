const { Pool } = require('pg');
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function check() {
  // Check a Salário-Maternidade chunk for encoding issues
  const r = await p.query(`
    SELECT content FROM document_chunks 
    WHERE agent_id = (SELECT id FROM agents WHERE lower(title)='salário-maternidade' AND user_id IS NULL LIMIT 1)
    AND content ILIKE '%maternidade%'
    LIMIT 3
  `);
  
  for (let i = 0; i < r.rowCount; i++) {
    const c = r.rows[i].content;
    console.log(`\n--- CHUNK ${i+1} (first 500 chars) ---`);
    console.log(c.substring(0, 500));
    // Check for garbled chars
    const hasGarbled = /[^\x00-\x7F]/.test(c) ? 'Has non-ASCII' : 'ASCII-only';
    const hasMojibake = /\uFFFD|ã|ç|é|ó|á|â|ê|ô|í|ú/.test(c) ? 'HAS proper accents' : 'NO proper accents';
    const hasReplacementChar = c.includes('\uFFFD') ? 'HAS REPLACEMENT CHARS (U+FFFD)' : 'No replacement chars';
    console.log(`\n  Encoding check: ${hasGarbled} | ${hasMojibake} | ${hasReplacementChar}`);
    
    // Also check specific chars
    const accented = c.match(/[àáâãäéêëíîïóôõöúûü]/g);
    const question_marks = c.match(/\uFFFD/g);
    console.log(`  Accented chars found: ${accented ? accented.length : 0}`);
    console.log(`  Replacement U+FFFD chars found: ${question_marks ? question_marks.length : 0}`);
  }

  // Compare with ACP chunks (which showed clean text)
  const r2 = await p.query(`
    SELECT content FROM document_chunks 
    WHERE agent_id = (SELECT id FROM agents WHERE lower(title)='ações civis públicas inss' AND user_id IS NULL LIMIT 1)
    LIMIT 1
  `);
  if (r2.rowCount) {
    console.log(`\n--- ACP CHUNK (first 500 chars) ---`);
    console.log(r2.rows[0].content.substring(0, 500));
    const c2 = r2.rows[0].content;
    const accented2 = c2.match(/[àáâãäéêëíîïóôõöúûüçÁÉÍÓÚÃÕÂÊÔÇ]/g);
    console.log(`  Accented chars: ${accented2 ? accented2.length : 0}`);
  }

  await p.end();
}

check().catch(e => { console.error(e); p.end(); });
