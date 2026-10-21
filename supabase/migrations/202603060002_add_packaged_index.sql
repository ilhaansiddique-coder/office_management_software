-- Index for efficient lookups and invalidation filtering on packaged status.
CREATE INDEX IF NOT EXISTS idx_sales_packaged
  ON public.sales (packaged);
