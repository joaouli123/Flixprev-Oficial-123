CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  first_name text,
  last_name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.profiles IS 'Perfis publicos da aplicacao para roles e dados basicos do usuario.';
COMMENT ON COLUMN public.profiles.role IS 'Papel do usuario na aplicacao: user ou admin.';