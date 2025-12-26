import { Express } from 'express';
import authRoutes from './auth-routes';

export function setupAPIRoutes(app: Express) {
  app.use(express.json());
  app.use('/api', authRoutes);
}
