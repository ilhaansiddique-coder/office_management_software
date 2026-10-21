import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    // Safety check for browser environment
    if (typeof window === 'undefined') {
      setIsMobile(false)
      return
    }

    try {
      const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
      const onChange = () => {
        try {
          setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
        } catch (error) {
          console.warn('Failed to update mobile state:', error)
        }
      }

      if (mql.addEventListener) {
        mql.addEventListener("change", onChange)
      } else if (mql.addListener) {
        mql.addListener(onChange)
      }

      // Set initial value
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)

      return () => {
        try {
          if (mql.removeEventListener) {
            mql.removeEventListener("change", onChange)
          } else if (mql.removeListener) {
            mql.removeListener(onChange)
          }
        } catch (error) {
          console.warn('Failed to remove media query listener:', error)
        }
      }
    } catch (error) {
      console.warn('Failed to set up media query listener:', error)
      setIsMobile(false)
      return
    }
  }, [])

  return !!isMobile
}
