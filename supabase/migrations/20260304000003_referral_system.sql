-- Sistema de indicação

CREATE TABLE IF NOT EXISTS public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.referral_histories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id text NOT NULL,
  referred_user_id text,
  referred_email text,
  referral_code text NOT NULL,
  provider text NOT NULL DEFAULT 'cakto',
  event_id text,
  external_subscription_id text,
  plan text,
  status text NOT NULL DEFAULT 'confirmado',
  credit_units integer NOT NULL DEFAULT 1,
  valor_compra numeric(12,2) NOT NULL DEFAULT 0,
  comissao_percent numeric(5,2) NOT NULL DEFAULT 10,
  comissao_valor numeric(12,2) NOT NULL DEFAULT 0,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_referral_histories_status CHECK (status IN ('confirmado', 'pendente', 'cancelado'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_referral_histories_provider_event
  ON public.referral_histories(provider, event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referral_histories_referrer
  ON public.referral_histories(referrer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code
  ON public.referral_codes(code);

ALTER TABLE IF EXISTS public.usuarios
  ADD COLUMN IF NOT EXISTS indicacoes_creditos integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.normalize_referral_code(raw_code text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned text;
BEGIN
  IF raw_code IS NULL THEN
    RETURN NULL;
  END IF;

  cleaned := upper(regexp_replace(trim(raw_code), '[^A-Za-z0-9]', '', 'g'));

  IF cleaned = '' THEN
    RETURN NULL;
  END IF;

  RETURN cleaned;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_referral_code(p_user_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_code text;
  candidate text;
  attempts integer := 0;
BEGIN
  IF coalesce(trim(p_user_id), '') = '' THEN
    RAISE EXCEPTION 'user_id obrigatório';
  END IF;

  SELECT code INTO existing_code
  FROM public.referral_codes
  WHERE user_id = p_user_id
  LIMIT 1;

  IF existing_code IS NOT NULL THEN
    RETURN existing_code;
  END IF;

  LOOP
    candidate := upper(substring(md5(p_user_id || clock_timestamp()::text || random()::text) from 1 for 8));

    BEGIN
      INSERT INTO public.referral_codes(user_id, code, is_active)
      VALUES (p_user_id, candidate, true);

      RETURN candidate;
    EXCEPTION WHEN unique_violation THEN
      attempts := attempts + 1;
      IF attempts > 10 THEN
        RAISE EXCEPTION 'Não foi possível gerar código único de indicação';
      END IF;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_referral_credit(
  p_referral_code text,
  p_referred_user_id text DEFAULT NULL,
  p_referred_email text DEFAULT NULL,
  p_event_id text DEFAULT NULL,
  p_external_subscription_id text DEFAULT NULL,
  p_plan text DEFAULT NULL,
  p_valor_compra numeric DEFAULT 0,
  p_comissao_percent numeric DEFAULT 10,
  p_credit_units integer DEFAULT 1,
  p_payload jsonb DEFAULT NULL,
  p_provider text DEFAULT 'cakto'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_code text;
  referrer_id text;
  inserted_id uuid;
  final_valor_compra numeric(12,2);
  final_percent numeric(5,2);
  final_credit_units integer;
  final_comissao numeric(12,2);
BEGIN
  normalized_code := public.normalize_referral_code(p_referral_code);
  IF normalized_code IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
  END IF;

  SELECT rc.user_id
    INTO referrer_id
  FROM public.referral_codes rc
  WHERE rc.code = normalized_code
    AND rc.is_active = true
  LIMIT 1;

  IF referrer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'code_not_found');
  END IF;

  IF coalesce(p_referred_user_id, '') <> '' AND p_referred_user_id = referrer_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self_referral');
  END IF;

  IF coalesce(p_referred_user_id, '') <> '' AND EXISTS (
    SELECT 1
    FROM public.referral_histories rh
    WHERE rh.referred_user_id = p_referred_user_id
      AND rh.status = 'confirmado'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'referred_already_counted');
  END IF;

  final_valor_compra := greatest(coalesce(p_valor_compra, 0), 0)::numeric(12,2);
  final_percent := greatest(coalesce(p_comissao_percent, 10), 0)::numeric(5,2);
  final_credit_units := greatest(coalesce(p_credit_units, 1), 1);
  final_comissao := round((final_valor_compra * final_percent) / 100.0, 2)::numeric(12,2);

  INSERT INTO public.referral_histories (
    referrer_user_id,
    referred_user_id,
    referred_email,
    referral_code,
    provider,
    event_id,
    external_subscription_id,
    plan,
    status,
    credit_units,
    valor_compra,
    comissao_percent,
    comissao_valor,
    payload
  )
  VALUES (
    referrer_id,
    nullif(trim(coalesce(p_referred_user_id, '')), ''),
    nullif(trim(coalesce(p_referred_email, '')), ''),
    normalized_code,
    lower(coalesce(nullif(trim(p_provider), ''), 'cakto')),
    nullif(trim(coalesce(p_event_id, '')), ''),
    nullif(trim(coalesce(p_external_subscription_id, '')), ''),
    nullif(trim(coalesce(p_plan, '')), ''),
    'confirmado',
    final_credit_units,
    final_valor_compra,
    final_percent,
    final_comissao,
    coalesce(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (provider, event_id)
  DO NOTHING
  RETURNING id INTO inserted_id;

  IF inserted_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'duplicate_event');
  END IF;

  UPDATE public.usuarios
  SET indicacoes_creditos = coalesce(indicacoes_creditos, 0) + final_credit_units
  WHERE user_id = referrer_id;

  RETURN jsonb_build_object(
    'ok', true,
    'referrer_user_id', referrer_id,
    'credit_units', final_credit_units,
    'comissao_valor', final_comissao
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_referral_code(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_referral_credit(text, text, text, text, text, text, numeric, numeric, integer, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.normalize_referral_code(text) TO authenticated, anon, service_role;

COMMENT ON TABLE public.referral_codes IS 'Códigos únicos de indicação por usuário.';
COMMENT ON TABLE public.referral_histories IS 'Histórico de indicações convertidas em compra.';
COMMENT ON FUNCTION public.ensure_referral_code(text) IS 'Gera e/ou retorna código único de indicação por usuário.';
COMMENT ON FUNCTION public.apply_referral_credit(text, text, text, text, text, text, numeric, numeric, integer, jsonb, text) IS 'Registra conversão de indicação e contabiliza créditos para o indicador.';
