import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { createAPIServer } from './server/vite';
import authRoutes from './server/auth-routes';

async function startDevServer() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Register API routes
  app.use('/api', authRoutes);

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  // Use Vite's connect instance as middleware
  app.use(vite.middlewares);

  // SPA fallback
  app.use('*', async (req, res) => {
    try {
      let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
      template = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e: any) {
      vite.ssrFixStacktrace(e);
      res.status(500).end(e.message);
    }
  });

  const PORT = 5000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
  });
}

startDevServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
