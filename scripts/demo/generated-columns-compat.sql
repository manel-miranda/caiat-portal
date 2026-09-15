-- DEMO ONLY: generated columns are unavailable in BEFORE UPDATE triggers.
-- Their source columns remain protected by the full-row comparison.
DO $$ BEGIN
 IF current_setting('caiat.demo_target', true) IS DISTINCT FROM 'llyihdkuplsyduxirvcg' THEN
 RAISE EXCEPTION 'DEMO_TARGET_REQUIRED'; END IF; END $$;
CREATE OR REPLACE FUNCTION demo_private.guard_auth_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.id IS DISTINCT FROM 'df101cea-e2ed-4a3a-956b-b817038bb648'::uuid
      OR NEW.email IS DISTINCT FROM 'public-demo@caiat.invalid' THEN
      RAISE EXCEPTION 'DEMO_SECURITY_LOCKED';
    END IF;
    UPDATE demo_private.provisioning SET creation_transaction = txid_current() WHERE singleton;
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'DEMO_SECURITY_LOCKED';
  ELSE
    IF EXISTS (SELECT 1 FROM demo_private.provisioning
      WHERE singleton AND creation_transaction = txid_current()) THEN
      -- This exception is reachable only inside the account's original admin creation transaction.
      IF NEW.id IS DISTINCT FROM OLD.id OR NEW.email IS DISTINCT FROM OLD.email THEN
        RAISE EXCEPTION 'DEMO_SECURITY_LOCKED';
      END IF;
      RETURN NEW;
    END IF;
    IF (to_jsonb(NEW) - ARRAY['last_sign_in_at','updated_at','confirmed_at'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['last_sign_in_at','updated_at','confirmed_at']) THEN
      RAISE EXCEPTION 'DEMO_SECURITY_LOCKED';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION demo_private.guard_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.provider = 'email'
    AND EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.user_id AND email = 'public-demo@caiat.invalid') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND
    (to_jsonb(NEW) - ARRAY['last_sign_in_at','updated_at','email']) =
    (to_jsonb(OLD) - ARRAY['last_sign_in_at','updated_at','email']) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'DEMO_SECURITY_LOCKED';
END $$;
