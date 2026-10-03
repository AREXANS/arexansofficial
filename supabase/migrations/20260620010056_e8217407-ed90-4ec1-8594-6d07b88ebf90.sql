CREATE TABLE public.lua_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  owner_username TEXT,
  owner_key TEXT,
  owner_hwid TEXT,
  game_id TEXT,
  recording_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_public BOOLEAN NOT NULL DEFAULT false,
  duration_seconds INTEGER,
  source TEXT NOT NULL DEFAULT 'main_lua',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.lua_recordings TO anon;
GRANT SELECT ON public.lua_recordings TO authenticated;
GRANT ALL ON public.lua_recordings TO service_role;

ALTER TABLE public.lua_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read public lua recordings"
ON public.lua_recordings
FOR SELECT
TO anon, authenticated
USING (is_public = true);

CREATE POLICY "Backend can manage lua recordings"
ON public.lua_recordings
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX idx_lua_recordings_public_created
ON public.lua_recordings (is_public, created_at DESC);

CREATE INDEX idx_lua_recordings_owner_key_created
ON public.lua_recordings (owner_key, created_at DESC)
WHERE owner_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_lua_recordings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER touch_lua_recordings_updated_at
BEFORE UPDATE ON public.lua_recordings
FOR EACH ROW
EXECUTE FUNCTION public.touch_lua_recordings_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.lua_recordings;