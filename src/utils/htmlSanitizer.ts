import DOMPurify from 'dompurify';

/**
 * Escapes HTML special characters to prevent XSS attacks
 * Use this for text content that will be inserted into HTML
 */
export function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';

  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };

  return String(text).replace(/[&<>"']/g, char => map[char]);
}

/**
 * Sanitizes HTML content using DOMPurify
 * Use this when you need to allow some HTML but want to strip malicious code
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return '';

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br', 'p', 'span', 'div'],
    ALLOWED_ATTR: ['class', 'style'],
    KEEP_CONTENT: true,
  });
}

/**
 * Sanitizes HTML for invoice/memo templates
 * More permissive to allow formatting but still secure
 */
export function sanitizeInvoiceHtml(html: string | null | undefined): string {
  if (!html) return '';

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'div', 'span', 'p', 'br', 'strong', 'b', 'i', 'em', 'u',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'img'
    ],
    ALLOWED_ATTR: ['class', 'style', 'src', 'alt', 'width', 'height'],
    KEEP_CONTENT: true,
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * Strips all HTML tags from a string, leaving only text
 * Most secure option - use when no HTML is needed
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return '';

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [],
    KEEP_CONTENT: true,
  });
}
