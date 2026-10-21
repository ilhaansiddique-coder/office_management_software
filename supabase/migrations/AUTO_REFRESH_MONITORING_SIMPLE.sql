-- ============================================
-- IMPORTANT: Run each query SEPARATELY, one at a time
-- Copy and paste each query individually into Supabase SQL Editor
-- ============================================


-- ============================================
-- QUERY 1: Recent Auto-Refresh Activity
-- ============================================
-- Shows all status updates made by auto-refresh in the last 7 days
-- Copy and run this query alone:

SELECT 
  created_at,
  action,
  description,
  entity_id as sale_id
FROM activity_logs
WHERE description LIKE '%auto-updated%'
  AND created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 50;


-- ============================================
-- QUERY 2: Current Auto-Refresh Settings
-- ============================================
-- Shows your current auto-refresh configuration
-- Copy and run this query alone:

SELECT 
  auto_refresh_interval_minutes,
  CASE 
    WHEN auto_refresh_interval_minutes = 0 THEN 'Disabled'
    WHEN auto_refresh_interval_minutes = 60 THEN 'Every 1 hour'
    WHEN auto_refresh_interval_minutes = 120 THEN 'Every 2 hours'
    WHEN auto_refresh_interval_minutes = 180 THEN 'Every 3 hours'
    WHEN auto_refresh_interval_minutes = 240 THEN 'Every 4 hours'
    WHEN auto_refresh_interval_minutes = 360 THEN 'Every 6 hours'
    WHEN auto_refresh_interval_minutes = 480 THEN 'Every 8 hours'
    WHEN auto_refresh_interval_minutes = 720 THEN 'Every 12 hours'
    WHEN auto_refresh_interval_minutes = 1440 THEN 'Every 24 hours'
    WHEN auto_refresh_interval_minutes = 2880 THEN 'Every 48 hours'
    ELSE auto_refresh_interval_minutes || ' minutes'
  END as interval_description,
  updated_at as last_settings_update
FROM courier_webhook_settings
ORDER BY updated_at DESC
LIMIT 1;


-- ============================================
-- QUERY 3: Orders Pending Auto-Refresh
-- ============================================
-- Shows orders that will be checked in the next auto-refresh cycle
-- Copy and run this query alone:

SELECT 
  id,
  customer_name,
  consignment_id,
  courier_name,
  courier_status,
  last_status_check,
  NOW() - last_status_check as time_since_last_check
FROM sales
WHERE consignment_id IS NOT NULL
  AND courier_status NOT IN ('delivered', 'cancelled', 'returned', 'lost')
ORDER BY last_status_check DESC;


-- ============================================
-- QUERY 4: Auto-Refresh Statistics Today
-- ============================================
-- Summary of auto-refresh activity today
-- Copy and run this query alone:

SELECT 
  COUNT(*) as total_auto_refreshes,
  COUNT(DISTINCT entity_id) as unique_orders_refreshed,
  MIN(created_at) as first_refresh_today,
  MAX(created_at) as last_refresh_today
FROM activity_logs
WHERE description LIKE '%auto-updated%'
  AND created_at >= CURRENT_DATE;


-- ============================================
-- QUERY 5: Status Changes (Not Just Timestamp Updates)
-- ============================================
-- Shows orders where status actually changed
-- Copy and run this query alone:

SELECT 
  created_at,
  entity_id as sale_id,
  description
FROM activity_logs
WHERE description LIKE '%auto-updated%'
  AND description NOT LIKE '%timestamp only%'
ORDER BY created_at DESC
LIMIT 20;


-- ============================================
-- QUERY 6: Last Auto-Refresh Time
-- ============================================
-- Shows when the last auto-refresh happened
-- Copy and run this query alone:

SELECT 
  MAX(created_at) as last_auto_refresh,
  ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))/60) as minutes_ago
FROM activity_logs
WHERE description LIKE '%auto-updated%';
