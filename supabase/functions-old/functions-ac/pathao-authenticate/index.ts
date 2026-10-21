import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
const PATHAO_BASE_URL = 'https://hermes-api.pathao.com/aladdin/api/v1';
serve(async (req)=>{
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
      auth: {
        persistSession: false
      }
    });
    // Authenticate the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Unauthorized'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid token'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Check user role - only admin can configure
    const { data: userRole, error: roleError } = await supabaseClient.from('user_roles').select('role').eq('user_id', user.id).single();
    if (roleError || !userRole || ![
      'admin'
    ].includes(userRole.role)) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Only admins can configure Pathao integration'
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const requestData = await req.json();
    console.log('Pathao authentication request for client_id:', requestData.client_id?.substring(0, 10) + '...');
    if (!requestData.client_id || !requestData.client_secret) {
      return new Response(JSON.stringify({
        success: false,
        message: 'client_id and client_secret are required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Call Pathao OAuth API to get access token
    const pathaoResponse = await fetch(`${PATHAO_BASE_URL}/issue-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: requestData.client_id,
        client_secret: requestData.client_secret,
        grant_type: 'client_credentials'
      })
    });
    let pathaoResult;
    try {
      pathaoResult = await pathaoResponse.json();
    } catch (e) {
      const text = await pathaoResponse.text();
      console.error('Failed to parse Pathao response:', text);
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid response from Pathao API',
        raw: text
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log('Pathao auth response status:', pathaoResponse.status);
    if (!pathaoResponse.ok || !pathaoResult.access_token) {
      console.error('Pathao auth error:', pathaoResult);
      return new Response(JSON.stringify({
        success: false,
        message: pathaoResult.message || pathaoResult.error || 'Failed to authenticate with Pathao',
        pathao_response: pathaoResult
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Calculate token expiry (Pathao tokens typically expire in 1 year but we'll check expires_in)
    const expiresIn = pathaoResult.expires_in || 31536000 // Default 1 year in seconds
    ;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    // Update courier_webhook_settings with the new token
    const { data: existingSettings } = await supabaseClient.from('courier_webhook_settings').select('id').limit(1);
    const updatePayload = {
      pathao_client_id: requestData.client_id,
      pathao_client_secret: requestData.client_secret,
      pathao_access_token: pathaoResult.access_token,
      pathao_token_expires_at: tokenExpiresAt
    };
    if (existingSettings?.[0]?.id) {
      const { error: updateError } = await supabaseClient.from('courier_webhook_settings').update(updatePayload).eq('id', existingSettings[0].id);
      if (updateError) {
        console.error('Failed to update settings:', updateError);
        return new Response(JSON.stringify({
          success: false,
          message: 'Failed to save token: ' + updateError.message
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    } else {
      const { error: insertError } = await supabaseClient.from('courier_webhook_settings').insert({
        ...updatePayload,
        webhook_url: '',
        webhook_name: '',
        status_check_webhook_url: '',
        is_active: true
      });
      if (insertError) {
        console.error('Failed to insert settings:', insertError);
        return new Response(JSON.stringify({
          success: false,
          message: 'Failed to save token: ' + insertError.message
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    console.log('Pathao authentication successful, token saved');
    return new Response(JSON.stringify({
      success: true,
      message: 'Pathao authentication successful',
      token_expires_at: tokenExpiresAt
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in pathao-authenticate function:', error);
    return new Response(JSON.stringify({
      success: false,
      message: error?.message || 'Internal server error'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
