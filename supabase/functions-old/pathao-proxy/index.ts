import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPreflightRequest, securityHeaders } from '../_shared/cors.ts'
import { checkRateLimit, getClientIdentifier, rateLimitExceededResponse, RateLimitPresets } from '../_shared/rateLimiter.ts'

const PATHAO_BASE_URL = 'https://api-hermes.pathao.com'

interface PathaoTokenResponse {
    token_type: string
    expires_in: number
    access_token: string
    refresh_token: string
}

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
            keyPrefix: 'pathao-proxy'
        })

        if (!rateLimitResult.allowed) {
            return rateLimitExceededResponse(rateLimitResult, corsHeaders)
        }

        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ success: false, message: 'Authorization required' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const { action, ...params } = await req.json()

        // Get webhook settings for Pathao credentials
        let { data: settings, error: settingsError } = await supabase
            .from('courier_webhook_settings')
            .select('*')
            .limit(1)
            .maybeSingle()

        // If no settings row exists and this is an authenticate action, create one
        if (!settings && action === 'authenticate') {
            const { data: newSettings, error: insertError } = await supabase
                .from('courier_webhook_settings')
                .insert({
                    webhook_url: '',
                    webhook_name: '',
                    is_active: false,
                    steadfast_enabled: false,
                    pathao_enabled: false
                })
                .select()
                .single()

            if (insertError) {
                return new Response(
                    JSON.stringify({ success: false, message: 'Failed to create settings' }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
            settings = newSettings
        }

        if (settingsError || !settings) {
            return new Response(
                JSON.stringify({ success: false, message: 'Webhook settings not found. Please save settings first.' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Handle different actions
        switch (action) {
            case 'authenticate': {
                // Apply stricter rate limit for auth
                const authRateLimit = checkRateLimit(clientId, {
                    ...RateLimitPresets.auth,
                    keyPrefix: 'pathao-auth'
                })
                if (!authRateLimit.allowed) {
                    return rateLimitExceededResponse(authRateLimit, corsHeaders)
                }

                const { client_id, client_secret, username, password } = params

                if (!client_id || !client_secret || !username || !password) {
                    return new Response(
                        JSON.stringify({ success: false, message: 'All credentials (client_id, client_secret, username, password) are required' }),
                        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }

                const tokenResponse = await fetch(`${PATHAO_BASE_URL}/aladdin/api/v1/issue-token`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    body: JSON.stringify({
                        client_id: client_id,
                        client_secret: client_secret,
                        username: username,
                        password: password,
                        grant_type: 'password'
                    })
                })

                const tokenData = await tokenResponse.json()

                if (!tokenResponse.ok) {
                    return new Response(
                        JSON.stringify({ success: false, message: tokenData.message || 'Authentication failed' }),
                        { status: tokenResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }

                // Save tokens to webhook_settings
                const updatePayload: Record<string, any> = {
                    pathao_access_token: tokenData.access_token,
                    pathao_refresh_token: tokenData.refresh_token,
                    pathao_token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
                }
                if (client_id) updatePayload.pathao_client_id = client_id
                if (client_secret) updatePayload.pathao_client_secret = client_secret

                const { error: updateError } = await supabase
                    .from('courier_webhook_settings')
                    .update(updatePayload)
                    .eq('id', settings.id)

                if (updateError) {
                    return new Response(
                        JSON.stringify({ success: false, message: 'Authentication succeeded but failed to save token' }),
                        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }

                return new Response(
                    JSON.stringify({ success: true, message: 'Authentication successful' }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            case 'refresh_token': {
                const tokenResponse = await fetch(`${PATHAO_BASE_URL}/aladdin/api/v1/issue-token`, {
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

                const tokenData = await tokenResponse.json()

                if (!tokenResponse.ok) {
                    return new Response(
                        JSON.stringify({ success: false, message: 'Token refresh failed' }),
                        { status: tokenResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }

                await supabase
                    .from('courier_webhook_settings')
                    .update({
                        pathao_access_token: tokenData.access_token,
                        pathao_refresh_token: tokenData.refresh_token,
                        pathao_token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
                    })
                    .eq('id', settings.id)

                return new Response(
                    JSON.stringify({ success: true, message: 'Token refreshed' }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            case 'get_stores': {
                let accessToken = settings.pathao_access_token
                const tokenExpires = settings.pathao_token_expires_at ? new Date(settings.pathao_token_expires_at) : null

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
                        JSON.stringify({ success: false, message: 'Not authenticated. Please authenticate first.' }),
                        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }

                const storesResponse = await fetch(`${PATHAO_BASE_URL}/aladdin/api/v1/stores`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Accept': 'application/json',
                    }
                })

                const storesData = await storesResponse.json()

                if (!storesResponse.ok) {
                    return new Response(
                        JSON.stringify({ success: false, message: 'Failed to fetch stores' }),
                        { status: storesResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }

                return new Response(
                    JSON.stringify({ success: true, data: storesData }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            case 'get_cities': {
                let accessToken = settings.pathao_access_token

                if (!accessToken) {
                    return new Response(
                        JSON.stringify({ success: false, message: 'Not authenticated' }),
                        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }

                const citiesResponse = await fetch(`${PATHAO_BASE_URL}/aladdin/api/v1/city-list`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Accept': 'application/json',
                    }
                })

                const citiesData = await citiesResponse.json()

                return new Response(
                    JSON.stringify({ success: citiesResponse.ok, data: citiesData }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            case 'get_zones': {
                const { city_id } = params
                let accessToken = settings.pathao_access_token

                if (!accessToken) {
                    return new Response(
                        JSON.stringify({ success: false, message: 'Not authenticated' }),
                        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }

                const zonesResponse = await fetch(`${PATHAO_BASE_URL}/aladdin/api/v1/cities/${city_id}/zone-list`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Accept': 'application/json',
                    }
                })

                const zonesData = await zonesResponse.json()

                return new Response(
                    JSON.stringify({ success: zonesResponse.ok, data: zonesData }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            case 'get_areas': {
                const { zone_id } = params
                let accessToken = settings.pathao_access_token

                if (!accessToken) {
                    return new Response(
                        JSON.stringify({ success: false, message: 'Not authenticated' }),
                        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }

                const areasResponse = await fetch(`${PATHAO_BASE_URL}/aladdin/api/v1/zones/${zone_id}/area-list`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Accept': 'application/json',
                    }
                })

                const areasData = await areasResponse.json()

                return new Response(
                    JSON.stringify({ success: areasResponse.ok, data: areasData }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            case 'create_order': {
                let accessToken = settings.pathao_access_token
                const tokenExpires = settings.pathao_token_expires_at ? new Date(settings.pathao_token_expires_at) : null

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
                        JSON.stringify({ success: false, message: 'Not authenticated' }),
                        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }

                const orderPayload = {
                    store_id: params.store_id || settings.pathao_store_id,
                    merchant_order_id: params.merchant_order_id || params.invoice_number,
                    recipient_name: params.recipient_name,
                    recipient_phone: params.recipient_phone,
                    recipient_address: params.recipient_address,
                    recipient_city: params.recipient_city || 1,
                    recipient_zone: params.recipient_zone || 1,
                    recipient_area: params.recipient_area,
                    delivery_type: params.delivery_type || 48,
                    item_type: params.item_type || 2,
                    special_instruction: params.special_instruction || params.note || '',
                    item_quantity: params.item_quantity || 1,
                    item_weight: params.item_weight || 0.5,
                    amount_to_collect: params.amount_to_collect || params.cod_amount || 0,
                    item_description: params.item_description || ''
                }

                const orderResponse = await fetch(`${PATHAO_BASE_URL}/aladdin/api/v1/orders`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    body: JSON.stringify(orderPayload)
                })

                const orderData = await orderResponse.json()

                if (!orderResponse.ok) {
                    return new Response(
                        JSON.stringify({ success: false, message: orderData.message || 'Order creation failed' }),
                        { status: orderResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }

                return new Response(
                    JSON.stringify({
                        success: true,
                        consignment_id: orderData.data?.consignment_id,
                        order_status: orderData.data?.order_status || 'Pending',
                        data: orderData
                    }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            case 'get_order_info': {
                const { consignment_id } = params
                let accessToken = settings.pathao_access_token

                if (!accessToken) {
                    return new Response(
                        JSON.stringify({ success: false, message: 'Not authenticated' }),
                        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    )
                }

                const orderResponse = await fetch(`${PATHAO_BASE_URL}/aladdin/api/v1/orders/${consignment_id}/info`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Accept': 'application/json',
                    }
                })

                const orderData = await orderResponse.json()

                return new Response(
                    JSON.stringify({ success: orderResponse.ok, data: orderData }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            default:
                return new Response(
                    JSON.stringify({ success: false, message: `Unknown action: ${action}` }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
        }
    } catch (error) {
        const corsHeaders = getCorsHeaders(req)
        return new Response(
            JSON.stringify({ success: false, message: 'An error occurred' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
