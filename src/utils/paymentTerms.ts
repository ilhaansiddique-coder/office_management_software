import { parseDateInputParts } from "@/lib/time";

// Payment Terms Utility Functions

export type PaymentTerms = 'immediate' | 'cod' | 'credit';

/**
 * Calculate due date based on sale date and credit days
 */
export const calculateDueDate = (saleDate: string, creditDays: number): string => {
    const parts = parseDateInputParts(saleDate);
    const date = parts
        ? new Date(parts.year, parts.month - 1, parts.day)
        : new Date(saleDate);

    if (Number.isNaN(date.getTime())) {
        const fallback = new Date();
        fallback.setDate(fallback.getDate() + creditDays);
        return fallback.toISOString().split('T')[0];
    }

    date.setDate(date.getDate() + creditDays);
    return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
};

/**
 * Get payment terms display label
 */
export const getPaymentTermsLabel = (terms: PaymentTerms): string => {
    const labels: Record<PaymentTerms, string> = {
        immediate: 'Pay Now',
        cod: 'Cash on Delivery (COD)',
        credit: 'Pay Later'
    };
    return labels[terms];
};

/**
 * Determine default payment status based on payment terms
 */
export const getDefaultPaymentStatus = (
    terms: PaymentTerms,
    amountPaid: number,
    grandTotal: number
): 'paid' | 'pending' | 'partial' => {
    if (amountPaid >= grandTotal) return 'paid';
    if (amountPaid > 0) return 'partial';

    // For immediate payment, default to pending until paid
    // For COD and credit, also pending
    return 'pending';
};

/**
 * Validate credit days input
 */
export const validateCreditDays = (days: number): boolean => {
    return days > 0 && days <= 365 && Number.isInteger(days);
};
