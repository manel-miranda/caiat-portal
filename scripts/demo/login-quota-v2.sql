-- DEMO ONLY. Apply after install.sql, in a transaction on the verified demo project.
-- Existing login remains available until the separate finalize script is applied.
DO $$ BEGIN
  IF current_setting('caiat.demo_target', true) IS DISTINCT FROM 'llyihdkuplsyduxirvcg'
    OR to_regnamespace('demo_private') IS NULL THEN
    RAISE EXCEPTION 'DEMO_TARGET_REQUIRED';
  END IF;
END $$;

CREATE TABLE demo_private.login_rate_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  secret_hash text NOT NULL CHECK (secret_hash ~ '^[a-f0-9]{64}$')
);
CREATE TABLE demo_private.login_rate_buckets (
  bucket text PRIMARY KEY CHECK (bucket ~ '^[a-f0-9]{64}$'),
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 20)
);
CREATE INDEX login_rate_buckets_expiry ON demo_private.login_rate_buckets(window_start);
ALTER TABLE demo_private.login_rate_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_private.login_rate_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON demo_private.login_rate_config, demo_private.login_rate_buckets
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.demo_login_allowed_v2(p_secret text, p_bucket text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE accepted boolean;
BEGIN
  -- Authenticate before reading, cleaning up or incrementing any quota.
  IF p_secret IS NULL OR p_secret !~ '^[a-f0-9]{64}$'
    OR NOT EXISTS (SELECT 1 FROM demo_private.login_rate_config
      WHERE singleton AND secret_hash = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex')) THEN
    RAISE EXCEPTION 'DEMO_QUOTA_UNAUTHORIZED';
  END IF;
  IF p_bucket IS NULL OR p_bucket !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'DEMO_QUOTA_INVALID_BUCKET';
  END IF;
  -- Retain only recent hashed addresses; no raw IPs or secrets are stored here.
  DELETE FROM demo_private.login_rate_buckets WHERE window_start < now() - interval '1 day';
  INSERT INTO demo_private.login_rate_buckets AS b(bucket, window_start, attempts)
    VALUES (p_bucket, now(), 1)
    ON CONFLICT (bucket) DO UPDATE SET
      attempts = CASE WHEN b.window_start < now() - interval '1 hour' THEN 1 ELSE b.attempts + 1 END,
      window_start = CASE WHEN b.window_start < now() - interval '1 hour' THEN now() ELSE b.window_start END
    WHERE b.attempts < 20 OR b.window_start < now() - interval '1 hour'
    RETURNING true INTO accepted;
  RETURN coalesce(accepted, false);
END $$;
REVOKE ALL ON FUNCTION public.demo_login_allowed_v2(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_login_allowed_v2(text, text) TO anon;
