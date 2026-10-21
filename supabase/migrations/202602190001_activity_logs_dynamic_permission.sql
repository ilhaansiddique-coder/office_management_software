-- Update activity_logs RLS policy to use dynamic permission system
-- Instead of hardcoded admin/manager roles, use has_permission() function
-- so any role with 'logs.view' permission can read activity logs

-- Drop old hardcoded policy
DROP POLICY IF EXISTS "Only admins and managers can view activity_logs" ON public.activity_logs;

-- Create new policy using dynamic permission check
CREATE POLICY "Users with logs.view permission can view activity_logs"
  ON public.activity_logs FOR SELECT
  USING (public.has_permission(auth.uid(), 'logs.view'));

-- Also update the activity_logs_view if RLS applies to it
-- (Views inherit RLS from underlying tables, so updating activity_logs is sufficient)
