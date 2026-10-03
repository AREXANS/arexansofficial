-- Create packages table
CREATE TABLE public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  price_per_day INTEGER NOT NULL DEFAULT 2000,
  description TEXT,
  features TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create ads table
CREATE TABLE public.ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image',
  link TEXT,
  link_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create backgrounds table
CREATE TABLE public.backgrounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  background_type TEXT NOT NULL DEFAULT 'image',
  background_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_muted BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_whatsapp TEXT,
  package_name TEXT NOT NULL,
  package_duration INTEGER NOT NULL,
  original_amount INTEGER NOT NULL,
  total_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  license_key TEXT,
  qr_string TEXT,
  paid_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create social_links table
CREATE TABLE public.social_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon_type TEXT NOT NULL DEFAULT 'link',
  url TEXT NOT NULL,
  label TEXT NOT NULL,
  link_location TEXT NOT NULL DEFAULT 'home',
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create site_settings table
CREATE TABLE public.site_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create admin_sessions table for admin auth
CREATE TABLE public.admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  device_name TEXT,
  device_info JSONB,
  login_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_current BOOLEAN NOT NULL DEFAULT true,
  is_approved BOOLEAN NOT NULL DEFAULT false
);

-- Enable RLS on all tables
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backgrounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access (store is public facing)
CREATE POLICY "Anyone can read active packages" ON public.packages FOR SELECT USING (is_active = true);
CREATE POLICY "Anyone can read active ads" ON public.ads FOR SELECT USING (is_active = true);
CREATE POLICY "Anyone can read active backgrounds" ON public.backgrounds FOR SELECT USING (is_active = true);
CREATE POLICY "Anyone can read active social links" ON public.social_links FOR SELECT USING (is_active = true);
CREATE POLICY "Anyone can read site settings" ON public.site_settings FOR SELECT USING (true);

-- Create policy for transactions (will be handled by edge function)
CREATE POLICY "Service role can manage transactions" ON public.transactions FOR ALL USING (true);
CREATE POLICY "Service role can manage admin sessions" ON public.admin_sessions FOR ALL USING (true);

-- Admin access policies (for admin panel via edge function)
CREATE POLICY "Admin can manage packages" ON public.packages FOR ALL USING (true);
CREATE POLICY "Admin can manage ads" ON public.ads FOR ALL USING (true);
CREATE POLICY "Admin can manage backgrounds" ON public.backgrounds FOR ALL USING (true);
CREATE POLICY "Admin can manage social links" ON public.social_links FOR ALL USING (true);
CREATE POLICY "Admin can manage site settings" ON public.site_settings FOR ALL USING (true);

-- Insert default packages
INSERT INTO public.packages (name, display_name, price_per_day, description, features, sort_order)
VALUES 
  ('NORMAL', 'NORMAL', 2000, 'Paket standar dengan semua fitur dasar', ARRAY['Semua fitur dasar', 'Update berkala', 'Support all executor'], 1),
  ('VIP', 'VIP', 3000, 'Paket premium dengan fitur eksklusif', ARRAY['Semua fitur Normal', 'Premium scripts', 'Priority support', 'Early access features'], 2);

-- Insert default settings
INSERT INTO public.site_settings (key, value, description)
VALUES 
  ('loadstring_script', 'loadstring(game:HttpGet("https://pastefy.app/kjMXVpao/raw"))()', 'Script loadstring untuk executor'),
  ('admin_key', 'admin123', 'Password admin panel');