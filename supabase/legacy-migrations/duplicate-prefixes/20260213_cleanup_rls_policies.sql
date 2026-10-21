-- SECURITY CLEANUP: Remove overly permissive and duplicate RLS policies
-- Run this AFTER the secure_rls_policies.sql migration

-- ============================================================================
-- ACTIVITY_LOGS - Remove overly permissive SELECT
-- ============================================================================
DROP POLICY IF EXISTS "activity_logs_select_policy" ON public.activity_logs;

-- Replace with admin/manager only view
CREATE POLICY "Only admins and managers can view activity_logs"
  ON public.activity_logs
  FOR SELECT
  TO authenticated
  USING (public.user_has_role(ARRAY['admin', 'manager']));

-- Fix INSERT to require authentication check
DROP POLICY IF EXISTS "activity_logs_insert_policy" ON public.activity_logs;
CREATE POLICY "Authenticated users can insert activity_logs"
  ON public.activity_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- BUSINESS_SETTINGS - Remove duplicate/conflicting policies
-- ============================================================================
DROP POLICY IF EXISTS "Everyone can view business settings" ON public.business_settings;
DROP POLICY IF EXISTS "Admins can insert business settings" ON public.business_settings;
DROP POLICY IF EXISTS "Admins can update business settings" ON public.business_settings;
DROP POLICY IF EXISTS "Admins can delete business settings" ON public.business_settings;
-- Keep only the user_has_role based policies

-- ============================================================================
-- COURIER_WEBHOOK_SETTINGS - Remove overly permissive ALL policy
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can manage courier webhook settings" ON public.courier_webhook_settings;
-- Keep only the admin-only policies

-- ============================================================================
-- CUSTOM_SETTINGS - Remove overly permissive ALL policy
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can manage custom settings" ON public.custom_settings;
-- Keep only the admin policies with user_has_role

-- ============================================================================
-- PRODUCTS - Tighten SELECT to permission-based
-- ============================================================================
DROP POLICY IF EXISTS "Anyone can view products" ON public.products;
CREATE POLICY "Users with permission can view products"
  ON public.products
  FOR SELECT
  TO authenticated
  USING (has_permission(auth.uid(), 'products.view'));

-- Fix INSERT to require permission
DROP POLICY IF EXISTS "Can add products" ON public.products;
CREATE POLICY "Users with permission can add products"
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'products.create'));

-- ============================================================================
-- PRODUCT_VARIANTS - Tighten SELECT to permission-based
-- ============================================================================
DROP POLICY IF EXISTS "Can view variants" ON public.product_variants;
CREATE POLICY "Users with permission can view variants"
  ON public.product_variants
  FOR SELECT
  TO authenticated
  USING (has_permission(auth.uid(), 'products.view'));

-- Fix INSERT to require permission
DROP POLICY IF EXISTS "Can add variants" ON public.product_variants;
CREATE POLICY "Users with permission can add variants"
  ON public.product_variants
  FOR INSERT
  TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'products.create'));

-- ============================================================================
-- PRODUCT_ATTRIBUTES - Replace overly permissive ALL policy
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can manage product attributes" ON public.product_attributes;

CREATE POLICY "Users can view product_attributes"
  ON public.product_attributes
  FOR SELECT
  TO authenticated
  USING (has_permission(auth.uid(), 'products.view'));

CREATE POLICY "Users can insert product_attributes"
  ON public.product_attributes
  FOR INSERT
  TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'products.create'));

CREATE POLICY "Users can update product_attributes"
  ON public.product_attributes
  FOR UPDATE
  TO authenticated
  USING (has_permission(auth.uid(), 'products.edit'));

CREATE POLICY "Users can delete product_attributes"
  ON public.product_attributes
  FOR DELETE
  TO authenticated
  USING (has_permission(auth.uid(), 'products.delete'));

-- ============================================================================
-- PRODUCT_ATTRIBUTE_VALUES - Replace overly permissive ALL policy
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can manage product attribute values" ON public.product_attribute_values;

CREATE POLICY "Users can view product_attribute_values"
  ON public.product_attribute_values
  FOR SELECT
  TO authenticated
  USING (has_permission(auth.uid(), 'products.view'));

CREATE POLICY "Users can insert product_attribute_values"
  ON public.product_attribute_values
  FOR INSERT
  TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'products.create'));

CREATE POLICY "Users can update product_attribute_values"
  ON public.product_attribute_values
  FOR UPDATE
  TO authenticated
  USING (has_permission(auth.uid(), 'products.edit'));

CREATE POLICY "Users can delete product_attribute_values"
  ON public.product_attribute_values
  FOR DELETE
  TO authenticated
  USING (has_permission(auth.uid(), 'products.delete'));

-- ============================================================================
-- REUSABLE_ATTRIBUTES - Replace overly permissive ALL policy
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can manage reusable attributes" ON public.reusable_attributes;

CREATE POLICY "Users can view reusable_attributes"
  ON public.reusable_attributes
  FOR SELECT
  TO authenticated
  USING (has_permission(auth.uid(), 'products.view'));

CREATE POLICY "Admins can insert reusable_attributes"
  ON public.reusable_attributes
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_role(ARRAY['admin', 'manager']));

CREATE POLICY "Admins can update reusable_attributes"
  ON public.reusable_attributes
  FOR UPDATE
  TO authenticated
  USING (public.user_has_role(ARRAY['admin', 'manager']));

CREATE POLICY "Admins can delete reusable_attributes"
  ON public.reusable_attributes
  FOR DELETE
  TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

-- ============================================================================
-- SALES_ITEMS - Remove overly permissive SELECT and fix public INSERT
-- ============================================================================
DROP POLICY IF EXISTS "Legacy items readonly" ON public.sales_items;
DROP POLICY IF EXISTS "Can create sale items" ON public.sales_items;

CREATE POLICY "Users with permission can view sales_items"
  ON public.sales_items
  FOR SELECT
  TO authenticated
  USING (has_permission(auth.uid(), 'sales.view'));

CREATE POLICY "Users with permission can insert sales_items"
  ON public.sales_items
  FOR INSERT
  TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'sales.create'));

-- ============================================================================
-- SYSTEM_SETTINGS - Remove duplicate SELECT policies
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can view system settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins can manage system settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins can update system settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins can delete system settings" ON public.system_settings;
-- Keep only the user_has_role based policies

-- ============================================================================
-- USER_ROLES - Remove overly permissive SELECT
-- ============================================================================
DROP POLICY IF EXISTS "Users can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users with manage_roles can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users with manage_roles can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users with manage_roles can delete roles" ON public.user_roles;
-- Keep only the user_has_role based policies

-- ============================================================================
-- WOOCOMMERCE_CONNECTIONS - Remove conflicting ALL policy
-- ============================================================================
DROP POLICY IF EXISTS "Users can manage their own WooCommerce connections" ON public.woocommerce_connections;
-- Keep only the admin-only policies

-- ============================================================================
-- WOOCOMMERCE_SYNC_SCHEDULES - Replace overly permissive ALL policy
-- ============================================================================
DROP POLICY IF EXISTS "Users can manage their own WooCommerce sync schedules" ON public.woocommerce_sync_schedules;

CREATE POLICY "Admins can view woocommerce_sync_schedules"
  ON public.woocommerce_sync_schedules
  FOR SELECT
  TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

CREATE POLICY "Admins can insert woocommerce_sync_schedules"
  ON public.woocommerce_sync_schedules
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_role(ARRAY['admin']));

CREATE POLICY "Admins can update woocommerce_sync_schedules"
  ON public.woocommerce_sync_schedules
  FOR UPDATE
  TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

CREATE POLICY "Admins can delete woocommerce_sync_schedules"
  ON public.woocommerce_sync_schedules
  FOR DELETE
  TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

-- ============================================================================
-- WOOCOMMERCE_IMPORT_LOGS - Tighten to admin only
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own WooCommerce import logs" ON public.woocommerce_import_logs;

CREATE POLICY "Admins can view woocommerce_import_logs"
  ON public.woocommerce_import_logs
  FOR SELECT
  TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

CREATE POLICY "System can insert woocommerce_import_logs"
  ON public.woocommerce_import_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- WOOCOMMERCE_SYNC_LOGS - Tighten to admin only
-- ============================================================================
DROP POLICY IF EXISTS "Users can view their own WooCommerce sync logs" ON public.woocommerce_sync_logs;

CREATE POLICY "Admins can view woocommerce_sync_logs"
  ON public.woocommerce_sync_logs
  FOR SELECT
  TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

CREATE POLICY "System can insert woocommerce_sync_logs"
  ON public.woocommerce_sync_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- SECURITY_AUDIT_LOGS (different table) - Fix overly permissive
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can view security audit logs" ON public.security_audit_logs;

CREATE POLICY "Only admins can view security_audit_logs"
  ON public.security_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

-- ============================================================================
-- CUSTOMERS - Fix INSERT to require permission
-- ============================================================================
DROP POLICY IF EXISTS "Can add customers" ON public.customers;
CREATE POLICY "Users with permission can add customers"
  ON public.customers
  FOR INSERT
  TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'customers.create'));

-- ============================================================================
-- SALES - Fix INSERT to require permission
-- ============================================================================
DROP POLICY IF EXISTS "Can create sales" ON public.sales;
CREATE POLICY "Users with permission can create sales"
  ON public.sales
  FOR INSERT
  TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'sales.create'));

-- ============================================================================
-- INVENTORY_LOGS - Fix INSERT to require permission
-- ============================================================================
DROP POLICY IF EXISTS "Can create inventory logs" ON public.inventory_logs;
CREATE POLICY "Users with permission can create inventory_logs"
  ON public.inventory_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'inventory.create') OR has_permission(auth.uid(), 'products.edit'));

-- ============================================================================
-- PROFILES - Fix INSERT to be more restrictive
-- ============================================================================
DROP POLICY IF EXISTS "Users or admins can insert profiles" ON public.profiles;
CREATE POLICY "Users can insert own profile or admins can insert any"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid() OR public.user_has_role(ARRAY['admin']));

-- ============================================================================
-- ROLE_PERMISSIONS - Fix INSERT
-- ============================================================================
DROP POLICY IF EXISTS "Users with manage_permissions can insert role permissions" ON public.role_permissions;
CREATE POLICY "Admins can insert role_permissions"
  ON public.role_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_role(ARRAY['admin']));

-- ============================================================================
-- SALE_ITEMS - Fix INSERT
-- ============================================================================
DROP POLICY IF EXISTS "Users with sales permissions can insert sale items" ON public.sale_items;
CREATE POLICY "Users with permission can insert sale_items"
  ON public.sale_items
  FOR INSERT
  TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'sales.create') OR has_permission(auth.uid(), 'sales.edit'));

-- ============================================================================
-- SALE_PAYMENTS - Fix INSERT
-- ============================================================================
DROP POLICY IF EXISTS "Users with sales permissions can insert payments" ON public.sale_payments;
CREATE POLICY "Users with permission can insert sale_payments"
  ON public.sale_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (has_permission(auth.uid(), 'sales.create') OR has_permission(auth.uid(), 'sales.edit'));

-- ============================================================================
-- COURIER_PAYMENT_RULES - Fix INSERT
-- ============================================================================
DROP POLICY IF EXISTS "Managers and admins can insert courier payment rules" ON public.courier_payment_rules;
CREATE POLICY "Admins and managers can insert courier_payment_rules"
  ON public.courier_payment_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_role(ARRAY['admin', 'manager']));

-- ============================================================================
-- PAYMENT_METHODS - Fix INSERT
-- ============================================================================
DROP POLICY IF EXISTS "Managers and admins can insert payment methods" ON public.payment_methods;
CREATE POLICY "Admins and managers can insert payment_methods"
  ON public.payment_methods
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_role(ARRAY['admin', 'manager']));

-- ============================================================================
-- Final verification comment
-- ============================================================================
COMMENT ON SCHEMA public IS 'RLS policies cleaned up and secured';
