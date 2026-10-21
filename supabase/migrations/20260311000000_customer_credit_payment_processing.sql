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
  v_signed_amount numeric := ROUND(COALESCE(p_amount, 0)::numeric, 2);
  v_remaining numeric := ABS(ROUND(COALESCE(p_amount, 0)::numeric, 2));
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

  IF v_signed_amount = 0 THEN
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

  IF v_signed_amount > 0 THEN
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
        AND (s.payment_terms ILIKE '%credit%' OR s.payment_method ILIKE '%credit%')
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

    IF v_remaining = ABS(v_initial_amount) THEN
      RAISE EXCEPTION 'No due credit invoices found for this customer';
    END IF;

    IF v_remaining > 0 THEN
      RAISE EXCEPTION 'Payment amount exceeds the total due credit balance';
    END IF;
  ELSE
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
        AND COALESCE(s.review_amount_paid, s.amount_paid, 0) > 0
        AND (s.is_deleted = false OR s.is_deleted IS NULL)
        AND COALESCE(LOWER(s.courier_status), '') NOT IN ('cancelled', 'returned', 'lost')
        AND (s.payment_terms ILIKE '%credit%' OR s.payment_method ILIKE '%credit%')
      ORDER BY s.created_at DESC, s.invoice_number DESC
    LOOP
      EXIT WHEN v_remaining <= 0;

      v_apply := LEAST(v_remaining, sale_row.current_amount_paid);
      IF v_apply <= 0 THEN
        CONTINUE;
      END IF;

      v_updated_amount_paid := ROUND(sale_row.current_amount_paid - v_apply, 2);
      v_updated_amount_due := ROUND(sale_row.current_amount_due + v_apply, 2);

      UPDATE public.sales
      SET
        amount_paid = v_updated_amount_paid,
        amount_due = v_updated_amount_due,
        review_amount_paid = v_updated_amount_paid,
        review_amount_due = v_updated_amount_due,
        payment_status = CASE
          WHEN v_updated_amount_due <= 0 THEN 'paid'
          WHEN v_updated_amount_paid <= 0 THEN 'pending'
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
        -v_apply,
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
        -v_apply,
        v_updated_amount_paid,
        v_updated_amount_due,
        v_paid_by_name,
        v_created_at;
    END LOOP;

    IF v_remaining = ABS(v_initial_amount) THEN
      RAISE EXCEPTION 'No paid credit invoices available for adjustment';
    END IF;

    IF v_remaining > 0 THEN
      RAISE EXCEPTION 'Adjustment amount exceeds the reversible paid amount on credit invoices';
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_customer_payment(uuid, numeric, text) TO authenticated;
