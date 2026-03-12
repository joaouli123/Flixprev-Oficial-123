import React, { useState, useEffect, createContext, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Profile } from '@/types/app';
import { SubscriptionExpiredDialog } from './SubscriptionExpiredDialog';
import { logger } from '@/utils/logger';
import { getSession, logout } from '@/lib/auth';

const hasActiveSubscriptionAccess = (status: string | null | undefined) => {
  const normalized = String(status || '').trim().toLowerCase();
  return ['ativo', 'active', 'paid', 'premium', 'approved'].includes(normalized);
};

interface SessionContextType {
  session: any | null;
  profile: Profile | null;
  isAdmin: boolean;
  subscriptionStatus: string | null;
  user: any | null;
  refreshProfile: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showExpiredDialog, setShowExpiredDialog] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const userRole = String(profile?.role || user?.role || '').trim().toLowerCase();
  const isAdmin = userRole === 'admin';

  const buildFallbackProfile = (sessionUser: any): Profile => ({
    id: sessionUser.id,
    first_name: null,
    last_name: null,
    avatar_url: null,
    role: String(sessionUser.role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user',
    updated_at: new Date().toISOString(),
    nome_completo: null,
    email: sessionUser.email || null,
    documento: null,
    telefone: null,
    ramos_atuacao: null,
    cep: null,
    logradouro: null,
    bairro: null,
    cidade: null,
    estado: null,
    regiao: null,
    sexo: null,
    idade: null,
    data_nascimento: null,
    origem_cadastro: null,
    cadastro_finalizado_em: null,
  });

  const loadProfile = async (sessionUser: any) => {
    if (!sessionUser?.id) {
      setProfile(null);
      return;
    }

    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');

    try {
      const response = await fetch(`${apiBaseUrl}/api/account/profile`, {
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': sessionUser.id,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ${response.status}`);
      }

      const payload = await response.json();
      const apiProfile = payload?.profile || {};
      const nextSubscriptionStatus = String(apiProfile.status_da_assinatura || '').trim() || null;
      setSubscriptionStatus(nextSubscriptionStatus);
      setProfile({
        ...buildFallbackProfile(sessionUser),
        ...apiProfile,
        id: String(apiProfile.id || sessionUser.id),
        role: String(apiProfile.role || sessionUser.role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'user',
        email: apiProfile.email || sessionUser.email || null,
      });
    } catch (error) {
      logger.error('Falha ao carregar perfil do usuário', error);
      setSubscriptionStatus(null);
      setProfile(buildFallbackProfile(sessionUser));
    }
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await loadProfile(user);
    }
  };

  // Carregar sessão ao montar
  useEffect(() => {
    const loadSessionAndProfile = async () => {
      const sessionData = getSession();
      if (sessionData) {
        setUser(sessionData.user);
        setSession(sessionData);

        await loadProfile(sessionData.user);
      } else {
        setProfile(null);
        setSubscriptionStatus(null);
      }
      setLoading(false);
    };
    
    loadSessionAndProfile();
  }, []);

  // Monitorar mudanças no localStorage (para quando o login ocorre)
  useEffect(() => {
    const handleStorageChange = () => {
      const sessionData = getSession();
      if (sessionData) {
        setUser(sessionData.user);
        setSession(sessionData);
        void loadProfile(sessionData.user);
      } else {
        setUser(null);
        setSession(null);
        setProfile(null);
        setSubscriptionStatus(null);
      }
    };

    // Escutar evento de storage (mudanças em outra aba/janela)
    window.addEventListener('storage', handleStorageChange);

    // Criar e disparar evento customizado para mudanças na mesma aba
    const handleCustomStorageChange = (e: Event) => {
      handleStorageChange();
    };
    document.addEventListener('localStorageChanged', handleCustomStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('localStorageChanged', handleCustomStorageChange);
    };
  }, []);

  useEffect(() => {
    const referralCodeFromQuery = new URLSearchParams(location.search).get('ref') ||
      new URLSearchParams(location.search).get('referral_code') ||
      new URLSearchParams(location.search).get('codigo_indicacao') || '';

    const referralCodeFromStorage = typeof window !== 'undefined'
      ? String(localStorage.getItem('referral_code') || '').trim()
      : '';

    const referralCode = String(referralCodeFromQuery || referralCodeFromStorage)
      .trim()
      .toUpperCase();

    if (!user?.id || !referralCode) {
      return;
    }

    if (typeof window !== 'undefined' && referralCodeFromQuery) {
      localStorage.setItem('referral_code', referralCode);
    }

    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');

    void fetch(`${apiBaseUrl}/api/referrals/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': user.id,
      },
      body: JSON.stringify({
        referral_code: referralCode,
        email: user.email || null,
      }),
    })
      .then(async (response) => {
        if (response.ok) {
          return;
        }

        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ${response.status}`);
      })
      .catch((error: Error) => {
        logger.error('Falha ao registrar indicação', error);
      });
  }, [location.search, user?.email, user?.id]);


  // Redirecionar baseado na autenticação
  useEffect(() => {
    const publicRoutesAllowed = ['/login', '/', '/obrigado', '/privacy', '/terms', '/cookie-policy', '/lgpd', '/esqueci-senha', '/reset-password'];
    
    if (user) {
      // Usuário autenticado
      if (['/login', '/'].includes(location.pathname)) {
        navigate('/app');
      }
    } else {
      // Usuário não autenticado
      if (!publicRoutesAllowed.includes(location.pathname)) {
        navigate('/login');
      }
    }
  }, [user, navigate, location.pathname]);

  useEffect(() => {
    const publicRoutesAllowed = ['/login', '/', '/obrigado', '/privacy', '/terms', '/cookie-policy', '/lgpd', '/esqueci-senha', '/reset-password'];

    if (!user || isAdmin || !subscriptionStatus || hasActiveSubscriptionAccess(subscriptionStatus)) {
      return;
    }

    const enforceInactiveAccess = async () => {
      setShowExpiredDialog(true);
      await logout();
      if (!publicRoutesAllowed.includes(location.pathname)) {
        navigate('/login', { replace: true });
      }
    };

    void enforceInactiveAccess();
  }, [isAdmin, location.pathname, navigate, subscriptionStatus, user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <SessionContext.Provider
      value={{
        session,
        profile,
        isAdmin,
        subscriptionStatus,
        user,
        refreshProfile,
      }}
    >
      {children}
      <SubscriptionExpiredDialog
        isOpen={showExpiredDialog}
        onClose={() => setShowExpiredDialog(false)}
        userEmail={user?.email || profile?.email || undefined}
      />
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within SessionContextProvider');
  }
  return context;
};
