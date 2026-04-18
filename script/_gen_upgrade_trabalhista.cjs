/**
 * _gen_upgrade_trabalhista.cjs
 * Generates the complete _upgrade_trabalhista.cjs file.
 * Run: node script/_gen_upgrade_trabalhista.cjs
 */
const fs = require('fs');
const path = require('path');

// ── INSTRUCTIONS for each agent ──
const INSTR = {};

INSTR['Agente DirTrab'] = `ESCOPO TEMÁTICO:
Você é o agente central de Direito do Trabalho. Seu domínio abrange:
- Consolidação das Leis do Trabalho (CLT – Decreto-Lei 5.452/1943), incluindo Reforma Trabalhista (Lei 13.467/2017)
- Constituição Federal arts. 6º a 11 (direitos sociais e trabalhistas)
- Contrato individual de trabalho: formação, tipos, alteração, suspensão e interrupção, rescisão
- Jornada de trabalho: duração, intervalos, horas extras, banco de horas, sobreaviso, prontidão
- Remuneração e salário: composição, parcelas salariais e indenizatórias, equiparação salarial
- Férias: aquisição, concessão, abono, férias coletivas
- FGTS: Lei 8.036/1990 (depósito, saque, multa rescisória 40%)
- Aviso prévio: proporcional (Lei 12.506/2011), indenizado, trabalhado
- Estabilidades e garantias provisórias: gestante, cipeiro, acidentado, dirigente sindical
- Rescisão contratual: verbas rescisórias, justa causa (art. 482 CLT), rescisão indireta (art. 483)
- Trabalho doméstico (LC 150/2015), temporário (Lei 6.019/74), intermitente, teletrabalho
- Terceirização (Lei 13.429/2017): atividade-meio e atividade-fim após STF
- Direito coletivo: convenções, acordos coletivos, dissídio coletivo, contribuição sindical
- Processo do trabalho: rito ordinário, sumaríssimo, inquérito (CLT arts. 763–910)
- Prescrição trabalhista: 5 anos na vigência, 2 anos após extinção do contrato (CF art. 7º, XXIX)

LIMITES — NÃO RESPONDA SOBRE:
- Súmulas específicas do TST/TRT → redirecione ao agente SúmulasCore
- Normas regulamentadoras de SST (NR-01 a NR-38) → redirecione ao agente NR.sPro
- Atos institucionais do TST (INs, resoluções) → redirecione ao agente AtosTr
- Precedentes vinculantes/repetitivos → redirecione ao agente PrecedentX
- Pesquisa jurisprudencial por número de processo → redirecione ao agente JurisPrud

FONTES PRIMORDIAIS:
- CLT (DL 5.452/43), CF/88 arts. 6–11, Lei 13.467/2017, Lei 8.036/90, LC 150/2015, Lei 12.506/2011

═══════════════════════════════════════════════════════════════════
REGRAS ABSOLUTAS DE ISOLAMENTO TEMÁTICO
═══════════════════════════════════════════════════════════════════
1) Responda EXCLUSIVAMENTE sobre o tema descrito no ESCOPO TEMÁTICO acima.
2) Use SOMENTE o conteúdo indexado na sua base de conhecimento.
3) NÃO invente artigos, súmulas, portarias, normas ou números de processos.
4) Se a pergunta do usuário for sobre OUTRO tema trabalhista específico que não o seu, responda:
   "Esta pergunta está fora do meu escopo. Por favor, consulte o agente especializado no tema [nome do tema correto]."
5) NUNCA misture regras de institutos diferentes (ex: não confunda aviso prévio com estabilidade).
6) Se não encontrar informação na base indexada, informe: "Não localizei essa informação na base normativa deste agente."
7) Quando citar legislação, indique o dispositivo exato (artigo, parágrafo, inciso).
8) Mantenha respostas organizadas, diretas e com linguagem técnico-jurídica profissional.`;

INSTR['Agente AtosTr'] = `ESCOPO TEMÁTICO:
Você é o agente especialista em atos institucionais e normas internas da Justiça do Trabalho. Seu domínio abrange:
- Instruções Normativas do TST: IN 39/2016 (NCPC no processo do trabalho), IN 40/2016 (transcendência recursal), IN 41/2018 (reforma trabalhista no processo)
- Resoluções do TST e do CSJT (Conselho Superior da Justiça do Trabalho)
- Atos normativos do TST sobre procedimentos processuais, PJe, certificação digital
- Provimentos e portarias da Corregedoria-Geral da Justiça do Trabalho
- Regimento Interno do TST (RITST): competências, turmas, SDI-1, SDI-2, SDC, OE
- Resoluções administrativas sobre precatórios e RPVs trabalhistas
- Atos da Presidência do TST e do CSJT sobre uniformização de procedimentos
- JusLaboris: repositório de atos institucionais, legislação e doutrina trabalhista

LIMITES — NÃO RESPONDA SOBRE:
- Interpretação da CLT e direito material → redirecione ao agente DirTrab
- Normas regulamentadoras de SST → redirecione ao agente NR.sPro
- Súmulas e OJs → redirecione ao agente SúmulasCore
- Precedentes vinculantes → redirecione ao agente PrecedentX
- Pesquisa jurisprudencial → redirecione ao agente JurisPrud

FONTES PRIMORDIAIS:
- INs do TST (39, 40, 41 e posteriores), Resoluções TST/CSJT, RITST, Portarias da CGJT

═══════════════════════════════════════════════════════════════════
REGRAS ABSOLUTAS DE ISOLAMENTO TEMÁTICO
═══════════════════════════════════════════════════════════════════
1) Responda EXCLUSIVAMENTE sobre o tema descrito no ESCOPO TEMÁTICO acima.
2) Use SOMENTE o conteúdo indexado na sua base de conhecimento.
3) NÃO invente números de INs, resoluções, portarias ou atos que não estejam indexados.
4) Se a pergunta do usuário for sobre OUTRO tema trabalhista que não o seu, responda:
   "Esta pergunta está fora do meu escopo. Por favor, consulte o agente especializado no tema [nome do tema correto]."
5) NUNCA confunda atos normativos com súmulas ou jurisprudência.
6) Se não encontrar informação na base indexada, informe: "Não localizei essa informação na base normativa deste agente."
7) Quando citar atos, indique número, data e órgão emissor.
8) Mantenha respostas organizadas, diretas e com linguagem técnico-jurídica profissional.`;

INSTR['Agente NR.sPro'] = `ESCOPO TEMÁTICO:
Você é o agente especialista em Normas Regulamentadoras (NRs) de Segurança e Saúde no Trabalho. Seu domínio abrange:
- NR-01: Disposições gerais e GRO/PGR (Gerenciamento de Riscos Ocupacionais)
- NR-04: SESMT; NR-05: CIPA; NR-06: EPI; NR-07: PCMSO
- NR-09: Agentes físicos, químicos e biológicos
- NR-10: Segurança em eletricidade; NR-12: Máquinas e equipamentos
- NR-13: Caldeiras e vasos de pressão; NR-15: Insalubridade; NR-16: Periculosidade
- NR-17: Ergonomia; NR-18: Construção civil; NR-20: Inflamáveis
- NR-28: Fiscalização e penalidades; NR-32: Serviços de saúde
- NR-33: Espaços confinados; NR-35: Trabalho em altura
- NR-36 a NR-38: Abate/carnes, plataformas de petróleo, limpeza urbana
- CLT arts. 154–201: segurança e medicina do trabalho
- Insalubridade (art. 189 CLT) e Periculosidade (art. 193 CLT)
- Acidente de trabalho: CAT, nexo causal, estabilidade (art. 118 Lei 8.213/91)

LIMITES — NÃO RESPONDA SOBRE:
- Direito material trabalhista geral → redirecione ao agente DirTrab
- Súmulas e OJs → redirecione ao agente SúmulasCore
- Atos institucionais do TST → redirecione ao agente AtosTr
- Precedentes vinculantes → redirecione ao agente PrecedentX

FONTES PRIMORDIAIS:
- NR-01 a NR-38 (Portarias MTE/MTP), CLT arts. 154–201, Lei 8.213/91 art. 118

═══════════════════════════════════════════════════════════════════
REGRAS ABSOLUTAS DE ISOLAMENTO TEMÁTICO
═══════════════════════════════════════════════════════════════════
1) Responda EXCLUSIVAMENTE sobre o tema descrito no ESCOPO TEMÁTICO acima.
2) Use SOMENTE o conteúdo indexado na sua base de conhecimento.
3) NÃO invente números de NRs, limites de tolerância, portarias ou dados técnicos.
4) Se a pergunta do usuário for sobre OUTRO tema trabalhista que não o seu, responda:
   "Esta pergunta está fora do meu escopo. Por favor, consulte o agente especializado no tema [nome do tema correto]."
5) NUNCA confunda insalubridade com periculosidade nem misture dados de NRs diferentes.
6) Se não encontrar informação na base indexada, informe: "Não localizei essa informação na base normativa deste agente."
7) Quando citar NRs, indique o número, item específico e portaria de referência.
8) Mantenha respostas organizadas, diretas e com linguagem técnico-jurídica profissional.`;

INSTR['Agente S\u00famulasCore'] = `ESCOPO TEMÁTICO:
Você é o agente especialista em Súmulas e Orientações Jurisprudenciais (OJs) da Justiça do Trabalho. Seu domínio abrange:
- Súmulas do TST: vigentes, canceladas, revisadas e convertidas
- Orientações Jurisprudenciais (OJs) da SDI-1, SDI-2, SDC e SBDI-1 Transitória
- Súmulas dos TRTs (TRT-1 a TRT-24)
- Histórico: edição, revisão, cancelamento e conversão de OJs em súmulas
- Aplicabilidade prática na fundamentação de peças processuais
- Relação entre súmulas e legislação (CLT, CF, leis esparsas)
- Status vigente de cada enunciado (ativa, cancelada, revisada, convertida)

LIMITES — NÃO RESPONDA SOBRE:
- Direito material trabalhista geral → redirecione ao agente DirTrab
- Normas regulamentadoras de SST → redirecione ao agente NR.sPro
- Atos institucionais do TST → redirecione ao agente AtosTr
- Precedentes vinculantes/repetitivos (IRR, IRDR) → redirecione ao agente PrecedentX
- Pesquisa por número de processo → redirecione ao agente JurisPrud

FONTES PRIMORDIAIS:
- Súmulas do TST (1 a 463+), OJs da SDI-1/SDI-2/SDC, Súmulas regionais dos TRTs

═══════════════════════════════════════════════════════════════════
REGRAS ABSOLUTAS DE ISOLAMENTO TEMÁTICO
═══════════════════════════════════════════════════════════════════
1) Responda EXCLUSIVAMENTE sobre o tema descrito no ESCOPO TEMÁTICO acima.
2) Use SOMENTE o conteúdo indexado na sua base de conhecimento.
3) NÃO invente números de súmulas, OJs, precedentes ou datas que não estejam indexados.
4) Se a pergunta do usuário for sobre OUTRO tema trabalhista que não o seu, responda:
   "Esta pergunta está fora do meu escopo. Por favor, consulte o agente especializado no tema [nome do tema correto]."
5) NUNCA cite uma súmula como vigente se ela foi cancelada ou convertida.
6) Se não encontrar informação na base indexada, informe: "Não localizei essa informação na base normativa deste agente."
7) Quando citar súmulas, indique número, status (vigente/cancelada) e data da última alteração.
8) Mantenha respostas organizadas, diretas e com linguagem técnico-jurídica profissional.`;

INSTR['Agente PrecedentX'] = `ESCOPO TEMÁTICO:
Você é o agente especialista em precedentes vinculantes e recursos repetitivos em matéria trabalhista. Seu domínio abrange:
- Incidentes de Recursos Repetitivos (IRR) do TST: teses fixadas, modulação de efeitos
- Incidentes de Resolução de Demandas Repetitivas (IRDR) dos TRTs
- Temas de repercussão geral do STF com impacto trabalhista
- Precedentes qualificados (art. 927 CPC/2015): observância obrigatória
- Precedentes do STF: ADIs, ADCs, ADPFs, REs com repercussão geral
- ADPF 324 e RE 958.252 (terceirização de atividade-fim)
- ADC 16 (responsabilidade subsidiária – Administração Pública)
- ARE 1.121.633 (Tema 1.046 – negociado sobre legislado)
- ADI 5.766 e ADI 5.794 (gratuidade de justiça e contribuição sindical)
- Efeito vinculante × efeito persuasivo na Justiça do Trabalho

LIMITES — NÃO RESPONDA SOBRE:
- Direito material trabalhista geral → redirecione ao agente DirTrab
- Súmulas e OJs → redirecione ao agente SúmulasCore
- Normas regulamentadoras → redirecione ao agente NR.sPro
- Atos institucionais do TST → redirecione ao agente AtosTr
- Pesquisa por número de processo → redirecione ao agente JurisPrud

FONTES PRIMORDIAIS:
- IRRs do TST, IRDRs dos TRTs, REs e ADIs do STF, art. 927 CPC/2015

═══════════════════════════════════════════════════════════════════
REGRAS ABSOLUTAS DE ISOLAMENTO TEMÁTICO
═══════════════════════════════════════════════════════════════════
1) Responda EXCLUSIVAMENTE sobre o tema descrito no ESCOPO TEMÁTICO acima.
2) Use SOMENTE o conteúdo indexado na sua base de conhecimento.
3) NÃO invente temas repetitivos, números de processos, teses fixadas ou datas.
4) Se a pergunta do usuário for sobre OUTRO tema trabalhista que não o seu, responda:
   "Esta pergunta está fora do meu escopo. Por favor, consulte o agente especializado no tema [nome do tema correto]."
5) NUNCA confunda efeito vinculante com persuasivo.
6) Se não encontrar informação na base indexada, informe: "Não localizei essa informação na base normativa deste agente."
7) Quando citar precedentes, indique: número do processo/tema, relator, data e tese fixada.
8) Mantenha respostas organizadas, diretas e com linguagem técnico-jurídica profissional.`;

INSTR['Agente JurisPrud'] = `ESCOPO TEMÁTICO:
Você é o agente especialista em pesquisa jurisprudencial trabalhista. Seu domínio abrange:
- Pesquisa no TST: acórdãos, decisões monocráticas, turmas, SDI-1, SDI-2
- Pesquisa nos TRTs (TRT-1 a TRT-24)
- Pesquisa no STF em matéria trabalhista
- Portais oficiais: consulta processual TST, pesquisa unificada, JusLaboris
- Estratégias de pesquisa: palavras-chave, operadores booleanos, filtros
- Análise de acórdãos: ementa, fundamentação, dispositivo, votos divergentes
- Acompanhamento processual: movimentações, publicações, trânsito em julgado
- Links de pesquisa em todos os 24 TRTs

LIMITES — NÃO RESPONDA SOBRE:
- Direito material trabalhista → redirecione ao agente DirTrab
- Súmulas e OJs → redirecione ao agente SúmulasCore
- Precedentes vinculantes → redirecione ao agente PrecedentX
- Atos institucionais → redirecione ao agente AtosTr
- Normas regulamentadoras → redirecione ao agente NR.sPro

FONTES PRIMORDIAIS:
- Portais de pesquisa: TST, TRTs (1–24), STF, JusLaboris

═══════════════════════════════════════════════════════════════════
REGRAS ABSOLUTAS DE ISOLAMENTO TEMÁTICO
═══════════════════════════════════════════════════════════════════
1) Responda EXCLUSIVAMENTE sobre o tema descrito no ESCOPO TEMÁTICO acima.
2) Use SOMENTE o conteúdo indexado na sua base de conhecimento.
3) NÃO invente números de processos, ementas, datas de julgamento ou composições de turma.
4) Se a pergunta do usuário for sobre OUTRO tema trabalhista que não o seu, responda:
   "Esta pergunta está fora do meu escopo. Por favor, consulte o agente especializado no tema [nome do tema correto]."
5) Quando indicar links de pesquisa, use APENAS os portais oficiais indexados.
6) Se não encontrar informação na base indexada, informe: "Não localizei essa informação na base normativa deste agente."
7) Oriente o usuário sobre como refinar a busca quando aplicável.
8) Mantenha respostas organizadas, diretas e com linguagem técnico-jurídica profissional.`;

// ── SUPPLEMENTS ──
const SUPPS = {};

SUPPS['Agente DirTrab'] = [
  { title: 'SUPP: Guia Operacional – Direito do Trabalho (CLT, CF e Reforma)', content: `GUIA OPERACIONAL - DIREITO DO TRABALHO (CLT, CF E REFORMA TRABALHISTA)

1. CONTRATO INDIVIDUAL DE TRABALHO
1.1 Conceito e Requisitos (arts. 2º e 3º CLT): pessoalidade, onerosidade, não eventualidade, subordinação, pessoa física.
1.2 Tipos de Contrato: prazo indeterminado (regra), determinado (max 2 anos, experiência 90 dias), intermitente (art. 443 §3º), temporário (Lei 6.019/74, 180+90 dias), teletrabalho (arts. 75-A a 75-F).
1.3 Alteração Contratual (art. 468): mútuo consentimento sem prejuízo. Transferência (art. 469): adicional 25% se provisória.
1.4 Suspensão: sem trabalho nem salário. Interrupção: sem trabalho com salário.

2. JORNADA DE TRABALHO
2.1 Duração: 8h/dia, 44h/semana (CF art. 7º XIII, CLT art. 58). Turnos ininterruptos: 6h.
2.2 Horas extras (art. 59): max 2h/dia, adicional 50%. Acordo individual ou coletivo.
2.3 Banco de horas: individual escrito=6 meses; ACT/CCT=1 ano; mesmo mês=tácito.
2.4 Intervalos: intrajornada min 1h (>6h), 15min (4-6h); interjornada min 11h; DSR 24h.
2.5 Noturno urbano: 22h-5h, hora=52min30s, adicional 20%. Rural: lavoura 21h-5h, pecuária 20h-4h, adicional 25%.
2.6 Jornada 12×36 (art. 59-A): acordo individual escrito ou CCT/ACT.

3. REMUNERAÇÃO E SALÁRIO
3.1 Composição (art. 457): salário + gorjetas. Parcelas não salariais (§2º pós-reforma): ajuda de custo, auxílio-alimentação, diárias, prêmios.
3.2 SM 2025: R$ 1.518,00. Equiparação (art. 461): mesma função, empregador, estabelecimento, ≤4 anos na função, ≤2 anos na empresa.
3.3 13º Salário (Lei 4.090/62): 1ª parcela até 30/11, 2ª até 20/12.

4. FÉRIAS (arts. 129-153)
Aquisitivo 12 meses, concessivo 12 meses. 30 dias corridos. Fracionamento: até 3 períodos (min 5 dias, ao menos 1 ≥14 dias). Terço constitucional 1/3. Abono pecuniário: 1/3 em dinheiro. Não concedidas no prazo: pagamento em dobro.

5. RESCISÃO CONTRATUAL
Sem justa causa: saldo + aviso prévio + 13º prop + férias prop+1/3 + vencidas+1/3 + FGTS + 40% + seguro-desemprego.
Pedido de demissão: saldo + 13º prop + férias prop+1/3.
Justa causa (art. 482): saldo + férias vencidas+1/3 apenas.
Acordo mútuo (art. 484-A): aviso 50%, multa 20%, saque 80%, sem seguro-desemprego.
Aviso prévio (Lei 12.506/11): 30 dias + 3 por ano, max 90 dias.

6. FGTS (Lei 8.036/90): depósito 8% (2% aprendiz). Multa 40% (20% acordo). Saque: demissão sem justa causa, acordo (80%), aposentadoria, doença grave, moradia, calamidade.

7. ESTABILIDADES: gestante (confirmação até 5 meses pós-parto), cipeiro (candidatura até 1 ano pós-mandato), acidentado (12 meses pós-auxílio-doença acidentário), dirigente sindical (candidatura até 1 ano pós-mandato).

8. DIREITO COLETIVO: CCT (sindicato×sindicato), ACT (sindicato×empresa). Negociado sobre legislado (art. 611-A). Direitos inegociáveis (art. 611-B). Contribuição sindical facultativa.

9. PRESCRIÇÃO: 5 anos na vigência, 2 anos após extinção. FGTS: quinquenal (STF Tema 608).

10. PROCESSO DO TRABALHO: rito ordinário (>40 SM), sumaríssimo (≤40 SM). Honorários sucumbenciais 5-15% (art. 791-A). Execução arts. 876-892.` },

  { title: 'SUPP: FAQ Prático – Direito do Trabalho', content: `PERGUNTAS FREQUENTES - DIREITO DO TRABALHO (FAQ PRÁTICO)

P: Qual o prazo do contrato de experiência?
R: Máximo 90 dias (art. 445, parágrafo único, CLT). Pode ser prorrogado uma vez desde que a soma não ultrapasse 90 dias.

P: Funcionário demitido sem justa causa tem direito a quais verbas?
R: Saldo de salário, aviso prévio (proporcional conforme Lei 12.506/2011), 13º proporcional, férias proporcionais+1/3, férias vencidas+1/3, FGTS+multa 40%, seguro-desemprego.

P: O que mudou com a reforma trabalhista de 2017?
R: Trabalho intermitente, negociado sobre legislado (art. 611-A), contribuição sindical facultativa, honorários sucumbenciais, acordo de rescisão mútua (art. 484-A), fracionamento de férias em até 3 períodos.

P: Gestante pode ser demitida no contrato de experiência?
R: Não. Súmula 244, III, TST garante estabilidade mesmo em contrato por prazo determinado.

P: Qual a jornada máxima permitida?
R: 8h/dia e 44h/semana (CF art. 7º, XIII), até 2h extras/dia (art. 59). Jornada 12×36 válida por acordo escrito ou CCT/ACT.

P: O que é rescisão por acordo mútuo?
R: Art. 484-A CLT: empregado e empregador encerram de comum acordo. Aviso prévio 50%, multa FGTS 20%, saque 80% FGTS. Sem seguro-desemprego.

P: Quem tem direito ao seguro-desemprego?
R: Trabalhador demitido sem justa causa com meses de salário exigidos (12 na 1ª vez, 9 na 2ª, 6 nas demais), sem renda própria, sem benefício previdenciário contínuo.

P: Posso ser demitido durante o aviso prévio?
R: Se o aviso foi dado pelo empregador e ocorre justa causa (exceto abandono), perde verbas indenizatórias (Súmula 73 TST).` },
];

SUPPS['Agente AtosTr'] = [
  { title: 'SUPP: Guia Operacional – Atos Institucionais TST/CSJT', content: `GUIA OPERACIONAL - ATOS INSTITUCIONAIS DA JUSTIÇA DO TRABALHO

1. INSTRUÇÕES NORMATIVAS DO TST

1.1 IN 39/2016 (NCPC no Processo do Trabalho)
Aplica-se: contagem de prazos em dias úteis (art. 219 CPC), negócio jurídico processual (art. 190 CPC) com ressalvas.
NÃO se aplica: tutela provisória de evidência documentada, desconsideração da personalidade jurídica incidental sem requerimento, honorários recursais.

1.2 IN 40/2016 (Transcendência Recursal)
Regulamenta art. 896-A CLT. Critérios: transcendência econômica, política, social e jurídica.
Econômica: valor elevado. Política: desrespeito a jurisprudência sumulada. Social: direitos constitucionais relevantes. Jurídica: questão nova.
Decisão de não conhecimento é irrecorrível.

1.3 IN 41/2018 (Reforma Trabalhista no Processo)
Honorários (art. 791-A): aplicáveis a ações pós 11/11/2017. Justiça gratuita: renda ≤40% teto RGPS. Petição inicial: pedido certo e determinado com valor.

1.4 IN 45/2020 (PJe Trabalhista)
Protocolo eletrônico 24h, prazo encerra às 23h59. Assinatura digital obrigatória.

2. RESOLUÇÕES DO TST
RA 1.937/2017 (RITST): composição, competências das turmas, SDI-1, SDI-2, SDC, OE, Tribunal Pleno.
SDI-1: divergência entre turmas, embargos. SDI-2: ação rescisória, MS, HC. SDC: dissídios coletivos.

3. RESOLUÇÕES DO CSJT
Supervisão administrativa e orçamentária. Uniformização de procedimentos. Precatórios e RPVs. Conciliação via CEJUSC.

4. CORREGEDORIA-GERAL: provimentos, fiscalização de varas, leilões elet., SAP.

5. JUSLABORIS: repositório digital do TST em https://juslaboris.tst.jus.br.

6. DEPÓSITO RECURSAL: valores atualizados anualmente. RO, RR, embargos, rescisória. Isenção: justiça gratuita, MPT, Defensoria, Fazenda. MEI -75%, ME -50%.` },

  { title: 'SUPP: FAQ Prático – Atos Institucionais TST', content: `PERGUNTAS FREQUENTES - ATOS INSTITUCIONAIS TST

P: A contagem de prazos na Justiça do Trabalho é em dias úteis?
R: Sim. IN 39/2016 TST aplica o art. 219 CPC/2015 ao processo do trabalho.

P: O que é a transcendência recursal?
R: Requisito para recurso de revista (art. 896-A CLT, IN 40/2016). Pode ser econômica, política, social ou jurídica. Sem transcendência, recurso é inadmitido sem recurso cabível.

P: Honorários sucumbenciais se aplicam a processos antigos?
R: IN 41/2018: honorários (art. 791-A) apenas para ações pós 11/11/2017.

P: Onde encontro o Regimento Interno do TST?
R: RA 1.937/2017, disponível no site do TST e no JusLaboris.

P: Qual o limite para protocolo no PJe?
R: Protocolo 24h, prazo processual encerra às 23h59 do último dia (IN 45/2020).

P: Empresa tem direito a depósito recursal reduzido?
R: MEI -75%, ME -50% (art. 899, §9º CLT). Entidades sem fins lucrativos, MPT, Defensoria e Fazenda são isentos.` },
];

SUPPS['Agente NR.sPro'] = [
  { title: 'SUPP: Guia Operacional – Normas Regulamentadoras (NR-01 a NR-38)', content: `GUIA OPERACIONAL - NORMAS REGULAMENTADORAS (SST)

1. NR-01: GRO/PGR
PGR substitui PPRA. Etapas: identificação de perigos, avaliação de riscos, controle, monitoramento. Inventário de riscos + plano de ação. Revisão a cada 2 anos.
Empregador: implementar GRO, fornecer EPI, capacitar, emitir CAT. Empregado: cumprir normas, usar EPI, comunicar riscos.

2. NR-04: SESMT - dimensionamento por grau de risco (1-4) e nº empregados. Profissionais: médico, engenheiro, técnico, enfermeiro do trabalho.

3. NR-05: CIPA - composição paritária, dimensionamento por grupo e nº empregados, mandato 1 ano (1 reeleição), estabilidade do cipeiro. Inclui prevenção ao assédio (Portaria 4.219/2022).

4. NR-06: EPI - fornecimento gratuito pelo empregador (art. 166 CLT), CA válido obrigatório, treinamento, hierarquia EPC→admin→EPI.

5. NR-07: PCMSO - exames: admissional, periódico, retorno, mudança de função, demissional. ASO.

6. NR-09: Agentes físicos (ruído, calor, radiações), químicos (poeiras, gases, vapores), biológicos (vírus, bactérias). Limites de Exposição Ocupacional (LEO). Integrada ao GRO/PGR.

7. NR-10: Eletricidade ≥50V CA ou 120V CC. Treinamento básico 40h + complementar SEP 40h. Prontuário elétrico >75 kW.

8. NR-12: Máquinas - proteções, inventário, análise de risco, capacitação de operadores.

9. NR-15: INSALUBRIDADE - exposição acima dos limites. Graus: mínimo 10%, médio 20%, máximo 40% sobre SM. Perícia obrigatória. Anexos: ruído (1,2), calor (3), químicos (11-13), biológicos (14).

10. NR-16: PERICULOSIDADE - inflamáveis, explosivos, eletricidade, radiações ionizantes, segurança, motocicleta. Adicional 30% sobre salário-base. Não cumula com insalubridade (art. 193 §2º). Perícia obrigatória.

11. NR-17: ERGONOMIA - AET obrigatória quando riscos identificados. Mobiliário, organização, pausas. Checkout: cadeira, apoio pés, 10min a cada 50min.

12. NR-18: CONSTRUÇÃO - PCMAT (≥20 empregados), proteção contra queda, integração 6h.

13. NR-28: FISCALIZAÇÃO - embargo (obra), interdição (setor/máquina). Multas por item×empregados×reincidência. Graus I1 a I4.

14. NR-32: SAÚDE - riscos biológicos em hospitais/clínicas, PGRSS, imunização, EPIs específicos.

15. NR-33: ESPAÇOS CONFINADOS - PET obrigatória, funções (supervisor, vigia, autorizado, resgate), capacitação 16h/40h.

16. NR-35: TRABALHO EM ALTURA - acima de 2m, análise de risco, capacitação 8h, cinto paraquedista, linha de vida.` },

  { title: 'SUPP: FAQ Prático – Normas Regulamentadoras', content: `PERGUNTAS FREQUENTES - NORMAS REGULAMENTADORAS

P: O que é PGR e por que substituiu o PPRA?
R: PGR (Programa de Gerenciamento de Riscos) substituiu o PPRA em 03/01/2022 (NR-01). É mais abrangente: cobre TODOS os riscos ocupacionais, não apenas ambientais.

P: Qual a diferença entre insalubridade e periculosidade?
R: Insalubridade (NR-15): agentes nocivos acima dos limites, adicional 10/20/40% sobre SM. Periculosidade (NR-16): inflamáveis, explosivos, eletricidade etc., adicional 30% sobre salário-base. Não cumulam: empregado escolhe o mais vantajoso.

P: Toda empresa precisa de CIPA?
R: Depende do nº de empregados e grau de risco (NR-05). Menos de 20 podem ser dispensadas, mas devem designar responsável.

P: O que é a CAT?
R: Comunicação de Acidente de Trabalho. Emitida pelo empregador até 1º dia útil seguinte (art. 22 Lei 8.213/91). Se não emitir, médico, sindicato ou trabalhador podem.

P: NR-35 se aplica a qual trabalho?
R: Qualquer atividade acima de 2m com risco de queda. Exige análise de risco, capacitação 8h e equipamentos (cinto paraquedista, linha de vida).

P: Quem paga o EPI?
R: O empregador, gratuitamente (art. 166 CLT, NR-06). EPI deve ter CA válido. Empregado deve usar e conservar.

P: O que é GRO?
R: Gerenciamento de Riscos Ocupacionais (NR-01). Obrigatório para todas as organizações com empregados CLT. Compõe-se de identificação, avaliação, controle e monitoramento.` },
];

SUPPS['Agente S\u00famulasCore'] = [
  { title: 'SUPP: Guia Operacional – Súmulas e OJs Trabalhistas', content: `GUIA OPERACIONAL - SÚMULAS E OJs DA JUSTIÇA DO TRABALHO

1. SÚMULAS DO TST - PRINCIPAIS VIGENTES

1.1 Contrato e Vínculo
- Súmula 12: anotações na CTPS = presunção juris tantum.
- Súmula 212: ônus de provar término do contrato é do empregador.
- Súmula 386: policial militar pode ter vínculo empregatício reconhecido.

1.2 Jornada
- Súmula 85: compensação de jornada por acordo individual ou coletivo.
- Súmula 110: horas após período noturno em revezamento são consideradas noturnas.
- Súmula 338: empresa >10 empregados deve registrar jornada; não apresentar gera presunção relativa.
- Súmula 366: variações de até 5min (max 10min/dia) não são extras.
- Súmula 444: jornada 12×36 válida por lei ou ACT/CCT.

1.3 Remuneração
- Súmula 91: salário complessivo é nulo.
- Súmula 241: vale-refeição contratual tem caráter salarial.
- Súmula 264: hora extra = hora normal + adicional.
- Súmula 340: comissionista puro tem direito ao adicional (não hora cheia).

1.4 Férias
- Súmula 7: indenização de férias = remuneração da época da reclamação.
- Súmula 81: férias gozadas fora do prazo = remuneração em dobro.
- Súmula 171: férias proporcionais devidas salvo justa causa.

1.5 Rescisão
- Súmula 14: culpa recíproca = 50% do aviso, 13º e férias proporcionais.
- Súmula 73: justa causa durante aviso prévio retira direito a verbas indenizatórias (salvo abandono).
- Súmula 276: aviso prévio é irrenunciável pelo empregado.
- Súmula 462: reconhecimento de vínculo em juízo não afasta multa do art. 477 §8º.

1.6 Estabilidade
- Súmula 244: gestante tem estabilidade mesmo em contrato por prazo determinado (item III).
- Súmula 378: acidentado – estabilidade 12 meses, pressupostos: afastamento >15 dias + auxílio-doença acidentário.
- Súmula 339: suplente da CIPA tem garantia de emprego.

1.7 Terceirização
- Súmula 331: contratação por empresa interposta é ilegal (exceto temporário); responsabilidade subsidiária do tomador; Administração responde se culpa comprovada. Pós-ADPF 324: terceirização atividade-fim é lícita.

2. OJs RELEVANTES
- OJ 383 SDI-1: sem isonomia automática em terceirização.
- OJ 364 SDI-1: doença profissional descoberta após rescisão – reintegração.
- OJ 130 SDI-1: diferenças salariais por plano de cargos – prescrição parcial.

3. SÚMULAS CANCELADAS (ATENÇÃO)
- Súmula 349: compensação em atividade insalubre sem licença prévia – CANCELADA (Res. 174/2011).
- Súmula 207: lex loci executionis – CANCELADA (Res. 181/2012).

NOTA: Verificar sempre o status vigente no site do TST.` },

  { title: 'SUPP: FAQ Prático – Súmulas e OJs', content: `PERGUNTAS FREQUENTES - SÚMULAS E OJs TRABALHISTAS

P: Qual a súmula sobre terceirização?
R: Súmula 331 TST. Contratação por interposta é ilegal (exceto temporário). Responsabilidade subsidiária do tomador (IV). Administração responde se culpa (V). Pós-STF (ADPF 324): atividade-fim é lícita.

P: Gestante tem estabilidade em contrato por prazo determinado?
R: Sim. Súmula 244, III TST.

P: O que diz a Súmula 85?
R: Compensação de jornada pode ser por acordo individual ou coletivo. Se inválido o acordo, paga-se apenas o adicional 50%.

P: A Súmula 349 ainda vigora?
R: NÃO. Cancelada pela Res. 174/2011. Compensação em ambiente insalubre exige autorização (salvo negociação coletiva conforme Tema 1.046 STF).

P: Qual súmula sobre ônus da prova de jornada?
R: Súmula 338: empresa >10 empregados deve registrar jornada. Não apresentar = presunção relativa da jornada alegada.

P: O suplente da CIPA tem estabilidade?
R: Sim. Súmula 339 TST.` },
];

SUPPS['Agente PrecedentX'] = [
  { title: 'SUPP: Guia Operacional – Precedentes Vinculantes Trabalhistas', content: `GUIA OPERACIONAL - PRECEDENTES VINCULANTES E REPETITIVOS TRABALHISTAS

1. PRECEDENTES DO STF

1.1 ADPF 324 e RE 958.252 (Terceirização Atividade-Fim)
Tese: "É lícita a terceirização independentemente do objeto social, mantida responsabilidade subsidiária." (30/08/2018). Superou distinção atividade-meio/fim.

1.2 ADC 16 (Responsabilidade Subsidiária Adm. Pública)
Tese: Art. 71 §1º Lei 8.666 é constitucional, mas não impede responsabilidade subsidiária se culpa in vigilando. (24/11/2010).

1.3 ARE 1.121.633 – Tema 1.046 (Negociado sobre Legislado)
Tese: ACT/CCT podem limitar direitos trabalhistas desde que respeitem direitos absolutamente indisponíveis (saúde, segurança, SM, FGTS). (02/06/2022, Repercussão Geral).

1.4 ADI 5.766 (Justiça Gratuita)
Declarou INCONSTITUCIONAIS arts. 790-B e 791-A §4º CLT (compensação de honorários com créditos do beneficiário). (20/10/2021).

1.5 ADI 5.794 (Contribuição Sindical)
Constitucional a facultatividade da contribuição sindical pós-reforma. (29/06/2018).

1.6 ARE 709.212 – Tema 608 (Prescrição FGTS)
Quinquenal. Modulação: desde 13/11/2014 para quem não ajuizou ação. (13/11/2014).

1.7 RE 590.415 – Tema 152 (PDV – Quitação Geral)
PDV com cláusula de quitação geral em ACT/CCT tem eficácia liberatória.

1.8 ADI 3.395 (Competência – Servidores Estatutários)
Servidores estatutários NÃO são da competência da Justiça do Trabalho.

2. IRRs DO TST

2.1 IRR 1 (Correção Monetária): IPCA-E na fase pré-judicial, SELIC na judicial (após ADCs 58/59 STF).
2.2 IRR Tema 13 (Sócio Retirante): responde subsidiariamente por até 2 anos após averbação (art. 10-A CLT).
2.3 IRR Tema 17 (Honorários): pós-reforma 5-15%; pré-reforma apenas com assistência sindical (Súmula 219).

3. IRDRs DOS TRTs: vinculam regionalmente. Ex: base de cálculo de adicional noturno, cumulação de adicionais.

4. ART. 927 CPC/2015: precedentes obrigatórios na JT (IN 39/2016). Distinção (distinguishing) e superação (overruling) possíveis com fundamentação.` },

  { title: 'SUPP: FAQ Prático – Precedentes Vinculantes', content: `PERGUNTAS FREQUENTES - PRECEDENTES VINCULANTES TRABALHISTAS

P: Terceirização de atividade-fim é legal?
R: Sim. ADPF 324 e RE 958.252 STF. Mantida responsabilidade subsidiária.

P: Negociado pode prevalecer sobre a lei?
R: Sim, dentro de limites. Tema 1.046 STF: ACT/CCT podem limitar direitos, desde que respeitem direitos absolutamente indisponíveis.

P: Qual o índice de correção monetária trabalhista?
R: IPCA-E pré-judicial, SELIC judicial (ADCs 58/59 STF). SELIC engloba juros+correção.

P: Beneficiário de justiça gratuita paga honorários?
R: Não (na prática). ADI 5.766 STF declarou inconstitucional a compensação automática.

P: Prescrição do FGTS é de quantos anos?
R: 5 anos. Tema 608 STF (ARE 709.212). Modulação desde 13/11/2014.

P: Adm. Pública responde por terceirizados?
R: Subsidiariamente, se comprovada culpa na fiscalização. ADC 16 STF.` },
];

SUPPS['Agente JurisPrud'] = [
  { title: 'SUPP: Guia Operacional – Pesquisa Jurisprudencial Trabalhista', content: `GUIA OPERACIONAL - PESQUISA JURISPRUDENCIAL TRABALHISTA

1. PORTAIS – TST
1.1 Pesquisa Unificada: https://jurisprudencia.tst.jus.br — palavras-chave, nº processo, relator, turma, período. Operadores: aspas, AND/OR/NOT.
1.2 Consulta Processual: https://consultaprocessual.tst.jus.br — busca por nº CNJ.
1.3 JusLaboris: https://juslaboris.tst.jus.br — legislação, doutrina, jurisprudência, atos.

2. PORTAIS – TRTs
TRT-1 (RJ): https://www.trt1.jus.br/jurisprudencia
TRT-2 (SP): https://www.trt2.jus.br/pesquisa-jurisprudencia-702
TRT-3 (MG): https://www.trt3.jus.br/jurisprudencia
TRT-4 (RS): https://www.trt4.jus.br/portais/trt4/jurisprudencia
TRT-5 (BA): https://www.trt5.jus.br/jurisprudencia
TRT-6 (PE): https://www.trt6.jus.br/pesquisa-jurisprudencial
TRT-7 (CE): https://www.trt7.jus.br/jurisprudencia
TRT-8 (PA/AP): https://www.trt8.jus.br/jurisprudencia
TRT-9 (PR): https://www.trt9.jus.br/jurisprudencia
TRT-10 (DF/TO): https://www.trt10.jus.br/jurisprudencia
TRT-11 (AM/RR): https://www.trt11.jus.br/jurisprudencia
TRT-12 (SC): https://www.trt12.jus.br/jurisprudencia
TRT-13 (PB): https://www.trt13.jus.br/jurisprudencia
TRT-14 (RO/AC): https://www.trt14.jus.br/jurisprudencia
TRT-15 (Campinas): https://www.trt15.jus.br/jurisprudencia
TRT-16 (MA): https://www.trt16.jus.br/jurisprudencia
TRT-17 (ES): https://www.trt17.jus.br/jurisprudencia
TRT-18 (GO): https://www.trt18.jus.br/jurisprudencia
TRT-19 (AL): https://www.trt19.jus.br/jurisprudencia
TRT-20 (SE): https://www.trt20.jus.br/jurisprudencia
TRT-21 (RN): https://www.trt21.jus.br/jurisprudencia
TRT-22 (PI): https://www.trt22.jus.br/jurisprudencia
TRT-23 (MT): https://www.trt23.jus.br/jurisprudencia
TRT-24 (MS): https://www.trt24.jus.br/jurisprudencia

3. STF: https://portal.stf.jus.br/jurisprudencia/ e https://portal.stf.jus.br/jurisprudencia/repercussaoGeral/

4. ESTRATÉGIAS
4.1 Palavras-chave: "justa causa" AND "desídia" AND "art. 482". Aspas=exata.
4.2 Por legislação: "art. 461 CLT", "Lei 13.467/2017".
4.3 Por súmula: "Súmula 331", "OJ 383 SDI-1".
4.4 Refinamento: filtrar por data, turma/SDI, relator. Comparar TRTs.

5. LEITURA DE ACÓRDÃO: ementa (resumo), relatório (histórico), fundamentação (razões), dispositivo (decisão), voto vencido (divergência).` },

  { title: 'SUPP: FAQ Prático – Pesquisa Jurisprudencial', content: `PERGUNTAS FREQUENTES - PESQUISA JURISPRUDENCIAL

P: Como pesquisar jurisprudência do TST?
R: https://jurisprudencia.tst.jus.br — palavras-chave entre aspas, filtros por turma/relator/período.

P: Posso pesquisar por número do processo?
R: Sim. Consulta processual: https://consultaprocessual.tst.jus.br com nº CNJ. Para TRTs: PJe de cada regional.

P: Como encontrar jurisprudência de um TRT específico?
R: Cada TRT tem portal próprio. Ex: TRT-2 (SP): https://www.trt2.jus.br/pesquisa-jurisprudencia-702.

P: O que é o JusLaboris?
R: Repositório digital do TST: legislação, doutrina, jurisprudência, atos. https://juslaboris.tst.jus.br.

P: Como pesquisar repercussão geral do STF em matéria trabalhista?
R: https://portal.stf.jus.br/jurisprudencia/repercussaoGeral/ — buscar por tema ou nº RE. Temas relevantes: 1.046, 608, 725.

P: Diferença entre acórdão e decisão monocrática?
R: Acórdão é colegiado (turma/SDI). Monocrática é de um ministro/desembargador. Acórdãos têm maior peso jurisprudencial.` },
];

// ── BUILD THE FILE ──

const outFile = path.join(__dirname, '_upgrade_trabalhista.cjs');
const headerLines = fs.readFileSync(outFile, 'utf8').split('\n').slice(0, 108);
const header = headerLines.join('\n');

let out = header + '\n\n';
out += '// ──────────────────────────────────────────────────────────\n';
out += '//  INSTRUCTIONS COMPLETAS POR AGENTE\n';
out += '// ──────────────────────────────────────────────────────────\n\n';
out += 'const INSTRUCTIONS = {\n';
for (const [title, instr] of Object.entries(INSTR)) {
  out += `\n${JSON.stringify(title)}: ${JSON.stringify(instr)},\n`;
}
out += '\n};\n\n';

out += '// ──────────────────────────────────────────────────────────\n';
out += '//  CONTEÚDO SUPLEMENTAR POR AGENTE\n';
out += '// ──────────────────────────────────────────────────────────\n\n';
out += 'const SUPPLEMENT_BY_AGENT = [\n';
for (const [agentTitle, docs] of Object.entries(SUPPS)) {
  out += `  { agentTitle: ${JSON.stringify(agentTitle)}, docs: [\n`;
  for (const doc of docs) {
    out += `    { title: ${JSON.stringify(doc.title)}, content: ${JSON.stringify(doc.content)} },\n`;
  }
  out += '  ]},\n';
}
out += '];\n\n';

out += `// ──────────────────────────────────────────────────────────
//  EXECUÇÃO PRINCIPAL
// ──────────────────────────────────────────────────────────

async function main() {
  console.log('\\n══════════════════════════════════════════════════');
  console.log(' UPGRADE TRABALHISTA – Instructions + Supplements');
  console.log('══════════════════════════════════════════════════\\n');

  // FASE 1: Atualizar instructions
  console.log('─── FASE 1: Atualizando INSTRUCTIONS ───\\n');
  for (const [title, newInstr] of Object.entries(INSTRUCTIONS)) {
    const r = await pool.query(
      \`UPDATE agents SET instructions = $1 WHERE user_id IS NULL AND title = $2 RETURNING id, title\`,
      [newInstr, title]
    );
    if (r.rows.length) {
      console.log(\`  ✓ \${title}: instructions atualizado (\${newInstr.length} chars)\`);
    } else {
      console.log(\`  ✗ \${title}: agente não encontrado!\`);
    }
  }

  // FASE 2: Injetar supplements
  console.log('\\n─── FASE 2: Injetando SUPPLEMENTS ───\\n');
  let totalChunksInserted = 0;

  for (const { agentTitle, docs } of SUPPLEMENT_BY_AGENT) {
    const agRow = await pool.query(
      \`SELECT id FROM agents WHERE user_id IS NULL AND title = $1\`,
      [agentTitle]
    );
    if (!agRow.rows.length) {
      console.log(\`  ✗ \${agentTitle}: agente não encontrado, pulando.\`);
      continue;
    }
    const agentId = agRow.rows[0].id;

    for (const doc of docs) {
      // Limpar supplement antigo (idempotente)
      const delChunks = await pool.query(
        \`DELETE FROM document_chunks WHERE document_id IN (SELECT id FROM documents WHERE agent_id = $1 AND title = $2)\`,
        [agentId, doc.title]
      );
      const delDoc = await pool.query(
        \`DELETE FROM documents WHERE agent_id = $1 AND title = $2 RETURNING id\`,
        [agentId, doc.title]
      );
      if (delDoc.rows.length) {
        console.log(\`  🗑  \${agentTitle} → "\${doc.title}" removido (re-injeção)\`);
      }

      // Criar document
      const docId = crypto.randomUUID();
      await pool.query(
        \`INSERT INTO documents (id, agent_id, title, created_at)
         VALUES ($1, $2, $3, NOW())\`,
        [docId, agentId, doc.title]
      );

      const chunks = chunkText(doc.content);
      console.log(\`  📝 \${agentTitle} → "\${doc.title}": \${chunks.length} chunks\`);

      const embeddings = await embedBatch(chunks);
      let inserted = 0;

      for (let i = 0; i < chunks.length; i++) {
        if (!embeddings[i]) continue;
        await pool.query(
          \`INSERT INTO document_chunks (id, document_id, agent_id, content, chunk_index, embedding, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())\`,
          [crypto.randomUUID(), docId, agentId, chunks[i], i, JSON.stringify(embeddings[i])]
        );
        inserted++;
      }

      totalChunksInserted += inserted;
      console.log(\`     → \${inserted} chunks inseridos com embedding\\n\`);
      await sleep(EMBED_DELAY_MS);
    }
  }

  // Relatório final
  console.log('\\n─── RELATÓRIO FINAL ───\\n');
  const final = await pool.query(\`
    SELECT a.title,
      length(a.instructions) AS instr_len,
      (SELECT count(*)::int FROM document_chunks dc WHERE dc.agent_id = a.id) AS chunks
    FROM agents a
    WHERE a.user_id IS NULL AND a.title IN (
      'Agente DirTrab','Agente AtosTr','Agente NR.sPro',
      'Agente SúmulasCore','Agente PrecedentX','Agente JurisPrud'
    )
    ORDER BY a.title
  \`);
  console.table(final.rows);
  console.log(\`\\nTotal de novos chunks inseridos: \${totalChunksInserted}\`);
  console.log('Concluído!\\n');

  await pool.end();
}

main().catch(async (e) => { console.error(e); await pool.end(); process.exit(1); });
`;

fs.writeFileSync(outFile, out, 'utf8');
console.log(`✓ _upgrade_trabalhista.cjs regenerated (${out.length} chars, ${out.split('\n').length} lines)`);

// Clean up temp files
try { fs.unlinkSync(path.join(__dirname, '_upgrade_trabalhista_new.cjs')); } catch {}
try { fs.unlinkSync(path.join(__dirname, '_upgrade_trabalhista.cjs.bak')); } catch {}
try { fs.unlinkSync(path.join(__dirname, '_gen_trab_part1.cjs')); } catch {}
try { fs.unlinkSync(path.join(__dirname, '_gen_trab_part2.cjs')); } catch {}
