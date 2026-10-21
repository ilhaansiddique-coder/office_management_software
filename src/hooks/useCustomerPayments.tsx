import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "@/utils/toast";
import { logActivity } from "@/utils/activityLogger";
import { useMockDataContext } from "@/contexts/MockDataContext";

export interface CustomerDueInvoice {
  id: string;
  customer_id: string | null;
  customer_name: string;
  invoice_number: string;
  grand_total: number;
  amount_paid: number;
  amount_due: number;
  payment_status: string;
  payment_terms: string | null;
  payment_method: string | null;
  courier_status: string | null;
  sale_payments: Array<{
    method: string | null;
    amount: number;
  }>;
  created_at: string;
  updated_at: string;
}

export interface CustomerPaymentHistoryEntry {
  id: string;
  saleId: string | null;
  invoiceNumber: string;
  amount: number;
  created_at: string;
  paidBy: string;
}

export interface CustomerPaymentHistoryResult {
  entries: CustomerPaymentHistoryEntry[];
  source: "payment_logs" | "activity_logs";
}

export interface SubmitCustomerPaymentInput {
  customerId: string;
  amount: number;
}

interface ProcessCustomerPaymentRow {
  payment_log_id: string;
  sale_id: string;
  invoice_number: string;
  applied_amount: number;
  updated_amount_paid: number;
  updated_amount_due: number;
  paid_by_name: string;
  created_at: string;
}

interface CustomerDueInvoiceSplitRow {
  sale_id: string | null;
  method: string | null;
  amount: number | null;
}

const roundAmount = (value: number) => Math.round(value * 100) / 100;
const hasNonZeroAmount = (value: number) => Math.abs(roundAmount(value)) > 0;
const CUSTOMER_DUE_INVOICE_SELECT =
  "id, customer_id, customer_name, invoice_number, grand_total, amount_paid, amount_due, review_amount_paid, review_amount_due, payment_status, payment_terms, payment_method, courier_status, created_at, updated_at";
const CUSTOMER_DUE_INVOICE_SELECT_WITH_SPLITS =
  `${CUSTOMER_DUE_INVOICE_SELECT}, sale_payments(method, amount)`;
const normalizeMethodKey = (value?: string | null) => {
  const raw = String(value || "").toLowerCase().trim();
  return raw === "condition" ? "cod" : raw;
};

const shouldFallbackToActivityLogs = (error: any) => {
  const status = Number(error?.status ?? error?.code ?? 0);
  const message = String(error?.message || error?.details || error?.hint || "").toLowerCase();

  return (
    status === 404 ||
    message.includes("payment_logs") ||
    message.includes("could not find the table") ||
    message.includes("relation") ||
    message.includes("schema cache")
  );
};

const shouldFallbackToLegacySubmit = (error: any) => {
  const status = Number(error?.status ?? error?.code ?? 0);
  const message = String(error?.message || error?.details || error?.hint || "").toLowerCase();

  return (
    status === 404 ||
    message.includes("process_customer_payment") ||
    message.includes("could not find the function") ||
    message.includes("function") ||
    message.includes("schema cache")
  );
};

const shouldFallbackToStandaloneSalePayments = (error: any) => {
  const status = Number(error?.status ?? error?.code ?? 0);
  const message = String(error?.message || error?.details || error?.hint || "").toLowerCase();

  return (
    status === 404 ||
    message.includes("sale_payments") ||
    message.includes("relationship") ||
    message.includes("schema cache")
  );
};

const buildCustomerDueInvoicesQuery = (customerId: string, includeSalePayments: boolean) => {
  const query = supabase
    .from("sales")
    .select(includeSalePayments ? CUSTOMER_DUE_INVOICE_SELECT_WITH_SPLITS : CUSTOMER_DUE_INVOICE_SELECT)
    .eq("customer_id", customerId)
    .or("is_deleted.eq.false,is_deleted.is.null")
    .order("created_at", { ascending: true });

  return query;
};

const mapSalePaymentsBySaleId = (rows: CustomerDueInvoiceSplitRow[]) => {
  const paymentMap = new Map<string, Array<{ method: string | null; amount: number }>>();

  rows.forEach((row) => {
    const saleId = row.sale_id ? String(row.sale_id) : "";
    if (!saleId) return;

    const existing = paymentMap.get(saleId) || [];
    existing.push({
      method: row.method ?? null,
      amount: roundAmount(Number(row.amount) || 0),
    });
    paymentMap.set(saleId, existing);
  });

  return paymentMap;
};

const fetchCustomerDueInvoices = async (customerId: string) => {
  const primaryQuery = await buildCustomerDueInvoicesQuery(customerId, true);

  if (!primaryQuery.error) {
    return ((primaryQuery.data || []) as any[])
      .map(normalizeDueInvoice)
      .filter(isCreditManagedInvoice)
      .filter((invoice) => invoice.amount_due > 0 || invoice.amount_paid > 0);
  }

  if (!shouldFallbackToStandaloneSalePayments(primaryQuery.error)) {
    throw primaryQuery.error;
  }

  const fallbackQuery = await buildCustomerDueInvoicesQuery(customerId, false);
  if (fallbackQuery.error) throw fallbackQuery.error;

  const baseSales = (fallbackQuery.data || []) as any[];
  const saleIds = baseSales.map((sale) => String(sale.id)).filter(Boolean);
  let paymentMap = new Map<string, Array<{ method: string | null; amount: number }>>();

  if (saleIds.length > 0) {
    const { data: paymentRows, error: paymentError } = await supabase
      .from("sale_payments")
      .select("sale_id, method, amount")
      .in("sale_id", saleIds);

    if (paymentError) {
      console.warn("Failed to load sale_payments for customer due invoices:", paymentError);
    } else {
      paymentMap = mapSalePaymentsBySaleId(
        ((paymentRows || []) as CustomerDueInvoiceSplitRow[])
      );
    }
  }

  return baseSales
    .map((sale) =>
      normalizeDueInvoice({
        ...sale,
        sale_payments: paymentMap.get(String(sale.id)) || [],
      })
    )
    .filter(isCreditManagedInvoice)
    .filter((invoice) => invoice.amount_due > 0 || invoice.amount_paid > 0);
};

const normalizeDueInvoice = (sale: any): CustomerDueInvoice => ({
  id: sale.id,
  customer_id: sale.customer_id ?? null,
  customer_name: sale.customer_name || "Customer",
  invoice_number: sale.invoice_number || "-",
  grand_total: Number(sale.grand_total) || 0,
  amount_paid: Math.max(0, Number(sale.review_amount_paid ?? sale.amount_paid ?? 0) || 0),
  amount_due: Math.max(0, Number(sale.review_amount_due ?? sale.amount_due ?? 0) || 0),
  payment_status: String(sale.payment_status || "pending"),
  payment_terms: sale.payment_terms ?? null,
  payment_method: sale.payment_method ?? null,
  courier_status: sale.courier_status ?? null,
  sale_payments: Array.isArray(sale.sale_payments)
    ? (sale.sale_payments as Array<{ method?: string | null; amount?: number | null }>).map((split) => ({
        method: split?.method ?? null,
        amount: roundAmount(Number(split?.amount) || 0),
      }))
    : [],
  created_at: sale.created_at,
  updated_at: sale.updated_at,
});

const isCreditManagedInvoice = (invoice: CustomerDueInvoice) => {
  const paymentTerms = String(invoice.payment_terms || "").toLowerCase();
  const paymentMethod = normalizeMethodKey(invoice.payment_method);
  const hasCreditSplit = (invoice.sale_payments || []).some(
    (split) => normalizeMethodKey(split.method) === "credit" && (Number(split.amount) || 0) > 0
  );
  const courierStatus = String(invoice.courier_status || "").toLowerCase();

  if (["cancelled", "returned", "lost"].includes(courierStatus)) {
    return false;
  }

  return paymentTerms === "credit" || paymentMethod === "credit" || hasCreditSplit;
};

const mapProcessCustomerPaymentRows = (data: any[], fallbackPaidBy: string) =>
  ((data || []) as any[]).map((row) => ({
    payment_log_id: String(row.payment_log_id),
    sale_id: String(row.sale_id),
    invoice_number: String(row.invoice_number || "-"),
    applied_amount: roundAmount(Number(row.applied_amount) || 0),
    updated_amount_paid: roundAmount(Number(row.updated_amount_paid) || 0),
    updated_amount_due: roundAmount(Number(row.updated_amount_due) || 0),
    paid_by_name: String(row.paid_by_name || fallbackPaidBy),
    created_at: String(row.created_at),
  })) as ProcessCustomerPaymentRow[];

const submitCustomerPaymentLegacy = async ({
  customerId,
  amount,
  paidBy,
  userId,
}: {
  customerId: string;
  amount: number;
  paidBy: string;
  userId?: string | null;
}) => {
  const dueInvoices = await fetchCustomerDueInvoices(customerId);

  const totalDue = roundAmount(dueInvoices.reduce((sum, invoice) => sum + invoice.amount_due, 0));
  const totalReversiblePaid = roundAmount(
    dueInvoices.reduce((sum, invoice) => sum + invoice.amount_paid, 0)
  );

  if (dueInvoices.length === 0) {
    throw new Error("No payable invoices found for this customer.");
  }
  if (amount > 0 && totalDue <= 0) {
    throw new Error("No due invoices found for this customer.");
  }
  if (amount > totalDue) {
    throw new Error("Payment amount exceeds the total due balance.");
  }
  if (amount < 0 && Math.abs(amount) > totalReversiblePaid) {
    throw new Error("Adjustment amount exceeds the reversible paid amount.");
  }

  let remaining = amount;
  const appliedInvoices: ProcessCustomerPaymentRow[] = [];
  const orderedInvoices = amount >= 0 ? dueInvoices : [...dueInvoices].sort((a, b) => {
    const aTime = new Date(a.created_at).getTime();
    const bTime = new Date(b.created_at).getTime();
    return aTime - bTime;
  });

  for (const invoice of orderedInvoices) {
    if (!hasNonZeroAmount(remaining)) break;

    const maxAdjustable = amount >= 0 ? invoice.amount_due : invoice.amount_paid;
    const signedAmount =
      amount >= 0
        ? roundAmount(Math.min(remaining, maxAdjustable))
        : roundAmount(-Math.min(Math.abs(remaining), maxAdjustable));

    if (!hasNonZeroAmount(signedAmount)) continue;

    const updatedAmountPaid = roundAmount(invoice.amount_paid + signedAmount);
    const updatedAmountDue = roundAmount(invoice.amount_due - signedAmount);
    const nextPaymentStatus =
      updatedAmountDue <= 0
        ? "paid"
        : updatedAmountPaid <= 0
          ? "pending"
          : "partial";

    const { error: updateError } = await supabase
      .from("sales")
      .update({
        amount_paid: updatedAmountPaid,
        amount_due: updatedAmountDue,
        review_amount_paid: updatedAmountPaid,
        review_amount_due: updatedAmountDue,
        payment_status: nextPaymentStatus,
      })
      .eq("id", invoice.id);

    if (updateError) throw updateError;

    const { error: paymentLogError } = await supabase
      .from("payment_logs")
      .insert({
        sale_id: invoice.id,
        customer_id: customerId,
        invoice_number: invoice.invoice_number,
        amount: signedAmount,
        paid_by_user_id: userId ?? null,
        paid_by_name: paidBy,
      });

    if (paymentLogError && !shouldFallbackToActivityLogs(paymentLogError)) {
      console.warn("Payment log insert failed after legacy submit:", paymentLogError);
    }

    appliedInvoices.push({
      payment_log_id: `legacy:${invoice.id}:${Date.now()}:${appliedInvoices.length}`,
      sale_id: invoice.id,
      invoice_number: invoice.invoice_number,
      applied_amount: signedAmount,
      updated_amount_paid: updatedAmountPaid,
      updated_amount_due: updatedAmountDue,
      paid_by_name: paidBy,
      created_at: new Date().toISOString(),
    });

    remaining = roundAmount(remaining - signedAmount);
  }

  if (appliedInvoices.length === 0) {
    throw new Error(
      amount >= 0
        ? "No due invoices found for this customer."
        : "No paid invoices available for adjustment."
    );
  }

  await logActivity({
    action: "insert",
    entityType: "payments",
    entityId: customerId,
    summary: `Recorded customer payment across ${appliedInvoices.length} invoice${appliedInvoices.length > 1 ? "s" : ""}`,
    details: {
      customer_id: customerId,
      total_amount: amount,
      paid_by: paidBy,
      submission_mode: "legacy_fallback",
      invoices: appliedInvoices.map((result) => ({
        sale_id: result.sale_id,
        invoice_number: result.invoice_number,
        amount: result.applied_amount,
        updated_amount_paid: result.updated_amount_paid,
        updated_amount_due: result.updated_amount_due,
      })),
    },
  });

  return appliedInvoices;
};

export const useCustomerDueInvoices = (customerId?: string, enabled = true) => {
  const { scaleSalesData } = useMockDataContext();
  return useQuery({
    queryKey: ["customer-due-invoices", customerId],
    queryFn: async () => {
      if (!customerId) return [];
      const data = await fetchCustomerDueInvoices(customerId);
      return scaleSalesData(data as any[]);
    },
    enabled: enabled && !!customerId,
    staleTime: 30 * 1000,
  });
};

export const useCustomerPaymentHistory = (customerId?: string, enabled = true) => {
  const { scaleSalesData } = useMockDataContext();
  return useQuery({
    queryKey: ["customer-payment-history", customerId],
    queryFn: async () => {
      if (!customerId) {
        return {
          entries: [],
          source: "payment_logs",
        } as CustomerPaymentHistoryResult;
      }

      const { data, error } = await supabase
        .from("payment_logs")
        .select("id, sale_id, invoice_number, amount, created_at, paid_by_name, paid_by_user_id")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      if (!error) {
        return {
          entries: ((data || []) as any[]).map((log) => ({
            id: String(log.id),
            saleId: log.sale_id ? String(log.sale_id) : null,
            invoiceNumber: String(log.invoice_number || "-"),
            amount: roundAmount(Number(log.amount) || 0),
            created_at: String(log.created_at),
            paidBy: log.paid_by_name || log.paid_by_user_id || "Unknown User",
          })) as CustomerPaymentHistoryEntry[],
          source: "payment_logs",
        } as CustomerPaymentHistoryResult;
      }

      if (!shouldFallbackToActivityLogs(error)) {
        throw error;
      }

      const { data: sales, error: salesError } = await supabase
        .from("sales")
        .select("id, invoice_number")
        .eq("customer_id", customerId);

      if (salesError) throw salesError;

      const saleRows = (sales || []) as any[];
      const saleIds = saleRows.map((sale) => String(sale.id));
      const saleIdToInvoiceNumber = new Map(
        saleRows.map((sale) => [String(sale.id), String(sale.invoice_number || "-")])
      );

      const { data: customerLogs, error: customerLogsError } = await supabase
        .from("activity_logs_view")
        .select("id, entity_id, created_at, full_name, email, user_id, details")
        .eq("entity_type", "payments")
        .eq("entity_id", customerId)
        .order("created_at", { ascending: false });

      if (customerLogsError) throw customerLogsError;

      let saleLogs: any[] = [];
      if (saleIds.length > 0) {
        const { data: fetchedSaleLogs, error: saleLogsError } = await supabase
          .from("activity_logs_view")
          .select("id, entity_id, created_at, full_name, email, user_id, details")
          .eq("entity_type", "payments")
          .in("entity_id", saleIds)
          .order("created_at", { ascending: false });

        if (saleLogsError) throw saleLogsError;
        saleLogs = (fetchedSaleLogs || []) as any[];
      }

      const combinedEntries = [
        ...((customerLogs || []) as any[]).flatMap((log) => {
          const paidBy =
            log.details?.paid_by ||
            log.details?.paid_by_name ||
            log.full_name ||
            log.email ||
            log.user_id ||
            "Unknown User";

          const invoiceItems = Array.isArray(log.details?.invoices)
            ? log.details.invoices
            : [];

          return invoiceItems
            .map((item: any, index: number) => ({
              id: `${String(log.id)}:${String(item?.sale_id || index)}`,
              saleId: item?.sale_id ? String(item.sale_id) : null,
              invoiceNumber:
                String(item?.invoice_number || "") ||
                (item?.sale_id ? saleIdToInvoiceNumber.get(String(item.sale_id)) : undefined) ||
                "-",
              amount: roundAmount(Number(item?.amount) || 0),
              created_at: String(log.created_at),
              paidBy,
            }))
            .filter((entry) => hasNonZeroAmount(entry.amount));
        }),
        ...saleLogs
          .map((log) => ({
            id: String(log.id),
            saleId: log.entity_id ? String(log.entity_id) : null,
            invoiceNumber:
              log.details?.invoice_number ||
              (log.entity_id ? saleIdToInvoiceNumber.get(String(log.entity_id)) : undefined) ||
              "-",
            amount: roundAmount(
              Number(log.details?.amount ?? log.details?.amount_paid ?? 0) || 0
            ),
            created_at: String(log.created_at),
            paidBy:
              log.details?.paid_by ||
              log.details?.paid_by_name ||
              log.full_name ||
              log.email ||
              log.user_id ||
              "Unknown User",
          }))
          .filter((entry) => hasNonZeroAmount(entry.amount)),
      ];

      const dedupedEntries = Array.from(
        new Map(
          combinedEntries.map((entry) => [
            `${entry.id}|${entry.saleId || "none"}|${entry.amount}|${entry.created_at}`,
            entry,
          ])
        ).values()
      ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return {
        entries: scaleSalesData(dedupedEntries as any[]) as any,
        source: "activity_logs",
      } as CustomerPaymentHistoryResult;
    },
    enabled: enabled && !!customerId,
    staleTime: 15 * 1000,
  });
};

export const useSubmitCustomerPayment = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { profile } = useProfile();

  return useMutation({
    mutationFn: async ({ customerId, amount }: SubmitCustomerPaymentInput) => {
      const normalizedAmount = roundAmount(Number(amount) || 0);
      if (!customerId) {
        throw new Error("Customer is required.");
      }
      if (!hasNonZeroAmount(normalizedAmount)) {
        throw new Error("Enter a non-zero amount before submitting.");
      }

      const paidBy =
        profile?.full_name ||
        user?.user_metadata?.full_name ||
        user?.email?.split("@")[0] ||
        "Unknown User";

      if (normalizedAmount < 0) {
        return submitCustomerPaymentLegacy({
          customerId,
          amount: normalizedAmount,
          paidBy,
          userId: user?.id,
        });
      }

      const { data, error } = await supabase.rpc("process_customer_payment", {
        p_customer_id: customerId,
        p_amount: normalizedAmount,
        p_paid_by_name: paidBy,
      });

      let results: ProcessCustomerPaymentRow[];
      if (error) {
        if (!shouldFallbackToLegacySubmit(error)) {
          throw error;
        }

        results = await submitCustomerPaymentLegacy({
          customerId,
          amount: normalizedAmount,
          paidBy,
          userId: user?.id,
        });
      } else {
        results = mapProcessCustomerPaymentRows(data || [], paidBy);
      }

      if (results.length === 0) {
        throw new Error("No due invoices found for this customer.");
      }

      if (!error) {
        await logActivity({
          action: "insert",
          entityType: "payments",
          entityId: customerId,
          summary: `Recorded customer payment across ${results.length} invoice${results.length > 1 ? "s" : ""}`,
          details: {
            customer_id: customerId,
            total_amount: normalizedAmount,
            paid_by: paidBy,
            invoices: results.map((result) => ({
              sale_id: result.sale_id,
              invoice_number: result.invoice_number,
              amount: result.applied_amount,
              updated_amount_paid: result.updated_amount_paid,
              updated_amount_due: result.updated_amount_due,
            })),
          },
        });
      }

      return results;
    },
    onSuccess: (results, variables) => {
      queryClient.invalidateQueries({ queryKey: ["customer-due-invoices", variables.customerId] });
      queryClient.invalidateQueries({ queryKey: ["customer-payment-history", variables.customerId] });
      queryClient.invalidateQueries({ queryKey: ["payment-logs"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["overdue-credit"] });

      toast.success(
        variables.amount < 0
          ? results.length === 1
            ? `Adjustment recorded for invoice ${results[0].invoice_number}`
            : `Adjustment recorded across ${results.length} invoices`
          : results.length === 1
            ? `Payment recorded for invoice ${results[0].invoice_number}`
            : `Payment recorded across ${results.length} invoices`
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to record customer payment");
    },
  });
};
