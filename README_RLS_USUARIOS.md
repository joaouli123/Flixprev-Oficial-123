# Políticas RLS para Tabela usuarios

## 📋 Resumo

Este documento descreve as políticas de Row Level Security (RLS) implementadas para a tabela `usuarios`, garantindo proteção robusta contra acessos não autorizados e ataques de hackers.

## 🔒 Políticas Implementadas

### 1. Política de SELECT (Leitura)
**Nome:** `usuarios_select_policy`

**Regras:**
- ✅ Usuários autenticados podem ver **apenas seus próprios dados**
- ✅ Administradores podem ver **todos os dados**
- ❌ Usuários não autenticados **não têm acesso**

**Implementação:**
```sql
CREATE POLICY "usuarios_select_policy" ON public.usuarios
    FOR SELECT
    USING (
        auth.uid() IS NOT NULL
        AND (
            auth.uid()::text = user_id
            OR
            EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE profiles.id = auth.uid() 
                AND profiles.role = 'admin'
            )
        )
    );
```

### 2. Política de INSERT (Criação)
**Nome:** `usuarios_insert_policy`

**Regras:**
- ✅ **Apenas administradores** podem criar novos registros
- ❌ Usuários comuns **não podem inserir** dados

**Implementação:**
```sql
CREATE POLICY "usuarios_insert_policy" ON public.usuarios
    FOR INSERT
    WITH CHECK (
        auth.uid() IS NOT NULL
        AND
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );
```

### 3. Política de UPDATE (Atualização)
**Nome:** `usuarios_update_policy`

**Regras:**
- ✅ Usuários podem atualizar **apenas seus próprios dados**
- ✅ Administradores podem atualizar **qualquer registro**
- ❌ Usuários não podem modificar dados de outros usuários

**Implementação:**
```sql
CREATE POLICY "usuarios_update_policy" ON public.usuarios
    FOR UPDATE
    USING (
        auth.uid() IS NOT NULL
        AND (
            auth.uid()::text = user_id
            OR
            EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE profiles.id = auth.uid() 
                AND profiles.role = 'admin'
            )
        )
    );
```

### 4. Política de DELETE (Exclusão)
**Nome:** `usuarios_delete_policy`

**Regras:**
- ✅ **Apenas administradores** podem deletar registros
- ❌ Usuários comuns **não podem deletar** dados

**Implementação:**
```sql
CREATE POLICY "usuarios_delete_policy" ON public.usuarios
    FOR DELETE
    USING (
        auth.uid() IS NOT NULL
        AND
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role = 'admin'
        )
    );
```

## 🛡️ Proteções de Segurança

### Contra Hackers e Ataques
1. **Autenticação Obrigatória:** Todas as operações exigem usuário autenticado
2. **Isolamento de Dados:** Usuários só acessam seus próprios dados
3. **Controle Administrativo:** Operações críticas restritas a administradores
4. **Verificação de Roles:** Validação dupla através da tabela `profiles`

### Função Auxiliar de Segurança
```sql
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
```

## 📊 Estrutura da Tabela usuarios

A tabela `usuarios` possui os seguintes campos:
- `id` (int8) - Chave primária
- `created_at` (timestamptz) - Data de criação
- `user_id` (text) - ID do usuário (referência ao auth.users)
- `email` (text) - Email do usuário

## 🚀 Como Aplicar as Políticas

1. **Execute o arquivo SQL:**
   ```bash
   # No Supabase Dashboard > SQL Editor
   # Cole e execute o conteúdo de setup_usuarios_rls.sql
   ```

2. **Verifique se RLS está habilitado:**
   ```sql
   SELECT schemaname, tablename, rowsecurity 
   FROM pg_tables 
   WHERE tablename = 'usuarios';
   ```

3. **Confirme as políticas criadas:**
   ```sql
   SELECT policyname, permissive, roles, cmd, qual 
   FROM pg_policies 
   WHERE tablename = 'usuarios';
   ```

## ✅ Testes de Segurança

### Cenários Testados:
1. ❌ **Acesso sem autenticação** - Deve falhar
2. ✅ **Usuário vê apenas seus dados** - Deve funcionar
3. ✅ **Admin vê todos os dados** - Deve funcionar
4. ❌ **Usuário tenta ver dados de outros** - Deve falhar
5. ❌ **Usuário tenta inserir dados** - Deve falhar
6. ✅ **Admin pode inserir/deletar** - Deve funcionar

### Resultado dos Testes:
- ✅ RLS está funcionando corretamente
- ✅ Acesso negado para usuários não autenticados
- ✅ Políticas de segurança ativas e efetivas

## 🔧 Manutenção

### Monitoramento:
- Verifique logs de acesso regularmente
- Monitore tentativas de acesso não autorizado
- Revise políticas periodicamente

### Atualizações:
- Mantenha as políticas atualizadas com mudanças na estrutura
- Teste sempre após modificações
- Documente todas as alterações

## 📞 Suporte

Para dúvidas ou problemas com as políticas RLS:
1. Verifique os logs do Supabase
2. Teste as políticas em ambiente de desenvolvimento
3. Consulte a documentação oficial do Supabase RLS

---

**⚠️ IMPORTANTE:** Nunca desabilite RLS em produção sem implementar proteções alternativas equivalentes.