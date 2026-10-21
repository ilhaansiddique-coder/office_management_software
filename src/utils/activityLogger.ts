import { supabase } from "@/integrations/supabase/client";

export interface ActivityLogPayload {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  details?: Record<string, any> | null;
}

const DUPLICATE_WINDOW_MS = 5 * 1000;
const recentLogCache = new Map<string, number>();

const canonicalizeDetails = (details: Record<string, any> | null | undefined) => {
  if (!details) return "";
  const sorted: Record<string, any> = {};
  Object.keys(details)
    .sort()
    .forEach((key) => {
      sorted[key] = details[key];
    });
  return JSON.stringify(sorted);
};

const buildLogKey = (payload: ActivityLogPayload, userId: string | null) => {
  return [
    userId ?? "anonymous",
    payload.action,
    payload.entityType,
    payload.entityId ?? "null",
    payload.summary ?? "null",
    canonicalizeDetails(payload.details),
  ].join("|");
};

export const logActivity = async (payload: ActivityLogPayload): Promise<boolean> => {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData?.session?.user?.id ?? null;
    const key = buildLogKey(payload, userId);
    const now = Date.now();
    const lastLogged = recentLogCache.get(key);
    if (lastLogged && now - lastLogged < DUPLICATE_WINDOW_MS) {
      return true;
    }

    recentLogCache.set(key, now);
    setTimeout(() => {
      const timestamp = recentLogCache.get(key);
      if (timestamp === now) {
        recentLogCache.delete(key);
      }
    }, DUPLICATE_WINDOW_MS);

    const { error } = await supabase.from("activity_logs").insert({
      user_id: userId,
      action: payload.action,
      entity_type: payload.entityType,
      entity_id: payload.entityId ?? null,
      summary: payload.summary ?? null,
      details: payload.details ?? null,
    });

    if (error) {
      console.warn("Activity log insert failed:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Activity log insert failed:", err);
    return false;
  }
};
