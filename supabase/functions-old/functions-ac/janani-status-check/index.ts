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
    // Get current year for booking year parameter
    const currentYear = new Date().getFullYear();
    // Call Janani Express tracking API
    const jananiResponse = await fetch(`https://jananiexpress.com/api/parcel_booking/search_by_cn_public?cnNumber=${cn_number}&bookingYear=${currentYear}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
        'Referer': 'https://jananiexpress.com/tracking'
      }
    });
    const jananiResult = await jananiResponse.json();
    console.log('Janani API Response:', JSON.stringify(jananiResult, null, 2));
    // Handle Janani's specific response structure:
    // { success: true, details: { trackingStatus: [...], parcel: {...}, ... }, msg: "..." }
    if (!jananiResult?.success || !jananiResult?.details) {
      return new Response(JSON.stringify({
        success: false,
        message: jananiResult?.msg || 'Parcel not found'
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const details = jananiResult.details;
    const trackingStatus = details.trackingStatus || [];
    // Get the latest status from trackingStatus array (last item is most recent)
    let rawStatus = null;
    if (Array.isArray(trackingStatus) && trackingStatus.length > 0) {
      const latestTracking = trackingStatus[trackingStatus.length - 1];
      rawStatus = latestTracking?.status || null;
    }
    console.log('Parcel data:', JSON.stringify(details, null, 2));
    console.log('Tracking history:', JSON.stringify(trackingStatus, null, 2));
    console.log('Extracted raw status:', rawStatus);
    // Map Janani statuses to our app statuses
    // Janani status examples from trackingStatus array:
    // - "Booking Placed..."
    // - "Parcel Shipped"
    // - "Parcel Received"
    // - "Condition Parcel Delivered ..."
    // - "Parcel Delivered ..."
    const mapJananiStatus = (status)=>{
      if (!status) return 'pending';
      const normalized = status.toLowerCase().trim();
      console.log('Normalized status:', normalized);
      // Delivered - check first as highest priority
      // Janani uses "Parcel Delivered" or "Condition Parcel Delivered"
      if (normalized.includes('delivered') || normalized.includes('delivery complete') || normalized.includes('delivery success')) {
        return 'delivered';
      }
      // Out for Delivery / Ready for Delivery -> Delivery Ready
      // Janani doesn't do home delivery, so these mean ready for customer pickup
      if (normalized.includes('out for delivery') || normalized.includes('out_for_delivery') || normalized.includes('on delivery') || normalized.includes('with delivery man') || normalized.includes('delivery assigned') || normalized.includes('assign for delivery') || normalized.includes('ready for delivery') || normalized.includes('ready_for_delivery')) {
        return 'delivery_ready';
      }
      // Parcel Received at destination hub - means in transit, about to be delivered
      if (normalized.includes('parcel received') || normalized.includes('received at')) {
        return 'in_transit';
      }
      // In Transit / Shipped
      if (normalized.includes('in transit') || normalized.includes('in_transit') || normalized.includes('on the way') || normalized.includes('shipped') || normalized.includes('parcel shipped') || normalized.includes('dispatched') || normalized.includes('in hub') || normalized.includes('arrived at') || normalized.includes('departed') || normalized.includes('transfer') || normalized.includes('sorting')) {
        return 'in_transit';
      }
      // Booking Placed / Picked up / Sent
      if (normalized.includes('picked up') || normalized.includes('pickup complete') || normalized.includes('collected') || normalized.includes('received by courier') || normalized.includes('booking complete') || normalized.includes('booked') || normalized.includes('booking placed')) {
        return 'sent';
      }
      // Returned - various return statuses
      if (normalized.includes('returned') || normalized.includes('return to sender') || normalized.includes('return to origin') || normalized.includes('rts') || normalized.includes('returning') || normalized === 'return' || normalized.includes('customer refused') || normalized.includes('refused') || normalized.includes('parcel returned')) {
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
      // Pending/In Review/Processing
      if (normalized.includes('pending') || normalized.includes('in review') || normalized.includes('processing') || normalized.includes('waiting') || normalized.includes('on hold') || normalized.includes('hold')) {
        return 'pending';
      }
      // Default to in_transit for unknown statuses
      console.log('Unknown status, defaulting to in_transit:', status);
      return 'in_transit';
    };
    const mappedStatus = mapJananiStatus(rawStatus);
    console.log('Mapped status:', mappedStatus);
    return new Response(JSON.stringify({
      success: jananiResponse.ok,
      message: jananiResponse.ok ? 'Status check successful' : jananiResult?.msg || 'Status check failed',
      data: details,
      delivery_status: mappedStatus,
      mapped_status: mappedStatus,
      raw_status: rawStatus,
      cn_number: details?._id || cn_number,
      sender_name: details?.sender?.name,
      destination: details?.destination?.branchName,
      booking_place: details?.bookingPlace?.branchName,
      service_type: details?.serviceType,
      tracking_history: trackingStatus
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Janani status check error:', error);
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
