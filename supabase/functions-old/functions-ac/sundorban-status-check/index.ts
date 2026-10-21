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
    const { cn_number } = await req.json();
    if (!cn_number) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Missing cn_number'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Call Sundorban tracking API
    const sundorbanResponse = await fetch('https://tracking.sundarbancourierltd.com/Home/getDatabyCN', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'accept': 'application/json, text/javascript, */*; q=0.01',
        'key': 'CzbZcWnwf7TNTzluD9rxyXCUqzN4xOhs',
        'x-requested-with': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        selectedtypes: 'cnno',
        selectedtimes: '7',
        inputvalue: cn_number
      })
    });
    const sundorbanResult = await sundorbanResponse.json();
    console.log('Sundorban API Response:', JSON.stringify(sundorbanResult, null, 2));
    // The API returns an array - get the first element
    const parcelData = Array.isArray(sundorbanResult) ? sundorbanResult[0] : sundorbanResult;
    if (!parcelData) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Parcel not found'
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Extract status from the parcel data
    // First try the main status field, then check cnStatusList for latest status
    let rawStatus = parcelData?.status || parcelData?.Status || null;
    // If no main status, get the latest status from cnStatusList
    if (!rawStatus && parcelData?.cnStatusList && Array.isArray(parcelData.cnStatusList) && parcelData.cnStatusList.length > 0) {
      // Get the last (most recent) status from the list
      const latestStatusEntry = parcelData.cnStatusList[parcelData.cnStatusList.length - 1];
      rawStatus = latestStatusEntry?.status || null;
    }
    console.log('Parcel data:', JSON.stringify(parcelData, null, 2));
    console.log('Extracted raw status:', rawStatus);
    // Map Sundorban statuses to our app statuses
    const mapSundorbanStatus = (status)=>{
      if (!status) return 'pending';
      const normalized = status.toLowerCase().trim();
      console.log('Normalized status:', normalized);
      // Delivered - keep as delivered (highest priority)
      if (normalized.includes('delivered') || normalized.includes('delivery complete')) {
        return 'delivered';
      }
      // Ready for Delivery / Ready for C/D / Out for Delivery -> Delivery Ready
      // Sundorban doesn't do home delivery, so these all mean ready for customer pickup
      if (normalized.includes('ready for delivery') || normalized.includes('ready_for_delivery') || normalized.includes('ready for c/d') || normalized.includes('ready for cd') || normalized.includes('out for delivery') || normalized.includes('out_for_delivery')) {
        return 'delivery_ready';
      }
      // Out for Destination / Received by Dest - means in transit between hubs
      if (normalized.includes('out for destination') || normalized.includes('received by dest') || normalized.includes('out for dest')) {
        return 'in_transit';
      }
      // In Transit variations
      if (normalized.includes('in transit') || normalized.includes('in_transit') || normalized.includes('on the way') || normalized.includes('picked up') || normalized.includes('pickup complete')) {
        return 'in_transit';
      }
      // Booking Complete -> sent
      if (normalized.includes('booking complete') || normalized.includes('booking_complete')) {
        return 'sent';
      }
      // Returned - various return statuses
      if (normalized.includes('returned') || normalized.includes('return to sender') || normalized.includes('return to origin') || normalized.includes('rts') || normalized.includes('returning') || normalized === 'return') {
        return 'returned';
      }
      // Cancelled
      if (normalized.includes('cancelled') || normalized.includes('canceled') || normalized.includes('cancel') || normalized.includes('void')) {
        return 'cancelled';
      }
      // Lost / Damaged
      if (normalized.includes('lost') || normalized.includes('missing') || normalized.includes('damaged') || normalized.includes('destroyed')) {
        return 'lost';
      }
      // Pending/In Review
      if (normalized.includes('pending') || normalized.includes('in review') || normalized.includes('processing')) {
        return 'pending';
      }
      // Default to in_transit for unknown statuses (safer than pending)
      console.log('Unknown status, defaulting to in_transit:', status);
      return 'in_transit';
    };
    const mappedStatus = mapSundorbanStatus(rawStatus);
    console.log('Mapped status:', mappedStatus);
    return new Response(JSON.stringify({
      success: sundorbanResponse.ok,
      message: sundorbanResponse.ok ? 'Status check successful' : parcelData?.message || 'Status check failed',
      data: parcelData,
      delivery_status: mappedStatus,
      mapped_status: mappedStatus,
      raw_status: rawStatus,
      cn_number: parcelData?.cnNumber,
      dest_branch: parcelData?.destBranch,
      booking_branch: parcelData?.bookingBranch
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
