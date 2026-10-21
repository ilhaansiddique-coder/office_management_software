import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMockDataContext } from "@/contexts/MockDataContext";

export const useCustomerCredit = (customerId?: string) => {
    const { scaleSalesData } = useMockDataContext();
    return useQuery({
        queryKey: ["customer-credit", customerId],
        queryFn: async () => {
            if (!customerId) return null;

            // Get customer credit limit
            const { data: customer } = await supabase
                .from("customers")
                .select("credit_limit")
                .eq("id", customerId)
                .single();

            // Get all credit sales for this customer
            const { data: creditSales } = await supabase
                .from("sales")
                .select("grand_total, amount_paid, fee, payment_terms")
                .eq("customer_id", customerId)
                .eq("payment_terms", "credit")
                .not("courier_status", "in", "(cancelled,returned,lost)");

            const creditUsed = scaleSalesData((creditSales as any[]) || []).reduce((sum, sale) => {
                const netTotal = (sale.grand_total || 0) - (sale.fee || 0);
                const due = Math.max(0, netTotal - (sale.amount_paid || 0));
                return sum + due;
            }, 0);

            const creditLimit = customer?.credit_limit || 0;
            const creditAvailable = Math.max(0, creditLimit - creditUsed);

            return {
                creditLimit,
                creditUsed,
                creditAvailable,
                utilizationPercent: creditLimit > 0 ? (creditUsed / creditLimit) * 100 : 0,
            };
        },
        enabled: !!customerId,
    });
};
