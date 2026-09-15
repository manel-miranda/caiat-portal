-- DEMO ONLY: follow-up for the already installed demo, before account creation.
DO $$
BEGIN
  IF current_setting('caiat.demo_target', true) IS DISTINCT FROM 'llyihdkuplsyduxirvcg' THEN
    RAISE EXCEPTION 'DEMO_TARGET_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users) THEN
    RAISE EXCEPTION 'DEMO_INSTALL_REQUIRES_EMPTY_AUTH';
  END IF;
END $$;

CREATE TABLE demo_private.provisioning (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  creation_transaction bigint
);
ALTER TABLE demo_private.provisioning ENABLE ROW LEVEL SECURITY;
INSERT INTO demo_private.provisioning VALUES (true, NULL);
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
    IF (to_jsonb(NEW) - ARRAY['last_sign_in_at','updated_at'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['last_sign_in_at','updated_at']) THEN
      RAISE EXCEPTION 'DEMO_SECURITY_LOCKED';
    END IF;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION demo_private.guard_auth_user() FROM PUBLIC, anon, authenticated, service_role;
