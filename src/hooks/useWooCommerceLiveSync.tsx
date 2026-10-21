import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/utils/toast";

export interface SyncSchedule {
  id: string;
  connection_id: string;
  is_active: boolean;
  sync_interval_minutes: number;
  sync_time?: string;
  last_sync_at?: string;
  next_sync_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSyncScheduleData {
  connection_id: string;
  is_active: boolean;
  sync_interval_minutes: number;
  sync_time?: string;
}

export interface SyncLog {
  id: string;
  connection_id: string;
  sync_type: 'manual' | 'scheduled';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  products_updated: number;
  products_created: number;
  products_failed: number;
  error_message?: string;
  started_at: string;
  completed_at?: string;
}

export const useLiveSyncSettings = (connectionId: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: settings,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["sync-settings", connectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("woocommerce_sync_schedules")
        .select("*")
        .eq("connection_id", connectionId)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        throw error;
      }
      return data as SyncSchedule | null;
    },
    enabled: !!user?.id && !!connectionId,
  });

  const createSettings = useMutation({
    mutationFn: async (settingsData: CreateSyncScheduleData) => {
      const { data, error } = await supabase
        .from("woocommerce_sync_schedules")
        .insert(settingsData)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync-settings", connectionId] });
      toast.success("Sync settings created successfully");
    },
    onError: (error) => {
      toast.error("Failed to create sync settings");
      console.error("Error creating sync settings:", error);
    },
  });

  const updateSettings = useMutation({
    mutationFn: async ({ id, ...updateData }: Partial<SyncSchedule> & { id: string }) => {
      const { data, error } = await supabase
        .from("woocommerce_sync_schedules")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync-settings", connectionId] });
      toast.success("Sync settings updated successfully");
    },
    onError: (error) => {
      toast.error("Failed to update sync settings");
      console.error("Error updating sync settings:", error);
    },
  });

  return {
    settings,
    isLoading,
    error,
    createSettings: createSettings.mutate,
    isCreating: createSettings.isPending,
    updateSettings: updateSettings.mutate,
    isUpdating: updateSettings.isPending,
  };
};

export const useSyncLogs = (connectionId?: string) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["sync-logs", connectionId],
    queryFn: async () => {
      let query = supabase
        .from("woocommerce_sync_logs")
        .select("*")
        .order("started_at", { ascending: false });

      if (connectionId) {
        query = query.eq("connection_id", connectionId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as SyncLog[];
    },
    enabled: !!user,
    refetchInterval: (query) => {
      // Refetch every 3 seconds if there are any in-progress syncs
      const hasInProgress = query.state.data?.some(log => log.status === 'in_progress' || log.status === 'pending');
      return hasInProgress ? 3000 : false;
    },
  });
};

export const useManualSync = () => {
  const queryClient = useQueryClient();

  const startSync = useMutation({
    mutationFn: async (connectionId: string) => {
      const { data, error } = await supabase.functions.invoke('woocommerce-sync', {
        body: { connectionId, syncType: 'manual' }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync-logs"] });
      toast.success("Manual sync started successfully");
    },
    onError: (error) => {
      toast.error("Failed to start manual sync");
      console.error("Error starting manual sync:", error);
    },
  });

  return {
    startSync: startSync.mutate,
    isSyncing: startSync.isPending,
  };
};