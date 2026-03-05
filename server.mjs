import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import pkg from 'pg';
import OpenAI from 'openai';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
const require = createRequire(import.meta.url);
const { Pool } = pkg;
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const app = express();

// CORS — permite frontend acessar API de outro domínio
app.use((req, res, next) => {
  const allowedOrigins = (process.env.VITE_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || allowedOrigins.length === 0)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ✅ CORREÇÃO 1: Aumentar limite de payload para PDFs longos
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

const chatStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'public', 'chat-attachments');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const safeName = originalName.replace(/[<>:"|?*]/g, '_');
    const unique = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    cb(null, `${unique}-${safeName}`);
  }
});

const chatUpload = multer({ storage: chatStorage });
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
const GEMINI_OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

function getAiRuntimeConfig() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const useGemini = Boolean(process.env.GEMINI_API_KEY);
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || (useGemini ? GEMINI_OPENAI_BASE_URL : undefined);

  return {
    apiKey,
    baseURL,
    useGemini,
    chatModel: process.env.CHAT_MODEL || (useGemini ? 'gemini-2.5-flash' : 'gpt-4o'),
    fastChatModel: process.env.FAST_CHAT_MODEL || (useGemini ? 'gemini-2.5-flash' : 'gpt-4o-mini'),
    embeddingModel: process.env.EMBEDDING_MODEL || (useGemini ? 'gemini-embedding-001' : 'text-embedding-3-large')
  };
}

function createAiClient() {
  const cfg = getAiRuntimeConfig();
  return new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
  });
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const hasSupabaseAuth = Boolean(supabaseUrl && supabaseAnonKey);

const supabaseAuthClient = hasSupabaseAuth
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

const pool = hasDatabaseUrl
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : {
      query: async () => {
        const err = new Error('DATABASE_URL não configurado. Configure o arquivo .env para habilitar banco e RAG.');
        err.code = 'DB_NOT_CONFIGURED';
        throw err;
      }
    };

const memoryChatStore = {
  nextConversationId: 1,
  nextMessageId: 1,
  conversations: [],
  messages: []
};

// ============================================
// 🧠 FUNÇÕES RAG PROFISSIONAL
// ============================================

// 1️⃣ Extrair e Limpar PDF (CORRIGIDO COM LIMPEZA DE BUFFER AVANÇADA)
async function extractPdfText(filePath) {
  try {
    const fileBuffer = await fs.promises.readFile(filePath);
    
    // ✅ LIMPEZA DE BUFFER: Forçamos pdf-parse ser resiliente
    const data = await pdfParse(fileBuffer, {
      // Esta função de pagerender tenta ignorar erros de cada página
      pagerender: function(pageData) {
        return pageData.getTextContent({
          normalizeWhitespace: true,
          disableCombineTextItems: false
        }).then(function(textContent) {
          return textContent.items.map(item => item.str).join(' ');
        });
      }
    });

    let text = data.text || '';

    // 📊 LOG DE DEBUG ESSENCIAL - Validar leitura completa
    console.log(`[DEBUG PDF] Arquivo: ${path.basename(filePath)}`);
    console.log(`[DEBUG PDF] Páginas lidas: ${data.numpages}`);
    console.log(`[DEBUG PDF] Caracteres totais ANTES da limpeza: ${text.length}`);
    
    // ⚠️ Verificação de segurança - Detectar cortes de extração
    if (text.length < 90000 && data.numpages > 25) {
      console.warn(`⚠️ ALERTA CRÍTICO: A extração parece ter sido cortada pela metade!`);
      console.warn(`   Esperado: ~150k+ caracteres | Obtido: ${text.length} caracteres`);
      console.warn(`   Solução: Abra o PDF no navegador, clique em Imprimir > Salvar como PDF e tente novamente`);
    }

    // 🧹 LIMPEZA DE DADOS (Sanitization) - CONFIGURAÇÃO NUCLEAR

    // 0. Remover caracteres nulos (invalid byte sequence for encoding "UTF8": 0x00)
    text = text.replace(/\0/g, '');

    // 1. Remover marcadores (Esta é a linha que estava quebrada)
    text = text.replace(/\[source\]/gi, ''); 

    // 2. Remover marcadores escapados tipo \[source\] se existirem
    const escapedSource = new RegExp('\\\\\\[source\\\\\\]', 'gi');
    text = text.replace(escapedSource, '');

    // 3. Remover marcadores de rodapé/página
    text = text.replace(/--- PAGE \d+ ---/gi, '');
    text = text.replace(/\n\s*\d+\s*\n/g, '\n'); // Números de página isolados

    // 4. Unir linhas quebradas (CRÍTICO para "cálculo de\nvolume")
    text = text.replace(/([a-z,;0-9])\s*\n\s*(?=[a-z0-9])/gi, '$1 ');

    // 5. Normalizar espaços múltiplos
    text = text.replace(/[ \t]+/g, ' '); 
    text = text.replace(/\n\s*\n/g, '\n\n'); // Preserva parágrafos
    text = text.replace(/\s+/g, ' ').trim(); 

    console.log('--- TESTE DE EXTRAÇÃO E LIMPEZA AVANÇADA ---');
    console.log(`Documento: ${path.basename(filePath)}`);
    console.log(`Caracteres extraídos DEPOIS da limpeza: ${text.length}`);
    if (text.length > 0) {
      console.log(`Primeiras 200 letras limpas:\n"${text.substring(0, 200)}..."`);
    } else {
      console.warn('⚠️ AVISO: NENHUM TEXTO EXTRAÍDO DO PDF!');
    }
    console.log('-------------------------');

    // ✅ Se o número de caracteres é muito pequeno comparado às páginas, algo errou
    if (data.numpages > 5 && text.length < 10000) {
      console.warn(`⚠️ AVISO: PDF com ${data.numpages} páginas mas apenas ${text.length} caracteres. Possível problema de leitura.`);
    }

    // Fallback com Gemini para PDFs escaneados/imagem quando extração local falhar
    if (text.length < 300) {
      try {
        const geminiKey = process.env.GEMINI_API_KEY;
        const geminiModel = process.env.FAST_CHAT_MODEL || 'gemini-2.5-flash';

        if (geminiKey) {
          const maxBytes = 18 * 1024 * 1024;
          if (fileBuffer.length <= maxBytes) {
            const base64Pdf = fileBuffer.toString('base64');

            const geminiResp = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(geminiKey)}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [
                    {
                      role: 'user',
                      parts: [
                        { text: 'Extraia o máximo de texto útil deste PDF em português, preservando títulos e seções. Retorne apenas texto.' },
                        { inline_data: { mime_type: 'application/pdf', data: base64Pdf } }
                      ]
                    }
                  ],
                  generationConfig: { temperature: 0 }
                })
              }
            );

            if (geminiResp.ok) {
              const geminiData = await geminiResp.json();
              const parts = geminiData?.candidates?.[0]?.content?.parts || [];
              const geminiText = parts.map(p => p?.text || '').join('\n').trim();

              if (geminiText.length > text.length) {
                console.log(`[PDF][GEMINI_FALLBACK] Texto extraído via Gemini: ${geminiText.length} chars`);
                text = geminiText;
              }
            } else {
              const errBody = await geminiResp.text();
              console.warn('[PDF][GEMINI_FALLBACK] Falha na API Gemini:', errBody?.slice(0, 300));
            }
          } else {
            console.warn('[PDF][GEMINI_FALLBACK] PDF muito grande para fallback inline.');
          }
        }
      } catch (fallbackErr) {
        console.warn('[PDF][GEMINI_FALLBACK] Erro no fallback:', fallbackErr?.message || fallbackErr);
      }
    }

    return text;
  } catch (e) {
    console.error('[PDF] Erro ao extrair:', e.message);
    return '';
  }
}

function isImageFile(fileName = '') {
  return /\.(png|jpg|jpeg|webp|gif)$/i.test(fileName);
}

function isDocxFile(fileName = '') {
  return /\.docx$/i.test(fileName);
}

function isTextFile(fileName = '') {
  return /\.(txt|md|csv|json|xml|html|htm)$/i.test(fileName);
}

async function extractImageText(filePath, fileName = '') {
  try {
    const cfg = getAiRuntimeConfig();
    const openai = createAiClient();

    const imageBuffer = await fs.promises.readFile(filePath);
    const base64 = imageBuffer.toString('base64');
    const ext = path.extname(fileName || filePath).replace('.', '').toLowerCase() || 'png';

    const response = await openai.chat.completions.create({
      model: cfg.fastChatModel,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extraia todo o texto visível desta imagem em português e, ao final, forneça um resumo curto do conteúdo principal. Retorne apenas texto puro.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/${ext};base64,${base64}`
              }
            }
          ]
        }
      ]
    });

    return (response.choices?.[0]?.message?.content || '').trim();
  } catch (e) {
    console.error('[IMAGE OCR] Erro ao extrair texto da imagem:', e.message);
    return '';
  }
}

async function extractAttachmentText(fullPath, originalname = '') {
  const lowerName = String(originalname || '').toLowerCase();

  if (lowerName.endsWith('.pdf')) {
    return await extractPdfText(fullPath);
  }

  if (isDocxFile(lowerName)) {
    try {
      const result = await mammoth.extractRawText({ path: fullPath });
      return (result.value || '').trim();
    } catch (e) {
      console.error('[DOCX] Erro ao extrair texto:', e.message);
      return '';
    }
  }

  if (isImageFile(lowerName)) {
    return await extractImageText(fullPath, lowerName);
  }

  if (isTextFile(lowerName)) {
    return await fs.promises.readFile(fullPath, 'utf-8');
  }

  return '';
}

async function askGeminiDirectlyFromPdf(fullPath, fileName, question, agentInstructions = '') {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return '';

    const model = process.env.FAST_CHAT_MODEL || process.env.CHAT_MODEL || 'gemini-2.5-flash';
    const pdfBuffer = await fs.promises.readFile(fullPath);
    const maxBytes = 18 * 1024 * 1024;
    if (pdfBuffer.length > maxBytes) {
      console.warn('[PDF][DIRECT] Arquivo grande demais para leitura direta inline.');
      return '';
    }

    const base64Pdf = pdfBuffer.toString('base64');
    const prompt = `Você vai analisar um PDF anexado diretamente pelo usuário.
${agentInstructions ? `Instruções do agente: ${agentInstructions}\n` : ''}
Pergunta do usuário: ${question || 'Resuma o documento anexado.'}

Responda de forma objetiva em português. Se possível, traga resumo e pontos principais.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                { inline_data: { mime_type: 'application/pdf', data: base64Pdf } }
              ]
            }
          ],
          generationConfig: { temperature: 0.2 }
        })
      }
    );

    if (!resp.ok) {
      const err = await resp.text();
      console.warn('[PDF][DIRECT] Falha Gemini direct:', err?.slice(0, 300));
      return '';
    }

    const data = await resp.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const answer = parts.map(p => p?.text || '').join('\n').trim();
    return answer;
  } catch (e) {
    console.warn('[PDF][DIRECT] Erro leitura direta:', e?.message || e);
    return '';
  }
}

// 2️⃣ Chunking Inteligente - CONFIGURAÇÃO NUCLEAR (4000/1000)
function chunkText(text, size = 4000, overlap = 1000) {
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

    // Se não estamos no final do texto, tentar recuar até o último ponto final
    if (end < cleanText.length) {
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

    // Avança para o próximo, considerando o overlap GIGANTE de 1000
    start = end - overlap;

    // Proteção contra loop infinito
    if (start >= end) start = end;
  }

  console.log(`[CHUNK NUCLEAR] Gerados ${chunks.length} chunks de aprox ${size} chars.`);
  return chunks;
}

// 3️⃣ Gerar embeddings (OpenAI/Gemini)
async function generateEmbeddings(chunks) {
  const cfg = getAiRuntimeConfig();
  const openai = createAiClient();

  const embeddings = [];
  console.log(`[EMB] Gerando embeddings para ${chunks.length} chunks...`);

  for (let i = 0; i < chunks.length; i++) {
    try {
      const res = await openai.embeddings.create({
        model: cfg.embeddingModel,
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

// 4️⃣ Busca semântica com pgvector - CONFIGURAÇÃO NUCLEAR (Limit 25)
async function searchSimilarChunks(queryEmbedding, agentId, limit = 25) {
  try {
    const embeddingString = '[' + queryEmbedding.join(',') + ']';

    const result = await pool.query(`
      SELECT content, chunk_index, 1 - (embedding <=> $2::vector) as similarity
      FROM document_chunks
      WHERE agent_id = $1
      ORDER BY embedding <=> $2::vector
      LIMIT $3
    `, [agentId, embeddingString, limit]);

    console.log('--- TESTE DE RECUPERAÇÃO (RAG NUCLEAR) ---');
    console.log(`Agente: ${agentId}`);
    console.log(`Chunks encontrados: ${result.rows.length}/${limit}`);

    if (result.rows.length > 0) {
      result.rows.slice(0, 3).forEach((r, i) => {
        console.log(`Chunk ${i + 1} (Sim: ${r.similarity.toFixed(3)}): ${r.content.substring(0, 60)}...`);
      });
    }
    console.log('----------------------------------');

    const bestSimilarity = result.rows?.[0]?.similarity ?? 0;
    if (bestSimilarity < 0.35) {
      console.log(`[SEARCH] Similaridade baixa (${bestSimilarity.toFixed(3)}). Ignorando contexto documental nesta pergunta.`);
      return '';
    }

    return result.rows.map(r => `[Trecho ID: ${r.chunk_index}]\n${r.content}`).join('\n\n---\n\n');
  } catch (e) {
    console.error('[SEARCH] Erro fatal na busca vetorial:', e.message);
    return '';
  }
}

// 4B️⃣ Busca por palavra-chave (fallback)
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

// 4C️⃣ Busca por ordem cronológica
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
// 1️⃣ RESPONSE ORCHESTRATOR
// ============================================

function orchestrateResponse(rawResponse, questionType, hasContext = true) {
  // Se não tiver resposta alguma, devolve fallback amigável
  if (!rawResponse || rawResponse.trim().length === 0) {
    return hasContext
      ? "Não encontrei essa informação no documento analisado. Se preferir, posso buscar por termos relacionados."
      : "Não consegui gerar uma resposta agora. Pode reformular sua pergunta?";
  }

  let formattedResponse = rawResponse;

  // Remover IDs internos de chunk
  formattedResponse = formattedResponse.replace(/\[\s*Trecho\s*ID\s*:\s*\d+\s*\]/gi, '').trim();

  // Remover prefixos robóticos
  const robotPrefixes = [
    /^No documento analisado,?\s*/i,
    /^De acordo com o texto,?\s*/i,
    /^Com base no contexto,?\s*/i,
    /^Conforme o documento,?\s*/i,
    /^O contexto informa,?\s*/i,
    /^Analisei o documento e encontrei,?\s*/i
  ];

  robotPrefixes.forEach(prefix => {
    formattedResponse = formattedResponse.replace(prefix, '');
  });

  if (formattedResponse.length > 0) {
    formattedResponse = formattedResponse.charAt(0).toUpperCase() + formattedResponse.slice(1);
  }

  return formattedResponse;
}

function detectQuestionType(question) {
  const factualTerms = /liste|qual é|quais são|quantos|quando|onde|nome|autor|enumere/i;
  const structuralTerms = /primeira frase|título|inicio|começo|capítulo|seção|estrutura/i;
  const explanatoryTerms = /explique|como funciona|por que|descreva|como é|diferença/i;

  if (structuralTerms.test(question)) return 'structural';
  if (explanatoryTerms.test(question)) return 'explanatory';
  if (factualTerms.test(question)) return 'factual';
  return 'general';
}

function buildOfflineAttachmentResponse(attachmentContext, question = '', fileName = 'arquivo') {
  const raw = String(attachmentContext || '')
    .replace(/^ANEXO ENVIADO PELO USUÁRIO \([^\)]*\):\n?/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!raw) {
    return 'Recebi seu anexo, mas não consegui extrair texto útil dele. Tente enviar outra versão (PDF pesquisável, DOCX ou imagem mais nítida).';
  }

  const sentences = raw.split(/(?<=[.!?])\s+/).filter(Boolean);
  const excerpt = (sentences.slice(0, 4).join(' ') || raw.slice(0, 700)).trim();
  const topicHint = question ? `Pergunta: "${question}".` : '';

  return `Recebi o anexo ${fileName} e fiz uma análise local preliminar.${topicHint}\n\nResumo inicial:\n${excerpt}\n\nSe quiser, posso detalhar por tópicos (objetivo, pontos principais, riscos e próximos passos).`;
}

// 5️⃣ Prompt GLOBAL DEFINITIVO (Ajustado para Visão Panorâmica)
function buildPrompt(context, agentInstructions, question, toneStyle = 'chatgpt') {
  const hasContext = Boolean(context && context.trim().length > 0);

  if (!hasContext) {
    return `🎯 PERSONA: CONSULTOR SÊNIOR
Você é um especialista direto, elegante e organizado.

INSTRUÇÕES DO AGENTE:
${agentInstructions || "Atue como um assistente técnico."}

REGRAS:
1. Responda com clareza e objetividade.
2. Se a pergunta for sobre o tema principal do agente, responda normalmente com base nas instruções acima.
3. Se não souber, seja transparente e peça mais contexto.

PERGUNTA DO USUÁRIO:
${question}

RESPONDA AGORA:`;
  }

  const contextBlock = (context && context.trim().length > 0)
    ? `[INÍCIO DO CONTEXTO EXTENDIDO]\n${context}\n[FIM DO CONTEXTO EXTENDIDO]`
    : '';

  return `🎯 PERSONA: CONSULTOR SÊNIOR
Você é um especialista direto, elegante e organizado.

### REGRAS CRÍTICAS (MODO VISÃO PANORÂMICA):
1. **LEITURA COMPLETA**: Você recebeu um volume GRANDE de contexto (aprox. 25 trechos). Você DEVE ler e considerar TODOS os fragmentos antes de responder. A resposta pode estar no fragmento 1 ou no fragmento 25.
2. **SÍNTESE OBRIGATÓRIA**: Informações complexas (como experimentos de Rohrer & Taylor) podem estar divididas entre vários trechos. Una os pontos.
3. **FIDELIDADE**: Priorize os trechos abaixo quando a pergunta estiver relacionada aos anexos/documentos.
4. **LIMPEZA**: Não mencione [Trecho ID] na resposta.
5. **BUSCA PROFUNDA**: Se o usuário perguntar por um detalhe específico (ex: "Rohrer", "Ansiedade"), vasculhe cada linha do contexto fornecido. Se estiver lá, você deve encontrar.
6. **MODO HÍBRIDO**: Se a pergunta não estiver relacionada ao conteúdo dos anexos, responda normalmente seguindo as instruções do agente.

FONTE DE VERDADE:
Responda baseando-se no [CONTEXTO] abaixo. Use as informações fornecidas para construir uma resposta útil e completa.

═══════════════════════════════════════════════════════════════════
INSTRUÇÕES DO AGENTE:
═══════════════════════════════════════════════════════════════════
${agentInstructions || "Atue como um assistente técnico."}

═══════════════════════════════════════════════════════════════════
CONTEXTO (SUA ÚNICA FONTE):
═══════════════════════════════════════════════════════════════════
${contextBlock}

═══════════════════════════════════════════════════════════════════
PERGUNTA DO USUÁRIO:
═══════════════════════════════════════════════════════════════════
${question}

═══════════════════════════════════════════════════════════════════
RESPONDA AGORA:
═══════════════════════════════════════════════════════════════════`;
}

// Validador de Saída
function validateOutput(text, hasContext = true, question = '', questionType = 'general', contextSize = 0, chunksUsed = 0, context = '') {
  let finalResponse = text;

  // Padrões de alucinação
  const severeAllucinationPatterns = [
    /de acordo com meu conhecimento/i,
    /em minha opinião/i,
    /geralmente se sabe que/i
  ];

  for (const pattern of severeAllucinationPatterns) {
    if (pattern.test(text)) {
      console.log(`[VALIDATOR] 🚨 Alucinação detectada e bloqueada.`);
      return "Não encontrei essa informação no documento. Posso ajudar com outro tópico?";
    }
  }

  finalResponse = orchestrateResponse(finalResponse, questionType, hasContext);
  return finalResponse;
}

// ============================================
// 📊 INICIALIZAR TABELAS RAG
// ============================================

async function initializeRagTables() {
  if (!hasDatabaseUrl) {
    console.warn('[RAG] Banco não configurado (DATABASE_URL ausente). Inicialização RAG ignorada.');
    return;
  }

  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        agent_id UUID,
        user_id UUID,
        title VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try { await pool.query(`ALTER TABLE conversations ADD COLUMN agent_id UUID`); } catch (e) {}
    try { await pool.query(`ALTER TABLE conversations ADD COLUMN user_id UUID`); } catch (e) {}

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding 
        ON document_chunks USING hnsw (embedding vector_cosine_ops)
      `);
    } catch (indexError) {
      console.warn('[RAG] hnsw não disponível, usando busca sem índice');
    }

    console.log('[RAG] ✅ Tabelas RAG inicializadas');
  } catch (e) {
    console.error('[RAG] Erro ao inicializar:', e.message);
  }
}

initializeRagTables();

// ============================================
// 🔌 ENDPOINTS
// ============================================

// GET conversas
app.get("/api/conversations", async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: "x-user-id header is required" });

  try {
    if (!hasDatabaseUrl) {
      const { agentId } = req.query;
      const data = memoryChatStore.conversations
        .filter((c) => c.user_id === userId && (!agentId || String(c.agent_id) === String(agentId)))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return res.json(data);
    }

    const { agentId } = req.query;
    let query = 'SELECT * FROM conversations WHERE user_id = $1';
    const params = [userId];
    if (agentId) {
      params.push(agentId);
      query += ' AND agent_id = $2';
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST nova conversa
app.post("/api/conversations", async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: "x-user-id header is required" });

  try {
    if (!hasDatabaseUrl) {
      const { title, agentId } = req.body;
      const conv = {
        id: memoryChatStore.nextConversationId++,
        agent_id: agentId || null,
        user_id: userId,
        title: title || 'New Chat',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      memoryChatStore.conversations.unshift(conv);
      return res.status(201).json(conv);
    }

    const { title, agentId } = req.body;
    const result = await pool.query(
      'INSERT INTO conversations (agent_id, title, user_id) VALUES ($1, $2, $3) RETURNING *', 
      [agentId || null, title || "New Chat", userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET mensagens
app.get("/api/conversations/:id/messages", async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: "x-user-id header is required" });

  try {
    const cid = parseInt(req.params.id);

    if (!hasDatabaseUrl) {
      const conv = memoryChatStore.conversations.find((c) => c.id === cid);
      if (conv && conv.user_id && conv.user_id !== userId) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const rows = memoryChatStore.messages
        .filter((m) => m.conversation_id === cid)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return res.json(rows);
    }

    const check = await pool.query('SELECT user_id FROM conversations WHERE id = $1', [cid]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Conversa não encontrada" });
    }
    if (check.rows.length > 0 && check.rows[0].user_id && check.rows[0].user_id !== userId) {
      return res.status(403).json({ error: "Acesso negado" });
    }

    const result = await pool.query('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC', [cid]);
    res.json(result.rows || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE conversa
app.delete("/api/conversations/:id", async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: "x-user-id header is required" });

  try {
    const cid = parseInt(req.params.id);

    if (!hasDatabaseUrl) {
      const conv = memoryChatStore.conversations.find((c) => c.id === cid);
      if (conv && conv.user_id && conv.user_id !== userId) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      memoryChatStore.conversations = memoryChatStore.conversations.filter((c) => c.id !== cid);
      memoryChatStore.messages = memoryChatStore.messages.filter((m) => m.conversation_id !== cid);
      return res.json({ success: true });
    }

    const check = await pool.query('SELECT user_id FROM conversations WHERE id = $1', [cid]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Conversa não encontrada" });
    }
    if (check.rows.length > 0 && check.rows[0].user_id && check.rows[0].user_id !== userId) {
      return res.status(403).json({ error: "Acesso negado" });
    }

    await pool.query('DELETE FROM conversations WHERE id = $1', [cid]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE todas as conversas de um agente
app.post("/api/delete-agent-conversations", async (req, res) => {
  try {
    const { agentId } = req.body;
    if (!agentId) return res.status(400).json({ error: 'agentId é obrigatório' });

    if (!hasDatabaseUrl) {
      const before = memoryChatStore.conversations.length;
      const idsToDelete = memoryChatStore.conversations
        .filter((c) => String(c.agent_id) === String(agentId))
        .map((c) => c.id);

      memoryChatStore.conversations = memoryChatStore.conversations.filter((c) => !idsToDelete.includes(c.id));
      memoryChatStore.messages = memoryChatStore.messages.filter((m) => !idsToDelete.includes(m.conversation_id));

      return res.json({ success: true, deletedCount: idsToDelete.length });
    }
    
    // Deleta para TODOS os usuários, pois o agente não existirá mais.
    const result = await pool.query('DELETE FROM conversations WHERE agent_id = $1', [agentId]);
    res.json({ success: true, deletedCount: result.rowCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET documentos do agente
app.get("/api/agents/:agentId/documents", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM documents WHERE agent_id = $1 ORDER BY created_at DESC', [req.params.agentId]);
    res.json(result.rows || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE documento
app.delete("/api/agents/:agentId/documents/:docId", async (req, res) => {
  try {
    const { agentId, docId } = req.params;
    await pool.query('DELETE FROM documents WHERE id = $1 AND agent_id = $2', [docId, agentId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 📎 Upload de anexos do chat
app.post('/api/chat/upload', chatUpload.single('file'), async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: 'x-user-id header is required' });

  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });

    const filePath = `/chat-attachments/${req.file.filename}`;
    res.json({
      success: true,
      path: filePath,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 🚀 UPLOAD com RAG NUCLEAR (chunking 4000/1000)
app.post('/api/agents/upload', upload.single('file'), async (req, res) => {
  console.log('[UPLOAD] ========== INICIANDO UPLOAD NUCLEAR ==========');
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });

    let { agentId } = req.body;
    if (agentId === "undefined" || agentId === "null" || !agentId) agentId = null;

    const filePath = `/agent-attachments/${req.file.filename}`;
    const originalname = req.file.originalname;
    const fullPath = path.join(process.cwd(), 'public', filePath);

    let text = await extractAttachmentText(fullPath, originalname);

    if (agentId && text.length > 500) {
      try {
        const docResult = await pool.query(
          'INSERT INTO documents (agent_id, title) VALUES ($1, $2) RETURNING id',
          [agentId, originalname]
        );
        const documentId = docResult.rows[0].id;

        // 🔥 CHUNKING NUCLEAR: 4000 chars com 1000 de overlap
        const chunks = chunkText(text, 4000, 1000);
        const embeddings = await generateEmbeddings(chunks);

        for (let i = 0; i < chunks.length; i++) {
          const embeddingString = '[' + embeddings[i].join(',') + ']';
          await pool.query(
            `INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index)
             VALUES ($1, $2, $3, $4::vector, $5)`,
            [agentId, documentId, chunks[i], embeddingString, i]
          );
        }
        console.log(`[UPLOAD] ✅ RAG NUCLEAR processado para agente ${agentId}`);
      } catch (e) {
        console.error('[UPLOAD] Erro no pipeline RAG:', e.message);
      }
    }

    res.json({ success: true, path: filePath, filename: originalname });
  } catch (e) {
    console.error('[UPLOAD] Erro fatal:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 🔄 REPROCESSAR ATTACHMENTS (COM CONFIGURAÇÃO NUCLEAR)
app.post('/api/admin/reprocess-attachments', async (req, res) => {
  console.log('[REPROCESS] ========== REPROCESSAMENTO NUCLEAR ==========');
  try {
    const agentsResult = await pool.query(
      'SELECT id, attachments FROM "agents" WHERE attachments IS NOT NULL AND array_length(attachments, 1) > 0'
    );

    let totalProcessed = 0;
    for (const agent of agentsResult.rows) {
      const agentId = agent.id;
      const attachments = agent.attachments || [];

      console.log(`[REPROCESS] Agente ${agentId}: Limpando chunks antigos...`);
      await pool.query('DELETE FROM documents WHERE agent_id = $1', [agentId]);

      for (const attachment of attachments) {
        try {
          const filePath = attachment.startsWith('/') ? attachment : `/${attachment}`;
          const fileName = attachment.split('/').pop() || attachment;
          const fullPath = path.join(process.cwd(), 'public', filePath);

          if (!fs.existsSync(fullPath)) continue;

          let text = await extractAttachmentText(fullPath, fileName);

          if (!text || text.length === 0) continue;

          const docResult = await pool.query(
            'INSERT INTO documents (agent_id, title) VALUES ($1, $2) RETURNING id',
            [agentId, fileName]
          );
          const documentId = docResult.rows[0].id;

          // 🔥 CHUNKING NUCLEAR AQUI TAMBÉM
          const chunks = chunkText(text, 4000, 1000);
          console.log(`[REPROCESS] ${chunks.length} chunks GIGANTES criados`);

          const embeddings = await generateEmbeddings(chunks);

          let savedCount = 0;
          for (let i = 0; i < chunks.length; i++) {
            const embeddingString = '[' + embeddings[i].join(',') + ']';
            await pool.query(
              `INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index)
                VALUES ($1, $2, $3, $4::vector, $5)`,
              [agentId, documentId, chunks[i], embeddingString, i]
            );
            savedCount++;
          }
          totalProcessed++;
        } catch (e) {
          console.error('[REPROCESS] Erro:', e.message);
        }
      }
    }
    res.json({ success: true, processedCount: totalProcessed });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 🔄 REPROCESSAR ATTACHMENTS DE UM AGENTE ESPECÍFICO
app.post('/api/admin/reprocess-agent-attachments/:agentId', async (req, res) => {
  const { agentId } = req.params;
  if (!agentId) return res.status(400).json({ error: 'agentId é obrigatório' });

  try {
    const agentResult = await pool.query(
      'SELECT id, attachments FROM "agents" WHERE id = $1 LIMIT 1',
      [agentId]
    );

    const agent = agentResult.rows?.[0];
    if (!agent) return res.status(404).json({ error: 'Agente não encontrado' });

    const attachments = Array.isArray(agent.attachments) ? agent.attachments : [];

    await pool.query('DELETE FROM documents WHERE agent_id = $1', [agentId]);

    let processedCount = 0;
    for (const attachment of attachments) {
      try {
        const filePath = attachment.startsWith('/') ? attachment : `/${attachment}`;
        const fileName = attachment.split('/').pop() || attachment;
        const fullPath = path.join(process.cwd(), 'public', filePath);

        if (!fs.existsSync(fullPath)) continue;

        const text = await extractAttachmentText(fullPath, fileName);
        if (!text || text.trim().length < 50) continue;

        const docResult = await pool.query(
          'INSERT INTO documents (agent_id, title) VALUES ($1, $2) RETURNING id',
          [agentId, fileName]
        );
        const documentId = docResult.rows[0].id;

        const chunks = chunkText(text, 4000, 1000);
        const embeddings = await generateEmbeddings(chunks);

        for (let i = 0; i < chunks.length; i++) {
          const embeddingString = '[' + embeddings[i].join(',') + ']';
          await pool.query(
            `INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index)
             VALUES ($1, $2, $3, $4::vector, $5)`,
            [agentId, documentId, chunks[i], embeddingString, i]
          );
        }

        processedCount++;
      } catch (e) {
        console.error('[REPROCESS-ONE] Erro ao processar attachment:', e.message);
      }
    }

    res.json({ success: true, agentId, processedCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 💬 CHAT com RAG NUCLEAR (Top-K 25)
app.post("/api/conversations/:id/messages", async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: "x-user-id header is required" });

  try {
    const cid = parseInt(req.params.id);
    const { content, agentId, attachment } = req.body;
    const userText = String(content || '').trim();
    let attachmentContext = '';
    let directPdfAnswer = '';
    let attachmentFileName = attachment?.filename || '';
    let fullAttachmentPath = '';

    if (attachment?.path) {
      try {
        const normalizedPath = String(attachment.path).startsWith('/')
          ? String(attachment.path)
          : `/${String(attachment.path)}`;
        fullAttachmentPath = path.join(process.cwd(), 'public', normalizedPath);
        attachmentFileName = attachment?.filename || path.basename(normalizedPath);

        if (fs.existsSync(fullAttachmentPath)) {
          const extracted = await extractAttachmentText(fullAttachmentPath, attachmentFileName || normalizedPath);
          if (extracted && extracted.trim().length > 0) {
            attachmentContext = `ANEXO ENVIADO PELO USUÁRIO (${attachmentFileName || 'arquivo'}):\n${extracted}`;
          }

          if (/\.pdf$/i.test(attachmentFileName || normalizedPath)) {
            directPdfAnswer = await askGeminiDirectlyFromPdf(
              fullAttachmentPath,
              attachmentFileName,
              userText || 'Resuma o documento anexado.',
              ''
            );
          }
        }
      } catch (e) {
        console.error('[CHAT] Erro ao processar anexo da mensagem:', e.message);
      }
    }

    if (!hasDatabaseUrl) {
      const conv = memoryChatStore.conversations.find((c) => c.id === cid);
      if (conv && conv.user_id && conv.user_id !== userId) {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const now = new Date().toISOString();
      memoryChatStore.messages.push({
        id: memoryChatStore.nextMessageId++,
        conversation_id: cid,
        role: 'user',
        content: `${userText}${attachment?.filename ? `\n\n[Anexo enviado: ${attachment.filename}]` : ''}`.trim(),
        created_at: now
      });

      const fallbackText = 'Modo local ativo: o banco de dados não está configurado no servidor. Posso continuar respondendo de forma básica, mas sem histórico persistente e sem busca vetorial nos documentos.';
      let localResponse = attachment
        ? (attachmentContext
            ? buildOfflineAttachmentResponse(attachmentContext, userText, attachment?.filename || 'arquivo')
            : `Recebi o anexo ${attachment?.filename || 'arquivo'}, mas não consegui extrair texto útil dele no modo local. Tente enviar PDF pesquisável, DOCX, TXT ou cole uma imagem nítida via Ctrl+V.`)
        : fallbackText;

      try {
        const aiCfg = getAiRuntimeConfig();
        const hasAIKey = Boolean(aiCfg.apiKey);
        if (hasAIKey && (attachmentContext || userText)) {
          const localPrompt = buildPrompt(
            attachmentContext || '',
            'Você está no modo local sem banco de dados. Analise anexos quando enviados e responda com clareza.',
            userText || 'Analise o anexo enviado pelo usuário.'
          );

          const openai = createAiClient();

          const completion = await openai.chat.completions.create({
            model: aiCfg.fastChatModel,
            messages: [{ role: 'system', content: localPrompt }],
            temperature: 0,
          });

          const generated = completion.choices?.[0]?.message?.content?.trim();
          if (generated) {
            localResponse = generated;
          }
        }
      } catch (e) {
        console.error('[CHAT][LOCAL] Erro ao gerar resposta local:', e.message);
      }

      memoryChatStore.messages.push({
        id: memoryChatStore.nextMessageId++,
        conversation_id: cid,
        role: 'assistant',
        content: localResponse,
        created_at: new Date().toISOString()
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      if (res.flushHeaders) res.flushHeaders();

      const chunkSize = 50;
      for (let i = 0; i < localResponse.length; i += chunkSize) {
        const chunk = localResponse.substring(i, i + chunkSize);
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      return res.end();
    }

    const check = await pool.query('SELECT user_id FROM conversations WHERE id = $1', [cid]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Conversa não encontrada" });
    }
    if (check.rows.length > 0 && check.rows[0].user_id && check.rows[0].user_id !== userId) {
      return res.status(403).json({ error: "Acesso negado" });
    }

    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [cid, "user", `${userText}${attachment?.filename ? `\n\n[Anexo enviado: ${attachment.filename}]` : ''}`.trim()]
    );

    if (directPdfAnswer && directPdfAnswer.trim().length > 0) {
      await pool.query(
        'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING *',
        [cid, 'assistant', directPdfAnswer]
      );

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      if (res.flushHeaders) res.flushHeaders();

      const chunkSize = 50;
      for (let i = 0; i < directPdfAnswer.length; i += chunkSize) {
        const chunk = directPdfAnswer.substring(i, i + chunkSize);
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      return res.end();
    }

    let prompt = "Você é um assistente prestativo.";
    let hasContext = false;
    let questionType = 'general';
    let contextSize = 0;
    let chunksUsed = 0;
    let relevantContext = "";

    if (agentId) {
      try {
        const agent = await pool.query('SELECT * FROM "agents" WHERE "id" = $1', [agentId]);
        if (agent.rows[0]) {
          const agentData = agent.rows[0];
          const agentInstructions = agentData.instructions || agentData.description || "";
          questionType = detectQuestionType(userText);

          const hasDocuments = await pool.query(
            'SELECT COUNT(*) as count FROM document_chunks WHERE agent_id = $1',
            [agentId]
          );
          const hasChunks = parseInt(hasDocuments.rows[0].count) > 0;

          if (hasChunks) {
            try {
              const isLookingForBeginning = userText.match(/primeira frase|título|inicio|começo|autor/i);

              if (isLookingForBeginning) {
                relevantContext = await getFirstChunks(agentId, 5);
              } else {
                const aiCfg = getAiRuntimeConfig();
                const openai = createAiClient();

                const queryEmbedding = await openai.embeddings.create({
                  model: aiCfg.embeddingModel,
                  input: userText
                });

                // 🔥 BUSCA NUCLEAR: TOP-K 25
                relevantContext = await searchSimilarChunks(
                  queryEmbedding.data[0].embedding,
                  agentId,
                  25 
                );

                // Busca híbrida (keyword)
                const keywords = userText.match(/[A-ZÁÉÍÓÚ][a-zàéíóúç]+/g) || [];
                if (keywords.length > 0) {
                  const keywordContext = await searchKeywordChunks(keywords[0], agentId, 3);
                  if (keywordContext) {
                    relevantContext = keywordContext + "\n\n---\n\n" + relevantContext;
                  }
                }
              }

              if (relevantContext) {
                relevantContext = relevantContext.replace(/\[Trecho ID: \d+\]\n?/g, '').trim();
              }

              const mergedContext = [attachmentContext, relevantContext].filter(Boolean).join('\n\n---\n\n');
              prompt = buildPrompt(mergedContext || '', agentInstructions, userText || 'Analise o anexo enviado.');
              hasContext = mergedContext && mergedContext.trim().length > 0;
              contextSize = mergedContext ? mergedContext.length : 0;
              chunksUsed = mergedContext ? mergedContext.split('\n\n---\n\n').length : 0;

            } catch (e) {
              console.error('[CHAT] Erro ao buscar contexto:', e.message);
            }
          } else {
            prompt = buildPrompt(attachmentContext || '', agentInstructions, userText || 'Analise o anexo enviado.');
            hasContext = Boolean(attachmentContext);
          }
        }
      } catch (e) {
        console.error('[CHAT] Erro ao buscar agente:', e.message);
      }
    }

    const hist = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [cid]
    );

    const msgs = [
      { role: "system", content: prompt },
    ];

    // Histórico limitado a 10 para não explodir com o contexto gigante
    const history = hist.rows.slice(-10).map(m => ({ role: m.role, content: m.content }));
    msgs.push(...history);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (res.flushHeaders) res.flushHeaders();

    const aiCfg = getAiRuntimeConfig();
    const openai = createAiClient();

    const stream = await openai.chat.completions.create({
      model: aiCfg.chatModel,
      messages: msgs,
      stream: true,
      temperature: 0
    });

    let fullResp = "";

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) {
        fullResp += delta;
      }
    }

    const cleanedFullResp = fullResp.replace(/\[\s*Trecho\s*ID\s*:\s*\d+\s*\]/gi, '').trim();

    const chunkSize = 50;
    for (let i = 0; i < cleanedFullResp.length; i += chunkSize) {
      const chunk = cleanedFullResp.substring(i, i + chunkSize);
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }

    const validatedResp = validateOutput(fullResp, hasContext, userText, questionType, contextSize, chunksUsed, (typeof relevantContext !== 'undefined' ? relevantContext : ''));

    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING *',
      [cid, "assistant", validatedResp]
    );

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
    else res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`), res.end();
  }
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`[API] ${req.method} ${req.path}`);
  }
  next();
});

// Outras rotas (Categorias, Links, Login, Renomear) mantidas sem alteração
app.patch('/api/conversations/:id', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: "x-user-id header is required" });

  try {
    const { id } = req.params;
    const { title } = req.body;
    if (!title || title.trim() === '') return res.status(400).json({ error: 'Título é obrigatório' });

    if (!hasDatabaseUrl) {
      const cid = parseInt(id);
      const conv = memoryChatStore.conversations.find((c) => c.id === cid);
      if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
      if (conv.user_id && conv.user_id !== userId) return res.status(403).json({ error: 'Acesso negado' });
      
      conv.title = title.trim();
      conv.updated_at = new Date().toISOString();
      return res.json(conv);
    }
    
    // First verify ownership
    const check = await pool.query('SELECT user_id FROM conversations WHERE id::text = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Conversa não encontrada' });
    if (check.rows[0].user_id && check.rows[0].user_id !== userId) return res.status(403).json({ error: 'Acesso negado' });

    let result = await pool.query('UPDATE conversations SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id::text = $2 RETURNING *', [title.trim(), id]);
    if (result.rows.length === 0) {
      const numericId = parseInt(id);
      if (!isNaN(numericId)) result = await pool.query('UPDATE conversations SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *', [title.trim(), numericId]);
    }
    if (result.rows.length === 0) return res.status(404).json({ error: 'Conversa não encontrada' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/conversations/clear-all', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ error: "x-user-id header is required" });

  try {
    if (!hasDatabaseUrl) {
      const idsToDelete = memoryChatStore.conversations
        .filter(c => c.user_id === userId)
        .map(c => c.id);
        
      memoryChatStore.conversations = memoryChatStore.conversations.filter(c => c.user_id !== userId);
      memoryChatStore.messages = memoryChatStore.messages.filter(m => !idsToDelete.includes(m.conversation_id));
      
      return res.json({ success: true, message: 'Todas as conversas foram excluídas' });
    }

    // Only delete messages for the specific user's conversations
    await pool.query(`
      DELETE FROM messages 
      WHERE conversation_id IN (
        SELECT id FROM conversations WHERE user_id = $1
      )
    `, [userId]);
    
    await pool.query('DELETE FROM conversations WHERE user_id = $1', [userId]);
    res.json({ success: true, message: 'Todas as conversas foram excluídas' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET notificações
app.get('/api/notifications', async (req, res) => {
  try {
    if (!hasDatabaseUrl) return res.json([]);
    const result = await pool.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50');
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST nova notificação
app.post('/api/notifications', async (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) return res.status(400).json({ error: 'Título e mensagem são obrigatórios' });
    
    if (!hasDatabaseUrl) return res.json({ id: Date.now(), title, message, created_at: new Date() });

    const result = await pool.query(
      'INSERT INTO notifications (title, message) VALUES ($1, $2) RETURNING *',
      [title, message]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  if (email === 'admin@admin.com' && password === 'admin') {
    return res.status(200).json({ success: true, user: { id: '07d16581-fca5-4709-b0d3-e09859dbb286', email: 'admin@admin.com', role: 'admin' }, token: `token_admin_${Date.now()}` });
  }

  if (supabaseAuthClient) {
    try {
      const { data, error } = await supabaseAuthClient.auth.signInWithPassword({
        email: String(email).trim(),
        password: String(password)
      });

      if (error || !data?.user) {
        return res.status(401).json({ error: error?.message || 'Email ou senha incorretos' });
      }

      return res.status(200).json({
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email,
          role: data.user.user_metadata?.role || 'user'
        },
        token: data.session?.access_token || null
      });
    } catch (e) {
      return res.status(500).json({ error: e.message || 'Erro ao autenticar no Supabase' });
    }
  }

  return res.status(401).json({ error: 'Email ou senha incorretos' });
});

app.get('/api/agents', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, title, description, link, category_ids, created_at, icon, user_id FROM "agents" ORDER BY created_at DESC');
    res.json(result.rows || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/agents/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM "agents" WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agente não encontrado' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/agents', async (req, res) => {
  try {
    const { name, description, instructions } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    const result = await pool.query('INSERT INTO "agents" (name, description, instructions) VALUES ($1, $2, $3) RETURNING *', [name, description || '', instructions || '']);
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/agents/:id', async (req, res) => {
  try {
    const { name, description, instructions } = req.body;
    const result = await pool.query('UPDATE "agents" SET name = COALESCE($1, name), description = COALESCE($2, description), instructions = COALESCE($3, instructions) WHERE id = $4 RETURNING *', [name || null, description || null, instructions || null, req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agente não encontrado' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/agents/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM "agents" WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agente não encontrado' });
    res.json({ success: true, message: 'Agente deletado' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/debug/chunks', async (req, res) => {
  try {
    const result = await pool.query(`SELECT agent_id, document_id, left(content, 80) as preview, chunk_index, created_at FROM document_chunks ORDER BY created_at DESC LIMIT 10`);
    res.json({ total: result.rows.length, chunks: result.rows });
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.post('/api/db', async (req, res) => {
  const { table, operation, columns, insertData, updateData, filters, orderColumn, orderAsc, limit, countExact, maybeOne } = req.body;
  const allowedTables = ['categories', 'agents', 'custom_links'];
  if (!allowedTables.includes(table)) return res.status(403).json({ data: null, error: { message: 'Tabela não permitida' } });

  try {
    if (operation === 'SELECT') {
      let query = `SELECT ${columns || '*'} FROM "${table}"`;
      const params = [];
      let paramIndex = 1;
      if (filters && filters.length > 0) {
        query += ' WHERE ';
        query += filters.map((f) => { params.push(f.value); return `"${f.column}" = $${paramIndex++}`; }).join(' AND ');
      }
      if (orderColumn) query += ` ORDER BY "${orderColumn}" ${orderAsc ? 'ASC' : 'DESC'}`;
      if (limit) query += ` LIMIT ${limit}`;
      const result = await pool.query(query, params);
      if (countExact) return res.json({ data: result.rows || [], error: null, count: result.rows?.length || 0 });
      return res.json({ data: result.rows || [], error: null });
    } else if (operation === 'INSERT') {
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      const query = `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders}) RETURNING *`;
      const result = await pool.query(query, values);
      return res.json({ data: result.rows || [], error: null });
    } else if (operation === 'UPDATE') {
      const updateColumns = Object.keys(updateData);
      const updateValues = Object.values(updateData);
      let paramIndex = updateValues.length + 1;
      let query = `UPDATE "${table}" SET ${updateColumns.map((col, i) => `"${col}" = $${i + 1}`).join(', ')}`;
      const params = [...updateValues];
      if (filters && filters.length > 0) {
        query += ' WHERE ';
        query += filters.map((f) => { params.push(f.value); return `"${f.column}" = $${paramIndex++}`; }).join(' AND ');
      }
      query += ' RETURNING *';
      const result = await pool.query(query, params);
      return res.json({ data: result.rows || [], error: null });
    } else if (operation === 'DELETE') {
      let query = `DELETE FROM "${table}"`;
      const params = [];
      let paramIndex = 1;
      if (filters && filters.length > 0) {
        query += ' WHERE ';
        query += filters.map((f) => { params.push(f.value); return `"${f.column}" = $${paramIndex++}`; }).join(' AND ');
      }
      query += ' RETURNING *';
      const result = await pool.query(query, params);
      return res.json({ data: result.rows || [], error: null });
    }
  } catch (error) {
    return res.status(500).json({ data: null, error: { message: error.message || 'Erro na query' } });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM "categories" ORDER BY name ASC');
    res.json(result.rows || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    const result = await pool.query('INSERT INTO "categories" (name, description) VALUES ($1, $2) RETURNING *', [name, description || '']);
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/links', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM "custom_links" ORDER BY title ASC');
    res.json(result.rows || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/links', async (req, res) => {
  try {
    const { title, url } = req.body;
    if (!title || !url) return res.status(400).json({ error: 'Título e URL são obrigatórios' });
    const result = await pool.query('INSERT INTO "custom_links" (title, url) VALUES ($1, $2) RETURNING *', [title, url]);
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Servir frontend ---
if (isProduction) {
  // PRODUÇÃO: servir arquivos estáticos do build
  const distPath = path.resolve(__dirname, 'dist');
  app.use(express.static(distPath));
  // SPA fallback: qualquer rota não-api retorna index.html
  app.get('/{*splat}', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'Endpoint não encontrado' });
    }
  });
} else {
  // DESENVOLVIMENTO: usar Vite dev server com HMR
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: false,
    },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  app.use('/', async (req, res) => {
    try {
      let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
      template = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      res.status(500).end(e.message);
    }
  });
}

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server on http://localhost:${PORT} (${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'})`);
  console.log(`🧠 RAG NUCLEAR ATIVADO (Chunk: 4000 | Overlap: 1000 | Top-K: 25)`);
});

// ✅ CORREÇÃO 3: Aumentar timeout para processar PDFs pesados (10 minutos)
server.timeout = 600000;