import { Router, Request, Response } from 'express';

const router = Router();

// Debug endpoint
router.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

router.post('/login', (req: Request, res: Response) => {
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

router.post('/change-password', (req: Request, res: Response) => {
  try {
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
      return res.status(400).json({ error: 'userId e newPassword são obrigatórios' });
    }

    // Mock: apenas confirmar que a senha foi alterada
    return res.status(200).json({ success: true, message: 'Senha alterada com sucesso' });
  } catch (error: any) {
    console.error('Change password error:', error);
    return res.status(500).json({ error: 'Erro ao trocar a senha' });
  }
});

export default router;
