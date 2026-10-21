-- Check the actual value in the courier_webhook_settings table
SELECT id, auto_refresh_interval_minutes, updated_at 
FROM courier_webhook_settings 
ORDER BY updated_at DESC 
LIMIT 1;
