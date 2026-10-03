
CREATE TABLE public.lua_teleports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  owner_username TEXT,
  owner_key TEXT,
  owner_hwid TEXT,
  game_id TEXT,
  teleport_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_public BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'main_lua',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.lua_teleports TO service_role;

ALTER TABLE public.lua_teleports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read public teleports"
ON public.lua_teleports FOR SELECT
USING (is_public = true);

CREATE INDEX idx_lua_teleports_owner_key ON public.lua_teleports(owner_key);
CREATE INDEX idx_lua_teleports_game_id ON public.lua_teleports(game_id);
CREATE INDEX idx_lua_teleports_updated_at ON public.lua_teleports(updated_at DESC);

CREATE TRIGGER touch_lua_teleports_updated_at
BEFORE UPDATE ON public.lua_teleports
FOR EACH ROW EXECUTE FUNCTION public.touch_lua_recordings_updated_at();
