import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, History, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CustomerDueInvoice,
  useCustomerDueInvoices,
  useCustomerPaymentHistory,
  useSubmitCustomerPayment,
} from "@/hooks/useCustomerPayments";
import { Customer } from "@/hooks/useCustomers";
import { useCurrency } from "@/hooks/useCurrency";
import { usePaymentMethods } from "@/hooks/usePaymentMethods";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { formatDate, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { SaleDetailsDialog } from "@/components/SaleDetailsDialog";

interface CustomerPaymentManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
}

interface PaymentHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
}

interface DistributedInvoiceRow extends CustomerDueInvoice {
  allocatedAmount: number;
  updatedPaidAmount: number;
  currentDueBalance: number;
}

const parseAmount = (rawValue: string) => {
  const normalized = rawValue.trim();
  if (!normalized || normalized === "-") return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
};

const sanitizeAmountInput = (value: string) => {
  const isNegative = value.trim().startsWith("-");
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole, ...decimalParts] = cleaned.split(".");
  const normalized = decimalParts.length === 0
    ? cleaned
    : `${whole}.${decimalParts.join("").slice(0, 2)}`;
  if (!normalized) return isNegative ? "-" : "";
  return `${isNegative ? "-" : ""}${normalized}`;
};

const distributePaymentAmount = (invoices: CustomerDueInvoice[], totalPayNow: number): DistributedInvoiceRow[] => {
  const rows = invoices.map((invoice) => ({
    ...invoice,
    allocatedAmount: 0,
    updatedPaidAmount: invoice.amount_paid,
    currentDueBalance: invoice.amount_due,
  }));

  if (totalPayNow === 0) {
    return rows;
  }

  if (totalPayNow > 0) {
    let remaining = totalPayNow;

    return rows.map((invoice) => {
      const allocatedAmount = Math.min(remaining, invoice.amount_due);
      remaining = Math.max(0, remaining - allocatedAmount);

      return {
        ...invoice,
        allocatedAmount,
        updatedPaidAmount: Math.max(0, invoice.amount_paid + allocatedAmount),
        currentDueBalance: Math.max(0, invoice.amount_due - allocatedAmount),
      };
    });
  }

  let remainingAdjustment = Math.abs(totalPayNow);
  const adjustedRows = [...rows];

  for (let index = 0; index < adjustedRows.length; index += 1) {
    if (remainingAdjustment <= 0) break;

    const invoice = adjustedRows[index];
    const reversibleAmount = Math.max(0, invoice.amount_paid);
    const allocatedAmount = Math.min(remainingAdjustment, reversibleAmount);
    if (allocatedAmount <= 0) continue;

    remainingAdjustment = Math.max(0, remainingAdjustment - allocatedAmount);
    adjustedRows[index] = {
      ...invoice,
      allocatedAmount: -allocatedAmount,
      updatedPaidAmount: Math.max(0, invoice.amount_paid - allocatedAmount),
      currentDueBalance: Math.max(0, invoice.amount_due + allocatedAmount),
    };
  }

  return adjustedRows;
};

const PaymentHistoryDialog = ({ open, onOpenChange, customer }: PaymentHistoryDialogProps) => {
  const { formatAmount } = useCurrency();
  const { systemSettings } = useSystemSettings();
  const {
    data: historyResult = { entries: [], source: "payment_logs" as const },
    isLoading,
    error,
  } = useCustomerPaymentHistory(customer?.id, open);
  const history = historyResult.entries;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full sm:max-w-2xl md:max-w-4xl p-0">
        <div className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl">
              Payment History - {customer?.name || "Customer"}
            </DialogTitle>
            <DialogDescription>
              Latest payment records across all invoices for this customer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-4 pb-4 pt-0 md:px-6 md:pb-6">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, index) => (
                  <div key={index} className="rounded-lg border p-3">
                    <Skeleton className="h-4 w-full" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="rounded-lg border border-error/35 bg-error/12 p-4 text-sm text-error">
                Failed to load payment history.
              </div>
            ) : history.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No payment history yet
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="rounded-lg border border-success/35 bg-success/12 p-4 text-sm text-success">
                  Payment history found.
                  {historyResult.source === "activity_logs"
                    ? " Showing existing records from activity logs until the new payment log table is available."
                    : " Latest payment records are shown below."}
                </div>

                <div className="grid gap-3 md:hidden">
                  {history.map((entry) => (
                    <Card key={entry.id} className="overflow-hidden">
                      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
                        <div className="font-medium">{entry.invoiceNumber}</div>
                        <div className="text-sm font-semibold text-success">
                          {formatAmount(entry.amount)}
                        </div>
                      </div>
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Date</span>
                          <span>
                            {formatDate(
                              new Date(entry.created_at),
                              systemSettings.date_format,
                              systemSettings.timezone
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Time</span>
                          <span>
                            {formatTime(
                              new Date(entry.created_at),
                              systemSettings.time_format,
                              systemSettings.timezone
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4 text-sm">
                          <span className="text-muted-foreground">Paid By</span>
                          <span className="text-right">{entry.paidBy}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="hidden overflow-hidden rounded-lg border md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Amount Paid</TableHead>
                        <TableHead>Paid By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((entry, index) => (
                        <TableRow
                          key={entry.id}
                          className={cn(index % 2 === 0 ? "bg-background" : "bg-muted/10")}
                        >
                          <TableCell className="whitespace-nowrap font-medium">
                            {entry.invoiceNumber}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatDate(
                              new Date(entry.created_at),
                              systemSettings.date_format,
                              systemSettings.timezone
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatTime(
                              new Date(entry.created_at),
                              systemSettings.time_format,
                              systemSettings.timezone
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatAmount(entry.amount)}
                          </TableCell>
                          <TableCell>{entry.paidBy}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="border-t px-4 py-4 md:px-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const CustomerPaymentManagementDialog = ({
  open,
  onOpenChange,
  customer,
}: CustomerPaymentManagementDialogProps) => {
  const { formatAmount } = useCurrency();
  const { systemSettings } = useSystemSettings();
  const { getMethodLabel, isCodMethod, isCreditMethod } = usePaymentMethods();
  const {
    data: invoices = [],
    isLoading,
    error,
    refetch,
  } = useCustomerDueInvoices(customer?.id, open);
  const submitPayment = useSubmitCustomerPayment();
  const [payNowValue, setPayNowValue] = useState("");
  const [previewInvoice, setPreviewInvoice] = useState<CustomerDueInvoice | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setPayNowValue("");
      setPreviewInvoice(null);
      setHistoryOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!previewInvoice) return;
    const nextPreview = invoices.find((invoice) => invoice.id === previewInvoice.id) || previewInvoice;
    setPreviewInvoice(nextPreview);
  }, [invoices, previewInvoice]);

  const totalPayNowAmount = parseAmount(payNowValue);
  const normalizeMethodKey = useCallback((value?: string | null) => {
    const raw = String(value || "").toLowerCase().trim();
    return raw === "condition" ? "cod" : raw;
  }, []);
  const methodLabelFor = useCallback(
    (value?: string | null) => getMethodLabel(normalizeMethodKey(value)) || String(value || ""),
    [getMethodLabel, normalizeMethodKey]
  );
  const getPaymentMethodDisplay = useCallback((invoice: Pick<CustomerDueInvoice, "payment_method" | "payment_terms" | "sale_payments">) => {
    const paymentSplits = Array.isArray(invoice.sale_payments) ? invoice.sale_payments : [];
    const splitMethods = Array.from(
      new Set<string>(
        paymentSplits
          .map((split) => normalizeMethodKey(split.method))
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

    return methodLabelFor(invoice.payment_method) || String(invoice.payment_terms || "immediate");
  }, [methodLabelFor, normalizeMethodKey]);
  const renderPaymentMethodBadge = useCallback((invoice: Pick<CustomerDueInvoice, "payment_method" | "payment_terms" | "sale_payments">) => {
    const label = getPaymentMethodDisplay(invoice);

    return (
      <Badge
        variant="outline"
        className="inline-flex max-w-full items-center rounded-full border-secondary/20 bg-secondary px-3 py-1 text-xs font-semibold text-secondary-content shadow-sm"
        title={label}
      >
        <span className="truncate">{label}</span>
      </Badge>
    );
  }, [getPaymentMethodDisplay]);
  const getCreditDueAmount = useCallback((
    invoice: Pick<CustomerDueInvoice, "amount_due" | "payment_terms" | "payment_method" | "sale_payments"> & {
      currentDueBalance?: number;
    },
    activeDueBalance = invoice.currentDueBalance ?? invoice.amount_due
  ) => {
    const normalizedDueBalance = Math.max(0, Number(activeDueBalance) || 0);
    const paymentSplits = Array.isArray(invoice.sale_payments) ? invoice.sale_payments : [];
    const creditSplitTotal = paymentSplits
      .filter((split) => isCreditMethod(normalizeMethodKey(split.method)))
      .reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
    const codSplitTotal = paymentSplits
      .filter((split) => isCodMethod(normalizeMethodKey(split.method)))
      .reduce((sum, split) => sum + (Number(split.amount) || 0), 0);
    const paymentTerms = String(invoice.payment_terms || "").toLowerCase();
    const paymentMethod = normalizeMethodKey(invoice.payment_method);
    const isCreditInvoice =
      paymentTerms === "credit" || isCreditMethod(paymentMethod) || creditSplitTotal > 0;

    if (!isCreditInvoice) return 0;

    if (creditSplitTotal > 0) {
      return Math.min(creditSplitTotal, Math.max(0, normalizedDueBalance - codSplitTotal));
    }

    return normalizedDueBalance;
  }, [isCodMethod, isCreditMethod, normalizeMethodKey]);
  const totalCreditDueAmount = useMemo(
    () => invoices.reduce((sum, invoice) => sum + getCreditDueAmount(invoice, invoice.amount_due), 0),
    [invoices, getCreditDueAmount]
  );
  const totalReversiblePaidAmount = useMemo(
    () => invoices.reduce((sum, invoice) => sum + invoice.amount_paid, 0),
    [invoices]
  );

  const payNowError = useMemo(() => {
    if (!payNowValue.trim()) return "";
    if (payNowValue.trim() === "-") return "Enter a valid amount.";
    const parsed = Number(payNowValue);
    if (!Number.isFinite(parsed)) return "Enter a valid amount.";
    if (parsed > totalCreditDueAmount) return "Amount cannot exceed the total credit due balance.";
    if (parsed < 0 && Math.abs(parsed) > totalReversiblePaidAmount) {
      return "Amount cannot exceed the reversible paid amount.";
    }
    return "";
  }, [payNowValue, totalCreditDueAmount, totalReversiblePaidAmount]);

  const invoiceRows = useMemo(
    () => distributePaymentAmount(invoices, payNowError ? 0 : totalPayNowAmount),
    [invoices, payNowError, totalPayNowAmount]
  );

  const summary = useMemo(() => {
    return invoiceRows.reduce(
      (totals, invoice) => {
        totals.totalDueAmount += getCreditDueAmount(invoice, invoice.amount_due);
        totals.totalPaidAmount += invoice.updatedPaidAmount;
        totals.totalDueBalance += getCreditDueAmount(invoice, invoice.currentDueBalance);
        return totals;
      },
      { totalDueAmount: 0, totalPaidAmount: 0, totalDueBalance: 0 }
    );
  }, [invoiceRows, getCreditDueAmount]);

  const hasSignedAdjustment = totalPayNowAmount !== 0 && !payNowError;
  const canSubmit =
    !submitPayment.isPending &&
    invoiceRows.length > 0 &&
    !payNowError &&
    hasSignedAdjustment &&
    Boolean(customer?.id);
  const payNowInputClass = cn(
    "transition-[border-color,box-shadow] duration-200",
    payNowError &&
      "border-error focus-visible:border-error focus-visible:ring-2 focus-visible:ring-error/30"
  );

  const handleSubmit = async () => {
    if (!canSubmit || !customer?.id) return;

    try {
      await submitPayment.mutateAsync({
        customerId: customer.id,
        amount: totalPayNowAmount,
      });
      setPayNowValue("");
      await refetch();
    } catch {
      // Mutation-level error handling already shows a toast.
    }
  };

  const previewOverride = previewInvoice
    ? (() => {
        const activeInvoice = invoiceRows.find((invoice) => invoice.id === previewInvoice.id);
        if (!activeInvoice) return undefined;

        return {
          amount_paid: activeInvoice.updatedPaidAmount,
          amount_due: activeInvoice.currentDueBalance,
          review_amount_paid: activeInvoice.updatedPaidAmount,
          review_amount_due: activeInvoice.currentDueBalance,
        };
      })()
    : undefined;
  const invoiceErrorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error.";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-full sm:max-w-4xl md:max-w-5xl lg:max-w-6xl p-0">
          <div className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <DialogTitle className="flex lg:flex-row flex-col gap-2">
                    <span className="whitespace-nowrap">Credit & Due Management</span>
                    <span className="whitespace-nowrap">- {customer?.name || "Customer"}</span>
                  </DialogTitle>
                </div>
                {customer && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setHistoryOpen(true)}
                          className="shrink-0 rounded-xl"
                        >
                          <History className="h-4 w-4" />
                          Action
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>View Payment History</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <DialogDescription>
                Review invoice balances, submit payments, and inspect payment history.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 px-4 pb-4 pt-0 md:px-6 md:pb-6">
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, index) => (
                    <div key={index} className="rounded-lg border p-4">
                      <Skeleton className="mb-2 h-5 w-56" />
                      <Skeleton className="h-4 w-full" />
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="rounded-lg border border-error/35 bg-error/12 p-4 text-sm text-error">
                  <div className="font-medium">Failed to load invoice balances.</div>
                  <div className="mt-1 text-xs text-error/80">{invoiceErrorMessage}</div>
                  <div className="mt-3">
                    <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                      Retry
                    </Button>
                  </div>
                </div>
              ) : invoiceRows.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-muted-foreground">
                    No due invoices found for this customer.
                  </CardContent>
                </Card>
              ) : (
                <>
                  <TooltipProvider>
                    <div className="grid gap-3 md:hidden">
                      {invoiceRows.map((invoice) => (
                        <Card key={invoice.id} className="overflow-hidden">
                          <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
                            <div className="font-medium">{invoice.invoice_number}</div>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setPreviewInvoice(invoice)}
                                  className="h-8 px-2"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Preview Invoice</TooltipContent>
                            </Tooltip>
                          </div>
                          <CardContent className="space-y-3 p-4">
                            <div className="rounded-lg bg-muted/30 p-3">
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Invoice Date
                              </div>
                              <div className="mt-1 font-semibold">
                                {formatDate(
                                  new Date(invoice.created_at),
                                  systemSettings.date_format,
                                  systemSettings.timezone
                                )}
                              </div>
                            </div>
                            <div className="rounded-lg bg-muted/30 p-3">
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                Payment Method
                              </div>
                              <div className="mt-1">
                                {renderPaymentMethodBadge(invoice)}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="rounded-lg bg-muted/30 p-3">
                                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                  Total Amount
                                </div>
                                <div className="mt-1 font-semibold">
                                  {formatAmount(invoice.grand_total)}
                                </div>
                              </div>
                              <div className="rounded-lg bg-muted/30 p-3">
                                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                  Previous Paid
                                </div>
                                <div className="mt-1 font-semibold">
                                  {formatAmount(invoice.amount_paid)}
                                </div>
                              </div>
                              <div className="rounded-lg bg-muted/30 p-3">
                                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                  Paid Amount
                                </div>
                                <div className="mt-1 font-semibold text-success">
                                  {formatAmount(invoice.updatedPaidAmount)}
                                </div>
                              </div>
                              <div className="rounded-lg bg-muted/30 p-3">
                                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                  Due Balance
                                </div>
                                <div className="mt-1 font-semibold text-error">
                                  {formatAmount(getCreditDueAmount(invoice, invoice.currentDueBalance))}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>

                    <div className="hidden overflow-hidden rounded-lg border md:block">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead>Invoice Date</TableHead>
                            <TableHead>Invoice #</TableHead>
                            <TableHead>Payment Method</TableHead>
                            <TableHead>Total Amount</TableHead>
                            <TableHead>Previous Paid</TableHead>
                            <TableHead>Paid Amount</TableHead>
                            <TableHead>Due Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoiceRows.map((invoice, index) => (
                            <TableRow
                              key={invoice.id}
                              className={cn(index % 2 === 0 ? "bg-background" : "bg-muted/10")}
                            >
                              <TableCell className="whitespace-nowrap">
                                {formatDate(
                                  new Date(invoice.created_at),
                                  systemSettings.date_format,
                                  systemSettings.timezone
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="font-medium">{invoice.invoice_number}</span>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setPreviewInvoice(invoice)}
                                        className="h-8 px-2"
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Preview Invoice</TooltipContent>
                                  </Tooltip>
                                </div>
                              </TableCell>
                              <TableCell className="max-w-[220px]">
                                <div className="max-w-[220px]">
                                  {renderPaymentMethodBadge(invoice)}
                                </div>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {formatAmount(invoice.grand_total)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {formatAmount(invoice.amount_paid)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-success">
                                {formatAmount(invoice.updatedPaidAmount)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-error">
                                {formatAmount(getCreditDueAmount(invoice, invoice.currentDueBalance))}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TooltipProvider>

                  <div className="grid gap-3 md:hidden">
                    <Card className="border-dashed">
                      <CardContent className="space-y-4 p-4">
                        <div className="flex items-center justify-between gap-4 text-sm">
                          <span className="font-medium">Total Due Amount</span>
                          <span>{formatAmount(summary.totalDueAmount)}</span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-4 text-sm">
                            <span className="font-medium">Pay Now</span>
                          </div>
                          <Input
                            type="text"
                            step="0.01"
                            inputMode="decimal"
                            placeholder="Enter amount"
                            value={payNowValue}
                            onChange={(event) => setPayNowValue(sanitizeAmountInput(event.target.value))}
                            aria-invalid={Boolean(payNowError)}
                            className={cn("h-10", payNowInputClass)}
                          />
                          <p className="text-xs text-muted-foreground">
                            Positive applies to the oldest due invoices first. Negative reverses from the oldest paid invoices first.
                          </p>
                          {payNowError && (
                            <p className="text-xs font-medium text-error">{payNowError}</p>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-4 text-sm">
                          <span className="font-medium">Total Paid Amount</span>
                          <span>{formatAmount(summary.totalPaidAmount)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4 text-sm">
                          <span className="font-medium">Total Due Balance</span>
                          <span>{formatAmount(summary.totalDueBalance)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card className="hidden border-dashed md:block">
                    <CardContent className="p-0">
                      <Table containerClassName="rounded-xl border-0">
                        <TableHeader>
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableHead>Label</TableHead>
                            <TableHead>Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell className="font-medium">Total Due Amount</TableCell>
                            <TableCell>{formatAmount(summary.totalDueAmount)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Pay Now</TableCell>
                            <TableCell className="min-w-[240px]">
                              <Input
                                type="text"
                                step="0.01"
                                inputMode="decimal"
                                placeholder="Enter amount"
                                value={payNowValue}
                                onChange={(event) => setPayNowValue(sanitizeAmountInput(event.target.value))}
                                aria-invalid={Boolean(payNowError)}
                                className={cn("h-10 max-w-sm", payNowInputClass)}
                              />
                              <p className="mt-1 text-xs text-muted-foreground">
                                Positive applies to the oldest due invoices first. Negative reverses from the oldest paid invoices first.
                              </p>
                              {payNowError && (
                                <p className="mt-1 text-xs font-medium text-error">{payNowError}</p>
                              )}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Total Paid Amount</TableCell>
                            <TableCell>{formatAmount(summary.totalPaidAmount)}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell className="font-medium">Total Due Balance</TableCell>
                            <TableCell>{formatAmount(summary.totalDueBalance)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            <DialogFooter className="border-t px-4 py-4 md:px-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {submitPayment.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Payment"
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <SaleDetailsDialog
        open={Boolean(previewInvoice)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPreviewInvoice(null);
        }}
        saleId={previewInvoice?.id || null}
        previewOverride={previewOverride}
      />

      <PaymentHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        customer={customer}
      />
    </>
  );
};
