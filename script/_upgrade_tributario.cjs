/**
 * _upgrade_tributario.cjs
 *
 * Objetivo:
 * 1. Atualizar instructions de todos os 5 agentes tributários com ESCOPO/LIMITES/FONTES
 * 2. Injetar conteúdo suplementar operacional + FAQ em cada agente
 * 3. Idem ao padrão de capricho aplicado aos agentes previdenciários
 *
 * Uso:
 *   node script/_upgrade_tributario.cjs
 */
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const ATTACHMENTS_BASE_DIR = path.join(process.cwd(), 'public', 'agent-attachments', 'direito-tributario');

const EMBED_DELAY_MS = 3000;
const EMBED_BATCH_SIZE = 25;
const MAX_RETRIES = 7;
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function toSlug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

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
          console.log(`   Rate limit, aguardando ${wait / 1000}s...`);
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

// ──────────────────────────────────────────────────────────
//  INSTRUCTIONS COMPLETAS POR AGENTE (padrão previdenciário)
// ──────────────────────────────────────────────────────────

const INSTRUCTIONS = {
  DTrib: `ESCOPO TEMÁTICO:
Você é o agente central de Direito Tributário. Seu domínio abrange:
- Sistema Tributário Nacional: princípios, competências, limitações ao poder de tributar
- Constituição Federal: arts. 145 a 162 (títulos tributários)
- CTN (Lei 5.172/66): normas gerais de direito tributário
- Espécies tributárias: impostos, taxas, contribuições de melhoria, empréstimos compulsórios, contribuições especiais
- Legislação estruturante: LC 87 (ICMS), LC 116 (ISS), LC 123 (Simples Nacional), LC 214/2025 (Reforma), LC 227/2025
- Decreto 9.580/2018 (RIR): Regulamento do Imposto de Renda
- Lei 6.830 (Execução Fiscal): cobrança de dívida ativa
- Leis 10.637 e 10.833 (PIS/Cofins não cumulativo)
- EC 132/2023 (Emenda da Reforma Tributária)
- IN RFB 2.121/2022 (contribuições PIS/Cofins)
- Leis 8.212 e 8.213 (custeio e benefícios previdenciários quando interseccionam tributação)

LIMITES — NÃO RESPONDA SOBRE:
- Cálculos específicos de IRPF/IRPJ → redirecione ao agente TAX-Rend
- Prazos e DARFs de tributos federais → redirecione ao agente FedTax
- Transição IBS/CBS/IS e cronograma da Reforma → redirecione ao agente REFIS-IA
- Interpretação detalhada do CTN (lançamento, obrigações) → redirecione ao agente CTN Expert
- Direito previdenciário puro → redirecione à categoria Previdenciário

FONTES PRIMORDIAIS:
- CF/88 arts. 145–162, CTN arts. 1–218, LC 87/96, LC 116/03, LC 123/06, LC 214/2025, Decreto 9.580/2018

═══════════════════════════════════════════════════════════════════
REGRAS ABSOLUTAS DE ISOLAMENTO TEMÁTICO
═══════════════════════════════════════════════════════════════════
1) Responda EXCLUSIVAMENTE sobre o tema descrito no ESCOPO TEMÁTICO acima.
2) Use SOMENTE o conteúdo indexado na sua base de conhecimento.
3) NÃO invente base legal, artigos, súmulas, portarias ou números de normas.
4) Se a pergunta do usuário for sobre OUTRO tema tributário específico que não o seu, responda:
   "Esta pergunta está fora do meu escopo. Por favor, consulte o agente especializado no tema [nome do tema correto]."
5) NUNCA misture regras de um tributo na resposta sobre outro tributo.
6) Se não encontrar informação na base indexada, informe: "Não localizei essa informação na base normativa deste agente."
7) Quando citar legislação, indique o dispositivo exato (artigo, parágrafo, inciso).
8) Mantenha respostas organizadas, diretas e com linguagem técnico-jurídica profissional.`,

  'CTN Expert': `ESCOPO TEMÁTICO:
Você é o agente especialista em interpretação do Código Tributário Nacional e normas complementares. Seu domínio abrange:
- CTN (Lei 5.172/66) completo: normas gerais, obrigação tributária, crédito tributário, administração tributária
- Lançamento tributário: de ofício, por declaração y por homologação (arts. 142–150 CTN)
- Obrigação tributária: principal e acessória (arts. 113–138 CTN)
- Crédito tributário: constituição, suspensão, extinção, exclusão e garantias (arts. 139–193 CTN)
- Garantias e privilégios do crédito tributário (arts. 183–193 CTN)
- Administração tributária: fiscalização, dívida ativa, certidões (arts. 194–218 CTN)
- Penalidades tributárias: multas, juros, responsabilidade
- CF/88 arts. 145–162 (sistema tributário constitucional)
- LC 104/2001 (alterações ao CTN)
- Decreto 70.235/72 (processo administrativo fiscal federal)
- IN RFB 1.700/2017 e IN RFB 2.201/2024 (procedimentos de apuração)
- LC 214/2025 e LC 227/2025 (contextualização da reforma)
- Jurisprudência do STF e STJ em matéria tributária (quando indexada)

LIMITES — NÃO RESPONDA SOBRE:
- Cálculos específicos de IRPF/IRPJ → redirecione ao agente TAX-Rend
- Prazos e DARFs de tributos federais → redirecione ao agente FedTax
- Transição IBS/CBS/IS → redirecione ao agente REFIS-IA
- Visão geral da legislação estruturante → redirecione ao agente DTrib
- Direito previdenciário puro → redirecione à categoria Previdenciário

FONTES PRIMORDIAIS:
- CTN arts. 1–218, CF/88 arts. 145–162, LC 104/2001, Decreto 70.235/72, INs RFB

═══════════════════════════════════════════════════════════════════
REGRAS ABSOLUTAS DE ISOLAMENTO TEMÁTICO
═══════════════════════════════════════════════════════════════════
1) Responda EXCLUSIVAMENTE sobre o tema descrito no ESCOPO TEMÁTICO acima.
2) Use SOMENTE o conteúdo indexado na sua base de conhecimento.
3) NÃO invente base legal, artigos, súmulas, portarias ou números de normas.
4) Se a pergunta do usuário for sobre OUTRO tema tributário que não o seu, responda:
   "Esta pergunta está fora do meu escopo. Por favor, consulte o agente especializado no tema [nome do tema correto]."
5) NUNCA misture regras de um instituto com outro. Ex: não confunda extinção com exclusão do crédito tributário.
6) Se não encontrar informação na base indexada, informe: "Não localizei essa informação na base normativa deste agente."
7) Quando citar legislação, indique o dispositivo exato (artigo, parágrafo, inciso).
8) Mantenha respostas organizadas, diretas e com linguagem técnico-jurídica profissional.`,

  'REFIS-IA': `ESCOPO TEMÁTICO:
Você é o agente especialista em Reforma Tributária. Seu domínio abrange:
- Lei Complementar 214/2025 (regulamentação da Reforma Tributária): transição completa
- EC 132/2023 (Emenda Constitucional da Reforma)
- Imposto sobre Bens e Serviços (IBS): substituição do ICMS e ISS
- Contribuição sobre Bens e Serviços (CBS): substituição de PIS e Cofins
- Imposto Seletivo (IS): sobre bens e serviços prejudiciais à saúde e ao meio ambiente
- Cronograma de transição: 2026 (teste), 2027–2028 (coexistência parcial), 2029–2032 (extinção gradual), 2033 (plena vigência)
- Comitê Gestor do IBS: composição, competência, distribuição federativa
- Regimes diferenciados: Simples Nacional na reforma, ZFM, SUDAM/SUDENE, exportações
- Cashback tributário: devolução para famílias de baixa renda
- Split payment: mecanismo de recolhimento
- LC 227/2025 (normas correlatas à transição)
- Impactos setoriais: saúde, educação, agronegócio, serviços, indústria, imóveis, financeiro
- Não cumulatividade plena: crédito amplo e split de recolhimento

LIMITES — NÃO RESPONDA SOBRE:
- Interpretação geral do CTN → redirecione ao agente CTN Expert
- Cálculos de IRPF/IRPJ atuais → redirecione ao agente TAX-Rend
- Prazos e DARFs vigentes → redirecione ao agente FedTax
- Legislação tributária geral estruturante → redirecione ao agente DTrib

FONTES PRIMORDIAIS:
- LC 214/2025 (íntegra), EC 132/2023, LC 227/2025, CF/88 arts. 145–162 (nova redação)

═══════════════════════════════════════════════════════════════════
REGRAS ABSOLUTAS DE ISOLAMENTO TEMÁTICO
═══════════════════════════════════════════════════════════════════
1) Responda EXCLUSIVAMENTE sobre o tema descrito no ESCOPO TEMÁTICO acima.
2) Use SOMENTE o conteúdo indexado na sua base de conhecimento.
3) NÃO invente base legal, artigos, súmulas, portarias ou números de normas.
4) Se a pergunta do usuário for sobre OUTRO tema tributário que não o seu, responda:
   "Esta pergunta está fora do meu escopo. Por favor, consulte o agente especializado no tema [nome do tema correto]."
5) NUNCA cite regras do sistema tributário antigo como se já estivessem revogadas fora do cronograma de transição.
6) Se não encontrar informação na base indexada, informe: "Não localizei essa informação na base normativa deste agente."
7) Quando citar legislação, indique o dispositivo exato (artigo, parágrafo, inciso).
8) Mantenha respostas organizadas, diretas e com linguagem técnico-jurídica profissional.`,

  'TAX-Rend': `ESCOPO TEMÁTICO:
Você é o agente especialista em tributação da renda. Seu domínio abrange:
- IRPF: tabela progressiva, deduções legais, declaração anual, carnê-leão
- IRPJ: Lucro Real, Lucro Presumido, Lucro Arbitrado
- CSLL: apuração vinculada ao IRPJ
- Retenção na fonte: IRRF sobre salários, serviços, aluguéis, aplicações financeiras
- Lei 7.713/88 (IRPF original)
- Lei 9.250/95 (IRPF atual: deduções, tabela, isenções)
- Lei 8.981/95 (tributação sobre lucros)
- Lei 9.430/96 (procedimentos fiscais e base de cálculo)
- Lei 9.249/95 (IRPJ e CSLL)
- Lei 9.718/98 (PIS/Cofins cumulativo, mas com impacto em renda)
- Lei 12.973/2014 (tributação de lucros no exterior, ajuste RTT)
- Decreto 9.580/2018 (RIR): regulamento integral do IR
- Lei 15.270/2025 (atualização da tabela IRPF 2025/2026, isenção até R$ 5.000)
- IN RFB 1.500/2014 (retenção na fonte)
- Alíquotas, faixas, deduções por dependente, despesas médicas, educação, previdência

LIMITES — NÃO RESPONDA SOBRE:
- Sistema tributário geral → redirecione ao agente DTrib
- Interpretação do CTN → redirecione ao agente CTN Expert
- Transição IBS/CBS/IS → redirecione ao agente REFIS-IA
- Tributos federais que não sejam imposto de renda/CSLL → redirecione ao agente FedTax

FONTES PRIMORDIAIS:
- Decreto 9.580/2018 (RIR), Lei 9.250/95, Lei 9.430/96, Lei 15.270/2025, Lei 12.973/2014

═══════════════════════════════════════════════════════════════════
REGRAS ABSOLUTAS DE ISOLAMENTO TEMÁTICO
═══════════════════════════════════════════════════════════════════
1) Responda EXCLUSIVAMENTE sobre o tema descrito no ESCOPO TEMÁTICO acima.
2) Use SOMENTE o conteúdo indexado na sua base de conhecimento.
3) NÃO invente base legal, artigos, alíquotas, faixas ou valores.
4) Se a pergunta do usuário for sobre OUTRO tema tributário que não o seu, responda:
   "Esta pergunta está fora do meu escopo. Por favor, consulte o agente especializado no tema [nome do tema correto]."
5) NUNCA cite valores de tabela sem confirmar na base indexada. Alíquotas mudam frequentemente.
6) Se não encontrar informação na base indexada, informe: "Não localizei essa informação na base normativa deste agente."
7) Quando citar legislação, indique o dispositivo exato (artigo, parágrafo, inciso).
8) Mantenha respostas organizadas, diretas e com linguagem técnico-jurídica profissional.`,

  FedTax: `ESCOPO TEMÁTICO:
Você é o agente especialista em tributos federais administrados pela Receita Federal. Seu domínio abrange:
- IPI: Imposto sobre Produtos Industrializados (Decreto 7.212/2010, Lei 4.502/64)
- IOF: Imposto sobre Operações Financeiras (Decreto 6.306/07)
- PIS/Pasep: Lei 10.637/2002 (não cumulativo) e Lei 9.718/98 (cumulativo)
- Cofins: Lei 10.833/2003 (não cumulativo) e Lei 9.718/98 (cumulativo)
- CSLL: Lei 7.689/88 (Contribuição Social sobre Lucro Líquido)
- Contribuições previdenciárias patronais: Lei 8.212/91
- Simples Nacional: LC 123/2006
- Códigos de receita: DARF, DJE, SIEF Receita
- DCTF, EFD-Contribuições, ECF e obrigações acessórias federais
- Normas CODAC: atos declaratórios e instruções sobre recolhimento
- LC 214/2025 e LC 227/2025 (impacto da reforma nos tributos federais)
- Prazos de recolhimento, vencimentos, multas e juros Selic
- Retenções na fonte: IRRF, PIS/Cofins/CSLL retidos (Lei 10.833 art. 30 e ss.)

LIMITES — NÃO RESPONDA SOBRE:
- Cálculos detalhados de IRPF/IRPJ → redirecione ao agente TAX-Rend
- Interpretação do CTN → redirecione ao agente CTN Expert
- Reforma tributária e transição → redirecione ao agente REFIS-IA
- Sistema tributário geral → redirecione ao agente DTrib

FONTES PRIMORDIAIS:
- Dec. 7.212/2010, Dec. 6.306/07, Leis 10.637, 10.833, 9.718, 7.689, LC 123/06, SIEF Receita

═══════════════════════════════════════════════════════════════════
REGRAS ABSOLUTAS DE ISOLAMENTO TEMÁTICO
═══════════════════════════════════════════════════════════════════
1) Responda EXCLUSIVAMENTE sobre o tema descrito no ESCOPO TEMÁTICO acima.
2) Use SOMENTE o conteúdo indexado na sua base de conhecimento.
3) NÃO invente códigos DARF, alíquotas, prazos ou fundamentos legais.
4) Se a pergunta do usuário for sobre OUTRO tema tributário que não o seu, responda:
   "Esta pergunta está fora do meu escopo. Por favor, consulte o agente especializado no tema [nome do tema correto]."
5) NUNCA misture regras de um tributo com outro. Ex: não confunda alíquota de IPI com IOF.
6) Se não encontrar informação na base indexada, informe: "Não localizei essa informação na base normativa deste agente."
7) Quando citar legislação, indique o dispositivo exato (artigo, parágrafo, inciso).
8) Mantenha respostas organizadas, diretas e com linguagem técnico-jurídica profissional.`,
};

// ──────────────────────────────────────────────────────────
//  CONTEÚDO SUPLEMENTAR POR AGENTE
// ──────────────────────────────────────────────────────────

const BASE_DTRIB = `
GUIA OPERACIONAL - SISTEMA TRIBUTÁRIO NACIONAL (DIREITO TRIBUTÁRIO)

1. ESTRUTURA DO SISTEMA TRIBUTÁRIO BRASILEIRO
O sistema tributário brasileiro é regido pela Constituição Federal (arts. 145 a 162); pelo Código Tributário Nacional (CTN - Lei 5.172/66); e por legislação complementar e ordinária.

Espécies tributárias reconhecidas pela doutrina e jurisprudência:
- Impostos (art. 145, I, CF): tributo cuja obrigação tem por fato gerador situação independente de qualquer atividade estatal.
- Taxas (art. 145, II, CF): cobradas em razão do exercício do poder de polícia ou utilização de serviço público específico e divisível.
- Contribuições de melhoria (art. 145, III, CF): decorrentes de obras públicas que valorizem imóvel.
- Empréstimos compulsórios (art. 148, CF): instituídos por lei complementar em situações excepcionais.
- Contribuições especiais (arts. 149 e 195, CF): sociais, CIDE, interesse de categorias profissionais.

2. COMPETÊNCIA TRIBUTÁRIA
A competência tributária é a aptidão constitucional para instituir tributos:
- União: IR, IPI, IOF, ITR, IE, II, contribuições sociais, empréstimos compulsórios, CIDE, IBS (parcela federal via CBS após reforma).
- Estados e DF: ICMS (em transição), IPVA, ITCMD, IBS (parcela estadual após reforma).
- Municípios e DF: ISS (em transição), IPTU, ITBI, IBS (parcela municipal após reforma).
- Competência residual: art. 154, I, CF (somente União, por LC, tributo novo não cumulativo com base e fato gerador diferentes).
- Competência extraordinária: art. 154, II, CF (imposto de guerra).

2.1 DISTINÇÃO OPERACIONAL ENTRE ICMS E ISS
- ICMS: imposto estadual previsto no art. 155, II, da CF e disciplinado pela LC 87/96.
- Fato gerador do ICMS: operações relativas à circulação de mercadorias; prestações de transporte interestadual e intermunicipal; prestações onerosas de comunicação; e hipóteses equiparadas do art. 2º da LC 87/96.
- ISS: imposto municipal previsto no art. 156, III, da CF e disciplinado pela LC 116/03.
- Fato gerador do ISS: prestação de serviços constantes da lista anexa à LC 116/03, mesmo que não sejam a atividade preponderante do prestador, conforme art. 1º da LC 116.
- Regra prática: circulação de mercadoria, transporte interestadual/intermunicipal e comunicação apontam para ICMS; prestação de serviço da lista legal aponta para ISS.

3. PRINCÍPIOS CONSTITUCIONAIS TRIBUTÁRIOS
- Legalidade (art. 150, I, CF): nenhum tributo será exigido ou aumentado sem lei.
- Anterioridade (art. 150, III, b, CF): vedada cobrança no mesmo exercício financeiro da publicação da lei.
- Noventena (art. 150, III, c, CF): vedada cobrança antes de 90 dias da publicação.
- Irretroatividade (art. 150, III, a, CF): vedada cobrança sobre fatos geradores anteriores à lei.
- Isonomia (art. 150, II, CF): tratamento igual entre contribuintes em situação equivalente.
- Capacidade contributiva (art. 145, §1º, CF): impostos graduados conforme capacidade econômica.
- Vedação de confisco (art. 150, IV, CF): tributo não pode ter efeito confiscatório.
- Não limitação ao tráfego (art. 150, V, CF): vedados tributos interestaduais/intermunicipais sobre circulação.
- Imunidades (art. 150, VI, CF): recíproca, templos, partidos, sindicatos, entidades educacionais/assistenciais sem fins lucrativos, livros/jornais/papel.

4. LEI DE EXECUÇÃO FISCAL (LEI 6.830/80)
- Disciplina a cobrança judicial da dívida ativa da Fazenda Pública.
- A CDA (Certidão de Dívida Ativa) goza de presunção de certeza e liquidez (art. 3º).
- O devedor é citado para pagar em 5 dias ou garantir a execução (art. 8º).
- Garantias: depósito, fiança bancária, penhora de bens, seguro garantia.
- Exceção de pré-executividade: matérias de ordem pública sem dilação probatória.
- Embargos do devedor: prazo de 30 dias da intimação da penhora (art. 16).

5. SIMPLES NACIONAL (LC 123/2006)
- Regime unificado de arrecadação para ME e EPP.
- Faturamento anual: até R$ 4.800.000,00.
- Recolhimento unificado: IRPJ, CSLL, PIS, Cofins, IPI, ICMS, ISS, CPP.
- Vedações: atividades financeiras, cessão de mão de obra, importadoras de combustíveis, entre outras.
- MEI: limite de R$ 81.000/ano (ou R$ 108.000 se transportador autônomo).

6. PIS/COFINS (LEIS 10.637/2002 E 10.833/2003)
- Regime não cumulativo: créditos sobre insumos, depreciação, aluguéis, frete.
- Alíquotas: PIS 1,65% + Cofins 7,6% = 9,25% (não cumulativo).
- Regime cumulativo (Lei 9.718): PIS 0,65% + Cofins 3% = 3,65%.
- Base de cálculo: receita bruta (após ADI do STF: exclui ICMS da base na posição atual).
- In RFB 2.121/2022: regulamentação detalhada de créditos e especificidades setoriais.

7. EC 132/2023 E REFORMA TRIBUTÁRIA
- Introduz IBS (substituição de ICMS + ISS) e CBS (substituição de PIS + Cofins).
- Imposto Seletivo (IS) sobre bens nocivos à saúde e meio ambiente.
- Transição longa: 2026–2032, com plena vigência em 2033.
- Não cumulatividade plena: crédito amplo de toda a cadeia.
- Detalhes regulamentados por LC 214/2025.
- LC 214/2025: regulamenta a espinha dorsal da reforma do consumo, com IBS, CBS, IS, transição, não cumulatividade, split payment, cashback e regimes diferenciados.
- LC 227/2025: aparece como legislação complementar de ajuste operacional e setorial da reforma, alterando pontos de implementação, repartição, regimes específicos e regras técnicas conectadas ao novo modelo IBS/CBS.
`.trim();

const BASE_CTN = `
GUIA OPERACIONAL - INTERPRETAÇÃO DO CTN E NORMAS TRIBUTÁRIAS

1. OBRIGAÇÃO TRIBUTÁRIA (CTN ARTS. 113–138)

1.1 Obrigação Principal (art. 113, §1º)
- Surge com a ocorrência do fato gerador.
- Tem por objeto o pagamento de tributo ou penalidade pecuniária.
- Extingue-se juntamente com o crédito dela decorrente.

1.2 Obrigação Acessória (art. 113, §2º)
- Decorre da legislação tributária (sentido amplo).
- Tem por objeto prestações positivas ou negativas: emitir nota, escriturar livro, entregar declaração.
- O descumprimento converte-se em obrigação principal (multa).

1.3 Fato Gerador (arts. 114–118)
- Situação definida em lei como necessária e suficiente à sua ocorrência.
- Interpreta-se abstratamente, desconsiderando validade dos atos praticados (art. 118).

1.4 Sujeito Ativo e Passivo (arts. 119–123)
- Sujeito ativo: pessoa jurídica de direito público titular da competência para exigir.
- Sujeito passivo contribuinte: relação pessoal e direta com o fato gerador.
- Sujeito passivo responsável: obrigação decorrente de lei, sem relação direta com o fato gerador.

1.5 Responsabilidade Tributária (arts. 128–138)
- Responsabilidade de terceiros (art. 134): pais, tutores, administradores.
- Responsabilidade por infrações (art. 136): objetiva, salvo exceções legais.
- Responsabilidade por sucessão (arts. 129–133): inter vivos e causa mortis.
- Responsabilidade por substituição: norma coloca terceiro como devedor originário (ex: IRRF, ISS retido).
- Denúncia espontânea (art. 138): comunicação voluntária da infração antes de qualquer procedimento fiscal, com pagamento do tributo e dos juros, afastando a multa punitiva.

2. CRÉDITO TRIBUTÁRIO (CTN ARTS. 139–193)

2.1 Constituição do Crédito (art. 142)
- Lançamento: procedimento administrativo vinculado e obrigatório.
- Verifica: ocorrência do fato gerador, matéria tributável, montante, sujeito passivo, penalidade se cabível.
- Natureza: declaratória do fato gerador, constitutiva do crédito.

2.2 Modalidades de Lançamento
a) De Ofício (art. 149): autoridade constitui integralmente. Ex: IPTU, IPVA, autos de infração.
b) Por Declaração (art. 147): sujeito passivo presta informações, autoridade lança. Ex: antigo IR.
c) Por Homologação (art. 150): sujeito passivo antecipa pagamento, autoridade homologa. Ex: IRPJ, PIS, Cofins, IPI. Homologação tácita em 5 anos (art. 150, §4º).

2.3 Suspensão do Crédito (art. 151)
- Moratória, depósito do montante integral, reclamações e recursos administrativos, concessão de liminar/tutela, parcelamento.
- Efeito: suspende a exigibilidade, NÃO dispensa cumprimento de obrigações acessórias.

2.4 Extinção do Crédito (art. 156)
- Pagamento, compensação, transação, remissão, prescrição e decadência, conversão de depósito em renda, pagamento antecipado + homologação, consignação em pagamento, decisão judicial transitada em julgado, dação em pagamento de imóvel.
- Decadência (art. 173): 5 anos para constituir o crédito (lançar).
- Prescrição (art. 174): 5 anos para a Fazenda cobrar judicialmente após constituição definitiva.

2.5 Exclusão do Crédito (art. 175)
- Isenção: dispensa legal do crédito (pode ser revogada).
- Anistia: perdão de penalidades (não do tributo).
- NÃO dispensa cumprimento de obrigações acessórias.

2.6 Garantias e Privilégios (arts. 183–193)
- Crédito tributário prefere a qualquer outro, salvo trabalhistas e acidentários.
- Presunção de fraude: alienação após inscrição em dívida ativa.
- Inventário: só se processa com prova de quitação fiscal.

3. ADMINISTRAÇÃO TRIBUTÁRIA (CTN ARTS. 194–218)

3.1 Fiscalização (arts. 194–200)
- Aplica-se a todas as pessoas, inclusive imunes e isentas.
- Sigilo fiscal (art. 198): informações protegidas, com exceções legais.
- Dever de informar (art. 197): bancos, cartórios, empresas.

3.2 Dívida Ativa (arts. 201–204)
- Inscrição após esgotado o prazo para pagamento.
- CDA goza de presunção de certeza e liquidez.
- Pode ser emendada ou substituída até decisão de primeira instância.

3.3 Certidões (arts. 205–208)
- CND: Certidão Negativa de Débitos.
- CPEN: Certidão Positiva com Efeitos de Negativa (crédito suspenso ou não definitivo).
- Prazo de emissão: 10 dias contados do requerimento (art. 205).

4. DECRETO 70.235/72 (PROCESSO ADMINISTRATIVO FISCAL)
- Regula o contencioso administrativo fiscal federal.
- Fases: autuação → impugnação (30 dias) → julgamento DRJ → recurso voluntário ao CARF → recurso especial à CSRF.
- A decisão administrativa favorável ao contribuinte vincula a Fazenda.
- Depósito recursal no CARF: extinto com a Lei 13.988/2020.

5. TESES TRIBUTÁRIAS RELEVANTES
- Exclusão do ICMS da base de PIS/Cofins (Tema 69/STF).
- Exclusão do ISS da base de PIS/Cofins (extensão da tese).
- Não incidência de IR sobre juros moratórios de verbas trabalhistas (Tema 808/STF).
- Limitação da multa fiscal a 100% do tributo (vedação de confisco).
`.trim();

const BASE_REFIS = `
GUIA OPERACIONAL - REFORMA TRIBUTÁRIA (LC 214/2025 E CORRELATAS)

1. VISÃO GERAL DA REFORMA
A Reforma Tributária unifica tributos sobre consumo no Brasil. A EC 132/2023 alterou a Constituição; a LC 214/2025 regulamenta a transição e os novos tributos.

Meta principal: substituir 5 tributos (PIS, Cofins, IPI, ICMS, ISS) por 3 novos (IBS, CBS, IS).

2. NOVOS TRIBUTOS

2.1 IBS (Imposto sobre Bens e Serviços)
- Substitui ICMS (estadual) e ISS (municipal).
- Competência compartilhada entre Estados, DF e Municípios.
- Gestão pelo Comitê Gestor do IBS (órgão interfederativo).
- Incidência no destino (local da operação é onde o bem é consumido).
- Não cumulativo: crédito amplo de toda a cadeia produtiva.
- Alíquota de referência: definida anualmente pelo Comitê Gestor.

2.2 CBS (Contribuição sobre Bens e Serviços)
- Substitui PIS/Pasep e Cofins.
- Competência federal (União).
- Incidência no destino, mesma base de cálculo que IBS.
- Não cumulativa: crédito amplo.
- Alíquota de referência: fixada pela União.

2.3 Imposto Seletivo (IS)
- Incide sobre bens e serviços prejudiciais à saúde e ao meio ambiente.
- Lista inclui: bebidas alcoólicas, tabaco, bebidas açucaradas, veículos poluentes, embarcações e aeronaves, minerais extraídos.
- Não substitui outros tributos; é uma incidência adicional.
- Monofásico em alguns casos.

3. CRONOGRAMA DE TRANSIÇÃO
- 2026: período de teste. CBS cobrada a 0,9% e IBS a 0,1% (compensáveis com PIS/Cofins). Sem impacto na carga.
- 2027: CBS entra em vigor definitivamente (PIS/Cofins extintos). Alíquota do IBS sobe levemente.
- 2028: IBS coexiste com ICMS/ISS. Alíquota do IBS aumenta gradualmente.
- 2029: ICMS e ISS começam a ser reduzidos a 90% da alíquota original.
- 2030: ICMS/ISS a 80%.
- 2031: ICMS/ISS a 70%.
- 2032: ICMS/ISS a 60%.
- 2033: Extinção total de ICMS e ISS. IBS em vigor pleno. IS começa a ser cobrado integralmente.

4. NÃO CUMULATIVIDADE PLENA
- Crédito de TODA aquisição tributada na cadeia (inclusive serviços, bens de uso e consumo, ativo imobilizado).
- Fim da guerra fiscal: alíquota no destino elimina incentivos de origem.
- Crédito financeiro: aproveitável imediatamente, sem restrição de natureza da aquisição.
- Devolução de créditos acumulados em prazo definido (60 dias para exportadores).

5. SPLIT PAYMENT
- Mecanismo de recolhimento automático no momento do pagamento.
- O sistema financeiro separa a parcela do tributo diretamente para o fisco.
- Objetivo: reduzir inadimplência e sonegação.
- Implementação obrigatória para contribuintes e agentes financeiros.

6. CASHBACK TRIBUTÁRIO
- Devolução de parte dos tributos a famílias de baixa renda inscritas no CadÚnico.
- Operacionalizado via contas bancárias (pix ou transferência direta).
- Percentuais definidos em regulamento: 100% da CBS e 20% do IBS em itens de cesta básica; 50% da CBS e 20% do IBS em outros bens.

7. REGIMES DIFERENCIADOS NA REFORMA
- Simples Nacional: mantido, com possibilidade de opção pelo regime geral para fins de crédito.
- Zona Franca de Manaus (ZFM): preservação dos incentivos fiscais.
- Saúde e educação: alíquotas reduzidas em 60%.
- Cesta básica nacional: alíquota zero para itens definidos em lei.
- Transporte público coletivo urbano: alíquota zero.
- Dispositivos médicos e medicamentos: alíquotas reduzidas.
- Agronegócio: alíquota reduzida em 60% para insumos rurais.

8. IMPACTOS SETORIAIS
- Serviços: aumento de carga (setor intensivo em mão de obra com pouco crédito de insumo físico).
- Indústria: redução de carga (aproveitamento pleno de créditos).
- Comércio: impacto neutro a positivo (crédito sobre mercadorias).
- Imóveis: tributação sobre operações imobiliárias com alíquota reduzida.
- Setor financeiro: regime específico (cumulativo) com alíquota diferenciada.
`.trim();

const BASE_TAXREND = `
GUIA OPERACIONAL - TRIBUTAÇÃO DA RENDA (IRPF, IRPJ, CSLL)

1. IRPF - IMPOSTO DE RENDA PESSOA FÍSICA

1.1 Tabela Progressiva 2025/2026 (Lei 15.270/2025)
A Lei 15.270/2025 alterou a tabela progressiva do IRPF:
- Faixa 1: até R$ 2.428,80 → isento (desconto simplificado de R$ 564,80 amplia a isenção efetiva a R$ 3.036,00 para quem ganha até R$ 5.000,00)
- Faixa 2: de R$ 2.428,81 a R$ 3.561,50 → 7,5% (parcela a deduzir: R$ 182,16)
- Faixa 3: de R$ 3.561,51 a R$ 4.694,18 → 15% (parcela a deduzir: R$ 449,33)
- Faixa 4: de R$ 4.694,19 a R$ 5.826,86 → 22,5% (parcela a deduzir: R$ 801,46)
- Faixa 5: acima de R$ 5.826,86 → 27,5% (parcela a deduzir: R$ 1.092,89)

Nota: A Lei 15.270/2025 aumentou a faixa de isenção e criou o mecanismo de desconto simplificado que garante isenção efetiva para quem recebe até R$ 5.000 mensais.

1.2 Deduções Legais Permitidas
- Dependentes: R$ 189,59/mês por dependente.
- Pensão alimentícia judicial: valor integral pago.
- Contribuição previdenciária oficial (INSS): valor efetivamente descontado.
- Previdência complementar: até 12% da renda bruta anual (PGBL).
- Despesas médicas: sem limite (mediante comprovação).
- Despesas com instrução (educação): até R$ 3.561,50/ano por pessoa.
- Livro-caixa (autônomos): despesas de custeio da atividade.

1.3 Carnê-Leão
- Obrigatório para rendimentos de pessoa física no exterior, aluguéis, trabalho sem vínculo de PF-PF.
- Recolhimento mensal via DARF código 0190.
- Base de cálculo: rendimento bruto menos deduções legais.

1.4 Declaração Anual (DIRPF)
- Prazo: março a maio do exercício seguinte.
- Obrigatoriedade: rendimentos acima do limite, patrimônio acima de R$ 800.000,00, ganho de capital, operações na bolsa.
- Modelo simplificado: desconto de 20% sobre rendimentos tributáveis (limitado).
- Modelo completo: deduções individualizadas.

2. IRPJ - IMPOSTO DE RENDA PESSOA JURÍDICA

2.1 Lucro Real
- Obrigatório para empresas com faturamento anual acima de R$ 78 milhões (ou atividades específicas).
- Base: lucro contábil ajustado por adições e exclusões do LALUR.
- Alíquota: 15% + adicional de 10% sobre excedente de R$ 20.000/mês.
- Apuração: trimestral ou por estimativa mensal com ajuste anual.

2.2 Lucro Presumido
- Opcional para faturamento até R$ 78 milhões/ano.
- Presunção de lucro conforme percentuais por atividade:
  - Comércio/indústria: 8%
  - Serviços em geral: 32%
  - Transporte de cargas: 8%
  - Transporte de passageiros: 16%
  - Serviços hospitalares: 8%
- Alíquota: 15% + adicional de 10% sobre excedente trimestral de R$ 60.000.

2.3 Lucro Arbitrado
- Aplicado quando a empresa não mantém escrituração regular.
- Percentuais de presunção acrescidos de 20% em relação ao lucro presumido.

3. CSLL - CONTRIBUIÇÃO SOCIAL SOBRE O LUCRO LÍQUIDO (LEI 7.689/88)
- Incide sobre o lucro líquido de PJ.
- Alíquotas: 9% (regra geral), 15% (instituições financeiras), 20% (seguradoras).
- Base de cálculo acompanha o regime de tributação escolhido para IRPJ.

4. RETENÇÃO NA FONTE (IRRF)
- Salários: alíquotas conforme tabela progressiva mensal.
- Serviços PJ: 1% ou 1,5% conforme natureza do serviço.
- Aluguéis: tabela progressiva se PF locador.
- Aplicações financeiras: renda fixa 15%–22,5% (conforme prazo); renda variável 15% (swing trade), 20% (day trade).
- O IRRF é antecipação do devido na declaração anual (PF) ou trimestral (PJ).

5. LEI 12.973/2014 - TRIBUTAÇÃO DE LUCROS NO EXTERIOR
- Tributação de lucros de controladas e coligadas no exterior.
- Ajuste do RTT: eliminação do Regime Tributário de Transição.
- Ágio em aquisição de investimento: regras de amortização fiscal.
`.trim();

const BASE_FEDTAX = `
GUIA OPERACIONAL - TRIBUTOS FEDERAIS RFB (IPI, IOF, PIS, COFINS, CSLL E OBRIGAÇÕES)

1. IPI - IMPOSTO SOBRE PRODUTOS INDUSTRIALIZADOS

1.1 Base Legal: Decreto 7.212/2010 (RIPI), Lei 4.502/1964
- Fato gerador: saída do estabelecimento industrial ou importação.
- Base de cálculo: valor da operação (saída) ou valor aduaneiro + II + outros encargos (importação).
- Alíquotas: variáveis por produto (TIPI - Tabela de Incidência do IPI).
- Princípio da seletividade: inversamente proporcional à essencialidade do produto.
- Não cumulatividade: crédito do IPI pago nas aquisições de insumos e materiais de embalagem.
- DARF: código 1020 (IPI vinculados ao tabaco), 0668 (IPI automóveis), varia conforme produto.

1.2 Obrigações Acessórias do IPI
- Escrituração no Livro de Apuração do IPI e no SPED (EFD-ICMS/IPI).
- Selo de controle para bebidas e cigarros.
- Nota fiscal eletrônica com destaque do IPI.

2. IOF - IMPOSTO SOBRE OPERAÇÕES FINANCEIRAS

2.1 Base Legal: Decreto 6.306/2007
- Incide sobre: operações de crédito, câmbio, seguros, títulos e valores mobiliários.
- Alíquotas por tipo (exemplos):
  - Crédito PJ: 0,0041%/dia + 0,38% adicional.
  - Crédito PF: 0,0082%/dia + 0,38% adicional.
  - Câmbio (remessas ao exterior): 0,38% a 1,1% conforme natureza.
  - Seguros: 0% a 25% conforme tipo.
  - Ouro ativo financeiro: 1% na primeira aquisição.
- IOF é tributo regulatório (art. 153, §1º, CF): alíquotas podem ser alteradas por decreto.

3. PIS/PASEP E COFINS

3.1 Regime Não Cumulativo (Leis 10.637/2002 e 10.833/2003)
- Alíquotas: PIS 1,65% + Cofins 7,6% = 9,25%.
- Créditos: aquisições de bens para revenda, insumos, depreciação e amortização, aluguéis, energia, vale-transporte, vale-refeição (prestação de serviços), frete.
- Receitas excluídas da base: exportações (isentas), transferências entre filiais.

3.2 Regime Cumulativo (Lei 9.718/98)
- Alíquotas: PIS 0,65% + Cofins 3% = 3,65%.
- Sem direito a créditos.
- Aplica-se a: lucro presumido, receitas financeiras de bancos, planos de saúde, entre outros.

3.3 Retenção na Fonte (Art. 30, Lei 10.833)
- Retenção de 4,65% (PIS 0,65% + Cofins 3% + CSLL 1%) sobre pagamentos de PJ a PJ por serviços profissionais, limpeza, conservação, manutenção, segurança, assessoria, locação de mão de obra.
- DARF código 5952 (PIS/Cofins/CSLL retidos).
- Retenção dispensa quem é optante pelo Simples Nacional (prestador).

4. CSLL - CONTRIBUIÇÃO SOCIAL SOBRE O LUCRO LÍQUIDO
- Base legal: Lei 7.689/88.
- Alíquotas: 9% (geral), 15% (seguradoras/capitalização), 20% (bancos e instituições financeiras a partir de 2021).
- Base de cálculo: lucro líquido do período de apuração antes do IRPJ.
- Apuração: segue regime do IRPJ (real, presumido, arbitrado).
- Regra de resposta: se a pergunta pedir a base legal central da CSLL, responder primeiro "Lei 7.689/88" e depois contextualizar base de cálculo, alíquota e vínculo com o regime do IRPJ.

5. CONTRIBUIÇÕES PREVIDENCIÁRIAS PATRONAIS (LEI 8.212/91)
- CPP sobre folha: 20% sobre total das remunerações + RAT (1% a 3%) + SAT + FAP.
- Contribuição sobre receita bruta (CPRB/desoneração): alíquotas de 1% a 4,5% conforme CNAE.
- FPAS e códigos de recolhimento via GPS (Guia da Previdência Social) ou DCTF-Web.

6. CÓDIGOS DARF MAIS UTILIZADOS
- 0190: Carnê-leão IRRF PF
- 0561: IRRF sobre rendimentos do trabalho assalariado
- 1708: IRRF sobre serviços profissionais PJ
- 2372: CSLL trimestral Lucro Real
- 2089: IRPJ trimestral Lucro Real
- 2484: IRPJ trimestral Lucro Presumido
- 2372: CSLL trimestral Lucro Presumido
- 5952: PIS/Cofins/CSLL retidos na fonte
- 6912: PIS não cumulativo
- 5856: Cofins não cumulativo
- 0668: IPI (veículos automotores)
- 1020: IPI (cigarros)
- Fontes para localizar códigos DARF nesta base: SIEF Receita, página oficial de códigos DARF/DJE da Receita e atos Codac consultados no Sijut.

7. PRAZOS PRINCIPAIS DE RECOLHIMENTO
- IRPJ/CSLL (estimativa mensal): último dia útil do mês seguinte.
- IRPJ/CSLL (trimestral): último dia útil do mês seguinte ao trimestre.
- PIS/Cofins: 25º dia do mês seguinte ao fato gerador.
- IPI: geralmente 25º dia do mês seguinte (varia por produto).
- IOF: último dia útil da quinzena seguinte.
- IRRF: 20º dia do mês seguinte ao pagamento.
- Contribuição previdenciária patronal: dia 20 do mês seguinte.

8. OBRIGAÇÕES ACESSÓRIAS FEDERAIS
- EFD-Contribuições: escrituração digital de PIS/Cofins/CPRB.
- ECF (Escrituração Contábil Fiscal): substitui DIPJ. Prazo: julho do ano seguinte.
- DCTF-Web: declaração de débitos e créditos tributários federais. Mensal.
- EFD-ICMS/IPI: escrituração fiscal digital para IPI (SPED Fiscal).
- DIRF: declaração de Imposto de Renda Retido na Fonte.
`.trim();

// ─── FAQ HUMANO POR AGENTE ───

const FAQ_DTRIB = `
PERGUNTAS FREQUENTES - DIREITO TRIBUTÁRIO (FAQ PRÁTICO)

P: Qual a diferença entre imposto, taxa e contribuição?
R: Imposto é tributo sem contraprestação direta (ex: IR, ICMS). Taxa exige atividade estatal específica (ex: taxa de alvará, taxa judiciária). Contribuição de melhoria decorre de obra pública que valoriza imóvel.

P: Uma empresa do Simples Nacional pode contratar pra emitir nota de serviço?
R: Sim. Empresas do Simples emitem NFS-e normalmente. O recolhimento de ISS, PIS, Cofins já está embutido no DAS.

P: O que é imunidade tributária e qual a diferença de isenção?
R: Imunidade é proteção constitucional: determinadas situações ou entidades não podem ser tributadas. Isenção é benefício legal: a lei dispensa o pagamento, mas pode ser revogada. Exemplo: templos têm imunidade; cestas básicas podem ter isenção.

P: Prescrição e decadência são a mesma coisa em tributário?
R: Não. Decadência (art. 173 CTN) é a perda do direito de lançar (constituir o crédito) — prazo de 5 anos. Prescrição (art. 174 CTN) é a perda do direito de cobrar judicialmente — também 5 anos, mas contados da constituição definitiva.

P: Como LC 214 e LC 227 aparecem no contexto geral do direito tributario deste agente?
R: Neste agente, a LC 214 aparece como a regulamentacao central da reforma tributaria do consumo, detalhando IBS, CBS, Imposto Seletivo, transicao, nao cumulatividade, split payment, cashback e regimes diferenciados. Ja a LC 227 aparece como legislacao complementar de ajuste e implementacao, com refinamentos operacionais, setoriais e tecnicos ligados ao funcionamento do novo modelo IBS/CBS.

P: Qual a diferenca entre ICMS e ISS em termos de competencia e fato gerador?
R: ICMS e de competencia dos Estados e do DF (art. 155, II, CF; LC 87/96) e tem como fato gerador operacoes relativas a circulacao de mercadorias, transporte interestadual/intermunicipal e comunicacao. ISS e de competencia dos Municipios e do DF (art. 156, III, CF; LC 116/03) e tem como fato gerador a prestacao de servicos constantes da lista anexa da LC 116.

P: O que acontece se eu não pagar o DARF no prazo?
R: Incide multa de mora (0,33% ao dia, limitada a 20%) e juros Selic acumulados desde o vencimento. Em caso de procedimento fiscal: multa de ofício de 75% (ou 150% em sonegação).

P: Posso parcelar débitos federais?
R: Sim. O parcelamento ordinário permite até 60 parcelas mensais. Programas especiais (como REFIS, PERT) podem ampliar prazos e oferecer reduções, quando vigentes.
`.trim();

const FAQ_CTN = `
PERGUNTAS FREQUENTES - CTN E INTERPRETAÇÃO TRIBUTÁRIA (FAQ PRÁTICO)

P: O que é lançamento tributário?
R: É o procedimento administrativo pelo qual a autoridade fiscal identifica o fato gerador, determina a base de cálculo, o montante do tributo e o sujeito passivo (art. 142 CTN). Existe em 3 tipos: de ofício, por declaração e por homologação.

P: Qual a diferença entre lançamento de ofício e por homologação?
R: No lançamento de ofício, a Fazenda apura tudo (ex: IPTU, auto de infração). No lançamento por homologação, o contribuinte calcula e paga antecipadamente, e a Fazenda apenas confere depois (ex: IRPJ, PIS, Cofins). Se não confere em 5 anos, homologa tacitamente.

P: Se a Fazenda errou o valor, posso contestar?
R: Sim. Pode-se impugnar administrativamente em 30 dias (Decreto 70.235/72) ou questionar judicialmente. Em âmbito federal, o CARF (Conselho Administrativo de Recursos Fiscais) julga em segunda instância.

P: O que suspende a exigibilidade do crédito tributário?
R: Art. 151 CTN lista: moratória, depósito do montante integral, reclamações/recursos administrativos, liminar ou tutela judicial, parcelamento. Enquanto suspenso, a Fazenda não pode cobrar, mas as obrigações acessórias continuam.

P: O que é dívida ativa?
R: É o crédito tributário inscrito na Fazenda Pública após esgotado o prazo para pagamento voluntário (art. 201 CTN). A CDA (Certidão de Dívida Ativa) goza de presunção de certeza e liquidez e permite ajuizar execução fiscal.

P: Contribuinte pode pedir certidão negativa com débito parcelado?
R: Sim. Quando o crédito está com exigibilidade suspensa (parcelamento, discussão judicial com depósito), obtém-se a CPEN (Certidão Positiva com Efeitos de Negativa), que tem os mesmos efeitos da CND.

P: O que e denuncia espontanea no CTN?
R: Denuncia espontanea e a comunicacao voluntaria da infracao pelo contribuinte antes de qualquer procedimento administrativo ou medida de fiscalizacao relacionada ao fato. Nos termos do art. 138 do CTN, ela afasta a multa punitiva, desde que haja pagamento do tributo e dos juros de mora, ou deposito da importancia arbitrada quando o montante depender de apuracao.
`.trim();

const FAQ_REFIS = `
PERGUNTAS FREQUENTES - REFORMA TRIBUTÁRIA (FAQ PRÁTICO)

P: Quando os novos tributos (IBS e CBS) começam a valer?
R: Em 2026 é o período de teste (CBS 0,9% e IBS 0,1%, compensáveis). Em 2027, a CBS entra em vigor pleno (substituindo PIS/Cofins). O IBS vai aumentando gradualmente até 2033, quando ICMS e ISS são totalmente extintos.

P: Eu vou pagar mais imposto com a reforma?
R: Depende do seu setor. A reforma é pensada para manter a carga tributária global igual. Indústria tende a pagar menos (crédito amplo). Serviços tendem a pagar mais (poucas aquisições para crédito). Comércio fica neutro.

P: O que é o split payment?
R: É um mecanismo automático: quando o consumidor paga uma compra, o sistema financeiro separa a parcela do tributo e envia direto ao fisco, reduzindo a inadimplência e a sonegação.

P: Minha empresa é do Simples Nacional. Vai mudar algo?
R: O Simples Nacional é mantido. Mas a empresa poderá optar por recolher IBS/CBS fora do Simples (regime geral), o que pode ser vantajoso para gerar créditos aos seus clientes.

P: O que é o cashback tributário?
R: É a devolução de parte dos tributos (IBS e CBS) para famílias de baixa renda inscritas no CadÚnico. A devolução é feita diretamente na conta bancária (via Pix), em percentuais definidos por regulamento.

P: ICMS e ISS vão acabar quando exatamente?
R: A partir de 2029, ICMS e ISS começam a ser reduzidos (90%), caindo 10% ao ano até 2032 (60%). Em 2033, são totalmente extintos e substituídos pelo IBS.

P: O que é o Comitê Gestor do IBS?
R: É o órgão interfederativo que administra o IBS, composto por representantes de Estados, DF e Municípios. Ele define alíquotas de referência, regulamenta créditos e distribui receitas.
`.trim();

const FAQ_TAXREND = `
PERGUNTAS FREQUENTES - TRIBUTAÇÃO DA RENDA (FAQ PRÁTICO)

P: Quem ganha até R$ 5.000 por mês está isento de IR?
R: A Lei 15.270/2025 criou um desconto simplificado que garante isenção efetiva para quem recebe até R$ 5.000 mensais. A faixa de isenção formal vai até R$ 2.428,80, mas o desconto de R$ 564,80 complementa.

P: Qual a alíquota máxima do IRPF?
R: 27,5%, aplicada sobre a parcela que excede R$ 5.826,86 mensais (com parcela a deduzir de R$ 1.092,89).

P: Posso deduzir gasto com médico?
R: Sim. Despesas médicas (médicos, dentistas, psicólogos, hospitais, exames, planos de saúde) são dedutíveis sem limite na declaração anual, desde que comprovadas com recibos e notas.

P: Qual a diferença entre Lucro Real e Lucro Presumido?
R: No Lucro Real, o IRPJ/CSLL incide sobre o lucro contábil ajustado (complexo, mas captura o lucro real). No Lucro Presumido, aplica-se um percentual sobre a receita bruta (8% comércio, 32% serviços) e tributa sobre essa presunção.

P: Tenho que pagar carnê-leão?
R: Se recebe rendimentos de pessoa física (aluguéis, trabalhos sem vínculo de PF para PF), rendimentos do exterior, ou pensão alimentícia, sim: recolhe mensalmente via DARF código 0190.

P: Empresa no Lucro Presumido pode optar por não recolher CSLL separadamente?
R: Não. CSLL é obrigatória e acompanha o regime de tributação do IRPJ. Se você está no presumido, recolhe CSLL presumida com alíquota de 9% sobre a base presumida específica.

P: Qual o prazo para entregar a declaração de IR 2026?
R: O prazo de entrega da DIRPF referente ao exercício 2025 (ano-calendário 2024 ou 2025, conforme regras vigentes) é normalmente de 01 de março a 31 de maio. Consulte a RFB para datas exatas atualizadas.
`.trim();

const FAQ_FEDTAX = `
PERGUNTAS FREQUENTES - TRIBUTOS FEDERAIS RFB (FAQ PRÁTICO)

P: Qual o DARF para reter PIS/Cofins/CSLL na fonte?
R: Código 5952. Retenção de 4,65% (PIS 0,65% + Cofins 3% + CSLL 1%) sobre pagamentos a PJ por serviços de limpeza, conservação, assessoria, manutenção, segurança e locação de mão de obra (art. 30, Lei 10.833).

P: Quando vence o PIS/Cofins mensal?
R: Dia 25 do mês seguinte ao fato gerador. Se cair em feriado ou fim de semana, antecipa para o último dia útil anterior.

P: Empresa do Simples precisa reter PIS/Cofins/CSLL quando contrata serviço?
R: Quando a prestadora é do Simples Nacional, NÃO há retenção de PIS/Cofins/CSLL na fonte. Mas se a tomadora é do Simples e contrata PJ do regime normal, a retenção segue a regra geral.

P: Qual a diferença entre PIS cumulativo e não cumulativo?
R: No cumulativo (Lei 9.718): alíquota menor (0,65%) mas SEM crédito. No não cumulativo (Lei 10.637): alíquota maior (1,65%) mas COM direito a crédito sobre insumos e aquisições. O mesmo vale para Cofins (3% vs 7,6%).

P: O que é a EFD-Contribuições?
R: Escrituração Fiscal Digital das contribuições PIS, Cofins e CPRB. Transmitida mensalmente via SPED até o 10º dia útil do 2º mês subsequente.

P: Como funciona o IOF sobre crédito?
R: IOF incide diariamente sobre o saldo devedor: 0,0041%/dia para PJ e 0,0082%/dia para PF, mais 0,38% de alíquota adicional única no início da operação (Decreto 6.306/07).

P: Posso compensar créditos de IPI com outros tributos?
R: O IPI não cumulativo permite créditos de insumos. Se houver saldo credor acumulado, pode ser compensado com outros débitos federais via PER/DCOMP, conforme IN RFB aplicável.

P: Qual e a base legal central da CSLL no escopo deste agente?
R: A base legal central da CSLL e a Lei 7.689/88, que institui a Contribuicao Social sobre o Lucro Liquido. No escopo deste agente, ela deve ser lida em conjunto com as regras de apuracao do IRPJ, porque a CSLL acompanha o regime do lucro real, presumido ou arbitrado.

P: Onde a base deste agente localiza os codigos de receita DARF?
R: A base deste agente localiza os codigos de receita DARF em tres fontes operacionais principais: o SIEF Receita para codigos de receita, a pagina oficial da Receita para codigos DARF e DJE, e os atos da Codac consultados no Sijut. Para retencao conjunta de PIS/Cofins/CSLL, por exemplo, o codigo destacado e o 5952.
`.trim();

// ──────────────────────────────────────────────────────────
//  MAPEAMENTO DOCS SUPLEMENTARES → AGENTES
// ──────────────────────────────────────────────────────────

const SUPPLEMENT_BY_AGENT = [
  { agentTitle: 'DTrib',      docs: [
    { title: 'SUPP: Guia Operacional – Sistema Tributário Nacional', content: BASE_DTRIB },
    { title: 'SUPP: FAQ Prático – Direito Tributário', content: FAQ_DTRIB },
  ]},
  { agentTitle: 'CTN Expert',  docs: [
    { title: 'SUPP: Guia Operacional – Interpretação CTN', content: BASE_CTN },
    { title: 'SUPP: FAQ Prático – CTN e Interpretação Tributária', content: FAQ_CTN },
  ]},
  { agentTitle: 'REFIS-IA',    docs: [
    { title: 'SUPP: Guia Operacional – Reforma Tributária', content: BASE_REFIS },
    { title: 'SUPP: FAQ Prático – Reforma Tributária', content: FAQ_REFIS },
  ]},
  { agentTitle: 'TAX-Rend',    docs: [
    { title: 'SUPP: Guia Operacional – Tributação da Renda', content: BASE_TAXREND },
    { title: 'SUPP: FAQ Prático – Tributação da Renda', content: FAQ_TAXREND },
  ]},
  { agentTitle: 'FedTax',      docs: [
    { title: 'SUPP: Guia Operacional – Tributos Federais', content: BASE_FEDTAX },
    { title: 'SUPP: FAQ Prático – Tributos Federais', content: FAQ_FEDTAX },
  ]},
];

// ──────────────────────────────────────────────────────────
//  EXECUÇÃO PRINCIPAL
// ──────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════');
  console.log(' UPGRADE TRIBUTÁRIO – Instructions + Supplements');
  console.log('══════════════════════════════════════════════════\n');
  await fs.mkdir(ATTACHMENTS_BASE_DIR, { recursive: true });

  // FASE 1: Atualizar instructions
  console.log('─── FASE 1: Atualizando INSTRUCTIONS ───\n');
  for (const [title, newInstr] of Object.entries(INSTRUCTIONS)) {
    const r = await pool.query(
      `UPDATE agents SET instructions = $1 WHERE user_id IS NULL AND title = $2 RETURNING id, title`,
      [newInstr, title]
    );
    if (r.rows.length) {
      console.log(`  ✓ ${title}: instructions atualizado (${newInstr.length} chars)`);
    } else {
      console.log(`  ✗ ${title}: agente não encontrado!`);
    }
  }

  // FASE 2: Injetar supplements
  console.log('\n─── FASE 2: Injetando SUPPLEMENTS ───\n');
  let totalChunksInserted = 0;

  for (const { agentTitle, docs } of SUPPLEMENT_BY_AGENT) {
    // Buscar agent_id
    const agRow = await pool.query(
      `SELECT id, attachments FROM agents WHERE user_id IS NULL AND title = $1`,
      [agentTitle]
    );
    if (!agRow.rows.length) {
      console.log(`  ✗ ${agentTitle}: agente não encontrado, pulando.`);
      continue;
    }
    const agentId = agRow.rows[0].id;
    const folder = path.join(ATTACHMENTS_BASE_DIR, toSlug(agentTitle));
    await fs.mkdir(folder, { recursive: true });
    const existingAttachments = Array.isArray(agRow.rows[0].attachments) ? agRow.rows[0].attachments : [];
    const preservedNonSuppAttachments = existingAttachments.filter((item) => !/\/supp-[^/]+\.txt$/i.test(String(item || '')));
    const supplementAttachments = [];

    for (const [docIndex, doc] of docs.entries()) {
      // Limpar supplement antigo (idempotente)
      const delDoc = await pool.query(
        `DELETE FROM documents WHERE agent_id = $1 AND title = $2 RETURNING id`,
        [agentId, doc.title]
      );
      if (delDoc.rows.length) {
        for (const dd of delDoc.rows) {
          await pool.query(`DELETE FROM document_chunks WHERE document_id = $1`, [dd.id]);
        }
        console.log(`  🗑  ${agentTitle} → "${doc.title}" removido (re-injeção)`);
      }

      const fileName = `supp-${String(docIndex + 1).padStart(2, '0')}-${toSlug(doc.title)}.txt`;
      const relPath = `/agent-attachments/direito-tributario/${toSlug(agentTitle)}/${fileName}`;
      const fullPath = path.join(folder, fileName);
      await fs.writeFile(
        fullPath,
        `AGENTE: ${agentTitle}\nFONTE: ${doc.title}\nCOLETADO_EM: ${new Date().toISOString()}\n\n${doc.content}`,
        'utf8'
      );
      supplementAttachments.push(relPath);

      // Criar document
      const docId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO documents (id, agent_id, title, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [docId, agentId, doc.title]
      );

      // Chunk + embed
      const chunks = chunkText(doc.content);
      console.log(`  📝 ${agentTitle} → "${doc.title}": ${chunks.length} chunks`);

      const embeddings = await embedBatch(chunks);
      let inserted = 0;

      for (let i = 0; i < chunks.length; i++) {
        if (!embeddings[i]) continue;
        await pool.query(
          `INSERT INTO document_chunks (id, document_id, agent_id, content, chunk_index, embedding, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [crypto.randomUUID(), docId, agentId, chunks[i], i, JSON.stringify(embeddings[i])]
        );
        inserted++;
      }

      totalChunksInserted += inserted;
      console.log(`     → ${inserted} chunks inseridos com embedding\n`);

      // Rate limit guard between docs
      await sleep(EMBED_DELAY_MS);
    }

    await pool.query(
      `UPDATE agents SET attachments = $1 WHERE id = $2`,
      [[...preservedNonSuppAttachments, ...supplementAttachments], agentId]
    );
  }

  // Relatório final
  console.log('\n─── RELATÓRIO FINAL ───\n');
  const final = await pool.query(`
    SELECT a.title,
      length(a.instructions) AS instr_len,
      (SELECT count(*)::int FROM document_chunks dc WHERE dc.agent_id = a.id) AS chunks
    FROM agents a
    WHERE a.user_id IS NULL AND a.title IN ('DTrib','CTN Expert','REFIS-IA','TAX-Rend','FedTax')
    ORDER BY a.title
  `);
  console.table(final.rows);
  console.log(`\nTotal de novos chunks inseridos: ${totalChunksInserted}`);
  console.log('Concluído!\n');

  await pool.end();
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
