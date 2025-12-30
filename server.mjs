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
    const fileBuffer = fs.readFileSync(filePath);
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

// 2️⃣ Chunking (tamanho=800, overlap=300 para melhor contexto)
function chunkText(text, size = 800, overlap = 300) {
  if (!text || text.trim().length === 0) {
    console.warn('[CHUNK] Texto vazio, nenhum chunk criado.');
    return [];
  }
  
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const chunk = text.slice(start, start + size);
    if (chunk.trim().length > 0) {
      chunks.push(chunk);
    }
    start += size - overlap;
  }
  
  console.log('--- TESTE DE CHUNKING ---');
  console.log(`Total de chunks: ${chunks.length}`);
  chunks.slice(0, 3).forEach((c, i) => {
    console.log(`Chunk ${i + 1}: ${c.length} caracteres`);
  });
  console.log('-------------------------');
  
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

// 4️⃣ Busca semântica com pgvector
async function searchSimilarChunks(queryEmbedding, agentId, limit = 12) {
  try {
    const embeddingString = '[' + queryEmbedding.join(',') + ']';
    
    // Corrigido: document_chunks não tem coluna title, apenas content. 
    // O título está na tabela documents se precisarmos de join futuramente.
    const result = await pool.query(`
      SELECT content
      FROM document_chunks
      WHERE agent_id = $1
      ORDER BY embedding <-> $2::vector
      LIMIT $3
    `, [agentId, embeddingString, limit]);
    
    console.log('--- TESTE DE RECUPERAÇÃO (RAG) ---');
    console.log(`Agente: ${agentId}`);
    console.log(`Chunks encontrados: ${result.rows.length}`);
    
    if (result.rows.length > 0) {
      result.rows.forEach((r, i) => {
        console.log(`Chunk ${i + 1}: ${r.content.substring(0, 50).replace(/\n/g, ' ')}...`);
      });
    } else {
      console.warn('⚠️ AVISO: NENHUM CHUNK ENCONTRADO PARA ESTA PERGUNTA!');
    }
    console.log('----------------------------------');
    
    return result.rows.map(r => r.content).join('\n\n---\n\n');
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

  chatgpt: `Você é um assistente conversacional, claro e natural, com o estilo do ChatGPT.

Responda usando somente as informações presentes no CONTEXTO fornecido.
Não utilize conhecimento externo nem faça inferências.

Quando a resposta não estiver no documento:
- Explique isso de forma amigável e natural.
- Evite respostas robóticas ou repetitivas.`
};

// ============================================
// 🎲 FORMATTER DE RESPOSTAS VARIÁVEIS
// ============================================

const negativeResponseVariations = [
  "Não encontrei essa informação no documento analisado.",
  "O texto não aborda esse ponto específico.",
  "Analisei o documento, mas essa informação não está presente.",
  "O documento não apresenta dados sobre isso.",
  "Essa informação não consta no conteúdo fornecido.",
  "Após analisar o documento, não identifiquei essa informação.",
  "O texto analisado não entra nesse detalhe.",
];

function getRandomNegativeResponse() {
  return negativeResponseVariations[Math.floor(Math.random() * negativeResponseVariations.length)];
}

function formatResponse(answer, hasContext) {
  // Se não há contexto, retorna uma resposta variável negativa
  if (!hasContext) {
    return getRandomNegativeResponse();
  }
  // Se há contexto, retorna a resposta normalmente
  return answer;
}

// 5️⃣ Prompt GLOBAL DEFINITIVO e CONTRATO DE CONTEXTO
// PADRÃO: ChatGPT-style (mude para 'formal' ou 'neutral' se necessário)
function buildPrompt(context, agentInstructions, question, toneStyle = 'chatgpt') {
  const selectedTone = toneVariations[toneStyle] || toneVariations.chatgpt;

  const globalPrompt = `🎯 INSTRUÇÕES DE CONTEXTO
${selectedTone}

REGRA DE OURO:
- Você pode variar: a frase, o tom, a fluidez
- Você NÃO pode variar: a fonte, a verdade, o escopo
- NUNCA invente informações que não estão no documento.`;

  const contextBlock = (context && context.trim().length > 0)
    ? `[INÍCIO DO CONTEXTO]\n${context}\n[FIM DO CONTEXTO]`
    : '';

  return `${globalPrompt}

═══════════════════════════════════════════════════════════════════
INSTRUÇÕES ESPECÍFICAS DO AGENTE (TOM E PERSONA):
═══════════════════════════════════════════════════════════════════
${agentInstructions || "Atue como um assistente técnico especializado nos documentos fornecidos."}

═══════════════════════════════════════════════════════════════════
CONTEXTO PADRONIZADO (SUA ÚNICA FONTE DE VERDADE):
═══════════════════════════════════════════════════════════════════
${contextBlock}

═══════════════════════════════════════════════════════════════════
PERGUNTA DO USUÁRIO:
═══════════════════════════════════════════════════════════════════
${question}

═══════════════════════════════════════════════════════════════════
RESPONDA AGORA (apenas com base no contexto acima):
═══════════════════════════════════════════════════════════════════`;
}

// 6️⃣ VALIDADOR DE SAÍDA (Anti-Alucinação - LEVE)
function validateOutput(text, hasContext = true) {
  // Apenas bloqueia respostas que claramente indicam alucinação fora do escopo
  const severeAllucinationPatterns = [
    /de acordo com meu conhecimento/i,
    /em minha opinião/i,
    /geralmente se sabe que/i,
    /é conhecido que/i,
    /segundo a comunidade/i,
  ];

  for (const pattern of severeAllucinationPatterns) {
    if (pattern.test(text)) {
      console.log(`[VALIDATOR] Bloqueando resposta: padrão de alucinação severa detectado`);
      return getRandomNegativeResponse();
    }
  }
  
  // Formata a resposta final (varia as negativas se necessário)
  return formatResponse(text, hasContext);
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

// ============================================
// 🔌 ENDPOINTS
// ============================================

// GET conversas (com suporte a agentId)
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

// DELETE todas as conversas de um agente (cascade)
app.post("/api/delete-agent-conversations", async (req, res) => {
  try {
    const { agentId } = req.body;
    if (!agentId) {
      return res.status(400).json({ error: 'agentId é obrigatório' });
    }
    const result = await pool.query('DELETE FROM conversations WHERE agent_id = $1', [agentId]);
    console.log(`[AGENT] Deletadas ${result.rowCount} conversas do agente ${agentId}`);
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

// 🚀 UPLOAD com RAG (chunking + embeddings)
app.post('/api/agents/upload', upload.single('file'), async (req, res) => {
  console.log('[UPLOAD] ========== INICIANDO UPLOAD ==========');
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });
    }

    let { agentId } = req.body;
    
    // Normalizar agentId
    if (agentId === "undefined" || agentId === "null" || !agentId) {
      agentId = null;
    }

    const filePath = `/agent-attachments/${req.file.filename}`;
    const originalname = req.file.originalname;
    const fullPath = path.join(process.cwd(), 'public', filePath);
    
    console.log(`[UPLOAD] Arquivo: ${originalname}`);
    console.log(`[UPLOAD] AgentId: ${agentId}`);

    // PARTE 1: Extração de Texto com Log Obrigatório
    let text = '';
    if (originalname.toLowerCase().endsWith('.pdf')) {
      text = await extractPdfText(fullPath);
    } else {
      text = fs.readFileSync(fullPath, 'utf-8');
    }

    console.log('--- TESTE DE EXTRAÇÃO (PARTE 1) ---');
    console.log(`Documento: ${originalname}`);
    console.log(`Caracteres extraídos: ${text.length}`);
    if (text.length > 500) {
      console.log(`Primeiras 200 letras:\n"${text.substring(0, 200).replace(/\n/g, ' ')}..."`);
      console.log('✔️ PARTE 1: SUCESSO');
    } else {
      console.warn('❌ PARTE 1: FALHA (Texto insuficiente ou vazio)');
    }
    console.log('-----------------------------------');

    // Se temos um agentId, processamos o restante do RAG
    if (agentId && text.length > 500) {
      try {
        // 2. Criar documento
        const docResult = await pool.query(
          'INSERT INTO documents (agent_id, title) VALUES ($1, $2) RETURNING id',
          [agentId, originalname]
        );
        const documentId = docResult.rows[0].id;

        // 3. Fazer chunks
        const chunks = chunkText(text, 800, 150);

        // 4. Gerar embeddings
        const embeddings = await generateEmbeddings(chunks);

        // 5. Salvar chunks
        for (let i = 0; i < chunks.length; i++) {
          const embeddingString = '[' + embeddings[i].join(',') + ']';
          await pool.query(
            `INSERT INTO document_chunks (agent_id, document_id, content, embedding, chunk_index)
             VALUES ($1, $2, $3, $4::vector, $5)`,
            [agentId, documentId, chunks[i], embeddingString, i]
          );
        }
        console.log(`[UPLOAD] ✅ RAG processado para agente ${agentId}`);
      } catch (e) {
        console.error('[UPLOAD] Erro no pipeline RAG:', e.message);
      }
    }

    res.json({
      success: true,
      path: filePath,
      filename: originalname,
      agentId: agentId,
      extractedLength: text.length
    });
  } catch (e) {
    console.error('[UPLOAD] Erro fatal:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// 🔄 ENDPOINT PARA REPROCESSAR ATTACHMENTS EXISTENTES
app.post('/api/admin/reprocess-attachments', async (req, res) => {
  console.log('[REPROCESS] ========== INICIANDO REPROCESSAMENTO ==========');
  try {
    // Buscar todos os agentes com attachments
    const agentsResult = await pool.query(
      'SELECT id, attachments FROM "agents" WHERE attachments IS NOT NULL AND array_length(attachments, 1) > 0'
    );
    
    console.log(`[REPROCESS] Encontrados ${agentsResult.rows.length} agentes com attachments`);
    
    let totalProcessed = 0;
    for (const agent of agentsResult.rows) {
      const agentId = agent.id;
      const attachments = agent.attachments || [];
      
      console.log(`[REPROCESS] Processando agente ${agentId} com ${attachments.length} arquivo(s)`);
      
      for (const attachment of attachments) {
        try {
          const filePath = attachment.startsWith('/') ? attachment : `/${attachment}`;
          const fileName = attachment.split('/').pop() || attachment;
          const fullPath = path.join(process.cwd(), 'public', filePath);
          
          console.log(`[REPROCESS] Processando: ${filePath}`);
          
          if (!fs.existsSync(fullPath)) {
            console.warn(`[REPROCESS] Arquivo não encontrado: ${fullPath}`);
            continue;
          }
          
          // 1. Extrair texto
          let text = '';
          if (fileName.toLowerCase().endsWith('.pdf')) {
            console.log('[REPROCESS] Extraindo PDF...');
            text = await extractPdfText(fullPath);
          } else {
            console.log('[REPROCESS] Lendo arquivo de texto...');
            text = fs.readFileSync(fullPath, 'utf-8');
          }
          
          console.log(`[REPROCESS] Texto extraído: ${text.length} caracteres`);
          
          if (!text || text.length === 0) {
            console.warn('[REPROCESS] Nenhum texto extraído!');
            continue;
          }
          
          // 2. Criar documento
          const docResult = await pool.query(
            'INSERT INTO documents (agent_id, title) VALUES ($1, $2) RETURNING id',
            [agentId, fileName]
          );
          const documentId = docResult.rows[0].id;
          console.log('[REPROCESS] Documento criado:', documentId);
          
          // 3. Fazer chunks
          const chunks = chunkText(text, 800, 150);
          console.log(`[REPROCESS] ${chunks.length} chunks criados`);
          
          // 4. Gerar embeddings
          const embeddings = await generateEmbeddings(chunks);
          console.log(`[REPROCESS] ${embeddings.length} embeddings gerados`);
          
          // 5. Salvar chunks no banco
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
          
          console.log(`[REPROCESS] ✅ ${savedCount} chunks salvos!`);
          totalProcessed++;
        } catch (e) {
          console.error('[REPROCESS] Erro ao processar arquivo:', e.message);
        }
      }
    }
    
    res.json({ success: true, processedCount: totalProcessed });
  } catch (e) {
    console.error('[REPROCESS] Erro:', e.message, e.stack);
    res.status(500).json({ error: e.message });
  }
});

// 💬 CHAT com busca semântica RAG
app.post("/api/conversations/:id/messages", async (req, res) => {
  try {
    const cid = parseInt(req.params.id);
    const { content, agentId } = req.body;

    // Salvar mensagem do usuário
    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [cid, "user", content]
    );

    let prompt = "Você é um assistente prestativo.";
    let hasContext = false;

    if (agentId) {
      try {
        // Buscar agente
        const agent = await pool.query('SELECT * FROM "agents" WHERE "id" = $1', [agentId]);
        if (agent.rows[0]) {
          const agentData = agent.rows[0];
          const agentInstructions = agentData.instructions || agentData.description || "";

        // 🔍 Verificar se agente tem documentos/chunks associados
        const hasDocuments = await pool.query(
          'SELECT COUNT(*) as count FROM document_chunks WHERE agent_id = $1',
          [agentId]
        );
        const hasChunks = parseInt(hasDocuments.rows[0].count) > 0;
        
        console.log(`[CHAT] AgentId: ${agentId}`);
        console.log(`[CHAT] Chunks no banco: ${hasDocuments.rows[0].count}`);
        console.log(`[CHAT] Modo: ${hasChunks ? 'RAG (com documentos)' : 'NORMAL (só prompt)'}`);

        // 🔍 BUSCA SEMÂNTICA COM RAG (apenas se houver documentos)
        if (hasChunks) {
            try {
              // 🔍 ESTRATÉGIA DE BUSCA INTELIGENTE
              const isLookingForBeginning = content.match(/primeira frase|título|inicio|começo|autor/i);
              let relevantContext = "";

              if (isLookingForBeginning) {
                console.log('[CHAT] Detectada busca por início/título. Priorizando ordem cronológica.');
                relevantContext = await getFirstChunks(agentId, 5);
              } else {
                // Gerar embedding da pergunta
                const openai = new OpenAI({
                  apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
                  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
                });

                const queryEmbedding = await openai.embeddings.create({
                  model: 'text-embedding-3-large',
                  input: content
                });

                // Buscar chunks similares (aumentado de 8 para 12 para garantir que capítulos inteiros sejam capturados)
                relevantContext = await searchSimilarChunks(
                  queryEmbedding.data[0].embedding,
                  agentId,
                  12
                );
              }

              // 🔍 RE-RANKING SIMPLES POR CAPÍTULO/SEÇÃO
              // Se a pergunta menciona "capítulo", "seção", "tópico" ou números
              const strictTermsMatch = content.match(/capítulo|seção|tópico|[\d\.]+|segundo autor/i);
              const chapterTitleMatch = content.match(/Avaliação por Desempenho/i);
              
              if ((strictTermsMatch || chapterTitleMatch) && relevantContext) {
                console.log('[CHAT] MODO RESTRITO ATIVADO: Detectada referência a seção/capítulo/autor');
                const contextLines = relevantContext.split('\n\n---\n\n');
                
                const prioritizedLines = contextLines.filter(line => {
                  const hasTerm = strictTermsMatch && line.toLowerCase().includes(strictTermsMatch[0].toLowerCase());
                  const hasTitle = chapterTitleMatch && line.toLowerCase().includes(chapterTitleMatch[0].toLowerCase());
                  return hasTerm || hasTitle;
                });
                
                if (prioritizedLines.length > 0) {
                  relevantContext = prioritizedLines.join('\n\n---\n\n');
                  console.log(`[CHAT] Busca filtrada com sucesso: ${prioritizedLines.length} chunks relevantes encontrados.`);
                } else {
                  console.log('[CHAT] MODO RESTRITO: Nenhum fragmento específico encontrado. O prompt global forçará a resposta de "não aborda".');
                  relevantContext = ""; // Forçar contexto vazio para acionar regra 4
                }
              }

              // 🔍 DEBUGAR CONTEXTO ANTES DE ENVIAR PARA OPENAI
              console.log('[CHAT] ========== CONTEXTO RAG ==========');
              console.log('[CHAT] Contexto encontrado:', !!relevantContext);
              console.log('[CHAT] Tamanho do contexto:', relevantContext?.length || 0, 'caracteres');
              if (relevantContext && relevantContext.length > 0) {
                console.log('[CHAT] Primeiros 500 chars do contexto:');
                console.log(relevantContext.substring(0, 500));
                console.log('[CHAT] ...truncado...');
              }

              // Construir prompt DEFINITIVO com ordem estrita: Global -> Agent -> Context -> User
              prompt = buildPrompt(relevantContext || '', agentInstructions, content);
              hasContext = relevantContext && relevantContext.trim().length > 0;
              
              if (relevantContext) {
                console.log('[CHAT] ✅ Contexto RAG encontrado e injetado');
              } else {
                console.log('[CHAT] ⚠️ Nenhum contexto encontrado - usando prompt restritivo sem documentos');
              }
            } catch (e) {
              console.error('[CHAT] Erro ao buscar contexto:', e.message);
            }
          } else {
            // 📝 Modo normal: sem documentos, usa as instruções do agente dentro do prompt global
            console.log('[CHAT] ✅ Usando modo normal (prompt do agente sem documentos)');
            prompt = buildPrompt('', agentInstructions, content);
            hasContext = false;
          }
        }
      } catch (e) {
        console.error('[CHAT] Erro ao buscar agente:', e.message);
      }
    }

    // Buscar histórico
    const hist = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [cid]
    );

    const msgs = [
      { role: "system", content: prompt },
    ];
    
    // Adicionar histórico (limitar a 10 mensagens para não estourar contexto)
    const history = hist.rows.slice(-10).map(m => ({ role: m.role, content: m.content }));
    msgs.push(...history);

    console.log('[PROMPT FINAL] ========== ENVIANDO PARA OPENAI ==========');
    console.log(`[PROMPT FINAL] System Prompt Size: ${prompt.length} chars`);
    console.log(`[PROMPT FINAL] History Size: ${history.length} messages`);
    console.log('[PROMPT FINAL] Amostra do Prompt:\n', prompt.substring(0, 500) + '...');
    console.log('[PROMPT FINAL] ==========================================');

    // Stream resposta
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
        res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
      }
    }

    // Aplicar Validação de Saída (Anti-Alucinação)
    const validatedResp = validateOutput(fullResp, hasContext);
    
    // Salvar resposta do assistente (validada)
    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [cid, "assistant", validatedResp]
    );

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (e) {
    console.error("[CHAT ERROR]", e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
    else res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`), res.end();
  }
});

// LOGIN
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }
  if (email === 'admin@admin.com' && password === 'admin') {
    return res.status(200).json({
      success: true,
      user: {
        id: '07d16581-fca5-4709-b0d3-e09859dbb286',
        email: 'admin@admin.com',
        role: 'admin',
      },
      token: `token_admin_${Date.now()}`,
    });
  }
  return res.status(401).json({ error: 'Email ou senha incorretos' });
});

// DB ENDPOINT
app.post('/api/db', async (req, res) => {
  const { table, operation, columns, insertData, updateData, filters, orderColumn, orderAsc, limit, countExact, maybeOne } = req.body;
  try {
    if (!table || !operation) {
      return res.status(400).json({ data: null, error: { message: 'Table e operation são obrigatórios' } });
    }
    if (operation === 'SELECT') {
      let query = `SELECT ${columns || '*'} FROM "${table}"`;
      const params = [];
      let paramIndex = 1;
      if (filters && filters.length > 0) {
        query += ' WHERE ';
        query += filters.map((f) => {
          params.push(f.value);
          return `"${f.column}" = $${paramIndex++}`;
        }).join(' AND ');
      }
      if (orderColumn) {
        query += ` ORDER BY "${orderColumn}" ${orderAsc ? 'ASC' : 'DESC'}`;
      }
      if (limit) {
        query += ` LIMIT ${limit}`;
      }
      const result = await pool.query(query, params);
      if (maybeOne && result.rows.length === 0) {
        return res.json({ data: null, error: null });
      }
      if (countExact) {
        return res.json({ data: result.rows || [], error: null, count: result.rows?.length || 0 });
      }
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
        query += filters.map((f) => {
          params.push(f.value);
          return `"${f.column}" = $${paramIndex++}`;
        }).join(' AND ');
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
        query += filters.map((f) => {
          params.push(f.value);
          return `"${f.column}" = $${paramIndex++}`;
        }).join(' AND ');
      }
      query += ' RETURNING *';
      const result = await pool.query(query, params);
      return res.json({ data: result.rows || [], error: null });
    }
  } catch (error) {
    console.error('DB Error:', error);
    return res.status(500).json({ data: null, error: { message: error.message || 'Erro na query' } });
  }
});

// VITE
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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server on http://localhost:${PORT}`);
  console.log(`🧠 RAG com pgvector habilitado!`);
});
