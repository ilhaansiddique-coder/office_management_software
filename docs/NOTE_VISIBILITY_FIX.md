# 📝 Note Visibility Fix Deployed

I've updated the courier integration to ensure your notes are seen by Steadfast.

## 🔧 The Fix:
Since the `note` field wasn't showing up reliably in the Steadfast portal, I've added a fail-safe:

**Your special instructions are now AUTOMATICALLY added to the `Item Description`.**

Example:
- Item: `T-Shirt`
- Note: `Fragile`
- **Sent to Steadfast as:** `T-Shirt | Note: Fragile`

This guarantees the instruction appears on the **shipping label** and in the **portal description**, making it impossible for the courier to miss.

## 🧪 How to Test:
1. **Send a new order** to courier with a note.
2. Check the Steadfast portal.
3. Look at the **Description** field - your note will be there!
