import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import authRoutes from './server/auth-routes';

async function startDevServer() {
  const app = express();

  // Middleware
  app.use(express.json());

  // API Routes FIRST (antes do Vite)
  app.use('/api', authRoutes);

  // Criar e integrar Vite
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  // Use Vite's connect instance as middleware
  app.use(vite.middlewares);

  // SPA fallback - servir index.html
  app.use('*', async (req, res) => {
    try {
      let template = fs.readFileSync(
        path.resolve(__dirname, 'index.html'),
        'utf-8'
      );
      template = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e: any) {
      vite.ssrFixStacktrace(e);
      res.status(500).end(e.message);
    }
  });

  const PORT = 5000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Dev Server rodando em http://localhost:${PORT}`);
    console.log('✅ API disponível em http://localhost:${PORT}/api');
  });
}

startDevServer().catch((err) => {
  console.error('Erro ao iniciar dev server:', err);
  process.exit(1);
});
