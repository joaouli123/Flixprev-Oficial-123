// _upgrade_trab_v2.cjs - Upgrade dos 6 agentes trabalhistas
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
// INSTRUCTIONS - 6 agentes
// ═══════════════════════════════════════════════
const INSTRUCTIONS = {};

INSTRUCTIONS['Agente DirTrab'] = `ESCOPO TEM\u00c1TICO:
Voc\u00ea \u00e9 o agente central de Direito Trabalhista Macro. Seu dom\u00ednio abrange:
- Constitui\u00e7\u00e3o Federal: arts. 5\u00ba a 11 (direitos dos trabalhadores)
- CLT (Decreto-Lei 5.452/43): contrato de trabalho, jornada, f\u00e9rias, rescis\u00e3o, FGTS, multa 40%
- Reforma Trabalhista (Lei 13.467/2017): trabalho intermitente, teletrabalho, negocia\u00e7\u00e3o coletiva
- FGTS (Lei 8.036/90): dep\u00f3sito, saque, multa rescis\u00f3ria
- Trabalho tempor\u00e1rio (Lei 6.019/73), Trabalho rural (Lei 5.889/73)

LIMITES \u2014 N\u00c3O RESPONDA SOBRE:
- Normas Regulamentadoras (NRs) \u2192 redirecione ao agente NR.sPro
- S\u00famulas do TST/TRTs \u2192 redirecione ao agente S\u00famulasCore
- Precedentes vinculantes \u2192 redirecione ao agente PrecedentX
- Atos administrativos do TST \u2192 redirecione ao agente AtosTr
- Jurisprud\u00eancia espec\u00edfica \u2192 redirecione ao agente JurisPrud

FONTES PRIMORDIAIS:
CF/88 arts. 5\u00ba-11, CLT arts. 1-922, Lei 13.467/2017, Lei 8.036/90, Lei 6.019/73, Lei 5.889/73

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
REGRAS ABSOLUTAS DE ISOLAMENTO TEM\u00c1TICO
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
1) Responda EXCLUSIVAMENTE sobre o tema descrito no ESCOPO acima.
2) Use SOMENTE o conte\u00fado indexado na sua base de conhecimento.
3) N\u00c3O invente base legal, artigos, s\u00famulas ou n\u00fameros de normas.
4) Se a pergunta for sobre OUTRO tema, responda: "Esta pergunta est\u00e1 fora do meu escopo. Consulte o agente especializado no tema [nome]."
5) NUNCA misture regras de institutos diferentes.
6) Se n\u00e3o encontrar informa\u00e7\u00e3o, informe: "N\u00e3o localizei essa informa\u00e7\u00e3o na base normativa deste agente."
7) Quando citar legisla\u00e7\u00e3o, indique o dispositivo exato.
8) Mantenha respostas organizadas, diretas e com linguagem t\u00e9cnico-jur\u00eddica profissional.`;

INSTRUCTIONS['Agente AtosTr'] = `ESCOPO TEM\u00c1TICO:
Voc\u00ea \u00e9 o agente especialista em Atos Institucionais Trabalhistas. Seu dom\u00ednio abrange:
- Atos do TST: Conjuntos, Presid\u00eancia, Regimentais, Deliberativos
- Instru\u00e7\u00f5es Normativas do TST (INs)
- Atos da Vice-Presid\u00eancia e da ENAMAT
- Resolu\u00e7\u00f5es administrativas do TST e CSJT
- Provimentos e portarias da Corregedoria-Geral da JT
- Normas de organiza\u00e7\u00e3o judici\u00e1ria trabalhista

LIMITES \u2014 N\u00c3O RESPONDA SOBRE:
- Legisla\u00e7\u00e3o trabalhista material (CLT, CF) \u2192 redirecione ao agente DirTrab
- NRs de SST \u2192 redirecione ao agente NR.sPro
- S\u00famulas \u2192 redirecione ao agente S\u00famulasCore
- Jurisprud\u00eancia \u2192 redirecione ao agente JurisPrud

FONTES PRIMORDIAIS:
Portal JusLaboris (TST), Atos GP, GVP, ENAMAT, Regimento Interno do TST

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
REGRAS ABSOLUTAS DE ISOLAMENTO TEM\u00c1TICO
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
1) Responda EXCLUSIVAMENTE sobre atos institucionais trabalhistas.
2) Use SOMENTE o conte\u00fado indexado.
3) N\u00c3O invente atos, n\u00fameros ou datas.
4) Redirecione perguntas fora do escopo ao agente correto.
5) Se n\u00e3o encontrar: "N\u00e3o localizei essa informa\u00e7\u00e3o na base normativa deste agente."
6) Quando citar atos, indique n\u00famero, data e \u00f3rg\u00e3o emissor.
7) Mantenha respostas organizadas e t\u00e9cnicas.`;

INSTRUCTIONS['Agente NR.sPro'] = `ESCOPO TEM\u00c1TICO:
Voc\u00ea \u00e9 o agente especialista em Normas Regulamentadoras (NRs) de SST. Seu dom\u00ednio abrange:
- NR-01 a NR-38 (todas as NRs vigentes e revogadas)
- GRO/PGR (NR-01), SESMT (NR-04), CIPA (NR-05), EPI (NR-06)
- PCMSO/ASO (NR-07), Insalubridade (NR-15), Periculosidade (NR-16)
- Ergonomia (NR-17), Constru\u00e7\u00e3o civil (NR-18)
- Trabalho em altura (NR-35), Espa\u00e7os confinados (NR-33)
- Trabalho rural (NR-31), Minera\u00e7\u00e3o (NR-22)
- Instala\u00e7\u00f5es el\u00e9tricas (NR-10), M\u00e1quinas (NR-12), Caldeiras (NR-13)

LIMITES \u2014 N\u00c3O RESPONDA SOBRE:
- Legisla\u00e7\u00e3o trabalhista material \u2192 redirecione ao agente DirTrab
- Atos do TST \u2192 redirecione ao agente AtosTr
- S\u00famulas e precedentes \u2192 redirecione aos agentes S\u00famulasCore/PrecedentX

FONTES PRIMORDIAIS:
NR-01 a NR-38 (MTE), Portarias MTP, Manuais de aplica\u00e7\u00e3o, Guias t\u00e9cnicos

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
REGRAS ABSOLUTAS DE ISOLAMENTO TEM\u00c1TICO
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
1) Responda EXCLUSIVAMENTE sobre NRs e SST.
2) Use SOMENTE o conte\u00fado indexado.
3) N\u00c3O invente NRs, itens, subitens ou datas.
4) Redirecione perguntas fora do escopo.
5) Se n\u00e3o encontrar: "N\u00e3o localizei essa informa\u00e7\u00e3o na base normativa deste agente."
6) Cite o n\u00famero da NR, item e subitem exato.
7) Mantenha respostas t\u00e9cnicas e organizadas.`;

INSTRUCTIONS['Agente PrecedentX'] = `ESCOPO TEM\u00c1TICO:
Voc\u00ea \u00e9 o agente especialista em Precedentes Vinculantes e Repetitivos na Justi\u00e7a do Trabalho. Seu dom\u00ednio abrange:
- IRDR (Incidente de Resolu\u00e7\u00e3o de Demandas Repetitivas)
- Recursos de Revista Repetitivos (art. 896-C CLT)
- Temas repetitivos do TST (NUGEP)
- Decis\u00f5es vinculantes do STF em mat\u00e9ria trabalhista
- Teses fixadas em Repercuss\u00e3o Geral com impacto trabalhista

LIMITES \u2014 N\u00c3O RESPONDA SOBRE:
- S\u00famulas e OJs gen\u00e9ricas \u2192 redirecione ao agente S\u00famulasCore
- Legisla\u00e7\u00e3o material \u2192 redirecione ao agente DirTrab
- Atos administrativos \u2192 redirecione ao agente AtosTr
- NRs de SST \u2192 redirecione ao agente NR.sPro

FONTES PRIMORDIAIS:
NUGEP-TST, Recursos Repetitivos TST, Temas STF com impacto trabalhista

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
REGRAS ABSOLUTAS DE ISOLAMENTO TEM\u00c1TICO
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
1) Responda EXCLUSIVAMENTE sobre precedentes vinculantes e repetitivos.
2) Use SOMENTE o conte\u00fado indexado.
3) N\u00c3O invente temas, n\u00fameros ou teses.
4) Se n\u00e3o encontrar: "N\u00e3o localizei essa informa\u00e7\u00e3o na base deste agente."
5) Cite o n\u00famero do tema, tribunal e tese fixada.
6) Mantenha respostas organizadas e t\u00e9cnicas.`;

INSTRUCTIONS['Agente JurisPrud'] = `ESCOPO TEM\u00c1TICO:
Voc\u00ea \u00e9 o agente de intelig\u00eancia em Jurisprud\u00eancia Trabalhista. Seu dom\u00ednio abrange:
- Jurisprud\u00eancia do TST (ac\u00f3rd\u00e3os, decis\u00f5es monocr\u00e1ticas)
- Jurisprud\u00eancia dos TRTs (1\u00aa a 24\u00aa Regi\u00e3o)
- Entendimentos consolidados e posi\u00e7\u00f5es divergentes
- Correntes jurisprudenciais predominantes
- Tend\u00eancias decis\u00f3rias recentes

LIMITES \u2014 N\u00c3O RESPONDA SOBRE:
- Legisla\u00e7\u00e3o material \u2192 redirecione ao agente DirTrab
- S\u00famulas formalizadas \u2192 redirecione ao agente S\u00famulasCore
- Precedentes vinculantes formais \u2192 redirecione ao agente PrecedentX
- NRs de SST \u2192 redirecione ao agente NR.sPro
- Atos administrativos \u2192 redirecione ao agente AtosTr

FONTES PRIMORDIAIS:
Portal JT (jurisprudencia.jt.jus.br), Portal TST (jurisprudencia.tst.jus.br)

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
REGRAS ABSOLUTAS DE ISOLAMENTO TEM\u00c1TICO
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
1) Responda EXCLUSIVAMENTE sobre jurisprud\u00eancia trabalhista.
2) Use SOMENTE o conte\u00fado indexado.
3) N\u00c3O invente n\u00fameros de processos, ac\u00f3rd\u00e3os ou datas.
4) Se n\u00e3o encontrar: "N\u00e3o localizei essa informa\u00e7\u00e3o na base deste agente."
5) Cite o processo, turma, relator e data quando dispon\u00edvel.
6) Mantenha respostas organizadas e t\u00e9cnicas.`;

// SúmulasCore - title with special char, will use LIKE query
const INSTR_SUMULAS = `ESCOPO TEM\u00c1TICO:
Voc\u00ea \u00e9 o agente especialista em S\u00famulas Trabalhistas. Seu dom\u00ednio abrange:
- S\u00famulas do TST (ativas e canceladas): todas as 463+ s\u00famulas
- Orienta\u00e7\u00f5es Jurisprudenciais (OJs) do TST: SDI-1, SDI-2, SDC
- Precedentes Normativos do TST
- S\u00famulas dos TRTs: TRT1 a TRT24
- Hist\u00f3rico de cancelamentos e revis\u00f5es

LIMITES \u2014 N\u00c3O RESPONDA SOBRE:
- Legisla\u00e7\u00e3o trabalhista material \u2192 redirecione ao agente DirTrab
- NRs de SST \u2192 redirecione ao agente NR.sPro
- Atos administrativos \u2192 redirecione ao agente AtosTr
- Jurisprud\u00eancia de casos concretos \u2192 redirecione ao agente JurisPrud

FONTES PRIMORDIAIS:
Livro de S\u00famulas/OJs do TST, Portal TST, S\u00famulas TRT1-TRT24

\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
REGRAS ABSOLUTAS DE ISOLAMENTO TEM\u00c1TICO
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
1) Responda EXCLUSIVAMENTE sobre s\u00famulas, OJs e precedentes normativos.
2) Use SOMENTE o conte\u00fado indexado.
3) N\u00c3O invente n\u00fameros de s\u00famulas ou OJs.
4) Indique sempre se a s\u00famula est\u00e1 ATIVA ou CANCELADA.
5) Se n\u00e3o encontrar: "N\u00e3o localizei essa informa\u00e7\u00e3o na base normativa deste agente."
6) Cite o n\u00famero exato, tribunal e status.
7) Mantenha respostas organizadas e t\u00e9cnicas.`;

// ═══════════════════════════════════════════════
// SUPPLEMENTS
// ═══════════════════════════════════════════════
const SUPPLEMENTS = [
  {
    agentTitle: 'Agente DirTrab',
    docs: [
      {
        title: 'SUPP: Guia Operacional - Direito Trabalhista Macro',
        content: `GUIA OPERACIONAL - DIREITO TRABALHISTA MACRO

1. CONTRATO DE TRABALHO
O contrato individual de trabalho e o acordo tacito ou expresso correspondente a relacao de emprego (art. 442 CLT). Requisitos: pessoalidade, habitualidade, onerosidade, subordinacao. A CLT presume contrato por prazo indeterminado. Contratos por prazo determinado: experiencia (ate 90 dias), obra certa, safra, Lei 9.601/98. Contrato intermitente (art. 443, par.3, CLT - Reforma): prestacao de servicos com subordinacao nao continua, com alternancia de periodos de prestacao e inatividade.

2. JORNADA DE TRABALHO
Jornada normal: 8h/dia, 44h/semana (art. 7, XIII, CF e art. 58 CLT). Horas extras: limite 2h/dia (art. 59), adicional minimo 50% (art. 7, XVI, CF). Banco de horas: compensacao 6 meses (acordo individual) ou 1 ano (ACT/CCT). Jornada 12x36: valida por acordo individual escrito (art. 59-A CLT). Intervalo intrajornada: minimo 1h para jornada >6h; reducao por acordo/convencao apos Reforma (art. 611-A, III). Trabalho noturno: 22h-5h (urbano) adicional 20% (art. 73 CLT); rural 21h-5h (lavoura) ou 20h-4h (pecuaria) adicional 25%.

3. FERIAS
Direito apos 12 meses de vigencia (art. 130 CLT). Fracionamento em ate 3 periodos (Reforma), sendo um com minimo 14 dias e demais minimo 5 dias (art. 134, par.1). Terco constitucional (art. 7, XVII, CF). Abono pecuniario: conversao 1/3 em dinheiro (art. 143). Ferias proporcionais devidas na rescisao (Sumula 171 TST).

4. RESCISAO DO CONTRATO
Sem justa causa: aviso previo (30d + 3d/ano, max 90), saldo salario, ferias venc+prop+1/3, 13o prop, multa 40% FGTS, saque FGTS, seguro-desemprego. Pedido de demissao: saldo salario, ferias venc+prop+1/3, 13o prop. Justa causa (art. 482 CLT): improbidade, incontinencia, negociacao habitual, condenacao, desidia, embriaguez, violacao segredo, indisciplina, insubordinacao, abandono, ofensas. Rescisao indireta (art. 483). Acordo mutuo (art. 484-A Reforma): metade aviso e multa FGTS (20%), saque 80% FGTS, sem seguro.

5. FGTS (LEI 8.036/90)
Deposito mensal 8% (2% aprendiz). Saque: demissao s/ justa causa, aposentadoria, doenca grave, 3 anos desempregado, falecimento, compra imovel, saque-aniversario. Multa: 40% demissao s/ justa causa; 20% acordo mutuo. Prescricao 5 anos (Sumula 362 TST, ARE 709212 STF).

6. REFORMA TRABALHISTA (LEI 13.467/2017)
Negociado prevalece sobre legislado em 15 materias (art. 611-A); trabalho intermitente; teletrabalho (arts. 75-A a 75-E); fim da ultratividade; honorarios sucumbenciais na JT; limitacao dano moral por faixas; quitacao anual (art. 507-B); arbitragem para remuneracao >2x teto RGPS.

7. TRABALHO TEMPORARIO (LEI 6.019/73)
Prazo: 180 dias + 90 dias prorrogaveis. Direitos: remuneracao equivalente, jornada 8h, adicional HE, ferias proporcionais +1/3, FGTS.`
      },
      {
        title: 'SUPP: FAQ Pratico - Direito Trabalhista',
        content: `PERGUNTAS FREQUENTES - DIREITO TRABALHISTA (FAQ)

P: Qual o prazo do aviso previo?
R: 30 dias (minimo) mais 3 dias por ano trabalhado, ate o maximo de 90 dias (Lei 12.506/2011 e art. 7, XXI, CF).

P: Quando a jornada 12x36 e valida?
R: Apos a Reforma (Lei 13.467/2017), pode ser pactuada por acordo individual escrito, convencao ou acordo coletivo (art. 59-A CLT).

P: O que mudou com a Reforma sobre ferias?
R: Fracionamento em ate 3 periodos, sendo um com minimo 14 dias e demais com minimo 5 dias (art. 134, par.1, CLT).

P: Quais os direitos na rescisao por acordo mutuo?
R: Metade aviso previo (se indenizado), multa 20% FGTS, saque 80% FGTS, demais verbas integrais. Sem seguro-desemprego (art. 484-A CLT).

P: O que e trabalho intermitente?
R: Prestacao de servicos com subordinacao nao continua, com alternancia de periodos de prestacao e inatividade. Convocacao com 3 dias de antecedencia, 1 dia util para responder (art. 452-A CLT).

P: Empregado domestico tem FGTS?
R: Sim. Desde a LC 150/2015, FGTS obrigatorio com deposito 8% + 3,2% indenizacao compensatoria.`
      }
    ]
  },
  {
    agentTitle: 'Agente AtosTr',
    docs: [
      {
        title: 'SUPP: Guia Operacional - Atos Institucionais Trabalhistas',
        content: `GUIA OPERACIONAL - ATOS INSTITUCIONAIS TRABALHISTAS

1. ESTRUTURA NORMATIVA DO TST
O TST edita atos em diversas categorias:
- ATOS CONJUNTOS: firmados entre Presidente do TST e outro orgao (CNJ, CSJT). Versam sobre procedimentos unificados.
- ATOS DA PRESIDENCIA (GP): organiza administrativa, comissoes, designacoes.
- ATOS DA VICE-PRESIDENCIA (GVP): admissibilidade de recursos, filtros de repercussao, processos repetitivos.
- ATOS REGIMENTAIS: alteram ou complementam o Regimento Interno do TST.
- ATOS DELIBERATIVOS: decidem questoes do Tribunal Pleno ou OE.
- INSTRUCOES NORMATIVAS (IN): regulamentam procedimentos processuais.

2. INSTRUCOES NORMATIVAS DO TST RELEVANTES
- IN 39/2016: compatibiliza CPC/2015 com processo do trabalho. Define quais artigos do CPC se aplicam subsidiariamente.
- IN 41/2018: disciplina aplicacao das normas processuais da Reforma Trabalhista (Lei 13.467/2017) no TST.
- IN 40/2016: regula procedimento sumarissimo e uniformizacao de jurisprudencia.

3. ENAMAT
Escola Nacional de Formacao e Aperfeicoamento de Magistrados do Trabalho. Edita atos de formacao, capacitacao, seminarios.

4. CSJT
Conselho Superior da Justica do Trabalho. Supervisiona administrativa e orcamentariamente os TRTs. Edita resolucoes e recomendacoes.

5. COMO BUSCAR ATOS NO JUSLABORIS
Repositorio JusLaboris (juslaboris.tst.jus.br) cataloga todos os atos normativos do TST. Filtros: especie do ato, orgao emissor, ano, vigencia. Atos podem estar vigentes, revogados parcial ou totalmente.`
      },
      {
        title: 'SUPP: FAQ Pratico - Atos Trabalhistas',
        content: `PERGUNTAS FREQUENTES - ATOS TRABALHISTAS (FAQ)

P: O que e a IN 39 do TST?
R: Instrucao Normativa 39/2016 regulamenta aplicacao subsidiaria do CPC/2015 ao processo do trabalho. Define quais dispositivos se aplicam e quais nao na JT.

P: Qual a diferenca entre ato da presidencia e ato regimental?
R: Ato da Presidencia e expedido pelo Gabinete da Presidencia para questoes administrativas. Ato Regimental altera ou complementa o Regimento Interno do TST.

P: Onde encontro os atos vigentes do TST?
R: No repositorio JusLaboris (juslaboris.tst.jus.br), filtrando por especie, orgao emissor e vigencia.

P: O que regulamenta a IN 41/2018?
R: A IN 41/2018 disciplina aplicacao das normas processuais da Reforma Trabalhista (Lei 13.467/2017) no TST, incluindo honorarios sucumbenciais, gratuidade de justica e rito sumarissimo.`
      }
    ]
  },
  {
    agentTitle: 'Agente NR.sPro',
    docs: [
      {
        title: 'SUPP: Guia Operacional - Normas Regulamentadoras',
        content: `GUIA OPERACIONAL - NORMAS REGULAMENTADORAS (NRs)

1. VISAO GERAL
As NRs sao disposicoes complementares ao Cap V da CLT (Seguranca e Medicina do Trabalho). Vigentes desde Portaria 3.214/1978 do MTE. Existem 38 NRs (NR-01 a NR-38), sendo NR-02 e NR-27 revogadas.

2. NRs ESSENCIAIS POR TEMA

GRO/PGR (NR-01): Gerenciamento de Riscos Ocupacionais. Toda empresa deve elaborar PGR com inventario de riscos e plano de acao. Substituiu PPRA desde jan/2022.

SESMT (NR-04): dimensionamento do Servico Especializado em Engenharia de Seguranca e Medicina do Trabalho conforme grau de risco e numero de empregados.

CIPA (NR-05): Comissao Interna de Prevencao de Acidentes e Assedio. Representantes dos empregados (eleitos) e do empregador (indicados).

EPI (NR-06): Equipamento de Protecao Individual. Empregador fornece gratuitamente, adequado ao risco. Empregado deve usar e conservar.

PCMSO (NR-07): Exames obrigatorios: admissional, periodico, retorno ao trabalho, mudanca funcao, demissional.

INSALUBRIDADE (NR-15): Exposicao acima limites gera adicional 10% (minimo), 20% (medio) ou 40% (maximo) sobre salario minimo. 14 anexos.

PERICULOSIDADE (NR-16): Inflamaveis, explosivos, energia eletrica, roubos/violencia, motocicleta. Adicional 30% sobre salario base.

ERGONOMIA (NR-17): Condicoes adaptadas psicofisiologicamente. Mobiliario, equipamentos, organizacao, teleatendimento (Anexo II).

TRABALHO EM ALTURA (NR-35): Acima de 2 metros. Exige capacitacao, APR, PT, sistemas contra quedas.

ESPACOS CONFINADOS (NR-33): Ambientes nao projetados para ocupacao continua, acesso restrito. Supervisao, APR, equipe resgate.

3. FISCALIZACAO E PENALIDADES (NR-28)
Multas conforme NR-28 dosadas por gravidade, porte e reincidencia. Embargo/interdicao em risco grave e iminente.`
      },
      {
        title: 'SUPP: FAQ Pratico - Normas Regulamentadoras',
        content: `PERGUNTAS FREQUENTES - NORMAS REGULAMENTADORAS (FAQ)

P: O que substituiu o PPRA?
R: O PGR (Programa de Gerenciamento de Riscos) da NR-01, desde janeiro de 2022. Abrange inventario de riscos e plano de acao.

P: Quando a empresa precisa ter CIPA?
R: Toda empresa com empregados, conforme NR-05. Empresas com ate 19 empregados (dependendo do grau de risco e CNAE) devem designar 1 representante.

P: Qual a diferenca entre insalubridade e periculosidade?
R: Insalubridade (NR-15): exposicao a agentes nocivos, adicional 10/20/40% sobre salario minimo. Periculosidade (NR-16): contato com agentes perigosos, adicional 30% sobre salario base. Nao cumulam (empregado opta).

P: Trabalho em altura a partir de quantos metros?
R: NR-35 define como atividade acima de 2 metros do nivel inferior com risco de queda.

P: O que fazer quando ha risco grave e iminente?
R: Auditor fiscal pode determinar embargo (obra) ou interdicao (estabelecimento/setor) nos termos da NR-03. Retomada somente apos eliminacao do risco.`
      }
    ]
  },
  {
    agentTitle: 'Agente PrecedentX',
    docs: [
      {
        title: 'SUPP: Guia Operacional - Precedentes Vinculantes Trabalhistas',
        content: `GUIA OPERACIONAL - PRECEDENTES VINCULANTES E REPETITIVOS NA JT

1. SISTEMA DE PRECEDENTES
A CLT (art. 896-C, Lei 13.015/2014) instituiu recursos de revista repetitivos. O NUGEP (Nucleo de Gerenciamento de Precedentes) do TST administra os temas.

2. TEMAS REPETITIVOS DO TST
- Tema 1: Responsabilidade subsidiaria da Adm Publica (art. 71 Lei 8.666). STF (ADC 16 e RE 760931): mera inadimplencia nao transfere automaticamente; responde se comprovada culpa in vigilando.
- Tema 2: Transcendencia no recurso de revista (art. 896-A CLT). Criterios: politica, juridica, social, economica.
- Tema 6: Correcao monetaria de creditos trabalhistas. STF (ADC 58/59): IPCA-E pre-judicial e SELIC judicial.
- Tema 10: Honorarios sucumbenciais na JT. Apos Reforma, devidos inclusive por beneficiario da JG em caso de creditos em outro processo.

3. DECISOES VINCULANTES DO STF COM IMPACTO TRABALHISTA
- ADPF 324 / RE 958.252: Terceirizacao irrestrita e licita.
- RE 693.456: Desconto de dias parados em greve e regra geral, salvo negociacao.
- ADI 5.766: Parcialmente inconstitucional dispositivo sobre custas para beneficiario da JG.
- ARE 709.212: Prescricao do FGTS e quinquenal (nao mais trintenaria).

4. FORCA VINCULANTE
Teses fixadas em IRDR, IAC e repetitivos vinculam juizos e tribunais inferiores. Decisoes STF em controle concentrado e repercussao geral vinculam todos.`
      },
      {
        title: 'SUPP: FAQ Pratico - Precedentes Trabalhistas',
        content: `PERGUNTAS FREQUENTES - PRECEDENTES TRABALHISTAS (FAQ)

P: Qual o indice de correcao monetaria dos creditos trabalhistas?
R: STF fixou na ADC 58/59: IPCA-E na fase pre-judicial e taxa SELIC na fase judicial (a partir do ajuizamento).

P: A Administracao Publica responde por debitos de terceirizados?
R: Nao automaticamente. STF (ADC 16, RE 760.931, Tema 246): mera inadimplencia nao transfere, mas responde se comprovada culpa in vigilando.

P: A terceirizacao de atividade-fim e permitida?
R: Sim. STF (ADPF 324 e RE 958.252) declarou licita a terceirizacao de qualquer atividade, superando restricao da Sumula 331.

P: Os dias parados em greve podem ser descontados?
R: Sim, como regra geral. STF (RE 693.456): desconto e a regra, salvo acordo em negociacao coletiva.`
      }
    ]
  },
  {
    agentTitle: 'Agente JurisPrud',
    docs: [
      {
        title: 'SUPP: Guia Operacional - Jurisprudencia Trabalhista',
        content: `GUIA OPERACIONAL - JURISPRUDENCIA TRABALHISTA

1. ESTRUTURA DA JURISPRUDENCIA NA JT
Formada por decisoes do TST (turmas, SDI-1, SDI-2, SDC, Pleno) e TRTs. Portais: jurisprudencia.tst.jus.br e jurisprudencia.jt.jus.br (base unificada).

2. TEMAS JURISPRUDENCIAIS RELEVANTES

VINCULO EM PLATAFORMAS DIGITAIS: Divergencia entre TRTs. Alguns reconhecem (TRT SP, MG), outros nao. TST sem tese consolidada. Tema em discussao no STF.

DANO MORAL POR ASSEDIO: Consolidado que assedio moral gera indenizacao. Valor conforme gravidade, reiteracao e porte da empresa. Reforma criou teto por faixas (art. 223-G CLT), mas STF flexibilizou.

HORAS EXTRAS DE MOTORISTA: Apos Reforma e Lei 13.103/2015, regras especiais. Controle por tacografo ou meio eletronico e valido para prova.

DISPENSA COLETIVA: STF (RE 999.435): nao depende de previa negociacao sindical, mas e desejavel.

ESTABILIDADE DIRIGENTE SINDICAL: Desde registro da candidatura ate 1 ano apos mandato (art. 8, VIII, CF e art. 543, par.3, CLT).

INTERVALO ART. 384 CLT (REVOGADO): Mulheres tinham 15min antes de HE. Revogado pela Reforma. Jurisprudencia aplica para periodos anteriores.

3. TENDENCIAS 2025-2026
- Regulamentacao trabalho em plataformas digitais
- Teses sobre teletrabalho e direito a desconexao
- Revisao sumulas pos-Reforma
- NR-01 com riscos psicossociais a partir de 2025`
      },
      {
        title: 'SUPP: FAQ Pratico - Jurisprudencia Trabalhista',
        content: `PERGUNTAS FREQUENTES - JURISPRUDENCIA TRABALHISTA (FAQ)

P: Motorista de app tem vinculo de emprego?
R: Controverso. TRT-SP e TRT-MG ja reconheceram em alguns casos; outros TRTs negaram. TST sem tese vinculante. STF tera palavra final.

P: Qual o valor de indenizacao por assedio moral?
R: Varia conforme gravidade, frequencia e porte da empresa. Reforma fixou teto por faixas (art. 223-G CLT), STF flexibilizou. Na pratica, R$5.000 a R$100.000+ dependendo do caso.

P: A dispensa coletiva precisa de negociacao sindical?
R: STF (RE 999.435): nao e obrigatoria, mas e recomendavel.

P: Como funciona a correcao de creditos trabalhistas?
R: ADC 58/59 do STF: IPCA-E da data do vencimento ate ajuizamento, e SELIC apos ajuizamento (inclui correcao e juros).`
      }
    ]
  }
];

// Also add SúmulasCore supplement separately (title with special char)
const SUMULAS_SUPPLEMENTS = [
  {
    title: 'SUPP: Guia Operacional - Sumulas Trabalhistas',
    content: `GUIA OPERACIONAL - SUMULAS E OJs TRABALHISTAS

1. SUMULAS DO TST - VISAO GERAL
O TST possui mais de 463 sumulas, alem de centenas de OJs (SDI-1, SDI-2, SDC). Consolidam entendimentos reiterados. Podem ser ATIVAS ou CANCELADAS.

2. SUMULAS MAIS RELEVANTES

Sumula 6 (Equiparacao salarial): mesma funcao, mesmo empregador, mesma localidade, simultaneidade. Reforma: mesmo estabelecimento, max 4 anos diferenca tempo servico, max 2 anos no exercicio da funcao.

Sumula 85 (Compensacao de jornada): Regime por acordo individual escrito. Prestacao habitual de HE descaracteriza acordo mas nao afeta banco de horas.

Sumula 244 (Gestante - estabilidade): Confirmacao da gravidez ate 5 meses apos parto (art. 10, II, b, ADCT). Inclusive contrato prazo determinado (item III).

Sumula 331 (Terceirizacao): Historicamente limitava a atividade-meio. Apos Lei 13.429/2017 e STF (ADPF 324), terceirizacao irrestrita e licita. Sumula relevante quanto a responsabilidade subsidiaria do tomador.

Sumula 378 (Estabilidade acidentaria): 12 meses apos cessacao do auxilio-doenca acidentario (art. 118, Lei 8.213/91). Nao exige afastamento >15 dias se comprovado nexo causal.

Sumula 443 (Dispensa discriminatoria): Presume-se discriminatoria dispensa de portador de HIV ou doenca grave que cause estigma. Reintegracao.

Sumula 461 (FGTS - prescricao): 5 anos a partir da lesao (ARE 709.212 STF).

3. ORIENTACOES JURISPRUDENCIAIS (OJs)
OJs da SDI-1 e SDI-2 consolidam temas ainda nao sumulados:
- OJ SDI-1 370: Horas in itinere (suprimidas pela Reforma, mas OJ vale para periodos anteriores).
- OJ SDI-1 383: Terceirizacao e isonomia salarial.

4. SUMULAS DOS TRTs
Cada TRT (1a a 24a) pode editar sumulas proprias para uniformizar entendimentos regionais.`
  },
  {
    title: 'SUPP: FAQ Pratico - Sumulas Trabalhistas',
    content: `PERGUNTAS FREQUENTES - SUMULAS TRABALHISTAS (FAQ)

P: A Sumula 331 ainda vale apos liberacao da terceirizacao?
R: Em parte. STF declarou licita terceirizacao irrestrita (ADPF 324, RE 958.252). Mas Sumula 331 permanece relevante para responsabilidade subsidiaria do tomador (item IV).

P: Qual prazo de prescricao do FGTS?
R: 5 anos a partir da lesao (Sumula 461 TST, modulacao STF ARE 709.212).

P: Gestante em contrato temporario tem estabilidade?
R: Sim. Sumula 244, item III, garante estabilidade mesmo em contrato por prazo determinado.

P: O que dizem as sumulas sobre HE habituais?
R: Sumula 85: prestacao habitual descaracteriza acordo de compensacao, mas nao afeta banco de horas formalizado.

P: Dispensa de empregado com HIV e discriminatoria?
R: Sumula 443: presume-se discriminatoria, gerando direito a reintegracao.`
  }
];

// ═══════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════
async function main() {
  console.log('\n' + '='.repeat(55));
  console.log(' UPGRADE TRABALHISTA - 6 Agentes');
  console.log('='.repeat(55) + '\n');

  // FASE 1: Instructions
  console.log('--- FASE 1: Atualizando INSTRUCTIONS ---\n');

  for (const [title, newInstr] of Object.entries(INSTRUCTIONS)) {
    const r = await pool.query(
      'UPDATE agents SET instructions = $1 WHERE user_id IS NULL AND title = $2 RETURNING id, title',
      [newInstr, title]
    );
    if (r.rows.length) {
      console.log('  OK ' + title + ': ' + newInstr.length + ' chars');
    } else {
      console.log('  MISS ' + title);
    }
  }

  // SúmulasCore - special char title, use LIKE
  const sumRes = await pool.query(
    "UPDATE agents SET instructions = $1 WHERE user_id IS NULL AND title LIKE '%mulasCore%' RETURNING id, title",
    [INSTR_SUMULAS]
  );
  if (sumRes.rows.length) {
    console.log('  OK S\u00famulasCore: ' + INSTR_SUMULAS.length + ' chars');
  } else {
    console.log('  MISS S\u00famulasCore');
  }

  // FASE 2: Supplements
  console.log('\n--- FASE 2: Injetando SUPPLEMENTS ---\n');
  let totalChunks = 0;

  for (const { agentTitle, docs } of SUPPLEMENTS) {
    const agRow = await pool.query(
      'SELECT id FROM agents WHERE user_id IS NULL AND title = $1',
      [agentTitle]
    );
    if (!agRow.rows.length) {
      console.log('  MISS agent: ' + agentTitle);
      continue;
    }
    const agentId = agRow.rows[0].id;

    for (const doc of docs) {
      const cnt = await injectDoc(agentId, agentTitle, doc);
      totalChunks += cnt;
    }
  }

  // SúmulasCore supplements
  const sumAgent = await pool.query(
    "SELECT id FROM agents WHERE user_id IS NULL AND title LIKE '%mulasCore%'"
  );
  if (sumAgent.rows.length) {
    const sumAgentId = sumAgent.rows[0].id;
    for (const doc of SUMULAS_SUPPLEMENTS) {
      const cnt = await injectDoc(sumAgentId, 'S\u00famulasCore', doc);
      totalChunks += cnt;
    }
  }

  // Report
  console.log('\n--- RELATORIO FINAL ---\n');
  const final = await pool.query(`
    SELECT a.title, length(a.instructions) AS instr_len,
      (SELECT count(*)::int FROM document_chunks dc WHERE dc.agent_id = a.id) AS chunks
    FROM agents a
    WHERE a.user_id IS NULL
      AND (a.title ILIKE '%DirTrab%' OR a.title ILIKE '%AtosTr%' OR a.title ILIKE '%NR%Pro%'
        OR a.title ILIKE '%mulasC%' OR a.title ILIKE '%PrecedentX%' OR a.title ILIKE '%JurisPrud%')
    ORDER BY a.title
  `);
  console.table(final.rows);
  console.log('Total novos chunks injetados: ' + totalChunks);
  console.log('\nConcluido!\n');
  await pool.end();
}

async function injectDoc(agentId, agentLabel, doc) {
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
  console.log('  ADD ' + agentLabel + ' -> ' + doc.title + ': ' + chunks.length + ' chunks');

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
  totalChunks_temp = inserted;
  console.log('     -> ' + inserted + ' chunks com embedding\n');
  await sleep(EMBED_DELAY_MS);
  return inserted;
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
