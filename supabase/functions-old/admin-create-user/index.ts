import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0'
import { getCorsHeaders } from '../_shared/cors.ts'
import { checkRateLimit, getClientIdentifier, rateLimitExceededResponse, RateLimitPresets, getRateLimitHeaders } from '../_shared/rateLimiter.ts'
import { isValidEmail, validatePassword, generateSecurePassword, sanitizeString } from '../_shared/validation.ts'

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting - sensitive operation
    const clientId = getClientIdentifier(req)
    const rateLimitResult = checkRateLimit(clientId, {
      ...RateLimitPresets.sensitive,
      keyPrefix: 'admin-create-user'
    })

    if (!rateLimitResult.allowed) {
      return rateLimitExceededResponse(rateLimitResult, corsHeaders)
    }

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

    const { full_name, email, phone, role, password } = parsedBody ?? {}

    // Validate required fields
    if (!full_name || !email || !role) {
      throw new Error('Full name, email and role are required')
    }

    // Sanitize inputs
    const sanitizedFullName = sanitizeString(full_name as string, 100)
    const sanitizedEmail = (email as string).toLowerCase().trim()
    const sanitizedPhone = phone ? sanitizeString(phone as string, 20) : null

    // Validate email format
    if (!isValidEmail(sanitizedEmail)) {
      throw new Error('Invalid email format')
    }

    // Valid roles
    const validRoles = ['admin', 'manager', 'staff', 'viewer']
    if (!validRoles.includes(role as string)) {
      throw new Error('Invalid role')
    }

    // Handle password
    let userPassword: string
    if (password) {
      // Validate provided password
      const passwordValidation = validatePassword(password as string)
      if (!passwordValidation.valid) {
        throw new Error(`Password requirements not met: ${passwordValidation.errors.join(', ')}`)
      }
      userPassword = password as string
    } else {
      // Generate secure random password
      userPassword = generateSecurePassword(16)
    }

    // Log operation without sensitive data
    console.log(`Admin user creation initiated for role: ${role}`)

    // Create the user account using admin API
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: sanitizedEmail,
      password: userPassword,
      email_confirm: true,
      user_metadata: {
        full_name: sanitizedFullName,
        created_by: user.id,
        created_at: new Date().toISOString()
      }
    })

    if (createError) {
      // Log error without exposing details to client
      console.error('User creation failed')
      throw new Error('Failed to create user. Please try again.')
    }

    if (!newUser.user) {
      throw new Error('User creation failed - please try again')
    }

    console.log('User created successfully')

    // The profile and initial role will be created by the handle_new_user trigger
    await new Promise(resolve => setTimeout(resolve, 100))

    // Update the user role to the specified role
    const { error: roleUpdateError } = await supabaseAdmin
      .from('user_roles')
      .update({ role })
      .eq('user_id', newUser.user.id)

    if (roleUpdateError) {
      console.error('Role update failed')
    }

    // Update the profile with phone number if provided
    if (sanitizedPhone) {
      const { error: profileUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({ phone: sanitizedPhone })
        .eq('id', newUser.user.id)

      if (profileUpdateError) {
        console.error('Profile update failed')
      }
    }

    // Include rate limit headers in response
    const responseHeaders = {
      ...corsHeaders,
      ...getRateLimitHeaders(rateLimitResult),
      'Content-Type': 'application/json'
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUser.user.id,
          email: newUser.user.email,
          full_name: sanitizedFullName,
          phone: sanitizedPhone,
          role: role
        },
        // Only include generated password if no password was provided
        ...(password ? {} : { temporaryPassword: userPassword, passwordGenerated: true })
      }),
      { headers: responseHeaders }
    )

  } catch (error) {
    console.error('Admin create user error occurred')
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
