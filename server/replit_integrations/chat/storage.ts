import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export interface IChatStorage {
  getConversation(id: number): Promise<any>;
  getAllConversations(): Promise<any[]>;
  createConversation(title: string): Promise<any>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<any[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<any>;
}

export const chatStorage: IChatStorage = {
  async getConversation(id: number) {
    const result = await pool.query('SELECT * FROM conversations WHERE id = $1', [id]);
    return result.rows[0];
  },

  async getAllConversations() {
    const result = await pool.query('SELECT * FROM conversations ORDER BY created_at DESC');
    return result.rows;
  },

  async createConversation(title: string) {
    const result = await pool.query('INSERT INTO conversations (title) VALUES ($1) RETURNING *', [title]);
    return result.rows[0];
  },

  async deleteConversation(id: number) {
    await pool.query('DELETE FROM messages WHERE conversation_id = $1', [id]);
    await pool.query('DELETE FROM conversations WHERE id = $1', [id]);
  },

  async getMessagesByConversation(conversationId: number) {
    const result = await pool.query('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC', [conversationId]);
    return result.rows;
  },

  async createMessage(conversationId: number, role: string, content: string) {
    const result = await pool.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING *', [conversationId, role, content]);
    return result.rows[0];
  },
};

