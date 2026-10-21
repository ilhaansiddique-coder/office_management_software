# Special Instructions / Note Debugging Guide

## ✅ What's Working:
- CN number sync ✓
- Icon change to "View Details" ✓
- Note is being sent from frontend (`"note": "test"`) ✓

## 🔍 What We Need to Verify:

The note IS being sent to the Steadfast API. Now we need to check if:
1. Steadfast is accepting it
2. Steadfast is displaying it in their portal

## 🧪 Testing Steps:

### Step 1: Check Edge Function Logs

1. Go to: https://supabase.com/dashboard/project/smopyfuaijaklmtpwgws/functions/steadfast-create-order/logs
2. Send a new test order with special instructions (e.g., "Handle with care - FRAGILE")
3. Look for these logs in order:

```
=== STEADFAST EDGE FUNCTION DEBUG ===
Received orderData: {
  ...
  "note": "Handle with care - FRAGILE"  ← Should show your text
}
orderData.note value: Handle with care - FRAGILE
orderData.note type: string

Sending to Steadfast API: {
  ...
  "note": "Handle with care - FRAGILE"  ← Should show your text
}
=== END EDGE FUNCTION DEBUG ===
```

Then look for:

```
=== STEADFAST RESPONSE DETAILS ===
Full consignment object: {
  "consignment_id": "217854XXX",
  "note": "Handle with care - FRAGILE",  ← Check if Steadfast returns the note
  ...
}

Steadfast order created: {
  consignment_id: 217854XXX,
  note: "Handle with care - FRAGILE"  ← Should show the note
}
=== END STEADFAST RESPONSE DETAILS ===
```

### Step 2: Check Steadfast Portal

1. Log in to: https://portal.steadfast.com.bd/
2. Go to your consignments/orders
3. Find the order you just created (use the consignment ID from logs)
4. Click to view details
5. Look for a "Note" or "Instructions" or "Special Instructions" field

### Step 3: Check Our Database

The note is also saved to our database in the `courier_notes` field.

1. Go to: https://supabase.com/dashboard/project/smopyfuaijaklmtpwgws/editor
2. Open the `sales` table
3. Find the sale you just sent
4. Check the `courier_notes` column - it should have your text

## 🎯 What the Logs Will Tell Us:

### Scenario A: Note is in "Sending to Steadfast API" but NOT in "Full consignment object"
**Meaning**: Steadfast received the note but didn't include it in their response
**Action**: This is normal - Steadfast might not return the note in the response even though they saved it. Check the Steadfast portal to confirm.

### Scenario B: Note is NOT in "Sending to Steadfast API"
**Meaning**: The note isn't reaching the edge function
**Action**: There's an issue with the frontend payload. Share the browser console logs.

### Scenario C: Note is in both logs
**Meaning**: Everything is working! The note is being sent and Steadfast is accepting it.
**Action**: Check the Steadfast portal to see if it's displayed there.

## 📋 Quick Checklist:

After sending a test order:

- [ ] Check browser console - note should be in payload
- [ ] Check edge function logs - note should be sent to Steadfast
- [ ] Check edge function logs - note might be in Steadfast response
- [ ] Check Steadfast portal - note should be visible in order details
- [ ] Check database - `courier_notes` field should have the note

## 🔧 If Note is NOT in Steadfast Portal:

This could mean:
1. **Steadfast doesn't display notes in their portal UI** (even though they accept them)
   - Some courier APIs accept notes but don't show them prominently
   - The note might be used internally by Steadfast for delivery instructions
   
2. **Steadfast requires a different field name**
   - Though the API docs say "note" is correct
   
3. **There's a character limit or format issue**
   - Try a simple note like "Test" first
   - Steadfast supports up to 480 characters

## 📞 Next Steps:

1. **Send a test order** with a simple note like "TEST NOTE"
2. **Check the edge function logs** (link above)
3. **Check the Steadfast portal**
4. **Share the results** - specifically:
   - What you see in the edge function logs
   - Whether the note appears in Steadfast portal
   - What the `courier_notes` field shows in the database

The comprehensive logging I added will show us exactly what's happening at each step!
