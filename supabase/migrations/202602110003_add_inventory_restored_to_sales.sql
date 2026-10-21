-- Add inventory_restored column to sales table to prevent double inventory restoration
-- when orders are cancelled/returned via manual status change and then API status check

ALTER TABLE sales ADD COLUMN IF NOT EXISTS inventory_restored BOOLEAN DEFAULT FALSE;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sales_inventory_restored ON sales(inventory_restored) WHERE inventory_restored = TRUE;

COMMENT ON COLUMN sales.inventory_restored IS 'Flag to prevent double inventory restoration when order status changes to cancelled/returned';
