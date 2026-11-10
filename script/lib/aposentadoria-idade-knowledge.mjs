// Base curada e conferida da aposentadoria por idade (RGPS) apos a EC 103/2019.
//
// Por que existe: o acervo dos agentes previdenciarios devolvia trechos
// laterais (PCD, rural, hibrida, ex-combatente) e o modelo, preso ao RAG,
// respondia sem a regra geral ou dizia que "o documento nao especifica" a
// idade e o tempo de contribuicao. Este bloco entra como [Fonte 1] sempre que
// a pergunta for sobre aposentadoria por idade em agente previdenciario.
//
// Cada numero foi conferido no texto oficial (planalto.gov.br) em 09/11/2026:
// - EC 103/2019, art. 18 (transicao), art. 19 (regra permanente provisoria) e art. 26 (calculo);
// - CF, art. 201, § 7º, II (rural, mantido pela EC 103);
// - Lei 8.213/1991, art. 25, II (carencia) e art. 48, §§ 1º a 4º (rural e hibrida);
// - LC 142/2013, art. 3º, IV e art. 8º (pessoa com deficiencia).
// Ao alterar qualquer numero aqui, confira de novo na fonte oficial.

export const APOSENTADORIA_IDADE_SOURCE_TITLE = 'Base conferida - Aposentadoria por idade no RGPS apos a EC 103/2019 (EC 103/2019, Lei 8.213/1991, LC 142/2013)';

export const APOSENTADORIA_IDADE_SOURCE_TEXT = `APOSENTADORIA POR IDADE NO RGPS (INSS) - REGRAS VIGENTES APOS A EMENDA CONSTITUCIONAL Nº 103/2019 (em vigor desde 13/11/2019).

1. REGRA GERAL URBANA PARA QUEM ENTROU NO RGPS DEPOIS DE 13/11/2019 (EC 103/2019, art. 19, caput):
- Homem: 65 anos de idade e 20 anos de tempo de contribuicao.
- Mulher: 62 anos de idade e 15 anos de tempo de contribuicao.
- Carencia: 180 contribuicoes mensais (Lei nº 8.213/1991, art. 25, II).

2. REGRA DE TRANSICAO PARA QUEM JA ERA FILIADO AO RGPS ATE 13/11/2019 (EC 103/2019, art. 18):
- Homem: 65 anos de idade e 15 anos de tempo de contribuicao.
- Mulher: 60 anos de idade em 2019, com acrescimo de 6 meses por ano a partir de 1º/01/2020 (art. 18, § 1º): 60 anos e 6 meses em 2020; 61 anos em 2021; 61 anos e 6 meses em 2022; 62 anos a partir de 2023. Tempo de contribuicao: 15 anos.
- Carencia: 180 contribuicoes mensais (Lei nº 8.213/1991, art. 25, II).
- Resumo pratico hoje (a partir de 2023): homem filiado antes da reforma = 65 anos + 15 anos de contribuicao; homem filiado depois da reforma = 65 anos + 20 anos de contribuicao; mulher (filiada antes ou depois) = 62 anos + 15 anos de contribuicao.

3. CALCULO DO VALOR (EC 103/2019, art. 26):
- Salario de beneficio: media aritmetica simples de 100% dos salarios de contribuicao desde julho de 1994 (ou desde o inicio das contribuicoes, se posterior), atualizados monetariamente.
- Valor da aposentadoria: 60% dessa media, mais 2 pontos percentuais por ano de contribuicao que exceder 20 anos, para o homem (art. 26, § 2º).
- Para a mulher, os 2 pontos percentuais por ano contam a partir do que exceder 15 anos de contribuicao (art. 26, § 5º).
- Exemplos: homem com 20 anos de contribuicao = 60% da media; homem com 25 anos = 70%; homem com 15 anos (transicao) = 60%. Mulher com 15 anos = 60%; mulher com 25 anos = 80%.
- O valor nao pode ser inferior ao salario minimo.

4. TRABALHADOR RURAL E SEGURADO ESPECIAL (Constituicao Federal, art. 201, § 7º, II, mantido pela EC 103/2019; Lei nº 8.213/1991, art. 48, § 1º e § 2º):
- Homem: 60 anos de idade. Mulher: 55 anos de idade.
- Deve comprovar atividade rural, ainda que descontinua, no periodo imediatamente anterior ao requerimento, por tempo igual a carencia: 180 meses (15 anos) (Lei nº 8.213/1991, art. 48, § 2º).

5. APOSENTADORIA HIBRIDA (rural + urbano) (Lei nº 8.213/1991, art. 48, § 3º e § 4º):
- Soma periodos rurais e urbanos para completar 180 meses de carencia, mas sem a reducao de idade do rural.
- Apos a EC 103/2019 aplicam-se as idades da regra urbana: homem 65 anos; mulher 62 anos (com a mesma transicao do item 2 para a mulher filiada antes de 13/11/2019).

6. PESSOA COM DEFICIENCIA (Lei Complementar nº 142/2013, art. 3º, IV e art. 8º, II):
- Homem: 60 anos de idade. Mulher: 55 anos de idade. Em ambos os casos, 15 anos de contribuicao com deficiencia comprovada no mesmo periodo, independentemente do grau.
- Valor: 70% do salario de beneficio + 1% por grupo de 12 contribuicoes, ate 100%.
- Esta e uma modalidade especifica; nao substitui a regra geral dos itens 1 e 2.

7. DIREITO ADQUIRIDO:
- Quem completou todos os requisitos ate 13/11/2019 (homem 65 anos, mulher 60 anos, 180 contribuicoes) pode se aposentar pelas regras anteriores a EC 103/2019, a qualquer tempo (Lei nº 8.213/1991, art. 48, caput).

8. COMO APLICAR A UM CASO CONCRETO:
- Idade sozinha nao basta: alem da idade minima, e preciso cumprir a carencia de 180 contribuicoes e o tempo de contribuicao do item 1 ou 2.
- Exemplo: homem urbano com 66 anos ja cumpre a idade (65). Se era filiado ao RGPS ate 13/11/2019, precisa de 15 anos de contribuicao (180 contribuicoes); se entrou depois de 13/11/2019, precisa de 20 anos. Se tiver menos que isso, precisa continuar contribuindo ate completar. Com 15 anos, recebe 60% da media; cada ano acima de 20 anos soma 2 pontos percentuais.
- Exemplo: mulher urbana com 62 anos ja cumpre a idade; precisa de 15 anos de contribuicao (180 contribuicoes), recebendo 60% da media mais 2 pontos percentuais por ano acima de 15 anos.`;

export const APOSENTADORIA_IDADE_ANSWER_GUIDANCE = `ORIENTACAO PARA PERGUNTAS SOBRE APOSENTADORIA POR IDADE:
- A fonte "Base conferida - Aposentadoria por idade" traz as regras vigentes do INSS apos a EC 103/2019. Use-a como base principal e cite-a.
- Comece SEMPRE pela regra geral urbana: idade minima (homem 65, mulher 62), tempo de contribuicao (homem 15 anos se filiado ate 13/11/2019 ou 20 anos se filiado depois; mulher 15 anos) e carencia de 180 contribuicoes. Depois, se a pergunta pedir "regras" de forma ampla, inclua a transicao da mulher, o calculo (60% + 2 pontos por ano acima de 20 anos para homem e 15 anos para mulher), o rural (60 homem, 55 mulher) e mencione a hibrida e a da pessoa com deficiencia como modalidades separadas.
- Nao responda so com regras de pessoa com deficiencia, rural, hibrida ou de tempo de contribuicao quando a pergunta for sobre aposentadoria por idade em geral.
- Se o usuario informar idade, sexo ou situacao do cliente, aplique as regras ao caso: diga se a idade ja foi atingida e quanto tempo de contribuicao falta ou e exigido, separando quem ja contribuia antes de 13/11/2019 de quem entrou depois. Se faltar um dado (sexo, data de filiacao, urbano ou rural), responda para cada hipotese em vez de dizer que o documento nao especifica.`;

function normalize(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const PREVIDENCIARIO_AGENT_PATTERN = /\b(previd\w*|inss|rgps|aposentad\w*|beneficio\w*|segurad\w*)\b/;
const TOPIC_DIRECT_PATTERN = /\baposentad\w*\s+(?:\w+\s+){0,2}(?:por\s+)?idade\b|\bidade\s+(?:minima\s+)?(?:para|pra)\s+(?:se\s+)?aposentar\b|\baposentadoria\s+(?:programada|hibrida|rural)\b/;
const AGE_PATTERN = /\b\d{2}\s*anos(?:\s+de\s+idade)?\b|\bidade\b/;
const OTHER_BENEFIT_PATTERN = /\b(especial|invalidez|incapacidade|pensao|bpc|loas|auxilio\w*|reclusao|maternidade|professor\w*|deficiencia|pcd)\b/;
const RETIREMENT_PATTERN =/\baposent\w*|\btempo\s+de\s+contribui\w*|\bcarencia\b|\bcontribuir\b|\bcontribui\w*\b/;

export function isAposentadoriaIdadeAgent(agentData = null) {
  const name = normalize(agentData?.name || agentData?.title || '');
  return /aposentadoria\s+por\s+idade/.test(name);
}

function isPrevidenciarioAgent(agentData = null) {
  const haystack = normalize([
    agentData?.name,
    agentData?.title,
    agentData?.description,
    String(agentData?.instructions || '').slice(0, 4000),
  ].filter(Boolean).join(' '));
  return PREVIDENCIARIO_AGENT_PATTERN.test(haystack);
}

// Decide se a pergunta (ou a conversa recente) e sobre aposentadoria por idade.
export function isAposentadoriaIdadeQuestion(question = '', { agentData = null, conversationContext = '' } = {}) {
  const text = normalize(question);
  if (!text.trim()) return false;
  if (agentData && !isPrevidenciarioAgent(agentData)) return false;

  if (TOPIC_DIRECT_PATTERN.test(text)) return true;

  const dedicatedAgent = isAposentadoriaIdadeAgent(agentData);
  // No agente dedicado, toda pergunta e sobre o tema ("Cliente 66 anos",
  // "e se for mulher?"): a base conferida sempre ajuda e nunca atrapalha.
  if (dedicatedAgent) return true;
  // Pergunta sobre outro beneficio (especial, pensao, incapacidade...) ou agente
  // dedicado a outro beneficio: so entra se a pergunta citar "por idade".
  const agentName = normalize(agentData?.name || agentData?.title || '');
  if (OTHER_BENEFIT_PATTERN.test(text) || OTHER_BENEFIT_PATTERN.test(agentName)) return false;
  const recent = normalize(conversationContext).slice(-3000);
  const conversationOnTopic = TOPIC_DIRECT_PATTERN.test(recent);

  // "Meu cliente tem 66 anos, quanto tempo de contribuicao precisa?"
  if (AGE_PATTERN.test(text) && RETIREMENT_PATTERN.test(text)) {
    return dedicatedAgent || conversationOnTopic || /\baposent\w*/.test(text);
  }

  // No agente dedicado, qualquer pergunta sobre regras/requisitos/calculo do beneficio.
  if (dedicatedAgent && /\b(regra\w*|requisito\w*|calculo|valor|carencia|aposent\w*|contribui\w*|transicao|rural|hibrida)\b/.test(text)) {
    return true;
  }

  // Continuacao curta de uma conversa que ja era sobre o tema.
  return conversationOnTopic && text.length <= 220 && RETIREMENT_PATTERN.test(text);
}

function renumberSources(context = '', offset = 1) {
  return String(context || '')
    .replace(/(^|\n\n---\n\n)\[Fonte\s+(\d+)\s*\|/g, (_match, prefix, number) => `${prefix}[Fonte ${Number(number) + offset} |`);
}

// Coloca a base conferida como [Fonte 1] e renumera as fontes recuperadas.
// Mantem o anexo do usuario (sem cabecalho de fonte) antes de tudo.
export function withAposentadoriaIdadeSource(context = '') {
  const raw = String(context || '');
  if (raw.includes(APOSENTADORIA_IDADE_SOURCE_TITLE)) return raw;
  const curated = `[Fonte 1 | ${APOSENTADORIA_IDADE_SOURCE_TITLE} | trecho 0]\n${APOSENTADORIA_IDADE_SOURCE_TEXT}`;
  const sections = raw ? raw.split('\n\n---\n\n') : [];
  const leading = [];
  while (sections.length > 0 && !/^\[Fonte\s+\d+\s*\|/.test(sections[0])) {
    leading.push(sections.shift());
  }
  const rest = renumberSources(sections.join('\n\n---\n\n'), 1);
  return [...leading, curated, rest].filter((part) => String(part || '').trim()).join('\n\n---\n\n');
}

export function withAposentadoriaIdadeGuidance(agentInstructions = '') {
  const base = String(agentInstructions || '');
  if (base.includes('ORIENTACAO PARA PERGUNTAS SOBRE APOSENTADORIA POR IDADE')) return base;
  return [base, APOSENTADORIA_IDADE_ANSWER_GUIDANCE].filter((part) => part.trim()).join('\n\n');
}
