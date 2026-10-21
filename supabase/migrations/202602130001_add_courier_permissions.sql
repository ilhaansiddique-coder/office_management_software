-- Add courier.send and courier.refresh permissions to role_permissions table
-- These control visibility of courier-related actions in the Sales page

-- Insert courier.send permission for each role
-- Admin already has all permissions via '*' wildcard
-- Managers and staff can send to courier by default
INSERT INTO public.role_permissions (role, permission_key, allowed)
SELECT v.role::public.user_role, v.permission_key::text, v.allowed::boolean
FROM (
  VALUES
    ('manager', 'courier.send', true),
    ('staff', 'courier.send', true)
) AS v(role, permission_key, allowed)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.role_permissions rp
  WHERE rp.role = v.role::public.user_role
    AND rp.permission_key = v.permission_key::text
);

-- Insert courier.refresh permission for each role
-- Managers and staff can refresh courier status by default
INSERT INTO public.role_permissions (role, permission_key, allowed)
SELECT v.role::public.user_role, v.permission_key::text, v.allowed::boolean
FROM (
  VALUES
    ('manager', 'courier.refresh', true),
    ('staff', 'courier.refresh', true)
) AS v(role, permission_key, allowed)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.role_permissions rp
  WHERE rp.role = v.role::public.user_role
    AND rp.permission_key = v.permission_key::text
);

-- Verify the inserted permissions
-- SELECT * FROM public.role_permissions WHERE permission_key LIKE 'courier.%';
