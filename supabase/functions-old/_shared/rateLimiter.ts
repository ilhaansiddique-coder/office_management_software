// Simple in-memory rate limiter for edge functions
// Note: In production, consider using Redis or Supabase for distributed rate limiting

interface RateLimitEntry {
  count: number
  resetTime: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key)
    }
  }
}, 60000) // Clean every minute

export interface RateLimitConfig {
  windowMs: number      // Time window in milliseconds
  maxRequests: number   // Max requests per window
  keyPrefix?: string    // Optional prefix for rate limit key
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetTime: number
  retryAfter?: number
}

/**
 * Check rate limit for a given identifier
 * @param identifier - Unique identifier (e.g., IP address, user ID)
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export const checkRateLimit = (
  identifier: string,
  config: RateLimitConfig
): RateLimitResult => {
  const { windowMs, maxRequests, keyPrefix = '' } = config
  const key = `${keyPrefix}:${identifier}`
  const now = Date.now()

  let entry = rateLimitStore.get(key)

  // Initialize or reset if window expired
  if (!entry || entry.resetTime < now) {
    entry = {
      count: 0,
      resetTime: now + windowMs,
    }
  }

  entry.count++
  rateLimitStore.set(key, entry)

  const remaining = Math.max(0, maxRequests - entry.count)
  const allowed = entry.count <= maxRequests

  return {
    allowed,
    remaining,
    resetTime: entry.resetTime,
    retryAfter: allowed ? undefined : Math.ceil((entry.resetTime - now) / 1000),
  }
}

/**
 * Get client identifier from request (IP address or user ID)
 */
export const getClientIdentifier = (req: Request, userId?: string): string => {
  // Prefer user ID if available (authenticated requests)
  if (userId) {
    return `user:${userId}`
  }

  // Fall back to IP address
  const forwardedFor = req.headers.get('x-forwarded-for')
  const realIp = req.headers.get('x-real-ip')
  const cfConnectingIp = req.headers.get('cf-connecting-ip')

  return cfConnectingIp || realIp || forwardedFor?.split(',')[0]?.trim() || 'unknown'
}

/**
 * Create rate limit headers for response
 */
export const getRateLimitHeaders = (result: RateLimitResult): Record<string, string> => {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': result.remaining.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
  }

  if (result.retryAfter) {
    headers['Retry-After'] = result.retryAfter.toString()
  }

  return headers
}

/**
 * Create a rate limit exceeded response
 */
export const rateLimitExceededResponse = (
  result: RateLimitResult,
  corsHeaders: Record<string, string>
): Response => {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Too many requests',
      message: `Rate limit exceeded. Please try again in ${result.retryAfter} seconds.`,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        ...getRateLimitHeaders(result),
        'Content-Type': 'application/json',
      },
    }
  )
}

// Preset configurations for different endpoint types
export const RateLimitPresets = {
  // Standard API endpoints
  standard: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60,     // 60 requests per minute
  },
  // Sensitive operations (admin, delete, etc.)
  sensitive: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,     // 10 requests per minute
  },
  // Authentication endpoints
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,           // 5 requests per 15 minutes
  },
  // Webhook endpoints (external services)
  webhook: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,    // 100 requests per minute
  },
}
