import express from 'express';
import { createServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
import OpenAI from 'openai';
import multer from 'multer';
import crypto from 'crypto';
const { Pool } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());

// Setup multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'public', 'agent-attachments');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Manter o nome original, garantindo que o encoding esteja correto
    // e removendo apenas caracteres que possam quebrar o sistema de arquivos
    try {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const safeName = originalName.replace(/[<>:"|?*]/g, '_');
      console.log(`[UPLOAD] Salvando arquivo como: ${safeName}`);
      cb(null, safeName);
    } catch (e) {
      console.error('[UPLOAD] Erro ao processar nome do arquivo:', e);
      cb(null, file.originalname);
    }
  }
});

const upload = multer({ storage });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Função para extrair texto de arquivo
async function extractFileContent(filePath, filename) {
  try {
    // Apenas ler arquivos de texto direto - PDFs precisam ser convertidos externamente
    if (filename.toLowerCase().endsWith('.pdf')) {
      return `[Arquivo PDF encontrado: ${filename}. Por favor, extraia o texto do PDF e cole aqui, ou converta para .txt primeiro.]`;
    }
    // Para arquivos de texto, ler diretamente
    return fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    console.error('[FILE] Erro ao extrair conteúdo:', e.message);
    return `[Arquivo não pode ser lido: ${filename}]`;
  }
}

// Função para busca semântica simples (por palavras-chave relevantes)
function findRelevantDocuments(userQuery, documents, maxDocs = 3) {
  if (!documents || documents.length === 0) return [];
  
  const queryWords = userQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  
  const scored = documents.map(doc => {
    const docText = (doc.content || '').toLowerCase();
    const docTitle = (doc.title || '').toLowerCase();
    
    let score = 0;
    queryWords.forEach(word => {
      const titleMatches = (docTitle.match(new RegExp(word, 'g')) || []).length;
      const contentMatches = (docText.match(new RegExp(word, 'g')) || []).length;
      score += (titleMatches * 3) + contentMatches;
    });
    
    return { ...doc, score };
  }).filter(d => d.score > 0);
  
  return scored.sort((a, b) => b.score - a.score).slice(0, maxDocs);
}

// Initialize chat tables
async function initializeChatTables() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS conversations (id SERIAL PRIMARY KEY, title VARCHAR(255) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, role VARCHAR(50) NOT NULL, content TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS agent_documents (id SERIAL PRIMARY KEY, agent_id UUID NOT NULL, title VARCHAR(255) NOT NULL, content TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    console.log('[CHAT] Database tables initialized');
  } catch (e) { console.error('[CHAT] Init error:', e.message); }
}
initializeChatTables();

// Chat API Routes
app.get("/api/conversations", async (req, res) => {
  try { const result = await pool.query('SELECT * FROM conversations ORDER BY created_at DESC'); res.json(result.rows || []); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/conversations", async (req, res) => {
  try {
    const result = await pool.query('INSERT INTO conversations (title) VALUES ($1) RETURNING *', [req.body.title || "New Chat"]);
    res.status(201).json(result.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/conversations/:id/messages", async (req, res) => {
  try {
    const cid = parseInt(req.params.id);
    const result = await pool.query('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC', [cid]);
    res.json(result.rows || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/conversations/:id", async (req, res) => {
  try {
    const cid = parseInt(req.params.id);
    await pool.query('DELETE FROM conversations WHERE id = $1', [cid]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Document upload endpoint
app.post("/api/agents/:agentId/documents", async (req, res) => {
  try {
    const { agentId } = req.params;
    const { title, content } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required" });
    }
    
    const result = await pool.query(
      'INSERT INTO agent_documents (agent_id, title, content) VALUES ($1, $2, $3) RETURNING *',
      [agentId, title, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) { 
    console.error("[DOCS] Error:", e.message);
    res.status(500).json({ error: e.message }); 
  }
});

// Delete document endpoint
app.delete("/api/agents/:agentId/documents/:docId", async (req, res) => {
  try {
    const { agentId, docId } = req.params;
    await pool.query('DELETE FROM agent_documents WHERE id = $1 AND agent_id = $2', [parseInt(docId), agentId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get agent documents
app.get("/api/agents/:agentId/documents", async (req, res) => {
  try {
    const { agentId } = req.params;
    const result = await pool.query('SELECT * FROM agent_documents WHERE agent_id = $1 ORDER BY created_at DESC', [agentId]);
    res.json(result.rows || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Upload endpoint for agent attachments com extração de conteúdo
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
    console.log('[UPLOAD] Extraindo conteúdo do arquivo:', req.file.originalname);
    const content = await extractFileContent(filePath, req.file.originalname);
    
    // Salvar no banco de dados
    const docResult = await pool.query(
      'INSERT INTO agent_documents (agent_id, title, content) VALUES ($1, $2, $3) RETURNING *',
      [agentId, req.file.originalname, content]
    );
    
    console.log(`[UPLOAD] Arquivo "${req.file.originalname}" salvo com sucesso (${content.length} caracteres)`);
    
    const filePath2 = `/agent-attachments/${req.file.filename}`;
    res.json({ 
      path: filePath2, 
      filename: req.file.originalname,
      documentId: docResult.rows[0].id,
      contentLength: content.length
    });
  } catch (e) {
    console.error('[UPLOAD] Erro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/conversations/:id/messages", async (req, res) => {
  try {
    const cid = parseInt(req.params.id);
    const { content, agentId } = req.body;
    await pool.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)', [cid, "user", content]);
    
    let prompt = "Você é um assistente prestativo.";
    let knowledgeBase = "";
    
    if (agentId) {
      try {
        const r = await pool.query('SELECT * FROM "agents" WHERE "id" = $1', [agentId]);
        if (r.rows[0]) {
          const agent = r.rows[0];
          prompt = `Você é o assistente: ${agent.title}. Instruções: ${agent.instructions || agent.description || ""}`;
          
          // Buscar documentos anexados ao agente com busca semântica
          try {
            const docs = await pool.query('SELECT id, content, title FROM "agent_documents" WHERE agent_id = $1 ORDER BY created_at DESC', [agentId]);
            if (docs.rows && docs.rows.length > 0) {
              // Usar busca semântica para encontrar documentos relevantes
              const relevantDocs = findRelevantDocuments(content, docs.rows, 3);
              
              if (relevantDocs.length > 0) {
                knowledgeBase = "\n\n=== BASE DE CONHECIMENTO (DOCUMENTOS RELEVANTES) ===\n";
                relevantDocs.forEach((doc, idx) => {
                  // Limitar tamanho do conteúdo para evitar token limit
                  const maxLength = 2000;
                  const truncatedContent = doc.content.length > maxLength 
                    ? doc.content.substring(0, maxLength) + '...[truncado]'
                    : doc.content;
                  knowledgeBase += `\n--- Documento: ${doc.title} ---\n${truncatedContent}\n`;
                });
                knowledgeBase += "\n=== FIM DA BASE DE CONHECIMENTO ===\n";
                prompt += knowledgeBase + "\n⚠️ INSTRUÇÕES CRÍTICAS: Responda SOMENTE com base nos trechos de documentos acima. Se os documentos não contiverem a resposta, diga que não encontrou a informação na base de conhecimento.";
                console.log(`[CHAT] Usando ${relevantDocs.length} documentos relevantes para a pergunta`);
              } else {
                console.log('[CHAT] Nenhum documento relevante encontrado para a pergunta');
              }
            }
          } catch (e) {
            console.log('[CHAT] Aviso: erro ao buscar documentos do agente:', e.message);
          }
        }
      } catch (e) {}
    }
    
    const hist = await pool.query('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC', [cid]);
    const msgs = [{ role: "system", content: prompt }, ...hist.rows.map(m => ({ role: m.role, content: m.content }))];
    
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (res.flushHeaders) res.flushHeaders();

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    const stream = await openai.chat.completions.create({ model: "gpt-4o", messages: msgs, stream: true });
    let fullResp = "";
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || "";
      if (delta) { fullResp += delta; res.write(`data: ${JSON.stringify({ content: delta })}\n\n`); }
    }
    await pool.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)', [cid, "assistant", fullResp]);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (e) {
    console.error("[CHAT ERROR]", e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
    else res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`), res.end();
  }
});

// API Route - LOGIN
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

// API Route - DB
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
    } 
    else if (operation === 'INSERT') {
      const cols = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      const query = `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders}) RETURNING *`;

      const result = await pool.query(query, values);
      return res.json({ data: result.rows || [], error: null });
    } 
    else if (operation === 'UPDATE') {
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
    } 
    else if (operation === 'DELETE') {
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
    } else {
      return res.status(400).json({ data: null, error: { message: 'Operation inválida' } });
    }
  } catch (error) {
    console.error('DB Error:', error);
    return res.status(500).json({ data: null, error: { message: error.message || 'Erro na query' } });
  }
});

// Vite middleware
const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'spa',
});

app.use(vite.middlewares);

// SPA Fallback
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
});
