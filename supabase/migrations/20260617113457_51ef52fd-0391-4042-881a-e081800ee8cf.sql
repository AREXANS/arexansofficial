
-- Lua script version history with auto-snapshot trigger (max 20 per script)
CREATE TABLE public.lua_script_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  script_id UUID NOT NULL REFERENCES public.lua_scripts(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_lua_script_versions_script_id ON public.lua_script_versions(script_id, version_number DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lua_script_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lua_script_versions TO anon;
GRANT ALL ON public.lua_script_versions TO service_role;

ALTER TABLE public.lua_script_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access lua_script_versions"
  ON public.lua_script_versions FOR ALL
  USING (true) WITH CHECK (true);

-- Trigger: snapshot previous content into versions before UPDATE
CREATE OR REPLACE FUNCTION public.snapshot_lua_script_version()
RETURNS TRIGGER AS $$
DECLARE
  next_version INTEGER;
BEGIN
  -- Only snapshot when content actually changes
  IF OLD.content IS DISTINCT FROM NEW.content THEN
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
      FROM public.lua_script_versions WHERE script_id = OLD.id;

    INSERT INTO public.lua_script_versions (script_id, version_number, content, display_name)
    VALUES (OLD.id, next_version, OLD.content, OLD.display_name);

    -- Keep only last 20 versions per script
    DELETE FROM public.lua_script_versions
    WHERE script_id = OLD.id
      AND id NOT IN (
        SELECT id FROM public.lua_script_versions
        WHERE script_id = OLD.id
        ORDER BY version_number DESC
        LIMIT 20
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_lua_script_snapshot ON public.lua_scripts;
CREATE TRIGGER trg_lua_script_snapshot
BEFORE UPDATE ON public.lua_scripts
FOR EACH ROW EXECUTE FUNCTION public.snapshot_lua_script_version();
