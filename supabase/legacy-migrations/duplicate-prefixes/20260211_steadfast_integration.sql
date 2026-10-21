-- Add Steadfast courier integration columns

-- Add Steadfast API credentials to courier_webhook_settings
ALTER TABLE courier_webhook_settings
ADD COLUMN IF NOT EXISTS steadfast_api_key TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS steadfast_secret_key TEXT DEFAULT '';

-- Add tracking_code column to sales for Steadfast tracking codes
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS tracking_code TEXT;

-- Create index on tracking_code for quick lookups
CREATE INDEX IF NOT EXISTS idx_sales_tracking_code ON sales(tracking_code) WHERE tracking_code IS NOT NULL;
