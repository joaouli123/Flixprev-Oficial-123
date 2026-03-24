/**
 * _inject_cnis_indicadores.cjs
 * 
 * Injeta conteúdo REAL sobre indicadores do CNIS no agente CNIS.
 * Substitui os documentos placeholder (portaria990, /anexos, portaria993)
 * que falharam no scraping por conteúdo completo e rico.
 * 
 * Usage: node script/_inject_cnis_indicadores.cjs
 */
const crypto = require('crypto');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const EMBED_DELAY_MS = 3000;
const EMBED_BATCH_SIZE = 25;
const MAX_RETRIES = 7;
const CHUNK_SIZE = 4000;
const CHUNK_OVERLAP = 1000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// =========================================================================
//  CONTEÚDO 1: Portaria 990 — Definições dos Indicadores do CNIS
// =========================================================================
const PORTARIA_990_INDICADORES = `
PORTARIA DIRBEN/INSS Nº 990, DE 28 DE MARÇO DE 2022
Aprova as Normas Procedimentais em Matéria de Benefícios — LIVRO I — DA ADMINISTRAÇÃO DAS INFORMAÇÕES DOS SEGURADOS DO REGIME GERAL DE PREVIDÊNCIA SOCIAL – RGPS

TÍTULO I — DOS SEGURADOS, DA FILIAÇÃO E INSCRIÇÃO, DA VALIDADE, COMPROVAÇÃO E ACERTO DE DADOS DO CNIS

CAPÍTULO II — DO CNIS

Seção I — Do Cadastro Nacional de Informações Sociais – CNIS

Art. 7º O Cadastro Nacional de Informações Sociais – CNIS corresponde a um conjunto de banco de informações que, desde a sua criação legal, vem sendo alimentado por diversas bases de dados de órgãos e entidades da Administração Pública federal e, por isso, as informações, em especial as que tratam de fatos geradores trabalhistas e previdenciários, são provenientes dessas bases.
Parágrafo único. Cabe aos órgãos e entidades da Administração Pública federal assegurar que as informações constantes de suas bases de dados estejam corretas e atualizadas, conforme previsto pelo § 4º do art. 3º do Decreto nº 10.047, de 9 de outubro de 2019.

Art. 8º A camada Extrato CNIS é o processo responsável por consolidar e disponibilizar as informações laborais e previdenciárias do trabalhador, já constantes do CNIS, de forma parametrizável, mediante aplicação de regras de prevalência e organização.
§ 1º O resultado do tratamento realizado pela camada Extrato CNIS gera indicadores para identificação das informações constantes do CNIS, em relação às quais poderá ser necessária a adoção de procedimentos para a sua comprovação ou validação.
§ 2º Existem 3 (três) tipos de indicadores no Portal CNIS:
I – Indicador de Pendência (CsPendencia): identifica a informação que possui alguma pendência, sendo necessária a atualização dessa informação no Portal CNIS para que ocorra a sua liberação e utilização pelos sistemas de benefícios. Geralmente informado com "P" na primeira letra da sigla do indicador;
II – Indicador de Alerta (CsIndicador): identifica a informação com a aplicação de um alerta, podendo ou não ser demandada uma ação pelo INSS, a exemplo do indicador Exposição Agentes Nocivos – IEAN que, aplicado a um período de vínculo empregatício, norteia um possível enquadramento do período como especial, para fins de cômputo em benefício, de forma que o período será computado como comum caso não seja efetuado o seu enquadramento como especial. Geralmente é informado com "I" na primeira letra da sigla do indicador; e
III – Indicador de Acerto já efetuado (CsAcerto): apenas indica que um acerto foi efetuado anteriormente em determinado vínculo, remuneração, contribuição ou período de atividade, para que seja observada, quando necessária nova alteração, a existência do acerto anterior e as possíveis implicações que isso trará. Geralmente é informado com "A" na primeira letra da sigla do indicador.
§ 3º No CNIS são disponibilizadas as informações observando e aplicando o conceito de cada indicador.
§ 4º No caso de indicadores de pendências, o INSS exige na maioria dos casos, a validação do dado pelo segurado, mediante apresentação da documentação comprobatória contemporânea aos fatos a comprovar.
§ 5º As situações de inconsistências não necessariamente decorrem de erros ou ausência de informações da fonte de dados, algumas decorrem de disposições de atos normativos, como é o caso da aplicação do "indicador de extemporaneidade" no CNIS quando a empresa transmite a informação de um vínculo após o prazo legalmente estabelecido. Por ser uma obrigação acessória, o INSS aplica o indicador de extemporaneidade, o qual deverá ser tratado, em virtude do disposto no art. 29-A da Lei nº 8.213, de 1991 e do art. 19-B do Decreto nº 3.048, de 1999 (RPS).
§ 6º No que tange às inconsistências detectadas, os indicadores levam em consideração as diversas fontes de dados que alimentam o CNIS e não apenas uma determinada fonte.

Art. 8º-A O Anexo V apresenta a relação dos indicadores atualmente disponibilizados no CNIS.
§ 1º A coluna "TIPO" informa o tipo de indicador, ou seja, se de Acerto, Alerta ou Pendência.
§ 2º A coluna "GRUPO" visa facilitar a identificação da matéria correlata, ou seja, se o indicador está voltado a temas relacionados à segurado especial, contribuições, vínculos e remunerações, ajustes da Emenda Constitucional nº 103, de 2019, ou se relativo a dados/situação do NIT.
§ 3º Quanto à coluna "SIGLA", esta corresponde à sigla do indicador que é apresentado no CNIS.
§ 4º A coluna "DESCRIÇÃO" apresenta a descrição do indicador.
§ 5º A coluna "ESCLARECIMENTOS" traz esclarecimentos complementares acerca da aplicação do indicador e, quando for o caso, informações quanto à necessidade de tratamento para a validação do dado pelo segurado.
§ 6º Alguns indicadores de pendências apresentam a mesma sigla, porém descrições diferentes, razão pela qual deve ser observada a coluna "DESCRIÇÃO" para identificar o tipo de inconsistência detectada.

Art. 9º O Portal CNIS permite a consulta e o tratamento das informações relativas aos dados cadastrais, atividades, vínculos, remunerações, contribuições, entre outros, com a presença de indicadores que atendam às necessidades de controle quando da identificação de inconsistências que possam impactar no reconhecimento de direitos previdenciários.

Art. 10. As informações constantes no CNIS, caso estejam inconsistentes ou pendentes, antes de serem utilizadas pelos sistemas de benefícios do INSS, devem ser tratadas pelo servidor do Instituto, mediante comprovação dos dados pelo segurado.

Seção III — Das inconsistências nos dados de pessoa física do CNIS

Subseção II — Inconsistências do Número de Identificação do Trabalhador – NIT

Art. 17. As possíveis inconsistências no CNIS referentes ao cadastramento de Número de Identificação do Trabalhador – NIT, que demandam ação do INSS a partir da solicitação do interessado, mediante comprovação da titularidade desse número, são as seguintes:
I – NIT inexistente: quando não consta na base de dados do CNIS;
II – NIT indeterminado: quando não é possível determinar a sua titularidade pelo fato de não possuir nenhum dado cadastral ou não apresentar ao menos o nome do cidadão e/ou a data de nascimento;
III – NIT com dados cadastrais divergentes: quando os dados cadastrais são divergentes ou possui valor não aceito pelo sistema; e
IV – NIT pertencente à faixa crítica: atribuído indevidamente para mais de uma pessoa na ocasião do cadastramento e atribuição da inscrição.

Seção VI — Comprovação e Acerto de dados do CNIS

Art. 25. O filiado poderá solicitar, a qualquer momento, a inclusão, alteração, ratificação ou exclusão das informações divergentes, extemporâneas ou insuficientes, do CNIS, prestando as informações referentes à atualização desejada e apresentando documentos comprobatórios, conforme critérios estabelecidos nesta Portaria, observadas as formas de filiação, independentemente de requerimento de benefício.

Art. 29. Considera-se extemporânea a inserção de dados no CNIS:
I – para o empregado e empregado doméstico relativos à data de início do vínculo:
a) decorrente de GFIP apresentada após o último dia do 5º mês subsequente ao mês da data de admissão;
b) decorrente de outro documento que não seja a GFIP.
II – para o trabalhador avulso relativos à remuneração: decorrente de GFIP apresentada após o prazo.
`.trim();

// =========================================================================
//  CONTEÚDO 2: Anexo V — Relação Completa dos Indicadores do CNIS
// =========================================================================
const ANEXO_V_INDICADORES = `
ANEXO V DA PORTARIA DIRBEN/INSS Nº 990/2022 (incluído pela Portaria DIRBEN/INSS nº 1.121/2023)
RELAÇÃO DOS INDICADORES DISPONIBILIZADOS NO CNIS

Conforme Art. 8º-A da Portaria 990/2022, o Anexo V apresenta a relação dos indicadores do CNIS, organizados por TIPO (Pendência, Indicador/Alerta, Acerto), GRUPO e SIGLA com sua DESCRIÇÃO.

═══════════════════════════════════════════════════════════════════
INDICADORES DE PENDÊNCIA (CsPendencia) — Prefixo "P"
Identificam informação com pendência. Necessária atualização no Portal CNIS para liberação e utilização pelos sistemas de benefícios.
═══════════════════════════════════════════════════════════════════

--- GRUPO: VÍNCULOS E REMUNERAÇÕES ---

NDET — Pendência — Data de início de atividade foi estimada na migração. Esclarecimento: A data de início do vínculo foi estimada pelo sistema durante processo de migração, sendo necessária comprovação da data real.

PADM-EMPR — Pendência — Data de admissão incompatível com o período de atividade do empregador. Esclarecimento: A data de admissão do trabalhador é anterior ao início de atividade do empregador no cadastro CNPJ/CEI, o que indica possível erro na informação.

PCEI-EQP-INV — Pendência — Empregador com identificador inválido. Esclarecimento: O identificador do empregador (CEI) está inválido ou não é reconhecido no cadastro.

PDIV-DADOS-GFIP — Pendência — Vínculo ou remuneração pendente por divergência de dado cadastral do trabalhador em GFIP. Esclarecimento: Dados do trabalhador na GFIP divergem dos dados cadastrais no CNIS.

PEMP-CAD — Pendência — Faltam dados cadastrais do empregador (CNPJ ou CEI). Esclarecimento: O empregador não possui dados cadastrais completos, impossibilitando a validação do vínculo.

PEMP-IDINV — Pendência — Empregador com identificador inválido. Esclarecimento: O CNPJ ou CEI do empregador está irregular ou inválido.

PEXT — Pendência — Vínculo com informação extemporânea, passível de comprovação. Esclarecimento: O vínculo foi inserido no CNIS após o prazo legal. Conforme art. 29-A da Lei 8.213/91, é necessária comprovação documental para validação. A extemporaneidade ocorre quando a GFIP é apresentada após o último dia do 5º mês subsequente à data de admissão.

PREM-EMPR — Pendência — Remunerações incompatíveis com o período de atividade do empregador. Esclarecimento: Existem remunerações declaradas em período em que o empregador não estava ativo.

PREM-EXT / PREM_EXT — Pendência — Remuneração informada fora do prazo, passível de comprovação. Esclarecimento: Remuneração extemporânea que necessita de comprovação documental.

PREM-FVIN — Pendência — Remuneração após o fim do vínculo. Esclarecimento: Existem remunerações declaradas após a data de encerramento do contrato de trabalho.

PREM-IVIN — Pendência — Remuneração antes do início do vínculo. Esclarecimento: Existem remunerações declaradas antes da data de admissão.

PREM-VINV — Pendência — Remuneração antes do início do vínculo. Esclarecimento: Similar ao PREM-IVIN, indica remuneração anterior ao início do vínculo.

PREM-OBITO — Pendência — Remuneração após óbito. Esclarecimento: Existem remunerações declaradas após a data de óbito do segurado.

PREM-NASC — Pendência — Remuneração antes da data de nascimento do Filiado. Esclarecimento: Indica inconsistência grave, pois remuneração não pode ser anterior ao nascimento.

PREM-FORA-ATIV-INTERM — Pendência — Remuneração de trabalho intermitente fora do período de atividade de intermitente. Esclarecimento: Remuneração declarada para trabalho intermitente em período não coberto pelo contrato.

PREM-FORA-CONVOC — Pendência — Remuneração de trabalho intermitente não coberta por Convocatória. Esclarecimento: Trabalhador intermitente com remuneração em período sem convocação formal.

PREM-PER-QUARENTENA — Pendência — Remuneração informada após o desligamento referente ao período de Quarentena.

PREM-POS-QUARENTENA — Pendência — Remuneração informada após o período de Quarentena.

PREM-REINTEG-ANISTIA — Pendência — Pendência em Remuneração de período de Anistia Legal.

PREM-REINTEG-OUTROSTIPOS — Pendência — Pendência em Remuneração de período de Reintegração por iniciativa do empregador ou por outros motivos.

PREM-FORA-REINTEG-PROC-TRAB — Pendência — Remuneração fora do período da Reintegração oriunda de Processo Trabalhista.

PREM-VINC-PROC-TRAB — Pendência — Reconhecimento de Remuneração no Vínculo oriunda de Processo Trabalhista.

PREM-TSVE-PROC-TRAB — Pendência — Reconhecimento de Remuneração de Trabalhador sem Vínculo (TSVE) oriundo de Processo Trabalhista.

PREM-TSVE-PER-QUARENTENA — Pendência — Remuneração informada após o término do TSVE referente ao período de Quarentena.

PREM-TSVE-POS-QUARENTENA — Pendência — Remuneração informada para TSVE após o período de Quarentena.

PREM-BLOQ-EC103 — Pendência — Bloqueio de remuneração/contribuição para ajuste entre competências (EC 103/2019).

PREM-PER-DESLIG-APOSENT — Pendência — Remuneração após o desligamento por aposentadoria de servidor.

PREM-PER-DESLIG-JUD — Pendência — Remuneração após o desligamento reconhecido judicialmente.

PREM-POS-DESLIG-APOSENT — Pendência — Remuneração após o período entre o desligamento por aposentadoria e o último dia trabalhado.

PREM-POS-DESLIG-JUD — Pendência — Remuneração após o período entre o desligamento e o último dia trabalhado.

PRES-EMPR — Pendência — Data de rescisão incompatível com o período de atividade do empregador.

PRPPS — Pendência — Vínculo de empregado com informações de Regime Próprio (Servidor Público). Esclarecimento: Vínculo registrado como RGPS possui informações indicando RPPS. Não é possível atualização pelo INSS.

PRPSE — Pendência — Vínculo de empregado do Regime de Previdência no Exterior. Esclarecimento: Não é possível atualização pelo INSS, cabe ao empregador corrigir no eSocial.

PVIN-IRREG — Pendência — Vínculo em situação de irregularidade. Esclarecimento: O vínculo empregatício apresenta irregularidades que impedem sua validação automática.

PVIN-ME — Pendência — Vínculo de mandato eletivo, passível de comprovação.

PVIN-RE — Pendência — Causa de rescisão estimada por não ter sido informada pela fonte (RAIS/FGTS/GRE).

PVIN-CAGED — Pendência — Vínculo Oriundo da fonte CAGED.

PVIN-OBITO / PVIN-ADM-OBITO — Pendência — Data de admissão posterior ao óbito.

PVIN-DESLIG-OBITO — Pendência — Data do desligamento posterior à data do óbito.

PVIN-TRAB-INTERM — Pendência — Relacionada a Vínculo com informações de trabalho intermitente.

PVIN-MAND-ELETIVO-TOTAL — Pendência — Vínculo totalmente caracterizado como mandato eletivo.

PVIN-REC-PROC-TRAB — Pendência — Reconhecimento de Vínculo oriundo de Processo Trabalhista.

PVIN-ADMISSAO-PROC-TRAB — Pendência — Alteração da Data de Admissão oriunda de Processo Trabalhista.

PVIN-DESLIG-PROC-TRAB — Pendência — Inclusão ou Alteração da Data de Desligamento oriunda de Processo Trabalhista.

PVIN-ADMISSAO-DESLIG-PROC-TRAB — Pendência — Alteração da Data de Admissão e Inclusão da Data de Desligamento, oriundas de Processo Trabalhista.

PVIN-DESLIG-JUSTIÇA-TRAB — Pendência — Inclusão da Data de Desligamento feita pela Justiça do Trabalho por meio do Evento S-8299.

PVIN-UNIC-CONTR-PROC-TRAB — Pendência — Vínculo com Unicidade Contratual oriunda de Processo Trabalhista.

PVIN-UNIC-CONTR-TSVE-PROC-TRAB — Pendência — Vínculo com Unicidade Contratual do período de TSVE oriunda de Processo Trabalhista.

PVIN-RESP-INDIRETO-PROC-TRAB — Pendência — Reconhecimento de Vínculo informado por Responsável Indireto em Processo Trabalhista.

PVIN-AGRUP-INC — Pendência — Inconsistência em Vínculo agrupador quando não foi possível encontrar todos os vínculos relacionados.

PVIN-SUBSTIT-INC — Pendência — Inconsistência em Vínculo prevalente quando não foi possível encontrar todos os vínculos relacionados.

PSUC-DIVERG-DT-ADM — Pendência — Vínculo sucessor com divergências na data de admissão do vínculo sucedido.

PREM-TSVE-RESP-INDIRETO-PROC-TRAB — Pendência — Remuneração de TSVE informada por Responsável Indireto em Processo Trabalhista.

--- GRUPO: CONTRIBUIÇÕES ---

PREC-CDCONC / PREC-CDONC — Pendência — Recolhimento ou período de atividade de contribuinte em dobro concomitante com outro tipo de filiação.

PREC-COD1821 — Pendência — Recolhimento com código de pagamento 1821 – mandato eletivo. Esclarecimento: Necessário requerimento de opção pela filiação como facultativo.

PREC-COD1821_FORA_VIG — Pendência — Recolhimento com código 1821 fora da vigência.

PREC-CSE — Pendência — Recolhimento de segurado especial pendente de comprovação da atividade. Esclarecimento: O segurado contribuiu como segurado especial (trabalhador rural), mas a comprovação da condição está pendente.

PREC-FACULTCONC / PREC-FAUCULTCONC — Pendência — Recolhimento ou período de contribuinte facultativo concomitante com outros vínculos. Esclarecimento: Contribuição como facultativo durante período com outra filiação obrigatória.

PREC-FBR — Pendência — Recolhimento de segurado Facultativo de Baixa Renda não validado. Esclarecimento: Contribuição com 5% sobre o mínimo, mas sem validação do cadastro no CadÚnico.

PREC-FBR-ANT — Pendência — Recolhimento de segurado Facultativo de Baixa Renda anterior a 09/2011 (inválido). Esclarecimento: Esta modalidade só existe desde setembro/2011.

PREC-LC123-ANT — Pendência — Recolhimento no Plano Simplificado (LC 123/2006) anterior à competência 04/2007.

PREC-LC150-DOM — Pendência — Pagamento de doméstica em GPS em período de remuneração de fonte INSS/eSocial.

PREC-MENOR-MIN — Pendência — Recolhimento abaixo do valor mínimo. Esclarecimento: Contribuição com valor inferior ao salário mínimo × alíquota aplicável. Sem complementação, o período não conta para carência (EC 103/2019).

PREC-OBITO — Pendência — Competência do recolhimento posterior ao mês do óbito.

PREC-PMIG-DOM — Pendência — Recolhimento de empregado doméstico sem comprovação de vínculo.

PDT-NASC-FIL-INV — Pendência — Idade do filiado menor que a permitida pela legislação.

PDT-NASC-FIL-MENOR-INV — Pendência — Idade do filiado menor aprendiz menor que a permitida pela legislação.

FBR-AUT-BAT — Pendência — Recolhimento de Facultativo de Baixa Renda com atualização cadastral/elos no CNIS aguardando batimentos.

FBR-AUT-CONCBEN — Pendência — Recolhimento de Facultativo de Baixa Renda concomitante com benefício incompatível.

FBR-AUT-CONCQSA — Pendência — Recolhimento de Facultativo de Baixa Renda participante de quadro societário.

FBR-AUT-CONCSD — Pendência — Recolhimento de Facultativo de Baixa Renda concomitante com Seguro Desemprego.

FBR-AUT-DUPGRUPFAM — Pendência — Recolhimento de Facultativo de Baixa Renda com duplicidade de grupo familiar.

FBR-AUT-EXPCAD — Pendência — Recolhimento de Facultativo de Baixa Renda sem atualização bienal no CadÚnico.

FBR-AUT-FACULTCONC — Pendência — Recolhimento de Facultativo de Baixa Renda concomitante com filiação incompatível.

FBR-AUT-OBITO — Pendência — Recolhimento de Facultativo de Baixa Renda com óbito anterior à competência.

FBR-AUT-PENDCAD — Pendência — Recolhimento de Facultativo de Baixa Renda sem cadastro no CadÚnico.

FBR-AUT-PENDPROCES — Pendência — Recolhimento de Facultativo de Baixa Renda pendente de processamento no CadÚnico.

FBR-AUT-RENPES — Pendência — Recolhimento de Facultativo de Baixa Renda com renda pessoal informada no CadÚnico.

FBR-AUT-RENSUP — Pendência — Recolhimento de Facultativo de Baixa Renda com renda familiar superior a 2 salários mínimos.

--- GRUPO: GERAIS DO NIT OU DE DADOS CADASTRAIS ---

PNIT-0094 / PNIT-O094 — Pendência — NIT invalidado pertencente à faixa crítica do tipo Ofício INSS 094.

PNIT-CRIT — Pendência — NIT em faixa crítica. Esclarecimento: O NIT foi atribuído indevidamente para mais de uma pessoa (faixa crítica).

PNIT-IND — Pendência — NIT Indeterminado. Esclarecimento: Não é possível determinar a titularidade do NIT por falta de dados cadastrais.

PNIT-SC — Pendência — NIT não encontrado cadastrado/inexistente. Esclarecimento: O NIT não consta na base de dados do CNIS.

PNIT-SUP — Pendência — NIT com indício de superposição de dados. Esclarecimento: Há sobreposição de informações entre diferentes inscrições.

PCTC-NTR — Indicador — Certidão de Tempo de Contribuição pendente de análise do INSS.

--- GRUPO: SEGURADO ESPECIAL ---

PSE-NEG — Pendência — Período Segurado Especial Negativo. Esclarecimento: Período identificado com informações que descaracterizam a condição de segurado especial.

PSE-PEN — Pendência — Período Segurado Especial Pendente. Esclarecimento: Período de atividade rural aguardando ratificação/validação.

PSE-POS — Pendência — Período Segurado Especial Positivo. Esclarecimento: Período reconhecido como segurado especial, mas ainda pendente de confirmação final.

--- GRUPO: AJUSTES EC103 ---

PSC-MEN-SM-EC103 — Pendência — Competência possui salário de contribuição menor que o mínimo. Competência não tratada, passível de complementação, utilização ou agrupamento (EC 103/2019). Esclarecimento: A partir de novembro/2019 (EC 103), contribuições abaixo do salário mínimo não contam para carência. O segurado pode: (I) complementar até o mínimo, (II) utilizar excedente de outra competência, ou (III) agrupar com outras competências.

PDESFAZ-AJ-EC103 — Pendência — Desfazimento de agrupamento ou utilização.

PMOV-INCONSIST — Pendência — Registro inconsistente de movimentação entre competências (EC 103).

--- GRUPO: DARF - EVENTOS ---

PDARF-ALT-COMP-FORA-VIG — Pendência — Darf incluído por alteração de competência fora do período de vigência.

PDARF-ALT-CPF — Pendência — Darf desassociado do CPF originário pela RFB.

PDARF-EVENTO-INCONSISTENTE — Pendência — Evento inconsistente.

PDARF-INV-ALT-CODRECEITA — Pendência — Darf invalidado por alteração pela RFB para código de receita não tratado.

PDARF-RESTIT-PARCIAL — Pendência — Darf com Valor Restituído Parcial.

PDARF-RESTIT-TOTAL — Pendência — Darf com Valor Restituído Total.

═══════════════════════════════════════════════════════════════════
INDICADORES DE ALERTA (CsIndicador) — Prefixo "I"
Identificam informação com alerta. Pode ou não ser demandada ação pelo INSS.
═══════════════════════════════════════════════════════════════════

--- GRUPO: VÍNCULOS E REMUNERAÇÕES ---

IEAN — Indicador — Exposição a agente nocivo informada pelo empregador, passível de comprovação. Esclarecimento: Aplicado a períodos de vínculo com possível exposição a agentes nocivos. Norteia enquadramento como atividade especial para fins de aposentadoria especial. Verificar PPP e LTCAT.

IEAN-15 — Indicador — Exposição a Agentes Nocivos – 15 Anos. Esclarecimento: Grupo de 15 anos (mineração subterrânea, amianto). Fator de conversão: 2.33 (homem) / 2.0 (mulher).

IEAN-20 — Indicador — Exposição a Agentes Nocivos – 20 Anos. Esclarecimento: Grupo de 20 anos (mineração subterrânea em frente de produção). Fator de conversão: 1.75 (homem) / 1.5 (mulher).

IEAN-25 — Indicador — Exposição a Agentes Nocivos – 25 Anos. Esclarecimento: Grupo de 25 anos (ruído, químicos, biológicos). Mais comum. Fator de conversão: 1.4 (homem) / 1.2 (mulher).

IDT — Indicador — Indicador de Demanda de Natureza Trabalhista.

IREM-ACD — Indicador — Remuneração possui parcela de Acordo, Convenção ou Dissídio Coletivo.

IREM-INDPEND — Indicador — Remunerações com indicadores/pendência.

IREM-PARC-CEDIDO — Indicador — Remuneração possui parcela decorrente de Trabalhador Cedido.

IREM-PARC-DIR-SIND / IREM-PARC-DIRSIND — Indicador — Remuneração possui parcela decorrente de Dirigente Sindical.

IREM-PERQRT / IREM-PER-QUARENTENA — Indicador — Remuneração em período de quarentena.

IREM-RECL-TRAB — Indicador — Remuneração possui parcela de reclamatória trabalhista.

IREM-REINTEG-PARC-PROC-TRAB — Indicador — Remuneração de período de Reintegração parcial oriunda de Processo Trabalhista.

IREM-REINTEG-TOT-PROC-TRAB — Indicador — Remuneração de período de Reintegração total oriunda de Processo Trabalhista.

IREM-TRAB-INTERM — Indicador — Remuneração relacionada a Trabalho Intermitente.

IREM-TRAB-VERDE-AMARELO — Indicador — Remunerações pertencentes a Vínculo com categoria de carteira verde amarela.

IREM-TRANSF-TSVE-PROC-TRAB — Indicador — Remunerações transferidas para vínculo resultante de unicidade contratual de TSVE oriunda de Processo Trabalhista.

IREM-TSVE-PER-QUARENTENA — Indicador — Remuneração informada após o término do TSVE referente ao período de Quarentena.

IREM-VINC-PROC-TRAB — Indicador — Remuneração no Vínculo oriunda de Processo Trabalhista.

IVIN-AGRUP-VINC — Indicador — Vínculo Trabalhista gerado pelo Serviço de agrupamento de vínculos.

IVIN-AGRUP-VINC-PART — Indicador — Vínculo alvo do Serviço de agrupamento de vínculos.

IVIN-DESLIG-JUSTICA-TRAB / IVIN-DESLIG-JUSTIÇA-TRAB — Indicador — Inclusão da Data de Desligamento feita pela Justiça do Trabalho por meio do Evento S-8299.

IVIN-JORN-DIFERENCIADA — Indicador — Vínculo possui regime de jornada diferenciada.

IVIN-MAND-ELETIVO-PARCIAL — Indicador — Vínculo parcialmente caracterizado como mandato eletivo.

IVIN-POSSUI-REG-PRELIM — Indicador — Relação Trabalhista possui um registro preliminar informado em eSocial.

IVIN-POSSUI-REM-TRAB-INTERM — Indicador — Relação Trabalhista possui Remunerações de Trabalho Intermitente.

IVIN-POSSUI-REM-TRANS — Indicador — Vínculo possui remuneração transferida por Cessionário de Dirigente Sindical ou Trabalhador Cedido.

IVIN-PROC-TRAB — Indicador — Vínculo possui Processo Trabalhista.

IVIN-REG-PRELIM — Indicador — Relação Trabalhista é registro preliminar de vínculo informado no eSocial.

IVIN-REINTEG — Indicador — Vínculo possui reintegração no último desligamento (decisão judicial, reversão, recondução ou reinclusão).

IVIN-REINTEG-ANISTIA — Indicador — Reintegração por Anistia Legal.

IVIN-REINTEG-OUTROSTIPOS — Indicador — Vínculo possui reintegração no último desligamento por iniciativa do empregador ou por outros motivos.

IVIN-REINTEG-PARC — Indicador — Sentença trabalhista determinando reintegração e pagamento de remunerações de período parcial.

IVIN-REINTEG-PARC-PROC-TRAB — Indicador — Vínculo possui reintegração parcial oriunda de Processo Trabalhista.

IVIN-REINTEG-PROC-TRAB — Indicador — Vínculo possui reintegração no último desligamento oriunda de Processo Trabalhista.

IVIN-REINTEG-TOT — Indicador — Sentença trabalhista determinando reintegração e pagamento de remunerações retroativas do período total.

IVIN-REINTEG-TOT-PROC-TRAB — Indicador — Vínculo possui reintegração total oriunda de Processo Trabalhista.

IVIN-TRAB-INTERM — Indicador — Vínculo com informações de trabalho intermitente.

IVIN-TRAB-VERDE-AMARELO — Indicador — Vínculo com categoria de carteira verde amarela.

IVIN-UNIC-CONTR-PROC-TRAB — Indicador — Vínculo possui Unicidade Contratual oriunda de Processo Trabalhista.

IVIN-UNIC-CONTR-TSVE-PROC-TRAB — Indicador — Vínculo possui Unicidade Contratual do período de TSVE oriunda de Processo Trabalhista.

--- GRUPO: CONTRIBUIÇÕES ---

GFIP — Indicador — Indica que remuneração da competência foi declarada em GFIP.

IDESINDEXA — Indicador — Indica que a contribuição da competência foi desindexada.

IREC-DESINDEXA — Indicador — Contribuição da competência foi desindexada.

IREC-FBR — Indicador — Recolhimento de segurado Facultativo de Baixa Renda (Lei 12.470/2011). Esclarecimento: Alíquota de 5% sobre o salário mínimo.

IREC-FBR-DEF — Indicador — Recolhimento de Facultativo de Baixa Renda deferido/válido via Portal CNIS.

IREC-FBR-IND — Indicador — Recolhimento de Facultativo de Baixa Renda indeferido/inválido via Portal CNIS.

IREC-INDPEND — Indicador — Recolhimentos com indicadores/pendências. Esclarecimento: Sinaliza existência de pendências em alguma competência ou tempo de contribuição. Uma das siglas mais comuns.

IREC-LC123 — Indicador — Recolhimento no Plano Simplificado de Previdência Social (LC 123/2006). Esclarecimento: Contribuição com alíquota de 11% sobre o salário mínimo. Para usar em aposentadoria por tempo de contribuição, necessário complementar para 20%.

IREC-LC123-SUP — Indicador — Recolhimento LC 123 superior ao salário mínimo.

IREC-LIM-SM — Indicador — Contribuição da competência foi limitada ao salário mínimo.

IREC-MEI — Indicador — Contribuição da competência recolhida com código MEI. Esclarecimento: Alíquota de 5% sobre o salário mínimo. Para aposentadoria por tempo de contribuição, complementar diferença por GPS código 1910.

IRECOL — Indicador — Contribuição da competência é recolhimento.

IRECOL (ILEI123) / IRECOL (LEI123) — Indicador — Contribuição recolhida com código da Lei Complementar 123.

IRECOL (IMEI) — Indicador — Contribuição recolhida com código MEI.

ISALMIN — Indicador — Contribuição da competência foi limitada ao salário mínimo.

--- GRUPO: SEGURADO ESPECIAL ---

ISE-CVU — Indicador — Período de segurado especial concomitante com outro período urbano. Esclarecimento: Há sobreposição entre período rural (segurado especial) e período urbano.

--- GRUPO: AJUSTES EC103 - AGRUPAMENTO ---

IAGRU-MIN-SM-EC103 — Indicador — Competência objeto de agrupamento que recebeu valor mas permaneceu abaixo do mínimo (favorecido).

IAGRUP-MN-SM-EC103 — Indicador — Competência objeto de agrupamento que recebeu de outra competência mas permaneceu abaixo do mínimo (favorecida).

IAGRUP-SM-EC103 — Indicador — Competência objeto de agrupamento que resultou em salário de contribuição igual ao valor mínimo (favorecida).

IAGRUP-VR-EC103 — Indicador — Competência objeto de agrupamento onde restou valor residual (desfavorecida).

IAGRUP-ZER-EC103 — Indicador — Competência objeto de agrupamento que restou zerada (desfavorecida).

IAGRU-SP-M-SM-EC103 — Indicador — Competência objeto de agrupamento que resultou em salário de contribuição igual ao mínimo (favorecido).

--- GRUPO: AJUSTES EC103 - UTILIZAÇÃO ---

ICED-VR-EXC-EC103 — Indicador — Competência que cedeu valor excedente para outra competência.

IUTILIZ-EXC-EC103 — Indicador — Competência favorecida por valor de remuneração excedente de outra competência.

IUTILIZ-EXC-MN-SM-EC103 — Indicador — Competência favorecida por valor excedente mas permaneceu inferior ao mínimo.

--- GRUPO: AJUSTES EC103 - COMPLEMENTAÇÃO ---

ICOMPL-VR-SM-EC103 — Indicador — Competência que possui recolhimento de complementação para o valor mínimo.

IVLR-DARF-LIMITADO — Indicador — Valor de DARF foi limitado para que o total não ultrapasse o salário mínimo.

--- GRUPO: AJUSTES EC103 - OUTROS INDICADORES ---

IREL-PREV-POSSUI-COMP-AJUST / IREL-PREV-POSSUI-COMPA-JUST — Indicador — Relação Previdenciária possui alguma competência que foi ajustada (favorecida/desfavorecida).

--- GRUPO: DARF - EVENTOS ---

IDARF-ALT-CODRECEITA — Indicador — Darf incluído por alteração de código de receita aplicável pelo INSS.

IDARF-ALT-COMPETENCIA — Indicador — Darf incluído por alteração de competência dentro do período de vigência.

IDARF-ALT-CPF — Indicador — Darf alterado pela RFB para o CPF do titular.

IDARF-ALT-DADOS — Indicador — Darf incluído por alteração de dados.

IDARF-DESFAZ-CANCEL — Indicador — Darf com Cancelamento Desfeito.

IDARF-DESFAZ-RESTIT-PARCIAL / IDARF-DESFAZRESTITPARCIAL — Indicador — Darf com Valor Restituído Parcial Desfeito.

IDARF-DESFAZ-RESTIT-TOTAL / IDARF-DESFAZRESTITTOTAL — Indicador — Darf com Valor Restituído Total Desfeito.

--- GRUPO: DARF - ERROS DE PROCESSAMENTO ---

IDARF-CPF-NAO-INF — Indicador — Darf para CPF não informado no evento.

IDARF-ESPECIE-CI-INVALIDA — Indicador — Darf para Espécie CI inválida na competência.

IDARF-EXT-SEM-ANO-CIV — Indicador — Darf para inexistência de ano civil na Extrato.

IDARF-FIL-CAD-DIV — Indicador — Darf para filiado com dados cadastrais divergentes entre CNIS e RFB.

IDARF-FIL-NAO-ENC — Indicador — Darf para filiado não encontrado no cadastro de pessoas físicas.

IDARF-SEM-EMISS-ANT — Indicador — Darf sem emissão registrada anteriormente.

IDARF-TIPO-FILIADO-INVALIDO — Indicador — Darf para Tipo de Filiado inválido na competência.

IDARF-TIPO-FILIADO-NAO-INFORMADO — Indicador — Darf para Tipo de Filiado não informado na competência.

═══════════════════════════════════════════════════════════════════
INDICADORES DE ACERTO (CsAcerto) — Prefixo "A"
Indicam que acerto já foi efetuado. Serve para registro de alterações anteriores.
═══════════════════════════════════════════════════════════════════

--- GRUPO: VÍNCULOS E REMUNERAÇÕES ---

ACNISVR — Acerto — Acerto realizado pelo INSS. Esclarecimento: Indica que o INSS efetuou um acerto nos dados de vínculo ou remuneração.

ADIV-DADOS-GFIP — Acerto — Validação de vínculo ou remuneração com divergência de dado cadastral do trabalhador em GFIP.

AEXT-IND — Acerto — Vínculo extemporâneo não confirmado pelo INSS. Esclarecimento: Acerto de extemporaneidade indeferido.

AEXT-INDJ — Acerto — Vínculo extemporâneo não confirmado por decisão judicial.

AEXT-INDR — Acerto — Vínculo extemporâneo não confirmado por decisão recursal.

AEXT-VI — Acerto — Vínculo extemporâneo não confirmado pelo INSS.

AEXT-VP — Acerto — Vínculo extemporâneo confirmado parcialmente pelo INSS.

AEXT-VPR — Acerto — Vínculo extemporâneo confirmado parcialmente por decisão recursal.

AEXT-VPT — Acerto — Vínculo extemporâneo confirmado parcialmente por decisão judicial.

AEXT-VT — Acerto — Vínculo extemporâneo confirmado pelo INSS. Esclarecimento: Acerto de extemporaneidade deferido totalmente. Período validado.

AEXT-VTJ — Acerto — Vínculo extemporâneo confirmado por decisão judicial.

AEXT-VTR — Acerto — Vínculo extemporâneo confirmado por decisão recursal.

AVR-AGPVINC — Acerto — Agrupamento de Vínculos.

AVRC-AGPVINC — Acerto — Agrupamento de Vínculos.

AVRC-DEF — Acerto — Acerto confirmado pelo INSS. Esclarecimento: O acerto solicitado foi deferido.

AVRC-DEFJ — Acerto — Acerto confirmado por decisão judicial.

AVRC-DEFR — Acerto — Acerto confirmado por decisão recursal.

AVRC-DGPVINC — Acerto — Desagrupamento de Vínculos.

AVRC-IND — Acerto — Acerto negado pelo INSS. Esclarecimento: O acerto solicitado foi indeferido.

AVRC-INDJ — Acerto — Acerto negado por decisão judicial.

AVRC-INDR — Acerto — Acerto negado por decisão recursal.

--- GRUPO: SEGURADO ESPECIAL ---

ASE-DEF — Acerto — Período Segurado Especial Deferido. Esclarecimento: O período de atividade como segurado especial foi reconhecido.

ASE-DEFJ — Acerto — Período Segurado Especial Deferido Judicial.

ASE-DEFR — Acerto — Período Segurado Especial Deferido Recursal.

ASEF-DEF — Acerto — Período Segurado Especial FUNAI Deferido.

ASEF-DEFJ — Acerto — Período Segurado Especial FUNAI Deferido Judicial.

ASE-IND — Acerto — Período Segurado Especial Indeferido.

ASE-INDR — Acerto — Período Segurado Especial Indeferido Recursal.

ASE-NSE — Acerto — Período Não Segurado Especial.

ASE-RNEG — Acerto — Período Segurado Especial Negativo Ratificado.

ASE-RPOS — Acerto — Período Segurado Especial Positivo Ratificado.

FIM DO ANEXO V — RELAÇÃO DOS INDICADORES DISPONIBILIZADOS NO CNIS
`.trim();


// =========================================================================
//  FUNÇÕES DE PROCESSAMENTO
// =========================================================================

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
    if (start > 0) {
      console.log(`      💤 aguardando ${EMBED_DELAY_MS/1000}s (rate limit)...`);
      await sleep(EMBED_DELAY_MS);
    }

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
          console.log(`      ⏳ [${attempt}/${MAX_RETRIES}] 429 rate limit — esperando ${wait/1000}s...`);
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
        console.log(`      ✓ batch ${start}-${start + batch.length} OK (${data.embeddings?.length || 0} embeddings)`);
        break;
      } catch (err) {
        if (attempt === MAX_RETRIES) {
          console.log(`      ✗ batch ${start}-${start + batch.length} FALHOU após ${MAX_RETRIES} tentativas`);
        } else {
          const wait = attempt * 5000;
          console.log(`      ⚠ [${attempt}/${MAX_RETRIES}] ${err.message.slice(0, 80)} — retry em ${wait/1000}s`);
          await sleep(wait);
        }
      }
    }
  }
  return results;
}

// =========================================================================
//  MAIN
// =========================================================================
async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  INJEÇÃO DE CONTEÚDO CNIS — INDICADORES');
  console.log('═══════════════════════════════════════════════════\n');

  // 1) Find CNIS agent
  const agentRes = await pool.query(`
    SELECT a.id, a.title,
           (SELECT count(*) FROM document_chunks dc WHERE dc.agent_id = a.id)::int as chunks
    FROM agents a WHERE a.user_id IS NULL
      AND (lower(a.title) LIKE '%cnis%' OR lower(a.title) LIKE '%cadastro nacional de informa%')
    LIMIT 1
  `);

  if (!agentRes.rowCount) { console.log('❌ Agente CNIS não encontrado'); return; }
  const agent = agentRes.rows[0];
  console.log(`  Agente: ${agent.title}`);
  console.log(`  Chunks atuais: ${agent.chunks}\n`);

  // 2) Find placeholder documents to replace
  const docsRes = await pool.query(
    `SELECT d.id, d.title, (SELECT count(*) FROM document_chunks dc WHERE dc.document_id = d.id)::int as chunks
     FROM documents d WHERE d.agent_id = $1
     AND (lower(d.title) LIKE '%portaria990%' OR lower(d.title) LIKE '%/anexos%' OR lower(d.title) LIKE '%portaria993%')
     ORDER BY d.title`, [agent.id]
  );

  console.log(`📋 Documentos placeholder encontrados: ${docsRes.rowCount}`);
  for (const doc of docsRes.rows) {
    console.log(`   • ${doc.title} (${doc.chunks} chunks)`);
  }

  // 3) Delete placeholder documents and their chunks
  if (docsRes.rowCount > 0) {
    const docIds = docsRes.rows.map(d => d.id);
    const oldChunks = docsRes.rows.reduce((sum, d) => sum + d.chunks, 0);
    console.log(`\n🗑️  Removendo ${docsRes.rowCount} documentos placeholder (${oldChunks} chunks)...`);
    
    for (const docId of docIds) {
      await pool.query('DELETE FROM document_chunks WHERE document_id = $1', [docId]);
      await pool.query('DELETE FROM documents WHERE id = $1', [docId]);
    }
    console.log('   ✓ Placeholder removidos');
  }

  // 4) Process content and inject
  const contentBlocks = [
    { title: 'Portaria DIRBEN/INSS 990/2022 — Indicadores do CNIS (Art. 7-29)', text: PORTARIA_990_INDICADORES },
    { title: 'Anexo V — Relação dos Indicadores Disponibilizados no CNIS (Portaria 990/2022)', text: ANEXO_V_INDICADORES },
  ];

  let totalInserted = 0;

  for (const block of contentBlocks) {
    console.log(`\n📝 Processando: ${block.title}`);
    
    const chunks = chunkText(block.text);
    console.log(`   ${chunks.length} chunks gerados`);

    if (!chunks.length) { console.log('   ⚠ Sem conteúdo, pulando'); continue; }

    console.log(`   Gerando embeddings...`);
    const vectors = await embedBatch(chunks);

    const payload = [];
    let lost = 0;
    for (let j = 0; j < chunks.length; j++) {
      if (vectors[j]) {
        payload.push({ chunk_index: j, content: chunks[j], embedding: `[${vectors[j].join(',')}]` });
      } else {
        lost++;
      }
    }
    if (lost) console.log(`   ⚠ ${lost} chunks sem embedding`);

    // Insert document + chunks
    const docId = crypto.randomUUID();
    const title = block.title.length > 255 ? block.title.slice(0, 255) : block.title;
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO documents (id, agent_id, title) VALUES ($1,$2,$3)', [docId, agent.id, title]);
      
      for (const row of payload) {
        await client.query(
          'INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index) VALUES ($1,$2,$3,$4::vector,$5)',
          [agent.id, docId, row.content, row.embedding, row.chunk_index]
        );
      }
      
      await client.query('COMMIT');
      console.log(`   ✅ ${payload.length} chunks inseridos`);
      totalInserted += payload.length;
    } catch (e) {
      await client.query('ROLLBACK');
      console.log(`   ❌ ROLLBACK — ${e.message}`);
    } finally {
      client.release();
    }
  }

  // 5) Final count
  const finalRes = await pool.query(
    'SELECT count(*) as total FROM document_chunks WHERE agent_id = $1', [agent.id]
  );
  
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`  ✅ INJEÇÃO CONCLUÍDA`);
  console.log(`  Chunks inseridos:  ${totalInserted}`);
  console.log(`  Total CNIS agora:  ${finalRes.rows[0].total} chunks`);
  console.log(`═══════════════════════════════════════════════════\n`);

  await pool.end();
}

main().catch(e => { console.error('[FATAL]', e.message); pool.end(); process.exit(1); });
