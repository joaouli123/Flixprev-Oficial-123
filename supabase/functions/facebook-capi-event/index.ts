// @ts-ignore
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getCorsHeaders, handleCorsPreFlight } from '../_shared/cors.ts';

// URL base da API de Conversão do Facebook
const FACEBOOK_API_URL = 'https://graph.facebook.com/v19.0';

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

    // 1. Autenticação (Opcional, mas recomendado para eventos de servidor)
    // Esta função pode ser chamada por qualquer parte do app, mas vamos garantir que o token esteja presente
    const authHeader = req.headers.get('Authorization');
    const token = authHeader ? authHeader.replace('Bearer ', '') : null;
    
    // 2. Obter configurações do Pixel e CAPI Token
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('app_settings')
      .select('facebook_pixel_id, facebook_capi_token')
      .limit(1)
      .single();

    if (settingsError || !settings?.facebook_pixel_id || !settings?.facebook_capi_token) {
      console.error('Facebook CAPI: Missing settings or settings error:', settingsError?.message);
      return new Response(JSON.stringify({ error: 'Facebook Pixel ID or CAPI Token not configured.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { facebook_pixel_id, facebook_capi_token } = settings;
    
    // 3. Receber dados do evento do corpo da requisição
    const eventData = await req.json();

    if (!eventData || !eventData.event_name || !eventData.user_data) {
        return new Response(JSON.stringify({ error: 'Invalid event data provided.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    // 4. Construir o payload do Facebook
    const payload = {
        data: [
            {
                event_name: eventData.event_name,
                event_time: Math.floor(Date.now() / 1000),
                user_data: eventData.user_data,
                custom_data: eventData.custom_data || {},
                action_source: eventData.action_source || 'website',
                event_source_url: eventData.event_source_url || req.headers.get('Referer') || '',
                // Opcional: Adicionar o ID do usuário Supabase se o token estiver presente
                ...(token && {
                    user_data: {
                        ...eventData.user_data,
                        external_id: token // Usar o token para identificar o usuário no servidor
                    }
                })
            }
        ],
        access_token: facebook_capi_token,
    };

    // 5. Enviar para a API do Facebook
    const facebookResponse = await fetch(`${FACEBOOK_API_URL}/${facebook_pixel_id}/events`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    const facebookData = await facebookResponse.json();

    if (!facebookResponse.ok || facebookData.error) {
        console.error('Facebook API Error:', facebookData);
        return new Response(JSON.stringify({ 
            error: 'Failed to send event to Facebook.', 
            details: facebookData 
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify({
      message: 'Event sent successfully to Facebook CAPI',
      facebook_response: facebookData,
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