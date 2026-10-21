-- SECURITY HARDENING: Secure Row Level Security Policies
-- This migration fixes overly permissive RLS policies and implements proper role-based access control

-- ============================================================================
-- Helper function to check user role
-- ============================================================================
CREATE OR REPLACE FUNCTION public.user_has_role(required_roles text[])
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ============================================================================
-- COURIER WEBHOOK SETTINGS - Sensitive API credentials
-- Only admins should be able to view/modify
-- ============================================================================

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can manage courier_webhook_settings" ON public.courier_webhook_settings;
DROP POLICY IF EXISTS "Users can view active courier_webhook_settings" ON public.courier_webhook_settings;
DROP POLICY IF EXISTS "Users can manage courier_webhook_settings" ON public.courier_webhook_settings;

-- Create secure admin-only policies
DROP POLICY IF EXISTS "Only admins can view courier_webhook_settings" ON public.courier_webhook_settings;
CREATE POLICY "Only admins can view courier_webhook_settings"
  ON public.courier_webhook_settings
  FOR SELECT
  TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

DROP POLICY IF EXISTS "Only admins can insert courier_webhook_settings" ON public.courier_webhook_settings;
CREATE POLICY "Only admins can insert courier_webhook_settings"
  ON public.courier_webhook_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_role(ARRAY['admin']));

DROP POLICY IF EXISTS "Only admins can update courier_webhook_settings" ON public.courier_webhook_settings;
CREATE POLICY "Only admins can update courier_webhook_settings"
  ON public.courier_webhook_settings
  FOR UPDATE
  TO authenticated
  USING (public.user_has_role(ARRAY['admin']))
  WITH CHECK (public.user_has_role(ARRAY['admin']));

DROP POLICY IF EXISTS "Only admins can delete courier_webhook_settings" ON public.courier_webhook_settings;
CREATE POLICY "Only admins can delete courier_webhook_settings"
  ON public.courier_webhook_settings
  FOR DELETE
  TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

-- ============================================================================
-- BUSINESS SETTINGS - Only admins and managers
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can manage business_settings" ON public.business_settings;
DROP POLICY IF EXISTS "Users can view business_settings" ON public.business_settings;
DROP POLICY IF EXISTS "Users can manage business_settings" ON public.business_settings;

-- Anyone authenticated can view (needed for invoice headers, etc.)
DROP POLICY IF EXISTS "Authenticated users can view business_settings" ON public.business_settings;
CREATE POLICY "Authenticated users can view business_settings"
  ON public.business_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Only admins/managers can modify
DROP POLICY IF EXISTS "Admins and managers can insert business_settings" ON public.business_settings;
CREATE POLICY "Admins and managers can insert business_settings"
  ON public.business_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_role(ARRAY['admin', 'manager']));

DROP POLICY IF EXISTS "Admins and managers can update business_settings" ON public.business_settings;
CREATE POLICY "Admins and managers can update business_settings"
  ON public.business_settings
  FOR UPDATE
  TO authenticated
  USING (public.user_has_role(ARRAY['admin', 'manager']))
  WITH CHECK (public.user_has_role(ARRAY['admin', 'manager']));

DROP POLICY IF EXISTS "Only admins can delete business_settings" ON public.business_settings;
CREATE POLICY "Only admins can delete business_settings"
  ON public.business_settings
  FOR DELETE
  TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

-- ============================================================================
-- SYSTEM SETTINGS - Only admins
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can manage system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Users can view system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Users can manage system_settings" ON public.system_settings;

-- Anyone authenticated can view
DROP POLICY IF EXISTS "Authenticated users can view system_settings" ON public.system_settings;
CREATE POLICY "Authenticated users can view system_settings"
  ON public.system_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Only admins can modify
DROP POLICY IF EXISTS "Only admins can insert system_settings" ON public.system_settings;
CREATE POLICY "Only admins can insert system_settings"
  ON public.system_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_role(ARRAY['admin']));

DROP POLICY IF EXISTS "Only admins can update system_settings" ON public.system_settings;
CREATE POLICY "Only admins can update system_settings"
  ON public.system_settings
  FOR UPDATE
  TO authenticated
  USING (public.user_has_role(ARRAY['admin']))
  WITH CHECK (public.user_has_role(ARRAY['admin']));

DROP POLICY IF EXISTS "Only admins can delete system_settings" ON public.system_settings;
CREATE POLICY "Only admins can delete system_settings"
  ON public.system_settings
  FOR DELETE
  TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

-- ============================================================================
-- CUSTOM SETTINGS (CSS, etc.) - Only admins
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can manage custom_settings" ON public.custom_settings;
DROP POLICY IF EXISTS "Users can view custom_settings" ON public.custom_settings;
DROP POLICY IF EXISTS "Users can manage custom_settings" ON public.custom_settings;

-- Anyone authenticated can view (CSS needs to load for all users)
DROP POLICY IF EXISTS "Authenticated users can view custom_settings" ON public.custom_settings;
CREATE POLICY "Authenticated users can view custom_settings"
  ON public.custom_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Only admins can modify
DROP POLICY IF EXISTS "Only admins can insert custom_settings" ON public.custom_settings;
CREATE POLICY "Only admins can insert custom_settings"
  ON public.custom_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_role(ARRAY['admin']));

DROP POLICY IF EXISTS "Only admins can update custom_settings" ON public.custom_settings;
CREATE POLICY "Only admins can update custom_settings"
  ON public.custom_settings
  FOR UPDATE
  TO authenticated
  USING (public.user_has_role(ARRAY['admin']))
  WITH CHECK (public.user_has_role(ARRAY['admin']));

DROP POLICY IF EXISTS "Only admins can delete custom_settings" ON public.custom_settings;
CREATE POLICY "Only admins can delete custom_settings"
  ON public.custom_settings
  FOR DELETE
  TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

-- ============================================================================
-- USER ROLES - Only admins can manage, users can view their own
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage user roles" ON public.user_roles;

-- Users can view their own role
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
CREATE POLICY "Users can view own role"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.user_has_role(ARRAY['admin', 'manager']));

-- Only admins can modify roles
DROP POLICY IF EXISTS "Only admins can insert user_roles" ON public.user_roles;
CREATE POLICY "Only admins can insert user_roles"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_role(ARRAY['admin']));

DROP POLICY IF EXISTS "Only admins can update user_roles" ON public.user_roles;
CREATE POLICY "Only admins can update user_roles"
  ON public.user_roles
  FOR UPDATE
  TO authenticated
  USING (public.user_has_role(ARRAY['admin']))
  WITH CHECK (public.user_has_role(ARRAY['admin']));

DROP POLICY IF EXISTS "Only admins can delete user_roles" ON public.user_roles;
CREATE POLICY "Only admins can delete user_roles"
  ON public.user_roles
  FOR DELETE
  TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

-- ============================================================================
-- WOOCOMMERCE CONNECTIONS - Only admins (contains API credentials)
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can manage woocommerce_connections" ON public.woocommerce_connections;
DROP POLICY IF EXISTS "Users can manage woocommerce_connections" ON public.woocommerce_connections;

DROP POLICY IF EXISTS "Only admins can view woocommerce_connections" ON public.woocommerce_connections;
CREATE POLICY "Only admins can view woocommerce_connections"
  ON public.woocommerce_connections
  FOR SELECT
  TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

DROP POLICY IF EXISTS "Only admins can insert woocommerce_connections" ON public.woocommerce_connections;
CREATE POLICY "Only admins can insert woocommerce_connections"
  ON public.woocommerce_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_has_role(ARRAY['admin']));

DROP POLICY IF EXISTS "Only admins can update woocommerce_connections" ON public.woocommerce_connections;
CREATE POLICY "Only admins can update woocommerce_connections"
  ON public.woocommerce_connections
  FOR UPDATE
  TO authenticated
  USING (public.user_has_role(ARRAY['admin']))
  WITH CHECK (public.user_has_role(ARRAY['admin']));

DROP POLICY IF EXISTS "Only admins can delete woocommerce_connections" ON public.woocommerce_connections;
CREATE POLICY "Only admins can delete woocommerce_connections"
  ON public.woocommerce_connections
  FOR DELETE
  TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

-- ============================================================================
-- AUTO REFRESH RUNS - Only admins can view
-- ============================================================================

DROP POLICY IF EXISTS "Allow admins to view auto-refresh runs" ON public.auto_refresh_runs;

DROP POLICY IF EXISTS "Only admins and managers can view auto_refresh_runs" ON public.auto_refresh_runs;
CREATE POLICY "Only admins and managers can view auto_refresh_runs"
  ON public.auto_refresh_runs
  FOR SELECT
  TO authenticated
  USING (public.user_has_role(ARRAY['admin', 'manager']));

-- ============================================================================
-- Add audit logging for sensitive operations
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  table_name text,
  record_id text,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on audit log
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
DROP POLICY IF EXISTS "Only admins can view security_audit_log" ON public.security_audit_log;
CREATE POLICY "Only admins can view security_audit_log"
  ON public.security_audit_log
  FOR SELECT
  TO authenticated
  USING (public.user_has_role(ARRAY['admin']));

-- System can insert (via triggers)
DROP POLICY IF EXISTS "System can insert security_audit_log" ON public.security_audit_log;
CREATE POLICY "System can insert security_audit_log"
  ON public.security_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_security_audit_log_created_at
  ON public.security_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_user_id
  ON public.security_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_action
  ON public.security_audit_log(action);

-- ============================================================================
-- Audit trigger for sensitive tables
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_sensitive_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- Add audit triggers to sensitive tables
DROP TRIGGER IF EXISTS audit_courier_webhook_settings ON public.courier_webhook_settings;
CREATE TRIGGER audit_courier_webhook_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.courier_webhook_settings
  FOR EACH ROW EXECUTE FUNCTION public.log_sensitive_changes();

DROP TRIGGER IF EXISTS audit_user_roles ON public.user_roles;
CREATE TRIGGER audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_sensitive_changes();

DROP TRIGGER IF EXISTS audit_woocommerce_connections ON public.woocommerce_connections;
CREATE TRIGGER audit_woocommerce_connections
  AFTER INSERT OR UPDATE OR DELETE ON public.woocommerce_connections
  FOR EACH ROW EXECUTE FUNCTION public.log_sensitive_changes();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON FUNCTION public.user_has_role IS 'Helper function to check if the current user has one of the specified roles';
COMMENT ON TABLE public.security_audit_log IS 'Audit log for tracking changes to sensitive data';
COMMENT ON FUNCTION public.log_sensitive_changes IS 'Trigger function to log changes to sensitive tables';
