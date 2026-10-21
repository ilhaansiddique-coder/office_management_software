import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWebhookSettings } from "@/hooks/useWebhookSettings";
import { Truck, Save, KeyRound, Eye, EyeOff, Loader2, CheckCircle, XCircle, Zap, RefreshCw, Store } from "lucide-react";
import { toast } from "@/utils/toast";
import { supabase } from "@/integrations/supabase/client";

interface PathaoStore {
  store_id: number;
  store_name: string;
  store_address: string;
  city_id: number;
  zone_id: number;
  hub_id: number;
  is_active: number;
}

export const CourierWebhookSettings = () => {
  const { webhookSettings, updateWebhookSettings, isUpdating, refetchSettings } = useWebhookSettings();

  // Steadfast fields
  const [steadfastApiKey, setSteadfastApiKey] = useState("");
  const [steadfastSecretKey, setSteadfastSecretKey] = useState("");
  const [steadfastEnabled, setSteadfastEnabled] = useState(false);
  const [showSteadfastApiKey, setShowSteadfastApiKey] = useState(false);
  const [showSteadfastSecretKey, setShowSteadfastSecretKey] = useState(false);
  const [isSteadfastTesting, setIsSteadfastTesting] = useState(false);
  const [steadfastTestResult, setSteadfastTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Pathao fields
  const [pathaoClientId, setPathaoClientId] = useState("");
  const [pathaoClientSecret, setPathaoClientSecret] = useState("");
  const [pathaoUsername, setPathaoUsername] = useState("");
  const [pathaoPassword, setPathaoPassword] = useState("");
  const [pathaoStoreId, setPathaoStoreId] = useState("");
  const [pathaoEnabled, setPathaoEnabled] = useState(false);
  const [showPathaoClientId, setShowPathaoClientId] = useState(false);
  const [showPathaoClientSecret, setShowPathaoClientSecret] = useState(false);
  const [showPathaoPassword, setShowPathaoPassword] = useState(false);
  const [isPathaoAuthenticating, setIsPathaoAuthenticating] = useState(false);
  const [pathaoAuthResult, setPathaoAuthResult] = useState<{ success: boolean; message: string } | null>(null);
  const [pathaoStores, setPathaoStores] = useState<PathaoStore[]>([]);
  const [isLoadingStores, setIsLoadingStores] = useState(false);

  // Default courier
  const [defaultCourier, setDefaultCourier] = useState<'Steadfast' | 'Pathao' | null>(null);

  // Auto-refresh interval (in minutes)
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(180);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(true);



  useEffect(() => {
    if (webhookSettings) {
      // Steadfast
      setSteadfastApiKey(webhookSettings.steadfast_api_key || "");
      setSteadfastSecretKey(webhookSettings.steadfast_secret_key || "");
      setSteadfastEnabled(webhookSettings.steadfast_enabled || false);
      // Pathao
      setPathaoClientId(webhookSettings.pathao_client_id || "");
      setPathaoClientSecret(webhookSettings.pathao_client_secret || "");
      setPathaoUsername((webhookSettings as any).pathao_username || "");
      setPathaoPassword((webhookSettings as any).pathao_password || "");
      setPathaoStoreId(webhookSettings.pathao_store_id || "");
      setPathaoEnabled(webhookSettings.pathao_enabled || false);
      // Default
      setDefaultCourier(webhookSettings.default_courier || null);
      // Auto-refresh interval
      const interval = webhookSettings.auto_refresh_interval_minutes ?? 180;
      setAutoRefreshInterval(interval === 0 ? 180 : interval);
      setAutoRefreshEnabled(interval !== 0);
    }
  }, [webhookSettings]);

  // Fetch Pathao stores when authenticated
  useEffect(() => {
    if (webhookSettings?.pathao_access_token) {
      handleFetchPathaoStores();
    }
  }, [webhookSettings?.pathao_access_token]);

  const handleSteadfastSave = (e: React.FormEvent) => {
    e.preventDefault();
    const settingsToSave = {
      steadfast_api_key: steadfastApiKey,
      steadfast_secret_key: steadfastSecretKey,
      steadfast_enabled: steadfastEnabled,
      default_courier: defaultCourier,
      auto_refresh_interval_minutes: autoRefreshEnabled ? autoRefreshInterval : 0,
    };
    console.log('💾 Saving Steadfast settings:');
    console.log('  - Auto-refresh toggle:', autoRefreshEnabled ? 'ON ✅' : 'OFF ❌');
    console.log('  - Selected interval:', autoRefreshInterval, 'minutes');
    console.log('  - Saving to DB (minutes):', autoRefreshEnabled ? autoRefreshInterval : 0);
    console.log('  - Saving to DB (hours):', autoRefreshEnabled ? Math.round(autoRefreshInterval / 60) : 6);
    console.log('  - Full settings:', settingsToSave);
    updateWebhookSettings(settingsToSave);
  };

  const handlePathaoSave = (e: React.FormEvent) => {
    e.preventDefault();
    // Note: pathao_username and pathao_password are NOT saved to DB for security
    // They are only used during authentication and passed directly to the API
    const settingsToSave = {
      pathao_client_id: pathaoClientId,
      pathao_client_secret: pathaoClientSecret,
      pathao_store_id: pathaoStoreId,
      pathao_enabled: pathaoEnabled,
      default_courier: defaultCourier,
      auto_refresh_interval_minutes: autoRefreshEnabled ? autoRefreshInterval : 0,
    };
    console.log('💾 Saving Pathao settings:');
    console.log('  - Auto-refresh toggle:', autoRefreshEnabled ? 'ON ✅' : 'OFF ❌');
    console.log('  - Selected interval:', autoRefreshInterval, 'minutes');
    console.log('  - Saving to DB (minutes):', autoRefreshEnabled ? autoRefreshInterval : 0);
    console.log('  - Saving to DB (hours):', autoRefreshEnabled ? Math.round(autoRefreshInterval / 60) : 6);
    console.log('  - Full settings:', settingsToSave);
    updateWebhookSettings(settingsToSave as any);
  };

  const handleTestSteadfast = async () => {
    if (!steadfastApiKey || !steadfastSecretKey) {
      toast.error("Please enter your Steadfast API Key and Secret Key first.");
      return;
    }

    setIsSteadfastTesting(true);
    setSteadfastTestResult(null);

    try {
      // Validate credentials format
      if (steadfastApiKey.length < 10 || steadfastSecretKey.length < 10) {
        setSteadfastTestResult({
          success: false,
          message: 'API Key and Secret Key should be at least 10 characters long.'
        });
        toast.error("Invalid credential format");
        setIsSteadfastTesting(false);
        return;
      }

      // Call edge function with test_connection mode (uses balance endpoint)
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/steadfast-status-check`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            test_connection: true,
            api_key: steadfastApiKey,
            secret_key: steadfastSecretKey,
          }),
        }
      );

      const responseText = await response.text();
      console.log('Test connection raw response:', responseText);

      // Try to parse JSON
      let result: any;
      try {
        result = JSON.parse(responseText);
      } catch (e) {
        console.error('JSON parse error:', e, 'Response:', responseText);

        // Check if the raw response indicates auth failure
        if (responseText.toLowerCase().includes('unauthorized')) {
          setSteadfastTestResult({
            success: false,
            message: 'Invalid API credentials. Please check your API Key and Secret Key.'
          });
          toast.error("Invalid Steadfast credentials");
        } else {
          setSteadfastTestResult({
            success: false,
            message: 'Edge function needs redeployment. Please redeploy steadfast-status-check function.'
          });
          toast.error("Please redeploy the edge function");
        }
        setIsSteadfastTesting(false);
        return;
      }

      console.log('Test connection result:', result);

      if (result.success) {
        setSteadfastTestResult({
          success: true,
          message: result.message || 'Connection successful! Credentials are valid.'
        });
        toast.success("Steadfast connection successful!");
      } else if (result.auth_error) {
        setSteadfastTestResult({
          success: false,
          message: 'Invalid API credentials. Please check your API Key and Secret Key.'
        });
        toast.error("Invalid Steadfast credentials");
      } else {
        setSteadfastTestResult({
          success: false,
          message: result.message || 'Connection failed. Please try again.'
        });
        toast.error(result.message || "Connection failed");
      }
    } catch (error) {
      console.error('Test connection error:', error);
      setSteadfastTestResult({
        success: false,
        message: `Connection error: ${(error as Error).message}`
      });
      toast.error("Connection failed");
    } finally {
      setIsSteadfastTesting(false);
    }
  };

  const handleAuthenticatePathao = async () => {
    if (!pathaoClientId || !pathaoClientSecret || !pathaoUsername || !pathaoPassword) {
      toast.error("Please enter all Pathao credentials (Client ID, Client Secret, Username, and Password).");
      return;
    }

    setIsPathaoAuthenticating(true);
    setPathaoAuthResult(null);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('Authentication required');
      }

      // Call pathao-proxy with authenticate action (credentials are passed directly)
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pathao-proxy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
          body: JSON.stringify({
            action: 'authenticate',
            client_id: pathaoClientId,
            client_secret: pathaoClientSecret,
            username: pathaoUsername,
            password: pathaoPassword,
          }),
        }
      );

      const result = await response.json();
      console.log('Pathao auth result:', result);

      if (result.success) {
        setPathaoAuthResult({ success: true, message: 'Pathao authentication successful! Token saved.' });
        toast.success("Pathao authenticated successfully!");
        // Refetch settings to get the new token, then fetch stores
        await refetchSettings();
        // Small delay to ensure DB update propagates
        setTimeout(() => {
          handleFetchPathaoStores();
        }, 500);
      } else {
        setPathaoAuthResult({ success: false, message: result.message || 'Authentication failed.' });
        toast.error(result.message || 'Pathao authentication failed');
      }
    } catch (error) {
      setPathaoAuthResult({ success: false, message: `Authentication failed: ${(error as Error).message}` });
      toast.error(`Authentication failed: ${(error as Error).message}`);
    } finally {
      setIsPathaoAuthenticating(false);
    }
  };

  const handleFetchPathaoStores = async () => {
    setIsLoadingStores(true);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('Authentication required');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pathao-proxy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
          body: JSON.stringify({
            action: 'get_stores',
          }),
        }
      );

      const result = await response.json();
      console.log('Pathao stores result:', result);

      if (result.success && result.data?.data?.data) {
        setPathaoStores(result.data.data.data);
      } else if (result.success && Array.isArray(result.data?.data)) {
        setPathaoStores(result.data.data);
      } else {
        console.log('Stores response structure:', result);
        toast.error(result.message || 'Failed to fetch stores');
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
      toast.error(`Failed to fetch stores: ${(error as Error).message}`);
    } finally {
      setIsLoadingStores(false);
    }
  };



  const steadfastConfigured = !!(steadfastApiKey && steadfastSecretKey);
  const pathaoConfigured = !!(webhookSettings?.pathao_access_token && pathaoStoreId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          Courier Settings
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Configure your courier service integrations. Enable the couriers you want to use for deliveries.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="steadfast" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="steadfast" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Steadfast
              {steadfastConfigured && steadfastEnabled ? (
                <Badge variant="default" className="ml-1 bg-success text-xs">ON</Badge>
              ) : steadfastConfigured ? (
                <Badge variant="secondary" className="ml-1 text-xs">Configured</Badge>
              ) : (
                <Badge variant="outline" className="ml-1 text-xs">Not Set</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="pathao" className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Pathao
              {pathaoConfigured && pathaoEnabled ? (
                <Badge variant="default" className="ml-1 bg-success text-xs">ON</Badge>
              ) : pathaoConfigured ? (
                <Badge variant="secondary" className="ml-1 text-xs">Configured</Badge>
              ) : (
                <Badge variant="outline" className="ml-1 text-xs">Not Set</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Steadfast Tab */}
          <TabsContent value="steadfast">
            <form onSubmit={handleSteadfastSave} className="space-y-6">
              {/* Enable/Disable Toggle */}
              <div className={`p-4 rounded-lg border-2 ${steadfastEnabled ? 'border-success/50 bg-success/50 dark:bg-success/20' : 'border-base-300 bg-base-100/50 dark:bg-base-300/20'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${steadfastEnabled ? 'bg-success' : 'bg-base-200'}`} />
                    <div>
                      <h3 className="font-medium">Steadfast Courier</h3>
                      <p className="text-sm text-muted-foreground">
                        {steadfastEnabled ? 'Enabled - Orders can be sent to Steadfast' : 'Disabled - Enable to send orders'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={steadfastEnabled}
                    onCheckedChange={setSteadfastEnabled}
                    disabled={!steadfastConfigured}
                  />
                </div>
                {!steadfastConfigured && (
                  <p className="text-xs text-warning mt-2">
                    Enter API credentials below to enable this courier.
                  </p>
                )}
              </div>

              {/* API Credentials */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  API Credentials & Auto-Refresh
                </h4>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="steadfast_api_key">API Key *</Label>
                    <div className="relative">
                      <Input
                        id="steadfast_api_key"
                        type={showSteadfastApiKey ? "text" : "password"}
                        placeholder="Enter Steadfast API Key"
                        value={steadfastApiKey}
                        onChange={(e) => setSteadfastApiKey(e.target.value)}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                        onClick={() => setShowSteadfastApiKey(!showSteadfastApiKey)}
                      >
                        {showSteadfastApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="steadfast_secret_key">Secret Key *</Label>
                    <div className="relative">
                      <Input
                        id="steadfast_secret_key"
                        type={showSteadfastSecretKey ? "text" : "password"}
                        placeholder="Enter Steadfast Secret Key"
                        value={steadfastSecretKey}
                        onChange={(e) => setSteadfastSecretKey(e.target.value)}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                        onClick={() => setShowSteadfastSecretKey(!showSteadfastSecretKey)}
                      >
                        {showSteadfastSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="auto_refresh_interval" className="flex items-center justify-between">
                      <span>Auto-Refresh Frequency</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{autoRefreshEnabled ? 'ON' : 'OFF'}</span>
                        <Switch
                          checked={autoRefreshEnabled}
                          onCheckedChange={setAutoRefreshEnabled}
                        />
                      </div>
                    </Label>
                    <Select
                      value={String(autoRefreshInterval)}
                      onValueChange={(value) => setAutoRefreshInterval(Number(value))}
                      disabled={!autoRefreshEnabled}
                    >
                      <SelectTrigger id="auto_refresh_interval">
                        <SelectValue placeholder="Select refresh frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="60">Every 1 hour</SelectItem>
                        <SelectItem value="120">Every 2 hours</SelectItem>
                        <SelectItem value="180">Every 3 hours</SelectItem>
                        <SelectItem value="240">Every 4 hours</SelectItem>
                        <SelectItem value="360">Every 6 hours</SelectItem>
                        <SelectItem value="480">Every 8 hours</SelectItem>
                        <SelectItem value="720">Every 12 hours</SelectItem>
                        <SelectItem value="1440">Every 24 hours</SelectItem>
                        <SelectItem value="2880">Every 48 hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestSteadfast}
                    disabled={isSteadfastTesting || !steadfastApiKey || !steadfastSecretKey}
                  >
                    {isSteadfastTesting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Test Connection
                  </Button>
                  <span className="text-xs text-muted-foreground">Verify your API credentials with Steadfast</span>
                </div>

                {steadfastTestResult && (
                  <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${steadfastTestResult.success
                    ? 'bg-success/12 text-success border border-success/35'
                    : 'bg-error/12 text-error border border-error/35'
                    }`}>
                    {steadfastTestResult.success ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    {steadfastTestResult.message}
                  </div>
                )}
              </div>



              <Separator />

              {/* API Info */}
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2 text-sm">Steadfast API Info</h4>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Base URL:</strong> https://portal.packzy.com/api/v1</p>
                  <p><strong>Status Flow:</strong> in_review → pending → in_transit → delivered / cancelled</p>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="submit" disabled={isUpdating}>
                  <Save className="h-4 w-4 mr-2" />
                  {isUpdating ? "Saving..." : "Save Steadfast Settings"}
                </Button>
              </div>
            </form>
          </TabsContent>

          {/* Pathao Tab */}
          <TabsContent value="pathao">
            <form onSubmit={handlePathaoSave} className="space-y-6">
              {/* Enable/Disable Toggle */}
              <div className={`p-4 rounded-lg border-2 ${pathaoEnabled ? 'border-success/50 bg-success/50 dark:bg-success/20' : 'border-base-300 bg-base-100/50 dark:bg-base-300/20'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${pathaoEnabled ? 'bg-success' : 'bg-base-200'}`} />
                    <div>
                      <h3 className="font-medium">Pathao Courier</h3>
                      <p className="text-sm text-muted-foreground">
                        {pathaoEnabled ? 'Enabled - Orders can be sent to Pathao' : 'Disabled - Enable to send orders'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={pathaoEnabled}
                    onCheckedChange={setPathaoEnabled}
                    disabled={!pathaoConfigured}
                  />
                </div>
                {!pathaoConfigured && (
                  <p className="text-xs text-warning mt-2">
                    Authenticate with Pathao and enter Store ID below to enable this courier.
                  </p>
                )}
              </div>

              {/* OAuth Credentials */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  API Credentials
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pathao_client_id">Client ID *</Label>
                    <div className="relative">
                      <Input
                        id="pathao_client_id"
                        type={showPathaoClientId ? "text" : "password"}
                        placeholder="Enter Pathao Client ID"
                        value={pathaoClientId}
                        onChange={(e) => setPathaoClientId(e.target.value)}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                        onClick={() => setShowPathaoClientId(!showPathaoClientId)}
                      >
                        {showPathaoClientId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pathao_client_secret">Client Secret *</Label>
                    <div className="relative">
                      <Input
                        id="pathao_client_secret"
                        type={showPathaoClientSecret ? "text" : "password"}
                        placeholder="Enter Pathao Client Secret"
                        value={pathaoClientSecret}
                        onChange={(e) => setPathaoClientSecret(e.target.value)}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                        onClick={() => setShowPathaoClientSecret(!showPathaoClientSecret)}
                      >
                        {showPathaoClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pathao_username">Username (Email) *</Label>
                    <Input
                      id="pathao_username"
                      type="email"
                      placeholder="Enter Pathao merchant email"
                      value={pathaoUsername}
                      onChange={(e) => setPathaoUsername(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pathao_password">Password *</Label>
                    <div className="relative">
                      <Input
                        id="pathao_password"
                        type={showPathaoPassword ? "text" : "password"}
                        placeholder="Enter Pathao password"
                        value={pathaoPassword}
                        onChange={(e) => setPathaoPassword(e.target.value)}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                        onClick={() => setShowPathaoPassword(!showPathaoPassword)}
                      >
                        {showPathaoPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAuthenticatePathao}
                    disabled={isPathaoAuthenticating || !pathaoClientId || !pathaoClientSecret || !pathaoUsername || !pathaoPassword}
                  >
                    {isPathaoAuthenticating ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle className="h-4 w-4 mr-2" />
                    )}
                    Authenticate
                  </Button>
                  {webhookSettings?.pathao_access_token && (
                    <Badge variant="outline" className="bg-success/12 text-success border-success/35">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Authenticated
                    </Badge>
                  )}
                </div>

                {pathaoAuthResult && (
                  <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${pathaoAuthResult.success
                    ? 'bg-success/12 text-success border border-success/35'
                    : 'bg-error/12 text-error border border-error/35'
                    }`}>
                    {pathaoAuthResult.success ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    {pathaoAuthResult.message}
                  </div>
                )}
              </div>

              <Separator />

              {/* Store Configuration */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Store className="h-4 w-4" />
                  Store Configuration
                </h4>

                <div className="space-y-2">
                  <Label htmlFor="pathao_store_id">Default Store *</Label>
                  <div className="flex gap-2">
                    <Select
                      value={pathaoStoreId}
                      onValueChange={(value) => setPathaoStoreId(value)}
                      disabled={!webhookSettings?.pathao_access_token}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder={pathaoStores.length > 0 ? "Select a store" : "Authenticate first to load stores"} />
                      </SelectTrigger>
                      <SelectContent>
                        {pathaoStores.map((store) => (
                          <SelectItem key={store.store_id} value={String(store.store_id)}>
                            {store.store_name} {store.is_active === 0 && "(Inactive)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleFetchPathaoStores}
                      disabled={isLoadingStores || !webhookSettings?.pathao_access_token}
                      title="Refresh stores"
                    >
                      {isLoadingStores ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {pathaoStores.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {pathaoStores.length} store(s) found. Select a default store for orders.
                    </p>
                  )}
                  {!webhookSettings?.pathao_access_token && (
                    <p className="text-xs text-warning">
                      Please authenticate with Pathao first to load your stores.
                    </p>
                  )}
                </div>
              </div>

              <Separator />

              {/* API Info */}
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2 text-sm">Pathao API Info</h4>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Base URL:</strong> https://hermes-api.pathao.com/aladdin/api/v1</p>
                  <p><strong>Status Flow:</strong> Pending → Picked → In Transit → Delivered / Returned</p>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="submit" disabled={isUpdating}>
                  <Save className="h-4 w-4 mr-2" />
                  {isUpdating ? "Saving..." : "Save Pathao Settings"}
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
