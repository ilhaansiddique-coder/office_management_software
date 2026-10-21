// Secure CORS configuration - NEVER use '*' in production
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

// Default production domains - add your domain here
const defaultAllowedOrigins = [
  'https://rahestock.com',
  'https://www.rahestock.com',
  'https://rahestock.vercel.app',
  // Add localhost for development
  ...(Deno.env.get('DENO_ENV') === 'development' ? ['http://localhost:5173', 'http://localhost:3000'] : [])
]

const allAllowedOrigins = [...new Set([...defaultAllowedOrigins, ...allowedOrigins])]

// Security headers to include in all responses
export const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'",
}

// Base CORS headers - NO wildcard allowed
export const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret, x-admin-restore-secret, x-user-access-token',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Max-Age': '86400',
  ...securityHeaders,
}

export const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get('Origin') ?? ''

  // Check if origin is in allowed list
  if (allAllowedOrigins.includes(origin)) {
    return {
      ...corsHeaders,
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin',
    }
  }

  // Reject unknown origins - return null origin
  return {
    ...corsHeaders,
    'Access-Control-Allow-Origin': 'null',
    'Vary': 'Origin',
  }
}

// Helper to create a CORS preflight response
export const handleCorsPreflightRequest = (req: Request) => {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(req),
  })
}

// Helper to check if request is from allowed origin
export const isAllowedOrigin = (req: Request): boolean => {
  const origin = req.headers.get('Origin') ?? ''
  return allAllowedOrigins.includes(origin)
}
