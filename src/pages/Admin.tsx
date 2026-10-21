import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Navigate, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserManagement } from "@/components/admin/UserManagement";
import { BusinessAnalytics } from "@/components/admin/BusinessAnalytics";
import { SystemSettings } from "@/components/admin/SystemSettings";
import { ActivityLogs } from "@/components/admin/ActivityLogs";
import Trash from "@/pages/Trash";
import { Users, BarChart3, Shield, Database, Trash2, ScrollText } from "lucide-react";
import { Loader2 } from "lucide-react";
import { DismissibleAlert } from "@/components/DismissibleAlert";
import { useMockDataContext } from "@/contexts/MockDataContext";

export default function Admin() {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading, hasPermission } = useUserRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const { getMockDataStatus } = useMockDataContext();

  // Check admin permissions
  const canManageRoles = hasPermission('admin.manage_roles');
  const canManagePermissions = hasPermission('admin.manage_permissions');

  const canAccessBackup = hasPermission('admin.full_backup') || hasPermission('admin.data_restore');
  const canAccessTrash = hasPermission("products.delete") || hasPermission("sales.delete") || hasPermission("customers.delete");
  const canViewLogs = hasPermission('logs.view');

  // Users tab requires either manage_roles OR manage_permissions
  const canAccessUsers = canManageRoles || canManagePermissions;

  // Determine default tab
  const defaultTab = useMemo(() => {
    return 'analytics';
  }, []);

  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || defaultTab);

  // Update active tab if it becomes inaccessible
  useEffect(() => {
    if (activeTab === 'users' && !canAccessUsers) {
      setActiveTab(defaultTab);
    } else if (activeTab === 'system' && !canAccessBackup) {
      setActiveTab(defaultTab);
    } else if (activeTab === 'trash' && !canAccessTrash) {
      setActiveTab(defaultTab);
    } else if (activeTab === 'logs' && !canViewLogs) {
      setActiveTab(defaultTab);
    }
  }, [activeTab, canAccessUsers, canAccessBackup, canAccessTrash, canViewLogs, defaultTab]);

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Check if user has any admin permission
  const hasAnyAdminPermission = canAccessUsers || canAccessBackup || canAccessTrash || canViewLogs;

  if (!user || !hasAnyAdminPermission) {
    return <Navigate to="/" replace />;
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value });
  };

  return (
    <div className="min-h-screen bg-transparent">
      <div className="container mx-auto p-0">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <p className="text-muted-foreground">Manage users, monitor business performance, and configure system settings</p>
          </div>
        </div>

        {getMockDataStatus().isEnabled && (
          <DismissibleAlert
            type="warning"
            title="⚠️ Mock Data Mode Active"
            description={`${getMockDataStatus().percentage}% Demo Data - All financial metrics are scaled. Real data in database is unchanged.`}
            className="mb-6"
          />
        )}

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="flex flex-wrap w-full h-auto p-1 gap-1">
            <TabsTrigger value="analytics" className="flex items-center gap-2 flex-1">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            {canViewLogs && (
              <TabsTrigger value="logs" className="flex items-center gap-2 flex-1">
                <ScrollText className="h-4 w-4" />
                Activity Logs
              </TabsTrigger>
            )}
            {canAccessUsers && (
              <TabsTrigger value="users" className="flex items-center gap-2 flex-1">
                <Users className="h-4 w-4" />
                Users
              </TabsTrigger>
            )}
            {canAccessBackup && (
              <TabsTrigger value="system" className="flex items-center gap-2 flex-1">
                <Database className="h-4 w-4" />
                System
              </TabsTrigger>
            )}
            {canAccessTrash && (
              <TabsTrigger value="trash" className="flex items-center gap-2 flex-1">
                <Trash2 className="h-4 w-4" />
                Trash
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="analytics">
            <BusinessAnalytics />
          </TabsContent>

          {canViewLogs && (
            <TabsContent value="logs">
              <ActivityLogs />
            </TabsContent>
          )}

          {canAccessUsers && (
            <TabsContent value="users">
              <UserManagement />
            </TabsContent>
          )}

          {canAccessBackup && (
            <TabsContent value="system">
              <SystemSettings />
            </TabsContent>
          )}

          {canAccessTrash && (
            <TabsContent value="trash">
              <Trash />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
