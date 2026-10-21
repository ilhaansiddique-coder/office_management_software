import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts'
import { checkRateLimit, getClientIdentifier, rateLimitExceededResponse, RateLimitPresets } from '../_shared/rateLimiter.ts'

serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req)

    if (req.method === 'OPTIONS') {
        return handleCorsPreflightRequest(req)
    }

    try {
        // Rate limiting
        const clientId = getClientIdentifier(req)
        const rateLimitResult = checkRateLimit(clientId, {
            ...RateLimitPresets.standard,
            keyPrefix: 'janani-status-check'
        })
        if (!rateLimitResult.allowed) {
            return rateLimitExceededResponse(rateLimitResult, corsHeaders)
        }

        const { cn_number } = await req.json()

        if (!cn_number) {
            return new Response(
                JSON.stringify({ success: false, message: 'Missing cn_number' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const currentYear = new Date().getFullYear()

        // Call Janani Express tracking API
        const jananiResponse = await fetch(
            `https://jananiexpress.com/api/parcel_booking/search_by_cn_public?cnNumber=${cn_number}&bookingYear=${currentYear}`,
            {
                method: 'GET',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
                    'Referer': 'https://jananiexpress.com/tracking',
                },
            }
        )

        const jananiResult = await jananiResponse.json()

        if (!jananiResult?.success || !jananiResult?.details) {
            return new Response(
                JSON.stringify({ success: false, message: jananiResult?.msg || 'Parcel not found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const details = jananiResult.details
        const trackingStatus = details.trackingStatus || []

        let rawStatus = null
        if (Array.isArray(trackingStatus) && trackingStatus.length > 0) {
            const latestTracking = trackingStatus[trackingStatus.length - 1]
            rawStatus = latestTracking?.status || null
        }

        // Map Janani statuses to our app statuses
        const mapJananiStatus = (status: string | null): string => {
            if (!status) return 'pending'

            const normalized = status.toLowerCase().trim()

            if (normalized.includes('delivered') || normalized.includes('delivery complete')) return 'delivered'
            if (normalized.includes('out for delivery') || normalized.includes('ready for delivery') ||
                normalized.includes('delivery assigned')) return 'delivery_ready'
            if (normalized.includes('parcel received') || normalized.includes('received at')) return 'in_transit'
            if (normalized.includes('in transit') || normalized.includes('shipped') ||
                normalized.includes('dispatched') || normalized.includes('sorting')) return 'in_transit'
            if (normalized.includes('picked up') || normalized.includes('booking placed') ||
                normalized.includes('booked')) return 'sent'
            if (normalized.includes('returned') || normalized.includes('return to sender') ||
                normalized.includes('refused')) return 'returned'
            if (normalized.includes('cancelled') || normalized.includes('cancel')) return 'cancelled'
            if (normalized.includes('lost') || normalized.includes('damaged')) return 'lost'
            if (normalized.includes('pending') || normalized.includes('hold')) return 'pending'

            return 'in_transit'
        }

        const mappedStatus = mapJananiStatus(rawStatus)

        return new Response(
            JSON.stringify({
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
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        const corsHeaders = getCorsHeaders(req)
        return new Response(
            JSON.stringify({ success: false, message: 'An error occurred' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
