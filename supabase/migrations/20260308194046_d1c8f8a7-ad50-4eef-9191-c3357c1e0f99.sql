DROP TABLE IF EXISTS public.promo_codes;

CREATE TABLE public.package_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_type text NOT NULL DEFAULT 'duration_based',
  min_days integer DEFAULT NULL,
  max_days integer DEFAULT NULL,
  discount_percent numeric NOT NULL DEFAULT 10,
  promo_code text DEFAULT NULL,
  package_name text DEFAULT NULL,
  is_active boolean NOT NULL DEFAULT true,
  start_date timestamp with time zone DEFAULT NULL,
  end_date timestamp with time zone DEFAULT NULL,
  description text DEFAULT NULL,
  notify_users boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.package_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage discounts" ON public.package_discounts FOR ALL USING (true);
CREATE POLICY "Anyone can read active discounts" ON public.package_discounts FOR SELECT USING (is_active = true);