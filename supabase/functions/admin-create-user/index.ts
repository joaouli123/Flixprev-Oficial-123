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
      console.error('Error updating profile role:', updateProfileError);
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
    console.error('Unhandled error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});