# 🎯 Dynamic Backend Auto-Refresh - Setup Complete!

## ✅ What's Different Now

The backend auto-refresh now **respects your app settings**:
- ✅ Uses the interval YOU set in Courier Settings (1-48 hours)
- ✅ Checks every hour if it's time to refresh
- ✅ Only runs when enough time has passed
- ✅ Completely automatic!

## 🔄 How It Works

### Smart Scheduling

1. **Cron runs every hour** (at minute 0)
2. **Checks your settings** from `courier_webhook_settings`
3. **Calculates time since last run**
4. **Only refreshes if interval has passed**

### Example

If you set interval to **6 hours**:
- ✅ 00:00 - First run (no previous run)
- ❌ 01:00 - Skipped (only 1 hour passed)
- ❌ 02:00 - Skipped (only 2 hours passed)
- ❌ 03:00 - Skipped (only 3 hours passed)
- ❌ 04:00 - Skipped (only 4 hours passed)
- ❌ 05:00 - Skipped (only 5 hours passed)
- ✅ 06:00 - **Runs!** (6 hours passed)
- ❌ 07:00 - Skipped (only 1 hour since last run)
- ... and so on

## 🚀 Quick Deploy

### 1. Deploy Edge Function
```bash
supabase functions deploy auto-refresh-courier-status
```

### 2. Enable pg_cron Extension
1. Go to **Supabase Dashboard**
2. Navigate to **Database** → **Extensions**
3. Search for `pg_cron`
4. Click **Enable**

### 3. Enable HTTP Extension (for calling Edge Functions)
1. Still in **Extensions**
2. Search for `http` or `pg_net`
3. Click **Enable**

### 4. Run the Migration

**Option A: Using CLI**
```bash
supabase db push
```

**Option B: Manual SQL**
1. Go to **SQL Editor** in Supabase Dashboard
2. Copy the contents of `supabase/migrations/20260211_auto_refresh_cron.sql`
3. Paste and click **Run**

### 5. Set Environment Variables

Run this SQL in **SQL Editor**:

```sql
-- Replace with your actual values!
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://YOUR_PROJECT.supabase.co';
ALTER DATABASE postgres SET app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
```

**Find your values:**
- **Supabase URL**: Project Settings → API → Project URL
- **Service Role Key**: Project Settings → API → service_role key (secret!)

## ⚙️ Configure in Your App

1. Go to **Courier Settings** page
2. Enable **Auto-Refresh**
3. Set your desired interval (1-48 hours)
4. Save!

The backend will automatically use this interval!

## 📊 Monitor It

### View Recent Runs
```sql
SELECT 
  started_at,
  completed_at,
  success,
  total_orders,
  successful_updates,
  failed_updates,
  ROUND(EXTRACT(EPOCH FROM (completed_at - started_at))::numeric, 2) as duration_seconds
FROM auto_refresh_runs
ORDER BY started_at DESC
LIMIT 10;
```

### Check Next Scheduled Run
```sql
SELECT 
  jobname,
  schedule,
  active,
  database
FROM cron.job
WHERE jobname = 'auto-refresh-courier-status-hourly';
```

### View Cron Execution Log
```sql
SELECT 
  start_time,
  end_time,
  status,
  return_message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'auto-refresh-courier-status-hourly')
ORDER BY start_time DESC
LIMIT 20;
```

### View Automated Status Updates
```sql
SELECT 
  created_at,
  description,
  metadata->>'old_status' as old_status,
  metadata->>'new_status' as new_status,
  metadata->>'cn_number' as cn_number
FROM activity_logs
WHERE action = 'status_update'
  AND metadata->>'automated' = 'true'
ORDER BY created_at DESC
LIMIT 20;
```

## 🧪 Test It

### Manual Trigger
```sql
SELECT trigger_auto_refresh_courier_status();
```

This will:
1. Check if auto-refresh is enabled
2. Check if enough time has passed
3. Run the refresh if conditions are met
4. Log everything

### Check the Logs

After running, check:
```sql
-- See what happened
SELECT * FROM auto_refresh_runs ORDER BY started_at DESC LIMIT 1;

-- See the cron log
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'auto-refresh-courier-status-hourly')
ORDER BY start_time DESC LIMIT 1;
```

## 🎛️ How Settings Work

### In Your App (Courier Settings)

When you change the interval in the app:
- ✅ Saved to `courier_webhook_settings.auto_refresh_interval_hours`
- ✅ Backend reads this value every hour
- ✅ Automatically adjusts timing
- ✅ No need to restart anything!

### Example Scenarios

**Set to 1 hour:**
- Refreshes every hour (if enabled)

**Set to 6 hours:**
- Refreshes every 6 hours

**Set to 24 hours:**
- Refreshes once per day

**Set to 48 hours:**
- Refreshes every 2 days

**Disable auto-refresh:**
- Backend skips all runs

## ✅ Success Indicators

You'll know it's working when:

1. **Cron job exists:**
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'auto-refresh-courier-status-hourly';
   ```
   Should show `active = true`

2. **Runs are recorded:**
   ```sql
   SELECT COUNT(*) FROM auto_refresh_runs;
   ```
   Should increase over time

3. **Statuses are updating:**
   ```sql
   SELECT COUNT(*) FROM activity_logs 
   WHERE action = 'status_update' 
     AND metadata->>'automated' = 'true';
   ```
   Should show automated updates

4. **Edge Function logs show activity:**
   - Go to Supabase Dashboard → Edge Functions → auto-refresh-courier-status → Logs

## 🔧 Troubleshooting

### Cron Not Running

```sql
-- Check if cron extension is enabled
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- Check if job is active
SELECT * FROM cron.job WHERE jobname = 'auto-refresh-courier-status-hourly';

-- View recent errors
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'auto-refresh-courier-status-hourly')
  AND status = 'failed'
ORDER BY start_time DESC;
```

### Edge Function Not Being Called

```sql
-- Check if environment variables are set
SHOW app.settings.supabase_url;
SHOW app.settings.service_role_key;

-- If empty, set them:
ALTER DATABASE postgres SET app.settings.supabase_url = 'YOUR_URL';
ALTER DATABASE postgres SET app.settings.service_role_key = 'YOUR_KEY';
```

### No Orders Being Updated

```sql
-- Check if auto-refresh is enabled
SELECT auto_refresh_enabled, auto_refresh_interval_hours 
FROM courier_webhook_settings 
WHERE is_active = true;

-- Check if there are pending orders
SELECT COUNT(*) FROM sales
WHERE (consignment_id IS NOT NULL OR cn_number IS NOT NULL)
  AND courier_status NOT IN ('delivered', 'cancelled', 'returned', 'lost');
```

## 🎉 You're All Set!

Your backend auto-refresh is now:
- ✅ Running 24/7 automatically
- ✅ Using YOUR interval settings from the app
- ✅ Checking every hour if it's time to refresh
- ✅ Logging everything for monitoring
- ✅ Working even when no one is using the app!

**Change the interval anytime in Courier Settings - no restart needed!** 🚀
