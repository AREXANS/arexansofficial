CREATE TABLE IF NOT EXISTS public.developer_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event text NOT NULL DEFAULT 'visit',
  ip_address text,
  device_id text,
  device_name text,
  user_agent text,
  device_info jsonb,
  geo_info jsonb,
  is_approved_device boolean NOT NULL DEFAULT false
);

GRANT ALL ON public.developer_access_logs TO service_role;

ALTER TABLE public.developer_access_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS developer_access_logs_created_at_idx ON public.developer_access_logs (created_at DESC);