-- Fix RLS performance: wrap auth.uid() in (select auth.uid()) so it's evaluated
-- once per query instead of re-evaluated for every row.
-- See: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- 1. activity_logs: Authenticated users can insert
DROP POLICY IF EXISTS "Authenticated users can insert activity_logs" ON public.activity_logs;
CREATE POLICY "Authenticated users can insert activity_logs"
  ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- 2. activity_logs: Users can view based on entity permissions
DROP POLICY IF EXISTS "Users can view activity_logs based on entity permissions" ON public.activity_logs;
CREATE POLICY "Users can view activity_logs based on entity permissions"
  ON public.activity_logs FOR SELECT
  USING (
    public.has_permission((select auth.uid()), 'logs.view')
    OR
    (entity_type = 'sales' AND public.has_permission((select auth.uid()), 'sales.view'))
  );

-- 3. business_settings
DROP POLICY IF EXISTS "Authenticated users can view business_settings" ON public.business_settings;
CREATE POLICY "Authenticated users can view business_settings"
  ON public.business_settings FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- 4. custom_settings
DROP POLICY IF EXISTS "Authenticated users can view custom_settings" ON public.custom_settings;
CREATE POLICY "Authenticated users can view custom_settings"
  ON public.custom_settings FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- 5. system_settings
DROP POLICY IF EXISTS "Authenticated users can view system_settings" ON public.system_settings;
CREATE POLICY "Authenticated users can view system_settings"
  ON public.system_settings FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- 6. woocommerce_import_logs
DROP POLICY IF EXISTS "System can insert woocommerce_import_logs" ON public.woocommerce_import_logs;
CREATE POLICY "System can insert woocommerce_import_logs"
  ON public.woocommerce_import_logs FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- 7. woocommerce_sync_logs
DROP POLICY IF EXISTS "System can insert woocommerce_sync_logs" ON public.woocommerce_sync_logs;
CREATE POLICY "System can insert woocommerce_sync_logs"
  ON public.woocommerce_sync_logs FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- 8. product_attribute_values: delete
DROP POLICY IF EXISTS "Users can delete product_attribute_values" ON public.product_attribute_values;
CREATE POLICY "Users can delete product_attribute_values"
  ON public.product_attribute_values FOR DELETE TO authenticated
  USING (public.has_permission((select auth.uid()), 'products.delete'));

-- 9. product_attributes: delete
DROP POLICY IF EXISTS "Users can delete product_attributes" ON public.product_attributes;
CREATE POLICY "Users can delete product_attributes"
  ON public.product_attributes FOR DELETE TO authenticated
  USING (public.has_permission((select auth.uid()), 'products.delete'));

-- 10. profiles: insert
DROP POLICY IF EXISTS "Users can insert own profile or admins can insert any" ON public.profiles;
CREATE POLICY "Users can insert own profile or admins can insert any"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK ((id = (select auth.uid())) OR public.user_has_role(ARRAY['admin']));

-- 11. product_attribute_values: insert
DROP POLICY IF EXISTS "Users can insert product_attribute_values" ON public.product_attribute_values;
CREATE POLICY "Users can insert product_attribute_values"
  ON public.product_attribute_values FOR INSERT TO authenticated
  WITH CHECK (public.has_permission((select auth.uid()), 'products.add'));

-- 12. product_attributes: insert
DROP POLICY IF EXISTS "Users can insert product_attributes" ON public.product_attributes;
CREATE POLICY "Users can insert product_attributes"
  ON public.product_attributes FOR INSERT TO authenticated
  WITH CHECK (public.has_permission((select auth.uid()), 'products.add'));

-- 13. product_attribute_values: update
DROP POLICY IF EXISTS "Users can update product_attribute_values" ON public.product_attribute_values;
CREATE POLICY "Users can update product_attribute_values"
  ON public.product_attribute_values FOR UPDATE TO authenticated
  USING (public.has_permission((select auth.uid()), 'products.edit'));

-- 14. product_attributes: update
DROP POLICY IF EXISTS "Users can update product_attributes" ON public.product_attributes;
CREATE POLICY "Users can update product_attributes"
  ON public.product_attributes FOR UPDATE TO authenticated
  USING (public.has_permission((select auth.uid()), 'products.edit'));

-- 15. user_roles: view own role
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
CREATE POLICY "Users can view own role"
  ON public.user_roles FOR SELECT TO authenticated
  USING ((user_id = (select auth.uid())) OR public.user_has_role(ARRAY['admin', 'manager']));

-- 16. product_attribute_values: view
DROP POLICY IF EXISTS "Users can view product_attribute_values" ON public.product_attribute_values;
CREATE POLICY "Users can view product_attribute_values"
  ON public.product_attribute_values FOR SELECT TO authenticated
  USING (public.has_permission((select auth.uid()), 'products.view'));

-- 17. product_attributes: view
DROP POLICY IF EXISTS "Users can view product_attributes" ON public.product_attributes;
CREATE POLICY "Users can view product_attributes"
  ON public.product_attributes FOR SELECT TO authenticated
  USING (public.has_permission((select auth.uid()), 'products.view'));

-- 18. reusable_attributes: view
DROP POLICY IF EXISTS "Users can view reusable_attributes" ON public.reusable_attributes;
CREATE POLICY "Users can view reusable_attributes"
  ON public.reusable_attributes FOR SELECT TO authenticated
  USING (public.has_permission((select auth.uid()), 'products.view'));

-- 19. courier_webhook_settings: view
DROP POLICY IF EXISTS "Users with courier permission can view courier_webhook_settings" ON public.courier_webhook_settings;
CREATE POLICY "Users with courier permission can view courier_webhook_settings"
  ON public.courier_webhook_settings FOR SELECT TO authenticated
  USING (
    public.user_has_role(ARRAY['admin'])
    OR public.has_permission((select auth.uid()), 'courier.send')
    OR public.has_permission((select auth.uid()), 'courier.refresh')
  );

-- 20. customers: add
DROP POLICY IF EXISTS "Users with permission can add customers" ON public.customers;
CREATE POLICY "Users with permission can add customers"
  ON public.customers FOR INSERT TO authenticated
  WITH CHECK (public.has_permission((select auth.uid()), 'customers.add'));

-- 21. inventory_logs: add
DROP POLICY IF EXISTS "Users with permission can add inventory_logs" ON public.inventory_logs;
CREATE POLICY "Users with permission can add inventory_logs"
  ON public.inventory_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission((select auth.uid()), 'inventory.adjust_stock')
    OR public.has_permission((select auth.uid()), 'products.edit')
  );

-- 22. products: add
DROP POLICY IF EXISTS "Users with permission can add products" ON public.products;
CREATE POLICY "Users with permission can add products"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.has_permission((select auth.uid()), 'products.add'));

-- 23. product_variants: add
DROP POLICY IF EXISTS "Users with permission can add variants" ON public.product_variants;
CREATE POLICY "Users with permission can add variants"
  ON public.product_variants FOR INSERT TO authenticated
  WITH CHECK (public.has_permission((select auth.uid()), 'products.add'));

-- 24. sales: create
DROP POLICY IF EXISTS "Users with permission can create sales" ON public.sales;
CREATE POLICY "Users with permission can create sales"
  ON public.sales FOR INSERT TO authenticated
  WITH CHECK (public.has_permission((select auth.uid()), 'sales.create'));

-- 25. sale_items: insert
DROP POLICY IF EXISTS "Users with permission can insert sale_items" ON public.sale_items;
CREATE POLICY "Users with permission can insert sale_items"
  ON public.sale_items FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission((select auth.uid()), 'sales.create')
    OR public.has_permission((select auth.uid()), 'sales.edit')
  );

-- 26. sale_payments: insert
DROP POLICY IF EXISTS "Users with permission can insert sale_payments" ON public.sale_payments;
CREATE POLICY "Users with permission can insert sale_payments"
  ON public.sale_payments FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission((select auth.uid()), 'sales.create')
    OR public.has_permission((select auth.uid()), 'sales.edit')
  );

-- 27. sales_items: insert
DROP POLICY IF EXISTS "Users with permission can insert sales_items" ON public.sales_items;
CREATE POLICY "Users with permission can insert sales_items"
  ON public.sales_items FOR INSERT TO authenticated
  WITH CHECK (public.has_permission((select auth.uid()), 'sales.create'));

-- 28. products: view
DROP POLICY IF EXISTS "Users with permission can view products" ON public.products;
CREATE POLICY "Users with permission can view products"
  ON public.products FOR SELECT TO authenticated
  USING (public.has_permission((select auth.uid()), 'products.view'));

-- 29. sales_items: view
DROP POLICY IF EXISTS "Users with permission can view sales_items" ON public.sales_items;
CREATE POLICY "Users with permission can view sales_items"
  ON public.sales_items FOR SELECT TO authenticated
  USING (public.has_permission((select auth.uid()), 'sales.view'));

-- 30. product_variants: view
DROP POLICY IF EXISTS "Users with permission can view variants" ON public.product_variants;
CREATE POLICY "Users with permission can view variants"
  ON public.product_variants FOR SELECT TO authenticated
  USING (public.has_permission((select auth.uid()), 'products.view'));
