ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS alias_names text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_customers_alias_names_gin
ON public.customers
USING gin (alias_names);
