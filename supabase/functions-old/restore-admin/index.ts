import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const restoreSecret = Deno.env.get('ADMIN_RESTORE_SECRET')

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      throw new Error('Invalid token')
    }

    const providedSecret = req.headers.get('x-admin-restore-secret') ?? ''
    const hasValidSecret = restoreSecret ? providedSecret === restoreSecret : false

    if (!hasValidSecret) {
      const { data: existingAdmin, error: adminCheckError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin')
        .limit(1)
        .maybeSingle()

      if (adminCheckError) {
        throw new Error(`Failed to check admin status: ${adminCheckError.message}`)
      }

      if (existingAdmin) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Admin already exists. Recovery requires a valid restore secret.'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 403,
          }
        )
      }
    }

    console.log(`Restoring admin access for user: ${user.id}`)

    // Create or restore admin profile
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        user_id: user.id,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Admin User',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

    if (profileError) {
      console.error('Error creating profile:', profileError)
    } else {
      console.log('Profile created successfully')
    }

    // Create or restore admin role
    const { error: roleError } = await supabase
      .from('user_roles')
      .upsert({
        user_id: user.id,
        role: 'admin',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

    if (roleError) {
      console.error('Error creating user role:', roleError)
    } else {
      console.log('Admin role created successfully')
    }

    // Create default system settings
    const { error: systemError } = await supabase
      .from('system_settings')
      .upsert({
        currency_symbol: '৳',
        currency_code: 'BDT',
        timezone: 'Asia/Dhaka',
        date_format: 'dd/MM/yyyy',
        time_format: '12h',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

    if (systemError) {
      console.error('Error creating system settings:', systemError)
    } else {
      console.log('System settings created successfully')
    }

    // Create default business settings
    const { error: businessError } = await supabase
      .from('business_settings')
      .upsert({
        business_name: 'Your Business Name',
        invoice_prefix: 'INV',
        invoice_count_start: 1,
        invoice_footer_message: 'ধন্যবাদ আপনার সাথে ব্যবসা করার জন্য',
        brand_color: '#2c7be5',
        created_by: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

    if (businessError) {
      console.error('Error creating business settings:', businessError)
    } else {
      console.log('Business settings created successfully')
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Admin access restored successfully',
        userId: user.id,
        restoredAt: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Restore admin error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
