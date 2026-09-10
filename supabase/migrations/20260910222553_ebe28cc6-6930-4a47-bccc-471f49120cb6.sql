
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin','staff');
CREATE TYPE public.stay_source AS ENUM ('booking_com','whatsapp','phone','email','walk_in','other');
CREATE TYPE public.stay_status AS ENUM ('active','completed','cancelled');
CREATE TYPE public.payment_method AS ENUM ('cash','card','bank_transfer');
CREATE TYPE public.request_status AS ENUM ('pending','completed','cancelled');

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "roles readable by authenticated" ON public.user_roles FOR SELECT TO authenticated USING (true);

-- ROOMS
CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  name text NOT NULL,
  capacity int NOT NULL DEFAULT 2,
  base_price numeric(10,2) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);
GRANT SELECT, INSERT, UPDATE ON public.rooms TO authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rooms read" ON public.rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "rooms admin write" ON public.rooms FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- SERVICE TYPES
CREATE TABLE public.service_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  default_price numeric(10,2) NOT NULL DEFAULT 0,
  billable boolean NOT NULL DEFAULT true,
  requestable boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);
GRANT SELECT, INSERT, UPDATE ON public.service_types TO authenticated;
GRANT ALL ON public.service_types TO service_role;
ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service types read" ON public.service_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "service types admin write" ON public.service_types FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- GUESTS
CREATE TABLE public.guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text,
  email text,
  nationality text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.guests TO authenticated;
GRANT ALL ON public.guests TO service_role;
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guests all authenticated" ON public.guests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- STAYS
CREATE TABLE public.stays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE RESTRICT,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  check_in date NOT NULL,
  check_out date NOT NULL,
  num_guests int NOT NULL DEFAULT 1,
  source public.stay_source NOT NULL DEFAULT 'other',
  accommodation_total numeric(10,2) NOT NULL DEFAULT 0,
  notes text,
  status public.stay_status NOT NULL DEFAULT 'active',
  checked_out_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stays_room_idx ON public.stays(room_id);
CREATE INDEX stays_status_idx ON public.stays(status);
GRANT SELECT, INSERT, UPDATE ON public.stays TO authenticated;
GRANT ALL ON public.stays TO service_role;
ALTER TABLE public.stays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stays all authenticated" ON public.stays FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- CHARGES
CREATE TABLE public.charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stay_id uuid NOT NULL REFERENCES public.stays(id) ON DELETE CASCADE,
  service_type_id uuid REFERENCES public.service_types(id),
  label text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX charges_stay_idx ON public.charges(stay_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.charges TO authenticated;
GRANT ALL ON public.charges TO service_role;
ALTER TABLE public.charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "charges all authenticated" ON public.charges FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- REQUESTS
CREATE TABLE public.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stay_id uuid REFERENCES public.stays(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.rooms(id),
  service_type_id uuid REFERENCES public.service_types(id),
  label text NOT NULL,
  scheduled_at timestamptz,
  notes text,
  status public.request_status NOT NULL DEFAULT 'pending',
  created_by uuid REFERENCES auth.users(id),
  completed_by uuid REFERENCES auth.users(id),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX requests_status_idx ON public.requests(status);
GRANT SELECT, INSERT, UPDATE ON public.requests TO authenticated;
GRANT ALL ON public.requests TO service_role;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "requests all authenticated" ON public.requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- PAYMENTS
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stay_id uuid NOT NULL REFERENCES public.stays(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL,
  method public.payment_method NOT NULL,
  notes text,
  received_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_stay_idx ON public.payments(stay_id);
CREATE INDEX payments_created_idx ON public.payments(created_at);
GRANT SELECT, INSERT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments read" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "payments insert" ON public.payments FOR INSERT TO authenticated WITH CHECK (received_by = auth.uid());

-- CASH RECONCILIATIONS
CREATE TABLE public.cash_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_date date NOT NULL UNIQUE,
  expected_total numeric(10,2) NOT NULL DEFAULT 0,
  counted_total numeric(10,2) NOT NULL DEFAULT 0,
  difference numeric(10,2) GENERATED ALWAYS AS (counted_total - expected_total) STORED,
  notes text,
  closed_by uuid REFERENCES auth.users(id),
  closed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.cash_reconciliations TO authenticated;
GRANT ALL ON public.cash_reconciliations TO service_role;
ALTER TABLE public.cash_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cash admin only" ON public.cash_reconciliations FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- AUDIT LOG
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_created_idx ON public.audit_log(created_at DESC);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit insert own" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "audit admin read" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- SEED ROOMS
INSERT INTO public.rooms (number, name, capacity, base_price, sort_order) VALUES
  ('1','Atlas',2,650,1),
  ('2','Sahara',2,650,2),
  ('3','Medina',3,750,3),
  ('4','Zellige',2,700,4),
  ('5','Majorelle',2,700,5),
  ('6','Riad Suite',4,1100,6),
  ('7','Terrace',2,800,7);

-- SEED SERVICE TYPES
INSERT INTO public.service_types (key, label, default_price, billable, requestable, sort_order) VALUES
  ('dinner','Dinner',180,true,true,1),
  ('breakfast','Breakfast',80,true,true,2),
  ('transfer','Transfer',350,true,true,3),
  ('activity','Activity',500,true,true,4),
  ('extra_night','Extra night',650,true,false,5),
  ('laundry','Laundry',120,true,true,6),
  ('taxi','Taxi call',0,false,true,7),
  ('other','Other',0,true,true,8);
