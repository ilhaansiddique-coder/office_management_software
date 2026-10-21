-- Fix security_audit_log INSERT policy to be more restrictive
-- The audit log should only be written by triggers, not directly by users

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "System can insert security_audit_log" ON public.security_audit_log;

-- Create a more restrictive policy that only allows inserts via SECURITY DEFINER functions
-- Since the log_sensitive_changes() trigger function is SECURITY DEFINER, it will bypass RLS
-- Regular users won't be able to insert directly
CREATE POLICY "Only system triggers can insert audit_log"
  ON public.security_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (false);  -- No direct inserts allowed; triggers use SECURITY DEFINER

-- Note: The log_sensitive_changes() function is SECURITY DEFINER which means
-- it runs with the privileges of the function owner (superuser), bypassing RLS.
-- This ensures audit logs can still be written by triggers while preventing
-- direct manipulation by users.
