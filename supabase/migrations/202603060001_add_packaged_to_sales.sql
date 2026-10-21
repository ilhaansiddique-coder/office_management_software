-- Track packaged status for sales so UI state can sync across devices
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS packaged BOOLEAN NOT NULL DEFAULT false;

-- Ensure timestamp tracking column exists on the sales table.
-- No-op if updated_at is already present in the schema.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
