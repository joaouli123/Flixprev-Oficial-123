ALTER TABLE IF EXISTS public.usuarios
  ADD COLUMN IF NOT EXISTS ramos_atuacao text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS logradouro text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS estado text,
  ADD COLUMN IF NOT EXISTS regiao text,
  ADD COLUMN IF NOT EXISTS sexo text,
  ADD COLUMN IF NOT EXISTS idade integer,
  ADD COLUMN IF NOT EXISTS data_nascimento date,
  ADD COLUMN IF NOT EXISTS origem_cadastro text,
  ADD COLUMN IF NOT EXISTS cadastro_finalizado_em timestamptz;

UPDATE public.usuarios u
SET origem_cadastro = CASE
  WHEN EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id::text = u.user_id
      AND lower(coalesce(s.provider, '')) = 'cakto'
  ) THEN 'compra_direta_cakto'
  ELSE 'cadastro_admin'
END
WHERE coalesce(trim(u.origem_cadastro), '') = '';