import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/hooks/usePermissions";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Shield, Database, Users, FileText, AlertCircle, Database as DatabaseIcon, ChevronDown, ChevronUp, Settings, TestTube } from "lucide-react";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { currencyOptions, getCurrencySymbol } from "@/lib/currencySymbols";
import { CourierWebhookSettings } from "@/components/CourierWebhookSettings";
import { DataBackupControls } from "@/components/DataBackupControls";
import { AppResetControls } from "@/components/AppResetControls";
import { ActivityLogs } from "@/components/admin/ActivityLogs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/utils/toast";
import { DismissibleAlert } from "@/components/DismissibleAlert";
import { useMockDataContext } from "@/contexts/MockDataContext";
import { logActivity } from "@/utils/activityLogger";

export function SystemSettings() {
  const { systemSettings, updateSystemSettings, isUpdating: isSystemUpdating } = useSystemSettings();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('settings.edit_business');
  const [isApplyingMockChange, setIsApplyingMockChange] = useState(false);

  const [systemForm, setSystemForm] = useState({
    currency_code: 'BDT',
    timezone: 'Asia/Dhaka',
    date_format: 'dd/MM/yyyy',
    time_format: '12h',
    mock_data_enabled: false,
    mock_data_scale: 0.1,
  });

  const currentMockDataStatus = {
    isEnabled: systemForm.mock_data_enabled,
    scaleFactor: systemForm.mock_data_scale,
    percentage: Math.round(systemForm.mock_data_scale * 100),
    label: systemForm.mock_data_enabled
      ? `${Math.round(systemForm.mock_data_scale * 100)}% Demo Data`
      : 'Real Data',
  };

  // State for managing collapsed sections
  const [collapsedSections, setCollapsedSections] = useState({
    systemSettings: false,
    paymentRules: true,
    activityLogs: true,
    dataBackup: true,
    resetApp: true,
    securityNotes: true,
    pwaCache: true,
    mockData: true,
  });

  const toggleSection = (section: keyof typeof collapsedSections) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  useEffect(() => {
    if (systemSettings) {
      const nextForm = {
        currency_code: systemSettings.currency_code || 'BDT',
        timezone: systemSettings.timezone || 'Asia/Dhaka',
        date_format: systemSettings.date_format || 'dd/MM/yyyy',
        time_format: systemSettings.time_format || '12h',
        mock_data_enabled: systemSettings.mock_data_enabled ?? false,
        mock_data_scale: systemSettings.mock_data_scale ?? 0.1,
      };
      setSystemForm(prev => {
        return JSON.stringify(prev) === JSON.stringify(nextForm) ? prev : nextForm;
      });
    }
  }, [systemSettings]);

  const hasMockDataChanged = (nextForm = systemForm) =>
      systemSettings?.mock_data_enabled !== nextForm.mock_data_enabled ||
      systemSettings?.mock_data_scale !== nextForm.mock_data_scale;

  const saveSystemForm = async (nextForm = systemForm) => {
    const mockDataChanged =
      systemSettings?.mock_data_enabled !== nextForm.mock_data_enabled ||
      systemSettings?.mock_data_scale !== nextForm.mock_data_scale;

    if (mockDataChanged) {
      const oldStatus = systemSettings?.mock_data_enabled
        ? `${Math.round((systemSettings.mock_data_scale || 0.1) * 100)}%`
        : "Disabled";
      const newStatus = nextForm.mock_data_enabled
        ? `${Math.round(nextForm.mock_data_scale * 100)}%`
        : "Disabled";

      await logActivity({
        action: nextForm.mock_data_enabled ? "enabled" : "disabled",
        entityType: "mock_data",
        entityId: null,
        summary: `Mock data mode ${nextForm.mock_data_enabled ? "enabled" : "disabled"}`,
        details: {
          old_status: oldStatus,
          new_status: newStatus,
          scale_factor: nextForm.mock_data_scale,
        },
      });
    }

    updateSystemSettings(nextForm);
  };

  const handleSystemSubmit = async () => {
    await saveSystemForm(systemForm);
  };

  const handleMockToggleChange = async (checked: boolean) => {
    const nextForm = {
      ...systemForm,
      mock_data_enabled: checked,
    };

    setSystemForm(nextForm);
    setIsApplyingMockChange(true);

    try {
      await saveSystemForm(nextForm);
    } finally {
      setIsApplyingMockChange(false);
    }
  };

  const handleBroadcastRefresh = async () => {
    const channel = supabase.channel("pwa-updates");
    let sent = false;

    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED" || sent) return;
      sent = true;
      await channel.send({
        type: "broadcast",
        event: "refresh",
        payload: { message: "An update is available. Refresh when you're ready." },
      });
      toast.success("Update prompt sent to all connected users.");
      supabase.removeChannel(channel);
    });
  };

  // Collapsible Card Component
  const CollapsibleCard = ({
    title,
    description,
    icon: Icon,
    sectionKey,
    children
  }: {
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    sectionKey: keyof typeof collapsedSections;
    children: React.ReactNode;
  }) => {
    const isCollapsed = collapsedSections[sectionKey];

    return (
      <Card>
        <CardHeader
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => toggleSection(sectionKey)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon className="h-5 w-5" />
              <div>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="p-1">
              {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        {!isCollapsed && (
          <CardContent>
            {children}
          </CardContent>
        )}
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* System Information Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            System Information
          </CardTitle>
          <CardDescription>Current system status and configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                <Shield className="h-4 w-4 text-success" />
                <div>
                  <p className="text-sm font-medium">Authentication</p>
                  <p className="text-xs text-muted-foreground">Supabase Auth</p>
                </div>
              </div>
              <Badge variant="default">Active</Badge>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                <Database className="h-4 w-4 text-info" />
                <div>
                  <p className="text-sm font-medium">Database</p>
                  <p className="text-xs text-muted-foreground">PostgreSQL</p>
                </div>
              </div>
              <Badge variant="default">Connected</Badge>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-secondary" />
                <div>
                  <p className="text-sm font-medium">User Signup</p>
                  <p className="text-xs text-muted-foreground">Admin controlled</p>
                </div>
              </div>
              <Badge variant="secondary">Disabled</Badge>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-warning" />
                <div>
                  <p className="text-sm font-medium">Data Backup</p>
                  <p className="text-xs text-muted-foreground">Export/Import</p>
                </div>
              </div>
              <Badge variant="default">Available</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Notes Card */}
      <CollapsibleCard
        title="Security Notes"
        description="Important security considerations"
        icon={AlertCircle}
        sectionKey="securityNotes"
      >
        <div className="space-y-3">
          <div className="p-3 rounded-lg border-l-4 border-l-yellow-500 bg-warning/12 dark:bg-warning/85">
            <p className="text-sm font-medium">Public Signup Disabled</p>
            <p className="text-xs text-muted-foreground mt-1">
              Only administrators can invite new users to maintain security and control access.
            </p>
          </div>

          <div className="p-3 rounded-lg border-l-4 border-l-blue-500 bg-info/12 dark:bg-info/85">
            <p className="text-sm font-medium">Role-Based Access Control</p>
            <p className="text-xs text-muted-foreground mt-1">
              Users are assigned specific roles (Admin, Manager, Staff, Viewer) with appropriate permissions.
            </p>
          </div>

          <div className="p-3 rounded-lg border-l-4 border-l-green-500 bg-success/12 dark:bg-success/85">
            <p className="text-sm font-medium">Row Level Security</p>
            <p className="text-xs text-muted-foreground mt-1">
              Database policies ensure users can only access data they're authorized to view.
            </p>
          </div>
        </div>
      </CollapsibleCard>

      <CollapsibleCard
        title="PWA Cache"
        description="Notify users to refresh after an update"
        icon={DatabaseIcon}
        sectionKey="pwaCache"
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Sends a refresh prompt to all connected users so they can update when ready.
          </p>
          <Button onClick={handleBroadcastRefresh} variant="outline">
            Send Refresh Prompt
          </Button>
        </div>
      </CollapsibleCard>

      {/* System Settings Card */}
      <CollapsibleCard
        title="System Settings"
        description="Configure currency, timezone, and other system preferences"
        icon={DatabaseIcon}
        sectionKey="systemSettings"
      >
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="currencyCode">Currency <span className="text-muted-foreground">({getCurrencySymbol(systemForm.currency_code)})</span></Label>
              <Select value={systemForm.currency_code} onValueChange={(value) => setSystemForm(prev => ({ ...prev, currency_code: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  {currencyOptions.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.code} - {currency.name} ({getCurrencySymbol(currency.code)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select value={systemForm.timezone} onValueChange={(value) => setSystemForm(prev => ({ ...prev, timezone: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Dhaka">Asia/Dhaka (UTC+6)</SelectItem>
                  <SelectItem value="Asia/Kolkata">Asia/Kolkata (UTC+5:30)</SelectItem>
                  <SelectItem value="Asia/Karachi">Asia/Karachi (UTC+5)</SelectItem>
                  <SelectItem value="Asia/Dubai">Asia/Dubai (UTC+4)</SelectItem>
                  <SelectItem value="Europe/London">Europe/London (UTC+0)</SelectItem>
                  <SelectItem value="Europe/Paris">Europe/Paris (UTC+1)</SelectItem>
                  <SelectItem value="America/New_York">America/New_York (UTC-5)</SelectItem>
                  <SelectItem value="America/Chicago">America/Chicago (UTC-6)</SelectItem>
                  <SelectItem value="America/Denver">America/Denver (UTC-7)</SelectItem>
                  <SelectItem value="America/Los_Angeles">America/Los_Angeles (UTC-8)</SelectItem>
                  <SelectItem value="Australia/Sydney">Australia/Sydney (UTC+11)</SelectItem>
                  <SelectItem value="Asia/Tokyo">Asia/Tokyo (UTC+9)</SelectItem>
                  <SelectItem value="Asia/Shanghai">Asia/Shanghai (UTC+8)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateFormat">Date Format</Label>
              <Select value={systemForm.date_format} onValueChange={(value) => setSystemForm(prev => ({ ...prev, date_format: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select date format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dd/MM/yyyy">DD/MM/YYYY</SelectItem>
                  <SelectItem value="MM/dd/yyyy">MM/DD/YYYY</SelectItem>
                  <SelectItem value="yyyy-MM-dd">YYYY-MM-DD</SelectItem>
                  <SelectItem value="dd-MM-yyyy">DD-MM-YYYY</SelectItem>
                  <SelectItem value="dd.MM.yyyy">DD.MM.YYYY</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timeFormat">Time Format</Label>
              <Select value={systemForm.time_format} onValueChange={(value) => setSystemForm(prev => ({ ...prev, time_format: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select time format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="12h">12 Hour (AM/PM)</SelectItem>
                  <SelectItem value="24h">24 Hour</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-backup</Label>
              <p className="text-sm text-muted-foreground">
                Automatically backup your data daily
              </p>
            </div>
            <Switch defaultChecked />
          </div>
          <Button onClick={handleSystemSubmit} disabled={isSystemUpdating || !canEdit}>
            {isSystemUpdating ? 'Saving...' : (canEdit ? 'Save System Settings' : 'Read Only')}
          </Button>
          {!canEdit && (
            <p className="text-sm text-destructive mt-2">
              You do not have permission to edit system settings.
            </p>
          )}
        </div>
      </CollapsibleCard>

      {/* Mock Data Configuration */}
      <CollapsibleCard
        title="Mock Data Configuration"
        description="Scale sales data for demo/testing purposes"
        icon={TestTube}
        sectionKey="mockData"
      >
        {systemForm.mock_data_enabled && (
          <DismissibleAlert
            type="warning"
            title="⚠️ Mock Data Mode Active"
            description={`All financial metrics are scaled to ${Math.round(systemForm.mock_data_scale * 100)}% of real values. Database remains unchanged.`}
          />
        )}

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={systemForm.mock_data_enabled}
              onCheckedChange={(checked) => {
                void handleMockToggleChange(checked);
              }}
              disabled={!canEdit || isSystemUpdating || isApplyingMockChange}
            />
            <div className="space-y-1">
              <Label>Enable Mock Data Mode</Label>
              <p className="text-xs text-muted-foreground">
                This toggle saves immediately and syncs to other connected devices.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mockDataScale">
              Scale Factor: {Math.round(systemForm.mock_data_scale * 100)}%
              <span className="text-sm text-muted-foreground ml-2">
                (0.1 = 10%, 0.5 = 50%, 1.0 = 100%)
              </span>
            </Label>
            <Input
              id="mockDataScale"
              type="number"
              min="0.01"
              max="1"
              step="0.1"
              value={systemForm.mock_data_scale}
              onChange={(e) =>
                setSystemForm({
                  ...systemForm,
                  mock_data_scale: parseFloat(e.target.value) || 0.1
                })
              }
              disabled={!canEdit || !systemForm.mock_data_enabled}
            />
            <p className="text-xs text-muted-foreground">
              When enabled, all revenue, amounts, and financial metrics will be scaled by this factor.
              Real data in the database remains unchanged.
            </p>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void saveSystemForm(systemForm);
                }}
                disabled={!canEdit || isSystemUpdating || isApplyingMockChange || !hasMockDataChanged()}
              >
                {isSystemUpdating ? "Saving..." : "Save Mock Settings"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Scale changes still require an explicit save.
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-sm font-medium mb-2">Current Status</p>
            <div className="flex items-center gap-2">
              <Badge variant={systemForm.mock_data_enabled ? "destructive" : "secondary"}>
                {currentMockDataStatus.label}
              </Badge>
              {systemForm.mock_data_enabled && (
                <span className="text-sm text-muted-foreground">
                  Scaling applied to dashboard, sales, and analytics
                </span>
              )}
            </div>
            {hasMockDataChanged() && (
              <p className="mt-2 text-xs text-muted-foreground">
                Unsaved mock settings detected. Toggle changes save immediately; scale changes need `Save Mock Settings`.
              </p>
            )}
          </div>
        </div>
      </CollapsibleCard>

      <CollapsibleCard
        title="Activity Logs"
        description="Track user activity across products, sales, and customers"
        icon={DatabaseIcon}
        sectionKey="activityLogs"
      >
        <ActivityLogs />
      </CollapsibleCard>

      {/* Courier Settings */}
      <CourierWebhookSettings />

      {/* Data Backup Controls */}
      <CollapsibleCard
        title="Data Backup & Restore"
        description="Export and import your data for backup and migration"
        icon={Database}
        sectionKey="dataBackup"
      >
        <DataBackupControls />
      </CollapsibleCard>

      {/* App Reset Controls */}
      <CollapsibleCard
        title="Reset App"
        description="Reset the application to factory defaults (removes all data)"
        icon={Shield}
        sectionKey="resetApp"
      >
        <AppResetControls />
      </CollapsibleCard>
    </div>
  );
}

// Storage Management Section Component
function StorageManagementSection() {
  const [isChecking, setIsChecking] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [bucketStatus, setBucketStatus] = useState<'unknown' | 'exists' | 'missing'>('unknown');
  const [testResult, setTestResult] = useState<string>('');

  const checkStorageBucket = async () => {
    setIsChecking(true);
    try {
      const exists = await ensureStorageBucket();
      setBucketStatus(exists ? 'exists' : 'missing');
      setTestResult(exists ? 'Storage bucket is available and accessible.' : 'Storage bucket is missing or not accessible.');
    } catch (error) {
      console.error('Error checking storage bucket:', error);
      setBucketStatus('missing');
      setTestResult('Error checking storage bucket: ' + (error as Error).message);
    } finally {
      setIsChecking(false);
    }
  };

  const testStorageConnection = async () => {
    setIsTesting(true);
    try {
      const success = await testStorageUpload();
      setTestResult(success ? 'Storage upload test successful!' : 'Storage upload test failed.');
    } catch (error) {
      console.error('Error testing storage:', error);
      setTestResult('Storage test error: ' + (error as Error).message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleCreateStorageBucket = async () => {
    try {
      const success = await createStorageBucket();
      if (success) {
        setBucketStatus('exists');
        setTestResult('Storage bucket created successfully!');
      } else {
        setBucketStatus('missing');
        setTestResult('Failed to create storage bucket. Please try again or contact support.');
      }
    } catch (error) {
      console.error('Error creating storage bucket:', error);
      setBucketStatus('missing');
      setTestResult('Failed to create storage bucket: ' + (error as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Storage Bucket Status</Label>
          <div className="flex items-center gap-2">
            <Badge variant={bucketStatus === 'exists' ? 'default' : bucketStatus === 'missing' ? 'destructive' : 'secondary'}>
              {bucketStatus === 'exists' ? 'Available' : bucketStatus === 'missing' ? 'Missing' : 'Unknown'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={checkStorageBucket}
              disabled={isChecking}
            >
              {isChecking ? 'Checking...' : 'Check Status'}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Actions</Label>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateStorageBucket}
              disabled={bucketStatus === 'exists'}
            >
              Create Bucket
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={testStorageConnection}
              disabled={isTesting || bucketStatus === 'missing'}
            >
              {isTesting ? 'Testing...' : 'Test Upload'}
            </Button>
          </div>
        </div>
      </div>

      {testResult && (
        <div className="p-3 rounded-lg border bg-muted/50">
          <p className="text-sm">{testResult}</p>
        </div>
      )}

      <div className="text-sm text-muted-foreground">
        <p><strong>Storage Bucket:</strong> product-images</p>
        <p><strong>Purpose:</strong> Store product images and other media files</p>
        <p><strong>Access:</strong> Public read, authenticated write</p>
      </div>
    </div>
  );
}
