-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a table to track auto-refresh runs
CREATE TABLE IF NOT EXISTS auto_refresh_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  success boolean,
  total_orders integer,
  successful_updates integer,
  failed_updates integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add RLS policies
ALTER TABLE auto_refresh_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow admins to view auto-refresh runs"
  ON auto_refresh_runs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role IN ('admin', 'manager')
    )
  );

-- Create an index for faster queries
CREATE INDEX IF NOT EXISTS idx_auto_refresh_runs_started_at 
  ON auto_refresh_runs(started_at DESC);

-- Create a smart function that checks if it's time to refresh based on settings
CREATE OR REPLACE FUNCTION trigger_auto_refresh_courier_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url text;
  v_service_key text;
  v_response text;
  v_settings record;
  v_last_run timestamptz;
  v_hours_since_last_run numeric;
BEGIN
  -- Get the auto-refresh settings
  SELECT 
    auto_refresh_enabled,
    auto_refresh_interval_hours
  INTO v_settings
  FROM courier_webhook_settings
  WHERE is_active = true
  LIMIT 1;
  
  -- Exit if auto-refresh is not enabled
  IF v_settings IS NULL OR NOT v_settings.auto_refresh_enabled THEN
    RAISE NOTICE 'Auto-refresh is disabled, skipping...';
    RETURN;
  END IF;
  
  -- Get the last successful run time
  SELECT started_at INTO v_last_run
  FROM auto_refresh_runs
  WHERE success = true
  ORDER BY started_at DESC
  LIMIT 1;
  
  -- Calculate hours since last run
  IF v_last_run IS NULL THEN
    -- First run ever, proceed
    v_hours_since_last_run := 999;
  ELSE
    v_hours_since_last_run := EXTRACT(EPOCH FROM (now() - v_last_run)) / 3600;
  END IF;
  
  -- Check if enough time has passed based on the interval setting
  IF v_hours_since_last_run < v_settings.auto_refresh_interval_hours THEN
    RAISE NOTICE 'Not enough time has passed. Last run: % hours ago, Interval: % hours', 
      ROUND(v_hours_since_last_run::numeric, 2), 
      v_settings.auto_refresh_interval_hours;
    RETURN;
  END IF;
  
  RAISE NOTICE 'Triggering auto-refresh (% hours since last run, interval: % hours)', 
    ROUND(v_hours_since_last_run::numeric, 2),
    v_settings.auto_refresh_interval_hours;
  
  -- Get environment variables (these need to be set in Supabase)
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);
  
  -- Call the Edge Function using pg_net (http extension)
  SELECT content::text INTO v_response
  FROM http((
    'POST',
    v_supabase_url || '/functions/v1/auto-refresh-courier-status',
    ARRAY[
      http_header('Authorization', 'Bearer ' || v_service_key),
      http_header('Content-Type', 'application/json')
    ],
    'application/json',
    '{}'
  )::http_request);
  
  -- Log the response
  RAISE NOTICE 'Auto-refresh response: %', v_response;
  
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error in trigger_auto_refresh_courier_status: %', SQLERRM;
END;
$$;

-- Schedule the cron job to run EVERY HOUR
-- It will check if it's time to refresh based on the interval setting
SELECT cron.schedule(
  'auto-refresh-courier-status-hourly',
  '0 * * * *',  -- Every hour at minute 0
  $$SELECT trigger_auto_refresh_courier_status();$$
);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

COMMENT ON TABLE auto_refresh_runs IS 'Tracks automated courier status refresh runs';
COMMENT ON COLUMN auto_refresh_runs.started_at IS 'When the auto-refresh job started';
COMMENT ON COLUMN auto_refresh_runs.completed_at IS 'When the auto-refresh job completed';
COMMENT ON COLUMN auto_refresh_runs.success IS 'Whether the job completed successfully';
COMMENT ON COLUMN auto_refresh_runs.total_orders IS 'Total number of orders processed';
COMMENT ON COLUMN auto_refresh_runs.successful_updates IS 'Number of successful status updates';
COMMENT ON COLUMN auto_refresh_runs.failed_updates IS 'Number of failed status updates';

COMMENT ON FUNCTION trigger_auto_refresh_courier_status IS 'Smart function that checks if enough time has passed based on auto_refresh_interval_hours setting before triggering refresh';

