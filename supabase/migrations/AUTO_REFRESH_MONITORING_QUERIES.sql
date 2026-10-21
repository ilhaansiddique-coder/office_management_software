-- Auto-Refresh Monitoring Queries
-- Run these in Supabase SQL Editor to monitor auto-refresh activity

-- ============================================
-- 1. Recent Auto-Refresh Activity
-- ============================================
-- Shows all status updates made by auto-refresh in the last 7 days
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
-- 2. Orders Pending Auto-Refresh
-- ============================================
-- Shows orders that will be checked in the next auto-refresh cycle
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
-- 3. Auto-Refresh Statistics (Today)
-- ============================================
-- Summary of auto-refresh activity today
SELECT 
  COUNT(*) as total_auto_refreshes,
  COUNT(DISTINCT entity_id) as unique_orders_refreshed,
  MIN(created_at) as first_refresh_today,
  MAX(created_at) as last_refresh_today
FROM activity_logs
WHERE description LIKE '%auto-updated%'
  AND created_at >= CURRENT_DATE;


-- ============================================
-- 4. Status Changes via Auto-Refresh
-- ============================================
-- Shows orders where status actually changed (not just timestamp update)
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
-- 5. Current Auto-Refresh Configuration
-- ============================================
-- Shows your current auto-refresh settings
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
-- 6. Monitoring Dashboard (All-in-One)
-- ============================================
-- Comprehensive overview of auto-refresh status
SELECT 
  'Total Pending Orders' as metric,
  COUNT(*)::text as value
FROM sales
WHERE consignment_id IS NOT NULL
  AND courier_status NOT IN ('delivered', 'cancelled', 'returned', 'lost')

UNION ALL

SELECT 
  'Auto-Refreshes Today' as metric,
  COUNT(*)::text as value
FROM activity_logs
WHERE description LIKE '%auto-updated%'
  AND created_at >= CURRENT_DATE

UNION ALL

SELECT 
  'Last Auto-Refresh' as metric,
  COALESCE(
    ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(created_at)))/60) || ' minutes ago',
    'Never'
  ) as value
FROM activity_logs
WHERE description LIKE '%auto-updated%'

UNION ALL

SELECT 
  'Current Interval' as metric,
  CASE 
    WHEN auto_refresh_interval_minutes = 0 THEN 'Disabled'
    ELSE auto_refresh_interval_minutes || ' minutes'
  END as value
FROM courier_webhook_settings
LIMIT 1

UNION ALL

SELECT 
  'Status Changes Today' as metric,
  COUNT(*)::text as value
FROM activity_logs
WHERE description LIKE '%auto-updated%'
  AND description NOT LIKE '%timestamp only%'
  AND created_at >= CURRENT_DATE;


-- ============================================
-- 7. Orders Overdue for Status Check
-- ============================================
-- Shows orders that haven't been checked in longer than your interval
-- (Useful for debugging if auto-refresh isn't running)
WITH settings AS (
  SELECT auto_refresh_interval_minutes 
  FROM courier_webhook_settings 
  LIMIT 1
)
SELECT 
  s.id,
  s.customer_name,
  s.consignment_id,
  s.courier_status,
  s.last_status_check,
  ROUND(EXTRACT(EPOCH FROM (NOW() - s.last_status_check))/60) as minutes_since_check,
  st.auto_refresh_interval_minutes as expected_interval
FROM sales s
CROSS JOIN settings st
WHERE s.consignment_id IS NOT NULL
  AND s.courier_status NOT IN ('delivered', 'cancelled', 'returned', 'lost')
  AND (NOW() - s.last_status_check) > (st.auto_refresh_interval_minutes || ' minutes')::INTERVAL
ORDER BY s.last_status_check ASC;


-- ============================================
-- 8. Auto-Refresh Performance
-- ============================================
-- Shows how many orders are being refreshed per cycle
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_refreshes,
  COUNT(DISTINCT entity_id) as unique_orders,
  COUNT(*) FILTER (WHERE description NOT LIKE '%timestamp only%') as status_changes
FROM activity_logs
WHERE description LIKE '%auto-updated%'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
