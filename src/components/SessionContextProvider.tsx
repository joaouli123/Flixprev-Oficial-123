import React, { useState, useEffect, createContext, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Profile } from '@/types/app';
import { SubscriptionExpiredDialog } from './SubscriptionExpiredDialog';
import { logger } from '@/utils/logger';
import { getSession, logout } from '@/lib/auth';
import { neon } from '@/lib/neon';

interface SessionContextType {
  session: any | null;
  profile: Profile | null;
  isAdmin: boolean;
  subscriptionStatus: string | null;
  user: any | null;
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

  // Carregar sessão ao montar
  useEffect(() => {
    const loadSessionAndProfile = async () => {
      const sessionData = getSession();
      if (sessionData) {
        setUser(sessionData.user);
        setSession(sessionData);
        
        // Carregar perfil do banco de dados
        try {
          const { data, error } = await neon
            .from('profiles')
            .select()
            .eq('id', sessionData.user.id)
            .maybeSingle();
          
          if (data) {
            setProfile(data as Profile);
          } else {
            // Se não existe perfil, criar um vazio
            setProfile({
              id: sessionData.user.id,
              first_name: null,
              last_name: null,
              avatar_url: null,
              role: sessionData.user.role || 'user',
              updated_at: new Date().toISOString(),
            } as Profile);
          }
        } catch (err) {
          // Se houver erro, continue com perfil vazio
          setProfile({
            id: sessionData.user.id,
            first_name: null,
            last_name: null,
            avatar_url: null,
            role: sessionData.user.role || 'user',
            updated_at: new Date().toISOString(),
          } as Profile);
        }
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
      } else {
        setUser(null);
        setSession(null);
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

  const isAdmin = user?.role === 'admin';

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
      }}
    >
      {children}
      <SubscriptionExpiredDialog
        isOpen={showExpiredDialog}
        onOpenChange={setShowExpiredDialog}
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