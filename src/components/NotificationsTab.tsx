import { Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useUserPreferences } from "@/hooks/useUserPreferences";

export const NotificationsTab = () => {
  const { preferences, updatePreferences, isUpdating } = useUserPreferences();

  const handleToggle = (key: keyof typeof preferences, value: boolean) => {
    updatePreferences({ [key]: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Email Notifications</Label>
            <p className="text-sm text-muted-foreground">
              Receive email notifications for important updates
            </p>
          </div>
          <Switch 
            checked={preferences.email_notifications}
            onCheckedChange={(value) => handleToggle('email_notifications', value)}
            disabled={isUpdating}
          />
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Low Stock Alerts</Label>
            <p className="text-sm text-muted-foreground">
              Get notified when products are running low
            </p>
          </div>
          <Switch 
            checked={preferences.low_stock_alerts}
            onCheckedChange={(value) => handleToggle('low_stock_alerts', value)}
            disabled={isUpdating}
          />
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Sales Reports</Label>
            <p className="text-sm text-muted-foreground">
              Receive daily sales summary reports
            </p>
          </div>
          <Switch 
            checked={preferences.sales_reports}
            onCheckedChange={(value) => handleToggle('sales_reports', value)}
            disabled={isUpdating}
          />
        </div>
      </CardContent>
    </Card>
  );
};