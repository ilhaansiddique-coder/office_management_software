import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0'
import { getCorsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Verify the caller is an admin
    const authHeader = req.headers.get('Authorization') ?? ''
    const headerToken = authHeader.replace('Bearer ', '')
    const altHeaderToken = req.headers.get('x-user-access-token') ?? ''
    let parsedBody: Record<string, unknown> | null = null
    let bodyToken = ''

    try {
      const contentType = req.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        parsedBody = (await req.json()) as Record<string, unknown>
        bodyToken = (parsedBody?.access_token as string | undefined) ?? ''
      }
    } catch {
      parsedBody = null
      bodyToken = ''
    }

    const token = altHeaderToken || headerToken || bodyToken
    if (!token) {
      throw new Error('Missing access token')
    }
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    
    if (userError || !user) {
      throw new Error('Invalid token')
    }

    // Check if user is admin
    const { data: userRole, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (roleError || userRole?.role !== 'admin') {
      throw new Error('Unauthorized: Admin access required')
    }

    const userId = (parsedBody?.userId as string | undefined) ?? ''

    if (!userId) {
      throw new Error('User ID is required')
    }

    // Prevent self-deletion
    if (userId === user.id) {
      throw new Error('Cannot delete your own account')
    }

    console.log(`Admin ${user.email} deleting user ${userId}`)

    // Step 1: Delete user-related data (handled by CASCADE in database)
    // The database will automatically delete:
    // - user_roles
    // - profiles
    // - user_preferences
    // - dismissed_alerts
    
    // Step 2: Delete from Supabase Auth
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (authDeleteError) {
      console.error('Auth delete error:', authDeleteError)
      throw new Error(`Failed to delete user from authentication: ${authDeleteError.message}`)
    }

    console.log('User deleted successfully from auth and database')

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'User deleted successfully'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Admin delete user error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
