-- Add payment_simulation setting
INSERT INTO public.site_settings (key, value, description)
VALUES ('payment_simulation', 'off', 'Toggle simulasi pembayaran untuk testing (on/off)')
ON CONFLICT (key) DO NOTHING;