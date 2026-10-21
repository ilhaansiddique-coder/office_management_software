import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface SalesItemWithSale {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  rate: number;
  sale_price?: number | null;
  total: number;
  sale_id: string;
  created_at: string;
  sales: {
    created_at: string;
    customer_id: string;
  };
}

export const useSalesItems = (startDate?: Date, endDate?: Date) => {
  const { user } = useAuth();

  const {
    data: salesItems = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["salesItems", startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("sales_items")
        .select(`
          *,
          sales!inner(created_at, customer_id)
        `);

      if (startDate && endDate) {
        query = query
          .gte("sales.created_at", startDate.toISOString())
          .lte("sales.created_at", endDate.toISOString());
      }
      query = query.eq("sales.is_deleted", false);

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) throw error;
      return data as SalesItemWithSale[];
    },
    enabled: !!user,
  });

  return {
    salesItems,
    isLoading,
    error,
  };
};
