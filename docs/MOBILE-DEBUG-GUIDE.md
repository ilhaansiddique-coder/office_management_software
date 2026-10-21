# Mobile Development Debugging Guide

## Current Issue
You're seeing "Something went wrong" errors when accessing the app from mobile via `192.168.0.160:8080` on the following pages:
- Dashboard (Index)
- Sales
- Invoices

## Recent Fixes Applied

### 1. Enhanced Error Boundary Logging ✅
The Error Boundary now logs detailed error information in development mode:
- Error message
- Stack trace
- Component stack
- Current URL
- User agent

### 2. Browser Safety Utilities ✅
Created `src/utils/browserSafety.ts` with safe access to:
- localStorage
- window object
- window dimensions
- Event listeners

### 3. Fixed useIsMobile Hook ✅
Added comprehensive error handling and safety checks for:
- window.matchMedia
- window.innerWidth
- Event listener management

## How to See Error Details on Mobile

### Method 1: Use Remote Debugging (Recommended)

#### For Android (Chrome DevTools):
1. On your computer, open Chrome and go to: `chrome://inspect`
2. On your Android phone:
   - Enable USB debugging in Developer Options
   - Connect phone to computer via USB
   - Open the app in Chrome: `http://192.168.0.160:8080`
3. On your computer, click "inspect" next to your device
4. You'll see the full console output with the error details

#### For iOS (Safari Web Inspector):
1. On iPhone:
   - Settings → Safari → Advanced → Enable "Web Inspector"
2. Connect iPhone to Mac via USB
3. On Mac:
   - Open Safari → Develop → [Your iPhone] → [192.168.0.160:8080]
4. You'll see the full console with error details

### Method 2: Use Eruda (Mobile Console) - Quick Fix

Add this to your `index.html` temporarily for mobile debugging:

```html
<!-- Add before closing </body> tag -->
<script src="https://cdn.jsdelivr.net/npm/eruda"></script>
<script>eruda.init();</script>
```

This adds a floating console button on your mobile device that shows all console logs and errors.

### Method 3: Check Console on Desktop in Mobile View

1. Open the app on your desktop browser: `http://localhost:8080` or `http://192.168.0.160:8080`
2. Open DevTools (F12)
3. Toggle device toolbar (Ctrl+Shift+M or Cmd+Shift+M)
4. Select a mobile device (iPhone, Android)
5. Refresh and check for errors in Console tab

## Common Mobile Errors and Fixes

### Issue 1: localStorage Not Available
**Error:** `localStorage is not defined`
**Cause:** Some mobile browsers or incognito mode blocks localStorage
**Fix:** Already implemented in `src/utils/browserSafety.ts`

### Issue 2: window.matchMedia Fails
**Error:** `window.matchMedia is not a function`
**Cause:** Older mobile browsers or SSR context
**Fix:** Already fixed in `src/hooks/use-mobile.tsx` ✅

### Issue 3: Environment Variables Not Loading
**Error:** `Supabase configuration is missing`
**Cause:** `.env.local` not being read on mobile device
**Fix:** Check that Vite dev server is running with `--host` flag

```bash
# Ensure your package.json has:
"scripts": {
  "dev": "vite --host"
}
```

### Issue 4: Network/CORS Issues
**Error:** `Failed to fetch` or `Network request failed`
**Cause:** Mobile device can't access local network or Supabase
**Fix:**
1. Ensure phone is on same Wi-Fi network
2. Check firewall isn't blocking connections
3. Verify Supabase URL is accessible from mobile

## Testing Checklist

Run these tests on your mobile device:

- [ ] Visit `http://192.168.0.160:8080` (should load login page)
- [ ] Open mobile browser console (use Method 2 above)
- [ ] Check console for errors
- [ ] Try logging in
- [ ] Navigate to Dashboard - check console
- [ ] Navigate to Sales - check console
- [ ] Navigate to Invoices - check console
- [ ] Copy the full error message and stack trace

## Enhanced Error Boundary

The Error Boundary now shows:

**In Development:**
- Full error message
- Complete stack trace
- Component stack trace
- Current URL
- User agent (helps identify browser)

**In Production:**
- User-friendly message
- "Try Again" and "Reload Page" buttons
- No technical details exposed

## Next Steps

1. **Get the Actual Error Message:**
   - Use one of the methods above to see console output
   - Look for the red error messages starting with:
     ```
     ==================== ERROR BOUNDARY CAUGHT ERROR ====================
     ```
   - Copy the full error details

2. **Share Error Details:**
   - Once you have the error message, we can fix the specific issue
   - Common issues are usually:
     - Supabase connection problems
     - Data format mismatches
     - Missing null checks
     - Chart rendering issues

3. **Quick Test:**
   - After getting error details, try visiting just the Login page
   - If login works but Dashboard fails, it's likely a data/API issue
   - If login fails too, it's a configuration/environment issue

## Environment Check

Run this in your mobile browser console to verify environment:

```javascript
console.log('Environment Check:', {
  hasWindow: typeof window !== 'undefined',
  hasLocalStorage: typeof localStorage !== 'undefined',
  hasMatchMedia: typeof window.matchMedia !== 'undefined',
  userAgent: navigator.userAgent,
  screenWidth: window.innerWidth,
  screenHeight: window.innerHeight,
  supabaseURL: import.meta.env.VITE_SUPABASE_URL,
  supabaseKeySet: !!import.meta.env.VITE_SUPABASE_ANON_KEY
});
```

## Contact

Once you have the error details from the console, share them and we can provide a specific fix for your issue.

---

**Status:** Awaiting specific error message from mobile console to provide targeted fix.
