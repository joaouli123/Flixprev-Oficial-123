import type { Plugin } from 'vite';
import express from 'express';
import authRoutes from './auth-routes';

let apiServerStarted = false;

export function createAPIPlugin(): Plugin {
  return {
    name: 'vite-api-server',
    configResolved() {
      // Start API server when Vite resolves config (early initialization)
      if (!apiServerStarted) {
        apiServerStarted = true;
        const app = express();
        app.use(express.json());
        app.use('/api', authRoutes);
        
        app.listen(3001, '0.0.0.0', () => {
          console.log('\n✅ API Server rodando em http://localhost:3001');
        }).on('error', (err: any) => {
          if (err.code !== 'EADDRINUSE') {
            console.error('API Server error:', err);
          }
        });
      }
    },
  };
}
