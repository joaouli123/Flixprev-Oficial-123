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
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ============================================
// 🧠 FUNÇÕES RAG PROFISSIONAL
// ============================================

// 1️⃣ Extrair e Limpar PDF (CORRIGIDO PARA EVITAR SYNTAX ERROR)
async function extractPdfText(filePath) {
  try {
    const fileBuffer = await fs.promises.readFile(filePath);
    
    // ✅ CORREÇÃO 2: Opções robustas para leitura completa de PDFs longos
    const options = {
      pagerender: function(pageData) {
        return pageData.getTextContent().then(function(textContent) {
          return textContent.items.map(item => item.str).join(' ');
        });
      }
    };
    
    const data = await pdfParse(fileBuffer, options);
    let text = data.text || '';

    // 📊 LOG DE DEBUG ESSENCIAL - Validar leitura completa
    console.log(`[DEBUG PDF] Arquivo: ${path.basename(filePath)}`);
    console.log(`[DEBUG PDF] Páginas lidas: ${data.numpages}`);
    console.log(`[DEBUG PDF] Caracteres totais ANTES da limpeza: ${text.length}`);

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

    return text;
  } catch (e) {
    console.error('[PDF] Erro ao extrair:', e.message);
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
  // Se não tiver resposta e não tiver contexto, manda negativa
  if (!hasContext || !rawResponse || rawResponse.trim().length === 0) {
    return "Não encontrei essa informação no documento analisado. Se preferir, posso buscar por termos relacionados.";
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

// 5️⃣ Prompt GLOBAL DEFINITIVO (Ajustado para Visão Panorâmica)
function buildPrompt(context, agentInstructions, question, toneStyle = 'chatgpt') {
  const contextBlock = (context && context.trim().length > 0)
    ? `[INÍCIO DO CONTEXTO EXTENDIDO]\n${context}\n[FIM DO CONTEXTO EXTENDIDO]`
    : '';

  return `🎯 PERSONA: CONSULTOR SÊNIOR
Você é um especialista direto, elegante e organizado.

### REGRAS CRÍTICAS (MODO VISÃO PANORÂMICA):
1. **LEITURA COMPLETA**: Você recebeu um volume GRANDE de contexto (aprox. 25 trechos). Você DEVE ler e considerar TODOS os fragmentos antes de responder. A resposta pode estar no fragmento 1 ou no fragmento 25.
2. **SÍNTESE OBRIGATÓRIA**: Informações complexas (como experimentos de Rohrer & Taylor) podem estar divididas entre vários trechos. Una os pontos.
3. **FIDELIDADE**: Responda APENAS com base nos trechos abaixo.
4. **LIMPEZA**: Não mencione [Trecho ID] na resposta.
5. **BUSCA PROFUNDA**: Se o usuário perguntar por um detalhe específico (ex: "Rohrer", "Ansiedade"), vasculhe cada linha do contexto fornecido. Se estiver lá, você deve encontrar.

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
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        agent_id UUID,
        title VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try { await pool.query(`ALTER TABLE conversations ADD COLUMN agent_id UUID`); } catch (e) {}

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
  try {
    const { agentId } = req.query;
    let query = 'SELECT * FROM conversations';
    const params = [];
    if (agentId) {
      query += ' WHERE agent_id = $1';
      params.push(agentId);
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
  try {
    const { title, agentId } = req.body;
    const result = await pool.query(
      'INSERT INTO conversations (agent_id, title) VALUES ($1, $2) RETURNING *', 
      [agentId || null, title || "New Chat"]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET mensagens
app.get("/api/conversations/:id/messages", async (req, res) => {
  try {
    const cid = parseInt(req.params.id);
    const result = await pool.query('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC', [cid]);
    res.json(result.rows || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE conversa
app.delete("/api/conversations/:id", async (req, res) => {
  try {
    const cid = parseInt(req.params.id);
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

    let text = '';
    if (originalname.toLowerCase().endsWith('.pdf')) {
      text = await extractPdfText(fullPath);
    } else {
      text = await fs.promises.readFile(fullPath, 'utf-8');
    }

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
      // Opcional: Limpar chunks antigos antes de reprocessar para evitar duplicidade
      // await pool.query('DELETE FROM documents WHERE agent_id = $1', [agentId]); 

      for (const attachment of attachments) {
        try {
          const filePath = attachment.startsWith('/') ? attachment : `/${attachment}`;
          const fileName = attachment.split('/').pop() || attachment;
          const fullPath = path.join(process.cwd(), 'public', filePath);

          if (!fs.existsSync(fullPath)) continue;

          let text = '';
          if (fileName.toLowerCase().endsWith('.pdf')) {
            text = await extractPdfText(fullPath);
          } else {
            text = fs.readFileSync(fullPath, 'utf-8');
          }

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

// 💬 CHAT com RAG NUCLEAR (Top-K 25)
app.post("/api/conversations/:id/messages", async (req, res) => {
  try {
    const cid = parseInt(req.params.id);
    const { content, agentId } = req.body;

    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [cid, "user", content]
    );

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
          questionType = detectQuestionType(content);

          const hasDocuments = await pool.query(
            'SELECT COUNT(*) as count FROM document_chunks WHERE agent_id = $1',
            [agentId]
          );
          const hasChunks = parseInt(hasDocuments.rows[0].count) > 0;

          if (hasChunks) {
            try {
              const isLookingForBeginning = content.match(/primeira frase|título|inicio|começo|autor/i);

              if (isLookingForBeginning) {
                relevantContext = await getFirstChunks(agentId, 5);
              } else {
                const openai = new OpenAI({
                  apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
                  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
                });

                const queryEmbedding = await openai.embeddings.create({
                  model: 'text-embedding-3-large',
                  input: content
                });

                // 🔥 BUSCA NUCLEAR: TOP-K 25
                relevantContext = await searchSimilarChunks(
                  queryEmbedding.data[0].embedding,
                  agentId,
                  25 
                );

                // Busca híbrida (keyword)
                const keywords = content.match(/[A-ZÁÉÍÓÚ][a-zàéíóúç]+/g) || [];
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

              prompt = buildPrompt(relevantContext || '', agentInstructions, content);
              hasContext = relevantContext && relevantContext.trim().length > 0;
              contextSize = relevantContext ? relevantContext.length : 0;
              chunksUsed = relevantContext ? relevantContext.split('\n\n---\n\n').length : 0;

            } catch (e) {
              console.error('[CHAT] Erro ao buscar contexto:', e.message);
            }
          } else {
            prompt = buildPrompt('', agentInstructions, content);
            hasContext = false;
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

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
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

    const validatedResp = validateOutput(fullResp, hasContext, content, questionType, contextSize, chunksUsed, (typeof relevantContext !== 'undefined' ? relevantContext : ''));

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
  try {
    const { id } = req.params;
    const { title } = req.body;
    if (!title || title.trim() === '') return res.status(400).json({ error: 'Título é obrigatório' });
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
  try {
    await pool.query('DELETE FROM messages');
    await pool.query('DELETE FROM conversations');
    res.json({ success: true, message: 'Todas as conversas foram excluídas' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (email === 'admin@admin.com' && password === 'admin') {
    return res.status(200).json({ success: true, user: { id: '07d16581-fca5-4709-b0d3-e09859dbb286', email: 'admin@admin.com', role: 'admin' }, token: `token_admin_${Date.now()}` });
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

const vite = await createServer({
  server: { middlewareMode: true },
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

const PORT = 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server on http://localhost:${PORT}`);
  console.log(`🧠 RAG NUCLEAR ATIVADO (Chunk: 4000 | Overlap: 1000 | Top-K: 25)`);
});

// ✅ CORREÇÃO 3: Aumentar timeout para processar PDFs pesados (10 minutos)
server.timeout = 600000;