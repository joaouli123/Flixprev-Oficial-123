import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const ROOT = process.cwd();
const REPORT_JSON = path.join(ROOT, 'attached_assets', 'tributario-production-battery-report.json');
const REPORT_MD = path.join(ROOT, 'attached_assets', 'tributario-production-battery-report.md');
const BASE_URL = String(
  process.env.APP_BASE_URL ||
    process.env.VITE_API_BASE_URL ||
    'https://flixprev-oficial-123-production.up.railway.app'
).replace(/\/$/, '');
const USER_ID = String(process.env.RAG_TEST_USER_ID || '4a2e1967-12ce-4850-9e93-c2a761f2b779').trim();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const AGENT_MATRIX = [
  {
    title: 'DTrib',
    displayTitle: 'Agente Direito Tributario',
    questions: [
      { level: 'basico', q: 'Qual a diferenca entre imposto, taxa e contribuicao de melhoria?' },
      { level: 'basico', q: 'Quais sao as principais limitacoes constitucionais ao poder de tributar?' },
      { level: 'basico', q: 'O que sao imunidades tributarias na Constituicao?' },
      { level: 'basico', q: 'Qual e o papel do CTN no sistema tributario nacional?' },
      { level: 'basico', q: 'O que a Lei Complementar 123 regula no ambito tributario?' },
      { level: 'medio', q: 'Qual e a diferenca entre ICMS e ISS em termos de competencia e fato gerador?' },
      { level: 'medio', q: 'O que a Lei Complementar 87 disciplina no ICMS?' },
      { level: 'medio', q: 'O que a Lei Complementar 116 disciplina no ISS?' },
      { level: 'medio', q: 'Como a EC 132 alterou a estrutura do sistema tributario brasileiro?' },
      { level: 'medio', q: 'Qual a funcao do Decreto 9.580 de 2018 no direito tributario?' },
      { level: 'avancado', q: 'Como funciona a execucao fiscal pela Lei 6.830?' },
      { level: 'avancado', q: 'O que e divida ativa da Fazenda Publica e quais encargos ela abrange?' },
      { level: 'avancado', q: 'Qual e o efeito juridico da inscricao em divida ativa para a cobranca judicial?' },
      { level: 'avancado', q: 'Quais bases legais estruturam o PIS e a Cofins nao cumulativos no escopo deste agente?' },
      { level: 'avancado', q: 'Como LC 214 e LC 227 aparecem no contexto geral do direito tributario deste agente?' },
    ],
  },
  {
    title: 'CTN Expert',
    displayTitle: 'Agente de Interpretacao Tributaria',
    questions: [
      { level: 'basico', q: 'O que e lancamento tributario?' },
      { level: 'basico', q: 'Quais sao as modalidades de lancamento tributario?' },
      { level: 'basico', q: 'Qual a diferenca entre obrigacao tributaria principal e acessoria?' },
      { level: 'basico', q: 'O que e fato gerador da obrigacao tributaria?' },
      { level: 'basico', q: 'O que e denuncia espontanea no CTN?' },
      { level: 'medio', q: 'Quais sao as causas de suspensao do credito tributario?' },
      { level: 'medio', q: 'Quais sao as formas de extincao do credito tributario?' },
      { level: 'medio', q: 'O que significa exclusao do credito tributario?' },
      { level: 'medio', q: 'Qual a diferenca entre decadencia e prescricao tributaria?' },
      { level: 'medio', q: 'Como funciona a responsabilidade tributaria de terceiros no CTN?' },
      { level: 'avancado', q: 'Quais sao as garantias e privilegios do credito tributario?' },
      { level: 'avancado', q: 'Quando cabe certidao positiva com efeitos de negativa?' },
      { level: 'avancado', q: 'Como o Decreto 70.235 organiza o processo administrativo fiscal federal?' },
      { level: 'avancado', q: 'Em que hipoteses a autoridade pode revisar o lancamento de oficio?' },
      { level: 'avancado', q: 'Qual a diferenca entre moratoria e parcelamento no tratamento do credito tributario?' },
    ],
  },
  {
    title: 'REFIS-IA',
    displayTitle: 'Agente Reforma Tributaria Atual',
    questions: [
      { level: 'basico', q: 'O que e o IBS e o que ele substitui?' },
      { level: 'basico', q: 'O que e a CBS e o que ela substitui?' },
      { level: 'basico', q: 'O que e o Imposto Seletivo na reforma tributaria?' },
      { level: 'basico', q: 'Qual e o papel da EC 132 de 2023 na reforma tributaria?' },
      { level: 'basico', q: 'Qual e a finalidade da LC 214 de 2025 na reforma tributaria?' },
      { level: 'medio', q: 'Como funciona o cronograma de transicao da reforma tributaria entre 2026 e 2033?' },
      { level: 'medio', q: 'O que acontece em 2026 na fase inicial da transicao da reforma?' },
      { level: 'medio', q: 'Como a reforma trata a substituicao de ICMS e ISS pelo IBS?' },
      { level: 'medio', q: 'Como a reforma trata a substituicao de PIS e Cofins pela CBS?' },
      { level: 'medio', q: 'Qual e a competencia compartilhada do IBS entre Estados, Municipios e DF?' },
      { level: 'avancado', q: 'O que e split payment na reforma tributaria?' },
      { level: 'avancado', q: 'O que e cashback tributario na reforma?' },
      { level: 'avancado', q: 'Qual e a funcao do Comite Gestor do IBS?' },
      { level: 'avancado', q: 'Como a reforma trata regimes diferenciados e o Simples Nacional?' },
      { level: 'avancado', q: 'Como exportacoes e regimes especiais aparecem no desenho da reforma tributaria?' },
    ],
  },
  {
    title: 'TAX-Rend',
    displayTitle: 'Simulador inteligente de calculos, deducoes, retencoes e aliquotas aplicaveis',
    questions: [
      { level: 'basico', q: 'Quem ganha ate R$ 5.000 por mes esta isento de IR?' },
      { level: 'basico', q: 'Como funciona a isencao efetiva ate R$ 5.000 criada em 2025?' },
      { level: 'basico', q: 'Qual e a diferenca geral entre IRPF e IRPJ no escopo deste agente?' },
      { level: 'basico', q: 'O que o Decreto 9.580 de 2018 consolida em materia de imposto de renda?' },
      { level: 'basico', q: 'O que e desconto simplificado na apuracao do IRPF?' },
      { level: 'medio', q: 'Qual a diferenca entre Lucro Real e Lucro Presumido no IRPJ?' },
      { level: 'medio', q: 'Quais deducoes sao admitidas na declaracao anual do IRPF segundo a base deste agente?' },
      { level: 'medio', q: 'Como despesas com educacao entram na declaracao anual do IRPF?' },
      { level: 'medio', q: 'Como despesas medicas entram na declaracao anual do IRPF?' },
      { level: 'medio', q: 'Como dependentes interferem no calculo do IRPF?' },
      { level: 'avancado', q: 'Como a Lei 15.270 de 2025 trata a tributacao minima das altas rendas?' },
      { level: 'avancado', q: 'Como a base deste agente trata ganho de capital de pequeno valor para pessoa fisica?' },
      { level: 'avancado', q: 'Como a legislacao diferencia rendimentos isentos e rendimentos tributaveis no IRPF?' },
      { level: 'avancado', q: 'Quais sao os principais regimes de apuracao do IRPJ tratados pela base deste agente?' },
      { level: 'avancado', q: 'Quais limites e cuidados este agente destaca para responder sobre deducoes do IRPF?' },
    ],
  },
  {
    title: 'FedTax',
    displayTitle: 'Guia de obrigacoes, prazos de pagamento, retencao na fonte e impacto de reformas',
    questions: [
      { level: 'basico', q: 'Quais tributos federais administrados pela RFB estao no escopo deste agente?' },
      { level: 'basico', q: 'Qual a diferenca entre PIS cumulativo e nao cumulativo?' },
      { level: 'basico', q: 'O que o Decreto 7.212 regula em materia de IPI?' },
      { level: 'basico', q: 'O que o Decreto 6.306 regula em materia de IOF?' },
      { level: 'basico', q: 'Qual e a base legal central da CSLL no escopo deste agente?' },
      { level: 'medio', q: 'Qual o codigo DARF para retencao conjunta de PIS Cofins e CSLL na fonte?' },
      { level: 'medio', q: 'Onde a base deste agente localiza os codigos de receita DARF?' },
      { level: 'medio', q: 'Como a base deste agente descreve obrigacoes e prazos de recolhimento dos principais tributos federais?' },
      { level: 'medio', q: 'Qual e a diferenca entre PIS/Cofins e CSLL no escopo de tributos federais?' },
      { level: 'medio', q: 'Como o SIEF de codigos de receita ajuda na identificacao do DARF correto?' },
      { level: 'avancado', q: 'Como funcionam as retencoes na fonte de PIS Cofins e CSLL no escopo deste agente?' },
      { level: 'avancado', q: 'Como a base deste agente distingue IPI, IOF, PIS, Cofins e CSLL por fato gerador?' },
      { level: 'avancado', q: 'Como o agente trata o impacto da reforma tributaria sobre tributos federais administrados pela RFB?' },
      { level: 'avancado', q: 'Como o Simples Nacional interage com tributos federais no escopo deste agente?' },
      { level: 'avancado', q: 'Quais fontes este agente usa para orientar sobre DARF, retencoes e codigos de receita?' },
    ],
  },
];

const FALLBACK_REGEX = /nao (localizei|encontrei)|não (localizei|encontrei)|fora do meu escopo|sem resposta|agente nao encontrado|agente não encontrado/i;
const SUPPORT_REGEX = /fonte|art\.|artigo|lei|lc |ec |ctn|decreto|in rfb|simples|ibs|cbs|darf/i;

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getSelectedTitles() {
  const raw = String(process.env.TRIBUT_TEST_AGENT_TITLES || '').trim();
  if (!raw) return null;
  const items = raw
    .split(/[;,]/)
    .map((item) => normalizeTitle(item))
    .filter(Boolean);
  return items.length ? new Set(items) : null;
}

function classifyAnswer(answer) {
  const text = String(answer || '').trim();
  if (!text) {
    return { status: 'fail', reason: 'empty_answer' };
  }
  if (FALLBACK_REGEX.test(text)) {
    return { status: 'fail', reason: 'fallback_answer' };
  }
  if (text.length < 160) {
    return { status: 'weak', reason: 'short_answer' };
  }
  if (!SUPPORT_REGEX.test(text)) {
    return { status: 'weak', reason: 'low_legal_grounding' };
  }
  return { status: 'pass', reason: 'grounded_answer' };
}

async function apiJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `${response.status} ${response.statusText}`);
  }
  return payload;
}

async function apiSseText(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(raw || `${response.status} ${response.statusText}`);
  }

  let content = '';
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('data: ')) continue;
    const json = line.slice(6).trim();
    if (!json) continue;
    const payload = JSON.parse(json);
    if (payload.content) content += payload.content;
  }

  return content.trim();
}

async function findAgentIds(titles) {
  const result = await pool.query(
    `SELECT id::text, title FROM agents WHERE user_id IS NULL AND title = ANY($1) ORDER BY title`,
    [titles]
  );
  const byTitle = new Map();
  for (const row of result.rows) {
    byTitle.set(row.title, row.id);
  }
  return byTitle;
}

function buildMarkdownReport(report) {
  const lines = [];
  lines.push('# Bateria Tributaria em Producao');
  lines.push('');
  lines.push(`Base URL: ${report.baseUrl}`);
  lines.push(`Executado em: ${report.generatedAt}`);
  lines.push(`Total: ${report.summary.totalQuestions} perguntas`);
  lines.push(`Pass: ${report.summary.pass}`);
  lines.push(`Weak: ${report.summary.weak}`);
  lines.push(`Fail: ${report.summary.fail}`);
  lines.push('');

  for (const agent of report.agents) {
    lines.push(`## ${agent.title}`);
    lines.push('');
    lines.push(`- Pass: ${agent.summary.pass}`);
    lines.push(`- Weak: ${agent.summary.weak}`);
    lines.push(`- Fail: ${agent.summary.fail}`);
    lines.push('');
    for (const item of agent.results) {
      lines.push(`### [${item.level}] ${item.question}`);
      lines.push('');
      lines.push(`- Status: ${item.status}`);
      lines.push(`- Reason: ${item.reason}`);
      lines.push('');
      lines.push('```text');
      lines.push(item.answer || item.error || '(sem conteudo)');
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}

async function main() {
  await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });

  const selectedTitles = getSelectedTitles();
  const limitPerAgent = Number.parseInt(String(process.env.TRIBUT_TEST_LIMIT_PER_AGENT || '').trim(), 10);
  const limit = Number.isFinite(limitPerAgent) && limitPerAgent > 0 ? limitPerAgent : null;

  const selectedAgents = selectedTitles
    ? AGENT_MATRIX.filter((agent) => selectedTitles.has(normalizeTitle(agent.title)) || selectedTitles.has(normalizeTitle(agent.displayTitle)))
    : AGENT_MATRIX;

  if (selectedTitles && selectedAgents.length === 0) {
    throw new Error(`TRIBUT_TEST_AGENT_TITLES sem correspondencia: ${process.env.TRIBUT_TEST_AGENT_TITLES}`);
  }

  const agentIds = await findAgentIds(selectedAgents.map((agent) => agent.title));
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    userId: USER_ID,
    summary: { totalQuestions: 0, pass: 0, weak: 0, fail: 0 },
    agents: [],
  };

  for (const agent of selectedAgents) {
    const agentId = agentIds.get(agent.title);
    if (!agentId) {
      throw new Error(`Agente nao encontrado no banco: ${agent.title}`);
    }

    const questions = limit ? agent.questions.slice(0, limit) : agent.questions;
    const agentReport = {
      title: agent.title,
      displayTitle: agent.displayTitle,
      agentId,
      summary: { totalQuestions: questions.length, pass: 0, weak: 0, fail: 0 },
      results: [],
    };

    for (const item of questions) {
      const conversation = await apiJson(`${BASE_URL}/api/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': USER_ID },
        body: JSON.stringify({ title: `[battery] ${agent.title}`, agentId }),
      });

      try {
        const answer = await apiSseText(`${BASE_URL}/api/conversations/${conversation.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': USER_ID },
          body: JSON.stringify({ content: item.q, agentId }),
        });
        const grade = classifyAnswer(answer);
        agentReport.summary[grade.status] += 1;
        report.summary[grade.status] += 1;
        report.summary.totalQuestions += 1;
        agentReport.results.push({
          level: item.level,
          question: item.q,
          status: grade.status,
          reason: grade.reason,
          answer,
        });
      } catch (error) {
        agentReport.summary.fail += 1;
        report.summary.fail += 1;
        report.summary.totalQuestions += 1;
        agentReport.results.push({
          level: item.level,
          question: item.q,
          status: 'fail',
          reason: 'runtime_error',
          error: String(error?.message || error),
        });
      } finally {
        await pool.query('DELETE FROM messages WHERE conversation_id = $1', [conversation.id]).catch(() => undefined);
        await pool.query('DELETE FROM conversations WHERE id = $1', [conversation.id]).catch(() => undefined);
      }
    }

    report.agents.push(agentReport);
  }

  await fs.writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(REPORT_MD, buildMarkdownReport(report), 'utf8');
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`REPORT_JSON=${REPORT_JSON}`);
  console.log(`REPORT_MD=${REPORT_MD}`);
  await pool.end();
}

await main().catch(async (error) => {
  console.error(error?.stack || error?.message || error);
  await pool.end();
  process.exitCode = 1;
});
