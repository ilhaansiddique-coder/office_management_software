-- Add tracking_number column to sales table for Steadfast public tracking
-- This stores the alphanumeric tracking code (e.g., SFR260210ST210D6F1BD)
-- which is different from the numeric consignment_id

ALTER TABLE sales ADD COLUMN IF NOT EXISTS tracking_number TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sales_tracking_number ON sales(tracking_number);

-- Add comment for documentation
COMMENT ON COLUMN sales.tracking_number IS 'Alphanumeric tracking code from courier (e.g., Steadfast tracking code for public tracking page)';
