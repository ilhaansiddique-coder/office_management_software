-- Image Migration: Update image URLs from old Supabase instances to self-hosted
-- Run this on the self-hosted Supabase (supabase.inventra.site)

-- Replace FIRST old Supabase URL (czkffssrltgsinzxxhja)
UPDATE products
SET image_url = REPLACE(image_url, 'https://czkffssrltgsinzxxhja.supabase.co', 'https://supabase.inventra.site')
WHERE image_url LIKE '%czkffssrltgsinzxxhja.supabase.co%';

UPDATE product_variants
SET image_url = REPLACE(image_url, 'https://czkffssrltgsinzxxhja.supabase.co', 'https://supabase.inventra.site')
WHERE image_url LIKE '%czkffssrltgsinzxxhja.supabase.co%';

UPDATE sale_items
SET product_image_url = REPLACE(product_image_url, 'https://czkffssrltgsinzxxhja.supabase.co', 'https://supabase.inventra.site')
WHERE product_image_url LIKE '%czkffssrltgsinzxxhja.supabase.co%';

UPDATE sale_items
SET variant_image_url = REPLACE(variant_image_url, 'https://czkffssrltgsinzxxhja.supabase.co', 'https://supabase.inventra.site')
WHERE variant_image_url LIKE '%czkffssrltgsinzxxhja.supabase.co%';

UPDATE business_settings
SET logo_url = REPLACE(logo_url, 'https://czkffssrltgsinzxxhja.supabase.co', 'https://supabase.inventra.site')
WHERE logo_url LIKE '%czkffssrltgsinzxxhja.supabase.co%';

-- Replace SECOND old Supabase URL (smopyfuaijaklmtpwgws)
UPDATE products
SET image_url = REPLACE(image_url, 'https://smopyfuaijaklmtpwgws.supabase.co', 'https://supabase.inventra.site')
WHERE image_url LIKE '%smopyfuaijaklmtpwgws.supabase.co%';

UPDATE product_variants
SET image_url = REPLACE(image_url, 'https://smopyfuaijaklmtpwgws.supabase.co', 'https://supabase.inventra.site')
WHERE image_url LIKE '%smopyfuaijaklmtpwgws.supabase.co%';

UPDATE sale_items
SET product_image_url = REPLACE(product_image_url, 'https://smopyfuaijaklmtpwgws.supabase.co', 'https://supabase.inventra.site')
WHERE product_image_url LIKE '%smopyfuaijaklmtpwgws.supabase.co%';

UPDATE sale_items
SET variant_image_url = REPLACE(variant_image_url, 'https://smopyfuaijaklmtpwgws.supabase.co', 'https://supabase.inventra.site')
WHERE variant_image_url LIKE '%smopyfuaijaklmtpwgws.supabase.co%';

UPDATE business_settings
SET logo_url = REPLACE(logo_url, 'https://smopyfuaijaklmtpwgws.supabase.co', 'https://supabase.inventra.site')
WHERE logo_url LIKE '%smopyfuaijaklmtpwgws.supabase.co%';
