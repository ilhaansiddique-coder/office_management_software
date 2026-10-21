import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useUserRole } from "./useUserRole";
import { useMockDataContext } from "@/contexts/MockDataContext";
import { toast } from "@/utils/toast";
import { useEffect } from "react";

export interface Customer {
  id: string;
  name: string;
  alias_names?: string[] | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  tags: string[];
  credit_limit?: number | null;
  credit_used?: number | null;
  order_count: number;
  delivered_count: number;
  returned_count: number;
  pending_count: number;
  cancelled_count: number;
  total_spent: number;
  credit_due: number;
  due_amount: number;
  outstanding_balance: number;
  status: string;
  additional_info: string | null;
  last_purchase_date: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
}

export interface CreateCustomerData {
  name: string;
  alias_names?: string[];
  phone?: string;
  whatsapp?: string;
  address?: string;
  tags?: string[];
  status?: string;
  additional_info?: string;
  credit_limit?: number;
}

export const useCustomers = () => {
  const { user } = useAuth();
  const { isAdmin, hasPermission } = useUserRole();
  const { scaleSalesData } = useMockDataContext();
  const queryClient = useQueryClient();

  // Set up real-time subscriptions for customers and sales
  useEffect(() => {
    if (!user) return;

    const customersChannel = supabase
      .channel('customers-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customers'
        },
        () => {
          // Invalidate customers query when customers table changes
          queryClient.invalidateQueries({ queryKey: ["customers"] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales'
        },
        () => {
          // Invalidate customers query when sales change (affects customer stats)
          queryClient.invalidateQueries({ queryKey: ["customers"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(customersChannel);
    };
  }, [user, queryClient]);

  const {
    data: customers = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data: customersData, error } = await supabase
        .from("customers")
        .select("*")
        .or("is_deleted.eq.false,is_deleted.is.null")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Dynamically compute customer stats from sales to ensure up-to-date values
      // Batch the .in() query to avoid exceeding Supabase URL length limits
      const customerIds = (customersData || []).map((c) => c.id);
      const BATCH_SIZE = 100;
      let salesData: any[] = [];
      for (let i = 0; i < customerIds.length; i += BATCH_SIZE) {
        const batch = customerIds.slice(i, i + BATCH_SIZE);
        const { data, error: salesError } = await supabase
          .from("sales")
          .select("customer_id, grand_total, fee, created_at, payment_status, courier_status, amount_due, review_amount_due, payment_terms, payment_method")
          .or("is_deleted.eq.false,is_deleted.is.null")
          .in("customer_id", batch);
        if (salesError) throw salesError;
        if (data) salesData = salesData.concat(data);
      }
      
      salesData = scaleSalesData(salesData);

      const customerIdToStats: Record<string, {
        orderCount: number;
        deliveredCount: number;
        returnedCount: number;
        pendingCount: number;
        cancelledCount: number;
        totalSpent: number;
        creditDue: number;
        dueAmount: number;
        lastPurchaseDate: string | null;
      }> = {};

      (salesData || []).forEach((sale) => {
        const key = sale.customer_id as string;
        if (!customerIdToStats[key]) {
          customerIdToStats[key] = {
            orderCount: 0,
            deliveredCount: 0,
            returnedCount: 0,
            pendingCount: 0,
            cancelledCount: 0,
            totalSpent: 0,
            creditDue: 0,
            dueAmount: 0,
            lastPurchaseDate: null,
          };
        }

        const stats = customerIdToStats[key];
        stats.orderCount += 1;
        const courierStatus = String((sale as any).courier_status || "").toLowerCase();
        if (courierStatus === "delivered") {
          stats.deliveredCount += 1;
          stats.totalSpent += Math.max(0, (Number(sale.grand_total) || 0) - (Number((sale as any).fee) || 0));
          if (
            !stats.lastPurchaseDate ||
            new Date(sale.created_at) > new Date(stats.lastPurchaseDate)
          ) {
            stats.lastPurchaseDate = sale.created_at as string;
          }
        } else if (courierStatus === "returned") {
          stats.returnedCount += 1;
          stats.cancelledCount += 1;
        } else if (courierStatus === "cancelled" || courierStatus === "lost") {
          stats.cancelledCount += 1;
        } else {
          // Pending = any non-delivered, non-returned, non-cancelled, non-lost status (includes null/not_sent/pending/in_transit)
          stats.pendingCount += 1;
        }

        const rawDue = Number((sale as any).review_amount_due ?? (sale as any).amount_due ?? 0) || 0;
        const dueAmount = Math.max(0, rawDue);
        if (dueAmount > 0 && !["cancelled", "returned", "lost"].includes(courierStatus)) {
          const paymentTerms = String((sale as any).payment_terms || "").toLowerCase();
          const paymentMethod = String((sale as any).payment_method || "").toLowerCase();
          const isCreditDue = paymentTerms === "credit" || paymentMethod === "credit";
          if (isCreditDue) {
            stats.creditDue += dueAmount;
          } else {
            stats.dueAmount += dueAmount;
          }
        }
      });

      const merged = (customersData as Customer[]).map((c) => {
        const s = customerIdToStats[c.id] || {
          orderCount: 0,
          deliveredCount: 0,
          returnedCount: 0,
          pendingCount: 0,
          cancelledCount: 0,
          totalSpent: 0,
          creditDue: 0,
          dueAmount: 0,
          lastPurchaseDate: null,
        };
        return {
          ...c,
          order_count: s.orderCount,
          delivered_count: s.deliveredCount,
          returned_count: s.returnedCount,
          pending_count: s.pendingCount,
          cancelled_count: s.cancelledCount,
          total_spent: s.totalSpent,
          credit_due: s.creditDue,
          due_amount: s.dueAmount,
          outstanding_balance: s.creditDue + s.dueAmount,
          last_purchase_date: s.lastPurchaseDate,
        } as Customer;
      });

      return merged;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: 1000,
  });

  const createCustomer = useMutation({
    mutationFn: async (customerData: CreateCustomerData) => {
      const { data, error } = await supabase
        .from("customers")
        .insert([{ ...customerData }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer created successfully");
    },
    onError: (error) => {
      toast.error("Failed to create customer: " + error.message);
    },
  });

  const updateCustomer = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateCustomerData> }) => {
      const { data: updated, error } = await supabase
        .from("customers")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      toast.success("Customer updated successfully");
    },
    onError: (error) => {
      toast.error("Failed to update customer: " + error.message);
    },
  });

  const deleteCustomer = useMutation({
    mutationFn: async (id: string) => {
      if (!isAdmin && !hasPermission("customers.delete")) {
        throw new Error("You don't have permission to delete customers");
      }

      const { error } = await supabase
        .from("customers")
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) {
        console.error("Error deleting customer:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success("Customer moved to trash");
    },
    onError: (error) => {
      toast.error("Failed to delete customer: " + error.message);
    },
  });

  const restoreCustomer = useMutation({
    mutationFn: async (id: string) => {
      if (!isAdmin && !hasPermission("customers.delete")) {
        throw new Error("You don't have permission to restore customers");
      }
      const { error } = await supabase
        .from("customers")
        .update({
          is_deleted: false,
          deleted_at: null,
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      queryClient.setQueryData(["trash", "customers"], (prev: any) =>
        Array.isArray(prev) ? prev.filter((item) => item?.id !== id) : prev
      );
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["trash", "customers"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success("Customer restored");
    },
    onError: (error) => {
      toast.error("Failed to restore customer: " + error.message);
    },
  });

  const hardDeleteCustomer = useMutation({
    mutationFn: async (id: string) => {
      if (!isAdmin && !hasPermission("customers.delete")) {
        throw new Error("You don't have permission to delete customers");
      }

      const { data: sales, error: fetchSalesError } = await supabase
        .from("sales")
        .select("id")
        .eq("customer_id", id);

      if (fetchSalesError) {
        console.error("Error fetching associated sales:", fetchSalesError);
        throw new Error("Failed to fetch associated sales: " + fetchSalesError.message);
      }

      if (sales && sales.length > 0) {
        const saleIds = sales.map(s => s.id);
        const batchSize = 100;

        for (let i = 0; i < saleIds.length; i += batchSize) {
          const batch = saleIds.slice(i, i + batchSize);
          const { error: salesItemsError } = await supabase
            .from("sales_items")
            .delete()
            .in("sale_id", batch);
          if (salesItemsError) {
            console.error("Error deleting sales_items batch:", salesItemsError);
            throw new Error("Failed to delete associated sales_items: " + salesItemsError.message);
          }

          const { error: saleItemsError } = await supabase
            .from("sale_items")
            .delete()
            .in("sale_id", batch);
          if (saleItemsError) {
            console.warn("Error deleting sale_items (may not exist):", saleItemsError);
          }

          const { error: paymentsError } = await supabase
            .from("sale_payments")
            .delete()
            .in("sale_id", batch);
          if (paymentsError) {
            console.warn("Error deleting sale_payments batch:", paymentsError);
          }
        }

        for (let i = 0; i < saleIds.length; i += batchSize) {
          const batch = saleIds.slice(i, i + batchSize);
          const { error: salesError } = await supabase
            .from("sales")
            .delete()
            .in("id", batch)
            .select("id");
          if (salesError) {
            console.error("Error deleting sales batch:", salesError);
            throw new Error("Failed to delete associated sales: " + salesError.message);
          }
        }
      }

      const { data: deletedCustomer, error } = await supabase
        .from("customers")
        .delete()
        .eq("id", id)
        .select("id");
      if (error) {
        console.error("Error deleting customer:", error);
        throw error;
      }
      if (!deletedCustomer || deletedCustomer.length === 0) {
        throw new Error("Customer not deleted (not found or blocked by RLS)");
      }
    },
    onSuccess: (_data, id) => {
      queryClient.setQueryData(["trash", "customers"], (prev: any) =>
        Array.isArray(prev) ? prev.filter((item) => item?.id !== id) : prev
      );
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["trash", "customers"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success("Customer permanently deleted");
    },
    onError: (error) => {
      toast.error("Failed to permanently delete customer: " + error.message);
    },
  });


  const updateCustomerStats = useMutation({
    mutationFn: async (showNotification: boolean = true) => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      await queryClient.refetchQueries({ queryKey: ["customers"] });
      return { showNotification };
    },
    onSuccess: (_, showNotification) => {
      if (showNotification) {
        toast.success("Customer data refreshed");
      }
    },
    onError: (error) => {
      console.error("Error updating customer statistics:", error);
      toast.error("Failed to update customer statistics: " + error.message);
    },
  });

  return {
    customers,
    isLoading,
    error,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    restoreCustomer,
    hardDeleteCustomer,
    updateCustomerStats: updateCustomerStats.mutate,
    isUpdatingStats: updateCustomerStats.isPending,
  };
};
