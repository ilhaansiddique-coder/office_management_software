import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Check, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from "@/utils/toast";
import { logActivity } from "@/utils/activityLogger";
import { secureStore } from '@/utils/secureStorage';

interface ManualCourierStatusSelectorProps {
  saleId: string;
  currentStatus?: string;
  onStatusUpdate?: (newStatus: string) => void;
  disabled?: boolean;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'dropdown' | 'inline';
}

const COURIER_STATUSES = [
  { value: 'not_sent', label: 'Not Sent', color: 'bg-base-100 text-base-content border-base-300' },
  { value: 'pending', label: 'Pending', color: 'bg-warning/12 text-warning border-warning/35' },
  { value: 'in_review', label: 'In Review', color: 'bg-warning/12 text-warning border-warning/35' },
  { value: 'sent', label: 'Sent', color: 'bg-info/12 text-info border-info/35' },
  { value: 'in_transit', label: 'In Transit', color: 'bg-info/12 text-info border-info/35' },
  { value: 'delivery_ready', label: 'Delivery Ready', color: 'bg-accent/12 text-accent border-accent/35' },
  { value: 'out_for_delivery', label: 'Out for Delivery', color: 'bg-warning/12 text-warning border-warning/35' },
  { value: 'delivered', label: 'Delivered', color: 'bg-success/12 text-success border-success/35' },
  { value: 'payout_ready', label: 'Payout Ready', color: 'bg-secondary/12 text-secondary border-secondary/35' },
  { value: 'returned', label: 'Returned', color: 'bg-error/12 text-error border-error/35' },
  { value: 'lost', label: 'Lost', color: 'bg-error/12 text-error border-error/35' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-error/12 text-error border-error/35' },
];

const CANCELLED_STATUSES = new Set(["cancelled", "returned", "lost"]);

const fetchSaleItemsWithStock = async (saleId: string) => {
  const { data: saleItems, error: itemsError } = await supabase
    .from("sales_items")
    .select("product_id, variant_id, quantity, product_name")
    .eq("sale_id", saleId);

  if (itemsError) throw itemsError;

  const productIds = Array.from(
    new Set((saleItems || []).map((item) => item.product_id).filter(Boolean))
  ) as string[];
  const variantIds = Array.from(
    new Set((saleItems || []).map((item) => item.variant_id).filter(Boolean))
  ) as string[];

  const [productsResult, variantsResult] = await Promise.all([
    productIds.length
      ? supabase
        .from("products")
        .select("id, stock_quantity")
        .in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
    variantIds.length
      ? supabase
        .from("product_variants")
        .select("id, stock_quantity")
        .in("id", variantIds)
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

  return {
    saleItems: saleItems || [],
    productStockMap,
    variantStockMap,
  };
};

const validateInventoryForSale = async (saleId: string) => {
  const { saleItems, productStockMap, variantStockMap } = await fetchSaleItemsWithStock(saleId);

  const insufficient = saleItems.filter((item) => {
    if (item.variant_id) {
      const stock = variantStockMap.get(item.variant_id) ?? 0;
      return item.quantity > stock;
    }
    const stock = productStockMap.get(item.product_id) ?? 0;
    return item.quantity > stock;
  });

  if (insufficient.length > 0) {
    const first = insufficient[0];
    throw new Error(`Insufficient stock for ${first.product_name || "product"}.`);
  }
};

export function ManualCourierStatusSelector({
  saleId,
  currentStatus,
  onStatusUpdate,
  disabled = false,
  size = 'default',
  variant = 'dropdown'
}: ManualCourierStatusSelectorProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(currentStatus || 'not_sent');
  const backupKey = `paymentBackup:${saleId}`;

  useEffect(() => {
    if (currentStatus) {
      setSelectedStatus(currentStatus);
    }
  }, [currentStatus]);

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === currentStatus || isUpdating) return;

    // Optimistic update
    const previousStatus = selectedStatus;
    setSelectedStatus(newStatus);
    setIsUpdating(true);
    try {
      const { data: saleSnapshot, error: saleFetchError } = await supabase
        .from('sales')
        .select('payment_status, amount_paid, amount_due, grand_total, fee, courier_status, status_backup_payment_status, status_backup_amount_paid, status_backup_amount_due, sale_payments(method, amount)')
        .eq('id', saleId)
        .single();

      if (saleFetchError) {
        throw saleFetchError;
      }

      const salePayments = (saleSnapshot.sale_payments || []) as Array<{ method: string; amount: number }>;
      const previousPayment = {
        payment_status: saleSnapshot.payment_status,
        amount_paid: saleSnapshot.amount_paid,
        amount_due: saleSnapshot.amount_due,
      };
      const previousCourierStatus = String(saleSnapshot.courier_status || "");
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

      let paymentUpdate: Record<string, any> = {};
      const currentCourierStatus = String(saleSnapshot.courier_status || "").toLowerCase();
      const currentPaymentStatus = String(saleSnapshot.payment_status || "").toLowerCase();
      const wasCancelled =
        CANCELLED_STATUSES.has(currentCourierStatus) || currentPaymentStatus === "cancelled";
      const willBeCancelled = CANCELLED_STATUSES.has(String(newStatus || "").toLowerCase());
      const isDelivered = ['delivered', 'payout_ready'].includes(newStatus);

      if (wasCancelled && !willBeCancelled) {
        try {
          await validateInventoryForSale(saleId);
        } catch (stockError: any) {
          toast.error("Insufficient stock to reactivate this order.", {
            description: stockError?.message || "Update the item quantities first.",
            duration: 5000,
          });
          setIsUpdating(false);
          return;
        }
      }

      if (isDelivered) {
        const fee = (saleSnapshot as any).fee || 0;
        const currentDue = saleSnapshot.amount_due || 0;

        // Calculate credit part of the due amount
        const creditSplitTotal = salePayments
          .filter(p => (p.method || '').toLowerCase() === 'credit')
          .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

        // Any due amount that is NOT covered by credit splits is considered COD/collectible now
        const codCollectible = Math.max(0, currentDue - creditSplitTotal - fee);

        const backupUpdate = !hasStatusBackup
          ? {
            status_backup_payment_status: previousPayment.payment_status,
            status_backup_amount_paid: previousPayment.amount_paid ?? 0,
            status_backup_amount_due: previousPayment.amount_due ?? 0,
          }
          : {};

        const newAmountPaid = Math.max(0, (previousPayment.amount_paid || 0) + codCollectible);
        const newAmountDue = Math.max(0, currentDue - codCollectible);

        paymentUpdate = {
          payment_status: newAmountDue > 0 ? 'partial' : 'paid',
          amount_paid: newAmountPaid,
          amount_due: newAmountDue,
          ...backupUpdate,
        };

        if (allowLocalFallback && !secureStore.hasItem(backupKey)) {
          secureStore.setItem(backupKey, previousPayment);
        }
      } else {
        if (hasStatusBackup) {
          paymentUpdate = {
            payment_status: statusBackup.payment_status,
            amount_paid: statusBackup.amount_paid,
            amount_due: statusBackup.amount_due,
            status_backup_payment_status: null,
            status_backup_amount_paid: null,
            status_backup_amount_due: null,
          };
        } else if (allowLocalFallback) {
          const backup = secureStore.getItem<{ payment_status: string; amount_paid: number; amount_due: number }>(backupKey);
          if (backup) {
            paymentUpdate = {
              payment_status: backup.payment_status,
              amount_paid: backup.amount_paid,
              amount_due: backup.amount_due,
            };
          }
        }
      }

      if (!Object.keys(paymentUpdate).length) {
        if (['returned', 'cancelled'].includes(newStatus)) {
          paymentUpdate = { payment_status: 'cancelled' };
        } else if (newStatus === 'lost') {
          paymentUpdate = { payment_status: 'cancelled', amount_paid: 0, amount_due: 0 };
        } else if (newStatus === 'delivered') {
          paymentUpdate = { payment_status: 'paid' };
        } else {
          paymentUpdate = { payment_status: 'pending' };
        }
      }

      // Update the sale in the database
      const { error } = await supabase
        .from('sales')
        .update({
          courier_status: newStatus,
          order_status: newStatus, // Keep for backward compatibility
          last_status_check: new Date().toISOString(),
          ...paymentUpdate,
        })
        .eq('id', saleId);

      if (error) {
        throw error;
      }

      secureStore.removeItem(backupKey);
      if (!isDelivered) {
        secureStore.removeItem(backupKey);
      }

      // Log the status change
      await supabase
        .from('courier_status_logs')
        .insert({
          sale_id: saleId,
          status: newStatus,
          notes: `Manually updated from ${currentStatus || 'unknown'} to ${newStatus}`,
          updated_by: 'manual',
          updated_at: new Date().toISOString()
        });

      // Prepare log details with credit breakdown
      const getLogDetails = (
        status: string | null,
        pStatus: string | null,
        paid: number,
        due: number,
        splits: Array<{ method: string; amount: number }>
      ) => {
        const creditTotal = splits
          .filter(p => (p.method || '').toLowerCase() === 'credit')
          .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

        const hasCredit = creditTotal > 0;

        const base = {
          courier_status: status,
          payment_status: pStatus,
          amount_paid: paid,
          payment_splits: splits
        };

        if (hasCredit) {
          const creditDue = Math.min(due, creditTotal);
          const codDue = Math.max(0, due - creditDue);
          return {
            ...base,
            credit_amount: creditTotal,
            credit_due: creditDue,
            cod_due: codDue,
          };
        }

        return {
          ...base,
          amount_due: due,
        };
      };

      await logActivity({
        action: "update_status",
        entityType: "sales",
        entityId: saleId,
        summary: `Updated sale status to ${newStatus}`,
        details: {
          old: getLogDetails(
            previousCourierStatus || null,
            previousPayment.payment_status || null,
            previousPayment.amount_paid ?? 0,
            previousPayment.amount_due ?? 0,
            salePayments
          ),
          new: getLogDetails(
            newStatus,
            paymentUpdate.payment_status ?? previousPayment.payment_status ?? null,
            paymentUpdate.amount_paid ?? previousPayment.amount_paid ?? 0,
            paymentUpdate.amount_due ?? previousPayment.amount_due ?? 0,
            salePayments
          ),
        },
      });

      toast.success(`Status updated to ${COURIER_STATUSES.find(s => s.value === newStatus)?.label}`, {
        description: `Order status has been manually updated`,
        duration: 3000,
      });

      if (onStatusUpdate) {
        onStatusUpdate(newStatus);
      }

    } catch (error) {
      console.error('Error updating courier status:', error);
      toast.error('Failed to update status', {
        description: 'Please try again or contact support',
        duration: 5000,
      });
      // Revert optimistic update
      setSelectedStatus(previousStatus);
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusColor = (status: string) => {
    return COURIER_STATUSES.find(s => s.value === status)?.color || 'bg-base-100 text-base-content border-base-300';
  };

  const getStatusLabel = (status: string) => {
    return COURIER_STATUSES.find(s => s.value === status)?.label || status.replace('_', ' ').toUpperCase();
  };

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-2">
        <Select
          value={selectedStatus}
          onValueChange={handleStatusChange}
          disabled={disabled || isUpdating}
        >
          <SelectTrigger className={cn(
            "w-auto min-w-[120px] whitespace-nowrap",
            size === 'sm' && "h-8 text-xs min-w-[110px]",
            size === 'lg' && "h-12 text-base"
          )}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COURIER_STATUSES.map((status) => (
              <SelectItem key={status.value} value={status.value} className="pl-2 pr-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn("text-xs", status.color)}
                  >
                    {status.label}
                  </Badge>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isUpdating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Status:</span>
        <Badge
          variant="outline"
          className={cn("text-sm", getStatusColor(selectedStatus))}
        >
          {getStatusLabel(selectedStatus)}
        </Badge>
        {isUpdating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <Select
        value={selectedStatus}
        onValueChange={handleStatusChange}
        disabled={disabled || isUpdating}
      >
        <SelectTrigger className={cn(
          "w-full",
          size === 'sm' && "h-8 text-xs",
          size === 'lg' && "h-12 text-base"
        )}>
          <SelectValue placeholder="Select status" />
        </SelectTrigger>
        <SelectContent>
          {COURIER_STATUSES.map((status) => (
            <SelectItem key={status.value} value={status.value}>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn("text-xs", status.color)}
                >
                  {status.label}
                </Badge>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
