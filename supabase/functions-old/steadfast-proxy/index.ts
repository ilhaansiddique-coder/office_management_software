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
            keyPrefix: 'steadfast-proxy'
        })

        if (!rateLimitResult.allowed) {
            return rateLimitExceededResponse(rateLimitResult, corsHeaders)
        }

        let requestBody: any
        try {
            requestBody = await req.json()
        } catch (e) {
            return new Response(
                JSON.stringify({ success: false, message: 'Invalid JSON in request body' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const { consignment_id, api_key, secret_key } = requestBody

        if (!consignment_id || !api_key || !secret_key) {
            return new Response(
                JSON.stringify({ success: false, message: 'Missing required parameters' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Proxy request to Steadfast API
        const steadfastResponse = await fetch(
            `https://portal.packzy.com/api/v1/status_by_cid/${consignment_id}`,
            {
                method: 'GET',
                headers: {
                    'Api-Key': api_key,
                    'Secret-Key': secret_key,
                    'Content-Type': 'application/json',
                },
            }
        )

        // Handle non-JSON responses
        let steadfastData: any
        const responseText = await steadfastResponse.text()

        try {
            steadfastData = JSON.parse(responseText)
        } catch (e) {
            return new Response(
                JSON.stringify({
                    success: false,
                    message: 'Invalid response from Steadfast API'
                }),
                { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        return new Response(
            JSON.stringify({
                success: steadfastResponse.ok,
                data: steadfastData,
                delivery_status: steadfastData.delivery_status
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
