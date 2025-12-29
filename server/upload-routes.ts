import { Express, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import crypto from 'crypto';

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
    // Manter o nome original, garantindo que o encoding esteja correto
    // e limpando apenas o que for estritamente necessário para o sistema de arquivos
    try {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      // Remover caracteres que podem quebrar o sistema de arquivos ou URLs
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

export function registerUploadRoutes(app: Express) {
  app.post('/api/agents/upload', upload.single('file'), (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo foi enviado' });
    }
    
    const filePath = `/agent-attachments/${req.file.filename}`;
    res.json({ path: filePath, filename: req.file.originalname });
  });
}
