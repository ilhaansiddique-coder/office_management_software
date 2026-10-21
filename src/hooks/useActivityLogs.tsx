import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface ActivityLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string | null;
  details: Record<string, any> | null;
  created_at: string;
  full_name?: string | null;
  email?: string | null;
}

export interface ActivityLogFilters {
  search?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
  enabled?: boolean;
}

export const useActivityLogs = (filters: ActivityLogFilters) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["activity-logs", filters],
    queryFn: async () => {
      const limit = filters.limit ?? 200;
      let query = supabase
        .from("activity_logs_view")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (filters.action) {
        query = query.eq("action", filters.action);
      }

      if (filters.entityType) {
        query = query.eq("entity_type", filters.entityType);
      }

      if (filters.entityId) {
        query = query.eq("entity_id", filters.entityId);
      }

      if (filters.search) {
        // Sanitize search term to prevent query manipulation
        // Remove special characters that could alter the filter structure
        // Allow only alphanumeric, spaces, and common punctuation
        const sanitizedSearch = filters.search.replace(/[^a-zA-Z0-9\s\-@.]/g, '');

        if (sanitizedSearch.trim()) {
          // Escape special ILIKE wildcards that user might have entered
          const escapedSearch = sanitizedSearch.replace(/%/g, '\\%').replace(/_/g, '\\_');
          const term = `%${escapedSearch}%`;

          // Use Supabase's .or() with multiple ilike conditions
          // Note: Supabase internally parameterizes these values
          query = query.or(`summary.ilike.${term},full_name.ilike.${term},email.ilike.${term},entity_type.ilike.${term}`);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ActivityLog[];
    },
    enabled: !!user && (filters.enabled ?? true),
    staleTime: 1000 * 30,
  });
};
