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
            keyPrefix: 'sundorban-status-check'
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

        // Call Sundorban tracking API
        const sundorbanResponse = await fetch(
            'https://tracking.sundarbancourierltd.com/Home/getDatabyCN',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json;charset=UTF-8',
                    'accept': 'application/json, text/javascript, */*; q=0.01',
                    'key': 'CzbZcWnwf7TNTzluD9rxyXCUqzN4xOhs',
                    'x-requested-with': 'XMLHttpRequest',
                },
                body: JSON.stringify({
                    selectedtypes: 'cnno',
                    selectedtimes: '7',
                    inputvalue: cn_number
                })
            }
        )

        const sundorbanResult = await sundorbanResponse.json()
        const parcelData = Array.isArray(sundorbanResult) ? sundorbanResult[0] : sundorbanResult

        if (!parcelData) {
            return new Response(
                JSON.stringify({ success: false, message: 'Parcel not found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        let rawStatus = parcelData?.status || parcelData?.Status || null

        if (!rawStatus && parcelData?.cnStatusList && Array.isArray(parcelData.cnStatusList) && parcelData.cnStatusList.length > 0) {
            const latestStatusEntry = parcelData.cnStatusList[parcelData.cnStatusList.length - 1]
            rawStatus = latestStatusEntry?.status || null
        }

        // Map Sundorban statuses to our app statuses
        const mapSundorbanStatus = (status: string | null): string => {
            if (!status) return 'pending'

            const normalized = status.toLowerCase().trim()

            if (normalized.includes('delivered') || normalized.includes('delivery complete')) return 'delivered'
            if (normalized.includes('ready for delivery') || normalized.includes('ready for c/d') ||
                normalized.includes('out for delivery')) return 'delivery_ready'
            if (normalized.includes('out for destination') || normalized.includes('received by dest')) return 'in_transit'
            if (normalized.includes('in transit') || normalized.includes('on the way') ||
                normalized.includes('picked up')) return 'in_transit'
            if (normalized.includes('booking complete')) return 'sent'
            if (normalized.includes('returned') || normalized.includes('return to sender') ||
                normalized.includes('rts')) return 'returned'
            if (normalized.includes('cancelled') || normalized.includes('cancel')) return 'cancelled'
            if (normalized.includes('lost') || normalized.includes('damaged')) return 'lost'
            if (normalized.includes('pending') || normalized.includes('in review')) return 'pending'

            return 'in_transit'
        }

        const mappedStatus = mapSundorbanStatus(rawStatus)

        return new Response(
            JSON.stringify({
                success: sundorbanResponse.ok,
                message: sundorbanResponse.ok ? 'Status check successful' : parcelData?.message || 'Status check failed',
                data: parcelData,
                delivery_status: mappedStatus,
                mapped_status: mappedStatus,
                raw_status: rawStatus,
                cn_number: parcelData?.cnNumber,
                dest_branch: parcelData?.destBranch,
                booking_branch: parcelData?.bookingBranch
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
