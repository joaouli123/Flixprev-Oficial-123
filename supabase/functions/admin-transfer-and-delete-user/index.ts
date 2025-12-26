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

    // 1. Autenticação e verificação de Admin do requisitante
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Missing Authorization header' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: requestingUser }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !requestingUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or expired token' }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const { data: requestingProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', requestingUser.id)
      .single();

    if (profileError || requestingProfile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden: User is not an admin' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { userId: userToDeleteId } = await req.json();

    if (!userToDeleteId) {
      return new Response(JSON.stringify({ error: 'User ID is required.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }
    
    // NOVO BLOQUEIO DE SEGURANÇA: Administradores não podem excluir a si mesmos.
    if (userToDeleteId === requestingUser.id) {
        return new Response(JSON.stringify({ error: 'Administrators cannot delete their own account. Please ask another administrator to perform this action.' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    // 2. Verificar se o usuário a ser excluído é o último admin
    const { data: allAdmins, error: adminError } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .eq('role', 'admin');

    if (adminError) throw adminError;

    const adminCount = allAdmins.length;
    const isDeletingAdmin = allAdmins.some(a => a.id === userToDeleteId);

    // Se o usuário a ser excluído é um admin, e ele é o último (adminCount <= 1), bloqueia.
    // Nota: O bloqueio de auto-exclusão acima já garante que o requisitante não é o excluído.
    // Se o requisitante é Admin A, e ele tenta excluir Admin B, e Admin B é o último admin, isso é um problema.
    // Mas se Admin B é o último, Admin A não pode existir, a menos que Admin B seja o único admin.
    // A lógica de contagem é crucial:
    if (isDeletingAdmin && adminCount <= 1) {
        return new Response(JSON.stringify({ error: 'Cannot delete the last administrator in the system.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 403,
        });
    }
    
    // 3. Encontrar o administrador de destino (o requisitante, que é um admin diferente do excluído)
    const targetAdminId = requestingUser.id;

    // 4. Transferir a propriedade dos dados críticos
    const tablesToTransfer = ['agents', 'categories', 'custom_links'];
    const transferResults: { table: string, count: number }[] = [];

    for (const table of tablesToTransfer) {
        const { count, error: updateError } = await supabaseAdmin
            .from(table)
            .update({ user_id: targetAdminId })
            .eq('user_id', userToDeleteId)
            .select('*', { count: 'exact', head: true });

        if (updateError) {
            console.error(`Error transferring data in table ${table}:`, updateError);
            // Continuar, mas registrar o erro
            transferResults.push({ table, count: 0 });
        } else {
            transferResults.push({ table, count: count || 0 });
        }
    }

    // 5. Excluir o usuário do auth.users (isso aciona o cascade delete em profiles e usuarios)
    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userToDeleteId);

    if (deleteUserError) {
      console.error('Error deleting user:', deleteUserError);
      return new Response(JSON.stringify({ error: deleteUserError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    return new Response(JSON.stringify({ 
        message: 'User deleted and data transferred successfully',
        transferred_to: targetAdminId,
        transfer_summary: transferResults,
    }), {
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