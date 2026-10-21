import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
const PATHAO_BASE_URL = 'https://api-hermes.pathao.com';
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
    // Check user role
    const { data: userRole, error: roleError } = await supabaseClient.from('user_roles').select('role').eq('user_id', user.id).single();
    if (roleError || !userRole || ![
      'admin',
      'manager',
      'staff'
    ].includes(userRole.role)) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Insufficient permissions'
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const orderData = await req.json();
    console.log('Processing Pathao order for invoice:', orderData.invoice_number);
    // Get Pathao API credentials from database
    const { data: webhookSettings, error: settingsError } = await supabaseClient.from('courier_webhook_settings').select('id, pathao_access_token, pathao_refresh_token, pathao_token_expires_at, pathao_store_id, pathao_enabled, pathao_client_id, pathao_client_secret').limit(1).maybeSingle();
    if (settingsError) {
      console.error('Database error fetching settings:', settingsError);
      return new Response(JSON.stringify({
        success: false,
        message: 'Database error: ' + settingsError.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (!webhookSettings?.pathao_access_token) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Pathao is not authenticated. Please authenticate in Admin → System → Courier Settings.'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (!webhookSettings?.pathao_enabled) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Pathao integration is disabled. Please enable it in Admin → System → Courier Settings.'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Use store_id from request if provided, otherwise use the default from settings
    const storeId = orderData.store_id || webhookSettings?.pathao_store_id;
    if (!storeId) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Pathao Store ID not provided. Please select a store or set default store in Admin → System → Courier Settings.'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    let accessToken = webhookSettings.pathao_access_token;
    // Check if token is expired and try to refresh
    if (webhookSettings.pathao_token_expires_at) {
      const expiresAt = new Date(webhookSettings.pathao_token_expires_at);
      if (expiresAt < new Date()) {
        // Try to refresh the token
        if (webhookSettings.pathao_refresh_token && webhookSettings.pathao_client_id && webhookSettings.pathao_client_secret) {
          console.log('Token expired, attempting to refresh...');
          const refreshResponse = await fetch(`${PATHAO_BASE_URL}/aladdin/api/v1/issue-token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              client_id: webhookSettings.pathao_client_id,
              client_secret: webhookSettings.pathao_client_secret,
              refresh_token: webhookSettings.pathao_refresh_token,
              grant_type: 'refresh_token'
            })
          });
          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json();
            accessToken = refreshData.access_token;
            // Update tokens in database
            await supabaseClient.from('courier_webhook_settings').update({
              pathao_access_token: refreshData.access_token,
              pathao_refresh_token: refreshData.refresh_token,
              pathao_token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
            }).eq('id', webhookSettings.id);
            console.log('Token refreshed successfully');
          } else {
            return new Response(JSON.stringify({
              success: false,
              message: 'Pathao access token has expired and could not be refreshed. Please re-authenticate in Admin → System → Courier Settings.'
            }), {
              status: 400,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json'
              }
            });
          }
        } else {
          return new Response(JSON.stringify({
            success: false,
            message: 'Pathao access token has expired. Please re-authenticate in Admin → System → Courier Settings.'
          }), {
            status: 400,
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        }
      }
    }
    // Prepare Pathao API payload
    const pathaoPayload = {
      store_id: parseInt(String(storeId)),
      merchant_order_id: orderData.invoice_number,
      recipient_name: orderData.recipient_name,
      recipient_phone: orderData.recipient_phone,
      recipient_address: orderData.recipient_address,
      recipient_city: orderData.recipient_city || 1,
      recipient_zone: orderData.recipient_zone || 1,
      recipient_area: orderData.recipient_area || 0,
      delivery_type: 48,
      item_type: 2,
      special_instruction: orderData.note || '',
      item_quantity: orderData.item_quantity || 1,
      item_weight: orderData.item_weight || 0.5,
      amount_to_collect: orderData.cod_amount,
      item_description: orderData.item_description || ''
    };
    console.log('Sending to Pathao API:', JSON.stringify(pathaoPayload, null, 2));
    // Call Pathao API to create order
    const pathaoResponse = await fetch(`${PATHAO_BASE_URL}/aladdin/api/v1/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(pathaoPayload)
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
    console.log('Pathao API response:', JSON.stringify(pathaoResult, null, 2));
    if (!pathaoResponse.ok) {
      console.error('Pathao API error:', pathaoResult);
      return new Response(JSON.stringify({
        success: false,
        message: pathaoResult.message || pathaoResult.error || 'Failed to create order on Pathao',
        errors: pathaoResult.errors || null
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Extract consignment details from Pathao response
    const consignmentId = pathaoResult.data?.consignment_id?.toString() || pathaoResult.consignment_id?.toString() || null;
    const trackingCode = pathaoResult.data?.tracking_code || pathaoResult.tracking_code || null;
    const pathaoStatus = pathaoResult.data?.order_status || 'Pending';
    console.log('Pathao order created:', {
      consignment_id: consignmentId,
      tracking_code: trackingCode,
      status: pathaoStatus
    });
    // Update the sale with Pathao details
    if (orderData.sale_id) {
      // Always set to 'not_sent' for newly created orders
      // Status will be updated by auto-refresh or manual refresh later
      const updatePayload = {
        courier_status: 'not_sent',
        order_status: 'not_sent',
        last_status_check: new Date().toISOString()
      };
      if (consignmentId) {
        updatePayload.consignment_id = consignmentId;
      }
      if (trackingCode) {
        updatePayload.tracking_code = trackingCode;
      }
      const { error: updateError } = await supabaseClient.from('sales').update(updatePayload).eq('id', orderData.sale_id);
      if (updateError) {
        console.error('Failed to update sale:', updateError);
      } else {
        console.log('Sale updated with Pathao details');
      }
    }
    return new Response(JSON.stringify({
      success: true,
      message: 'Order sent to Pathao successfully',
      consignment_id: consignmentId,
      tracking_code: trackingCode,
      status: 'not_sent',
      raw_status: pathaoStatus,
      pathao_response: pathaoResult
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in pathao-create-order function:', error);
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
