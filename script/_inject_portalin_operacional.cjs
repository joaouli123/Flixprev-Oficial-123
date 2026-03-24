/**
 * _inject_portalin_operacional.cjs
 *
 * Objetivo:
 * - Mitigar falha de scraping do portalin.inss.gov.br (JS renderizado)
 * - Injetar base operacional estruturada das Portarias 991/992/993/994 e correlatas
 * - Priorizar Processo Administrativo Previdenciario e Manutencao de Beneficios
 *
 * Uso:
 *   node script/_inject_portalin_operacional.cjs
 */
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

        if (resp.status === 429) {
          const wait = Math.min(attempt * 10000, 60000);
          await sleep(wait);
          continue;
        }

        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);

        const data = await resp.json();
        if (data.embeddings) {
          for (let i = 0; i < data.embeddings.length; i++) {
            results[start + i] = data.embeddings[i].values;
          }
        }
        break;
      } catch (err) {
        if (attempt === MAX_RETRIES) {
          console.log(`   Falha final em batch ${start}-${start + batch.length}: ${err.message.slice(0, 120)}`);
        } else {
          await sleep(attempt * 5000);
        }
      }
    }
  }
  return results;
}

const BASE_991 = `
BASE OPERACIONAL COMPLEMENTAR - PORTARIA 991/INSS (RECONHECIMENTO DE DIREITOS NO RGPS)

Esta base suplementar consolida fluxos praticos de reconhecimento de direitos previdenciarios no INSS com linguagem operacional.

EIXOS CENTRAIS:
1) TRIAGEM DO REQUERIMENTO
- Identificacao correta da especie de beneficio.
- Conferencia de requisitos minimos (qualidade de segurado, carencia, evento gerador).
- Checagem de documentos essenciais na entrada para reduzir exigencias desnecessarias.

2) INSTRUCAO DO PROCESSO
- O processo deve ser instruido com provas contemporaneas aos fatos.
- Quando houver divergencia entre declaracao e base cadastral, prevalece a necessidade de saneamento documental.
- O segurado pode cumprir exigencia dentro do prazo administrativo, com juntada por Meu INSS, APS ou canais oficiais.

3) SANEAMENTO DE DIVERGENCIAS CADASTRAIS
- Divergencias de NIT, datas, remuneracoes ou vinculos impactam reconhecimento automatico.
- A regularizacao cadastral antecede o julgamento de merito quando houver pendencia impeditiva.

4) CRITERIOS DE ANALISE
- Carencia e qualidade de segurado devem ser verificadas na DER e na data do fato gerador, conforme especie.
- Periodos concomitantes exigem tratamento tecnico para evitar dupla contagem indevida.
- Contribuicoes abaixo do minimo, no contexto da EC 103, devem ser tratadas (complementacao, utilizacao de excedente, agrupamento quando cabivel).

5) DECISAO ADMINISTRATIVA
- Deferimento deve indicar fundamento legal e periodo reconhecido.
- Indeferimento deve explicitar motivo objetivo, com linguagem clara e apontamento do que faltou.
- Decisoes devem observar motivacao suficiente para viabilizar contraditorio recursal.

6) EXIGENCIA ADMINISTRATIVA - BOAS PRATICAS
- Exigencia deve ser especifica, sem pedido generico de "traga tudo".
- Em regra, uma exigencia bem formulada reduz retrabalho e tempo de conclusao.
- Havendo documentos aptos no processo, evitar repeticao de exigencias.

7) ROTEIRO PRATICO (ATENDIMENTO)
- Passo 1: confirmar o beneficio correto.
- Passo 2: validar requisito minimo.
- Passo 3: verificar se ha pendencias impeditivas no cadastro.
- Passo 4: orientar documento certo para o ponto controverso.
- Passo 5: explicar proximo passo em linguagem simples.
`.trim();

const BASE_990 = `
BASE OPERACIONAL COMPLEMENTAR - PORTARIA 990/INSS (CADASTRO, ADMINISTRACAO E RETIFICACAO DE INFORMACOES)

1) FOCO DA PORTARIA 990
- Regras de administracao de dados cadastrais e previdenciarios de segurados e beneficiarios.
- Rotinas de validacao, retificacao, inclusao e exclusao de informacoes com impacto em direitos.

2) QUANDO USAR
- Divergencia entre CNIS e documentos do segurado.
- Necessidade de correcao de vinculos, remuneracoes ou dados de identificacao.
- Pendencias cadastrais que impedem reconhecimento de beneficio.

3) LOGICA OPERACIONAL
- Primeiro saneia cadastro e pendencias impeditivas.
- Depois consolida a base para analise de direito.
- Registro de acertos deve ser rastreavel para auditoria e revisao.

4) ERROS FREQUENTES
- Pular etapa de acerto cadastral e analisar merito com base inconsistente.
- Tratar alerta como pendencia impeditiva sem verificar efeito real.
- Exigir documentos desnecessarios quando ja ha prova idonea no processo.
`.trim();

const BASE_992 = `
BASE OPERACIONAL COMPLEMENTAR - PORTARIA 992/INSS (MANUTENCAO DE BENEFICIOS E SERVICOS)

Tema: manutencao, suspensao, cessacao, reativacao, representacao e movimentacoes posteriores a concessao.

1) PROCURACAO, TUTELA, CURATELA E REPRESENTACAO
- Conferir validade formal dos instrumentos.
- Verificar se ha restricoes de poderes para atos especificos.
- Em representacao legal, observar documentos de legitimidade e vigencia.

2) DESCONTOS E CONSIGNADOS
- Desconto deve ter base legal/contratual valida.
- Contestacao de desconto exige analise de origem, autorizacao e temporalidade.
- Havendo indicio de fraude, priorizar bloqueio preventivo e abertura de apuracao administrativa.

3) SAQUE DE RESIDUOS
- Exige comprovacao de legitimidade do requerente.
- Em caso de obito, observar regra de habilitados e ordem de preferencia administrativa.

4) SUSPENSAO, CESSACAO E REATIVACAO
- Suspensao: medida temporaria quando ha pendencia de prova de vida, representacao, vinculo ou requisito periodico.
- Cessacao: encerramento quando comprovada perda definitiva do direito.
- Reativacao: depende de saneamento da causa suspensiva e reavaliacao dos requisitos.

5) PROCESSO DE MANUTENCAO - PASSO A PASSO
- Passo 1: identificar o motivo tecnico da alteracao (suspender, cessar, reativar, bloquear desconto etc.).
- Passo 2: intimar/alertar interessado quando exigido.
- Passo 3: registrar fundamentacao objetiva no historico do beneficio.
- Passo 4: concluir com comunicacao clara ao segurado.

6) ERROS COMUNS A EVITAR
- Cessar beneficio quando caberia apenas suspensao temporaria.
- Negar reativacao sem analisar documento novo.
- Tratar procuracao vencida como se fosse valida.
- Manter desconto contestado sem auditoria minima.

7) COMO EXPLICAR AO SEGURADO (LINGUAGEM HUMANA)
- "Seu beneficio nao foi cortado em definitivo; ele foi suspenso ate voce entregar X documento."
- "Se voce regularizar o ponto pendente, podemos reativar e analisar retroativos conforme o caso."
- "No seu caso, precisamos confirmar quem pode representar voce legalmente para liberar o pagamento."
`.trim();

const BASE_993 = `
BASE OPERACIONAL COMPLEMENTAR - PORTARIA 993/INSS (PROCESSO ADMINISTRATIVO PREVIDENCIARIO)

Objetivo: orientar conducao pratica do PAP no INSS com foco em contraditorio, ampla defesa e decisao motivada.

1) ESTRUTURA DO PAP
- Protocolo e autuacao do requerimento.
- Instrucao probatoria.
- Eventual exigencia complementar.
- Analise tecnica e juridica.
- Decisao administrativa.
- Ciencia do interessado e via recursal.

2) PRINCIPIOS OPERACIONAIS
- Legalidade, motivacao, eficiencia, contraditorio e ampla defesa.
- Proporcionalidade na exigencia de prova.
- Vedacao de surpresa decisoria: o interessado deve entender a razao do indeferimento.

3) GESTAO DE PRAZOS
- Prazo de cumprimento de exigencia deve ser informado com clareza.
- Prorrogacao pode ser analisada quando houver justificativa plausivel.
- Decurso de prazo sem cumprimento pode ensejar decisao com base no estado atual do processo.

4) QUALIDADE DE EXIGENCIA (PONTO CRITICO)
Exigencia boa:
- aponta o fato controverso;
- indica documento apto;
- explica para que servira a prova;
- evita pedidos genericos.
Exigencia ruim:
- "junte documentos" sem especificar o que falta;
- repeticao de exigencias sobre pontos ja comprovados.

5) DECISAO ADMINISTRATIVA FORTE
Uma decisao robusta deve conter:
- resumo dos fatos;
- documentos considerados;
- fundamento legal aplicavel;
- conclusao objetiva (deferido/indeferido/parcial);
- orientacao recursal.

6) INDEFERIMENTO TECNICO (COMO REDIGIR)
- Explicar qual requisito faltou (carencia, qualidade de segurado, incapacidade, dependencia, tempo, etc.).
- Explicar por que os documentos apresentados nao superaram a pendencia.
- Indicar possibilidade de recurso administrativo e prazo.

7) RECURSO ADMINISTRATIVO - VISAO PRATICA
- Recurso deve atacar os fundamentos da decisao, nao apenas repetir pedido.
- Documento novo relevante aumenta chance de reforma.
- Argumentacao deve ser objetiva: ponto controvertido, prova correspondente, conclusao pretendida.

8) CASOS PRATICOS DE ATENDIMENTO (LINGUAGEM REAL)
Caso 1 - "Deu exigencia e nao entendi":
- Orientar segurado a abrir o detalhe da exigencia e listar exatamente os documentos faltantes.
- Traduzir a exigencia para linguagem comum e conferir se o documento sugerido prova o fato exigido.

Caso 2 - "Foi indeferido sem sentido":
- Ler fundamento da decisao.
- Conferir se houve erro de fato (documento ja estava no processo) ou erro de direito.
- Estruturar recurso com foco no fundamento exato do indeferimento.

Caso 3 - "Posso mandar documento novo no recurso?":
- Sim, em regra e util quando for documento idoneo e pertinente ao ponto negado.

9) CHECKLIST PAP - BASICO, MEDIO, AVANCADO
Basico: identificacao do pedido, requisito minimo, documento essencial.
Medio: coerencia entre base cadastral e prova documental, tratamento de pendencias e exigencias.
Avancado: impugnacao tecnica de indeferimento, estrategia recursal, saneamento de inconsistencias complexas.
`.trim();

const BASE_994 = `
BASE OPERACIONAL COMPLEMENTAR - PORTARIA 994/INSS (ACUMULACAO DE BENEFICIOS)

1) REGRA GERAL
- Nem toda acumulacao e proibida; depende da combinacao de beneficios e da legislacao aplicavel.
- Em hipoteses restritas, pode haver acumulacao com redutor no beneficio de menor valor conforme regras vigentes.

2) ANALISE OPERACIONAL
- Identificar especies envolvidas.
- Verificar periodo de sobreposicao.
- Identificar vedacao legal expressa.
- Se acumulacao parcial permitida: aplicar criterio de calculo correspondente.

3) ALERTAS PRATICOS
- Indeferimento por "acumulacao vedada" exige demonstracao da vedacao concreta.
- Quando cabivel opcao por beneficio mais vantajoso, orientar segurado sobre impactos.

4) COMUNICACAO AO SEGURADO
- Explicar de forma simples: "voce pode manter X e Y" ou "voce precisa optar entre X e Y".
- Informar reflexos financeiros e eventual devolucao/compensacao se houve recebimento indevido.
`.trim();

const BASE_FAQ_PAP = `
FAQ HUMANA - PROCESSO ADMINISTRATIVO PREVIDENCIARIO (PAP)

PERGUNTA: "Recebi exigencia. Fui negado?"
RESPOSTA: Nao. Exigencia significa que o INSS pediu complemento de prova antes da decisao final.

PERGUNTA: "Qual o primeiro passo depois do indeferimento?"
RESPOSTA: Ler o fundamento do indeferimento e identificar exatamente qual requisito nao foi reconhecido.

PERGUNTA: "Posso recorrer sem advogado?"
RESPOSTA: Em regra administrativa, sim. O ponto central e rebater os fundamentos da decisao com provas objetivas.

PERGUNTA: "Posso juntar documento novo no recurso?"
RESPOSTA: Sim, documento novo e pertinente costuma fortalecer o recurso, sobretudo quando ataca o ponto negado.

PERGUNTA: "O que derruba um recurso?"
RESPOSTA: Repetir o pedido sem atacar os fundamentos, falta de prova do ponto controvertido e argumento genrico.

PERGUNTA: "Como montar recurso bom em linguagem simples?"
RESPOSTA:
1) Dizer o que foi negado.
2) Dizer por que a decisao errou (fato ou direito).
3) Anexar prova certa para aquele ponto.
4) Pedir claramente a reforma da decisao.

PERGUNTA: "Decisao surpresa no PAP, o que e isso?"
RESPOSTA: E quando a decisao indefere por fundamento que nao foi adequadamente discutido na instrucao, sem chance real de contraditorio.

PERGUNTA: "Como evitar exigencia maluca de documento?"
RESPOSTA: Exigencia tem que ser especifica e vinculada ao fato controverso; pedido generico pode ser questionado administrativamente.

PERGUNTA: "No dia a dia, como orientar cliente perdido no Meu INSS?"
RESPOSTA: Abrir exigencia, listar documentos um a um, checar se cada documento prova o fato cobrado e protocolar de forma organizada.
`.trim();

const BASE_FAQ_MANUT = `
FAQ HUMANA - MANUTENCAO DE BENEFICIOS

PERGUNTA: "Suspendeu e cancelou e a mesma coisa?"
RESPOSTA: Nao. Suspensao e temporaria; cessacao e encerramento definitivo do beneficio.

PERGUNTA: "Qual erro mais comum em manutencao?"
RESPOSTA: Cessar quando caberia suspensao, negar reativacao sem analisar prova nova e manter desconto contestado sem auditoria minima.

PERGUNTA: "Beneficio suspenso: como destravar?"
RESPOSTA: Identificar causa da suspensao, juntar a prova exata da pendencia e pedir reativacao com fundamentacao objetiva.

PERGUNTA: "Tem desconto estranho no beneficio. O que faco?"
RESPOSTA: Contestar administrativamente, exigir analise de origem/autorizacao e pedir bloqueio preventivo quando houver indicio de fraude.

PERGUNTA: "Como resolver para pessoa acamada?"
RESPOSTA: Usar instrumento de representacao valido (procuracao/curatela/tutela), com documentos de legitimidade e vigencia.

PERGUNTA: "Quando cabe reativacao com retroativo?"
RESPOSTA: Quando a causa suspensiva for regularizada e houver fundamento para recomposicao financeira no periodo devido.

PERGUNTA: "Que linguagem usar com o segurado no atendimento?"
RESPOSTA: Objetiva e humana: o que ocorreu, por que ocorreu, qual documento falta e qual o proximo passo pratico.
`.trim();

const BASE_998 = `
BASE OPERACIONAL COMPLEMENTAR - PORTARIA 998/INSS (COMPENSACAO PREVIDENCIARIA - RPPS)

- Compensacao previdenciaria envolve ajuste financeiro entre regimes quando ha contagem reciproca.
- Exige consistencia documental de tempo de contribuicao e certificacoes.
- Divergencia de periodos deve ser saneada antes da conclusao definitiva do encontro de contas.
`.trim();

const BASE_1208 = `
BASE OPERACIONAL COMPLEMENTAR - PORTARIA 1208/INSS (SERVICO SOCIAL)

- Atendimento social deve observar vulnerabilidade, acesso a direitos e orientacao qualificada.
- Encaminhamentos devem ser registrados com clareza, evitando orientacoes genericas.
- Integracao com politicas publicas e rede socioassistencial e essencial para efetividade.
`.trim();

const BASE_94 = `
BASE OPERACIONAL COMPLEMENTAR - PORTARIA 94/INSS (ACOES CIVIS PUBLICAS)

- Cumprimento administrativo de ACP exige identificacao do alcance subjetivo e objetivo da decisao judicial.
- Necessario mapear marco temporal, criterio de elegibilidade e forma de revisao/implantacao.
- Em caso de duvida interpretativa, registrar tese aplicada e fundamento para rastreabilidade.
`.trim();

const SUPPLEMENT_BY_AGENT_TITLE = [
  {
    agentMatcher: /processo administrativo previdenci.rio/i,
    docs: [
      { title: 'BASE SUPLEMENTAR PORTALIN - PORTARIA 993 - Processo Administrativo Previdenciario', text: BASE_993 },
      { title: 'BASE SUPLEMENTAR PORTALIN - PORTARIA 991 - Reconhecimento de Direitos no RGPS', text: BASE_991 },
      { title: 'BASE SUPLEMENTAR PORTALIN - PORTARIA 994 - Acumulacao de Beneficios', text: BASE_994 },
      { title: 'BASE SUPLEMENTAR PORTALIN - FAQ HUMANA PAP - Rotinas e Recursos', text: BASE_FAQ_PAP },
    ]
  },
  {
    agentMatcher: /manuten..o de benef.cios/i,
    docs: [
      { title: 'BASE SUPLEMENTAR PORTALIN - PORTARIA 992 - Manutencao de Beneficios e Servicos', text: BASE_992 },
      { title: 'BASE SUPLEMENTAR PORTALIN - PORTARIA 991 - Reconhecimento de Direitos no RGPS', text: BASE_991 },
      { title: 'BASE SUPLEMENTAR PORTALIN - PORTARIA 993 - Processo Administrativo Previdenciario', text: BASE_993 },
      { title: 'BASE SUPLEMENTAR PORTALIN - FAQ HUMANA MANUTENCAO - Casos do Dia a Dia', text: BASE_FAQ_MANUT },
    ]
  },
  {
    agentMatcher: /car.ncia e qualidade de segurado/i,
    docs: [
      { title: 'BASE SUPLEMENTAR PORTALIN - PORTARIA 991 - Reconhecimento de Direitos no RGPS', text: BASE_991 }
    ]
  },
  {
    agentMatcher: /conselho de recursos da previd.ncia social/i,
    docs: [
      { title: 'BASE SUPLEMENTAR PORTALIN - PORTARIA 993 - Processo Administrativo Previdenciario', text: BASE_993 }
    ]
  },
  {
    agentMatcher: /revis.o de benef.cios/i,
    docs: [
      { title: 'BASE SUPLEMENTAR PORTALIN - PORTARIA 990 - Cadastros e Retificacoes CNIS', text: BASE_990 },
      { title: 'BASE SUPLEMENTAR PORTALIN - PORTARIA 991 - Reconhecimento de Direitos no RGPS', text: BASE_991 },
      { title: 'BASE SUPLEMENTAR PORTALIN - PORTARIA 993 - Processo Administrativo Previdenciario', text: BASE_993 },
      { title: 'BASE SUPLEMENTAR PORTALIN - PORTARIA 994 - Acumulacao de Beneficios', text: BASE_994 },
    ]
  },
  {
    agentMatcher: /regime pr.prio de previd.ncia social/i,
    docs: [
      { title: 'BASE SUPLEMENTAR PORTALIN - PORTARIA 998 - Compensacao Previdenciaria', text: BASE_998 }
    ]
  },
  {
    agentMatcher: /assist.ncia social/i,
    docs: [
      { title: 'BASE SUPLEMENTAR PORTALIN - PORTARIA 1208 - Servico Social no INSS', text: BASE_1208 }
    ]
  },
  {
    agentMatcher: /a..es civis p.blicas inss/i,
    docs: [
      { title: 'BASE SUPLEMENTAR PORTALIN - PORTARIA 94 - Acoes Civis Publicas INSS', text: BASE_94 }
    ]
  },
];

async function insertSupplement(agentId, title, text) {
  const chunks = chunkText(text);
  if (!chunks.length) return { inserted: 0, lost: 0 };

  const vectors = await embedBatch(chunks);
  const payload = [];
  let lost = 0;
  for (let i = 0; i < chunks.length; i++) {
    if (vectors[i]) payload.push({ chunk_index: i, content: chunks[i], embedding: `[${vectors[i].join(',')}]` });
    else lost++;
  }

  if (!payload.length) return { inserted: 0, lost };

  const docId = crypto.randomUUID();
  const finalTitle = title.slice(0, 255);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO documents (id, agent_id, title) VALUES ($1, $2, $3)', [docId, agentId, finalTitle]);
    for (const row of payload) {
      await client.query(
        'INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index) VALUES ($1,$2,$3,$4::vector,$5)',
        [agentId, docId, row.content, row.embedding, row.chunk_index]
      );
    }
    await client.query('COMMIT');
    return { inserted: payload.length, lost };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function main() {
  console.log('\n====================================================');
  console.log(' INJECAO SUPLEMENTAR PORTALIN (OPERACIONAL)');
  console.log('====================================================\n');

  const agentsRes = await pool.query(`
    SELECT id, title,
      (SELECT count(*) FROM document_chunks dc WHERE dc.agent_id = a.id)::int AS chunks
    FROM agents a
    WHERE a.user_id IS NULL
    ORDER BY title
  `);

  let totalInserted = 0;

  for (const rule of SUPPLEMENT_BY_AGENT_TITLE) {
    const targetAgents = agentsRes.rows.filter(a => rule.agentMatcher.test(a.title));
    for (const agent of targetAgents) {
      console.log(`\nAgente: ${agent.title} (chunks antes: ${agent.chunks})`);

      // remove supplements antigos deste agente
      const oldSupp = await pool.query(
        `SELECT id, title FROM documents
         WHERE agent_id = $1 AND title LIKE 'BASE SUPLEMENTAR PORTALIN - %'`,
        [agent.id]
      );

      if (oldSupp.rowCount) {
        for (const d of oldSupp.rows) {
          await pool.query('DELETE FROM document_chunks WHERE document_id = $1', [d.id]);
          await pool.query('DELETE FROM documents WHERE id = $1', [d.id]);
        }
        console.log(`  Removidos suplementos antigos: ${oldSupp.rowCount}`);
      }

      for (const doc of rule.docs) {
        try {
          const r = await insertSupplement(agent.id, doc.title, doc.text);
          totalInserted += r.inserted;
          console.log(`  + ${doc.title} => ${r.inserted} chunks${r.lost ? ` (${r.lost} sem embedding)` : ''}`);
        } catch (e) {
          console.log(`  X Falha em ${doc.title}: ${e.message}`);
        }
      }

      const after = await pool.query('SELECT count(*)::int AS c FROM document_chunks WHERE agent_id = $1', [agent.id]);
      console.log(`  Chunks depois: ${after.rows[0].c}`);
    }
  }

  console.log('\n====================================================');
  console.log('CONCLUIDO');
  console.log(`Total de chunks suplementares inseridos: ${totalInserted}`);
  console.log('====================================================\n');

  await pool.end();
}

main().catch(async (e) => {
  console.error('[FATAL]', e.message);
  try { await pool.end(); } catch (_) {}
  process.exit(1);
});
