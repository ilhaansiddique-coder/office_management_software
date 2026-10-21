# 🛡️ Supabase RLS (Row Level Security) Verification Guide

## What is RLS?

Row Level Security (RLS) is a critical security feature that ensures users can only access data they're authorized to see. **Without RLS, your anon key would allow anyone to read/write ALL data in your database!**

---

## ✅ How to Verify RLS is Enabled

### Method 1: Supabase Dashboard (Recommended)

1. **Go to your Supabase Project:**
   - URL: https://supabase.com/dashboard/project/smopyfuaijaklmtpwgws

2. **Navigate to Table Editor:**
   - Click **Table Editor** in the left sidebar

3. **Check Each Table:**
   For each table, you should see a **shield icon (🛡️)** next to tables with RLS enabled.

4. **Enable RLS on Tables Without It:**
   - Click on a table
   - Click the **"RLS disabled"** warning banner
   - Click **"Enable RLS"**

### Method 2: SQL Editor

1. **Go to SQL Editor:**
   - URL: https://supabase.com/dashboard/project/smopyfuaijaklmtpwgws/sql

2. **Run this query to check all tables:**

```sql
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

3. **Expected Result:**
   - `rls_enabled` should be `true` for ALL tables

---

## 📋 Critical Tables That MUST Have RLS

Based on your application, these tables are critical:

### Core Tables
- ✅ `profiles` - User profile data
- ✅ `user_roles` - User role assignments
- ✅ `products` - Product inventory
- ✅ `product_variants` - Product variations
- ✅ `sales` - Sales transactions
- ✅ `sale_items` - Sale line items
- ✅ `customers` - Customer information
- ✅ `business_settings` - Business configuration
- ✅ `system_settings` - System configuration
- ✅ `activity_logs` - Activity tracking

### Supporting Tables
- ✅ `sale_payments` - Payment records
- ✅ `courier_orders` - Courier tracking
- ✅ `invoices` - Invoice records

---

## 🔧 How to Enable RLS on a Table

### Via Dashboard:
1. Go to **Table Editor**
2. Select the table
3. Click **"Enable RLS"** in the warning banner

### Via SQL:
```sql
-- Enable RLS on a table
ALTER TABLE public.your_table_name ENABLE ROW LEVEL SECURITY;

-- Example: Enable RLS on products table
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
```

---

## 📝 Example RLS Policies

After enabling RLS, you need to create policies. Here are examples:

### 1. Profiles Table (Users can only see their own profile)
```sql
-- Allow users to read their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = id);

-- Allow users to update their own profile
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id);
```

### 2. Products Table (All authenticated users can read)
```sql
-- Allow authenticated users to read products
CREATE POLICY "Authenticated users can view products"
ON public.products
FOR SELECT
TO authenticated
USING (true);

-- Only users with product.create permission can insert
CREATE POLICY "Users with permission can create products"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'manager')
  )
);
```

### 3. Sales Table (Users can only see sales they created or have permission to view)
```sql
-- Users can view sales they created
CREATE POLICY "Users can view own sales"
ON public.sales
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'manager')
  )
);
```

---

## 🚨 Security Advisors Check

Supabase has built-in security advisors. Check them:

1. **Go to Advisors:**
   - URL: https://supabase.com/dashboard/project/smopyfuaijaklmtpwgws/advisors/security

2. **Review All Warnings:**
   - Look for "RLS is disabled" warnings
   - Fix each one before going to production

---

## ✅ Verification Checklist

Run through this checklist:

### RLS Status
- [ ] All public tables have RLS enabled
- [ ] No "RLS disabled" warnings in Table Editor
- [ ] Security advisors show no RLS issues

### Policy Coverage
- [ ] Every table has at least one SELECT policy
- [ ] INSERT policies restrict who can create records
- [ ] UPDATE policies restrict who can modify records
- [ ] DELETE policies restrict who can delete records

### Testing
- [ ] Test as regular user - can only see authorized data
- [ ] Test as admin - can see all data
- [ ] Test as unauthenticated - cannot access protected data
- [ ] Verify anon key cannot bypass RLS

---

## 🧪 How to Test RLS

### Test 1: Try to access data without authentication
```javascript
// This should FAIL or return empty results
const { data, error } = await supabase
  .from('sales')
  .select('*');

console.log(data); // Should be empty or error
```

### Test 2: Try to access another user's data
```javascript
// As User A, try to access User B's data
// This should FAIL or return empty
const { data, error } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', 'other-user-id');

console.log(data); // Should be empty or error
```

### Test 3: Verify admin can access all data
```javascript
// As admin user
const { data, error } = await supabase
  .from('sales')
  .select('*');

console.log(data); // Should return all sales
```

---

## 🔗 Useful Resources

- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [RLS Policy Examples](https://supabase.com/docs/guides/auth/row-level-security#policies)
- [Security Best Practices](https://supabase.com/docs/guides/auth/security)

---

## ⚠️ CRITICAL WARNING

**DO NOT deploy to production until:**
1. ✅ RLS is enabled on ALL public tables
2. ✅ Appropriate policies are created for each table
3. ✅ You've tested that unauthorized access is blocked
4. ✅ Security advisors show no critical issues

**Without RLS, anyone with your anon key can access ALL your data!**

---

## 📞 Need Help?

If you're unsure about RLS policies:
1. Check your existing schema.sql file for policy examples
2. Review Supabase security advisors
3. Test thoroughly before production deployment
