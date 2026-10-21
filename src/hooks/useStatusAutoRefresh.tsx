import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const COURIER_SYNC_DEVICE_KEY = 'courier_sync_device_id';

const getCourierSyncDeviceId = () => {
  if (typeof window === 'undefined') return 'server';

  const existing = window.localStorage.getItem(COURIER_SYNC_DEVICE_KEY);
  if (existing) return existing;

  const nextId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  window.localStorage.setItem(COURIER_SYNC_DEVICE_KEY, nextId);
  return nextId;
};

const buildCourierSyncSlotKey = (now: Date, intervalMinutes: number) => {
  const effectiveIntervalMinutes = Math.max(intervalMinutes || 180, 1);
  const intervalMs = effectiveIntervalMinutes * 60 * 1000;
  const slotStartMs = Math.floor(now.getTime() / intervalMs) * intervalMs;
  return `courier-sync:${effectiveIntervalMinutes}:${new Date(slotStartMs).toISOString()}`;
};

const isMissingCourierSyncRpcError = (error: unknown) => {
  const rpcError = error as { code?: string; message?: string; details?: string } | null;
  const combinedMessage = `${rpcError?.message || ''} ${rpcError?.details || ''}`.toLowerCase();

  return rpcError?.code === 'PGRST202' && combinedMessage.includes('claim_courier_sync_run');
};

// Function to restore inventory when an order is cancelled
const restoreInventoryForCancelledOrder = async (saleId: string) => {
  try {
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .select('inventory_restored')
      .eq('id', saleId)
      .single();

    if (saleError) {
      console.error('Error fetching sale restore flag:', saleError);
      return;
    }

    if (sale?.inventory_restored) {
      console.log(`Inventory already restored for sale ${saleId}`);
      return;
    }

    // Get sale items
    const { data: saleItems, error: itemsError } = await supabase
      .from('sales_items')
      .select('*')
      .eq('sale_id', saleId);

    if (itemsError) {
      console.error('Error fetching sale items:', itemsError);
      return;
    }

    if (!saleItems || saleItems.length === 0) {
      console.log('No sale items found for cancelled order');
      return;
    }

    console.log('Restoring inventory for cancelled order items:', saleItems);

    // Restore inventory for each item
    for (const item of saleItems) {
      if (item.variant_id) {
        // Restore variant inventory
        const { data: currentVariant, error: getVariantError } = await supabase
          .from('product_variants')
          .select('stock_quantity')
          .eq('id', item.variant_id)
          .single();

        if (getVariantError) {
          console.error('Error getting variant current stock:', getVariantError);
          continue;
        }

        const { error: variantError } = await supabase
          .from('product_variants')
          .update({
            stock_quantity: (currentVariant.stock_quantity || 0) + item.quantity
          })
          .eq('id', item.variant_id);

        if (variantError) {
          console.error('Error restoring variant inventory:', variantError);
        } else {
          console.log(`Restored ${item.quantity} units to variant ${item.variant_id}`);
        }

        // Log inventory change
        await supabase
          .from('inventory_logs')
          .insert({
            product_id: item.product_id,
            variant_id: item.variant_id,
            type: 'restore_cancellation',
            quantity: item.quantity,
            reason: `Restored due to order cancellation (Sale ID: ${saleId})`
          });
      } else {
        // Restore product inventory
        const { data: currentProduct, error: getProductError } = await supabase
          .from('products')
          .select('stock_quantity')
          .eq('id', item.product_id)
          .single();

        if (getProductError) {
          console.error('Error getting product current stock:', getProductError);
          continue;
        }

        const { error: productError } = await supabase
          .from('products')
          .update({
            stock_quantity: (currentProduct.stock_quantity || 0) + item.quantity
          })
          .eq('id', item.product_id);

        if (productError) {
          console.error('Error restoring product inventory:', productError);
        } else {
          console.log(`Restored ${item.quantity} units to product ${item.product_id}`);
        }

        // Log inventory change
        await supabase
          .from('inventory_logs')
          .insert({
            product_id: item.product_id,
            type: 'restore_cancellation',
            quantity: item.quantity,
            reason: `Restored due to order cancellation (Sale ID: ${saleId})`
          });
      }
    }

    const { error: flagError } = await supabase
      .from('sales')
      .update({ inventory_restored: true })
      .eq('id', saleId);

    if (flagError) {
      console.error('Error updating inventory restore flag:', flagError);
    }

    console.log('Inventory restoration completed for cancelled order');
  } catch (error) {
    console.error('Error restoring inventory for cancelled order:', error);
  }
};

export const useStatusAutoRefresh = () => {
  const queryClient = useQueryClient();

  // Auto refresh courier status based on user-configured interval
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    let currentIntervalMinutes: number | null = null;
    let warnedMissingSyncRpc = false;

    const setupAutoRefresh = async (refreshIntervalMinutes: number) => {
      // Clear existing interval if settings changed
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log('Cleared previous auto-refresh interval');
      }

      // If interval is 0, auto-refresh is disabled
      if (refreshIntervalMinutes === 0) {
        console.log('Auto-refresh is disabled by user settings');
        currentIntervalMinutes = 0;
        return;
      }

      console.log(`Auto-refresh enabled: checking every ${refreshIntervalMinutes} minutes`);
      currentIntervalMinutes = refreshIntervalMinutes;

      // Convert minutes to milliseconds
      const refreshIntervalMs = refreshIntervalMinutes * 60 * 1000;

      const performRefresh = async () => {
        const deviceId = getCourierSyncDeviceId();
        const slotKey = buildCourierSyncSlotKey(new Date(), refreshIntervalMinutes);
        let claimedRunId: string | null = null;

        try {
          const { data: claimRows, error: claimError } = await supabase.rpc('claim_courier_sync_run', {
            p_slot_key: slotKey,
            p_interval_minutes: refreshIntervalMinutes,
            p_device_id: deviceId,
          });

          if (claimError) {
            if (isMissingCourierSyncRpcError(claimError)) {
              if (!warnedMissingSyncRpc) {
                console.warn(
                  'Courier sync coordination RPC is missing; falling back to direct client sync until migration 202603060004 is applied.',
                );
                warnedMissingSyncRpc = true;
              }
            } else {
              console.error('Failed to claim courier sync slot:', claimError);
              return;
            }
          } else {
            const claimRow = Array.isArray(claimRows) ? claimRows[0] : null;
            if (!claimRow?.should_run) {
              console.log(`Courier sync skipped for slot ${slotKey}: ${claimRow?.run_status || 'already handled'}`);
              return;
            }

            claimedRunId = claimRow.run_id || null;
          }

          // Get all sales with consignment IDs
          const { data: salesWithTracking } = await supabase
            .from('sales')
            .select('id, consignment_id, courier_name, courier_status')
            .not('consignment_id', 'is', null)
            .neq('courier_status', 'delivered')
            .neq('courier_status', 'returned')
            .neq('courier_status', 'lost')
            .neq('courier_status', 'cancelled');

          if (!salesWithTracking || salesWithTracking.length === 0) {
            if (claimedRunId) {
              await supabase.rpc('finish_courier_sync_run', {
                p_run_id: claimedRunId,
                p_device_id: deviceId,
                p_status: 'completed',
                p_processed_count: 0,
                p_error_message: null,
              });
            }
            return;
          }

          // Check if status check is configured (avoid pulling secrets to the client)
          const { data: webhookData } = await supabase
            .from('courier_webhook_settings')
            .select('status_check_webhook_url, is_active, steadfast_api_key, steadfast_secret_key')
            .limit(1);

          const webhookSettings = webhookData?.[0];

          // Refresh status for each sale
          for (const sale of salesWithTracking) {
            try {
              const isSteadfast = sale.courier_name === 'Steadfast';
              const isPathao = sale.courier_name === 'Pathao';
              const isSundorban = sale.courier_name === 'Sundorban';
              const isJanani = sale.courier_name === 'Janani' || sale.courier_name === 'Janani Express';

              // Skip if not a supported courier and no webhook configured
              if (!isSteadfast && !isPathao && !isSundorban && !isJanani) {
                if (!webhookSettings?.status_check_webhook_url || !webhookSettings.is_active) continue;
              }

              // Call Steadfast API directly to avoid JWT issues
              let response: Response | null = null;
              let result: any = null;

              if (isSteadfast) {
                const steadfastApiKey = String(webhookSettings?.steadfast_api_key || '').trim();
                const steadfastSecretKey = String(webhookSettings?.steadfast_secret_key || '').trim();
                if (!steadfastApiKey || !steadfastSecretKey) {
                  console.error('Steadfast credentials not configured');
                  continue;
                }

                response = await fetch(
                  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/steadfast-status-check`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                    },
                    body: JSON.stringify({
                      consignment_id: sale.consignment_id,
                      api_key: steadfastApiKey,
                      secret_key: steadfastSecretKey,
                    }),
                  }
                );
              } else if (isSundorban) {
                response = await fetch(
                  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sundorban-status-check`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                    },
                    body: JSON.stringify({
                      cn_number: sale.consignment_id,
                    }),
                  }
                );
              } else if (isJanani) {
                response = await fetch(
                  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/janani-status-check`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                    },
                    body: JSON.stringify({
                      cn_number: sale.consignment_id,
                    }),
                  }
                );
              } else if (isPathao) {
                response = await fetch(
                  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pathao-status-check`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                    },
                    body: JSON.stringify({
                      consignment_id: sale.consignment_id,
                    }),
                  }
                );
              } else {
                // For other couriers, use generic Edge Function
                const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
                if (sessionError || !sessionData.session?.access_token) {
                  console.error('Missing auth token for status check');
                  continue;
                }

                response = await fetch(
                  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/courier-status-check`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${sessionData.session.access_token}`,
                    },
                    body: JSON.stringify({ consignment_id: sale.consignment_id }),
                  }
                );
              }

              if (response && response.ok) {
                result = await response.json();
                console.log('Status check response:', result);

                // Handle the specific response format
                let newCourierStatus = 'pending';

                if (isSteadfast) {
                  // Steadfast API returns delivery_status directly
                  newCourierStatus = result.delivery_status || 'pending';
                } else if (isPathao) {
                  // Pathao edge function returns mapped_status
                  newCourierStatus = result.mapped_status || 'pending';
                } else if (isSundorban || isJanani) {
                  // Sundorban and Janani edge functions return delivery_status
                  newCourierStatus = result.delivery_status || result.mapped_status || 'pending';
                } else {
                  const payload = result?.webhook_response ?? result;

                  if (Array.isArray(payload) && payload.length > 0) {
                    // Format: [{ "type": "success", "code": 200, "data": { "order_status": "..." } }]
                    const firstResponse = payload[0];
                    if (firstResponse.type === 'success' && firstResponse.data) {
                      newCourierStatus = firstResponse.data.order_status || 'pending';
                    }
                  } else if (payload.data && payload.data.order_status) {
                    // Fallback format: { "data": { "order_status": "..." } }
                    newCourierStatus = payload.data.order_status;
                  } else if (payload.order_status) {
                    // Direct format: { "order_status": "..." }
                    newCourierStatus = payload.order_status;
                  } else if (payload.status) {
                    // Legacy format: { "status": "..." }
                    newCourierStatus = payload.status;
                  } else if (payload.courier_status) {
                    // Legacy format: { "courier_status": "..." }
                    newCourierStatus = payload.courier_status;
                  }
                }

                console.log('Extracted courier status:', newCourierStatus);

                // Normalize status for consistent display
                const normalizedStatus = newCourierStatus.toLowerCase().replace(/[^a-z0-9]/g, '_');

                // Get current user-set status to respect user choices
                const currentStatus = String(sale.courier_status || '').toLowerCase();
                const userSetNotSentOrSent = ['not_sent', 'sent'].includes(currentStatus);
                const userSetCancelledType = ['cancelled', 'returned', 'lost'].includes(currentStatus);
                const userSetDelivered = currentStatus === 'delivered';

                let displayStatus = newCourierStatus;

                // If already delivered, keep it delivered (final status)
                if (userSetDelivered) {
                  displayStatus = 'delivered';
                }
                // Steadfast status mapping with user preference preservation:
                // In review / Unknown → not_sent/sent (don't change if user already set one of these)
                // Pending → sent (don't change if user already set it)
                // Delivered → delivered (always set, and keep if already set)
                // Cancelled types → cancelled/returned/lost (don't change if user already set any of these)
                else if (normalizedStatus === 'in_review' || normalizedStatus === 'unknown' || normalizedStatus === '') {
                  // Keep user's choice if they set not_sent or sent, otherwise default to not_sent
                  displayStatus = userSetNotSentOrSent ? currentStatus : 'not_sent';
                } else if (normalizedStatus === 'pending') {
                  // Keep user's choice if they already set sent
                  displayStatus = currentStatus === 'sent' ? 'sent' : 'sent';
                } else if (normalizedStatus.includes('pickup_cancelled') || normalizedStatus.includes('pickup_cancel') || normalizedStatus.includes('cancelled')) {
                  // Keep user's choice if they set cancelled, returned, or lost
                  displayStatus = userSetCancelledType ? currentStatus : 'cancelled';
                } else if (normalizedStatus.includes('delivery_ready') || normalizedStatus === 'delivery_ready' ||
                           normalizedStatus.includes('ready_for_delivery') || normalizedStatus === 'ready_for_delivery') {
                  // Parcel ready for customer pickup (Sundorban/Janani don't do home delivery)
                  displayStatus = 'delivery_ready';
                } else if (normalizedStatus.includes('in_transit') || normalizedStatus.includes('picked_up')) {
                  displayStatus = 'in_transit';
                } else if (normalizedStatus.includes('out_for_delivery')) {
                  displayStatus = 'out_for_delivery';
                } else if (normalizedStatus.includes('delivered') || normalizedStatus.includes('completed')) {
                  displayStatus = 'delivered';
                } else if (normalizedStatus.includes('returned')) {
                  // Keep user's choice if they set cancelled, returned, or lost
                  displayStatus = userSetCancelledType ? currentStatus : 'returned';
                } else {
                  // Default: unknown/unrecognized statuses → not_sent
                  displayStatus = userSetNotSentOrSent ? currentStatus : 'not_sent';
                }

                console.log('Normalized display status:', { original: newCourierStatus, normalized: normalizedStatus, current: currentStatus, display: displayStatus });

                // Check if status actually changed
                const previousStatus = sale.courier_status || 'not_sent';
                const hasStatusChanged = displayStatus !== previousStatus;

                if (hasStatusChanged) {
                  // Map courier status to payment status only if status changed
                  let paymentStatusUpdate = {} as { payment_status: 'paid' | 'cancelled' | 'pending' };
                  if (normalizedStatus.includes('delivered') || normalizedStatus.includes('completed') ||
                    normalizedStatus.includes('payout_ready')) {
                    paymentStatusUpdate = { payment_status: 'paid' };
                    console.log('Auto-refresh: Setting payment status to: paid');
                  } else if (normalizedStatus.includes('returned') || normalizedStatus.includes('lost') ||
                    normalizedStatus.includes('cancelled') || normalizedStatus.includes('pickup_cancelled') ||
                    normalizedStatus.includes('pickup_cancel')) {
                    paymentStatusUpdate = { payment_status: 'cancelled' };
                    console.log('Auto-refresh: Setting payment status to: cancelled');
                  } else {
                    paymentStatusUpdate = { payment_status: 'pending' };
                    console.log('Auto-refresh: Setting payment status to: pending');
                  }

                  console.log('Auto-refresh: Payment status update object:', paymentStatusUpdate);

                  // Update the sale in database with status change
                  await supabase
                    .from('sales')
                    .update({
                      courier_status: displayStatus,
                      order_status: displayStatus,
                      last_status_check: new Date().toISOString(),
                      ...paymentStatusUpdate
                    })
                    .eq('id', sale.id);

                  // If order is cancelled or returned via auto-refresh, restore inventory
                  // But ONLY if the previous status was NOT already cancelled/returned/lost (to prevent double restoration)
                  const previousWasCancelledType = ['cancelled', 'returned', 'lost'].includes(previousStatus.toLowerCase());
                  if ((displayStatus === 'cancelled' || displayStatus === 'returned') && !previousWasCancelledType) {
                    console.log(`Order ${displayStatus} via auto-refresh, restoring inventory...`);
                    await restoreInventoryForCancelledOrder(sale.id);
                  } else if (displayStatus === 'cancelled' || displayStatus === 'returned') {
                    console.log(`Order already had cancelled-type status (${previousStatus}), skipping inventory restore`);
                  }
                } else {
                  // If status same, just update timestamp
                  console.log(`Status unchanged for sale ${sale.id} (${displayStatus}), updating timestamp only.`);
                  await supabase
                    .from('sales')
                    .update({
                      last_status_check: new Date().toISOString()
                    })
                    .eq('id', sale.id);
                }
              }
            } catch (error) {
              console.error(`Failed to refresh status for sale ${sale.id}:`, error);
            }

            // Add delay between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          // Refresh sales data in UI
          queryClient.invalidateQueries({ queryKey: ["sales"] });

          console.log(`Auto-refreshed ${salesWithTracking.length} order statuses`);

          if (claimedRunId) {
            await supabase.rpc('finish_courier_sync_run', {
              p_run_id: claimedRunId,
              p_device_id: deviceId,
              p_status: 'completed',
              p_processed_count: salesWithTracking.length,
              p_error_message: null,
            });
          }
        } catch (error) {
          console.error('Error in auto-refresh:', error);
          if (claimedRunId) {
            await supabase.rpc('finish_courier_sync_run', {
              p_run_id: claimedRunId,
              p_device_id: deviceId,
              p_status: 'failed',
              p_processed_count: 0,
              p_error_message: error instanceof Error ? error.message : 'Unknown auto-refresh error',
            });
          }
        }
      };

      // Perform initial refresh
      await performRefresh();

      // Set up interval for subsequent refreshes
      intervalId = setInterval(performRefresh, refreshIntervalMs);
    };

    // Initial setup - fetch current settings
    const initializeAutoRefresh = async () => {
      try {
        const { data: webhookData } = await supabase
          .from('courier_webhook_settings')
          .select('auto_refresh_interval_minutes')
          .limit(1);

        const refreshIntervalMinutes = webhookData?.[0]?.auto_refresh_interval_minutes ?? 180;
        await setupAutoRefresh(refreshIntervalMinutes);
      } catch (error) {
        console.error('Error initializing auto-refresh:', error);
      }
    };

    // Subscribe to settings changes for real-time updates
    const settingsSubscription = supabase
      .channel('courier_settings_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'courier_webhook_settings'
        },
        async (payload: any) => {
          console.log('Courier settings updated, adjusting auto-refresh...');
          const newInterval = payload.new.auto_refresh_interval_minutes ?? 180;

          // Only restart if interval actually changed
          if (newInterval !== currentIntervalMinutes) {
            console.log(`Interval changed from ${currentIntervalMinutes} to ${newInterval} minutes`);
            await setupAutoRefresh(newInterval);
          }
        }
      )
      .subscribe();

    // Initialize
    initializeAutoRefresh();

    // Cleanup function
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
        console.log('Auto-refresh interval cleared on unmount');
      }
      settingsSubscription.unsubscribe();
      console.log('Settings subscription unsubscribed');
    };
  }, [queryClient]);

  return null;
};
