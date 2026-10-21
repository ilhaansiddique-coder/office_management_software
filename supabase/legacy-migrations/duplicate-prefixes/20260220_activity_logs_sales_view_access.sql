-- Allow users who can view sale details to also see the activity logs for those sales
-- Previously only users with 'logs.view' permission could see activity logs,
-- which meant users with 'sales.view' could open sale details but saw no activity logs.

-- Drop the current policy
DROP POLICY IF EXISTS "Users with logs.view permission can view activity_logs" ON public.activity_logs;

-- Create updated policy: allow logs.view OR entity-specific view permissions
CREATE POLICY "Users can view activity_logs based on entity permissions"
  ON public.activity_logs FOR SELECT
  USING (
    -- Full logs access (admin activity logs page)
    public.has_permission(auth.uid(), 'logs.view')
    OR
    -- Users who can view sales can see sales-related activity logs
    (entity_type = 'sales' AND public.has_permission(auth.uid(), 'sales.view'))
  );

-- Fix: User names showing as UUIDs in activity logs.
-- The activity_logs_view has security_invoker=on, so the profiles JOIN is subject
-- to the querying user's RLS. The profiles SELECT policy only allows users to see
-- their own profile (or admins see all), so other users' names come back as NULL.
-- Fix: Allow all authenticated users to read profiles (names/emails are displayed
-- throughout the app in activity logs, sales, etc). Keep security_invoker=on.
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Profiles select" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

-- Revert view to security_invoker=on if it was changed
ALTER VIEW public.activity_logs_view SET (security_invoker = on);
