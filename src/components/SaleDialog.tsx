import { useEffect, useState } from "react";
import { useSales } from "@/hooks/useSales";
import { BaseSaleDialog, type SaleFormData } from "./BaseSaleDialog";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { toIsoFromDateInput } from "@/lib/time";
import { logActivity } from "@/utils/activityLogger";
import { generateUUID } from "@/lib/uuid";

interface SaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SaleDialog = ({ open, onOpenChange }: SaleDialogProps) => {
  const { createSale } = useSales();
  const [draftSaleId, setDraftSaleId] = useState(() => generateUUID());
  const { systemSettings } = useSystemSettings();

  const buildItemsForLog = (items: SaleFormData["items"]) =>
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

  useEffect(() => {
    if (open) {
      setDraftSaleId(generateUUID());
    }
  }, [open]);

  const handleSubmit = async (data: SaleFormData, calculatedValues: {
    subtotal: number;
    discountAmount: number;
    grandTotal: number;
    amountDue: number;
  }) => {
    try {
      const saleItemsForLog = buildItemsForLog(data.items);
      const paymentSplitsForLog = buildPaymentSplitsForLog(data.payment_splits);
      const saleDateIso = toIsoFromDateInput(data.saleDate, systemSettings.timezone);
      const salePayload = {
        id: draftSaleId,
        customer_id: data.customerId || null,
        customer_name: data.customerName,
        customer_phone: data.customerPhone || null,
        customer_whatsapp: data.customerWhatsapp || null,
        customer_address: data.customerAddress || null,
        additional_info: data.additional_info || null,
        cn_number: data.cn_number || null,
        courier_name: data.courier_name || null,
        payment_method: data.paymentMethod,
        payment_status: data.paymentStatus,
        payment_terms: data.payment_terms || 'immediate',
        credit_days: data.credit_days,
        due_date: data.due_date,
        amount_paid: data.amountPaid,
        review_amount_paid: data.amountPaid,
        payment_splits: data.payment_splits || [],
        discount_percent: data.discountPercent,
        discount_amount: calculatedValues.discountAmount,
        fee: data.charge || 0,
        subtotal: calculatedValues.subtotal,
        grand_total: calculatedValues.grandTotal,
        amount_due: calculatedValues.amountDue,
        review_amount_due: calculatedValues.amountDue,
        created_at: saleDateIso,
        items: data.items.map(item => ({
          product_id: item.productId || item.product_id!,
          product_name: item.productName || item.product_name!,
          quantity: item.quantity,
          rate: item.rate,
          sale_price: item.salePrice ?? item.sale_price ?? null,
          total: item.total,
          variant_id: (item.variantId || item.variant_id) ?? null,
        })),
      };

      const createdSale = await createSale.mutateAsync(salePayload);

      await logActivity({
        action: "insert",
        entityType: "sales",
        entityId: createdSale?.id || draftSaleId,
        summary: `Created sale ${createdSale?.invoice_number || ""}`.trim(),
        details: {
          new: {
            invoice_number: createdSale?.invoice_number || null,
            sale_date: saleDateIso,
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
            items: saleItemsForLog,
          },
        },
      });

      onOpenChange(false);
    } catch (error) {
      console.error("Error creating sale:", error);
      throw error;
    }
  };

  return (
    <BaseSaleDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create New Sale"
      isEditing={false}
      enableDraft
      draftStorageKey="sales:new-sale:draft:v1"
      onSubmit={handleSubmit}
    />
  );
};
