import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { formatInTimeZone, toZonedDate } from "@/lib/time";
import { useMockDataContext } from "@/contexts/MockDataContext";

export interface OverdueSale {
    id: string;
    invoice_number: string;
    customer_name: string;
    grand_total: number;
    amount_paid: number;
    amount_due: number;
    due_date: string;
    credit_days: number;
    daysOverdue: number;
}

export const useOverdueCredit = () => {
    const { systemSettings } = useSystemSettings();
    const { scaleSalesData } = useMockDataContext();
    return useQuery({
        queryKey: ["overdue-credit", systemSettings.timezone],
        queryFn: async () => {
            const today = formatInTimeZone(new Date(), "yyyy-MM-dd", systemSettings.timezone);

            const { data: overdueSales } = await supabase
                .from("sales")
                .select("id, invoice_number, customer_name, grand_total, amount_paid, amount_due, due_date, credit_days, fee")
                .eq("payment_terms", "credit")
                .lt("due_date", today)
                .gt("amount_due", 0)
                .not("courier_status", "in", "(cancelled,returned,lost)")
                .order("due_date", { ascending: true });

            const salesWithOverdue: OverdueSale[] = scaleSalesData((overdueSales as any[]) || []).map(sale => {
                const dueDate = toZonedDate(new Date(sale.due_date), systemSettings.timezone);
                const todayDate = toZonedDate(new Date(today), systemSettings.timezone);
                const daysOverdue = Math.floor((todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

                return {
                    id: sale.id,
                    invoice_number: sale.invoice_number,
                    customer_name: sale.customer_name,
                    grand_total: sale.grand_total || 0,
                    amount_paid: sale.amount_paid || 0,
                    amount_due: sale.amount_due || 0,
                    due_date: sale.due_date,
                    credit_days: sale.credit_days || 0,
                    daysOverdue,
                };
            });

            return salesWithOverdue;
        },
    });
};
