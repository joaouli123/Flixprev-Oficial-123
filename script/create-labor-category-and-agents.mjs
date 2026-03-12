import dotenv from 'dotenv';
import crypto from 'crypto';
import pkg from 'pg';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const userId = '07d16581-fca5-4709-b0d3-e09859dbb286';
const categoryName = 'Direito Trabalhista';

const agents = [
  { title: 'Agente DirTrab', role: 'Macro Direito Trabalhista', description: 'Agente macro de Direito Trabalhista.' },
  { title: 'Agente AcordCore', role: 'Acordos Trabalhistas', description: 'Núcleo de acordos e composição trabalhista.' },
  { title: 'Agente AtosTr', role: 'Atos Trabalhistas', description: 'Busca e organização de atos administrativos e instruções normativas trabalhistas.' },
  { title: 'Agente JurisPrud', role: 'Jurisprudência Trabalhista', description: 'Atalho direto para consulta oficial de jurisprudência trabalhista.', link: 'https://jurisprudencia.jt.jus.br' },
  { title: 'Agente NR.sPro', role: 'Normas Regulamentadoras', description: 'Especialista em NRs aplicáveis ao Direito do Trabalho.' },
  { title: 'Agente SúmulasTr', role: 'Súmulas Trabalhistas', description: 'Especialista em súmulas trabalhistas.' },
  { title: 'Agente JurisPrud 2', role: 'Jurisprudência Trabalhista', description: 'Pesquisa de jurisprudência trabalhista (camada complementar).' },
  { title: 'Agente PrecedentX', role: 'Precedentes Trabalhistas', description: 'Mapeamento de precedentes e linhas de decisão trabalhista.' },
  { title: 'Agente SúmulasCore', role: 'Súmulas Core', description: 'Consolidação de súmulas centrais para estratégia trabalhista.' }
];

async function main() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let categoryId;
    const cat = await client.query(
      'SELECT id FROM categories WHERE user_id = $1 AND lower(name) = lower($2) ORDER BY created_at DESC LIMIT 1',
      [userId, categoryName]
    );

    if (cat.rowCount > 0) {
      categoryId = cat.rows[0].id;
    } else {
      categoryId = crypto.randomUUID();
      await client.query(
        'INSERT INTO categories (id, name, user_id) VALUES ($1, $2, $3)',
        [categoryId, categoryName, userId]
      );
    }

    let created = 0;
    let reused = 0;

    for (const agent of agents) {
      const exists = await client.query(
        'SELECT id FROM agents WHERE user_id = $1 AND lower(title) = lower($2) LIMIT 1',
        [userId, agent.title]
      );

      if (exists.rowCount > 0) {
        reused += 1;
        continue;
      }

      await client.query(
        `INSERT INTO agents (
          id, user_id, title, role, description, instructions,
          icon, category_ids, shortcuts, attachments, link
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          crypto.randomUUID(),
          userId,
          agent.title,
          agent.role,
          agent.description,
          'Responda apenas com base no conteúdo documental deste agente. Se não encontrar, diga explicitamente que não encontrou nos documentos do agente.',
          'Scale',
          [categoryId],
          ['Resumo', 'Base legal', 'Checklist', 'Riscos'],
          [],
          agent.link || null,
        ]
      );
      created += 1;
    }

    await client.query('COMMIT');

    const summary = await client.query(
      'SELECT (SELECT COUNT(*)::int FROM categories WHERE user_id = $1) AS categories, (SELECT COUNT(*)::int FROM agents WHERE user_id = $1) AS agents',
      [userId]
    );

    console.log(
      JSON.stringify(
        {
          success: true,
          userId,
          categoryId,
          category: categoryName,
          created,
          reused,
          totals: summary.rows[0],
        },
        null,
        2
      )
    );
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('CREATE_AGENTS_ERROR:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
