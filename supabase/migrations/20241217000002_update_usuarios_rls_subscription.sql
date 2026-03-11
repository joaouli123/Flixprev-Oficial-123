-- Migração para atualizar políticas RLS da tabela usuarios
-- Permite acesso ao campo status_da_assinatura para usuários autenticados

-- Política para permitir que usuários vejam seu próprio status de assinatura
DROP POLICY IF EXISTS "Usuários podem ver seu próprio status de assinatura" ON public.usuarios;

CREATE POLICY "Usuários podem ver seu próprio status de assinatura" ON public.usuarios
    FOR SELECT USING (auth.uid()::text = user_id);

-- Política para permitir que usuários atualizem seu próprio status de assinatura (se necessário)
DROP POLICY IF EXISTS "Usuários podem atualizar seu próprio status de assinatura" ON public.usuarios;

CREATE POLICY "Usuários podem atualizar seu próprio status de assinatura" ON public.usuarios
    FOR UPDATE USING (auth.uid()::text = user_id);

-- Política para permitir inserção de novos usuários com status de assinatura
DROP POLICY IF EXISTS "Permitir inserção de novos usuários" ON public.usuarios;

CREATE POLICY "Permitir inserção de novos usuários" ON public.usuarios
    FOR INSERT WITH CHECK (auth.uid()::text = user_id);

-- Função para verificar se a assinatura está ativa
CREATE OR REPLACE FUNCTION public.is_subscription_active(user_uuid uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    subscription_status text;
BEGIN
    -- Busca o status da assinatura do usuário
    SELECT status_da_assinatura INTO subscription_status
    FROM public.usuarios
    WHERE user_id = user_uuid::text;
    
    -- Retorna true se o status for 'ativo', 'active', 'paid' ou similar
    RETURN subscription_status IN ('ativo', 'active', 'paid', 'premium');
END;
$$;

-- Função para obter informações da assinatura do usuário atual
CREATE OR REPLACE FUNCTION public.get_user_subscription()
RETURNS TABLE (
    user_id text,
    email text,
    status_da_assinatura text,
    documento text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.user_id,
        u.email,
        u.status_da_assinatura,
        u.documento,
        u.created_at
    FROM public.usuarios u
    WHERE u.user_id = auth.uid()::text;
END;
$$;

-- Comentários para documentação
COMMENT ON FUNCTION public.is_subscription_active IS 'Verifica se a assinatura do usuário está ativa';
COMMENT ON FUNCTION public.get_user_subscription IS 'Retorna informações da assinatura do usuário autenticado';