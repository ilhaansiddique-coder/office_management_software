import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/utils/toast";

export const useStopImport = () => {
  const queryClient = useQueryClient();

  const stopImport = useMutation({
    mutationFn: async (importLogId: string) => {
      const { data, error } = await supabase.functions.invoke('stop-import', {
        body: { importLogId }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["woocommerce-connections"] });
      queryClient.invalidateQueries({ queryKey: ["import-logs"] });
      toast.success("Import stopped successfully");
    },
    onError: (error) => {
      toast.error("Failed to stop import");
      console.error("Error stopping import:", error);
    },
  });

  return {
    stopImport: stopImport.mutate,
    isStopping: stopImport.isPending,
  };
};