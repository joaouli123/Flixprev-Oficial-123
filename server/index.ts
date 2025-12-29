import express, { Express } from 'express';
import authRoutes from './auth-routes';
import dbRoutes from './db-routes';
import { registerChatRoutes } from "./replit_integrations/chat";

const app: Express = express();

app.use(express.json());
app.use('/api', authRoutes);
app.use('/api', dbRoutes);

registerChatRoutes(app);

export default app;
