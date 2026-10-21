import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { defaultPermissionsByRole } from "@/constants/permissions";
import { useEffect } from "react";

export const useUserRole = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const {
    data: userRole,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["userRole", user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error("No user found");
      
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const {
    data: adminExists,
    isLoading: isLoadingAdmin,
    error: adminCheckError,
  } = useQuery({
    queryKey: ["has-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_admin");
      if (error) throw error;
      return !!data;
    },
    enabled: !!user,
    staleTime: 30000,
  });

  // Fetch role-based permissions for the current user's role
  const { data: rolePermissions, isLoading: isLoadingPermissions } = useQuery({
    queryKey: ["role-permissions", userRole?.role],
    queryFn: async () => {
      if (!userRole?.role) return [] as { permission_key: string; allowed: boolean }[];
      const { data, error } = await supabase
        .from("role_permissions")
        .select("permission_key, allowed")
        .eq("role", userRole.role);
      if (error) throw error;
      return data as { permission_key: string; allowed: boolean }[];
    },
    enabled: !!userRole?.role,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  useEffect(() => {
    if (!userRole?.role) return;
    const channel = supabase
      .channel(`role-permissions-${userRole.role}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "role_permissions", filter: `role=eq.${userRole.role}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["role-permissions", userRole.role] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, userRole?.role]);

  const isAdmin = userRole?.role === 'admin';
  const isManager = userRole?.role === 'manager';
  const isStaff = userRole?.role === 'staff';
  const isViewer = userRole?.role === 'viewer';

  // Permission checker: admins bypass checks, others use dynamic permissions
  const hasPermission = (key: string) => {
    if (isAdmin) return true;
    if (!rolePermissions || rolePermissions.length === 0) {
      return false;
    }
    return !!rolePermissions?.some(p => p.permission_key === key && p.allowed === true);
  };

  // Permission helpers using dynamic permissions
  const canManageUsers = hasPermission('admin.manage_roles');
  const canManageBusiness = hasPermission('settings.edit_business');
  const canCreateSales = hasPermission('sales.create');
  const canViewReports = hasPermission('reports.view');
  const isReadOnly = userRole?.role === 'viewer';

  return {
    userRole: userRole?.role,
    isAdmin,
    isManager,
    isStaff,
    isViewer,
    canManageUsers,
    canManageBusiness,
    canCreateSales,
    canViewReports,
    isReadOnly,
    hasPermission,
    isLoading: isLoading || isLoadingPermissions || isLoadingAdmin,
    error: error || adminCheckError,
    needsRecovery: !!user && adminExists === false && !isLoadingAdmin,
  };
};
