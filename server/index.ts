import express, { Express } from 'express';
import authRoutes from './auth-routes';

const app: Express = express();

app.use(express.json());
app.use('/api', authRoutes);

export default app;
