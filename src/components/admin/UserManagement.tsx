import { useEffect, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/utils/toast";
import { Plus, UserCheck, UserX, Shield, Users, Edit, Trash2, User, ExternalLink, Package, Box } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { defaultPermissionsByRole } from "@/constants/permissions";
import { useUserRole } from "@/hooks/useUserRole";

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: 'admin' | 'manager' | 'sales_associate' | 'store_manager';
  created_at: string;
  last_sign_in_at: string | null;
}

interface UserFormData {
  full_name: string;
  email: string;
  phone: string;
  role: 'admin' | 'manager' | 'sales_associate' | 'store_manager';
  password: string;
}

const roleColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  admin: "destructive",
  manager: "default",
  store_manager: "default",
  sales_associate: "secondary",
  staff: "secondary",
  warehouse: "outline",
};

const roleIcons: Record<string, ComponentType<{ className?: string }>> = {
  admin: Shield,
  manager: Users,
  store_manager: Package,
  sales_associate: Box,
  staff: User,
  warehouse: Box,
};

const initialFormData: UserFormData = {
  full_name: '',
  email: '',
  phone: '',
  role: 'sales_associate',
  password: ''
};

export function UserManagement() {
  const [formData, setFormData] = useState<UserFormData>(initialFormData);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { hasPermission, userRole } = useUserRole();
  const canManageRoles = hasPermission('admin.manage_roles');
  const canManagePermissions = hasPermission('admin.manage_permissions');

  // Role Permission Management state
  const [selectedRole, setSelectedRole] = useState<'manager' | 'sales_associate' | 'store_manager'>('sales_associate');
  const [activeTab, setActiveTab] = useState(
    'general' as 'general' | 'products_inventory' | 'sales_invoices' | 'packaging' | 'customers' | 'reports' | 'settings' | 'administration'
  );
  const [toggles, setToggles] = useState<Record<string, boolean>>({});

  // Permission catalog
  const PERMISSIONS: Record<string, { label: string; key: string; description: string }[]> = {
    general: [
      { key: 'access.dashboard', label: 'Dashboard Access', description: 'Access to the main dashboard overview.' },
      { key: 'access.alerts', label: 'Alerts Access', description: 'View system alerts and notifications.' },
    ],
    products_inventory: [
      { key: 'products.view', label: 'View Products', description: 'View product catalog.' },
      { key: 'inventory.view', label: 'View Inventory', description: 'View stock levels and inventory.' },
      { key: 'products.add', label: 'Add Products', description: 'Create new products.' },
      { key: 'products.edit', label: 'Edit Products', description: 'Modify existing products.' },
      { key: 'products.duplicate', label: 'Duplicate Products', description: 'Duplicate existing products.' },
      { key: 'inventory.adjust_stock', label: 'Adjust Stock', description: 'Make stock adjustments and log changes.' },
      { key: 'products.import_export', label: 'Import/Export Products', description: 'Import or export product data.' },
      { key: 'products.delete', label: 'Delete Products', description: 'Remove products from catalog.' },
    ],
    sales_invoices: [
      { key: 'sales.view', label: 'View Sales', description: 'View sales history and POS page.' },
      { key: 'sales.view_history', label: 'View Sales History', description: 'Access sales review and history mode.' },
      { key: 'invoices.view', label: 'View Invoices', description: 'Access and view invoices.' },
      { key: 'sales.create', label: 'Create Sales (POS)', description: 'Create sales via POS.' },
      { key: 'sales.edit', label: 'Edit Sales', description: 'Modify existing sales.' },
      { key: 'invoices.download_print', label: 'Download/Print Invoices', description: 'Download or print invoice PDFs.' },
      { key: 'invoices.export', label: 'Export Invoices', description: 'Export invoice data.' },
      { key: 'courier.send', label: 'Send to Courier', description: 'Send orders to courier service and view courier status.' },
      { key: 'courier.refresh', label: 'Refresh Courier Status', description: 'Refresh courier status for orders (individual and bulk).' },
      { key: 'sales.delete', label: 'Delete Sales', description: 'Delete or void sales.' },
    ],
    packaging: [
      { key: 'packaging.view', label: 'View Packaging', description: 'Access the packaging queue page.' },
      { key: 'packaging.confirm', label: 'Confirm Packaging', description: 'Mark orders as packaged from the packaging page.' },
      { key: 'packaging.unpack', label: 'Unpack Packaging', description: 'Allow reversing packaged orders back to unpacked from the packaging page.' },
    ],
    customers: [
      { key: 'customers.view', label: 'View Customers', description: 'View customer list and details.' },
      { key: 'customers.view_history', label: 'View Customer History', description: 'View purchase history for customers.' },
      { key: 'customers.add', label: 'Add Customers', description: 'Create new customer profiles.' },
      { key: 'customers.edit', label: 'Edit Customers', description: 'Modify customer details.' },
      { key: 'customers.import_export', label: 'Import/Export Customers', description: 'Import or export customers.' },
      { key: 'customers.delete', label: 'Delete Customers', description: 'Remove customers.' },
    ],
    reports: [
      { key: 'reports.view', label: 'View Reports', description: 'Access reports and analytics.' },
      { key: 'reports.export', label: 'Export Reports', description: 'Export report data.' },
      { key: 'logs.view', label: 'View Activity Logs', description: 'View activity logs for sales, products, and customers.' },
    ],
    settings: [
      { key: 'settings.view_business', label: 'View Business Settings', description: 'View business & system settings.' },
      { key: 'settings.edit_business', label: 'Edit Business Settings', description: 'Edit business & system settings.' },
      { key: 'settings.manage_notifications', label: 'Manage Notifications', description: 'Configure notification preferences.' },
      { key: 'settings.manage_appearance', label: 'Manage Appearance', description: 'Change theme and layout preferences.' },
      { key: 'settings.change_password', label: 'Change Password (Self)', description: 'Change own account password.' },
    ],
    administration: [
      { key: 'admin.manage_roles', label: 'Manage User Roles', description: 'Create and edit user roles.' },
      { key: 'admin.manage_permissions', label: 'Manage User Permissions', description: 'Control role-based permissions.' },
      { key: 'admin.full_backup', label: 'Full Data Backup', description: 'Export full system backup.' },
      { key: 'admin.data_restore', label: 'Data Restore', description: 'Restore data from backup.' },
    ],
  };

  const allKeys = Object.values(PERMISSIONS).flat().map(p => p.key);
  const keysByTab = (tab: keyof typeof PERMISSIONS) => PERMISSIONS[tab].map(p => p.key);

  // Load current permissions for the selected role
  const { data: rolePerms, isLoading: permsLoading } = useQuery({
    queryKey: ["role-permissions-editor", selectedRole],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('role_permissions')
        .select('permission_key, allowed')
        .eq('role', selectedRole);
      if (error) throw error;
      return data as { permission_key: string; allowed: boolean }[];
    },
    staleTime: 0,
  });

  // Sync into local toggle state
  const computeDefaults = () => {
    const base: Record<string, boolean> = {};
    allKeys.forEach(k => (base[k] = false));
    if (!rolePerms || rolePerms.length === 0) {
      const fallbacks = defaultPermissionsByRole[selectedRole] || [];
      fallbacks.forEach((key) => {
        base[key] = true;
      });
    } else {
      rolePerms.forEach(p => {
        base[p.permission_key] = !!p.allowed;
      });
    }
    return base;
  };

  useEffect(() => {
    if (!permsLoading) {
      setToggles(computeDefaults());
    }
  }, [selectedRole, rolePerms, permsLoading]);

  const { data: users, isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      try {
        // First try the RPC function
        const { data, error } = await supabase.rpc('get_all_users_with_roles');

        if (error) {
          console.error('RPC function error:', error);

          // Fallback: direct query approach without relying on FK relationship
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, full_name, phone, created_at');

          if (profilesError) {
            console.error('Direct query error:', profilesError);
            throw new Error(profilesError.message || 'Failed to fetch users');
          }

          const ids = (profilesData || []).map((p: any) => p.id).filter(Boolean);
          let rolesByUser: Record<string, string> = {};

          if (ids.length) {
            const { data: rolesData, error: rolesError } = await supabase
              .from('user_roles')
              .select('user_id, role')
              .in('user_id', ids);
            if (rolesError) {
              console.error('Roles query error:', rolesError);
            } else {
              rolesByUser = (rolesData || []).reduce((acc: any, row: any) => {
                acc[row.user_id] = row.role;
                return acc;
              }, {});
            }
          }

          return (profilesData || []).map((profile: any) => ({
            id: profile.id,
            full_name: profile.full_name || 'N/A',
            email: 'N/A',
            phone: profile.phone,
            role: rolesByUser[profile.id] || 'sales_associate',
            created_at: profile.created_at,
            last_sign_in_at: null
          })) as UserProfile[];
        }

        // Transform the RPC data to match UserProfile interface
        return (data || []).map((user: any) => ({
          id: user.id,
          full_name: user.full_name || 'N/A',
          email: user.email,
          phone: user.phone,
          role: user.role || 'sales_associate',
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at
        })) as UserProfile[];
      } catch (err) {
        console.error('Error fetching users:', err);
        throw new Error(err instanceof Error ? err.message : 'Failed to fetch users');
      }
    },
    staleTime: 30000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
    retry: 2
  });

  const createUserMutation = useMutation({
    mutationFn: async (userData: UserFormData) => {
      console.log('Creating user with data:', { ...userData, password: '***' });
      const refreshed = await supabase.auth.refreshSession();
      let sessionData = refreshed.data;
      let sessionError = refreshed.error;
      if (!sessionData.session?.access_token) {
        const fallback = await supabase.auth.getSession();
        sessionData = fallback.data;
        sessionError = sessionError || fallback.error;
      }
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('Missing auth session. Please sign out and sign in again.');
      }

      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        headers: {
          Authorization: `Bearer ${sessionData.session.access_token}`,
          "x-user-access-token": sessionData.session.access_token,
        },
        body: {
          email: userData.email,
          password: userData.password,
          full_name: userData.full_name,
          phone: userData.phone,
          role: userData.role,
          access_token: sessionData.session.access_token,
        },
      });

      if (error) {
        throw new Error(error.message || 'Edge Function error');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data;
    },
    onSuccess: async () => {
      toast.success("User created successfully!");
      setFormData(initialFormData);
      setIsAddDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      await queryClient.refetchQueries({ queryKey: ["admin-users"] });
    },
    onError: (error: any) => {
      console.error('Create user mutation error:', error);
      toast.error(`Failed to create user: ${error.message}`);
    }
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, ...userData }: { userId: string } & Partial<UserFormData>) => {
      console.log('Updating user:', userId, userData);

      if (userData.password && userData.password.trim().length > 0) {
        console.log('Using Edge Function for password update...');

        try {
          const refreshed = await supabase.auth.refreshSession();
          let sessionData = refreshed.data;
          let sessionError = refreshed.error;
          if (!sessionData.session?.access_token) {
            const fallback = await supabase.auth.getSession();
            sessionData = fallback.data;
            sessionError = sessionError || fallback.error;
          }
          if (sessionError || !sessionData.session?.access_token) {
            throw new Error('Missing auth session. Please sign out and sign in again.');
          }

          const { data, error } = await supabase.functions.invoke('admin-update-user', {
            headers: {
              Authorization: `Bearer ${sessionData.session.access_token}`,
              "x-user-access-token": sessionData.session.access_token,
            },
            body: {
              userId,
              full_name: userData.full_name,
              email: userData.email,
              phone: userData.phone,
              role: userData.role,
              password: userData.password,
              access_token: sessionData.session.access_token,
            }
          });

          if (error) {
            console.error('Edge Function error:', error);
            throw new Error(`Failed via Edge Function: ${error.message}`);
          }

          if (data?.error) {
            console.error('Edge Function returned error:', data.error);
            throw new Error(data.error);
          }

          console.log('User updated successfully via Edge Function');
          return { success: true };
        } catch (edgeFunctionError: any) {
          console.error('Edge Function failed, falling back to direct update (password will not be updated):', edgeFunctionError);
          toast.error('Password update failed. Updating other fields...');
        }
      }

      if (userData.full_name !== undefined || userData.phone !== undefined) {
        const profileData: any = {
          id: userId,
        };
        if (userData.full_name !== undefined) profileData.full_name = userData.full_name;
        if (userData.phone !== undefined) profileData.phone = userData.phone;

        const { data: updatedProfile, error: updateError } = await supabase
          .from('profiles')
          .update(profileData)
          .eq('id', userId)
          .select()
          .maybeSingle();

        if (updateError) {
          console.error('Profile update error:', updateError);
          throw new Error(`Failed to update profile: ${updateError.message}`);
        }

        if (!updatedProfile) {
          const { error: insertError } = await supabase
            .from('profiles')
            .insert(profileData)
            .select()
            .single();

          if (insertError) {
            console.error('Profile insert error:', insertError);
            throw new Error(`Failed to create profile: ${insertError.message}`);
          }
        }
      }

      if (userData.role) {
        console.log('Updating role to:', userData.role);

        const { error: roleError } = await supabase
          .from('user_roles')
          .upsert(
            {
              user_id: userId,
              role: userData.role,
            },
            { onConflict: 'user_id' }
          );

        if (roleError) {
          console.error('Role insert error:', roleError);
          throw new Error(`Failed to update role: ${roleError.message}`);
        }
      }

      return { success: true };
    },
    onSuccess: async () => {
      toast.success("User updated successfully!");
      setEditingUser(null);
      setIsEditDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      await queryClient.refetchQueries({ queryKey: ["admin-users"] });
    },
    onError: (error: any) => {
      console.error('Update user error:', error);
      toast.error(`Failed to update user: ${error.message}`);
    }
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      console.log('Deleting user:', userId);

      const refreshed = await supabase.auth.refreshSession();
      let sessionData = refreshed.data;
      let sessionError = refreshed.error;
      if (!sessionData.session?.access_token) {
        const fallback = await supabase.auth.getSession();
        sessionData = fallback.data;
        sessionError = sessionError || fallback.error;
      }
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('Missing auth session. Please sign out and sign in again.');
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Missing Supabase configuration');
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/admin-delete-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session.access_token}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({ userId, access_token: sessionData.session.access_token })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload?.error || response.statusText || 'Edge Function returned a non-2xx status code';
        throw new Error(`Failed to delete user: ${message}`);
      }

      console.log('User deleted successfully');
      return { success: true, message: 'User deleted completely' };
    },
    onSuccess: async () => {
      toast.success("User deleted successfully!");
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      await queryClient.refetchQueries({ queryKey: ["admin-users"] });
    },
    onError: (error: any) => {
      console.error('Delete user error:', error);
      toast.error(`Failed to delete user: ${error.message}`);
    }
  });

  // Permission save mutation
  const savePermissionsMutation = useMutation({
    mutationFn: async () => {
      console.log('Saving permissions for role:', selectedRole);
      const payload = Object.entries(toggles).map(([permission_key, allowed]) => ({
        role: selectedRole,
        permission_key,
        allowed,
      }));

      // Delete existing permissions for this role first, then insert new ones
      const { error: deleteError } = await supabase
        .from('role_permissions')
        .delete()
        .eq('role', selectedRole);

      if (deleteError) {
        console.error('Delete error:', deleteError);
        throw new Error(`Failed to clear existing permissions: ${deleteError.message}`);
      }

      console.log('Existing permissions cleared');

      // Insert new permissions
      const { error: insertError } = await supabase
        .from('role_permissions')
        .insert(payload);

      if (insertError) {
        console.error('Insert error:', insertError);
        throw new Error(`Failed to save permissions: ${insertError.message}`);
      }

      console.log('Permissions saved successfully');
    },
    onSuccess: async () => {
      toast.success('Permissions updated');

      // ─── FIX: Broadly invalidate ALL role-permission query variants ───────
      // Using partial key ["role-permissions"] matches every cached query that
      // starts with this prefix (e.g. ["role-permissions", "manager"],
      // ["role-permissions", "sales_associate"], ["role-permissions-editor", ...])
      // This guarantees the sidebar's useUserRole hook re-fetches fresh data
      // for whichever role the currently logged-in user has, without needing
      // to know the hook's exact internal query key.
      await queryClient.invalidateQueries({ queryKey: ["role-permissions"] });
      await queryClient.invalidateQueries({ queryKey: ["permissions"] });

      // Force an immediate refetch so the sidebar updates without page refresh
      await queryClient.refetchQueries({ queryKey: ["role-permissions"] });
      // ──────────────────────────────────────────────────────────────────────
    },
    onError: (e: any) => {
      console.error('Save permissions error:', e);
      toast.error(`Failed to save: ${e.message}`);
    }
  });

  // Permission dependencies: if you enable a permission, auto-enable its prerequisites
  const PERMISSION_DEPENDENCIES: Record<string, string[]> = {
    'products.add': ['products.view'],
    'products.edit': ['products.view'],
    'products.duplicate': ['products.view'],
    'products.delete': ['products.view', 'products.edit'],
    'products.import_export': ['products.view'],
    'inventory.adjust_stock': ['inventory.view'],
    'sales.view_history': ['sales.view'],
    'sales.create': ['sales.view', 'products.view'],
    'sales.edit': ['sales.view'],
    'sales.delete': ['sales.view', 'sales.edit'],
    'courier.send': ['sales.view'],
    'courier.refresh': ['sales.view'],
    'packaging.confirm': ['packaging.view'],
    'packaging.unpack': ['packaging.view'],
    'invoices.download_print': ['invoices.view'],
    'invoices.export': ['invoices.view'],
    'customers.add': ['customers.view'],
    'customers.edit': ['customers.view'],
    'customers.delete': ['customers.view', 'customers.edit'],
    'customers.import_export': ['customers.view'],
    'customers.view_history': ['customers.view'],
    'reports.export': ['reports.view'],
    'settings.edit_business': ['settings.view_business'],
  };

  const togglePermission = (key: string) => {
    setToggles(prev => {
      const newValue = !prev[key];
      const updated = { ...prev, [key]: newValue };

      if (newValue && PERMISSION_DEPENDENCIES[key]) {
        PERMISSION_DEPENDENCIES[key].forEach(dep => {
          updated[dep] = true;
        });
      }

      if (!newValue) {
        Object.entries(PERMISSION_DEPENDENCIES).forEach(([perm, deps]) => {
          if (deps.includes(key)) {
            updated[perm] = false;
          }
        });
      }

      return updated;
    });
  };

  const allInTabOn = keysByTab(activeTab as keyof typeof PERMISSIONS).every(k => !!toggles[k]);
  const setAllInTab = (value: boolean) => {
    const next = { ...toggles };
    keysByTab(activeTab as keyof typeof PERMISSIONS).forEach(k => { next[k] = value; });
    setToggles(next);
  };

  const handleCreateUser = () => {
    if (!formData.full_name.trim() || !formData.email.trim() || !formData.password.trim()) {
      toast.error("Please fill in all required fields (name, email, and password)");
      return;
    }
    if (formData.password.length < 6) {
      toast.error("Password must be at least 6 characters long");
      return;
    }
    createUserMutation.mutate(formData);
  };

  const handleEditUser = (user: UserProfile) => {
    setEditingUser(user);
    setFormData({
      full_name: user.full_name,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      password: ''
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateUser = () => {
    if (!editingUser || !formData.full_name.trim() || !formData.email.trim()) {
      toast.error("Please fill in required fields");
      return;
    }

    updateUserMutation.mutate({
      userId: editingUser.id,
      full_name: formData.full_name,
      email: formData.email,
      phone: formData.phone || null,
      role: formData.role
    });
  };

  const handleDeleteUser = (userId: string) => {
    deleteUserMutation.mutate(userId);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>User Management</CardTitle>
            <CardDescription>Create and manage user accounts</CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-full sm:max-w-lg md:max-w-2xl lg:max-w-4xl">
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
                <DialogDescription>
                  Create a new user account with email, password, and role assignment.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="add_full_name">Full Name *</Label>
                  <Input
                    id="add_full_name"
                    placeholder="John Doe"
                    value={formData.full_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="add_email">Email Address *</Label>
                  <Input
                    id="add_email"
                    type="email"
                    placeholder="user@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="add_phone">Phone Number</Label>
                  <Input
                    id="add_phone"
                    placeholder="+1234567890"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="add_password">Password *</Label>
                  <Input
                    id="add_password"
                    type="password"
                    placeholder="Enter password (min 6 characters)"
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    User can change this password after first login
                  </p>
                </div>
                {canManageRoles && (
                  <div>
                    <Label htmlFor="add_role">Role</Label>
                    <Select value={formData.role} onValueChange={(value: 'admin' | 'manager' | 'staff' | 'viewer') => setFormData(prev => ({ ...prev, role: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin - Full access</SelectItem>
                        <SelectItem value="manager">Manager - Business management</SelectItem>
                        <SelectItem value="store_manager">Store Manager - Inventory focus</SelectItem>
                        <SelectItem value="sales_associate">Sales Associate - Sales focus</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button
                  onClick={handleCreateUser}
                  disabled={createUserMutation.isPending}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {createUserMutation.isPending ? "Creating..." : "Create User"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="text-center py-8">
              <p className="text-error mb-2">Error loading users: {error.message}</p>
              <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["admin-users"] })}>
                Retry
              </Button>
            </div>
          )}
          {isLoading ? (
            <div className="text-center py-8">Loading users...</div>
          ) : !users || users.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-2">No users found</p>
              <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["admin-users"] })}>
                Refresh
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map((user) => {
                  const roleKey = String(user.role || "").toLowerCase();
                  const RoleIcon = roleIcons[roleKey] ?? User;
                  const roleVariant = roleColors[roleKey] ?? "secondary";
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.full_name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.phone || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={roleVariant} className="flex items-center gap-1 w-fit">
                          <RoleIcon className="h-3 w-3" />
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {user.last_sign_in_at
                          ? new Date(user.last_sign_in_at).toLocaleDateString()
                          : "Never"
                        }
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/users/${user.id}`} aria-label={`View profile for ${user.full_name}`}>
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditUser(user)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete User</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete {user.full_name}? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteUser(user.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canManagePermissions && (
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>User Role Permission Management</CardTitle>
              <CardDescription>Control which features each role can access</CardDescription>
            </div>
            <div className="w-full sm:w-64">
              <Label className="sr-only">Role</Label>
              <Select value={selectedRole} onValueChange={(v: 'manager' | 'sales_associate' | 'store_manager') => setSelectedRole(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="sales_associate">Sales Associate</SelectItem>
                  <SelectItem value="store_manager">Store Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="space-y-4">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 h-auto p-1 gap-1">
                <TabsTrigger className="text-xs sm:text-sm px-2 py-2 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" value="general">General</TabsTrigger>
                <TabsTrigger className="text-xs sm:text-sm px-2 py-2 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" value="products_inventory">Products & Inventory</TabsTrigger>
                <TabsTrigger className="text-xs sm:text-sm px-2 py-2 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" value="sales_invoices">Sales & Invoices</TabsTrigger>
                <TabsTrigger className="text-xs sm:text-sm px-2 py-2 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" value="packaging">Packaging</TabsTrigger>
                <TabsTrigger className="text-xs sm:text-sm px-2 py-2 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" value="customers">Customers</TabsTrigger>
                <TabsTrigger className="text-xs sm:text-sm px-2 py-2 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" value="reports">Reports & Analytics</TabsTrigger>
                <TabsTrigger className="text-xs sm:text-sm px-2 py-2 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" value="settings">Settings</TabsTrigger>
                <TabsTrigger className="text-xs sm:text-sm px-2 py-2 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" value="administration">Administration</TabsTrigger>
              </TabsList>

              {(['general', 'products_inventory', 'sales_invoices', 'packaging', 'customers', 'reports', 'settings', 'administration'] as const).map((tabKey) => (
                <TabsContent key={tabKey} value={tabKey} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">Select all in this tab</div>
                    <Switch checked={allInTabOn} onCheckedChange={(v) => setAllInTab(!!v)} disabled={permsLoading || savePermissionsMutation.isPending} />
                  </div>
                  <div className="divide-y rounded-md border">
                    {PERMISSIONS[tabKey].map((p) => (
                      <div key={p.key} className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="font-medium cursor-help">{p.label}</div>
                              </TooltipTrigger>
                              <TooltipContent>{p.description}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                        <Switch checked={!!toggles[p.key]} onCheckedChange={() => togglePermission(p.key)} disabled={permsLoading || savePermissionsMutation.isPending} />
                      </div>
                    ))}
                  </div>
                </TabsContent>
              ))}
            </Tabs>

            <div className="flex justify-end">
              <Button onClick={() => savePermissionsMutation.mutate()} disabled={savePermissionsMutation.isPending}>
                {savePermissionsMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-full sm:max-w-lg md:max-w-2xl lg:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information and role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit_full_name">Full Name *</Label>
              <Input
                id="edit_full_name"
                placeholder="John Doe"
                value={formData.full_name}
                onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="edit_email">Email Address *</Label>
              <Input
                id="edit_email"
                type="email"
                placeholder="user@example.com"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="edit_phone">Phone Number</Label>
              <Input
                id="edit_phone"
                placeholder="+1234567890"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="edit_password">New Password (optional)</Label>
              <Input
                id="edit_password"
                type="password"
                placeholder="Leave blank to keep current password"
                value={formData.password}
                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Only fill this if you want to change the user's password
              </p>
            </div>
            {canManageRoles && (
              <div>
                <Label htmlFor="edit_role">Role</Label>
                <Select value={formData.role} onValueChange={(value: 'admin' | 'manager' | 'sales_associate' | 'store_manager') => setFormData(prev => ({ ...prev, role: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin - Full access</SelectItem>
                    <SelectItem value="manager">Manager - Business management</SelectItem>
                    <SelectItem value="sales_associate">Sales Associate - Sales focus</SelectItem>
                    <SelectItem value="store_manager">Store Manager - Inventory focus</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button
              onClick={handleUpdateUser}
              disabled={updateUserMutation.isPending}
              className="w-full"
            >
              <Edit className="h-4 w-4 mr-2" />
              {updateUserMutation.isPending ? "Updating..." : "Update User"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}