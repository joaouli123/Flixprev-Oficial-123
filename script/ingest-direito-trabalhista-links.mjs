import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import pdfParse from 'pdf-parse';
import OpenAI from 'openai';
import pkg from 'pg';

dotenv.config();

const { Pool } = pkg;

const ROOT = process.cwd();
const ATTACHMENTS_BASE_DIR = path.join(ROOT, 'public', 'agent-attachments', 'direito-trabalhista');
const USER_ID = '07d16581-fca5-4709-b0d3-e09859dbb286';

const aiBaseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/';
const aiApiKey = process.env.GEMINI_API_KEY;
const embeddingModel = process.env.EMBEDDING_MODEL || 'gemini-embedding-001';

if (!aiApiKey) {
  throw new Error('GEMINI_API_KEY não configurada no ambiente.');
}

const openai = new OpenAI({
  apiKey: aiApiKey,
  baseURL: aiBaseURL,
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const SOURCE_MAP = {
  'Agente DirTrab': [
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
    'http://www.planalto.gov.br/ccivil_03/leis/l8213cons.htm'
  ],
  'Agente AtosTr': [
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
    'https://juslaboris.tst.jus.br/handle/20.500.12178/116169'
  ],
  'Agente NR.sPro': [
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
    'https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/tabela-de-classificacao-tipificacao-de-nrs-e-anexos-2022_12_14.pdf'
  ]
};

function normalizeUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl).trim());
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function dedupeLinks(urls) {
  const seen = new Set();
  const output = [];

  for (const url of urls) {
    const normalized = normalizeUrl(url);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function chunkText(text, size = 4000, overlap = 1000) {
  const cleanText = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleanText) return [];

  const chunks = [];
  let start = 0;

  while (start < cleanText.length) {
    let end = start + size;

    if (end < cleanText.length) {
      const lastPeriod = cleanText.lastIndexOf('.', end);
      const lastSpace = cleanText.lastIndexOf(' ', end);

      if (lastPeriod > start + size * 0.8) {
        end = lastPeriod + 1;
      } else if (lastSpace > start + size * 0.5) {
        end = lastSpace;
      }
    }

    const chunk = cleanText.slice(start, end).trim();
    if (chunk) chunks.push(chunk);

    start = Math.max(end - overlap, end);
  }

  return chunks;
}

function safeSlug(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function fetchWithRetry(url, tries = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Flixprev Legal Ingestion/1.0)',
          Accept: 'text/html,application/pdf;q=0.9,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 600));
    }
  }

  throw lastError;
}

async function extractTextFromUrl(url) {
  const response = await fetchWithRetry(url);
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const isPdf = contentType.includes('application/pdf') || url.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    const arrayBuffer = await response.arrayBuffer();
    const parsed = await pdfParse(Buffer.from(arrayBuffer));
    return String(parsed.text || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim();
  }

  const html = await response.text();
  return stripHtml(html);
}

async function getAgentByTitle(client, title) {
  const result = await client.query(
    'SELECT id, title FROM agents WHERE user_id = $1 AND lower(title) = lower($2) LIMIT 1',
    [USER_ID, title]
  );

  return result.rows[0] || null;
}

async function generateEmbedding(inputText) {
  try {
    const response = await openai.embeddings.create({
      model: embeddingModel,
      input: inputText,
    });
    return response.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
}

async function ingestAgent(client, agentTitle, urls) {
  const agent = await getAgentByTitle(client, agentTitle);
  if (!agent) {
    console.log(`[WARN] Agente não encontrado: ${agentTitle}`);
    return { agentTitle, found: false, savedDocs: 0, savedChunks: 0, linkCount: 0 };
  }

  const uniqueLinks = dedupeLinks(urls);
  const folder = path.join(ATTACHMENTS_BASE_DIR, safeSlug(agent.title));
  await fs.mkdir(folder, { recursive: true });

  const attachmentPaths = [];
  const harvested = [];

  for (let index = 0; index < uniqueLinks.length; index++) {
    const url = uniqueLinks[index];
    try {
      const extractedText = await extractTextFromUrl(url);
      if (!extractedText || extractedText.length < 150) {
        console.log(`[SKIP] ${agent.title} ${index + 1}/${uniqueLinks.length} conteúdo insuficiente: ${url}`);
        continue;
      }

      const hash = crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);
      const fileName = `${String(index + 1).padStart(4, '0')}-${hash}.txt`;
      const filePath = path.join(folder, fileName);
      const relPath = `/agent-attachments/direito-trabalhista/${safeSlug(agent.title)}/${fileName}`;

      const payload = `FONTE: ${url}\nCOLETADO_EM: ${new Date().toISOString()}\n\n${extractedText}`;
      await fs.writeFile(filePath, payload, 'utf8');

      attachmentPaths.push(relPath);
      harvested.push({
        url,
        relPath,
        text: extractedText,
      });

      console.log(`[OK] ${agent.title} ${index + 1}/${uniqueLinks.length} (${Math.round(extractedText.length / 1000)}k chars)`);
    } catch (error) {
      console.log(`[ERRO] ${agent.title} ${index + 1}/${uniqueLinks.length}: ${url} -> ${error.message}`);
    }
  }

  await client.query('UPDATE agents SET attachments = $1 WHERE id = $2', [attachmentPaths, agent.id]);

  await client.query('DELETE FROM documents WHERE agent_id = $1', [agent.id]);

  let savedDocs = 0;
  let savedChunks = 0;

  for (const item of harvested) {
    const title = item.url.length > 255 ? item.url.slice(0, 255) : item.url;
    const doc = await client.query(
      'INSERT INTO documents (agent_id, title) VALUES ($1, $2) RETURNING id',
      [agent.id, title]
    );

    const docId = doc.rows[0].id;
    savedDocs += 1;

    const chunks = chunkText(item.text, 4000, 1000);

    for (let i = 0; i < chunks.length; i++) {
      const emb = await generateEmbedding(chunks[i]);
      if (!emb) continue;

      const embStr = `[${emb.join(',')}]`;
      await client.query(
        `INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index)
         VALUES ($1, $2, $3, $4::vector, $5)`,
        [agent.id, docId, chunks[i], embStr, i]
      );
      savedChunks += 1;
    }
  }

  const strictInstructions = `REGRAS DE FIDELIDADE JURÍDICA:\n1) Responda SOMENTE com base nos documentos indexados deste agente.\n2) Não invente artigo, súmula, precedente, número de processo ou data.\n3) Se a informação não estiver no conteúdo indexado, responda: \"Não encontrei essa informação nos documentos deste agente.\"\n4) Em temas de lei e legislação, prefira citar literalmente trechos encontrados.`;

  await client.query(
    "UPDATE agents SET instructions = COALESCE(instructions, '') || $1 WHERE id = $2",
    [`\n\n${strictInstructions}`, agent.id]
  );

  return {
    agentTitle: agent.title,
    found: true,
    linkCount: uniqueLinks.length,
    harvested: harvested.length,
    savedDocs,
    savedChunks,
  };
}

async function main() {
  await fs.mkdir(ATTACHMENTS_BASE_DIR, { recursive: true });

  const client = await pool.connect();

  try {
    const results = [];

    for (const [agentTitle, urls] of Object.entries(SOURCE_MAP)) {
      console.log(`\n=== Iniciando ingestão: ${agentTitle} ===`);
      const result = await ingestAgent(client, agentTitle, urls);
      results.push(result);
    }

    console.log('\n===== RESUMO FINAL =====');
    console.log(JSON.stringify(results, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
