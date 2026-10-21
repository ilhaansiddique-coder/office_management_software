-- Add courier.send and courier.refresh permissions to role_permissions table
-- These control visibility of courier-related actions in the Sales page

-- Insert courier.send permission for each role
-- Admin already has all permissions via '*' wildcard
-- Store managers and staff can send to courier by default
INSERT INTO public.role_permissions (role, permission_key, allowed)
VALUES
  ('store_manager', 'courier.send', true),
  ('staff', 'courier.send', true)
ON CONFLICT (role, permission_key) DO NOTHING;

-- Insert courier.refresh permission for each role
-- Store managers and staff can refresh courier status by default
INSERT INTO public.role_permissions (role, permission_key, allowed)
VALUES
  ('store_manager', 'courier.refresh', true),
  ('staff', 'courier.refresh', true)
ON CONFLICT (role, permission_key) DO NOTHING;

-- Verify the inserted permissions
-- SELECT * FROM public.role_permissions WHERE permission_key LIKE 'courier.%';
