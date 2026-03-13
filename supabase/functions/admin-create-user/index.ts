// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts';

function splitFullName(value: unknown) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: null, lastName: null };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  return String(value || '')
    .split(/[\n,;|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function calculateAgeFromBirthDate(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const birthDate = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

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

    const payload = await req.json();
    const email = String(payload?.email || '').trim().toLowerCase();
    const fullName = String(payload?.full_name || payload?.fullName || '').trim();
    const { firstName, lastName } = splitFullName(fullName);
    const role = String(payload?.role || 'user').trim() === 'admin' ? 'admin' : 'user';
    const password = String(payload?.password || '');
    const documento = String(payload?.documento || '').trim() || null;
    const telefone = String(payload?.telefone || '').trim() || null;
    const ramosAtuacao = normalizeStringArray(payload?.practice_areas ?? payload?.practiceAreas);
    const cep = String(payload?.cep || '').trim() || null;
    const logradouro = String(payload?.logradouro || '').trim() || null;
    const numero = String(payload?.numero || '').trim() || null;
    const complemento = String(payload?.complemento || '').trim() || null;
    const bairro = String(payload?.bairro || '').trim() || null;
    const cidade = String(payload?.cidade || '').trim() || null;
    const estado = String(payload?.estado || '').trim().toUpperCase() || null;
    const regiao = String(payload?.regiao || '').trim() || null;
    const planTypeRaw = String(payload?.plan_type || payload?.planType || '').trim().toLowerCase();
    const planType = ['basic', 'premium', 'enterprise'].includes(planTypeRaw) ? planTypeRaw : 'basic';
    const lifetimeAccess = Boolean(payload?.lifetime_access ?? payload?.lifetimeAccess);
    const expiresAtRaw = String(payload?.expires_at || payload?.expiresAt || '').trim();
    const expiresAt = !lifetimeAccess && expiresAtRaw ? new Date(`${expiresAtRaw}T23:59:59`).toISOString() : null;
    const sexo = String(payload?.sexo || '').trim() || null;
    const dataNascimento = String(payload?.data_nascimento || payload?.dataNascimento || '').trim() || null;
    const idade = calculateAgeFromBirthDate(dataNascimento) ?? null;
    const logradouroCompleto = [
      logradouro,
      numero ? `, ${numero}` : '',
      complemento ? ` - ${complemento}` : '',
    ].join('');

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
      user_metadata: { first_name: firstName, last_name: lastName, role, full_name: fullName },
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
      .update({ first_name: firstName, last_name: lastName, role: role })
      .eq('id', newUser.user.id)
      .select()
      .single();

    if (updateProfileError) {
      console.error('Error updating profile role:', updateProfileError);
      // If profile update fails, attempt to delete the auth user to prevent orphaned users
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return new Response(JSON.stringify({ error: updateProfileError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const { error: usuarioError } = await supabaseAdmin
      .from('usuarios')
      .upsert({
        user_id: newUser.user.id,
        email,
        nome_completo: fullName || [firstName, lastName].filter(Boolean).join(' ') || null,
        documento,
        telefone,
        ramos_atuacao: ramosAtuacao,
        cep,
        logradouro: logradouroCompleto || logradouro,
        bairro,
        cidade,
        estado,
        regiao,
        sexo,
        idade,
        data_nascimento: dataNascimento,
        origem_cadastro: 'cadastro_admin',
        cadastro_finalizado_em: new Date().toISOString(),
        status_da_assinatura: 'ativo',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (usuarioError) {
      console.error('Error upserting usuarios row:', usuarioError);
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return new Response(JSON.stringify({ error: usuarioError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const { error: subscriptionError } = await supabaseAdmin
      .from('subscriptions')
      .upsert({
        user_id: newUser.user.id,
        status: 'active',
        plan_type: planType,
        starts_at: new Date().toISOString(),
        expires_at: expiresAt,
      }, { onConflict: 'user_id' });

    if (subscriptionError) {
      console.error('Error upserting subscriptions row:', subscriptionError);
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return new Response(JSON.stringify({ error: subscriptionError.message }), {
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
    console.error('Unhandled error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});