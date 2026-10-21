// Input validation and sanitization utilities for edge functions

/**
 * Validate URL to prevent SSRF attacks
 * Only allows HTTPS URLs to known safe domains
 */
export const validateWebhookUrl = (url: string): { valid: boolean; error?: string } => {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required' }
  }

  try {
    const parsed = new URL(url)

    // Only allow HTTPS in production
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTPS URLs are allowed' }
    }

    // Block internal/private IP ranges
    const hostname = parsed.hostname.toLowerCase()
    const blockedPatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^0\./,
      /^169\.254\./,  // Link-local
      /^::1$/,        // IPv6 localhost
      /^fc00:/i,      // IPv6 private
      /^fe80:/i,      // IPv6 link-local
      /\.local$/i,    // mDNS
      /\.internal$/i,
      /\.localhost$/i,
      /^metadata\./i, // Cloud metadata services
      /^169\.254\.169\.254$/,  // AWS/GCP metadata
    ]

    for (const pattern of blockedPatterns) {
      if (pattern.test(hostname)) {
        return { valid: false, error: 'Internal or private URLs are not allowed' }
      }
    }

    return { valid: true }
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }
}

/**
 * Sanitize string input - remove potentially dangerous characters
 */
export const sanitizeString = (input: string, maxLength = 1000): string => {
  if (typeof input !== 'string') return ''

  return input
    .slice(0, maxLength)
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .replace(/vbscript:/gi, '') // Remove vbscript: protocol
    .trim()
}

/**
 * Validate email format
 */
export const isValidEmail = (email: string): boolean => {
  if (typeof email !== 'string') return false
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email) && email.length <= 254
}

/**
 * Validate phone number (basic validation)
 */
export const isValidPhone = (phone: string): boolean => {
  if (typeof phone !== 'string') return false
  // Allow digits, spaces, +, -, (, )
  const phoneRegex = /^[\d\s+\-()]{7,20}$/
  return phoneRegex.test(phone)
}

/**
 * Validate UUID format
 */
export const isValidUUID = (uuid: string): boolean => {
  if (typeof uuid !== 'string') return false
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

/**
 * Validate and sanitize JSON body
 */
export const parseAndValidateBody = async <T>(
  req: Request,
  requiredFields: string[] = []
): Promise<{ success: true; data: T } | { success: false; error: string }> => {
  try {
    const body = await req.json()

    if (!body || typeof body !== 'object') {
      return { success: false, error: 'Invalid JSON body' }
    }

    // Check required fields
    for (const field of requiredFields) {
      if (!(field in body) || body[field] === undefined || body[field] === null) {
        return { success: false, error: `Missing required field: ${field}` }
      }
    }

    return { success: true, data: body as T }
  } catch {
    return { success: false, error: 'Failed to parse JSON body' }
  }
}

/**
 * Validate password strength
 */
export const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = []

  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['Password is required'] }
  }

  if (password.length < 12) {
    errors.push('Password must be at least 12 characters long')
  }
  if (password.length > 128) {
    errors.push('Password must be less than 128 characters')
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter')
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter')
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number')
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character')
  }

  // Check for common weak passwords
  const weakPasswords = ['password', '123456', 'qwerty', 'admin', 'letmein', 'welcome']
  if (weakPasswords.some(weak => password.toLowerCase().includes(weak))) {
    errors.push('Password contains common weak patterns')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Generate a secure random password
 */
export const generateSecurePassword = (length = 16): string => {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz'
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const numbers = '0123456789'
  const special = '!@#$%^&*()_+-='
  const all = lowercase + uppercase + numbers + special

  const randomValues = new Uint8Array(length)
  crypto.getRandomValues(randomValues)

  // Ensure at least one of each type
  let password = ''
  password += lowercase[randomValues[0] % lowercase.length]
  password += uppercase[randomValues[1] % uppercase.length]
  password += numbers[randomValues[2] % numbers.length]
  password += special[randomValues[3] % special.length]

  // Fill the rest randomly
  for (let i = 4; i < length; i++) {
    password += all[randomValues[i] % all.length]
  }

  // Shuffle the password
  return password
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('')
}
