import express from 'express';
import { createServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
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
