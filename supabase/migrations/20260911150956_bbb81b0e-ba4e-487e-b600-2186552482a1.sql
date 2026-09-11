-- 1. Payment method: add an explicit online/PayPal method -------------------
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'paypal';

-- 2. Traceability columns on payments ---------------------------------------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS external_reference text;

-- Idempotency: one provider capture can never create two payment rows.
CREATE UNIQUE INDEX IF NOT EXISTS payments_external_reference_uniq
  ON public.payments (external_reference)
  WHERE external_reference IS NOT NULL;

-- 3. Payment sessions --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stay_id uuid NOT NULL REFERENCES public.stays(id) ON DELETE CASCADE,
  guest_token text NOT NULL,
  provider text NOT NULL DEFAULT 'paypal',
  environment text NOT NULL DEFAULT 'sandbox',
  status text NOT NULL DEFAULT 'created',
  amount_mad numeric NOT NULL,
  charged_currency text NOT NULL,
  charged_amount numeric NOT NULL,
  fx_rate numeric NOT NULL,
  order_id text,
  capture_id text,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_sessions_order_id_uniq
  ON public.payment_sessions (order_id) WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_sessions_capture_id_uniq
  ON public.payment_sessions (capture_id) WHERE capture_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_sessions_stay_idx ON public.payment_sessions (stay_id);

GRANT SELECT ON public.payment_sessions TO authenticated;
GRANT ALL ON public.payment_sessions TO service_role;

ALTER TABLE public.payment_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment sessions admin read"
  ON public.payment_sessions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.payment_sessions_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_sessions_updated_at ON public.payment_sessions;
CREATE TRIGGER payment_sessions_updated_at
  BEFORE UPDATE ON public.payment_sessions
  FOR EACH ROW EXECUTE FUNCTION public.payment_sessions_touch();

-- 4. Server layer needs to resolve a guest token to its live stay ------------
GRANT EXECUTE ON FUNCTION public.guest_stay_for_token(text) TO service_role;