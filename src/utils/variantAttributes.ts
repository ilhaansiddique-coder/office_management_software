export type VariantAttributes = Record<string, string>;

function toStringRecord(obj: Record<string, unknown>): VariantAttributes {
  const out: VariantAttributes = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    out[key] = String(value);
  }
  return out;
}

/**
 * Parse variant attributes that may come back from the database as:
 * - a proper object
 * - a JSON string (sometimes double-encoded)
 * - null/undefined
 */
export function parseVariantAttributes(input: unknown): VariantAttributes {
  if (!input) return {};

  if (typeof input === "object" && !Array.isArray(input)) {
    return toStringRecord(input as Record<string, unknown>);
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return {};

    // First parse attempt
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed && !Array.isArray(parsed)) {
        return toStringRecord(parsed as Record<string, unknown>);
      }

      // Handle double-encoded JSON strings
      if (typeof parsed === "string") {
        const reparsed = JSON.parse(parsed);
        if (typeof reparsed === "object" && reparsed && !Array.isArray(reparsed)) {
          return toStringRecord(reparsed as Record<string, unknown>);
        }
      }
    } catch {
      // fall through to empty
    }
  }

  return {};
}

