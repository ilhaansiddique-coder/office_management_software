import { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Users, Phone, Eye, Edit, CheckCircle2, Clock, CreditCard, DollarSign, BarChart3, ShoppingCart, XCircle } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { supabase } from "@/integrations/supabase/client";
import { SaleDetailsDialog } from "@/components/SaleDetailsDialog";
import { EditSaleDialog } from "@/components/EditSaleDialog";

interface CustomerHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | null;
  customerName?: string;
  customerPhone?: string;
  customerWhatsapp?: string;
  customerAddress?: string;
}

export const CustomerHistoryDialog = ({
  open,
  onOpenChange,
  customerId,
  customerName,
  customerPhone,
  customerWhatsapp,
  customerAddress,
}: CustomerHistoryDialogProps) => {
  const { formatAmount } = useCurrency();
  const { getMethodLabel, isCodMethod, isCreditMethod } = usePaymentMethods();

  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saleDetailsId, setSaleDetailsId] = useState<string | null>(null);
  const [saleEditId, setSaleEditId] = useState<string | null>(null);

  // Customer info from DB (used when only customerId is provided)
  const [customerInfo, setCustomerInfo] = useState<{
    name: string;
    phone?: string;
    whatsapp?: string;
    address?: string;
  } | null>(null);

  const displayName = customerName || customerInfo?.name || "Customer";
  const displayPhone = customerPhone || customerInfo?.phone;
  const displayWhatsapp = customerWhatsapp || customerInfo?.whatsapp;
  const displayAddress = customerAddress || customerInfo?.address;

  const normalizeMethodKey = useCallback((value?: string | null) => {
    const raw = String(value || "").toLowerCase().trim();
    return raw === "condition" ? "cod" : raw;
  }, []);

  const methodLabelFor = useCallback(
    (value?: string | null) => getMethodLabel(normalizeMethodKey(value)) || String(value || ""),
    [getMethodLabel, normalizeMethodKey]
  );

  const getCodDueAmount = useCallback((sale: any) => {
    const fee = Number(sale.fee) || 0;
    const rawDue = Number(sale.review_amount_due ?? sale.amount_due ?? 0) || 0;
    const splits = Array.isArray(sale.sale_payments) ? sale.sale_payments : [];
    const codSplitTotal = splits
      .filter((split: any) => isCodMethod(normalizeMethodKey(split.method)))
      .reduce((sum: number, split: any) => sum + (Number(split.amount) || 0), 0);
    const hasCodSplit = codSplitTotal > 0;
    const terms = String(sale.payment_terms || "immediate").toLowerCase();
    const method = normalizeMethodKey(sale.payment_method);
    const isCodSale = terms === "cod" || isCodMethod(method) || hasCodSplit;
    if (!isCodSale) return 0;
    return hasCodSplit ? codSplitTotal : Math.max(0, rawDue - fee);
  }, [isCodMethod, normalizeMethodKey]);

  const getCreditDueAmount = useCallback((sale: any) => {
    const rawDue = Number(sale.review_amount_due ?? sale.amount_due ?? 0) || 0;
    const splits = Array.isArray(sale.sale_payments) ? sale.sale_payments : [];
    const creditSplitTotal = splits
      .filter((split: any) => isCreditMethod(normalizeMethodKey(split.method)))
      .reduce((sum: number, split: any) => sum + (Number(split.amount) || 0), 0);
    const hasCreditSplit = creditSplitTotal > 0;
    const terms = String(sale.payment_terms || "immediate").toLowerCase();
    const method = normalizeMethodKey(sale.payment_method);
    const isCreditSale = terms === "credit" || isCreditMethod(method) || hasCreditSplit;
    if (!isCreditSale) return 0;
    return hasCreditSplit ? creditSplitTotal : Math.max(0, rawDue);
  }, [isCreditMethod, normalizeMethodKey]);

  const getPaymentMethodDisplay = useCallback((sale: any) => {
    const splits = Array.isArray(sale.sale_payments) ? sale.sale_payments : [];
    const splitMethods = Array.from(
      new Set<string>(
        splits
          .map((split: any) => normalizeMethodKey(split.method))
          .filter(Boolean)
      )
    );

    if (splitMethods.length > 1) {
      const labels = splitMethods.map((method) => methodLabelFor(method)).filter(Boolean);
      return labels.length > 0 ? `Mixed: ${labels.join(", ")}` : "Mixed";
    }

    if (splitMethods.length === 1) {
      return methodLabelFor(splitMethods[0]);
    }

    return methodLabelFor(sale.payment_method) || String(sale.payment_terms || "immediate");
  }, [methodLabelFor, normalizeMethodKey]);

  useEffect(() => {
    const loadData = async () => {
      if (!open || !customerId) return;
      setLoading(true);
      setError(null);

      // Fetch customer info if not provided via props
      if (!customerName) {
        const { data: customer } = await supabase
          .from("customers")
          .select("name, phone, whatsapp, address")
          .eq("id", customerId)
          .maybeSingle();
        if (customer) setCustomerInfo(customer);
      }

      const { data, error: fetchError } = await supabase
        .from("sales")
        .select("id, invoice_number, grand_total, fee, amount_paid, amount_due, review_amount_paid, review_amount_due, payment_method, payment_terms, payment_status, courier_name, courier_status, created_at, sale_payments(method, amount)")
        .eq("customer_id", customerId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
        setSales([]);
      } else {
        setSales(data || []);
      }

      setLoading(false);
    };

    loadData();
  }, [open, customerId, customerName]);

  const handleClose = (value: boolean) => {
    if (!value) {
      setSales([]);
      setError(null);
      setCustomerInfo(null);
    }
    onOpenChange(value);
  };

  const summary = useMemo(() => {
    const totals = sales.reduce(
      (acc, sale) => {
        acc.totalOrders += 1;
        const netTotal = (Number(sale.grand_total) || 0) - (Number(sale.fee) || 0);
        acc.totalSpent += Math.max(0, netTotal);
        const amountPaid = Number(sale.review_amount_paid ?? sale.amount_paid) || 0;
        const amountDue = Number(sale.review_amount_due ?? sale.amount_due) || 0;
        acc.totalPaid += amountPaid;
        acc.totalDue += amountDue;
        acc.codDue += getCodDueAmount(sale);
        acc.creditDue += getCreditDueAmount(sale);
        const status = (sale.courier_status || "").toLowerCase();
        if (status === "delivered") acc.delivered += 1;
        if (["cancelled", "returned", "lost"].includes(status)) acc.cancelled += 1;
        if (!acc.lastPurchaseDate || new Date(sale.created_at) > new Date(acc.lastPurchaseDate)) {
          acc.lastPurchaseDate = sale.created_at;
        }
        return acc;
      },
      { totalOrders: 0, totalSpent: 0, totalPaid: 0, totalDue: 0, codDue: 0, creditDue: 0, delivered: 0, cancelled: 0, lastPurchaseDate: null as string | null }
    );
    return totals;
  }, [sales, getCodDueAmount, getCreditDueAmount]);

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-full sm:max-w-4xl md:max-w-5xl lg:max-w-6xl p-0">
          <div className="max-h-[90vh] overflow-y-auto">
            <DialogHeader className="px-6 pt-6 pb-4 border-b bg-gradient-to-br from-primary/5 via-primary/3 to-background">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-bold">
                    {displayName}
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground mt-1">Purchase History & Payment Details</p>
                </div>
              </div>
            </DialogHeader>
            <div className="p-6 space-y-6">
              {loading ? (
                <div className="py-12 text-center">
                  <div className="inline-flex items-center gap-2 text-muted-foreground">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                    Loading history...
                  </div>
                </div>
              ) : error ? (
                <div className="py-12 text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-destructive/10 mb-3">
                    <XCircle className="h-6 w-6 text-destructive" />
                  </div>
                  <p className="text-destructive font-medium">{error}</p>
                </div>
              ) : sales.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted/50 mb-4">
                    <ShoppingCart className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground font-medium">No sales found for this customer.</p>
                  <p className="text-sm text-muted-foreground mt-1">Sales will appear here once orders are placed.</p>
                </div>
              ) : (
                <>
                  {/* Financial Summary Cards */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Card className="border-success/35 bg-gradient-to-br from-success/12 to-background">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-medium uppercase tracking-wider text-success">Total Paid</div>
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        </div>
                        <div className="text-2xl font-bold text-success">{formatAmount(summary.totalPaid)}</div>
                        <p className="text-xs text-success mt-1">Amount received</p>
                      </CardContent>
                    </Card>

                    <Card className="border-warning/35 bg-gradient-to-br from-warning/12 to-background">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-medium uppercase tracking-wider text-warning">COD Due</div>
                          <Clock className="h-4 w-4 text-warning" />
                        </div>
                        <div className="text-2xl font-bold text-warning">{formatAmount(summary.codDue)}</div>
                        <p className="text-xs text-warning mt-1">Cash on delivery</p>
                      </CardContent>
                    </Card>

                    <Card className="border-warning/35 bg-gradient-to-br from-warning/12 to-background">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-medium uppercase tracking-wider text-warning">Credit Due</div>
                          <CreditCard className="h-4 w-4 text-warning" />
                        </div>
                        <div className="text-2xl font-bold text-warning">{formatAmount(summary.creditDue)}</div>
                        <p className="text-xs text-warning mt-1">Credit balance</p>
                      </CardContent>
                    </Card>

                    <Card className="border-error/35 bg-gradient-to-br from-error/12 to-background">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-medium uppercase tracking-wider text-error">Total Due</div>
                          <DollarSign className="h-4 w-4 text-error" />
                        </div>
                        <div className="text-2xl font-bold text-error">{formatAmount(summary.totalDue)}</div>
                        <p className="text-xs text-error mt-1">Outstanding amount</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Customer Stats & Contact */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <BarChart3 className="h-5 w-5 text-primary" />
                          Customer Statistics
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-lg border bg-background/60 backdrop-blur-sm p-3">
                            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Total Orders</div>
                            <div className="text-xl font-bold text-foreground">{summary.totalOrders}</div>
                          </div>
                          <div className="rounded-lg border bg-background/60 backdrop-blur-sm p-3">
                            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Total Spent</div>
                            <div className="text-xl font-bold text-foreground">{formatAmount(summary.totalSpent)}</div>
                          </div>
                          <div className="rounded-lg border bg-background/60 backdrop-blur-sm p-3">
                            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Delivered</div>
                            <div className="text-xl font-bold text-success">{summary.delivered}</div>
                          </div>
                          <div className="rounded-lg border bg-background/60 backdrop-blur-sm p-3">
                            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Cancelled</div>
                            <div className="text-xl font-bold text-error">{summary.cancelled}</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <Phone className="h-5 w-5 text-primary" />
                          Contact Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between p-2 rounded-lg bg-background/60 backdrop-blur-sm">
                          <span className="text-sm text-muted-foreground">Phone</span>
                          <span className="text-sm font-semibold">{displayPhone || "-"}</span>
                        </div>
                        <div className="flex items-center justify-between p-2 rounded-lg bg-background/60 backdrop-blur-sm">
                          <span className="text-sm text-muted-foreground">WhatsApp</span>
                          <span className="text-sm font-semibold">{displayWhatsapp || "-"}</span>
                        </div>
                        <div className="flex items-center justify-between p-2 rounded-lg bg-background/60 backdrop-blur-sm">
                          <span className="text-sm text-muted-foreground">Address</span>
                          <span className="text-sm font-semibold text-right flex-1 ml-2">{displayAddress || "-"}</span>
                        </div>
                        <div className="flex items-center justify-between p-2 rounded-lg bg-background/60 backdrop-blur-sm">
                          <span className="text-sm text-muted-foreground">Last Purchase</span>
                          <span className="text-sm font-semibold">
                            {summary.lastPurchaseDate ? new Date(summary.lastPurchaseDate).toLocaleDateString() : "-"}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Sales History Title */}
                  <div className="flex items-center gap-2 pt-2">
                    <div className="h-px flex-1 bg-border"></div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Order History</h3>
                    <div className="h-px flex-1 bg-border"></div>
                  </div>

                  {/* Mobile Sales Cards */}
                  <div className="grid gap-3 md:hidden">
                    {sales.map((sale) => {
                      const paymentMethodDisplay = getPaymentMethodDisplay(sale);
                      const codDue = getCodDueAmount(sale);
                      const creditDue = getCreditDueAmount(sale);
                      return (
                        <Card key={sale.id} className="border-primary/20 overflow-hidden hover:shadow-md transition-shadow">
                          <div className="bg-gradient-to-r from-primary/5 to-primary/10 px-4 py-3 border-b flex items-center justify-between">
                            <div className="font-semibold text-sm">{sale.invoice_number}</div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="capitalize text-xs">
                                {sale.courier_status || "Pending"}
                              </Badge>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSaleDetailsId(sale.id)}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSaleEditId(sale.id)}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <CardContent className="p-4 space-y-3">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Date</span>
                              <span className="font-medium">{new Date(sale.created_at).toLocaleDateString()}</span>
                            </div>
                            {sale.courier_name && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Courier</span>
                                <span className="font-medium">{sale.courier_name}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Pay Method</span>
                              <Badge variant="secondary" className="text-xs">{paymentMethodDisplay}</Badge>
                            </div>
                            <div className="grid grid-cols-4 gap-2 pt-2">
                              <div className="rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 p-2.5 border">
                                <div className="text-[10px] font-medium uppercase text-muted-foreground mb-0.5">Total</div>
                                <div className="font-bold text-sm">{formatAmount(sale.grand_total || 0)}</div>
                              </div>
                              <div className="rounded-lg bg-gradient-to-br from-success/12 to-success/50 p-2.5 border border-success/35">
                                <div className="text-[10px] font-medium uppercase text-success mb-0.5">Paid</div>
                                <div className="font-bold text-sm text-success">{formatAmount(sale.review_amount_paid ?? sale.amount_paid ?? 0)}</div>
                              </div>
                              <div className="rounded-lg bg-gradient-to-br from-error/12 to-error/50 p-2.5 border border-error/35">
                                <div className="text-[10px] font-medium uppercase text-error mb-0.5">COD</div>
                                <div className="font-bold text-sm text-error">{formatAmount(codDue)}</div>
                              </div>
                              <div className="rounded-lg bg-gradient-to-br from-secondary/12 to-secondary/50 p-2.5 border border-secondary/35">
                                <div className="text-[10px] font-medium uppercase text-secondary mb-0.5">Credit</div>
                                <div className="font-bold text-sm text-secondary">{formatAmount(creditDue)}</div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  {/* Desktop Sales Table */}
                  <div className="hidden md:block">
                    <Card className="border-primary/20">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/40">
                              <TableHead className="whitespace-nowrap font-semibold">Invoice #</TableHead>
                              <TableHead className="whitespace-nowrap font-semibold">Date</TableHead>
                              <TableHead className="whitespace-nowrap font-semibold">Pay Method</TableHead>
                              <TableHead className="whitespace-nowrap font-semibold">Courier</TableHead>
                              <TableHead className="whitespace-nowrap font-semibold">Status</TableHead>
                              <TableHead className="whitespace-nowrap font-semibold text-right">Grand Total</TableHead>
                              <TableHead className="whitespace-nowrap font-semibold text-right">Paid</TableHead>
                              <TableHead className="whitespace-nowrap font-semibold text-right">COD</TableHead>
                              <TableHead className="whitespace-nowrap font-semibold text-right">Credit</TableHead>
                              <TableHead className="whitespace-nowrap font-semibold text-center">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sales.map((sale) => {
                              const paymentMethodDisplay = getPaymentMethodDisplay(sale);
                              const codDue = getCodDueAmount(sale);
                              const creditDue = getCreditDueAmount(sale);
                              return (
                                <TableRow key={sale.id} className="hover:bg-muted/20 transition-colors">
                                  <TableCell className="whitespace-nowrap font-medium">{sale.invoice_number}</TableCell>
                                  <TableCell className="whitespace-nowrap text-muted-foreground">
                                    {new Date(sale.created_at).toLocaleDateString()}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    <Badge variant="secondary" className="text-xs">
                                      {paymentMethodDisplay}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap text-muted-foreground">
                                    {sale.courier_name || "-"}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    <Badge
                                      variant="outline"
                                      className={`capitalize text-xs ${
                                        sale.courier_status === 'delivered'
                                          ? 'border-success/35 bg-success/12 text-success'
                                          : sale.courier_status === 'cancelled'
                                          ? 'border-error/35 bg-error/12 text-error'
                                          : 'border-warning/35 bg-warning/12 text-warning'
                                      }`}
                                    >
                                      {sale.courier_status || "Pending"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap text-right font-semibold">
                                    {formatAmount(sale.grand_total || 0)}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap text-right font-semibold text-success">
                                    {formatAmount(sale.review_amount_paid ?? sale.amount_paid ?? 0)}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap text-right font-semibold text-error">
                                    {formatAmount(codDue)}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap text-right font-semibold text-secondary">
                                    {formatAmount(creditDue)}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSaleDetailsId(sale.id)}>
                                        <Eye className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSaleEditId(sale.id)}>
                                        <Edit className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </Card>
                  </div>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SaleDetailsDialog
        open={!!saleDetailsId}
        onOpenChange={(v) => { if (!v) setSaleDetailsId(null); }}
        saleId={saleDetailsId}
      />
      <EditSaleDialog
        open={!!saleEditId}
        onOpenChange={(v) => { if (!v) setSaleEditId(null); }}
        saleId={saleEditId}
      />
    </>
  );
};
