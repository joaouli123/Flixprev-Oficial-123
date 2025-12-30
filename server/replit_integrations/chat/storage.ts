import { Pool } from 'pg';

const dbUrl = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;

export const pool = new Pool({
  connectionString: dbUrl,
});

// In-memory fallback storage
const inMemoryConversations: Map<number, any> = new Map();
const inMemoryMessages: Map<number, any[]> = new Map();
let conversationIdCounter = 1;
let messageIdCounter = 1;
let useInMemory = false;

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
    useInMemory = false;
  } catch (error: any) {
    console.error('[CHAT] Error initializing tables:', error.message);
    console.warn('[CHAT] Falling back to in-memory storage');
    useInMemory = true;
  }
}

// Initialize tables when module loads
initializeTables();

export const chatStorage: IChatStorage = {
  async getConversation(id: number) {
    if (useInMemory) {
      return inMemoryConversations.get(id) || null;
    }
    try {
      const result = await pool.query('SELECT * FROM conversations WHERE id = $1', [id]);
      return result.rows[0];
    } catch (error: any) {
      console.error('[CHAT] DB error on getConversation:', error.message);
      useInMemory = true;
      return inMemoryConversations.get(id) || null;
    }
  },

  async getAllConversations() {
    if (useInMemory) {
      return Array.from(inMemoryConversations.values()).sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
    try {
      const result = await pool.query('SELECT * FROM conversations ORDER BY created_at DESC');
      return result.rows;
    } catch (error: any) {
      console.error('[CHAT] DB error on getAllConversations:', error.message);
      useInMemory = true;
      return Array.from(inMemoryConversations.values());
    }
  },

  async createConversation(title: string) {
    if (useInMemory) {
      const id = conversationIdCounter++;
      const conversation = {
        id,
        title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      inMemoryConversations.set(id, conversation);
      inMemoryMessages.set(id, []);
      console.log('[CHAT] Created in-memory conversation:', id, title);
      return conversation;
    }
    try {
      const result = await pool.query('INSERT INTO conversations (title) VALUES ($1) RETURNING *', [title]);
      console.log('[CHAT] Created DB conversation:', result.rows[0].id, title);
      return result.rows[0];
    } catch (error: any) {
      console.error('[CHAT] DB error on createConversation:', error.message);
      useInMemory = true;
      // Retry with in-memory
      const id = conversationIdCounter++;
      const conversation = {
        id,
        title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      inMemoryConversations.set(id, conversation);
      inMemoryMessages.set(id, []);
      return conversation;
    }
  },

  async deleteConversation(id: number) {
    if (useInMemory) {
      inMemoryConversations.delete(id);
      inMemoryMessages.delete(id);
      return;
    }
    try {
      await pool.query('DELETE FROM messages WHERE conversation_id = $1', [id]);
      await pool.query('DELETE FROM conversations WHERE id = $1', [id]);
    } catch (error: any) {
      console.error('[CHAT] DB error on deleteConversation:', error.message);
      useInMemory = true;
      inMemoryConversations.delete(id);
      inMemoryMessages.delete(id);
    }
  },

  async getMessagesByConversation(conversationId: number) {
    if (useInMemory) {
      return inMemoryMessages.get(conversationId) || [];
    }
    try {
      const result = await pool.query('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC', [conversationId]);
      return result.rows;
    } catch (error: any) {
      console.error('[CHAT] DB error on getMessagesByConversation:', error.message);
      useInMemory = true;
      return inMemoryMessages.get(conversationId) || [];
    }
  },

  async createMessage(conversationId: number, role: string, content: string) {
    if (useInMemory) {
      const id = messageIdCounter++;
      const message = {
        id,
        conversation_id: conversationId,
        role,
        content,
        created_at: new Date().toISOString(),
      };
      const messages = inMemoryMessages.get(conversationId) || [];
      messages.push(message);
      inMemoryMessages.set(conversationId, messages);
      console.log('[CHAT] Created in-memory message:', id, 'for conv:', conversationId);
      return message;
    }
    try {
      const result = await pool.query('INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3) RETURNING *', [conversationId, role, content]);
      return result.rows[0];
    } catch (e: any) {
      console.error(`[CHAT] DB error creating message for conv ${conversationId}:`, e.message);
      useInMemory = true;
      // Retry with in-memory
      const id = messageIdCounter++;
      const message = {
        id,
        conversation_id: conversationId,
        role,
        content,
        created_at: new Date().toISOString(),
      };
      const messages = inMemoryMessages.get(conversationId) || [];
      messages.push(message);
      inMemoryMessages.set(conversationId, messages);
      return message;
    }
  },
};

