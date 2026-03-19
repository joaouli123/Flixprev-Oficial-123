import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const categoryFilter = '%previd%';

const desiredAgents = [
  { order: 1, title: 'Cadastro Nacional de Informações Sociais', current: ['acnis', 'cnis', 'cadastro nacional de informacoes sociais'] },
  { order: 2, title: 'Processo Administrativo Previdenciário', current: ['procadm', 'processo administrativo previdenciario', 'processo adm previdenciario', 'p.a.p', 'pap'] },
  { order: 3, title: 'Aposentadoria Pré EC103', current: ['a.pre103', 'apre103', 'aposentadoria pre ec103'] },
  { order: 4, title: 'Aposentadoria Idade Urbana', current: ['apiurb', 'aposentadoria idade urbana'] },
  { order: 5, title: 'Aposentadoria Especial', current: ['aesp', 'aposentadoria especial'] },
  { order: 6, title: 'Aposentadoria da Pessoa com Deficiência', current: ['apcd', 'aposentadoria da pessoa com deficiencia', 'aposentadoria pcd'] },
  { order: 7, title: 'Aposentadoria Rural', current: ['arur', 'aposentadoria rural'] },
  { order: 8, title: 'Auxílio-Reclusão', current: ['rec', 'auxilio-reclusao', 'auxilio reclusao'] },
  { order: 9, title: 'Pensão por Morte', current: ['pmor', 'pensao por morte'] },
  { order: 10, title: 'Salário-Maternidade', current: ['smar', 'salario-maternidade', 'salario maternidade'] },
  { order: 11, title: 'Aposentadoria por Incapacidade Permanente', current: ['aip', 'aposentadoria por incapacidade permanente', 'aposentadoria incapacidade permanente'] },
  { order: 12, title: 'Incapacidade Temporária', current: ['ait', 'incapacidade temporaria'] },
  { order: 13, title: 'Auxílio-Acidente', current: ['aa', 'auxilio-acidente', 'auxilio acidente'] },
  { order: 14, title: 'Viabilidade Judicial - Auxílio por Incapacidade Temporária', current: ['avjud', 'viabilidade judicial - auxilio por incapacidade temporaria', 'viabilidade judicial - aux doenca', 'viabilidade judicial'] },
  { order: 15, title: '25% Sobre Aposentadoria por Incapacidade Permanente', current: ['25aip', '25% sobre aposentadoria por incapacidade permanente', '25% incapacidade permanente'] },
  { order: 16, title: 'Salário-Família', current: ['sfam', 'salario-familia', 'salario familia'] },
  { order: 17, title: 'Regras de Transição', current: ['rtransic', 'regras de transicao'] },
  { order: 18, title: 'Cálculo de RMI', current: ['rmi', 'calculo de rmi'] },
  { order: 19, title: 'Manutenção de Benefícios', current: ['amb', 'manutencao de beneficios'] },
  { order: 20, title: 'Carência e Qualidade de Segurado', current: ['cqs', 'carencia e qualidade de segurado'] },
  { order: 21, title: 'Assistência Social', current: ['asoc', 'assistencia social'] },
  { order: 22, title: 'Benefício de Prestação Continuada - Idoso e Pessoa com Deficiência', current: ['bpc', 'beneficio de prestacao continuada', 'beneficio de prestacao continuada - idoso e pessoa com deficiencia'] },
  { order: 23, title: 'Conselho de Recursos da Previdência Social', current: ['crps', 'conselho de recursos da previdencia social', 'conselho recursos previdencia social'] },
  { order: 24, title: 'Revisão de Benefícios', current: ['revb', 'revisao de beneficios'] },
  { order: 25, title: 'Regime Próprio de Previdência Social', current: ['rpps', 'regime proprio de previdencia social'] },
  { order: 26, title: 'Ações Civis Públicas INSS', current: ['acpin', 'acoes civis publicas inss'] },
  { order: 27, title: 'Súmulas Federais', current: ['sumfed', 'sumulas federais', 'súmulas federais'] },
  { order: 28, title: 'Turma Nacional de Uniformização', current: ['rtnu', 'tnu', 'turma nacional de uniformizacao'] },
];

const desiredByCurrentTitle = new Map();
for (const item of desiredAgents) {
  for (const current of item.current) {
    desiredByCurrentTitle.set(normalizeText(current), item);
  }
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function computeOrderBase(categoryName) {
  const normalized = normalizeText(categoryName);
  if (normalized.includes('previd')) return 200;
  if (normalized.includes('trabalh')) return 100;
  if (normalized.includes('tribut')) return 300;
  return 900;
}

function findDesiredAgent(agent) {
  const normalizedTitle = normalizeText(agent.title);
  return desiredByCurrentTitle.get(normalizedTitle) || null;
}

async function readAgents() {
  const query = `
    select
      a.id,
      a.title,
      a.description,
      a.role,
      a.category_ids,
      a.created_at,
      c.id as category_id,
      c.name as category_name
    from agents a
    join categories c on (
      (jsonb_typeof(to_jsonb(a.category_ids)) = 'array' and exists (
        select 1
        from jsonb_array_elements_text(to_jsonb(a.category_ids)) as cat(category_id)
        where cat.category_id = c.id::text
      ))
      or c.id::text = a.category_ids::text
    )
    where lower(c.name) like $1
    order by c.name asc, a.created_at asc
  `;

  const { rows } = await client.query(query, [categoryFilter]);
  return rows;
}

async function preview() {
  const rows = await readAgents();
  const mapped = rows.map((row) => {
    const desired = findDesiredAgent(row);
    return {
      id: row.id,
      currentTitle: row.title,
      desiredTitle: desired?.title || null,
      desiredOrder: desired ? computeOrderBase(row.category_name) + desired.order : null,
      category: row.category_name,
    };
  });

  console.log(JSON.stringify(mapped, null, 2));
}

async function applyUpdates() {
  const rows = await readAgents();
  let updated = 0;

  for (const row of rows) {
    const desired = findDesiredAgent(row);
    if (!desired) {
      continue;
    }

    const nextOrder = computeOrderBase(row.category_name) + desired.order;
    const titleChanged = String(row.title || '') !== desired.title;

    if (!titleChanged) {
      continue;
    }

    await client.query(
      `
      update agents
      set title = $1
      where id = $2
      `,
      [desired.title, row.id]
    );

    updated += 1;
    console.log(`UPDATED | ${row.title} -> ${desired.title} | visual order ${nextOrder}`);
  }

  console.log(`TOTAL_UPDATED=${updated}`);
}

async function main() {
  const command = process.argv[2] || 'preview';
  await client.connect();

  try {
    if (command === 'apply') {
      await applyUpdates();
    } else {
      await preview();
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});