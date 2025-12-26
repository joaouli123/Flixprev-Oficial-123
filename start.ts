import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { Router } from 'express';

// Inline auth routes to ensure they work
const authRouter = Router();

authRouter.post('/api/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    // Validar credenciais
    if (email === 'admin@admin.com' && password === 'admin') {
      return res.status(200).json({
        success: true,
        user: {
          id: '07d16581-fca5-4709-b0d3-e09859dbb286',
          email: 'admin@admin.com',
          role: 'admin',
        },
        token: `token_admin_${Date.now()}`,
      });
    }

    return res.status(401).json({ error: 'Email ou senha incorretos' });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

async function startDevServer() {
  const app = express();

  // Middleware - parse JSON FIRST
  app.use(express.json());

  // Direct API Routes on main app
  app.post('/api/login', (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email e senha são obrigatórios' });
      }

      // Validar credenciais
      if (email === 'admin@admin.com' && password === 'admin') {
        return res.status(200).json({
          success: true,
          user: {
            id: '07d16581-fca5-4709-b0d3-e09859dbb286',
            email: 'admin@admin.com',
            role: 'admin',
          },
          token: `token_admin_${Date.now()}`,
        });
      }

      return res.status(401).json({ error: 'Email ou senha incorretos' });
    } catch (error: any) {
      console.error('Login error:', error);
      return res.status(500).json({ error: 'Erro ao fazer login' });
    }
  });

  // Criar e integrar Vite
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });

  // Vite middleware para assets, modules, etc
  app.use(vite.middlewares);

  // SPA fallback - servir index.html para rotas desconhecidas (não-API)
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
