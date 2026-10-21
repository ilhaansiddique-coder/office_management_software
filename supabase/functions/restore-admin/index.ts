import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
// Supabase CLI disallows secrets starting with SUPABASE_, so we support fallbacks.
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? Deno.env.get('SB_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SB_SERVICE_ROLE_KEY') ?? '';
const restoreSecret = Deno.env.get('ADMIN_RESTORE_SECRET');
Deno.serve(async (req)=>{
  const corsHeaders = getCorsHeaders(req);
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    if (!supabaseServiceKey) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Server is missing service role key'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 500
      });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    const headerToken = authHeader?.replace('Bearer ', '');
    const altHeaderToken = req.headers.get('x-user-access-token') ?? '';
    let bodyToken = '';
    if (!headerToken && !altHeaderToken) {
      try {
        const contentType = req.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          const body = await req.json();
          if (body && typeof body === 'object') {
            bodyToken = body.access_token ?? '';
          }
        }
      } catch  {
        bodyToken = '';
      }
    }
    const token = headerToken || altHeaderToken || bodyToken;
    if (!token) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing access token'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 401
      });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid token'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 401
      });
    }
    const { data: existingAdmin, error: adminCheckError } = await supabase.from('user_roles').select('user_id').eq('role', 'admin').limit(1).maybeSingle();
    // PostgREST returns PGRST116 when maybeSingle() finds no rows; treat as "no admin".
    if (adminCheckError && adminCheckError.code !== 'PGRST116') {
      throw new Error(`Failed to check admin status: ${adminCheckError.message}`);
    }
    if (existingAdmin) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Admin already exists. Access is invite-only.'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 403
      });
    }
    console.log(`Restoring admin access for user: ${user.id}`);
    // Create or restore admin profile
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: user.id,
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Admin User',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'id'
    });
    if (profileError) {
      console.error('Error creating profile:', profileError);
      return new Response(JSON.stringify({
        success: false,
        error: `Failed to create profile: ${profileError.message}`
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 500
      });
    }
    // Create or restore admin role
    const { error: roleError } = await supabase.from('user_roles').upsert({
      user_id: user.id,
      role: 'admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    });
    if (roleError) {
      console.error('Error creating user role:', roleError);
      return new Response(JSON.stringify({
        success: false,
        error: `Failed to assign admin role: ${roleError.message}`
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 500
      });
    }
    // Create default system settings
    const { error: systemError } = await supabase.from('system_settings').upsert({
      currency_symbol: '…3',
      currency_code: 'BDT',
      timezone: 'Asia/Dhaka',
      date_format: 'dd/MM/yyyy',
      time_format: '12h',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (systemError) {
      console.error('Error creating system settings:', systemError);
    } else {
      console.log('System settings created successfully');
    }
    // Create default business settings
    const { error: businessError } = await supabase.from('business_settings').upsert({
      business_name: 'Your Business Name',
      invoice_prefix: 'INV',
      invoice_footer_message: '…ف…ف"…?…ف_…فھ…ف_…فف …ف+…ف¦…ف"…ف_…فّ …ف,…ف_…ف‌…ط …فھ…?…ف_…فھ…ف,…ف_ …ف…فّ…ف_…فّ …فo…ف"…?…ف_',
      brand_color: '#2c7be5',
      created_by: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (businessError) {
      console.error('Error creating business settings:', businessError);
    } else {
      console.log('Business settings created successfully');
    }
    return new Response(JSON.stringify({
      success: true,
      message: 'Admin access restored successfully',
      userId: user.id,
      restoredAt: new Date().toISOString()
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('Restore admin error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
