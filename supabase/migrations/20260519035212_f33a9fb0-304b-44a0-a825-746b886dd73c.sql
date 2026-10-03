ALTER TABLE public.package_discounts 
ADD COLUMN IF NOT EXISTS discount_amount integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS duration_exact boolean NOT NULL DEFAULT false;