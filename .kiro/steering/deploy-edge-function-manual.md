# Deploy Manual da Edge Function - admin-create-user

## 🚨 IMPORTANTE: Deploy Necessário

A Edge Function `admin-create-user` foi atualizada para criar usuários com senha definida pelo admin (sem envio de email de convite).

**Você precisa fazer o deploy manual** porque o MCP do Supabase não suporta arquivos em subpastas (`_shared/cors.ts`).

## 📋 Opções de Deploy

### Opção 1: Via Dashboard do Supabase (Mais Fácil)

1. Acesse: https://supabase.com/dashboard/project/ocguczxwkxjdaredqzrx/functions
2. Clique na função `admin-create-user`
3. Clique em "Edit Function"
4. Cole o código atualizado (veja abaixo)
5. Clique em "Deploy"

### Opção 2: Via Supabase CLI (Recomendado)

Se você tiver o Supabase CLI instalado:

```bash
supabase functions deploy admin-create-user --project-ref ocguczxwkxjdaredqzrx
```

Se não tiver instalado, instale com:

```bash
npm install -g supabase
```

Depois faça login:

```bash
supabase login
```

## 📝 Código Atualizado da Edge Function

### Arquivo: `supabase/functions/admin-create-user/index.ts`

```typescript
// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts';

serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return handleCorsPreFlight(req);
  }

  try {
    const supabaseAdmin = createClient(
      // @ts-ignore
      Deno.env.get('SUPABASE_URL') ?? '',
      // @ts-ignore
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify the JWT to ensure the request is from an authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // SECURITY: Check if the user is an admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: User is not an admin' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { email, first_name, last_name, role, password } = await req.json();

    if (!email || !role || !password) {
      return new Response(JSON.stringify({ error: 'Email, role e password são obrigatórios.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Validar senha (mínimo 8 caracteres)
    if (password.length < 8) {
      return new Response(JSON.stringify({ error: 'Senha deve ter no mínimo 8 caracteres.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Create user in auth.users WITH password and email confirmed
    // User can login immediately without email confirmation
    const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password, // Admin defines the password
      email_confirm: true, // Email already confirmed - user can login immediately
      user_metadata: { first_name, last_name }, // Pass metadata for the trigger
    });

    if (createUserError) {
      // Check if error is due to duplicate email
      const errorMessage = createUserError.message.toLowerCase();
      if (errorMessage.includes('already') || errorMessage.includes('registered') || errorMessage.includes('duplicate')) {
        return new Response(JSON.stringify({ error: 'Um usuário com este email já está registrado.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 409, // Conflict
        });
      }
      
      return new Response(JSON.stringify({ error: createUserError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    // After the user is created and the trigger has run, update the profile's role
    const { data: updatedProfile, error: updateProfileError } = await supabaseAdmin
      .from('profiles')
      .update({ role: role })
      .eq('id', newUser.user.id)
      .select()
      .single();

    if (updateProfileError) {
      // If profile update fails, attempt to delete the auth user to prevent orphaned users
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return new Response(JSON.stringify({ error: updateProfileError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    return new Response(JSON.stringify({
      message: 'Usuário criado com sucesso! O usuário já pode fazer login.',
      user: {
        id: newUser.user.id,
        email: newUser.user.email,
        first_name: updatedProfile.first_name,
        last_name: updatedProfile.last_name,
        role: updatedProfile.role,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 201,
    });
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
```

## ✅ Mudanças Principais

### Antes (com convite por email):
```typescript
// Criava usuário SEM senha
const { data: newUser } = await supabaseAdmin.auth.admin.createUser({
  email,
  email_confirm: false, // Precisava confirmar via email
  user_metadata: { first_name, last_name },
});

// Enviava email de convite
await supabaseAdmin.auth.admin.inviteUserByEmail(email);
```

### Depois (admin define senha):
```typescript
// Cria usuário COM senha definida pelo admin
const { data: newUser } = await supabaseAdmin.auth.admin.createUser({
  email,
  password, // Admin define a senha
  email_confirm: true, // Email já confirmado - pode logar imediatamente
  user_metadata: { first_name, last_name },
});

// NÃO envia email - usuário já pode logar
```

## 🧪 Como Testar Após Deploy

1. Acesse: https://www.flixprev.com.br/app/users
2. Clique em "Criar Novo Usuário"
3. Preencha:
   - Email: `teste@exemplo.com`
   - Senha: `Teste123` (mínimo 8 chars, 1 maiúscula, 1 minúscula, 1 número)
   - Nome: `Teste`
   - Sobrenome: `Usuário`
   - Role: `user`
4. Clique em "Adicionar Usuário"
5. Deve aparecer: "Usuário criado com sucesso! O usuário já pode fazer login."
6. Tente fazer login com `teste@exemplo.com` e senha `Teste123`
7. Deve funcionar imediatamente!

## 📊 Status

- ✅ Frontend atualizado e deployado na Vercel
- ✅ Código da Edge Function atualizado localmente
- ⏳ **AGUARDANDO**: Deploy manual da Edge Function no Supabase
- ⏳ **AGUARDANDO**: Teste do fluxo completo

## 🔗 Links Úteis

- Dashboard Supabase: https://supabase.com/dashboard/project/ocguczxwkxjdaredqzrx
- Edge Functions: https://supabase.com/dashboard/project/ocguczxwkxjdaredqzrx/functions
- Documentação: https://supabase.com/docs/guides/functions
