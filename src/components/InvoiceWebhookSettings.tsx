import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ExternalLink, TestTube, Save, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/utils/toast";

export function InvoiceWebhookSettings() {
  const { systemSettings, updateSystemSettings, isUpdating } = useSystemSettings();
  
  const [webhookForm, setWebhookForm] = useState({
    invoice_webhook_url: '',
    invoice_webhook_enabled: false,
    invoice_webhook_auth_token: '',
    invoice_webhook_timeout: 30
  });

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Load existing settings
  useEffect(() => {
    if (systemSettings) {
      setWebhookForm({
        invoice_webhook_url: systemSettings.invoice_webhook_url || '',
        invoice_webhook_enabled: systemSettings.invoice_webhook_enabled || false,
        invoice_webhook_auth_token: systemSettings.invoice_webhook_auth_token || '',
        invoice_webhook_timeout: systemSettings.invoice_webhook_timeout || 30
      });
    }
  }, [systemSettings]);

  const handleSave = async () => {
    try {
      console.log("Saving invoice webhook settings:", webhookForm);
      await updateSystemSettings(webhookForm);
      toast.success("Invoice webhook settings saved successfully");
    } catch (error: any) {
      console.error('Error saving invoice webhook settings:', error);
      const errorMessage = error?.message || error?.toString() || "Unknown error";
      toast.error(`Failed to save invoice webhook settings: ${errorMessage}`);
    }
  };

  const handleTestWebhook = async () => {
    if (!webhookForm.invoice_webhook_url) {
      toast.error("Please enter a webhook URL first");
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      // Create test invoice data
      const testInvoiceData = {
        invoice_number: "TEST-" + Date.now(),
        customer_name: "Test Customer",
        customer_phone: "+1234567890",
        customer_email: "test@example.com",
        sale_date: new Date().toISOString(),
        items: [
          {
            product_name: "Test Product",
            quantity: 1,
            unit_price: 100.00,
            total_price: 100.00
          }
        ],
        subtotal: 100.00,
        tax_amount: 0.00,
        discount_amount: 0.00,
        grand_total: 100.00,
        payment_status: "paid",
        courier_status: "not_sent",
        notes: "This is a test invoice from the webhook system"
      };

      const response = await fetch(webhookForm.invoice_webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(webhookForm.invoice_webhook_auth_token && {
            'Authorization': `Bearer ${webhookForm.invoice_webhook_auth_token}`
          })
        },
        body: JSON.stringify(testInvoiceData),
        signal: AbortSignal.timeout(webhookForm.invoice_webhook_timeout * 1000)
      });

      if (response.ok) {
        setTestResult({
          success: true,
          message: `Webhook test successful! Status: ${response.status}`
        });
        toast.success("Webhook test successful");
      } else {
        setTestResult({
          success: false,
          message: `Webhook test failed! Status: ${response.status} - ${response.statusText}`
        });
        toast.error("Webhook test failed");
      }
    } catch (error: any) {
      const errorMessage = error.name === 'AbortError' 
        ? 'Request timeout - webhook took too long to respond'
        : `Webhook test failed: ${error.message}`;
      
      setTestResult({
        success: false,
        message: errorMessage
      });
      toast.error("Webhook test failed");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="webhook-enabled">Enable Invoice Webhook</Label>
            <p className="text-sm text-muted-foreground">
              Send sales data to external invoice API when a sale is created
            </p>
          </div>
          <Switch
            id="webhook-enabled"
            checked={webhookForm.invoice_webhook_enabled}
            onCheckedChange={(checked) => 
              setWebhookForm(prev => ({ ...prev, invoice_webhook_enabled: checked }))
            }
          />
        </div>

        {webhookForm.invoice_webhook_enabled && (
          <>
            <Separator />
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="webhook-url">Webhook URL</Label>
                <Input
                  id="webhook-url"
                  type="url"
                  placeholder="https://your-invoice-api.com/webhook"
                  value={webhookForm.invoice_webhook_url}
                  onChange={(e) => 
                    setWebhookForm(prev => ({ ...prev, invoice_webhook_url: e.target.value }))
                  }
                />
                <p className="text-sm text-muted-foreground mt-1">
                  The external API endpoint that will receive invoice data
                </p>
              </div>

              <div>
                <Label htmlFor="auth-token">Authentication Token (Optional)</Label>
                <Input
                  id="auth-token"
                  type="password"
                  placeholder="Bearer token or API key"
                  value={webhookForm.invoice_webhook_auth_token}
                  onChange={(e) => 
                    setWebhookForm(prev => ({ ...prev, invoice_webhook_auth_token: e.target.value }))
                  }
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Optional authentication token for the webhook
                </p>
              </div>

              <div>
                <Label htmlFor="timeout">Timeout (seconds)</Label>
                <Input
                  id="timeout"
                  type="number"
                  min="5"
                  max="120"
                  value={webhookForm.invoice_webhook_timeout}
                  onChange={(e) => 
                    setWebhookForm(prev => ({ ...prev, invoice_webhook_timeout: parseInt(e.target.value) || 30 }))
                  }
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Maximum time to wait for webhook response (5-120 seconds)
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium">Webhook Data Format</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  The following data will be sent to your webhook when a sale is created:
                </p>
                <div className="bg-muted p-4 rounded-lg">
                  <pre className="text-xs overflow-x-auto">
{`{
  "invoice_number": "INV-001",
  "customer_name": "John Doe",
  "customer_phone": "+1234567890",
  "customer_email": "john@example.com",
  "sale_date": "2024-01-28T10:30:00Z",
  "items": [
    {
      "product_name": "Product Name",
      "quantity": 2,
      "unit_price": 50.00,
      "total_price": 100.00
    }
  ],
  "subtotal": 100.00,
  "tax_amount": 10.00,
  "discount_amount": 5.00,
  "grand_total": 105.00,
  "payment_status": "paid",
  "courier_status": "not_sent",
  "notes": "Additional notes"
}`}
                  </pre>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleTestWebhook}
                  disabled={isTesting || !webhookForm.invoice_webhook_url}
                  variant="outline"
                  size="sm"
                >
                  {isTesting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <TestTube className="h-4 w-4 mr-2" />
                  )}
                  Test Webhook
                </Button>
                
                <Button
                  onClick={handleSave}
                  disabled={isUpdating}
                  size="sm"
                >
                  {isUpdating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Settings
                </Button>
              </div>

              {testResult && (
                <Alert className={testResult.success ? "border-success/35 bg-success/12" : "border-error/35 bg-error/12"}>
                  <div className="flex items-center">
                    {testResult.success ? (
                      <CheckCircle className="h-4 w-4 text-success mr-2" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-error mr-2" />
                    )}
                    <AlertDescription className={testResult.success ? "text-success" : "text-error"}>
                      {testResult.message}
                    </AlertDescription>
                  </div>
                </Alert>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
