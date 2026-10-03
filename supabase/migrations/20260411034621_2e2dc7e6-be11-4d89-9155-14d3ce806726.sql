
CREATE TABLE public.duration_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  duration_days INTEGER NOT NULL DEFAULT 1,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  max_uses_per_key INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  used_by JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.duration_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active duration codes"
ON public.duration_codes
FOR SELECT
USING (true);

CREATE POLICY "Admin can manage duration codes"
ON public.duration_codes
FOR ALL
USING (true);
