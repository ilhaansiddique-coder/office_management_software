import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export const usePermissions = () => {
    const { user } = useAuth();

    const { data: permissions = [], isLoading } = useQuery({
        queryKey: ["permissions", user?.id],
        queryFn: async () => {
            if (!user) return [];

            // We need to know the user's role first
            const { data: roleData, error: roleError } = await supabase
                .from("user_roles")
                .select("role")
                .eq("user_id", user.id)
                .single();

            if (roleError || !roleData) return [];

            const role = roleData.role;

            // Admin has all permissions
            if (role === 'admin') return ['*'];

            // Fetch explicit permissions
            const { data: permData, error: permError } = await supabase
                .from("role_permissions")
                .select("permission_key")
                .eq("role", role)
                .eq("allowed", true);

            if (permError) return [];

            return permData.map(p => p.permission_key);
        },
        enabled: !!user,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });

    const hasPermission = (key: string) => {
        if (!permissions) return false;
        if (permissions.includes('*')) return true;
        return permissions.includes(key);
    };

    const hasRole = (role: string) => {
        // This would require fetching role separately or returning it from query
        // For now, simple permission check is enough
        return false;
    }

    return { permissions, hasPermission, isLoading };
};
