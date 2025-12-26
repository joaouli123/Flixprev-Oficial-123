import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/components/SessionContextProvider';

interface SubscriptionData {
  status: string | null;
  isActive: boolean;
}

// Helper function moved outside the hook
const isSubscriptionActive = (status: string | null): boolean => {
  if (!status) return false;
  const activeStatuses = ['ativo', 'active', 'paid', 'premium'];
  return activeStatuses.includes(status.toLowerCase());
};

export const useSubscription = (): SubscriptionData => {
  const { subscriptionStatus } = useSession();

  // The core status and activity check rely entirely on the context
  return {
    status: subscriptionStatus,
    isActive: isSubscriptionActive(subscriptionStatus),
  };
};

// Hook adicional para verificar se o usuário pode acessar funcionalidades premium
export const useCanAccessPremium = (): boolean => {
  const { isActive } = useSubscription();
  return isActive;
};

// Hook para obter informações detalhadas da assinatura
export const useSubscriptionDetails = () => {
  const { session } = useSession();
  const [details, setDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscriptionDetails = async () => {
    if (!session?.user?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      // Note: We use user_id (UUID) from session, but the 'usuarios' table uses user_id (TEXT)
      // This is handled by Supabase's implicit casting or the RLS policy.
      const { data, error: fetchError } = await supabase
        .from('usuarios')
        .select('status_da_assinatura, email, documento, created_at')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (fetchError) {
        setError('Erro ao buscar detalhes da assinatura');
        console.error('Erro ao buscar detalhes:', fetchError);
      } else {
        setDetails(data);
      }
    } catch (err) {
      setError('Erro inesperado ao buscar detalhes');
      console.error('Erro inesperado:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.id) {
      fetchSubscriptionDetails();
    }
  }, [session?.user?.id]);

  return {
    details,
    isLoading,
    error,
    refresh: fetchSubscriptionDetails,
  };
};