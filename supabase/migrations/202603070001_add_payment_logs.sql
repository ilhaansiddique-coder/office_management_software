CREATE TABLE IF NOT EXISTS public.payment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0 CHECK (amount > 0),
  paid_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  paid_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_logs_sale_id_created_at
  ON public.payment_logs (sale_id, created_at DESC);

ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view payment logs for accessible sales" ON public.payment_logs;
CREATE POLICY "Users can view payment logs for accessible sales"
  ON public.payment_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sales
      WHERE sales.id = payment_logs.sale_id
    )
  );

DROP POLICY IF EXISTS "Users with permission can insert payment logs" ON public.payment_logs;
CREATE POLICY "Users with permission can insert payment logs"
  ON public.payment_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'sales.create')
    OR public.has_permission(auth.uid(), 'sales.edit')
  );

DROP POLICY IF EXISTS "Users with sales permissions can update payment logs" ON public.payment_logs;
CREATE POLICY "Users with sales permissions can update payment logs"
  ON public.payment_logs
  FOR UPDATE
  TO authenticated
  USING (public.user_has_permission('sales.edit'))
  WITH CHECK (public.user_has_permission('sales.edit'));

DROP POLICY IF EXISTS "Users with sales permissions can delete payment logs" ON public.payment_logs;
CREATE POLICY "Users with sales permissions can delete payment logs"
  ON public.payment_logs
  FOR DELETE
  TO authenticated
  USING (public.user_has_permission('sales.edit'));

INSERT INTO public.payment_logs (sale_id, amount, paid_by_user_id, paid_by_name, created_at)
SELECT
  al.entity_id::uuid AS sale_id,
  COALESCE(
    NULLIF((al.details ->> 'amount')::numeric, 0),
    NULLIF((al.details ->> 'amount_paid')::numeric, 0)
  ) AS amount,
  al.user_id,
  COALESCE(al.details ->> 'paid_by', al.details ->> 'paid_by_name', al.full_name, al.email) AS paid_by_name,
  al.created_at
FROM public.activity_logs_view al
WHERE al.entity_type = 'payments'
  AND al.entity_id IS NOT NULL
  AND COALESCE(
    NULLIF((al.details ->> 'amount')::numeric, 0),
    NULLIF((al.details ->> 'amount_paid')::numeric, 0)
  ) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.payment_logs pl
    WHERE pl.sale_id = al.entity_id::uuid
      AND pl.amount = COALESCE(
        NULLIF((al.details ->> 'amount')::numeric, 0),
        NULLIF((al.details ->> 'amount_paid')::numeric, 0)
      )
      AND pl.created_at = al.created_at
  );
