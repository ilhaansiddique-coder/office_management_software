import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { eachWeekOfInterval, endOfWeek, startOfWeek } from "date-fns";
import { ArrowLeft, CalendarRange, DollarSign, Package, ShoppingBag, TrendingUp, Users } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, BarChart, Bar } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useSales } from "@/hooks/useSales";
import { useCustomers } from "@/hooks/useCustomers";
import { useProducts } from "@/hooks/useProducts";
import { useCurrency } from "@/hooks/useCurrency";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { usePageSearch } from "@/hooks/usePageSearch";
import { usePageHeaderActions } from "@/hooks/usePageHeaderActions";
import { usePageHeaderControls } from "@/hooks/usePageHeaderControls";
import { SimpleDateRangeFilter } from "@/components/SimpleDateRangeFilter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatInTimeZone, toZonedDate } from "@/lib/time";

type CaseStudySalesItem = {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  product_image_url?: string | null;
  variant_image_url?: string | null;
  quantity: number;
  total: number;
  sales: {
    created_at: string;
    customer_id: string | null;
    customer_name: string;
    invoice_number: string;
    courier_status?: string | null;
    payment_status?: string | null;
    is_deleted?: boolean | null;
  };
};

const titleStyle = { fontFamily: '"Fraunces", Georgia, serif' };

const isExcludedSale = (sale: { courier_status?: string | null; payment_status?: string | null }) => {
  const courierStatus = String(sale.courier_status || "").toLowerCase();
  const paymentStatus = String(sale.payment_status || "").toLowerCase();
  return courierStatus.includes("cancel") || courierStatus.includes("return") || courierStatus.includes("lost") || paymentStatus === "cancelled";
};

const isSuccessfulSale = (sale: { courier_status?: string | null; payment_status?: string | null }) => {
  if (isExcludedSale(sale)) return false;
  const courierStatus = String(sale.courier_status || "").toLowerCase();
  const paymentStatus = String(sale.payment_status || "").toLowerCase();
  return courierStatus.includes("delivered") || courierStatus.includes("completed") || paymentStatus === "paid" || paymentStatus === "pending" || paymentStatus === "partial";
};

const getNetAmount = (sale: { grand_total?: number | null; fee?: number | null }) => Math.max(0, (sale.grand_total || 0) - ((sale as any).fee || 0));
const getNetPaid = (sale: { amount_paid?: number | null; fee?: number | null }) => Math.max(0, (sale.amount_paid || 0) - ((sale as any).fee || 0));
const getSaleRevenue = (sale: { grand_total?: number | null; amount_paid?: number | null; fee?: number | null; payment_status?: string | null }) =>
  String(sale.payment_status || "").toLowerCase() === "partial" ? getNetPaid(sale) : getNetAmount(sale);
const shortenText = (value?: string | null, maxLength = 24) => {
  const text = String(value || "").trim();
  if (!text) return "-";
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…` : text;
};

export default function SalesCaseStudy2026() {
  const navigate = useNavigate();
  const { formatAmount } = useCurrency();
  const { systemSettings } = useSystemSettings();
  const { sales = [], isLoading: salesLoading } = useSales();
  const { customers = [], isLoading: customersLoading } = useCustomers();
  const { products = [], isLoading: productsLoading } = useProducts();
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({
    from: new Date("2026-01-01T00:00:00"),
    to: new Date("2026-03-10T23:59:59"),
  });

  usePageSearch({ placeholder: "" });
  const handleDateRangeChange = useCallback((from?: Date, to?: Date) => {
    setDateRange({ from, to });
  }, []);

  usePageHeaderControls(
    <SimpleDateRangeFilter
      onDateRangeChange={handleDateRangeChange}
      triggerClassName="min-w-[150px] rounded-xl"
    />
  );
  usePageHeaderActions(
    <div className="flex items-center gap-2">
      <Button variant="outline" className="rounded-xl" onClick={() => navigate("/reports")}>
        <ArrowLeft className="h-4 w-4" />
        Reports
      </Button>
    </div>
  );

  const resolveImageUrl = (url?: string | null) => {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    return supabase.storage.from("product-images").getPublicUrl(url).data.publicUrl;
  };

  const { data: salesItems = [], isLoading: salesItemsLoading } = useQuery({
    queryKey: ["sales-case-study-items", dateRange.from?.toISOString(), dateRange.to?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("sales_items")
        .select(`
          id,
          sale_id,
          product_id,
          product_name,
          product_image_url,
          variant_image_url,
          quantity,
          total,
          sales!inner(
            created_at,
            customer_id,
            customer_name,
            invoice_number,
            courier_status,
            payment_status,
            is_deleted
          )
        `);
      if (dateRange.from) {
        query = query.gte("sales.created_at", dateRange.from.toISOString());
      }
      if (dateRange.to) {
        query = query.lte("sales.created_at", dateRange.to.toISOString());
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as CaseStudySalesItem[];
    },
  });

  const isLoading = salesLoading || customersLoading || productsLoading || salesItemsLoading;

  const filteredSales = useMemo(() => sales.filter((sale) => {
    const saleDate = new Date(sale.created_at);
    if (dateRange.from && saleDate < dateRange.from) return false;
    if (dateRange.to && saleDate > dateRange.to) return false;
    return true;
  }), [dateRange.from, dateRange.to, sales]);

  const filteredSalesItems = useMemo(() => salesItems.filter((item) => {
    if (!item.sales || item.sales.is_deleted) return false;
    const itemDate = new Date(item.sales.created_at);
    if (dateRange.from && itemDate < dateRange.from) return false;
    if (dateRange.to && itemDate > dateRange.to) return false;
    return true;
  }), [dateRange.from, dateRange.to, salesItems]);

  const successfulSales = useMemo(() => filteredSales.filter(isSuccessfulSale), [filteredSales]);
  const cancelledSales = useMemo(() => filteredSales.filter(isExcludedSale), [filteredSales]);
  const customerLookup = useMemo(() => new Map(customers.map((customer) => [customer.id, customer])), [customers]);
  const productLookup = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const kpi = useMemo(() => {
    const totalRevenue = successfulSales.reduce((sum, sale) => sum + getSaleRevenue(sale), 0);
    const totalBookedValue = filteredSales.reduce((sum, sale) => sum + getNetAmount(sale), 0);
    const totalUnits = filteredSalesItems.reduce((sum, item) => isExcludedSale(item.sales) ? sum : sum + (Number(item.quantity) || 0), 0);
    const uniqueCustomers = new Set(filteredSales.map((sale) => sale.customer_id || sale.customer_phone || sale.customer_name)).size;
    const totalDue = successfulSales.reduce((sum, sale) => sum + Math.max(0, Number(sale.review_amount_due ?? sale.amount_due ?? 0) || 0), 0);
    const avgOrderValue = successfulSales.length ? totalRevenue / successfulSales.length : 0;
    return {
      totalRevenue,
      totalBookedValue,
      totalUnits,
      uniqueCustomers,
      totalDue,
      avgOrderValue,
      totalOrders: filteredSales.length,
      successfulOrders: successfulSales.length,
      cancelledOrders: cancelledSales.length,
      conversionRate: filteredSales.length ? (successfulSales.length / filteredSales.length) * 100 : 0,
    };
  }, [cancelledSales.length, filteredSales, filteredSalesItems, successfulSales]);

  const weeklyData = useMemo(() => {
    if (filteredSales.length === 0) return [];
    const startSource = dateRange.from || filteredSales.reduce((min, sale) => new Date(sale.created_at) < min ? new Date(sale.created_at) : min, new Date(filteredSales[0].created_at));
    const endSource = dateRange.to || filteredSales.reduce((max, sale) => new Date(sale.created_at) > max ? new Date(sale.created_at) : max, new Date(filteredSales[0].created_at));
    const start = toZonedDate(startSource, systemSettings.timezone);
    const end = toZonedDate(endSource, systemSettings.timezone);
    return eachWeekOfInterval({ start: startOfWeek(start, { weekStartsOn: 1 }), end: endOfWeek(end, { weekStartsOn: 1 }) }, { weekStartsOn: 1 }).map((weekStart) => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const weekSales = filteredSales.filter((sale) => {
        const saleDate = toZonedDate(new Date(sale.created_at), systemSettings.timezone);
        return saleDate >= weekStart && saleDate <= weekEnd;
      });
      const weekSuccessful = weekSales.filter(isSuccessfulSale);
      return {
        week: formatInTimeZone(weekStart, "MMM dd", systemSettings.timezone),
        revenue: weekSuccessful.reduce((sum, sale) => sum + getSaleRevenue(sale), 0),
        orders: weekSales.length,
      };
    });
  }, [dateRange.from, dateRange.to, filteredSales, systemSettings.timezone]);

  const topCustomers = useMemo(() => {
    const saleUnitsBySaleId = new Map<string, number>();
    filteredSalesItems.forEach((item) => saleUnitsBySaleId.set(item.sale_id, (saleUnitsBySaleId.get(item.sale_id) || 0) + (Number(item.quantity) || 0)));
    const aggregates = new Map<string, any>();
    filteredSales.forEach((sale) => {
      const key = sale.customer_id || `${sale.customer_phone || "no-phone"}:${sale.customer_name}`;
      const customer = sale.customer_id ? customerLookup.get(sale.customer_id) : undefined;
      const row = aggregates.get(key) || {
        customerId: sale.customer_id || null,
        name: sale.customer_name,
        phone: customer?.phone ?? sale.customer_phone ?? null,
        whatsapp: customer?.whatsapp ?? sale.customer_whatsapp ?? null,
        address: customer?.address ?? sale.customer_address ?? null,
        orders: 0,
        successfulOrders: 0,
        deliveredOrders: 0,
        pendingOrders: 0,
        returnedCancelledOrders: 0,
        units: 0,
        revenue: 0,
        bookedValue: 0,
        pendingOrderValue: 0,
        deliveredOrderValue: 0,
        due: 0,
        credit: 0,
        lastOrderAt: sale.created_at,
      };
      row.orders += 1;
      row.units += saleUnitsBySaleId.get(sale.id) || 0;
      row.bookedValue += getNetAmount(sale);

      const courierStatus = String(sale.courier_status || "").toLowerCase();
      const paymentTerms = String(sale.payment_terms || "").toLowerCase();
      const paymentMethod = String(sale.payment_method || "").toLowerCase();
      const saleDue = Math.max(0, Number(sale.review_amount_due ?? sale.amount_due ?? 0) || 0);
      const isCreditSale = paymentTerms === "credit" || paymentMethod === "credit";

      if (isSuccessfulSale(sale)) {
        row.successfulOrders += 1;
        row.revenue += getSaleRevenue(sale);
        row.due += saleDue;
        if (isCreditSale) {
          row.credit += saleDue;
        }
      }

      if (courierStatus === "delivered") {
        row.deliveredOrders += 1;
        row.deliveredOrderValue += getNetAmount(sale);
      } else if (isExcludedSale(sale)) {
        row.returnedCancelledOrders += 1;
      } else {
        row.pendingOrders += 1;
        row.pendingOrderValue += getNetAmount(sale);
      }

      if (new Date(sale.created_at) > new Date(row.lastOrderAt)) row.lastOrderAt = sale.created_at;
      aggregates.set(key, row);
    });
    return Array.from(aggregates.values()).map((row: any) => ({ ...row, averageOrderValue: row.successfulOrders ? row.revenue / row.successfulOrders : 0 })).sort((a: any, b: any) => b.revenue - a.revenue || b.orders - a.orders).slice(0, 12);
  }, [customerLookup, filteredSales, filteredSalesItems]);

  const topProducts = useMemo(() => {
    const aggregates = new Map<string, any>();
    filteredSalesItems.forEach((item) => {
      const product = item.product_id ? productLookup.get(item.product_id) : undefined;
      const key = item.product_id || `deleted:${item.product_name}`;
      const row = aggregates.get(key) || {
        productId: item.product_id,
        productName: item.product_name || product?.name || "Unknown Product",
        imageUrl: resolveImageUrl(item.variant_image_url || item.product_image_url || product?.image_url || null),
        sku: product?.sku || null,
        currentStock: Number(product?.stock_quantity || 0),
        orderCount: 0,
        grossQty: 0,
        successfulQty: 0,
        returnedQty: 0,
        revenue: 0,
      };
      const qty = Number(item.quantity) || 0;
      const total = Number(item.total) || 0;
      row.orderCount += 1;
      row.grossQty += qty;
      if (isExcludedSale(item.sales)) row.returnedQty += qty;
      else {
        row.successfulQty += qty;
        row.revenue += total;
      }
      aggregates.set(key, row);
    });
    return Array.from(aggregates.values()).map((row: any) => ({ ...row, averageSellingPrice: row.successfulQty ? row.revenue / row.successfulQty : 0 })).sort((a: any, b: any) => b.revenue - a.revenue || b.successfulQty - a.successfulQty).slice(0, 12);
  }, [filteredSalesItems, productLookup]);

  const courierMix = useMemo(() => {
    const mix = new Map<string, { orders: number; revenue: number }>();
    successfulSales.forEach((sale) => {
      const key = String(sale.courier_name || "Unassigned").trim() || "Unassigned";
      const entry = mix.get(key) || { orders: 0, revenue: 0 };
      entry.orders += 1;
      entry.revenue += getSaleRevenue(sale);
      mix.set(key, entry);
    });
    return Array.from(mix.entries()).map(([name, value]) => ({ name, ...value })).sort((a, b) => b.revenue - a.revenue);
  }, [successfulSales]);
  const courierChartHeight = Math.max(320, courierMix.length * 46);

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-40 w-full rounded-[28px]" /><Skeleton className="h-[460px] w-full rounded-[28px]" /></div>;
  }

  return (
    <div className="space-y-6 pb-8 md:space-y-8">
      <section className="rounded-[30px] border border-amber-200/60 bg-[linear-gradient(135deg,rgba(255,248,230,0.95),rgba(255,255,255,0.98)_45%,rgba(236,247,242,0.98))] p-6 shadow-[0_24px_80px_-36px_rgba(126,83,21,0.38)] md:p-8">
        <div className="space-y-4">
          <Badge variant="outline" className="border-amber-300/70 bg-white/70 text-amber-900">Sales Case Study</Badge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl" style={titleStyle}>Dynamic sales case study</h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-700 md:text-base">Generate a dedicated commercial review for any selected period using the application&apos;s current reporting logic for revenue, customer quality, item movement, and courier performance.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-600">
            <Badge variant="outline" className="border-slate-300 bg-white/75 text-slate-700">
              <CalendarRange className="mr-1 h-3.5 w-3.5" />
              {dateRange.from && dateRange.to
                ? `${formatInTimeZone(dateRange.from, "MMMM dd, yyyy", systemSettings.timezone)} to ${formatInTimeZone(dateRange.to, "MMMM dd, yyyy", systemSettings.timezone)}`
                : dateRange.from
                  ? `From ${formatInTimeZone(dateRange.from, "MMMM dd, yyyy", systemSettings.timezone)}`
                  : dateRange.to
                    ? `Until ${formatInTimeZone(dateRange.to, "MMMM dd, yyyy", systemSettings.timezone)}`
                    : "All Time"}
            </Badge>
            <Badge variant="outline" className="border-slate-300 bg-white/75 text-slate-700">{kpi.totalOrders} booked orders</Badge>
            <Badge variant="outline" className="border-slate-300 bg-white/75 text-slate-700">{kpi.uniqueCustomers} unique customers</Badge>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Recognized Revenue", value: formatAmount(kpi.totalRevenue), meta: `${kpi.successfulOrders} successful orders`, icon: DollarSign },
          { label: "Booked Order Value", value: formatAmount(kpi.totalBookedValue), meta: `${kpi.cancelledOrders} cancelled or returned`, icon: TrendingUp },
          { label: "Units Realized", value: `${kpi.totalUnits.toLocaleString("en-US")}`, meta: `${kpi.conversionRate.toFixed(1)}% order conversion`, icon: Package },
          { label: "Average Order Value", value: formatAmount(kpi.avgOrderValue), meta: `${formatAmount(kpi.totalDue)} still outstanding`, icon: Users },
        ].map((metric) => (
          <Card key={metric.label} className="overflow-hidden border-none bg-white shadow-[0_18px_60px_-35px_rgba(15,23,42,0.2)]">
            <CardHeader className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardDescription className="text-xs uppercase tracking-[0.18em] text-slate-500">{metric.label}</CardDescription>
                  <CardTitle className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{metric.value}</CardTitle>
                </div>
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-700"><metric.icon className="h-5 w-5" /></div>
              </div>
            </CardHeader>
            <CardContent className="px-5 pb-5 pt-0 text-sm text-slate-600">{metric.meta}</CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
        <Card className="border-slate-200/70 bg-white shadow-[0_20px_60px_-42px_rgba(15,23,42,0.28)]">
          <CardHeader className="border-b border-slate-100/80 bg-slate-50/70">
            <CardDescription className="text-xs uppercase tracking-[0.18em] text-slate-500">Trendline</CardDescription>
            <CardTitle className="text-3xl text-slate-950" style={titleStyle}>Weekly revenue rhythm</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyData}>
                  <defs>
                    <linearGradient id="studyRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0f766e" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#0f766e" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="week" tick={{ fill: "#475569", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#475569", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} />
                  <RechartsTooltip formatter={(value: number, name: string) => [name === "revenue" ? formatAmount(value) : value, name === "revenue" ? "Revenue" : "Orders"]} />
                  <Area type="monotone" dataKey="revenue" stroke="#0f766e" fill="url(#studyRevenue)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/70 bg-white shadow-[0_20px_60px_-42px_rgba(15,23,42,0.28)]">
          <CardHeader className="border-b border-slate-100/80 bg-slate-50/70">
            <CardDescription className="text-xs uppercase tracking-[0.18em] text-slate-500">Operational Mix</CardDescription>
            <CardTitle className="text-3xl text-slate-950" style={titleStyle}>Courier revenue mix</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div style={{ height: `${courierChartHeight}px` }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={courierMix} layout="vertical" margin={{ left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} tick={{ fill: "#475569", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fill: "#475569", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <RechartsTooltip formatter={(value: number) => [formatAmount(value), "Revenue"]} />
                  <Bar dataKey="revenue" fill="#1d4ed8" radius={[0, 10, 10, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Customer Intelligence</p>
            <h2 className="text-3xl text-slate-950" style={titleStyle}>Top customers by recognized value</h2>
          </div>
          <Badge variant="outline" className="border-slate-300 bg-white text-slate-700">{topCustomers.length} ranked profiles</Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {topCustomers.slice(0, 3).map((customer, index) => (
            <Card key={`${customer.customerId}-${customer.name}`} className="border-slate-200/70 bg-white shadow-[0_20px_60px_-42px_rgba(15,23,42,0.28)]">
              <CardHeader>
                <CardDescription className="text-xs uppercase tracking-[0.18em] text-slate-500">Rank #{index + 1}</CardDescription>
                <CardTitle className="text-2xl text-slate-950">{customer.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-600">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-50 p-3"><div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Orders</div><div className="mt-1 text-xl font-semibold text-slate-950">{customer.orders}</div></div>
                  <div className="rounded-2xl bg-slate-50 p-3"><div className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Units</div><div className="mt-1 text-xl font-semibold text-slate-950">{customer.units}</div></div>
                </div>
                <p><span className="font-medium text-slate-900">Revenue:</span> {formatAmount(customer.revenue)}</p>
                <p><span className="font-medium text-slate-900">Phone:</span> {customer.phone || "-"}</p>
                <p><span className="font-medium text-slate-900">WhatsApp:</span> {customer.whatsapp || "-"}</p>
                <p><span className="font-medium text-slate-900">Address:</span> {customer.address || "-"}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Table
          className="text-[13px]"
          containerClassName="border-slate-200/80 bg-white shadow-[0_20px_60px_-42px_rgba(15,23,42,0.28)]"
        >
          <TableHeader>
            <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
              <TableHead className="h-10 w-[168px] min-w-[168px] px-2 py-2">Customer</TableHead>
              <TableHead className="h-10 w-[128px] min-w-[128px] px-2 py-2">Contact</TableHead>
              <TableHead className="h-10 w-[62px] min-w-[62px] px-2 py-2 text-right">Orders</TableHead>
              <TableHead className="h-10 w-[74px] min-w-[74px] px-2 py-2 text-right">Delivered</TableHead>
              <TableHead className="h-10 w-[68px] min-w-[68px] px-2 py-2 text-right">Pending</TableHead>
              <TableHead className="h-10 w-[92px] min-w-[92px] px-2 py-2 text-right leading-tight" title="Cancelled">Cancelled</TableHead>
              <TableHead className="h-10 w-[74px] min-w-[74px] px-2 py-2 text-right">Units</TableHead>
              <TableHead className="h-10 w-[100px] min-w-[100px] px-2 py-2 text-right leading-tight">Order Value</TableHead>
              <TableHead className="h-10 w-[104px] min-w-[104px] px-2 py-2 text-right leading-tight" title="Pending Order Value">Pending Value</TableHead>
              <TableHead className="h-10 w-[108px] min-w-[108px] px-2 py-2 text-right leading-tight" title="Delivered Orders Value">Delivered Value</TableHead>
              <TableHead className="h-10 w-[92px] min-w-[92px] px-2 py-2 text-right">Due</TableHead>
              <TableHead className="h-10 w-[92px] min-w-[92px] px-2 py-2 text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topCustomers.map((customer) => (
              <TableRow key={`${customer.customerId}-${customer.name}`}>
                <TableCell className="px-2 py-2 align-top">
                  <div className="w-[168px] max-w-[168px]">
                    <div
                      className="whitespace-normal break-words text-[13px] font-semibold leading-snug text-slate-950"
                      title={customer.name}
                    >
                      {shortenText(customer.name, 24)}
                    </div>
                    <div className="text-[11px] leading-snug text-slate-500">
                      Last order: {formatInTimeZone(new Date(customer.lastOrderAt), "MMM dd, yyyy", systemSettings.timezone)}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-2 py-2 align-top text-[13px] text-slate-600">
                  <div className="w-[128px] max-w-[128px] space-y-0.5">
                    <div className="truncate leading-snug" title={customer.phone || "-"}>{customer.phone || "-"}</div>
                    <div className="truncate leading-snug" title={customer.whatsapp || "-"}>{customer.whatsapp || "-"}</div>
                    <div className="whitespace-normal break-words text-[11px] leading-snug" title={customer.address || "-"}>
                      {shortenText(customer.address, 18)}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-2 py-2 text-right tabular-nums">{customer.orders}</TableCell>
                <TableCell className="px-2 py-2 text-right tabular-nums">{customer.deliveredOrders}</TableCell>
                <TableCell className="px-2 py-2 text-right tabular-nums">{customer.pendingOrders}</TableCell>
                <TableCell className="px-2 py-2 text-right tabular-nums">{customer.returnedCancelledOrders}</TableCell>
                <TableCell className="px-2 py-2 text-right tabular-nums">{customer.units}</TableCell>
                <TableCell className="px-2 py-2 text-right font-medium tabular-nums">{formatAmount(customer.bookedValue)}</TableCell>
                <TableCell className="px-2 py-2 text-right tabular-nums">{formatAmount(customer.pendingOrderValue)}</TableCell>
                <TableCell className="px-2 py-2 text-right tabular-nums">{formatAmount(customer.deliveredOrderValue)}</TableCell>
                <TableCell className="px-2 py-2 text-right tabular-nums">{formatAmount(customer.due)}</TableCell>
                <TableCell className="px-2 py-2 text-right tabular-nums">{formatAmount(customer.credit)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Product Performance</p>
          <h2 className="text-3xl text-slate-950" style={titleStyle}>Top sold items and realized movement</h2>
        </div>
        <Table containerClassName="border-slate-200/80 bg-white shadow-[0_20px_60px_-42px_rgba(15,23,42,0.28)]">
          <TableHeader>
            <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
              <TableHead>Item</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead className="text-right">Gross Qty</TableHead>
              <TableHead className="text-right">Realized Qty</TableHead>
              <TableHead className="text-right">Returned Qty</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Avg Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topProducts.map((product) => (
              <TableRow key={`${product.productId}-${product.productName}`}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 overflow-hidden rounded-2xl bg-slate-100">
                      {product.imageUrl ? <img src={product.imageUrl} alt={product.productName} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-slate-400"><ShoppingBag className="h-5 w-5" /></div>}
                    </div>
                    <div><div className="font-semibold text-slate-950">{product.productName}</div><div className="text-xs text-slate-500">{product.sku || "No SKU"}</div></div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-slate-600"><div>Current stock: {product.currentStock}</div></TableCell>
                <TableCell className="text-right">{product.orderCount}</TableCell>
                <TableCell className="text-right">{product.grossQty}</TableCell>
                <TableCell className="text-right">{product.successfulQty}</TableCell>
                <TableCell className="text-right">{product.returnedQty}</TableCell>
                <TableCell className="text-right font-medium">{formatAmount(product.revenue)}</TableCell>
                <TableCell className="text-right">{formatAmount(product.averageSellingPrice)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
