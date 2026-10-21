import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useFirstTimeSetup = () => {
  // Temporarily bypass first-time setup check to use existing database users
  const { data: isFirstTime, isLoading, error } = useQuery({
    queryKey: ["firstTimeSetup"],
    queryFn: async () => {
      // Force return false to skip first-time setup
      // This allows the app to use existing users from the database
      return false;
      
      // Original logic commented out:
      /*
      try {
        // Check if any admin users exist
        const { data: adminUsers, error: adminError } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'admin')
          .limit(1);

        if (adminError) {
          // If there's an error, it might mean the table doesn't exist yet
          // This would indicate first time setup
          return true;
        }

        // If no admin users found, it's first time setup
        return !adminUsers || adminUsers.length === 0;
      } catch (error) {
        console.error('Error checking first time setup:', error);
        // If there's any error, assume it's first time setup
        return true;
      }
      */
    },
    staleTime: 30000, // Cache for 30 seconds
    retry: 2,
  });

  return {
    isFirstTime: false, // Always return false to skip first-time setup
    isLoading: false,   // No loading needed
    error: null,        // No error
  };
};
