import express, { Express } from 'express';
import authRoutes from './auth-routes';
import dbRoutes from './db-routes';
import { registerChatRoutes } from "./replit_integrations/chat";

const app: Express = express();

app.use(express.json());
console.log('[SERVER] Middleware registered');

// Register chat routes FIRST before other routes
registerChatRoutes(app);
console.log('[SERVER] Chat routes registered');

app.use('/api', authRoutes);
app.use('/api', dbRoutes);
console.log('[SERVER] All routes registered');

export default app;
