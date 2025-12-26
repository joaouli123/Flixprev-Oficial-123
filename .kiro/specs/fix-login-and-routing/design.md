# Design Document

## Overview

Este documento descreve a solução para corrigir dois problemas críticos:

1. **Erro 404 ao atualizar páginas em produção**: Falta configuração de SPA fallback nos servidores
2. **Login falha para usuários criados pelo admin**: Usuários criados com `email_confirm: true` mas sem senha definida

## Architecture

### Problema 1: Erro 404 em Produção

**Análise do Problema:**
- A aplicação é uma SPA (Single Page Application) com React Router
- Quando o usuário acessa `/login` diretamente ou atualiza a página, o servidor tenta buscar o arquivo `/login`
- O servidor não encontra o arquivo e retorna 404
- O roteamento deveria ser feito pelo React Router no client-side

**Causa Raiz:**
- Falta configuração de "rewrites" ou "redirects" nos arquivos de deploy
- `vercel.json` tem apenas headers, mas não tem rewrites
- `netlify.toml` tem apenas headers, mas não tem redirects

**Solução:**
1. Adicionar rewrites no `vercel.json` para redirecionar todas as rotas para `index.html`
2. Adicionar redirects no `netlify.toml` para redirecionar todas as rotas para `index.html`
3. Manter os headers de segurança existentes

### Problema 2: Login Falha para Usuários Criados pelo Admin

**Análise do Problema:**
- Edge Function cria usuário com `email_confirm: true` (e-mail já confirmado)
- Edge Function define `password` no `createUser`
- Mas o Supabase pode não estar aceitando a senha definida pelo admin

**Investigação Necessária:**
Existem 3 possíveis causas:

**Causa 1: Senha não está sendo definida corretamente**
- O parâmetro `password` no `admin.createUser()` pode não estar funcionando como esperado
- Solução: Usar `email_confirm: false` e enviar e-mail de convite para o usuário definir a senha

**Causa 2: E-mail não está confirmado**
- Mesmo com `email_confirm: true`, pode haver algum problema
- Solução: Verificar se o e-mail está realmente confirmado no Supabase

**Causa 3: Senha não atende aos requisitos**
- A senha pode não atender aos requisitos mínimos do Supabase
- Solução: Validar senha antes de criar usuário

**Solução Recomendada:**
Usar o fluxo correto do Supabase para criação de usuários por admin:
1. Criar usuário com `email_confirm: false` (não confirmar automaticamente)
2. Usar `admin.inviteUserByEmail()` para enviar e-mail de convite
3. Usuário recebe e-mail e define sua própria senha
4. Isso garante que a senha é definida corretamente e o usuário tem controle

**Alternativa (se quiser definir senha pelo admin):**
1. Criar usuário com `email_confirm: true` e `password`
2. Após criar, usar `admin.updateUserById()` para garantir que a senha está definida
3. Adicionar logs detalhados para debug

## Components and Interfaces

### 1. Configuração Vercel (vercel.json)

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    // ... headers existentes
  ]
}
```

### 2. Configuração Netlify (netlify.toml)

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  # ... headers existentes
```

### 3. Edge Function - Opção 1: Enviar Convite (Recomendado)

```typescript
// Criar usuário SEM senha
const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
  email,
  email_confirm: false, // Não confirmar automaticamente
  user_metadata: { first_name, last_name },
});

// Enviar e-mail de convite
const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
```

### 4. Edge Function - Opção 2: Definir Senha (Alternativa)

```typescript
// Criar usuário COM senha
const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { first_name, last_name },
});

// Verificar se usuário foi criado corretamente
console.log('User created:', newUser);

// Opcional: Atualizar senha para garantir
if (newUser?.user?.id) {
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    newUser.user.id,
    { password }
  );
  if (updateError) {
    console.error('Error updating password:', updateError);
  }
}
```

## Data Models

Não há mudanças em modelos de dados.

## Error Handling

### Tratamento de Erros na Criação de Usuário

1. **Validar senha antes de criar usuário**
   - Mínimo 8 caracteres
   - Pelo menos 1 maiúscula, 1 minúscula, 1 número

2. **Logar erros detalhados**
   - Logar resposta completa do Supabase
   - Logar se e-mail foi confirmado
   - Logar se senha foi definida

3. **Retornar mensagens claras**
   - "Usuário criado com sucesso. E-mail de convite enviado."
   - "Erro ao criar usuário: [detalhes]"

## Testing Strategy

### Testes Manuais

1. **Testar Roteamento em Produção:**
   - Fazer deploy
   - Acessar `/login` diretamente
   - Atualizar a página (F5)
   - Verificar que não há erro 404
   - Testar outras rotas: `/app`, `/app/settings`, etc.

2. **Testar Criação de Usuário:**
   - Criar usuário pelo painel admin
   - Verificar se e-mail de convite foi enviado (Opção 1)
   - Ou verificar se usuário pode fazer login imediatamente (Opção 2)
   - Tentar fazer login com as credenciais
   - Verificar se login funciona

3. **Testar Fluxo Completo:**
   - Admin cria usuário
   - Usuário recebe e-mail
   - Usuário define senha (Opção 1) ou usa senha definida (Opção 2)
   - Usuário faz login
   - Usuário acessa /app
   - Usuário atualiza página
   - Verificar que tudo funciona

### Checklist de Validação

- [ ] Erro 404 não aparece ao atualizar páginas
- [ ] Todas as rotas funcionam após reload
- [ ] Usuário criado pelo admin pode fazer login
- [ ] E-mail de convite é enviado (Opção 1)
- [ ] Senha funciona imediatamente (Opção 2)
- [ ] Perfil é criado automaticamente
- [ ] Role é atualizado corretamente

## Implementation Notes

### Decisão: Qual Opção Usar?

**Opção 1: Enviar Convite (Recomendado)**
- ✅ Mais seguro (usuário define própria senha)
- ✅ Fluxo padrão do Supabase
- ✅ Usuário recebe e-mail de boas-vindas
- ❌ Usuário precisa clicar no e-mail antes de usar

**Opção 2: Definir Senha**
- ✅ Usuário pode fazer login imediatamente
- ✅ Admin tem controle total
- ❌ Menos seguro (admin conhece a senha)
- ❌ Pode ter problemas com confirmação de e-mail

**Recomendação:** Usar Opção 1 (enviar convite) para seguir as melhores práticas de segurança.

### Arquivos a Modificar

1. `vercel.json` - Adicionar rewrites
2. `netlify.toml` - Adicionar redirects
3. `supabase/functions/admin-create-user/index.ts` - Mudar lógica de criação
4. `src/components/admin/CreateUserDialog.tsx` - Atualizar mensagens (opcional)

### Ordem de Implementação

1. Corrigir roteamento SPA (vercel.json e netlify.toml)
2. Testar deploy e verificar se 404 foi corrigido
3. Modificar Edge Function para usar inviteUserByEmail
4. Testar criação de usuário
5. Validar fluxo completo

### Considerações de Segurança

- Senha definida pelo admin deve ser forte (validar com Zod)
- E-mail de convite deve ter link seguro com token
- Usuário deve ser forçado a trocar senha no primeiro login (opcional)
- Logar todas as ações administrativas para auditoria
