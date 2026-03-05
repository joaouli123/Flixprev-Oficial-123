-- Campos adicionais para dados de compra/assinatura
ALTER TABLE IF EXISTS public.usuarios
  ADD COLUMN IF NOT EXISTS nome_completo text,
  ADD COLUMN IF NOT EXISTS telefone text;

-- Atualiza RPC do webhook Cakto para persistir nome completo e telefone
CREATE OR REPLACE FUNCTION public.upsert_subscription_from_cakto(
  p_user_id uuid DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_documento text DEFAULT NULL,
  p_nome_completo text DEFAULT NULL,
  p_telefone text DEFAULT NULL,
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

  INSERT INTO public.usuarios (
    user_id,
    email,
    documento,
    nome_completo,
    telefone,
    status_da_assinatura
  )
  VALUES (
    target_user::text,
    nullif(trim(p_email), ''),
    nullif(trim(p_documento), ''),
    nullif(trim(p_nome_completo), ''),
    nullif(trim(p_telefone), ''),
    normalized_user_status
  )
  ON CONFLICT (user_id) DO UPDATE
  SET email = COALESCE(EXCLUDED.email, public.usuarios.email),
      documento = COALESCE(EXCLUDED.documento, public.usuarios.documento),
      nome_completo = COALESCE(EXCLUDED.nome_completo, public.usuarios.nome_completo),
      telefone = COALESCE(EXCLUDED.telefone, public.usuarios.telefone),
      status_da_assinatura = EXCLUDED.status_da_assinatura;

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

GRANT EXECUTE ON FUNCTION public.upsert_subscription_from_cakto(uuid, text, text, text, text, text, text, timestamptz, text, text, text, jsonb, text) TO service_role;

COMMENT ON FUNCTION public.upsert_subscription_from_cakto(uuid, text, text, text, text, text, text, timestamptz, text, text, text, jsonb, text)
IS 'Sincroniza assinatura no usuarios/subscriptions com dados recebidos do webhook Cakto, incluindo nome completo e telefone.';
