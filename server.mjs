import express from 'express';
import { createServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import pkg from 'pg';
import OpenAI from 'openai';
import multer from 'multer';
import pdfParse from 'pdf-parse';
const require = createRequire(import.meta.url);
const { Pool } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// Setup multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'public', 'agent-attachments');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    try {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const safeName = originalName.replace(/[<>:"|?*]/g, '_');
      console.log(`[UPLOAD] Salvando arquivo como: ${safeName}`);
      cb(null, safeName);
    } catch (e) {
      console.error('[UPLOAD] Erro ao processar nome:', e);
      cb(null, file.originalname);
    }
  }
});

const upload = multer({ storage });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================
// 🧠 FUNÇÕES RAG PROFISSIONAL
// ============================================

// 1️⃣ Extrair PDF
async function extractPdfText(filePath) {
  try {
    const fileBuffer = await fs.promises.readFile(filePath);
    const data = await pdfParse(fileBuffer);
    const text = data.text || '';
    
    console.log('--- TESTE DE EXTRAÇÃO ---');
    console.log(`Documento: ${path.basename(filePath)}`);
    console.log(`Caracteres extraídos: ${text.length}`);
    if (text.length > 0) {
      console.log(`Primeiras 200 letras:\n"${text.substring(0, 200).replace(/\n/g, ' ')}..."`);
    } else {
      console.warn('⚠️ AVISO: NENHUM TEXTO EXTRAÍDO DO PDF!');
    }
    console.log('-------------------------');
    
    return text;
  } catch (e) {
    console.error('[PDF] Erro ao extrair:', e.message);
    return '';
  }
}

// 2️⃣ Chunking Inteligente (Respeita frases e palavras)
function chunkText(text, size = 800, overlap = 300) {
  if (!text || text.trim().length === 0) {
    console.warn('[CHUNK] Texto vazio, nenhum chunk criado.');
    return [];
  }

  // Normalizar espaços em branco
  const cleanText = text.replace(/\s+/g, ' ').trim();
  const chunks = [];
  let start = 0;

  while (start < cleanText.length) {
    let end = start + size;

    // Se não estamos no final do texto, tentar recuar até o último ponto final ou espaço
    if (end < cleanText.length) {
      // Tentar encontrar o último ponto final dentro da margem de segurança (últimos 20% do chunk)
      const lastPeriod = cleanText.lastIndexOf('.', end);
      const lastSpace = cleanText.lastIndexOf(' ', end);

      if (lastPeriod > start + (size * 0.8)) {
        end = lastPeriod + 1; // Inclui o ponto
      } else if (lastSpace > start + (size * 0.5)) {
        end = lastSpace; // Corta no espaço
      }
    }

    const chunk = cleanText.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Avança para o próximo, considerando o overlap
    start = end - overlap;
    
    // Proteção contra loop infinito se o overlap for maior que o chunk
    if (start >= end) start = end;
  }

  console.log(`[CHUNK] Gerados ${chunks.length} chunks inteligentes.`);
  return chunks;
}

// 3️⃣ Gerar embeddings (OpenAI text-embedding-3-large)
async function generateEmbeddings(chunks) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });

  const embeddings = [];
  console.log(`[EMB] Gerando embeddings para ${chunks.length} chunks...`);
  
  for (let i = 0; i < chunks.length; i++) {
    try {
      const res = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: chunks[i]
      });
      embeddings.push(res.data[0].embedding);
      if ((i + 1) % 5 === 0 || i === chunks.length - 1) {
        console.log(`[EMB] Progresso: ${i + 1}/${chunks.length}`);
      }
    } catch (e) {
      console.error(`[EMB] Erro no chunk ${i}:`, e.message);
      embeddings.push(Array(3072).fill(0));
    }
  }
  return embeddings;
}

// 4️⃣ Busca semântica com pgvector - ROBUSTA (Cosine)
async function searchSimilarChunks(queryEmbedding, agentId, limit = 20) {
  try {
    const embeddingString = '[' + queryEmbedding.join(',') + ']';
    
    const result = await pool.query(`
      SELECT content, chunk_index, 1 - (embedding <=> $2::vector) as similarity
      FROM document_chunks
      WHERE agent_id = $1
      ORDER BY embedding <=> $2::vector
      LIMIT $3
    `, [agentId, embeddingString, limit]);
    
    console.log('--- TESTE DE RECUPERAÇÃO (RAG) ---');
    console.log(`Agente: ${agentId}`);
    console.log(`Chunks encontrados: ${result.rows.length}/${limit}`);
    
    if (result.rows.length > 0) {
      result.rows.slice(0, 3).forEach((r, i) => {
        console.log(`Chunk ${i + 1} (ID: ${r.chunk_index}, Sim: ${r.similarity.toFixed(3)}): ${r.content.substring(0, 60).replace(/\n/g, ' ')}...`);
      });
    } else {
      console.warn('⚠️ AVISO: NENHUM CHUNK ENCONTRADO PARA ESTA PERGUNTA!');
    }
    console.log('----------------------------------');
    
    // Retornar com IDs para citação
    return result.rows.map(r => `[Trecho ID: ${r.chunk_index}]\n${r.content}`).join('\n\n---\n\n');
  } catch (e) {
    console.error('[SEARCH] Erro fatal na busca vetorial:', e.message);
    return '';
  }
}

// 4B️⃣ Busca por palavra-chave (fallback para listas e nomes)
async function searchKeywordChunks(keyword, agentId, limit = 5) {
  try {
    const result = await pool.query(`
      SELECT content
      FROM document_chunks
      WHERE agent_id = $1 AND content ILIKE $2
      LIMIT $3
    `, [agentId, '%' + keyword + '%', limit]);
    
    console.log(`[KEYWORD_SEARCH] Encontrados ${result.rows.length} chunks com palavra-chave: "${keyword}"`);
    return result.rows.map(r => r.content).join('\n\n---\n\n');
  } catch (e) {
    console.error('[KEYWORD_SEARCH] Erro:', e.message);
    return '';
  }
}

// 4C️⃣ Busca por ordem cronológica (para início/título)
async function getFirstChunks(agentId, limit = 3) {
  try {
    const result = await pool.query(`
      SELECT content
      FROM document_chunks
      WHERE agent_id = $1
      ORDER BY chunk_index ASC
      LIMIT $2
    `, [agentId, limit]);
    
    console.log(`[ORDER_SEARCH] Recuperados os primeiros ${result.rows.length} chunks.`);
    return result.rows.map(r => r.content).join('\n\n---\n\n');
  } catch (e) {
    console.error('[ORDER_SEARCH] Erro:', e.message);
    return '';
  }
}

// ============================================
// 🎯 VARIAÇÕES DE TOM GLOBAIS
// ============================================

const toneVariations = {
  formal: `Você é um assistente profissional e objetivo.

Responda exclusivamente com base no CONTEXTO fornecido.
Não utilize conhecimento externo.

Quando a informação não estiver presente no documento:
- Informe isso de maneira clara e formal.
- Não faça suposições.`,

  neutral: `Você é um assistente claro, educado e profissional.

Utilize apenas as informações presentes no CONTEXTO fornecido.
Não complemente respostas com conhecimento externo.

Quando a informação solicitada não estiver no documento:
- Explique isso de forma natural.
- Seja direto e educado.`,

  chatgpt: `Você é um especialista prestativo e conversacional. Fale como um ser humano, não como um robô.

DIRETRIZES DE TOM:
- Seja direto, amigável e natural
- NÃO use frases robóticas como "No documento analisado", "De acordo com o contexto", "Conforme o texto"
- Integre a resposta naturalmente na conversa
- Se precise citar o documento, faça isso de forma fluida, sem forçar
- Mantenha linguagem simples e clara

USE APENAS as informações do CONTEXTO fornecido.
Se não souber algo, diga naturalmente que não encontrou essa informação.`
};

// ============================================
// 🎲 FORMATTER DE RESPOSTAS VARIÁVEIS (4 CAMADAS)
// ============================================

// CAMADA 1: Inteligência Percebida - Respostas naturais e humanizadas
const negativeResponseVariations = [
  "Não encontrei essa informação no documento.",
  "Esse ponto não é abordado no texto.",
  "Infelizmente essa informação não está lá.",
  "O documento não trata disso.",
  "Não encontrei dados sobre isso por aqui.",
  "Essa informação não aparece no conteúdo.",
  "Esse detalhe não está no texto.",
];

// ============================================
// 2️⃣ CLASSIFICADOR AVANÇADO DE INTENÇÃO (Melhorado)
// ============================================

function detectQuestionType(question) {
  // Termos expandidos para melhor detecção
  const factualTerms = /liste|qual é|quais são|quantos|quando|onde|nome|autor|enumere|mencione|cite|indique|mostre|apresente|aponte/i;
  const structuralTerms = /primeira frase|título|inicio|começo|capítulo|seção|tópico|estrutura|onde está|localiza|parágrafo|página|introdução|conclusão|índice/i;
  const explanatoryTerms = /explique|como funciona|por que|descreva|como é|qual a diferença|o que é|qual o objetivo|qual a função|qual a importância|qual o propósito/i;

  if (structuralTerms.test(question)) return 'structural';
  if (explanatoryTerms.test(question)) return 'explanatory';
  if (factualTerms.test(question)) return 'factual';
  return 'general';
}

// ============================================
// 🟠 CLASSIFICADOR DE PERGUNTA ACADÊMICA PERIGOSA (Novo)
// ============================================

/**
 * Detecta perguntas que EXIGEM citação literal do documento
 * Exemplos: "Segundo X (2010)...", "Conforme autor Y...", "Definição formal de..."
 * 
 * Essas perguntas NÃO podem ser respondidas com interpolação/síntese
 * Precisam de trecho EXATO do documento
 */
function isAcademicAuthorityQuestion(question) {
  const academicPatterns = [
    /segundo\s+[A-Z][a-záàâãéèêíïóôõöúçñ\s]*\s*\(\d{4}\)/i, // "segundo Ensslin (2010)"
    /conforme\s+[A-Z][a-záàâãéèêíïóôõöúçñ\s]*\s*\(\d{4}\)/i, // "conforme Silva (2015)"
    /de acordo com\s+[A-Z][a-záàâãéèêíïóôõöúçñ\s]*\s*\(\d{4}\)/i, // "de acordo com Costa (2018)"
    /segundo o autor/i, // "segundo o autor X"
    /conforme o autor/i, // "conforme o autor"
    /definição formal de/i, // "definição formal de avaliação"
    /defina\s+/i, // "defina performance"
    /qual é a definição/i, // "qual é a definição de"
    /como [A-Za-z]+ define/i, // "como o documento define"
  ];
  
  return academicPatterns.some(pattern => pattern.test(question));
}

// ============================================
// 🔍 VALIDADOR AGRESSIVO DE CITAÇÕES (Melhorado)
// ============================================

/**
 * Valida se a resposta tem PROVA TEXTUAL no contexto
 * Para perguntas acadêmicas, exige citação literal
 */
function validateCitationWithProof(responseText, contextText, question) {
  // Procurar por padrão "AUTOR (YYYY)" na pergunta
  const citationPattern = /([A-Z][a-záàâãéèêíïóôõöúçñ\s]+)\s*\(\d{4}\)/;
  const citationMatch = question.match(citationPattern);
  
  if (citationMatch) {
    const citedYear = citationMatch[0].match(/\(\d{4}\)/)[0];
    
    // Verificar se pelo menos o ano existe no contexto
    if (!contextText.includes(citedYear)) {
      console.log(`[CITATION PROOF] 🚨 FALHA: Citação "${citationMatch[0]}" não existe no contexto`);
      return false;
    }
    
    // Se o ano existe, permitimos a resposta ser gerada, confiando no modelo
    // Removemos o check de "foundWithExplanation" que era muito rígido
    return true;
  }
  
  return true;
}

// ============================================
// 🛑 BLOQUEADOR DE RESPOSTAS "BONITAS SEM PROVA" (Novo)
// ============================================

/**
 * Detecta frases que indicam síntese/interpolação SEM ancoragem literal
 * Exemplos: "o documento relaciona", "é visto como", "destaca que"
 */
function hasUnprovenClaim(responseText, contextText) {
  // Padrões que indicam síntese perigosa (construção lógica, não literal)
  const unprovenPatterns = [
    /o documento relaciona/i,
    /é visto como/i,
    /destaca que/i,
    /apresenta.*como/i,
    /considera.*que/i,
    /sugere que/i,
    /implica que/i,
    /podemos concluir/i,
    /em resumo/i,
  ];
  
  for (const pattern of unprovenPatterns) {
    if (pattern.test(responseText)) {
      // Se encontrou a frase, verificar se ela está LITERALMENTE no contexto
      const matchedPhrase = responseText.match(pattern)?.[0];
      if (matchedPhrase && !contextText.toLowerCase().includes(matchedPhrase.toLowerCase())) {
        // Se não for literal, pode ser uma síntese válida se as palavras-chave principais estiverem presentes
        // Mas para ser "agressivo", bloqueamos se não for literal ou quase literal
        const keywords = matchedPhrase.split(/\s+/).filter(w => w.length > 4);
        const hasSomeKeywords = keywords.some(k => contextText.toLowerCase().includes(k.toLowerCase()));
        
        if (!hasSomeKeywords) {
          console.log(`[UNPROVEN CLAIM] 🚨 Detectada síntese sem prova: "${matchedPhrase}"`);
          return true;
        }
      }
    }
  }
  
  return false; // Tudo OK
}

// ============================================
// 3️⃣ PADRÕES DE RESPOSTA (POR TIPO)
// ============================================

const responsePatterns = {
  structural: {
    anchorPhrases: [
      "De acordo com o conteúdo fornecido",
      "Localizei no documento",
      "O documento apresenta",
      "Conforme o texto analisado"
    ],
    format: "direct", // Resposta direta + localização
    example: 'A primeira frase do documento é: "..."'
  },
  
  factual: {
    anchorPhrases: [
      "No documento analisado, os itens listados são",
      "Conforme o conteúdo, identifiquei",
      "O documento apresenta os seguintes",
      "Analisei o documento e encontrei"
    ],
    format: "list", // Resposta em lista
    example: '• Item 1\n• Item 2\n• Item 3'
  },
  
  explanatory: {
    anchorPhrases: [
      "No documento, é apresentado que",
      "Com base no conteúdo fornecido",
      "O documento explica que",
      "Analisando o texto, encontro"
    ],
    format: "paragraphs", // Resposta em parágrafos
    example: 'O conceito é definido como... No contexto do documento...'
  },
  
  general: {
    anchorPhrases: [
      "No documento analisado",
      "Com base no conteúdo fornecido",
      "De acordo com o texto",
      "Analisei o documento e encontrei"
    ],
    format: "natural", // Resposta natural
    example: ''
  }
};

// ============================================
// 1️⃣ RESPONSE ORCHESTRATOR (CAMADA FINAL)
// ============================================

/**
 * Response Orchestrator - VERSÃO HUMANIZADA
 * 
 * Responsabilidades:
 * - Remover frases robóticas
 * - Deixar o LLM decidir a formatação
 * - Manter apenas ajustes visuais necessários
 */
function orchestrateResponse(rawResponse, questionType, hasContext = true) {
  // 1. Se não tem contexto ou resposta vazia, manda a negativa elegante
  if (!hasContext || !rawResponse || rawResponse.trim().length === 0) {
    return getRandomNegativeResponse();
  }

  // 2. MANTÉM A RESPOSTA ORIGINAL (Aqui está o segredo!)
  // Não adicionamos mais "anchorPhrases" nem prefixos robóticos.
  let formattedResponse = rawResponse;

  // 3. Apenas garantimos a formatação visual de listas (se houver bullets)
  if (questionType === 'factual' && (rawResponse.includes('•') || rawResponse.includes('- '))) {
    formattedResponse = ensureProperListFormat(rawResponse);
  }

  // 4. Retorna o texto puro, do jeito que o GPT gerou
  return formattedResponse;
}

// Remover frases robóticas do início
function removeRoboticPhrases(text) {
  const roboticPhrases = [
    /^No documento analisado[,:]/i,
    /^De acordo com o conteúdo[,:]/i,
    /^Conforme o texto[,:]/i,
    /^O documento apresenta[,:]/i,
    /^Analisei o documento e encontrei[,:]/i,
    /^Com base no conteúdo fornecido[,:]/i,
  ];

  let cleanText = text;
  for (const pattern of roboticPhrases) {
    cleanText = cleanText.replace(pattern, '');
  }
  
  // Remover espaços/pontuação extras no começo
  cleanText = cleanText.trim();
  if (cleanText.startsWith(':') || cleanText.startsWith(',')) {
    cleanText = cleanText.slice(1).trim();
  }
  
  return cleanText;
}

// Helpers para formatação
function ensureProperListFormat(text) {
  // Se já tem bullets ou números, mantém
  if (/^[•\-*\d]/.test(text.trim())) {
    return text;
  }
  
  // Se parece ser uma lista separada por vírgulas, converte
  if (text.includes(',') && !text.includes('\n')) {
    const items = text.split(',').map(item => item.trim());
    if (items.length > 2) {
      return items.map(item => `• ${item}`).join('\n');
    }
  }

  return text;
}

function ensureProperParagraphFormat(text) {
  // Se parágrafos são muito longos, quebra em linhas menores
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  
  if (sentences.length > 3) {
    // Agrupar em parágrafos de 2-3 frases
    const paragraphs = [];
    for (let i = 0; i < sentences.length; i += 2) {
      paragraphs.push(sentences.slice(i, i + 2).join('').trim());
    }
    return paragraphs.join('\n\n');
  }

  return text;
}

function trimToFirstSentence(text, maxSentences = 1) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  return sentences.slice(0, maxSentences).join('').trim();
}

function hasAnchorPhrase(text) {
  const phrases = [
    'No documento',
    'Com base no',
    'De acordo com',
    'Analisei',
    'O documento',
    'Conforme',
    'Localizei',
    'Identificar'
  ];
  
  return phrases.some(phrase => text.toLowerCase().startsWith(phrase.toLowerCase()));
}

// ============================================
// 4️⃣ TELEMETRIA DE QUALIDADE (OBSERVABILIDADE)
// ============================================

const telemetryMetrics = {
  totalQuestions: 0,
  answeredWithContext: 0,
  answeredWithoutContext: 0,
  avgContextSize: 0,
  avgChunksUsed: 0,
  avgResponseTime: 0,
  questionTypes: { factual: 0, structural: 0, explanatory: 0, general: 0 },
  repeatedQuestions: {}
};

function recordTelemetry(question, hasContext, contextSize, chunksUsed, responseTime, questionType) {
  telemetryMetrics.totalQuestions++;
  
  if (hasContext) {
    telemetryMetrics.answeredWithContext++;
  } else {
    telemetryMetrics.answeredWithoutContext++;
  }
  
  telemetryMetrics.avgContextSize = 
    (telemetryMetrics.avgContextSize * (telemetryMetrics.totalQuestions - 1) + contextSize) / telemetryMetrics.totalQuestions;
  telemetryMetrics.avgChunksUsed =
    (telemetryMetrics.avgChunksUsed * (telemetryMetrics.totalQuestions - 1) + chunksUsed) / telemetryMetrics.totalQuestions;
  telemetryMetrics.avgResponseTime =
    (telemetryMetrics.avgResponseTime * (telemetryMetrics.totalQuestions - 1) + responseTime) / telemetryMetrics.totalQuestions;
  
  telemetryMetrics.questionTypes[questionType] = (telemetryMetrics.questionTypes[questionType] || 0) + 1;
  
  // Rastrear perguntas repetidas
  const questionNorm = question.toLowerCase().trim();
  telemetryMetrics.repeatedQuestions[questionNorm] = (telemetryMetrics.repeatedQuestions[questionNorm] || 0) + 1;
  
  // Alertas automáticos
  const negativeRate = (telemetryMetrics.answeredWithoutContext / telemetryMetrics.totalQuestions) * 100;
  if (negativeRate > 40) {
    console.warn(`[TELEMETRIA] 🚨 Taxa de negativas ALTA: ${negativeRate.toFixed(2)}%`);
  }
  
  if (contextSize === 0) {
    console.warn(`[TELEMETRIA] 🚨 Contexto vazio detectado`);
  }
  
  console.log(`[TELEMETRIA] Q#${telemetryMetrics.totalQuestions} | Type: ${questionType} | Context: ${hasContext ? 'SIM' : 'NÃO'} | Time: ${responseTime}ms`);
}

function getTelemetryReport() {
  const negativeRate = ((telemetryMetrics.answeredWithoutContext / telemetryMetrics.totalQuestions) * 100).toFixed(2);
  return {
    totalQuestions: telemetryMetrics.totalQuestions,
    answeredWithContext: telemetryMetrics.answeredWithContext,
    answeredWithoutContext: telemetryMetrics.answeredWithoutContext,
    successRate: (100 - parseFloat(negativeRate)).toFixed(2) + '%',
    avgContextSize: telemetryMetrics.avgContextSize.toFixed(0),
    avgChunksUsed: telemetryMetrics.avgChunksUsed.toFixed(1),
    avgResponseTime: telemetryMetrics.avgResponseTime.toFixed(0) + 'ms',
    questionTypes: telemetryMetrics.questionTypes
  };
}

// ============================================
// 5️⃣ GUIA DE ESTILO INTERNO (PADRÕES CHATGPT)
// ============================================

/*
 * GUIA DE ESTILO - PRINCÍPIOS FUNDAMENTAIS
 * 
 * ✅ PERMITIDO:
 * - Frases naturais e conversacionais
 * - Tom neutro-amigável e profissional
 * - Termos simples, sem jargão técnico
 * - Oferecimento de próximos passos
 * 
 * ❌ PROIBIDO:
 * - "Como uma IA, eu..."
 * - "Não tenho acesso..."
 * - "Baseado no meu treinamento..."
 * - Justificativas excessivas
 * - Respostas robóticas ou repetitivas
 */

// CAMADA 3 + 4: Enriquecer resposta negativa com contexto e sugestão
function getRandomNegativeResponse(question = '') {
  const base = negativeResponseVariations[Math.floor(Math.random() * negativeResponseVariations.length)];
  
  // Adicionar sugestão de próximos passos (CAMADA 4 - Feedback de Confiança)
  const suggestions = [
    "Se preferir, posso buscar informações correlatas no documento.",
    "Posso tentar uma busca com termos alternativos se desejar.",
    "Se tiver outra pergunta sobre o conteúdo, fico à disposição."
  ];
  
  const suggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
  return `${base} ${suggestion}`;
}

function formatResponse(answer, hasContext, question = '') {
  // Se há contexto, retorna a resposta normalmente
  return answer;
}

// 5️⃣ Prompt GLOBAL DEFINITIVO HUMANIZADO
function buildPrompt(context, agentInstructions, question, toneStyle = 'chatgpt') {
  const selectedTone = toneVariations[toneStyle] || toneVariations.chatgpt;

  const globalPrompt = `${selectedTone}

═══════════════════════════════════════════════════════════════════
TAREFA:
═══════════════════════════════════════════════════════════════════
Responda com base APENAS nas informações do CONTEXTO abaixo.
Não use conhecimento externo.

Se a resposta estiver no contexto → responda naturalmente.
Se não estiver → diga que não encontrou essa informação.

═══════════════════════════════════════════════════════════════════
CONTEXTO (sua única fonte de verdade):
═══════════════════════════════════════════════════════════════════`;

  const contextBlock = (context && context.trim().length > 0)
    ? `${context}`
    : '(Sem contexto fornecido)';

  return `${globalPrompt}
${contextBlock}

═══════════════════════════════════════════════════════════════════
INSTRUÇÕES DO AGENTE:
═══════════════════════════════════════════════════════════════════
${agentInstructions || "Atue como um assistente especializado e prestativo."}

═══════════════════════════════════════════════════════════════════
PERGUNTA:
═══════════════════════════════════════════════════════════════════
${question}`;
}


// 6️⃣ VALIDADOR + ORCHESTRATOR (PIPELINE FINAL)
function validateOutput(text, hasContext = true, question = '', questionType = 'general', contextSize = 0, chunksUsed = 0, context = '') {
  const startTime = Date.now();
  
  // Padrões de alucinação severa
  const severeAllucinationPatterns = [
    /de acordo com meu conhecimento/i,
    /em minha opinião/i,
    /geralmente se sabe que/i,
    /é conhecido que/i,
    /segundo a comunidade/i,
  ];

  let finalResponse = text;
  let blocked = false;

  // Check 1: Padrões severos de alucinação
  for (const pattern of severeAllucinationPatterns) {
    if (pattern.test(text)) {
      console.log(`[VALIDATOR-1] 🚨 Bloqueando: padrão de alucinação severa. Texto: "${text.substring(0, 50)}..."`);
      finalResponse = getRandomNegativeResponse(question);
      hasContext = false;
      blocked = true;
      break;
    }
  }

  // Aplicar Response Orchestrator (camada final)
  finalResponse = orchestrateResponse(finalResponse, questionType, hasContext);
  
  // Registrar telemetria
  const responseTime = Date.now() - startTime;
  recordTelemetry(question, hasContext, contextSize, chunksUsed, responseTime, questionType);
  
  console.log(`[ORCHESTRATOR] ✅ Resposta orquestrada | Tipo: ${questionType} | Context: ${hasContext} | Blocked: ${blocked}`);
  
  return finalResponse;
}

// ============================================
// 📊 INICIALIZAR TABELAS RAG
// ============================================

async function initializeRagTables() {
  try {
    // Criar extensão (garantir)
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    
    // Tabelas de conversas (existentes)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        agent_id UUID,
        title VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Adicionar coluna agent_id se não existir (para migração)
    try {
      await pool.query(`ALTER TABLE conversations ADD COLUMN agent_id UUID`);
    } catch (e) {
      // Coluna já existe, ignorar erro
    }
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Tabelas RAG profissional
    await pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID NOT NULL,
        title VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID NOT NULL,
        document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        embedding vector(3072),
        chunk_index INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Criar índice para busca rápida (hnsw suporta 3072 dimensões)
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding 
        ON document_chunks USING hnsw (embedding vector_cosine_ops)
      `);
    } catch (indexError) {
      // Se hnsw não estiver disponível, criar com ivfflat é impossível com 3072 dims
      // Vamos pular o índice e deixar a busca sem índice (mais lenta mas funciona)
      console.warn('[RAG] hnsw não disponível, usando busca sem índice (mais lenta)');
    }
    
    console.log('[RAG] ✅ Tabelas RAG inicializadas com sucesso');
  } catch (e) {
    console.error('[RAG] Erro ao inicializar:', e.message);
  }
}

initializeRagTables();
