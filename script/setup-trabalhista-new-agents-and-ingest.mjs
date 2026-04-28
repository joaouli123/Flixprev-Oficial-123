import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import pdfParse from 'pdf-parse';
import OpenAI from 'openai';
import pkg from 'pg';

dotenv.config();

const CATEGORY_NAME = 'Dir. Trabalhista';
const ATTACH_BASE = path.join(process.cwd(), 'public', 'agent-attachments', 'trabalhista-novos-agentes');
const LOCK_KEY = 90612061;

function getFirstNonEmptyEnv(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function normalizeBaseUrl(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function normalizeTitle(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const geminiApiKey = getFirstNonEmptyEnv(process.env.GEMINI_API_KEY, process.env.GOOGLE_API_KEY);
const openAiApiKey = getFirstNonEmptyEnv(process.env.OPENAI_API_KEY);
const sharedOpenAiCompatibleApiKey = getFirstNonEmptyEnv(process.env.AI_INTEGRATIONS_OPENAI_API_KEY);
const embeddingModel = getFirstNonEmptyEnv(process.env.EMBEDDING_MODEL)
  || (openAiApiKey ? 'text-embedding-3-large' : (geminiApiKey ? 'gemini-embedding-001' : 'text-embedding-3-large'));
const aiApiKey = getFirstNonEmptyEnv(
  process.env.EMBEDDING_API_KEY,
  process.env.AI_EMBEDDING_API_KEY,
  openAiApiKey,
  geminiApiKey,
  sharedOpenAiCompatibleApiKey
);
const aiBaseURL = normalizeBaseUrl(getFirstNonEmptyEnv(
  process.env.EMBEDDING_BASE_URL,
  process.env.AI_EMBEDDING_BASE_URL,
  embeddingModel.startsWith('gemini-')
    ? 'https://generativelanguage.googleapis.com/v1beta/openai/'
    : process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
));

if (!aiApiKey) {
  throw new Error('Nenhuma credencial de embeddings configurada. Defina GEMINI_API_KEY, OPENAI_API_KEY ou AI_INTEGRATIONS_OPENAI_API_KEY.');
}

const openAiOptions = { apiKey: aiApiKey };
if (aiBaseURL) openAiOptions.baseURL = aiBaseURL;

const openai = new OpenAI(openAiOptions);

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const EMBED_BATCH_SIZE = 50;
const INSERT_CHUNK_BATCH_SIZE = 100;

const STRICT_RULES = `
═══════════════════════════════════════════════════════════════════
REGRAS ABSOLUTAS DE ISOLAMENTO TEMÁTICO
═══════════════════════════════════════════════════════════════════
1) Responda EXCLUSIVAMENTE sobre o tema descrito no ESCOPO TEMÁTICO acima.
2) Use SOMENTE o conteúdo indexado na sua base de conhecimento.
3) NÃO invente artigos, súmulas, precedentes, portarias, normas, números ou datas.
4) Se a pergunta do usuário for sobre OUTRO tema trabalhista específico que não o seu, responda:
   "Esta pergunta está fora do meu escopo. Por favor, consulte o agente especializado no tema [nome do tema correto]."
5) Se não encontrar informação na base indexada, informe: "Não localizei essa informação na base normativa deste agente."
6) Quando citar legislação, atos, súmulas ou precedentes, indique o identificador exato disponível na base.
7) Não misture institutos diferentes nem importe resposta de outro agente temático.
8) Mantenha respostas organizadas, diretas e com linguagem técnico-jurídica profissional.
`.trim();

const AGENTS = [
  {
    title: 'Agente DirTrab',
    role: 'Agente Direito Trabalhista Macro',
    description:
      'Agente central de Direito do Trabalho, com foco em CLT, Constituição, reforma trabalhista, FGTS, trabalho temporário e normas subsidiárias.',
    instructions: `
ESCOPO TEMÁTICO:
Você é o agente central de Direito do Trabalho. Seu domínio abrange:
- Constituição Federal aplicada ao trabalho, especialmente os direitos sociais e trabalhistas
- CLT e Reforma Trabalhista (Lei 13.467/2017)
- Contrato individual de trabalho, jornada, remuneração, férias, verbas rescisórias e FGTS
- Trabalho temporário (Lei 6.019/1974) e trabalho rural (Lei 5.889/1973)
- Instrumentos coletivos localizados no sistema Mediador do MTE
- Normas subsidiárias do Direito do Trabalho quando indexadas, como Código Civil, CPC e processo trabalhista histórico
- Reflexos previdenciários trabalhistas expressamente cobertos pelas fontes indexadas

LIMITES — NÃO RESPONDA SOBRE:
- Atos institucionais e instruções normativas do TST/CSJT → redirecione ao agente Agente AtosTr
- Normas regulamentadoras de SST → redirecione ao agente Agente NR.sPro
- Súmulas e orientações jurisprudenciais → redirecione ao agente Agente SúmulasCore
- Precedentes vinculantes e repetitivos → redirecione ao agente Agente PrecedentX
- Pesquisa jurisprudencial em portais oficiais → redirecione ao agente Agente JurisPrud

FONTES PRIMORDIAIS:
- Constituição Federal
- CLT (Decreto-Lei 5.452/1943)
- Lei 13.467/2017
- Lei 8.036/1990
- Lei 6.019/1974
- Lei 5.889/1973
- Código Civil, CPC e Decreto-Lei 1.608/1939 quando incidirem de forma subsidiária
- Lei 8.213/1991 nos pontos trabalhistas indexados
- Sistema Mediador do MTE

${STRICT_RULES}
`.trim(),
    urls: [
      'http://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm',
      'http://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm',
      'http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2017/lei/l13467.htm',
      'https://www.planalto.gov.br/ccivil_03/leis/l8036consol.htm',
      'http://www.planalto.gov.br/ccivil_03/leis/l6019.htm',
      'http://www.planalto.gov.br/ccivil_03/leis/l5889.htm',
      'https://www3.mte.gov.br/sistemas/mediador/',
      'https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm',
      'http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm',
      'https://www.planalto.gov.br/ccivil_03/decreto-lei/1937-1946/del1608.htm',
      'http://www.planalto.gov.br/ccivil_03/leis/l8213cons.htm',
      'https://www.cnj.jus.br/poder-judiciario/governanca-de-gestao-de-pessoas/contatos-de-gestao-de-pessoas-do-poder-judiciario/tribunais-regionais-do-trabalho/',
    ],
  },
  {
    title: 'Agente AtosTr',
    role: 'Atos Institucionais Trabalhistas',
    description:
      'Núcleo de busca e organização de atos administrativos e instruções normativas na área trabalhista, com foco em vigência, alteração e revogação.',
    instructions: `
ESCOPO TEMÁTICO:
Você é o agente especialista em atos institucionais e normas internas da Justiça do Trabalho. Seu domínio abrange:
- Atos conjuntos, atos da Presidência, Vice-Presidência, ENAMAT e atos regimentais do TST
- Atos deliberativos, instruções normativas e demais atos administrativos publicados no JusLaboris
- Identificação de vigência, alteração, revogação e histórico normativo
- Uso técnico dessa base para fundamentação institucional e processual

LIMITES — NÃO RESPONDA SOBRE:
- Direito material trabalhista geral → redirecione ao agente Agente DirTrab
- Normas regulamentadoras de SST → redirecione ao agente Agente NR.sPro
- Súmulas e orientações jurisprudenciais → redirecione ao agente Agente SúmulasCore
- Precedentes vinculantes e repetitivos → redirecione ao agente Agente PrecedentX
- Pesquisa jurisprudencial em portais oficiais → redirecione ao agente Agente JurisPrud

FONTES PRIMORDIAIS:
- JusLaboris e coleções oficiais do TST para atos conjuntos, atos, atos regimentais, atos deliberativos e instruções normativas

${STRICT_RULES}
`.trim(),
    urls: [
      'https://juslaboris.tst.jus.br/handle/20.500.12178/1/discover?filtertype_1=especieato&filter_relational_operator_1=equals&filter_1=Ato+Conjunto&filtertype_2=author&filter_relational_operator_2=equals&filter_2=Brasil.+Tribunal+Superior+do+Trabalho+%28TST%29&submit_apply_filter=&rpp=20&sort_by=dc.identifier.yearandnumber_sort&order=desc#main-container',
      'https://juslaboris.tst.jus.br/handle/20.500.12178/1/discover?order=desc&rpp=20&sort_by=dc.identifier.yearandnumber_sort&page=1&group_by=none&etal=0&filtertype_0=author&filtertype_1=especieato&filter_0=Brasil.+Tribunal+Superior+do+Trabalho+%28TST%29.+Gabinete+da+Presid%C3%AAncia+%28GP%29&filter_relational_operator_1=equals&filter_1=Ato&filter_relational_operator_0=equals#main-container',
      'https://juslaboris.tst.jus.br/handle/20.500.12178/1/discover?filtertype_1=author&filter_relational_operator_1=equals&filter_1=Brasil.+Tribunal+Superior+do+Trabalho+%28TST%29.+Gabinete+da+Vice-Presid%C3%AAncia+%28GVP%29&filtertype_2=author&filter_relational_operator_2=notequals&filter_2=Brasil.+Tribunal+Superior+do+Trabalho+%28TST%29.+Gabinete+da+Presid%C3%AAncia+%28GP%29&filtertype_3=author&filter_relational_operator_3=notcontains&filter_3=csjt&filtertype_4=especieato&filter_relational_operator_4=equals&filter_4=Ato&submit_apply_filter=&rpp=20&sort_by=dc.identifier.yearandnumber_sort&order=desc#main-container',
      'https://juslaboris.tst.jus.br/handle/20.500.12178/1/discover?filtertype_1=author&filter_relational_operator_1=equals&filter_1=Escola+Nacional+de+Forma%C3%A7%C3%A3o+e+Aperfei%C3%A7oamento+de+Magistrados+do+Trabalho+%28Brasil%29+%28Enamat%29&submit_apply_filter=&rpp=20&sort_by=dc.identifier.yearandnumber_sort&order=desc#main-container',
      'https://juslaboris.tst.jus.br/handle/20.500.12178/1/discover?filtertype_1=especieato&filter_relational_operator_1=equals&filter_1=Ato+Regimental&filtertype_2=author&filter_relational_operator_2=equals&filter_2=Brasil.+Tribunal+Superior+do+Trabalho+%28TST%29&submit_apply_filter=&rpp=20&sort_by=dc.identifier.yearandnumber_sort&order=desc#main-container',
      'https://juslaboris.tst.jus.br/handle/20.500.12178/1/discover?filtertype_1=especieato&filter_relational_operator_1=equals&filter_1=Ato+Deliberativo&filtertype_2=author&filter_relational_operator_2=equals&filter_2=Brasil.+Tribunal+Superior+do+Trabalho+%28TST%29&submit_apply_filter=&rpp=20&sort_by=dc.identifier.yearandnumber_sort&order=desc#main-container#main-container',
      'https://juslaboris.tst.jus.br/discover?order=asc&rpp=15&sort_by=dc.date.issued_dt&page=1&group_by=none&etal=0&filtertype_0=especieato&filtertype_1=author&filter_0=Instru%C3%A7%C3%A3o+Normativa+-+IN&filter_relational_operator_1=equals&filter_1=Brasil.+Tribunal+Superior+do+Trabalho+%28TST%29&filter_relational_operator_0=equals#aspect_discovery_SimpleSearch_div_search-controls-gear',
      'https://juslaboris.tst.jus.br/discover?rpp=15&etal=0&group_by=none&page=2&sort_by=dc.date.issued_dt&order=asc&filtertype_0=especieato&filtertype_1=author&filter_relational_operator_1=equals&filter_relational_operator_0=equals&filter_1=Brasil.+Tribunal+Superior+do+Trabalho+%28TST%29&filter_0=Instru%C3%A7%C3%A3o+Normativa+-+IN',
      'https://juslaboris.tst.jus.br/discover?rpp=15&etal=0&group_by=none&page=3&sort_by=dc.date.issued_dt&order=asc&filtertype_0=especieato&filtertype_1=author&filter_relational_operator_1=equals&filter_relational_operator_0=equals&filter_1=Brasil.+Tribunal+Superior+do+Trabalho+%28TST%29&filter_0=Instru%C3%A7%C3%A3o+Normativa+-+IN',
      'https://juslaboris.tst.jus.br/handle/20.500.12178/107030',
      'https://juslaboris.tst.jus.br/handle/20.500.12178/116169',
    ],
  },
  {
    title: 'Agente NR.sPro',
    role: 'Normas Regulamentadoras Trabalhistas',
    description:
      'Agente especializado nas Normas Regulamentadoras aplicáveis ao Direito do Trabalho, com foco em SST, compliance e estratégia processual.',
    instructions: `
ESCOPO TEMÁTICO:
Você é o agente especialista em Normas Regulamentadoras de Segurança e Saúde no Trabalho. Seu domínio abrange:
- NRs vigentes, seus anexos, manuais, guias e perguntas e respostas oficiais
- Exigências de saúde e segurança, compliance trabalhista e fundamentos técnicos para litígios de SST
- Relação entre NRs, CLT e temas como insalubridade, periculosidade, CAT e estabilidade acidentária quando cobertos pelas fontes indexadas

LIMITES — NÃO RESPONDA SOBRE:
- Direito material trabalhista geral → redirecione ao agente Agente DirTrab
- Atos institucionais do TST/CSJT → redirecione ao agente Agente AtosTr
- Súmulas e orientações jurisprudenciais → redirecione ao agente Agente SúmulasCore
- Precedentes vinculantes e repetitivos → redirecione ao agente Agente PrecedentX
- Pesquisa jurisprudencial em portais oficiais → redirecione ao agente Agente JurisPrud

FONTES PRIMORDIAIS:
- NR-01 a NR-38, anexos, manuais, guias técnicos e publicações oficiais do MTE

${STRICT_RULES}
`.trim(),
    urls: [
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-01-atualizada-2024-i-1.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-02_atualizada_2019.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-03_atualizada_2019.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-04-atualizada-2023.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/NR05atualizada2023.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-06-atualizada-2025-ii.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-07-atualizada-2022-1.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-08-atualizada-2022.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-09-atualizada-2021.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-10.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-11-atualizada-2016.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-11-anexo-01.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-12-atualizada-2025.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/manuais-e-publicacoes/manual-de-aplicacao-da-nr-12.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/seguranca-e-saude-no-trabalho/sst-notas-tecnicas/nota_tecnica_2347-manual-aplicacao-nr-12.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-12_avaliacao_de_conformidade_de_componentes_de_sistemas_de_seguranca_de_maquinas_no_brasil.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-12_cartilha_nr_12_segurana_em_mquinas_para_couro_e_tratamento_de_efluentes.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-13-atualizada-2023-b.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/perguntas-e-respostas-nr13_2023_04_28.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-14-atualizada-2022.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-15-atualizada-2025.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-15-anexo-01.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-15-anexo-02.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/seguranca-e-saude-no-trabalho/sst-portarias/2021/portaria-mtp-no-426-anexos-i-vibracao-e-iii-calor-da-nr-09.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-15-anexo-03.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-15-anexo-04.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-15-anexo-05.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-15-anexo-6-trabalho-sob-condicoes-hiperbaricas.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-15-anexo-07.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-15-anexo-08.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-15-anexo-09.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-15-anexo-10.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-15-anexo-11.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-15-anexo-12.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-15-anexo-13.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-15-anexo-13a-atualizado-2022-1.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-15-anexo-14.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-16-atualizada-2025-ii.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-17-atualizada-2023.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-17-anexo-i-checkout-atualizado-2023.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-17-anexo-ii-teleatendimento-atualizado-2023.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-18_historico_reformulacao_nr_18.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-18-atualizada-2025-1.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-19-atualizada-2023.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-20-atualizada-2025.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-20-perguntas_respostas_nr_20.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-21.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-22-atualizada-2024-iii.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-23-atualizada-2022.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-24-atualizada-2022.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-25-atualizada-2022-1.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-26-atualizada-2022.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr_27_revogada_2008.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-28-atualizada-2024-i.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-29-atualizada-2023.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/NR29_GUIA_DE_BOAS_PRATICAS_PARA_TRABALHO_EM_ALTURAS_NAS_ATIVIDADES_PORTURIAS.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/manual-do-usuario-sesstp-versao-1-0-publicar.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-30-atualizada-2023.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-31-atualizada-2024-2.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/manual-do-usuario-sestr-versao-11-10-2023-para-publicacao.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-32-atualizada-2023-1.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-32_guia_tecnico_de_riscos_biologicos_nr_32.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-33-atualizada-2022-_retificada.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-33_guia_tecnico_da_nr_33.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-34-atualizada-2023-2.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-35-atualizada-2025-1.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/manuais-e-publicacoes/manual_consolidado_da_nr_35.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-36-atualizada-2024-1.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-36_manual_nr_36_compilado.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/seguranca-e-saude-no-trabalho/ctpp-nrs/nr-37-atualizada-2023.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-38-atualizada-2025-3.pdf',
      'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/tabela-de-classificacao-tipificacao-de-nrs-e-anexos-2022_12_14.pdf',
    ],
  },
  {
    title: 'Agente SúmulasCore',
    aliases: ['SúmulasCore', 'Agente S?mulasCore', 'Agente SumulasCore'],
    role: 'Súmulas Trabalhistas',
    description:
      'Agente central de consulta e organização das súmulas trabalhistas, ativas e canceladas, com status, histórico e aplicabilidade.',
    instructions: `
ESCOPO TEMÁTICO:
Você é o agente especialista em súmulas e enunciados consolidados da Justiça do Trabalho. Seu domínio abrange:
- Súmulas do TST, inclusive histórico de cancelamento, revisão e status
- Precedentes normativos e enunciados correlatos quando presentes nas fontes indexadas
- Súmulas e teses consolidadas dos TRTs disponibilizadas nas fontes oficiais informadas
- Aplicabilidade técnica e atualização estratégica dessas teses

LIMITES — NÃO RESPONDA SOBRE:
- Direito material trabalhista geral → redirecione ao agente Agente DirTrab
- Normas regulamentadoras de SST → redirecione ao agente Agente NR.sPro
- Atos institucionais do TST/CSJT → redirecione ao agente Agente AtosTr
- Precedentes vinculantes e repetitivos → redirecione ao agente Agente PrecedentX
- Pesquisa jurisprudencial em portais oficiais → redirecione ao agente Agente JurisPrud

FONTES PRIMORDIAIS:
- Súmulas canceladas do TST, livro de Súmulas/Precedentes do TST e páginas oficiais de súmulas dos TRTs

${STRICT_RULES}
`.trim(),
    urls: [
      'https://www.tst.jus.br/cancelamento-de-sumulas-ojs-e-precedentes-normativos',
      'https://www.tst.jus.br/documents/d/guest/livrointernet-12-pdf',
      'https://jurisprudencia.tst.jus.br/?tipoJuris=SUM&orgao=TST&pesquisar=1',
      'https://trt1.jus.br/documents/22365/3111637/S%C3%BAmulas+arquivo+completo+26.9.2023.pdf/7cbb62d6-020e-b1ac-bb7f-7160a4aa491b',
      'https://trt1.jus.br/documents/22365/3111637/TESES+JUR%C3%8DDICAS+PREVALECENTES+-+26.9.2023.pdf/1849a028-ac7d-b435-2a34-5bdb42a2be7a',
      'https://www.trt2.jus.br/geral/tribunal2/SUM_TRT2/Sumulas_trt02.html',
      'https://portal.trt3.jus.br/internet/jurisprudencia/uniformizacao-de-jurisprudencia/sumulas',
      'https://www.trt4.jus.br/portais/trt4/sumulas',
      'https://www.trt5.jus.br/sumulas/todas',
      'https://www.trt6.jus.br/portal/jurisprudencia/sumulas-trt6',
      'https://www.trt7.jus.br/index.php/jurisprudencia/jurisprudencia-consolidada-trt7/sumulas-do-trt7',
      'https://www.trt8.jus.br/jurisprudencia/sumulas-em-lista',
      'https://www.trt8.jus.br/jurisprudencia/sumulas',
      'https://www.trt9.jus.br/bancojurisprudencia/publico/listagemPorCategoria_visualizadorHtml.xhtml',
      'https://vlex.com.br/vid/sumulas-do-trt-10-567352362',
      'https://portal.trt11.jus.br/index.php/main/11-servicos/15-sumulas',
      'https://portal.trt12.jus.br/uniformiza%C3%A7%C3%A3odejurisprud%C3%AAncias%C3%BAmulastrtsc',
      'https://www.trt13.jus.br/institucional/nugep/sumulas',
      'https://portal.trt14.jus.br/portal/sumulas',
      'https://trt15.jus.br/sites/portal/files/roles/servicos/atas-julgamento/s%C3%BAmulas/versao-compilada_SUMULAS_13-02-2026.pdf',
      'https://trt15.jus.br/sites/portal/files/roles/servicos/atas-julgamento/s%C3%BAmulas/versao-completa_SUMULAS_13-02-2026.pdf',
      'https://www.trt16.jus.br/sites/portal/files/roles/jurisprudencia/S%C3%BAmulas%20do%20TRT16.pdf',
      'https://www.trt17.jus.br/w/sumulas',
      'https://www.trt18.jus.br/portal/jurisprudencia/sumula-trt18/',
      'https://site.trt19.jus.br/sumulastrt19',
      'https://www.trt20.jus.br/jurisprudencia/sumulas-do-trt-20-regiao?view=article&id=9330:integra-sumulas&catid=2',
      'https://www.trt21.jus.br/jurisprudencia/sumulas',
      'https://www.trt22.jus.br/jurisprudencia/sumulas?page=0',
      'https://www.trt22.jus.br/jurisprudencia/sumulas?page=1',
      'https://www.trt22.jus.br/jurisprudencia/sumulas?page=2',
      'https://www.trt22.jus.br/jurisprudencia/sumulas?page=3',
      'https://www.trt22.jus.br/jurisprudencia/sumulas?page=4',
      'https://portal.trt23.jus.br/portal/sumulas',
      'https://www.trt24.jus.br/documents/20182/1472434/S%C3%9AMULAS+DO+TRT+DA+24%C2%AA+REGI%C3%83O+-+atualiza%C3%A7%C3%A3o+Julho+2025',
    ],
  },
  {
    title: 'Agente PrecedentX',
    aliases: ['PrecedenteX'],
    role: 'Precedentes Trabalhistas',
    description:
      'Destaca decisões vinculantes, repetitivas e entendimentos com força persuasiva relevante para fundamentações consistentes.',
    instructions: `
ESCOPO TEMÁTICO:
Você é o agente especialista em precedentes vinculantes, repetitivos e entendimentos qualificados com impacto trabalhista. Seu domínio abrange:
- Precedentes vinculantes e repetitivos mapeados nas fontes indexadas
- Direcionamento estratégico para fundamentações consistentes e alinhadas à orientação dos tribunais
- Identificação de teses, força vinculante e utilidade prática do precedente informado

LIMITES — NÃO RESPONDA SOBRE:
- Direito material trabalhista geral → redirecione ao agente Agente DirTrab
- Normas regulamentadoras de SST → redirecione ao agente Agente NR.sPro
- Atos institucionais do TST/CSJT → redirecione ao agente Agente AtosTr
- Súmulas e orientações jurisprudenciais → redirecione ao agente Agente SúmulasCore
- Pesquisa jurisprudencial em portais oficiais → redirecione ao agente Agente JurisPrud

FONTES PRIMORDIAIS:
- Página oficial do TST sobre precedentes vinculantes e repetitivos

${STRICT_RULES}
`.trim(),
    urls: ['https://www.tst.jus.br/nugep-sp/recursos-repetitivos/precedentes-vinculantes'],
  },
  {
    title: 'Agente JurisPrud',
    aliases: ['JurisPrd'],
    role: 'Jurisprudência Trabalhista',
    description:
      'Núcleo de inteligência em jurisprudência trabalhista, voltado à localização de precedentes dominantes, entendimentos consolidados e pesquisa nos portais oficiais.',
    instructions: `
ESCOPO TEMÁTICO:
Você é o agente especialista em pesquisa jurisprudencial trabalhista. Seu domínio abrange:
- Portais oficiais de pesquisa de jurisprudência trabalhista
- Estratégias de busca por tema, palavra-chave, órgão julgador e filtros disponíveis nos sistemas indexados
- Orientação de pesquisa para localizar precedentes dominantes, entendimentos consolidados e divergências relevantes

LIMITES — NÃO RESPONDA SOBRE:
- Direito material trabalhista geral → redirecione ao agente Agente DirTrab
- Normas regulamentadoras de SST → redirecione ao agente Agente NR.sPro
- Atos institucionais do TST/CSJT → redirecione ao agente Agente AtosTr
- Súmulas e orientações jurisprudenciais → redirecione ao agente Agente SúmulasCore
- Precedentes vinculantes e repetitivos → redirecione ao agente Agente PrecedentX

FONTES PRIMORDIAIS:
- Portais oficiais de jurisprudência da Justiça do Trabalho e repositórios oficiais indexados

${STRICT_RULES}
`.trim(),
    link: 'https://jurisprudencia.jt.jus.br',
    urls: [
      'https://jurisprudencia.jt.jus.br',
      'https://jurisprudencia.tst.jus.br/',
      'https://juslaboris.tst.jus.br/',
    ],
  },
];

const TRANSIENT_DB_CODES = new Set(['57P01', '57P02', '57P03', '08000', '08003', '08006', '08001', '53300']);

function normalizeUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl).trim());
    const removeParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    removeParams.forEach((p) => parsed.searchParams.delete(p));
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function dedupe(urls) {
  const seen = new Set();
  const out = [];
  for (const url of urls) {
    const normalized = normalizeUrl(url);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function toSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p[^>]*>/gi, '\n')
    .replace(/<\/?li[^>]*>/gi, '\n- ')
    .replace(/<\/?h[1-6][^>]*>/gi, '\n')
    .replace(/<\/?table[^>]*>/gi, '\n[TABELA]\n')
    .replace(/<tr[^>]*>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<th[^>]*>/gi, '')
    .replace(/<td[^>]*>/gi, '')
    .replace(/<\/th>/gi, ' | ')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function chunkText(text, size = 4000, overlap = 1000) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const out = [];
  let start = 0;

  while (start < clean.length) {
    let end = start + size;
    if (end < clean.length) {
      const period = clean.lastIndexOf('.', end);
      const space = clean.lastIndexOf(' ', end);
      if (period > start + size * 0.8) end = period + 1;
      else if (space > start + size * 0.5) end = space;
    }

    const chunk = clean.slice(start, end).trim();
    if (chunk) out.push(chunk);
    const next = end - overlap;
    start = next > start ? next : end;
  }

  return out;
}

function isTransientDbError(error) {
  const msg = String(error?.message || '').toLowerCase();
  return (
    TRANSIENT_DB_CODES.has(error?.code) ||
    msg.includes('connection terminated') ||
    msg.includes('connection reset') ||
    msg.includes('timeout') ||
    msg.includes('server closed the connection')
  );
}

async function dbQuery(sql, params = [], tries = 4) {
  let last = null;
  for (let i = 1; i <= tries; i++) {
    try {
      return await pool.query(sql, params);
    } catch (error) {
      last = error;
      if (!isTransientDbError(error) || i === tries) throw error;
      await new Promise((resolve) => setTimeout(resolve, i * 700));
    }
  }
  throw last;
}

async function fetchWithRetry(url, tries = 3) {
  let last = null;
  for (let i = 1; i <= tries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (FlixPrev Trabalhista Novos Agentes/1.0)',
          Accept: 'text/html,application/pdf,*/*;q=0.8',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      last = error;
      await new Promise((resolve) => setTimeout(resolve, i * 700));
    }
  }
  throw last;
}

async function extractText(url, agentTitle) {
  const response = await fetchWithRetry(url, 3);
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const isJurisprudenciaAgent = agentTitle === 'Agente JurisPrud' || agentTitle === 'JurisPrd';

  if (contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf')) {
    const parsed = await pdfParse(Buffer.from(await response.arrayBuffer()));
    const text = String(parsed.text || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim();
    if (text.length > 120) return text;
  }

  if (contentType.includes('text/html') || contentType.includes('text/plain') || !contentType) {
    const html = await response.text();
    const text = htmlToText(html);
    if (isJurisprudenciaAgent) {
      return [
        `FONTE_OFICIAL_DE_PESQUISA: ${url}`,
        text ? `CONTEUDO_INDEXADO_DO_PORTAL: ${text.slice(0, 4000)}` : 'CONTEUDO_INDEXADO_DO_PORTAL: portal com interface dinâmica e conteúdo de navegação limitado.',
        'OBS: esta fonte é portal oficial de pesquisa jurisprudencial. Quando a pergunta demandar busca dinâmica, orientar consulta direta neste link.',
        'USO_RECOMENDADO: indicar caminho de pesquisa e filtros de tribunal, tema, órgão julgador, período e classe processual.',
      ].join('\n');
    }
    if (text.length > 120) return text;
  }

  if (isJurisprudenciaAgent) {
    return [
      `FONTE_OFICIAL_DE_PESQUISA: ${url}`,
      'OBS: esta fonte é portal de pesquisa jurisprudencial. Quando a pergunta demandar busca dinâmica, orientar consulta direta neste link.',
      'USO_RECOMENDADO: indicar caminho de pesquisa e filtros de tribunal/tema/período.',
    ].join('\n');
  }

  return [
    `FONTE: ${url}`,
    `CONTENT_TYPE: ${contentType || 'desconhecido'}`,
    'OBS: conteúdo textual direto limitado; link preservado para consulta oficial.',
  ].join('\n');
}

async function embed(text) {
  const tries = 3;
  for (let i = 1; i <= tries; i++) {
    try {
      const response = await Promise.race([
        openai.embeddings.create({ model: process.env.EMBEDDING_MODEL || 'gemini-embedding-001', input: text }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('embedding-timeout')), 45000)),
      ]);
      return response.data?.[0]?.embedding || null;
    } catch {
      if (i === tries) return null;
      await new Promise((resolve) => setTimeout(resolve, i * 700));
    }
  }
  return null;
}

async function embedBatch(texts) {
  if (!texts.length) return [];

  const results = new Array(texts.length).fill(null);

  for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBED_BATCH_SIZE);
    if (start > 0) {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await Promise.race([
          openai.embeddings.create({
            model: embeddingModel,
            input: batch,
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('embedding-batch-timeout')), 120000)),
        ]);

        for (const item of response.data || []) {
          results[start + item.index] = item.embedding;
        }
        break;
      } catch (error) {
        if (attempt === 3) {
          console.log(`[WARN] embedding batch falhou: ${error.message}`);
        } else {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
        }
      }
    }
  }

  return results;
}

async function insertChunkRows(client, agentId, documentId, rows) {
  for (let start = 0; start < rows.length; start += INSERT_CHUNK_BATCH_SIZE) {
    const batch = rows.slice(start, start + INSERT_CHUNK_BATCH_SIZE);
    const values = [];
    const params = [];

    for (let index = 0; index < batch.length; index++) {
      const row = batch[index];
      const offset = index * 5;
      values.push(`($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4}::vector,$${offset + 5})`);
      params.push(agentId, documentId, row.content, row.embedding, row.chunk_index);
    }

    await client.query(
      `INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index)
       VALUES ${values.join(',')}`,
      params
    );
  }
}

async function ensureCategory() {
  const existing = await dbQuery('SELECT id FROM categories WHERE lower(name)=lower($1) AND user_id IS NULL LIMIT 1', [CATEGORY_NAME]);
  if (existing.rowCount > 0) return existing.rows[0].id;

  const created = await dbQuery('INSERT INTO categories (id,name,user_id) VALUES ($1,$2,NULL) RETURNING id', [crypto.randomUUID(), CATEGORY_NAME]);
  return created.rows[0].id;
}

async function findExistingAgentId(agent) {
  const candidateTitles = [agent.title, ...(agent.aliases || [])]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value, index, items) => items.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index);

  for (const title of candidateTitles) {
    const existing = await dbQuery(
      'SELECT id FROM agents WHERE lower(title)=lower($1) AND user_id IS NULL LIMIT 1',
      [title]
    );
    if (existing.rowCount > 0) return existing.rows[0].id;
  }

  return null;
}

async function ensureAgent(agent, categoryId) {
  const existingId = await findExistingAgentId(agent);
  const defaultStrict = [
    'REGRAS DE FIDELIDADE:',
    '1) Responda somente com base no conteúdo indexado.',
    '2) Não invente base legal, súmulas, precedentes, atos ou números.',
    '3) Se não encontrar no conteúdo indexado, informe explicitamente.',
  ].join('\n');
  const instructions = String(agent.instructions || '').includes('REGRAS ABSOLUTAS DE ISOLAMENTO TEMÁTICO')
    ? agent.instructions
    : `${agent.instructions}\n\n${defaultStrict}`;

  if (existingId) {
    await dbQuery(
      `UPDATE agents
       SET title=$1, role=$2, description=$3, instructions=$4, user_id=NULL, category_ids=$5, icon=COALESCE(icon, $6), link=$7
       WHERE id=$8`,
      [agent.title, agent.role, agent.description, instructions, [categoryId], 'Scale', agent.link || null, existingId]
    );
    return existingId;
  }

  const created = await dbQuery(
    `INSERT INTO agents (id,user_id,title,role,description,instructions,icon,category_ids,shortcuts,attachments,link)
     VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [
      crypto.randomUUID(),
      agent.title,
      agent.role,
      agent.description,
      instructions,
      'Scale',
      [categoryId],
      ['Resumo', 'Base legal', 'Pesquisa'],
      [],
      agent.link || null,
    ]
  );

  return created.rows[0].id;
}

async function ingestAgent(agentId, agent) {
  const urls = dedupe(agent.urls);
  const folder = path.join(ATTACH_BASE, toSlug(agent.title));
  await fs.mkdir(folder, { recursive: true });

  const payloads = [];
  const attachments = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const text = await extractText(url, agent.title);
      if (!text || text.length < 80) {
        console.log(`[SKIP] ${agent.title} ${i + 1}/${urls.length}: conteúdo insuficiente ${url}`);
        continue;
      }

      const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);
      const fileName = `${String(i + 1).padStart(4, '0')}-${hash}.txt`;
      const relPath = `/agent-attachments/trabalhista-novos-agentes/${toSlug(agent.title)}/${fileName}`;
      await fs.writeFile(path.join(folder, fileName), `FONTE: ${url}\nCOLETADO_EM: ${new Date().toISOString()}\n\n${text}`, 'utf8');

      const chunksRaw = chunkText(text, 4000, 1000);
      const vectors = await embedBatch(chunksRaw);
      const chunks = [];

      for (let idx = 0; idx < chunksRaw.length; idx++) {
        if (!vectors[idx]) continue;
        chunks.push({
          chunk_index: idx,
          content: chunksRaw[idx],
          embedding: `[${vectors[idx].join(',')}]`,
        });
      }

      payloads.push({ url, chunks });
      attachments.push(relPath);
      console.log(`[OK] ${agent.title} ${i + 1}/${urls.length} (${Math.round(text.length / 1000)}k chars, ${chunks.length} chunks)`);
    } catch (error) {
      console.log(`[ERRO] ${agent.title} ${i + 1}/${urls.length}: ${url} -> ${error.message}`);
    }
  }

  let docs = 0;
  let chunksInserted = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE agents SET attachments=$1 WHERE id=$2', [attachments, agentId]);
    await client.query('DELETE FROM documents WHERE agent_id=$1', [agentId]);

    for (const item of payloads) {
      if (!item.chunks.length) continue;

      const docId = crypto.randomUUID();
      const docTitle = item.url.length > 255 ? item.url.slice(0, 255) : item.url;

      await client.query('INSERT INTO documents (id, agent_id, title) VALUES ($1,$2,$3)', [docId, agentId, docTitle]);
      docs += 1;

      await insertChunkRows(client, agentId, docId, item.chunks);
      chunksInserted += item.chunks.length;
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.log(`  ✗ [${agent.title}] ROLLBACK — ${error.message}. Dados anteriores preservados.`);
    throw error;
  } finally {
    client.release();
  }

  return { links: urls.length, harvested: payloads.length, docs, chunksInserted };
}

async function main() {
  await fs.mkdir(ATTACH_BASE, { recursive: true });

  const requestedTitles = String(process.env.LABOR_AGENT_TITLES || '')
    .split(',')
    .map((value) => normalizeTitle(value))
    .filter(Boolean);
  const selectedAgents = requestedTitles.length
    ? AGENTS.filter((agent) => {
        const titles = [agent.title, ...(agent.aliases || [])].map((value) => normalizeTitle(value));
        return requestedTitles.some((requested) => titles.includes(requested));
      })
    : AGENTS;

  const lock = await dbQuery('SELECT pg_try_advisory_lock($1) AS locked', [LOCK_KEY]);
  if (!lock.rows?.[0]?.locked) {
    throw new Error('Já existe processamento desses agentes trabalhistas em execução.');
  }

  const summary = [];
  try {
    const categoryId = await ensureCategory();

    for (const agent of selectedAgents) {
      console.log(`\n=== ${agent.title} ===`);
      try {
        const agentId = await ensureAgent(agent, categoryId);
        const ingest = await ingestAgent(agentId, agent);
        summary.push({ title: agent.title, agentId, ...ingest });
      } catch (error) {
        console.log(`  ✗ [${agent.title}] FALHA — ${error.message}`);
        summary.push({ title: agent.title, error: error.message });
      }
    }

    console.log('\n===== RESUMO NOVOS AGENTES TRABALHISTAS =====');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await dbQuery('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    await pool.end();
  }
}

await main().catch((error) => {
  console.error('\n[FATAL] setup-trabalhista-new-agents-and-ingest falhou.');
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
