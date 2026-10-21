export interface SaleData {
    id: string;
    invoice_number: string;
    created_at: string;
    customer_name: string;
    customer_phone?: string;
    customer_whatsapp?: string;
    customer_address?: string;
    customer_email?: string;
    subtotal: number;
    discount_percent?: number;
    discount_amount?: number;
    grand_total: number;
    amount_paid?: number;
    amount_due?: number;
    review_amount_paid?: number | null;
    review_amount_due?: number | null;
    payment_method: string;
    payment_terms?: string;
    courier_name?: string | null;
    cn_number?: string | null;
    fee?: number;
    sale_items?: Array<{
        id: string;
        product_name: string;
        quantity: number;
        rate: number;
        sale_price?: number | null;
        total: number;
        variant_id?: string;
        variant_attributes?: Record<string, string> | string | string[] | null;
        attributes?: Record<string, string> | string | string[] | null;
        variant_label?: string | null;
        description_for_print?: string | null;
    }>;
    sale_payments?: Array<{
        method: string;
        amount: number;
    }>;
}
