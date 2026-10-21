-- Add auto refresh interval setting to courier_webhook_settings
ALTER TABLE courier_webhook_settings
ADD COLUMN IF NOT EXISTS auto_refresh_interval_minutes INTEGER DEFAULT 60;

COMMENT ON COLUMN courier_webhook_settings.auto_refresh_interval_minutes IS 'Auto-refresh interval for courier status checks in minutes. Default is 60 minutes (1 hour).';
