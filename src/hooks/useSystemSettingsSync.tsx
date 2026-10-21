import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/utils/toast";
import { useAuth } from "./useAuth";
import {
  getStoredMockSettings,
  invalidateSystemSettingsQueries,
  normalizeSystemSettings,
  persistMockSettings,
  SYSTEM_SETTINGS_QUERY_KEY,
  SYSTEM_SETTINGS_SYNC_CHANNEL,
  SYSTEM_SETTINGS_SYNC_EVENT,
  SystemSettings,
} from "./useSystemSettings";

const hasMockSettingsColumns = (settings?: Partial<SystemSettings> | null) => {
  if (!settings) return false;
  return (
    Object.prototype.hasOwnProperty.call(settings, "mock_data_enabled") ||
    Object.prototype.hasOwnProperty.call(settings, "mock_data_scale")
  );
};

const mergeStoredMockSettings = (settings?: Partial<SystemSettings> | null) => {
  const stored = getStoredMockSettings();
  const hasColumns = hasMockSettingsColumns(settings);

  return {
    ...(settings || {}),
    mock_data_enabled: hasColumns ? settings?.mock_data_enabled : stored.enabled,
    mock_data_scale: hasColumns ? settings?.mock_data_scale : stored.scale,
  };
};

const getSettingsChangeKey = (settings: SystemSettings) =>
  [
    settings.id || "default",
    settings.updated_at || "",
    settings.mock_data_enabled ? "1" : "0",
    settings.mock_data_scale ?? "",
    settings.timezone || "",
  ].join(":");

export const useSystemSettingsSync = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const lastAppliedChangeRef = useRef("");

  useEffect(() => {
    if (!user) return;

    const applyIncomingSettings = (
      incoming: Partial<SystemSettings> | null | undefined,
      announceMockChange: boolean,
    ) => {
      const nextSettings = normalizeSystemSettings(mergeStoredMockSettings(incoming));
      const nextKey = getSettingsChangeKey(nextSettings);

      if (lastAppliedChangeRef.current === nextKey) {
        return;
      }

      const previousSettings =
        queryClient.getQueryData<SystemSettings>(SYSTEM_SETTINGS_QUERY_KEY);
      lastAppliedChangeRef.current = nextKey;

      queryClient.setQueryData(SYSTEM_SETTINGS_QUERY_KEY, nextSettings);
      invalidateSystemSettingsQueries(queryClient);

      const mockChanged =
        !!previousSettings &&
        (previousSettings.mock_data_enabled !== nextSettings.mock_data_enabled ||
          previousSettings.mock_data_scale !== nextSettings.mock_data_scale);

      if (mockChanged) {
        persistMockSettings(nextSettings);
      }

      if (announceMockChange && mockChanged) {
        if (nextSettings.mock_data_enabled) {
          toast.info(
            `Mock mode enabled at ${Math.round((nextSettings.mock_data_scale ?? 0.1) * 100)}% by an admin.`,
            { duration: 4000 },
          );
        } else {
          toast.info("Mock mode disabled by an admin.", { duration: 4000 });
        }
      }
    };

    const channel = supabase
      .channel(SYSTEM_SETTINGS_SYNC_CHANNEL)
      .on("broadcast", { event: SYSTEM_SETTINGS_SYNC_EVENT }, ({ payload }) => {
        if (payload?.settings) {
          applyIncomingSettings(payload.settings as Partial<SystemSettings>, true);
          return;
        }

        invalidateSystemSettingsQueries(queryClient);
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "system_settings" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            applyIncomingSettings(null, false);
            return;
          }

          applyIncomingSettings(payload.new as Partial<SystemSettings>, false);
        },
      )
      .subscribe();

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      invalidateSystemSettingsQueries(queryClient);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [queryClient, user]);
};
