import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts'
import { checkRateLimit, getClientIdentifier, rateLimitExceededResponse, RateLimitPresets } from '../_shared/rateLimiter.ts'

const PATHAO_BASE_URL = 'https://api-hermes.pathao.com'

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
            keyPrefix: 'pathao-status-check'
        })
        if (!rateLimitResult.allowed) {
            return rateLimitExceededResponse(rateLimitResult, corsHeaders)
        }

        const { consignment_id } = await req.json()

        if (!consignment_id) {
            return new Response(
                JSON.stringify({ success: false, message: 'Missing consignment_id' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Get webhook settings for Pathao credentials
        const { data: settings, error: settingsError } = await supabase
            .from('courier_webhook_settings')
            .select('*')
            .limit(1)
            .single()

        if (settingsError || !settings) {
            return new Response(
                JSON.stringify({ success: false, message: 'Webhook settings not found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        let accessToken = settings.pathao_access_token
        const tokenExpires = settings.pathao_token_expires_at ? new Date(settings.pathao_token_expires_at) : null

        // Refresh token if expired
        if (!accessToken || (tokenExpires && tokenExpires < new Date())) {
            if (settings.pathao_refresh_token) {
                const refreshResponse = await fetch(`${PATHAO_BASE_URL}/aladdin/api/v1/issue-token`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    body: JSON.stringify({
                        client_id: settings.pathao_client_id,
                        client_secret: settings.pathao_client_secret,
                        refresh_token: settings.pathao_refresh_token,
                        grant_type: 'refresh_token'
                    })
                })

                if (refreshResponse.ok) {
                    const refreshData = await refreshResponse.json()
                    accessToken = refreshData.access_token

                    await supabase
                        .from('courier_webhook_settings')
                        .update({
                            pathao_access_token: refreshData.access_token,
                            pathao_refresh_token: refreshData.refresh_token,
                            pathao_token_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
                        })
                        .eq('id', settings.id)
                }
            }
        }

        if (!accessToken) {
            return new Response(
                JSON.stringify({ success: false, message: 'Pathao not authenticated' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Call Pathao order info API
        const orderResponse = await fetch(`${PATHAO_BASE_URL}/aladdin/api/v1/orders/${consignment_id}/info`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json',
            }
        })

        const orderData = await orderResponse.json()

        if (!orderResponse.ok) {
            return new Response(
                JSON.stringify({ success: false, message: orderData.message || 'Failed to fetch order info' }),
                { status: orderResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const data = orderData.data || orderData
        const rawStatus = data.order_status || data.order_status_slug || null

        // Map Pathao statuses to our app statuses
        const mapPathaoStatus = (status: string | null): string => {
            if (!status) return 'pending'

            const normalized = status.toLowerCase().trim().replace(/[-_\s]+/g, '_')

            if (normalized.includes('delivered') || normalized === 'delivered') return 'delivered'
            if (normalized.includes('partial_delivered') || normalized.includes('partially_delivered')) return 'delivered'
            if (normalized.includes('return') || normalized.includes('returned') || normalized.includes('rts')) return 'returned'
            if (normalized.includes('on_hold') || normalized === 'hold') return 'on_hold'
            if (normalized.includes('cancel')) return 'cancelled'
            if (normalized.includes('picked') || normalized.includes('pickup')) return 'in_transit'
            if (normalized.includes('in_transit') || normalized.includes('hub')) return 'in_transit'
            if (normalized.includes('out_for_delivery') || normalized.includes('delivery_assigned')) return 'out_for_delivery'
            if (normalized.includes('pending')) return 'pending'
            if (normalized.includes('pickup_pending') || normalized.includes('waiting_for_pickup')) return 'sent'
            if (normalized.includes('lost') || normalized.includes('damaged')) return 'lost'

            return 'in_transit'
        }

        const mappedStatus = mapPathaoStatus(rawStatus)
        const trackingUrl = `https://merchant.pathao.com/tracking?consignment_id=${consignment_id}`

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Status check successful',
                delivery_status: mappedStatus,
                mapped_status: mappedStatus,
                raw_status: rawStatus,
                consignment_id: consignment_id,
                tracking_url: trackingUrl,
                data: data,
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
