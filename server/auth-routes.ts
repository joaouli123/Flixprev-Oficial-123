import { Router, Request, Response } from 'express';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  try {
    // Validar credenciais
    if (email === 'admin@admin.com' && password === 'admin') {
      return res.json({
        success: true,
        user: {
          id: '07d16581-fca5-4709-b0d3-e09859dbb286',
          email: 'admin@admin.com',
          role: 'admin',
        },
        token: `token_admin_${Date.now()}`,
      });
    }

    res.status(401).json({ error: 'Email ou senha incorretos' });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

export default router;
