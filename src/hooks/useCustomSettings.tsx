import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "@/utils/toast";

export interface CustomSetting {
  id: string;
  setting_type: 'custom_css' | 'head_snippet' | 'body_snippet';
  content: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export const useCustomSettings = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: customSettings,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["customSettings"],
    queryFn: async () => {
      console.log('Fetching custom settings...');
      try {
        const { data, error } = await supabase
          .from("custom_settings")
          .select("*")
          .order('setting_type');

        if (error) {
          console.error('Error fetching custom settings:', error);
          throw error;
        }
        
        console.log('Custom settings fetched:', data);
        return data as CustomSetting[];
      } catch (err) {
        console.error('Network error fetching custom settings:', err);
        // Try to get from localStorage as fallback
        try {
          const stored = localStorage.getItem('custom_settings_fallback');
          if (stored) {
            console.log('Using fallback custom settings from localStorage');
            return JSON.parse(stored);
          }
        } catch (localErr) {
          console.error('Error reading from localStorage:', localErr);
        }
        // Return empty array as final fallback
        return [];
      }
    },
    retry: 3,
    retryDelay: 1000,
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });

  const updateCustomSetting = useMutation({
    mutationFn: async ({ 
      setting_type, 
      content, 
      is_enabled 
    }: { 
      setting_type: CustomSetting['setting_type']; 
      content: string; 
      is_enabled: boolean;
    }) => {
      console.log('Updating custom setting:', { setting_type, content, is_enabled });
      
      // First try to update existing setting
      const { data: existingData, error: selectError } = await supabase
        .from("custom_settings")
        .select("id")
        .eq("setting_type", setting_type)
        .maybeSingle();

      if (selectError) {
        console.error('Error checking existing setting:', selectError);
        throw selectError;
      }

      if (existingData?.id) {
        // Update existing
        console.log('Updating existing setting:', existingData.id);
        const { data, error } = await supabase
          .from("custom_settings")
          .update({ 
            content, 
            is_enabled,
            updated_at: new Date().toISOString()
          })
          .eq("id", existingData.id)
          .select()
          .single();

        if (error) {
          console.error('Error updating setting:', error);
          throw error;
        }
        console.log('Setting updated successfully:', data);
        return data;
      } else {
        // Create new
        console.log('Creating new setting');
        const { data, error } = await supabase
          .from("custom_settings")
          .insert({ 
            setting_type, 
            content, 
            is_enabled,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) {
          console.error('Error creating setting:', error);
          throw error;
        }
        console.log('Setting created successfully:', data);
        return data;
      }
    },
    onSuccess: (data, variables) => {
      console.log('Setting saved successfully:', data);
      queryClient.invalidateQueries({ queryKey: ["customSettings"] });
      toast.success(`${variables.setting_type.replace('_', ' ')} saved successfully`);
    },
    onError: (error, variables) => {
      console.error('Error updating custom setting:', error);
      toast.error(`Failed to save ${variables.setting_type.replace('_', ' ')}`);
    },
  });

  // Helper functions to get specific settings
  const getCustomCSS = () => {
    return customSettings?.find(s => s.setting_type === 'custom_css');
  };

  const getHeadSnippet = () => {
    return customSettings?.find(s => s.setting_type === 'head_snippet');
  };

  const getBodySnippet = () => {
    return customSettings?.find(s => s.setting_type === 'body_snippet');
  };

  return {
    customSettings: customSettings || [],
    getCustomCSS,
    getHeadSnippet,
    getBodySnippet,
    isLoading,
    error,
    refetch,
    updateCustomSetting: updateCustomSetting.mutateAsync,
    isUpdating: updateCustomSetting.isPending,
  };
};