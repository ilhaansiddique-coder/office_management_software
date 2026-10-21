/**
 * Generate a UUID v4 compatible string
 * Falls back to a custom implementation if crypto.randomUUID is not available
 */
export function generateUUID(): string {
    // Try to use native crypto.randomUUID if available
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        try {
            return crypto.randomUUID();
        } catch (e) {
            // Fall through to fallback implementation
        }
    }

    // Fallback implementation for environments without crypto.randomUUID
    // This generates a RFC4122 version 4 compliant UUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
