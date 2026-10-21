import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Download, Upload, Database, AlertTriangle } from "lucide-react";
import { useDataBackup } from "@/hooks/useDataBackup";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "@/utils/toast";

const AVAILABLE_TABLES = [
  { id: 'system_settings', name: 'System Settings', critical: true },
  { id: 'business_settings', name: 'Business Settings', critical: true },
  { id: 'payment_methods', name: 'Payment Methods', critical: true },
  { id: 'courier_payment_rules', name: 'Courier Payment Rules', critical: true },
  { id: 'user_roles', name: 'User Roles', critical: true },
  { id: 'profiles', name: 'User Profiles', critical: true },
  { id: 'products', name: 'Products', critical: false },
  { id: 'product_variants', name: 'Product Variants', critical: false },
  { id: 'product_attributes', name: 'Product Attributes', critical: false },
  { id: 'product_attribute_values', name: 'Product Attribute Values', critical: false },
  { id: 'customers', name: 'Customers', critical: false },
  { id: 'sales', name: 'Sales', critical: false },
  { id: 'sale_payments', name: 'Sale Payments', critical: false },
  { id: 'sales_items', name: 'Sale Items', critical: false },
  { id: 'inventory_logs', name: 'Inventory Logs', critical: false },
  { id: 'activity_logs', name: 'Activity Logs', critical: false },
  { id: 'user_preferences', name: 'User Preferences', critical: false },
  { id: 'dismissed_alerts', name: 'Dismissed Alerts', critical: false },
  { id: 'courier_webhook_settings', name: 'Courier Webhook Settings', critical: false },
  { id: 'custom_settings', name: 'Custom Settings', critical: false },
];

export const DataBackupControls = () => {
  const { isAdmin } = useUserRole();
  const { exportData, importData, parseBackupFile, isExporting, isImporting } = useDataBackup();
  const [selectedTables, setSelectedTables] = useState<string[]>(
    AVAILABLE_TABLES.map(t => t.id)
  );
  const [importDryRun, setImportDryRun] = useState(true);
  const [isGitHubBackupRunning, setIsGitHubBackupRunning] = useState(false);
  const [isGitHubDownloadRunning, setIsGitHubDownloadRunning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isAdmin) return null;

  const handleTableToggle = (tableId: string, checked: boolean) => {
    if (checked) {
      setSelectedTables(prev => [...prev, tableId]);
    } else {
      setSelectedTables(prev => prev.filter(id => id !== tableId));
    }
  };

  const handleExport = () => {
    console.log('Export button clicked with tables:', selectedTables);
    exportData.mutate({
      includeTables: selectedTables
    });
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsedFiles = await parseBackupFile(file);
      
      if (!parsedFiles['manifest.json']) {
        toast.error('Invalid backup file: missing manifest.json');
        return;
      }

      const manifest = parsedFiles['manifest.json'];
      if (!manifest.version || !manifest.tables) {
        toast.error('Invalid backup file: corrupted manifest');
        return;
      }

      // Show preview of what will be imported
      const tableCount = manifest.tables.length;
      const recordCount = Object.values(manifest.recordCounts || {}).reduce((a: number, b: any) => a + (b || 0), 0);
      
      toast.info(`Backup contains ${tableCount} tables with ${recordCount} total records`, {
        duration: 3000
      });

      importData.mutate({
        files: parsedFiles,
        dryRun: importDryRun,
        options: {
          skipConflicts: false, // Allow updates for changed data
          overwriteExisting: false // Keep existing data that's the same
        }
      });
    } catch (error) {
      toast.error(`${error instanceof Error ? error.message : 'Failed to parse backup file'}`);
      console.error('File parse error:', error);
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getSessionToken = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) {
      throw new Error('Missing auth session. Please sign out and sign in again.');
    }
    return data.session.access_token;
  };

  const handleRunGitHubBackup = async () => {
    setIsGitHubBackupRunning(true);
    try {
      const token = await getSessionToken();
      const { data, error } = await supabase.functions.invoke('github-backup', {
        body: { action: 'dispatch' },
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
      });
      if (error || data?.error) {
        throw new Error(data?.error || error?.message || 'Failed to trigger backup');
      }
      toast.success('Backup triggered. Check GitHub Actions for progress.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to trigger backup');
    } finally {
      setIsGitHubBackupRunning(false);
    }
  };

  const downloadBackupFile = async (fileName: string) => {
    const token = await getSessionToken();
    const { data, error } = await supabase.functions.invoke('github-backup', {
      body: { action: 'download', file: fileName },
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
    });
    if (error || data?.error) {
      throw new Error(data?.error || error?.message || `Failed to download ${fileName}`);
    }
    if (!data?.contentBase64) {
      throw new Error(`Missing backup content for ${fileName}`);
    }
    const binary = atob(data.contentBase64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'text/sql; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadGitHubBackup = async () => {
    setIsGitHubDownloadRunning(true);
    try {
      await downloadBackupFile('roles.sql');
      await downloadBackupFile('schema.sql');
      await downloadBackupFile('data.sql');
      toast.success('Latest GitHub backup downloaded.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to download backup');
    } finally {
      setIsGitHubDownloadRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Data Backup & Restore
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* GitHub Backup Section */}
        <div className="space-y-4">
          <h4 className="font-medium">Automated GitHub Backups</h4>
          <p className="text-xs text-muted-foreground">
            Schedule: 1 PM and 11 PM Bangladesh time (GitHub Actions).
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={handleRunGitHubBackup}
              disabled={isGitHubBackupRunning}
              className="w-full sm:w-auto"
            >
              {isGitHubBackupRunning ? 'Triggering Backup...' : 'Run Backup Now'}
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadGitHubBackup}
              disabled={isGitHubDownloadRunning}
              className="w-full sm:w-auto"
            >
              {isGitHubDownloadRunning ? 'Downloading...' : 'Download Latest Backup'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Backups are stored in GitHub under `prisma/backups`.
          </p>
        </div>

        <Separator />

        {/* Export Section */}
        <div className="space-y-4">
          <h4 className="font-medium">Export Data</h4>
          <div className="grid grid-cols-2 gap-3">
            {AVAILABLE_TABLES.map((table) => (
              <div key={table.id} className="flex items-center space-x-2">
                <Checkbox
                  id={table.id}
                  checked={selectedTables.includes(table.id)}
                  onCheckedChange={(checked) => 
                    handleTableToggle(table.id, checked as boolean)
                  }
                />
                <Label 
                  htmlFor={table.id} 
                  className={`text-sm ${table.critical ? 'font-medium' : ''}`}
                >
                  {table.name}
                  {table.critical && <span className="text-error ml-1">*</span>}
                </Label>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            * Critical tables are essential for system operation
          </p>
          
          <Button 
            onClick={handleExport}
            disabled={isExporting || selectedTables.length === 0}
            className="w-full"
          >
            <Download className="h-4 w-4 mr-2" />
            {isExporting ? 'Generating Export...' : 'Export Selected Data'}
          </Button>
          
          {/* Export Status */}
          {exportData.isError && (
            <div className="p-3 bg-error/12 border border-error/35 rounded-md">
              <p className="text-sm text-error">
                <strong>Export Error:</strong> {exportData.error?.message}
              </p>
              <p className="text-xs text-error mt-1">
                Check browser console for detailed error information.
              </p>
            </div>
          )}
        </div>

        <Separator />

        {/* Import Section */}
        <div className="space-y-4">
          <h4 className="font-medium">Import Data</h4>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="dryRun"
              checked={importDryRun}
              onCheckedChange={(checked) => setImportDryRun(checked as boolean)}
            />
            <Label htmlFor="dryRun" className="text-sm">
              Dry run (validate only, don't write data)
            </Label>
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.zip"
            onChange={handleImportFile}
            className="hidden"
          />
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="outline" 
                disabled={isImporting}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                {isImporting ? 'Processing Import...' : 'Import Data'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Confirm Data Import
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {importDryRun ? (
                    "This will validate the backup file without making any changes to your database."
                  ) : (
                    "This will import data from the backup file and may overwrite existing records. This action cannot be easily undone."
                  )}
                  <br /><br />
                  Make sure you have a recent backup before proceeding with actual imports.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => fileInputRef.current?.click()}
                  className={importDryRun ? "" : "bg-destructive hover:bg-destructive/90"}
                >
                  {importDryRun ? "Select File to Validate" : "Select File to Import"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
};
