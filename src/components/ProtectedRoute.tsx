import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Loader2 } from "lucide-react";
import { AdminRecovery } from "./AdminRecovery";
import { useRef } from "react";
import { toast } from "@/utils/toast";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: string;
  fallbackPath?: string;
}

export const ProtectedRoute = ({
  children,
  requiredPermission,
  fallbackPath
}: ProtectedRouteProps) => {
  const { user, loading } = useAuth();
  const { needsRecovery, isLoading: roleLoading, hasPermission, isAdmin } = useUserRole();
  const location = useLocation();
  const hasShownInitialRedirect = useRef(false);

  const routeOrder: Array<{ path: string; permission?: string }> = [
    { path: "/", permission: "access.dashboard" },
    { path: "/products", permission: "products.view" },
    { path: "/sales", permission: "sales.view" },
    { path: "/packaging", permission: "packaging.view" },
    { path: "/customers", permission: "customers.view" },
    { path: "/reports", permission: "reports.view" },
    { path: "/invoices", permission: "invoices.view" },
    { path: "/alerts", permission: "access.alerts" },
    { path: "/settings", permission: "settings.view_business" },
    { path: "/admin", permission: "admin.manage_roles" },
  ];

  const getFallbackPath = () => {
    if (isAdmin) {
      return "/";
    }

    const match = routeOrder.find((route) => {
      if (!route.permission) return true;
      return hasPermission(route.permission);
    });

    return match?.path || "/auth";
  };

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Only show recovery screen if user has NO role at all
  if (needsRecovery) {
    return <AdminRecovery />;
  }

  // Check permission if required
  if (requiredPermission && !hasPermission(requiredPermission)) {
    const fallback = fallbackPath ?? getFallbackPath();

    // Don't show toast if this is the initial redirect from dashboard after login
    // (user landing on "/" without dashboard access should silently redirect)
    const isInitialDashboardRedirect = location.pathname === "/" && !hasShownInitialRedirect.current;

    if (!isInitialDashboardRedirect) {
      // Show toast only for explicit navigation to restricted pages
      setTimeout(() => {
        toast.error("You don't have permission to access this page");
      }, 100);
    }

    // Mark that we've handled the initial redirect
    hasShownInitialRedirect.current = true;

    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
};
