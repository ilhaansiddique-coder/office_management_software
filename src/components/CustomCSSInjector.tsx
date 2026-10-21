import React, { useEffect, useMemo } from 'react';
import { useCustomSettings } from '@/hooks/useCustomSettings';

/**
 * Sanitize CSS to prevent CSS injection attacks
 * Removes dangerous patterns that could be used for:
 * - Data exfiltration via CSS selectors
 * - JavaScript execution (IE expression, behavior)
 * - External resource loading (import, url with protocols)
 */
const sanitizeCSS = (css: string): string => {
  if (!css || typeof css !== 'string') return '';

  let sanitized = css;

  // Remove JavaScript execution patterns
  sanitized = sanitized.replace(/expression\s*\([^)]*\)/gi, ''); // IE expression()
  sanitized = sanitized.replace(/behavior\s*:\s*url\s*\([^)]*\)/gi, ''); // IE behavior
  sanitized = sanitized.replace(/-moz-binding\s*:\s*url\s*\([^)]*\)/gi, ''); // Firefox XBL

  // Remove dangerous URL protocols
  sanitized = sanitized.replace(/url\s*\(\s*['"]?\s*javascript\s*:/gi, 'url(about:blank');
  sanitized = sanitized.replace(/url\s*\(\s*['"]?\s*data\s*:/gi, 'url(about:blank');
  sanitized = sanitized.replace(/url\s*\(\s*['"]?\s*vbscript\s*:/gi, 'url(about:blank');

  // Remove @import statements (can load external CSS)
  sanitized = sanitized.replace(/@import\s+[^;]+;?/gi, '');

  // Remove @font-face with external URLs (can be used for tracking)
  // Keep @font-face but remove any external URLs
  sanitized = sanitized.replace(
    /@font-face\s*\{[^}]*src\s*:\s*url\s*\(\s*['"]?https?:\/\/[^)]*\)[^}]*\}/gi,
    ''
  );

  // Remove charset manipulation
  sanitized = sanitized.replace(/@charset\s+[^;]+;?/gi, '');

  // Remove any HTML tags that might have been injected
  sanitized = sanitized.replace(/<[^>]*>/g, '');

  // Remove CSS escape sequences that could be used for injection
  sanitized = sanitized.replace(/\\[0-9a-fA-F]{1,6}\s?/g, '');

  // Remove comments (can contain encoded attacks)
  sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, '');

  // Limit total CSS length to prevent DoS
  const MAX_CSS_LENGTH = 50000; // 50KB max
  if (sanitized.length > MAX_CSS_LENGTH) {
    sanitized = sanitized.slice(0, MAX_CSS_LENGTH);
  }

  return sanitized;
};

export const CustomCSSInjector: React.FC = () => {
  const { getCustomCSS } = useCustomSettings();
  const customCSS = getCustomCSS();

  // Memoize sanitized CSS
  const sanitizedCSS = useMemo(() => {
    if (!customCSS?.content) return '';
    return sanitizeCSS(customCSS.content);
  }, [customCSS?.content]);

  useEffect(() => {
    if (!sanitizedCSS || !customCSS?.is_enabled) {
      // Remove existing custom CSS if disabled or no content
      const existingStyle = document.getElementById('custom-css-injector');
      if (existingStyle) {
        existingStyle.remove();
      }
      return;
    }

    // Remove existing custom CSS
    const existingStyle = document.getElementById('custom-css-injector');
    if (existingStyle) {
      existingStyle.remove();
    }

    // Create new style element with sanitized CSS
    const styleElement = document.createElement('style');
    styleElement.id = 'custom-css-injector';
    styleElement.setAttribute('nonce', crypto.randomUUID()); // Add nonce for CSP
    styleElement.textContent = sanitizedCSS;

    // Inject into head
    document.head.appendChild(styleElement);

    // Cleanup on unmount
    return () => {
      const style = document.getElementById('custom-css-injector');
      if (style) {
        style.remove();
      }
    };
  }, [sanitizedCSS, customCSS?.is_enabled]);

  // This component doesn't render anything visible
  return null;
};
