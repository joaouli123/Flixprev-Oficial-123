// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore
import { createClient, User as AuthUser } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts';

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  role: 'user' | 'admin';
  updated_at: string | null;
}

interface Usuario {
    user_id: string;
    status_da_assinatura: string | null;
    documento?: string | null;
    telefone?: string | null;
    nome_completo?: string | null;
    email?: string | null;
  ramos_atuacao?: string[] | null;
  cep?: string | null;
  logradouro?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  regiao?: string | null;
  sexo?: string | null;
  idade?: number | null;
  data_nascimento?: string | null;
  origem_cadastro?: string | null;
  cadastro_finalizado_em?: string | null;
}

interface Subscription {
  user_id: string;
  plan_type: string | null;
  expires_at: string | null;
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

    // Fetch all users from auth.users
    const authUsers: AuthUser[] = [];
    let page = 1;

    while (true) {
      const { data, error: authUsersError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });

      if (authUsersError) {
        console.error('Error listing auth users:', authUsersError);
        return new Response(JSON.stringify({ error: authUsersError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      const currentPageUsers = data?.users || [];
      authUsers.push(...currentPageUsers);

      if (currentPageUsers.length < 200) {
        break;
      }

      page += 1;
    }

    // Fetch all profiles from public.profiles
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('*');

    if (profilesError) {
      console.error('Error listing profiles:', profilesError);
      return new Response(JSON.stringify({ error: profilesError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    // Fetch all subscription statuses from public.usuarios
    const { data: usuarios, error: usuariosError } = await supabaseAdmin
      .from('usuarios')
      .select('user_id, status_da_assinatura, documento, telefone, nome_completo, email, ramos_atuacao, cep, logradouro, bairro, cidade, estado, regiao, sexo, idade, data_nascimento, origem_cadastro, cadastro_finalizado_em');

    if (usuariosError) {
        console.error('Error listing usuarios:', usuariosError);
        return new Response(JSON.stringify({ error: usuariosError.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }

    // Fetch subscription plans
    const { data: subscriptions, error: subscriptionsError } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id, plan_type, expires_at');

    if (subscriptionsError) {
      console.error('Error listing subscriptions:', subscriptionsError);
      return new Response(JSON.stringify({ error: subscriptionsError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    // Combine auth users with their profiles and subscription status
    const usersWithProfiles = authUsers.map((authUser: AuthUser) => {
      const profile = profiles.find((p: Profile) => p.id === authUser.id);
      const usuario = usuarios.find((u: Usuario) => u.user_id === authUser.id);
      const subscription = (subscriptions as Subscription[]).find((s) => s.user_id === authUser.id);
      return {
        id: authUser.id,
        email: authUser.email,
        created_at: authUser.created_at,
        last_sign_in_at: authUser.last_sign_in_at,
        first_name: profile?.first_name || null,
        last_name: profile?.last_name || null,
        role: profile?.role || 'user',
        avatar_url: profile?.avatar_url || null,
        status_da_assinatura: usuario?.status_da_assinatura || null,
        documento: usuario?.documento || null,
        telefone: usuario?.telefone || null,
        nome_completo: usuario?.nome_completo || null,
        ramos_atuacao: usuario?.ramos_atuacao || null,
        cep: usuario?.cep || null,
        logradouro: usuario?.logradouro || null,
        bairro: usuario?.bairro || null,
        cidade: usuario?.cidade || null,
        estado: usuario?.estado || null,
        regiao: usuario?.regiao || null,
        sexo: usuario?.sexo || null,
        idade: usuario?.idade ?? null,
        data_nascimento: usuario?.data_nascimento || null,
        origem_cadastro: usuario?.origem_cadastro || null,
        cadastro_finalizado_em: usuario?.cadastro_finalizado_em || null,
        plan_type: subscription?.plan_type || null,
        subscription_expires_at: subscription?.expires_at || null,
      };
    });

    return new Response(JSON.stringify(usersWithProfiles), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: unknown) {
    console.error('Unhandled error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});