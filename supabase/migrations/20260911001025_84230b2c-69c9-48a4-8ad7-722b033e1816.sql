ALTER TABLE public.service_types
  ADD COLUMN IF NOT EXISTS activity_mode text,
  ADD COLUMN IF NOT EXISTS difficulty text;