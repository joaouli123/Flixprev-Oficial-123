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

// In-memory chat storage
const inMemoryConversations = new Map();
const inMemoryMessages = new Map();
let conversationIdCounter = 1;
let messageIdCounter = 1;

// Initialize chat tables
async function initializeChatTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id),
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log('[CHAT] Database tables initialized successfully');
  } catch (error) {
    console.error('[CHAT] Error initializing tables:', error.message);
  }
}

// Initialize chat tables on startup
initializeChatTables();

// Chat API Routes
app.get("/api/conversations", async (req, res) => {
  console.log('[CHAT API] GET /api/conversations');
  try {
    const result = await pool.query('SELECT * FROM conversations ORDER BY created_at DESC');
    res.json(result.rows || []);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

app.post("/api/conversations", async (req, res) => {
  try {
    const { title } = req.body;
    console.log('[CHAT API] Creating conversation with title:', title);
    const result = await pool.query('INSERT INTO conversations (title) VALUES ($1) RETURNING *', [title || "New Chat"]);
    const conversation = result.rows[0];
    console.log('[CHAT API] Created conversation:', conversation);
    res.status(201).json(conversation);
  } catch (error) {
    console.error('[CHAT API] Error creating conversation:', error.message);
    res.status(500).json({ error: "Failed to create conversation: " + error.message });
  }
});

app.get("/api/conversations/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const convResult = await pool.query('SELECT * FROM conversations WHERE id = $1', [id]);
    if (!convResult.rows[0]) {
      return res.status(404).json({ error: "Conversation not found" });
    }
    const msgResult = await pool.query('SELECT * FROM messages WHERE conversation_id = $1', [id]);
    res.json({ ...convResult.rows[0], messages: msgResult.rows });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    res.status(500).json({ error: "Failed to fetch conversation" });
  }
});

app.post("/api/conversations/:id/messages", async (req, res) => {
  console.log('[CHAT API] POST /api/conversations/:id/messages');
  try {
    const conversationId = parseInt(req.params.id);
    const { content, agentId } = req.body;

    console.log(`[CHAT] Message for conv ${conversationId}: ${content}`);

    // Fetch agent context
    let systemPrompt = "Você é um assistente prestativo especializado em advocacia previdenciária.";
    if (agentId) {
      try {
        const agentResult = await pool.query('SELECT * FROM "agents" WHERE "id" = $1', [agentId]);
        const agent = agentResult.rows[0];
        if (agent) {
          const inst = agent.instructions || agent.description || "Sem instruções específicas.";
          systemPrompt = `Você é o assistente: ${agent.title}. \nInstruções e Base de Conhecimento: ${inst}`;
          console.log(`[CHAT] Context loaded for agent: ${agent.title}`);
        }
      } catch (dbError) {
        console.error("[CHAT DB ERROR]", dbError.message);
      }
    }

    // Save user message
    await pool.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)', [conversationId, "user", content]);

    // Get history
    const historyResult = await pool.query('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC', [conversationId]);
    const chatMessages = [
      { role: "system", content: systemPrompt },
      ...historyResult.rows.map((m) => ({
        role: m.role,
        content: m.content,
      }))
    ];

    // Set up SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (res.flushHeaders) res.flushHeaders();

    try {
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const stream = await openai.chat.completions.create({
        model: "gpt-4o", 
        messages: chatMessages,
        stream: true,
      });

      let fullResponse = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        if (delta) {
          fullResponse += delta;
          res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
        }
      }

      await pool.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)', [conversationId, "assistant", fullResponse]);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (streamError) {
      console.error("[STREAM ERROR]", streamError.message);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: `AI Error: ${streamError.message}` })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: streamError.message });
      }
    }
  } catch (error) {
    console.error("[CHAT ERROR]", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || "Failed to send message" });
    }
  }
});

app.delete("/api/conversations/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await pool.query('DELETE FROM conversations WHERE id = $1', [id]);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting conversation:", error);
    res.status(500).json({ error: "Failed to delete conversation" });
  }
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
