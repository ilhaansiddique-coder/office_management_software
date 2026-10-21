import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { startOfDay, endOfDay, startOfWeek, startOfMonth } from "date-fns";
import { toZonedDate } from "@/lib/time";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { useMockDataContext } from "@/contexts/MockDataContext";

export interface DashboardStats {
  totalRevenue: number;
  totalPaid: number;
  totalDue: number;
  codDue: number;
  creditDue: number;
  unitsSold: number;
  totalProducts: number;
  activeCustomers: number;
  totalOrders: number;
  todayRevenue: number;
  todayOrders: number;
  thisWeekRevenue: number;
  thisMonthRevenue: number;
  lowStockProducts: Array<{
    id: string;
    name: string;
    sku: string;
    stock_quantity: number;
  }>;
  outOfStockProducts: Array<{
    id: string;
    name: string;
    sku: string;
  }>;
  pendingPayments: Array<{
    id: string;
    customer_name: string;
    invoice_number: string;
    amount_due: number;
    created_at: string;
  }>;
  recentSales: Array<{
    id: string;
    invoice_number: string;
    customer_name: string;
    grand_total: number;
    payment_status: string;
    created_at: string;
  }>;
  topProducts: Array<{
    id: string;
    name: string;
    quantity_sold: number;
    revenue: number;
  }>;
}

export const useDashboard = (startDate?: Date, endDate?: Date) => {
  const { systemSettings } = useSystemSettings();
  const { user } = useAuth();
  const { scaleMetric, scaleSalesData, scaleSaleItems } = useMockDataContext();
  const getNetAmount = (sale: { grand_total?: number | null; fee?: number | null }) =>
    Math.max(0, (sale.grand_total || 0) - (sale.fee || 0));
  const getNetPaid = (sale: { amount_paid?: number | null; fee?: number | null }) =>
    Math.max(0, (sale.amount_paid || 0) - (sale.fee || 0));
  const getActualPaid = (sale: { amount_paid?: number | null; grand_total?: number | null }) =>
    Math.max(0, (sale.amount_paid ?? 0) || (sale.grand_total || 0));

  const dateFilter = startDate && endDate ? {
    // startDate/endDate are already normalized to the system timezone by the date filter
    start: startOfDay(startDate).toISOString(),
    end: endOfDay(endDate).toISOString()
  } : null;

  const {
    data: dashboardStats,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["dashboard", dateFilter, systemSettings.timezone, systemSettings.mock_data_enabled, systemSettings.mock_data_scale],
    queryFn: async () => {
      const stats: DashboardStats = {
        totalRevenue: 0,
        totalPaid: 0,
        totalDue: 0,
        codDue: 0,
        creditDue: 0,
        unitsSold: 0,
        totalProducts: 0,
        activeCustomers: 0,
        totalOrders: 0,
        todayRevenue: 0,
        todayOrders: 0,
        thisWeekRevenue: 0,
        thisMonthRevenue: 0,
        lowStockProducts: [],
        outOfStockProducts: [],
        pendingPayments: [],
        recentSales: [],
        topProducts: [],
      };

      const now = toZonedDate(new Date(), systemSettings.timezone);
      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const monthStart = startOfMonth(now);

      const baseSalesQuery = () =>
        supabase
          .from("sales")
          .select("*")
          .eq("is_deleted", false)
          .neq("payment_status", "cancelled");

      // Build date filter for selected period stats
      let salesQuery = baseSalesQuery();

      if (dateFilter) {
        salesQuery = salesQuery
          .gte("created_at", dateFilter.start)
          .lte("created_at", dateFilter.end);
      }

      const [salesResult, weekResult, monthResult, todayResult] = await Promise.all([
        salesQuery,
        baseSalesQuery().gte("created_at", weekStart.toISOString()),
        baseSalesQuery().gte("created_at", monthStart.toISOString()),
        baseSalesQuery().gte("created_at", todayStart.toISOString()).lte("created_at", todayEnd.toISOString()),
      ]);

      const sales = scaleSalesData((salesResult.data as any[]) || []);
      const weekSales = scaleSalesData((weekResult.data as any[]) || []);
      const monthSales = scaleSalesData((monthResult.data as any[]) || []);
      const todaySales = scaleSalesData((todayResult.data as any[]) || []);

      if (sales) {
        const rawTotalRevenue = sales.reduce((sum, sale) => sum + getNetAmount(sale), 0);
        stats.totalRevenue = scaleMetric(rawTotalRevenue);
        stats.totalOrders = sales.length;
        stats.activeCustomers = new Set(sales.map(sale => sale.customer_id).filter(Boolean)).size;

        // Calculate paid amount for due (net of fees, based on payment status or delivered)
        const totalPaidForDue = sales.reduce((sum, sale) => {
          const isPaid = sale.payment_status === 'paid' || sale.courier_status === 'delivered';
          return isPaid ? sum + getNetAmount(sale) : sum + getNetPaid(sale);
        }, 0);

        // Calculate paid amount for display (use actual paid amounts, no fee deduction)
        const rawTotalPaid = sales.reduce((sum, sale) => {
          const isPaid = sale.payment_status === 'paid' || sale.courier_status === 'delivered';
          const paidAmount = sale.amount_paid ?? 0;
          const paidTotal = paidAmount > 0 ? paidAmount : (isPaid ? getActualPaid(sale) : 0);
          return sum + paidTotal;
        }, 0);
        stats.totalPaid = scaleMetric(rawTotalPaid);

        // Calculate due from raw values first so mock scaling is applied exactly once.
        stats.totalDue = scaleMetric(Math.max(0, rawTotalRevenue - totalPaidForDue));

        // Calculate COD due (pending COD orders not yet delivered)
        stats.codDue = scaleMetric(sales.reduce((sum, sale) => {
          const paymentTerms = (sale as any).payment_terms || 'immediate';
          if (paymentTerms === 'cod' && sale.courier_status !== 'delivered') {
            const netTotal = getNetAmount(sale);
            const due = Math.max(0, netTotal - getNetPaid(sale));
            return sum + due;
          }
          return sum;
        }, 0));

        // Calculate Credit due (all credit sales with outstanding balance)
        stats.creditDue = scaleMetric(sales.reduce((sum, sale) => {
          const paymentTerms = (sale as any).payment_terms || 'immediate';
          if (paymentTerms === 'credit') {
            const netTotal = getNetAmount(sale);
            const due = Math.max(0, netTotal - getNetPaid(sale));
            return sum + due;
          }
          return sum;
        }, 0));

        stats.todayRevenue = scaleMetric(todaySales.reduce((sum, sale) => sum + getNetAmount(sale), 0));
        stats.todayOrders = todaySales.length;

        // This week's stats
        stats.thisWeekRevenue = scaleMetric(weekSales.reduce((sum, sale) => sum + getNetAmount(sale), 0));

        // This month's stats
        stats.thisMonthRevenue = scaleMetric(monthSales.reduce((sum, sale) => sum + getNetAmount(sale), 0));

        // Recent sales (last 5)
        stats.recentSales = sales
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 5)
          .map(sale => ({
            id: sale.id,
            invoice_number: sale.invoice_number,
            customer_name: sale.customer_name,
            grand_total: scaleMetric(sale.grand_total || 0),
            payment_status: sale.payment_status,
            created_at: sale.created_at,
          }));
      }

      // Get units sold (exclude cancelled sales)
      let unitsQuery = supabase
        .from("sales_items")
        .select("quantity, sales!inner(created_at, payment_status)")
        .neq("sales.payment_status", "cancelled");

      if (dateFilter) {
        unitsQuery = unitsQuery
          .gte("sales.created_at", dateFilter.start)
          .lte("sales.created_at", dateFilter.end);
      }
      unitsQuery = unitsQuery.eq("sales.is_deleted", false);

      const { data: _salesItems } = await unitsQuery;
      const salesItems = _salesItems ? scaleSaleItems(_salesItems) : null;
      if (salesItems) {
        stats.unitsSold = salesItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
      }

      // Get business settings for low stock threshold
      const { data: businessSettings } = await supabase
        .from("business_settings")
        .select("low_stock_alert_quantity")
        .maybeSingle();

      const globalLowStockThreshold = businessSettings?.low_stock_alert_quantity || 12;

      // Get total products
      const { data: products } = await supabase
        .from("products")
        .select("*")
        .eq("is_deleted", false);

      if (products) {
        stats.totalProducts = products.length;

        // Get low stock products
        stats.lowStockProducts = products
          .filter(product => {
            const stockQty = product.stock_quantity || 0;
            const threshold = product.low_stock_threshold ?? globalLowStockThreshold;
            return stockQty > 0 && stockQty <= threshold && !product.has_variants;
          })
          .slice(0, 5)
          .map(product => ({
            id: product.id,
            name: product.name,
            sku: product.sku || '',
            stock_quantity: product.stock_quantity,
          }));

        // Get out of stock products
        stats.outOfStockProducts = products
          .filter(product => {
            const stockQty = product.stock_quantity || 0;
            return stockQty === 0 && !product.has_variants;
          })
          .slice(0, 5)
          .map(product => ({
            id: product.id,
            name: product.name,
            sku: product.sku || '',
          }));
      }

      // Get top selling products
      const { data: _topSalesItems } = await supabase
        .from("sales_items")
        .select(`
          product_id,
          product_name,
          quantity,
          rate,
          sales!inner(created_at, payment_status)
        `)
        .neq("sales.payment_status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(100);

      const topSalesItems = _topSalesItems ? scaleSaleItems(_topSalesItems) : null;
      if (topSalesItems) {
        const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();

        topSalesItems.forEach((item: any) => {
          const productId = item.product_id;
          const quantity = item.quantity || 0;
          const revenue = quantity * (item.rate || 0);

          if (productMap.has(productId)) {
            const existing = productMap.get(productId)!;
            existing.quantity += quantity;
            existing.revenue += revenue;
          } else {
            productMap.set(productId, {
              name: item.product_name || 'Unknown',
              quantity,
              revenue,
            });
          }
        });

        stats.topProducts = Array.from(productMap.entries())
          .map(([id, data]) => ({
            id,
            name: data.name,
            quantity_sold: data.quantity,
            revenue: scaleMetric(data.revenue),
          }))
          .sort((a, b) => b.quantity_sold - a.quantity_sold)
          .slice(0, 5);
      }

      // Get pending payments (exclude cancelled sales)
      const { data: _pendingSales } = await supabase
        .from("sales")
        .select("*")
        .in("payment_status", ["pending", "partial"])
        .gt("amount_due", 0)
        .order("created_at", { ascending: false })
        .limit(5);

      const pendingSales = _pendingSales ? scaleSalesData(_pendingSales as any[]) : null;
      if (pendingSales) {
        stats.pendingPayments = pendingSales.map(sale => ({
          id: sale.id,
          customer_name: sale.customer_name,
          invoice_number: sale.invoice_number,
          amount_due: scaleMetric(sale.amount_due || 0),
          created_at: sale.created_at,
        }));
      }

      return stats;
    },
    enabled: !!user,
  });

  return {
    dashboardStats,
    isLoading,
    error,
  };
};
