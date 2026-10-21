import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

const STEADFAST_BASE_URL = 'https://portal.packzy.com/api/v1'

interface SteadfastOrderRequest {
    sale_id: string;
    invoice_number: string;
    recipient_name: string;
    recipient_phone: string;
    recipient_address: string;
    cod_amount: number;
    note?: string;
    item_description?: string;
}

serve(async (req) => {
    const corsHeaders = getCorsHeaders(req)
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { auth: { persistSession: false } }
        )

        // Authenticate the user
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ success: false, message: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
        if (authError || !user) {
            return new Response(
                JSON.stringify({ success: false, message: 'Invalid token' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Check user role
        const { data: userRole, error: roleError } = await supabaseClient
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .single()

        if (roleError || !userRole || !['admin', 'manager', 'staff'].includes(userRole.role)) {
            return new Response(
                JSON.stringify({ success: false, message: 'Insufficient permissions' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const orderData: SteadfastOrderRequest = await req.json()
        console.log('Processing Steadfast order for invoice:', orderData.invoice_number)

        // Get Steadfast API credentials from database
        const { data: webhookSettings, error: settingsError } = await supabaseClient
            .from('courier_webhook_settings')
            .select('steadfast_api_key, steadfast_secret_key, steadfast_enabled')
            .maybeSingle()

        if (settingsError) {
            console.error('Database error fetching settings:', settingsError)
            return new Response(
                JSON.stringify({ success: false, message: 'Database error: ' + settingsError.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (!webhookSettings?.steadfast_api_key || !webhookSettings?.steadfast_secret_key) {
            return new Response(
                JSON.stringify({
                    success: false,
                    message: 'Steadfast API credentials not configured. Please add your API Key and Secret Key in Admin → System → Courier Webhook Settings.'
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Prepare Steadfast API payload
        console.log('=== STEADFAST EDGE FUNCTION DEBUG ===')
        console.log('Received orderData:', JSON.stringify(orderData, null, 2))
        console.log('orderData.note value:', orderData.note)
        console.log('orderData.note type:', typeof orderData.note)

        const noteToSend = orderData.note || '';
        // Robustness: Append note to item_description to ensure it appears on the label/portal
        const baseDescription = orderData.item_description || '';
        const itemDescription = noteToSend ? `${baseDescription} | Note: ${noteToSend}` : baseDescription;

        const steadfastPayload = {
            invoice: orderData.invoice_number,
            recipient_name: orderData.recipient_name,
            recipient_phone: orderData.recipient_phone,
            recipient_address: orderData.recipient_address,
            cod_amount: orderData.cod_amount,
            note: noteToSend,
            item_description: itemDescription,
        }

        console.log('Sending to Steadfast API:', JSON.stringify(steadfastPayload, null, 2))
        console.log('=== END EDGE FUNCTION DEBUG ===')

        // Call Steadfast API to create order
        const steadfastResponse = await fetch(`${STEADFAST_BASE_URL}/create_order`, {
            method: 'POST',
            headers: {
                'Api-Key': webhookSettings.steadfast_api_key,
                'Secret-Key': webhookSettings.steadfast_secret_key,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(steadfastPayload),
        })

        let steadfastResult: any
        try {
            steadfastResult = await steadfastResponse.json()
        } catch (e) {
            const text = await steadfastResponse.text()
            console.error('Failed to parse Steadfast response:', text)
            return new Response(
                JSON.stringify({ success: false, message: 'Invalid response from Steadfast API', raw: text }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        console.log('Steadfast API response:', JSON.stringify(steadfastResult, null, 2))
        console.log('=== STEADFAST RESPONSE DETAILS ===')
        console.log('Full consignment object:', JSON.stringify(steadfastResult.consignment, null, 2))

        if (steadfastResult.status !== 200) {
            console.error('Steadfast API error:', steadfastResult)

            // Build detailed error message
            let errorMessage = steadfastResult.message || 'Failed to create order on Steadfast'
            if (steadfastResult.errors) {
                const errorDetails = Object.entries(steadfastResult.errors)
                    .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
                    .join('; ')
                errorMessage += ` - ${errorDetails}`
            }

            return new Response(
                JSON.stringify({
                    success: false,
                    message: errorMessage,
                    steadfast_status: steadfastResult.status,
                    steadfast_message: steadfastResult.message,
                    errors: steadfastResult.errors || null,
                    full_response: steadfastResult,
                }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Extract consignment details from Steadfast response
        const consignment = steadfastResult.consignment
        const consignmentId = consignment?.consignment_id?.toString() || null
        const trackingCode = consignment?.tracking_code || null
        const rawStatus = consignment?.status || 'in_review'
        const note = consignment?.note || null // Extract note from response

        // Always set to 'not_sent' for newly created orders
        // Status will be updated by auto-refresh or manual refresh later
        const appStatus = 'not_sent'

        console.log('Steadfast order created:', {
            consignment_id: consignmentId,
            tracking_code: trackingCode,
            raw_status: rawStatus,
            app_status: appStatus,
            note: note,
        })
        console.log('=== END STEADFAST RESPONSE DETAILS ===')

        // Update the sale with Steadfast details
        if (orderData.sale_id) {
            const updatePayload: Record<string, any> = {
                courier_status: appStatus,
                order_status: appStatus,
                last_status_check: new Date().toISOString(),
            }

            if (consignmentId) {
                updatePayload.consignment_id = consignmentId
                updatePayload.cn_number = consignmentId // Also update CN number field
            }

            // Save tracking_code for public tracking timeline
            if (trackingCode) {
                updatePayload.tracking_number = trackingCode
            }

            console.log('=== UPDATING SALE ===')
            console.log('Sale ID:', orderData.sale_id)
            console.log('Update payload:', JSON.stringify(updatePayload, null, 2))

            const { data: updateData, error: updateError } = await supabaseClient
                .from('sales')
                .update(updatePayload)
                .eq('id', orderData.sale_id)
                .select('id, consignment_id, cn_number, tracking_number, courier_status')
                .single()

            if (updateError) {
                console.error('Failed to update sale:', updateError)
                console.error('Update error details:', JSON.stringify(updateError, null, 2))
            } else {
                console.log('Sale updated successfully!')
                console.log('Updated sale data:', JSON.stringify(updateData, null, 2))
            }
        } else {
            console.warn('No sale_id provided, skipping database update')
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Order sent to Steadfast successfully',
                consignment_id: consignmentId,
                tracking_code: trackingCode,
                status: appStatus,
                raw_status: rawStatus,
                steadfast_response: steadfastResult,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Error in steadfast-create-order function:', error)
        return new Response(
            JSON.stringify({
                success: false,
                message: (error as any)?.message || 'Internal server error',
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
