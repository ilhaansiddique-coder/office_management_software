import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/utils/toast";
import { getCurrencySymbol } from "@/lib/currencySymbols";

export interface SystemSettings {
  id: string;
  currency_symbol: string;
  currency_code: string;
  timezone: string;
  date_format: string;
  time_format: string;
  invoice_webhook_url?: string;
  invoice_webhook_enabled?: boolean;
  invoice_webhook_auth_token?: string;
  invoice_webhook_timeout?: number;
  mock_data_enabled?: boolean;
  mock_data_scale?: number;
  created_at: string;
  updated_at: string;
}

export const SYSTEM_SETTINGS_QUERY_KEY = ["systemSettings"] as const;
export const SYSTEM_SETTINGS_SYNC_CHANNEL = "system-settings-sync";
export const SYSTEM_SETTINGS_SYNC_EVENT = "changed";
const MOCK_SETTINGS_COLUMN_SUPPORT_STORAGE_KEY = "system_settings.mock_columns.support";

const DEFAULT_SYSTEM_SETTINGS: Omit<SystemSettings, 'id' | 'created_at' | 'updated_at'> = {
  currency_symbol: '৳',
  currency_code: 'BDT',
  timezone: 'Asia/Dhaka',
  date_format: 'dd/MM/yyyy',
  time_format: '12h'
};

type MockSettingsColumnSupport = "unknown" | "supported" | "unsupported";

export const getStoredMockSettings = () => {
  if (typeof window === "undefined") {
    return {
      enabled: false,
      scale: 0.1,
    };
  }

  const storedEnabled = localStorage.getItem("mock_data_enabled");
  const storedScale = parseFloat(localStorage.getItem("mock_data_scale") || "0.1");

  return {
    enabled: storedEnabled === null ? false : storedEnabled === "true",
    scale: Number.isFinite(storedScale) ? storedScale : 0.1,
  };
};

export const persistMockSettings = (settings?: Partial<SystemSettings> | null) => {
  if (typeof window === "undefined") return;

  localStorage.setItem("mock_data_enabled", String(settings?.mock_data_enabled ?? false));
  localStorage.setItem("mock_data_scale", String(settings?.mock_data_scale ?? 0.1));
};

const getStoredMockSettingsColumnSupport = (): MockSettingsColumnSupport => {
  if (typeof window === "undefined") return "unknown";
  const stored = localStorage.getItem(MOCK_SETTINGS_COLUMN_SUPPORT_STORAGE_KEY);
  return stored === "supported" || stored === "unsupported" ? stored : "unknown";
};

const persistMockSettingsColumnSupport = (value: Exclude<MockSettingsColumnSupport, "unknown">) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(MOCK_SETTINGS_COLUMN_SUPPORT_STORAGE_KEY, value);
};

const hasMockSettingsColumns = (settings?: Partial<SystemSettings> | null) => {
  if (!settings) return false;
  return (
    Object.prototype.hasOwnProperty.call(settings, "mock_data_enabled") ||
    Object.prototype.hasOwnProperty.call(settings, "mock_data_scale")
  );
};

const mergeStoredMockSettings = (settings?: Partial<SystemSettings> | null): Partial<SystemSettings> => {
  const stored = getStoredMockSettings();
  const hasColumns = hasMockSettingsColumns(settings);

  return {
    ...(settings || {}),
    mock_data_enabled: hasColumns ? settings?.mock_data_enabled : stored.enabled,
    mock_data_scale: hasColumns ? settings?.mock_data_scale : stored.scale,
  };
};

const isMissingMockSettingsColumnError = (error: unknown) => {
  const message = String((error as { message?: string; details?: string; hint?: string })?.message || "");
  const details = String((error as { message?: string; details?: string; hint?: string })?.details || "");
  const hint = String((error as { message?: string; details?: string; hint?: string })?.hint || "");
  const haystack = `${message} ${details} ${hint}`.toLowerCase();

  return haystack.includes("mock_data_enabled") || haystack.includes("mock_data_scale");
};

export const normalizeSystemSettings = (
  settings?: Partial<SystemSettings> | null,
): SystemSettings => {
  const currencyCode = settings?.currency_code || DEFAULT_SYSTEM_SETTINGS.currency_code;

  return {
    ...DEFAULT_SYSTEM_SETTINGS,
    id: '',
    created_at: '',
    updated_at: '',
    ...settings,
    currency_code: currencyCode,
    currency_symbol: settings?.currency_symbol || getCurrencySymbol(currencyCode),
    mock_data_enabled: settings?.mock_data_enabled ?? false,
    mock_data_scale: settings?.mock_data_scale ?? 0.1,
  };
};

export const invalidateSystemSettingsQueries = (queryClient: QueryClient) => {
  void queryClient.invalidateQueries({ queryKey: SYSTEM_SETTINGS_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  void queryClient.invalidateQueries({ queryKey: ["sales"] });
  void queryClient.invalidateQueries({ queryKey: ["sales-items"] });
  void queryClient.invalidateQueries({ queryKey: ["salesItems"] });
  void queryClient.invalidateQueries({ queryKey: ["business-analytics"] });
  void queryClient.invalidateQueries({ queryKey: ["reports"] });
  void queryClient.invalidateQueries({ queryKey: ["customers"] });
  void queryClient.invalidateQueries({ queryKey: ["customer-due-invoices"] });
  void queryClient.invalidateQueries({ queryKey: ["customer-payment-history"] });
  void queryClient.invalidateQueries({ queryKey: ["customer-credit"] });
  void queryClient.invalidateQueries({ queryKey: ["overdue-credit"] });
};

const broadcastSystemSettingsChange = async (settings: SystemSettings) => {
  const channel = supabase.channel(SYSTEM_SETTINGS_SYNC_CHANNEL);
  let sent = false;

  channel.subscribe(async (status) => {
    if (status !== "SUBSCRIBED" || sent) return;
    sent = true;

    try {
      await channel.send({
        type: "broadcast",
        event: SYSTEM_SETTINGS_SYNC_EVENT,
        payload: { settings },
      });
    } finally {
      supabase.removeChannel(channel);
    }
  });
};

export const useSystemSettings = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const storedColumnSupport = getStoredMockSettingsColumnSupport();

  const {
    data: systemSettings,
    isLoading,
    error,
  } = useQuery({
    queryKey: SYSTEM_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("*")
        .limit(1);

      if (error) {
        throw error;
      }
      
      const dbSettings = (data?.[0] as SystemSettings | undefined) || null;

      if (dbSettings) {
        if (hasMockSettingsColumns(dbSettings)) {
          persistMockSettingsColumnSupport("supported");
        }

        const normalizedSettings = normalizeSystemSettings(mergeStoredMockSettings(dbSettings));
        persistMockSettings(normalizedSettings);
        return normalizedSettings;
      }

      const storedMockSettings = getStoredMockSettings();
      return normalizeSystemSettings({
        mock_data_enabled: storedMockSettings.enabled,
        mock_data_scale: storedMockSettings.scale,
      });
    },
    enabled: !!user,
  });

  const updateSystemSettings = useMutation({
    mutationFn: async (updatedData: Partial<SystemSettings>) => {
      const nextData = { ...updatedData };
      const { mock_data_enabled, mock_data_scale, ...databaseSettings } = nextData;

      if (nextData.mock_data_enabled !== undefined || nextData.mock_data_scale !== undefined) {
        persistMockSettings({
          mock_data_enabled: nextData.mock_data_enabled,
          mock_data_scale: nextData.mock_data_scale,
        });
      }

      console.log("Updating system settings with data:", nextData);
      
      // Auto-generate currency symbol if currency code is being updated
      if (nextData.currency_code) {
        nextData.currency_symbol = getCurrencySymbol(nextData.currency_code);
      }

      // First try to update existing settings
      const { data: existingData, error: checkError } = await supabase
        .from("system_settings")
        .select("id")
        .limit(1);

      if (checkError) {
        console.error("Error checking existing settings:", checkError);
        throw checkError;
      }

      if (existingData?.[0]?.id) {
        console.log("Updating existing settings with ID:", existingData[0].id);
        const runUpdate = async (payload: Partial<SystemSettings>) =>
          await supabase
            .from("system_settings")
            .update(payload)
            .eq("id", existingData[0].id)
            .select()
            .single();

        const shouldTryMockColumns = storedColumnSupport !== "unsupported";
        let { data, error } = shouldTryMockColumns
          ? await runUpdate(nextData)
          : await runUpdate(databaseSettings);

        if (error && shouldTryMockColumns && isMissingMockSettingsColumnError(error)) {
          persistMockSettingsColumnSupport("unsupported");
          ({ data, error } = await runUpdate(databaseSettings));
        } else if (!error && shouldTryMockColumns) {
          persistMockSettingsColumnSupport("supported");
        }

        if (error) {
          console.error("Error updating system settings:", error);
          throw error;
        }
        console.log("Successfully updated system settings:", data);
        return data;
      } else {
        console.log("Creating new system settings");
        // Create new with auto-generated currency symbol
        const newSettings = { 
          ...DEFAULT_SYSTEM_SETTINGS, 
          ...databaseSettings,
          currency_symbol: getCurrencySymbol(nextData.currency_code || DEFAULT_SYSTEM_SETTINGS.currency_code)
        };
        
        console.log("New settings to insert:", newSettings);
        
        const runInsert = async (payload: Partial<SystemSettings>) =>
          await supabase
            .from("system_settings")
            .insert(payload)
            .select()
            .single();

        const shouldTryMockColumns = storedColumnSupport !== "unsupported";
        let { data, error } = shouldTryMockColumns
          ? await runInsert({ ...newSettings, mock_data_enabled, mock_data_scale })
          : await runInsert(newSettings);

        if (error && shouldTryMockColumns && isMissingMockSettingsColumnError(error)) {
          persistMockSettingsColumnSupport("unsupported");
          ({ data, error } = await runInsert(newSettings));
        } else if (!error && shouldTryMockColumns) {
          persistMockSettingsColumnSupport("supported");
        }

        if (error) {
          console.error("Error creating system settings:", error);
          throw error;
        }
        console.log("Successfully created system settings:", data);
        return data;
      }
    },
    onSuccess: (data) => {
      const normalizedSettings = normalizeSystemSettings(mergeStoredMockSettings(data));
      persistMockSettings(normalizedSettings);
      queryClient.setQueryData(SYSTEM_SETTINGS_QUERY_KEY, normalizedSettings);
      invalidateSystemSettingsQueries(queryClient);
      void broadcastSystemSettingsChange(normalizedSettings);
      toast.success("System settings updated successfully");
    },
    onError: (error) => {
      toast.error("Failed to update system settings");
      console.error("Error updating system settings:", error);
    },
  });

  return {
    systemSettings: systemSettings || normalizeSystemSettings(),
    isLoading,
    error,
    updateSystemSettings: updateSystemSettings.mutate,
    isUpdating: updateSystemSettings.isPending,
  };
};
