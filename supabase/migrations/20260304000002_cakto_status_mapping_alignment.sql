-- Alinhamento de status Cakto (docs oficiais)
-- Garante que status do webhook sejam normalizados corretamente para usuarios.status_da_assinatura

CREATE OR REPLACE FUNCTION public.normalize_subscription_status(raw_status text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  normalized text;
BEGIN
  normalized := lower(coalesce(raw_status, ''));

  IF normalized IN (
    'ativo', 'active', 'approved', 'paid', 'completed', 'success', 'authorized', 'premium', 'current_period'
  ) THEN
    RETURN 'ativo';
  END IF;

  IF normalized IN (
    'inativo', 'inactive', 'cancelled', 'canceled', 'expired', 'failed', 'refused',
    'refund', 'refunded', 'chargeback', 'in_protest', 'waiting_payment', 'processing',
    'past_due', 'unpaid', 'scheduled', 'abandoned'
  ) THEN
    RETURN 'inativo';
  END IF;

  RETURN 'inativo';
END;
$$;

COMMENT ON FUNCTION public.normalize_subscription_status(text)
IS 'Normaliza status recebidos do gateway Cakto (paid/active/refused/refund/chargeback/etc.) para ativo/inativo.';
