-- Add tagline column to business_settings table
ALTER TABLE "public"."business_settings"
ADD COLUMN IF NOT EXISTS "tagline" text DEFAULT 'WE SUPPLY ALL KINDS OF READY MADE GARMENTS';
