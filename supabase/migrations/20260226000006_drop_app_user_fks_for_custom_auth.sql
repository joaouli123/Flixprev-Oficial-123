-- Remove FKs para auth.users nas tabelas do app
-- Necessário quando o login é custom (/api/login) e o user_id não existe em auth.users

ALTER TABLE IF EXISTS public.categories
  DROP CONSTRAINT IF EXISTS categories_user_id_fkey;

ALTER TABLE IF EXISTS public.agents
  DROP CONSTRAINT IF EXISTS agents_user_id_fkey;

ALTER TABLE IF EXISTS public.custom_links
  DROP CONSTRAINT IF EXISTS custom_links_user_id_fkey;

NOTIFY pgrst, 'reload schema';
