import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { promptUpdate } from "@/pwa";

export const usePwaUpdateChannel = () => {
  useEffect(() => {
    const channel = supabase.channel("pwa-updates");

    channel
      .on("broadcast", { event: "refresh" }, ({ payload }) => {
        const message =
          typeof payload?.message === "string"
            ? payload.message
            : "An update is available. Refresh when you're ready.";
        promptUpdate(message);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
};
