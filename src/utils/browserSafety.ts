/**
 * Browser API Safety Utilities
 * Provides safe access to browser APIs that may not be available in all contexts
 */

/**
 * Safely access localStorage
 * Returns null if localStorage is not available or throws an error
 */
export const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return null;
      }
      return window.localStorage.getItem(key);
    } catch (error) {
      console.warn('localStorage.getItem failed:', error);
      return null;
    }
  },

  setItem: (key: string, value: string): boolean => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return false;
      }
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn('localStorage.setItem failed:', error);
      return false;
    }
  },

  removeItem: (key: string): boolean => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return false;
      }
      window.localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn('localStorage.removeItem failed:', error);
      return false;
    }
  },

  clear: (): boolean => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return false;
      }
      window.localStorage.clear();
      return true;
    } catch (error) {
      console.warn('localStorage.clear failed:', error);
      return false;
    }
  },
};

/**
 * Safely check if code is running in browser environment
 */
export const isBrowser = (): boolean => {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
};

/**
 * Safely access window object
 */
export const safeWindow = (): Window | null => {
  return isBrowser() ? window : null;
};

/**
 * Safely get window dimensions
 */
export const getWindowDimensions = (): { width: number; height: number } => {
  if (!isBrowser()) {
    return { width: 1920, height: 1080 }; // Default fallback
  }

  try {
    return {
      width: window.innerWidth || document.documentElement.clientWidth || 1920,
      height: window.innerHeight || document.documentElement.clientHeight || 1080,
    };
  } catch (error) {
    console.warn('Failed to get window dimensions:', error);
    return { width: 1920, height: 1080 };
  }
};

/**
 * Safely check if a browser API is available
 */
export const hasAPI = (apiName: keyof Window): boolean => {
  if (!isBrowser()) return false;

  try {
    return apiName in window && typeof (window as any)[apiName] !== 'undefined';
  } catch (error) {
    return false;
  }
};

/**
 * Safely add event listener to window
 */
export const safeAddEventListener = (
  event: string,
  handler: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions
): (() => void) | null => {
  if (!isBrowser() || !window.addEventListener) {
    return null;
  }

  try {
    window.addEventListener(event, handler, options);

    // Return cleanup function
    return () => {
      try {
        window.removeEventListener(event, handler, options);
      } catch (error) {
        console.warn('Failed to remove event listener:', error);
      }
    };
  } catch (error) {
    console.warn('Failed to add event listener:', error);
    return null;
  }
};

/**
 * Safely execute code that requires browser APIs
 */
export const safeBrowserExec = <T>(
  fn: () => T,
  fallback: T
): T => {
  if (!isBrowser()) {
    return fallback;
  }

  try {
    return fn();
  } catch (error) {
    console.warn('Browser execution failed:', error);
    return fallback;
  }
};
