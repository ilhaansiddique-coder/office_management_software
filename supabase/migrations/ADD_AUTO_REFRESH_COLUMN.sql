-- Run this SQL in your Supabase Dashboard SQL Editor
-- This adds the auto_refresh_interval_minutes column to courier_webhook_settings

-- Add the column if it doesn't exist
ALTER TABLE courier_webhook_settings
ADD COLUMN IF NOT EXISTS auto_refresh_interval_minutes INTEGER DEFAULT 60;

-- Add a comment for documentation
COMMENT ON COLUMN courier_webhook_settings.auto_refresh_interval_minutes 
IS 'Auto-refresh interval for courier status checks in minutes. Default is 60 minutes (1 hour). Set to 0 to disable.';

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'courier_webhook_settings' 
AND column_name = 'auto_refresh_interval_minutes';
