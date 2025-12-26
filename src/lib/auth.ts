import { toast } from 'sonner';

interface LoginResponse {
  success: boolean;
  user?: {
    id: string;
    email: string;
    role: string;
  };
  error?: string;
}

export async function loginUser(email: string, password: string): Promise<LoginResponse> {
  try {
    const isProduction = !import.meta.env.DEV;
    const apiUrl = isProduction ? '' : 'http://localhost:3001';
    const response = await fetch(`${apiUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.error || 'Login falhou' };
    }

    // Salvar sessão em localStorage
    if (data.user) {
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('sessionToken', data.token);
    }

    return { success: true, user: data.user };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erro ao fazer login' };
  }
}

export function getSession() {
  const userStr = localStorage.getItem('user');
  const token = localStorage.getItem('sessionToken');
  
  if (!userStr || !token) return null;

  try {
    return {
      user: JSON.parse(userStr),
      token,
    };
  } catch {
    return null;
  }
}

export function logout() {
  localStorage.removeItem('user');
  localStorage.removeItem('sessionToken');
}
