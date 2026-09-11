ALTER TABLE public.service_types
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other';

CREATE UNIQUE INDEX IF NOT EXISTS service_types_key_unique ON public.service_types (key);