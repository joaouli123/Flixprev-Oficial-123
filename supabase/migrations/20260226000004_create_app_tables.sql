CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  user_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  icon text,
  category_ids text[] DEFAULT '{}',
  title text NOT NULL,
  description text,
  link text,
  shortcuts text[] DEFAULT '{}',
  instructions text,
  attachments text[] DEFAULT '{}',
  user_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.custom_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  title text NOT NULL,
  url text NOT NULL,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- RLS desabilitado para compatibilidade com autenticacao custom via /api/login
ALTER TABLE public.categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_links DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
