ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS included_guests integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS extra_guest_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS breakfast_included boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS amenities text[] NOT NULL DEFAULT '{}'::text[];