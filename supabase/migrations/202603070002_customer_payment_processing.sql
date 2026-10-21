ALTER TABLE public.payment_logs
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_number text;

CREATE INDEX IF NOT EXISTS idx_payment_logs_customer_id_created_at
  ON public.payment_logs (customer_id, created_at DESC);

UPDATE public.payment_logs pl
SET
  customer_id = s.customer_id,
  invoice_number = s.invoice_number
FROM public.sales s
WHERE s.id = pl.sale_id
  AND (pl.customer_id IS NULL OR pl.invoice_number IS NULL);

INSERT INTO public.payment_logs (
  sale_id,
  customer_id,
  invoice_number,
  amount,
  paid_by_user_id,
  paid_by_name,
  created_at
)
SELECT
  s.id,
  s.customer_id,
  s.invoice_number,
  COALESCE(
    NULLIF((al.details ->> 'amount')::numeric, 0),
    NULLIF((al.details ->> 'amount_paid')::numeric, 0)
  ) AS amount,
  al.user_id,
  COALESCE(al.details ->> 'paid_by', al.details ->> 'paid_by_name', p.full_name) AS paid_by_name,
  al.created_at
FROM public.activity_logs al
JOIN public.sales s
  ON s.id = al.entity_id::uuid
LEFT JOIN public.profiles p
  ON p.id = al.user_id
WHERE al.entity_type = 'payments'
  AND al.entity_id IS NOT NULL
  AND COALESCE(
    NULLIF((al.details ->> 'amount')::numeric, 0),
    NULLIF((al.details ->> 'amount_paid')::numeric, 0)
  ) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.payment_logs pl
    WHERE pl.sale_id = s.id
      AND pl.amount = COALESCE(
        NULLIF((al.details ->> 'amount')::numeric, 0),
        NULLIF((al.details ->> 'amount_paid')::numeric, 0)
      )
      AND pl.created_at = al.created_at
  );

CREATE OR REPLACE FUNCTION public.process_customer_payment(
  p_customer_id uuid,
  p_amount numeric,
  p_paid_by_name text DEFAULT NULL
)
RETURNS TABLE (
  payment_log_id uuid,
  sale_id uuid,
  invoice_number text,
  applied_amount numeric,
  updated_amount_paid numeric,
  updated_amount_due numeric,
  paid_by_name text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining numeric := ROUND(COALESCE(p_amount, 0)::numeric, 2);
  v_initial_amount numeric := ROUND(COALESCE(p_amount, 0)::numeric, 2);
  v_apply numeric;
  v_payment_log_id uuid;
  v_created_at timestamptz;
  v_user_id uuid := auth.uid();
  v_paid_by_name text := NULLIF(TRIM(COALESCE(p_paid_by_name, '')), '');
  v_updated_amount_paid numeric;
  v_updated_amount_due numeric;
  sale_row RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT (
    public.has_permission(v_user_id, 'sales.create')
    OR public.has_permission(v_user_id, 'sales.edit')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to record payments';
  END IF;

  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer is required';
  END IF;

  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  IF v_paid_by_name IS NULL THEN
    SELECT NULLIF(TRIM(full_name), '')
    INTO v_paid_by_name
    FROM public.profiles
    WHERE id = v_user_id;
  END IF;

  IF v_paid_by_name IS NULL THEN
    v_paid_by_name := 'Unknown User';
  END IF;

  FOR sale_row IN
    SELECT
      s.id,
      s.customer_id,
      s.invoice_number,
      ROUND(COALESCE(s.review_amount_paid, s.amount_paid, 0)::numeric, 2) AS current_amount_paid,
      ROUND(COALESCE(s.review_amount_due, s.amount_due, 0)::numeric, 2) AS current_amount_due,
      s.created_at
    FROM public.sales s
    WHERE s.customer_id = p_customer_id
      AND COALESCE(s.review_amount_due, s.amount_due, 0) > 0
      AND (s.is_deleted = false OR s.is_deleted IS NULL)
      AND COALESCE(LOWER(s.courier_status), '') NOT IN ('cancelled', 'returned', 'lost')
    ORDER BY s.created_at ASC, s.invoice_number ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_apply := LEAST(v_remaining, sale_row.current_amount_due);
    IF v_apply <= 0 THEN
      CONTINUE;
    END IF;

    v_updated_amount_paid := ROUND(sale_row.current_amount_paid + v_apply, 2);
    v_updated_amount_due := ROUND(sale_row.current_amount_due - v_apply, 2);

    UPDATE public.sales
    SET
      amount_paid = v_updated_amount_paid,
      amount_due = v_updated_amount_due,
      review_amount_paid = v_updated_amount_paid,
      review_amount_due = v_updated_amount_due,
      payment_status = CASE
        WHEN v_updated_amount_due <= 0 THEN 'paid'
        ELSE 'partial'
      END
    WHERE id = sale_row.id;

    INSERT INTO public.payment_logs (
      sale_id,
      customer_id,
      invoice_number,
      amount,
      paid_by_user_id,
      paid_by_name
    )
    VALUES (
      sale_row.id,
      sale_row.customer_id,
      sale_row.invoice_number,
      v_apply,
      v_user_id,
      v_paid_by_name
    )
    RETURNING id, payment_logs.created_at
    INTO v_payment_log_id, v_created_at;

    v_remaining := ROUND(v_remaining - v_apply, 2);

    RETURN QUERY
    SELECT
      v_payment_log_id,
      sale_row.id,
      sale_row.invoice_number,
      v_apply,
      v_updated_amount_paid,
      v_updated_amount_due,
      v_paid_by_name,
      v_created_at;
  END LOOP;

  IF v_remaining = v_initial_amount THEN
    RAISE EXCEPTION 'No due invoices found for this customer';
  END IF;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Payment amount exceeds the total due balance';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_customer_payment(uuid, numeric, text) TO authenticated;
