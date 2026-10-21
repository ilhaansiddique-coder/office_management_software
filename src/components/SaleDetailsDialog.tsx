import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useSales } from "@/hooks/useSales";
import { useCurrency } from "@/hooks/useCurrency";
import { formatInTimeZone } from "@/lib/time";
import { toast } from "@/utils/toast";
import { ProductIcon } from "@/components/ProductIcon";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { ActivityLogPanel } from "@/components/ActivityLogPanel";
import { X, FileText, Phone, CreditCard, Package, CheckCircle, Clock, Wallet, DollarSign, Truck } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { CustomerHistoryDialog } from "@/components/CustomerHistoryDialog";
import { CourierOrderDialog } from "@/components/CourierOrderDialog";

interface SaleDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string | null;
  previewOverride?: Partial<
    Pick<SaleWithItems, "amount_paid" | "amount_due" | "review_amount_paid" | "review_amount_due">
  >;
}

interface SaleWithItems {
  id: string;
  invoice_number: string;
  customer_id?: string;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  customer_whatsapp?: string;
  additional_info?: string;
  cn_number?: string;
  courier_name?: string;
  city?: string;
  zone?: string;
  area?: string;
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  fee?: number;
  grand_total: number;
  amount_paid: number;
  amount_due: number;
  payment_method: string;
  payment_status: string;
  payment_terms?: 'immediate' | 'cod' | 'credit';
  due_date?: string | null;
  credit_days?: number | null;
  order_status?: string;
  courier_status?: string;
  consignment_id?: string;
  tracking_code?: string;
  last_status_check?: string;
  created_at: string;
  updated_at: string;
  items: Array<{
    id: string;
    product_name: string;
    quantity: number;
    rate: number;
    total: number;
    variant_id: string | null;
    variant_attributes?: Record<string, string>;
    product_image_url?: string; // Added for product image
    variant_image_url?: string | null;
  }>;
  payment_splits?: Array<{ method: string; amount: number }>;
  review_amount_paid?: number;
  review_amount_due?: number;
}

export const SaleDetailsDialog = ({ open, onOpenChange, saleId, previewOverride }: SaleDetailsDialogProps) => {
  const [showCourierDialog, setShowCourierDialog] = useState(false);
  const [customerHistoryOpen, setCustomerHistoryOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string } | null>(null);
  const canPortal = typeof document !== "undefined";
  const handlePreviewPointerEnter = (url: string, name: string) => (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    setImagePreview({ url, name });
  };
  const handlePreviewPointerLeave = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    setImagePreview(null);
  };
  const { getSaleWithItems } = useSales();
  const [saleData, setSaleData] = useState<SaleWithItems | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { formatAmount } = useCurrency();
  const { getMethodLabel, isCreditMethod, isCodMethod } = usePaymentMethods();
  const { systemSettings } = useSystemSettings();

  const fetchSaleDetails = async () => {
    if (!saleId) return;

    setIsLoading(true);
    try {
      const saleData = await getSaleWithItems(saleId);
      setSaleData(saleData);
    } catch (error) {
      console.error("Error fetching sale details:", error);
      toast.error("Failed to load sale details");
    } finally {
      setIsLoading(false);
    }
  };


  useEffect(() => {
    if (open && saleId) {
      fetchSaleDetails();
    }
  }, [open, saleId]);

  const resolvedSale = useMemo(() => {
    if (!saleData) return null;
    return {
      ...saleData,
      amount_paid: previewOverride?.amount_paid ?? saleData.amount_paid,
      amount_due: previewOverride?.amount_due ?? saleData.amount_due,
      review_amount_paid: previewOverride?.review_amount_paid ?? saleData.review_amount_paid,
      review_amount_due: previewOverride?.review_amount_due ?? saleData.review_amount_due,
    };
  }, [previewOverride, saleData]);

  if (!resolvedSale) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-full sm:max-w-2xl md:max-w-4xl lg:max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sale Details</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center h-64">
            {isLoading ? (
              <p>Loading sale details...</p>
            ) : (
              <p>No sale data found</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const sale = resolvedSale;
  const paymentSplits = sale.payment_splits || [];
  const normalizeMethod = (method: string | null | undefined) =>
    String(method || "").toLowerCase() === "condition" ? "cod" : String(method || "").toLowerCase();
  const normalizedSplits = paymentSplits.map((split) => ({
    method: normalizeMethod(split.method),
    amount: Number(split.amount) || 0,
  }));
  const paidSplitTotal = normalizedSplits
    .filter((split) => split.method && split.method !== "cod" && split.method !== "credit")
    .reduce((sum, split) => sum + split.amount, 0);
  const creditSplitTotal = normalizedSplits
    .filter((split) => isCreditMethod(split.method))
    .reduce((sum, split) => sum + split.amount, 0);
  const isCreditSale =
    String(sale.payment_terms || "").toLowerCase() === "credit" ||
    isCreditMethod(normalizeMethod(sale.payment_method)) ||
    creditSplitTotal > 0;
  const displayDueAmount = Math.max(0, sale.amount_due || 0);
  const hasPreviewOverride =
    previewOverride?.amount_due !== undefined ||
    previewOverride?.review_amount_due !== undefined ||
    previewOverride?.amount_paid !== undefined ||
    previewOverride?.review_amount_paid !== undefined;
  const displayPaidAmount = hasPreviewOverride
    ? Math.max(0, Number(sale.review_amount_paid ?? sale.amount_paid) || 0)
    : paidSplitTotal > 0
      ? paidSplitTotal
      : isCreditSale
        ? 0
        : Math.max(0, Number(sale.amount_paid) || 0);
  const isDelivered = String(sale.courier_status || "").toLowerCase() === "delivered";
  const isCodSale =
    String(sale.payment_terms || "").toLowerCase() === "cod" ||
    isCodMethod(normalizeMethod(sale.payment_method)) ||
    normalizedSplits.some((split) => isCodMethod(split.method));
  const codSplitTotal = normalizedSplits
    .filter((split) => isCodMethod(split.method))
    .reduce((sum, split) => sum + split.amount, 0);
  const getCreditDueFromActiveBalance = (activeDueAmount: number) => {
    const normalizedDue = Math.max(0, Number(activeDueAmount) || 0);
    if (creditSplitTotal > 0) {
      return Math.min(creditSplitTotal, Math.max(0, normalizedDue - codSplitTotal));
    }
    return isCreditSale ? normalizedDue : 0;
  };
  const getCodDueFromActiveBalance = (activeDueAmount: number) => {
    const normalizedDue = Math.max(0, Number(activeDueAmount) || 0);
    if (codSplitTotal > 0) {
      return Math.min(codSplitTotal, normalizedDue);
    }
    return isCodSale ? normalizedDue : 0;
  };
  const creditDisplayAmount = getCreditDueFromActiveBalance(displayDueAmount);
  const codCardAmount = getCodDueFromActiveBalance(displayDueAmount);
  const hasCreditDue = isCreditSale;

  const totalItems = sale.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-full sm:max-w-2xl md:max-w-4xl lg:max-w-6xl max-h-[90vh] overflow-y-auto p-3 sm:p-4 flex flex-col [&>button]:z-20">
          <div className="flex shrink-0 flex-col gap-1 rounded-t-xl border-b bg-background/95 px-4 py-2 pr-10 md:px-6 md:pr-12 backdrop-blur">
            <div className="flex items-center gap-2">
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="rounded-md p-0.5 hover:bg-muted transition-colors cursor-pointer"
                      onClick={() => setCustomerHistoryOpen(true)}
                    >
                      <FileText className="h-5 w-5 text-muted-foreground hover:text-primary transition-colors" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p>View customer history</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <DialogTitle className="text-base font-semibold text-foreground">
                {sale.customer_name}
              </DialogTitle>
              <div className="hidden flex-wrap gap-2 sm:flex ml-auto">
                {hasCreditDue ? (
                  <Badge variant="destructive">Credit</Badge>
                ) : (
                  <Badge
                    variant={
                      sale.payment_status === "paid"
                        ? "default"
                        : sale.payment_status === "cancelled"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {sale.payment_status.charAt(0).toUpperCase() + sale.payment_status.slice(1)}
                  </Badge>
                )}
                {sale.courier_status && sale.courier_status !== sale.payment_status && (
                  <Badge variant="outline" className="capitalize">
                    {sale.courier_status}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap sm:hidden">
              {hasCreditDue ? (
                <Badge variant="destructive">Credit</Badge>
              ) : (
                <Badge
                  variant={
                    sale.payment_status === "paid"
                      ? "default"
                      : sale.payment_status === "cancelled"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {sale.payment_status.charAt(0).toUpperCase() + sale.payment_status.slice(1)}
                </Badge>
              )}
              {sale.courier_status && sale.courier_status !== sale.payment_status && (
                <Badge variant="outline" className="capitalize">
                  {sale.courier_status}
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">{sale.invoice_number}</span>
          </div>

          <div className="flex-1 pt-3 space-y-4">
            {/* Top 4 Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border-2 border-info/35 bg-info/50 p-4 relative">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-info uppercase tracking-wide">Order Value</p>
                  <DollarSign className="h-4 w-4 text-info" />
                </div>
                <p className="text-2xl font-bold text-info mt-2">{formatAmount(sale.grand_total)}</p>
                <p className="text-xs text-info mt-1">Total order amount</p>
              </div>
              <div className="rounded-xl border-2 border-success/35 bg-success/50 p-4 relative">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-success uppercase tracking-wide">Total Paid</p>
                  <CheckCircle className="h-4 w-4 text-success" />
                </div>
                <p className="text-2xl font-bold text-success mt-2">{formatAmount(displayPaidAmount)}</p>
                <p className="text-xs text-success mt-1">Amount received</p>
              </div>
              <div className="rounded-xl border-2 border-warning/35 bg-warning/50 p-4 relative">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-warning uppercase tracking-wide">COD Due</p>
                  <Clock className="h-4 w-4 text-warning" />
                </div>
                <p className={`text-2xl font-bold mt-2 ${isDelivered && codCardAmount > 0 ? "text-warning line-through" : "text-warning"}`}>
                  {formatAmount(codCardAmount)}
                </p>
                <p className="text-xs text-warning mt-1">Cash on delivery</p>
              </div>
              <div className="rounded-xl border-2 border-accent/35 bg-accent/50 p-4 relative">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-accent uppercase tracking-wide">Credit Due</p>
                  <Wallet className="h-4 w-4 text-accent" />
                </div>
                <p className="text-2xl font-bold text-accent mt-2">{formatAmount(creditDisplayAmount)}</p>
                <p className="text-xs text-accent mt-1">Credit balance</p>
              </div>
            </div>

            {/* Customer & Delivery and Payment & Pricing */}
            <div className="grid gap-4 sm:grid-cols-2 min-w-0">
              {/* Customer & Delivery Section */}
              <div className="rounded-xl border border-base-300 bg-base-100/50 min-w-0 overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-base-300/70">
                  <Phone className="h-4 w-4 text-accent" />
                  <span className="font-medium text-base-content">Customer & Delivery</span>
                </div>
                <div className="bg-base-100">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-base-300">
                    <span className="text-base-content/70">Customer</span>
                    <span className="text-base-content text-right font-medium">{sale.customer_name}</span>
                  </div>
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-base-300">
                    <span className="text-base-content/70">Phone</span>
                    <span className="text-base-content">{sale.customer_phone || "Not provided"}</span>
                  </div>
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-base-300">
                    <span className="text-base-content/70">WhatsApp</span>
                    <span className="text-base-content">{sale.customer_whatsapp || "Not provided"}</span>
                  </div>
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-base-300">
                    <span className="text-base-content/70">Address</span>
                    <span className="text-base-content text-right max-w-[60%]">{sale.customer_address || "Not provided"}</span>
                  </div>
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-base-300">
                    <span className="text-base-content/70">Courier</span>
                    <div className="flex items-center gap-2">
                      <span className="text-base-content">
                        {sale.courier_name || "Not set"}
                      </span>
                      {String(sale.courier_name || "").toLowerCase() === "steadfast" && !sale.consignment_id && (
                        <div className="cursor-pointer rounded-xl bg-base-100 p-1 transition-colors hover:bg-base-200" onClick={() => setShowCourierDialog(true)} title="Send order to courier">
                          <Truck className="h-3 w-3 text-base-content/80" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-base-300">
                    <span className="text-base-content/70">CN Number</span>
                    <span className="text-base-content">{sale.cn_number || "Not set"}</span>
                  </div>
                  <div className="flex items-center justify-between px-5 py-3.5">
                    <span className="text-base-content/70">Sale Date</span>
                    <span className="text-base-content">{formatInTimeZone(new Date(sale.created_at), 'MMM dd, yyyy', systemSettings?.timezone)}</span>
                  </div>
                </div>
              </div>

              {/* Payment & Pricing Section */}
              <div className="rounded-xl border border-base-300 bg-base-100/50 min-w-0 overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-base-300/70">
                  <CreditCard className="h-4 w-4 text-accent" />
                  <span className="font-medium text-base-content">Payment & Pricing</span>
                </div>
                <div className="bg-base-100">
                  {(() => {
                    const paidSplits = normalizedSplits.filter(
                      (split) => split.method && split.method !== "cod" && split.method !== "credit"
                    );
                    const currentDueAmount = Math.max(0, sale.amount_due || 0);
                    const codDue = getCodDueFromActiveBalance(currentDueAmount);
                    const creditDue = getCreditDueFromActiveBalance(currentDueAmount);
                    const normalizedPaymentMethod = normalizeMethod(sale.payment_method);
                    const shouldShowPaidRow = paidSplits.length > 0 || displayPaidAmount > 0;
                    const paidMethodLabel = normalizedPaymentMethod === "cod" || normalizedPaymentMethod === "credit"
                      ? "Paid"
                      : getMethodLabel(sale.payment_method);

                    return (
                      <>
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-base-300">
                          <span className="text-base-content/70">Subtotal</span>
                          <span className="text-base-content">{formatAmount(sale.subtotal)}</span>
                        </div>
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-base-300">
                          <span className="text-base-content/70">Discount</span>
                          <span className="text-base-content">{formatAmount(sale.discount_amount)}</span>
                        </div>
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-base-300">
                          <span className="text-base-content/70">Charge</span>
                          <span className="text-base-content">{formatAmount(sale.fee || 0)}</span>
                        </div>
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-base-300">
                          <span className="text-base-content/70">Grand Total</span>
                          <span className="text-base-content">{formatAmount(sale.grand_total)}</span>
                        </div>

                        {shouldShowPaidRow && (
                          <div className="px-5 py-3.5 border-b border-base-300 space-y-2">
                            {paidSplits.length === 0 ? (
                              <div className="flex items-center justify-between">
                                <span className="text-base-content/70">{paidMethodLabel}</span>
                                <span className="text-base-content">{formatAmount(displayPaidAmount)}</span>
                              </div>
                            ) : (
                              paidSplits.map((split, idx) => (
                                <div key={`${split.method}-${idx}`} className="flex items-center justify-between">
                                  <span className="text-base-content/70">{getMethodLabel(split.method)}</span>
                                  <span className="text-base-content">{formatAmount(split.amount)}</span>
                                </div>
                              ))
                            )}
                          </div>
                        )}

                        <div className="px-5 py-3.5 space-y-2">
                          <div className="flex items-center justify-between border-b border-base-300 pb-2">
                            <span className="text-base-content/70">COD</span>
                            <span className="text-base-content">{formatAmount(codDue)}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-base-content/70">Credit</span>
                            <span className="text-base-content">{formatAmount(creditDue)}</span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Order Products Section */}
            <div className="rounded-xl border border-base-300 bg-base-100/50 min-w-0 overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-base-300/70">
                <Package className="h-4 w-4 text-accent" />
                <span className="font-medium text-base-content">Order items</span>
              </div>
              <div className="bg-base-100 p-0">
                <Table className="w-full">
                  <TableHeader>
                    <TableRow className="hidden sm:table-row border-b border-base-300">
                      <TableHead className="w-[50%] text-base-content/70 font-normal">Product</TableHead>
                      <TableHead className="w-[10%] text-center text-base-content/70 font-normal">Qty</TableHead>

                      <TableHead className="w-[15%] text-center text-base-content/70 font-normal">Sale Price</TableHead>
                      <TableHead className="w-[10%] text-right text-base-content/70 font-normal">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sale.items.map((item) => {
                      const quantity = Number(item.quantity) || 0;
                      const rate = Number(item.rate) || 0;
                      const salePrice = Number((item as any).sale_price) || rate;
                      const total = Number(item.total) || salePrice * quantity;
                      const imageUrl = item.variant_image_url || item.product_image_url || null;
                      const variantLabel = item.variant_attributes
                        ? Object.entries(item.variant_attributes)
                          .map(([, value]) => String(value))
                          .join(" / ")
                        : "";
                      const description = `${item.product_name}${variantLabel ? ` * ${variantLabel}` : ""}`;
                      return (
                        <TableRow key={item.id} className="block sm:table-row border-b border-base-300 last:border-b-0">
                          <TableCell className="block sm:table-cell sm:align-middle py-3">
                            <div className="flex items-center gap-4">
                              <div
                                className="h-20 w-20 sm:h-16 sm:w-16 flex-shrink-0 overflow-hidden rounded-lg border border-base-300 bg-base-100 flex items-center justify-center cursor-pointer"
                                onPointerDownCapture={(event) => {
                                  if (event.pointerType !== "mouse") return;
                                  event.preventDefault();
                                  event.stopPropagation();
                                }}
                                onMouseDownCapture={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                }}
                                onPointerEnter={imageUrl
                                  ? handlePreviewPointerEnter(imageUrl, item.product_name)
                                  : undefined}
                                onPointerLeave={handlePreviewPointerLeave}
                                onClick={() => {
                                  if (!imageUrl) return;
                                  setImagePreview({ url: imageUrl, name: item.product_name });
                                }}
                                role={imageUrl ? "button" : undefined}
                                tabIndex={imageUrl ? 0 : undefined}
                                aria-label={imageUrl ? `Preview ${item.product_name}` : undefined}
                              >
                                {imageUrl ? (
                                  <img
                                    src={imageUrl}
                                    alt={item.product_name}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    onError={(e) => {
                                      e.currentTarget.src = "/placeholder.svg";
                                    }}
                                  />
                                ) : (
                                  <ProductIcon className="h-6 w-6 text-base-content/60" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="break-words text-sm font-medium text-base-content">{description}</div>
                                <div className="mt-1 text-xs text-base-content/70 sm:hidden">
                                  {formatAmount(salePrice)} x {quantity} = {formatAmount(total)}
                                </div>
                              </div>
                              <div className="sm:hidden text-lg font-semibold text-base-content">
                                {quantity}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-center align-middle text-base-content/90">{quantity}</TableCell>

                          <TableCell className="hidden sm:table-cell text-center align-middle text-base-content/90">{formatAmount(salePrice)}</TableCell>
                          <TableCell className="hidden sm:table-cell text-right align-middle font-medium text-base-content">
                            {formatAmount(total)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Activity Log */}
            <div className="min-w-0 overflow-x-hidden">
              <ActivityLogPanel
                entityType="sales"
                entityId={sale.id}
                title="Sale Activity"
                limit={25}
                cardClassName="rounded-xl border border-base-300 bg-base-100/50 overflow-hidden"
                headerClassName="border-b border-base-300/70 bg-transparent"
                titleClassName="text-base-content font-medium flex items-center gap-2.5"
                contentClassName="bg-base-100 px-5 py-4"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {imagePreview && canPortal
        ? createPortal(
          <div
            className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 pointer-events-auto sm:pointer-events-none"
            onPointerDown={(event) => {
              if (event.pointerType === "mouse") return;
              event.preventDefault();
              event.stopPropagation();
            }}
            onMouseDown={(event) => {
              if (event.nativeEvent.button === 0) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onClick={() => setImagePreview(null)}
          >
            <div
              className="relative h-72 w-72 sm:h-96 sm:w-96 rounded-md overflow-hidden border bg-background shadow-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-xl bg-base-content/70 text-base-100 sm:hidden"
                onClick={() => setImagePreview(null)}
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
              <img
                src={imagePreview.url}
                alt={`${imagePreview.name} preview`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          </div>,
          document.body
        )
        : null}
      {sale && (
        <CustomerHistoryDialog
          open={customerHistoryOpen}
          onOpenChange={setCustomerHistoryOpen}
          customerId={sale.customer_id || null}
          customerName={sale.customer_name}
          customerPhone={sale.customer_phone}
          customerWhatsapp={sale.customer_whatsapp}
          customerAddress={sale.customer_address}
        />
      )}
      {open && saleId && (
        <CourierOrderDialog
          open={showCourierDialog}
          onOpenChange={setShowCourierDialog}
          saleId={saleId}
        />
      )}
    </>
  );
};
