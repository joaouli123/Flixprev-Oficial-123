import React, { useState, useEffect, createContext, useContext } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useNavigate, useLocation } from 'react-router-dom';
import { Profile } from '@/types/app';
import { SubscriptionExpiredDialog } from './SubscriptionExpiredDialog';
import { logger } from '@/utils/logger';

interface SessionContextType {
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  subscriptionStatus: string | null;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

export const SessionContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); // Supabase desativado, carregamento instantâneo
  const [showExpiredDialog, setShowExpiredDialog] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const fetchUserProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      logger.error("Erro ao buscar perfil do usuário:", error.message);
      setProfile(null);
    } else if (data === null) {
      logger.warn(`Perfil não encontrado para o usuário: ${userId}. Certifique-se de que o trigger 'handle_new_user' está funcionando ou crie o perfil manualmente.`);
      setProfile(null);
    } else {
      setProfile(data as Profile);
    }
  };

  const fetchUserSubscriptionStatus = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('status_da_assinatura')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        logger.error("Erro ao buscar status da assinatura:", error.message);
        setSubscriptionStatus(null);
        return null;
      }

      if (data) {
        setSubscriptionStatus(data.status_da_assinatura);
        return data.status_da_assinatura;
      } else {
        logger.warn(`Status de assinatura não encontrado para o usuário: ${userId}`);
        setSubscriptionStatus(null);
        return null;
      }
    } catch (error) {
      logger.error("Erro inesperado ao buscar status da assinatura:", error);
      setSubscriptionStatus(null);
      return null;
    }
  };

  const isSubscriptionActive = (status: string | null): boolean => {
    if (!status) return false;
    // Usando 'desativado' conforme a correção anterior
    const activeStatuses = ['ativo', 'active', 'paid', 'premium'];
    return activeStatuses.includes(status.toLowerCase());
  };

  useEffect(() => {
    let isMounted = true;

    // Função auxiliar para verificar se a URL contém parâmetros de autenticação
    const isAuthCallbackUrl = () => {
      const hash = window.location.hash;
      return hash.includes('access_token=') || hash.includes('type=recovery') || hash.includes('type=signup');
    };

    const handleSession = async (currentSession: Session | null) => {
      if (!isMounted) return;

      // --- DETECÇÃO DE CONVITE/RECUPERAÇÃO (PRIORIDADE MÁXIMA) ---
      // Verificar PRIMEIRO se é um convite ou recuperação de senha
      const hash = window.location.hash;
      const isRecoveryOrInvite = hash.includes('type=recovery') || hash.includes('type=invite') || hash.includes('type=signup');
      
      // Se for convite/recuperação e não estiver na página de reset, redirecionar IMEDIATAMENTE
      if (isRecoveryOrInvite && location.pathname !== '/reset-password') {
        logger.warn('Convite/recuperação detectado, redirecionando para /reset-password');
        setSession(currentSession);
        if (currentSession) {
          await fetchUserProfile(currentSession.user.id);
        }
        navigate('/reset-password', { replace: true });
        setLoading(false);
        return;
      }
      
      // Se estiver na página de reset-password com sessão de recuperação, apenas carregar
      if (isRecoveryOrInvite && location.pathname === '/reset-password') {
        setSession(currentSession);
        if (currentSession) {
          await fetchUserProfile(currentSession.user.id);
        }
        setLoading(false);
        return;
      }
      // --- FIM DA DETECÇÃO ---

      // --- NOVA LÓGICA DE PRIORIDADE PARA CALLBACKS DE AUTENTICAÇÃO ---
      // Se a URL é um callback de autenticação, apenas atualizamos a sessão e o estado de carregamento.
      // NÃO FAZEMOS NENHUM REDIRECIONAMENTO AUTOMÁTICO AQUI.
      // A página específica (ex: ResetPassword) é responsável por lidar com a sessão e a navegação.
      if (isAuthCallbackUrl()) {
        setSession(currentSession);
        // Ainda podemos buscar o perfil e status de assinatura para o contexto,
        // mas sem acionar redirecionamentos baseados neles.
        if (currentSession) {
          await fetchUserProfile(currentSession.user.id);
          await new Promise(resolve => setTimeout(resolve, 100));
          await fetchUserSubscriptionStatus(currentSession.user.id);
        }
        setLoading(false);
        return; // IMPORTANTE: Sair cedo para evitar qualquer outra lógica de redirecionamento
      }
      // --- FIM DA NOVA LÓGICA ---

      // --- PROTEÇÃO CONTRA ACESSO AO /app DURANTE REDEFINIÇÃO DE SENHA ---
      // Verifica se o usuário está tentando acessar /app com uma sessão de recuperação de senha ATIVA
      if (currentSession && location.pathname.startsWith('/app')) {
        // Apenas bloqueia se for uma sessão de recuperação REAL (com type=recovery na URL)
        const isActiveRecoverySession = hash.includes('type=recovery') || hash.includes('type=invite') || hash.includes('type=signup');
        
        if (isActiveRecoverySession) {
          logger.warn('Tentativa de acesso ao /app durante processo de redefinição de senha bloqueada');
          navigate('/reset-password');
          setLoading(false);
          return;
        }
      }
      // --- FIM DA PROTEÇÃO ---


      setSession(currentSession);
      if (currentSession) {
        // Usuário está autenticado (e não em uma URL de callback de autenticação)
        await fetchUserProfile(currentSession.user.id);
        await new Promise(resolve => setTimeout(resolve, 100)); // Pequeno atraso
        
        const { data: profileData } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', currentSession.user.id)
          .maybeSingle();
        
        const userIsAdmin = profileData?.role === 'admin';
        const status = await fetchUserSubscriptionStatus(currentSession.user.id);
        
        // Não verificar assinatura se estiver em processo de reset de senha
        if (location.pathname !== '/reset-password') {
          if (!isSubscriptionActive(status) && !userIsAdmin) {
            setShowExpiredDialog(true);
            await supabase.auth.signOut();
            navigate('/login');
            if (isMounted) setLoading(false);
            return;
          }
        }
        
        // Se o usuário está autenticado e em uma rota pública (como login/landing), redirecionar para /app
        // Nota: /reset-password não deve redirecionar pois precisa permitir que usuários com sessão de recuperação redefinam a senha
        const publicRoutesToRedirectFrom = ['/login', '/', '/esqueci-senha'];
        if (publicRoutesToRedirectFrom.includes(location.pathname)) {
          navigate('/app');
        }
      } else {
        // Usuário NÃO está autenticado (e não em uma URL de callback de autenticação)
        setProfile(null);
        setSubscriptionStatus(null);
        const publicRoutesAllowed = ['/login', '/', '/obrigado', '/privacy', '/terms', '/cookie-policy', '/lgpd', '/esqueci-senha', '/reset-password'];
        if (!publicRoutesAllowed.includes(location.pathname)) {
          navigate('/login');
        }
      }
      if (isMounted) setLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      handleSession(initialSession);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      handleSession(currentSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [navigate, location.pathname]);

  const isAdmin = profile?.role === 'admin';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <>
      <SessionContext.Provider value={{ session, profile, isAdmin, subscriptionStatus }}>
        {children}
      </SessionContext.Provider>
      
      <SubscriptionExpiredDialog
        isOpen={showExpiredDialog}
        onClose={() => setShowExpiredDialog(false)}
        userEmail={session?.user?.email}
      />
    </>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionContextProvider');
  }
  return context;
};