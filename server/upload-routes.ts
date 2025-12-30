import { Express, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import OpenAI from 'openai';
import { Pool } from 'pg';
// @ts-ignore
import pdfParse from 'pdf-parse';

const dbUrl = process.env.NODE_ENV === 'production' 
  ? process.env.PROD_DATABASE_URL 
  : process.env.DATABASE_URL;

const pool = new Pool({ connectionString: dbUrl });

// Configurar multer para upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'public', 'agent-attachments');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    try {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const safeName = originalName.replace(/[<>:"|?*]/g, '_');
      console.log(`[UPLOAD] Saving file as: ${safeName}`);
      cb(null, safeName);
    } catch (e) {
      console.error('[UPLOAD] Error processing filename:', e);
      cb(null, file.originalname);
    }
  }
});

const upload = multer({ storage });

// ============================================
// 🧠 RAG FUNCTIONS
// ============================================

async function extractPdfText(filePath: string): Promise<string> {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(fileBuffer);
    return data.text || '';
  } catch (e: any) {
    console.error('[PDF] Error extracting:', e.message);
    try {
      return fs.readFileSync(filePath, 'utf-8').substring(0, 5000);
    } catch {
      return '';
    }
  }
}

function chunkText(text: string, size = 800, overlap = 150): string[] {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + size));
    start += size - overlap;
  }
  return chunks;
}

async function generateEmbeddings(chunks: string[]): Promise<number[][]> {
  const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });

  const embeddings: number[][] = [];
  for (const chunk of chunks) {
    try {
      const res = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: chunk
      });
      embeddings.push(res.data[0].embedding);
      console.log('[EMB] Embedding generated for chunk');
    } catch (e: any) {
      console.error('[EMB] Error:', e.message);
      embeddings.push(Array(3072).fill(0));
    }
  }
  return embeddings;
}

// Helper function to process a file with RAG
async function processFileWithRAG(filePath: string, fileName: string, agentId: string): Promise<void> {
  const fullPath = path.join(process.cwd(), 'public', filePath);
  
  if (!fs.existsSync(fullPath)) {
    console.warn(`[UPLOAD] File not found: ${fullPath}`);
    return;
  }

  try {
    // 1. Extract text
    let text = '';
    if (fileName.toLowerCase().endsWith('.pdf')) {
      console.log('[UPLOAD] Extracting PDF...');
      text = await extractPdfText(fullPath);
    } else {
      console.log('[UPLOAD] Reading text file...');
      text = fs.readFileSync(fullPath, 'utf-8');
    }

    console.log(`[UPLOAD] Text extracted: ${text.length} characters`);
    
    if (!text || text.length === 0) {
      console.warn('[UPLOAD] ⚠️ No text extracted from file!');
      return;
    }

    // 2. Create document
    const docResult = await pool.query(
      'INSERT INTO documents (agent_id, title) VALUES ($1, $2) RETURNING id',
      [agentId, fileName]
    );
    const documentId = docResult.rows[0].id;
    console.log('[UPLOAD] Document created:', documentId);

    // 3. Chunk text
    const chunks = chunkText(text, 800, 150);
    console.log(`[UPLOAD] ${chunks.length} chunks created`);

    // 4. Generate embeddings
    const embeddings = await generateEmbeddings(chunks);
    console.log(`[UPLOAD] ${embeddings.length} embeddings generated`);

    // 5. Save chunks to database
    let savedCount = 0;
    for (let i = 0; i < chunks.length; i++) {
      const embeddingString = '[' + embeddings[i].join(',') + ']';
      await pool.query(
        `INSERT INTO document_chunks (agent_id, document_id, content, embedding)
         VALUES ($1, $2, $3, $4::vector)`,
        [agentId, documentId, chunks[i], embeddingString]
      );
      savedCount++;
    }

    console.log(`[UPLOAD] ✅ ${savedCount} chunks saved to database!`);
  } catch (e: any) {
    console.error('[UPLOAD] Error processing RAG:', e.message, e.stack);
  }
}

export function registerUploadRoutes(app: Express) {
  // Admin endpoint to reprocess all agent attachments
  app.post('/api/admin/reprocess-attachments', async (req: Request, res: Response) => {
    console.log('[REPROCESS] Starting attachment reprocessing...');
    try {
      // Get all agents with attachments
      const result = await pool.query(
        'SELECT id, attachments FROM agents WHERE attachments IS NOT NULL AND attachments != \'[]\''
      );

      let processedCount = 0;
      for (const agent of result.rows) {
        const agentId = agent.id;
        const attachments = agent.attachments || [];

        for (const attachment of attachments) {
          console.log(`[REPROCESS] Processing ${attachment} for agent ${agentId}`);
          const fileName = attachment.split('/').pop() || attachment;
          await processFileWithRAG(attachment, fileName, agentId);
          processedCount++;
        }
      }

      res.json({ success: true, processed: processedCount });
    } catch (e: any) {
      console.error('[REPROCESS] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/agents/upload', upload.single('file'), async (req: Request, res: Response) => {
    console.log('[UPLOAD] ========== UPLOAD ENDPOINT CALLED ==========');
    console.log('[UPLOAD] Body:', req.body);
    console.log('[UPLOAD] File info:', req.file ? {filename: req.file.filename, originalname: req.file.originalname} : 'NO FILE');
    
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });
      }

      const { agentId } = req.body;
      const filePath = `/agent-attachments/${req.file.filename}`;
      const originalname = req.file.originalname;

      console.log('[UPLOAD] File uploaded:', originalname);
      console.log('[UPLOAD] Path:', filePath);
      console.log('[UPLOAD] AgentId:', agentId);

      // Process RAG if agentId is provided
      if (agentId) {
        await processFileWithRAG(filePath, originalname, agentId);
      }

      // Return path for saving to agent
      res.json({
        success: true,
        path: filePath,
        filename: originalname
      });
    } catch (e: any) {
      console.error('[UPLOAD] Error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });
}
