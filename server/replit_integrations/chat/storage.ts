import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export interface IChatStorage {
  getConversation(id: number): Promise<any>;
  getAllConversations(): Promise<any[]>;
  createConversation(title: string): Promise<any>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<any[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<any>;
  initializeTables(): Promise<void>;
}

// Initialize database tables if they don't exist
async function initializeTables() {
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
  } catch (error: any) {
    console.error('[CHAT] Error initializing tables:', error.message);
  }
}

// Initialize tables when module loads
initializeTables();

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
    try {
      const result = await pool.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING *', [conversationId, role, content]);
      return result.rows[0];
    } catch (e: any) {
      console.error(`[DB ERROR] Failed to create message for conv ${conversationId}:`, e.message);
      throw e;
    }
  },
};

