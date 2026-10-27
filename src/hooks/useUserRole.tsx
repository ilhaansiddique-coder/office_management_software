import { useQuery } from "@tanstack/react-query";
import { localApiFetch } from "@/lib/localApi";
import { useAuth } from "./useAuth";

interface Permission {
  permission_key: string;
  allowed: boolean;
}

export const useUserRole = () => {
  const { user } = useAuth();
  const {
    data: role,
    isLoading: isLoadingRole,
    error,
  } = useQuery({
    queryKey: ["userRole", user?.id],
    queryFn: () => localApiFetch<{ role: string | null }>("/auth/role").then((result) => result.role),
    enabled: !!user?.id,
  });

  const {
    data: adminExists,
    isLoading: isLoadingAdmin,
    error: adminCheckError,
  } = useQuery({
    queryKey: ["has-admin"],
    queryFn: () => localApiFetch<{ exists: boolean }>("/auth/admin-exists").then((result) => result.exists),
    enabled: !!user,
    staleTime: 30000,
  });

  const { data: rolePermissions = [], isLoading: isLoadingPermissions } = useQuery({
    queryKey: ["role-permissions", role],
    queryFn: () => localApiFetch<{ permissions: Permission[] }>("/auth/role-permissions")
      .then((result) => result.permissions),
    enabled: !!user && !!role,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const isStaff = role === "staff";
  const isViewer = role === "viewer";
  const hasPermission = (key: string) =>
    isAdmin || rolePermissions.some((permission) => permission.permission_key === key && permission.allowed);

  return {
    userRole: role,
    isAdmin,
    isManager,
    isStaff,
    isViewer,
    canManageUsers: hasPermission("admin.manage_roles"),
    canManageBusiness: hasPermission("settings.edit_business"),
    canCreateSales: hasPermission("sales.create"),
    canViewReports: hasPermission("reports.view"),
    isReadOnly: isViewer,
    hasPermission,
    isLoading: isLoadingRole || isLoadingPermissions || isLoadingAdmin,
    error: error || adminCheckError,
    needsRecovery: !!user && adminExists === false && !isLoadingAdmin,
  };
};
