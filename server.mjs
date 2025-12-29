import express from 'express';
import { createServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
import OpenAI from 'openai';
const { Pool } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initialize chat tables
async function initializeChatTables() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS conversations (id SERIAL PRIMARY KEY, title VARCHAR(255) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, role VARCHAR(50) NOT NULL, content TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
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
          
          // Buscar documentos anexados ao agente
          try {
            const docs = await pool.query('SELECT content, title FROM "agent_documents" WHERE agent_id = $1', [agentId]);
            if (docs.rows && docs.rows.length > 0) {
              knowledgeBase = "\n\n=== BASE DE CONHECIMENTO ===\n";
              docs.rows.forEach((doc, idx) => {
                knowledgeBase += `\n--- Documento ${idx + 1}: ${doc.title} ---\n${doc.content}\n`;
              });
              knowledgeBase += "\n=== FIM DA BASE DE CONHECIMENTO ===\n";
              prompt += knowledgeBase + "\nUse prioritariamente os documentos acima como base para suas respostas.";
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
