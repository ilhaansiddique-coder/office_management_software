-- Fix: Update adjust_stock_on_sales_status trigger to set inventory_restored flag
-- This prevents double stock restoration when both DB trigger and client-side code run.

CREATE OR REPLACE FUNCTION public.adjust_stock_on_sales_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  old_inactive boolean;
  new_inactive boolean;
  old_should_restore boolean;
  new_should_restore boolean;
  -- Statuses that deactivate a sale (stock already deducted, no longer fulfillable)
  inactive_statuses text[] := array['cancelled','returned','lost'];
  -- Statuses that should restore stock (lost = product is gone, no restore)
  restore_statuses text[] := array['cancelled','returned'];
  rec record;
  delta int;
begin
  old_inactive := (old.payment_status = 'cancelled')
    or (old.courier_status = any(inactive_statuses));
  new_inactive := (new.payment_status = 'cancelled')
    or (new.courier_status = any(inactive_statuses));

  -- Only proceed if active/inactive state actually changed
  if old_inactive = new_inactive then
    return new;
  end if;

  -- Determine if stock should be restored (not for 'lost' — product is gone)
  old_should_restore := (old.payment_status = 'cancelled')
    or (old.courier_status = any(restore_statuses));
  new_should_restore := (new.payment_status = 'cancelled')
    or (new.courier_status = any(restore_statuses));

  for rec in
    select product_id, variant_id, quantity
    from public.sales_items
    where sale_id = new.id
  loop
    if not old_inactive and new_should_restore then
      delta := rec.quantity;         -- restore stock (cancelled/returned, not lost)
    elsif not old_inactive and new_inactive and not new_should_restore then
      delta := 0;                    -- lost: don't restore stock
    elsif old_inactive and not new_inactive and old_should_restore then
      delta := -rec.quantity;        -- reactivating from cancelled/returned: deduct stock
    elsif old_inactive and not new_inactive and not old_should_restore then
      delta := 0;                    -- reactivating from lost: don't deduct (was never restored)
    else
      delta := 0;
    end if;

    if delta <> 0 then
      update public.products
        set stock_quantity = coalesce(stock_quantity, 0) + delta
        where id = rec.product_id;

      if rec.variant_id is not null then
        update public.product_variants
          set stock_quantity = coalesce(stock_quantity, 0) + delta
          where id = rec.variant_id;
      end if;
    end if;
  end loop;

  -- Set inventory_restored flag to prevent double restoration by client-side code
  if not old_inactive and new_should_restore then
    new.inventory_restored := true;
  elsif old_inactive and not new_inactive then
    new.inventory_restored := false;
  end if;

  return new;
end;
$$;

-- Ensure the trigger fires BEFORE update (not AFTER) so we can modify NEW.inventory_restored
DROP TRIGGER IF EXISTS trg_sales_status_adjust_stock ON public.sales;
CREATE TRIGGER trg_sales_status_adjust_stock
  BEFORE UPDATE OF payment_status, courier_status
  ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.adjust_stock_on_sales_status();
