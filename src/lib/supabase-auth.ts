import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
const hasConfig = Boolean(supabaseUrl && supabaseAnonKey);

const missingConfigMessage =
  'Configuração de autenticação indisponível. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente de build.';

const buildMissingConfigError = () => ({
  message: missingConfigMessage,
  name: 'SupabaseConfigError',
});

const disabledSupabaseClient = {
  auth: {
    signInWithPassword: async () => ({
      data: { user: null, session: null },
      error: buildMissingConfigError(),
    }),
    getSession: async () => ({
      data: { session: null },
      error: buildMissingConfigError(),
    }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({
      data: {
        subscription: {
          unsubscribe: () => undefined,
        },
      },
    }),
    verifyOtp: async () => ({
      data: { user: null, session: null },
      error: buildMissingConfigError(),
    }),
    exchangeCodeForSession: async () => ({
      data: { user: null, session: null },
      error: buildMissingConfigError(),
    }),
    setSession: async () => ({
      data: { user: null, session: null },
      error: buildMissingConfigError(),
    }),
    updateUser: async () => ({
      data: { user: null },
      error: buildMissingConfigError(),
    }),
  },
  from: () => {
    throw new Error(missingConfigMessage);
  },
} as any;

if (!hasConfig) {
  console.error(`[AUTH] ${missingConfigMessage}`);
}

export const supabaseAuth = (hasConfig
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : disabledSupabaseClient) as any;

export function hasSupabaseAuthConfig() {
  return hasConfig;
}

export function getSupabaseAuthConfigErrorMessage() {
  return missingConfigMessage;
}
