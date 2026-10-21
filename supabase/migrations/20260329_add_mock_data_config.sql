-- Migration: Add Mock Data Configuration to System Settings
-- Created: 2026-03-29
-- Purpose: Add configurable mock data toggle for demo/testing purposes

-- Add columns to system_settings table
ALTER TABLE "public"."system_settings" 
ADD COLUMN "mock_data_enabled" boolean DEFAULT false NOT NULL,
ADD COLUMN "mock_data_scale" decimal(3,2) DEFAULT 0.1 NOT NULL CHECK (mock_data_scale > 0 AND mock_data_scale <= 1);

-- Add comment for clarity
COMMENT ON COLUMN "public"."system_settings"."mock_data_enabled" IS 'When true, display scaling is applied to all financial metrics. Database values remain unchanged.';
COMMENT ON COLUMN "public"."system_settings"."mock_data_scale" IS 'Scale factor for demo data. 0.1 = 10%, 0.5 = 50%. Only used when mock_data_enabled is true.';

-- Optional: Create audit log entry for this schema change
-- (if activity logs track schema changes)

-- Verification: Ensure existing rows get the default values
-- SELECT id, mock_data_enabled, mock_data_scale FROM "public"."system_settings";
