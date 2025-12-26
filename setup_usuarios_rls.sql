-- Políticas RLS Seguras para a Tabela usuarios
-- Este arquivo configura Row Level Security (RLS) para proteger os dados dos usuários

-- 1. Habilitar RLS na tabela usuarios
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

-- 2. Remover políticas existentes (se houver)
DROP POLICY IF EXISTS "usuarios_select_policy" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_insert_policy" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_update_policy" ON public.usuarios;
DROP POLICY IF EXISTS "usuarios_delete_policy" ON public.usuarios;

-- 3. Política de SELECT (Leitura)
-- Usuários autenticados podem ver apenas seus próprios dados
-- Administradores podem ver todos os dados
CREATE POLICY "usuarios_select_policy" ON public.usuarios
    FOR SELECT
    USING (
        -- Verificar se o usuário está autenticado
        auth.uid() IS NOT NULL
        AND (
            -- Usuário pode ver seus próprios dados
            auth.uid()::text = user_id
            OR
            -- Administradores podem ver todos os dados
            EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE profiles.id = auth.uid() 
                AND profiles.role = 'admin'
            )
        )
    );

-- 4. Política de INSERT (Criação)
-- Apenas administradores podem inserir novos registros
CREATE POLICY "usuarios_insert_policy" ON public.usuarios
    FOR INSERT
    WITH CHECK (
        -- Verificar se o usuário está autenticado
        auth.uid() IS NOT NULL
        AND
        -- Apenas administradores podem inserir
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- 5. Política de UPDATE (Atualização)
-- Usuários podem atualizar apenas seus próprios dados
-- Administradores podem atualizar qualquer registro
CREATE POLICY "usuarios_update_policy" ON public.usuarios
    FOR UPDATE
    USING (
        -- Verificar se o usuário está autenticado
        auth.uid() IS NOT NULL
        AND (
            -- Usuário pode atualizar seus próprios dados
            auth.uid()::text = user_id
            OR
            -- Administradores podem atualizar qualquer registro
            EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE profiles.id = auth.uid() 
                AND profiles.role = 'admin'
            )
        )
    )
    WITH CHECK (
        -- Verificar se o usuário está autenticado
        auth.uid() IS NOT NULL
        AND (
            -- Usuário pode atualizar seus próprios dados
            auth.uid()::text = user_id
            OR
            -- Administradores podem atualizar qualquer registro
            EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE profiles.id = auth.uid() 
                AND profiles.role = 'admin'
            )
        )
    );

-- 6. Política de DELETE (Exclusão)
-- Apenas administradores podem deletar registros
CREATE POLICY "usuarios_delete_policy" ON public.usuarios
    FOR DELETE
    USING (
        -- Verificar se o usuário está autenticado
        auth.uid() IS NOT NULL
        AND
        -- Apenas administradores podem deletar
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );

-- 7. Garantir que a tabela profiles tenha RLS habilitado (segurança adicional)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 8. Política para profiles (se não existir)
-- Permite que usuários vejam perfis necessários para verificação de roles
DROP POLICY IF EXISTS "profiles_select_for_rls" ON public.profiles;
CREATE POLICY "profiles_select_for_rls" ON public.profiles
    FOR SELECT
    USING (
        -- Usuários autenticados podem ver perfis para verificação de roles
        auth.uid() IS NOT NULL
    );

-- 9. Comentários para documentação
COMMENT ON POLICY "usuarios_select_policy" ON public.usuarios IS 
'Permite que usuários vejam apenas seus próprios dados. Administradores podem ver todos os dados.';

COMMENT ON POLICY "usuarios_insert_policy" ON public.usuarios IS 
'Apenas administradores podem criar novos registros de usuários.';

COMMENT ON POLICY "usuarios_update_policy" ON public.usuarios IS 
'Usuários podem atualizar apenas seus próprios dados. Administradores podem atualizar qualquer registro.';

COMMENT ON POLICY "usuarios_delete_policy" ON public.usuarios IS 
'Apenas administradores podem deletar registros de usuários.';

-- 10. Verificação de segurança adicional
-- Criar função para verificar se um usuário é admin (opcional, para reutilização)
CREATE OR REPLACE FUNCTION public.is_admin(user_uuid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = user_uuid 
        AND profiles.role = 'admin'
    );
$$;

-- Comentário da função
COMMENT ON FUNCTION public.is_admin(uuid) IS 
'Função auxiliar para verificar se um usuário tem role de administrador. Usada nas políticas RLS.';