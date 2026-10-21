import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};
const PATHAO_BASE_URL = 'https://api-hermes.pathao.com';
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { consignment_id } = await req.json();
    if (!consignment_id) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Missing consignment_id'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Get webhook settings for Pathao credentials
    const { data: settings, error: settingsError } = await supabase.from('courier_webhook_settings').select('*').limit(1).single();
    if (settingsError || !settings) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Webhook settings not found'
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    let accessToken = settings.pathao_access_token;
    const tokenExpires = settings.pathao_token_expires_at ? new Date(settings.pathao_token_expires_at) : null;
    // Refresh token if expired
    if (!accessToken || tokenExpires && tokenExpires < new Date()) {
      if (settings.pathao_refresh_token) {
        const refreshResponse = await fetch(`${PATHAO_BASE_URL}/aladdin/api/v1/issue-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            client_id: settings.pathao_client_id,
            client_secret: settings.pathao_client_secret,
            refresh_token: settings.pathao_refresh_token,
            grant_type: 'refresh_token'
          })
        });
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          accessToken = refreshData.access_token;
          await supabase.from('courier_webhook_settings').update({
            pathao_access_token: refreshData.access_token,
            pathao_refresh_token: refreshData.refresh_token,
            pathao_token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
          }).eq('id', settings.id);
        }
      }
    }
    if (!accessToken) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Pathao not authenticated'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Call Pathao order info API
    const orderResponse = await fetch(`${PATHAO_BASE_URL}/aladdin/api/v1/orders/${consignment_id}/info`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });
    const orderData = await orderResponse.json();
    console.log('Pathao order info response:', JSON.stringify(orderData, null, 2));
    if (!orderResponse.ok) {
      return new Response(JSON.stringify({
        success: false,
        message: orderData.message || 'Failed to fetch order info'
      }), {
        status: orderResponse.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const data = orderData.data || orderData;
    // Extract raw status
    const rawStatus = data.order_status || data.order_status_slug || null;
    console.log('Pathao raw status:', rawStatus);
    // Map Pathao statuses to our app statuses
    const mapPathaoStatus = (status)=>{
      if (!status) return 'pending';
      const normalized = status.toLowerCase().trim().replace(/[-_\s]+/g, '_');
      console.log('Normalized Pathao status:', normalized);
      // Delivered
      if (normalized.includes('delivered') || normalized === 'delivered') {
        return 'delivered';
      }
      // Partial Delivered
      if (normalized.includes('partial_delivered') || normalized.includes('partially_delivered')) {
        return 'delivered';
      }
      // Return / Returned
      if (normalized.includes('return') || normalized.includes('returned') || normalized.includes('return_to_sender') || normalized.includes('rts')) {
        return 'returned';
      }
      // On Hold / Hold
      if (normalized.includes('on_hold') || normalized === 'hold') {
        return 'on_hold';
      }
      // Cancelled / Canceled
      if (normalized.includes('cancel') || normalized.includes('cancelled') || normalized.includes('canceled')) {
        return 'cancelled';
      }
      // Picked / Pickup
      if (normalized.includes('picked') || normalized.includes('pickup_complete') || normalized.includes('pickup_done') || normalized.includes('assigned_for_pickup')) {
        return 'in_transit';
      }
      // In Transit / At Sorting Hub / At Destination Hub
      if (normalized.includes('in_transit') || normalized.includes('at_sorting') || normalized.includes('at_destination') || normalized.includes('hub')) {
        return 'in_transit';
      }
      // Out for Delivery / Assigned for Delivery
      if (normalized.includes('out_for_delivery') || normalized.includes('assigned_for_delivery') || normalized.includes('delivery_assigned')) {
        return 'out_for_delivery';
      }
      // Pending / Payment Pending
      if (normalized.includes('pending') || normalized === 'pending') {
        return 'pending';
      }
      // Pickup Pending / Waiting for Pickup
      if (normalized.includes('pickup_pending') || normalized.includes('waiting_for_pickup')) {
        return 'sent';
      }
      // Lost / Damaged
      if (normalized.includes('lost') || normalized.includes('damaged') || normalized.includes('missing')) {
        return 'lost';
      }
      // Default to in_transit for unknown statuses
      console.log('Unknown Pathao status, defaulting to in_transit:', status);
      return 'in_transit';
    };
    const mappedStatus = mapPathaoStatus(rawStatus);
    console.log('Mapped status:', mappedStatus);
    // Build tracking URL
    const trackingUrl = `https://merchant.pathao.com/tracking?consignment_id=${consignment_id}`;
    return new Response(JSON.stringify({
      success: true,
      message: 'Status check successful',
      delivery_status: mappedStatus,
      mapped_status: mappedStatus,
      raw_status: rawStatus,
      consignment_id: consignment_id,
      tracking_url: trackingUrl,
      data: data,
      // Additional Pathao-specific details
      merchant_order_id: data.merchant_order_id,
      recipient_name: data.recipient_name,
      recipient_phone: data.recipient_phone,
      recipient_address: data.recipient_address,
      recipient_city: data.recipient_city,
      recipient_zone: data.recipient_zone,
      store_name: data.store_name,
      delivery_fee: data.delivery_fee,
      cod_fee: data.cod_fee,
      promo_discount: data.promo_discount,
      discount: data.discount,
      amount_to_collect: data.amount_to_collect,
      item_quantity: data.item_quantity,
      item_weight: data.item_weight,
      item_description: data.item_description,
      special_instruction: data.special_instruction,
      created_at: data.created_at,
      updated_at: data.updated_at
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Pathao status check error:', error);
    return new Response(JSON.stringify({
      success: false,
      message: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
