# Sundorban Status Check Edge Function

## Deployment Instructions

1. **Go to Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard/project/smopyfuaijaklmtpwgws/functions

2. **Create New Function**
   - Click "Create a new function"
   - Name: `sundorban-status-check`

3. **Copy the Code**
   - Copy all content from `supabase/functions/sundorban-status-check/index.ts`
   - Paste into the function editor

4. **Deploy Settings**
   - **Verify JWT**: Turn OFF (same as steadfast-status-check)
   - Click "Deploy"

## How It Works

This Edge Function:
- Accepts a `cn_number` (consignment number) in the request body
- Calls Sundorban's tracking API at `https://tracking.sundarbancourierltd.com/Home/getDatabyCN`
- Uses the API key: `CzbZcWnwf7TNTzluD9rxyXCUqzN4xOhs`
- Returns the delivery status

## Request Format

```json
{
  "cn_number": "YOUR_CN_NUMBER"
}
```

## Response Format

```json
{
  "success": true,
  "message": "Status check successful",
  "data": {
    "cnNumber": "...",
    "status": "..."
  },
  "delivery_status": "...",
  "mapped_status": "..."
}
```

## Frontend Integration

The function is automatically called for sales with:
- `courier_name` = "Sundorban"
- A valid `cn_number` or `consignment_id`

Both manual refresh and auto-refresh are supported.
