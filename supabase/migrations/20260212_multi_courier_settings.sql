-- Multi-courier settings: Add Pathao integration and enable flags

-- First ensure Steadfast columns exist (in case previous migration wasn't applied)
ALTER TABLE courier_webhook_settings
ADD COLUMN IF NOT EXISTS steadfast_api_key TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS steadfast_secret_key TEXT DEFAULT '';

-- Add Pathao API credentials to courier_webhook_settings
ALTER TABLE courier_webhook_settings
ADD COLUMN IF NOT EXISTS pathao_client_id TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS pathao_client_secret TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS pathao_access_token TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS pathao_token_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pathao_store_id TEXT DEFAULT '';

-- Add individual courier enable flags
ALTER TABLE courier_webhook_settings
ADD COLUMN IF NOT EXISTS steadfast_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS pathao_enabled BOOLEAN DEFAULT false;

-- Add default courier selection
ALTER TABLE courier_webhook_settings
ADD COLUMN IF NOT EXISTS default_courier TEXT DEFAULT NULL;

-- Auto-enable Steadfast for existing users who have credentials configured
UPDATE courier_webhook_settings
SET steadfast_enabled = true
WHERE steadfast_api_key IS NOT NULL
  AND steadfast_api_key != ''
  AND steadfast_secret_key IS NOT NULL
  AND steadfast_secret_key != '';

-- Add comments for documentation
COMMENT ON COLUMN courier_webhook_settings.pathao_client_id IS 'Pathao API client ID for OAuth authentication';
COMMENT ON COLUMN courier_webhook_settings.pathao_client_secret IS 'Pathao API client secret for OAuth authentication';
COMMENT ON COLUMN courier_webhook_settings.pathao_access_token IS 'Pathao OAuth access token (auto-refreshed)';
COMMENT ON COLUMN courier_webhook_settings.pathao_token_expires_at IS 'Expiration timestamp for Pathao access token';
COMMENT ON COLUMN courier_webhook_settings.pathao_store_id IS 'Pathao merchant store ID';
COMMENT ON COLUMN courier_webhook_settings.steadfast_enabled IS 'Whether Steadfast courier integration is enabled';
COMMENT ON COLUMN courier_webhook_settings.pathao_enabled IS 'Whether Pathao courier integration is enabled';
COMMENT ON COLUMN courier_webhook_settings.default_courier IS 'Default courier to use (Steadfast, Pathao, or NULL)';
