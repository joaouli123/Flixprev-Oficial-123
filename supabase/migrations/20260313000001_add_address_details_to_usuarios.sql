ALTER TABLE IF EXISTS public.usuarios
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS complemento text;
