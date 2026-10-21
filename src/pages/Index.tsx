import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  TrendingUp,
  Package,
  Users,
  DollarSign,
  AlertTriangle,
  Clock,
  ShoppingCart,
  ArrowRight,
  Plus,
  BarChart3,
  CheckCircle2,
  XCircle,
  CreditCard
} from "lucide-react";
import { useDashboard } from "@/hooks/useDashboard";
import { useOverdueCredit } from "@/hooks/useOverdueCredit";
import { SimpleDateRangeFilter } from "@/components/SimpleDateRangeFilter";
import { formatDistanceToNow } from "date-fns";
import { formatInTimeZone } from "@/lib/time";
import { useCurrency } from "@/hooks/useCurrency";
import { DismissibleAlert } from "@/components/DismissibleAlert";
import { usePageSearch } from "@/hooks/usePageSearch";
import { usePageHeaderActions } from "@/hooks/usePageHeaderActions";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { usePageHeaderControls } from "@/hooks/usePageHeaderControls";
import { PermissionGate } from "@/components/PermissionGate";
import { SaleDialog } from "@/components/SaleDialog";
import { ProductDialog } from "@/components/ProductDialog";
import { useIsMobile } from "@/hooks/use-mobile";

const Index = () => {
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const [showSaleDialog, setShowSaleDialog] = useState(false);
  const [showProductDialog, setShowProductDialog] = useState(false);

  const { dashboardStats, isLoading } = useDashboard(startDate, endDate);
  const { data: overdueSales } = useOverdueCredit();
  const { systemSettings } = useSystemSettings();
  const { formatAmount } = useCurrency();
  usePageSearch({ placeholder: "" });

  const handleDismissAlert = (alertId: string) => {
    setDismissedAlerts(prev => [...prev, alertId]);
  };

  const handleDateRangeChange = useCallback((start?: Date, end?: Date) => {
    setStartDate(start);
    setEndDate(end);
  }, []);

  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge variant="outline" className="border-success/35 bg-success/12 text-success">Paid</Badge>;
      case 'partial':
        return <Badge variant="outline" className="border-warning/35 bg-warning/12 text-warning">Partial</Badge>;
      case 'pending':
        return <Badge variant="outline" className="border-warning/35 bg-warning/12 text-warning">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const desktopHeaderControls = useMemo(() => {
    return (
      <SimpleDateRangeFilter
        onDateRangeChange={handleDateRangeChange}
        triggerClassName="min-w-[120px] sm:min-w-[140px]"
      />
    );
  }, [handleDateRangeChange]);

  const desktopQuickActions = useMemo(() => {
    return (
      <TooltipProvider>
        <div className="flex items-center gap-2">
          <PermissionGate permission="sales.create">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-xl"
                  onClick={() => setShowSaleDialog(true)}
                  aria-label="New sale"
                >
                  <ShoppingCart className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New Sale</TooltipContent>
            </Tooltip>
          </PermissionGate>
          <PermissionGate permission="reports.view">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-xl"
                  onClick={() => navigate("/reports")}
                  aria-label="View reports"
                >
                  <BarChart3 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View Reports</TooltipContent>
            </Tooltip>
          </PermissionGate>
          <PermissionGate permission="customers.view">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-xl"
                  onClick={() => navigate("/customers")}
                  aria-label="Customers"
                >
                  <Users className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Customers</TooltipContent>
            </Tooltip>
          </PermissionGate>
          <PermissionGate permission="products.add">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setShowProductDialog(true)}
                  aria-label="Add product"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add Product</TooltipContent>
            </Tooltip>
          </PermissionGate>
        </div>
      </TooltipProvider>
    );
  }, [navigate]);

  const isMobile = useIsMobile();
  usePageHeaderControls(!isMobile ? desktopHeaderControls : null);
  usePageHeaderActions(!isMobile ? desktopQuickActions : null);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 md:hidden">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <SimpleDateRangeFilter
            onDateRangeChange={handleDateRangeChange}
            triggerClassName="h-9 !w-auto !min-w-[132px] rounded-xl px-2 text-xs whitespace-nowrap"
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-2 md:hidden">
        <PermissionGate permission="sales.create">
          <Button
            variant="outline"
            className="h-auto w-full rounded-xl border-border/70 bg-card/80 px-2 py-2 flex flex-col items-center gap-1 text-[11px] hover:bg-primary hover:text-primary-foreground transition-colors"
            onClick={() => setShowSaleDialog(true)}
          >
            <ShoppingCart className="h-4 w-4" />
            <span className="font-medium">Sale</span>
          </Button>
        </PermissionGate>
        <PermissionGate permission="products.add">
          <Button
            variant="outline"
            className="h-auto w-full rounded-xl border-border/70 bg-card/80 px-2 py-2 flex flex-col items-center gap-1 text-[11px] hover:bg-primary hover:text-primary-foreground transition-colors"
            onClick={() => setShowProductDialog(true)}
          >
            <Plus className="h-4 w-4" />
            <span className="font-medium">Product</span>
          </Button>
        </PermissionGate>
        <PermissionGate permission="reports.view">
          <Button
            variant="outline"
            className="h-auto w-full rounded-xl border-border/70 bg-card/80 px-2 py-2 flex flex-col items-center gap-1 text-[11px] hover:bg-primary hover:text-primary-foreground transition-colors"
            onClick={() => navigate("/reports")}
          >
            <BarChart3 className="h-4 w-4" />
            <span className="font-medium">Reports</span>
          </Button>
        </PermissionGate>
        <PermissionGate permission="customers.view">
          <Button
            variant="outline"
            className="h-auto w-full rounded-xl border-border/70 bg-card/80 px-2 py-2 flex flex-col items-center gap-1 text-[11px] hover:bg-primary hover:text-primary-foreground transition-colors"
            onClick={() => navigate("/customers")}
          >
            <Users className="h-4 w-4" />
            <span className="font-medium">Customers</span>
          </Button>
        </PermissionGate>
      </div>

      <SaleDialog open={showSaleDialog} onOpenChange={setShowSaleDialog} />
      <ProductDialog open={showProductDialog} onOpenChange={setShowProductDialog} />

      {/* Revenue Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 md:!mt-0">
        <Card className="relative overflow-hidden border-primary/30 bg-primary text-primary-content">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-primary-content/85">Today's Revenue</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-content/15">
              <DollarSign className="h-4 w-4 text-primary-content" />
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="text-2xl font-semibold">
              {isLoading ? <Skeleton className="h-8 w-24 bg-primary-content/20" /> : formatAmount(dashboardStats?.todayRevenue || 0)}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-primary-content/75">
              {dashboardStats?.todayOrders || 0} orders
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="text-2xl font-semibold">
              {isLoading ? <Skeleton className="h-8 w-24" /> : formatAmount(dashboardStats?.thisWeekRevenue || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Week revenue
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <TrendingUp className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="text-2xl font-semibold">
              {isLoading ? <Skeleton className="h-8 w-24" /> : formatAmount(dashboardStats?.thisMonthRevenue || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Month revenue
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Due</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/12 text-warning">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="text-2xl font-semibold text-warning">
              {isLoading ? <Skeleton className="h-8 w-24" /> : formatAmount(dashboardStats?.totalDue || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {startDate && endDate ? "For selected period" : "All time due"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/70 bg-card/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {isLoading ? <Skeleton className="h-8 w-24" /> : formatAmount(dashboardStats?.totalRevenue || 0)}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <div className="text-success">
                <CheckCircle2 className="mr-1 inline h-3 w-3" />
                Paid: {formatAmount(dashboardStats?.totalPaid || 0)}
              </div>
              <div className="text-warning">
                <Clock className="mr-1 inline h-3 w-3" />
                COD: {formatAmount(dashboardStats?.codDue || 0)}
              </div>
              <div className="text-secondary">
                <CreditCard className="mr-1 inline h-3 w-3" />
                Credit: {formatAmount(dashboardStats?.creditDue || 0)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Units Sold</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="p-[14px]">
            <div className="text-2xl font-bold">
              {isLoading ? <Skeleton className="h-8 w-24" /> : (dashboardStats?.unitsSold.toLocaleString() || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {startDate && endDate ? "For selected period" : "All time"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {isLoading ? <Skeleton className="h-8 w-24" /> : (dashboardStats?.totalProducts || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              In inventory
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/80">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {isLoading ? <Skeleton className="h-8 w-24" /> : (dashboardStats?.activeCustomers || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {startDate && endDate ? "For selected period" : "Total customers"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Sales */}
        <Card className="border-border/70 bg-card/80">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Sales</CardTitle>
              <CardDescription>Latest transactions</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/sales")}
              className="hidden text-xs md:inline-flex"
            >
              View All
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-4">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="space-y-1 flex-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                ))}
              </div>
            ) : dashboardStats?.recentSales.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No recent sales</p>
              </div>
            ) : (
              <div className="space-y-3">
                {dashboardStats?.recentSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-background/80 p-3 transition-colors hover:bg-muted/40 cursor-pointer"
                    onClick={() => navigate(`/sales`)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-sm truncate">{sale.invoice_number}</p>
                        {getPaymentStatusBadge(sale.payment_status)}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{sale.customer_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatInTimeZone(
                          new Date(sale.created_at),
                          "MMM dd, yyyy HH:mm",
                          systemSettings.timezone,
                        )}
                      </p>
                    </div>
                    <div className="ml-2 sm:ml-4 text-right">
                      <p className="font-semibold text-sm">{formatAmount(sale.grand_total)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 md:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/sales")}
                className="w-full rounded-xl text-xs"
              >
                View All
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Top Selling Products */}
        <Card className="border-border/70 bg-card/80">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Top Selling Products</CardTitle>
              <CardDescription>Best performers</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/products")}
              className="hidden text-xs md:inline-flex"
            >
              View All
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </CardHeader>
          <CardContent className="p-4">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : dashboardStats?.topProducts.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No sales data available</p>
              </div>
            ) : (
              <div className="space-y-3">
                {dashboardStats?.topProducts.map((product, index) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-background/80 p-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-bold text-primary">{index + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {product.quantity_sold} units sold
                        </p>
                      </div>
                    </div>
                    <div className="ml-4 text-right">
                      <p className="font-semibold text-sm">{formatAmount(product.revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 md:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/products")}
                className="w-full rounded-xl text-xs"
              >
                View All
                <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts Section */}
      {overdueSales && overdueSales.length > 0 && !dismissedAlerts.includes("overdue-credit") && (
        <DismissibleAlert
          id="overdue-credit"
          title={`${overdueSales.length} Overdue Credit Sales`}
          message="You have credit sales past their due date"
          type="error"
          onDismiss={handleDismissAlert}
        />
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Low Stock Alerts */}
        <Card className="border-warning/35 bg-card/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Low Stock Alerts
            </CardTitle>
            <CardDescription>
              Products running low on inventory
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            ) : dashboardStats?.lowStockProducts.length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No low stock alerts</p>
              </div>
            ) : (
              dashboardStats?.lowStockProducts
                .filter(product => !dismissedAlerts.includes(`low-stock-${product.id}`))
                .map((product) => (
                  <DismissibleAlert
                    key={product.id}
                    id={`low-stock-${product.id}`}
                    title={product.name}
                    message={`${product.sku ? `SKU: ${product.sku} - ` : ""}Only ${product.stock_quantity} items left in stock`}
                    type={product.stock_quantity <= 5 ? "error" : "warning"}
                    onDismiss={handleDismissAlert}
                    variant="inline"
                  />
                ))
            )}
          </CardContent>
        </Card>

        {/* Out of Stock */}
        <Card className="border-error/35 bg-card/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <XCircle className="h-5 w-5 text-error" />
              Out of Stock
            </CardTitle>
            <CardDescription>
              Products that need restocking
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            ) : dashboardStats?.outOfStockProducts.length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">All products in stock</p>
              </div>
            ) : (
              dashboardStats?.outOfStockProducts
                .filter(product => !dismissedAlerts.includes(`out-of-stock-${product.id}`))
                .map((product) => (
                  <DismissibleAlert
                    key={product.id}
                    id={`out-of-stock-${product.id}`}
                    title={product.name}
                    message={`${product.sku ? `SKU: ${product.sku} - ` : ""}Currently out of stock`}
                    type="error"
                    onDismiss={handleDismissAlert}
                    variant="inline"
                  />
                ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pending Payments */}
      <Card className="border-border/70 bg-card/80">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-warning" />
              Pending Payments
            </CardTitle>
            <CardDescription>
              Invoices with outstanding dues
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/sales")}
            className="hidden text-xs md:inline-flex"
          >
            View All
            <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </CardHeader>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          ) : dashboardStats?.pendingPayments.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No pending payments</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dashboardStats?.pendingPayments
                .filter(payment => !dismissedAlerts.includes(`pending-payment-${payment.id}`))
                .map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between rounded-xl border border-border/60 bg-background/80 p-4 transition-colors hover:bg-muted/40 cursor-pointer"
                    onClick={() => navigate("/sales")}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-sm">{payment.invoice_number}</p>
                        <Badge variant="outline" className="border-warning/35 bg-warning/12 text-warning">
                          Pending
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{payment.customer_name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(payment.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="ml-2 sm:ml-4 text-right">
                      <p className="font-semibold text-lg text-warning">
                        {formatAmount(payment.amount_due)}
                      </p>
                      <p className="text-xs text-muted-foreground">Due</p>
                    </div>
                  </div>
                ))}
            </div>
          )}
          <div className="mt-3 md:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/sales")}
              className="w-full rounded-xl text-xs"
            >
              View All
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;
