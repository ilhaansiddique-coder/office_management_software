-- FIX: Create or replace has_permission function to work with role_permissions table
-- This function checks if a user has a specific permission based on their role

CREATE OR REPLACE FUNCTION public.has_permission(user_id uuid, permission_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
  is_allowed boolean;
BEGIN
  -- Get the user's role
  SELECT role INTO user_role
  FROM public.user_roles
  WHERE public.user_roles.user_id = has_permission.user_id;

  -- If no role found, deny access
  IF user_role IS NULL THEN
    RETURN false;
  END IF;

  -- Admin has all permissions
  IF user_role = 'admin' THEN
    RETURN true;
  END IF;

  -- Check if the permission is explicitly allowed for this role
  SELECT allowed INTO is_allowed
  FROM public.role_permissions
  WHERE public.role_permissions.role = user_role
    AND public.role_permissions.permission_key = has_permission.permission_key;

  -- Return the permission value, or false if not found
  RETURN COALESCE(is_allowed, false);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.has_permission IS 'Checks if a user has a specific permission based on their role in role_permissions table';
