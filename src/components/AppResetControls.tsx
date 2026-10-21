import React, { useState } from "react";
import { AlertTriangle, Download, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useDataBackup } from "@/hooks/useDataBackup";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "@/utils/toast";
import { useMutation } from "@tanstack/react-query";

export const AppResetControls = () => {
  const [confirmText, setConfirmText] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { exportData } = useDataBackup();
  const { user } = useAuth();
  const { isAdmin } = useUserRole();

  const resetApp = useMutation({
    mutationFn: async () => {
      try {
        // First create a backup
        toast.loading("Creating backup before reset...", { id: "reset-progress" });
        await exportData.mutateAsync({
          includeTables: [
            'system_settings', 'business_settings', 'payment_methods', 'courier_payment_rules', 'profiles', 'user_roles',
            'products', 'product_attributes', 'product_attribute_values', 'product_variants',
            'customers', 'sales', 'sales_items', 'inventory_logs', 'user_preferences', 'dismissed_alerts'
          ]
        });

        // Then proceed with reset using direct database operations
        toast.loading("Resetting app data...", { id: "reset-progress" });

        console.log("Starting client-side reset...");

        // Get current user's role to ensure they're admin
        const { data: userRole, error: roleError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user?.id)
          .single();

        if (roleError || userRole?.role !== 'admin') {
          throw new Error('Insufficient permissions. Admin role required.');
        }

        // List of tables to reset (in dependency order)
        const tablesToReset = [
          'sales_items',
          'sales',
          'inventory_logs',
          'activity_logs',
          'product_variants',
          'product_attribute_values',
          'product_attributes',
          'reusable_attributes',
          'products',
          'customers',
          'woocommerce_import_logs',
          'woocommerce_connections',
          'dismissed_alerts',
          'user_preferences',
          'courier_webhook_settings',
          'payment_methods',
          'courier_payment_rules',
          'custom_settings'
        ];

        const deletedCounts: Record<string, number> = {};
        let totalDeleted = 0;

        // Delete records from each table
        for (const table of tablesToReset) {
          try {
            const { data: records, error: fetchError } = await supabase
              .from(table)
              .select('id', { count: 'exact' });

            if (fetchError) {
              console.error(`Error fetching ${table}:`, fetchError);
              continue;
            }

            const recordCount = records?.length || 0;

            if (recordCount > 0) {
              const { error: deleteError } = await supabase
                .from(table)
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all except impossible UUID

              if (deleteError) {
                console.error(`Error deleting from ${table}:`, deleteError);
                deletedCounts[table] = 0;
              } else {
                deletedCounts[table] = recordCount;
                totalDeleted += recordCount;
                console.log(`Deleted ${recordCount} records from ${table}`);
              }
            } else {
              deletedCounts[table] = 0;
            }
          } catch (error) {
            console.error(`Error processing table ${table}:`, error);
            deletedCounts[table] = 0;
          }
        }

        // Clean up storage files
        console.log('Starting storage cleanup...');
        let storageFilesDeleted = 0;

        try {
          // Clean up product images bucket
          const { data: productImages, error: listError } = await supabase.storage
            .from('product-images')
            .list('', { limit: 1000, offset: 0 });

          if (listError) {
            console.error('Error listing product images:', listError);
          } else if (productImages && productImages.length > 0) {
            const filePaths = productImages.map(file => file.name);
            const { error: deleteError } = await supabase.storage
              .from('product-images')
              .remove(filePaths);

            if (deleteError) {
              console.error('Error deleting product images:', deleteError);
            } else {
              storageFilesDeleted += productImages.length;
              console.log(`Deleted ${productImages.length} product images from storage`);
            }
          }

          // Add cleanup for other storage buckets if they exist
          // You can add more buckets here as needed

        } catch (error) {
          console.error('Storage cleanup error:', error);
        }

        deletedCounts['storage_files'] = storageFilesDeleted;
        totalDeleted += storageFilesDeleted;

        // Reset business_settings to defaults (keep the structure)
        await supabase
          .from('business_settings')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');

        await supabase
          .from('business_settings')
          .insert({
            business_name: '',
            invoice_prefix: 'INV',
            invoice_count_start: 1,
            invoice_footer_message: '',
            low_stock_alert_quantity: 12,
            created_by: user?.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        // Reset system_settings to defaults
        await supabase
          .from('system_settings')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');

        await supabase
          .from('system_settings')
          .insert({
            currency_symbol: '৳',
            currency_code: 'BDT',
            timezone: 'Asia/Dhaka',
            date_format: 'dd/MM/yyyy',
            time_format: '12h',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        // Reset payment methods to defaults
        await supabase
          .from('payment_methods')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');

        await supabase
          .from('payment_methods')
          .insert([
            { key: 'cash', label: 'Cash', type: 'cash', enabled: true, default_terms: 'immediate', default_paid_behavior: 'full', sort_order: 1 },
            { key: 'bkash', label: 'Bkash', type: 'mobile', enabled: true, default_terms: 'immediate', default_paid_behavior: 'full', sort_order: 2 },
            { key: 'nagad', label: 'Nagad', type: 'mobile', enabled: true, default_terms: 'immediate', default_paid_behavior: 'full', sort_order: 3 },
            { key: 'bank_transfer', label: 'Bank Transfer', type: 'bank', enabled: true, default_terms: 'immediate', default_paid_behavior: 'full', sort_order: 4 },
            { key: 'cod', label: 'COD', type: 'cod', enabled: true, default_terms: 'cod', default_paid_behavior: 'zero', sort_order: 5 },
            { key: 'credit', label: 'Credit', type: 'credit', enabled: true, default_terms: 'credit', default_paid_behavior: 'zero', sort_order: 6 }
          ]);

        // Reset courier payment rules to defaults
        await supabase
          .from('courier_payment_rules')
          .delete()
          .neq('status_key', '___keep___');

        await supabase
          .from('courier_payment_rules')
          .insert([
            { status_key: 'delivered', payment_status: 'paid', amount_paid_behavior: 'cod_collected', amount_due_behavior: 'zero', use_backup: true, restore_inventory: false },
            { status_key: 'cancelled', payment_status: 'cancelled', amount_paid_behavior: 'zero', amount_due_behavior: 'zero', use_backup: false, restore_inventory: true },
            { status_key: 'returned', payment_status: 'cancelled', amount_paid_behavior: 'zero', amount_due_behavior: 'zero', use_backup: false, restore_inventory: true },
            { status_key: 'lost', payment_status: 'cancelled', amount_paid_behavior: 'zero', amount_due_behavior: 'zero', use_backup: false, restore_inventory: false },
            { status_key: 'pending', payment_status: 'pending', amount_paid_behavior: 'restore_backup', amount_due_behavior: 'restore_backup', use_backup: false, restore_inventory: false }
          ]);

        // Ensure admin user has proper profile and role
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user?.id)
          .single();

        if (!existingProfile) {
          await supabase
            .from('profiles')
            .insert({
              user_id: user?.id,
              full_name: 'Admin User',
              email: user?.email || 'admin@example.com',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
        }

        // Ensure admin role exists
        const { data: existingRole } = await supabase
          .from('user_roles')
          .select('*')
          .eq('user_id', user?.id)
          .single();

        if (!existingRole) {
          await supabase
            .from('user_roles')
            .insert({
              user_id: user?.id,
              role: 'admin',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
        }

        // Don't restore default reusable attributes - leave them empty for fresh start

        // Don't restore courier webhook settings - leave them empty for fresh start

        const backupFilename = `backup-before-reset-${new Date().toISOString().split('T')[0]}.json`;

        return {
          success: true,
          message: 'App reset completed successfully',
          totalDeleted,
          tablesReset: Object.keys(deletedCounts).length,
          deletedCounts,
          backupFilename,
          resetTimestamp: new Date().toISOString()
        };
      } catch (error) {
        console.error("Reset mutation error:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      toast.dismiss("reset-progress");
      toast.success(`App reset completed successfully. Backup saved as ${data.backupFilename}`);
      setIsDialogOpen(false);
      setConfirmText("");

      // Refresh the page to show empty state
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    },
    onError: (error) => {
      toast.dismiss("reset-progress");
      toast.error(`Reset failed: ${error.message}`);
      console.error('Reset error:', error);
    },
  });

  const handleReset = () => {
    if (confirmText === "CONFIRM") {
      resetApp.mutate();
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <Card className="border-destructive/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          Reset App
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Permanently delete all data from the app's database and return to a fresh state.
            A backup will be automatically created before the reset.
          </p>
          <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
            <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive font-medium">
              This action is irreversible except by restoring from backup.
            </p>
          </div>
        </div>

        <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full">
              <Trash2 className="h-4 w-4 mr-2" />
              Reset App
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Confirm App Reset
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-4">
                <div className="text-sm space-y-2">
                  <p className="font-semibold">This will permanently delete:</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>All products and inventory</li>
                    <li>All sales records and invoices</li>
                    <li>All customer data</li>
                    <li>All user profiles and settings</li>
                    <li>All logs and import histories</li>
                  </ul>
                </div>

                <div className="bg-muted p-3 rounded-md">
                  <div className="flex items-center gap-2 mb-2">
                    <Download className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Auto-backup</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A complete backup will be automatically downloaded before reset.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmText" className="text-sm font-medium">
                    Type "CONFIRM" to proceed:
                  </Label>
                  <Input
                    id="confirmText"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="Type CONFIRM exactly"
                    className="text-center"
                  />
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmText("")}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={confirmText !== "CONFIRM" || resetApp.isPending}
                onClick={handleReset}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {resetApp.isPending ? "Resetting..." : "Proceed with Reset"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
};
