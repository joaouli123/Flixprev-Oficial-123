import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { neon as supabase } from "@/lib/neon"
import { toast } from 'sonner';

interface AppSettings {
  logo_url: string | null;
  favicon_url: string | null;
  facebook_pixel_id: string | null; // Adicionado
  facebook_capi_token: string | null; // Adicionado
}

interface AppSettingsContextType {
  settings: AppSettings | null;
  loading: boolean;
  refetchSettings: () => Promise<void>;
}

const AppSettingsContext = createContext<AppSettingsContextType | undefined>(undefined);

export const AppSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(false); // Supabase desativado

  const fetchSettings = useCallback(async () => {
    // Supabase desativado - usando Neon para o banco de dados
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Efeito para inicializar o Facebook Pixel
  useEffect(() => {
    if (settings?.facebook_pixel_id && typeof window !== 'undefined' && (window as any).fbq) {
      const fbq = (window as any).fbq;
      fbq('init', settings.facebook_pixel_id);
      fbq('track', 'PageView');
    }
  }, [settings?.facebook_pixel_id]);

  return (
    <AppSettingsContext.Provider value={{ settings, loading, refetchSettings: fetchSettings }}>
      {children}
    </AppSettingsContext.Provider>
  );
};

export const useAppSettings = () => {
  const context = useContext(AppSettingsContext);
  if (context === undefined) {
    throw new Error('useAppSettings must be used within an AppSettingsProvider');
  }
  return context;
};