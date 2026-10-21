import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useUserRole } from "./useUserRole";
import { toast } from "@/utils/toast";
import { sendInvoiceWebhook, prepareInvoiceData } from "@/utils/invoiceWebhook";
import { parseVariantAttributes } from "@/utils/variantAttributes";
import { generateUUID } from "@/lib/uuid";
import { useMockDataContext } from "@/contexts/MockDataContext";

type AliasSupportState = "unknown" | "supported" | "unsupported";

const CUSTOMER_ALIAS_SUPPORT_STORAGE_KEY = "customers.alias_names.support";

const getStoredAliasSupportState = (): AliasSupportState => {
  if (typeof window === "undefined") return "unknown";
  const stored = window.localStorage.getItem(CUSTOMER_ALIAS_SUPPORT_STORAGE_KEY);
  return stored === "supported" || stored === "unsupported" ? stored : "unknown";
};

const persistAliasSupportState = (state: Exclude<AliasSupportState, "unknown">) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CUSTOMER_ALIAS_SUPPORT_STORAGE_KEY, state);
};

let customerAliasNamesSupport: AliasSupportState = getStoredAliasSupportState();
let salesPackagedSupport: boolean | null = null;

export const SALES_QUERY_KEY = ["sales"] as const;

export interface Sale {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string;
  saved_customer_name?: string | null;
  customer_alias_names?: string[] | null;
  customer_phone: string | null;
  customer_whatsapp: string | null;
  customer_address: string | null;
  additional_info?: string | null;
  cn_number?: string | null;
  courier_name?: string | null;
  cancelled_at?: string | null;
  returned_at?: string | null;
  lost_at?: string | null;
  status_changed_at?: string | null;
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  grand_total: number;
  amount_paid: number;
  amount_due: number;
  review_amount_paid?: number | null;
  review_amount_due?: number | null;
  payment_method: string;
  payment_status: string;
  payment_terms?: 'immediate' | 'cod' | 'credit';
  credit_days?: number;
  due_date?: string | null;
  order_status?: string;
  courier_status?: string;
  consignment_id?: string;
  tracking_number?: string;
  last_status_check?: string;
  fee?: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  packaged?: boolean;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
  sale_payments?: Array<{ method: string; amount: number }>;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  product_image_url?: string | null;
  quantity: number;
  rate: number;
  sale_price?: number | null;
  total: number;
  created_at: string;
  variant_id?: string | null;
  variant_image_url?: string | null;
  variant_attributes?: Record<string, string> | string | string[] | null;
  attributes?: Record<string, string> | string | string[] | null;
  variant_label?: string | null;
  description_for_print?: string | null;
}

export interface CreateSaleData {
  id?: string;
  customer_id?: string;
  customer_name: string;
  customer_phone?: string;
  customer_whatsapp?: string;
  customer_address?: string;
  additional_info?: string;
  cn_number?: string;
  courier_name?: string;
  subtotal: number;
  discount_percent?: number;
  discount_amount?: number;
  fee?: number;
  grand_total: number;
  amount_paid?: number;
  amount_due?: number;
  review_amount_paid?: number;
  review_amount_due?: number;
  payment_method: string;
  payment_status?: string;
  payment_terms?: 'immediate' | 'cod' | 'credit';
  credit_days?: number | null;
  due_date?: string | null;
  payment_splits?: Array<{ method: string; amount: number }>;
  created_at?: string;
  items: {
    product_id: string | null;
    product_name: string;
    product_image_url?: string | null;
    quantity: number;
    rate: number;
    sale_price?: number | null;
    total: number;
    variant_id?: string | null;
    variant_image_url?: string | null;
  }[];
}

export interface UpdateSaleData {
  id: string;
  customer_id?: string;
  customer_name: string;
  customer_phone?: string;
  customer_whatsapp?: string;
  customer_address?: string;
  additional_info?: string;
  cn_number?: string;
  courier_name?: string;
  city?: string;
  zone?: string;
  area?: string;
  subtotal: number;
  discount_percent?: number;
  discount_amount?: number;
  fee?: number;
  grand_total: number;
  amount_paid?: number;
  amount_due?: number;
  review_amount_paid?: number;
  review_amount_due?: number;
  payment_method: string;
  payment_status?: string;
  payment_terms?: 'immediate' | 'cod' | 'credit';
  credit_days?: number | null;
  due_date?: string | null;
  payment_splits?: Array<{ method: string; amount: number }>;
  courier_status?: string | null;
  consignment_id?: string | null;
  tracking_number?: string | null;
  created_at?: string;
  items: {
    id?: string;
    product_id: string | null;
    product_name: string;
    product_image_url?: string | null;
    quantity: number;
    rate: number;
    sale_price?: number | null;
    total: number;
    variant_id?: string | null;
    variant_image_url?: string | null;
  }[];
}

export const useSales = (queryKey: string = "sales") => {
  const { user } = useAuth();
  const { isAdmin, hasPermission } = useUserRole();
  const queryClient = useQueryClient();
  const [supportsPackaged, setSupportsPackaged] = useState<boolean>(salesPackagedSupport ?? true);
  const salesQueryKey = SALES_QUERY_KEY;
  // `.in()` is encoded into the GET query string; larger batches can trip proxy URL limits.
  const CUSTOMER_LOOKUP_BATCH_SIZE = 10;
  const CUSTOMER_LOOKUP_CONCURRENCY = 4;
  const { scaleSalesData } = useMockDataContext();
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const normalizeName = (name?: string | null) =>
    (name || "").toLowerCase().replace(/\s+/g, " ").trim();

  const normalizeAliasNames = (aliases?: string[] | null) =>
    (aliases || [])
      .map((alias) => String(alias || "").trim())
      .filter(Boolean);

  const normalizePhoneDigits = (phone?: string | null) =>
    (phone || "").replace(/[^\d]/g, "");

  const buildPhoneIlikePattern = (digits: string) => {
    // Additional security: ensure only digits (should already be sanitized by normalizePhoneDigits)
    const sanitizedDigits = digits.replace(/[^\d]/g, "");
    if (!sanitizedDigits) return "";
    // Limit length to prevent DoS with extremely long patterns
    const limitedDigits = sanitizedDigits.slice(0, 20);
    return `%${limitedDigits.split("").join("%")}%`;
  };

  const buildWhatsappFromPhone = (phone?: string | null) => {
    const digits = normalizePhoneDigits(phone);
    if (!digits) return null;
    return digits.startsWith("88") ? `+${digits}` : `+88${digits}`;
  };

  const isCancelledStatus = (paymentStatus?: string | null, courierStatus?: string | null) => {
    const cancelledCourierStates = ["cancelled", "returned", "lost"];
    return paymentStatus === "cancelled" || (courierStatus ? cancelledCourierStates.includes(courierStatus) : false);
  };

  const normalizePaymentSplits = (
    splits: Array<{ method: string; amount: number }> | undefined,
    fallbackMethod: string | undefined,
    fallbackAmount: number | undefined
  ) => {
    const normalized = (splits || [])
      .map((split) => {
        const method = String(split.method || "").trim() || "cash";
        return {
          method: method === "condition" ? "cod" : method,
          amount: Number(split.amount) || 0,
        };
      })
      .filter((split) => split.amount > 0);

    if (normalized.length === 0 && (fallbackAmount || 0) > 0) {
      const method = fallbackMethod === "condition" ? "cod" : (fallbackMethod || "cash");
      return [{
        method,
        amount: fallbackAmount || 0,
      }];
    }

    return normalized;
  };

  // Function to update customer status after sale changes
  const updateCustomerStatus = async (customerId?: string) => {
    if (!customerId) return;

    try {
      // Get customer's purchase history to calculate new status
      // Since we're using hard delete, just fetch all sales for this customer
      const { data: sales, error } = await supabase
        .from('sales')
        .select('created_at, payment_status, courier_status')
        .eq('customer_id', customerId)
        .eq('is_deleted', false)
        .not('payment_status', 'eq', 'cancelled')
        .not('courier_status', 'in', '(cancelled,returned,lost)')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching customer sales:', error);
        return;
      }

      let newStatus = 'inactive';
      const now = new Date();
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      if (sales && sales.length > 0) {
        const lastPurchase = new Date(sales[0].created_at);

        if (lastPurchase >= oneMonthAgo) {
          newStatus = 'active';
        } else if (lastPurchase >= threeMonthsAgo) {
          newStatus = 'neutral';
        } else {
          newStatus = 'inactive';
        }
      }

      // Update customer status
      const { error: updateError } = await supabase
        .from('customers')
        .update({ status: newStatus })
        .eq('id', customerId);

      if (updateError) {
        console.error('Error updating customer status:', updateError);
      }
    } catch (error) {
      console.error('Error in updateCustomerStatus:', error);
    }
  };

  const syncCustomerAliasForSaleName = async (customerId?: string | null, saleName?: string | null) => {
    const normalizedSaleName = normalizeName(saleName);
    const trimmedSaleName = String(saleName || "").trim();
    if (!customerId || !normalizedSaleName || !trimmedSaleName) return;

    const {
      data: customer,
      error: customerError,
      includeCustomerAliases,
    } = await runCustomerQueryWithAliasFallback((includeAliases) =>
      supabase
        .from("customers")
        .select(includeAliases ? "id, name, alias_names" : "id, name")
        .eq("id", customerId)
        .maybeSingle()
    );

    if (customerError || !customer) {
      if (customerError) {
        console.warn("Failed to load customer for alias sync:", customerError);
      }
      return;
    }

    if (!includeCustomerAliases) return;

    if (normalizeName(customer.name) === normalizedSaleName) return;

    const existingAliases = normalizeAliasNames((customer as any).alias_names);
    if (existingAliases.some((alias) => normalizeName(alias) === normalizedSaleName)) return;

    const nextAliases = Array.from(new Set([...existingAliases, trimmedSaleName]));
    const { error: aliasUpdateError } = await supabase
      .from("customers")
      .update({ alias_names: nextAliases })
      .eq("id", customerId);

    if (aliasUpdateError) {
      console.warn("Failed to update customer aliases:", aliasUpdateError);
    }
  };

  const isMissingColumnError = (error: unknown, column: string): boolean => {
    const message = String((error as { message?: string; details?: string; hint?: string })?.message || "");
    const details = String((error as { message?: string; details?: string; hint?: string })?.details || "");
    const hint = String((error as { message?: string; details?: string; hint?: string })?.hint || "");
    const haystack = `${message} ${details} ${hint}`.toLowerCase();
    return haystack.includes(column.toLowerCase());
  };

  const isTransientFetchError = (error: unknown): boolean => {
    const message = String((error as { message?: string; details?: string; hint?: string })?.message || "");
    const details = String((error as { message?: string; details?: string; hint?: string })?.details || "");
    const haystack = `${message} ${details}`.toLowerCase();
    return haystack.includes("failed to fetch") || haystack.includes("network") || haystack.includes("abort");
  };

  const runCustomerQueryWithAliasFallback = async <T,>(
    queryFactory: (includeAliases: boolean) => Promise<{ data: T; error: any }>
  ) => {
    let includeCustomerAliases = customerAliasNamesSupport !== "unsupported";
    let result = await queryFactory(includeCustomerAliases);

    if (includeCustomerAliases && result.error && isMissingColumnError(result.error, "alias_names")) {
      customerAliasNamesSupport = "unsupported";
      persistAliasSupportState("unsupported");
      includeCustomerAliases = false;
      result = await queryFactory(false);
    } else if (includeCustomerAliases && !result.error) {
      customerAliasNamesSupport = "supported";
      persistAliasSupportState("supported");
    }

    return {
      data: result.data,
      error: result.error,
      includeCustomerAliases,
    };
  };

  const fetchCustomerRowsByIds = async (customerIds: string[]) => {
    const validCustomerIds = Array.from(
      new Set(customerIds.filter((id) => UUID_PATTERN.test(String(id || "").trim()))),
    );

    if (!validCustomerIds.length) {
      return {
        includeCustomerAliases: false,
        customerRows: [] as any[],
        customerError: null,
      };
    }

    const fetchBatches = async (selectClause: string) => {
      const rows: any[] = [];
      const customerIdBatches: string[][] = [];

      for (let index = 0; index < validCustomerIds.length; index += CUSTOMER_LOOKUP_BATCH_SIZE) {
        customerIdBatches.push(validCustomerIds.slice(index, index + CUSTOMER_LOOKUP_BATCH_SIZE));
      }

      for (let index = 0; index < customerIdBatches.length; index += CUSTOMER_LOOKUP_CONCURRENCY) {
        const batchGroup = customerIdBatches.slice(index, index + CUSTOMER_LOOKUP_CONCURRENCY);
        const groupResults = await Promise.all(
          batchGroup.map(async (customerIdBatch) => {
            const { data, error } = await supabase
              .from("customers")
              .select(selectClause)
              .in("id", customerIdBatch);

            return { data: data || [], error };
          }),
        );

        const failedResult = groupResults.find((result) => result.error);
        if (failedResult?.error) {
          return { rows: [] as any[], error: failedResult.error };
        }

        groupResults.forEach((result) => {
          rows.push(...result.data);
        });
      }

      return { rows, error: null };
    };

    let includeCustomerAliases = customerAliasNamesSupport !== "unsupported";
    let result = await fetchBatches(
      includeCustomerAliases ? "id, name, alias_names, is_deleted" : "id, name, is_deleted",
    );

    if (includeCustomerAliases && result.error && isMissingColumnError(result.error, "alias_names")) {
      customerAliasNamesSupport = "unsupported";
      persistAliasSupportState("unsupported");
      includeCustomerAliases = false;
      result = await fetchBatches("id, name, is_deleted");
    } else if (includeCustomerAliases && !result.error) {
      customerAliasNamesSupport = "supported";
      persistAliasSupportState("supported");
    }

    return {
      includeCustomerAliases,
      customerRows: result.rows,
      customerError: result.error,
    };
  };

  const {
    data: baseSales = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: salesQueryKey,
    queryFn: async () => {
      try {
        const buildSalesSelect = (
          includeCourierName: boolean,
          includeTrackingNumber: boolean,
          includePackaged: boolean,
        ) => {
          const columns = [
            "id",
            "invoice_number",
            "customer_id",
            "customer_name",
            "customer_phone",
            "customer_whatsapp",
            "customer_address",
            "additional_info",
            "cn_number",
            ...(includeCourierName ? ["courier_name"] : []),
            "consignment_id",
            ...(includeTrackingNumber ? ["tracking_number"] : []),
            "cancelled_at",
            "returned_at",
            "lost_at",
            "status_changed_at",
            "last_status_check",
            "payment_method",
            "payment_status",
            "payment_terms",
            "credit_days",
            "due_date",
            "courier_status",
            "subtotal",
            "discount_percent",
            "discount_amount",
            "grand_total",
            "amount_paid",
            "amount_due",
            "review_amount_paid",
            "review_amount_due",
            "fee",
            "created_at",
            "updated_at",
            ...(includePackaged ? ["packaged"] : []),
            "created_by",
            "sale_payments(method, amount)",
          ];

          return columns.join(",");
        };

        const runSalesQuery = async (opts: {
          includeCourierName: boolean;
          includeTrackingNumber: boolean;
          includePackaged: boolean;
        }) => {
          const select = buildSalesSelect(
            opts.includeCourierName,
            opts.includeTrackingNumber,
            opts.includePackaged,
          );

          return supabase
            .from("sales")
            .select(select)
            .eq("is_deleted", false)
            .order("invoice_number", { ascending: false });
        };

        let hasCourierName = true;
        let hasTrackingCode = true;
        let hasPackaged = true;

        let { data, error } = await runSalesQuery({
          includeCourierName: hasCourierName,
          includeTrackingNumber: hasTrackingCode,
          includePackaged: hasPackaged,
        });

        if (error) {
          const missingCourier = isMissingColumnError(error, "courier_name");
          const missingTracking = isMissingColumnError(error, "tracking_number");
          const missingPackaged = isMissingColumnError(error, "packaged");

          if (missingCourier || missingTracking || missingPackaged) {
            if (missingCourier) hasCourierName = false;
            if (missingTracking) hasTrackingCode = false;
            if (missingPackaged) hasPackaged = false;

            ({ data, error } = await runSalesQuery({
              includeCourierName: hasCourierName,
              includeTrackingNumber: hasTrackingCode,
              includePackaged: hasPackaged,
            }));
          }
        }

        salesPackagedSupport = hasPackaged;

        if (supportsPackaged !== hasPackaged) {
          setSupportsPackaged(hasPackaged);
        }

        if (!error && data) {
          if (!hasCourierName) {
            data = data.map((sale) => ({ ...sale, courier_name: null }));
          }
          if (!hasTrackingCode) {
            data = data.map((sale) => ({ ...sale, tracking_number: null }));
          }
          if (!hasPackaged) {
            data = data.map((sale) => ({ ...sale, packaged: false }));
          }
        }

        if (error) {
          console.error("Sales query error:", error);
          throw error;
        }

        return (data || []) as Sale[];
      } catch (error) {
        console.error("Failed to load sale data:", error);
        throw error;
      }
    },
    enabled: !!user,
    staleTime: 60 * 1000,
    refetchOnMount: false,
    placeholderData: (previousData) => previousData,
  });

  const customerIds = useMemo(
    () => Array.from(new Set(baseSales.map((sale) => sale.customer_id).filter(Boolean))) as string[],
    [baseSales],
  );

  const customerIdsKey = useMemo(
    () => customerIds.slice().sort().join(","),
    [customerIds],
  );

  const { data: customerEnrichment } = useQuery({
    queryKey: ["sales", "customer-enrichment", customerIdsKey],
    queryFn: async () => {
      const {
        includeCustomerAliases,
        customerRows,
        customerError,
      } = await fetchCustomerRowsByIds(customerIds);

      if (customerError) {
        if (!isTransientFetchError(customerError)) {
          console.warn("Failed to enrich sales with customer alias data:", customerError);
        }
        return null;
      }

      return new Map(
        (customerRows || [])
          .filter((customer: any) => !customer?.is_deleted)
          .map((customer: any) => [
            customer.id,
            {
              name: customer.name || null,
              alias_names: includeCustomerAliases ? normalizeAliasNames(customer.alias_names) : [],
            },
          ]),
      ) as Map<string, { name: string | null; alias_names: string[] }>;
    },
    enabled: !!user && customerIds.length > 0,
    staleTime: 60 * 1000,
    refetchOnMount: false,
    placeholderData: (previousData) => previousData,
  });

  const rawSales = useMemo(() => {
    if (!customerEnrichment || customerEnrichment.size === 0) {
      return baseSales;
    }

    return baseSales.map((sale) => {
      const linkedCustomer = sale.customer_id ? customerEnrichment.get(sale.customer_id) : null;
      return {
        ...sale,
        saved_customer_name: linkedCustomer?.name || null,
        customer_alias_names: linkedCustomer?.alias_names || [],
      };
    });
  }, [baseSales, customerEnrichment]);

  const sales = useMemo(() => scaleSalesData(rawSales), [rawSales, scaleSalesData]);

  // Real-time: instantly update sales cache on changes
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`sales-realtime-${queryKey}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sales" }, (payload) => {
        // Instant cache update for sales field changes (courier_status, payment_status, amounts, etc.)
        const updated = payload.new as Record<string, any>;
        queryClient.setQueryData(salesQueryKey, (old: Sale[] | undefined) => {
          if (!old) return old;
          return old.map((sale) =>
            sale.id === updated.id ? { ...sale, ...updated } : sale
          );
        });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sales" }, () => {
        // New sale created — need full refetch to get joined data
        queryClient.invalidateQueries({ queryKey: salesQueryKey });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "sales" }, (payload) => {
        const deleted = payload.old as Record<string, any>;
        queryClient.setQueryData(salesQueryKey, (old: Sale[] | undefined) => {
          if (!old) return old;
          return old.filter((sale) => sale.id !== deleted.id);
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_items" }, () => {
        queryClient.invalidateQueries({ queryKey: salesQueryKey });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sale_payments" }, () => {
        queryClient.invalidateQueries({ queryKey: salesQueryKey });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, queryKey, salesQueryKey, user]);

  const getStockFailureMessage = (error: any) => {
    const raw = String(error?.message || error || "");
    if (raw.toLowerCase().includes("insufficient stock")) {
      return "Insufficient stock. This product is already sold out.";
    }
    if (raw.toLowerCase().includes("product not found")) {
      return "Product not found for stock update.";
    }
    if (raw.toLowerCase().includes("variant not found")) {
      return "Variant not found for stock update.";
    }
    return raw;
  };

  const getInsufficientStockDetails = async (items: Array<any>) => {
    const productIds = Array.from(
      new Set(items.map((item) => item.product_id).filter(Boolean))
    ) as string[];
    const variantIds = Array.from(
      new Set(items.map((item) => item.variant_id).filter(Boolean))
    ) as string[];

    const [productsResult, variantsResult] = await Promise.all([
      productIds.length
        ? supabase.from("products").select("id, stock_quantity").in("id", productIds)
        : Promise.resolve({ data: [], error: null }),
      variantIds.length
        ? supabase.from("product_variants").select("id, stock_quantity").in("id", variantIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (productsResult.error) throw productsResult.error;
    if (variantsResult.error) throw variantsResult.error;

    const productStockMap = new Map<string, number>();
    (productsResult.data || []).forEach((row: any) => {
      productStockMap.set(row.id, Number(row.stock_quantity) || 0);
    });

    const variantStockMap = new Map<string, number>();
    (variantsResult.data || []).forEach((row: any) => {
      variantStockMap.set(row.id, Number(row.stock_quantity) || 0);
    });

    const firstInsufficient = items.find((item) => {
      const qty = Number(item.quantity) || 0;
      if (item.variant_id) {
        const stock = variantStockMap.get(item.variant_id) ?? 0;
        return qty > stock;
      }
      const stock = productStockMap.get(item.product_id) ?? 0;
      return qty > stock;
    });

    if (!firstInsufficient) return null;

    const stock = firstInsufficient.variant_id
      ? variantStockMap.get(firstInsufficient.variant_id) ?? 0
      : productStockMap.get(firstInsufficient.product_id) ?? 0;

    return {
      name: firstInsufficient.product_name || "Product",
      stock,
    };
  };

  const createSale = useMutation({
    mutationFn: async (saleData: CreateSaleData) => {
      const saleId = saleData.id ?? generateUUID();
      const { items, id, payment_splits, ...saleInfo } = saleData;
      const saleWhatsapp = saleInfo.customer_whatsapp || buildWhatsappFromPhone(saleInfo.customer_phone);
      const normalizedAmountPaid = saleInfo.amount_paid ?? 0;
      const paymentSplits = normalizePaymentSplits(
        payment_splits,
        saleInfo.payment_method,
        normalizedAmountPaid
      );
      const saleInfoWithWhatsapp = {
        ...saleInfo,
        customer_whatsapp: saleWhatsapp,
        payment_method: saleInfo.payment_method,
      };

      const { data: existingSale, error: existingSaleError } = await supabase
        .from("sales")
        .select("*")
        .eq("id", saleId)
        .maybeSingle();

      if (existingSaleError) throw existingSaleError;

      if (existingSale) {
        const { data: existingItems, error: existingItemsError } = await supabase
          .from("sales_items")
          .select("id")
          .eq("sale_id", saleId)
          .limit(1);

        if (existingItemsError) throw existingItemsError;

        if (!existingItems || existingItems.length === 0) {
          const saleItems = items.map(item => ({
            ...item,
            sale_id: saleId,
          }));

          const { error: itemsError } = await supabase
            .from("sales_items")
            .insert(saleItems);

          if (itemsError) throw itemsError;
        }

        return existingSale as Sale;
      }

      // Generate invoice number
      const { data: invoiceData, error: invoiceError } = await supabase
        .rpc('generate_invoice_number');

      if (invoiceError) throw invoiceError;
      const initialCancelled = isCancelledStatus(saleInfoWithWhatsapp.payment_status, (saleInfoWithWhatsapp as any).courier_status);

      // Check if customer exists or create new one if needed
      let finalCustomerId = saleInfoWithWhatsapp.customer_id;

      if (!finalCustomerId && saleInfoWithWhatsapp.customer_name) {
        const normalizedName = normalizeName(saleInfoWithWhatsapp.customer_name);
        const normalizedPhone = normalizePhoneDigits(saleInfoWithWhatsapp.customer_phone);
        let existingCustomerId: string | null = null;

        if (normalizedPhone) {
          const pattern = buildPhoneIlikePattern(normalizedPhone);
          // Only query if we have a valid pattern
          if (pattern) {
            const { data: candidates } = await runCustomerQueryWithAliasFallback((includeAliases) =>
              supabase
                .from("customers")
                .select(includeAliases ? "id, name, phone, whatsapp, alias_names" : "id, name, phone, whatsapp")
                .or(`phone.ilike.${pattern},whatsapp.ilike.${pattern}`)
                .limit(10)
            );

            const matched = (candidates || []).find(candidate => {
              const candidatePhone = normalizePhoneDigits(candidate.phone);
              const candidateWhatsapp = normalizePhoneDigits(candidate.whatsapp);
              return candidatePhone === normalizedPhone || candidateWhatsapp === normalizedPhone;
            });

            if (matched) {
              existingCustomerId = matched.id;
            } else if (normalizedName) {
              const {
                data: nameCandidates,
                includeCustomerAliases,
              } = await runCustomerQueryWithAliasFallback((includeAliases) =>
                supabase
                  .from("customers")
                  .select(includeAliases ? "id, name, phone, whatsapp, alias_names" : "id, name, phone, whatsapp")
                  .limit(50)
              );

              const nameOnlyMatch = (nameCandidates || []).find(candidate => {
                const canonicalMatch = normalizeName(candidate.name) === normalizedName;
                const aliasMatch = includeCustomerAliases
                  ? normalizeAliasNames((candidate as any).alias_names).some(
                      (alias) => normalizeName(alias) === normalizedName,
                    )
                  : false;
                if (!canonicalMatch && !aliasMatch) return false;
                const candidatePhone = normalizePhoneDigits(candidate.phone);
                const candidateWhatsapp = normalizePhoneDigits(candidate.whatsapp);
                return !candidatePhone && !candidateWhatsapp;
              });

              if (nameOnlyMatch) {
                existingCustomerId = nameOnlyMatch.id;
              }
            }
          }
        } else if (normalizedName) {
          const {
            data: nameCandidates,
            includeCustomerAliases,
          } = await runCustomerQueryWithAliasFallback((includeAliases) =>
            supabase
              .from("customers")
              .select(includeAliases ? "id, name, alias_names" : "id, name")
              .limit(50)
          );

          const nameMatch = (nameCandidates || []).find(candidate =>
            normalizeName(candidate.name) === normalizedName ||
            (includeCustomerAliases &&
              normalizeAliasNames((candidate as any).alias_names).some(
                (alias) => normalizeName(alias) === normalizedName,
              ))
          );

          if (nameMatch) {
            existingCustomerId = nameMatch.id;
          }
        }

        if (existingCustomerId) {
          finalCustomerId = existingCustomerId;
        } else {
          // Create new customer
          const customerInsertPayload = {
            name: saleInfoWithWhatsapp.customer_name,
            phone: saleInfoWithWhatsapp.customer_phone || null,
            whatsapp: saleInfoWithWhatsapp.customer_whatsapp || null,
            address: saleInfoWithWhatsapp.customer_address || null,
            status: 'active'
          };
          let { data: newCustomer, error: customerError } = await supabase
            .from("customers")
            .insert([{
              ...customerInsertPayload,
              alias_names: [],
            }])
            .select()
            .single();

          if (customerError && isMissingColumnError(customerError, "alias_names")) {
            ({ data: newCustomer, error: customerError } = await supabase
              .from("customers")
              .insert([customerInsertPayload])
              .select()
              .single());
          }

          if (customerError) throw customerError;
          finalCustomerId = newCustomer.id;
        }
      }

      await syncCustomerAliasForSaleName(finalCustomerId, saleInfoWithWhatsapp.customer_name);

      // Create sale
      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert([{
          id: saleId,
          ...saleInfoWithWhatsapp,
          customer_id: finalCustomerId,
          invoice_number: invoiceData
        }])
        .select()
        .single();

      if (saleError) throw saleError;

      // Create sale items
      const saleItems = items.map(item => ({
        ...item,
        sale_id: sale.id
      }));

      const { error: itemsError } = await supabase
        .from("sales_items")
        .insert(saleItems);

      if (itemsError) {
        const raw = String(itemsError.message || "");
        if (raw.toLowerCase().includes("insufficient stock")) {
          const details = await getInsufficientStockDetails(saleItems);
          if (details) {
            throw new Error(`Insufficient stock for ${details.name}. Left in stock: ${details.stock}.`);
          }
        }
        throw itemsError;
      }

      if (paymentSplits.length > 0) {
        const splitRows = paymentSplits.map((split) => ({
          sale_id: sale.id,
          method: split.method,
          amount: split.amount,
        }));
        const { error: splitError } = await supabase
          .from("sale_payments")
          .insert(splitRows);
        if (splitError) throw splitError;
      }

      // Stock adjustments are handled by database triggers; no client-side adjustments here.

      return sale;
    },
    onSuccess: async (sale) => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });

      // Update customer status automatically
      if (sale.customer_id) {
        updateCustomerStatus(sale.customer_id);
      }

      // Send invoice webhook
      try {
        const invoiceData = await prepareInvoiceData(sale.id);
        if (invoiceData) {
          const webhookResult = await sendInvoiceWebhook(invoiceData);
          if (!webhookResult.success) {
            console.warn("Invoice webhook failed:", webhookResult.error);
            // Don't show error to user as it's not critical
          }
        }
      } catch (error) {
        console.error("Error sending invoice webhook:", error);
        // Don't show error to user as it's not critical
      }

      toast.success("Sale created successfully");
    },
    onError: (error) => {
      toast.error("Failed to create sale: " + getStockFailureMessage(error));
    },
  });

  const updateSale = useMutation({
    mutationFn: async (saleData: UpdateSaleData) => {
      const { items, id, payment_splits, ...saleInfo } = saleData;
      const normalizedAmountPaid = saleInfo.amount_paid ?? 0;
      const paymentSplits = normalizePaymentSplits(
        payment_splits,
        saleInfo.payment_method,
        normalizedAmountPaid
      );

      // Fetch previous sale status and invoice number before updating
      const { data: prevSale, error: prevSaleError } = await supabase
        .from("sales")
        .select("payment_status, courier_status, invoice_number")
        .eq("id", id)
        .single();
      if (prevSaleError) throw prevSaleError;
      const prevStatus = prevSale?.payment_status as string | undefined;
      const prevCourierStatus = prevSale?.courier_status as string | undefined;

      // Update sale record
      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .update(saleInfo)
        .eq("id", id)
        .select()
        .maybeSingle();

      if (saleError) throw saleError;
      if (!sale) {
        throw new Error("Sale update blocked by permissions.");
      }

      await syncCustomerAliasForSaleName(sale.customer_id, saleInfo.customer_name);

      // Get existing sale items
      const { data: existingItems, error: existingError } = await supabase
        .from("sales_items")
        .select("id, product_id, variant_id, quantity, rate, sale_price")
        .eq("sale_id", id);

      if (existingError) throw existingError;

      const normalizedExisting = (existingItems || []).map((item) => {
        const effectiveRate =
          item.sale_price !== null && item.sale_price !== undefined
            ? Number(item.sale_price)
            : Number(item.rate || 0);
        return {
          product_id: item.product_id,
          variant_id: item.variant_id,
          quantity: Number(item.quantity || 0),
          rate: Number.isFinite(effectiveRate) ? effectiveRate : 0,
        };
      });
      const normalizedIncoming = items.map((item) => {
        const effectiveRate =
          item.sale_price !== null && item.sale_price !== undefined
            ? Number(item.sale_price)
            : Number(item.rate || 0);
        return {
          product_id: item.product_id,
          variant_id: item.variant_id,
          quantity: Number(item.quantity || 0),
          rate: Number.isFinite(effectiveRate) ? effectiveRate : 0,
        };
      });

      const itemsEqual = (a: typeof normalizedExisting, b: typeof normalizedIncoming) => {
        if (a.length !== b.length) return false;
        const sortKey = (item: typeof normalizedExisting[number]) =>
          `${item.product_id || ""}:${item.variant_id || ""}:${item.quantity}:${item.rate}`;
        const sortedA = [...a].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
        const sortedB = [...b].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
        return sortedA.every((item, idx) => {
          const other = sortedB[idx];
          return (
            item.product_id === other.product_id &&
            (item.variant_id || null) === (other.variant_id || null) &&
            item.quantity === other.quantity &&
            item.rate === other.rate
          );
        });
      };

      const shouldSkipItemUpdate = itemsEqual(normalizedExisting, normalizedIncoming);

      if (!shouldSkipItemUpdate) {
        // Delete existing sale items
        const { error: deleteError } = await supabase
          .from("sales_items")
          .delete()
          .eq("sale_id", id);

        if (deleteError) throw deleteError;

        // Create new sale items (preserve variant_id when present)
        const saleItems = items.map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          product_image_url: item.product_image_url ?? null,
          quantity: item.quantity,
          rate: item.rate,
          sale_price: item.sale_price ?? null,
          total: item.total,
          variant_id: item.variant_id ?? null,
          variant_image_url: item.variant_image_url ?? null,
          sale_id: id,
        }));

        const { error: itemsError } = await supabase
          .from("sales_items")
          .insert(saleItems);

        if (itemsError) {
          const raw = String(itemsError.message || "");
          if (raw.toLowerCase().includes("insufficient stock")) {
            const details = await getInsufficientStockDetails(saleItems);
            if (details) {
              throw new Error(
                `Insufficient stock for ${details.name}. Left in stock: ${details.stock}.`
              );
            }
          }
          throw itemsError;
        }
      }

      const { error: deleteSplitsError } = await supabase
        .from("sale_payments")
        .delete()
        .eq("sale_id", id);

      if (deleteSplitsError) throw deleteSplitsError;

      if (paymentSplits.length > 0) {
        const splitRows = paymentSplits.map((split) => ({
          sale_id: id,
          method: split.method,
          amount: split.amount,
        }));
        const { error: splitError } = await supabase
          .from("sale_payments")
          .insert(splitRows);
        if (splitError) throw splitError;
      }

      const newPaymentStatus = (saleInfo.payment_status ?? sale.payment_status) as string | undefined;
      const newCourierStatus = (saleInfo.courier_status ?? sale.courier_status) as string | undefined;
      const wasCancelled = isCancelledStatus(prevStatus, prevCourierStatus);
      const isNowCancelled = isCancelledStatus(newPaymentStatus, newCourierStatus);

      // Restore stock when transitioning to cancelled/returned (not lost — product is gone)
      const isNowLost = newCourierStatus === "lost";
      if (!wasCancelled && isNowCancelled && !isNowLost) {
        try {
          // Check if inventory was already restored (by DB trigger or previous attempt)
          const { data: currentSale } = await supabase
            .from("sales")
            .select("inventory_restored")
            .eq("id", id)
            .single();

          if (!currentSale?.inventory_restored) {
            // Get sale items to restore stock
            const { data: saleItemsToRestore } = await supabase
              .from("sales_items")
              .select("product_id, variant_id, quantity")
              .eq("sale_id", id);

            if (saleItemsToRestore && saleItemsToRestore.length > 0) {
              for (const item of saleItemsToRestore) {
                // Restore product stock
                const { data: currentProduct } = await supabase
                  .from("products")
                  .select("stock_quantity")
                  .eq("id", item.product_id)
                  .single();

                if (currentProduct) {
                  await supabase
                    .from("products")
                    .update({ stock_quantity: (currentProduct.stock_quantity || 0) + item.quantity })
                    .eq("id", item.product_id);
                }

                // Restore variant stock if applicable
                if (item.variant_id) {
                  const { data: currentVariant } = await supabase
                    .from("product_variants")
                    .select("stock_quantity")
                    .eq("id", item.variant_id)
                    .single();

                  if (currentVariant) {
                    await supabase
                      .from("product_variants")
                      .update({ stock_quantity: (currentVariant.stock_quantity || 0) + item.quantity })
                      .eq("id", item.variant_id);
                  }
                }
              }

              // Mark as restored to prevent double restoration
              await supabase
                .from("sales")
                .update({ inventory_restored: true })
                .eq("id", id);
            }
          }
        } catch (restoreError) {
          console.error("Error restoring inventory for cancelled sale:", restoreError);
        }
      }

      return sale;
    },
    onSuccess: (sale) => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });

      // Update customer status automatically
      if (sale.customer_id) {
        updateCustomerStatus(sale.customer_id);
      }

      toast.success("Sale updated successfully");
    },
    onError: (error) => {
      toast.error("Failed to update sale: " + getStockFailureMessage(error));
    },
  });

  const getSaleWithItems = async (saleId: string) => {
    try {
      // Add timeout protection
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database query timeout')), 8000)
      );

      const selectWithAll = "id, invoice_number, customer_id, customer_name, customer_phone, customer_whatsapp, customer_address, additional_info, cn_number, courier_name, consignment_id, tracking_number, cancelled_at, returned_at, lost_at, status_changed_at, payment_method, payment_status, payment_terms, credit_days, due_date, courier_status, subtotal, discount_percent, discount_amount, grand_total, amount_paid, amount_due, review_amount_paid, review_amount_due, fee, created_at, updated_at";
      const selectWithoutTracking = "id, invoice_number, customer_id, customer_name, customer_phone, customer_whatsapp, customer_address, additional_info, cn_number, courier_name, consignment_id, cancelled_at, returned_at, lost_at, status_changed_at, payment_method, payment_status, payment_terms, credit_days, due_date, courier_status, subtotal, discount_percent, discount_amount, grand_total, amount_paid, amount_due, review_amount_paid, review_amount_due, fee, created_at, updated_at";
      const selectWithoutCourier = "id, invoice_number, customer_id, customer_name, customer_phone, customer_whatsapp, customer_address, additional_info, cn_number, consignment_id, tracking_number, cancelled_at, returned_at, lost_at, status_changed_at, payment_method, payment_status, payment_terms, credit_days, due_date, courier_status, subtotal, discount_percent, discount_amount, grand_total, amount_paid, amount_due, review_amount_paid, review_amount_due, fee, created_at, updated_at";
      const selectWithoutCourierAndTracking = "id, invoice_number, customer_id, customer_name, customer_phone, customer_whatsapp, customer_address, additional_info, cn_number, consignment_id, cancelled_at, returned_at, lost_at, status_changed_at, payment_method, payment_status, payment_terms, credit_days, due_date, courier_status, subtotal, discount_percent, discount_amount, grand_total, amount_paid, amount_due, review_amount_paid, review_amount_due, fee, created_at, updated_at";

      let hasCourierName = true;
      let hasTrackingCode = true;
      let salePromise = supabase
        .from("sales")
        .select(selectWithAll)
        .eq("id", saleId)
        .single();

      let { data: sale, error: saleError } = await Promise.race([salePromise, timeoutPromise]) as any;

      if (saleError) {
        const msg = String(saleError.message || "");
        const missingCourier = msg.includes("courier_name");
        const missingTracking = msg.includes("tracking_number");

        if (missingTracking && !missingCourier) {
          hasTrackingCode = false;
          salePromise = supabase
            .from("sales")
            .select(selectWithoutTracking)
            .eq("id", saleId)
            .single();
          const retry = await Promise.race([salePromise, timeoutPromise]) as any;
          sale = retry.data;
          saleError = retry.error;
        } else if (missingCourier && !missingTracking) {
          hasCourierName = false;
          salePromise = supabase
            .from("sales")
            .select(selectWithoutCourier)
            .eq("id", saleId)
            .single();
          const retry = await Promise.race([salePromise, timeoutPromise]) as any;
          sale = retry.data;
          saleError = retry.error;
        } else if (missingCourier && missingTracking) {
          hasCourierName = false;
          hasTrackingCode = false;
          salePromise = supabase
            .from("sales")
            .select(selectWithoutCourierAndTracking)
            .eq("id", saleId)
            .single();
          const retry = await Promise.race([salePromise, timeoutPromise]) as any;
          sale = retry.data;
          saleError = retry.error;
        }

        if (!saleError && sale) {
          if (!hasCourierName) {
            sale.courier_name = null;
          }
          if (!hasTrackingCode) {
            (sale as any).tracking_number = null;
          }
        }
      }

      if (saleError) {
        console.error("Error fetching sale:", saleError);
        throw saleError;
      }

      if (sale?.customer_id) {
        const {
          data: customer,
          error: customerError,
          includeCustomerAliases,
        } = await runCustomerQueryWithAliasFallback((includeAliases) =>
          supabase
            .from("customers")
            .select(includeAliases ? "name, alias_names, is_deleted" : "name, is_deleted")
            .eq("id", sale.customer_id)
            .maybeSingle()
        );

        if (customerError) {
          console.warn("Error fetching customer for sale:", customerError);
        } else if (customer && !customer.is_deleted) {
          sale = {
            ...sale,
            saved_customer_name: customer.name || null,
            customer_alias_names: includeCustomerAliases
              ? normalizeAliasNames((customer as any).alias_names)
              : [],
          };
        }
      }

      const itemsPromise = supabase
        .from("sales_items")
        .select(`
          *,
          product_variants!left(attributes, image_url),
          products!left(image_url, name)
        `)
        .eq("sale_id", saleId);

      const { data: items, error: itemsError } = await Promise.race([itemsPromise, timeoutPromise]) as any;

      if (itemsError) throw itemsError;

      const itemsWithVariants = (items || []).map(item => {
        const rawVariantAttrs =
          (item as any).product_variants?.attributes ??
          (item as any).attributes ??
          null;

        // Imported data sometimes stores attributes as JSON strings.
        // Parse safely and only replace the raw value when parsing yields real keys.
        const parsedVariantAttrs = parseVariantAttributes(rawVariantAttrs);
        const hasParsedAttrs = Object.keys(parsedVariantAttrs).length > 0;
        const variantAttrs = hasParsedAttrs ? parsedVariantAttrs : rawVariantAttrs;

        const variantLabel = (() => {
          if (hasParsedAttrs) {
            return Object.values(parsedVariantAttrs).filter(Boolean).join(" / ");
          }
          if (!variantAttrs) return null;
          if (typeof variantAttrs === "string") return variantAttrs;
          if (Array.isArray(variantAttrs)) return variantAttrs.filter(Boolean).join(" / ");
          if (typeof variantAttrs === "object") return Object.values(variantAttrs).filter(Boolean).join(" / ");
          return null;
        })();

        const descriptionForPrint = variantLabel
          ? `${item.product_name} * ${variantLabel}`
          : item.product_name;

        return {
          ...item,
          variant_attributes: variantAttrs,
          variant_label: variantLabel,
          description_for_print: descriptionForPrint,
          product_image_url: (item as any).product_image_url || (item as any).products?.image_url || null,
          variant_image_url: (item as any).variant_image_url || (item as any).product_variants?.image_url || null
        };
      });

      const { data: paymentSplits, error: paymentSplitsError } = await supabase
        .from("sale_payments")
        .select("method, amount")
        .eq("sale_id", saleId);

      if (paymentSplitsError) {
        console.warn("Error fetching sale payment splits:", paymentSplitsError);
      }

      // Return both 'items' (for dialogs) and 'sale_items' (for invoice template)
      return {
        ...sale,
        items: itemsWithVariants,
        sale_items: itemsWithVariants,
        payment_splits: paymentSplits || [],
      };
    } catch (error) {
      console.error("Error in getSaleWithItems:", error);
      throw error;
    }
  };

  const deleteSale = useMutation({
    mutationFn: async (id: string) => {
      if (!hasPermission('sales.delete') && !isAdmin) {
        throw new Error("You don't have permission to delete sales");
      }

      const { error } = await supabase
        .from("sales")
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (error) {
        console.error("Error soft deleting sale:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success("Sale moved to trash");
    },
    onError: (error) => {
      toast.error("Failed to delete sale: " + error.message);
    },
  });

  const restoreSale = useMutation({
    mutationFn: async (id: string) => {
      if (!hasPermission('sales.delete') && !isAdmin) {
        throw new Error("You don't have permission to restore sales");
      }

      const { error } = await supabase
        .from("sales")
        .update({
          is_deleted: false,
          deleted_at: null,
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      queryClient.setQueryData(["trash", "sales"], (prev: any) =>
        Array.isArray(prev) ? prev.filter((item) => item?.id !== id) : prev
      );
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["trash", "sales"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success("Sale restored");
    },
    onError: (error) => {
      toast.error("Failed to restore sale: " + error.message);
    },
  });

  const hardDeleteSale = useMutation({
    mutationFn: async (id: string) => {
      if (!hasPermission('sales.delete') && !isAdmin) {
        throw new Error("You don't have permission to delete sales");
      }

      const { error: salesItemsError } = await supabase
        .from("sales_items")
        .delete()
        .eq("sale_id", id);

      if (salesItemsError) {
        console.error("Error deleting sales_items:", salesItemsError);
        throw new Error("Failed to delete associated sales_items: " + salesItemsError.message);
      }

      const { error: saleItemsError } = await supabase
        .from("sale_items")
        .delete()
        .eq("sale_id", id);

      if (saleItemsError) {
        console.warn("Error deleting sale_items (may not exist):", saleItemsError);
      }

      const { error: paymentsError } = await supabase
        .from("sale_payments")
        .delete()
        .eq("sale_id", id);

      if (paymentsError) {
        console.warn("Error deleting sale_payments:", paymentsError);
      }

      const { data: deletedSales, error } = await supabase
        .from("sales")
        .delete()
        .eq("id", id)
        .select("id");

      if (error) {
        console.error("Error deleting sale:", error);
        throw error;
      }
      if (!deletedSales || deletedSales.length === 0) {
        throw new Error("Sale not deleted (not found or blocked by RLS)");
      }
    },
    onSuccess: (_data, id) => {
      queryClient.setQueryData(["trash", "sales"], (prev: any) =>
        Array.isArray(prev) ? prev.filter((item) => item?.id !== id) : prev
      );
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["trash", "sales"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success("Sale permanently deleted");
    },
    onError: (error) => {
      toast.error("Failed to permanently delete sale: " + error.message);
    },
  });

  return {
    sales,
    rawSales,
    rawSalesCount: rawSales.length,
    isLoading,
    error,
    refetch,
    createSale,
    updateSale,
    deleteSale,
    restoreSale,
    hardDeleteSale,
    getSaleWithItems,
    supportsPackaged,
  };
};
