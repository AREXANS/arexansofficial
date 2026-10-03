
-- XCoins Users table
CREATE TABLE public.xcoins_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  pin_hash text NOT NULL,
  display_name text,
  balance integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.xcoins_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage xcoins users" ON public.xcoins_users FOR ALL USING (true);
CREATE POLICY "Anyone can read own xcoins user" ON public.xcoins_users FOR SELECT USING (true);

-- XCoins Transactions table
CREATE TABLE public.xcoins_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.xcoins_users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'topup',
  amount integer NOT NULL,
  balance_after integer NOT NULL DEFAULT 0,
  description text,
  reference_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.xcoins_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage xcoins transactions" ON public.xcoins_transactions FOR ALL USING (true);
CREATE POLICY "Anyone can read xcoins transactions" ON public.xcoins_transactions FOR SELECT USING (true);

-- XCoins OTP table
CREATE TABLE public.xcoins_otp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  otp_code text NOT NULL,
  is_used boolean NOT NULL DEFAULT false,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.xcoins_otp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage otp" ON public.xcoins_otp FOR ALL USING (true);

-- Enable realtime for xcoins_transactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.xcoins_transactions;
