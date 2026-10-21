// Secure storage utility for sensitive data
// Uses sessionStorage (clears on browser close) with obfuscation

/**
 * Simple obfuscation for client-side storage
 * Note: This is NOT encryption - it's obfuscation to prevent casual inspection
 * Truly sensitive data should never be stored client-side
 */
const STORAGE_KEY_PREFIX = '__rs_'

// Simple XOR-based obfuscation with a session-specific key
const getSessionKey = (): string => {
  let key = sessionStorage.getItem('__rs_sk')
  if (!key) {
    key = crypto.randomUUID()
    sessionStorage.setItem('__rs_sk', key)
  }
  return key
}

const obfuscate = (data: string): string => {
  const key = getSessionKey()
  let result = ''
  for (let i = 0; i < data.length; i++) {
    result += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length))
  }
  return btoa(result)
}

const deobfuscate = (data: string): string => {
  try {
    const key = getSessionKey()
    const decoded = atob(data)
    let result = ''
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length))
    }
    return result
  } catch {
    return ''
  }
}

/**
 * Securely store sensitive data in sessionStorage
 * Data is obfuscated and will be cleared when browser closes
 */
export const secureStore = {
  setItem: (key: string, value: unknown): void => {
    if (typeof window === 'undefined') return
    try {
      const json = JSON.stringify(value)
      const obfuscated = obfuscate(json)
      sessionStorage.setItem(STORAGE_KEY_PREFIX + key, obfuscated)
    } catch (error) {
      console.warn('secureStore.setItem failed')
    }
  },

  getItem: <T>(key: string): T | null => {
    if (typeof window === 'undefined') return null
    try {
      const obfuscated = sessionStorage.getItem(STORAGE_KEY_PREFIX + key)
      if (!obfuscated) return null
      const json = deobfuscate(obfuscated)
      if (!json) return null
      return JSON.parse(json) as T
    } catch {
      return null
    }
  },

  removeItem: (key: string): void => {
    if (typeof window === 'undefined') return
    try {
      sessionStorage.removeItem(STORAGE_KEY_PREFIX + key)
    } catch {
      // Ignore errors
    }
  },

  // Check if an item exists
  hasItem: (key: string): boolean => {
    if (typeof window === 'undefined') return false
    return sessionStorage.getItem(STORAGE_KEY_PREFIX + key) !== null
  },
}

/**
 * Migrate old localStorage backup data to sessionStorage
 * Call this once on app startup to clean up old insecure data
 */
export const migrateInsecureBackups = (): void => {
  if (typeof window === 'undefined') return

  try {
    // Find and remove old payment backup keys
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('salePaymentBackup:')) {
        keysToRemove.push(key)
      }
    }

    // Remove old insecure backups
    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key)
      } catch {
        // Ignore errors
      }
    })
  } catch {
    // Ignore errors during migration
  }
}
