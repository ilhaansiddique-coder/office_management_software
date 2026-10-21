


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'manager',
    'staff'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_stock_on_sales_items"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  pay_status text;
  courier_status_val text;
  delta int;
  prod_id uuid := coalesce(new.product_id, old.product_id);
  var_id uuid := coalesce(new.variant_id, old.variant_id);
  cancelled_statuses text[] := array['cancelled','returned','lost'];
begin
  select payment_status, courier_status into pay_status, courier_status_val
  from public.sales where id = coalesce(new.sale_id, old.sale_id);

  if pay_status = 'cancelled' or courier_status_val = any(cancelled_statuses) then
    return coalesce(old, new);
  end if;

  if tg_op = 'INSERT' then
    delta := -new.quantity;
  elsif tg_op = 'DELETE' then
    delta := old.quantity;
  elsif tg_op = 'UPDATE' then
    delta := old.quantity - new.quantity;
  end if;

  update public.products
    set stock_quantity = coalesce(stock_quantity,0) + delta
    where id = prod_id;

  if var_id is not null then
    update public.product_variants
      set stock_quantity = coalesce(stock_quantity,0) + delta
      where id = var_id;
  end if;

  return coalesce(old, new);
end;
$$;


ALTER FUNCTION "public"."adjust_stock_on_sales_items"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_stock_on_sales_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  old_cancelled boolean;
  new_cancelled boolean;
  cancelled_statuses text[] := array['cancelled','returned','lost'];
  rec record;
  delta int;
begin
  old_cancelled := (old.payment_status = 'cancelled') or (old.courier_status = any(cancelled_statuses));
  new_cancelled := (new.payment_status = 'cancelled') or (new.courier_status = any(cancelled_statuses));

  if old_cancelled = new_cancelled then
    return new;
  end if;

  for rec in
    select product_id, variant_id, quantity
    from public.sales_items
    where sale_id = new.id
  loop
    if not old_cancelled and new_cancelled then
      delta := rec.quantity;         -- restore stock
    elsif old_cancelled and not new_cancelled then
      delta := -rec.quantity;        -- deduct stock
    else
      delta := 0;
    end if;

    if delta <> 0 then
      update public.products
        set stock_quantity = coalesce(stock_quantity,0) + delta
        where id = rec.product_id;

      if rec.variant_id is not null then
        update public.product_variants
          set stock_quantity = coalesce(stock_quantity,0) + delta
          where id = rec.variant_id;
      end if;
    end if;
  end loop;

  return new;
end;
$$;


ALTER FUNCTION "public"."adjust_stock_on_sales_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_user_safely"("target_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
begin
  -- remove app data
  delete from public.user_roles where user_id = target_user_id;
  delete from public.profiles where id = target_user_id;

  -- remove auth user
  delete from auth.users where id = target_user_id;
end;
$$;


ALTER FUNCTION "public"."delete_user_safely"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_invoice_number"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  next_number integer;
  invoice_num text;
begin
  select coalesce(max(cast(substring(invoice_number from 4) as integer)), 0) + 1
    into next_number
  from public.sales
  where invoice_number ~ '^INV[0-9]+$';

  invoice_num := 'INV' || lpad(next_number::text, 6, '0');
  return invoice_num;
end;
$_$;


ALTER FUNCTION "public"."generate_invoice_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_all_users_with_roles"() RETURNS TABLE("id" "uuid", "email" "text", "full_name" "text", "phone" "text", "role" "public"."user_role", "created_at" timestamp with time zone, "last_sign_in_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
  SELECT
    u.id,
    u.email,
    coalesce(p.full_name, 'N/A') AS full_name,
    p.phone,
    coalesce(ur.role, 'staff'::public.user_role) AS role,
    u.created_at,
    u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.user_roles ur ON ur.user_id = u.id
$$;


ALTER FUNCTION "public"."get_all_users_with_roles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (new.id, COALESCE(new.raw_user_meta_data ->> 'full_name', 'User'));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    new.id,
    CASE WHEN (SELECT COUNT(*) FROM auth.users) = 1 THEN 'admin'::public.user_role ELSE 'staff'::public.user_role END
  );

  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'extensions'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE role = 'admin'::public.user_role
  );
$$;


ALTER FUNCTION "public"."has_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."user_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."user_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_created_by"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'auth', 'extensions'
    AS $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_created_by"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."business_settings" (
    "low_stock_alert_quantity" integer DEFAULT 10,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "business_name" "text" DEFAULT 'Your Business Name'::"text" NOT NULL,
    "invoice_prefix" "text" DEFAULT 'INV'::"text",
    "logo_url" "text",
    "phone" "text",
    "whatsapp" "text",
    "email" "text",
    "facebook" "text",
    "address" "text",
    "created_by" "uuid",
    "primary_email" "text",
    "secondary_email" "text",
    "address_line1" "text",
    "address_line2" "text",
    "business_hours" "text",
    "invoice_footer_message" "text" DEFAULT 'ধন্যবাদ আপনার সাথে ব্যবসা করার জন্য'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "brand_color" "text" DEFAULT '#2c7be5'::"text"
);


ALTER TABLE "public"."business_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."courier_webhook_settings" (
    "status_check_webhook_url" "text" NOT NULL,
    "webhook_url" "text" NOT NULL,
    "webhook_description" "text",
    "auth_username" "text",
    "auth_password" "text",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "webhook_name" "text" DEFAULT 'Courier Webhook'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."courier_webhook_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_settings" (
    "setting_type" "text" NOT NULL,
    "content" "text",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_enabled" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "custom_settings_setting_type_check" CHECK (("setting_type" = ANY (ARRAY['custom_css'::"text", 'head_snippet'::"text", 'body_snippet'::"text"])))
);


ALTER TABLE "public"."custom_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "email" character varying,
    "delivered_count" integer DEFAULT 0,
    "name" "text" NOT NULL,
    "phone" "text",
    "address" "text",
    "whatsapp" "text",
    "created_by" "uuid",
    "last_purchase_date" timestamp with time zone,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "total_spent" numeric DEFAULT 0,
    "order_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'inactive'::"text",
    "cancelled_count" integer DEFAULT 0,
    "additional_info" "text",
    CONSTRAINT "customers_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'neutral'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dismissed_alerts" (
    "user_id" "uuid" NOT NULL,
    "alert_id" "text" NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dismissed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dismissed_alerts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_logs" (
    "product_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "reason" "text",
    "created_by" "uuid",
    "variant_id" "uuid",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "inventory_logs_type_check" CHECK (("type" = ANY (ARRAY['in'::"text", 'out'::"text", 'adjustment'::"text", 'sale'::"text", 'purchase'::"text", 'return'::"text"])))
);


ALTER TABLE "public"."inventory_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_attribute_values" (
    "attribute_id" "uuid" NOT NULL,
    "value" "text" NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_attribute_values" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_attributes" (
    "product_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_attributes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_variants" (
    "product_id" "uuid" NOT NULL,
    "attributes" "jsonb" NOT NULL,
    "sku" "text",
    "rate" numeric,
    "cost" numeric,
    "low_stock_threshold" integer,
    "image_url" "text",
    "woocommerce_id" integer,
    "last_synced_at" timestamp with time zone,
    "woocommerce_connection_id" "uuid",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stock_quantity" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_variants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "name" "text" NOT NULL,
    "image_url" "text",
    "size" "text",
    "color" "text",
    "sku" "text",
    "rate" numeric NOT NULL,
    "cost" numeric,
    "created_by" "uuid",
    "woocommerce_id" integer,
    "woocommerce_connection_id" "uuid",
    "last_synced_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stock_quantity" integer DEFAULT 0,
    "low_stock_threshold" integer DEFAULT 10,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "has_variants" boolean DEFAULT false NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "phone" "text",
    "full_name" "text" DEFAULT 'Unknown User'::"text" NOT NULL,
    "role" "text" DEFAULT 'user'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reusable_attributes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "name" "text",
    "display_name" "text",
    "type" "text" DEFAULT '''text'''::"text",
    "options" "jsonb",
    "is_required" boolean DEFAULT false,
    CONSTRAINT "reusable_attributes_display_name_check" CHECK (("length"("display_name") <= 100)),
    CONSTRAINT "reusable_attributes_name_check" CHECK (("length"("name") <= 100)),
    CONSTRAINT "reusable_attributes_type_check" CHECK (("type" = ANY (ARRAY['text'::"text", 'select'::"text", 'number'::"text", 'color'::"text", 'size'::"text"])))
);


ALTER TABLE "public"."reusable_attributes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "role" "public"."user_role" NOT NULL,
    "permission_key" "text" NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "allowed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sale_items" (
    "product_id" "uuid",
    "variant_id" "uuid",
    "total_price" numeric NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quantity" integer NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sale_id" "uuid" NOT NULL,
    "unit_price" numeric NOT NULL,
    CONSTRAINT "sale_items_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "sale_items_total_price_check" CHECK (("total_price" >= (0)::numeric)),
    CONSTRAINT "sale_items_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."sale_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales" (
    "webhook_updated_at" timestamp with time zone,
    "fee" numeric DEFAULT 0.00,
    "total_amount" numeric DEFAULT 0.00,
    "status" "text" DEFAULT 'completed'::"text",
    "city" "text",
    "zone" "text",
    "area" "text",
    "merchant_order_id" "text",
    "invoice_number" "text" NOT NULL,
    "customer_id" "uuid",
    "customer_name" "text" NOT NULL,
    "customer_phone" "text",
    "customer_address" "text",
    "customer_whatsapp" "text",
    "subtotal" numeric NOT NULL,
    "grand_total" numeric NOT NULL,
    "payment_method" "text" NOT NULL,
    "created_by" "uuid",
    "consignment_id" "text",
    "last_status_check" timestamp with time zone,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "discount_percent" numeric DEFAULT 0,
    "discount_amount" numeric DEFAULT 0,
    "amount_paid" numeric DEFAULT 0,
    "amount_due" numeric DEFAULT 0,
    "payment_status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "order_status" "text" DEFAULT 'pending'::"text",
    "courier_status" "text" DEFAULT 'not_sent'::"text",
    "charge" numeric DEFAULT 0 NOT NULL,
    "order_status_slug" "text",
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    "additional_info" "text",
    "cn_number" "text",
    "courier_name" "text",
    "review_amount_paid" numeric,
    "review_amount_due" numeric,
    "status_backup_payment_status" "text",
    "status_backup_amount_paid" numeric,
    "status_backup_amount_due" numeric,
    CONSTRAINT "sales_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'partial'::"text", 'paid'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."sales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_items" (
    "sale_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "product_name" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "rate" numeric NOT NULL,
    "total" numeric NOT NULL,
    "variant_id" "uuid",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sale_price" numeric
);


ALTER TABLE "public"."sales_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_audit_logs" (
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "uuid",
    "ip_address" "inet",
    "user_agent" "text",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."security_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "currency_symbol" "text" DEFAULT '৳'::"text",
    "currency_code" "text" DEFAULT 'BDT'::"text",
    "timezone" "text" DEFAULT 'Asia/Dhaka'::"text",
    "date_format" "text" DEFAULT 'DD/MM/YYYY'::"text",
    "time_format" "text" DEFAULT 'HH:mm'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_preferences" (
    "user_id" "uuid" NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email_notifications" boolean DEFAULT true NOT NULL,
    "low_stock_alerts" boolean DEFAULT true NOT NULL,
    "sales_reports" boolean DEFAULT true NOT NULL,
    "dark_mode" boolean DEFAULT false NOT NULL,
    "compact_view" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "user_id" "uuid" NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "role" "public"."user_role" DEFAULT 'staff'::"public"."user_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."woocommerce_connections" (
    "user_id" "uuid" NOT NULL,
    "site_name" "text" NOT NULL,
    "site_url" "text" NOT NULL,
    "consumer_key" "text" NOT NULL,
    "consumer_secret" "text" NOT NULL,
    "last_import_at" timestamp with time zone,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "total_products_imported" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."woocommerce_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."woocommerce_import_logs" (
    "connection_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "error_message" "text",
    "completed_at" timestamp with time zone,
    "progress_message" "text",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "total_products" integer DEFAULT 0,
    "imported_products" integer DEFAULT 0,
    "failed_products" integer DEFAULT 0,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "current_page" integer DEFAULT 0,
    "total_pages" integer DEFAULT 0,
    CONSTRAINT "woocommerce_import_logs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."woocommerce_import_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."woocommerce_sync_logs" (
    "connection_id" "uuid" NOT NULL,
    "sync_type" "text" NOT NULL,
    "error_message" "text",
    "completed_at" timestamp with time zone,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "products_updated" integer DEFAULT 0,
    "products_created" integer DEFAULT 0,
    "products_failed" integer DEFAULT 0,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "woocommerce_sync_logs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text", 'failed'::"text"]))),
    CONSTRAINT "woocommerce_sync_logs_sync_type_check" CHECK (("sync_type" = ANY (ARRAY['manual'::"text", 'scheduled'::"text"])))
);


ALTER TABLE "public"."woocommerce_sync_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."woocommerce_sync_schedules" (
    "connection_id" "uuid" NOT NULL,
    "sync_time" time without time zone,
    "last_sync_at" timestamp with time zone,
    "next_sync_at" timestamp with time zone,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "sync_interval_minutes" integer DEFAULT 60 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."woocommerce_sync_schedules" OWNER TO "postgres";


ALTER TABLE ONLY "public"."business_settings"
    ADD CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."courier_webhook_settings"
    ADD CONSTRAINT "courier_webhook_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_settings"
    ADD CONSTRAINT "custom_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_settings"
    ADD CONSTRAINT "custom_settings_setting_type_key" UNIQUE ("setting_type");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dismissed_alerts"
    ADD CONSTRAINT "dismissed_alerts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_logs"
    ADD CONSTRAINT "inventory_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_attribute_values"
    ADD CONSTRAINT "product_attribute_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_attributes"
    ADD CONSTRAINT "product_attributes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reusable_attributes"
    ADD CONSTRAINT "reusable_attributes_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."reusable_attributes"
    ADD CONSTRAINT "reusable_attributes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."sales_items"
    ADD CONSTRAINT "sales_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_audit_logs"
    ADD CONSTRAINT "security_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_preferences"
    ADD CONSTRAINT "user_preferences_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."woocommerce_connections"
    ADD CONSTRAINT "woocommerce_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."woocommerce_import_logs"
    ADD CONSTRAINT "woocommerce_import_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."woocommerce_sync_logs"
    ADD CONSTRAINT "woocommerce_sync_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."woocommerce_sync_schedules"
    ADD CONSTRAINT "woocommerce_sync_schedules_pkey" PRIMARY KEY ("id");



CREATE OR REPLACE TRIGGER "set_customers_created_by" BEFORE INSERT ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."set_created_by"();



CREATE OR REPLACE TRIGGER "set_sales_created_by" BEFORE INSERT ON "public"."sales" FOR EACH ROW EXECUTE FUNCTION "public"."set_created_by"();



CREATE OR REPLACE TRIGGER "trg_sales_items_adjust_stock_del" AFTER DELETE ON "public"."sales_items" FOR EACH ROW EXECUTE FUNCTION "public"."adjust_stock_on_sales_items"();



CREATE OR REPLACE TRIGGER "trg_sales_items_adjust_stock_ins" AFTER INSERT ON "public"."sales_items" FOR EACH ROW EXECUTE FUNCTION "public"."adjust_stock_on_sales_items"();



CREATE OR REPLACE TRIGGER "trg_sales_items_adjust_stock_upd" AFTER UPDATE ON "public"."sales_items" FOR EACH ROW EXECUTE FUNCTION "public"."adjust_stock_on_sales_items"();



CREATE OR REPLACE TRIGGER "trg_sales_status_adjust_stock" AFTER UPDATE OF "payment_status", "courier_status" ON "public"."sales" FOR EACH ROW EXECUTE FUNCTION "public"."adjust_stock_on_sales_status"();



CREATE OR REPLACE TRIGGER "update_business_settings_updated_at" BEFORE UPDATE ON "public"."business_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_courier_webhook_settings_updated_at" BEFORE UPDATE ON "public"."courier_webhook_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_custom_settings_updated_at" BEFORE UPDATE ON "public"."custom_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_product_variants_updated_at" BEFORE UPDATE ON "public"."product_variants" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_products_updated_at" BEFORE UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_reusable_attributes_updated_at" BEFORE UPDATE ON "public"."reusable_attributes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_role_permissions_updated_at" BEFORE UPDATE ON "public"."role_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_sale_items_updated_at" BEFORE UPDATE ON "public"."sale_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_sales_updated_at" BEFORE UPDATE ON "public"."sales" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_system_settings_updated_at" BEFORE UPDATE ON "public"."system_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_preferences_updated_at" BEFORE UPDATE ON "public"."user_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_roles_updated_at" BEFORE UPDATE ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_woocommerce_connections_updated_at" BEFORE UPDATE ON "public"."woocommerce_connections" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_woocommerce_sync_schedules_updated_at" BEFORE UPDATE ON "public"."woocommerce_sync_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."business_settings"
    ADD CONSTRAINT "business_settings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "fk_sale_items_product_id" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "fk_sale_items_sale_id" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id");



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "fk_sale_items_variant_id" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id");



ALTER TABLE ONLY "public"."inventory_logs"
    ADD CONSTRAINT "inventory_logs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_logs"
    ADD CONSTRAINT "inventory_logs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."inventory_logs"
    ADD CONSTRAINT "inventory_logs_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id");



ALTER TABLE ONLY "public"."product_attribute_values"
    ADD CONSTRAINT "product_attribute_values_attribute_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "public"."product_attributes"("id");



ALTER TABLE ONLY "public"."product_attributes"
    ADD CONSTRAINT "product_attributes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."product_variants"
    ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reusable_attributes"
    ADD CONSTRAINT "reusable_attributes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."sales_items"
    ADD CONSTRAINT "sales_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."sales_items"
    ADD CONSTRAINT "sales_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id");



ALTER TABLE ONLY "public"."sales_items"
    ADD CONSTRAINT "sales_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."woocommerce_import_logs"
    ADD CONSTRAINT "woocommerce_import_logs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."woocommerce_connections"("id");



ALTER TABLE ONLY "public"."woocommerce_sync_logs"
    ADD CONSTRAINT "woocommerce_sync_logs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."woocommerce_connections"("id");



ALTER TABLE ONLY "public"."woocommerce_sync_schedules"
    ADD CONSTRAINT "woocommerce_sync_schedules_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."woocommerce_connections"("id");



CREATE POLICY "Admins can manage role permissions" ON "public"."role_permissions" TO "authenticated" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role"));



CREATE POLICY "Authenticated users can manage business settings" ON "public"."business_settings" TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can manage courier webhook settings" ON "public"."courier_webhook_settings" TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can manage custom settings" ON "public"."custom_settings" TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can manage inventory logs" ON "public"."inventory_logs" TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can manage product attribute values" ON "public"."product_attribute_values" TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can manage product attributes" ON "public"."product_attributes" TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can manage product variants" ON "public"."product_variants" TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can manage products" ON "public"."products" TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can manage reusable attributes" ON "public"."reusable_attributes" TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can manage sales items" ON "public"."sales_items" TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can manage system settings" ON "public"."system_settings" TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can read customers" ON "public"."customers" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL));



CREATE POLICY "Authenticated users can read sale items" ON "public"."sale_items" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can read sales" ON "public"."sales" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can view role permissions" ON "public"."role_permissions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."role" = "role_permissions"."role")))));



CREATE POLICY "Authenticated users can view security audit logs" ON "public"."security_audit_logs" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Managers and admins can delete customers" ON "public"."customers" FOR DELETE USING ((("auth"."uid"() IS NOT NULL) AND ("public"."has_role"("auth"."uid"(), 'admin'::"public"."user_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."user_role"))));



CREATE POLICY "Managers and admins can delete sales" ON "public"."sales" FOR DELETE USING ((("auth"."uid"() IS NOT NULL) AND ("public"."has_role"("auth"."uid"(), 'admin'::"public"."user_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."user_role"))));



CREATE POLICY "Managers and admins can delete sales items" ON "public"."sales_items" FOR DELETE USING ((("auth"."uid"() IS NOT NULL) AND ("public"."has_role"("auth"."uid"(), 'admin'::"public"."user_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."user_role"))));



CREATE POLICY "Managers and admins can update customers" ON "public"."customers" FOR UPDATE USING ((("auth"."uid"() IS NOT NULL) AND ("public"."has_role"("auth"."uid"(), 'admin'::"public"."user_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."user_role")))) WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("public"."has_role"("auth"."uid"(), 'admin'::"public"."user_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."user_role"))));



CREATE POLICY "Managers and admins can update sales" ON "public"."sales" FOR UPDATE USING ((("auth"."uid"() IS NOT NULL) AND ("public"."has_role"("auth"."uid"(), 'admin'::"public"."user_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."user_role")))) WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("public"."has_role"("auth"."uid"(), 'admin'::"public"."user_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."user_role"))));



CREATE POLICY "Profiles insert" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role")));



CREATE POLICY "Profiles select" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role")));



CREATE POLICY "Profiles update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role")));



CREATE POLICY "Staff and above can create sales" ON "public"."sales" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("public"."has_role"("auth"."uid"(), 'admin'::"public"."user_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."user_role") OR "public"."has_role"("auth"."uid"(), 'staff'::"public"."user_role")) AND (("created_by" IS NULL) OR ("created_by" = "auth"."uid"()))));



CREATE POLICY "Staff and above can update sales" ON "public"."sales" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() IS NOT NULL) AND ("public"."has_role"("auth"."uid"(), 'admin'::"public"."user_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."user_role") OR "public"."has_role"("auth"."uid"(), 'staff'::"public"."user_role")))) WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("public"."has_role"("auth"."uid"(), 'admin'::"public"."user_role") OR "public"."has_role"("auth"."uid"(), 'manager'::"public"."user_role") OR "public"."has_role"("auth"."uid"(), 'staff'::"public"."user_role"))));



CREATE POLICY "User roles delete" ON "public"."user_roles" FOR DELETE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role")));



CREATE POLICY "User roles insert" ON "public"."user_roles" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role")));



CREATE POLICY "User roles select" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role")));



CREATE POLICY "User roles update" ON "public"."user_roles" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role")));



CREATE POLICY "Users can manage their own WooCommerce connections" ON "public"."woocommerce_connections" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can manage their own WooCommerce sync schedules" ON "public"."woocommerce_sync_schedules" TO "authenticated" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can manage their own dismissed alerts" ON "public"."dismissed_alerts" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can manage their own preferences" ON "public"."user_preferences" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can view their own WooCommerce import logs" ON "public"."woocommerce_import_logs" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can view their own WooCommerce sync logs" ON "public"."woocommerce_sync_logs" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users with customers.add can create customers" ON "public"."customers" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ((EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."role_permissions" "rp" ON ((("rp"."role" = "ur"."role") AND ("rp"."permission_key" = 'customers.add'::"text") AND ("rp"."allowed" = true))))
  WHERE ("ur"."user_id" = "auth"."uid"()))) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."user_role"))));



ALTER TABLE "public"."business_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."courier_webhook_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."custom_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dismissed_alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_attribute_values" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_attributes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_variants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reusable_attributes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sale_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."woocommerce_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."woocommerce_import_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."woocommerce_sync_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."woocommerce_sync_schedules" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."adjust_stock_on_sales_items"() TO "anon";
GRANT ALL ON FUNCTION "public"."adjust_stock_on_sales_items"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_stock_on_sales_items"() TO "service_role";



GRANT ALL ON FUNCTION "public"."adjust_stock_on_sales_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."adjust_stock_on_sales_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_stock_on_sales_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_user_safely"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_user_safely"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user_safely"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_invoice_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_invoice_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_invoice_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_all_users_with_roles"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_all_users_with_roles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_users_with_roles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."has_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."user_role") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."user_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."user_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_created_by"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_created_by"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_created_by"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."business_settings" TO "anon";
GRANT ALL ON TABLE "public"."business_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."business_settings" TO "service_role";



GRANT ALL ON TABLE "public"."courier_webhook_settings" TO "anon";
GRANT ALL ON TABLE "public"."courier_webhook_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."courier_webhook_settings" TO "service_role";



GRANT ALL ON TABLE "public"."custom_settings" TO "anon";
GRANT ALL ON TABLE "public"."custom_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_settings" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."dismissed_alerts" TO "anon";
GRANT ALL ON TABLE "public"."dismissed_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."dismissed_alerts" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_logs" TO "anon";
GRANT ALL ON TABLE "public"."inventory_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_logs" TO "service_role";



GRANT ALL ON TABLE "public"."product_attribute_values" TO "anon";
GRANT ALL ON TABLE "public"."product_attribute_values" TO "authenticated";
GRANT ALL ON TABLE "public"."product_attribute_values" TO "service_role";



GRANT ALL ON TABLE "public"."product_attributes" TO "anon";
GRANT ALL ON TABLE "public"."product_attributes" TO "authenticated";
GRANT ALL ON TABLE "public"."product_attributes" TO "service_role";



GRANT ALL ON TABLE "public"."product_variants" TO "anon";
GRANT ALL ON TABLE "public"."product_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."product_variants" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."reusable_attributes" TO "anon";
GRANT ALL ON TABLE "public"."reusable_attributes" TO "authenticated";
GRANT ALL ON TABLE "public"."reusable_attributes" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."sale_items" TO "anon";
GRANT ALL ON TABLE "public"."sale_items" TO "authenticated";
GRANT ALL ON TABLE "public"."sale_items" TO "service_role";



GRANT ALL ON TABLE "public"."sales" TO "anon";
GRANT ALL ON TABLE "public"."sales" TO "authenticated";
GRANT ALL ON TABLE "public"."sales" TO "service_role";



GRANT ALL ON TABLE "public"."sales_items" TO "anon";
GRANT ALL ON TABLE "public"."sales_items" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_items" TO "service_role";



GRANT ALL ON TABLE "public"."security_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."security_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."security_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."system_settings" TO "anon";
GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";



GRANT ALL ON TABLE "public"."user_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."woocommerce_connections" TO "anon";
GRANT ALL ON TABLE "public"."woocommerce_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."woocommerce_connections" TO "service_role";



GRANT ALL ON TABLE "public"."woocommerce_import_logs" TO "anon";
GRANT ALL ON TABLE "public"."woocommerce_import_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."woocommerce_import_logs" TO "service_role";



GRANT ALL ON TABLE "public"."woocommerce_sync_logs" TO "anon";
GRANT ALL ON TABLE "public"."woocommerce_sync_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."woocommerce_sync_logs" TO "service_role";



GRANT ALL ON TABLE "public"."woocommerce_sync_schedules" TO "anon";
GRANT ALL ON TABLE "public"."woocommerce_sync_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."woocommerce_sync_schedules" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































