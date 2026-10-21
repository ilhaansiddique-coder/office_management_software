import { supabase } from "@/integrations/supabase/client";

export interface InvoiceWebhookData {
  invoice_number: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  sale_date: string;
  items: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  grand_total: number;
  payment_status: string;
  courier_status: string;
  notes?: string;
}

export interface SystemSettings {
  invoice_webhook_url?: string;
  invoice_webhook_enabled?: boolean;
  invoice_webhook_auth_token?: string;
  invoice_webhook_timeout?: number;
}

/**
 * Get system settings for invoice webhook
 */
export async function getInvoiceWebhookSettings(): Promise<SystemSettings | null> {
  try {
    const { data, error } = await supabase
      .from("system_settings")
      .select("invoice_webhook_url, invoice_webhook_enabled, invoice_webhook_auth_token, invoice_webhook_timeout")
      .limit(1)
      .single();

    if (error) {
      console.error("Error fetching invoice webhook settings:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Error fetching invoice webhook settings:", error);
    return null;
  }
}

/**
 * Send invoice data to external webhook
 */
export async function sendInvoiceWebhook(invoiceData: InvoiceWebhookData): Promise<{ success: boolean; error?: string }> {
  try {
    // Get webhook settings
    const settings = await getInvoiceWebhookSettings();
    
    if (!settings?.invoice_webhook_enabled || !settings.invoice_webhook_url) {
      console.log("Invoice webhook is disabled or URL not configured");
      return { success: true }; // Not an error, just not configured
    }

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add authentication token if provided
    if (settings.invoice_webhook_auth_token) {
      headers['Authorization'] = `Bearer ${settings.invoice_webhook_auth_token}`;
    }

    // Set timeout
    const timeout = Math.max(5, Math.min(120, settings.invoice_webhook_timeout || 30)) * 1000;

    // Send webhook request
    const response = await fetch(settings.invoice_webhook_url, {
      method: 'POST',
      headers,
      body: JSON.stringify(invoiceData),
      signal: AbortSignal.timeout(timeout)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Webhook request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    console.log("Invoice webhook sent successfully");
    return { success: true };

  } catch (error: any) {
    console.error("Error sending invoice webhook:", error);
    
    // Don't throw error to prevent breaking the sale creation process
    // Just log it and return failure
    return { 
      success: false, 
      error: error.name === 'AbortError' 
        ? 'Webhook timeout - request took too long to respond'
        : error.message || 'Unknown webhook error'
    };
  }
}

/**
 * Prepare invoice data from sale and related data
 */
export async function prepareInvoiceData(saleId: string): Promise<InvoiceWebhookData | null> {
  try {
    // Get sale data
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .select(`
        *,
        customers (
          name,
          phone,
          email
        )
      `)
      .eq('id', saleId)
      .single();

    if (saleError || !sale) {
      console.error("Error fetching sale data:", saleError);
      return null;
    }

    // Get sale items
    const { data: saleItems, error: itemsError } = await supabase
      .from('sales_items')
      .select(`
        *,
        products (
          name
        ),
        product_variants (
          name,
          attributes
        )
      `)
      .eq('sale_id', saleId);

    if (itemsError) {
      console.error("Error fetching sale items:", itemsError);
      return null;
    }

    // Prepare items data
    const items = saleItems.map(item => {
      const productName = item.product_id 
        ? item.products?.name || 'Unknown Product'
        : item.product_variants?.name || 'Unknown Variant';

      return {
        product_name: productName,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price
      };
    });

    // Prepare invoice data
    const invoiceData: InvoiceWebhookData = {
      invoice_number: sale.invoice_number,
      customer_name: sale.customers?.name || sale.customer_name || 'Unknown Customer',
      customer_phone: sale.customers?.phone || sale.customer_phone,
      customer_email: sale.customers?.email || sale.customer_email,
      sale_date: sale.created_at,
      items,
      subtotal: sale.subtotal || 0,
      tax_amount: sale.tax_amount || 0,
      discount_amount: sale.discount_amount || 0,
      grand_total: sale.grand_total || 0,
      payment_status: sale.payment_status || 'pending',
      courier_status: sale.courier_status || 'not_sent',
      notes: sale.notes
    };

    return invoiceData;

  } catch (error) {
    console.error("Error preparing invoice data:", error);
    return null;
  }
}

