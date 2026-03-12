import { toast } from 'sonner';
import { supabaseAuth } from './supabase-auth';

function isDevAdminSessionAllowed() {
  return import.meta.env.DEV && String(import.meta.env.VITE_ALLOW_DEV_ADMIN_LOGIN || '').trim().toLowerCase() === 'true';
}

interface LoginResponse {
  success: boolean;
  user?: {
    id: string;
    email: string;
    role: string;
  };
  error?: string;
}

type PersistedSupabaseSessionParams = {
  user: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, any> | null;
  };
  accessToken?: string | null;
  fallbackEmail?: string;
};

export function persistSupabaseSession(params: PersistedSupabaseSessionParams): LoginResponse['user'] {
  const loggedUser = {
    id: params.user.id,
    email: params.user.email || String(params.fallbackEmail || '').trim(),
    role: params.user.user_metadata?.role || 'user',
  };

  localStorage.setItem('user', JSON.stringify(loggedUser));
  localStorage.setItem('sessionToken', params.accessToken || `token_user_${Date.now()}`);
  document.dispatchEvent(new Event('localStorageChanged'));

  return loggedUser;
}

export async function loginUser(email: string, password: string): Promise<LoginResponse> {
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
  const loginUrl = `${apiBaseUrl}/api/login`;

  try {
    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const rawBody = await response.text();
    let data: any = {};
    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      data = { error: rawBody || 'Resposta inválida do servidor' };
    }
    
    if (!response.ok) {
      const shouldFallbackToSupabase = response.status === 404 || response.status === 405;

      if (shouldFallbackToSupabase) {
        const { data: authData, error } = await supabaseAuth.auth.signInWithPassword({
          email: String(email).trim(),
          password: String(password),
        });

        if (error || !authData?.user) {
          return { success: false, error: error?.message || 'Email ou senha incorretos' };
        }

        const loggedUser = persistSupabaseSession({
          user: authData.user,
          accessToken: authData.session?.access_token,
          fallbackEmail: email,
        });

        return { success: true, user: loggedUser };
      }

      return { success: false, error: data.error || `Login falhou (${response.status})` };
    }

    // Salvar sessão em localStorage
    if (data.user) {
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('sessionToken', data.token);
      // Disparar evento customizado para notificar o SessionContextProvider
      document.dispatchEvent(new Event('localStorageChanged'));
    }

    return { success: true, user: data.user };
  } catch (err: any) {
    try {
      const { data: authData, error } = await supabaseAuth.auth.signInWithPassword({
        email: String(email).trim(),
        password: String(password),
      });

      if (error || !authData?.user) {
        return { success: false, error: err?.message || error?.message || 'Erro ao fazer login' };
      }

      const loggedUser = persistSupabaseSession({
        user: authData.user,
        accessToken: authData.session?.access_token,
        fallbackEmail: email,
      });

      return { success: true, user: loggedUser };
    } catch {
      return { success: false, error: err.message || 'Erro ao fazer login' };
    }
  }
}

export function getSession() {
  const userStr = localStorage.getItem('user');
  const token = localStorage.getItem('sessionToken');
  
  if (!userStr || !token) return null;

  try {
    const parsedUser = JSON.parse(userStr);
    const isMockAdminSession =
      String(parsedUser?.email || '').trim().toLowerCase() === 'admin@admin.com' &&
      String(token || '').startsWith('token_admin_');

    if (isMockAdminSession && !isDevAdminSessionAllowed()) {
      localStorage.removeItem('user');
      localStorage.removeItem('sessionToken');
      return null;
    }

    return {
      user: parsedUser,
      token,
    };
  } catch {
    return null;
  }
}

export async function logout() {
  try {
    await supabaseAuth.auth.signOut({ scope: 'local' });
  } catch {
    // Ignora falha de signOut remoto e limpa sessão local mesmo assim
  }

  localStorage.removeItem('user');
  localStorage.removeItem('sessionToken');
  document.dispatchEvent(new Event('localStorageChanged'));
}
