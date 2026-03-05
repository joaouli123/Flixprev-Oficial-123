-- Cakto webhook + sincronização de assinaturas

-- Garantir estrutura de assinaturas para integração externa
ALTER TABLE IF EXISTS public.subscriptions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_customer_id text,
  ADD COLUMN IF NOT EXISTS external_subscription_id text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_by_webhook_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_event_id text;

CREATE INDEX IF NOT EXISTS idx_subscriptions_external_subscription_id
  ON public.subscriptions(external_subscription_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_provider
  ON public.subscriptions(provider);

-- Log de eventos de webhook (idempotência e auditoria)
CREATE TABLE IF NOT EXISTS public.subscription_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL,
  event_type text,
  payload jsonb NOT NULL,
  processing_status text NOT NULL DEFAULT 'processed' CHECK (processing_status IN ('processed', 'ignored', 'error')),
  matched_user_id uuid,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_subscription_webhook_events_provider_event
  ON public.subscription_webhook_events(provider, event_id);

CREATE INDEX IF NOT EXISTS idx_subscription_webhook_events_created_at
  ON public.subscription_webhook_events(created_at DESC);

ALTER TABLE public.subscription_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins podem ler eventos de webhook" ON public.subscription_webhook_events;
CREATE POLICY "Admins podem ler eventos de webhook"
  ON public.subscription_webhook_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Normalização de status recebidos do gateway
CREATE OR REPLACE FUNCTION public.normalize_subscription_status(raw_status text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  normalized text;
BEGIN
  normalized := lower(coalesce(raw_status, ''));

  IF normalized IN ('ativo', 'active', 'approved', 'paid', 'completed', 'success', 'authorized', 'premium') THEN
    RETURN 'ativo';
  END IF;

  IF normalized IN ('inativo', 'inactive', 'cancelled', 'canceled', 'expired', 'failed', 'refunded', 'chargeback', 'past_due', 'unpaid') THEN
    RETURN 'inativo';
  END IF;

  RETURN 'inativo';
END;
$$;

-- RPC já usada pela função admin-update-subscription-status
CREATE OR REPLACE FUNCTION public.admin_update_user_subscription_status(user_uuid uuid, new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_user_status text;
  normalized_subscription_status text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  normalized_user_status := public.normalize_subscription_status(new_status);
  normalized_subscription_status := CASE WHEN normalized_user_status = 'ativo' THEN 'active' ELSE 'inactive' END;

  UPDATE public.usuarios
  SET status_da_assinatura = normalized_user_status
  WHERE user_id::text = user_uuid::text;

  INSERT INTO public.subscriptions (user_id, status, provider, updated_by_webhook_at, metadata)
  VALUES (user_uuid, normalized_subscription_status, 'manual', now(), '{}'::jsonb)
  ON CONFLICT (user_id) DO UPDATE
  SET status = EXCLUDED.status,
      provider = EXCLUDED.provider,
      updated_by_webhook_at = EXCLUDED.updated_by_webhook_at,
      metadata = COALESCE(public.subscriptions.metadata, '{}'::jsonb);
END;
$$;

-- Upsert central para webhook Cakto
CREATE OR REPLACE FUNCTION public.upsert_subscription_from_cakto(
  p_user_id uuid DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_documento text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_plan text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_external_customer_id text DEFAULT NULL,
  p_external_subscription_id text DEFAULT NULL,
  p_event_id text DEFAULT NULL,
  p_payload jsonb DEFAULT NULL,
  p_event_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user uuid;
  normalized_user_status text;
  normalized_subscription_status text;
  normalized_plan text;
BEGIN
  target_user := p_user_id;

  IF target_user IS NULL AND coalesce(trim(p_email), '') <> '' THEN
    SELECT CASE
      WHEN u.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN u.user_id::uuid
      ELSE NULL
    END
    INTO target_user
    FROM public.usuarios u
    WHERE lower(coalesce(u.email, '')) = lower(trim(p_email))
    ORDER BY u.created_at DESC
    LIMIT 1;
  END IF;

  IF target_user IS NULL AND coalesce(trim(p_documento), '') <> '' THEN
    SELECT CASE
      WHEN u.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN u.user_id::uuid
      ELSE NULL
    END
    INTO target_user
    FROM public.usuarios u
    WHERE regexp_replace(coalesce(u.documento, ''), '\\D', '', 'g') = regexp_replace(trim(p_documento), '\\D', '', 'g')
    ORDER BY u.created_at DESC
    LIMIT 1;
  END IF;

  IF target_user IS NULL THEN
    IF coalesce(trim(p_event_id), '') <> '' THEN
      INSERT INTO public.subscription_webhook_events (
        provider,
        event_id,
        event_type,
        payload,
        processing_status,
        error_message,
        processed_at
      )
      VALUES (
        'cakto',
        trim(p_event_id),
        p_event_type,
        coalesce(p_payload, '{}'::jsonb),
        'ignored',
        'user_not_found',
        now()
      )
      ON CONFLICT (provider, event_id) DO UPDATE
      SET event_type = EXCLUDED.event_type,
          payload = EXCLUDED.payload,
          processing_status = EXCLUDED.processing_status,
          error_message = EXCLUDED.error_message,
          processed_at = EXCLUDED.processed_at;
    END IF;

    RETURN jsonb_build_object(
      'ok', false,
      'error', 'user_not_found'
    );
  END IF;

  normalized_user_status := public.normalize_subscription_status(p_status);
  normalized_subscription_status := CASE WHEN normalized_user_status = 'ativo' THEN 'active' ELSE 'inactive' END;

  normalized_plan := lower(coalesce(p_plan, ''));
  IF normalized_plan NOT IN ('basic', 'premium', 'enterprise') THEN
    normalized_plan := 'basic';
  END IF;

  INSERT INTO public.subscriptions (
    user_id,
    status,
    plan_type,
    expires_at,
    provider,
    external_customer_id,
    external_subscription_id,
    metadata,
    updated_by_webhook_at,
    last_event_id
  )
  VALUES (
    target_user,
    normalized_subscription_status,
    normalized_plan,
    p_expires_at,
    'cakto',
    p_external_customer_id,
    p_external_subscription_id,
    coalesce(p_payload, '{}'::jsonb),
    now(),
    p_event_id
  )
  ON CONFLICT (user_id) DO UPDATE
  SET status = EXCLUDED.status,
      plan_type = EXCLUDED.plan_type,
      expires_at = COALESCE(EXCLUDED.expires_at, public.subscriptions.expires_at),
      provider = EXCLUDED.provider,
      external_customer_id = COALESCE(EXCLUDED.external_customer_id, public.subscriptions.external_customer_id),
      external_subscription_id = COALESCE(EXCLUDED.external_subscription_id, public.subscriptions.external_subscription_id),
      metadata = COALESCE(EXCLUDED.metadata, public.subscriptions.metadata),
      updated_by_webhook_at = EXCLUDED.updated_by_webhook_at,
      last_event_id = COALESCE(EXCLUDED.last_event_id, public.subscriptions.last_event_id);

  UPDATE public.usuarios
  SET status_da_assinatura = normalized_user_status
  WHERE user_id::text = target_user::text;

  IF coalesce(trim(p_event_id), '') <> '' THEN
    INSERT INTO public.subscription_webhook_events (
      provider,
      event_id,
      event_type,
      payload,
      processing_status,
      matched_user_id,
      processed_at
    )
    VALUES (
      'cakto',
      trim(p_event_id),
      p_event_type,
      coalesce(p_payload, '{}'::jsonb),
      'processed',
      target_user,
      now()
    )
    ON CONFLICT (provider, event_id) DO UPDATE
    SET event_type = EXCLUDED.event_type,
        payload = EXCLUDED.payload,
        processing_status = EXCLUDED.processing_status,
        matched_user_id = EXCLUDED.matched_user_id,
        error_message = NULL,
        processed_at = EXCLUDED.processed_at;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', target_user,
    'status_da_assinatura', normalized_user_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_subscription_from_cakto(uuid, text, text, text, text, timestamptz, text, text, text, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_user_subscription_status(uuid, text) TO authenticated, service_role;

COMMENT ON TABLE public.subscription_webhook_events IS 'Auditoria e idempotência dos webhooks de assinatura.';
COMMENT ON FUNCTION public.upsert_subscription_from_cakto(uuid, text, text, text, text, timestamptz, text, text, text, jsonb, text) IS 'Sincroniza assinatura no usuarios/subscriptions com dados recebidos do webhook Cakto.';
