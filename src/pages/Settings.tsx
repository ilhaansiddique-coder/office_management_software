import { useState, useEffect, useMemo } from "react";
import { Building } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { NotificationsTab } from "@/components/NotificationsTab";
import { SecurityTab } from "@/components/SecurityTab";
import { InstallAppTab } from "@/components/InstallAppTab";
import { ImagePicker } from "@/components/ImagePicker";
import { useUserRole } from "@/hooks/useUserRole";

const Settings = () => {
  const { businessSettings, updateBusinessSettings, isUpdating } = useBusinessSettings();
  const { hasPermission } = useUserRole();

  const [businessForm, setBusinessForm] = useState({
    business_name: '',
    tagline: '',
    phone: '',
    whatsapp: '',
    email: '',
    facebook: '',
    invoice_prefix: '',
    invoice_count_start: 1,
    invoice_footer_message: '',
    primary_email: '',
    address_line1: '',
    business_hours: '',
    low_stock_alert_quantity: 12,
    logo_url: ''
  });

  useEffect(() => {
    if (businessSettings) {
      const nextForm = {
        business_name: businessSettings.business_name || '',
        tagline: businessSettings.tagline || '',
        phone: businessSettings.phone || '',
        whatsapp: businessSettings.whatsapp || '',
        email: businessSettings.email || '',
        facebook: businessSettings.facebook || '',
        invoice_prefix: businessSettings.invoice_prefix || '',
        invoice_count_start: businessSettings.invoice_count_start || 1,
        invoice_footer_message: businessSettings.invoice_footer_message || '',
        primary_email: businessSettings.primary_email || '',
        address_line1: businessSettings.address_line1 || businessSettings.address || '',
        business_hours: businessSettings.business_hours || '',
        low_stock_alert_quantity: businessSettings.low_stock_alert_quantity || 12,
        logo_url: businessSettings.logo_url || ''
      };
      setBusinessForm(prev => {
        return JSON.stringify(prev) === JSON.stringify(nextForm) ? prev : nextForm;
      });
    }
  }, [businessSettings]);

  const handleBusinessSubmit = () => {
    updateBusinessSettings(businessForm);
  };

  // Check permissions for tabs
  const canViewBusiness = hasPermission('settings.view_business') || hasPermission('settings.edit_business');
  const canEditBusiness = hasPermission('settings.edit_business');
  const canManageNotifications = hasPermission('settings.manage_notifications');
  const canChangePassword = hasPermission('settings.change_password');
  // Debug logging
  console.log('Settings Permissions:', {
    canViewBusiness,
    canEditBusiness,
    canManageNotifications,
    canChangePassword,
    hasViewPermission: hasPermission('settings.view_business'),
    hasEditPermission: hasPermission('settings.edit_business')
  });

  // Determine default tab
  const defaultTab = useMemo(() => {
    if (canViewBusiness) return 'business';
    if (canManageNotifications) return 'notifications';
    if (canChangePassword) return 'security';
    return 'install';
  }, [canViewBusiness, canManageNotifications, canChangePassword]);

  return (
    <div className="space-y-6">

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList className="flex flex-wrap w-full h-auto p-1 gap-1">
          {canViewBusiness && (
            <TabsTrigger value="business" className="text-xs sm:text-sm px-2 py-2 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex-1">Business</TabsTrigger>
          )}
          {canManageNotifications && (
            <TabsTrigger value="notifications" className="text-xs sm:text-sm px-2 py-2 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex-1">Notifications</TabsTrigger>
          )}
          {canChangePassword && (
            <TabsTrigger value="security" className="text-xs sm:text-sm px-2 py-2 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex-1">Security</TabsTrigger>
          )}
          <TabsTrigger value="install" className="text-xs sm:text-sm px-2 py-2 h-auto data-[state=active]:bg-primary data-[state=active]:text-primary-foreground flex-1">Install App</TabsTrigger>
        </TabsList>

        <TabsContent value="business" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Business Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!canEditBusiness && canViewBusiness && (
                <div className="rounded-lg border border-warning/35 bg-warning/12 p-3 text-sm text-warning">
                  <p className="font-medium">Read-Only Access</p>
                  <p className="text-xs mt-1">You have view-only access to business settings. Contact an administrator to request edit permissions.</p>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="businessName">Business Name</Label>
                  <Input
                    id="businessName"
                    value={businessForm.business_name}
                    onChange={(e) => setBusinessForm(prev => ({ ...prev, business_name: e.target.value }))}
                    disabled={!canEditBusiness}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tagline">Slogan / Tagline</Label>
                  <Input
                    id="tagline"
                    placeholder="e.g. WE SUPPLY ALL KINDS OF READY MADE GARMENTS"
                    value={businessForm.tagline}
                    onChange={(e) => setBusinessForm(prev => ({ ...prev, tagline: e.target.value }))}
                    disabled={!canEditBusiness}
                  />
                  <p className="text-xs text-muted-foreground">
                    Displayed below the business name on invoices.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="logo_url">Business Logo</Label>
                  {canEditBusiness ? (
                    <ImagePicker
                      value={businessForm.logo_url}
                      onChange={(url) => setBusinessForm(prev => ({ ...prev, logo_url: url }))}
                      onRemove={() => setBusinessForm(prev => ({ ...prev, logo_url: '' }))}
                    />
                  ) : (
                    <div className="border rounded-md p-2 bg-muted">
                      {businessForm.logo_url ? (
                        <img src={businessForm.logo_url} alt="Business Logo" className="h-20 w-20 object-cover rounded" />
                      ) : (
                        <p className="text-sm text-muted-foreground">No logo set</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    value={businessForm.phone}
                    onChange={(e) => setBusinessForm(prev => ({ ...prev, phone: e.target.value }))}
                    disabled={!canEditBusiness}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">WhatsApp</Label>
                  <Input
                    id="whatsapp"
                    value={businessForm.whatsapp}
                    onChange={(e) => setBusinessForm(prev => ({ ...prev, whatsapp: e.target.value }))}
                    disabled={!canEditBusiness}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="primaryEmail">Email</Label>
                  <Input
                    id="primaryEmail"
                    type="email"
                    value={businessForm.primary_email}
                    onChange={(e) => setBusinessForm(prev => ({ ...prev, primary_email: e.target.value }))}
                    disabled={!canEditBusiness}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="facebook">Facebook</Label>
                  <Input
                    id="facebook"
                    value={businessForm.facebook}
                    onChange={(e) => setBusinessForm(prev => ({ ...prev, facebook: e.target.value }))}
                    disabled={!canEditBusiness}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoicePrefix">Invoice Prefix</Label>
                  <Input
                    id="invoicePrefix"
                    value={businessForm.invoice_prefix}
                    onChange={(e) => setBusinessForm(prev => ({ ...prev, invoice_prefix: e.target.value }))}
                    disabled={!canEditBusiness}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoiceCountStart">Invoice Count Start</Label>
                  <Input
                    id="invoiceCountStart"
                    type="number"
                    min={1}
                    value={businessForm.invoice_count_start}
                    onChange={(e) =>
                      setBusinessForm(prev => ({
                        ...prev,
                        invoice_count_start: Math.max(1, parseInt(e.target.value || "1", 10) || 1),
                      }))
                    }
                    disabled={!canEditBusiness}
                  />
                  <p className="text-xs text-muted-foreground">
                    Set the first invoice number to start counting from (e.g., 200).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessHours">Business Hours</Label>
                  <Input
                    id="businessHours"
                    value={businessForm.business_hours}
                    onChange={(e) => setBusinessForm(prev => ({ ...prev, business_hours: e.target.value }))}
                    disabled={!canEditBusiness}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="addressLine1">Address Line</Label>
                  <Input
                    id="addressLine1"
                    value={businessForm.address_line1}
                    onChange={(e) => setBusinessForm(prev => ({ ...prev, address_line1: e.target.value }))}
                    disabled={!canEditBusiness}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lowStockAlert">Low Stock Alert Quantity</Label>
                  <Input
                    id="lowStockAlert"
                    type="number"
                    min="1"
                    value={businessForm.low_stock_alert_quantity}
                    onChange={(e) => setBusinessForm(prev => ({ ...prev, low_stock_alert_quantity: parseInt(e.target.value) || 12 }))}
                    disabled={!canEditBusiness}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="footerMessage">Invoice Footer Message</Label>
                <Textarea
                  id="footerMessage"
                  value={businessForm.invoice_footer_message}
                  onChange={(e) => setBusinessForm(prev => ({ ...prev, invoice_footer_message: e.target.value }))}
                  disabled={!canEditBusiness} />
              </div>
              {canEditBusiness && (
                <Button onClick={handleBusinessSubmit} disabled={isUpdating}>
                  {isUpdating ? 'Saving...' : 'Save Business Settings'}
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <NotificationsTab />
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <SecurityTab />
        </TabsContent>

        <TabsContent value="install" className="space-y-4">
          <InstallAppTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Settings;
