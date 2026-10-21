import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
};
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid JSON in request body'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const { consignment_id, api_key, secret_key } = requestBody;
    if (!consignment_id || !api_key || !secret_key) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Missing required parameters'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Proxy request to Steadfast API
    console.log('Calling Steadfast API for consignment:', consignment_id);
    const steadfastResponse = await fetch(`https://portal.packzy.com/api/v1/status_by_cid/${consignment_id}`, {
      method: 'GET',
      headers: {
        'Api-Key': api_key,
        'Secret-Key': secret_key,
        'Content-Type': 'application/json'
      }
    });
    // Handle non-JSON responses
    let steadfastData;
    const responseText = await steadfastResponse.text();
    try {
      steadfastData = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse Steadfast response:', responseText);
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid response from Steadfast API',
        raw_response: responseText.substring(0, 200)
      }), {
        status: 502,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    return new Response(JSON.stringify({
      success: steadfastResponse.ok,
      data: steadfastData,
      delivery_status: steadfastData.delivery_status
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error in steadfast-proxy:', error);
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
