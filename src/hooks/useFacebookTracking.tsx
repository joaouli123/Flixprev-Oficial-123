import { useCallback } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { toast } from 'sonner';

// Definição de tipos para os dados do evento
interface UserData {
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  // Adicione outros campos de dados do usuário conforme necessário
}

interface CustomData {
  value?: number;
  currency?: string;
  content_name?: string;
  content_category?: string;
  // Adicione outros campos de dados personalizados
}

interface TrackEventParams {
  event_name: string; // Ex: 'Purchase', 'Lead', 'PageView', 'CustomEvent'
  user_data: UserData;
  custom_data?: CustomData;
  action_source?: 'website' | 'app' | 'physical_store' | 'system';
  event_source_url?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export const useFacebookTracking = () => {
  const { session } = useSession();

  const trackEvent = useCallback(async ({
    event_name,
    user_data,
    custom_data,
    action_source = 'website',
    event_source_url = window.location.href,
  }: TrackEventParams) => {
    
    // 1. Rastreamento via Pixel (Client-side)
    if (typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', event_name, custom_data);
    }

    // 2. Rastreamento via CAPI (Server-side via Edge Function)
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/facebook-capi-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Se o usuário estiver logado, enviamos o token para autenticação e identificação
          ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({
          event_name,
          user_data,
          custom_data,
          action_source,
          event_source_url,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("CAPI Tracking Error:", errorData);
        // Não mostramos toast para o usuário final, apenas logamos o erro
      } else {
        // console.log("CAPI Event Sent:", await response.json());
      }
    } catch (error) {
      console.error("Failed to send CAPI event:", error);
    }
  }, [session?.access_token]);

  return { trackEvent };
};
