# Backend Auto-Refresh Setup Guide

## 🎯 Overview

This setup enables **24/7 automated courier status refresh** that runs on Supabase's backend, independent of users browsing the app.

## 📋 Components

1. **Edge Function**: `auto-refresh-courier-status` - Does the actual status checking
2. **Cron Job**: Runs the Edge Function on a schedule (every 6 hours by default)
3. **Tracking Table**: `auto_refresh_runs` - Monitors execution history

## 🚀 Setup Steps

### Step 1: Deploy the Edge Function

```bash
# Navigate to your project directory
cd d:\Rahestock--Live

# Deploy the auto-refresh Edge Function
supabase functions deploy auto-refresh-courier-status
```

### Step 2: Run the Migration

```bash
# Apply the migration to set up cron job
supabase db push
```

**OR** manually run the SQL in Supabase Dashboard:
1. Go to **SQL Editor** in Supabase Dashboard
2. Open `supabase/migrations/20260211_auto_refresh_cron.sql`
3. Copy and paste the SQL
4. Click **Run**

### Step 3: Configure Environment Variables

The Edge Function needs access to your Supabase URL and Service Role Key. These are usually already set, but verify:

1. Go to **Supabase Dashboard** → **Project Settings** → **Edge Functions**
2. Ensure these are set:
   - `SUPABASE_URL` - Your project URL
   - `SUPABASE_SERVICE_ROLE_KEY` - Service role key
   - `COURIER_WEBHOOK_SECRET` - Your webhook secret

### Step 4: Enable pg_cron Extension

1. Go to **Supabase Dashboard** → **Database** → **Extensions**
2. Search for `pg_cron`
3. Click **Enable**

### Step 5: Set Custom Settings (Required for HTTP calls)

Run this SQL in Supabase SQL Editor:

```sql
-- Set your Supabase URL
ALTER DATABASE postgres SET app.settings.supabase_url = 'YOUR_SUPABASE_URL';

-- Set your Service Role Key
ALTER DATABASE postgres SET app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
```

**Replace:**
- `YOUR_SUPABASE_URL` with your actual Supabase URL (e.g., `https://xxxxx.supabase.co`)
- `YOUR_SERVICE_ROLE_KEY` with your actual service role key

### Step 6: Verify Cron Job

Check if the cron job is scheduled:

```sql
SELECT * FROM cron.job;
```

You should see:
- **jobname**: `auto-refresh-courier-status`
- **schedule**: `0 */6 * * *` (every 6 hours)
- **active**: `true`

## ⚙️ How It Works

### Automatic Execution

The cron job runs **every 6 hours** at:
- 00:00 (midnight)
- 06:00 (6 AM)
- 12:00 (noon)
- 18:00 (6 PM)

### What It Does

1. **Checks if auto-refresh is enabled** in `courier_webhook_settings`
2. **Fetches all pending orders** (not delivered/cancelled/returned/lost)
3. **For each order:**
   - Calls the courier API to check status
   - Updates the database if status changed
   - Logs the activity
4. **Records the run** in `auto_refresh_runs` table

### Respects Settings

The auto-refresh will only run if:
- ✅ `auto_refresh_enabled` is `true` in `courier_webhook_settings`
- ✅ Cron job is active
- ✅ There are pending orders to check

## 📊 Monitoring

### View Auto-Refresh History

```sql
SELECT 
  started_at,
  completed_at,
  success,
  total_orders,
  successful_updates,
  failed_updates,
  error_message
FROM auto_refresh_runs
ORDER BY started_at DESC
LIMIT 10;
```

### View Recent Activity Logs

```sql
SELECT 
  created_at,
  action,
  description,
  metadata
FROM activity_logs
WHERE action = 'status_update'
  AND metadata->>'automated' = 'true'
ORDER BY created_at DESC
LIMIT 20;
```

### Check Cron Job Status

```sql
-- View all cron jobs
SELECT * FROM cron.job;

-- View recent cron job runs
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'auto-refresh-courier-status')
ORDER BY start_time DESC
LIMIT 10;
```

## 🔧 Customization

### Change Refresh Interval

To change from 6 hours to a different interval:

```sql
-- Update the cron schedule
SELECT cron.unschedule('auto-refresh-courier-status');

-- Schedule with new interval (example: every 3 hours)
SELECT cron.schedule(
  'auto-refresh-courier-status',
  '0 */3 * * *',  -- Every 3 hours
  $$SELECT trigger_auto_refresh_courier_status();$$
);
```

**Common Schedules:**
- Every 1 hour: `'0 * * * *'`
- Every 3 hours: `'0 */3 * * *'`
- Every 6 hours: `'0 */6 * * *'`
- Every 12 hours: `'0 */12 * * *'`
- Every 24 hours: `'0 0 * * *'`

### Disable Auto-Refresh

```sql
-- Disable the cron job
SELECT cron.unschedule('auto-refresh-courier-status');
```

### Re-enable Auto-Refresh

```sql
-- Re-schedule the cron job
SELECT cron.schedule(
  'auto-refresh-courier-status',
  '0 */6 * * *',
  $$SELECT trigger_auto_refresh_courier_status();$$
);
```

## 🧪 Testing

### Manual Test

You can manually trigger the auto-refresh to test it:

```sql
-- Run the function manually
SELECT trigger_auto_refresh_courier_status();
```

**OR** call the Edge Function directly:

```bash
curl -X POST \
  'YOUR_SUPABASE_URL/functions/v1/auto-refresh-courier-status' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json'
```

### Check Logs

View Edge Function logs in Supabase Dashboard:
1. Go to **Edge Functions**
2. Click on `auto-refresh-courier-status`
3. View **Logs** tab

## ⚠️ Important Notes

### Rate Limiting

The function includes a 500ms delay between each order to avoid rate limiting from courier APIs. For 100 orders, this means:
- 100 orders × 0.5 seconds = 50 seconds total

### Costs

- **pg_cron**: Free on Supabase
- **Edge Functions**: Free tier includes 500K invocations/month
- **Database Operations**: Included in your plan

### Limitations

- Maximum Edge Function execution time: 150 seconds
- If you have 1000+ pending orders, consider:
  - Increasing the delay between requests
  - Processing in batches
  - Running more frequently with smaller batches

## 🔍 Troubleshooting

### Cron Job Not Running

1. **Check if pg_cron is enabled:**
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```

2. **Check if job is active:**
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'auto-refresh-courier-status';
   ```

3. **View error logs:**
   ```sql
   SELECT * FROM cron.job_run_details
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'auto-refresh-courier-status')
   ORDER BY start_time DESC;
   ```

### Edge Function Errors

1. Check Edge Function logs in Supabase Dashboard
2. Verify environment variables are set
3. Test the function manually

### No Orders Being Updated

1. **Check if auto-refresh is enabled:**
   ```sql
   SELECT auto_refresh_enabled FROM courier_webhook_settings WHERE is_active = true;
   ```

2. **Check if there are pending orders:**
   ```sql
   SELECT COUNT(*) FROM sales
   WHERE (consignment_id IS NOT NULL OR cn_number IS NOT NULL)
     AND courier_status NOT IN ('delivered', 'cancelled', 'returned', 'lost');
   ```

3. **Check courier webhook settings:**
   ```sql
   SELECT * FROM courier_webhook_settings WHERE is_active = true;
   ```

## ✅ Success Indicators

You'll know it's working when:
- ✅ Cron job appears in `cron.job` table
- ✅ Runs appear in `auto_refresh_runs` table every 6 hours
- ✅ Activity logs show automated status updates
- ✅ Courier statuses are being updated even when no one is using the app

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review Edge Function logs
3. Check cron job run details
4. Verify all environment variables are set correctly
