# Bulk Courier Status Refresh Feature

## ✅ Feature Added

A "Refresh All" button has been added to manually force refresh all courier statuses at once, with a warning popup before execution.

## 📍 Location

**Button Location:** Sales page header, next to the filters
- Desktop: Shows "Refresh All" text with refresh icon
- Mobile: Shows only the refresh icon
- Position: Between the user filter and the Sales Review toggle

## 🎯 How It Works

### 1. **Click "Refresh All" Button**
- Located in the page header controls
- Shows a spinning icon when refreshing is in progress
- Disabled during refresh operation

### 2. **Warning Dialog Appears**
The dialog shows:
- ⚠️ Warning icon
- **Title:** "Refresh All Courier Statuses?"
- **Message:** 
  - "This will manually refresh the courier status for **all pending orders** with consignment IDs."
  - "Orders with final statuses (delivered, cancelled, returned, lost) will be skipped."
  - "This operation may take several minutes depending on the number of orders."
- **Buttons:**
  - **Cancel** - Closes the dialog without doing anything
  - **Refresh All** - Proceeds with the bulk refresh

### 3. **Bulk Refresh Process**
When you click "Refresh All":

1. **Fetches pending orders from current view:**
   - ✅ **Respects your current filters:**
     - Date range filter
     - Courier status filter
     - User filter
     - Search term
   - Gets only sales with consignment IDs
   - Excludes orders with final statuses:
     - ✅ delivered
     - ❌ cancelled
     - 🔄 returned
     - ❌ lost

2. **Refreshes each order:**
   - Calls the courier API for each order
   - Updates status in database
   - Logs activity for each update
   - Adds 1-second delay between requests (to avoid rate limiting)

3. **Shows progress:**
   - Initial toast: "Refreshing X order statuses..."
   - Console logs for each order
   - Final summary toast

4. **Completion:**
   - Success: "Successfully refreshed X order statuses"
   - Partial success: "Refreshed X orders, Y failed"
   - Refreshes the sales list automatically

## 🎯 Important: Respects Current Filters!

**The bulk refresh ONLY refreshes orders in your current view**, based on:
- 📅 **Date filter** - Only orders in the selected date range
- 🚚 **Courier status filter** - Only orders matching the selected status
- 👤 **User filter** - Only orders created by the selected user
- 🔍 **Search term** - Only orders matching your search

**Example scenarios:**
- If you filter by "February 2026", it will only refresh February orders
- If you filter by "sent" status, it will only refresh orders with "sent" status
- If you filter by a specific user, it will only refresh that user's orders
- If you search for a customer name, it will only refresh matching orders

This prevents accidentally refreshing thousands of old orders!

## 📊 Console Output

During bulk refresh, you'll see detailed logs:

```
🔄 Starting bulk refresh for 15 orders...
Status check response: { status: "delivered", ... }
Status changed for sale abc123: sent → delivered
Status unchanged for sale xyz789 (sent), updating timestamp only.
...
✅ Bulk refresh complete: 14 successful, 1 failed
```

## 🔍 What Gets Refreshed

**✅ INCLUDED (Will be refreshed):**
- Orders with **consignment_id** (sent via courier dialog)
- Orders with **cn_number** (manually added CN numbers)
- Status: not_sent, sent, in_review, pending, in_transit, out_for_delivery, payout_ready

**❌ EXCLUDED (Will be skipped):**
- Orders without CN numbers (not sent to courier)
- delivered ✅
- cancelled ✅
- returned ✅
- lost ✅Orders with final statuses:
  - delivered
  - cancelled
  - returned
  - lost

## ⚡ Features

### Smart Refresh
- ✅ Skips orders with final statuses
- ✅ Updates timestamp even if status unchanged
- ✅ Logs all status changes in activity logs
- ✅ Restores inventory for cancelled/returned orders
- ✅ Rate limiting (1 second delay between requests)

### Error Handling
- ✅ Continues even if individual orders fail
- ✅ Shows summary of successes and failures
- ✅ Detailed error logging in console
- ✅ Graceful handling of API errors

### UI Feedback
- ✅ Button shows spinning icon during refresh
- ✅ Button disabled during refresh
- ✅ Toast notifications for progress and completion
- ✅ Console logs for detailed tracking

## 🎨 UI Design

### Button Appearance
- **Variant:** Outline
- **Style:** Rounded pill shape
- **Icon:** Refresh icon (spins when active)
- **Text:** "Refresh All" (hidden on mobile)
- **Tooltip:** "Refresh all courier statuses"

### Warning Dialog
- **Icon:** ⚠️ Warning triangle (amber color)
- **Layout:** Clear, easy-to-read warning message
- **Actions:** Cancel (secondary) and Refresh All (primary)

## 🧪 Testing

### Test Scenario 1: Normal Refresh
1. Click "Refresh All" button
2. Verify warning dialog appears
3. Click "Refresh All" in dialog
4. Check console for progress logs
5. Verify toast shows completion message
6. Check that sales list refreshes

### Test Scenario 2: No Pending Orders
1. Ensure all orders have final statuses
2. Click "Refresh All"
3. Click "Refresh All" in dialog
4. Should show: "No pending orders to refresh"

### Test Scenario 3: Cancel Operation
1. Click "Refresh All" button
2. Click "Cancel" in dialog
3. Dialog closes, no refresh happens

### Test Scenario 4: During Refresh
1. Click "Refresh All" and confirm
2. While refreshing:
   - Button shows spinning icon
   - Button is disabled
   - Cannot start another refresh

## 📝 Activity Logs

All status updates are logged in the activity logs:
- **Action:** "status_update"
- **Description:** "Courier status auto-updated: [old] → [new]"
- **Entity:** sale
- **Entity ID:** Sale ID

View in: **Admin → Activity Logs** → Filter by "status_update"

## ⚙️ Technical Details

### Function: `handleBulkRefreshAll`
- **Location:** `src/pages/Sales.tsx`
- **State:** `isBulkRefreshing`, `showBulkRefreshDialog`
- **Dependencies:** `handleStatusRefresh`, `supabase`, `toast`

### Database Queries
```sql
-- Fetch pending orders
SELECT id, consignment_id, courier_name, courier_status, customer_name
FROM sales
WHERE consignment_id IS NOT NULL
  AND courier_status NOT IN ('delivered', 'cancelled', 'returned', 'lost');
```

### Rate Limiting
- 1 second delay between each API call
- Prevents overwhelming courier APIs
- Ensures stable operation

## 🎯 Use Cases

1. **Manual Status Sync**
   - When auto-refresh interval is long (e.g., 12 hours)
   - Need immediate status updates for all orders

2. **After System Downtime**
   - Refresh all statuses after courier API was down
   - Catch up on missed status updates

3. **Before Reports**
   - Ensure all statuses are up-to-date before generating reports
   - Get accurate delivery/pending counts

4. **Troubleshooting**
   - Verify courier API connectivity
   - Check if status updates are working

## ✅ Summary

The bulk refresh feature provides:
- ✅ Manual control over status updates
- ✅ Warning before execution
- ✅ Progress tracking and feedback
- ✅ Error handling and recovery
- ✅ Activity logging for audit trail
- ✅ Smart filtering (skips final statuses)
- ✅ Rate limiting for API protection

Perfect for scenarios where you need immediate status updates for all pending orders! 🚀
