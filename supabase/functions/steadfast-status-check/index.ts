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
    const { consignment_id, api_key, secret_key, test_connection, tracking_code: requestTrackingCode } = requestBody;
    if (!api_key || !secret_key) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Missing API credentials'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Test connection mode - use balance endpoint to verify credentials
    if (test_connection) {
      console.log('Testing Steadfast connection using balance endpoint');
      const balanceResponse = await fetch('https://portal.packzy.com/api/v1/get_balance', {
        method: 'GET',
        headers: {
          'Api-Key': api_key,
          'Secret-Key': secret_key,
          'Content-Type': 'application/json'
        }
      });
      const balanceText = await balanceResponse.text();
      console.log('Balance response:', balanceText.substring(0, 500));
      // Check for "Unauthorized Access" text response
      if (balanceText.includes('Unauthorized') || balanceText.includes('unauthorized')) {
        return new Response(JSON.stringify({
          success: false,
          message: 'Invalid API credentials. Please check your API Key and Secret Key.',
          auth_error: true
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      // Try to parse the balance response
      try {
        const balanceData = JSON.parse(balanceText);
        console.log('Balance data:', JSON.stringify(balanceData));
        // Check for authentication errors in the parsed response
        if (balanceData.status === 401 || String(balanceData.message || '').toLowerCase().includes('unauthenticated') || String(balanceData.message || '').toLowerCase().includes('unauthorized')) {
          return new Response(JSON.stringify({
            success: false,
            message: 'Invalid API credentials. Please check your API Key and Secret Key.',
            auth_error: true
          }), {
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json'
            }
          });
        }
        // Success - credentials are valid
        return new Response(JSON.stringify({
          success: true,
          message: 'Connection successful! Credentials are valid.',
          data: balanceData
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      } catch (e) {
        // JSON parse failed but wasn't unauthorized - might be a different error
        return new Response(JSON.stringify({
          success: false,
          message: 'Unexpected response from Steadfast API',
          raw_response: balanceText.substring(0, 200)
        }), {
          status: 502,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
    }
    // Regular status check mode - requires consignment_id
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
    // Call Steadfast API for status check
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
    let steadfastResult;
    const responseText = await steadfastResponse.text();
    console.log('Steadfast raw response:', responseText.substring(0, 500));
    // Check for "Unauthorized Access" text response
    if (responseText.includes('Unauthorized') || responseText.includes('unauthorized')) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid API credentials. Please check your API Key and Secret Key.',
        auth_error: true
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    try {
      steadfastResult = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse Steadfast response as JSON:', responseText);
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
    console.log('Steadfast parsed response:', JSON.stringify(steadfastResult));
    // Try to get tracking_code for public tracking page
    // The public tracking page uses tracking_code (e.g., SFR260210ST210D6F1BD) not numeric consignment_id
    // Priority: request param > API response > consignment_id if alphanumeric
    let trackingCode = requestTrackingCode || steadfastResult.tracking_code || steadfastResult.trackingCode || steadfastResult.data?.tracking_code || steadfastResult.delivery_status?.tracking_code || null;
    // If consignment_id looks like a tracking code (contains letters), use it directly
    if (!trackingCode && /[a-zA-Z]/.test(consignment_id)) {
      trackingCode = consignment_id;
    }
    console.log('Tracking code for public API:', trackingCode || 'Not available (numeric ID only)');
    // Fetch detailed tracking history from public tracking page (only if we have tracking code)
    let trackingHistory = null;
    if (trackingCode) {
      trackingHistory = await fetchDetailedTracking(trackingCode);
    }
    console.log('Tracking history result:', trackingHistory ? 'Found' : 'Not found');
    return new Response(JSON.stringify({
      success: steadfastResponse.ok,
      message: steadfastResponse.ok ? 'Status check successful' : steadfastResult.message || 'Status check failed',
      data: steadfastResult,
      delivery_status: steadfastResult.delivery_status,
      mapped_status: steadfastResult.delivery_status,
      tracking_history: trackingHistory
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
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
// Steadfast status code mapping (based on Steadfast's actual API)
// Main statuses: 0=In Review, 1=In Transit/Pending, 2=Delivered, -2=Partial, -1=Cancelled
const STEADFAST_STATUS_MAP = {
  '-2': 'Partial Delivered',
  '-1': 'Cancelled',
  0: 'In Review',
  1: 'In Transit',
  2: 'Delivered',
  3: 'On Hold',
  4: 'Return In Transit',
  5: 'Returned',
  // String status mappings
  'in_review': 'In Review',
  'pending': 'Pending',
  'pending_pickup': 'Pending Pickup',
  'picked': 'Picked Up',
  'picked_up': 'Picked Up',
  'in_transit': 'In Transit',
  'out_for_delivery': 'Out for Delivery',
  'delivered': 'Delivered',
  'partial_delivered': 'Partial Delivered',
  'partial': 'Partial Delivered',
  'hold': 'On Hold',
  'cancelled': 'Cancelled',
  'returned': 'Returned',
  'return': 'Return'
};
function mapSteadfastStatus(status) {
  if (status === null || status === undefined) return 'Unknown';
  // Try direct mapping
  if (STEADFAST_STATUS_MAP[status]) return STEADFAST_STATUS_MAP[status];
  // Try lowercase string
  if (typeof status === 'string' && STEADFAST_STATUS_MAP[status.toLowerCase()]) {
    return STEADFAST_STATUS_MAP[status.toLowerCase()];
  }
  // Return as-is if it's already a readable string
  if (typeof status === 'string' && status.length > 2) return status;
  // Return with code for debugging
  return `Status ${status}`;
}
// Helper to fetch detailed tracking from Steadfast's public tracking page
async function fetchDetailedTracking(consignmentId) {
  try {
    console.log('Fetching detailed tracking for:', consignmentId);
    // Step 1: Visit the tracking page to get session cookies
    const pageResponse = await fetch(`https://steadfast.com.bd/t/${consignmentId}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    if (!pageResponse.ok) {
      console.log('Failed to fetch tracking page:', pageResponse.status);
      return null;
    }
    // Extract cookies from response headers
    // In Deno, we need to get all set-cookie headers
    const setCookieHeaders = pageResponse.headers.getSetCookie?.() || [];
    console.log('Set-Cookie headers count:', setCookieHeaders.length);
    let xsrfToken = '';
    let sessionToken = '';
    // Parse each set-cookie header
    for (const cookie of setCookieHeaders){
      if (cookie.startsWith('XSRF-TOKEN=')) {
        const match = cookie.match(/XSRF-TOKEN=([^;]+)/);
        if (match) xsrfToken = match[1];
      }
      if (cookie.startsWith('steadfast_courier_session=')) {
        const match = cookie.match(/steadfast_courier_session=([^;]+)/);
        if (match) sessionToken = match[1];
      }
    }
    // Fallback: try single header parsing if getSetCookie is not available
    if (!xsrfToken || !sessionToken) {
      const singleCookie = pageResponse.headers.get('set-cookie') || '';
      const xsrfMatch = singleCookie.match(/XSRF-TOKEN=([^;,]+)/);
      const sessionMatch = singleCookie.match(/steadfast_courier_session=([^;,]+)/);
      if (xsrfMatch) xsrfToken = xsrfMatch[1];
      if (sessionMatch) sessionToken = sessionMatch[1];
    }
    if (!xsrfToken || !sessionToken) {
      console.log('Could not extract required cookies. XSRF:', !!xsrfToken, 'Session:', !!sessionToken);
      return null;
    }
    console.log('Cookies extracted successfully');
    // Decode XSRF token for the X-XSRF-TOKEN header (it's URL encoded in the cookie)
    const decodedXsrf = decodeURIComponent(xsrfToken);
    // Step 2: Call the internal tracking API with the session cookies
    const trackingResponse = await fetch(`https://steadfast.com.bd/track/consignment/${consignmentId}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'X-Requested-With': 'XMLHttpRequest',
        'X-XSRF-TOKEN': decodedXsrf,
        'Referer': `https://steadfast.com.bd/t/${consignmentId}`,
        'Cookie': `XSRF-TOKEN=${xsrfToken}; steadfast_courier_session=${sessionToken}`
      }
    });
    if (!trackingResponse.ok) {
      console.log('Tracking API returned status:', trackingResponse.status);
      return null;
    }
    const trackingData = await trackingResponse.json();
    console.log('Tracking data received:', JSON.stringify(trackingData).substring(0, 500));
    // Parse the tracking history from the response
    // The Steadfast public API returns { status, message, result, trackings }
    // Map status codes to readable text before returning
    const mapTrackingItems = (items)=>{
      return items.map((item)=>{
        // Try to get a meaningful status text from various fields
        // Priority: title/event/note > mapped numeric status
        let statusText = item.title || item.event || item.remark || item.note || null;
        // If no text status, map the numeric code
        if (!statusText || typeof statusText === 'number') {
          statusText = mapSteadfastStatus(item.status);
        }
        // Get hub/branch info
        const hubInfo = item.hub?.name || item.hub || item.branch?.name || item.branch || item.location || null;
        return {
          ...item,
          status: statusText,
          branch: hubInfo,
          original_status: item.status,
          date: item.created_at || item.date || item.time || item.timestamp || null
        };
      });
    };
    if (trackingData) {
      // Helper to add current status from result object as the latest entry
      const addCurrentStatus = (items)=>{
        if (trackingData.result && typeof trackingData.result === 'object' && !Array.isArray(trackingData.result)) {
          const result = trackingData.result;
          const currentStatus = {
            status: mapSteadfastStatus(result.status),
            original_status: result.status,
            date: result.updated_at || result.created_at || new Date().toISOString(),
            branch: result.currenthub?.name || result.current_hub_name || null,
            remarks: result.rider ? `Rider: ${result.rider.name} (${result.rider.phone})` : null
          };
          // Add current status at the end (most recent)
          const lastItem = items[items.length - 1];
          // Only add if it's different from the last status
          if (!lastItem || lastItem.original_status !== result.status) {
            items.push(currentStatus);
          }
        }
        return items;
      };
      // Check for trackings array (Steadfast public API format)
      if (Array.isArray(trackingData.trackings) && trackingData.trackings.length > 0) {
        console.log('Found trackings array with', trackingData.trackings.length, 'items');
        const mapped = mapTrackingItems(trackingData.trackings);
        return addCurrentStatus(mapped);
      }
      // Check for various possible response structures
      if (Array.isArray(trackingData.tracking_history) && trackingData.tracking_history.length > 0) {
        return addCurrentStatus(mapTrackingItems(trackingData.tracking_history));
      }
      if (Array.isArray(trackingData.history) && trackingData.history.length > 0) {
        return addCurrentStatus(mapTrackingItems(trackingData.history));
      }
      if (Array.isArray(trackingData.statuses) && trackingData.statuses.length > 0) {
        return addCurrentStatus(mapTrackingItems(trackingData.statuses));
      }
      if (Array.isArray(trackingData.timeline) && trackingData.timeline.length > 0) {
        return addCurrentStatus(mapTrackingItems(trackingData.timeline));
      }
      if (Array.isArray(trackingData.result) && trackingData.result.length > 0) {
        return mapTrackingItems(trackingData.result);
      }
      if (Array.isArray(trackingData.data?.tracking_history) && trackingData.data.tracking_history.length > 0) {
        return addCurrentStatus(mapTrackingItems(trackingData.data.tracking_history));
      }
      if (Array.isArray(trackingData.data?.history) && trackingData.data.history.length > 0) {
        return addCurrentStatus(mapTrackingItems(trackingData.data.history));
      }
      // If the response itself is an array with items
      if (Array.isArray(trackingData) && trackingData.length > 0) {
        return mapTrackingItems(trackingData);
      }
      // Fallback: if there's a result object with status, create a single entry from it
      if (trackingData.result && typeof trackingData.result === 'object' && !Array.isArray(trackingData.result)) {
        const result = trackingData.result;
        console.log('Creating timeline from result object, status:', result.status);
        const singleEntry = [
          {
            status: mapSteadfastStatus(result.status),
            original_status: result.status,
            date: result.updated_at || result.created_at || new Date().toISOString(),
            branch: result.currenthub?.name || result.current_hub_name || null,
            remarks: result.rider ? `Rider: ${result.rider.name} (${result.rider.phone})` : null
          }
        ];
        return singleEntry;
      }
    }
    console.log('No tracking history found in response');
    return null;
  } catch (error) {
    console.error('Error fetching detailed tracking:', error);
    return null;
  }
}
