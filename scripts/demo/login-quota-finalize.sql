-- DEMO ONLY. Apply AFTER every active demo deployment uses v2 successfully.
DO $$ BEGIN
  IF current_setting('caiat.demo_target', true) IS DISTINCT FROM 'llyihdkuplsyduxirvcg'
    OR to_regprocedure('public.demo_login_allowed_v2(text,text)') IS NULL THEN
    RAISE EXCEPTION 'DEMO_TARGET_REQUIRED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM demo_private.login_rate_config WHERE singleton) THEN
    RAISE EXCEPTION 'DEMO_QUOTA_NOT_CONFIGURED';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.demo_login_allowed() FROM PUBLIC, anon, authenticated;
