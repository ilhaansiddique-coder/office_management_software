import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from "@/utils/toast";

export function useCustomerStatusUpdate() {
  const queryClient = useQueryClient();

  const updateCustomerStatus = useMutation({
    mutationFn: async () => {
      // Call the database function to update customer status
      const { error } = await supabase.rpc('update_customer_status_based_on_purchases');
      
      if (error) {
        throw error;
      }
    },
    onSuccess: () => {
      // Invalidate and refetch customer data
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Customer statuses updated successfully');
    },
    onError: (error: any) => {
      console.error('Error updating customer status:', error);
      toast.error('Failed to update customer statuses: ' + error.message);
    },
  });

  const bulkUpdateCustomerStatus = useMutation({
    mutationFn: async () => {
      // First, get all customers with their last purchase dates
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('customer_id, created_at, payment_status, courier_status')
        .not('customer_id', 'is', null);

      if (salesError) {
        throw salesError;
      }

      // Get all customers
      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('id, status');

      if (customersError) {
        throw customersError;
      }

      // Calculate last purchase for each customer
      const customerLastPurchase = new Map();
      
      salesData?.forEach(sale => {
        // Only consider successful purchases
        if (sale.payment_status === 'cancelled' || 
            ['cancelled', 'returned', 'lost'].includes(sale.courier_status)) {
          return;
        }

        const customerId = sale.customer_id;
        const saleDate = new Date(sale.created_at);
        
        if (!customerLastPurchase.has(customerId) || 
            customerLastPurchase.get(customerId) < saleDate) {
          customerLastPurchase.set(customerId, saleDate);
        }
      });

      // Update customer statuses based on logic
      const now = new Date();
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

      const updates = [];

      customers?.forEach(customer => {
        const lastPurchase = customerLastPurchase.get(customer.id);
        let newStatus = 'inactive'; // Default status

        if (lastPurchase) {
          if (lastPurchase >= oneMonthAgo) {
            newStatus = 'active';
          } else if (lastPurchase >= threeMonthsAgo) {
            newStatus = 'neutral';
          } else if (lastPurchase < sixMonthsAgo) {
            newStatus = 'inactive';
          } else {
            newStatus = 'neutral';
          }
        } else {
          // No purchases - set to inactive
          newStatus = 'inactive';
        }

        // Only update if status has changed
        if (customer.status !== newStatus) {
          updates.push({
            id: customer.id,
            status: newStatus
          });
        }
      });

      // Perform bulk updates
      if (updates.length > 0) {
        const updatePromises = updates.map(update => 
          supabase
            .from('customers')
            .update({ status: update.status })
            .eq('id', update.id)
        );

        const results = await Promise.all(updatePromises);
        
        // Check for errors
        for (const result of results) {
          if (result.error) {
            throw result.error;
          }
        }
      }

      return { updatedCount: updates.length, totalCustomers: customers?.length || 0 };
    },
    onSuccess: (data) => {
      // Invalidate and refetch customer data
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success(`Updated ${data.updatedCount} of ${data.totalCustomers} customer statuses`);
    },
    onError: (error: any) => {
      console.error('Error updating customer status:', error);
      toast.error('Failed to update customer statuses: ' + error.message);
    },
  });

  return {
    updateCustomerStatus: updateCustomerStatus.mutate,
    bulkUpdateCustomerStatus: bulkUpdateCustomerStatus.mutate,
    isUpdating: updateCustomerStatus.isPending || bulkUpdateCustomerStatus.isPending,
  };
}
