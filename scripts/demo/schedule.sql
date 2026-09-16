-- DEMO ONLY. Apply only after install.sql and its verification have succeeded.
DO $$ BEGIN
  IF current_setting('caiat.demo_target', true) IS DISTINCT FROM 'llyihdkuplsyduxirvcg'
    OR to_regprocedure('demo_private.reset()') IS NULL THEN
    RAISE EXCEPTION 'DEMO_TARGET_REQUIRED';
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS pg_cron;
-- A named schedule is updated instead of duplicated on subsequent runs.
SELECT cron.schedule('caiat-demo-hourly-reset', '0 * * * *', 'SELECT demo_private.reset()');
-- Short-lived sessions are pruned without changing the shared account or its password.
SELECT cron.schedule('caiat-demo-session-cleanup', '15 * * * *',
  $job$DELETE FROM auth.sessions WHERE user_id IN
    (SELECT id FROM auth.users WHERE raw_app_meta_data ->> 'caiat_demo' = 'true')
    AND created_at < now() - interval '24 hours'$job$);
