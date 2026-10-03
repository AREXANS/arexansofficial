CREATE TABLE public.lua_recording_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recording_id UUID NOT NULL,
  title TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT true,
  event_type TEXT NOT NULL DEFAULT 'upsert',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.lua_recording_events TO anon;
GRANT SELECT ON public.lua_recording_events TO authenticated;
GRANT ALL ON public.lua_recording_events TO service_role;

ALTER TABLE public.lua_recording_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read public lua recording events"
ON public.lua_recording_events
FOR SELECT
TO anon, authenticated
USING (is_public = true);

CREATE POLICY "Backend can manage lua recording events"
ON public.lua_recording_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.emit_lua_recording_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_public = true THEN
    INSERT INTO public.lua_recording_events (recording_id, title, is_public, event_type)
    VALUES (NEW.id, NEW.title, NEW.is_public, TG_OP);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER emit_lua_recording_event_trigger
AFTER INSERT OR UPDATE ON public.lua_recordings
FOR EACH ROW
EXECUTE FUNCTION public.emit_lua_recording_event();

ALTER PUBLICATION supabase_realtime ADD TABLE public.lua_recording_events;