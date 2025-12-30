import express, { Express } from 'express';
import authRoutes from './auth-routes';
import dbRoutes from './db-routes';
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerUploadRoutes } from "./upload-routes";

const app: Express = express();

app.use(express.json());
console.log('[SERVER] Middleware registered');
console.log('[SERVER] Using DB URL:', process.env.PROD_DATABASE_URL ? 'PROD_DATABASE_URL' : 'DATABASE_URL');

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    dbUrl: process.env.PROD_DATABASE_URL ? 'PROD' : 'DEV'
  });
});

// Register chat routes FIRST before other routes
registerChatRoutes(app);
console.log('[SERVER] Chat routes registered');

// Register upload routes
registerUploadRoutes(app);
console.log('[SERVER] Upload routes registered');

app.use('/api', authRoutes);
app.use('/api', dbRoutes);
console.log('[SERVER] All routes registered');

// Error handling middleware
app.use((err: any, req: any, res: any, next: any) => {
  console.error('[SERVER ERROR]:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

export default app;
