// Part 2: Supplement content for all 6 agents
const fs = require('fs');
const path = require('path');
const outFile = path.join(__dirname, '_upgrade_trabalhista_new.cjs');

const body = String.raw`
// ──────────────────────────────────────────────────────────
//  CONTEÚDO SUPLEMENTAR POR AGENTE
// ──────────────────────────────────────────────────────────

const BASE_DIRTRAB = ` + '`' + String.raw`
GUIA OPERACIONAL - DIREITO DO TRABALHO (CLT, CF E REFORMA TRABALHISTA)

1. CONTRATO INDIVIDUAL DE TRABALHO

1.1 Conceito e Requisitos (arts. 2º e 3º CLT)
Relação de emprego exige: pessoalidade, onerosidade, não eventualidade, subordinação e pessoa física.
- Empregador (art. 2º): empresa individual ou coletiva que assume riscos da atividade econômica.
- Empregado (art. 3º): pessoa física que presta serviço de natureza não eventual, sob dependência e mediante salário.

1.2 Tipos de Contrato
- Prazo indeterminado: regra geral.
- Prazo determinado (art. 443 CLT): duração máxima 2 anos; experiência até 90 dias.
- Contrato intermitente (art. 443, §3º CLT): alternância de períodos, convocação com 3 dias de antecedência.
- Contrato temporário (Lei 6.019/74): até 180 dias + 90 dias de prorrogação.
- Teletrabalho (arts. 75-A a 75-F CLT): prestação fora das dependências do empregador.

1.3 Alteração Contratual (art. 468 CLT)
- Somente por mútuo consentimento e sem prejuízo ao empregado.
- Transferência de local (art. 469 CLT): adicional de 25% se provisória.

2. JORNADA DE TRABALHO

2.1 Duração Normal: 8h/dia e 44h/semana (CF art. 7º, XIII e CLT art. 58).
2.2 Horas Extras (art. 59 CLT): máximo 2h/dia, adicional mínimo de 50%.
2.3 Banco de Horas: acordo individual escrito = 6 meses; ACT/CCT = 1 ano; mesmo mês = tácito.
2.4 Intervalos: intrajornada mínimo 1h (>6h); interjornada mínimo 11h; DSR 24h.
2.5 Trabalho Noturno (art. 73 CLT): urbano 22h-5h, hora=52min30s, adicional 20%.

3. REMUNERAÇÃO E SALÁRIO

3.1 Composição (art. 457 CLT): salário + gorjetas = remuneração.
3.2 Parcelas NÃO salariais após reforma (§2º): ajuda de custo, auxílio-alimentação, diárias, prêmios.
3.3 Salário Mínimo 2025: R$ 1.518,00.
3.4 Equiparação salarial (art. 461 CLT): mesma função, mesmo empregador, mesmo estabelecimento, diferença ≤4 anos na função e ≤2 anos na empresa.
3.5 13º Salário (Lei 4.090/62): 1ª parcela até 30/11, 2ª parcela até 20/12.

4. FÉRIAS (ARTS. 129-153 CLT)

4.1 Período aquisitivo: 12 meses → concessivo: 12 meses seguintes.
4.2 Duração: 30 dias corridos (até 5 faltas injustificadas).
4.3 Fracionamento pós-reforma: até 3 períodos, mínimo 5 dias cada, ao menos 1 de ≥14 dias.
4.4 Terço constitucional: 1/3 sobre remuneração de férias.
4.5 Abono pecuniário: conversão de 1/3 em dinheiro.

5. RESCISÃO CONTRATUAL

5.1 Sem justa causa: saldo salário + aviso prévio + 13º prop. + férias prop.+1/3 + férias vencidas+1/3 + FGTS + multa 40% + seguro-desemprego.
5.2 Pedido de demissão: saldo salário + 13º prop. + férias prop.+1/3. Sem multa FGTS, sem seguro-desemprego.
5.3 Justa causa (art. 482): saldo salário + férias vencidas+1/3 apenas.
5.4 Acordo mútuo (art. 484-A): aviso 50%, multa FGTS 20%, saque 80% FGTS. Sem seguro-desemprego.
5.5 Rescisão indireta (art. 483): mesmos direitos da sem justa causa.

5.6 Hipóteses de Justa Causa (art. 482): improbidade, incontinência, negociação habitual, condenação criminal, desídia, embriaguez, violação de segredo, indisciplina, abandono, ato lesivo da honra, jogos de azar, perda de habilitação.

5.7 Aviso Prévio (Lei 12.506/11): mínimo 30 dias + 3 dias por ano trabalhado, até 90 dias.

6. FGTS (LEI 8.036/1990)
- Depósito: 8% da remuneração mensal (2% menor aprendiz).
- Multa rescisória: 40% (20% no acordo mútuo).
- Saque: demissão sem justa causa, acordo mútuo (80%), aposentadoria, doença grave, moradia, calamidade.

7. ESTABILIDADES E GARANTIAS PROVISÓRIAS
- Gestante: confirmação da gravidez até 5 meses após parto (ADCT art. 10, II, b).
- Cipeiro: registro candidatura até 1 ano após mandato (ADCT art. 10, II, a).
- Acidentado: 12 meses após cessação do auxílio-doença acidentário (art. 118 Lei 8.213).
- Dirigente sindical: registro candidatura até 1 ano após mandato (CF art. 8º, VIII).

8. DIREITO COLETIVO
- CCT: sindicato × sindicato. ACT: sindicato × empresa.
- Negociado sobre legislado (art. 611-A): banco de horas, intervalo, jornada 12×36, teletrabalho.
- Direitos inegociáveis (art. 611-B): salário mínimo, FGTS, 13º, férias, SST.
- Contribuição sindical: facultativa pós-reforma (ADI 5.794 STF).

9. PRESCRIÇÃO TRABALHISTA (CF ART. 7º, XXIX)
- 5 anos durante vigência do contrato. 2 anos após extinção.
- FGTS: prescrição quinquenal (STF Tema 608).

10. PROCESSO DO TRABALHO
- Rito ordinário (>40 SM), sumaríssimo (≤40 SM), inquérito para estável.
- Honorários sucumbenciais (art. 791-A): 5% a 15%.
- Execução: arts. 876-892 CLT.
` + '`.trim();\n';

fs.appendFileSync(outFile, body, 'utf8');
console.log('BASE_DIRTRAB appended');
