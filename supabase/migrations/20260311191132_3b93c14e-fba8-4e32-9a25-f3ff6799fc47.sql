
CREATE TABLE public.blocked_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL UNIQUE,
  reason text DEFAULT NULL,
  blocked_by text DEFAULT 'admin',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read blocked ips" ON public.blocked_ips FOR SELECT TO public USING (true);
CREATE POLICY "Admin can manage blocked ips" ON public.blocked_ips FOR ALL TO public USING (true);
