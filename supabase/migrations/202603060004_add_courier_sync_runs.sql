CREATE TABLE IF NOT EXISTS public.courier_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_key text NOT NULL UNIQUE,
  interval_minutes integer NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  started_by_user_id uuid,
  started_by_device_id text,
  completed_by_user_id uuid,
  completed_by_device_id text,
  processed_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courier_sync_runs_started_at ON public.courier_sync_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_courier_sync_runs_status_started_at ON public.courier_sync_runs (status, started_at DESC);

ALTER TABLE public.courier_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view courier sync runs" ON public.courier_sync_runs;
CREATE POLICY "Authenticated users can view courier sync runs"
  ON public.courier_sync_runs
  FOR SELECT
  TO authenticated
  USING (true);

DROP TRIGGER IF EXISTS update_courier_sync_runs_updated_at ON public.courier_sync_runs;
CREATE TRIGGER update_courier_sync_runs_updated_at
  BEFORE UPDATE ON public.courier_sync_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.claim_courier_sync_run(
  p_slot_key text,
  p_interval_minutes integer,
  p_device_id text
)
RETURNS TABLE (
  run_id uuid,
  should_run boolean,
  run_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run public.courier_sync_runs%ROWTYPE;
  v_stale_before timestamptz := now() - interval '20 minutes';
BEGIN
  INSERT INTO public.courier_sync_runs (
    slot_key,
    interval_minutes,
    status,
    started_at,
    started_by_user_id,
    started_by_device_id
  )
  VALUES (
    p_slot_key,
    GREATEST(COALESCE(p_interval_minutes, 60), 1),
    'running',
    now(),
    auth.uid(),
    p_device_id
  )
  ON CONFLICT (slot_key) DO NOTHING
  RETURNING * INTO v_run;

  IF FOUND THEN
    RETURN QUERY SELECT v_run.id, true, v_run.status;
    RETURN;
  END IF;

  SELECT *
  INTO v_run
  FROM public.courier_sync_runs
  WHERE slot_key = p_slot_key;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, false, 'missing'::text;
    RETURN;
  END IF;

  IF v_run.status = 'completed' THEN
    RETURN QUERY SELECT v_run.id, false, v_run.status;
    RETURN;
  END IF;

  IF v_run.status = 'running' AND v_run.started_at > v_stale_before THEN
    RETURN QUERY SELECT v_run.id, false, v_run.status;
    RETURN;
  END IF;

  UPDATE public.courier_sync_runs
  SET
    status = 'running',
    started_at = now(),
    completed_at = NULL,
    started_by_user_id = auth.uid(),
    started_by_device_id = p_device_id,
    completed_by_user_id = NULL,
    completed_by_device_id = NULL,
    processed_count = 0,
    error_message = NULL
  WHERE id = v_run.id
    AND (
      status = 'failed'
      OR started_at <= v_stale_before
    )
  RETURNING * INTO v_run;

  IF FOUND THEN
    RETURN QUERY SELECT v_run.id, true, v_run.status;
    RETURN;
  END IF;

  SELECT *
  INTO v_run
  FROM public.courier_sync_runs
  WHERE slot_key = p_slot_key;

  RETURN QUERY SELECT v_run.id, false, v_run.status;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_courier_sync_run(
  p_run_id uuid,
  p_device_id text,
  p_status text,
  p_processed_count integer DEFAULT 0,
  p_error_message text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.courier_sync_runs
  SET
    status = CASE WHEN p_status IN ('completed', 'failed') THEN p_status ELSE 'failed' END,
    completed_at = now(),
    completed_by_user_id = auth.uid(),
    completed_by_device_id = p_device_id,
    processed_count = GREATEST(COALESCE(p_processed_count, 0), 0),
    error_message = CASE WHEN p_status = 'failed' THEN p_error_message ELSE NULL END
  WHERE id = p_run_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_courier_sync_run(text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_courier_sync_run(uuid, text, text, integer, text) TO authenticated;
