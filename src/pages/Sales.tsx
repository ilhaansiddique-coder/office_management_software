import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Edit, Eye, TrendingUp, TrendingDown, DollarSign, RefreshCw, Trash2, Printer, List, ClipboardCheck, Truck, CreditCard, AlertTriangle, ChevronDown, ChevronUp, PackageCheck, Download, Share2, PackageSearch, X, CheckSquare, Copy, Search } from "lucide-react";
import { startOfMonth, endOfMonth, isWithinInterval, startOfDay, endOfDay, isSameDay } from "date-fns";
import { formatInTimeZone, toZonedDate } from "@/lib/time";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSales } from "@/hooks/useSales";
import { SaleDialog } from "@/components/SaleDialog";
import { EditSaleDialog } from "@/components/EditSaleDialog";
import { SaleDetailsDialog } from "@/components/SaleDetailsDialog";
import { CourierOrderDialog } from "@/components/CourierOrderDialog";
import { CourierStatusDialog } from "@/components/CourierStatusDialog";
import { SimpleDateRangeFilter } from "@/components/SimpleDateRangeFilter";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/useCurrency";
import { useStatusAutoRefresh } from "@/hooks/useStatusAutoRefresh";
import { useWebhookSettings } from "@/hooks/useWebhookSettings";
import { useCourierStatusRealtime } from "@/hooks/useCourierStatusRealtime";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "@/utils/toast";
import { cn } from "@/lib/utils";
import { ManualCourierStatusSelector } from "@/components/ManualCourierStatusSelector";
// import { CourierNameSelector } from "@/components/CourierNameSelector";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { generateCashMemoHTML } from "@/lib/cashMemoTemplate";
import { downloadInvoicePDF } from "@/lib/simpleInvoiceGenerator";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useCourierPaymentRules } from "@/hooks/useCourierPaymentRules";
import { usePageSearch } from "@/hooks/usePageSearch";
import { usePageHeaderControls } from "@/hooks/usePageHeaderControls";
import { usePageHeaderActions } from "@/hooks/usePageHeaderActions";
import { logActivity } from "@/utils/activityLogger";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select as OptionSelect, SelectContent as OptionSelectContent, SelectItem as OptionSelectItem, SelectTrigger as OptionSelectTrigger, SelectValue as OptionSelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { PermissionGate } from "@/components/PermissionGate";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import DOMPurify from 'dompurify';
import { secureStore } from '@/utils/secureStorage';
import { MockDataNotice } from "@/components/MockDataNotice";
import { useMockDataContext } from "@/contexts/MockDataContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Helper to check if courier supports tracking/API integration
const isSupportedCourier = (sale: any) => {
  if (!sale || !sale.courier_name) return false;
  const courier = sale.courier_name.toLowerCase();
  return (
    courier.includes('steadfast') ||
    courier.includes('pathao') ||
    courier.includes('janani') ||
    courier.includes('sundorban')
  );
};

// Function to restore inventory when an order is cancelled
const restoreInventoryForCancelledOrder = async (saleId: string) => {
  try {
    // Check if inventory was already restored to prevent double restoration
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .select('inventory_restored')
      .eq('id', saleId)
      .single();

    if (saleError) {
      console.error('Error fetching sale restore flag:', saleError);
      return;
    }

    if (sale?.inventory_restored) {
      console.log(`Inventory already restored for sale ${saleId}, skipping`);
      return;
    }

    // Get sale items
    const { data: saleItems, error: itemsError } = await supabase
      .from('sales_items')
      .select('*')
      .eq('sale_id', saleId);

    if (itemsError) {
      console.error('Error fetching sale items:', itemsError);
      return;
    }

    if (!saleItems || saleItems.length === 0) {
      console.log('No sale items found for cancelled order');
      return;
    }

    console.log('Restoring inventory for cancelled order items:', saleItems);

    // Restore inventory for each item
    for (const item of saleItems) {
      if (item.variant_id) {
        // Restore variant inventory
        const { data: currentVariant, error: getVariantError } = await supabase
          .from('product_variants')
          .select('stock_quantity')
          .eq('id', item.variant_id)
          .single();

        if (getVariantError) {
          console.error('Error getting variant current stock:', getVariantError);
          continue;
        }

        const { error: variantError } = await supabase
          .from('product_variants')
          .update({
            stock_quantity: (currentVariant.stock_quantity || 0) + item.quantity
          })
          .eq('id', item.variant_id);

        if (variantError) {
          console.error('Error restoring variant inventory:', variantError);
        } else {
          console.log(`Restored ${item.quantity} units to variant ${item.variant_id}`);
        }

        // Log inventory change
        await supabase
          .from('inventory_logs')
          .insert({
            product_id: item.product_id,
            variant_id: item.variant_id,
            type: 'restore_cancellation',
            quantity: item.quantity,
            reason: `Restored due to order cancellation (Sale ID: ${saleId})`
          });
      } else {
        // Restore product inventory
        const { data: currentProduct, error: getProductError } = await supabase
          .from('products')
          .select('stock_quantity')
          .eq('id', item.product_id)
          .single();

        if (getProductError) {
          console.error('Error getting product current stock:', getProductError);
          continue;
        }

        const { error: productError } = await supabase
          .from('products')
          .update({
            stock_quantity: (currentProduct.stock_quantity || 0) + item.quantity
          })
          .eq('id', item.product_id);

        if (productError) {
          console.error('Error restoring product inventory:', productError);
        } else {
          console.log(`Restored ${item.quantity} units to product ${item.product_id}`);
        }

        // Log inventory change
        await supabase
          .from('inventory_logs')
          .insert({
            product_id: item.product_id,
            type: 'restore_cancellation',
            quantity: item.quantity,
            reason: `Restored due to order cancellation (Sale ID: ${saleId})`
          });
      }
    }

    // Mark inventory as restored to prevent double restoration
    const { error: flagError } = await supabase
      .from('sales')
      .update({ inventory_restored: true })
      .eq('id', saleId);

    if (flagError) {
      console.error('Error updating inventory restore flag:', flagError);
    }

    console.log('Inventory restoration completed for cancelled order');
  } catch (error) {
    console.error('Error restoring inventory for cancelled order:', error);
  }
};

interface Sale {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  cancelled_at?: string | null;
  returned_at?: string | null;
  lost_at?: string | null;
  status_changed_at?: string | null;
  grand_total: number;
  payment_terms?: string;
  payment_method?: string | null;
  payment_status: string;
  order_status?: string;
  courier_status?: string;
  courier_name?: string;
  consignment_id?: string;
  cn_number?: string;
  last_status_check?: string;
  estimated_delivery?: string;
  created_at: string;
  amount_paid: number;
  amount_due: number;
  review_amount_paid?: number | null;
  review_amount_due?: number | null;
  sale_payments?: Array<{ method: string; amount: number }>;
  created_by?: string | null;
}

const BULK_COURIER_STATUS_OPTIONS = [
  { value: "not_sent", label: "Not Sent" },
  { value: "pending", label: "Pending" },
  { value: "in_review", label: "In Review" },
  { value: "sent", label: "Sent" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivery_ready", label: "Delivery Ready" },
  { value: "out_for_delivery", label: "Out for Delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "payout_ready", label: "Payout Ready" },
  { value: "returned", label: "Returned" },
  { value: "lost", label: "Lost" },
  { value: "cancelled", label: "Cancelled" },
];

export default function Sales() {
  const [showSaleDialog, setShowSaleDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [detailsSaleId, setDetailsSaleId] = useState<string | null>(null);
  const [showCourierDialog, setShowCourierDialog] = useState(false);
  const [courierSaleId, setCourierSaleId] = useState<string | null>(null);
  const [showCourierStatusDialog, setShowCourierStatusDialog] = useState(false);
  const [courierStatusSale, setCourierStatusSale] = useState<any | null>(null);
  const [showSalesReview, setShowSalesReview] = useState(false);
  const [showDeliveredSection, setShowDeliveredSection] = useState(false);
  const [checkedEntryIds, setCheckedEntryIds] = useState<string[]>([]);
  const [hoveredEntryId, setHoveredEntryId] = useState<string | null>(null);
  const [pendingDeleteSaleId, setPendingDeleteSaleId] = useState<string | null>(null);
  const [pendingDuplicateSaleId, setPendingDuplicateSaleId] = useState<string | null>(null);
  const [selectedSaleIds, setSelectedSaleIds] = useState<string[]>([]);
  const [isBulkStatusUpdating, setIsBulkStatusUpdating] = useState(false);
  const [isBulkPrinting, setIsBulkPrinting] = useState(false);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const printPreviewScrollRef = useRef<HTMLDivElement | null>(null);
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [isRefreshingStatuses, setIsRefreshingStatuses] = useState(false);
  const [refreshingIndividual, setRefreshingIndividual] = useState<string | null>(null);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [printHtml, setPrintHtml] = useState<string>("");
  const [printSaleId, setPrintSaleId] = useState<string | null>(null);
  const [printSaleNumber, setPrintSaleNumber] = useState<string>("");
  const [isBulkPrintPreview, setIsBulkPrintPreview] = useState(false);
  const [bulkPrintLogItems, setBulkPrintLogItems] = useState<Array<{ id: string; invoice: string | null }>>([]);
  const [printOptions, setPrintOptions] = useState<{ size: 'A5' | 'A4'; orientation: 'portrait' | 'landscape'; }>(
    { size: 'A5', orientation: 'portrait' }
  );
  const [previewHeight, setPreviewHeight] = useState<number | null>(null);
  const [previewWidth, setPreviewWidth] = useState<number | null>(null);
  const [showStatusChangesDialog, setShowStatusChangesDialog] = useState(false);
  const [showBulkRefreshDialog, setShowBulkRefreshDialog] = useState(false);
  const [isBulkRefreshing, setIsBulkRefreshing] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState<string>("__none");
  const [duplicatingSaleId, setDuplicatingSaleId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const { query: searchTerm, setQuery: setSearchTerm } = usePageSearch({
    placeholder: isMobile ? "" : "Search invoice, customer, phone, courier name, status...",
  });
  const [courierStatusFilter, setCourierStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  const [userFilter, setUserFilter] = useState<string>("all");
  const { data: users = [] } = useQuery({
    queryKey: ["users-list-sales-associates"],
    queryFn: async () => {
      // Use RPC function to bypass RLS and get all users with roles
      const { data, error } = await supabase.rpc('get_all_users_with_roles');
      if (error) {
        console.error('Failed to fetch users via RPC:', error);
        return [];
      }
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const salesUsers = useMemo(() => {
    return users.filter((user: any) => {
      // Filter to only show sales associates (sales_associate, user, or no role)
      const role = (user.role || '').toLowerCase();
      return role === 'sales_associate' || role === 'salesassociate' || role === 'sales' || role === 'user' || role === '';
    });
  }, [users]);

  const [printSale, setPrintSale] = useState<any>(null);

  const { formatAmount } = useCurrency();
  const queryClient = useQueryClient();
  const { sales = [], rawSales = [], isLoading, error, refetch, deleteSale, getSaleWithItems, createSale } = useSales();
  const { isAdmin } = useUserRole();
  const { businessSettings } = useBusinessSettings();
  const { systemSettings } = useSystemSettings();
  const { scaleSalesData } = useMockDataContext();
  const { getMethodLabel, getMethodConfig, isCreditMethod, isCodMethod } = usePaymentMethods();
  const { getRuleForStatus } = useCourierPaymentRules();

  const userNameById = useMemo(() => {
    return new Map<string, string>(
      users
        .filter((user: any) => user?.id)
        .map((user: any) => [user.id, user.full_name || "Unknown User"])
    );
  }, [users]);

  const getSaleUserName = useCallback((sale: Sale) => {
    if (!sale.created_by) return "System";
    return userNameById.get(sale.created_by) || "Unknown User";
  }, [userNameById]);

  const getSavedCustomerName = useCallback((sale: Sale) => {
    const canonical = String(sale.saved_customer_name || "").trim();
    if (!canonical) return null;
    return canonical.toLowerCase() === String(sale.customer_name || "").trim().toLowerCase()
      ? null
      : canonical;
  }, []);

  const renderSaleCustomerLabel = useCallback((sale: Sale, compact = false) => {
    const savedCustomerName = getSavedCustomerName(sale);

    return (
      <div className="min-w-0">
        <div className="truncate font-semibold">{sale.customer_name}</div>
        {savedCustomerName && (
          <div className={cn("truncate text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
            Saved customer: {savedCustomerName}
          </div>
        )}
      </div>
    );
  }, [getSavedCustomerName]);

  const renderCustomerHoverDetails = useCallback((sale: Sale) => {
    const saleDate = new Date(sale.created_at);
    const savedCustomerName = getSavedCustomerName(sale);
    return (
      <div className="space-y-2 text-sm">
        <div className="border-b border-border/70 pb-2">
          <div className="font-medium text-foreground">{sale.customer_name}</div>
          {savedCustomerName && (
            <div className="mt-1 text-xs text-muted-foreground">Saved customer: {savedCustomerName}</div>
          )}
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground/80">Invoice:</span>
          <span className="text-foreground">{sale.invoice_number || "-"}</span>
          <span className="font-medium text-foreground/80">Seller Name:</span>
          <span className="text-foreground">{getSaleUserName(sale)}</span>
          <span className="font-medium text-foreground/80">Sale Date:</span>
          <span className="text-foreground">{formatInTimeZone(saleDate, "MMM dd, yyyy", systemSettings.timezone)}</span>
          <span className="font-medium text-foreground/80">Sale Time:</span>
          <span className="text-foreground">{formatInTimeZone(saleDate, "hh:mm a", systemSettings.timezone)}</span>
        </div>
      </div>
    );
  }, [getSaleUserName, getSavedCustomerName, systemSettings.timezone]);

  const headerControls = useMemo(() => {
    return (
      <TooltipProvider>
        <div className="grid w-full grid-cols-[calc(64%-0.25rem)_calc(36%-0.25rem)] gap-2 sm:flex sm:w-auto sm:items-center sm:gap-2">
          <div className="hidden md:block">
            <SimpleDateRangeFilter
              onDateRangeChange={(from, to) => setDateRange({ from, to })}
              triggerClassName="min-w-[120px] sm:min-w-[140px]"
            />
          </div>

          <Select value={courierStatusFilter} onValueChange={setCourierStatusFilter}>
            <SelectTrigger className="w-full sm:w-auto min-w-[120px] sm:min-w-[140px] px-3 shadow-none">
              <SelectValue placeholder="All Filters" />
            </SelectTrigger>
            <SelectContent className="w-auto min-w-[140px]">
              <SelectItem value="all" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-muted/60 whitespace-nowrap">
                  All Filters
                </Badge>
              </SelectItem>
              <SelectItem value="not_sent" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-slate-100 text-slate-900 border-slate-200 whitespace-nowrap">
                  Not Sent
                </Badge>
              </SelectItem>
              <SelectItem value="in_review" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-800 border-yellow-200 whitespace-nowrap">
                  In Review
                </Badge>
              </SelectItem>
              <SelectItem value="sent" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800 border-blue-200 whitespace-nowrap">
                  Sent
                </Badge>
              </SelectItem>
              <SelectItem value="in_transit" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800 border-blue-200 whitespace-nowrap">
                  In Transit
                </Badge>
              </SelectItem>
              <SelectItem value="delivery_ready" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-teal-100 text-teal-800 border-teal-200 whitespace-nowrap">
                  Delivery Ready
                </Badge>
              </SelectItem>
              <SelectItem value="out_for_delivery" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-orange-100 text-orange-800 border-orange-200 whitespace-nowrap">
                  Out for Delivery
                </Badge>
              </SelectItem>
              <SelectItem value="delivered" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-emerald-100 text-emerald-800 border-emerald-200 whitespace-nowrap">
                  Delivered
                </Badge>
              </SelectItem>
              <SelectItem value="payout_ready" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-purple-100 text-purple-800 border-purple-200 whitespace-nowrap">
                  Payout Ready
                </Badge>
              </SelectItem>
              <SelectItem value="returned" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-rose-100 text-rose-800 border-rose-200 whitespace-nowrap">
                  Returned
                </Badge>
              </SelectItem>
              <SelectItem value="lost" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-200 whitespace-nowrap">
                  Lost
                </Badge>
              </SelectItem>
              <SelectItem value="cancelled" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-200 whitespace-nowrap">
                  Cancelled
                </Badge>
              </SelectItem>
              <SelectItem value="paid" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-emerald-100 text-emerald-800 border-emerald-200 whitespace-nowrap">
                  Paid
                </Badge>
              </SelectItem>
              <SelectItem value="cod" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-200 whitespace-nowrap">
                  COD
                </Badge>
              </SelectItem>
              <SelectItem value="credit" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-indigo-100 text-indigo-800 border-indigo-200 whitespace-nowrap">
                  Credit
                </Badge>
              </SelectItem>
            </SelectContent>
          </Select>

          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger className="w-full sm:w-auto min-w-[120px] sm:min-w-[140px] px-3 shadow-none">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent className="w-auto min-w-[120px]">
              <SelectItem value="all" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-muted/60 whitespace-nowrap">
                  All Users
                </Badge>
              </SelectItem>
              {salesUsers.map((user: any) => (
                <SelectItem key={user.id} value={user.id} className="pl-2 pr-2">
                  <Badge variant="outline" className="text-xs bg-slate-50 text-slate-700 border-slate-200 whitespace-nowrap">
                    {user.full_name || 'Unknown User'}
                  </Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="md:hidden">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/80 px-2 py-1.5 shadow-sm sm:w-fit">
                  {showSalesReview ? (
                    <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <List className="h-5 w-5 text-muted-foreground" />
                  )}
                  <Switch
                    checked={showSalesReview}
                    onCheckedChange={setShowSalesReview}
                    aria-label="Toggle sales review"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>{showSalesReview ? "Sales Review" : "Sales History"}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>
    );
  }, [courierStatusFilter, userFilter, salesUsers, showSalesReview, isBulkRefreshing, setDateRange, setShowSalesReview]);

  usePageHeaderControls(!isMobile ? headerControls : null);

  // Enable auto-refresh for courier statuses
  useStatusAutoRefresh();

  // Enable real-time updates for courier statuses
  useCourierStatusRealtime();

  // Listen for sales data updates to refresh without page reload
  useEffect(() => {
    const handleSalesUpdate = () => {
      refetch();
    };

    window.addEventListener('salesDataUpdated', handleSalesUpdate);
    return () => window.removeEventListener('salesDataUpdated', handleSalesUpdate);
  }, [refetch]);

  const { webhookSettings, isCourierReady } = useWebhookSettings();

  // Helper to check if a sale should show courier status buttons (refresh & history)
  const shouldShowCourierButtons = useCallback((sale: Sale) => {
    if (!sale.consignment_id && !sale.cn_number) return false;
    const courierName = String(sale.courier_name || "").trim().toLowerCase();
    if (courierName === "steadfast") return isCourierReady("Steadfast");
    if (courierName === "pathao") return isCourierReady("Pathao");
    if (courierName === "sundorban") return true; // Always show for Sundorban if has CN
    if (courierName === "janani" || courierName === "janani express") return true; // Always show for Janani if has CN
    return false;
  }, [isCourierReady]);

  const normalizeMethodKey = useCallback((method?: string | null) => {
    const raw = String(method || "").toLowerCase();
    return raw === "condition" ? "cod" : raw;
  }, []);

  const methodLabelFor = useCallback(
    (method?: string | null) => getMethodLabel(normalizeMethodKey(method)),
    [getMethodLabel, normalizeMethodKey]
  );

  const getMixedMethodLabels = useCallback((sale: Sale) => {
    const rawMethods = (sale.sale_payments || [])
      .map((split) => normalizeMethodKey(split.method))
      .filter(Boolean);
    const unique = Array.from(new Set(rawMethods));
    if (unique.length === 0) {
      const fallback = methodLabelFor((sale as any).payment_method) || "-";
      return fallback;
    }
    return unique.map((method) => methodLabelFor(method)).filter(Boolean).join(", ");
  }, [methodLabelFor, normalizeMethodKey]);

  const methodTypeFor = useCallback(
    (method?: string | null) => getMethodConfig(normalizeMethodKey(method))?.type || "custom",
    [getMethodConfig, normalizeMethodKey]
  );

  const getPaymentBackup = useCallback((saleId: string) => {
    if (typeof window === "undefined") return null;
    return secureStore.getItem<{ amount_paid?: number; amount_due?: number }>(`paymentBackup:${saleId}`);
  }, []);

  const handleManualStatusUpdate = (saleId: string, newStatus: string) => {
    // Trigger a page refresh to update the UI
    refetch();
  };

  const handleCourierNameUpdate = (saleId: string, newCourierName: string) => {
    // Trigger a page refresh to update the UI
    refetch();
  };

  const handleOpenCourierDialog = (sale: any) => {
    // If order is already sent (has consignment_id or cn_number), show status dialog
    if (sale.consignment_id || sale.cn_number) {
      setCourierStatusSale(sale);
      setShowCourierStatusDialog(true);
    } else {
      // Otherwise, show send to courier dialog
      setCourierSaleId(sale.id);
      setShowCourierDialog(true);
    }
  };

  const getCourierDisplayName = (sale: any) => {
    const name = String(sale.courier_name || "").trim();
    return name || "Not set";
  };

  const isSteadfastCourier = (sale: any) =>
    String(sale.courier_name || "").trim().toLowerCase() === "steadfast";

  const canSendToCourier = (sale: any) => {
    const courierName = String(sale.courier_name || "").trim().toLowerCase();
    if (!courierName) return false;
    // Only Steadfast and Pathao support sending via API
    if (courierName === "steadfast") return isCourierReady("Steadfast");
    if (courierName === "pathao") return isCourierReady("Pathao");
    // Other couriers (Sundorban, Janani, AJR, etc.) don't support sending via API
    // They require manual CN entry or external booking
    return false;
  };

  const handleStatusRefresh = async (saleId: string, consignmentId: string, showToast = true) => {
    setRefreshingIndividual(saleId);
    try {
      // First fetch the sale info to know the courier and current status
      const { data: saleInfo, error: saleInfoError } = await supabase
        .from('sales')
        .select('courier_name, courier_status')
        .eq('id', saleId)
        .single();

      if (saleInfoError) {
        throw new Error('Failed to fetch sale info');
      }

      // Skip refresh for orders with final statuses
      const finalStatuses = ['delivered', 'cancelled', 'returned', 'lost'];
      const existingStatus = String(saleInfo.courier_status || '').toLowerCase();
      if (finalStatuses.includes(existingStatus)) {
        if (showToast) {
          toast.info(`Order already has final status: ${existingStatus}`);
        }
        setRefreshingIndividual(null);
        return true;
      }

      const isSteadfast = saleInfo.courier_name === 'Steadfast';
      const isSundorban = saleInfo.courier_name === 'Sundorban';
      const isJanani = saleInfo.courier_name === 'Janani' || saleInfo.courier_name === 'Janani Express';
      const isPathao = saleInfo.courier_name === 'Pathao';

      // Fetch status from courier API
      let newStatus = 'pending';

      if (isSteadfast) {
        const steadfastApiKey = String(webhookSettings?.steadfast_api_key || '').trim();
        const steadfastSecretKey = String(webhookSettings?.steadfast_secret_key || '').trim();
        if (!steadfastApiKey || !steadfastSecretKey) {
          throw new Error('Steadfast credentials not configured');
        }

        const steadfastResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/steadfast-status-check`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              consignment_id: consignmentId,
              api_key: steadfastApiKey,
              secret_key: steadfastSecretKey,
            }),
          }
        );

        const steadfastData = await steadfastResponse.json();

        if (!steadfastResponse.ok) {
          throw new Error(steadfastData.message || 'Failed to fetch status from Steadfast');
        }

        newStatus = steadfastData.delivery_status || 'pending';
        console.log('Steadfast status check response:', steadfastData);
      } else if (isSundorban) {
        const sundorbanResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sundorban-status-check`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              cn_number: consignmentId,
            }),
          }
        );

        const sundorbanData = await sundorbanResponse.json();

        if (!sundorbanResponse.ok) {
          throw new Error(sundorbanData.message || 'Failed to fetch status from Sundorban');
        }

        newStatus = sundorbanData.delivery_status || 'pending';
        console.log('Sundorban status check response:', sundorbanData);
        console.log('Sundorban raw status:', sundorbanData.raw_status);
        console.log('Sundorban mapped status:', sundorbanData.mapped_status);
        console.log('Sundorban delivery_status:', sundorbanData.delivery_status);
      } else if (isJanani) {
        const jananiResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/janani-status-check`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              cn_number: consignmentId,
            }),
          }
        );

        const jananiData = await jananiResponse.json();

        if (!jananiResponse.ok) {
          throw new Error(jananiData.message || 'Failed to fetch status from Janani');
        }

        newStatus = jananiData.delivery_status || 'pending';
        console.log('Janani status check response:', jananiData);
        console.log('Janani raw status:', jananiData.raw_status);
        console.log('Janani mapped status:', jananiData.mapped_status);
      } else if (isPathao) {
        const pathaoResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pathao-status-check`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              consignment_id: consignmentId,
            }),
          }
        );

        const pathaoData = await pathaoResponse.json();

        if (!pathaoResponse.ok) {
          throw new Error(pathaoData.message || 'Failed to fetch status from Pathao');
        }

        newStatus = pathaoData.delivery_status || pathaoData.mapped_status || 'pending';
        console.log('Pathao status check response:', pathaoData);
        console.log('Pathao raw status:', pathaoData.raw_status);
        console.log('Pathao mapped status:', pathaoData.mapped_status);
      } else {
        // For other couriers, use the webhook endpoint
        if (!webhookSettings) {
          throw new Error('Webhook settings not loaded');
        }
        if (!webhookSettings.status_check_webhook_url) {
          console.error('Webhook settings found but missing status_check_webhook_url:', webhookSettings);
          throw new Error('No status check webhook URL configured');
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData.session?.access_token) {
          throw new Error('Authentication required');
        }

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/courier-status-check`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: JSON.stringify({ consignment_id: consignmentId }),
          }
        );

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result?.message || `Status check failed: ${response.status}`);
        }
        console.log('Status check response:', result);

        // Handle the specific response format for non-Steadfast couriers
        const payload = result?.webhook_response ?? result;

        if (Array.isArray(payload) && payload.length > 0) {
          const firstResponse = payload[0];
          if (firstResponse.type === 'success' && firstResponse.data) {
            newStatus = firstResponse.data.order_status || 'pending';
          }
        } else if (payload.data && payload.data.order_status) {
          newStatus = payload.data.order_status;
        } else if (payload.order_status) {
          newStatus = payload.order_status;
        } else if (payload.status) {
          newStatus = payload.status;
        } else if (payload.courier_status) {
          newStatus = payload.courier_status;
        }
      }

      console.log('Extracted courier status:', newStatus);

      // Normalize status for consistent display
      const normalizedStatus = newStatus.toLowerCase().replace(/[^a-z0-9]/g, '_');

      const backupKey = `paymentBackup:${saleId}`;
      const { data: saleSnapshot, error: saleFetchError } = await supabase
        .from('sales')
        .select('payment_status, amount_paid, amount_due, review_amount_paid, review_amount_due, grand_total, fee, payment_terms, payment_method, courier_status, order_status, sale_payments(method, amount), status_backup_payment_status, status_backup_amount_paid, status_backup_amount_due')
        .eq('id', saleId)
        .single();

      if (saleFetchError) {
        throw saleFetchError;
      }

      // Get current user-set status to respect user choices
      const currentStatus = String(saleSnapshot.courier_status || '').toLowerCase();
      const userSetNotSentOrSent = ['not_sent', 'sent'].includes(currentStatus);
      const userSetCancelledType = ['cancelled', 'returned', 'lost'].includes(currentStatus);
      const userSetDelivered = currentStatus === 'delivered';

      let displayStatus = newStatus;

      // If already delivered, keep it delivered (final status)
      if (userSetDelivered) {
        displayStatus = 'delivered';
      }
      // If current status matches the new status, don't reassign
      else if (currentStatus === newStatus.toLowerCase()) {
        displayStatus = currentStatus;
      }
      // Steadfast/Sundorban status mapping with user preference preservation:
      // In review / Unknown ? not_sent/sent (don't change if user already set one of these)
      // Pending ? sent (don't change if user already set it)
      // Delivered ? delivered (always set, and keep if already set)
      // Cancelled types ? cancelled/returned/lost (don't change if user already set any of these)
      else if (normalizedStatus === 'in_review' || normalizedStatus === 'unknown' || normalizedStatus === '') {
        // Keep user's choice if they set not_sent or sent, otherwise default to not_sent
        displayStatus = userSetNotSentOrSent ? currentStatus : 'not_sent';
      } else if (normalizedStatus === 'pending') {
        // Keep user's choice if they already set sent
        displayStatus = currentStatus === 'sent' ? 'sent' : 'sent';
      } else if (normalizedStatus.includes('pickup_cancelled') || normalizedStatus.includes('pickup_cancel') || normalizedStatus.includes('cancelled')) {
        // Keep user's choice if they set cancelled, returned, or lost
        displayStatus = userSetCancelledType ? currentStatus : 'cancelled';
      } else if (normalizedStatus.includes('delivery_ready') || normalizedStatus === 'delivery_ready' ||
        normalizedStatus.includes('ready_for_delivery') || normalizedStatus === 'ready_for_delivery') {
        // Map to delivery_ready (parcel ready for customer pickup)
        displayStatus = 'delivery_ready';
      } else if (normalizedStatus.includes('in_transit') || normalizedStatus.includes('picked_up')) {
        displayStatus = 'in_transit';
      } else if (normalizedStatus.includes('out_for_delivery')) {
        displayStatus = 'out_for_delivery';
      } else if (normalizedStatus.includes('delivered') || normalizedStatus.includes('completed')) {
        displayStatus = 'delivered';
      } else if (normalizedStatus.includes('returned')) {
        // Keep user's choice if they set cancelled, returned, or lost
        displayStatus = userSetCancelledType ? currentStatus : 'returned';
      } else {
        // Default: unknown/unrecognized statuses ? not_sent
        displayStatus = userSetNotSentOrSent ? currentStatus : 'not_sent';
      }

      console.log('Status normalization:', { original: newStatus, normalized: normalizedStatus, current: currentStatus, display: displayStatus });

      const previousPayment = {
        payment_status: saleSnapshot.payment_status,
        amount_paid: saleSnapshot.amount_paid,
        amount_due: saleSnapshot.amount_due,
      };
      const previousStatus = String(saleSnapshot.courier_status || saleSnapshot.order_status || "");
      const statusBackup = {
        payment_status: saleSnapshot.status_backup_payment_status ?? null,
        amount_paid: saleSnapshot.status_backup_amount_paid ?? null,
        amount_due: saleSnapshot.status_backup_amount_due ?? null,
      };
      const hasStatusBackup =
        statusBackup.payment_status !== null ||
        statusBackup.amount_paid !== null ||
        statusBackup.amount_due !== null;
      const allowLocalFallback = typeof navigator !== "undefined" && !navigator.onLine;

      const isDelivered = displayStatus === 'delivered';
      const creditSplitTotal = (saleSnapshot.sale_payments || [])
        .filter((split: any) => normalizeMethodKey(split.method) === "credit")
        .reduce((sum: number, split: any) => sum + (Number(split.amount) || 0), 0);
      const isCreditSale =
        String(saleSnapshot.payment_terms || "").toLowerCase() === "credit" ||
        normalizeMethodKey(saleSnapshot.payment_method || "") === "credit" ||
        creditSplitTotal > 0;
      const rule = getRuleForStatus(displayStatus);
      let paymentStatusUpdate: Record<string, any> = {};

      const applyBackupRestore = () => {
        if (!hasStatusBackup) return false;
        paymentStatusUpdate = {
          payment_status: statusBackup.payment_status,
          amount_paid: statusBackup.amount_paid,
          amount_due: statusBackup.amount_due,
          status_backup_payment_status: null,
          status_backup_amount_paid: null,
          status_backup_amount_due: null,
        };
        return true;
      };

      const applyLocalBackupRestore = () => {
        if (!allowLocalFallback) return false;
        const backup = secureStore.getItem<{ payment_status: string; amount_paid: number; amount_due: number }>(backupKey);
        if (!backup) return false;
        paymentStatusUpdate = {
          payment_status: backup.payment_status,
          amount_paid: backup.amount_paid,
          amount_due: backup.amount_due,
        };
        return true;
      };

      const applyRule = () => {
        const appliedRule = rule || getRuleForStatus("pending");
        if (!appliedRule) return;

        if (appliedRule.use_backup && !hasStatusBackup) {
          paymentStatusUpdate.status_backup_payment_status = previousPayment.payment_status;
          paymentStatusUpdate.status_backup_amount_paid = previousPayment.amount_paid ?? 0;
          paymentStatusUpdate.status_backup_amount_due = previousPayment.amount_due ?? 0;
          if (allowLocalFallback && !secureStore.hasItem(backupKey)) {
            secureStore.setItem(backupKey, previousPayment);
          }
        }

        paymentStatusUpdate.payment_status = appliedRule.payment_status;

        if (appliedRule.amount_paid_behavior === "zero") {
          paymentStatusUpdate.amount_paid = 0;
        } else if (appliedRule.amount_paid_behavior === "cod_collected") {
          const fee = (saleSnapshot as any).fee || 0;
          const codCollected = Math.max(0, (saleSnapshot.amount_due || 0) - fee);
          paymentStatusUpdate.amount_paid = Math.max(
            0,
            (previousPayment.amount_paid || 0) + codCollected
          );
        } else if (appliedRule.amount_paid_behavior === "restore_backup") {
          if (applyBackupRestore()) return;
          if (applyLocalBackupRestore()) return;
        }

        if (appliedRule.amount_due_behavior === "zero") {
          paymentStatusUpdate.amount_due = 0;
        } else if (appliedRule.amount_due_behavior === "restore_backup") {
          if (applyBackupRestore()) return;
          if (applyLocalBackupRestore()) return;
        }
      };

      if (isDelivered) {
        applyRule();
        console.log('Setting payment status to:', paymentStatusUpdate.payment_status);
      } else {
        if (!applyBackupRestore() && !applyLocalBackupRestore()) {
          applyRule();
        }
      }

      if (isCreditSale) {
        paymentStatusUpdate.payment_status = "pending";
        paymentStatusUpdate.amount_paid = previousPayment.amount_paid ?? saleSnapshot.amount_paid ?? 0;
        paymentStatusUpdate.amount_due = previousPayment.amount_due ?? saleSnapshot.amount_due ?? 0;
      }

      if (!Object.keys(paymentStatusUpdate).length) {
        paymentStatusUpdate = { payment_status: 'pending' };
        console.log('Setting payment status to: pending');
      }

      console.log('Payment status update object:', paymentStatusUpdate);

      // Check if status actually changed to avoid redundant updates/logs
      const hasStatusChanged = displayStatus !== previousStatus;
      console.log(`Status check: Previous=${previousStatus}, New=${displayStatus}, Changed=${hasStatusChanged}`);

      // Basic update payload (always update timestamp and sync IDs)
      const updatePayload: any = {
        last_status_check: new Date().toISOString(),
        cn_number: consignmentId, // Ensure CN number is synced
        consignment_id: consignmentId, // Also sync consignment_id if it was missing
      };

      // Only include status/payment fields if status changed
      if (hasStatusChanged) {
        updatePayload.courier_status = displayStatus;
        updatePayload.order_status = displayStatus;
        Object.assign(updatePayload, paymentStatusUpdate);
      }

      // Update the sale in database
      const { error: updateError } = await supabase
        .from('sales')
        .update(updatePayload)
        .eq('id', saleId);

      if (!isDelivered) {
        localStorage.removeItem(backupKey);
      }

      if (updateError) {
        console.error('Failed to update sale status:', updateError);
        if (showToast) toast.error('Failed to update status in database');
        return false;
      }

      if (backupKey) {
        localStorage.removeItem(backupKey);
      }

      if (hasStatusChanged) {
        // Never restore stock for 'lost' � product is gone
        const shouldRestoreInventory = displayStatus !== 'lost' &&
          (rule?.restore_inventory ?? (displayStatus === 'cancelled' || displayStatus === 'returned'));

        // Only restore inventory if previous status was NOT already cancelled/returned/lost
        // This prevents double restoration when user manually set status first
        const previousWasCancelledType = ['cancelled', 'returned', 'lost'].includes(previousStatus.toLowerCase());

        // If order is cancelled or returned, restore inventory (but not if it was already cancelled-type)
        if (shouldRestoreInventory && !previousWasCancelledType) {
          console.log('Order cancelled/returned, restoring inventory...');
          await restoreInventoryForCancelledOrder(saleId);
        } else if (shouldRestoreInventory) {
          console.log(`Order already had cancelled-type status (${previousStatus}), skipping inventory restore`);
        }

        await logActivity({
          action: "update_status",
          entityType: "sales",
          entityId: saleId,
          summary: `Updated sale status to ${displayStatus}`,
          details: {
            old: {
              courier_status: previousStatus || null,
              payment_status: previousPayment.payment_status || null,
              amount_paid: previousPayment.amount_paid ?? 0,
              amount_due: previousPayment.amount_due ?? 0,
            },
            new: {
              courier_status: displayStatus,
              payment_status: paymentStatusUpdate.payment_status ?? previousPayment.payment_status ?? null,
              amount_paid: paymentStatusUpdate.amount_paid ?? previousPayment.amount_paid ?? 0,
              amount_due: paymentStatusUpdate.amount_due ?? previousPayment.amount_due ?? 0,
            },
          },
        });

        console.log('Sale updated successfully in database');
        if (showToast) toast.success(`Status updated to: ${displayStatus.toUpperCase()}`);
      } else {
        console.log('Status unchanged, updated timestamp only.');
        if (showToast) toast.success(`Status verified: ${displayStatus.toUpperCase()}`);
      }

      // Refresh the sales data
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      return true;
    } catch (error: any) {
      const msg = error?.message || 'Failed to refresh order status';
      if (showToast) toast.error(msg);
      console.error("Error refreshing status:", error);
      return false;
    } finally {
      setRefreshingIndividual(null);
    }
  };

  const handleBulkRefreshAll = async () => {
    setIsBulkRefreshing(true);
    setShowBulkRefreshDialog(false);

    try {
      // Get pending orders from the currently filtered sales (respects date filter, courier filter, etc.)
      const salesToRefresh = filteredSales.filter(sale =>
        (sale.consignment_id || sale.cn_number) && // Has consignment ID or CN number
        !['delivered', 'cancelled', 'returned', 'lost'].includes(sale.courier_status?.toLowerCase() || '')
      );

      if (!salesToRefresh || salesToRefresh.length === 0) {
        toast.info('No pending orders to refresh in current view');
        return;
      }

      console.log(`?? Starting bulk refresh for ${salesToRefresh.length} orders (from filtered view)...`);
      toast.info(`Refreshing ${salesToRefresh.length} order statuses...`);

      let successCount = 0;
      let failCount = 0;

      // Refresh each sale
      for (const sale of salesToRefresh) {
        try {
          // Use consignment_id or cn_number (whichever is available)
          const cnNumber = sale.consignment_id || sale.cn_number!;
          const success = await handleStatusRefresh(sale.id, cnNumber, false);
          if (success) {
            successCount++;
          } else {
            failCount++;
          }

          // Add delay between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Failed to refresh sale ${sale.id}:`, error);
          failCount++;
        }
      }

      // Show summary
      console.log(`? Bulk refresh complete: ${successCount} successful, ${failCount} failed`);

      if (failCount === 0) {
        toast.success(`Successfully refreshed ${successCount} order statuses`);
      } else {
        toast.warning(`Refreshed ${successCount} orders, ${failCount} failed`);
      }

      // Refresh the sales data
      queryClient.invalidateQueries({ queryKey: ["sales"] });

    } catch (error: any) {
      const msg = error?.message || 'Failed to bulk refresh statuses';
      toast.error(msg);
      console.error("Error in bulk refresh:", error);
    } finally {
      setIsBulkRefreshing(false);
    }
  };

  const handleForceRefreshAll = async () => {
    setIsBulkRefreshing(true);
    setShowBulkRefreshDialog(false);

    try {
      // Get ALL orders with consignment ID (including delivered, cancelled, returned, lost)
      const salesToRefresh = filteredSales.filter(sale =>
        (sale.consignment_id || sale.cn_number) // Has consignment ID or CN number - no status filter
      );

      if (!salesToRefresh || salesToRefresh.length === 0) {
        toast.info('No orders with tracking numbers in current view');
        return;
      }

      console.log(`?? Starting FORCE refresh for ${salesToRefresh.length} orders (including final statuses)...`);
      toast.info(`Force refreshing ${salesToRefresh.length} order statuses (including delivered/cancelled)...`);

      let successCount = 0;
      let failCount = 0;

      // Refresh each sale
      for (const sale of salesToRefresh) {
        try {
          const cnNumber = sale.consignment_id || sale.cn_number!;
          const success = await handleStatusRefresh(sale.id, cnNumber, false);
          if (success) {
            successCount++;
          } else {
            failCount++;
          }

          // Add delay between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`Failed to refresh sale ${sale.id}:`, error);
          failCount++;
        }
      }

      // Show summary
      console.log(`? Force refresh complete: ${successCount} successful, ${failCount} failed`);

      if (failCount === 0) {
        toast.success(`Force refreshed ${successCount} order statuses`);
      } else {
        toast.warning(`Force refreshed ${successCount} orders, ${failCount} failed`);
      }

      // Refresh the sales data
      queryClient.invalidateQueries({ queryKey: ["sales"] });

    } catch (error: any) {
      const msg = error?.message || 'Failed to force refresh statuses';
      toast.error(msg);
      console.error("Error in force refresh:", error);
    } finally {
      setIsBulkRefreshing(false);
    }
  };


  const scopedSales = useMemo(() => {
    let filtered = rawSales;

    // Apply user filter
    if (userFilter && userFilter !== "all") {
      filtered = filtered.filter((sale) => sale.created_by === userFilter);
    }

    // Apply date filter
    if (dateRange.from || dateRange.to) {
      const rangeFrom = dateRange.from
        ? startOfDay(toZonedDate(dateRange.from, systemSettings.timezone))
        : undefined;
      const rangeTo = dateRange.to
        ? endOfDay(toZonedDate(dateRange.to, systemSettings.timezone))
        : undefined;

      filtered = filtered.filter((sale) => {
        const saleDate = toZonedDate(new Date(sale.created_at), systemSettings.timezone);

        if (rangeFrom && rangeTo) {
          return isWithinInterval(saleDate, { start: rangeFrom, end: rangeTo });
        } else if (rangeFrom) {
          return saleDate >= rangeFrom;
        } else if (rangeTo) {
          return saleDate <= rangeTo;
        }

        return true;
      });
    }

    // Apply courier status filter (history only)
    if (courierStatusFilter !== "all") {
      const termFilter = courierStatusFilter === "paid" || courierStatusFilter === "cod" || courierStatusFilter === "credit";
      if (!showSalesReview && !termFilter) {
        filtered = filtered.filter((sale) => {
          const status = String(sale.courier_status || "").toLowerCase();

          if (courierStatusFilter === "not_sent") {
            return !sale.courier_status || status === "not_sent";
          }
          // Direct match for all other statuses
          return status === courierStatusFilter;
        });
      }
      if (termFilter) {
        filtered = filtered.filter((sale) => {
          if (courierStatusFilter === "paid") {
            return sale.payment_status === "paid";
          }
          if (courierStatusFilter === "cod") {
            const terms = (sale as any).payment_terms || "immediate";
            const method = normalizeMethodKey((sale as any).payment_method || "");
            const hasCodSplit = (sale.sale_payments || []).some((split) =>
              isCodMethod(normalizeMethodKey(split.method))
            );
            return terms === "cod" || method === "cod" || hasCodSplit;
          }
          if (courierStatusFilter === "credit") {
            const terms = (sale as any).payment_terms || "immediate";
            const method = normalizeMethodKey((sale as any).payment_method || "");
            const hasCreditSplit = (sale.sale_payments || []).some((split) =>
              isCreditMethod(normalizeMethodKey(split.method))
            );
            return terms === "credit" || method === "credit" || hasCreditSplit;
          }
          return true;
        });
      }
    }

    return filtered.sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return bTime - aTime;
    });
  }, [rawSales, dateRange, courierStatusFilter, userFilter, showSalesReview, normalizeMethodKey, isCodMethod, isCreditMethod, systemSettings.timezone]);

  const mockScopedSales = useMemo(
    () => scaleSalesData(scopedSales),
    [scopedSales, scaleSalesData],
  );

  const filteredSales = useMemo(() => {
    let filtered = mockScopedSales;

    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase().trim();
      filtered = filtered.filter((sale) => {
        const amountMatch = [sale.grand_total, sale.amount_paid, sale.amount_due]
          .filter((value) => value !== undefined && value !== null)
          .some((value) => String(value).toLowerCase().includes(searchLower));
        const paymentMethodKeys = [
          (sale as any).payment_method,
          ...(sale.sale_payments || []).map((split) => split.method),
        ]
          .filter(Boolean)
          .map((method) => normalizeMethodKey(method));
        const paymentMethodMatch = paymentMethodKeys.some((methodKey) => {
          const label = methodLabelFor(methodKey);
          return (
            methodKey.toLowerCase().includes(searchLower) ||
            (label && label.toLowerCase().includes(searchLower))
          );
        });

        return (
          sale.invoice_number.toLowerCase().includes(searchLower) ||
          sale.customer_name.toLowerCase().includes(searchLower) ||
          ((sale.saved_customer_name || "").toLowerCase().includes(searchLower)) ||
          ((sale.customer_alias_names || []).some((alias) => alias.toLowerCase().includes(searchLower))) ||
          (sale.customer_phone && sale.customer_phone.toLowerCase().includes(searchLower)) ||
          (sale.customer_whatsapp && sale.customer_whatsapp.toLowerCase().includes(searchLower)) ||
          (sale.customer_address && sale.customer_address.toLowerCase().includes(searchLower)) ||
          ((sale as any).customer_location && String((sale as any).customer_location).toLowerCase().includes(searchLower)) ||
          (sale.cn_number && sale.cn_number.toLowerCase().includes(searchLower)) ||
          amountMatch ||
          sale.payment_status.toLowerCase().includes(searchLower) ||
          ((sale as any).order_status && String((sale as any).order_status).toLowerCase().includes(searchLower)) ||
          (sale.courier_status && sale.courier_status.toLowerCase().includes(searchLower)) ||
          (sale.consignment_id && sale.consignment_id.toLowerCase().includes(searchLower)) ||
          (sale.courier_name && sale.courier_name.toLowerCase().includes(searchLower)) ||
          ((sale as any).payment_method && String((sale as any).payment_method).toLowerCase().includes(searchLower)) ||
          paymentMethodMatch ||
          methodLabelFor((sale as any).payment_method).toLowerCase().includes(searchLower)
        );
      });
    }

    return filtered;
  }, [mockScopedSales, searchTerm, methodLabelFor, normalizeMethodKey]);

  // Calculate pagination
  const totalPages = Math.max(1, Math.ceil(filteredSales.length / itemsPerPage));
  const startIndex = filteredSales.length === 0 ? 0 : (currentPage - 1) * itemsPerPage;
  const endIndex = filteredSales.length === 0 ? 0 : Math.min(startIndex + itemsPerPage, filteredSales.length);
  const paginatedSales = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredSales.slice(startIndex, endIndex);
  }, [filteredSales, currentPage, itemsPerPage]);

  const paginatedSaleIds = useMemo(() => paginatedSales.map((sale) => sale.id), [paginatedSales]);
  const selectedCount = selectedSaleIds.length;
  const allPageSelected = paginatedSaleIds.length > 0 && paginatedSaleIds.every((id) => selectedSaleIds.includes(id));
  const somePageSelected = !allPageSelected && paginatedSaleIds.some((id) => selectedSaleIds.includes(id));

  const toggleSaleSelection = useCallback((saleId: string, checked: boolean) => {
    setSelectedSaleIds((prev) => {
      if (checked) {
        if (prev.includes(saleId)) return prev;
        return [...prev, saleId];
      }
      return prev.filter((id) => id !== saleId);
    });
  }, []);

  const togglePageSelection = useCallback((checked: boolean) => {
    setSelectedSaleIds((prev) => {
      if (checked) {
        const next = new Set(prev);
        paginatedSaleIds.forEach((id) => next.add(id));
        return Array.from(next);
      }
      return prev.filter((id) => !paginatedSaleIds.includes(id));
    });
  }, [paginatedSaleIds]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, courierStatusFilter, dateRange, userFilter, showSalesReview]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const currentMonthSales = useMemo(() => {
    const now = toZonedDate(new Date(), systemSettings.timezone);
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    return sales.filter(sale => {
      const saleDate = toZonedDate(new Date(sale.created_at), systemSettings.timezone);
      return isWithinInterval(saleDate, { start: monthStart, end: monthEnd });
    });
  }, [sales, systemSettings.timezone]);

  const getReviewPaid = useCallback((sale: Sale) => {
    return Math.max(0, sale.review_amount_paid ?? sale.amount_paid ?? 0);
  }, []);

  const getReviewDue = useCallback((sale: Sale) => {
    return Math.max(0, (sale.review_amount_due ?? sale.amount_due ?? 0) - ((sale as any).fee || 0));
  }, []);

  const getSplitTotals = useCallback((sale: Sale) => {
    const splits = (sale.sale_payments || []).map((split) => ({
      method: normalizeMethodKey(split.method),
      amount: Number(split.amount) || 0,
    }));
    const paid = splits
      .filter((split) => split.method && !isCodMethod(split.method) && !isCreditMethod(split.method))
      .reduce((sum, split) => sum + split.amount, 0);
    const credit = splits
      .filter((split) => isCreditMethod(split.method))
      .reduce((sum, split) => sum + split.amount, 0);
    return { paid, credit };
  }, [isCreditMethod, isCodMethod, normalizeMethodKey]);

  const getStatusFlags = useCallback((sale: Sale) => {
    const status = String(sale.courier_status || sale.order_status || "").toLowerCase();
    return {
      isCancelled: status === "cancelled" || status === "returned",
      isLost: status === "lost",
      isDelivered: status === "delivered",
    };
  }, []);


  const getPaidTotal = useCallback((sale: Sale) => {
    const splits = getSplitTotals(sale);
    if (splits.paid > 0 || splits.credit > 0) {
      return Math.max(splits.paid, sale.amount_paid || 0);
    }
    return Math.max(0, sale.review_amount_paid ?? sale.amount_paid ?? 0);
  }, [getSplitTotals]);

  const isCreditSale = useCallback((sale: Sale) => {
    const terms = String((sale as any).payment_terms || "").toLowerCase();
    const method = normalizeMethodKey((sale as any).payment_method || "");
    const splits = getSplitTotals(sale);
    return terms === "credit" || method === "credit" || splits.credit > 0;
  }, [getSplitTotals, normalizeMethodKey]);

  const getCreditDueAmount = useCallback((sale: Sale) => {
    const splits = getSplitTotals(sale);
    if (splits.credit > 0) {
      return Math.max(0, splits.credit);
    }
    if (!isCreditSale(sale)) return 0;
    const rawDue = (sale.review_amount_due ?? sale.amount_due ?? 0);
    return Math.max(0, rawDue);
  }, [getSplitTotals, isCreditSale]);


  const getCodDueBase = useCallback((sale: Sale) => {
    const { isCancelled, isLost, isDelivered } = getStatusFlags(sale);
    if (isCancelled || isLost || isDelivered) return 0;
    const terms = (sale as any).payment_terms || "immediate";
    const method = normalizeMethodKey((sale as any).payment_method || "");
    const fee = (sale as any).fee || 0;
    const codSplitTotal = (sale.sale_payments || [])
      .filter((split) => isCodMethod(normalizeMethodKey(split.method)))
      .reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
    const hasCodSplit = codSplitTotal > 0;
    if (hasCodSplit) return Math.max(0, codSplitTotal - fee);
    const hasCod = (sale.sale_payments || []).some((split) =>
      isCodMethod(normalizeMethodKey(split.method))
    );
    if (terms !== "cod" && method !== "cod" && !hasCod) return 0;
    const rawDue = (sale as any).review_amount_due ?? sale.amount_due ?? 0;
    return Math.max(0, rawDue - fee);
  }, [getStatusFlags, normalizeMethodKey, isCodMethod]);

  const getReviewCodDueBase = useCallback((sale: Sale) => {
    const { isCancelled, isLost } = getStatusFlags(sale);
    if (isCancelled || isLost) return 0;
    const terms = (sale as any).payment_terms || "immediate";
    const method = normalizeMethodKey((sale as any).payment_method || "");
    const fee = (sale as any).fee || 0;
    const codSplitTotal = (sale.sale_payments || [])
      .filter((split) => isCodMethod(normalizeMethodKey(split.method)))
      .reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
    const hasCodSplit = codSplitTotal > 0;
    if (hasCodSplit) return Math.max(0, codSplitTotal - fee);
    const hasCod = (sale.sale_payments || []).some((split) =>
      isCodMethod(normalizeMethodKey(split.method))
    );
    if (terms !== "cod" && method !== "cod" && !hasCod) return 0;
    const rawDue = (sale as any).review_amount_due ?? sale.amount_due ?? 0;
    return Math.max(0, rawDue - fee);
  }, [getStatusFlags, normalizeMethodKey, isCodMethod]);

  const getCodDueBaseRaw = useCallback((sale: Sale) => {
    const fee = (sale as any).fee || 0;
    const rawDue = (sale as any).review_amount_due ?? sale.amount_due ?? 0;
    return Math.max(0, rawDue - fee);
  }, []);

  const statusDateRange = useMemo(() => {
    const now = toZonedDate(new Date(), systemSettings.timezone);
    const from = dateRange.from
      ? startOfDay(toZonedDate(dateRange.from, systemSettings.timezone))
      : startOfDay(now);
    const to = dateRange.to
      ? endOfDay(toZonedDate(dateRange.to, systemSettings.timezone))
      : endOfDay(now);
    return { from, to };
  }, [dateRange.from, dateRange.to, systemSettings.timezone]);

  const isWithinStatusRange = useCallback((dateValue?: string | null) => {
    if (!dateValue) return false;
    const date = toZonedDate(new Date(dateValue), systemSettings.timezone);
    if (Number.isNaN(date.getTime())) return false;
    return isWithinInterval(date, { start: statusDateRange.from, end: statusDateRange.to });
  }, [statusDateRange, systemSettings.timezone]);

  const statusChangeEntries = useMemo(() => {
    const entries: Array<{
      id: string;
      invoice: string;
      customer: string;
      courier: string;
      status: "cancelled" | "returned" | "lost";
      statusAt: string;
      createdAt: string;
      total: number;
      paid: number;
      due: number;
      paymentMethod: string;
    }> = [];

    sales.forEach((sale) => {
      const status = String(sale.courier_status || "").toLowerCase();
      if (status !== "cancelled" && status !== "returned" && status !== "lost") return;

      const statusAt =
        status === "cancelled"
          ? sale.cancelled_at
          : status === "returned"
            ? sale.returned_at
            : sale.lost_at;

      if (!isWithinStatusRange(statusAt)) return;

      entries.push({
        id: sale.id,
        invoice: sale.invoice_number,
        customer: sale.customer_name,
        courier: sale.courier_name || "Not set",
        status: status as "cancelled" | "returned" | "lost",
        statusAt: statusAt || sale.updated_at || sale.created_at,
        createdAt: sale.created_at,
        total: sale.grand_total || 0,
        paid: getPaidTotal(sale),
        due: Math.max(0, getReviewDue(sale)),
        paymentMethod: methodLabelFor((sale as any).payment_method) || "-",
      });
    });

    return entries.sort((a, b) => new Date(b.statusAt).getTime() - new Date(a.statusAt).getTime());
  }, [sales, isWithinStatusRange, getPaidTotal, getReviewDue, methodLabelFor]);

  const deliveredEntries = useMemo(() => {
    const entries: Array<{
      id: string;
      invoice: string;
      customer: string;
      courier: string;
      deliveredAt: string;
      total: number;
      phone: string;
    }> = [];

    sales.forEach((sale) => {
      const status = String(sale.courier_status || "").toLowerCase();
      // Check for delivered status (includes variations like "delivered", "Delivered", etc.)
      if (!status.includes("delivered") && status !== "completed") return;

      // Use last_status_check as the delivery date, fall back to other dates
      const deliveredAt =
        sale.last_status_check ||
        sale.status_changed_at ||
        sale.updated_at ||
        sale.created_at;
      if (!deliveredAt) return;

      // Check if the delivery date is within the selected range
      if (!isWithinStatusRange(deliveredAt)) return;

      entries.push({
        id: sale.id,
        invoice: sale.invoice_number,
        customer: sale.customer_name,
        courier: sale.courier_name || "Not set",
        deliveredAt,
        total: sale.grand_total || 0,
        phone: sale.customer_phone || "",
      });
    });

    return entries.sort((a, b) => new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime());
  }, [sales, isWithinStatusRange]);

  const deliveredTotal = deliveredEntries.reduce((sum, entry) => sum + entry.total, 0);

  const statusChangeCount = statusChangeEntries.length;
  const statusRangeLabel = useMemo(() => {
    const fromLabel = formatInTimeZone(statusDateRange.from, "PPP", systemSettings.timezone);
    const toLabel = formatInTimeZone(statusDateRange.to, "PPP", systemSettings.timezone);
    return fromLabel === toLabel ? fromLabel : `${fromLabel} - ${toLabel}`;
  }, [statusDateRange]);

  const headerActions = useMemo(() => {
    return (
      <TooltipProvider>
        <PermissionGate permission="sales.view_history">
          <div className="hidden md:flex">
            <div className="flex items-center gap-2">
              {statusChangeCount > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setShowStatusChangesDialog(true)}
                      className="relative h-11 w-11 rounded-xl border-error/40 bg-error/10 text-error hover:bg-error/20"
                      aria-label="View cancelled, returned, and lost orders"
                    >
                      <AlertTriangle className="h-5 w-5" />
                      <span className="absolute -top-1 -right-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-error px-1.5 py-0.5 text-xs font-semibold leading-none text-error-content shadow-sm">
                        {statusChangeCount > 99 ? "99+" : statusChangeCount}
                      </span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Status changes in range: {statusRangeLabel}
                  </TooltipContent>
                </Tooltip>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex h-11 items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/80 px-2.5 shadow-sm">
                    {showSalesReview ? (
                      <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <List className="h-5 w-5 text-muted-foreground" />
                    )}
                    <Switch
                      checked={showSalesReview}
                      onCheckedChange={setShowSalesReview}
                      aria-label="Toggle sales review"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>{showSalesReview ? "Sales Review" : "Sales History"}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </PermissionGate>
        <PermissionGate permission="sales.create">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="outline"
                onClick={() => setShowSaleDialog(true)}
                className="rounded-xl"
                aria-label="New sale"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New Sale</TooltipContent>
          </Tooltip>
        </PermissionGate>
      </TooltipProvider>
    );
  }, [
    setShowSaleDialog,
    setShowSalesReview,
    showSalesReview,
    statusChangeCount,
    statusRangeLabel,
  ]);
  usePageHeaderActions(!isMobile ? headerActions : null);

  const stats = useMemo(() => {
    if (showSalesReview) {
      const activeSales = filteredSales.filter((sale) => {
        const { isCancelled, isLost } = getStatusFlags(sale);
        return !isCancelled && !isLost;
      });
      const totalRevenue = activeSales.reduce((sum, sale) => {
        const netTotal = (sale.grand_total || 0) - ((sale as any).fee || 0);
        return sum + Math.max(0, netTotal);
      }, 0);
      // Paid: uses old-project logic � delivered/paid ? full net amount (except credit)
      const totalPaid = activeSales.reduce((sum, sale) => {
        const fee = (sale as any).fee || 0;
        const hasSplits = (sale as any).sale_payments && (sale as any).sale_payments.length > 0;
        const splits = getSplitTotals(sale);

        if (hasSplits) {
          return sum + splits.paid;
        }

        // Sales review should stay based on review amounts, not delivery status.
        return sum + Math.max(0, sale.review_amount_paid ?? sale.amount_paid ?? 0);
      }, 0);
      const totalDue = Math.max(0, totalRevenue - totalPaid);
      const totalCharge = activeSales.reduce((sum, sale) => sum + ((sale as any).fee || 0), 0);
      const codDue = activeSales.reduce((sum, sale) => {
        return sum + Math.max(0, getReviewCodDueBase(sale));
      }, 0);
      const creditDue = activeSales.reduce((sum, sale) => {
        const splits = getSplitTotals(sale);
        if (splits.credit > 0) {
          return sum + splits.credit;
        }
        return sum;
      }, 0);
      return {
        totalRevenue,
        totalPaid,
        totalDue,
        totalCharge,
        totalSales: activeSales.length,
        codDue,
        creditDue,
      };
    }

    // Exclude sales ONLY based on courier statuses of cancelled, returned, or lost
    // (not based on payment_status)
    const activeSales = filteredSales.filter((sale) => {
      const { isCancelled, isLost } = getStatusFlags(sale);
      return !isCancelled && !isLost;
    });

    const totalRevenue = activeSales.reduce((sum, sale) => {
      const netTotal = (sale.grand_total || 0) - ((sale as any).fee || 0);
      return sum + Math.max(0, netTotal);
    }, 0);

    // Paid: uses old-project logic � delivered/paid ? full net amount (except credit)
    const totalPaid = activeSales.reduce((sum, sale) => {
      const { isDelivered } = getStatusFlags(sale);
      const isPaidOrDelivered = sale.payment_status === 'paid' || isDelivered;
      const fee = (sale as any).fee || 0;
      const hasSplits = (sale as any).sale_payments && (sale as any).sale_payments.length > 0;
      const splits = getSplitTotals(sale);

      if (hasSplits) {
        let paidAmount = splits.paid;
        // Delivered COD: courier collected the money, count as paid
        if (isDelivered) {
          const codAmount = (sale.sale_payments || [])
            .filter((split) => isCodMethod(normalizeMethodKey(split.method)))
            .reduce((acc, split) => acc + (Number(split.amount) || 0), 0);
          paidAmount += Math.max(0, codAmount - fee);
        }
        return sum + paidAmount;
      }

      // No payment splits � old project approach
      if (isPaidOrDelivered) {
        const terms = (sale as any).payment_terms || "immediate";
        if (terms === "credit") {
          // Credit delivered: only the actual amount paid, not the credit portion
          return sum + Math.max(0, sale.amount_paid || 0);
        }
        // COD or immediate delivered/paid: full net amount
        return sum + Math.max(0, (sale.grand_total || 0) - fee);
      }
      return sum + Math.max(0, sale.amount_paid || 0);
    }, 0);

    // Calculate due amount to stay consistent with paid + revenue
    const totalDue = Math.max(0, totalRevenue - totalPaid);

    // Calculate COD due (pending COD orders not yet delivered)
    const codDue = activeSales.reduce((sum, sale) => sum + Math.max(0, getCodDueBase(sale)), 0);

    // Calculate Credit due (all credit sales with outstanding balance)
    const creditDue = activeSales.reduce((sum, sale) => {
      const splits = getSplitTotals(sale);
      if (splits.credit > 0) {
        return sum + splits.credit;
      }
      return sum;
    }, 0);

    const totalCharge = activeSales.reduce((sum, sale) => {
      return sum + ((sale as any).fee || 0);
    }, 0);

    return {
      totalRevenue,
      totalPaid,
      totalDue,
      totalCharge,
      totalSales: activeSales.length,
      codDue,
      creditDue,
    };
  }, [filteredSales, showSalesReview, getReviewPaid, getReviewDue, getSplitTotals, getPaidTotal, getStatusFlags, getCodDueBase, getReviewCodDueBase, normalizeMethodKey, isCodMethod]);

  const paidMethodTotals = useMemo(() => {
    if (!showSalesReview) return [];
    const totals = new Map<string, number>();
    filteredSales.forEach((sale) => {
      const { isCancelled, isLost } = getStatusFlags(sale);
      if (isCancelled || isLost) return;
      const splits = getSplitTotals(sale);
      if (splits.paid > 0 || splits.credit > 0) {
        (sale.sale_payments || [])
          .filter((split) => {
            const method = normalizeMethodKey(split.method);
            return !isCreditMethod(method) && !isCodMethod(method);
          })
          .forEach((split) => {
            const method = normalizeMethodKey(split.method || "unknown");
            const amount = Number(split.amount) || 0;
            if (amount <= 0) return;
            totals.set(method, (totals.get(method) || 0) + amount);
          });
        return;
      }
      const paidAmount = getReviewPaid(sale);
      if (paidAmount <= 0) return;
      const method = normalizeMethodKey((sale as any).payment_method || "Unknown");
      totals.set(method, (totals.get(method) || 0) + paidAmount);
    });
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredSales, showSalesReview, getReviewPaid, isCreditMethod, isCodMethod, normalizeMethodKey, getSplitTotals, getStatusFlags]);

  const dueMethodTotals = useMemo(() => {
    if (!showSalesReview) return [];
    const totals = new Map<string, number>();
    filteredSales.forEach((sale) => {
      const method = normalizeMethodKey((sale as any).payment_method || "Unknown");
      const dueAmount = getReviewDue(sale);
      if (dueAmount <= 0) return;
      totals.set(method, (totals.get(method) || 0) + dueAmount);
    });
    return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredSales, showSalesReview, getReviewDue, normalizeMethodKey]);

  const paymentMethodEntries = useMemo(() => {
    if (!showSalesReview) return [];
    const grouped = new Map<
      string,
      Array<{ id: string; customer: string; courier: string; amount: number }>
    >();
    filteredSales.forEach((sale) => {
      const { isCancelled, isLost } = getStatusFlags(sale);
      if (isCancelled || isLost) return;
      const splits = getSplitTotals(sale);
      if (splits.paid > 0 || splits.credit > 0) {
        (sale.sale_payments || [])
          .filter((split) => {
            const method = normalizeMethodKey(split.method);
            return !isCreditMethod(method) && !isCodMethod(method);
          })
          .forEach((split) => {
            const method = normalizeMethodKey(split.method || "unknown");
            const amount = Number(split.amount) || 0;
            if (amount <= 0) return;
            const entries = grouped.get(method) || [];
            entries.push({
              id: sale.id,
              customer: sale.customer_name,
              courier: sale.courier_name || "Not set",
              amount,
            });
            grouped.set(method, entries);
          });
        return;
      }
      const amount = getReviewPaid(sale);
      if (amount <= 0) return;
      const method = normalizeMethodKey((sale as any).payment_method || "Unknown");
      const entries = grouped.get(method) || [];
      entries.push({
        id: sale.id,
        customer: sale.customer_name,
        courier: sale.courier_name || "Not set",
        amount,
      });
      grouped.set(method, entries);
    });
    return Array.from(grouped.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filteredSales, showSalesReview, getReviewPaid, isCreditMethod, isCodMethod, normalizeMethodKey, getSplitTotals, getStatusFlags]);

  const dueAllEntries = useMemo(() => {
    if (!showSalesReview) return [];
    return filteredSales
      .map((sale) => {
        const { isCancelled, isLost } = getStatusFlags(sale);
        if (isCancelled || isLost) return null;
        return {
          id: sale.id,
          customer: sale.customer_name,
          courier: sale.courier_name || "Not set",
          // COD card should only show COD due amounts, not credit due.
          amount: Math.max(0, getReviewCodDueBase(sale)),
        };
      })
      .filter((entry) => entry && entry.amount > 0) as Array<{
        id: string;
        customer: string;
        courier: string;
        amount: number;
      }>;
  }, [filteredSales, showSalesReview, getReviewCodDueBase, getStatusFlags]);

  const creditEntries = useMemo(() => {
    if (!showSalesReview) return [];
    return filteredSales
      .map((sale) => {
        const { isCancelled, isLost } = getStatusFlags(sale);
        if (isCancelled || isLost) return null;
        const splitCredit = (sale.sale_payments || [])
          .filter((split) => isCreditMethod(normalizeMethodKey(split.method)))
          .reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
        const fallbackCredit = (sale as any).payment_terms === "credit"
          ? Math.max(0, getReviewDue(sale))
          : 0;
        const amount = splitCredit > 0 ? splitCredit : fallbackCredit;
        return {
          id: sale.id,
          customer: sale.customer_name,
          courier: sale.courier_name || "Not set",
          amount,
        };
      })
      .filter((entry) => entry && entry.amount > 0) as Array<{ id: string; customer: string; courier: string; amount: number }>;
  }, [filteredSales, showSalesReview, getReviewDue, getStatusFlags, isCreditMethod, normalizeMethodKey]);

  const toggleEntryChecked = (entryId: string) => {
    setCheckedEntryIds((prev) =>
      prev.includes(entryId) ? prev.filter((id) => id !== entryId) : [...prev, entryId]
    );
  };

  const getEntryRowClasses = (entryId: string) => {
    const isChecked = checkedEntryIds.includes(entryId);
    const isHovered = hoveredEntryId === entryId;
    if (isChecked) return "bg-emerald-50";
    if (isHovered) return "bg-red-50";
    return "hover:bg-red-50";
  };

  const handleEditSale = (saleId: string) => {
    setEditingSaleId(saleId);
    setShowEditDialog(true);
  };

  const handleDuplicateSale = async (saleId: string) => {
    if (duplicatingSaleId) return;
    setDuplicatingSaleId(saleId);
    try {
      const sourceSale: any = await getSaleWithItems(saleId);
      const sourceItems = Array.isArray(sourceSale?.items) ? sourceSale.items : [];

      if (sourceItems.length === 0) {
        toast.error("Cannot duplicate a sale with no items");
        return;
      }

      const normalizedSplits = (sourceSale.payment_splits || sourceSale.sale_payments || [])
        .map((split: any) => ({
          method: String(split?.method || "").toLowerCase() === "condition" ? "cod" : String(split?.method || "cash"),
          amount: Number(split?.amount) || 0,
        }))
        .filter((split: any) => split.amount > 0);

      const payload: any = {
        customer_id: sourceSale.customer_id || undefined,
        customer_name: sourceSale.customer_name || "Unknown Customer",
        customer_phone: sourceSale.customer_phone || undefined,
        customer_whatsapp: sourceSale.customer_whatsapp || undefined,
        customer_address: sourceSale.customer_address || undefined,
        additional_info: sourceSale.additional_info || undefined,
        courier_name: sourceSale.courier_name || undefined,
        subtotal: Number(sourceSale.subtotal) || 0,
        discount_percent: Number(sourceSale.discount_percent) || 0,
        discount_amount: Number(sourceSale.discount_amount) || 0,
        fee: Number(sourceSale.fee) || 0,
        grand_total: Number(sourceSale.grand_total) || 0,
        amount_paid: Number(sourceSale.amount_paid) || 0,
        amount_due: Number(sourceSale.amount_due) || 0,
        review_amount_paid: Number(sourceSale.review_amount_paid ?? sourceSale.amount_paid) || 0,
        review_amount_due: Number(sourceSale.review_amount_due ?? sourceSale.amount_due) || 0,
        payment_method: sourceSale.payment_method || "cash",
        payment_status: sourceSale.payment_status || "pending",
        payment_terms: sourceSale.payment_terms || "immediate",
        credit_days: sourceSale.credit_days ?? null,
        due_date: sourceSale.due_date ?? null,
        payment_splits: normalizedSplits,
        items: sourceItems.map((item: any) => ({
          product_id: item.product_id ?? null,
          product_name: item.product_name || "Item",
          product_image_url: item.product_image_url || null,
          quantity: Number(item.quantity) || 0,
          rate: Number(item.rate) || 0,
          sale_price: item.sale_price ?? null,
          total: Number(item.total) || 0,
          variant_id: item.variant_id ?? null,
          variant_image_url: item.variant_image_url || null,
        })),
      };

      const duplicatedSale: any = await createSale.mutateAsync(payload);

      await logActivity({
        action: "create",
        entityType: "sales",
        entityId: duplicatedSale?.id || "",
        summary: `Duplicated sale from ${sourceSale?.invoice_number || saleId}`,
        details: {
          old: { source_sale_id: saleId, source_invoice: sourceSale?.invoice_number || null },
          new: { duplicated_sale_id: duplicatedSale?.id || null, duplicated_invoice: duplicatedSale?.invoice_number || null },
        },
      });

      toast.success(`Sale duplicated${duplicatedSale?.invoice_number ? `: ${duplicatedSale.invoice_number}` : ""}`);
      refetch();
    } catch (error: any) {
      console.error("Duplicate sale failed:", error);
      toast.error(error?.message || "Failed to duplicate sale");
    } finally {
      setDuplicatingSaleId(null);
    }
  };

  const requestDuplicateSale = (saleId: string) => {
    setPendingDuplicateSaleId(saleId);
  };

  const confirmDuplicateSale = async () => {
    if (!pendingDuplicateSaleId) return;
    try {
      await handleDuplicateSale(pendingDuplicateSaleId);
    } finally {
      setPendingDuplicateSaleId(null);
    }
  };

  useEffect(() => {
    if (!isPrintDialogOpen) return;
    const reset = () => {
      if (printPreviewScrollRef.current) {
        printPreviewScrollRef.current.scrollTop = 0;
        printPreviewScrollRef.current.scrollLeft = 0;
      }
    };
    requestAnimationFrame(reset);
    const t1 = window.setTimeout(reset, 60);
    const t2 = window.setTimeout(reset, 180);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [isPrintDialogOpen, printHtml, isBulkPrintPreview, printOptions.size, printOptions.orientation]);

  const handleViewDetails = (saleId: string) => {
    setDetailsSaleId(saleId);
    setShowDetailsDialog(true);
  };


  const handleDeleteSale = (saleId: string) => {
    setPendingDeleteSaleId(saleId);
  };

  const confirmDeleteSale = async () => {
    if (!pendingDeleteSaleId) return;
    const saleToDelete = rawSales.find((sale) => sale.id === pendingDeleteSaleId);
    const buildItemLog = (item: any) => ({
      name: item.product_name || item.productName || "Item",
      attributes: item.variant_label
        ? { Variant: item.variant_label }
        : item.variantLabel
          ? { Variant: item.variantLabel }
          : undefined,
      quantity: Number(item.quantity) || 0,
      rate: Number(item.rate) || 0,
      sale_price: item.sale_price ?? item.salePrice ?? null,
      total: Number(item.total) || 0,
    });
    const buildSaleSnapshot = (sale: any) => ({
      invoice_number: sale?.invoice_number || null,
      sale_date: sale?.created_at || null,
      customer_name: sale?.customer_name || null,
      customer_phone: sale?.customer_phone || null,
      customer_whatsapp: sale?.customer_whatsapp || null,
      customer_address: sale?.customer_address || null,
      additional_info: sale?.additional_info || null,
      cn_number: sale?.cn_number || null,
      courier_name: sale?.courier_name || null,
      payment_method: sale?.payment_method || null,
      payment_status: sale?.payment_status || null,
      payment_terms: sale?.payment_terms || null,
      credit_days: sale?.credit_days ?? null,
      due_date: sale?.due_date ?? null,
      subtotal: sale?.subtotal ?? 0,
      discount_percent: sale?.discount_percent ?? 0,
      discount_amount: sale?.discount_amount ?? 0,
      fee: sale?.fee ?? 0,
      grand_total: sale?.grand_total ?? 0,
      amount_paid: sale?.amount_paid ?? 0,
      amount_due: sale?.amount_due ?? 0,
      courier_status: sale?.courier_status || null,
      payment_splits: (sale?.payment_splits || sale?.sale_payments || []).map((split: any) => ({
        method: split.method,
        amount: Number(split.amount) || 0,
      })),
      items: (sale?.items || sale?.sale_items || []).map(buildItemLog),
    });
    try {
      let fullSale: any = null;
      try {
        fullSale = await getSaleWithItems(pendingDeleteSaleId);
      } catch (error) {
        console.warn("Failed to load sale details for delete log:", error);
      }
      await deleteSale.mutateAsync(pendingDeleteSaleId);
      await logActivity({
        action: "delete",
        entityType: "sales",
        entityId: pendingDeleteSaleId,
        summary: `Deleted sale ${fullSale?.invoice_number || saleToDelete?.invoice_number || ""}`.trim(),
        details: {
          old: buildSaleSnapshot(fullSale || saleToDelete),
          new: {},
        },
      });
    } finally {
      setPendingDeleteSaleId(null);
    }
  };

  const handleBulkCourierStatusChange = useCallback(async (newStatus: string) => {
    if (!newStatus || newStatus === "__none") return;
    if (selectedSaleIds.length === 0) {
      toast.info("Select sales first");
      setBulkStatusValue("__none");
      return;
    }

    setIsBulkStatusUpdating(true);
    const now = new Date().toISOString();
    let updatedCount = 0;
    let failedCount = 0;

    try {
      for (const saleId of selectedSaleIds) {
        const saleToUpdate = rawSales.find((sale) => sale.id === saleId);
        try {
          const { error } = await supabase
            .from("sales")
            .update({
              courier_status: newStatus,
              order_status: newStatus,
              last_status_check: now,
            })
            .eq("id", saleId);

          if (error) throw error;

          updatedCount += 1;
          await logActivity({
            action: "update",
            entityType: "sales",
            entityId: saleId,
            summary: `Bulk updated courier status to ${newStatus}`,
            details: {
              old: { courier_status: saleToUpdate?.courier_status || null },
              new: { courier_status: newStatus },
            },
          });
        } catch (error) {
          failedCount += 1;
          console.error("Bulk status update failed for sale:", saleId, error);
        }
      }
    } finally {
      setIsBulkStatusUpdating(false);
      setBulkStatusValue("__none");
      refetch();
    }

    if (updatedCount > 0) {
      toast.success(`Updated ${updatedCount} sale(s) to ${newStatus}`);
    }
    if (failedCount > 0) {
      toast.error(`${failedCount} sale(s) failed to update`);
    }
  }, [refetch, rawSales, selectedSaleIds]);

  const handlePrintInvoice = async (sale: Sale) => {
    try {
      if (!businessSettings || !systemSettings) {
        toast.error("Settings not loaded");
        return;
      }

      // Get sale with items for complete data
      const saleWithItems = await getSaleWithItems(sale.id);
      setPrintSale(saleWithItems);

      const html = generateCashMemoHTML(saleWithItems, businessSettings, systemSettings);
      setPrintHtml(html);
      setPrintSaleId(sale.id);
      setPrintSaleNumber(sale.invoice_number);
      setIsBulkPrintPreview(false);
      setBulkPrintLogItems([]);
      setIsPrintDialogOpen(true);
    } catch (error) {
      toast.error("Failed to open print preview");
      console.error("Print error:", error);
    }
  };

  const handleBulkPrint = useCallback(async () => {
    if (selectedSaleIds.length === 0) {
      toast.info("Select sales first");
      return;
    }
    if (!businessSettings || !systemSettings) {
      toast.error("Settings not loaded");
      return;
    }

    setIsBulkPrinting(true);
    try {
      const invoiceDocs = await Promise.all(
        selectedSaleIds.map(async (saleId) => {
          try {
            return await getSaleWithItems(saleId);
          } catch (error) {
            console.error("Failed to load sale for bulk print:", saleId, error);
            return null;
          }
        })
      );

      const printableSales = invoiceDocs.filter(Boolean) as any[];
      if (printableSales.length === 0) {
        toast.error("Failed to load selected sales for printing");
        return;
      }

      const renderedDocs = printableSales.map((saleData) =>
        generateCashMemoHTML(saleData, businessSettings, systemSettings)
      );

      const extract = (html: string, tag: "head" | "body") => {
        const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
        return match?.[1] || "";
      };

      const headContent = extract(renderedDocs[0], "head");
      const bodyChunks = renderedDocs.map((doc) => extract(doc, "body") || doc);
      const mergedHtml = `<!DOCTYPE html>
<html>
  <head>
    ${headContent}
    <style>
      .bulk-print {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .bulk-print-page {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        page-break-after: always;
        break-after: page;
      }
      .bulk-print-page .memo,
      .bulk-print-page .cash-memo {
        margin-left: auto !important;
        margin-right: auto !important;
      }
      .bulk-print-page:last-child {
        page-break-after: auto;
        break-after: auto;
      }
    </style>
  </head>
  <body class="pdf-mode bulk-print">
    ${bodyChunks.map((chunk) => `<section class="bulk-print-page">${chunk}</section>`).join("")}
  </body>
</html>`;

      setPrintSale(null);
      setPrintSaleId(null);
      setPrintSaleNumber("");
      setIsBulkPrintPreview(true);
      setBulkPrintLogItems(
        printableSales.map((saleData) => ({
          id: saleData.id,
          invoice: saleData.invoice_number || null,
        }))
      );
      setPrintHtml(mergedHtml);
      setIsPrintDialogOpen(true);

      toast.success(`Loaded ${printableSales.length} invoice(s) in print preview`);
    } catch (error) {
      console.error("Bulk print failed:", error);
      toast.error("Failed to bulk print invoices");
    } finally {
      setIsBulkPrinting(false);
    }
  }, [selectedSaleIds, businessSettings, systemSettings, getSaleWithItems]);

  const handleCloseEditDialog = () => {
    setShowEditDialog(false);
    setEditingSaleId(null);
  };

  const formatCurrencyAmount = (amount: number) => {
    return formatAmount(amount);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-destructive">Error loading sales data</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-2 md:hidden">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Sales</h1>
          <SimpleDateRangeFilter
            onDateRangeChange={(from, to) => setDateRange({ from, to })}
            triggerClassName="h-9 !w-auto !min-w-[132px] rounded-xl px-2 text-xs whitespace-nowrap"
          />
        </div>
      </div>
      <MockDataNotice displayedCount={mockScopedSales.length} rawCount={scopedSales.length} noun="sales" />
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] gap-2 md:hidden">
        <div className="flex h-auto w-full flex-col items-center justify-center gap-1 rounded-xl border border-border/70 bg-card/80 px-2 py-2 text-[11px]">
          <div className="flex items-center gap-2">
            {showSalesReview ? (
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            ) : (
              <List className="h-4 w-4 text-muted-foreground" />
            )}
            <Switch
              checked={showSalesReview}
              onCheckedChange={setShowSalesReview}
              aria-label="Toggle sales review"
            />
          </div>
          <span className="font-medium">Sales Review</span>
        </div>
        <PermissionGate permission="sales.create">
          <Button
            variant="outline"
            onClick={() => setShowSaleDialog(true)}
            className="h-auto w-full rounded-xl border-border/70 bg-card/80 px-2 py-2 flex flex-col items-center gap-1 text-[11px] hover:bg-primary hover:text-primary-foreground transition-colors"
            aria-label="Add sale"
          >
            <Plus className="h-4 w-4" />
            <span className="font-medium">Add Sale</span>
          </Button>
        </PermissionGate>
        <PermissionGate permission="courier.refresh">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowBulkRefreshDialog(true)}
            disabled={isBulkRefreshing}
            className="h-auto w-full rounded-xl border-border/70 bg-card/80"
            aria-label="Refresh all courier statuses"
            title="Refresh all courier statuses"
          >
            <RefreshCw className={cn("h-4 w-4", isBulkRefreshing && "animate-spin")} />
          </Button>
        </PermissionGate>
      </div>
      <div className="md:!mt-0">
        {isLoading ? (
          <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide pr-[calc((100%-230px)/2)] md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:pb-0 md:pr-0">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className={`w-[230px] shrink-0 ${i === 0 ? "snap-start" : "snap-center"} md:min-w-0 md:w-auto md:shrink`}>
                <CardHeader className="!grow-0 !basis-auto flex flex-row items-start justify-between space-y-0 pb-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-24 mb-2" />
                  <Skeleton className="h-3 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-hide pr-[calc((100%-230px)/2)] md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:pb-0 md:pr-0">
            <Card className="w-[230px] shrink-0 snap-start md:min-w-0 md:w-auto md:shrink">
              <CardHeader className="!grow-0 !basis-auto flex flex-row items-start justify-between space-y-0 pb-2">
                <p className="text-sm font-medium">Total Revenue</p>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrencyAmount(stats.totalRevenue)}</div>
                <p className="text-xs text-muted-foreground">
                  From {stats.totalSales} sales
                </p>
              </CardContent>
            </Card>
            <Card className="w-[230px] shrink-0 snap-center md:min-w-0 md:w-auto md:shrink">
              <CardHeader className="!grow-0 !basis-auto flex flex-row items-start justify-between space-y-0 pb-2">
                <p className="text-sm font-medium">Amount Paid</p>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {showSalesReview ? (
                  <div className="space-y-2">
                    <div className="text-2xl font-bold">{formatCurrencyAmount(stats.totalPaid)}</div>
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {paidMethodTotals.length === 0 ? (
                        <p>No paid methods</p>
                      ) : (
                        paidMethodTotals.map(([method, total]) => (
                          <div key={method} className="flex items-center justify-between gap-2">
                            <span className="truncate capitalize">{methodLabelFor(method)}</span>
                            <span className="whitespace-nowrap">{formatCurrencyAmount(total)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-2xl font-bold">{formatCurrencyAmount(stats.totalPaid)}</div>
                    <p className="text-xs text-muted-foreground">
                      Received payments
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
            <Card className="w-[230px] shrink-0 snap-center md:min-w-0 md:w-auto md:shrink">
              <CardHeader className="!grow-0 !basis-auto flex flex-row items-start justify-between space-y-0 pb-2">
                <p className="text-sm font-medium">COD Due</p>
                <Truck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrencyAmount(stats.codDue)}</div>
                <p className="text-xs text-muted-foreground">
                  Courier due
                </p>
              </CardContent>
            </Card>
            <Card className="w-[230px] shrink-0 snap-center md:min-w-0 md:w-auto md:shrink">
              <CardHeader className="!grow-0 !basis-auto flex flex-row items-start justify-between space-y-0 pb-2">
                <p className="text-sm font-medium">Credit Due</p>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrencyAmount(stats.creditDue)}</div>
                <p className="text-xs text-muted-foreground">
                  Credit outstanding
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      <div className="md:hidden space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search invoice, customer, phone, courier name, status..."
            className="h-11 rounded-xl pl-10"
          />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
          <Select value={courierStatusFilter} onValueChange={setCourierStatusFilter}>
            <SelectTrigger className="h-11 w-full px-3 shadow-none">
              <SelectValue placeholder="All Filters" />
            </SelectTrigger>
            <SelectContent className="w-auto min-w-[140px]">
              <SelectItem value="all" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-muted/60 whitespace-nowrap">
                  All Filters
                </Badge>
              </SelectItem>
              <SelectItem value="not_sent" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-slate-100 text-slate-900 border-slate-200 whitespace-nowrap">
                  Not Sent
                </Badge>
              </SelectItem>
              <SelectItem value="in_review" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-800 border-yellow-200 whitespace-nowrap">
                  In Review
                </Badge>
              </SelectItem>
              <SelectItem value="sent" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800 border-blue-200 whitespace-nowrap">
                  Sent
                </Badge>
              </SelectItem>
              <SelectItem value="in_transit" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800 border-blue-200 whitespace-nowrap">
                  In Transit
                </Badge>
              </SelectItem>
              <SelectItem value="delivery_ready" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-teal-100 text-teal-800 border-teal-200 whitespace-nowrap">
                  Delivery Ready
                </Badge>
              </SelectItem>
              <SelectItem value="out_for_delivery" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-orange-100 text-orange-800 border-orange-200 whitespace-nowrap">
                  Out for Delivery
                </Badge>
              </SelectItem>
              <SelectItem value="delivered" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-emerald-100 text-emerald-800 border-emerald-200 whitespace-nowrap">
                  Delivered
                </Badge>
              </SelectItem>
              <SelectItem value="payout_ready" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-purple-100 text-purple-800 border-purple-200 whitespace-nowrap">
                  Payout Ready
                </Badge>
              </SelectItem>
              <SelectItem value="returned" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-rose-100 text-rose-800 border-rose-200 whitespace-nowrap">
                  Returned
                </Badge>
              </SelectItem>
              <SelectItem value="lost" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-200 whitespace-nowrap">
                  Lost
                </Badge>
              </SelectItem>
              <SelectItem value="cancelled" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-200 whitespace-nowrap">
                  Cancelled
                </Badge>
              </SelectItem>
              <SelectItem value="paid" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-emerald-100 text-emerald-800 border-emerald-200 whitespace-nowrap">
                  Paid
                </Badge>
              </SelectItem>
              <SelectItem value="cod" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-200 whitespace-nowrap">
                  COD
                </Badge>
              </SelectItem>
              <SelectItem value="credit" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-indigo-100 text-indigo-800 border-indigo-200 whitespace-nowrap">
                  Credit
                </Badge>
              </SelectItem>
            </SelectContent>
          </Select>

          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger className="h-11 w-full px-3 shadow-none">
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent className="w-auto min-w-[120px]">
              <SelectItem value="all" className="pl-2 pr-2">
                <Badge variant="outline" className="text-xs bg-muted/60 whitespace-nowrap">
                  All Users
                </Badge>
              </SelectItem>
              {salesUsers.map((user: any) => (
                <SelectItem key={user.id} value={user.id} className="pl-2 pr-2">
                  <Badge variant="outline" className="text-xs bg-slate-50 text-slate-700 border-slate-200 whitespace-nowrap">
                    {user.full_name || 'Unknown User'}
                  </Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

        </div>
      </div>

      {showSalesReview && (
        <div className="space-y-4">
          <Collapsible open={showDeliveredSection} onOpenChange={setShowDeliveredSection}>
            <div className="card overflow-hidden rounded-2xl border border-base-300 bg-base-100 text-base-content shadow-sm">
              <CollapsibleTrigger asChild>
                <div className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-3 transition-colors hover:bg-base-200/40 sm:gap-4 sm:px-5 sm:py-4">
                  <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-success/15 text-success sm:h-12 sm:w-12 sm:rounded-xl">
                      <PackageCheck className="h-5 w-5 sm:h-6 sm:w-6" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-foreground sm:text-lg">Delivered Orders</h3>
                      <p className="truncate text-xs text-muted-foreground sm:text-sm">{statusRangeLabel}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-lg font-bold text-foreground sm:text-2xl">{deliveredEntries.length}</div>
                      <div className="text-xs font-medium text-muted-foreground sm:text-sm">{formatCurrencyAmount(deliveredTotal)}</div>
                    </div>
                    <div className="flex h-7 w-7 items-center justify-center rounded-full border border-base-300 bg-base-100 text-muted-foreground transition-transform sm:h-8 sm:w-8">
                      {showDeliveredSection ? <ChevronUp className="h-4 w-4 sm:h-5 sm:w-5" /> : <ChevronDown className="h-4 w-4 sm:h-5 sm:w-5" />}
                    </div>
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border-t border-base-300 bg-base-100 px-2 py-3 sm:px-4 sm:py-4">
                  {deliveredEntries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 sm:py-8 text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/15 sm:h-16 sm:w-16">
                        <PackageCheck className="h-6 w-6 text-success/70 sm:h-8 sm:w-8" />
                      </div>
                      <p className="text-sm font-medium text-foreground">No delivered orders</p>
                      <p className="px-4 text-xs text-muted-foreground">Orders marked as delivered in this period will appear here</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                      {deliveredEntries.map((entry, index) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => handleViewDetails(entry.id)}
                          className="group flex w-full items-center gap-3 rounded-xl border border-base-300/80 bg-base-100 p-3 text-left transition-all hover:border-success/40 hover:bg-success/10 active:scale-[0.99] sm:gap-4 sm:p-4"
                        >
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-success/15 text-xs font-bold text-success sm:h-10 sm:w-10 sm:text-sm">
                            {index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
                              <span className="truncate text-sm font-semibold text-foreground sm:text-base" title={entry.customer}>
                                {entry.customer}
                              </span>
                              {entry.phone && (
                                <span className="hidden truncate text-xs text-muted-foreground sm:inline">� {entry.phone}</span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground sm:gap-2">
                              <span className="badge badge-outline badge-sm border-success/40 bg-success/10 text-success">
                                {entry.invoice}
                              </span>
                              <span className="hidden sm:inline">�</span>
                              <span className="hidden sm:inline">{entry.courier}</span>
                              <span className="hidden md:inline">�</span>
                              <span className="hidden md:inline">
                                {formatInTimeZone(new Date(entry.deliveredAt), "MMM dd, hh:mm a", systemSettings.timezone)}
                              </span>
                            </div>
                            {/* Mobile-only details row */}
                            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground/90 sm:hidden">
                              <span>{entry.courier}</span>
                              <span>�</span>
                              <span>{formatInTimeZone(new Date(entry.deliveredAt), "MMM dd, hh:mm a", systemSettings.timezone)}</span>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-base font-bold text-foreground sm:text-lg">
                              {formatCurrencyAmount(entry.total)}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-dashed">
              <CardHeader className="flex w-full flex-row items-center justify-between gap-3 pb-2">
                <CardTitle className="text-lg">COD (Due)</CardTitle>
                <span className="text-sm font-semibold">
                  {formatCurrencyAmount(
                    dueAllEntries.reduce((sum, entry) => sum + entry.amount, 0)
                  )}
                </span>
              </CardHeader>
              <CardContent className="sales-review-scroll max-h-[80vh] space-y-2 overflow-y-auto px-4">
                {dueAllEntries.map((entry) => {
                  const isChecked = checkedEntryIds.includes(entry.id);
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => toggleEntryChecked(entry.id)}
                      onMouseEnter={() => setHoveredEntryId(entry.id)}
                      onMouseLeave={() => setHoveredEntryId(null)}
                      className={`flex w-full items-center justify-between gap-3 rounded-md px-1 py-1 text-left text-sm transition-colors ${getEntryRowClasses(entry.id)}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium" title={entry.customer}>
                          {entry.customer}
                        </div>
                        <div className="truncate text-xs text-muted-foreground" title={entry.courier}>
                          {entry.courier}
                        </div>
                      </div>
                      <div className="whitespace-nowrap font-semibold">
                        {formatCurrencyAmount(entry.amount)}
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {(() => {
              const onlineTypes = new Set(["bank", "mobile", "card", "gateway", "online", "custom"]);
              const onlineEntries = paymentMethodEntries.filter(([method]) =>
                onlineTypes.has(methodTypeFor(method))
              );
              const cashEntries = paymentMethodEntries.filter(
                ([method]) => methodTypeFor(method) === "cash"
              );
              const onlineTotal = onlineEntries.reduce(
                (sum, [, entries]) => sum + entries.reduce((entrySum, entry) => entrySum + entry.amount, 0),
                0
              );
              const cashTotal = cashEntries.reduce(
                (sum, [, entries]) => sum + entries.reduce((entrySum, entry) => entrySum + entry.amount, 0),
                0
              );

              return (
                <>
                  <Card className="border-dashed">
                    <CardHeader className="flex w-full flex-row items-center justify-between gap-3 pb-2">
                      <CardTitle className="text-lg font-semibold">Online</CardTitle>
                      <span className="text-sm font-semibold">{formatCurrencyAmount(onlineTotal)}</span>
                    </CardHeader>
                    <CardContent className="sales-review-scroll max-h-[80vh] space-y-6 overflow-y-auto px-4">
                      {onlineEntries.map(([method, entries], index) => (
                        <div key={method} className="space-y-3">
                          <CardTitle className="text-base font-semibold">
                            <span className="capitalize">{methodLabelFor(method)}</span>
                          </CardTitle>
                          <div className="space-y-3">
                            {entries.map((entry) => {
                              const isChecked = checkedEntryIds.includes(entry.id);
                              return (
                                <button
                                  key={entry.id}
                                  type="button"
                                  onClick={() => toggleEntryChecked(entry.id)}
                                  onMouseEnter={() => setHoveredEntryId(entry.id)}
                                  onMouseLeave={() => setHoveredEntryId(null)}
                                  className={`flex w-full items-center justify-between gap-3 rounded-md px-1 py-1 text-left text-sm transition-colors ${getEntryRowClasses(entry.id)}`}
                                >
                                  <div className="min-w-0">
                                    <div className="truncate font-medium" title={entry.customer}>
                                      {entry.customer}
                                    </div>
                                    <div className="truncate text-xs text-muted-foreground" title={entry.courier}>
                                      {entry.courier}
                                    </div>
                                  </div>
                                  <div className="whitespace-nowrap font-semibold">
                                    {formatCurrencyAmount(entry.amount)}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                          {index < onlineEntries.length - 1 && (
                            <div className="border-t border-border/60 pt-3" />
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="border-dashed">
                    <CardHeader className="flex w-full flex-row items-center justify-between gap-3 pb-2">
                      <CardTitle className="text-lg font-semibold">Cash</CardTitle>
                      <span className="text-sm font-semibold">{formatCurrencyAmount(cashTotal)}</span>
                    </CardHeader>
                    <CardContent className="sales-review-scroll max-h-[80vh] space-y-2 overflow-y-auto px-4">
                      {cashEntries.flatMap(([, entries]) => entries).map((entry) => {
                        const isChecked = checkedEntryIds.includes(entry.id);
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => toggleEntryChecked(entry.id)}
                            onMouseEnter={() => setHoveredEntryId(entry.id)}
                            onMouseLeave={() => setHoveredEntryId(null)}
                            className={`flex w-full items-center justify-between gap-3 rounded-md px-1 py-1 text-left text-sm transition-colors ${getEntryRowClasses(entry.id)}`}
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium" title={entry.customer}>
                                {entry.customer}
                              </div>
                              <div className="truncate text-xs text-muted-foreground" title={entry.courier}>
                                {entry.courier}
                              </div>
                            </div>
                            <div className="whitespace-nowrap font-semibold">
                              {formatCurrencyAmount(entry.amount)}
                            </div>
                          </button>
                        );
                      })}
                    </CardContent>
                  </Card>
                </>
              );
            })()}

            <Card className="border-dashed">
              <CardHeader className="flex w-full flex-row items-center justify-between gap-3 pb-2">
                <CardTitle className="text-lg font-semibold">Credit</CardTitle>
                <span className="text-sm font-semibold">
                  {formatCurrencyAmount(
                    creditEntries.reduce((sum, entry) => sum + entry.amount, 0)
                  )}
                </span>
              </CardHeader>
              <CardContent className="sales-review-scroll max-h-[80vh] space-y-2 overflow-y-auto px-4">
                {creditEntries.map((entry) => {
                  const isChecked = checkedEntryIds.includes(entry.id);
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => toggleEntryChecked(entry.id)}
                      onMouseEnter={() => setHoveredEntryId(entry.id)}
                      onMouseLeave={() => setHoveredEntryId(null)}
                      className={`flex w-full items-center justify-between gap-3 rounded-md px-1 py-1 text-left text-sm transition-colors ${getEntryRowClasses(entry.id)}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium" title={entry.customer}>
                          {entry.customer}
                        </div>
                        <div className="truncate text-xs text-muted-foreground" title={entry.courier}>
                          {entry.courier}
                        </div>
                      </div>
                      <div className="whitespace-nowrap font-semibold">
                        {formatCurrencyAmount(entry.amount)}
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </div>
      )}


      <Card className="border-0 shadow-none md:border md:shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:hidden">
                <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-base-300 bg-base-100 p-2 scrollbar-hide">
                  <Checkbox
                    className="h-4 w-4 rounded-[4px] border-base-content/70 bg-base-100 shadow-sm ring-1 ring-base-content/15"
                    checked={allPageSelected ? true : (somePageSelected ? "indeterminate" : false)}
                    onCheckedChange={(checked) => togglePageSelection(checked === true)}
                    aria-label="Select all sales on this page"
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {selectedCount}
                  </span>
                  <Select
                    value={bulkStatusValue}
                    onValueChange={handleBulkCourierStatusChange}
                    disabled={isBulkStatusUpdating || selectedCount === 0}
                  >
                    <SelectTrigger className="h-9 w-auto min-w-[116px] rounded-xl border-base-content/35 bg-base-100 text-xs whitespace-nowrap">
                      <SelectValue placeholder="Bulk Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none" className="pl-2 pr-2">
                        <Badge variant="outline" className="text-xs bg-muted/60 border-muted-foreground/30">
                          Bulk Status
                        </Badge>
                      </SelectItem>
                      {BULK_COURIER_STATUS_OPTIONS.map((status: any) => (
                        <SelectItem key={status.value} value={status.value} className="pl-2 pr-2">
                          <Badge variant="outline" className={cn("text-xs", status.color)}>
                            {status.label}
                          </Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleBulkPrint}
                    disabled={isBulkPrinting || selectedCount === 0}
                    className="h-9 flex-none rounded-xl border-base-content/35 bg-base-100 px-3 text-xs whitespace-nowrap"
                    title={selectedCount === 0 ? "Select sales first" : "Print selected invoices"}
                  >
                    <Printer className={cn("h-3.5 w-3.5", isBulkPrinting && "animate-pulse")} />
                    Bulk Print
                  </Button>
                </div>
                {paginatedSales.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      {filteredSales.length === 0
                        ? showSalesReview
                          ? "No sales reviews found"
                          : "No sales found"
                        : showSalesReview
                          ? "No sales reviews on this page"
                          : "No sales on this page"}
                    </CardContent>
                  </Card>
                ) : (
                  paginatedSales.map((sale) => {
                    const creditDue = getCreditDueAmount(sale);
                    const isCreditRow = isCreditSale(sale) && creditDue > 0;
                    const cardClassName = isCreditRow
                      ? "border-dashed bg-indigo-100/70"
                      : "border-dashed";
                    return (
                      <Card key={sale.id} className={cardClassName}>
                        <CardContent className="space-y-3 p-3 sm:p-4">
                          {showSalesReview ? (
                            <>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex min-w-0 flex-1 items-start gap-2">
                                  <Checkbox
                                    className="h-4 w-4 rounded-[4px] border-base-content/70 bg-base-100 shadow-sm ring-1 ring-base-content/15"
                                    checked={selectedSaleIds.includes(sale.id)}
                                    onCheckedChange={(checked) => toggleSaleSelection(sale.id, checked === true)}
                                    aria-label={`Select sale ${sale.invoice_number}`}
                                  />
                                  {renderSaleCustomerLabel(sale, true)}
                                </div>
                                <Badge variant="outline" className="max-w-[42%] shrink-0 truncate capitalize">
                                  {getCourierDisplayName(sale)}
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {sale.invoice_number}
                              </div>
                              <div className="grid gap-2 text-xs text-muted-foreground">
                                <div className="flex items-center justify-between">
                                  <span>Total Amount</span>
                                  <span>{formatCurrencyAmount(sale.grand_total || 0)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>Paid Amount</span>
                                  <span>{formatCurrencyAmount(getPaidTotal(sale))}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>Discount</span>
                                  <span>{formatCurrencyAmount((sale as any).discount_amount || 0)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>Due Amount</span>
                                  <span>{formatCurrencyAmount(Math.max(0, sale.amount_due || 0))}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>Payment Method</span>
                                  <span>{methodLabelFor((sale as any).payment_method) || "-"}</span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex min-w-0 flex-1 items-start gap-2">
                                  <Checkbox
                                    className="h-4 w-4 rounded-[4px] border-base-content/70 bg-base-100 shadow-sm ring-1 ring-base-content/15"
                                    checked={selectedSaleIds.includes(sale.id)}
                                    onCheckedChange={(checked) => toggleSaleSelection(sale.id, checked === true)}
                                    aria-label={`Select sale ${sale.invoice_number}`}
                                  />
                                  {renderSaleCustomerLabel(sale, true)}
                                </div>
                                <Badge variant="outline" className="max-w-[42%] shrink-0 truncate capitalize">
                                  {getCourierDisplayName(sale)}
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {sale.invoice_number}
                              </div>
                              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                <span className="min-w-0 truncate">{formatInTimeZone(new Date(sale.created_at), "MMM dd, yyyy", systemSettings.timezone)}</span>
                                <span className="shrink-0">{formatCurrencyAmount(sale.grand_total || 0)}</span>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <ManualCourierStatusSelector
                                    saleId={sale.id}
                                    currentStatus={sale.courier_status}
                                    onStatusUpdate={(newStatus) => handleManualStatusUpdate(sale.id, newStatus)}
                                    variant="inline"
                                    size="sm"
                                  />
                                </div>

                              </div>
                            </>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <PermissionGate permission="sales.edit">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditSale(sale.id)}
                                className="h-9 w-9 flex-none p-0"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </PermissionGate>
                            <PermissionGate permission="sales.view">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewDetails(sale.id)}
                                className="h-9 w-9 flex-none p-0"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </PermissionGate>
                            <PermissionGate permission="courier.send">
                              {shouldShowCourierButtons(sale) ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenCourierDialog(sale)}
                                  title="View courier status"
                                  className="h-9 w-9 flex-none p-0"
                                >
                                  <PackageSearch className="h-4 w-4 text-blue-600" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenCourierDialog(sale)}
                                  disabled={!canSendToCourier(sale)}
                                  title={canSendToCourier(sale) ? "Send to courier" : "Courier API not configured"}
                                  className="h-9 w-9 flex-none p-0"
                                >
                                  <Truck className="h-4 w-4" />
                                </Button>
                              )}
                            </PermissionGate>
                            <PermissionGate permission="invoices.download_print">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handlePrintInvoice(sale)}
                                title="Print Invoice"
                                className="h-9 w-9 flex-none p-0"
                              >
                                <Printer className="h-4 w-4" />
                              </Button>
                            </PermissionGate>
                            <PermissionGate permission="sales.create">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => requestDuplicateSale(sale.id)}
                                disabled={duplicatingSaleId === sale.id}
                                title="Duplicate sale"
                                className="h-9 w-9 flex-none p-0"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </PermissionGate>
                            <PermissionGate permission="courier.refresh">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStatusRefresh(sale.id, (sale.consignment_id || sale.cn_number) || '', true)}
                                disabled={isRefreshingStatuses || refreshingIndividual === sale.id || !shouldShowCourierButtons(sale)}
                                title={shouldShowCourierButtons(sale) ? "Refresh order status" : "Courier tracking not configured"}
                                className="h-9 w-9 flex-none p-0"
                              >
                                <RefreshCw className={cn("h-4 w-4", (isRefreshingStatuses || refreshingIndividual === sale.id) && "animate-spin")} />
                              </Button>
                            </PermissionGate>
                            <PermissionGate permission="sales.delete">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteSale(sale.id)}
                                disabled={deleteSale.isPending}
                                title="Delete sale"
                                className="h-9 w-9 flex-none p-0 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </PermissionGate>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
              <div className="hidden md:block">
                <div className="table-scroll-wrapper space-y-0">
                  <div className="table-scroll-body">
                    <Table
                      ref={tableRef}
                        containerClassName="table-vertical-scroll table-inner-scrollbar h-[39rem] max-h-[39rem] rounded-2xl border-0 overflow-y-auto"
                        className="border-separate border-spacing-y-0"
                      >
                      <TableHeader className="sticky top-0 z-[6] overflow-hidden rounded-t-2xl bg-base-200">
                        <TableRow className="sticky top-0 z-[6] bg-base-200 shadow-[0_1px_0_hsl(var(--border))] [&>th]:font-semibold [&>th]:text-foreground [&>th:first-child]:rounded-tl-2xl [&>th:last-child]:rounded-tr-2xl">
                          {showSalesReview ? (
                            <>
                              <TableHead className="w-10 whitespace-nowrap bg-base-200">
                                <Checkbox
                                  className="h-4 w-4 rounded-[4px] border-base-content/70 bg-base-100 shadow-sm ring-1 ring-base-content/15"
                                  checked={allPageSelected ? true : (somePageSelected ? "indeterminate" : false)}
                                  onCheckedChange={(checked) => togglePageSelection(checked === true)}
                                  aria-label="Select all sales on this page"
                                />
                              </TableHead>
                              <TableHead className="whitespace-nowrap bg-base-200">Invoice</TableHead>
                              <TableHead className="whitespace-nowrap bg-base-200">Customer</TableHead>
                              <TableHead className="whitespace-nowrap bg-base-200">Total</TableHead>
                              <TableHead className="whitespace-nowrap bg-base-200">Paid</TableHead>
                              <TableHead className="whitespace-nowrap bg-base-200">Discount</TableHead>
                              <TableHead className="whitespace-nowrap bg-base-200">Due</TableHead>
                              <TableHead className="whitespace-nowrap bg-base-200">P. Method</TableHead>
                              <TableHead className="whitespace-nowrap bg-base-200">Courier Name</TableHead>
                              <TableHead className="whitespace-nowrap bg-base-200">
                                <div className="flex items-center gap-2">
                                  Actions
                                  <PermissionGate permission="courier.refresh">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          onClick={() => setShowBulkRefreshDialog(true)}
                                          disabled={isBulkRefreshing}
                                          className="h-10 min-h-10 w-10 rounded-xl border-base-content/35 bg-base-100"
                                        >
                                          <RefreshCw className={cn("h-4 w-4", isBulkRefreshing && "animate-spin")} />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Refresh all courier statuses</TooltipContent>
                                    </Tooltip>
                                  </PermissionGate>
                                  <Select
                                    value={bulkStatusValue}
                                    onValueChange={handleBulkCourierStatusChange}
                                    disabled={isBulkStatusUpdating || selectedCount === 0}
                                  >
                                    <SelectTrigger className="w-auto min-w-[130px] rounded-xl border-base-content/35 bg-base-100 text-xs">
                                      <SelectValue placeholder="Bulk Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none" className="pl-2 pr-2">
                                        <Badge variant="outline" className="text-xs bg-muted/60 border-muted-foreground/30">
                                          Bulk Status
                                        </Badge>
                                      </SelectItem>
                                      {BULK_COURIER_STATUS_OPTIONS.map((status: any) => (
                                        <SelectItem key={status.value} value={status.value} className="pl-2 pr-2">
                                          <Badge
                                            variant="outline"
                                            className={cn("text-xs", status.color)}
                                          >
                                            {status.label}
                                          </Badge>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleBulkPrint}
                                    disabled={isBulkPrinting || selectedCount === 0}
                                    className="h-10 min-h-10 rounded-xl border-base-content/35 bg-base-100 px-3 text-xs"
                                    title={selectedCount === 0 ? "Select sales first" : "Print selected invoices"}
                                  >
                                    <Printer className={cn("h-3.5 w-3.5", isBulkPrinting && "animate-pulse")} />
                                    Bulk Print
                                  </Button>
                                </div>
                              </TableHead>
                            </>
                          ) : (
                            <>
                              <TableHead className="w-10 whitespace-nowrap bg-base-200">
                                <Checkbox
                                  className="h-4 w-4 rounded-[4px] border-base-content/70 bg-base-100 shadow-sm ring-1 ring-base-content/15"
                                  checked={allPageSelected ? true : (somePageSelected ? "indeterminate" : false)}
                                  onCheckedChange={(checked) => togglePageSelection(checked === true)}
                                  aria-label="Select all sales on this page"
                                />
                              </TableHead>
                              <TableHead className="whitespace-nowrap bg-base-200">Customer</TableHead>
                              <TableHead className="whitespace-nowrap bg-base-200">Phone Number</TableHead>
                              <TableHead className="whitespace-nowrap bg-base-200">Total</TableHead>
                              <TableHead className="whitespace-nowrap bg-base-200">Paid</TableHead>
                              <TableHead className="whitespace-nowrap bg-base-200">Due/Credit</TableHead>
                              <TableHead className="whitespace-nowrap bg-base-200">P. Method</TableHead>
                              <TableHead className="whitespace-nowrap bg-base-200">Courier Name</TableHead>
                              <TableHead className="whitespace-nowrap bg-base-200">CN Number</TableHead>
                              <TableHead className="whitespace-nowrap bg-base-200">Courier Status</TableHead>
                              <TableHead className="whitespace-nowrap bg-base-200">
                                <div className="flex items-center gap-2">
                                  Actions
                                  <PermissionGate permission="courier.refresh">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          onClick={() => setShowBulkRefreshDialog(true)}
                                          disabled={isBulkRefreshing}
                                          className="h-10 min-h-10 w-10 rounded-xl border-base-content/35 bg-base-100"
                                        >
                                          <RefreshCw className={cn("h-4 w-4", isBulkRefreshing && "animate-spin")} />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Refresh all courier statuses</TooltipContent>
                                    </Tooltip>
                                  </PermissionGate>
                                  <Select
                                    value={bulkStatusValue}
                                    onValueChange={handleBulkCourierStatusChange}
                                    disabled={isBulkStatusUpdating || selectedCount === 0}
                                  >
                                    <SelectTrigger className="w-auto min-w-[130px] rounded-xl border-base-content/35 bg-base-100 text-xs">
                                      <SelectValue placeholder="Bulk Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none" className="pl-2 pr-2">
                                        <Badge variant="outline" className="text-xs bg-muted/60 border-muted-foreground/30">
                                          Bulk Status
                                        </Badge>
                                      </SelectItem>
                                      {BULK_COURIER_STATUS_OPTIONS.map((status: any) => (
                                        <SelectItem key={status.value} value={status.value} className="pl-2 pr-2">
                                          <Badge
                                            variant="outline"
                                            className={cn("text-xs", status.color)}
                                          >
                                            {status.label}
                                          </Badge>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleBulkPrint}
                                    disabled={isBulkPrinting || selectedCount === 0}
                                    className="h-10 min-h-10 rounded-xl border-base-content/35 bg-base-100 px-3 text-xs"
                                    title={selectedCount === 0 ? "Select sales first" : "Print selected invoices"}
                                  >
                                    <Printer className={cn("h-3.5 w-3.5", isBulkPrinting && "animate-pulse")} />
                                    Bulk Print
                                  </Button>
                                </div>
                              </TableHead>
                            </>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedSales.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={10} className="text-center text-muted-foreground">
                              {filteredSales.length === 0
                                ? showSalesReview
                                  ? "No sales reviews found"
                                  : "No sales found"
                                : showSalesReview
                                  ? "No sales reviews on this page"
                                  : "No sales on this page"}
                            </TableCell>
                          </TableRow>
                        ) : (
                          paginatedSales.map((sale) => {
                            const { isCancelled, isLost } = getStatusFlags(sale);
                            const creditDue = getCreditDueAmount(sale);
                            const isCreditRow = isCreditSale(sale) && creditDue > 0;
                            const isPaid = sale.payment_status === 'paid' && !isCreditSale(sale);
                            const isColoredRow = isCancelled || isLost || isCreditRow || isPaid;
                            const cancelledRowClass = "bg-[rgb(255_200_205_/_55%)] hover:bg-[rgb(255_200_205_/_55%)]";
                            const paidRowClass = "bg-[rgb(200_255_205_/_55%)] hover:bg-[rgb(200_255_205_/_55%)]";
                            const creditRowClass = "bg-indigo-100/70 hover:bg-indigo-100/70";
                            return (
                              <TableRow
                                key={sale.id}
                                className={cn(
                                  isCancelled || isLost
                                    ? cancelledRowClass
                                    : isCreditRow
                                      ? creditRowClass
                                      : isPaid
                                        ? paidRowClass
                                        : undefined,
                                  isColoredRow && "[&>td:first-child]:!rounded-none [&>td:last-child]:!rounded-none"
                                )}
                              >
                                {showSalesReview ? (
                                  <>
                                    <TableCell className="first:rounded-l-[10px] last:rounded-r-[10px]">
                                      <Checkbox
                                        className="h-4 w-4 rounded-[4px] border-base-content/70 bg-base-100 shadow-sm ring-1 ring-base-content/15"
                                        checked={selectedSaleIds.includes(sale.id)}
                                        onCheckedChange={(checked) => toggleSaleSelection(sale.id, checked === true)}
                                        aria-label={`Select sale ${sale.invoice_number}`}
                                      />
                                    </TableCell>
                                    <TableCell className="font-medium whitespace-nowrap first:rounded-l-[10px] last:rounded-r-[10px]">{sale.invoice_number}</TableCell>
                                    <TableCell className="max-w-[150px] first:rounded-l-[10px] last:rounded-r-[10px]">
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div
                                              className="block cursor-help transition-colors duration-150 hover:text-foreground"
                                              title={sale.customer_name}
                                            >
                                              {renderSaleCustomerLabel(sale)}
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent
                                            side="top"
                                            align="start"
                                            className="z-[70] max-w-[340px] rounded-xl border border-base-content/25 bg-base-100 p-3 shadow-xl backdrop-blur-none"
                                          >
                                            {renderCustomerHoverDetails(sale)}
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap first:rounded-l-[10px] last:rounded-r-[10px]">{formatCurrencyAmount(sale.grand_total || 0)}</TableCell>
                                    <TableCell className="whitespace-nowrap first:rounded-l-[10px] last:rounded-r-[10px]">{formatCurrencyAmount(getPaidTotal(sale))}</TableCell>
                                    <TableCell className="whitespace-nowrap first:rounded-l-[10px] last:rounded-r-[10px]">{formatCurrencyAmount((sale as any).discount_amount || 0)}</TableCell>
                                    <TableCell className="whitespace-nowrap first:rounded-l-[10px] last:rounded-r-[10px]">{formatCurrencyAmount(Math.max(0, sale.amount_due || 0))}</TableCell>
                                    <TableCell className="max-w-[140px] truncate capitalize first:rounded-l-[10px] last:rounded-r-[10px]" title={methodLabelFor((sale as any).payment_method) || "-"}>
                                      {(() => {
                                        const methodLabel = methodLabelFor((sale as any).payment_method) || "-";
                                        const isMixed = methodLabel.toLowerCase() === "mixed";
                                        if (!isMixed) return methodLabel;
                                        return (
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <span className="cursor-help">Mixed</span>
                                              </TooltipTrigger>
                                              <TooltipContent>{getMixedMethodLabels(sale)}</TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        );
                                      })()}
                                    </TableCell>
                                    <TableCell className="max-w-[140px] truncate first:rounded-l-[10px] last:rounded-r-[10px]" title={getCourierDisplayName(sale)}>
                                      {getCourierDisplayName(sale)}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap first:rounded-l-[10px] last:rounded-r-[10px]">
                                      <div className="flex items-center gap-1">
                                        <PermissionGate permission="sales.edit">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleEditSale(sale.id)}
                                          >
                                            <Edit className="h-4 w-4" />
                                          </Button>
                                        </PermissionGate>
                                        <PermissionGate permission="sales.view">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleViewDetails(sale.id)}
                                          >
                                            <Eye className="h-4 w-4" />
                                          </Button>
                                        </PermissionGate>
                                        <PermissionGate permission="courier.send">
                                          {shouldShowCourierButtons(sale) ? (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => handleOpenCourierDialog(sale)}
                                              title="View courier status"
                                            >
                                              <PackageSearch className="h-4 w-4 text-blue-600" />
                                            </Button>
                                          ) : (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => handleOpenCourierDialog(sale)}
                                              title="Send to courier"
                                            >
                                              <Truck className="h-4 w-4" />
                                            </Button>
                                          )}
                                        </PermissionGate>
                                        <PermissionGate permission="invoices.download_print">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handlePrintInvoice(sale)}
                                            title="Print Invoice"
                                          >
                                            <Printer className="h-4 w-4" />
                                          </Button>
                                        </PermissionGate>
                                        <PermissionGate permission="sales.create">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => requestDuplicateSale(sale.id)}
                                            disabled={duplicatingSaleId === sale.id}
                                            title="Duplicate sale"
                                          >
                                            <Copy className="h-4 w-4" />
                                          </Button>
                                        </PermissionGate>
                                        <PermissionGate permission="sales.delete">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDeleteSale(sale.id)}
                                            title="Delete Sale"
                                            className="text-destructive hover:text-destructive"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </PermissionGate>
                                      </div>
                                    </TableCell>
                                  </>
                                ) : (
                                  <>
                                    <TableCell className="first:rounded-l-[10px] last:rounded-r-[10px]">
                                      <Checkbox
                                        className="h-4 w-4 rounded-[4px] border-base-content/70 bg-base-100 shadow-sm ring-1 ring-base-content/15"
                                        checked={selectedSaleIds.includes(sale.id)}
                                        onCheckedChange={(checked) => toggleSaleSelection(sale.id, checked === true)}
                                        aria-label={`Select sale ${sale.invoice_number}`}
                                      />
                                    </TableCell>
                                    <TableCell className="max-w-[150px] first:rounded-l-[10px] last:rounded-r-[10px]">
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div
                                              className="block cursor-help transition-colors duration-150 hover:text-foreground"
                                              title={sale.customer_name}
                                            >
                                              {renderSaleCustomerLabel(sale)}
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent
                                            side="top"
                                            align="start"
                                            className="z-[70] max-w-[340px] rounded-xl border border-base-content/25 bg-base-100 p-3 shadow-xl backdrop-blur-none"
                                          >
                                            {renderCustomerHoverDetails(sale)}
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </TableCell>
                                    <TableCell className="max-w-[150px] first:rounded-l-[10px] last:rounded-r-[10px]">
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span
                                              className="block cursor-help truncate transition-colors duration-150 hover:text-foreground"
                                              title={sale.customer_phone}
                                            >
                                              {sale.customer_phone}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent
                                            side="top"
                                            align="start"
                                            className="z-[70] max-w-[340px] rounded-xl border border-base-content/25 bg-base-100 p-3 shadow-xl backdrop-blur-none"
                                          >
                                            {renderCustomerHoverDetails(sale)}
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap first:rounded-l-[10px] last:rounded-r-[10px]">{formatCurrencyAmount(sale.grand_total || 0)}</TableCell>
                                    <TableCell className="whitespace-nowrap first:rounded-l-[10px] last:rounded-r-[10px]">{formatCurrencyAmount(getPaidTotal(sale))}</TableCell>
                                    <TableCell className="whitespace-nowrap first:rounded-l-[10px] last:rounded-r-[10px]">
                                      {formatCurrencyAmount(Math.max(0, isCreditSale(sale) ? getCreditDueAmount(sale) : (sale.amount_due || 0)))}
                                    </TableCell>
                                    <TableCell className="max-w-[140px] truncate capitalize first:rounded-l-[10px] last:rounded-r-[10px]" title={methodLabelFor((sale as any).payment_method) || "-"}>
                                      {(() => {
                                        const methodLabel = methodLabelFor((sale as any).payment_method) || "-";
                                        const isMixed = methodLabel.toLowerCase() === "mixed";
                                        if (!isMixed) return methodLabel;
                                        return (
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <span className="cursor-help">Mixed</span>
                                              </TooltipTrigger>
                                              <TooltipContent>{getMixedMethodLabels(sale)}</TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        );
                                      })()}
                                    </TableCell>
                                    <TableCell className="first:rounded-l-[10px] last:rounded-r-[10px]">
                                      {getCourierDisplayName(sale)}
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap first:rounded-l-[10px] last:rounded-r-[10px]">
                                      {sale.cn_number ? (
                                        (() => {
                                          const courierName = (sale.courier_name || '').toLowerCase();
                                          let trackingUrl = '';

                                          if (courierName === 'steadfast') {
                                            trackingUrl = `https://steadfast.com.bd/user/consignment/${sale.cn_number}`;
                                          } else if (courierName === 'pathao') {
                                            trackingUrl = `https://merchant.pathao.com/courier/orders/${sale.cn_number}`;
                                          } else if (courierName === 'sundorban') {
                                            trackingUrl = `https://tracking.sundarbancourierltd.com/?cnnumber=${sale.cn_number}`;
                                          } else if (courierName === 'janani' || courierName === 'janani express') {
                                            // Janani requires manual entry - copy CN and open page
                                            trackingUrl = `https://jananiexpress.com/tracking`;
                                          }

                                          const isJanani = courierName === 'janani' || courierName === 'janani express';

                                          if (trackingUrl) {
                                            return (
                                              <a
                                                href={trackingUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                                                title={isJanani ? 'Click to copy CN & open tracking (paste CN, select year, search)' : `Track on ${sale.courier_name}`}
                                                onClick={() => {
                                                  if (isJanani && sale.cn_number) {
                                                    navigator.clipboard.writeText(String(sale.cn_number));
                                                  }
                                                }}
                                              >
                                                {sale.cn_number}
                                              </a>
                                            );
                                          }

                                          return <span>{sale.cn_number}</span>;
                                        })()
                                      ) : (
                                        "-"
                                      )}
                                    </TableCell>
                                    <TableCell className="first:rounded-l-[10px] last:rounded-r-[10px]">
                                      <div className="space-y-2">
                                        <ManualCourierStatusSelector
                                          saleId={sale.id}
                                          currentStatus={sale.courier_status}
                                          onStatusUpdate={(newStatus) => handleManualStatusUpdate(sale.id, newStatus)}
                                          variant="inline"
                                          size="sm"
                                        />
                                      </div>
                                    </TableCell>
                                    <TableCell className="whitespace-nowrap first:rounded-l-[10px] last:rounded-r-[10px]">
                                      <div className="flex items-center gap-1">
                                        <PermissionGate permission="sales.edit">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleEditSale(sale.id)}
                                          >
                                            <Edit className="h-4 w-4" />
                                          </Button>
                                        </PermissionGate>
                                        <PermissionGate permission="sales.view">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleViewDetails(sale.id)}
                                          >
                                            <Eye className="h-4 w-4" />
                                          </Button>
                                        </PermissionGate>
                                        <PermissionGate permission="courier.send">
                                          {shouldShowCourierButtons(sale) ? (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => handleOpenCourierDialog(sale)}
                                              title="View courier status"
                                            >
                                              <PackageSearch className="h-4 w-4 text-blue-600" />
                                            </Button>
                                          ) : (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => handleOpenCourierDialog(sale)}
                                              disabled={!canSendToCourier(sale)}
                                              title={canSendToCourier(sale) ? "Send to courier" : "Courier API not configured"}
                                            >
                                              <Truck className="h-4 w-4" />
                                            </Button>
                                          )}
                                        </PermissionGate>
                                        <PermissionGate permission="invoices.download_print">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handlePrintInvoice(sale)}
                                            title="Print Invoice"
                                          >
                                            <Printer className="h-4 w-4" />
                                          </Button>
                                        </PermissionGate>
                                        <PermissionGate permission="sales.create">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => requestDuplicateSale(sale.id)}
                                            disabled={duplicatingSaleId === sale.id}
                                            title="Duplicate sale"
                                          >
                                            <Copy className="h-4 w-4" />
                                          </Button>
                                        </PermissionGate>
                                        <PermissionGate permission="courier.refresh">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleStatusRefresh(sale.id, (sale.consignment_id || sale.cn_number) || '', true)}
                                            disabled={isRefreshingStatuses || refreshingIndividual === sale.id || !shouldShowCourierButtons(sale)}
                                            title={shouldShowCourierButtons(sale) ? "Refresh order status" : "Courier tracking not configured"}
                                          >
                                            <RefreshCw className={cn("h-4 w-4", (isRefreshingStatuses || refreshingIndividual === sale.id) && "animate-spin")} />
                                          </Button>
                                        </PermissionGate>
                                        <PermissionGate permission="sales.delete">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDeleteSale(sale.id)}
                                            disabled={deleteSale.isPending}
                                            title="Delete sale"
                                            className="text-destructive hover:text-destructive"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </PermissionGate>
                                      </div>
                                    </TableCell>
                                  </>
                                )}
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>

        {/* Pagination */}
        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t">
          <div className="text-sm text-muted-foreground min-w-0 truncate">
            <span className="hidden sm:inline whitespace-nowrap">
              Showing {startIndex + (filteredSales.length ? 1 : 0)}-{endIndex} of {filteredSales.length} items
            </span>
            <span className="sm:hidden whitespace-nowrap">
              Showing {startIndex + (filteredSales.length ? 1 : 0)}-{endIndex} of {filteredSales.length} items
            </span>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 sm:ml-auto">
              <div className="flex items-center gap-2 sm:hidden">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
              <Pagination className="hidden sm:flex">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>

                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNumber;
                    if (totalPages <= 5) {
                      pageNumber = i + 1;
                    } else if (currentPage <= 3) {
                      pageNumber = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNumber = totalPages - 4 + i;
                    } else {
                      pageNumber = currentPage - 2 + i;
                    }

                    return (
                      <PaginationItem key={pageNumber}>
                        <PaginationLink
                          onClick={() => setCurrentPage(pageNumber)}
                          isActive={currentPage === pageNumber}
                          className="cursor-pointer"
                        >
                          {pageNumber}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}

                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      </Card>

      <SaleDialog open={showSaleDialog} onOpenChange={setShowSaleDialog} />
      <EditSaleDialog
        open={showEditDialog}
        onOpenChange={handleCloseEditDialog}
        saleId={editingSaleId}
      />
      <SaleDetailsDialog
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
        saleId={detailsSaleId}
      />
      <CourierOrderDialog
        open={showCourierDialog}
        onOpenChange={setShowCourierDialog}
        saleId={courierSaleId}
      />
      <CourierStatusDialog
        open={showCourierStatusDialog}
        onOpenChange={setShowCourierStatusDialog}
        sale={courierStatusSale}
        onRefreshStatus={async (saleId, consignmentId) => {
          await handleStatusRefresh(saleId, consignmentId, true);
          return true;
        }}
        isRefreshing={refreshingIndividual === courierStatusSale?.id}
      />

      <Dialog open={showStatusChangesDialog} onOpenChange={setShowStatusChangesDialog}>
        <DialogContent className="max-w-full sm:max-w-2xl md:max-w-4xl lg:max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cancelled / Returned / Lost Orders</DialogTitle>
            <DialogDescription>
              Showing status changes by status date: {statusRangeLabel}
            </DialogDescription>
          </DialogHeader>

          {statusChangeEntries.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No cancelled, returned, or lost orders in this range.
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap">Status Date</TableHead>
                    <TableHead className="whitespace-nowrap">Created Date</TableHead>
                    <TableHead className="whitespace-nowrap">Invoice</TableHead>
                    <TableHead className="whitespace-nowrap">Customer</TableHead>
                    <TableHead className="whitespace-nowrap">Courier</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Total</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Paid</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Due</TableHead>
                    <TableHead className="whitespace-nowrap">P. Method</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statusChangeEntries.map((entry) => {
                    const badgeClasses =
                      entry.status === "cancelled"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : entry.status === "returned"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-red-200 bg-red-50 text-red-700";

                    return (
                      <TableRow
                        key={entry.id}
                        onClick={() => {
                          setDetailsSaleId(entry.id);
                          setShowDetailsDialog(true);
                        }}
                        className="cursor-pointer hover:bg-muted/40"
                      >
                        <TableCell>
                          <Badge variant="outline" className={`capitalize ${badgeClasses}`}>
                            {entry.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatInTimeZone(new Date(entry.statusAt), "PPP p", systemSettings.timezone)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatInTimeZone(new Date(entry.createdAt), "PPP", systemSettings.timezone)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-medium">
                          {entry.invoice}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate" title={entry.customer}>
                          {entry.customer}
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate" title={entry.courier}>
                          {entry.courier}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {formatCurrencyAmount(entry.total)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {formatCurrencyAmount(entry.paid)}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {formatCurrencyAmount(entry.due)}
                        </TableCell>
                        <TableCell className="max-w-[140px] truncate" title={entry.paymentMethod}>
                          {entry.paymentMethod}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDeleteSaleId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteSaleId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sale?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The sale and its items will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDeleteSaleId(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteSale}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDuplicateSaleId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDuplicateSaleId(null);
        }}
      >
        <AlertDialogContent className="max-w-[92vw] sm:max-w-md p-0 overflow-hidden">
          <AlertDialogHeader className="space-y-2 px-5 pt-5 pb-3 border-b bg-muted/20">
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Copy className="h-4 w-4" />
              </span>
              Duplicate Sale
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              Create a new sale with the same customer, items, and payment details.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="px-5 py-4 gap-2 sm:gap-2">
            <AlertDialogCancel
              onClick={() => setPendingDuplicateSaleId(null)}
              className="h-9"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDuplicateSale}
              disabled={pendingDuplicateSaleId ? duplicatingSaleId === pendingDuplicateSaleId : false}
              className="h-9"
            >
              {pendingDuplicateSaleId && duplicatingSaleId === pendingDuplicateSaleId ? "Duplicating..." : "Duplicate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Refresh Dialog */}
      <AlertDialog open={showBulkRefreshDialog} onOpenChange={setShowBulkRefreshDialog}>
        <AlertDialogContent className="left-1/2 -translate-x-1/2 max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader className="space-y-2 pb-2">
            <AlertDialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <RefreshCw className="h-5 w-5 text-info" />
              Refresh Courier Statuses
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm text-muted-foreground">
              Choose how to refresh order statuses in your current view
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2.5 py-1">
            <div className="grid gap-3 md:grid-cols-2">
              {/* Refresh Pending Orders Card */}
              <div className="h-full rounded-lg border border-info/30 bg-info/10 p-3">
                <div className="flex items-start gap-2.5 h-full">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-info/20">
                    <RefreshCw className="h-4 w-4 text-info" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <h4 className="text-sm font-semibold text-info">Refresh Pending Orders</h4>
                    <p className="text-xs leading-relaxed text-info/80">
                      Updates only pending orders. Skips delivered, cancelled, returned, and lost orders.
                    </p>
                  </div>
                </div>
              </div>

              {/* Force Refresh All Card */}
              <div className="h-full rounded-lg border border-warning/40 bg-warning/10 p-3">
                <div className="flex items-start gap-2.5 h-full">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-warning/20">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <h4 className="text-sm font-semibold text-warning">Force Refresh All</h4>
                    <p className="text-xs leading-relaxed text-warning/80">
                      Updates <strong>all orders</strong> including those with final statuses. Use when you need to verify completed orders.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Info Note */}
            <div className="flex items-start gap-2 rounded-md bg-muted/40 p-2.5 border border-muted">
              <div className="text-muted-foreground pt-0.5 flex-shrink-0">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                This operation respects your current filters (date, status, search). It may take several minutes depending on order count.
              </p>
            </div>
          </div>

          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:gap-2 pt-2">
            <AlertDialogCancel
              onClick={() => setShowBulkRefreshDialog(false)}
              className="w-full sm:w-auto order-last sm:order-first"
            >
              Cancel
            </AlertDialogCancel>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-2 w-full sm:w-auto">
              <Button
                onClick={handleBulkRefreshAll}
                className="w-full sm:w-auto"
                disabled={isBulkRefreshing}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", isBulkRefreshing && "animate-spin")} />
                Refresh Pending
              </Button>
              <Button
                onClick={handleForceRefreshAll}
                className="w-full sm:w-auto bg-warning text-warning-content hover:bg-warning/90"
                disabled={isBulkRefreshing}
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Force Refresh All
              </Button>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Print Preview Dialog */}
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-2xl md:max-w-4xl lg:max-w-6xl p-0">
          <div className="max-h-[92vh] flex flex-col">
            <DialogHeader className="px-4 sm:px-5 py-3 sm:py-3 border-b">
              <DialogTitle>{isBulkPrintPreview ? "Bulk Invoice Preview" : "Invoice Preview"}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 p-3 sm:p-4 flex-1 min-h-0 lg:grid lg:grid-cols-5 overflow-hidden">
              {/* Preview - scrollable */}
              <div
                ref={printPreviewScrollRef}
                className="w-full flex-1 min-h-0 lg:col-span-4 border rounded overflow-auto bg-base-100 max-h-[50vh] sm:max-h-[56vh] lg:max-h-[76vh]"
                style={{ overflowAnchor: "none" }}
              >
                <iframe
                  key={`${isBulkPrintPreview ? "bulk" : "single"}-${printOptions.size}-${printOptions.orientation}-${printHtml.length}`}
                  title="Invoice Preview"
                  className="block w-full"
                  style={{
                    width: "100%",
                    height: previewHeight ? `${previewHeight}px` : "600px",
                    overflow: "hidden",
                    border: "none",
                  }}
                  srcDoc={applyPrintOptionsToHtml(printHtml)}
                  onLoad={(event) => {
                    const iframeEl = event.currentTarget;
                    const doc = iframeEl.contentDocument;
                    if (!doc) return;

                    // FORCE PDF MODE to disable responsive mobile layout reflows
                    doc.body.classList.add('pdf-mode');
                    if (isBulkPrintPreview) {
                      doc.body.classList.add('bulk-print');
                      doc.body.classList.remove('single-preview');
                    } else {
                      doc.body.classList.add('single-preview');
                      doc.body.classList.remove('bulk-print');
                    }

                    const iframeWidth = iframeEl.clientWidth || window.innerWidth;

                    // Scale based on first memo width and then measure full document height.
                    // This keeps bulk stacked invoices fully visible and scrollable.
                    const memoEl = doc.querySelector('.memo, .cash-memo') as HTMLElement | null;
                    if (!memoEl) return;

                    const memoWidth = memoEl.scrollWidth || memoEl.offsetWidth || iframeWidth;
                    let scale = 1;
                    if (!isBulkPrintPreview) {
                      if (isMobile) {
                        // Mobile-only: always fit full invoice width inside preview area.
                        const safeWidth = Math.max(1, iframeWidth - 8);
                        scale = Math.min(1, safeWidth / memoWidth);
                      } else if (memoWidth > iframeWidth) {
                        // Desktop behavior remains unchanged.
                        scale = iframeWidth / memoWidth;
                      }
                    }
                    doc.documentElement.style.setProperty("--preview-zoom", String(scale));

                    // Wait for layout to settle after zoom update, then read content height.
                    requestAnimationFrame(() => {
                      const memoNodes = Array.from(doc.querySelectorAll('.memo, .cash-memo')) as HTMLElement[];
                      let singleMemoTop = 0;
                      let fullHeight = 0;
                      if (memoNodes.length > 0) {
                        if (isBulkPrintPreview) {
                          const top = Math.min(...memoNodes.map((el) => el.offsetTop || 0));
                          const bottom = Math.max(...memoNodes.map((el) => (el.offsetTop || 0) + (el.offsetHeight || 0)));
                          fullHeight = Math.max(0, bottom - top);
                        } else {
                          const first = memoNodes[0];
                          const top = first.offsetTop || 0;
                          singleMemoTop = top;
                          if (isMobile) {
                            // Mobile single preview: use visual height after scaling to avoid blank space.
                            fullHeight = Math.max(0, Math.ceil(first.getBoundingClientRect().height));
                          } else {
                            const bottom = top + (first.offsetHeight || 0);
                            fullHeight = Math.max(0, bottom - top);
                          }
                        }
                      }
                      if (!fullHeight) {
                        fullHeight = Math.max(
                          doc.body.scrollHeight || 0,
                          doc.documentElement.scrollHeight || 0
                        );
                      }
                      if (fullHeight > 0) {
                        const extraPad = isBulkPrintPreview ? 12 : (isMobile ? 8 : 24);
                        setPreviewHeight(Math.ceil(fullHeight) + extraPad);
                      }
                      // Reset iframe document scroll position explicitly.
                      const targetTop = !isBulkPrintPreview && !isMobile ? singleMemoTop : 0;
                      doc.documentElement.scrollTop = targetTop;
                      doc.body.scrollTop = targetTop;
                      iframeEl.contentWindow?.scrollTo(0, targetTop);
                      if (printPreviewScrollRef.current) {
                        printPreviewScrollRef.current.scrollTop = 0;
                        printPreviewScrollRef.current.scrollLeft = 0;
                      }
                      // Run once more after height update to avoid browser anchoring jump.
                      requestAnimationFrame(() => {
                        doc.documentElement.scrollTop = targetTop;
                        doc.body.scrollTop = targetTop;
                        iframeEl.contentWindow?.scrollTo(0, targetTop);
                        if (printPreviewScrollRef.current) {
                          printPreviewScrollRef.current.scrollTop = 0;
                          printPreviewScrollRef.current.scrollLeft = 0;
                        }
                      });
                    });
                  }}
                  scrolling="no"
                />
              </div>
              {/* Settings */}
              <div className="w-full lg:col-span-1 space-y-3 sm:space-y-4 shrink-0 lg:border-l lg:pl-4">
                <div className="space-y-2">
                  <Label>Paper Size</Label>
                  <OptionSelect
                    value={printOptions.size}
                    onValueChange={(v) => setPrintOptions((p) => ({ ...p, size: v as 'A5' | 'A4' }))}
                  >
                    <OptionSelectTrigger>
                      <OptionSelectValue placeholder="Select size" />
                    </OptionSelectTrigger>
                    <OptionSelectContent>
                      <OptionSelectItem value="A5">A5</OptionSelectItem>
                      <OptionSelectItem value="A4">A4</OptionSelectItem>
                    </OptionSelectContent>
                  </OptionSelect>
                </div>
                <div className="space-y-2">
                  <Label>Orientation</Label>
                  <OptionSelect
                    value={printOptions.orientation}
                    onValueChange={(v) => setPrintOptions((p) => ({ ...p, orientation: v as 'portrait' | 'landscape' }))}
                  >
                    <OptionSelectTrigger>
                      <OptionSelectValue placeholder="Select orientation" />
                    </OptionSelectTrigger>
                    <OptionSelectContent>
                      <OptionSelectItem value="portrait">Portrait</OptionSelectItem>
                      <OptionSelectItem value="landscape">Landscape</OptionSelectItem>
                    </OptionSelectContent>
                  </OptionSelect>
                </div>
                <div className="text-xs text-muted-foreground">
                  Tip: Use browser print dialog to choose printer, margins, and scale.
                </div>
                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => setIsPrintDialogOpen(false)} title="Close">
                    <X className="h-4 w-4" />
                  </Button>

                  {!isBulkPrintPreview && (
                    <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={handleShare} title="Share">
                      <Share2 className="h-4 w-4" />
                    </Button>
                  )}

                  {!isBulkPrintPreview && (
                    <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => downloadInvoicePDF(printSale, businessSettings, systemSettings, undefined, false, printOptions)} title="Download PDF">
                      <Download className="h-4 w-4" />
                    </Button>
                  )}

                  <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl border-base-content/35" onClick={handleConfirmPrint} title="Print">
                    <Printer className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div >
  );

  function applyPrintOptionsToHtml(html: string) {
    try {
      const baseWidth = printOptions.size === "A4" ? "210mm" : "148mm";
      const baseHeight = printOptions.size === "A4" ? "297mm" : "210mm";
      const isLandscape = printOptions.orientation === "landscape";
      const pageWidth = isLandscape ? baseHeight : baseWidth;
      const pageHeight = isLandscape ? baseWidth : baseHeight;
      const sizeToken = printOptions.size + (printOptions.orientation === 'landscape' ? ' landscape' : '');
      let updated = html.replace(/@page\s*\{[^}]*size:[^;]*;?/m, (match) => {
        if (/size:/.test(match)) {
          return match.replace(/size:[^;]*;/, `size: ${sizeToken};`);
        }
        return match.replace(/\{/, `{ size: ${sizeToken};`);
      });
      updated = updated.replace(
        /<head>/i,
        "<head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />"
      );
      updated = updated.replace(
        /<\/head>/i,
        `<style>
          :root { --preview-zoom: 1; }
          html {
            margin: 0; padding: 0;
            width: 100%;
          }
          body {
            margin: 0;
            padding: 0;
            width: 100%;
            min-height: 100%;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            box-sizing: border-box;
          }
          body.bulk-print {
            margin: 0 !important;
            padding: 0 !important;
            min-height: 0 !important;
            height: auto !important;
            display: block !important;
            justify-content: initial !important;
            align-items: initial !important;
          }
          body.bulk-print .bulk-print-page {
            margin: 0 auto 8px !important;
          }
          body.bulk-print .bulk-print-page:last-child {
            margin-bottom: 0 !important;
          }
          body.single-preview {
            margin: 0 !important;
            padding: 0 !important;
            min-height: 0 !important;
            height: auto !important;
            display: block !important;
            justify-content: initial !important;
            align-items: initial !important;
          }
          body.single-preview .memo,
          body.single-preview .cash-memo {
            margin: 0 auto !important;
          }
          /* Use zoom for proper layout scaling and centering */
          .memo, .cash-memo, body.pdf-mode .memo {
            zoom: var(--preview-zoom) !important;
            -moz-transform: scale(var(--preview-zoom));
            -moz-transform-origin: top center;
            margin: 0 auto !important;
          }
          @media print {
            html, body { width: auto !important; max-width: none !important; overflow: visible !important; }
            body { display: block !important; padding: 0 !important; justify-content: initial !important; }
            .memo, .cash-memo, body.pdf-mode .memo { zoom: 1 !important; transform: none !important; margin: 0 auto !important; }
          }
          @page { size: ${pageWidth} ${pageHeight}; margin: 0; }
          :root { --page-width: ${pageWidth}; --page-height: ${pageHeight}; }
          @media print {
            html, body { width: var(--page-width) !important; height: var(--page-height) !important; margin: 0 !important; padding: 0 !important; }
            body { display: block !important; }
            .memo, .cash-memo, body.pdf-mode .memo {
              width: var(--page-width) !important;
              max-width: var(--page-width) !important;
              height: var(--page-height) !important;
              max-height: var(--page-height) !important;
              margin: 0 auto !important;
            }
          }
        </style></head>`
      );
      return updated;
    } catch {
      return html;
    }
  }

  /* New robust share handler */
  async function handleShare() {
    if (!printSale) return;

    // Check rudimentary support (Common Dev Issue)
    if (!window.isSecureContext) {
      toast.error("Sharing requires HTTPS. Downloading file...");
      await downloadInvoicePDF(printSale, businessSettings, systemSettings, undefined, false, printOptions);
      return;
    }

    if (!navigator.share) {
      toast.error("Sharing API not supported. Downloading file...");
      // Fallback to download
      await downloadInvoicePDF(printSale, businessSettings, systemSettings, undefined, false, printOptions);
      return;
    }

    try {
      const result = await downloadInvoicePDF(printSale, businessSettings, systemSettings, undefined, true, printOptions);

      if (result instanceof Blob) {
        const file = new File([result], `Invoice-${printSale.invoice_number}.pdf`, { type: "application/pdf" });

        // Detailed check
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: "Invoice",
            text: `Invoice #${printSale.invoice_number}`
          });
          return;
        } else {
          // Provide feedback on WHY
          if (!window.isSecureContext) {
            toast.error("Sharing requires HTTPS. Downloading instead.");
          } else {
            toast.error("Device constraints prevent file sharing. Downloading instead.");
          }
        }
      }

      // Fallback
      await downloadInvoicePDF(printSale, businessSettings, systemSettings, undefined, false, printOptions);
    } catch (error) {
      console.error("Share failed", error);
      toast.error("Failed to share PDF");
    }
  };

  async function handleConfirmPrint() {
    try {
      const finalHtml = applyPrintOptionsToHtml(printHtml);
      if (isBulkPrintPreview && bulkPrintLogItems.length > 0) {
        for (const item of bulkPrintLogItems) {
          await logActivity({
            action: "print_invoice",
            entityType: "sales",
            entityId: item.id,
            summary: `Printed invoice ${item.invoice || item.id}`,
            details: { invoice_number: item.invoice || null },
          });
        }
      } else if (printSaleId) {
        await logActivity({
          action: "print_invoice",
          entityType: "sales",
          entityId: printSaleId,
          summary: `Printed invoice ${printSaleNumber || printSaleId}`,
          details: { invoice_number: printSaleNumber || null },
        });
      }

      // Removed isMobile check to ensure Print button always triggers print logic
      // The separate Share button handles sharing logic


      const w = window.open('', '_blank');
      if (!w) return;
      w.document.write(finalHtml);
      w.document.close();
      w.onload = () => {
        w.focus();
        w.print();
      };
    } catch (e) {
      console.error(e);
      toast.error('Failed to start printing');
    }
  }
}




