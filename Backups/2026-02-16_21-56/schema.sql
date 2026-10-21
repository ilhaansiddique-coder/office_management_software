


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


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";








ALTER SCHEMA "public" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'RLS policies cleaned up and secured';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."payment_terms_type" AS ENUM (
    'immediate',
    'cod',
    'credit'
);


ALTER TYPE "public"."payment_terms_type" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'manager',
    'staff',
    'sales_associate',
    'warehouse',
    'store_manager'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_stock_on_sales_items"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  pay_status text;
  courier_status_val text;
  delta int;
  prod_id uuid := coalesce(new.product_id, old.product_id);
  var_id uuid := coalesce(new.variant_id, old.variant_id);
  cancelled_statuses text[] := array['cancelled','returned','lost'];
  current_stock int;
BEGIN
  SELECT payment_status, courier_status INTO pay_status, courier_status_val
  FROM public.sales WHERE id = coalesce(new.sale_id, old.sale_id);

  IF pay_status = 'cancelled' OR courier_status_val = ANY(cancelled_statuses) THEN
    RETURN coalesce(old, new);
  END IF;

  IF tg_op = 'INSERT' THEN
    delta := -new.quantity;
  ELSIF tg_op = 'DELETE' THEN
    delta := old.quantity;
  ELSIF tg_op = 'UPDATE' THEN
    delta := old.quantity - new.quantity;
  END IF;

  IF delta < 0 THEN
    SELECT stock_quantity INTO current_stock
    FROM public.products
    WHERE id = prod_id
    FOR UPDATE;

    IF current_stock IS NULL THEN
      RAISE EXCEPTION 'Product not found for stock update.';
    END IF;

    IF coalesce(current_stock, 0) + delta < 0 THEN
      RAISE EXCEPTION 'Insufficient stock for product.';
    END IF;

    IF var_id IS NOT NULL THEN
      SELECT stock_quantity INTO current_stock
      FROM public.product_variants
      WHERE id = var_id
      FOR UPDATE;

      IF current_stock IS NULL THEN
        RAISE EXCEPTION 'Variant not found for stock update.';
      END IF;

      IF coalesce(current_stock, 0) + delta < 0 THEN
        RAISE EXCEPTION 'Insufficient stock for variant.';
      END IF;
    END IF;
  END IF;

  UPDATE public.products
    SET stock_quantity = coalesce(stock_quantity,0) + delta
    WHERE id = prod_id;

  IF var_id IS NOT NULL THEN
    UPDATE public.product_variants
      SET stock_quantity = coalesce(stock_quantity,0) + delta
      WHERE id = var_id;
  END IF;

  RETURN coalesce(old, new);
END;
$$;


ALTER FUNCTION "public"."adjust_stock_on_sales_items"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_stock_on_sales_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  old_cancelled boolean;
  new_cancelled boolean;
  cancelled_statuses text[] := array['cancelled','returned'];
  rec record;
  delta int;
begin
  old_cancelled := ((old.payment_status = 'cancelled') and (coalesce(old.courier_status, '') <> 'lost'))
    or (old.courier_status = any(cancelled_statuses));
  new_cancelled := ((new.payment_status = 'cancelled') and (coalesce(new.courier_status, '') <> 'lost'))
    or (new.courier_status = any(cancelled_statuses));

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


CREATE OR REPLACE FUNCTION "public"."block_core_courier_rule_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.status_key IN (
    'not_sent',
    'sent',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'payout_ready',
    'cancelled',
    'returned',
    'lost',
    'pending'
  ) THEN
    RAISE EXCEPTION 'Core courier payment rules cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."block_core_courier_rule_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_core_payment_method_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.key IN ('cash','bkash','nagad','bank_transfer','cod','credit') THEN
    RAISE EXCEPTION 'Core payment methods cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."block_core_payment_method_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_activity_logs"("retention_days" integer DEFAULT 90) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.activity_logs
  WHERE created_at < now() - (retention_days || ' days')::interval;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_activity_logs"("retention_days" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_old_activity_logs"("retention_days" integer) IS 'Removes activity logs older than the specified number of days (default 90). Call this periodically to manage log storage.';



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
  prefix text := 'INV';
  start_at integer := 1;
  max_existing integer;
  next_number integer;
begin
  -- Pull prefix and starting counter from business settings if available.
  select coalesce(bs.invoice_prefix, 'INV'), greatest(coalesce(bs.invoice_count_start, 1), 1)
    into prefix, start_at
  from public.business_settings bs
  order by bs.created_at asc
  limit 1;

  -- Find the max numeric suffix for the current prefix.
  select max(
           cast(substring(s.invoice_number from (length(prefix) + 1)) as integer)
         )
    into max_existing
  from public.sales s
  where s.invoice_number like prefix || '%'
    and substring(s.invoice_number from (length(prefix) + 1)) ~ '^[0-9]+$';

  -- Start from either the configured start_at or the next existing number.
  next_number := greatest(coalesce(max_existing, start_at - 1) + 1, start_at);

  return prefix || lpad(next_number::text, 6, '0');
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


CREATE OR REPLACE FUNCTION "public"."hard_delete_product"("_product_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  _variant_ids uuid[];
  _attribute_ids uuid[];
begin
  if not has_permission(auth.uid(), 'products.delete'::text) then
    raise exception 'permission denied';
  end if;

  select array_agg(id) into _variant_ids
  from public.product_variants
  where product_id = _product_id;

  select array_agg(id) into _attribute_ids
  from public.product_attributes
  where product_id = _product_id;

  delete from public.inventory_logs
  where product_id = _product_id
     or (array_length(_variant_ids, 1) is not null and variant_id = any(_variant_ids));

  delete from public.product_attribute_values
  where array_length(_attribute_ids, 1) is not null
    and attribute_id = any(_attribute_ids);

  delete from public.product_attributes
  where product_id = _product_id;

  delete from public.product_variants
  where product_id = _product_id;

  delete from public.products
  where id = _product_id;
end;
$$;


ALTER FUNCTION "public"."hard_delete_product"("_product_id" "uuid") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."has_permission"("_user_id" "uuid", "_permission_key" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  _role public.user_role;
begin
  -- Prefer admin role if user has multiple roles
  if exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = 'admin'
  ) then
    return true;
  end if;

  -- Use most recent role assignment
  select role
    into _role
  from public.user_roles
  where user_id = _user_id
  order by created_at desc
  limit 1;

  if _role is null then
    return false;
  end if;

  -- Check explicit permission in the dynamic table
  if exists (
    select 1 from public.role_permissions
    where role = _role
      and permission_key = _permission_key
      and allowed = true
  ) then
    return true;
  end if;

  return false;
end;
$$;


ALTER FUNCTION "public"."has_permission"("_user_id" "uuid", "_permission_key" "text") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."log_activity_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_action text;
  v_entity_id uuid;
  v_details jsonb;
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_action := lower(TG_OP);
  IF TG_OP = 'DELETE' THEN
    v_entity_id := OLD.id;
    v_details := jsonb_build_object('old', to_jsonb(OLD));
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD) - 'updated_at';
    v_new := to_jsonb(NEW) - 'updated_at';
    IF v_old = v_new THEN
      RETURN NEW;
    END IF;
    v_entity_id := NEW.id;
    v_details := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  ELSE
    v_entity_id := NEW.id;
    v_details := jsonb_build_object('new', to_jsonb(NEW));
  END IF;

  BEGIN
    INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, summary, details)
    VALUES (auth.uid(), v_action, TG_TABLE_NAME, v_entity_id, TG_TABLE_NAME || ' ' || v_action, v_details);
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_activity_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_activity_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_action text;
  v_entity_type text;
  v_entity_id uuid;
  v_entity_id_text text;
  v_summary text;
  v_details jsonb;
  v_old_data jsonb;
  v_new_data jsonb;
  v_entity_name text;
BEGIN
  -- Get the current user
  v_user_id := auth.uid();

  -- Set the entity type from table name
  v_entity_type := TG_TABLE_NAME;

  -- Determine action
  v_action := lower(TG_OP);

  -- Handle different operations
  IF TG_OP = 'INSERT' THEN
    v_entity_id := NEW.id;
    v_entity_id_text := v_entity_id::text;
    v_new_data := to_jsonb(NEW);

    -- Try to get a meaningful name for the entity
    v_entity_name := COALESCE(
      v_new_data ->> 'name',
      v_new_data ->> 'invoice_number',
      v_new_data ->> 'customer_name',
      v_new_data ->> 'sku',
      LEFT(v_entity_id_text, 8)
    );

    v_summary := format('Created %s: %s', v_entity_type, v_entity_name);
    v_details := jsonb_build_object('new', v_new_data);

  ELSIF TG_OP = 'UPDATE' THEN
    v_entity_id := NEW.id;
    v_entity_id_text := v_entity_id::text;
    v_old_data := to_jsonb(OLD);
    v_new_data := to_jsonb(NEW);

    -- Try to get a meaningful name for the entity
    v_entity_name := COALESCE(
      v_new_data ->> 'name',
      v_new_data ->> 'invoice_number',
      v_new_data ->> 'customer_name',
      v_new_data ->> 'sku',
      LEFT(v_entity_id_text, 8)
    );

    v_summary := format('Updated %s: %s', v_entity_type, v_entity_name);
    v_details := jsonb_build_object('old', v_old_data, 'new', v_new_data);

  ELSIF TG_OP = 'DELETE' THEN
    v_entity_id := OLD.id;
    v_entity_id_text := v_entity_id::text;
    v_old_data := to_jsonb(OLD);

    -- Try to get a meaningful name for the entity
    v_entity_name := COALESCE(
      v_old_data ->> 'name',
      v_old_data ->> 'invoice_number',
      v_old_data ->> 'customer_name',
      v_old_data ->> 'sku',
      LEFT(v_entity_id_text, 8)
    );

    v_summary := format('Deleted %s: %s', v_entity_type, v_entity_name);
    v_details := jsonb_build_object('old', v_old_data);
  END IF;

  -- Insert the activity log
  INSERT INTO public.activity_logs (user_id, action, entity_type, entity_id, summary, details)
  VALUES (v_user_id, v_action, v_entity_type, v_entity_id, v_summary, v_details);

  -- Return appropriately
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;


ALTER FUNCTION "public"."log_activity_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_sensitive_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.security_audit_log (
    user_id,
    action,
    table_name,
    record_id,
    old_values,
    new_values
  ) VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id::text, OLD.id::text),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."log_sensitive_changes"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_sensitive_changes"() IS 'Trigger function to log changes to sensitive tables';



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


CREATE OR REPLACE FUNCTION "public"."set_sales_status_change_dates"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.courier_status is distinct from old.courier_status then
    new.status_changed_at := now();

    if new.courier_status = 'cancelled' then
      new.cancelled_at := now();
    elsif new.courier_status = 'returned' then
      new.returned_at := now();
    elsif new.courier_status = 'lost' then
      new.lost_at := now();
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."set_sales_status_change_dates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_parent_stock_from_variants"("p_product_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.products p
  set stock_quantity = coalesce(v.total_stock, 0)
  from (
    select product_id, sum(coalesce(stock_quantity, 0))::int as total_stock
    from public.product_variants
    where product_id = p_product_id
    group by product_id
  ) v
  where p.id = p_product_id
    and p.has_variants = true;
end;
$$;


ALTER FUNCTION "public"."sync_parent_stock_from_variants"("p_product_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_sync_parent_stock_from_variants"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  target_product_id uuid := coalesce(new.product_id, old.product_id);
begin
  if target_product_id is not null then
    perform public.sync_parent_stock_from_variants(target_product_id);
  end if;
  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."trg_sync_parent_stock_from_variants"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_auto_refresh_courier_status"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_supabase_url text;
  v_service_key text;
  v_response text;
  v_settings record;
  v_last_run timestamptz;
  v_hours_since_last_run numeric;
BEGIN
  -- Get the auto-refresh settings
  SELECT 
    auto_refresh_enabled,
    auto_refresh_interval_hours
  INTO v_settings
  FROM public.courier_webhook_settings
  WHERE is_active = true
  LIMIT 1;
  
  -- Exit if auto-refresh is not enabled
  IF v_settings IS NULL OR NOT v_settings.auto_refresh_enabled THEN
    RAISE NOTICE 'Auto-refresh is disabled, skipping...';
    RETURN;
  END IF;
  
  -- Get the last successful run time
  SELECT started_at INTO v_last_run
  FROM public.auto_refresh_runs
  WHERE success = true
  ORDER BY started_at DESC
  LIMIT 1;
  
  -- Calculate hours since last run
  IF v_last_run IS NULL THEN
    v_hours_since_last_run := 999;
  ELSE
    v_hours_since_last_run := EXTRACT(EPOCH FROM (now() - v_last_run)) / 3600;
  END IF;
  
  -- Check if enough time has passed
  IF v_hours_since_last_run < v_settings.auto_refresh_interval_hours THEN
    RAISE NOTICE 'Not enough time has passed. Last run: % hours ago, Interval: % hours', 
      ROUND(v_hours_since_last_run::numeric, 2), 
      v_settings.auto_refresh_interval_hours;
    RETURN;
  END IF;
  
  RAISE NOTICE 'Triggering auto-refresh (% hours since last run, interval: % hours)', 
    ROUND(v_hours_since_last_run::numeric, 2),
    v_settings.auto_refresh_interval_hours;
  
  -- Get environment variables
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);
  
  -- Call the Edge Function
  SELECT content::text INTO v_response
  FROM http((
    'POST',
    v_supabase_url || '/functions/v1/auto-refresh-courier-status',
    ARRAY[
      http_header('Authorization', 'Bearer ' || v_service_key),
      http_header('Content-Type', 'application/json')
    ],
    'application/json',
    '{}'
  )::http_request);
  
  RAISE NOTICE 'Auto-refresh response: %', v_response;
  
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Error in trigger_auto_refresh_courier_status: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."trigger_auto_refresh_courier_status"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trigger_auto_refresh_courier_status"() IS 'Smart function that checks if enough time has passed based on auto_refresh_interval_hours setting before triggering refresh';



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


CREATE OR REPLACE FUNCTION "public"."user_has_permission"("permission" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case
    when exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and ur.role = 'admin'
    ) then true
    else exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role::text = ur.role::text
      where ur.user_id = auth.uid()
        and rp.permission_key = permission
        and rp.allowed = true
    )
  end;
$$;


ALTER FUNCTION "public"."user_has_permission"("permission" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_role"("required_roles" "text"[]) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM public.user_roles
  WHERE user_id = auth.uid();

  IF user_role IS NULL THEN
    RETURN false;
  END IF;

  RETURN user_role = ANY(required_roles);
END;
$$;


ALTER FUNCTION "public"."user_has_role"("required_roles" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."user_has_role"("required_roles" "text"[]) IS 'Helper function to check if the current user has one of the specified roles';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "summary" "text",
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."activity_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."activity_logs" IS 'Stores activity logs for audit trails and user action tracking';



COMMENT ON COLUMN "public"."activity_logs"."action" IS 'Action type: insert, update, delete, print_invoice, download_invoice, export_invoices, etc.';



COMMENT ON COLUMN "public"."activity_logs"."entity_type" IS 'Entity type: products, customers, sales, payments, etc.';



COMMENT ON COLUMN "public"."activity_logs"."entity_id" IS 'UUID or identifier of the affected entity';



COMMENT ON COLUMN "public"."activity_logs"."summary" IS 'Human-readable summary of the action';



COMMENT ON COLUMN "public"."activity_logs"."details" IS 'JSON object containing before/after data for changes';



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


CREATE OR REPLACE VIEW "public"."activity_logs_view" WITH ("security_invoker"='on') AS
 SELECT "al"."id",
    "al"."user_id",
    "al"."action",
    "al"."entity_type",
    "al"."entity_id",
    "al"."summary",
    "al"."details",
    "al"."created_at",
    "p"."full_name",
    "p"."email"
   FROM ("public"."activity_logs" "al"
     LEFT JOIN "public"."profiles" "p" ON (("al"."user_id" = "p"."id")))
  ORDER BY "al"."created_at" DESC;


ALTER VIEW "public"."activity_logs_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auto_refresh_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "success" boolean,
    "total_orders" integer,
    "successful_updates" integer,
    "failed_updates" integer,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."auto_refresh_runs" OWNER TO "postgres";


COMMENT ON TABLE "public"."auto_refresh_runs" IS 'Tracks automated courier status refresh runs';



COMMENT ON COLUMN "public"."auto_refresh_runs"."started_at" IS 'When the auto-refresh job started';



COMMENT ON COLUMN "public"."auto_refresh_runs"."completed_at" IS 'When the auto-refresh job completed';



COMMENT ON COLUMN "public"."auto_refresh_runs"."success" IS 'Whether the job completed successfully';



COMMENT ON COLUMN "public"."auto_refresh_runs"."total_orders" IS 'Total number of orders processed';



COMMENT ON COLUMN "public"."auto_refresh_runs"."successful_updates" IS 'Number of successful status updates';



COMMENT ON COLUMN "public"."auto_refresh_runs"."failed_updates" IS 'Number of failed status updates';



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
    "brand_color" "text" DEFAULT '#2c7be5'::"text",
    "invoice_count_start" integer DEFAULT 1 NOT NULL,
    "tagline" "text" DEFAULT 'WE SUPPLY ALL KINDS OF READY MADE GARMENTS'::"text"
);


ALTER TABLE "public"."business_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."courier_payment_rules" (
    "status_key" "text" NOT NULL,
    "payment_status" "text" NOT NULL,
    "amount_paid_behavior" "text" DEFAULT 'keep'::"text" NOT NULL,
    "amount_due_behavior" "text" DEFAULT 'keep'::"text" NOT NULL,
    "use_backup" boolean DEFAULT false NOT NULL,
    "restore_inventory" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "courier_payment_rules_due_behavior_check" CHECK (("amount_due_behavior" = ANY (ARRAY['keep'::"text", 'zero'::"text", 'restore_backup'::"text"]))),
    CONSTRAINT "courier_payment_rules_paid_behavior_check" CHECK (("amount_paid_behavior" = ANY (ARRAY['keep'::"text", 'zero'::"text", 'cod_collected'::"text", 'restore_backup'::"text"])))
);


ALTER TABLE "public"."courier_payment_rules" OWNER TO "postgres";


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
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "steadfast_api_key" "text" DEFAULT ''::"text",
    "steadfast_secret_key" "text" DEFAULT ''::"text",
    "pathao_client_id" "text" DEFAULT ''::"text",
    "pathao_client_secret" "text" DEFAULT ''::"text",
    "pathao_access_token" "text" DEFAULT ''::"text",
    "pathao_token_expires_at" timestamp with time zone,
    "pathao_store_id" "text" DEFAULT ''::"text",
    "steadfast_enabled" boolean DEFAULT false,
    "pathao_enabled" boolean DEFAULT false,
    "default_courier" "text",
    "auto_refresh_interval_minutes" integer DEFAULT 60,
    "auto_refresh_enabled" boolean DEFAULT false,
    "auto_refresh_interval_hours" integer DEFAULT 6,
    "pathao_refresh_token" "text"
);


ALTER TABLE "public"."courier_webhook_settings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."courier_webhook_settings"."pathao_client_id" IS 'Pathao API client ID for OAuth authentication';



COMMENT ON COLUMN "public"."courier_webhook_settings"."pathao_client_secret" IS 'Pathao API client secret for OAuth authentication';



COMMENT ON COLUMN "public"."courier_webhook_settings"."pathao_access_token" IS 'Pathao OAuth access token (auto-refreshed)';



COMMENT ON COLUMN "public"."courier_webhook_settings"."pathao_token_expires_at" IS 'Expiration timestamp for Pathao access token';



COMMENT ON COLUMN "public"."courier_webhook_settings"."pathao_store_id" IS 'Pathao merchant store ID';



COMMENT ON COLUMN "public"."courier_webhook_settings"."steadfast_enabled" IS 'Whether Steadfast courier integration is enabled';



COMMENT ON COLUMN "public"."courier_webhook_settings"."pathao_enabled" IS 'Whether Pathao courier integration is enabled';



COMMENT ON COLUMN "public"."courier_webhook_settings"."default_courier" IS 'Default courier to use (Steadfast, Pathao, or NULL)';



COMMENT ON COLUMN "public"."courier_webhook_settings"."auto_refresh_interval_minutes" IS 'Auto-refresh interval for courier status checks in minutes. Default is 60 minutes (1 hour).';



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
    "credit_limit" numeric DEFAULT 0,
    "credit_used" numeric DEFAULT 0,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "customers_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'neutral'::"text", 'inactive'::"text"])))
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."customers"."credit_limit" IS 'Maximum credit amount allowed for this customer';



COMMENT ON COLUMN "public"."customers"."credit_used" IS 'Current amount of credit used by this customer';



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


CREATE TABLE IF NOT EXISTS "public"."payment_methods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "type" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "default_terms" "text" DEFAULT 'custom'::"text" NOT NULL,
    "default_paid_behavior" "text" DEFAULT 'custom'::"text" NOT NULL,
    "fee_type" "text" DEFAULT 'none'::"text" NOT NULL,
    "fee_value" numeric,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_methods_default_terms_check" CHECK (("default_terms" = ANY (ARRAY['immediate'::"text", 'cod'::"text", 'credit'::"text", 'custom'::"text"]))),
    CONSTRAINT "payment_methods_fee_type_check" CHECK (("fee_type" = ANY (ARRAY['none'::"text", 'fixed'::"text", 'percent'::"text"]))),
    CONSTRAINT "payment_methods_paid_behavior_check" CHECK (("default_paid_behavior" = ANY (ARRAY['full'::"text", 'zero'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."payment_methods" OWNER TO "postgres";


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
    "product_name" "text",
    "product_image_url" "text",
    "variant_image_url" "text",
    CONSTRAINT "sale_items_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "sale_items_total_price_check" CHECK (("total_price" >= (0)::numeric)),
    CONSTRAINT "sale_items_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."sale_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sale_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sale_id" "uuid" NOT NULL,
    "method" "text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sale_payments" OWNER TO "postgres";


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
    "payment_terms" "public"."payment_terms_type" DEFAULT 'immediate'::"public"."payment_terms_type",
    "due_date" "date",
    "credit_days" integer,
    "inventory_restored" boolean DEFAULT false NOT NULL,
    "cancelled_at" timestamp with time zone,
    "returned_at" timestamp with time zone,
    "lost_at" timestamp with time zone,
    "status_changed_at" timestamp with time zone,
    "courier_notes" "text",
    "tracking_number" "text",
    CONSTRAINT "sales_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'partial'::"text", 'paid'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."sales" OWNER TO "postgres";


COMMENT ON COLUMN "public"."sales"."payment_terms" IS 'Payment terms: immediate (paid upfront), cod (cash on delivery), credit (pay later)';



COMMENT ON COLUMN "public"."sales"."due_date" IS 'Due date for credit sales';



COMMENT ON COLUMN "public"."sales"."credit_days" IS 'Number of days credit period for credit sales';



COMMENT ON COLUMN "public"."sales"."inventory_restored" IS 'Flag to prevent double inventory restoration when order status changes to cancelled/returned';



COMMENT ON COLUMN "public"."sales"."courier_notes" IS 'Special instructions or notes sent to the courier service';



CREATE TABLE IF NOT EXISTS "public"."sales_items" (
    "sale_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "product_name" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "rate" numeric NOT NULL,
    "total" numeric NOT NULL,
    "variant_id" "uuid",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sale_price" numeric,
    "product_image_url" "text",
    "variant_image_url" "text"
);


ALTER TABLE "public"."sales_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "table_name" "text",
    "record_id" "text",
    "old_values" "jsonb",
    "new_values" "jsonb",
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."security_audit_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."security_audit_log" IS 'Audit log for tracking changes to sensitive data';



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


ALTER TABLE ONLY "public"."activity_logs"
    ADD CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auto_refresh_runs"
    ADD CONSTRAINT "auto_refresh_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."business_settings"
    ADD CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."courier_payment_rules"
    ADD CONSTRAINT "courier_payment_rules_pkey" PRIMARY KEY ("status_key");



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



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."sale_payments"
    ADD CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."sales_items"
    ADD CONSTRAINT "sales_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_audit_log"
    ADD CONSTRAINT "security_audit_log_pkey" PRIMARY KEY ("id");



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



CREATE INDEX "customers_is_deleted_idx" ON "public"."customers" USING "btree" ("is_deleted");



CREATE INDEX "idx_activity_logs_action" ON "public"."activity_logs" USING "btree" ("action");



CREATE INDEX "idx_activity_logs_created_at" ON "public"."activity_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_activity_logs_entity" ON "public"."activity_logs" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_activity_logs_user_id" ON "public"."activity_logs" USING "btree" ("user_id");



CREATE INDEX "idx_auto_refresh_runs_started_at" ON "public"."auto_refresh_runs" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_business_settings_created_by" ON "public"."business_settings" USING "btree" ("created_by");



CREATE INDEX "idx_customers_created_by" ON "public"."customers" USING "btree" ("created_by");



CREATE INDEX "idx_inventory_logs_created_by" ON "public"."inventory_logs" USING "btree" ("created_by");



CREATE INDEX "idx_inventory_logs_product_created" ON "public"."inventory_logs" USING "btree" ("product_id", "created_at" DESC);



CREATE INDEX "idx_inventory_logs_product_id" ON "public"."inventory_logs" USING "btree" ("product_id");



CREATE INDEX "idx_inventory_logs_variant_id" ON "public"."inventory_logs" USING "btree" ("variant_id");



CREATE INDEX "idx_product_attribute_values_attribute_id" ON "public"."product_attribute_values" USING "btree" ("attribute_id");



CREATE INDEX "idx_product_attributes_product_id" ON "public"."product_attributes" USING "btree" ("product_id");



CREATE INDEX "idx_product_variants_product_id" ON "public"."product_variants" USING "btree" ("product_id");



CREATE INDEX "idx_products_created_by" ON "public"."products" USING "btree" ("created_by");



CREATE INDEX "idx_products_deleted_at" ON "public"."products" USING "btree" ("deleted_at");



CREATE INDEX "idx_products_sku" ON "public"."products" USING "btree" ("sku") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_reusable_attributes_created_by" ON "public"."reusable_attributes" USING "btree" ("created_by");



CREATE INDEX "idx_role_permissions_allowed" ON "public"."role_permissions" USING "btree" ("allowed") WHERE ("allowed" = true);



CREATE INDEX "idx_role_permissions_role_permission" ON "public"."role_permissions" USING "btree" ("role", "permission_key");



CREATE INDEX "idx_sale_items_product_created" ON "public"."sale_items" USING "btree" ("product_id", "created_at" DESC);



CREATE INDEX "idx_sale_items_product_id" ON "public"."sale_items" USING "btree" ("product_id");



CREATE INDEX "idx_sale_items_sale_id" ON "public"."sale_items" USING "btree" ("sale_id");



CREATE INDEX "idx_sale_items_variant_id" ON "public"."sale_items" USING "btree" ("variant_id");



CREATE INDEX "idx_sale_payments_method" ON "public"."sale_payments" USING "btree" ("method");



CREATE INDEX "idx_sale_payments_sale_id" ON "public"."sale_payments" USING "btree" ("sale_id");



CREATE INDEX "idx_sales_created_at_customer" ON "public"."sales" USING "btree" ("created_at" DESC, "customer_id");



CREATE INDEX "idx_sales_created_by" ON "public"."sales" USING "btree" ("created_by");



CREATE INDEX "idx_sales_customer_id" ON "public"."sales" USING "btree" ("customer_id");



CREATE INDEX "idx_sales_due_date" ON "public"."sales" USING "btree" ("due_date") WHERE ("payment_terms" = 'credit'::"public"."payment_terms_type");



CREATE INDEX "idx_sales_inventory_restored" ON "public"."sales" USING "btree" ("inventory_restored") WHERE ("inventory_restored" = true);



CREATE INDEX "idx_sales_is_deleted" ON "public"."sales" USING "btree" ("is_deleted") WHERE ("is_deleted" = false);



CREATE INDEX "idx_sales_items_product_id" ON "public"."sales_items" USING "btree" ("product_id");



CREATE INDEX "idx_sales_items_sale_id" ON "public"."sales_items" USING "btree" ("sale_id");



CREATE INDEX "idx_sales_items_variant_id" ON "public"."sales_items" USING "btree" ("variant_id");



CREATE INDEX "idx_sales_order_status" ON "public"."sales" USING "btree" ("order_status_slug");



CREATE INDEX "idx_sales_overdue" ON "public"."sales" USING "btree" ("due_date", "payment_status") WHERE (("payment_terms" = 'credit'::"public"."payment_terms_type") AND ("payment_status" <> 'paid'::"text"));



CREATE INDEX "idx_sales_payment_status" ON "public"."sales" USING "btree" ("payment_status");



CREATE INDEX "idx_sales_payment_terms" ON "public"."sales" USING "btree" ("payment_terms");



CREATE INDEX "idx_sales_tracking_number" ON "public"."sales" USING "btree" ("tracking_number");



CREATE INDEX "idx_security_audit_log_action" ON "public"."security_audit_log" USING "btree" ("action");



CREATE INDEX "idx_security_audit_log_created_at" ON "public"."security_audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_security_audit_log_user_id" ON "public"."security_audit_log" USING "btree" ("user_id");



CREATE INDEX "idx_user_roles_role" ON "public"."user_roles" USING "btree" ("role");



CREATE INDEX "idx_user_roles_user_id" ON "public"."user_roles" USING "btree" ("user_id");



CREATE INDEX "idx_woocommerce_import_logs_connection_id" ON "public"."woocommerce_import_logs" USING "btree" ("connection_id");



CREATE INDEX "idx_woocommerce_sync_logs_connection_id" ON "public"."woocommerce_sync_logs" USING "btree" ("connection_id");



CREATE INDEX "idx_woocommerce_sync_schedules_connection_id" ON "public"."woocommerce_sync_schedules" USING "btree" ("connection_id");



CREATE INDEX "sales_is_deleted_idx" ON "public"."sales" USING "btree" ("is_deleted");



CREATE OR REPLACE TRIGGER "audit_courier_webhook_settings" AFTER INSERT OR DELETE OR UPDATE ON "public"."courier_webhook_settings" FOR EACH ROW EXECUTE FUNCTION "public"."log_sensitive_changes"();



CREATE OR REPLACE TRIGGER "audit_user_roles" AFTER INSERT OR DELETE OR UPDATE ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."log_sensitive_changes"();



CREATE OR REPLACE TRIGGER "audit_woocommerce_connections" AFTER INSERT OR DELETE OR UPDATE ON "public"."woocommerce_connections" FOR EACH ROW EXECUTE FUNCTION "public"."log_sensitive_changes"();



CREATE OR REPLACE TRIGGER "block_core_courier_rule_delete" BEFORE DELETE ON "public"."courier_payment_rules" FOR EACH ROW EXECUTE FUNCTION "public"."block_core_courier_rule_delete"();



CREATE OR REPLACE TRIGGER "block_core_payment_method_delete" BEFORE DELETE ON "public"."payment_methods" FOR EACH ROW EXECUTE FUNCTION "public"."block_core_payment_method_delete"();



CREATE OR REPLACE TRIGGER "set_customers_created_by" BEFORE INSERT ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."set_created_by"();



CREATE OR REPLACE TRIGGER "set_sales_created_by" BEFORE INSERT ON "public"."sales" FOR EACH ROW EXECUTE FUNCTION "public"."set_created_by"();



CREATE OR REPLACE TRIGGER "trg_product_variants_sync_parent_stock_del" AFTER DELETE ON "public"."product_variants" FOR EACH ROW EXECUTE FUNCTION "public"."trg_sync_parent_stock_from_variants"();



CREATE OR REPLACE TRIGGER "trg_product_variants_sync_parent_stock_ins" AFTER INSERT ON "public"."product_variants" FOR EACH ROW EXECUTE FUNCTION "public"."trg_sync_parent_stock_from_variants"();



CREATE OR REPLACE TRIGGER "trg_product_variants_sync_parent_stock_upd" AFTER UPDATE ON "public"."product_variants" FOR EACH ROW EXECUTE FUNCTION "public"."trg_sync_parent_stock_from_variants"();



CREATE OR REPLACE TRIGGER "trg_sales_items_adjust_stock_del" AFTER DELETE ON "public"."sales_items" FOR EACH ROW EXECUTE FUNCTION "public"."adjust_stock_on_sales_items"();



CREATE OR REPLACE TRIGGER "trg_sales_items_adjust_stock_ins" AFTER INSERT ON "public"."sales_items" FOR EACH ROW EXECUTE FUNCTION "public"."adjust_stock_on_sales_items"();



CREATE OR REPLACE TRIGGER "trg_sales_items_adjust_stock_upd" AFTER UPDATE ON "public"."sales_items" FOR EACH ROW EXECUTE FUNCTION "public"."adjust_stock_on_sales_items"();



CREATE OR REPLACE TRIGGER "trg_sales_status_adjust_stock" AFTER UPDATE OF "payment_status", "courier_status" ON "public"."sales" FOR EACH ROW EXECUTE FUNCTION "public"."adjust_stock_on_sales_status"();



CREATE OR REPLACE TRIGGER "trg_set_sales_status_change_dates" BEFORE UPDATE ON "public"."sales" FOR EACH ROW EXECUTE FUNCTION "public"."set_sales_status_change_dates"();



CREATE OR REPLACE TRIGGER "update_business_settings_updated_at" BEFORE UPDATE ON "public"."business_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_courier_payment_rules_updated_at" BEFORE UPDATE ON "public"."courier_payment_rules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_courier_webhook_settings_updated_at" BEFORE UPDATE ON "public"."courier_webhook_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_custom_settings_updated_at" BEFORE UPDATE ON "public"."custom_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_payment_methods_updated_at" BEFORE UPDATE ON "public"."payment_methods" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



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
    ADD CONSTRAINT "fk_sale_items_product_id" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "fk_sale_items_sale_id" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id");



ALTER TABLE ONLY "public"."sale_items"
    ADD CONSTRAINT "fk_sale_items_variant_id" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE SET NULL;



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



ALTER TABLE ONLY "public"."sale_payments"
    ADD CONSTRAINT "sale_payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales"
    ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."sales_items"
    ADD CONSTRAINT "sales_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_items"
    ADD CONSTRAINT "sales_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id");



ALTER TABLE ONLY "public"."sales_items"
    ADD CONSTRAINT "sales_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."security_audit_log"
    ADD CONSTRAINT "security_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."woocommerce_import_logs"
    ADD CONSTRAINT "woocommerce_import_logs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."woocommerce_connections"("id");



ALTER TABLE ONLY "public"."woocommerce_sync_logs"
    ADD CONSTRAINT "woocommerce_sync_logs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."woocommerce_connections"("id");



ALTER TABLE ONLY "public"."woocommerce_sync_schedules"
    ADD CONSTRAINT "woocommerce_sync_schedules_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."woocommerce_connections"("id");



CREATE POLICY "Admin can delete logs" ON "public"."inventory_logs" FOR DELETE TO "authenticated" USING (("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role") OR "public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'products.delete'::"text")));



CREATE POLICY "Admins and managers can insert business_settings" ON "public"."business_settings" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_role"(ARRAY['admin'::"text", 'manager'::"text"]));



CREATE POLICY "Admins and managers can insert courier_payment_rules" ON "public"."courier_payment_rules" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_role"(ARRAY['admin'::"text", 'manager'::"text"]));



CREATE POLICY "Admins and managers can insert payment_methods" ON "public"."payment_methods" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_role"(ARRAY['admin'::"text", 'manager'::"text"]));



CREATE POLICY "Admins and managers can update business_settings" ON "public"."business_settings" FOR UPDATE TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text", 'manager'::"text"])) WITH CHECK ("public"."user_has_role"(ARRAY['admin'::"text", 'manager'::"text"]));



CREATE POLICY "Admins can delete profiles" ON "public"."profiles" FOR DELETE TO "authenticated" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role"));



CREATE POLICY "Admins can delete reusable_attributes" ON "public"."reusable_attributes" FOR DELETE TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Admins can delete woocommerce_sync_schedules" ON "public"."woocommerce_sync_schedules" FOR DELETE TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Admins can insert reusable_attributes" ON "public"."reusable_attributes" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_role"(ARRAY['admin'::"text", 'manager'::"text"]));



CREATE POLICY "Admins can insert role_permissions" ON "public"."role_permissions" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Admins can insert woocommerce_sync_schedules" ON "public"."woocommerce_sync_schedules" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Admins can update reusable_attributes" ON "public"."reusable_attributes" FOR UPDATE TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text", 'manager'::"text"]));



CREATE POLICY "Admins can update woocommerce_sync_schedules" ON "public"."woocommerce_sync_schedules" FOR UPDATE TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Admins can view woocommerce_import_logs" ON "public"."woocommerce_import_logs" FOR SELECT TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Admins can view woocommerce_sync_logs" ON "public"."woocommerce_sync_logs" FOR SELECT TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Admins can view woocommerce_sync_schedules" ON "public"."woocommerce_sync_schedules" FOR SELECT TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Authenticated users can insert activity_logs" ON "public"."activity_logs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can view business_settings" ON "public"."business_settings" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can view custom_settings" ON "public"."custom_settings" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can view sale items" ON "public"."sale_items" FOR SELECT TO "authenticated" USING (("public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'sales.view'::"text") OR "public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'sales.create'::"text") OR "public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'sales.edit'::"text")));



CREATE POLICY "Authenticated users can view system_settings" ON "public"."system_settings" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Can delete customers" ON "public"."customers" FOR DELETE TO "authenticated" USING ("public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'customers.delete'::"text"));



CREATE POLICY "Can delete products" ON "public"."products" FOR DELETE TO "authenticated" USING ("public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'products.delete'::"text"));



CREATE POLICY "Can delete sale items" ON "public"."sales_items" FOR DELETE USING (("public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'sales.delete'::"text") OR "public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'products.delete'::"text") OR "public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'sales.edit'::"text")));



CREATE POLICY "Can delete sales" ON "public"."sales" FOR DELETE TO "authenticated" USING ("public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'sales.delete'::"text"));



CREATE POLICY "Can delete variants" ON "public"."product_variants" FOR DELETE TO "authenticated" USING ("public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'products.delete'::"text"));



CREATE POLICY "Can edit customers" ON "public"."customers" FOR UPDATE TO "authenticated" USING ("public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'customers.edit'::"text")) WITH CHECK ("public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'customers.edit'::"text"));



CREATE POLICY "Can edit products" ON "public"."products" FOR UPDATE TO "authenticated" USING ("public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'products.edit'::"text")) WITH CHECK ("public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'products.edit'::"text"));



CREATE POLICY "Can edit sales" ON "public"."sales" FOR UPDATE TO "authenticated" USING ("public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'sales.edit'::"text")) WITH CHECK ("public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'sales.edit'::"text"));



CREATE POLICY "Can edit variants" ON "public"."product_variants" FOR UPDATE TO "authenticated" USING ("public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'products.edit'::"text"));



CREATE POLICY "Can update sale items" ON "public"."sales_items" FOR UPDATE TO "authenticated" USING ("public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'sales.edit'::"text")) WITH CHECK ("public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'sales.edit'::"text"));



CREATE POLICY "Can view customers" ON "public"."customers" FOR SELECT TO "authenticated" USING ("public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'customers.view'::"text"));



CREATE POLICY "Can view inventory logs" ON "public"."inventory_logs" FOR SELECT TO "authenticated" USING ("public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'inventory.view'::"text"));



CREATE POLICY "Can view sales" ON "public"."sales" FOR SELECT TO "authenticated" USING ("public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'sales.view'::"text"));



CREATE POLICY "Managers and admins can delete courier payment rules" ON "public"."courier_payment_rules" FOR DELETE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'manager'::"public"."user_role"))));



CREATE POLICY "Managers and admins can delete payment methods" ON "public"."payment_methods" FOR DELETE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'manager'::"public"."user_role"))));



CREATE POLICY "Managers and admins can update courier payment rules" ON "public"."courier_payment_rules" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'manager'::"public"."user_role")))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'manager'::"public"."user_role"))));



CREATE POLICY "Managers and admins can update payment methods" ON "public"."payment_methods" FOR UPDATE TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'manager'::"public"."user_role")))) WITH CHECK (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'manager'::"public"."user_role"))));



CREATE POLICY "Only admins and managers can view activity_logs" ON "public"."activity_logs" FOR SELECT TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text", 'manager'::"text"]));



CREATE POLICY "Only admins and managers can view auto_refresh_runs" ON "public"."auto_refresh_runs" FOR SELECT TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text", 'manager'::"text"]));



CREATE POLICY "Only admins can delete business_settings" ON "public"."business_settings" FOR DELETE TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Only admins can delete courier_webhook_settings" ON "public"."courier_webhook_settings" FOR DELETE TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Only admins can delete custom_settings" ON "public"."custom_settings" FOR DELETE TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Only admins can delete system_settings" ON "public"."system_settings" FOR DELETE TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Only admins can delete user_roles" ON "public"."user_roles" FOR DELETE TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Only admins can delete woocommerce_connections" ON "public"."woocommerce_connections" FOR DELETE TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Only admins can insert courier_webhook_settings" ON "public"."courier_webhook_settings" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Only admins can insert custom_settings" ON "public"."custom_settings" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Only admins can insert system_settings" ON "public"."system_settings" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Only admins can insert user_roles" ON "public"."user_roles" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Only admins can insert woocommerce_connections" ON "public"."woocommerce_connections" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Only admins can update courier_webhook_settings" ON "public"."courier_webhook_settings" FOR UPDATE TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text"])) WITH CHECK ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Only admins can update custom_settings" ON "public"."custom_settings" FOR UPDATE TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text"])) WITH CHECK ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Only admins can update system_settings" ON "public"."system_settings" FOR UPDATE TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text"])) WITH CHECK ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Only admins can update user_roles" ON "public"."user_roles" FOR UPDATE TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text"])) WITH CHECK ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Only admins can update woocommerce_connections" ON "public"."woocommerce_connections" FOR UPDATE TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text"])) WITH CHECK ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Only admins can view security_audit_log" ON "public"."security_audit_log" FOR SELECT TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Only admins can view security_audit_logs" ON "public"."security_audit_logs" FOR SELECT TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Only admins can view woocommerce_connections" ON "public"."woocommerce_connections" FOR SELECT TO "authenticated" USING ("public"."user_has_role"(ARRAY['admin'::"text"]));



CREATE POLICY "Only system triggers can insert audit_log" ON "public"."security_audit_log" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "Permissioned users can view payment methods" ON "public"."payment_methods" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'manager'::"public"."user_role") OR (EXISTS ( SELECT 1
   FROM ("public"."user_roles" "ur"
     JOIN "public"."role_permissions" "rp" ON (("rp"."role" = "ur"."role")))
  WHERE (("ur"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("rp"."permission_key" = 'settings.payment_methods'::"text") AND ("rp"."allowed" = true)))))));



CREATE POLICY "Staff and above can view courier payment rules" ON "public"."courier_payment_rules" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'manager'::"public"."user_role") OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'staff'::"public"."user_role"))));



CREATE POLICY "System can insert woocommerce_import_logs" ON "public"."woocommerce_import_logs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "System can insert woocommerce_sync_logs" ON "public"."woocommerce_sync_logs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Users can delete product_attribute_values" ON "public"."product_attribute_values" FOR DELETE TO "authenticated" USING ("public"."has_permission"("auth"."uid"(), 'products.delete'::"text"));



CREATE POLICY "Users can delete product_attributes" ON "public"."product_attributes" FOR DELETE TO "authenticated" USING ("public"."has_permission"("auth"."uid"(), 'products.delete'::"text"));



CREATE POLICY "Users can insert own profile or admins can insert any" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((("id" = "auth"."uid"()) OR "public"."user_has_role"(ARRAY['admin'::"text"])));



CREATE POLICY "Users can insert product_attribute_values" ON "public"."product_attribute_values" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"("auth"."uid"(), 'products.add'::"text"));



CREATE POLICY "Users can insert product_attributes" ON "public"."product_attributes" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"("auth"."uid"(), 'products.add'::"text"));



CREATE POLICY "Users can manage their own dismissed alerts" ON "public"."dismissed_alerts" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can manage their own preferences" ON "public"."user_preferences" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role"))) WITH CHECK ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role")));



CREATE POLICY "Users can update product_attribute_values" ON "public"."product_attribute_values" FOR UPDATE TO "authenticated" USING ("public"."has_permission"("auth"."uid"(), 'products.edit'::"text"));



CREATE POLICY "Users can update product_attributes" ON "public"."product_attributes" FOR UPDATE TO "authenticated" USING ("public"."has_permission"("auth"."uid"(), 'products.edit'::"text"));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role")));



CREATE POLICY "Users can view own role" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."user_has_role"(ARRAY['admin'::"text", 'manager'::"text"])));



CREATE POLICY "Users can view product_attribute_values" ON "public"."product_attribute_values" FOR SELECT TO "authenticated" USING ("public"."has_permission"("auth"."uid"(), 'products.view'::"text"));



CREATE POLICY "Users can view product_attributes" ON "public"."product_attributes" FOR SELECT TO "authenticated" USING ("public"."has_permission"("auth"."uid"(), 'products.view'::"text"));



CREATE POLICY "Users can view relevant role permissions" ON "public"."role_permissions" FOR SELECT TO "authenticated" USING (("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role") OR (EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ur"."role" = "role_permissions"."role"))))));



CREATE POLICY "Users can view reusable_attributes" ON "public"."reusable_attributes" FOR SELECT TO "authenticated" USING ("public"."has_permission"("auth"."uid"(), 'products.view'::"text"));



CREATE POLICY "Users can view sale payments for accessible sales" ON "public"."sale_payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."sales"
  WHERE ("sales"."id" = "sale_payments"."sale_id"))));



CREATE POLICY "Users with courier permission can view courier_webhook_settings" ON "public"."courier_webhook_settings" FOR SELECT TO "authenticated" USING (("public"."user_has_role"(ARRAY['admin'::"text"]) OR "public"."has_permission"("auth"."uid"(), 'courier.send'::"text") OR "public"."has_permission"("auth"."uid"(), 'courier.refresh'::"text")));



CREATE POLICY "Users with manage_permissions can delete role permissions" ON "public"."role_permissions" FOR DELETE TO "authenticated" USING ("public"."user_has_permission"('admin.manage_permissions'::"text"));



CREATE POLICY "Users with manage_permissions can update role permissions" ON "public"."role_permissions" FOR UPDATE TO "authenticated" USING ("public"."user_has_permission"('admin.manage_permissions'::"text")) WITH CHECK ("public"."user_has_permission"('admin.manage_permissions'::"text"));



CREATE POLICY "Users with permission can add customers" ON "public"."customers" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"("auth"."uid"(), 'customers.add'::"text"));



CREATE POLICY "Users with permission can add inventory_logs" ON "public"."inventory_logs" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_permission"("auth"."uid"(), 'inventory.adjust_stock'::"text") OR "public"."has_permission"("auth"."uid"(), 'products.edit'::"text")));



CREATE POLICY "Users with permission can add products" ON "public"."products" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"("auth"."uid"(), 'products.add'::"text"));



CREATE POLICY "Users with permission can add variants" ON "public"."product_variants" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"("auth"."uid"(), 'products.add'::"text"));



CREATE POLICY "Users with permission can create sales" ON "public"."sales" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"("auth"."uid"(), 'sales.create'::"text"));



CREATE POLICY "Users with permission can insert sale_items" ON "public"."sale_items" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_permission"("auth"."uid"(), 'sales.create'::"text") OR "public"."has_permission"("auth"."uid"(), 'sales.edit'::"text")));



CREATE POLICY "Users with permission can insert sale_payments" ON "public"."sale_payments" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_permission"("auth"."uid"(), 'sales.create'::"text") OR "public"."has_permission"("auth"."uid"(), 'sales.edit'::"text")));



CREATE POLICY "Users with permission can insert sales_items" ON "public"."sales_items" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_permission"("auth"."uid"(), 'sales.create'::"text"));



CREATE POLICY "Users with permission can view products" ON "public"."products" FOR SELECT TO "authenticated" USING ("public"."has_permission"("auth"."uid"(), 'products.view'::"text"));



CREATE POLICY "Users with permission can view sales_items" ON "public"."sales_items" FOR SELECT TO "authenticated" USING ("public"."has_permission"("auth"."uid"(), 'sales.view'::"text"));



CREATE POLICY "Users with permission can view variants" ON "public"."product_variants" FOR SELECT TO "authenticated" USING ("public"."has_permission"("auth"."uid"(), 'products.view'::"text"));



CREATE POLICY "Users with sales permissions can delete payments" ON "public"."sale_payments" FOR DELETE TO "authenticated" USING ("public"."user_has_permission"('sales.edit'::"text"));



CREATE POLICY "Users with sales permissions can delete sale items" ON "public"."sale_items" FOR DELETE TO "authenticated" USING (("public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'sales.delete'::"text") OR "public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'products.delete'::"text")));



CREATE POLICY "Users with sales permissions can update payments" ON "public"."sale_payments" FOR UPDATE TO "authenticated" USING ("public"."user_has_permission"('sales.edit'::"text")) WITH CHECK ("public"."user_has_permission"('sales.edit'::"text"));



CREATE POLICY "Users with sales permissions can update sale items" ON "public"."sale_items" FOR UPDATE TO "authenticated" USING ("public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'sales.edit'::"text")) WITH CHECK ("public"."has_permission"(( SELECT "auth"."uid"() AS "uid"), 'sales.edit'::"text"));



ALTER TABLE "public"."activity_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_logs_delete_policy" ON "public"."activity_logs" FOR DELETE TO "authenticated" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."user_role"));



ALTER TABLE "public"."auto_refresh_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."courier_payment_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."courier_webhook_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."custom_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dismissed_alerts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_methods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_attribute_values" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_attributes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_variants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reusable_attributes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sale_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sale_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."woocommerce_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."woocommerce_import_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."woocommerce_sync_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."woocommerce_sync_schedules" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."adjust_stock_on_sales_items"() TO "anon";
GRANT ALL ON FUNCTION "public"."adjust_stock_on_sales_items"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_stock_on_sales_items"() TO "service_role";



GRANT ALL ON FUNCTION "public"."adjust_stock_on_sales_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."adjust_stock_on_sales_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_stock_on_sales_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."block_core_courier_rule_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."block_core_courier_rule_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_core_courier_rule_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."block_core_payment_method_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."block_core_payment_method_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_core_payment_method_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_activity_logs"("retention_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_activity_logs"("retention_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_activity_logs"("retention_days" integer) TO "service_role";



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



GRANT ALL ON FUNCTION "public"."hard_delete_product"("_product_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."hard_delete_product"("_product_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hard_delete_product"("_product_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."has_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_permission"("_user_id" "uuid", "_permission_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_permission"("_user_id" "uuid", "_permission_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_permission"("_user_id" "uuid", "_permission_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."user_role") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."user_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."user_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_activity_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_activity_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_activity_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_activity_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_activity_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_activity_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_sensitive_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_sensitive_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_sensitive_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_created_by"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_created_by"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_created_by"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_sales_status_change_dates"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_sales_status_change_dates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_sales_status_change_dates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_parent_stock_from_variants"("p_product_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."sync_parent_stock_from_variants"("p_product_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_parent_stock_from_variants"("p_product_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_sync_parent_stock_from_variants"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_sync_parent_stock_from_variants"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_sync_parent_stock_from_variants"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_auto_refresh_courier_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_auto_refresh_courier_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_auto_refresh_courier_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_has_permission"("permission" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_permission"("permission" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_permission"("permission" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_has_role"("required_roles" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_role"("required_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_role"("required_roles" "text"[]) TO "service_role";












SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;









GRANT ALL ON TABLE "public"."activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."activity_logs_view" TO "anon";
GRANT ALL ON TABLE "public"."activity_logs_view" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_logs_view" TO "service_role";



GRANT ALL ON TABLE "public"."auto_refresh_runs" TO "anon";
GRANT ALL ON TABLE "public"."auto_refresh_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."auto_refresh_runs" TO "service_role";



GRANT ALL ON TABLE "public"."business_settings" TO "anon";
GRANT ALL ON TABLE "public"."business_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."business_settings" TO "service_role";



GRANT ALL ON TABLE "public"."courier_payment_rules" TO "anon";
GRANT ALL ON TABLE "public"."courier_payment_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."courier_payment_rules" TO "service_role";



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



GRANT ALL ON TABLE "public"."payment_methods" TO "anon";
GRANT ALL ON TABLE "public"."payment_methods" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_methods" TO "service_role";



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



GRANT ALL ON TABLE "public"."reusable_attributes" TO "anon";
GRANT ALL ON TABLE "public"."reusable_attributes" TO "authenticated";
GRANT ALL ON TABLE "public"."reusable_attributes" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."sale_items" TO "anon";
GRANT ALL ON TABLE "public"."sale_items" TO "authenticated";
GRANT ALL ON TABLE "public"."sale_items" TO "service_role";



GRANT ALL ON TABLE "public"."sale_payments" TO "anon";
GRANT ALL ON TABLE "public"."sale_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."sale_payments" TO "service_role";



GRANT ALL ON TABLE "public"."sales" TO "anon";
GRANT ALL ON TABLE "public"."sales" TO "authenticated";
GRANT ALL ON TABLE "public"."sales" TO "service_role";



GRANT ALL ON TABLE "public"."sales_items" TO "anon";
GRANT ALL ON TABLE "public"."sales_items" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_items" TO "service_role";



GRANT ALL ON TABLE "public"."security_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."security_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."security_audit_log" TO "service_role";



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




























