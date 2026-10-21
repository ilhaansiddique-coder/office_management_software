# Courier Integration - Debugging and Fix Instructions

## Current Status

I've added comprehensive debugging logs to help identify why:
1. The note is not being sent to the courier
2. The icon is not changing after sending to courier
3. The CN number is not syncing

## Changes Made

### 1. Enhanced Logging in CourierOrderDialog.tsx

Added detailed console logs BEFORE sending the request:
```
=== COURIER ORDER DEBUG ===
Courier Name: [actual courier name]
Is Steadfast: [true/false]
Is Pathao: [true/false]
Special Instruction: [the text you entered]
Payload being sent: [full JSON payload]
=== END DEBUG ===
```

### 2. Enhanced Logging in Edge Function

Added detailed logs in `steadfast-create-order/index.ts`:
```
=== STEADFAST EDGE FUNCTION DEBUG ===
Received orderData: [full received data]
orderData.note value: [the note value]
orderData.note type: [string/undefined/etc]
Sending to Steadfast API: [full payload to Steadfast]
=== END EDGE FUNCTION DEBUG ===
```

### 3. Improved Error Handling

- Added explicit error messages if database update fails
- Added warning if no consignment_id is received
- Increased refresh delay from 100ms to 200ms for more reliable UI updates
- Added logging when the refresh event is dispatched

## Testing Steps

### Step 1: Apply the Database Migration

**IMPORTANT**: You must apply the migration to add the `courier_notes` column.

**Option A: Via Supabase Dashboard (Recommended)**
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Run this SQL:
```sql
ALTER TABLE sales ADD COLUMN IF NOT EXISTS courier_notes TEXT;
COMMENT ON COLUMN sales.courier_notes IS 'Special instructions or notes sent to the courier service';
```

**Option B: Via Supabase CLI** (if authenticated)
```bash
supabase db push
```

### Step 2: Deploy the Updated Edge Function

**Option A: Via Supabase Dashboard**
1. Go to your Supabase project dashboard
2. Navigate to **Edge Functions**
3. Find `steadfast-create-order`
4. Click **Deploy** and upload the updated `index.ts` file from:
   `d:\Rahestock--Live\supabase\functions\steadfast-create-order\index.ts`

**Option B: Via Supabase CLI** (if authenticated)
```bash
cd d:\Rahestock--Live
supabase functions deploy steadfast-create-order
```

### Step 3: Test with Console Open

1. **Open Browser Console** (F12 → Console tab)
2. **Clear the console** (to see fresh logs)
3. **Create or select a sale** that hasn't been sent to courier yet
4. **Click the Truck icon** to open the courier dialog
5. **Fill in the Special Instructions field** with some test text (e.g., "Handle with care")
6. **Click "Send to Steadfast"** (or your courier name)
7. **Watch the console logs**

## What to Look For in Console

### Frontend Logs (in Browser Console)

Look for these logs in order:

1. **Before sending:**
```
=== COURIER ORDER DEBUG ===
Courier Name: Steadfast
Is Steadfast: true
Is Pathao: false
Special Instruction: Handle with care
Payload being sent: {
  "sale_id": "...",
  "invoice_number": "...",
  ...
  "note": "Handle with care"  ← THIS SHOULD HAVE YOUR TEXT
}
=== END DEBUG ===
```

2. **After successful send:**
```
Processed order, consignment_id: SF123456789
Successfully updated sale locally with consignment_id: SF123456789
Update payload used: {
  "consignment_id": "SF123456789",
  "cn_number": "SF123456789",
  "courier_status": "in_review",
  "courier_notes": "Handle with care",  ← THIS SHOULD HAVE YOUR TEXT
  ...
}
```

3. **After dialog closes:**
```
Dispatching salesDataUpdated event
```

### Edge Function Logs (in Supabase Dashboard)

1. Go to **Supabase Dashboard** → **Edge Functions** → **steadfast-create-order** → **Logs**
2. Look for:
```
=== STEADFAST EDGE FUNCTION DEBUG ===
Received orderData: {
  ...
  "note": "Handle with care"  ← THIS SHOULD HAVE YOUR TEXT
}
orderData.note value: Handle with care
orderData.note type: string
Sending to Steadfast API: {
  ...
  "note": "Handle with care"  ← THIS SHOULD HAVE YOUR TEXT
}
=== END EDGE FUNCTION DEBUG ===
```

## Troubleshooting

### Issue 1: "note" field is empty or undefined in frontend logs

**Possible Causes:**
- The courier name doesn't match exactly "Steadfast" or "Pathao"
- The `isSteadfast` check is returning false

**Check:**
- Look at "Courier Name:" in the debug logs
- Look at "Is Steadfast:" - should be `true` for Steadfast

**Solution:**
- If courier name is something like "Steadfast Courier" or "SteadFast", the code should handle it (I made it case-insensitive and use `.includes()`)
- If it's still false, the courier name in your database might be different

### Issue 2: "note" field is in frontend payload but empty in edge function

**Possible Cause:**
- The edge function hasn't been deployed with the new logging

**Solution:**
- Deploy the edge function (see Step 2 above)

### Issue 3: Icon doesn't change after sending

**Possible Causes:**
1. Database update failed (check for error toast)
2. The `consignment_id` wasn't returned from API
3. The UI didn't refresh

**Check Console For:**
- "Successfully updated sale locally with consignment_id: ..." ← Should see this
- "Dispatching salesDataUpdated event" ← Should see this
- Any error messages

**Solutions:**
- If you see "Error updating sale locally:", there might be an RLS policy blocking the update
- If you see "No consignment_id received", the API didn't return a consignment ID
- Try manually refreshing the page (F5) to see if the icon changes

### Issue 4: CN Number not syncing

**Same as Issue 3** - the CN number is set to the same value as `consignment_id`

## Next Steps

1. **Apply the migration** (Step 1)
2. **Deploy the edge function** (Step 2)
3. **Test with console open** (Step 3)
4. **Share the console logs** with me if issues persist

The detailed logs will tell us exactly where the problem is:
- Is the note being captured in the frontend?
- Is it being sent to the edge function?
- Is the edge function sending it to Steadfast?
- Is the database update succeeding?
- Is the UI refresh happening?

## Files Modified

1. `src/components/CourierOrderDialog.tsx` - Added debugging logs and improved error handling
2. `supabase/functions/steadfast-create-order/index.ts` - Added debugging logs
3. `supabase/migrations/20260211_add_courier_notes_to_sales.sql` - Migration file (you created this)

## Important Notes

- The lint errors in the edge function file are **expected** and can be ignored (they're false positives from TypeScript not recognizing Deno's environment)
- The migration must be applied before the `courier_notes` field will work
- The edge function must be deployed for the new logging to appear
