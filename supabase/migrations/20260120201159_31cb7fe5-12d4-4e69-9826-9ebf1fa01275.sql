-- Add payment gateway settings to site_settings
INSERT INTO public.site_settings (key, value, description) VALUES 
('cashify_license_key', '', 'License Key dari Cashify'),
('cashify_qris_id', '', 'QRIS ID untuk merchant'),
('cashify_webhook_key', '', 'Webhook Key untuk validasi callback'),
('cashify_api_key', '', 'API Key sistem Cashify'),
('discord_webhook_url', '', 'URL Webhook Discord untuk notifikasi'),
('payment_mode', 'demo', 'Mode pembayaran: demo atau live')
ON CONFLICT (key) DO NOTHING;