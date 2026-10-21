import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/utils/toast";

export const useStopSync = () => {
  const queryClient = useQueryClient();

  const stopSync = useMutation({
    mutationFn: async (syncLogId: string) => {
      const { data, error } = await supabase.functions.invoke('stop-sync', {
        body: { syncLogId }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync-logs"] });
      toast.success("Sync stopped successfully");
    },
    onError: (error) => {
      toast.error("Failed to stop sync");
      console.error("Error stopping sync:", error);
    },
  });

  return {
    stopSync: stopSync.mutate,
    isStopping: stopSync.isPending,
  };
};