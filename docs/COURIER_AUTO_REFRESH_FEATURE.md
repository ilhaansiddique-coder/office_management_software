# Dynamic Auto-Refresh Interval Feature

## Overview
The courier status auto-refresh feature now supports **dynamic user-configurable intervals**, allowing you to control how frequently the system automatically checks courier statuses for pending orders.

## What Changed

### 1. **Database Schema**
- Added `auto_refresh_interval_minutes` column to `courier_webhook_settings` table
- Default value: 60 minutes (1 hour)
- Migration file: `20260211_add_auto_refresh_interval.sql`

### 2. **User Interface**
- New "Auto-Refresh Interval" section in Courier Settings (both Steadfast and Pathao tabs)
- Dropdown selector with the following options:
  - **Disabled** (Manual refresh only)
  - **Every 1 hour** (Recommended) ✅
  - Every 2 hours
  - Every 3 hours
  - Every 4 hours
  - Every 6 hours
  - Every 8 hours
  - Every 12 hours
  - Every 24 hours (1 day)
  - Every 48 hours (2 days)

### 3. **Auto-Refresh Logic**
- The system now reads the `auto_refresh_interval_minutes` setting from the database
- If set to `0`, auto-refresh is **completely disabled** (manual refresh only)
- If set to any other value (60-2880 minutes), the system refreshes at that interval
- The interval is applied globally to all courier status checks

## How to Use

### Step 1: Apply Database Migration
Run the following command to add the new column:
```bash
npx supabase db push
```

Or manually apply the migration in your Supabase dashboard:
```sql
ALTER TABLE courier_webhook_settings
ADD COLUMN IF NOT EXISTS auto_refresh_interval_minutes INTEGER DEFAULT 60;
```

### Step 2: Configure Auto-Refresh Interval
1. Navigate to **Settings** → **Courier Settings**
2. Go to either the **Steadfast** or **Pathao** tab
3. Scroll to the **"Auto-Refresh Interval"** section
4. Select your preferred interval from the dropdown
5. Click **"Save Steadfast Settings"** or **"Save Pathao Settings"**

### Step 3: Verify
- Check the browser console for: `"Auto-refresh enabled: checking every X minutes"`
- If disabled, you'll see: `"Auto-refresh is disabled by user settings"`

## Technical Details

### Files Modified
1. **`supabase/migrations/20260211_add_auto_refresh_interval.sql`** - Database migration
2. **`src/hooks/useWebhookSettings.tsx`** - TypeScript interface and data fetching
3. **`src/components/CourierWebhookSettings.tsx`** - UI controls
4. **`src/hooks/useStatusAutoRefresh.tsx`** - Dynamic interval logic

### How It Works
1. On component mount, `useStatusAutoRefresh` fetches the `auto_refresh_interval_minutes` from settings
2. If the value is `0`, auto-refresh is skipped entirely
3. Otherwise, it converts minutes to milliseconds and sets up an interval
4. The interval performs an **initial refresh immediately**, then repeats at the configured interval
5. On unmount or interval change, the old interval is cleared

### Performance Considerations
- **Recommended**: 1 hour (60 minutes) - Balances freshness with API usage
- **Minimum**: 1 hour - Prevents excessive API calls
- **Maximum**: 2 days (2880 minutes) - For low-priority or stable orders
- **Disabled**: Use for complete manual control

## Benefits
✅ **Flexibility**: Choose the refresh frequency that suits your business needs  
✅ **Cost Control**: Reduce API calls by increasing the interval  
✅ **Performance**: Disable auto-refresh if you prefer manual control  
✅ **User-Friendly**: Simple dropdown interface, no technical knowledge required  

## Example Use Cases

### High-Volume Business
- Set to **1-2 hours** for frequent updates without overwhelming the API

### Low-Volume Business
- Set to **6-12 hours** to minimize API usage while staying updated

### Manual Control Preference
- Set to **Disabled** and use the manual refresh button when needed

### Overnight/Weekend Orders
- Set to **24-48 hours** if orders are only processed during business hours

## Notes
- The setting applies **globally** to all couriers (Steadfast, Pathao, etc.)
- Orders with final statuses (delivered, cancelled, returned, lost) are **automatically skipped** from auto-refresh
- Manual refresh is **always available** regardless of auto-refresh settings
- The system logs all auto-refresh activity to the browser console for debugging
