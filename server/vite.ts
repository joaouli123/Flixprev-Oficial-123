import express, { Express, Request, Response } from 'express';
import authRoutes from './auth-routes';

export function createAPIServer(app: Express) {
  app.use(express.json());
  app.use('/api', authRoutes);
}
