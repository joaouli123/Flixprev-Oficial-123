import express from 'express';
import { createServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, createRequire } from 'url';
import pkg from 'pg';
import OpenAI from 'openai';
import multer from 'multer';
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
    return data.text || '';
  } catch (e) {
    console.error('[PDF] Erro ao extrair:', e.message);
    return fs.readFileSync(filePath, 'utf-8').substring(0, 5000);
  }
}

// 2️⃣ Chunking (tamanho=800, overlap=150)
function chunkText(text, size = 800, overlap = 150) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + size));
    start += size - overlap;
  }
  return chunks;
}

// 3️⃣ Gerar embeddings (OpenAI text-embedding-3-large)
async function generateEmbeddings(chunks) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });

  const embeddings = [];
  for (const chunk of chunks) {
    try {
      const res = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: chunk
      });
      embeddings.push(res.data[0].embedding);
      console.log('[EMB] Embedding gerado para chunk');
    } catch (e) {
      console.error('[EMB] Erro:', e.message);
      embeddings.push(Array(3072).fill(0));
    }
  }
  return embeddings;
}

// 4️⃣ Busca semântica com pgvector
async function searchSimilarChunks(queryEmbedding, agentId, limit = 5) {
  try {
    const result = await pool.query(`
      SELECT content, title
      FROM document_chunks
      WHERE agent_id = $1
      ORDER BY embedding <-> $2::vector
      LIMIT $3
    `, [agentId, JSON.stringify(queryEmbedding), limit]);
    
    return result.rows.map(r => r.content).join('\n\n---\n\n');
  } catch (e) {
    console.error('[SEARCH] Erro:', e.message);
    return '';
  }
}

// 5️⃣ Prompt RESTRITIVO HARDCORE
function buildPrompt(context, question) {
  return `Você é um assistente que responde EXCLUSIVAMENTE com base no texto abaixo.

REGRAS OBRIGATÓRIAS:
- Use APENAS o conteúdo fornecido abaixo
- NÃO use conhecimento externo ou geral
- NÃO invente autores, datas, números ou conceitos
- NÃO faça suposições sobre o que está escrito
- Se a pergunta não puder ser respondida com o texto, responda EXATAMENTE:
  "O documento não aborda esse ponto."

TEXTO DA BASE DE CONHECIMENTO:
${context || '[Nenhum conteúdo encontrado]'}

PERGUNTA DO USUÁRIO:
${question}

Responda com base APENAS no texto acima:`;
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
        title VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Criar índice para busca rápida
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding 
      ON document_chunks USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `);
    
    console.log('[RAG] ✅ Tabelas RAG inicializadas com sucesso');
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
    const result = await pool.query('SELECT * FROM conversations ORDER BY created_at DESC');
    res.json(result.rows || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST nova conversa
app.post("/api/conversations", async (req, res) => {
  try {
    const result = await pool.query('INSERT INTO conversations (title) VALUES ($1) RETURNING *', [req.body.title || "New Chat"]);
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
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });
    }

    const { agentId } = req.body;
    if (!agentId) {
      return res.status(400).json({ error: 'agentId é obrigatório' });
    }

    const filePath = path.join(process.cwd(), 'public', 'agent-attachments', req.file.filename);
    console.log('[UPLOAD] Iniciando processamento RAG para:', req.file.originalname);

    // 1. Extrair texto
    let text = '';
    if (req.file.originalname.toLowerCase().endsWith('.pdf')) {
      console.log('[UPLOAD] Extraindo PDF...');
      text = await extractPdfText(filePath);
    } else {
      text = fs.readFileSync(filePath, 'utf-8');
    }

    console.log(`[UPLOAD] Texto extraído: ${text.length} caracteres`);

    // 2. Criar documento
    const docResult = await pool.query(
      'INSERT INTO documents (agent_id, title) VALUES ($1, $2) RETURNING id',
      [agentId, req.file.originalname]
    );
    const documentId = docResult.rows[0].id;

    // 3. Fazer chunks
    const chunks = chunkText(text, 800, 150);
    console.log(`[UPLOAD] ${chunks.length} chunks criados`);

    // 4. Gerar embeddings
    const embeddings = await generateEmbeddings(chunks);
    console.log(`[UPLOAD] ${embeddings.length} embeddings gerados`);

    // 5. Salvar chunks no Postgres
    for (let i = 0; i < chunks.length; i++) {
      await pool.query(
        `INSERT INTO document_chunks (agent_id, document_id, content, embedding)
         VALUES ($1, $2, $3, $4)`,
        [agentId, documentId, chunks[i], JSON.stringify(embeddings[i])]
      );
    }

    console.log(`[UPLOAD] ✅ Documento "${req.file.originalname}" indexado com sucesso!`);

    res.json({
      success: true,
      documentId,
      filename: req.file.originalname,
      chunksCount: chunks.length,
      embeddingsCount: embeddings.length
    });
  } catch (e) {
    console.error('[UPLOAD] Erro:', e.message);
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

    if (agentId) {
      try {
        // Buscar agente
        const agent = await pool.query('SELECT * FROM "agents" WHERE "id" = $1', [agentId]);
        if (agent.rows[0]) {
          const agentData = agent.rows[0];
          prompt = `Você é o assistente: ${agentData.title}. Instruções: ${agentData.instructions || agentData.description || ""}`;

          // 🔍 BUSCA SEMÂNTICA COM RAG
          try {
            // Gerar embedding da pergunta
            const openai = new OpenAI({
              apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
              baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
            });

            const queryEmbedding = await openai.embeddings.create({
              model: 'text-embedding-3-large',
              input: content
            });

            // Buscar chunks similares
            const relevantContext = await searchSimilarChunks(
              queryEmbedding.data[0].embedding,
              agentId,
              5
            );

            // Construir prompt com contexto
            if (relevantContext) {
              prompt = buildPrompt(relevantContext, content);
              console.log('[CHAT] ✅ Usando contexto RAG para resposta');
            } else {
              console.log('[CHAT] ⚠️ Nenhum contexto encontrado');
            }
          } catch (e) {
            console.error('[CHAT] Erro ao buscar contexto:', e.message);
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
      ...hist.rows.map(m => ({ role: m.role, content: m.content }))
    ];

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
      stream: true
    });

    let fullResp = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) {
        fullResp += delta;
        res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
      }
    }

    // Salvar resposta do assistente
    await pool.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [cid, "assistant", fullResp]
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
