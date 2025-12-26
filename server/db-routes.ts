import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

router.post('/db', async (req: Request, res: Response) => {
  const { table, operation, columns, insertData, updateData, filters, orderColumn, orderAsc, limit, countExact, maybeOne } = req.body;

  try {
    if (operation === 'SELECT') {
      let query = `SELECT ${columns} FROM ${table}`;
      const params: any[] = [];
      let paramIndex = 1;

      if (filters && filters.length > 0) {
        query += ' WHERE ';
        query += filters.map((f: any) => {
          params.push(f.value);
          return `${f.column} = $${paramIndex++}`;
        }).join(' AND ');
      }

      if (orderColumn) {
        query += ` ORDER BY ${orderColumn} ${orderAsc ? 'ASC' : 'DESC'}`;
      }

      if (limit) {
        query += ` LIMIT ${limit}`;
      }

      query += ';';

      const result = await pool.query(query, params);
      
      if (maybeOne && result.rows.length === 0) {
        return res.json({ data: null, error: null });
      }

      if (countExact) {
        return res.json({ data: result.rows, error: null, count: result.rows.length });
      }

      res.json({ data: result.rows, error: null });
    } 
    else if (operation === 'INSERT') {
      const columns = Object.keys(insertData);
      const values = Object.values(insertData);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *;`;

      const result = await pool.query(query, values);
      res.json({ data: result.rows, error: null });
    } 
    else if (operation === 'UPDATE') {
      const updateColumns = Object.keys(updateData);
      const updateValues = Object.values(updateData);
      let paramIndex = updateValues.length + 1;

      let query = `UPDATE ${table} SET ${updateColumns.map((col, i) => `${col} = $${i + 1}`).join(', ')}`;
      const params = [...updateValues];

      if (filters && filters.length > 0) {
        query += ' WHERE ';
        query += filters.map((f: any) => {
          params.push(f.value);
          return `${f.column} = $${paramIndex++}`;
        }).join(' AND ');
      }

      query += ' RETURNING *;';

      const result = await pool.query(query, params);
      res.json({ data: result.rows, error: null });
    } 
    else if (operation === 'DELETE') {
      let query = `DELETE FROM ${table}`;
      const params: any[] = [];
      let paramIndex = 1;

      if (filters && filters.length > 0) {
        query += ' WHERE ';
        query += filters.map((f: any) => {
          params.push(f.value);
          return `${f.column} = $${paramIndex++}`;
        }).join(' AND ');
      }

      query += ' RETURNING *;';

      const result = await pool.query(query, params);
      res.json({ data: result.rows, error: null });
    }
  } catch (error: any) {
    console.error('DB Error:', error);
    res.status(500).json({ error: error.message || 'Erro na query' });
  }
});

export default router;
