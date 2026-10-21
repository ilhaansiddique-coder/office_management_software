import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImagePicker } from "@/components/ImagePicker";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { toast } from "@/utils/toast";

export const BusinessTab = () => {
  const { businessSettings, updateBusinessSettings, isUpdating } = useBusinessSettings();
  
  const [formData, setFormData] = useState({
    business_name: "",
    logo_url: "",
    phone: "",
    whatsapp: "",
    email: "",
    facebook: "",
    invoice_prefix: "",
    invoice_count_start: "1",
    invoice_footer_message: "",
    primary_email: "",
    address_line1: "",
    business_hours: "",
  });

  useEffect(() => {
    if (businessSettings) {
      setFormData({
        business_name: businessSettings.business_name || "",
        logo_url: businessSettings.logo_url || "",
        phone: businessSettings.phone || "",
        whatsapp: businessSettings.whatsapp || "",
        email: businessSettings.email || "",
        facebook: businessSettings.facebook || "",
        invoice_prefix: businessSettings.invoice_prefix || "",
        invoice_count_start: String(businessSettings.invoice_count_start || 1),
        invoice_footer_message: businessSettings.invoice_footer_message || "",
        primary_email: businessSettings.primary_email || "",
        address_line1: businessSettings.address_line1 || businessSettings.address || "",
        business_hours: businessSettings.business_hours || "",
      });
    }
  }, [businessSettings]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedStart = Math.max(1, parseInt(formData.invoice_count_start || "1", 10) || 1);
    updateBusinessSettings({
      ...formData,
      invoice_count_start: parsedStart,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business Information</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="business_name">Business Name</Label>
                <Input
                  id="business_name"
                  value={formData.business_name}
                  onChange={(e) => handleInputChange("business_name", e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="logo_url">Business Logo</Label>
                <ImagePicker
                  value={formData.logo_url}
                  onChange={(url) => handleInputChange("logo_url", url)}
                  onRemove={() => handleInputChange("logo_url", "")}
                />
              </div>


              <div>
                <Label htmlFor="primary_email">Email</Label>
                <Input
                  id="primary_email"
                  type="email"
                  value={formData.primary_email}
                  onChange={(e) => handleInputChange("primary_email", e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input
                  id="whatsapp"
                  value={formData.whatsapp}
                  onChange={(e) => handleInputChange("whatsapp", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="address_line1">Address Line</Label>
                <Input
                  id="address_line1"
                  value={formData.address_line1}
                  onChange={(e) => handleInputChange("address_line1", e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="business_hours">Business Hours</Label>
                <Input
                  id="business_hours"
                  value={formData.business_hours}
                  onChange={(e) => handleInputChange("business_hours", e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="facebook">Facebook</Label>
                <Input
                  id="facebook"
                  value={formData.facebook}
                  onChange={(e) => handleInputChange("facebook", e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="invoice_prefix">Invoice Prefix</Label>
                <Input
                  id="invoice_prefix"
                  value={formData.invoice_prefix}
                  onChange={(e) => handleInputChange("invoice_prefix", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="invoice_count_start">Invoice Count Start</Label>
                <Input
                  id="invoice_count_start"
                  type="number"
                  min={1}
                  value={formData.invoice_count_start}
                  onChange={(e) => handleInputChange("invoice_count_start", e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  The next invoice will start counting from this number.
                </p>
              </div>

              <div>
                <Label htmlFor="invoice_footer_message">Invoice Footer Message</Label>
                <Textarea
                  id="invoice_footer_message"
                  value={formData.invoice_footer_message}
                  onChange={(e) => handleInputChange("invoice_footer_message", e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          </div>

          <Button type="submit" disabled={isUpdating} className="w-full">
            {isUpdating ? "Updating..." : "Update Business Settings"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
