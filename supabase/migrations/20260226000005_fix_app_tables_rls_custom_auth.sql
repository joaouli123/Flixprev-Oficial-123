-- Ajuste de RLS para fluxo de autenticação customizado (/api/login)
-- Contexto: o app atual não usa sessão JWT do Supabase Auth, então auth.uid() fica NULL.
-- Resultado: policies baseadas em auth.uid() bloqueiam INSERT/UPDATE/DELETE.

-- Remover policies antigas (caso existam)
DROP POLICY IF EXISTS "Users can view their own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can insert their own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can update their own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can delete their own categories" ON public.categories;

DROP POLICY IF EXISTS "Users can view their own agents" ON public.agents;
DROP POLICY IF EXISTS "Users can insert their own agents" ON public.agents;
DROP POLICY IF EXISTS "Users can update their own agents" ON public.agents;
DROP POLICY IF EXISTS "Users can delete their own agents" ON public.agents;

DROP POLICY IF EXISTS "Users can view their own custom links" ON public.custom_links;
DROP POLICY IF EXISTS "Users can insert their own custom links" ON public.custom_links;
DROP POLICY IF EXISTS "Users can update their own custom links" ON public.custom_links;
DROP POLICY IF EXISTS "Users can delete their own custom links" ON public.custom_links;

-- Desabilitar RLS para compatibilidade imediata com autenticação custom
ALTER TABLE public.categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_links DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
