import express, { Express } from 'express';
import authRoutes from './auth-routes';
import dbRoutes from './db-routes';
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerUploadRoutes } from "./upload-routes";

const app: Express = express();

app.use(express.json());
console.log('[SERVER] Middleware registered');

// Register chat routes FIRST before other routes
registerChatRoutes(app);
console.log('[SERVER] Chat routes registered');

// Register upload routes
registerUploadRoutes(app);
console.log('[SERVER] Upload routes registered');

app.use('/api', authRoutes);
app.use('/api', dbRoutes);
console.log('[SERVER] All routes registered');

export default app;
