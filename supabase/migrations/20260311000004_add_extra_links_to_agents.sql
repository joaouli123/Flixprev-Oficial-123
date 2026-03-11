ALTER TABLE IF EXISTS public.agents
  ADD COLUMN IF NOT EXISTS extra_links jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.agents
SET extra_links = '[]'::jsonb
WHERE extra_links IS NULL;
