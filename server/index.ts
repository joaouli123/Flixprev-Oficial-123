import express, { Express } from 'express';
import authRoutes from './auth-routes';
import dbRoutes from './db-routes';

const app: Express = express();

app.use(express.json());
app.use('/api', authRoutes);
app.use('/api', dbRoutes);

export default app;
