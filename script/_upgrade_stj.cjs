// _upgrade_stj.cjs - Upgrade do agente STJSum com capricho
const crypto = require('crypto');
const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const EMBED_DELAY_MS = 3000;
const EMBED_BATCH_SIZE = 25;
const MAX_RETRIES = 7;
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function chunkText(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = start + CHUNK_SIZE;
    if (end < clean.length) {
      const p = clean.lastIndexOf('.', end);
      const s = clean.lastIndexOf(' ', end);
      if (p > start + CHUNK_SIZE * 0.8) end = p + 1;
      else if (s > start + CHUNK_SIZE * 0.5) end = s;
    }
    const c = clean.slice(start, end).trim();
    if (c) chunks.push(c);
    const next = end - CHUNK_OVERLAP;
    start = next > start ? next : end;
  }
  return chunks;
}

async function embedBatch(texts) {
  if (!texts.length) return [];
  const results = new Array(texts.length).fill(null);
  const apiKey = process.env.GEMINI_API_KEY;
  for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBED_BATCH_SIZE);
    if (start > 0) await sleep(EMBED_DELAY_MS);
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: batch.map(t => ({
                model: 'models/gemini-embedding-001',
                content: { parts: [{ text: t }] }
              }))
            }),
            signal: AbortSignal.timeout(120000),
          }
        );
        if (resp.status === 429) { await sleep(Math.min(attempt * 10000, 60000)); continue; }
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        if (data.embeddings) {
          for (let i = 0; i < data.embeddings.length; i++) results[start + i] = data.embeddings[i].values;
        }
        break;
      } catch (err) {
        if (attempt === MAX_RETRIES) console.log('   Falha batch ' + start + ': ' + err.message.slice(0, 100));
        else await sleep(attempt * 5000);
      }
    }
  }
  return results;
}

// ═══════════════════════════════════════════════
// INSTRUCTIONS
// ═══════════════════════════════════════════════
const NEW_INSTRUCTIONS = `ESCOPO TEM\u00c1TICO:
Voc\u00ea \u00e9 o agente especialista em S\u00famulas do Superior Tribunal de Justi\u00e7a (STJ). Seu dom\u00ednio abrange:
- Todas as s\u00famulas do STJ (n\u00ba 1 a 660+), ativas e canceladas
- S\u00famulas vinculantes com impacto no STJ
- Enunciados da jurisprud\u00eancia em teses do STJ
- Classifica\u00e7\u00e3o por mat\u00e9ria: Direito Civil, Processual Civil, Penal, Processual Penal, Tribut\u00e1rio, Administrativo, Previdenci\u00e1rio, Trabalhista (reflexos)
- Hist\u00f3rico de edi\u00e7\u00e3o, revis\u00e3o e cancelamento de s\u00famulas
- Rela\u00e7\u00e3o entre s\u00famulas do STJ e s\u00famulas do STF

LIMITES \u2014 N\u00c3O RESPONDA SOBRE:
- S\u00famulas exclusivamente do TST \u2192 redirecione ao agente de S\u00famulas Trabalhistas
- Legisla\u00e7\u00e3o material detalhada (CLT, CTN, CC) \u2192 redirecione ao agente especializado
- Jurisprud\u00eancia de TRTs/TRFs \u2192 redirecione ao agente de Jurisprud\u00eancia
- Precedentes vinculantes do STF sem rela\u00e7\u00e3o com o STJ \u2192 redirecione ao agente de Precedentes

FONTES PRIMORDIAIS:
Portal de S\u00famulas do STJ (www.stj.jus.br), Jurisprud\u00eancia em Teses, Di\u00e1rio da Justi\u00e7a Eletr\u00f4nico do STJ

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
REGRAS ABSOLUTAS DE ISOLAMENTO TEM\u00c1TICO
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
1) Responda EXCLUSIVAMENTE sobre s\u00famulas do STJ.
2) Use SOMENTE o conte\u00fado indexado na sua base de conhecimento.
3) N\u00c3O invente n\u00fameros de s\u00famulas, enunciados ou datas de publica\u00e7\u00e3o.
4) Indique sempre se a s\u00famula est\u00e1 ATIVA ou CANCELADA.
5) Se a pergunta for sobre OUTRO tribunal ou tema, responda: "Esta pergunta est\u00e1 fora do meu escopo. Consulte o agente especializado."
6) Se n\u00e3o encontrar informa\u00e7\u00e3o na base, informe: "N\u00e3o localizei essa informa\u00e7\u00e3o na base de s\u00famulas deste agente."
7) Quando citar s\u00famula, indique o n\u00famero exato, o enunciado e a data de publica\u00e7\u00e3o/DJe.
8) Mantenha respostas organizadas, diretas e com linguagem t\u00e9cnico-jur\u00eddica profissional.`;

// ═══════════════════════════════════════════════
// SUPPLEMENTS
// ═══════════════════════════════════════════════
const SUPPLEMENTS = [
  {
    title: 'SUPP: Guia Operacional - S\u00famulas do STJ',
    content: `GUIA OPERACIONAL - SUMULAS DO STJ

1. VISAO GERAL
O Superior Tribunal de Justica (STJ) edita sumulas para consolidar entendimentos reiterados sobre legislacao federal infraconstitucional. As sumulas do STJ nao tem forca vinculante (diferente das sumulas vinculantes do STF), mas possuem forte carater persuasivo e servem como filtro de admissibilidade recursal.

2. SUMULAS MAIS RELEVANTES POR MATERIA

DIREITO CIVIL E PROCESSUAL CIVIL:
- Sumula 7: A pretensao de simples reexame de prova nao enseja recurso especial.
- Sumula 54: Os juros moratorios fluem a partir do evento danoso, em caso de responsabilidade extracontratual.
- Sumula 227: A pessoa juridica pode sofrer dano moral.
- Sumula 297: O Codigo de Defesa do Consumidor e aplicavel as instituicoes financeiras.
- Sumula 362: A correcao monetaria do valor da indenizacao do dano moral incide desde a data do arbitramento.
- Sumula 479: As instituicoes financeiras respondem objetivamente pelos danos gerados por fortuito interno relativo a fraudes e delitos praticados por terceiros no ambito de operacoes bancarias.
- Sumula 529: No seguro de responsabilidade civil facultativo, nao cabe o ajuizamento de acao pelo terceiro prejudicado direta e exclusivamente em face da seguradora do apontado causador do dano.

DIREITO TRIBUTARIO:
- Sumula 68: A parcela relativa ao ICM inclui-se na base de calculo do PIS.
- Sumula 71: O bacalhau importado de pais signatario do GATT e isento do ICM.
- Sumula 166: Nao constitui fato gerador do ICMS o simples deslocamento de mercadoria de um para outro estabelecimento do mesmo contribuinte.
- Sumula 276: As sociedades civis de prestacao de servicos profissionais sao isentas da Cofins, irrelevante o regime tributario adotado.
- Sumula 392: A Fazenda Publica pode substituir a certidao de divida ativa (CDA) ate a prolacao da sentenca de embargos, quando se tratar de correcao de erro material ou formal, vedada a modificacao do sujeito passivo da execucao.
- Sumula 435: Presume-se dissolvida irregularmente a empresa que deixar de funcionar no seu domicilio fiscal, sem comunicacao aos orgaos competentes, legitimando o redirecionamento da execucao fiscal para o socio-gerente.

DIREITO PENAL E PROCESSUAL PENAL:
- Sumula 231: A incidencia da circunstancia atenuante nao pode conduzir a reducao da pena abaixo do minimo legal.
- Sumula 269: E admissivel a adocao do regime prisional semiaberto aos reincidentes condenados a pena igual ou inferior a quatro anos se favoraveis as circunstancias judiciais.
- Sumula 337: E cabivel a suspensao condicional do processo na desclassificacao do crime e na procedencia parcial da pretensao punitiva.
- Sumula 444: E vedada a utilizacao de inqueritos policiais e acoes penais em curso para agravar a pena-base.

DIREITO PREVIDENCIARIO:
- Sumula 149: A prova exclusivamente testemunhal nao basta a comprovacao da atividade ruriculal para efeito da obtencao de beneficio previdenciario.
- Sumula 340: A lei aplicavel a concessao de pensao previdenciaria por morte e aquela vigente na data do obito do segurado.

DIREITO ADMINISTRATIVO:
- Sumula 373: E ilegitima a exigencia de deposito previo para admissibilidade de recurso administrativo.
- Sumula 421: Os honorarios advocaticios nao sao devidos a Defensoria Publica quando ela atua contra a pessoa juridica de direito publico a qual pertenca.
- Sumula 614: O locatario nao possui legitimidade ativa para discutir a relacao juridico-tributaria de IPTU e de taxas referentes ao imovel alugado nem para repetir indebito desses tributos.

3. ORGANIZACAO DAS SUMULAS
As sumulas do STJ sao publicadas no Diario da Justica Eletronico (DJe). Sao organizadas sequencialmente (1 a 660+) e classificaveis por materia. O portal do STJ (www.stj.jus.br) permite busca por numero, assunto ou palavra-chave. Sumulas canceladas permanecem no acervo com anotacao de cancelamento.

4. DIFERENCA ENTRE SUMULA STJ E SUMULA VINCULANTE
Sumulas do STJ: orientam a interpretacao de legislacao federal; nao vinculam outros tribunais formalmente, mas sao referencia para admissibilidade de REsp. Sumulas Vinculantes (SVs): editadas pelo STF, vinculam todos os orgaos do Judiciario e a Administracao Publica; descumprimento enseja reclamacao ao STF.`
  },
  {
    title: 'SUPP: FAQ Pratico - S\u00famulas do STJ',
    content: `PERGUNTAS FREQUENTES - SUMULAS DO STJ (FAQ)

P: As sumulas do STJ sao vinculantes?
R: Nao. As sumulas do STJ possuem carater persuasivo e servem de referencia para admissibilidade de recursos especiais, mas nao tem forca vinculante formal como as Sumulas Vinculantes do STF. Porem, na pratica, exercem enorme influencia na uniformizacao da jurisprudencia federal.

P: Qual a sumula do STJ sobre reexame de prova?
R: Sumula 7 do STJ: "A pretensao de simples reexame de prova nao enseja recurso especial." E uma das sumulas mais invocadas como obice ao conhecimento de recurso especial.

P: Pessoa juridica pode sofrer dano moral segundo o STJ?
R: Sim. Sumula 227 do STJ: "A pessoa juridica pode sofrer dano moral." E entendimento consolidado desde 1999.

P: O CDC se aplica a bancos?
R: Sim. Sumula 297 do STJ: "O Codigo de Defesa do Consumidor e aplicavel as instituicoes financeiras." Entendimento tambem ratificado pelo STF na ADI 2.591.

P: Qual sumula trata da dissolucao irregular de empresa?
R: Sumula 435 do STJ: "Presume-se dissolvida irregularmente a empresa que deixar de funcionar no seu domicilio fiscal, sem comunicacao aos orgaos competentes, legitimando o redirecionamento da execucao fiscal para o socio-gerente."

P: Inqueritos em curso podem agravar a pena?
R: Nao. Sumula 444 do STJ: "E vedada a utilizacao de inqueritos policiais e acoes penais em curso para agravar a pena-base." Visa garantir o principio da presuncao de inocencia.

P: Qual a sumula sobre juros moratorios em responsabilidade extracontratual?
R: Sumula 54 do STJ: "Os juros moratorios fluem a partir do evento danoso, em caso de responsabilidade extracontratual."

P: Como buscar sumulas do STJ?
R: No portal www.stj.jus.br, secao "Sumulas", filtrando por numero, assunto ou palavra-chave. Tambem disponivel no DJe do STJ.

P: Quantas sumulas o STJ tem atualmente?
R: O STJ possui mais de 660 sumulas editadas desde 1990, organizadas sequencialmente e classificadas por materia (civil, penal, tributario, administrativo, previdenciario, etc.).`
  }
];

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════
async function main() {
  console.log('\n' + '='.repeat(55));
  console.log(' UPGRADE STJSum - Instructions + Supplements');
  console.log('='.repeat(55) + '\n');

  // FASE 1: Update instructions
  console.log('--- FASE 1: Atualizando INSTRUCTIONS ---\n');
  const r = await pool.query(
    'UPDATE agents SET instructions = $1 WHERE user_id IS NULL AND title = $2 RETURNING id, title',
    [NEW_INSTRUCTIONS, 'STJSum']
  );
  if (r.rows.length) {
    console.log('  OK STJSum: ' + NEW_INSTRUCTIONS.length + ' chars');
  } else {
    console.log('  MISS STJSum');
    await pool.end();
    return;
  }
  const agentId = r.rows[0].id;

  // FASE 2: Inject supplements
  console.log('\n--- FASE 2: Injetando SUPPLEMENTS ---\n');
  let totalChunks = 0;

  for (const doc of SUPPLEMENTS) {
    // Delete old supplement with same title
    const delDoc = await pool.query(
      'DELETE FROM documents WHERE agent_id = $1 AND title = $2 RETURNING id',
      [agentId, doc.title]
    );
    for (const dd of delDoc.rows) {
      await pool.query('DELETE FROM document_chunks WHERE document_id = $1', [dd.id]);
    }
    if (delDoc.rows.length) console.log('  DEL old: ' + doc.title);

    // Create document
    const docId = crypto.randomUUID();
    await pool.query(
      'INSERT INTO documents (id, agent_id, title, created_at) VALUES ($1, $2, $3, NOW())',
      [docId, agentId, doc.title]
    );

    // Chunk + embed
    const chunks = chunkText(doc.content);
    console.log('  ADD ' + doc.title + ': ' + chunks.length + ' chunks');

    const embeddings = await embedBatch(chunks);
    let inserted = 0;
    for (let i = 0; i < chunks.length; i++) {
      if (!embeddings[i]) continue;
      await pool.query(
        'INSERT INTO document_chunks (id, document_id, agent_id, content, chunk_index, embedding, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())',
        [crypto.randomUUID(), docId, agentId, chunks[i], i, JSON.stringify(embeddings[i])]
      );
      inserted++;
    }
    totalChunks += inserted;
    console.log('     -> ' + inserted + ' chunks com embedding\n');
    await sleep(EMBED_DELAY_MS);
  }

  // Report
  console.log('\n--- RELATORIO FINAL ---\n');
  const final = await pool.query(`
    SELECT a.title, length(a.instructions) AS instr_len,
      (SELECT count(*)::int FROM document_chunks dc WHERE dc.agent_id = a.id) AS chunks,
      (SELECT count(*)::int FROM documents d WHERE d.agent_id = a.id) AS docs
    FROM agents a
    WHERE a.id = $1
  `, [agentId]);
  console.table(final.rows);
  console.log('Novos chunks injetados: ' + totalChunks);
  console.log('\nConcluido!\n');
  await pool.end();
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
