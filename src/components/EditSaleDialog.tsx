import { useState, useEffect, useRef } from "react";
import { useSales, type UpdateSaleData } from "@/hooks/useSales";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/utils/toast";
import { BaseSaleDialog, type SaleFormData, type SaleItem } from "./BaseSaleDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { parseVariantAttributes } from "@/utils/variantAttributes";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { toDisplayDateInput, toIsoFromDateInput } from "@/lib/time";
import { logActivity } from "@/utils/activityLogger";

interface EditSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string | null;
}

export const EditSaleDialog = ({ open, onOpenChange, saleId }: EditSaleDialogProps) => {
  const [initialData, setInitialData] = useState<SaleFormData | undefined>(undefined);
  const initialSnapshotRef = useRef<{
    itemsSignature: string;
    subtotal: number;
    discountPercent: number;
    discountAmount: number;
    grandTotal: number;
    fee: number;
    paymentStatus: string;
    amountPaid: number;
    amountDue: number;
  } | null>(null);
  const initialDetailsRef = useRef<{
    invoice_number?: string | null;
    sale_date?: string | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    customer_whatsapp?: string | null;
    customer_address?: string | null;
    additional_info?: string | null;
    cn_number?: string | null;
    courier_name?: string | null;
    payment_method?: string | null;
    payment_status?: string | null;
    payment_terms?: string | null;
    credit_days?: number | null;
    due_date?: string | null;
    subtotal?: number;
    discount_percent?: number;
    discount_amount?: number;
    fee?: number;
    grand_total?: number;
    amount_paid?: number;
    amount_due?: number;
    payment_splits?: Array<{ method: string; amount: number }>;
    items?: SaleItem[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { systemSettings } = useSystemSettings();
  const toDateInputValue = (value?: string) => {
    return toDisplayDateInput(value, systemSettings.timezone);
  };
  const buildItemsSignature = (items: SaleItem[]) => {
    const normalized = items.map((item) => ({
      product_id: item.productId || item.product_id,
      variant_id: item.variantId || item.variant_id,
      quantity: item.quantity,
      rate: item.rate,
      sale_price: item.salePrice ?? item.sale_price ?? null,
      total: item.total,
    }));
    return JSON.stringify(
      normalized.sort((a, b) => {
        const keyA = `${a.product_id ?? ""}:${a.variant_id ?? ""}:${a.rate ?? 0}:${a.sale_price ?? 0}`;
        const keyB = `${b.product_id ?? ""}:${b.variant_id ?? ""}:${b.rate ?? 0}:${b.sale_price ?? 0}`;
        return keyA.localeCompare(keyB);
      })
    );
  };
  const buildItemsForLog = (items: SaleItem[]) =>
    items.map((item) => ({
      name: item.productName || item.product_name || "Item",
      attributes: item.variantLabel
        ? { Variant: item.variantLabel }
        : undefined,
      quantity: item.quantity,
      rate: item.rate,
      sale_price: item.salePrice ?? item.sale_price ?? null,
      total: item.total,
    }));
  const buildPaymentSplitsForLog = (splits: SaleFormData["payment_splits"]) =>
    (splits || []).map((split) => ({
      method: split.method,
      amount: Number(split.amount),
    }));

  const { updateSale, getSaleWithItems } = useSales();

  useEffect(() => {
    if (!open || !saleId) {
      setInitialData(undefined);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Load data when dialog opens
    const loadSaleData = async () => {
      try {
        console.log("EditSaleDialog: Loading sale data for ID:", saleId);
        setIsLoading(true);
        setError(null);

        // Add timeout protection
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), 10000)
        );

        const dataPromise = getSaleWithItems(saleId);
        const saleWithItems = await Promise.race([dataPromise, timeoutPromise]) as any;

        console.log("EditSaleDialog: Sale data loaded:", saleWithItems);

        if (!saleWithItems) {
          throw new Error("No sale data received");
        }

        const baseItems = saleWithItems.items.map((item: any) => ({
          id: item.id,
          product_id: item.product_id,
          product_name: item.product_name,
          product_image_url: item.product_image_url ?? null,
          quantity: item.quantity,
          rate: item.rate,
          sale_price: item.sale_price ?? null,
          total: item.total,
          variant_id: item.variant_id || null,
          variant_image_url: item.variant_image_url ?? null,
        } as SaleItem));

        // Get variant IDs and product IDs
        const variantIds = baseItems.filter(i => i.variant_id).map(i => i.variant_id!) as string[];
        const productIds = baseItems.filter(i => !i.variant_id).map(i => i.product_id).filter(Boolean) as string[];

        let variantMap: Record<string, { label: string; stock: number; image?: string | null }> = {};
        let productMap: Record<string, { stock: number }> = {};

        // Fetch variant data
        if (variantIds.length > 0) {
          try {
            const { data: vars, error: varErr } = await supabase
              .from("product_variants")
              .select("id, attributes, stock_quantity, image_url")
              .in("id", variantIds);

            if (varErr) {
              console.warn("Warning: Could not load variant data:", varErr);
              // Continue without variant data rather than failing completely
            } else {
              variantMap = (vars || []).reduce((acc: any, v: any) => {
                const attrs = parseVariantAttributes(v.attributes);
                const label = Object.entries(attrs)
                  .map(([_, val]) => `${val}`)
                  .join(" / ");
                acc[v.id] = { label, stock: v.stock_quantity || 0, image: v.image_url };
                return acc;
              }, {});
            }
          } catch (variantError) {
            console.warn("Warning: Could not load variant data:", variantError);
            // Continue without variant data
          }
        }

        // Fetch product stock data for non-variant products
        if (productIds.length > 0) {
          try {
            const { data: prods, error: prodErr } = await supabase
              .from("products")
              .select("id, stock_quantity")
              .in("id", productIds);

            if (prodErr) {
              console.warn("Warning: Could not load product stock data:", prodErr);
            } else {
              productMap = (prods || []).reduce((acc: any, p: any) => {
                acc[p.id] = { stock: p.stock_quantity || 0 };
                return acc;
              }, {});
            }
          } catch (productError) {
            console.warn("Warning: Could not load product stock data:", productError);
          }
        }

        const cancelledStatuses = ["cancelled", "returned", "lost"];
        const saleIsCancelled =
          saleWithItems.payment_status === "cancelled" ||
          cancelledStatuses.includes(String(saleWithItems.courier_status || "").toLowerCase());

        const enrichedItems: SaleItem[] = baseItems.map(i => {
          // When editing, add back the quantity already in this sale to the available stock
          // This allows user to keep or increase the quantity up to (current_stock + existing_quantity)
          const currentQuantity = i.quantity || 0;
          const restoreQty = saleIsCancelled ? 0 : currentQuantity;

          if (!i.variant_id) {
            const currentStock = productMap[i.product_id]?.stock || 0;
            return {
              ...i,
              productImageUrl: i.product_image_url ?? null,
              maxStock: currentStock + restoreQty, // Add current quantity to available stock
              originalQuantity: restoreQty, // Store original quantity for stock calculations
            };
          }
          const currentStock = variantMap[i.variant_id]?.stock || 0;
          return {
            ...i,
            variantLabel: variantMap[i.variant_id]?.label,
            maxStock: currentStock + restoreQty, // Add current quantity to available stock
            originalQuantity: restoreQty, // Store original quantity for stock calculations
            variantImageUrl: variantMap[i.variant_id]?.image || i.variant_image_url || null,
            productImageUrl: i.product_image_url ?? null,
          };
        });

        setInitialData({
          saleDate: toDateInputValue(saleWithItems.created_at),
          customerId: saleWithItems.customer_id || "",
          customerName: saleWithItems.customer_name,
          customerPhone: saleWithItems.customer_phone || "",
          customerWhatsapp: saleWithItems.customer_whatsapp || "",
          customerAddress: saleWithItems.customer_address || "",
          additional_info: saleWithItems.additional_info || "",
          cn_number: saleWithItems.cn_number || "",
          courier_name: saleWithItems.courier_name || "",
          paymentMethod: saleWithItems.payment_method,
          paymentStatus: saleWithItems.payment_status,
          payment_terms: saleWithItems.payment_terms || "immediate",
          credit_days: saleWithItems.credit_days ?? undefined,
          due_date: saleWithItems.due_date || null,
          payment_splits: saleWithItems.payment_splits || [],
          amountPaid: saleWithItems.amount_paid,
          discountPercent: saleWithItems.discount_percent,
          discountAmount: saleWithItems.discount_amount,
          charge: saleWithItems.fee || 0,
          items: enrichedItems,
        });
        initialSnapshotRef.current = {
          itemsSignature: buildItemsSignature(enrichedItems),
          subtotal: saleWithItems.subtotal ?? 0,
          discountPercent: saleWithItems.discount_percent ?? 0,
          discountAmount: saleWithItems.discount_amount ?? 0,
          grandTotal: saleWithItems.grand_total ?? 0,
          fee: saleWithItems.fee || 0,
          paymentStatus: saleWithItems.payment_status ?? "pending",
          amountPaid: saleWithItems.amount_paid ?? 0,
          amountDue: saleWithItems.amount_due ?? 0,
        };
        initialDetailsRef.current = {
          invoice_number: saleWithItems.invoice_number ?? null,
          sale_date: saleWithItems.created_at ?? null,
          customer_name: saleWithItems.customer_name ?? null,
          customer_phone: saleWithItems.customer_phone ?? null,
          customer_whatsapp: saleWithItems.customer_whatsapp ?? null,
          customer_address: saleWithItems.customer_address ?? null,
          additional_info: saleWithItems.additional_info ?? null,
          cn_number: saleWithItems.cn_number ?? null,
          courier_name: saleWithItems.courier_name ?? null,
          payment_method: saleWithItems.payment_method ?? null,
          payment_status: saleWithItems.payment_status ?? null,
          payment_terms: saleWithItems.payment_terms ?? "immediate",
          credit_days: saleWithItems.credit_days ?? null,
          due_date: saleWithItems.due_date ?? null,
          subtotal: saleWithItems.subtotal ?? 0,
          discount_percent: saleWithItems.discount_percent ?? 0,
          discount_amount: saleWithItems.discount_amount ?? 0,
          fee: saleWithItems.fee ?? 0,
          grand_total: saleWithItems.grand_total ?? 0,
          amount_paid: saleWithItems.amount_paid ?? 0,
          amount_due: saleWithItems.amount_due ?? 0,
          payment_splits: (saleWithItems.payment_splits || []).map((split: any) => ({
            method: split.method,
            amount: Number(split.amount) || 0,
          })),
          items: enrichedItems,
        };
      } catch (error) {
        console.error("EditSaleDialog: Error loading sale data:", error);
        setError(error instanceof Error ? error.message : "Failed to load sale data");
        toast.error("Failed to load sale data");

        // Don't close dialog on error, let user retry
        // setTimeout(() => {
        //   onOpenChange(false);
        // }, 2000);
      } finally {
        console.log("EditSaleDialog: Loading completed");
        setIsLoading(false);
      }
    };

    loadSaleData();
  }, [open, saleId]); // Removed problematic dependencies

  // Cleanup effect to prevent memory leaks and infinite states
  useEffect(() => {
    if (!open) {
      // Reset all states when dialog closes
      setInitialData(undefined);
      setIsLoading(false);
      setError(null);
    }
  }, [open]);

  // Additional safeguard: reset loading if it takes too long
  useEffect(() => {
    if (isLoading && open) {
      const loadingTimeout = setTimeout(() => {
        if (isLoading) {
          console.warn("Loading timeout - resetting state");
          setIsLoading(false);
          setError("Loading took too long. Please try again.");
        }
      }, 15000); // 15 second timeout

      return () => clearTimeout(loadingTimeout);
    }
  }, [isLoading, open]);

  const handleSubmit = async (data: SaleFormData, calculatedValues: {
    subtotal: number;
    discountAmount: number;
    grandTotal: number;
    amountDue: number;
  }) => {
    if (!saleId) return;

    try {
      const initialDetails = initialDetailsRef.current;
      const initialSaleDateInput = initialDetails?.sale_date
        ? toDateInputValue(initialDetails.sale_date)
        : undefined;
      const saleDateInput = data.saleDate || initialSaleDateInput || "";
      const hasSaleDateChanged = Boolean(
        initialSaleDateInput &&
        saleDateInput &&
        saleDateInput !== initialSaleDateInput
      );
      const saleDateIso = toIsoFromDateInput(saleDateInput, systemSettings.timezone);
      const itemsSignature = buildItemsSignature(data.items);
      const initialSnapshot = initialSnapshotRef.current;
      const shouldUpdateReview = !initialSnapshot
        || initialSnapshot.itemsSignature !== itemsSignature
        || initialSnapshot.subtotal !== calculatedValues.subtotal
        || initialSnapshot.discountPercent !== (data.discountPercent ?? 0)
        || initialSnapshot.discountAmount !== calculatedValues.discountAmount
        || initialSnapshot.grandTotal !== calculatedValues.grandTotal
        || initialSnapshot.fee !== (data.charge || 0)
        || initialSnapshot.paymentStatus !== data.paymentStatus
        || initialSnapshot.amountPaid !== (data.amountPaid ?? 0)
        || initialSnapshot.amountDue !== calculatedValues.amountDue;
      const reviewUpdate = shouldUpdateReview
        ? {
          review_amount_paid: data.amountPaid,
          review_amount_due: calculatedValues.amountDue,
        }
        : {};
      const updateData: UpdateSaleData = {
        id: saleId,
        customer_id: data.customerId,
        customer_name: data.customerName,
        customer_phone: data.customerPhone,
        customer_whatsapp: data.customerWhatsapp,
        customer_address: data.customerAddress,
        additional_info: data.additional_info,
        cn_number: data.cn_number,
        // Sync consignment_id with cn_number:
        // 1. If CN is cleared, consignment_id becomes null -> Icon changes back to Truck (Send to Courier)
        // 2. If CN is updated, consignment_id updates -> Status check uses new CN
        consignment_id: data.cn_number || null,
        // Also clear status if CN is cleared
        courier_status: (data.cn_number || null) ? undefined : null,
        courier_name: data.courier_name,
        subtotal: calculatedValues.subtotal,
        discount_percent: data.discountPercent,
        discount_amount: calculatedValues.discountAmount,
        grand_total: calculatedValues.grandTotal,
        amount_paid: data.amountPaid,
        amount_due: calculatedValues.amountDue,
        payment_method: data.paymentMethod,
        payment_status: data.paymentStatus,
        payment_terms: data.payment_terms || "immediate",
        credit_days: data.credit_days ?? null,
        due_date: data.due_date ?? null,
        payment_splits: data.payment_splits || [],
        fee: data.charge || 0,
        ...reviewUpdate,
        items: data.items.map(item => ({
          id: item.id,
          product_id: item.productId || item.product_id || null,
          product_name: item.productName || item.product_name!,
          product_image_url: item.productImageUrl ?? item.product_image_url ?? null,
          quantity: item.quantity,
          rate: item.rate,
          sale_price: item.salePrice ?? item.sale_price ?? null,
          total: item.total,
          variant_id: (item.variantId || item.variant_id) ?? null,
          variant_image_url: item.variantImageUrl ?? item.variant_image_url ?? null,
        }))
      };

      if (hasSaleDateChanged) {
        updateData.created_at = saleDateIso;
      }

      await updateSale.mutateAsync(updateData);

      const oldItems = initialDetails?.items ?? initialData?.items ?? [];
      const newItems = data.items ?? [];
      const paymentSplitsForLog = buildPaymentSplitsForLog(data.payment_splits);

      await logActivity({
        action: "update",
        entityType: "sales",
        entityId: saleId,
        summary: `Updated sale ${initialDetails?.invoice_number || ""}`.trim(),
        details: {
          old: {
            invoice_number: initialDetails?.invoice_number || null,
            sale_date: initialDetails?.sale_date || null,
            customer_name: initialDetails?.customer_name || null,
            customer_phone: initialDetails?.customer_phone || null,
            customer_whatsapp: initialDetails?.customer_whatsapp || null,
            customer_address: initialDetails?.customer_address || null,
            additional_info: initialDetails?.additional_info || null,
            cn_number: initialDetails?.cn_number || null,
            courier_name: initialDetails?.courier_name || null,
            payment_method: initialDetails?.payment_method || null,
            payment_status: initialDetails?.payment_status || null,
            payment_terms: initialDetails?.payment_terms || null,
            credit_days: initialDetails?.credit_days ?? null,
            due_date: initialDetails?.due_date ?? null,
            subtotal: initialDetails?.subtotal ?? 0,
            discount_percent: initialDetails?.discount_percent ?? 0,
            discount_amount: initialDetails?.discount_amount ?? 0,
            fee: initialDetails?.fee ?? 0,
            grand_total: initialDetails?.grand_total ?? 0,
            amount_paid: initialDetails?.amount_paid ?? 0,
            amount_due: initialDetails?.amount_due ?? 0,
            payment_splits: initialDetails?.payment_splits || [],
            items: buildItemsForLog(oldItems),
          },
          new: {
            invoice_number: initialDetails?.invoice_number || null,
            sale_date: hasSaleDateChanged ? saleDateIso : (initialDetails?.sale_date || null),
            customer_name: data.customerName,
            customer_phone: data.customerPhone || null,
            customer_whatsapp: data.customerWhatsapp || null,
            customer_address: data.customerAddress || null,
            additional_info: data.additional_info || null,
            cn_number: data.cn_number || null,
            courier_name: data.courier_name || null,
            payment_method: data.paymentMethod,
            payment_status: data.paymentStatus,
            payment_terms: data.payment_terms || "immediate",
            credit_days: data.credit_days ?? null,
            due_date: data.due_date ?? null,
            subtotal: calculatedValues.subtotal,
            discount_percent: data.discountPercent,
            discount_amount: calculatedValues.discountAmount,
            fee: data.charge || 0,
            grand_total: calculatedValues.grandTotal,
            amount_paid: data.amountPaid,
            amount_due: calculatedValues.amountDue,
            payment_splits: paymentSplitsForLog,
            items: buildItemsForLog(newItems),
          },
        },
      });
      onOpenChange(false);
    } catch (error) {
      // Error handling is done in the mutation
    }
  };

  // Show error state if there's an error
  if (error) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-full sm:max-w-2xl md:max-w-4xl lg:max-w-6xl">
          <DialogHeader>
            <DialogTitle>Edit Sale - Error</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center p-8 space-y-4">
            <div className="text-center space-y-2">
              <div className="text-destructive text-lg">Failed to load sale data</div>
              <div className="text-muted-foreground">{error}</div>
            </div>
            <div className="flex space-x-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  setError(null);
                  // Trigger reload by toggling open state
                  onOpenChange(false);
                  setTimeout(() => onOpenChange(true), 100);
                }}
              >
                Retry
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <BaseSaleDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Sale"
      isEditing={true}
      initialData={initialData}
      onSubmit={handleSubmit}
      isLoading={isLoading}
    />
  );
};
